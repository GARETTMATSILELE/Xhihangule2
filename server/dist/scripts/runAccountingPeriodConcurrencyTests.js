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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const mongoose_1 = __importDefault(require("mongoose"));
const AccountingPeriod_1 = require("../models/AccountingPeriod");
const roles_1 = require("../middleware/roles");
const accountingDatePolicy_1 = require("../services/accountingDatePolicy");
const accountingPeriodService_1 = require("../services/accountingPeriodService");
const journalRecoveryAssessment_1 = require("../services/journalRecoveryAssessment");
const DB = process.env.PERIOD_CONCURRENCY_DB || 'mongodb://127.0.0.1:27017/mantis_period_concurrency_test';
function rejects(fn, code) {
    return fn().then(() => assert_1.default.fail(`expected ${code}`), (error) => assert_1.default.strictEqual(error === null || error === void 0 ? void 0 : error.code, code));
}
const historical = new Date('2025-09-04T00:00:00.000Z');
const postedAt = new Date('2026-11-05T12:00:00.000Z');
const bankDate = new Date('2026-11-06T08:00:00.000Z');
const preserved = (0, accountingDatePolicy_1.resolveAccountingDates)({
    originalTransactionDate: historical,
    bankPaymentDate: bankDate,
    postedAt
});
assert_1.default.strictEqual((_a = preserved.originalTransactionDate) === null || _a === void 0 ? void 0 : _a.toISOString(), historical.toISOString());
assert_1.default.strictEqual(preserved.accountingDate.toISOString(), historical.toISOString());
assert_1.default.strictEqual((_b = preserved.bankPaymentDate) === null || _b === void 0 ? void 0 : _b.toISOString(), bankDate.toISOString());
assert_1.default.strictEqual(preserved.postedAt.toISOString(), postedAt.toISOString());
const currentSettlement = (0, accountingDatePolicy_1.resolveAccountingDates)({
    accountingDate: postedAt,
    settlementDate: postedAt,
    bankPaymentDate: bankDate,
    postedAt
});
assert_1.default.strictEqual(currentSettlement.accountingDate.toISOString(), postedAt.toISOString());
assert_1.default.notStrictEqual(currentSettlement.accountingDate.toISOString(), bankDate.toISOString());
const november = (0, accountingPeriodService_1.previewAccountingPeriod)(2026, 11);
assert_1.default.strictEqual(november.periodStart.toISOString().slice(0, 10), '2026-11-01');
assert_1.default.strictEqual(november.periodEnd.toISOString().slice(0, 10), '2026-11-30');
assert_1.default.throws(() => (0, accountingPeriodService_1.assertPeriodActivationConfirmed)(false), (error) => error.code === 'PERIOD_CONFIRMATION_REQUIRED');
let denied = false;
try {
    (0, roles_1.isAccountant)({ user: { role: 'agent', roles: ['agent'] } }, {}, () => undefined);
}
catch (error) {
    denied = (error === null || error === void 0 ? void 0 : error.statusCode) === 403;
}
assert_1.default.strictEqual(denied, true);
let allowed = false;
(0, roles_1.isAccountant)({ user: { role: 'accountant', roles: ['accountant'] } }, {}, () => {
    allowed = true;
});
assert_1.default.strictEqual(allowed, true);
const notReady = (0, journalRecoveryAssessment_1.classifyRecoveryApproval)({
    periodStatus: 'UNMANAGED',
    referenceCollision: false,
    historicalVariance: false,
    ownerMismatch: false,
    depositExpected: true,
    depositMissing: true,
    journalBalanced: true,
    reversed: false,
    journalMissing: true,
    companyMatches: true,
    projectionsValid: true
});
assert_1.default.strictEqual(notReady.readyForApproval, false);
assert_1.default.strictEqual(notReady.exceptionClass, 'DEPOSIT RECONCILIATION');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (DB.includes('property-manag') || DB.includes('cosmos') || DB.includes('mongocluster')) {
            console.error('Refusing to run period concurrency tests against an application database');
            process.exit(1);
        }
        try {
            yield mongoose_1.default.connect(DB, { serverSelectionTimeoutMS: 4000, autoIndex: false });
        }
        catch (error) {
            console.log(`INTEGRATION SKIPPED: local MongoDB unavailable (${(error === null || error === void 0 ? void 0 : error.message) || error}). Not a Cosmos DB result.`);
            process.exit(0);
        }
        yield mongoose_1.default.connection.dropDatabase();
        const companyA = new mongoose_1.default.Types.ObjectId().toString();
        const companyB = new mongoose_1.default.Types.ObjectId().toString();
        const accountant = new mongoose_1.default.Types.ObjectId().toString();
        yield rejects(() => (0, accountingPeriodService_1.activateAccountingPeriod)({ companyId: companyA, financialYear: 2026, month: 11, createdBy: accountant, confirmed: false }), 'PERIOD_CONFIRMATION_REQUIRED');
        assert_1.default.strictEqual(yield AccountingPeriod_1.AccountingPeriod.countDocuments({ companyId: companyA }), 0);
        assert_1.default.strictEqual(yield (0, accountingPeriodService_1.ensureCurrentOpenPeriod)(companyA), null);
        const [first, second] = yield Promise.all([
            (0, accountingPeriodService_1.activateAccountingPeriod)({ companyId: companyA, financialYear: 2026, month: 11, createdBy: accountant, confirmed: true }),
            (0, accountingPeriodService_1.activateAccountingPeriod)({ companyId: companyA, financialYear: 2026, month: 11, createdBy: accountant, confirmed: true })
        ]);
        const rows = yield AccountingPeriod_1.AccountingPeriod.find({ companyId: companyA, financialYear: 2026, month: 11 });
        assert_1.default.strictEqual(rows.length, 1);
        assert_1.default.strictEqual(String(first.period._id), String(second.period._id));
        assert_1.default.strictEqual(Number(first.created) + Number(second.created), 1);
        assert_1.default.strictEqual(first.alreadyExisted || second.alreadyExisted, true);
        const otherCompany = yield (0, accountingPeriodService_1.activateAccountingPeriod)({
            companyId: companyB,
            financialYear: 2026,
            month: 11,
            createdBy: accountant,
            confirmed: true
        });
        assert_1.default.notStrictEqual(String(otherCompany.period.companyId), String(first.period.companyId));
        yield (0, accountingPeriodService_1.closeAccountingPeriod)({
            companyId: companyA,
            periodId: String(first.period._id),
            actorId: accountant,
            reason: 'Month closed for the concurrency test',
            status: 'CLOSED'
        });
        yield rejects(() => (0, accountingPeriodService_1.assertPeriodAllowsPosting)({ companyId: companyA, transactionDate: new Date('2026-11-15T00:00:00.000Z'), sourceModule: 'owner_payout' }), 'PERIOD_CLOSED');
        yield rejects(() => (0, accountingPeriodService_1.assertPeriodAllowsPosting)({ companyId: companyA, transactionDate: historical, sourceModule: 'owner_payout' }), 'PERIOD_NOT_ESTABLISHED');
        const historicalPeriod = yield (0, accountingPeriodService_1.activateAccountingPeriod)({
            companyId: companyA,
            financialYear: 2025,
            month: 9,
            createdBy: accountant,
            confirmed: true
        });
        assert_1.default.strictEqual(historicalPeriod.period.status, 'OPEN');
        yield (0, accountingPeriodService_1.assertPeriodAllowsPosting)({
            companyId: companyA,
            transactionDate: historical,
            sourceModule: 'owner_payout'
        });
        yield (0, accountingPeriodService_1.closeAccountingPeriod)({
            companyId: companyA,
            periodId: String(historicalPeriod.period._id),
            actorId: accountant,
            reason: 'Historical month stays closed',
            status: 'CLOSED'
        });
        yield rejects(() => (0, accountingPeriodService_1.assertPeriodAllowsPosting)({ companyId: companyA, transactionDate: historical, sourceModule: 'trust' }), 'PERIOD_CLOSED');
        yield mongoose_1.default.disconnect();
        console.log('accounting period concurrency tests passed');
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(error);
    yield mongoose_1.default.disconnect().catch(() => undefined);
    process.exit(1);
}));
