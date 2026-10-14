import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  calculatePropertyCommission,
  toPaymentCommissionSnapshot,
  applyLevyPassThroughToSnapshot
} from '../services/propertyCommissionCalculator';
import { computeCommissionFallback, roundMoney } from '../utils/money';
import {
  PAYMENT_FINANCIAL_FIELDS,
  COMPLETED_PAYMENT_IMMUTABLE_MESSAGE,
  assertCompletedPaymentFinanciallyImmutable,
  financialFieldsInQueryUpdate,
  financialFieldsPresentInPayload,
  isCompletedFinancialPayment
} from '../services/paymentFinancialImmutability';
import { buildExpectedAccountingProjection } from '../services/paymentAccountingProjection';
import { projectCommissionLanes } from '../services/commissionProjection';

const VAT_RATE = 0.155;

function srcFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function sliceFn(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `expected ${startToken} before ${endToken}`);
  return src.slice(start, end);
}

function snapshotEqualsCanonical(actual: any, expected: ReturnType<typeof toPaymentCommissionSnapshot>): void {
  assert.strictEqual(actual.totalCommission, expected.totalCommission);
  assert.strictEqual(actual.preaFee, expected.preaFee);
  assert.strictEqual(actual.agentShare, expected.agentShare);
  assert.strictEqual(actual.agencyShare, expected.agencyShare);
  assert.strictEqual(actual.vatOnCommission, expected.vatOnCommission);
  assert.strictEqual(actual.ownerAmount, expected.ownerAmount);
  assert.strictEqual(actual.commissionBase, expected.commissionBase);
  assert.strictEqual(actual.commissionGross, expected.commissionGross);
  assert.strictEqual(actual.commissionNet, expected.commissionNet);
  assert.strictEqual(actual.vatAmount, expected.vatAmount);
}

function paymentFromSnapshot(snapshot: ReturnType<typeof toPaymentCommissionSnapshot>, extras?: Record<string, unknown>) {
  return {
    _id: 'pay-phase4',
    status: 'completed',
    paymentType: 'rental',
    amount: snapshot.commissionBase,
    depositAmount: 0,
    levyAllocated: snapshot.levy || 0,
    isProvisional: false,
    isInSuspense: false,
    commissionDetails: snapshot,
    vatAmount: 0,
    ...extras
  };
}

