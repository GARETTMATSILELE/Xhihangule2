import assert from 'assert';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import {
  accountHasCompletedIncomeForPayment,
  buildOwnerIncomeLedgerTargets,
  checkPaymentAccountingCompleteness,
  computeOwnerIncomeAmount,
  configuredExpenseIdempotencyKey,
  evaluateTargetAccountingCompleteness,
  groupRequiredPassThroughCodes,
  ownerIncomeIdempotencyKey,
  passThroughCollectionIdempotencyKey,
  provePaymentAccountingCompleteness,
  shouldSkipRecordIncomePosting,
  type CompletenessAccountSnapshot,
  type CompletenessChargeLine,
  type PaymentAccountingCompletenessDeps
} from '../services/paymentAccountingCompleteness';
import { isRecordIncomeEarlyExit } from '../services/paymentReconciliationQuery';

const paymentId = new mongoose.Types.ObjectId().toString();
const propertyId = new mongoose.Types.ObjectId().toString();
const unitId = new mongoose.Types.ObjectId().toString();
const developmentId = new mongoose.Types.ObjectId().toString();

const levyLine: CompletenessChargeLine = {
  amount: 50,
  chargeType: { code: 'LEVY', category: 'PASS_THROUGH' }
};
const expenseLine: CompletenessChargeLine = {
  amount: 25,
  chargeType: { code: 'MAINTENANCE', category: 'PROPERTY_EXPENSE' }
};

const rentalPayment = {
  _id: paymentId,
  propertyId,
  status: 'completed',
  amount: 1000,
  depositAmount: 0,
  paymentType: 'rental',
  commissionDetails: { ownerAmount: 900 }
};

function incomeTx(status = 'completed') {
  return {
    type: 'income',
    paymentId,
    status,
    idempotencyKey: ownerIncomeIdempotencyKey(paymentId)
  };
}

function expenseTx(status = 'completed') {
  return {
    type: 'expense',
    paymentId,
    status,
    idempotencyKey: configuredExpenseIdempotencyKey(paymentId)
  };
}

function levyCollection(status = 'completed') {
  return {
    type: 'collection',
    paymentId,
    status,
    idempotencyKey: passThroughCollectionIdempotencyKey(paymentId, 'LEVY')
  };
}

function completeRentalAccount(): CompletenessAccountSnapshot {
  return {
    propertyId,
    ledgerType: 'rental',
    isArchived: false,
    isActive: true,
    transactions: [incomeTx(), expenseTx()],
    passThroughAccounts: [
      {
        type: 'LEVY',
        transactions: [levyCollection()]
      }
    ]
  };
}

function rentalDeps(overrides: Partial<PaymentAccountingCompletenessDeps> = {}): PaymentAccountingCompletenessDeps {
  return {
    resolveLedgerTypeForProperty: async () => ({ ledgerType: 'rental', businessType: 'management' }),
    getCompatibilityChargeLines: async () => [levyLine, expenseLine],
    findActivePropertyAccounts: async () => [completeRentalAccount()],
    findDevelopmentIdForUnit: async () => undefined,
    ...overrides
  };
}

function saleDeps(accountsByTarget: Record<string, CompletenessAccountSnapshot[]>): PaymentAccountingCompletenessDeps {
  return {
    resolveLedgerTypeForProperty: async () => ({ ledgerType: 'sale', businessType: 'sale' }),
    getCompatibilityChargeLines: async () => {
      throw new Error('sale completeness must not load rental charge lines');
    },
    findActivePropertyAccounts: async (targetId) => accountsByTarget[String(targetId)] || [],
    findDevelopmentIdForUnit: async () => developmentId
  };
}

function saleIncomeAccount(targetId: string): CompletenessAccountSnapshot {
  return {
    propertyId: targetId,
    ledgerType: 'sale',
    isArchived: false,
    isActive: true,
    transactions: [incomeTx()],
    passThroughAccounts: []
  };
}

