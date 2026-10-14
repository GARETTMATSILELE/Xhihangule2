import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  calculatePropertyCommission,
  toPaymentCommissionSnapshot
} from '../services/propertyCommissionCalculator';
import { buildExpectedAccountingProjection } from '../services/paymentAccountingProjection';
import { projectCommissionLanes } from '../services/commissionProjection';
import { roundMoney } from '../utils/money';
import {
  SALE_PAYMENT_INCOMPLETE_CODE,
  classifyPropertyFinancialKind,
  salePaymentIncompleteResponse,
  validateSalePaymentCompleteness
} from '../services/salePaymentCompleteness';
import {
  applyIntroductionOwnerRemainder,
  computeIntroductionAllocation,
  introductionConsumedFromPayments,
  snapshotFromIntroductionAllocation
} from '../services/introductionCommissionService';
import { computeOutstandingForLease } from '../services/outstandingLeaseCalculation';
import {
  COMPLETED_PAYMENT_IMMUTABLE_MESSAGE,
  assertCompletedPaymentFinanciallyImmutable
} from '../services/paymentFinancialImmutability';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function sliceFn(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
  return src.slice(start, end);
}

function introSnapshot(rentAllocated: number, alreadyConsumed: number, levyAllocated = 0, oneMonthRent = 1000) {
  const allocation = computeIntroductionAllocation({
    rentAllocated,
    levyAllocated,
    oneMonthRent,
    alreadyConsumed
  });
  const calculated = snapshotFromIntroductionAllocation(allocation, {
    vatOnCommission: false,
    preaPercentOfTotal: 0.03,
    agentPercentOfRemaining: 0.6,
    agencyPercentOfRemaining: 0.4
  });
  const snapshot = applyIntroductionOwnerRemainder(calculated, allocation);
  return { allocation, snapshot, result: calculated };
}

function paymentFromIntro(snapshot: ReturnType<typeof toPaymentCommissionSnapshot>, extras?: Record<string, unknown>) {
  return {
    _id: 'pay-phase5',
    status: 'completed',
    paymentType: 'rental',
    amount: Number(extras?.amount ?? snapshot.commissionBase),
    depositAmount: Number(extras?.depositAmount ?? 0),
    levyAllocated: snapshot.levy || 0,
    isProvisional: false,
    isInSuspense: false,
    commissionDetails: snapshot,
    agentId: 'agent-1',
    vatAmount: 0,
    ...extras
  };
}

