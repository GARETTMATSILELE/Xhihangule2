import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { applyLevyPassThroughToSnapshot, calculatePropertyCommission } from '../services/propertyCommissionCalculator';
import { commissionVatFlagsFromPolicy } from '../services/vatPolicyService';
import { evaluateVatApplicability, isCompanyVatRegisteredOnDate } from '../services/tax/vatApplicability';
import { selectRateEffectiveOn } from '../services/taxRateService';

const VAT_RATE = 0.155;

const nearlyEqual = (actual: number, expected: number, digits = 2) => {
  const factor = 10 ** digits;
  assert.strictEqual(Math.round(actual * factor) / factor, Math.round(expected * factor) / factor);
};

const run = () => {
  const levyExclusive = calculatePropertyCommission({
    grossRent: 1100,
    levy: 100,
    commissionPercentage: 10,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: VAT_RATE
  });
  nearlyEqual(levyExclusive.commissionBase, 1000);
  nearlyEqual(levyExclusive.commissionGross, 100);
  nearlyEqual(levyExclusive.vatAmount, 15.5);
  nearlyEqual(levyExclusive.ownerPayable, 884.5);

  const noLevyExclusive = calculatePropertyCommission({
    grossRent: 1100,
    levy: 0,
    commissionPercentage: 10,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: VAT_RATE
  });
  nearlyEqual(noLevyExclusive.commissionGross, 110);
  nearlyEqual(noLevyExclusive.vatAmount, 17.05);
  nearlyEqual(noLevyExclusive.ownerPayable, 972.95);

  const levyOff = calculatePropertyCommission({
    grossRent: 1100,
    levy: 100,
    commissionPercentage: 10,
    vatOnCommission: false,
    vatRate: VAT_RATE
  });
  nearlyEqual(levyOff.commissionBase, 1000);
  nearlyEqual(levyOff.commissionGross, 100);
  nearlyEqual(levyOff.vatAmount, 0);
  nearlyEqual(levyOff.ownerPayable, 900);

  const noLevyOff = calculatePropertyCommission({
    grossRent: 1100,
    levy: 0,
    commissionPercentage: 10,
    vatOnCommission: false,
    vatRate: VAT_RATE
  });
  nearlyEqual(noLevyOff.commissionGross, 110);
  nearlyEqual(noLevyOff.vatAmount, 0);
  nearlyEqual(noLevyOff.ownerPayable, 990);

  const inclusive = calculatePropertyCommission({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: 10,
    vatOnCommission: true,
    vatTreatment: 'inclusive',
    vatRate: VAT_RATE
  });
  nearlyEqual(inclusive.commissionGross, 100);
  nearlyEqual(inclusive.commissionNet, 86.58);
  nearlyEqual(inclusive.vatAmount, 13.42);
  nearlyEqual(inclusive.ownerPayable, 900);

  const january = calculatePropertyCommission({
    grossRent: 1100,
    levy: 100,
    commissionPercentage: 10,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: 0.155
  });
  const afterRateChange = calculatePropertyCommission({
    grossRent: 1100,
    levy: 100,
    commissionPercentage: 10,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: 0.16
  });
  nearlyEqual(january.vatRate || 0, 0.155);
  nearlyEqual(january.vatAmount, 15.5);
  nearlyEqual(afterRateChange.vatRate || 0, 0.16);
  nearlyEqual(afterRateChange.vatAmount, 16);
  assert.notStrictEqual(january.vatAmount, afterRateChange.vatAmount);

  const legacyProperty = calculatePropertyCommission({
    grossRent: 1100,
    levy: 100,
    commissionPercentage: 10
  });
  nearlyEqual(legacyProperty.vatAmount, 0);
  nearlyEqual(legacyProperty.ownerPayable, 900);
  assert.strictEqual(legacyProperty.vatOnCommission, false);

  const paymentDate = new Date('2026-10-13T00:00:00.000Z');
  const datedRates = [
    { rate: 15, effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: new Date('2026-09-13T00:00:00.000Z') },
    { rate: 15.5, effectiveFrom: new Date('2026-09-14T00:00:00.000Z'), effectiveTo: new Date('2026-10-31T00:00:00.000Z') },
    { rate: 16, effectiveFrom: new Date('2026-11-01T00:00:00.000Z'), effectiveTo: null }
  ];
  const octoberRate = selectRateEffectiveOn(datedRates, paymentDate);
  const novemberPaymentRate = selectRateEffectiveOn(datedRates, new Date('2026-11-01T00:00:00.000Z'));
  assert.strictEqual(octoberRate?.rate, 15.5);
  assert.strictEqual(novemberPaymentRate?.rate, 16);
  assert.strictEqual(selectRateEffectiveOn(datedRates, new Date('2025-12-31T00:00:00.000Z')), undefined);

  const registeredOnPaymentDate = {
    vatRegistered: true,
    vatRegistrationEffectiveDate: '2026-09-14'
  };
  const applicability = evaluateVatApplicability({
    company: registeredOnPaymentDate,
    transactionDate: paymentDate,
    supplyTreatment: 'STANDARD_TAXABLE',
    useClass: 'AGENCY_COMMISSION',
    requested: true
  });
  assert.strictEqual(applicability.vatApplies, true);
  const eligibleFlags = commissionVatFlagsFromPolicy({
    apply: applicability.vatApplies,
    treatment: 'COMMISSION_VAT_EXCLUSIVE',
    vatRate: Number(octoberRate?.rate) / 100
  });

  const chargeVat = (label: 'current-month' | 'advance-month') => {
    assert.ok(label === 'current-month' || label === 'advance-month');
    return calculatePropertyCommission({
      grossRent: 1800,
      levy: 0,
      commissionPercentage: 15,
      vatOnCommission: eligibleFlags.vatOnCommission,
      vatTreatment: eligibleFlags.vatTreatment,
      vatRate: eligibleFlags.vatRate
    });
  };
  const currentMonth = chargeVat('current-month');
  const advanceMonth = chargeVat('advance-month');
  for (const result of [currentMonth, advanceMonth]) {
    nearlyEqual(result.commissionGross, 270);
    nearlyEqual(result.vatAmount, 41.85);
    nearlyEqual(result.ownerPayable, 1488.15);
    const persisted = applyLevyPassThroughToSnapshot(result, 1800, 100);
    nearlyEqual(persisted.vatOnCommission, 41.85);
    nearlyEqual(persisted.vatAmount, 41.85);
    nearlyEqual(persisted.totalCommission, 270);
    nearlyEqual(persisted.levy, 100);
    nearlyEqual(persisted.ownerAmount, 1588.15);
    const repeated = applyLevyPassThroughToSnapshot(result, 1800, 100);
    assert.deepStrictEqual(repeated, persisted);
  }
  assert.strictEqual(currentMonth.vatAmount, advanceMonth.vatAmount);

  const notRegistered = evaluateVatApplicability({
    company: { vatRegistered: false },
    transactionDate: paymentDate,
    supplyTreatment: 'STANDARD_TAXABLE',
    useClass: 'AGENCY_COMMISSION',
    requested: true
  });
  assert.strictEqual(notRegistered.vatApplies, false);
  assert.strictEqual(notRegistered.reviewRequired, true);
  assert.strictEqual(notRegistered.reviewReason, 'VAT_CHARGED_WHILE_COMPANY_NOT_REGISTERED');
  const withheld = commissionVatFlagsFromPolicy({
    apply: notRegistered.vatApplies,
    treatment: 'NONE',
    vatRate: 0
  });
  assert.strictEqual(withheld.vatOnCommission, false);
  const withheldCurrent = calculatePropertyCommission({
    grossRent: 1800,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: withheld.vatOnCommission,
    vatRate: withheld.vatRate
  });
  const withheldAdvance = calculatePropertyCommission({
    grossRent: 1800,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: withheld.vatOnCommission,
    vatRate: withheld.vatRate
  });
  nearlyEqual(withheldCurrent.vatAmount, 0);
  nearlyEqual(withheldAdvance.vatAmount, 0);
  nearlyEqual(withheldCurrent.commissionGross, 270);
  nearlyEqual(withheldCurrent.ownerPayable, 1530);

  const disabled = evaluateVatApplicability({
    company: registeredOnPaymentDate,
    transactionDate: paymentDate,
    supplyTreatment: 'STANDARD_TAXABLE',
    useClass: 'AGENCY_COMMISSION',
    requested: false
  });
  assert.strictEqual(disabled.vatApplies, false);
  assert.strictEqual(disabled.reviewRequired, false);
  const disabledFlags = commissionVatFlagsFromPolicy({ apply: false, treatment: 'NONE', vatRate: 0.155 });
  const disabledResult = calculatePropertyCommission({
    grossRent: 1800,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: disabledFlags.vatOnCommission,
    vatRate: disabledFlags.vatRate
  });
  nearlyEqual(disabledResult.vatAmount, 0);
  nearlyEqual(disabledResult.ownerPayable, 1530);

  const inclusiveFlags = commissionVatFlagsFromPolicy({
    apply: true,
    treatment: 'COMMISSION_VAT_INCLUSIVE',
    vatRate: 0.155
  });
  const inclusiveRent = calculatePropertyCommission({
    grossRent: 1800,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: inclusiveFlags.vatOnCommission,
    vatTreatment: inclusiveFlags.vatTreatment,
    vatRate: inclusiveFlags.vatRate
  });
  nearlyEqual(inclusiveRent.commissionGross, 270);
  nearlyEqual(inclusiveRent.vatAmount, 36.23);
  nearlyEqual(inclusiveRent.ownerPayable, 1530);
  assert.notStrictEqual(Math.round(inclusiveRent.ownerPayable * 100), 148815);

  assert.strictEqual(isCompanyVatRegisteredOnDate({
    vatRegistered: true,
    vatRegistrationEffectiveDate: '2026-11-01'
  }, paymentDate), false);
  assert.strictEqual(evaluateVatApplicability({
    company: { vatRegistered: true, vatRegistrationEffectiveDate: '2026-11-01' },
    transactionDate: paymentDate,
    supplyTreatment: 'STANDARD_TAXABLE',
    requested: true
  }).vatApplies, false);
  const laterRateFlags = commissionVatFlagsFromPolicy({
    apply: true,
    treatment: 'COMMISSION_VAT_EXCLUSIVE',
    vatRate: Number(novemberPaymentRate?.rate) / 100
  });
  const laterRate = calculatePropertyCommission({
    grossRent: 1800,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: laterRateFlags.vatOnCommission,
    vatTreatment: laterRateFlags.vatTreatment,
    vatRate: laterRateFlags.vatRate
  });
  nearlyEqual(laterRate.vatAmount, 43.2);
  assert.notStrictEqual(laterRate.vatAmount, currentMonth.vatAmount);

  const serverRoot = path.resolve(__dirname, '../..');
  const repoRoot = path.resolve(serverRoot, '..');
  const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const paymentController = read('server/src/controllers/paymentController.ts');
  const agentController = read('server/src/controllers/agentController.ts');
  const webhookController = read('server/src/controllers/paymentWebhookController.ts');
  const policySource = read('server/src/services/vatPolicyService.ts');
  const calculatorSource = read('server/src/services/propertyCommissionCalculator.ts');
  const postingSource = read('server/src/services/paymentAccountingReconciliation.ts');
  const displaySource = read('client/src/pages/AccountantDashboard/PropertyAccountDetailPage.tsx');
  const historicalIds = ['6ace0324c450bcc97524003c', '6ace0e18f4e4f25bbaddd77c'];
  for (const source of [paymentController, agentController, webhookController, policySource, calculatorSource]) {
    for (const id of historicalIds) {
      assert.strictEqual(source.includes(id), false);
    }
    assert.strictEqual(source.includes('vatOnCommission: Boolean(('), false);
  }
  assert.strictEqual(policySource.includes('rentalPeriod'), false);
  assert.strictEqual(calculatorSource.includes('rentalPeriod'), false);

  const slice = (source: string, start: string, end: string) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `${start} slice`);
    return source.slice(from, to);
  };
  for (const [start, end] of [
    ['export const createPayment =', 'export const createPaymentAccountant'],
    ['export const createPaymentAccountant =', 'export const createSalesPaymentAccountant'],
    ['export const createPaymentPublic =', 'export const finalizeProvisionalPayment']
  ] as const) {
    const body = slice(paymentController, start, end);
    const idempotency = body.indexOf('idempotencyKey');
    const policy = body.indexOf('resolveCommissionVatPolicy');
    assert.ok(idempotency >= 0 && policy > idempotency, `${start} resolves VAT after the idempotency check`);
    assert.ok(body.includes('commissionVatFlagsFromPolicy'));
  }
  const finalize = slice(paymentController, 'export const finalizeProvisionalPayment', 'export const ');
  const provisionalGuard = finalize.indexOf('Payment is not provisional');
  const finalizePolicy = finalize.indexOf('resolveCommissionVatPolicy');
  assert.ok(provisionalGuard >= 0 && finalizePolicy > provisionalGuard);
  const agentUpdate = agentController.slice(agentController.indexOf('assertCompletedPaymentFinanciallyImmutable'));
  assert.ok(agentUpdate.indexOf('resolveCommissionVatPolicy') > 0);
  assert.ok(postingSource.includes('idempotencyKey: `payment:${paymentId}`'));
  assert.ok(displaySource.includes('moneyOrDash(breakdown?.vatOnCommission, format)'));
  assert.strictEqual(displaySource.includes('0.155'), false);
  assert.strictEqual(displaySource.includes('vatOnCommission *'), false);

  console.log('vat on commission tests passed');
};

run();
