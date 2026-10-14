import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  calculatePropertyCommission,
  toPaymentCommissionSnapshot
} from '../services/propertyCommissionCalculator';
import {
  buildExpectedAccountingProjection,
  evaluateAccountingReconciliation
} from '../services/paymentAccountingProjection';
import { roundMoney } from '../utils/money';
import {
  applyIntroductionOwnerRemainder,
  computeIntroductionAllocation,
  deriveIntroductionState,
  introductionAllocationReconciles,
  introductionConsumedFromPayments,
  snapshotFromIntroductionAllocation
} from '../services/introductionCommissionService';
import {
  INTRODUCTION_CONTEXT_INCOMPLETE,
  INTRODUCTION_CONTEXT_MISMATCH,
  INTRODUCTION_LEASE_NOT_APPLICABLE,
  INTRODUCTION_LEASE_REQUIRED,
  introductionTargetFromLease
} from '../services/introductionLeaseContext';
import { computeOutstandingForLease } from '../services/outstandingLeaseCalculation';
import {
  SALE_PAYMENT_INCOMPLETE_CODE,
  validateSalePaymentCompleteness
} from '../services/salePaymentCompleteness';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function sliceFn(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
  return src.slice(start, end);
}

function introSnapshot(
  rentAllocated: number,
  alreadyConsumed: number,
  levyAllocated = 0,
  oneMonthRent = 1000,
  vat?: { vatOnCommission?: boolean; vatRate?: number }
) {
  const allocation = computeIntroductionAllocation({
    rentAllocated,
    levyAllocated,
    oneMonthRent,
    alreadyConsumed
  });
  const calculated = snapshotFromIntroductionAllocation(allocation, {
    vatOnCommission: Boolean(vat?.vatOnCommission),
    vatTreatment: vat?.vatOnCommission ? 'inclusive' : undefined,
    vatRate: vat?.vatRate,
    preaPercentOfTotal: 0.03,
    agentPercentOfRemaining: 0.6,
    agencyPercentOfRemaining: 0.4
  });
  const snapshot = applyIntroductionOwnerRemainder(calculated, allocation);
  return { allocation, snapshot, result: calculated };
}