const run = async () => {
  // TEST 1 — fully reconciled rental skips posting
  const test1 = await checkPaymentAccountingCompleteness(rentalPayment, rentalDeps());
  assert.strictEqual(test1.complete, true, 'TEST 1: fully reconciled rental is complete');
  assert.strictEqual(shouldSkipRecordIncomePosting(test1), true, 'TEST 1: expensive posting path skipped');

  // TEST 2 — rental income missing
  const test2 = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => [
        {
          ...completeRentalAccount(),
          transactions: [expenseTx()]
        }
      ]
    })
  );
  assert.strictEqual(test2.complete, false, 'TEST 2: missing income is not complete');
  assert.strictEqual(test2.reason, 'missing_income');
  assert.strictEqual(shouldSkipRecordIncomePosting(test2), false, 'TEST 2: existing posting path executes');

  // TEST 3 — pass-through missing
  const test3 = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => [
        {
          ...completeRentalAccount(),
          passThroughAccounts: [{ type: 'LEVY', transactions: [] }]
        }
      ]
    })
  );
  assert.strictEqual(test3.complete, false, 'TEST 3: missing pass-through is not complete');
  assert.strictEqual(test3.reason, 'missing_pass_through');
  assert.strictEqual(shouldSkipRecordIncomePosting(test3), false);

  // TEST 4 — configured expense missing
  const test4 = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => [
        {
          ...completeRentalAccount(),
          transactions: [incomeTx()]
        }
      ]
    })
  );
  assert.strictEqual(test4.complete, false, 'TEST 4: missing expense is not complete');
  assert.strictEqual(test4.reason, 'missing_expense');
  assert.strictEqual(shouldSkipRecordIncomePosting(test4), false);

  // TEST 5 — sale with two targets, development missing
  const salePayment = {
    _id: paymentId,
    propertyId,
    status: 'completed',
    amount: 50000,
    depositAmount: 0,
    paymentType: 'sale',
    developmentUnitId: unitId,
    commissionDetails: { ownerAmount: 40000 }
  };
  const test5 = await checkPaymentAccountingCompleteness(
    salePayment,
    saleDeps({
      [unitId]: [saleIncomeAccount(unitId)]
    })
  );
  assert.strictEqual(test5.complete, false, 'TEST 5: partial sale is not complete');
  assert.strictEqual(test5.reason, 'missing_sale_target');
  assert.strictEqual(shouldSkipRecordIncomePosting(test5), false);

  // TEST 6 — sale with both targets complete
  const test6 = await checkPaymentAccountingCompleteness(
    salePayment,
    saleDeps({
      [unitId]: [saleIncomeAccount(unitId)],
      [developmentId]: [saleIncomeAccount(developmentId)]
    })
  );
  assert.strictEqual(test6.complete, true, 'TEST 6: both sale targets complete');
  assert.strictEqual(shouldSkipRecordIncomePosting(test6), true, 'TEST 6: posting path skipped');

  // TEST 7 — cancelled income
  const test7 = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => [
        {
          ...completeRentalAccount(),
          transactions: [incomeTx('cancelled'), expenseTx()]
        }
      ]
    })
  );
  assert.strictEqual(test7.complete, false, 'TEST 7: cancelled income is not complete');
  assert.strictEqual(test7.reason, 'income_not_completed');
  assert.strictEqual(
    accountHasCompletedIncomeForPayment(
      { transactions: [incomeTx('cancelled')] },
      paymentId
    ),
    false,
    'TEST 7: paymentId alone does not prove completed income'
  );

  // TEST 8 — database error during completeness check
  const test8 = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => {
        throw new Error('MongoTimeoutError');
      }
    })
  );
  assert.strictEqual(test8.complete, false, 'TEST 8: database error is not proven complete');
  assert.strictEqual(test8.reason, 'completeness_error');
  assert.strictEqual(shouldSkipRecordIncomePosting(test8), false, 'TEST 8: existing posting path executes');

  // TEST 9 — reversal payment eligibility unchanged
  const reversalPayment = {
    ...rentalPayment,
    reversalOfPaymentId: new mongoose.Types.ObjectId().toString()
  };
  assert.strictEqual(isRecordIncomeEarlyExit(reversalPayment), true, 'TEST 9: reversal remains an eligibility early-exit');
  const test9 = await checkPaymentAccountingCompleteness(reversalPayment, rentalDeps());
  assert.strictEqual(test9.complete, false, 'TEST 9: reversal is never treated as complete');
  assert.strictEqual(test9.reason, 'not_eligible');
  assert.strictEqual(shouldSkipRecordIncomePosting(test9), false);

  // TEST 10 — duplicate pass-through must return the already-loaded account
  // Current writer uses atomic pushPassThroughTransactionAtomic → pushed === 'duplicate'.
  // Older contract used `if (!inserted)`. Both must return `account` without getPropertyAccount.
  const srcTs = path.join(__dirname, '..', '..', 'src', 'services', 'propertyAccountService.ts');
  const distJs = path.join(__dirname, '..', 'services', 'propertyAccountService.js');
  const serviceSrc = fs.readFileSync(fs.existsSync(srcTs) ? srcTs : distJs, 'utf8');
  const collectionStart = serviceSrc.indexOf('async recordPassThroughCollection');
  const collectionEnd = serviceSrc.indexOf('async recordPassThroughPayment');
  assert.ok(collectionStart >= 0 && collectionEnd > collectionStart, 'TEST 10: collection method located');
  const collectionFn = serviceSrc.slice(collectionStart, collectionEnd);
  const duplicateBranch =
    collectionFn.match(/if\s*\(\s*pushed\s*===\s*['"]duplicate['"]\s*\)\s*\{[\s\S]*?return account;[\s\S]*?\}/) ||
    collectionFn.match(/if\s*\(\s*!inserted\s*\)\s*\{[\s\S]*?return account;[\s\S]*?\}/);
  assert.ok(duplicateBranch, 'TEST 10: duplicate collection returns the already-loaded account');
  assert.ok(
    !/this\.getPropertyAccount\s*\(/.test(duplicateBranch[0]),
    'TEST 10: duplicate collection must not call getPropertyAccount'
  );

  // TEST 11 — existing accounting calculations unchanged when completeness = false
  assert.strictEqual(
    computeOwnerIncomeAmount({ isSale: false, ownerAmount: 900, passThroughTotal: 50 }),
    850,
    'TEST 11: rental owner income subtracts pass-through'
  );
  assert.strictEqual(
    computeOwnerIncomeAmount({ isSale: true, ownerAmount: 40000, passThroughTotal: 50 }),
    40000,
    'TEST 11: sale owner income ignores rental pass-through total'
  );
  assert.strictEqual(
    computeOwnerIncomeAmount({ isSale: false, ownerAmount: 40, passThroughTotal: 50 }),
    0,
    'TEST 11: rental income cannot go negative'
  );
  const test11 = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => []
    })
  );
  assert.strictEqual(test11.complete, false);
  assert.strictEqual(shouldSkipRecordIncomePosting(test11), false, 'TEST 11: incomplete payments enter the existing posting path');

  // TEST 12 — idempotency keys unchanged
  assert.strictEqual(ownerIncomeIdempotencyKey(paymentId), `payment:${paymentId}`);
  assert.strictEqual(
    passThroughCollectionIdempotencyKey(paymentId, 'LEVY'),
    `payment:${paymentId}:pass-through:LEVY`
  );
  assert.strictEqual(
    configuredExpenseIdempotencyKey(paymentId),
    `payment:${paymentId}:configured-expense`
  );
  assert.deepStrictEqual(groupRequiredPassThroughCodes([levyLine, { ...levyLine, amount: 10 }]), ['LEVY']);

  // Extra negatives: unknown charge type, unexpected ledger, malformed target, unit lookup timeout
  const unknownCharge = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      getCompatibilityChargeLines: async () => [{ amount: 50, chargeType: { code: '', category: 'PASS_THROUGH' } }]
    })
  );
  assert.strictEqual(unknownCharge.complete, false, 'unknown charge type must not skip');
  assert.strictEqual(unknownCharge.reason, 'unknown_charge_type');

  const unexpectedLedger = evaluateTargetAccountingCompleteness({
    account: { transactions: undefined as any, passThroughAccounts: [] },
    paymentId,
    incomeRequired: true,
    requiredPassThroughCodes: [],
    expenseRequired: false
  });
  assert.strictEqual(unexpectedLedger.complete, false, 'unexpected ledger structure must not skip');

  const chargeLookupThrows = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      getCompatibilityChargeLines: async () => {
        throw new Error('Charge type WATER is missing');
      }
    })
  );
  assert.strictEqual(chargeLookupThrows.complete, false, 'unknown/missing charge type lookup must not skip');
  assert.strictEqual(chargeLookupThrows.reason, 'completeness_error');

  const typeMismatch = await checkPaymentAccountingCompleteness(
    { ...rentalPayment, paymentType: 'sale', transactionDomain: 'RENTAL' },
    rentalDeps()
  );
  assert.strictEqual(typeMismatch.complete, false, 'payment type mismatch must not skip');
  assert.strictEqual(typeMismatch.reason, 'payment_type_mismatch');

  const historicalIgnoresCurrentProperty = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      resolveLedgerTypeForProperty: async () => {
        throw new Error('current property type must not reclassify a payment');
      }
    })
  );
  assert.strictEqual(historicalIgnoresCurrentProperty.complete, true, 'persisted rental payment ignores current property type');

  const malformedTarget = await checkPaymentAccountingCompleteness(
    { ...salePayment, developmentUnitId: 'not-an-id', developmentId: undefined },
    saleDeps({})
  );
  assert.strictEqual(malformedTarget.complete, false, 'malformed target must not skip');

  const unitLookupTimeout = await checkPaymentAccountingCompleteness(
    { ...salePayment, developmentId: undefined },
    {
      ...saleDeps({ [unitId]: [saleIncomeAccount(unitId)] }),
      findDevelopmentIdForUnit: async () => {
        throw new Error('MongoTimeoutError');
      }
    }
  );
  assert.strictEqual(unitLookupTimeout.complete, false, 'unit lookup timeout must never assume complete');
  assert.strictEqual(unitLookupTimeout.reason, 'completeness_error');

  const ambiguous = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => [completeRentalAccount(), completeRentalAccount()]
    })
  );
  assert.strictEqual(ambiguous.complete, false, 'ambiguous ledger must not skip');
  assert.strictEqual(ambiguous.reason, 'ambiguous_account');

  const pendingIncome = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => [
        {
          ...completeRentalAccount(),
          transactions: [incomeTx('pending'), expenseTx()]
        }
      ]
    })
  );
  assert.strictEqual(pendingIncome.complete, false, 'pending income must not skip');

  const cancelledPassThrough = await checkPaymentAccountingCompleteness(
    rentalPayment,
    rentalDeps({
      findActivePropertyAccounts: async () => [
        {
          ...completeRentalAccount(),
          passThroughAccounts: [{ type: 'LEVY', transactions: [levyCollection('cancelled')] }]
        }
      ]
    })
  );
  assert.strictEqual(cancelledPassThrough.complete, false, 'cancelled pass-through must not skip');

  const naivePaymentIdOnly = evaluateTargetAccountingCompleteness({
    account: {
      transactions: [{ type: 'expense', paymentId, status: 'completed' }],
      passThroughAccounts: []
    },
    paymentId,
    incomeRequired: true,
    requiredPassThroughCodes: [],
    expenseRequired: false
  });
  assert.strictEqual(naivePaymentIdOnly.complete, false, 'any paymentId transaction is not sufficient');

  const targets = await buildOwnerIncomeLedgerTargets({
    isSale: true,
    ledgerType: 'sale',
    propertyId,
    developmentUnitId: unitId,
    developmentId,
    findDevelopmentIdForUnit: async () => developmentId
  });
  assert.deepStrictEqual(
    targets.map((target) => target.id),
    [unitId, developmentId],
    'sale posting requires unit and development targets'
  );

  assert.strictEqual(shouldSkipRecordIncomePosting({ complete: false }), false);
  assert.strictEqual(shouldSkipRecordIncomePosting(null), false);
  assert.strictEqual(shouldSkipRecordIncomePosting(undefined), false);

  // prove() throws are wrapped by check(); prove itself surfaces DB errors
  await assert.rejects(
    () =>
      provePaymentAccountingCompleteness(
        rentalPayment,
        rentalDeps({
          findActivePropertyAccounts: async () => {
            throw new Error('MongoTimeoutError');
          }
        })
      ),
    /MongoTimeoutError/
  );

  console.log('phase2b completeness tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
