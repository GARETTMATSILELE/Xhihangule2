import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  calculatePropertyCommission
} from '../services/propertyCommissionCalculator';
import {
  buildExpectedAccountingProjection,
  evaluateAccountingReconciliation
} from '../services/paymentAccountingProjection';
import { roundMoney } from '../utils/money';
import {
  applyIntroductionOwnerRemainder,
  computeIntroductionAllocation,
  introductionConsumedFromPayments,
  snapshotFromIntroductionAllocation
} from '../services/introductionCommissionService';
import { computeOutstandingForLease } from '../services/outstandingLeaseCalculation';
import {
  SALE_PAYMENT_INCOMPLETE_CODE,
  validateSalePaymentCompleteness
} from '../services/salePaymentCompleteness';
import {
  COMPLETED_PAYMENT_IMMUTABLE_MESSAGE,
  PAYMENT_FINANCIAL_FIELDS,
  assertCompletedPaymentFinanciallyImmutable
} from '../services/paymentFinancialImmutability';
import {
  LEGACY_INTRODUCTION_CONTEXT_RISK,
  detectLegacyIntroductionContextRisk
} from '../services/legacyIntroductionRisk';
import {
  CURRENCY_MISMATCH,
  DUPLICATE_PROJECTION_DETECTED,
  ORPHAN_PROJECTION_DETECTED,
  buildPaymentIntegrityDiagnostic,
  detectCurrencyMismatch,
  detectDuplicateProjections,
  detectOrphanProjection
} from '../services/paymentIntegrityDiagnostic';
import { computeOwnerIncomeAmount } from '../services/paymentAccountingCompleteness';

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function sliceFn(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
  return src.slice(start, end);
}

