"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const paymentAccountingCompleteness_1 = require("../services/paymentAccountingCompleteness");
const paymentReconciliationQuery_1 = require("../services/paymentReconciliationQuery");
const paymentId = new mongoose_1.default.Types.ObjectId().toString();
const propertyId = new mongoose_1.default.Types.ObjectId().toString();
const unitId = new mongoose_1.default.Types.ObjectId().toString();
const developmentId = new mongoose_1.default.Types.ObjectId().toString();
const levyLine = {
    amount: 50,
    chargeType: { code: 'LEVY', category: 'PASS_THROUGH' }
};
const expenseLine = {
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
        idempotencyKey: (0, paymentAccountingCompleteness_1.ownerIncomeIdempotencyKey)(paymentId)
    };
}
function expenseTx(status = 'completed') {
    return {
        type: 'expense',
        paymentId,
        status,
        idempotencyKey: (0, paymentAccountingCompleteness_1.configuredExpenseIdempotencyKey)(paymentId)
    };
}
function levyCollection(status = 'completed') {
    return {
        type: 'collection',
        paymentId,
        status,
        idempotencyKey: (0, paymentAccountingCompleteness_1.passThroughCollectionIdempotencyKey)(paymentId, 'LEVY')
    };
}
function completeRentalAccount() {
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
function rentalDeps(overrides = {}) {
    return Object.assign({ resolveLedgerTypeForProperty: () => __awaiter(this, void 0, void 0, function* () { return ({ ledgerType: 'rental', businessType: 'management' }); }), getCompatibilityChargeLines: () => __awaiter(this, void 0, void 0, function* () { return [levyLine, expenseLine]; }), findActivePropertyAccounts: () => __awaiter(this, void 0, void 0, function* () { return [completeRentalAccount()]; }), findDevelopmentIdForUnit: () => __awaiter(this, void 0, void 0, function* () { return undefined; }) }, overrides);
}
function saleDeps(accountsByTarget) {
    return {
        resolveLedgerTypeForProperty: () => __awaiter(this, void 0, void 0, function* () { return ({ ledgerType: 'sale', businessType: 'sale' }); }),
        getCompatibilityChargeLines: () => __awaiter(this, void 0, void 0, function* () {
            throw new Error('sale completeness must not load rental charge lines');
        }),
        findActivePropertyAccounts: (targetId) => __awaiter(this, void 0, void 0, function* () { return accountsByTarget[String(targetId)] || []; }),
        findDevelopmentIdForUnit: () => __awaiter(this, void 0, void 0, function* () { return developmentId; })
    };
}
function saleIncomeAccount(targetId) {
    return {
        propertyId: targetId,
        ledgerType: 'sale',
        isArchived: false,
        isActive: true,
        transactions: [incomeTx()],
        passThroughAccounts: []
    };
}
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    // TEST 1 — fully reconciled rental skips posting
    const test1 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps());
    assert_1.default.strictEqual(test1.complete, true, 'TEST 1: fully reconciled rental is complete');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test1), true, 'TEST 1: expensive posting path skipped');
    // TEST 2 — rental income missing
    const test2 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () {
            return [
                Object.assign(Object.assign({}, completeRentalAccount()), { transactions: [expenseTx()] })
            ];
        })
    }));
    assert_1.default.strictEqual(test2.complete, false, 'TEST 2: missing income is not complete');
    assert_1.default.strictEqual(test2.reason, 'missing_income');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test2), false, 'TEST 2: existing posting path executes');
    // TEST 3 — pass-through missing
    const test3 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () {
            return [
                Object.assign(Object.assign({}, completeRentalAccount()), { passThroughAccounts: [{ type: 'LEVY', transactions: [] }] })
            ];
        })
    }));
    assert_1.default.strictEqual(test3.complete, false, 'TEST 3: missing pass-through is not complete');
    assert_1.default.strictEqual(test3.reason, 'missing_pass_through');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test3), false);
    // TEST 4 — configured expense missing
    const test4 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () {
            return [
                Object.assign(Object.assign({}, completeRentalAccount()), { transactions: [incomeTx()] })
            ];
        })
    }));
    assert_1.default.strictEqual(test4.complete, false, 'TEST 4: missing expense is not complete');
    assert_1.default.strictEqual(test4.reason, 'missing_expense');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test4), false);
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
    const test5 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(salePayment, saleDeps({
        [unitId]: [saleIncomeAccount(unitId)]
    }));
    assert_1.default.strictEqual(test5.complete, false, 'TEST 5: partial sale is not complete');
    assert_1.default.strictEqual(test5.reason, 'missing_sale_target');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test5), false);
    // TEST 6 — sale with both targets complete
    const test6 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(salePayment, saleDeps({
        [unitId]: [saleIncomeAccount(unitId)],
        [developmentId]: [saleIncomeAccount(developmentId)]
    }));
    assert_1.default.strictEqual(test6.complete, true, 'TEST 6: both sale targets complete');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test6), true, 'TEST 6: posting path skipped');
    // TEST 7 — cancelled income
    const test7 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () {
            return [
                Object.assign(Object.assign({}, completeRentalAccount()), { transactions: [incomeTx('cancelled'), expenseTx()] })
            ];
        })
    }));
    assert_1.default.strictEqual(test7.complete, false, 'TEST 7: cancelled income is not complete');
    assert_1.default.strictEqual(test7.reason, 'income_not_completed');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.accountHasCompletedIncomeForPayment)({ transactions: [incomeTx('cancelled')] }, paymentId), false, 'TEST 7: paymentId alone does not prove completed income');
    // TEST 8 — database error during completeness check
    const test8 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () {
            throw new Error('MongoTimeoutError');
        })
    }));
    assert_1.default.strictEqual(test8.complete, false, 'TEST 8: database error is not proven complete');
    assert_1.default.strictEqual(test8.reason, 'completeness_error');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test8), false, 'TEST 8: existing posting path executes');
    // TEST 9 — reversal payment eligibility unchanged
    const reversalPayment = Object.assign(Object.assign({}, rentalPayment), { reversalOfPaymentId: new mongoose_1.default.Types.ObjectId().toString() });
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)(reversalPayment), true, 'TEST 9: reversal remains an eligibility early-exit');
    const test9 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(reversalPayment, rentalDeps());
    assert_1.default.strictEqual(test9.complete, false, 'TEST 9: reversal is never treated as complete');
    assert_1.default.strictEqual(test9.reason, 'not_eligible');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test9), false);
    // TEST 10 — duplicate pass-through must return the already-loaded account
    // Current writer uses atomic pushPassThroughTransactionAtomic → pushed === 'duplicate'.
    // Older contract used `if (!inserted)`. Both must return `account` without getPropertyAccount.
    const srcTs = path_1.default.join(__dirname, '..', '..', 'src', 'services', 'propertyAccountService.ts');
    const distJs = path_1.default.join(__dirname, '..', 'services', 'propertyAccountService.js');
    const serviceSrc = fs_1.default.readFileSync(fs_1.default.existsSync(srcTs) ? srcTs : distJs, 'utf8');
    const collectionStart = serviceSrc.indexOf('async recordPassThroughCollection');
    const collectionEnd = serviceSrc.indexOf('async recordPassThroughPayment');
    assert_1.default.ok(collectionStart >= 0 && collectionEnd > collectionStart, 'TEST 10: collection method located');
    const collectionFn = serviceSrc.slice(collectionStart, collectionEnd);
    const duplicateBranch = collectionFn.match(/if\s*\(\s*pushed\s*===\s*['"]duplicate['"]\s*\)\s*\{[\s\S]*?return account;[\s\S]*?\}/) ||
        collectionFn.match(/if\s*\(\s*!inserted\s*\)\s*\{[\s\S]*?return account;[\s\S]*?\}/);
    assert_1.default.ok(duplicateBranch, 'TEST 10: duplicate collection returns the already-loaded account');
    assert_1.default.ok(!/this\.getPropertyAccount\s*\(/.test(duplicateBranch[0]), 'TEST 10: duplicate collection must not call getPropertyAccount');
    // TEST 11 — existing accounting calculations unchanged when completeness = false
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({ isSale: false, ownerAmount: 900, passThroughTotal: 50 }), 850, 'TEST 11: rental owner income subtracts pass-through');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({ isSale: true, ownerAmount: 40000, passThroughTotal: 50 }), 40000, 'TEST 11: sale owner income ignores rental pass-through total');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({ isSale: false, ownerAmount: 40, passThroughTotal: 50 }), 0, 'TEST 11: rental income cannot go negative');
    const test11 = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () { return []; })
    }));
    assert_1.default.strictEqual(test11.complete, false);
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(test11), false, 'TEST 11: incomplete payments enter the existing posting path');
    // TEST 12 — idempotency keys unchanged
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.ownerIncomeIdempotencyKey)(paymentId), `payment:${paymentId}`);
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.passThroughCollectionIdempotencyKey)(paymentId, 'LEVY'), `payment:${paymentId}:pass-through:LEVY`);
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.configuredExpenseIdempotencyKey)(paymentId), `payment:${paymentId}:configured-expense`);
    assert_1.default.deepStrictEqual((0, paymentAccountingCompleteness_1.groupRequiredPassThroughCodes)([levyLine, Object.assign(Object.assign({}, levyLine), { amount: 10 })]), ['LEVY']);
    // Extra negatives: unknown charge type, unexpected ledger, malformed target, unit lookup timeout
    const unknownCharge = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        getCompatibilityChargeLines: () => __awaiter(void 0, void 0, void 0, function* () { return [{ amount: 50, chargeType: { code: '', category: 'PASS_THROUGH' } }]; })
    }));
    assert_1.default.strictEqual(unknownCharge.complete, false, 'unknown charge type must not skip');
    assert_1.default.strictEqual(unknownCharge.reason, 'unknown_charge_type');
    const unexpectedLedger = (0, paymentAccountingCompleteness_1.evaluateTargetAccountingCompleteness)({
        account: { transactions: undefined, passThroughAccounts: [] },
        paymentId,
        incomeRequired: true,
        requiredPassThroughCodes: [],
        expenseRequired: false
    });
    assert_1.default.strictEqual(unexpectedLedger.complete, false, 'unexpected ledger structure must not skip');
    const chargeLookupThrows = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        getCompatibilityChargeLines: () => __awaiter(void 0, void 0, void 0, function* () {
            throw new Error('Charge type WATER is missing');
        })
    }));
    assert_1.default.strictEqual(chargeLookupThrows.complete, false, 'unknown/missing charge type lookup must not skip');
    assert_1.default.strictEqual(chargeLookupThrows.reason, 'completeness_error');
    const typeMismatch = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(Object.assign(Object.assign({}, rentalPayment), { paymentType: 'sale', transactionDomain: 'RENTAL' }), rentalDeps());
    assert_1.default.strictEqual(typeMismatch.complete, false, 'payment type mismatch must not skip');
    assert_1.default.strictEqual(typeMismatch.reason, 'payment_type_mismatch');
    const historicalIgnoresCurrentProperty = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        resolveLedgerTypeForProperty: () => __awaiter(void 0, void 0, void 0, function* () {
            throw new Error('current property type must not reclassify a payment');
        })
    }));
    assert_1.default.strictEqual(historicalIgnoresCurrentProperty.complete, true, 'persisted rental payment ignores current property type');
    const malformedTarget = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(Object.assign(Object.assign({}, salePayment), { developmentUnitId: 'not-an-id', developmentId: undefined }), saleDeps({}));
    assert_1.default.strictEqual(malformedTarget.complete, false, 'malformed target must not skip');
    const unitLookupTimeout = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(Object.assign(Object.assign({}, salePayment), { developmentId: undefined }), Object.assign(Object.assign({}, saleDeps({ [unitId]: [saleIncomeAccount(unitId)] })), { findDevelopmentIdForUnit: () => __awaiter(void 0, void 0, void 0, function* () {
            throw new Error('MongoTimeoutError');
        }) }));
    assert_1.default.strictEqual(unitLookupTimeout.complete, false, 'unit lookup timeout must never assume complete');
    assert_1.default.strictEqual(unitLookupTimeout.reason, 'completeness_error');
    const ambiguous = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () { return [completeRentalAccount(), completeRentalAccount()]; })
    }));
    assert_1.default.strictEqual(ambiguous.complete, false, 'ambiguous ledger must not skip');
    assert_1.default.strictEqual(ambiguous.reason, 'ambiguous_account');
    const pendingIncome = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () {
            return [
                Object.assign(Object.assign({}, completeRentalAccount()), { transactions: [incomeTx('pending'), expenseTx()] })
            ];
        })
    }));
    assert_1.default.strictEqual(pendingIncome.complete, false, 'pending income must not skip');
    const cancelledPassThrough = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () {
            return [
                Object.assign(Object.assign({}, completeRentalAccount()), { passThroughAccounts: [{ type: 'LEVY', transactions: [levyCollection('cancelled')] }] })
            ];
        })
    }));
    assert_1.default.strictEqual(cancelledPassThrough.complete, false, 'cancelled pass-through must not skip');
    const naivePaymentIdOnly = (0, paymentAccountingCompleteness_1.evaluateTargetAccountingCompleteness)({
        account: {
            transactions: [{ type: 'expense', paymentId, status: 'completed' }],
            passThroughAccounts: []
        },
        paymentId,
        incomeRequired: true,
        requiredPassThroughCodes: [],
        expenseRequired: false
    });
    assert_1.default.strictEqual(naivePaymentIdOnly.complete, false, 'any paymentId transaction is not sufficient');
    const targets = yield (0, paymentAccountingCompleteness_1.buildOwnerIncomeLedgerTargets)({
        isSale: true,
        ledgerType: 'sale',
        propertyId,
        developmentUnitId: unitId,
        developmentId,
        findDevelopmentIdForUnit: () => __awaiter(void 0, void 0, void 0, function* () { return developmentId; })
    });
    assert_1.default.deepStrictEqual(targets.map((target) => target.id), [unitId, developmentId], 'sale posting requires unit and development targets');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)({ complete: false }), false);
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(null), false);
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(undefined), false);
    // prove() throws are wrapped by check(); prove itself surfaces DB errors
    yield assert_1.default.rejects(() => (0, paymentAccountingCompleteness_1.provePaymentAccountingCompleteness)(rentalPayment, rentalDeps({
        findActivePropertyAccounts: () => __awaiter(void 0, void 0, void 0, function* () {
            throw new Error('MongoTimeoutError');
        })
    })), /MongoTimeoutError/);
    console.log('phase2b completeness tests passed');
});
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
