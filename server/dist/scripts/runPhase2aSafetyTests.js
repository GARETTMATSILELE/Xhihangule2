"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const mongoose_1 = __importDefault(require("mongoose"));
const paymentReconciliationQuery_1 = require("../services/paymentReconciliationQuery");
const jobLeaseGuards_1 = require("../services/jobLeaseGuards");
const companyA = new mongoose_1.default.Types.ObjectId().toString();
const companyB = new mongoose_1.default.Types.ObjectId().toString();
const run = () => {
    var _a;
    const filter = (0, paymentReconciliationQuery_1.buildOwnerIncomeReconciliationPaymentFilter)({ companyId: companyA });
    assert_1.default.strictEqual(String(filter.companyId), companyA, 'company-scoped filter uses company A');
    assert_1.default.strictEqual(filter.status, 'completed');
    assert_1.default.deepStrictEqual(filter.amount, { $gte: 0 });
    assert_1.default.ok(!('paymentDate' in filter), 'global/company sync must not date-cut old failed payments');
    const other = (0, paymentReconciliationQuery_1.buildOwnerIncomeReconciliationPaymentFilter)({ companyId: companyB });
    assert_1.default.notStrictEqual(String(other.companyId), companyA, 'company B filter is isolated');
    const windowed = (0, paymentReconciliationQuery_1.buildOwnerIncomeReconciliationPaymentFilter)({
        paymentDateFrom: new Date('2026-01-01T00:00:00.000Z')
    });
    assert_1.default.ok(((_a = windowed.paymentDate) === null || _a === void 0 ? void 0 : _a.$gte) instanceof Date, '48h safety net keeps a paymentDate window');
    assert_1.default.ok(!windowed.companyId, 'ledger recon without companyId remains global');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)({ status: 'completed', amount: 100, depositAmount: 0 }), false, 'normal completed payment remains eligible');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)({ status: 'completed', amount: 0, depositAmount: 1000 }), true, 'deposit-only matches recordIncomeFromPayment early exit');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)({ status: 'completed', amount: 50, depositAmount: 50 }), false, 'equal rent and deposit is a combined payment, not deposit-only');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)({ status: 'completed', amount: 1000, depositAmount: 1000 }), false, 'combined equal rent+deposit remains eligible for owner income');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)({ status: 'completed', amount: 500, depositAmount: 1000 }), false, 'rent less than deposit remains eligible for owner income');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)({ status: 'completed', amount: 100, reversalOfPaymentId: companyA }), true, 'reversal rows are not selected for income posting');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)({ status: 'failed', amount: 100 }), true, 'non-completed payments are not selected');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)({ status: 'completed', amount: 200, depositAmount: 50 }), false, 'old completed payment with deposit portion remains eligible');
    const now = new Date('2026-08-27T12:00:00.000Z');
    assert_1.default.strictEqual((0, jobLeaseGuards_1.isLeaseAvailable)(null, now), true, 'missing lease document is acquirable');
    assert_1.default.strictEqual((0, jobLeaseGuards_1.isLeaseAvailable)({ ownerToken: '', leaseExpiresAt: now }, now), true);
    assert_1.default.strictEqual((0, jobLeaseGuards_1.isLeaseAvailable)({ ownerToken: 'worker-a', leaseExpiresAt: new Date(now.getTime() - 1000) }, now), true, 'expired lease is recoverable after crash');
    assert_1.default.strictEqual((0, jobLeaseGuards_1.isLeaseAvailable)({ ownerToken: 'worker-a', leaseExpiresAt: new Date(now.getTime() + 60000) }, now), false, 'second worker cannot acquire a valid lease');
    assert_1.default.strictEqual((0, jobLeaseGuards_1.canMutateLease)({ ownerToken: 'worker-a' }, 'worker-a'), true);
    assert_1.default.strictEqual((0, jobLeaseGuards_1.canMutateLease)({ ownerToken: 'worker-a' }, 'worker-b'), false, 'owner cannot release another worker lock');
    assert_1.default.throws(() => (0, paymentReconciliationQuery_1.buildOwnerIncomeReconciliationPaymentFilter)({ companyId: 'not-an-id' }), /Invalid companyId/);
    console.log('phase2a safety tests passed');
};
run();