async function run(): Promise<void> {
  const paymentCtrl = srcFile('controllers/paymentController.ts');
  const agentCtrl = srcFile('controllers/agentController.ts');
  const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
  const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
  const recon = srcFile('services/paymentAccountingReconciliation.ts');
  const accountantRoutes = srcFile('routes/accountantRoutes.ts');
  const webhookRoutes = srcFile('routes/webhookRoutes.ts');
  const kpiSrc = srcFile('services/dashboardKpiService.ts');

  const salesCreate = sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async');
  const updatePayment = sliceFn(paymentCtrl, 'export const updatePayment = async', 'export const getCompanyPayments');
  const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
  const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
  const publicCreate = sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload');
  const finalizeFn = sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining');
  const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
  const agentUpdate = sliceFn(agentCtrl, 'export const updateAgentPayment = async', 'export const getAgentPayments');
  const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');

  const results: Record<string, string> = {};

  // ---------------------------------------------------------------------------
  // TEST GROUP 1 — sale completeness
  // ---------------------------------------------------------------------------
  const completeSale = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: {
      totalCommission: 12500,
      agentShare: 7275,
      agencyShare: 4850,
      preaFee: 375
    }
  });
  assert.strictEqual(completeSale.ok, true, 'complete sale is accepted');

  const missingPrice = validateSalePaymentCompleteness({
    commissionDetails: { totalCommission: 12500, agentShare: 7275, agencyShare: 4850 }
  });
  assert.strictEqual(missingPrice.ok, false);
  assert.ok(missingPrice.missing.includes('salePrice'));

  const missingCommission = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: { agentShare: 7275, agencyShare: 4850 }
  });
  assert.strictEqual(missingCommission.ok, false);
  assert.ok(missingCommission.missing.includes('commissionDetails.totalCommission'));

  const missingAgent = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: { totalCommission: 12500, agencyShare: 4850 }
  });
  assert.strictEqual(missingAgent.ok, false);
  assert.ok(missingAgent.missing.includes('commissionDetails.agentShare'));

  const missingAgency = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: { totalCommission: 12500, agentShare: 7275 }
  });
  assert.strictEqual(missingAgency.ok, false);
  assert.ok(missingAgency.missing.includes('commissionDetails.agencyShare'));

  const multipleMissing = validateSalePaymentCompleteness({
    amount: 0,
    commissionDetails: {}
  });
  assert.strictEqual(multipleMissing.ok, false);
  assert.ok(multipleMissing.missing.includes('salePrice'));
  assert.ok(multipleMissing.missing.includes('commissionDetails.totalCommission'));
  assert.ok(multipleMissing.missing.includes('commissionDetails.agentShare'));
  assert.ok(multipleMissing.missing.includes('commissionDetails.agencyShare'));
  assert.ok(multipleMissing.missing.length >= 4, 'lists ALL missing fields');

  const errorBody = salePaymentIncompleteResponse(multipleMissing.missing);
  assert.strictEqual(errorBody.code, SALE_PAYMENT_INCOMPLETE_CODE);
  assert.strictEqual(errorBody.success, false);
  assert.deepStrictEqual(errorBody.missing, multipleMissing.missing);

  assert.ok(salesCreate.includes('validateSalePaymentCompleteness'));
  assert.ok(salesCreate.includes('salePaymentIncompleteResponse'));
  assert.ok(accountantRoutes.includes("router.post('/sales-payments'"));
  assert.ok(updatePayment.includes('validateSalePaymentCompleteness'));
  assert.ok(agentCreate.includes('validateSalePaymentCompleteness'));
  results['Sale completeness'] = 'PASS';

  // ---------------------------------------------------------------------------
  // TEST GROUP 2 — sale webhook reject / retry / duplicate
  // ---------------------------------------------------------------------------
  assert.strictEqual(classifyPropertyFinancialKind('sale'), 'sale');
  assert.strictEqual(classifyPropertyFinancialKind('management'), 'rental');
  assert.strictEqual(classifyPropertyFinancialKind('introduction'), 'rental');
  assert.strictEqual(classifyPropertyFinancialKind(''), 'unknown');
  assert.strictEqual(classifyPropertyFinancialKind('warehouse'), 'unknown');
  assert.ok(webhookCtrl.includes('classifyPropertyFinancialKind'));
  assert.ok(webhookCtrl.includes('validateSalePaymentCompleteness'));
  assert.ok(webhookCtrl.includes("status: 'failed'"));
  assert.ok(webhookCtrl.includes("existingEvent?.status === 'processed'"));
  assert.ok(!webhookCtrl.includes('zeroWebhookCommissionDetails'));
  assert.ok(webhookRoutes.includes("router.post('/payment-confirmation'"));

  const incompleteSaleWebhook = validateSalePaymentCompleteness({
    amount: 0,
    commissionDetails: { totalCommission: 0, agentShare: 0, agencyShare: 0 }
  });
  assert.strictEqual(incompleteSaleWebhook.ok, false);
  assert.ok(incompleteSaleWebhook.missing.includes('salePrice'));
  assert.ok(incompleteSaleWebhook.missing.includes('commissionDetails.totalCommission'));

  const correctedSale = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: {
      totalCommission: 12500,
      agentShare: 7275,
      agencyShare: 4850
    }
  });
  assert.strictEqual(correctedSale.ok, true);

  const duplicateCorrectedStillValid = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: {
      totalCommission: 12500,
      agentShare: 7275,
      agencyShare: 4850
    }
  });
  assert.strictEqual(duplicateCorrectedStillValid.ok, true);
  assert.ok(webhookCtrl.includes('Duplicate webhook ignored'));
  results['Sale webhook rejection'] = 'PASS';
  results['Sale webhook retry'] = 'PASS';

  // ---------------------------------------------------------------------------
  // TEST GROUP 3 — introduction
  // ---------------------------------------------------------------------------
  const scenarioA = introSnapshot(1000, 0, 0);
  assert.strictEqual(scenarioA.allocation.introThisPayment, 1000);
  assert.strictEqual(scenarioA.allocation.ownerRent, 0);
  assert.strictEqual(scenarioA.snapshot.totalCommission, 1000);
  assert.strictEqual(scenarioA.snapshot.commissionBase, 1000);
  assert.strictEqual(scenarioA.snapshot.ownerAmount, 0);
  assert.strictEqual(scenarioA.allocation.satisfied, true);
  results['Introduction deposit + rent'] = 'PASS';

  const scenarioB = introSnapshot(1000, 1000, 0);
  assert.strictEqual(scenarioB.allocation.introThisPayment, 0);
  assert.strictEqual(scenarioB.allocation.ownerRent, 1000);
  assert.strictEqual(scenarioB.snapshot.totalCommission, 0);
  assert.strictEqual(scenarioB.snapshot.ownerAmount, 1000);
  results['Introduction second month'] = 'PASS';

  const scenarioC = introSnapshot(3000, 0, 0);
  assert.strictEqual(scenarioC.allocation.introThisPayment, 1000);
  assert.strictEqual(scenarioC.allocation.ownerRent, 2000);
  assert.strictEqual(scenarioC.snapshot.totalCommission, 1000);
  assert.strictEqual(scenarioC.snapshot.ownerAmount, 2000);
  results['Introduction advance'] = 'PASS';

  const scenarioDRent = introSnapshot(3000, 0, 0);
  assert.strictEqual(scenarioDRent.allocation.introThisPayment, 1000);
  assert.strictEqual(scenarioDRent.allocation.ownerRent, 2000);
  const depositOnlyConsumed = introductionConsumedFromPayments([
    { amount: 0, depositAmount: 1000, commissionDetails: { totalCommission: 0, commissionBase: 0 } }
  ]);
  assert.strictEqual(depositOnlyConsumed, 0, 'deposit is never consumed as introduction commission');

  const scenarioE1 = introSnapshot(600, 0);
  const scenarioE2 = introSnapshot(400, scenarioE1.allocation.introThisPayment);
  assert.strictEqual(scenarioE1.allocation.introThisPayment, 600);
  assert.strictEqual(scenarioE1.allocation.satisfied, false);
  assert.strictEqual(scenarioE2.allocation.introThisPayment, 400);
  assert.strictEqual(scenarioE2.allocation.satisfied, true);
  const scenarioE3 = introSnapshot(1000, 1000);
  assert.strictEqual(scenarioE3.snapshot.totalCommission, 0);
  assert.strictEqual(scenarioE3.snapshot.ownerAmount, 1000);
  results['Introduction partial payment'] = 'PASS';

  const scenarioF = introSnapshot(1000, 0, 100);
  assert.strictEqual(scenarioF.allocation.introThisPayment, 1000);
  assert.strictEqual(scenarioF.snapshot.levy, 100);
  assert.strictEqual(scenarioF.snapshot.totalCommission, 1000);
  assert.strictEqual(scenarioF.snapshot.ownerAmount, 100);
  results['Introduction levy'] = 'PASS';

  const duplicatePayments = [
    { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } },
    { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } }
  ];
  const consumedOnceFromOneDoc = introductionConsumedFromPayments([duplicatePayments[0]]);
  assert.strictEqual(consumedOnceFromOneDoc, 1000);
  const secondAlloc = computeIntroductionAllocation({
    rentAllocated: 1000,
    oneMonthRent: 1000,
    alreadyConsumed: consumedOnceFromOneDoc
  });
  assert.strictEqual(secondAlloc.introThisPayment, 0);
  results['Introduction idempotency'] = 'PASS';

  for (const [label, body] of [
    ['accountant', accountantCreate],
    ['lease', leaseCreate],
    ['public', publicCreate],
    ['finalize', finalizeFn],
    ['agent', agentCreate],
    ['webhook', webhookCtrl]
  ] as const) {
    assert.ok(
      body.includes('prepareIntroductionRentalCommission') || body.includes('buildIntroductionRentalCommission'),
      `${label} uses introduction commission-once`
    );
  }
  assert.ok(!accountantCreate.includes('priorCount'), 'accountant no longer uses first-payment count for introduction');
  assert.ok(!finalizeFn.includes('priorCount'), 'finalize no longer uses first-payment count for introduction');

  // ---------------------------------------------------------------------------
  // TEST GROUP 4 — outstanding balances
  // ---------------------------------------------------------------------------
  const firstMonth = new Date(2026, 0, 1);
  const currentFirstMonth = new Date(2026, 0, 1);
  const currentThirdMonth = new Date(2026, 2, 1);
  const leaseEnd = new Date(2026, 11, 1);

  const beforeIntro = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: currentFirstMonth,
    cutoverDate: null,
    paidKeys: new Set(),
    monthlyAmount: 1000,
    introductionRemaining: 1000,
    mode: 'rent'
  });
  assert.strictEqual(beforeIntro.totalAmount, 1000);
  assert.strictEqual(beforeIntro.missingCount, 1);

  const afterIntroSameMonth = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: currentFirstMonth,
    cutoverDate: null,
    paidKeys: new Set(['2026-1']),
    monthlyAmount: 1000,
    introductionRemaining: 0,
    mode: 'rent'
  });
  assert.strictEqual(afterIntroSameMonth.totalAmount, 0, 'future months are not due in the introduction month');

  const afterIntroLaterUnpaid = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: currentThirdMonth,
    cutoverDate: null,
    paidKeys: new Set(['2026-1']),
    monthlyAmount: 1000,
    introductionRemaining: 0,
    mode: 'rent'
  });
  assert.strictEqual(afterIntroLaterUnpaid.totalAmount, 2000, 'later unpaid months become ordinary owner rent');
  assert.ok(!afterIntroLaterUnpaid.labels[0].includes('Jan') || afterIntroLaterUnpaid.missingCount === 2);

  const advanceCovered = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: currentThirdMonth,
    cutoverDate: null,
    paidKeys: new Set(['2026-1', '2026-2', '2026-3']),
    monthlyAmount: 1000,
    introductionRemaining: 0,
    mode: 'rent'
  });
  assert.strictEqual(advanceCovered.totalAmount, 0);

  const levyBefore = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: currentFirstMonth,
    cutoverDate: null,
    paidKeys: new Set(),
    monthlyAmount: 100,
    introductionRemaining: 1000,
    mode: 'levy'
  });
  assert.strictEqual(levyBefore.totalAmount, 100);
  assert.strictEqual(levyBefore.missingCount, 1);

  const levyAfterSameMonth = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: currentFirstMonth,
    cutoverDate: null,
    paidKeys: new Set(['2026-1']),
    monthlyAmount: 100,
    introductionRemaining: 0,
    mode: 'levy'
  });
  assert.strictEqual(levyAfterSameMonth.totalAmount, 0);

  assert.ok(kpiSrc.includes('computeOutstandingForLease'));
  assert.ok(kpiSrc.includes('introductionRemainingByKey'));
  assert.ok(srcFile('services/outstandingLeaseCalculation.ts').includes('introductionSatisfied'));
  results['Outstanding rental'] = 'PASS';
  results['Outstanding levy'] = 'PASS';

  const managementUnchanged = computeOutstandingForLease({
    rentalType: 'management',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: currentThirdMonth,
    cutoverDate: null,
    paidKeys: new Set(['2026-1']),
    monthlyAmount: 1000
  });
  assert.strictEqual(managementUnchanged.totalAmount, 2000, 'management outstanding is unchanged');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5 — agent update
  // ---------------------------------------------------------------------------
  assert.ok(agentUpdate.includes('calculateForProperty'));
  assert.ok(
    agentUpdate.includes('prepareIntroductionRentalCommission') || agentUpdate.includes('buildIntroductionRentalCommission')
  );
  assert.ok(agentUpdate.includes('vatOnCommission'));
  assert.ok(agentUpdate.includes('payment.save()'));
  assert.ok(agentUpdate.includes('assertCompletedPaymentFinanciallyImmutable'));
  assert.ok(!agentUpdate.includes('findByIdAndUpdate'));
  assert.throws(
    () => assertCompletedPaymentFinanciallyImmutable({ status: 'completed' }, { amount: 1200 }),
    (err: Error) => err.message === COMPLETED_PAYMENT_IMMUTABLE_MESSAGE
  );
  assert.doesNotThrow(() =>
    assertCompletedPaymentFinanciallyImmutable({ status: 'completed', isProvisional: true }, { amount: 1200 })
  );

  const recalc = calculatePropertyCommission({
    grossRent: 1200,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: 0.155
  });
  assert.strictEqual(recalc.totalCommission, 180);
  assert.strictEqual(recalc.vatAmount, 27.9);
  assert.strictEqual(recalc.ownerAmount, 992.1);
  results['Agent update'] = 'PASS';

  // ---------------------------------------------------------------------------
  // TEST GROUP 6 — accounting projection matches Payment snapshot
  // ---------------------------------------------------------------------------
  const introPay = paymentFromIntro(scenarioA.snapshot, { amount: 1000, depositAmount: 1000 });
  const expectedA = buildExpectedAccountingProjection(introPay);
  assert.strictEqual(expectedA.amounts.agentCommission, scenarioA.snapshot.agentShare);
  assert.strictEqual(expectedA.amounts.companyCommission, scenarioA.snapshot.agencyShare);
  assert.strictEqual(expectedA.amounts.ownerIncome, scenarioA.snapshot.ownerAmount);
  const lanesA = projectCommissionLanes(introPay);
  assert.strictEqual(lanesA[0]?.amount, scenarioA.snapshot.agentShare);

  const laterPay = paymentFromIntro(scenarioB.snapshot, { amount: 1000 });
  const expectedB = buildExpectedAccountingProjection(laterPay);
  assert.strictEqual(expectedB.amounts.ownerIncome, 1000);
  assert.strictEqual(expectedB.amounts.agentCommission, 0);

  const advancePay = paymentFromIntro(scenarioC.snapshot, { amount: 3000, advanceMonthsPaid: 3 });
  const expectedC = buildExpectedAccountingProjection(advancePay);
  assert.strictEqual(expectedC.amounts.ownerIncome, 2000);
  assert.strictEqual(expectedC.amounts.agentCommission, scenarioC.snapshot.agentShare);

  const levyPay = paymentFromIntro(scenarioF.snapshot, { amount: 1100, levyAllocated: 100 });
  const expectedF = buildExpectedAccountingProjection(levyPay);
  assert.strictEqual(scenarioF.snapshot.ownerAmount, 100, 'levy remains on the Payment owner snapshot');
  assert.strictEqual(expectedF.amounts.ownerIncome, 0, 'levy is pass-through, not owner rental income');

  assert.ok(postFn.includes('syncCommissionForPayment'));
  assert.ok(!postFn.includes('calculateForProperty'));
  assert.ok(!postFn.includes('buildIntroductionRentalCommission'));
  assert.ok(recon.includes('ensurePaymentAccountingPosted'));
  assert.ok(accountantCreate.includes('ensurePaymentAccountingPosted') || paymentCtrl.includes('ensurePaymentAccountingPosted'));
  results['Accounting projection'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Architecture / webhook / routes
  // ---------------------------------------------------------------------------
  assert.strictEqual(classifyPropertyFinancialKind('sale'), 'sale');
  assert.ok(salesCreate.includes('status: \'completed\'') || salesCreate.includes("status: 'completed'"));
  results['Phase 5 financial transaction tests'] = 'PASS';

  console.log('Phase 5 financial transaction tests passed');
  console.log(JSON.stringify({
    salePriceField: 'Payment.amount',
    commissionField: 'commissionDetails.totalCommission',
    requiredSplits: ['commissionDetails.agentShare', 'commissionDetails.agencyShare'],
    introductionFirstMonth: {
      commission: scenarioA.snapshot.totalCommission,
      owner: scenarioA.snapshot.ownerAmount
    },
    introductionSecondMonth: {
      commission: scenarioB.snapshot.totalCommission,
      owner: scenarioB.snapshot.ownerAmount
    },
    introductionAdvance: {
      commission: scenarioC.snapshot.totalCommission,
      owner: scenarioC.snapshot.ownerAmount
    },
    results
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