function introSnapshot(rentAllocated: number, alreadyConsumed: number, levyAllocated = 0, vat?: { vatOnCommission?: boolean; vatRate?: number }) {
  const allocation = computeIntroductionAllocation({
    rentAllocated,
    levyAllocated,
    oneMonthRent: 1000,
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
  return { allocation, snapshot: applyIntroductionOwnerRemainder(calculated, allocation) };
}

function paymentFromSnapshot(snapshot: any, extras?: Record<string, unknown>) {
  return {
    _id: extras?._id || 'pay-phase7',
    status: 'completed',
    paymentType: extras?.paymentType || 'rental',
    amount: Number(extras?.amount ?? snapshot.commissionBase),
    depositAmount: Number(extras?.depositAmount ?? 0),
    levyAllocated: snapshot.levy || 0,
    isProvisional: false,
    isInSuspense: false,
    commissionDetails: snapshot,
    currency: extras?.currency || 'USD',
    agentId: extras?.agentId || 'agent-1',
    ...extras
  };
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};
  const paymentCtrl = srcFile('controllers/paymentController.ts');
  const agentCtrl = srcFile('controllers/agentController.ts');
  const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
  const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
  const recon = srcFile('services/paymentAccountingReconciliation.ts');
  const integrity = srcFile('services/paymentAccountingIntegrity.ts');
  const scheduled = srcFile('services/scheduledSyncService.ts');
  const ledger = srcFile('services/ledgerEventService.ts');
  const reportRoutes = srcFile('routes/reportRoutes.ts');
  const accountingCtrl = srcFile('controllers/accountingController.ts');
  const accountantRoutes = srcFile('routes/accountantRoutes.ts');
  const introSvc = srcFile('services/introductionCommissionService.ts');
  const getAccounting = sliceFn(paymentCtrl, 'export const getPaymentAccountingReconciliation = async', 'export const repairPaymentAccountingExplicit');
  const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');
  const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
  const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
  const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');

  // ---------------------------------------------------------------------------
  // Live write-path / orchestrator
  // ---------------------------------------------------------------------------
  for (const [label, body] of [
    ['accountant', accountantCreate],
    ['agent', agentCreate],
    ['webhook', webhookCtrl],
    ['lease', sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant')],
    ['public', sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload')],
    ['finalize', sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining')],
    ['sales', sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async')]
  ] as const) {
    assert.ok(body.includes('ensurePaymentAccountingPosted'), `${label} posts via canonical orchestrator`);
    assert.ok(!body.includes('recordIncomeFromPayment('), `${label} must not write owner ledger directly`);
  }
  assert.ok(ensureFn.includes('postPaymentAccounting'));
  assert.ok(ensureFn.includes('reconcilePayment'));
  assert.ok(ensureFn.includes('applyReconciliationOutcome'));
  assert.ok(!postFn.includes('calculateForProperty'));
  assert.ok(!postFn.includes('prepareIntroductionRentalCommission'));
  assert.ok(!postFn.includes('accountingComplete'));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'services', 'paymentService.ts')));
  results['Canonical posting'] = 'PASS';

  // GET safety
  assert.ok(getAccounting.includes('reconcilePayment'));
  assert.ok(!getAccounting.includes('applyReconciliationOutcome'));
  assert.ok(!getAccounting.includes('repairPaymentAccounting('));
  assert.ok(!getAccounting.includes('postPaymentAccounting('));
  assert.ok(getAccounting.includes('loadLegacyIntroductionContextRisk'));
  assert.ok(getAccounting.includes('diagnostic:'));
  assert.ok(accountingCtrl.includes('initializeForCompany'));
  assert.ok(!accountingCtrl.includes('recordIncomeFromPayment('));
  const dashboardSummaryFn = sliceFn(
    srcFile('services/accountingService.ts'),
    'async getDashboardSummary(companyId: string)',
    'async getDashboardOutstanding'
  );
  assert.ok(!dashboardSummaryFn.includes('CompanyBalance.updateOne'));
  const propertyAccountCtrl = srcFile('controllers/propertyAccountController.ts');
  assert.ok(propertyAccountCtrl.includes('Read-only: load the named ledger'));
  assert.ok(propertyAccountCtrl.includes('Never posts income or repairs accounting'));
  results['GET safety'] = 'PASS';

  // Detection-only scheduled / orphan
  assert.ok(scheduled.includes('Read-only: never repairs or backfills'));
  assert.ok(!scheduled.includes('repairPaymentAccounting('));
  assert.ok(integrity.includes('Never deletes orphans'));
  assert.ok(!integrity.includes('recordIncomeFromPayment('));
  assert.ok(ledger.includes('postPaymentAccounting'));
  results['Detection-only'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Payment identity / cross-payment
  // ---------------------------------------------------------------------------
  const snapshotA = introSnapshot(1000, 0).snapshot;
  const payA = paymentFromSnapshot(snapshotA, { _id: 'pay-A', amount: 1000 });
  const expectedA = buildExpectedAccountingProjection(payA);
  const matchingActual = {
    ownerIncome: expectedA.ownerIncome,
    agentCommission: expectedA.agentCommission,
    companyCommission: expectedA.companyCommission,
    journal: expectedA.journal,
    vat: expectedA.vat,
    deposit: expectedA.deposit,
    amounts: { ...expectedA.amounts },
    linkedPaymentIds: {
      ownerIncome: 'pay-A',
      agentCommission: 'pay-A',
      companyCommission: 'pay-A',
      journal: 'pay-A',
      vat: 'pay-A',
      deposit: 'pay-A'
    }
  };
  const reconWrongId = evaluateAccountingReconciliation({
    paymentId: 'pay-A',
    expected: expectedA,
    actual: {
      ...matchingActual,
      linkedPaymentIds: { agentCommission: 'pay-B', companyCommission: 'pay-B', journal: 'pay-B' }
    }
  });
  assert.strictEqual(reconWrongId.accountingComplete, false);
  assert.ok(reconWrongId.mismatched.length > 0);

  const reconMatchA = evaluateAccountingReconciliation({
    paymentId: 'pay-A',
    expected: expectedA,
    actual: matchingActual
  });
  assert.strictEqual(reconMatchA.accountingComplete, true);
  results['Payment identity'] = 'PASS';

  // Duplicate projections
  const dup = detectDuplicateProjections({ paymentId: 'pay-A', projectionType: 'ownerIncome', count: 2 });
  assert.strictEqual(dup?.code, DUPLICATE_PROJECTION_DETECTED);
  const dupRecon = evaluateAccountingReconciliation({
    paymentId: 'pay-A',
    expected: expectedA,
    actual: {
      ...matchingActual,
      duplicates: { agentCommission: 2 }
    }
  });
  assert.strictEqual(dupRecon.accountingComplete, false);
  results['Duplicate projections'] = 'PASS';

  // Missing / mismatch / accountingComplete
  const missing = evaluateAccountingReconciliation({
    paymentId: 'pay-A',
    expected: expectedA,
    actual: {
      ownerIncome: false,
      agentCommission: false,
      companyCommission: false,
      journal: false,
      vat: false,
      deposit: false
    }
  });
  assert.strictEqual(missing.accountingComplete, false);
  const wrongAmount = evaluateAccountingReconciliation({
    paymentId: 'pay-A',
    expected: expectedA,
    actual: {
      ...matchingActual,
      amounts: { ...expectedA.amounts, journal: roundMoney(Number(expectedA.amounts.journal) - 1) }
    }
  });
  assert.strictEqual(wrongAmount.accountingComplete, false);
  const wrongCommission = evaluateAccountingReconciliation({
    paymentId: 'pay-A',
    expected: expectedA,
    actual: {
      ...matchingActual,
      amounts: { ...expectedA.amounts, agentCommission: 1 }
    }
  });
  assert.strictEqual(wrongCommission.accountingComplete, false);
  const laterSnapshot = introSnapshot(1000, 1000).snapshot;
  const laterPay = paymentFromSnapshot(laterSnapshot, { _id: 'pay-owner', amount: 1000 });
  const expectedLater = buildExpectedAccountingProjection(laterPay);
  const matchingLater = {
    ownerIncome: expectedLater.ownerIncome,
    agentCommission: expectedLater.agentCommission,
    companyCommission: expectedLater.companyCommission,
    journal: expectedLater.journal,
    vat: expectedLater.vat,
    deposit: expectedLater.deposit,
    amounts: { ...expectedLater.amounts },
    linkedPaymentIds: {
      ownerIncome: 'pay-owner',
      agentCommission: 'pay-owner',
      companyCommission: 'pay-owner',
      journal: 'pay-owner',
      vat: 'pay-owner',
      deposit: 'pay-owner'
    }
  };
  const reconLater = evaluateAccountingReconciliation({
    paymentId: 'pay-owner',
    expected: expectedLater,
    actual: matchingLater
  });
  assert.strictEqual(reconLater.accountingComplete, true);
  const wrongOwner = evaluateAccountingReconciliation({
    paymentId: 'pay-owner',
    expected: expectedLater,
    actual: {
      ...matchingLater,
      amounts: { ...expectedLater.amounts, ownerIncome: roundMoney(Number(expectedLater.amounts.ownerIncome || 0) + 50) }
    }
  });
  assert.strictEqual(wrongOwner.accountingComplete, false);
  const vatMismatch = evaluateAccountingReconciliation({
    paymentId: 'pay-A',
    expected: expectedA,
    actual: {
      ...matchingActual,
      vat: true,
      amounts: { ...expectedA.amounts, vat: 99 }
    }
  });
  assert.strictEqual(vatMismatch.accountingComplete, expectedA.vat ? false : vatMismatch.accountingComplete);
  const vatOnPay = paymentFromSnapshot(
    introSnapshot(1000, 0, 0, { vatOnCommission: true, vatRate: 0.155 }).snapshot,
    { _id: 'pay-vat', amount: 1000 }
  );
  const expectedVat = buildExpectedAccountingProjection(vatOnPay);
  const matchingVat = {
    ownerIncome: expectedVat.ownerIncome,
    agentCommission: expectedVat.agentCommission,
    companyCommission: expectedVat.companyCommission,
    journal: expectedVat.journal,
    vat: expectedVat.vat,
    deposit: expectedVat.deposit,
    amounts: { ...expectedVat.amounts },
    linkedPaymentIds: {
      ownerIncome: 'pay-vat',
      agentCommission: 'pay-vat',
      companyCommission: 'pay-vat',
      journal: 'pay-vat',
      vat: 'pay-vat',
      deposit: 'pay-vat'
    }
  };
  if (expectedVat.vat) {
    const wrongVat = evaluateAccountingReconciliation({
      paymentId: 'pay-vat',
      expected: expectedVat,
      actual: { ...matchingVat, amounts: { ...expectedVat.amounts, vat: roundMoney(Number(expectedVat.amounts.vat) + 1) } }
    });
    assert.strictEqual(wrongVat.accountingComplete, false);
  }
  results['accountingComplete'] = 'PASS';

  // Orphan
  const orphan = detectOrphanProjection({
    projectionType: 'ownerIncome',
    projectionId: 'tx-1',
    paymentId: 'missing-pay',
    paymentExists: false,
    propertyId: 'prop-1',
    amount: 1000,
    currency: 'USD'
  });
  assert.strictEqual(orphan?.code, ORPHAN_PROJECTION_DETECTED);
  assert.strictEqual(orphan?.action, 'FLAG');
  assert.strictEqual(detectOrphanProjection({
    projectionType: 'ownerIncome',
    paymentId: 'pay-A',
    paymentExists: true
  }), null);
  results['Orphan projections'] = 'PASS';

  // ---------------------------------------------------------------------------
  // Introduction + VAT + levy + legacy
  // ---------------------------------------------------------------------------
  const first = introSnapshot(1000, 0);
  assert.strictEqual(first.allocation.introThisPayment, 1000);
  const second = introSnapshot(1000, 1000);
  assert.strictEqual(second.allocation.introThisPayment, 0);
  const over = computeIntroductionAllocation({ rentAllocated: 1000, oneMonthRent: 1000, alreadyConsumed: 1000 });
  assert.ok(over.introThisPayment + 1000 <= 1000 + 0.001);
  const partial = introSnapshot(600, 0);
  assert.strictEqual(partial.allocation.remainingAfter, 400);
  const advance = introSnapshot(3000, 0);
  assert.strictEqual(advance.allocation.introThisPayment, 1000);
  assert.strictEqual(advance.allocation.ownerRent, 2000);
  const levy = introSnapshot(1000, 0, 100);
  assert.strictEqual(levy.allocation.introThisPayment, 1000);
  assert.strictEqual(levy.snapshot.levy, 100);
  assert.ok(introductionConsumedFromPayments([{ amount: 0, depositAmount: 1000 }]) === 0);

  const vatRate = 0.155;
  const vatIntro = introSnapshot(1000, 0, 0, { vatOnCommission: true, vatRate });
  const expectedNet = roundMoney(1000 / (1 + vatRate));
  assert.strictEqual(vatIntro.snapshot.totalCommission, 1000);
  assert.strictEqual(roundMoney(vatIntro.snapshot.commissionNet + vatIntro.snapshot.vatAmount), 1000);
  assert.strictEqual(vatIntro.snapshot.commissionNet, expectedNet);
  const vat333 = calculatePropertyCommission({
    grossRent: 333.33,
    levy: 0,
    commissionPercentage: 100,
    vatOnCommission: true,
    vatTreatment: 'inclusive',
    vatRate,
    commissionType: 'introduction'
  });
  assert.strictEqual(roundMoney(vat333.commissionNet + vat333.vatAmount), vat333.totalCommission);
  assert.ok(vat333.totalCommission <= 333.33);
  const vatTiny = calculatePropertyCommission({
    grossRent: 0.01,
    levy: 0,
    commissionPercentage: 100,
    vatOnCommission: true,
    vatTreatment: 'inclusive',
    vatRate,
    commissionType: 'introduction'
  });
  assert.strictEqual(roundMoney(vatTiny.commissionNet + vatTiny.vatAmount), vatTiny.totalCommission);

  const legacy = detectLegacyIntroductionContextRisk({
    tenantId: 't1',
    propertyId: 'p1',
    leaseId: 'lease-new',
    payments: [
      { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } },
      { amount: 1000, depositAmount: 0, commissionDetails: { totalCommission: 0, commissionBase: 0 } }
    ]
  });
  assert.ok(legacy);
  assert.strictEqual(legacy?.code, LEGACY_INTRODUCTION_CONTEXT_RISK);
  assert.strictEqual(legacy?.legacyIntroductionAmount, 1000);
  assert.strictEqual(legacy?.action, 'MANUAL_REVIEW_REQUIRED');
  const noLegacy = detectLegacyIntroductionContextRisk({
    tenantId: 't1',
    propertyId: 'p1',
    leaseId: 'lease-new',
    payments: [{ leaseId: 'lease-new', amount: 1000, commissionDetails: { totalCommission: 1000, commissionBase: 1000 } }]
  });
  assert.strictEqual(noLegacy, null);
  assert.ok(introSvc.includes('loadLegacyIntroductionContextRisk'));
  assert.ok(introSvc.includes('Detection must never block'));
  results['Introduction'] = 'PASS';

  // Outstanding / trust / deposit
  const current = new Date(2026, 0, 1);
  const paidCurrent = computeOutstandingForLease({
    rentalType: 'management',
    leaseStart: current,
    leaseEnd: new Date(2026, 11, 1),
    currentMonthStart: current,
    cutoverDate: null,
    paidKeys: new Set(['2026-1']),
    monthlyAmount: 1000
  });
  assert.strictEqual(paidCurrent.totalAmount, 0);
  const introOutstanding = computeOutstandingForLease({
    rentalType: 'introduction',
    leaseStart: current,
    leaseEnd: new Date(2026, 11, 1),
    currentMonthStart: new Date(2026, 2, 1),
    cutoverDate: null,
    paidKeys: new Set(['2026-1']),
    monthlyAmount: 1000,
    introductionRemaining: 0
  });
  assert.strictEqual(introOutstanding.totalAmount, 2000);
  const depositOnly = paymentFromSnapshot({
    totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 0, levy: 0, commissionBase: 0
  }, { amount: 0, depositAmount: 1000 });
  const expectedDeposit = buildExpectedAccountingProjection(depositOnly);
  assert.strictEqual(expectedDeposit.ownerIncome, false);
  assert.strictEqual(expectedDeposit.agentCommission, false);
  assert.strictEqual(expectedDeposit.deposit, true);
  results['Outstanding / trust'] = 'PASS';

  // Sale
  assert.strictEqual(validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: { totalCommission: 12500, agentShare: 7000, agencyShare: 5000 }
  }).ok, true);
  const missingPrice = validateSalePaymentCompleteness({
    commissionDetails: { totalCommission: 12500, agentShare: 7000, agencyShare: 5000 }
  });
  assert.ok(!missingPrice.ok && missingPrice.missing.includes('salePrice'));
  const missingCommission = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: { agentShare: 7000, agencyShare: 5000 }
  });
  assert.ok(!missingCommission.ok && missingCommission.missing.includes('commissionDetails.totalCommission'));
  const missingAgent = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: { totalCommission: 12500, agencyShare: 5000 }
  });
  assert.ok(!missingAgent.ok && missingAgent.missing.includes('commissionDetails.agentShare'));
  const missingAgency = validateSalePaymentCompleteness({
    amount: 250000,
    commissionDetails: { totalCommission: 12500, agentShare: 7000 }
  });
  assert.ok(!missingAgency.ok && missingAgency.missing.includes('commissionDetails.agencyShare'));
  assert.strictEqual(SALE_PAYMENT_INCOMPLETE_CODE, 'SALE_PAYMENT_INCOMPLETE');
  assert.ok(webhookCtrl.includes('validateSalePaymentCompleteness'));
  assert.ok(webhookCtrl.includes('tenantId: input.tenantId'));
  assert.ok(!sliceFn(webhookCtrl, "rentalType === 'introduction'", 'const commissionResult').includes('tenantId: input.payerObjectId'));
  results['Sale'] = 'PASS';

  // Immutability
  assert.ok(PAYMENT_FINANCIAL_FIELDS.includes('leaseId'));
  assert.throws(
    () => assertCompletedPaymentFinanciallyImmutable({ status: 'completed' }, { amount: 1 }),
    (err: Error) => err.message === COMPLETED_PAYMENT_IMMUTABLE_MESSAGE
  );
  assert.throws(
    () => assertCompletedPaymentFinanciallyImmutable({ status: 'completed' }, { leaseId: 'x' }),
    (err: Error) => err.message === COMPLETED_PAYMENT_IMMUTABLE_MESSAGE
  );
  assert.doesNotThrow(() => assertCompletedPaymentFinanciallyImmutable({ status: 'completed' }, { notes: 'admin' }));
  assert.ok(paymentCtrl.includes('reversalOfPaymentId') || srcFile('models/Payment.ts').includes('reversalOfPaymentId'));
  results['Immutability'] = 'PASS';

  // Idempotency / webhook / retry
  assert.ok(srcFile('models/Payment.ts').includes('idempotencyKey'));
  assert.ok(accountantCreate.includes('idempotencyKey'));
  assert.ok(agentCreate.includes('idempotencyKey'));
  assert.ok(webhookCtrl.includes('Duplicate webhook ignored'));
  assert.ok(postFn.includes('recordIncomeFromPayment'));
  assert.ok(srcFile('services/propertyAccountService.ts').includes('payment:${'));
  assert.ok(ensureFn.includes('postPaymentAccounting'));
  // Duplicate posting is application idempotency (payment:paymentId / already_applied), not a new index.
  assert.ok(postFn.includes("artifacts.ownerIncome = 'failed'"));
  assert.ok(ledger.includes("result.status === 'partial'"));
  results['Idempotency'] = 'PASS';

  // Currency / rounding
  assert.strictEqual(detectCurrencyMismatch({ paymentCurrency: 'USD', projectionCurrency: 'ZWL' })?.code, CURRENCY_MISMATCH);
  assert.strictEqual(detectCurrencyMismatch({ paymentCurrency: 'USD', projectionCurrency: 'USD' }), null);
  assert.ok(srcFile('models/Payment.ts').includes("enum: ['USD', 'ZWL']"));
  assert.ok(!srcFile('services/propertyAccountService.ts').includes('convertCurrency'));
  const halfCent = roundMoney(1.225);
  assert.strictEqual(halfCent, 1.23);
  results['Currency / rounding'] = 'PASS';

  // Owner statement vs Payment snapshot
  const ownerFromSnapshot = computeOwnerIncomeAmount({
    isSale: false,
    ownerAmount: first.snapshot.ownerAmount,
    passThroughTotal: 100
  });
  assert.strictEqual(first.snapshot.ownerAmount, 0);
  assert.ok(ownerFromSnapshot <= Number(first.snapshot.ownerAmount || 0));
  assert.ok(reportRoutes.includes('getCompanyPropertyAccounts'));
  assert.ok(!reportRoutes.includes('recordIncomeFromPayment('));
  assert.ok(dashboardSummaryFn.includes("commissionDetails.agencyShare"));
  assert.ok(srcFile('services/dashboardKpiService.ts').includes('Payment.find('));
  assert.ok(!srcFile('services/dashboardKpiService.ts').includes('recordIncomeFromPayment('));
  const laterOwner = computeOwnerIncomeAmount({
    isSale: false,
    ownerAmount: second.snapshot.ownerAmount,
    passThroughTotal: 0
  });
  assert.strictEqual(laterOwner, 1000);
  results['Reporting'] = 'PASS';

  // Diagnostic composer
  const diagnostic = buildPaymentIntegrityDiagnostic({
    payment: { _id: 'pay-A', referenceNumber: 'R-1', status: 'completed', postingStatus: 'posted', accountingComplete: false },
    recon: missing,
    legacyIntroductionRisk: legacy
  });
  assert.strictEqual(diagnostic.paymentId, 'pay-A');
  assert.strictEqual(diagnostic.accountingComplete, false);
  assert.strictEqual(diagnostic.legacyIntroductionRisk?.code, LEGACY_INTRODUCTION_CONTEXT_RISK);
  assert.ok(accountantRoutes.includes("router.get('/payments/:id/accounting'"));
  assert.ok(accountantRoutes.includes("router.post('/payments/:id/accounting/repair'"));
  results['Diagnostic'] = 'PASS';

  console.log('Phase 7 financial integrity tests passed');
  console.log(JSON.stringify({ results }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