async function run(): Promise<void> {
  const paymentCtrl = srcFile('controllers/paymentController.ts');
  const agentCtrl = srcFile('controllers/agentController.ts');
  const webhookCtrl = srcFile('controllers/paymentWebhookController.ts');
  const commissionSvc = srcFile('services/commissionService.ts');
  const orchestrator = srcFile('services/paymentAccountingOrchestrator.ts');
  const recon = srcFile('services/paymentAccountingReconciliation.ts');
  const paymentModel = srcFile('models/Payment.ts');
  const immutability = srcFile('services/paymentFinancialImmutability.ts');
  const moneySrc = srcFile('utils/money.ts');

  const leaseCreate = sliceFn(paymentCtrl, 'export const createPayment = async', 'export const createPaymentAccountant');
  const accountantCreate = sliceFn(paymentCtrl, 'export const createPaymentAccountant = async', 'export const createSalesPaymentAccountant');
  const publicCreate = sliceFn(paymentCtrl, 'export const createPaymentPublic = async', 'export const getPaymentReceiptDownload');
  const finalizeFn = sliceFn(paymentCtrl, 'export const finalizeProvisionalPayment = async', 'export const getCombinedRemaining');
  const agentCreate = sliceFn(agentCtrl, 'export const createAgentPayment = async', 'export const updateAgentPayment = async');
  const salesCreate = sliceFn(paymentCtrl, 'export const createSalesPaymentAccountant = async', 'export const updatePayment = async');
  const postFn = sliceFn(orchestrator, 'export async function postPaymentAccounting', 'export async function reversePaymentAccounting');

  // ---------------------------------------------------------------------------
  // 4A — rental commission VAT: all live rental creates use calculateForProperty
  // ---------------------------------------------------------------------------
  assert.ok(commissionSvc.includes('vatOnCommission: false'), 'CommissionService.calculate remains VAT-off (sale wrapper)');
  for (const [label, body] of [
    ['lease', leaseCreate],
    ['accountant', accountantCreate],
    ['public', publicCreate],
    ['finalize', finalizeFn],
    ['agent', agentCreate]
  ] as const) {
    assert.ok(body.includes('calculateForProperty'), `${label} rental create uses calculateForProperty`);
    assert.ok(body.includes('vatOnCommission'), `${label} passes property VAT configuration`);
    assert.ok(body.includes('ensurePaymentAccountingPosted'), `${label} still posts via orchestrator`);
  }
  assert.ok(agentCreate.includes('isAgentRentalPayment'), 'agent rental/sale calculators stay branched');
  assert.ok(agentCreate.includes('CommissionService.calculate('), 'agent sale create retains VAT-off wrapper');
  assert.ok(salesCreate.includes('CommissionService.calculate('), 'sale create keeps sale calculator');
  assert.ok(!postFn.includes('calculateForProperty'), 'posting layer must not recalculate rental commission');
  assert.ok(!postFn.includes('calculatePropertyCommission'), 'posting layer must not call the rental calculator');
  assert.ok(postFn.includes('syncCommissionForPayment'), 'posting still projects from Payment snapshot');

  const vatOff = calculatePropertyCommission({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: false
  });
  assert.strictEqual(vatOff.commissionBase, 1000);
  assert.strictEqual(vatOff.totalCommission, 150);
  assert.strictEqual(vatOff.vatAmount, 0);
  assert.strictEqual(vatOff.commissionNet, 150);
  assert.strictEqual(vatOff.preaFee, 4.5);
  assert.strictEqual(vatOff.agentShare, 87.3);
  assert.strictEqual(vatOff.agencyShare, 58.2);
  assert.strictEqual(vatOff.ownerAmount, 850);

  const vatOn = calculatePropertyCommission({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: VAT_RATE
  });
  assert.strictEqual(vatOn.commissionBase, 1000);
  assert.strictEqual(vatOn.totalCommission, 150);
  assert.strictEqual(vatOn.vatAmount, 23.25);
  assert.strictEqual(vatOn.commissionNet, 150);
  assert.strictEqual(vatOn.preaFee, 4.5);
  assert.strictEqual(vatOn.agentShare, 87.3);
  assert.strictEqual(vatOn.agencyShare, 58.2);
  assert.strictEqual(vatOn.ownerAmount, 826.75);
  assert.ok(vatOn.vatAmount > vatOff.vatAmount);
  assert.ok(vatOn.ownerAmount < vatOff.ownerAmount);

  const inclusive = calculatePropertyCommission({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: true,
    vatTreatment: 'inclusive',
    vatRate: VAT_RATE
  });
  assert.strictEqual(inclusive.commissionGross, 150);
  assert.strictEqual(inclusive.commissionNet, 129.87);
  assert.strictEqual(inclusive.vatAmount, 20.13);
  assert.strictEqual(inclusive.ownerAmount, 850);

  const withLevy = calculatePropertyCommission({
    grossRent: 1100,
    levy: 100,
    commissionPercentage: 15,
    vatOnCommission: false
  });
  assert.strictEqual(withLevy.commissionBase, 1000);
  assert.strictEqual(withLevy.totalCommission, 150);
  assert.strictEqual(withLevy.ownerPayable, 850);
  assert.strictEqual(withLevy.ownerAmount, 950);

  const levySnapshot = applyLevyPassThroughToSnapshot(
    calculatePropertyCommission({
      grossRent: 1000,
      levy: 0,
      commissionPercentage: 15,
      vatOnCommission: false
    }),
    1000,
    100
  );
  assert.strictEqual(levySnapshot.levy, 100);
  assert.strictEqual(levySnapshot.totalCommission, 150, 'levy pass-through must not change commission');
  assert.strictEqual(levySnapshot.ownerAmount, 950);

  const canonicalVatOnSnapshot = toPaymentCommissionSnapshot(vatOn);
  snapshotEqualsCanonical(canonicalVatOnSnapshot, canonicalVatOnSnapshot);

  const projectedFromSnapshot = buildExpectedAccountingProjection(paymentFromSnapshot(canonicalVatOnSnapshot, { amount: 1000, agentId: 'agent-1' }));
  assert.strictEqual(projectedFromSnapshot.amounts.ownerIncome, canonicalVatOnSnapshot.ownerAmount);
  assert.strictEqual(projectedFromSnapshot.amounts.agentCommission, canonicalVatOnSnapshot.agentShare);
  assert.strictEqual(projectedFromSnapshot.amounts.companyCommission, canonicalVatOnSnapshot.agencyShare);
  assert.strictEqual(projectedFromSnapshot.amounts.vat, canonicalVatOnSnapshot.vatOnCommission);
  const lanes = projectCommissionLanes(paymentFromSnapshot(canonicalVatOnSnapshot, { agentId: 'agent-1' }));
  assert.strictEqual(lanes[0]?.amount, canonicalVatOnSnapshot.agentShare);

  // ---------------------------------------------------------------------------
  // 4B — commission rounding: 333.33 × 15% persists as 50.00
  // ---------------------------------------------------------------------------
  const roundingCanonical = calculatePropertyCommission({
    grossRent: 333.33,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: false
  });
  const roundingFallback = computeCommissionFallback(333.33, 15);
  assert.strictEqual(roundMoney((333.33 * 15) / 100), 50);
  assert.strictEqual(roundingCanonical.totalCommission, 50);
  assert.strictEqual(roundingFallback.totalCommission, 50);
  assert.strictEqual(roundingCanonical.preaFee, roundingFallback.preaFee);
  assert.strictEqual(roundingCanonical.agentShare, roundingFallback.agentShare);
  assert.strictEqual(roundingCanonical.agencyShare, roundingFallback.agencyShare);
  assert.strictEqual(roundingCanonical.ownerAmount, roundingFallback.ownerAmount);
  assert.strictEqual(roundingCanonical.preaFee, 1.5);
  assert.strictEqual(roundingCanonical.agentShare, 29.1);
  assert.strictEqual(roundingCanonical.agencyShare, 19.4);
  assert.strictEqual(roundingCanonical.ownerAmount, 283.33);
  assert.ok(moneySrc.includes('roundMoney((commissionBase * Number(commissionPercentage || 0)) / 100)'));

  const saleFallbackVat = roundMoney(roundingFallback.totalCommission * VAT_RATE);
  const saleOwner = roundMoney(333.33 - roundingFallback.totalCommission - saleFallbackVat);
  assert.strictEqual(saleFallbackVat, 7.75);
  assert.strictEqual(saleOwner, 275.58);
  assert.ok(salesCreate.includes('computeCommissionFallback'), 'sale catch path still uses fallback');
  assert.ok(salesCreate.includes('roundMoney(commissionBase * vatRate)'), 'sale VAT overlay remains exclusive roundMoney');

  // ---------------------------------------------------------------------------
  // 4C — webhook commission snapshot + idempotency
  // ---------------------------------------------------------------------------
  assert.ok(webhookCtrl.includes('WebhookEventReceipt'));
  assert.ok(webhookCtrl.includes("existingEvent?.status === 'processed'"));
  assert.ok(webhookCtrl.includes('Duplicate webhook ignored'));
  assert.ok(webhookCtrl.includes('calculateForProperty'), 'rental webhook create uses canonical calculator');
  assert.ok(webhookCtrl.includes('classifyPropertyFinancialKind'), 'webhook classifies from Property.rentalType');
  assert.ok(webhookCtrl.includes("rentalType === 'introduction'"));
  assert.ok(webhookCtrl.includes('validateSalePaymentCompleteness'), 'sale webhook validates completeness');
  assert.ok(webhookCtrl.includes("status: 'failed'"), 'incomplete sale webhook is not marked processed');
  assert.ok(!webhookCtrl.includes('zeroWebhookCommissionDetails'), 'Phase 5 rejects incomplete sales instead of zero-commission create');
  assert.ok(webhookCtrl.includes("paymentType: 'sale'"), 'classified sale webhook still creates sale Payments when complete');
  const webhookPost = sliceFn(
    webhookCtrl,
    "if (normalizedStatus === 'completed') {",
    'await WebhookEventReceipt.updateOne'
  );
  assert.ok(webhookPost.includes('ensurePaymentAccountingPosted'));
  assert.ok(!webhookPost.includes('calculateForProperty'), 'posting after webhook must not recalculate commission');
  const webhookReceiptModel = srcFile('models/WebhookEventReceipt.ts');
  assert.ok(webhookReceiptModel.includes('{ provider: 1, eventId: 1 }'));
  assert.ok(paymentModel.includes('externalProvider: 1, externalTransactionId: 1'));

  // ---------------------------------------------------------------------------
  // 4D — completed-payment immutability on save and query-update
  // ---------------------------------------------------------------------------
  const completed = { status: 'completed' as const };
  const provisional = { status: 'completed' as const, isProvisional: true };
  for (const field of PAYMENT_FINANCIAL_FIELDS) {
    assert.throws(
      () => assertCompletedPaymentFinanciallyImmutable(completed, { [field]: 1 }),
      (err: Error) => err.message === COMPLETED_PAYMENT_IMMUTABLE_MESSAGE,
      `save-style payload must reject ${field}`
    );
    assert.throws(
      () => assertCompletedPaymentFinanciallyImmutable(completed, { $set: { [field]: 1 } }),
      (err: Error) => err.message === COMPLETED_PAYMENT_IMMUTABLE_MESSAGE,
      `query-update $set must reject ${field}`
    );
    assert.ok(
      financialFieldsInQueryUpdate({ $set: { [field]: 1 } }).includes(field),
      `$set ${field} detected`
    );
  }
  assert.ok(financialFieldsInQueryUpdate({ $set: { 'commissionDetails.agentShare': 9 } }).includes('commissionDetails'));
  assert.ok(financialFieldsInQueryUpdate({ $unset: { vatAmount: 1 } }).includes('vatAmount'));
  assert.ok(financialFieldsInQueryUpdate({ $inc: { amount: 1 } }).includes('amount'));
  assert.deepStrictEqual(financialFieldsInQueryUpdate({ $set: { notes: 'ok' } }), []);
  assert.deepStrictEqual(financialFieldsPresentInPayload({ notes: 'ok' }), []);
  assert.doesNotThrow(() => assertCompletedPaymentFinanciallyImmutable(completed, { notes: 'admin note' }));
  assert.doesNotThrow(() => assertCompletedPaymentFinanciallyImmutable(provisional, { amount: 50, vatAmount: 1 }));
  assert.strictEqual(isCompletedFinancialPayment({ status: 'completed', isProvisional: true }), false);

  assert.ok(paymentModel.includes("pre('save'"));
  assert.ok(paymentModel.includes("findOneAndUpdate"));
  assert.ok(paymentModel.includes('financialFieldsInQueryUpdate'));
  assert.ok(paymentModel.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
  assert.ok(immutability.includes("'paymentMethod'"));
  assert.ok(agentCtrl.includes('assertCompletedPaymentFinanciallyImmutable'));
  assert.ok(paymentCtrl.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
  const reverseFn = sliceFn(paymentCtrl, 'export const reversePayment = async', 'export const finalizeProvisionalPayment');
  assert.ok(reverseFn.includes('reversalPaymentId') || reverseFn.includes('reversalOfPaymentId'));

  // ---------------------------------------------------------------------------
  // 4E — payment creation idempotency
  // ---------------------------------------------------------------------------
  assert.ok(leaseCreate.includes('idempotencyKey'));
  assert.ok(accountantCreate.includes('idempotencyKey'));
  assert.ok(publicCreate.includes('idempotencyKey'));
  assert.ok(agentCreate.includes('idempotencyKey'));
  assert.ok(salesCreate.includes('salesIdempotencyKey') || salesCreate.includes('idempotencyKey'));
  assert.ok(salesCreate.includes("req.headers['idempotency-key']"));
  assert.ok(paymentModel.includes('companyId: 1, idempotencyKey: 1'));
  assert.ok(webhookCtrl.includes("existingEvent?.status === 'processed'"));

  const ensureFn = sliceFn(recon, 'export async function ensurePaymentAccountingPosted', 'export async function refreshPaymentAccountingStatus');
  assert.ok(ensureFn.includes('postPaymentAccounting'));

  console.log('Phase 4 financial integrity tests passed');
  console.log(JSON.stringify({
    vatOff: {
      commissionBase: vatOff.commissionBase,
      commission: vatOff.totalCommission,
      vat: vatOff.vatAmount,
      net: vatOff.commissionNet,
      agentShare: vatOff.agentShare,
      agencyShare: vatOff.agencyShare,
      ownerAmount: vatOff.ownerAmount
    },
    vatOnExclusive: {
      commissionBase: vatOn.commissionBase,
      commission: vatOn.totalCommission,
      vat: vatOn.vatAmount,
      net: vatOn.commissionNet,
      agentShare: vatOn.agentShare,
      agencyShare: vatOn.agencyShare,
      ownerAmount: vatOn.ownerAmount
    },
    vatInclusive: {
      commissionGross: inclusive.commissionGross,
      commissionNet: inclusive.commissionNet,
      vat: inclusive.vatAmount,
      ownerAmount: inclusive.ownerAmount
    },
    rounding333: {
      totalCommission: roundingCanonical.totalCommission,
      preaFee: roundingCanonical.preaFee,
      agentShare: roundingCanonical.agentShare,
      agencyShare: roundingCanonical.agencyShare,
      ownerAmount: roundingCanonical.ownerAmount
    }
  }));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