function paymentFromIntro(
  snapshot: ReturnType<typeof toPaymentCommissionSnapshot>,
  extras?: Record<string, unknown>
) {
  return {
    _id: 'pay-phase6',
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

function usesCanonicalIntro(body: string): boolean {
  return body.includes('prepareIntroductionRentalCommission');
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};
  const introSvc = srcFile('services/introductionCommissionService.ts');
  const leaseCtx = srcFile('services/introductionLeaseContext.ts');
  const calculator = srcFile('services/propertyCommissionCalculator.ts');
  const paymentCtrl = srcFile('controllers/paymentController.ts');
  const agentCtrl = srcFile('controllers/agentController.ts');
  const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
  const kpiSrc = srcFile('services/dashboardKpiService.ts');
  const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
  const recon = srcFile('services/paymentAccountingReconciliation.ts');
  const projection = srcFile('services/paymentAccountingProjection.ts');
  const scheduled = srcFile('services/scheduledSyncService.ts');

  const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
  const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
  const publicCreate = sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload');
  const finalizeFn = sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining');
  const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
  const agentUpdate = sliceFn(agentCtrl, 'export const updateAgentPayment = async', 'export const getAgentPayments');
  const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
  const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
  const webhookIntro = sliceFn(webhookCtrl, "rentalType === 'introduction'", 'const commissionResult = await CommissionService.calculateForProperty');

  // ---------------------------------------------------------------------------
  // Context / identity
  // ---------------------------------------------------------------------------
  assert.ok(leaseCtx.includes('tenantId + property + lease') || leaseCtx.includes('tenant + property + lease'));
  assert.ok(leaseCtx.includes(INTRODUCTION_LEASE_REQUIRED));
  assert.ok(leaseCtx.includes(INTRODUCTION_CONTEXT_INCOMPLETE));
  assert.ok(leaseCtx.includes(INTRODUCTION_CONTEXT_MISMATCH));
  assert.ok(leaseCtx.includes(INTRODUCTION_LEASE_NOT_APPLICABLE));
  assert.ok(leaseCtx.includes("missing.push('tenantId')"));
  assert.ok(leaseCtx.includes("missing.push('propertyId')"));
  assert.ok(leaseCtx.includes("mismatches.push('tenantId')"));
  assert.ok(leaseCtx.includes("mismatches.push('propertyId')"));
  assert.ok(leaseCtx.includes('candidates.length === 1'));
  assert.ok(!leaseCtx.includes('candidates[0]') || leaseCtx.includes('candidates.length === 1'));
  assert.ok(leaseCtx.includes('Do not use payerId') || leaseCtx.includes('payerId as the Introduction'));
  assert.ok(!leaseCtx.includes('tenantId: input.payerId'));
  assert.ok(!introSvc.includes('payerId'));
  assert.ok(introSvc.includes('leaseId: new mongoose.Types.ObjectId(String(input.leaseId))'));
  assert.strictEqual(introductionTargetFromLease({ rentAmount: 1000 }, { rent: 900 }), 1000);
  assert.strictEqual(introductionTargetFromLease({ monthlyRent: 1000 }, { rent: 900 }), 1000);
  assert.strictEqual(introductionTargetFromLease({}, { rent: 1000 }), 1000);
  assert.strictEqual(introductionTargetFromLease({ depositAmount: 2000, levy: 100 }, { rent: 1000 }), 1000);
  results['Introduction context codes'] = 'PASS';

  for (const [label, body] of [
    ['accountant', accountantCreate],
    ['lease', leaseCreate],
    ['public', publicCreate],
    ['finalize', finalizeFn],
    ['agent create', agentCreate],
    ['agent update', agentUpdate],
    ['webhook', webhookCtrl]
  ] as const) {
    assert.ok(usesCanonicalIntro(body), `${label} uses prepareIntroductionRentalCommission`);
  }
  assert.ok(!webhookIntro.includes('tenantId: input.payerObjectId'), 'webhook Introduction does not use payerId as tenant identity');
  assert.ok(webhookIntro.includes('tenantId: input.tenantId'));
  assert.ok(webhookIntro.includes('leaseId: input.leaseId'));
  results['Live Introduction paths'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Lifecycle — VAT off, $1,000 rent
  // ---------------------------------------------------------------------------
  const first = introSnapshot(1000, 0);
  assert.strictEqual(first.allocation.introThisPayment, 1000);
  assert.strictEqual(first.allocation.ownerRent, 0);
  assert.strictEqual(first.snapshot.totalCommission, 1000);
  assert.strictEqual(first.snapshot.ownerAmount, 0);
  assert.strictEqual(first.snapshot.vatAmount, 0);

  const second = introSnapshot(1000, 1000);
  assert.strictEqual(second.allocation.introThisPayment, 0);
  assert.strictEqual(second.allocation.ownerRent, 1000);
  assert.strictEqual(second.snapshot.totalCommission, 0);
  assert.strictEqual(second.snapshot.ownerAmount, 1000);

  const third = introSnapshot(1000, 1000);
  assert.strictEqual(third.snapshot.totalCommission, 0);
  assert.strictEqual(third.snapshot.ownerAmount, 1000);

  const advance = introSnapshot(3000, 0);
  assert.strictEqual(advance.allocation.introThisPayment, 1000);
  assert.strictEqual(advance.allocation.ownerRent, 2000);
  assert.strictEqual(advance.snapshot.totalCommission, 1000);
  assert.strictEqual(advance.snapshot.ownerAmount, 2000);

  const depositOnlyConsumed = introductionConsumedFromPayments([
    { amount: 0, depositAmount: 1000, commissionDetails: { totalCommission: 0, commissionBase: 0 } }
  ]);
  assert.strictEqual(depositOnlyConsumed, 0);
  const depositPlusRent = introSnapshot(1000, 0);
  assert.strictEqual(depositPlusRent.allocation.introThisPayment, 1000);
  assert.strictEqual(depositPlusRent.allocation.ownerRent, 0);

  const depositPlusAdvance = introSnapshot(3000, 0);
  assert.strictEqual(depositPlusAdvance.allocation.introThisPayment, 1000);
  assert.strictEqual(depositPlusAdvance.allocation.ownerRent, 2000);

  const partial1 = introSnapshot(600, 0);
  const partial2 = introSnapshot(400, 600);
  const afterPartial = introSnapshot(1000, 1000);
  assert.strictEqual(partial1.allocation.introThisPayment, 600);
  assert.strictEqual(partial1.allocation.remainingAfter, 400);
  assert.strictEqual(partial1.allocation.ownerRent, 0);
  assert.strictEqual(partial2.allocation.introThisPayment, 400);
  assert.strictEqual(partial2.allocation.remainingAfter, 0);
  assert.strictEqual(afterPartial.allocation.introThisPayment, 0);
  assert.strictEqual(afterPartial.allocation.ownerRent, 1000);

  const levyFirst = introSnapshot(1000, 0, 100);
  assert.strictEqual(levyFirst.allocation.introThisPayment, 1000);
  assert.strictEqual(levyFirst.snapshot.levy, 100);
  assert.strictEqual(levyFirst.snapshot.ownerAmount, 100);
  assert.ok(introductionAllocationReconciles({
    amount: 1100,
    introThisPayment: 1000,
    ownerRent: 0,
    levyAllocated: 100
  }));
  const levyAfter = introSnapshot(1000, 1000, 100);
  assert.strictEqual(levyAfter.allocation.introThisPayment, 0);
  assert.strictEqual(levyAfter.allocation.ownerRent, 1000);
  assert.strictEqual(levyAfter.snapshot.ownerAmount, 1100);

  assert.ok(introductionAllocationReconciles({
    amount: 1000,
    introThisPayment: 1000,
    ownerRent: 0,
    levyAllocated: 0
  }));
  assert.ok(introductionAllocationReconciles({
    amount: 3000,
    introThisPayment: 1000,
    ownerRent: 2000,
    levyAllocated: 0
  }));
  results['Introduction lifecycle VAT off'] = 'PASS';

  // ---------------------------------------------------------------------------
  // VAT inclusive — extract, do not add on top
  // ---------------------------------------------------------------------------
  const vatRate = 0.155;
  const expectedNet = roundMoney(1000 / (1 + vatRate));
  const expectedVat = roundMoney(1000 - expectedNet);
  const vatFirst = introSnapshot(1000, 0, 0, 1000, { vatOnCommission: true, vatRate });
  assert.strictEqual(vatFirst.snapshot.totalCommission, 1000, 'gross Introduction remains one month rent');
  assert.notStrictEqual(vatFirst.snapshot.totalCommission, roundMoney(1000 * (1 + vatRate)));
  assert.strictEqual(vatFirst.snapshot.commissionNet, expectedNet);
  assert.strictEqual(vatFirst.snapshot.vatAmount, expectedVat);
  assert.strictEqual(roundMoney(vatFirst.snapshot.commissionNet + vatFirst.snapshot.vatAmount), vatFirst.snapshot.totalCommission);
  assert.strictEqual(vatFirst.snapshot.ownerAmount, 0);
  assert.strictEqual(vatFirst.snapshot.vatTreatment, 'inclusive');

  const exclusivePropertyWouldAdd = calculatePropertyCommission({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: 100,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate,
    commissionType: 'introduction'
  });
  assert.strictEqual(exclusivePropertyWouldAdd.vatTreatment, 'inclusive');
  assert.strictEqual(exclusivePropertyWouldAdd.totalCommission, 1000);

  const managementExclusive = calculatePropertyCommission({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate
  });
  assert.strictEqual(managementExclusive.totalCommission, 150);
  assert.strictEqual(managementExclusive.vatAmount, roundMoney(150 * vatRate));

  const vatZero = introSnapshot(1000, 0, 0, 1000, { vatOnCommission: true, vatRate: 0 });
  assert.strictEqual(vatZero.snapshot.totalCommission, 1000);
  assert.strictEqual(vatZero.snapshot.vatAmount, 0);

  const vatDisabled = introSnapshot(1000, 0, 0, 1000, { vatOnCommission: false, vatRate });
  assert.strictEqual(vatDisabled.snapshot.totalCommission, 1000);
  assert.strictEqual(vatDisabled.snapshot.vatAmount, 0);

  const vatPartial = introSnapshot(600, 0, 0, 1000, { vatOnCommission: true, vatRate });
  const partialNet = roundMoney(600 / (1 + vatRate));
  const partialVat = roundMoney(600 - partialNet);
  assert.strictEqual(vatPartial.allocation.introThisPayment, 600);
  assert.strictEqual(vatPartial.snapshot.totalCommission, 600);
  assert.strictEqual(vatPartial.snapshot.commissionNet, partialNet);
  assert.strictEqual(vatPartial.snapshot.vatAmount, partialVat);
  assert.strictEqual(roundMoney(vatPartial.snapshot.commissionNet + vatPartial.snapshot.vatAmount), 600);
  assert.strictEqual(vatPartial.snapshot.ownerAmount, 0);

  const vatAdvance = introSnapshot(3000, 0, 0, 1000, { vatOnCommission: true, vatRate });
  assert.strictEqual(vatAdvance.allocation.introThisPayment, 1000);
  assert.strictEqual(vatAdvance.allocation.ownerRent, 2000);
  assert.strictEqual(vatAdvance.snapshot.totalCommission, 1000);
  assert.strictEqual(vatAdvance.snapshot.vatAmount, expectedVat);
  assert.strictEqual(vatAdvance.snapshot.ownerAmount, 2000);

  const rounding = calculatePropertyCommission({
    grossRent: 1,
    levy: 0,
    commissionPercentage: 100,
    vatOnCommission: true,
    vatTreatment: 'inclusive',
    vatRate,
    commissionType: 'introduction'
  });
  assert.strictEqual(roundMoney(rounding.commissionNet + rounding.vatAmount), rounding.totalCommission);
  results['VAT-inclusive Introduction'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Identity across leases
  // ---------------------------------------------------------------------------
  const leaseAPayments = [
    { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } }
  ];
  const stateA = deriveIntroductionState({
    tenantId: 'tenant-1',
    propertyId: 'prop-1',
    leaseId: 'lease-a',
    introductionTarget: 1000,
    payments: leaseAPayments
  });
  const stateB = deriveIntroductionState({
    tenantId: 'tenant-1',
    propertyId: 'prop-1',
    leaseId: 'lease-b',
    introductionTarget: 1000,
    payments: []
  });
  assert.strictEqual(stateA.satisfied, true);
  assert.strictEqual(stateA.introductionRemaining, 0);
  assert.strictEqual(stateB.satisfied, false);
  assert.strictEqual(stateB.introductionRemaining, 1000);

  const otherProperty = deriveIntroductionState({
    tenantId: 'tenant-1',
    propertyId: 'prop-2',
    leaseId: 'lease-c',
    introductionTarget: 1000,
    payments: []
  });
  assert.strictEqual(otherProperty.introductionRemaining, 1000);

  const otherTenant = deriveIntroductionState({
    tenantId: 'tenant-2',
    propertyId: 'prop-1',
    leaseId: 'lease-d',
    introductionTarget: 1000,
    payments: []
  });
  assert.strictEqual(otherTenant.introductionRemaining, 1000);
  results['Lease identity'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Outstanding rental
  // ---------------------------------------------------------------------------
  const firstMonth = new Date(2026, 0, 1);
  const thirdMonth = new Date(2026, 2, 1);
  const leaseEnd = new Date(2026, 11, 1);
  const outstandingBefore = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: firstMonth,
    cutoverDate: null,
    paidKeys: new Set(),
    monthlyAmount: 1000,
    introductionRemaining: 400,
    mode: 'rent'
  });
  assert.strictEqual(outstandingBefore.totalAmount, 400);
  const outstandingAfter = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: thirdMonth,
    cutoverDate: null,
    paidKeys: new Set(['2026-1']),
    monthlyAmount: 1000,
    introductionRemaining: 0,
    mode: 'rent'
  });
  assert.strictEqual(outstandingAfter.totalAmount, 2000);
  const advanceCovered = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: firstMonth,
    leaseEnd,
    currentMonthStart: thirdMonth,
    cutoverDate: null,
    paidKeys: new Set(['2026-1', '2026-2', '2026-3']),
    monthlyAmount: 1000,
    introductionRemaining: 0,
    mode: 'rent'
  });
  assert.strictEqual(advanceCovered.totalAmount, 0);
  assert.ok(kpiSrc.includes('${propertyId}:${tenantId}:${leaseId}') || kpiSrc.includes('propertyId}:${tenantId}:${leaseId}'));
  assert.ok(kpiSrc.includes('if (!propertyId || !tenantId || !leaseId) continue'));
  results['Outstanding rental'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Accounting / reconciliation
  // ---------------------------------------------------------------------------
  const introPay = paymentFromIntro(first.snapshot, { amount: 1000, depositAmount: 1000, _id: 'pay-intro-owner0' });
  const expectedIntro = buildExpectedAccountingProjection(introPay);
  assert.strictEqual(expectedIntro.amounts.ownerIncome, 0);
  const mismatchedOwner = evaluateAccountingReconciliation({
    paymentId: 'pay-intro-owner0',
    expected: expectedIntro,
    actual: {
      ownerIncome: true,
      agentCommission: true,
      companyCommission: true,
      journal: true,
      vat: false,
      deposit: true,
      amounts: {
        ownerIncome: 1000,
        agentCommission: first.snapshot.agentShare,
        companyCommission: first.snapshot.agencyShare,
        journal: 1000,
        deposit: 1000
      }
    }
  });
  assert.strictEqual(mismatchedOwner.accountingComplete, false);
  assert.ok(mismatchedOwner.mismatched.includes('ownerIncome'));

  const laterPay = paymentFromIntro(second.snapshot, { amount: 1000, _id: 'pay-owner-later' });
  const expectedLater = buildExpectedAccountingProjection(laterPay);
  assert.strictEqual(expectedLater.amounts.ownerIncome, 1000);
  const matchedLater = evaluateAccountingReconciliation({
    paymentId: 'pay-owner-later',
    expected: expectedLater,
    actual: {
      ownerIncome: true,
      agentCommission: false,
      companyCommission: false,
      journal: true,
      vat: false,
      deposit: false,
      amounts: { ownerIncome: 1000, journal: 1000 }
    }
  });
  assert.strictEqual(matchedLater.accountingComplete, true);

  const vatPay = paymentFromIntro(vatFirst.snapshot, { amount: 1000, _id: 'pay-vat' });
  const expectedVatProj = buildExpectedAccountingProjection(vatPay);
  assert.ok(expectedVatProj.vat);
  const vatMismatch = evaluateAccountingReconciliation({
    paymentId: 'pay-vat',
    expected: expectedVatProj,
    actual: {
      ownerIncome: false,
      agentCommission: true,
      companyCommission: true,
      journal: true,
      vat: true,
      deposit: false,
      amounts: {
        agentCommission: vatFirst.snapshot.agentShare,
        companyCommission: vatFirst.snapshot.agencyShare,
        journal: 1000,
        vat: roundMoney(expectedVat + 10)
      }
    }
  });
  assert.strictEqual(vatMismatch.accountingComplete, false);
  assert.ok(vatMismatch.mismatched.includes('vat'));

  const missingProj = evaluateAccountingReconciliation({
    paymentId: 'pay-intro-owner0',
    expected: expectedIntro,
    actual: {
      ownerIncome: false,
      agentCommission: false,
      companyCommission: false,
      journal: false,
      vat: false,
      deposit: false
    }
  });
  assert.strictEqual(missingProj.accountingComplete, false);

  assert.ok(ensureFn.includes('postPaymentAccounting') || recon.includes('postPaymentAccounting'));
  assert.ok(!postFn.includes('calculateForProperty'));
  assert.ok(!postFn.includes('prepareIntroductionRentalCommission'));
  assert.ok(!postFn.includes('buildIntroductionRentalCommission'));
  assert.ok(accountantCreate.includes('ensurePaymentAccountingPosted'));
  assert.ok(agentCreate.includes('ensurePaymentAccountingPosted'));
  assert.ok(webhookCtrl.includes('ensurePaymentAccountingPosted'));
  assert.ok(recon.includes('repairPaymentAccounting'));
  assert.ok(!scheduled.includes('repairPaymentAccounting('));
  assert.ok(!introSvc.includes('Repair All'));
  assert.ok(!paymentCtrl.includes('scan all Payments'));
  results['Accounting integrity'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Sale completeness remains
  // ---------------------------------------------------------------------------
  const incompleteSale = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: { totalCommission: 0, agentShare: 0, agencyShare: 0 }
  });
  assert.strictEqual(incompleteSale.ok, false);
  assert.strictEqual(SALE_PAYMENT_INCOMPLETE_CODE, 'SALE_PAYMENT_INCOMPLETE');
  assert.ok(webhookCtrl.includes('validateSalePaymentCompleteness'));
  assert.ok(agentCreate.includes('validateSalePaymentCompleteness'));
  assert.ok(accountantCreate.includes('validateSalePaymentCompleteness') || paymentCtrl.includes('validateSalePaymentCompleteness'));
  results['Sale completeness'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Calculator is one engine; UI surfaces backend error
  // ---------------------------------------------------------------------------
  assert.ok(calculator.includes("commissionType === 'introduction'"));
  assert.ok(!calculator.includes('calculateIntroductionCommission2'));
  assert.ok(!introSvc.includes('calculateIntroductionCommission2'));
  const clientRoot = path.resolve(process.cwd(), '..', 'client', 'src');
  const paymentForm = fs.readFileSync(
    path.join(clientRoot, 'components', 'payments', 'PaymentForm.tsx'),
    'utf8'
  );
  assert.ok(paymentForm.includes('leaseId'));
  assert.ok(paymentForm.includes('matched.length === 1'));
  assert.ok(paymentForm.includes('The first lease is not chosen automatically'));
  const apiErrorUtil = fs.readFileSync(
    path.join(clientRoot, 'utils', 'paymentApiError.ts'),
    'utf8'
  );
  assert.ok(apiErrorUtil.includes('mismatches'));
  results['Single commission engine + UI'] = 'PASS';

  console.log('Phase 6 introduction lifecycle tests passed');
  console.log(JSON.stringify({
    identity: 'tenantId + propertyId + leaseId',
    vatInclusiveFormula: 'net = roundMoney(gross / (1 + vatRate)); vat = roundMoney(gross - net)',
    exampleVatOn1000At15_5: { net: expectedNet, vat: expectedVat, gross: 1000 },
    results
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
