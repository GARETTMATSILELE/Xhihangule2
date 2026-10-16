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
/**
 * Expense journal idempotency. Disposable local MongoDB only.
 * Not a Cosmos DB result.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const AccountingException_1 = require("../models/AccountingException");
const accountingIntegrationService_1 = __importDefault(require("../services/accountingIntegrationService"));
const operationalFailure_1 = require("../services/operationalFailure");
const database_1 = require("../config/database");
const DB = process.env.EXPENSE_SYNC_DB || 'mongodb://127.0.0.1:27017/mantis_expense_sync_test';
const ACCOUNTING_DB = process.env.EXPENSE_SYNC_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_expense_sync_accounting';
const failures = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function debit(companyId, sourceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const journal = yield JournalEntry_1.JournalEntry.findOne({ companyId, sourceModule: 'expense', sourceId }).lean();
        if (!journal)
            return { journal: null, debit: 0 };
        const lines = yield JournalLine_1.JournalLine.find({ journalEntryId: journal._id }).select('debit credit').lean();
        return {
            journal,
            debit: lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
        };
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        process.env.MANTIS_TEST_SEAM = '1';
        process.env.NODE_ENV = 'development';
        try {
            yield mongoose_1.default.connect(DB, { serverSelectionTimeoutMS: 4000 });
        }
        catch (error) {
            console.log(`INTEGRATION SKIPPED: local MongoDB unavailable (${(error === null || error === void 0 ? void 0 : error.message) || error}). Not a Cosmos DB result.`);
            process.exit(0);
        }
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield JournalEntry_1.JournalEntry.syncIndexes();
        yield JournalLine_1.JournalLine.syncIndexes();
        const user = yield User_1.User.create({
            email: 'expense-sync@example.test', password: 'test-pass-1', firstName: 'Expense', lastName: 'Sync',
            role: 'admin', roles: ['admin'], isActive: true, sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Expense Co', address: '1 Expense Street', phone: '0770000101', email: 'expense-co@example.test',
            registrationNumber: 'EXP-1', tinNumber: 'EXP-TIN', country: 'Zimbabwe', ownerId: user._id
        });
        const other = yield Company_1.Company.create({
            name: 'Other Expense Co', address: '2 Expense Street', phone: '0770000102', email: 'other-expense@example.test',
            registrationNumber: 'EXP-2', tinNumber: 'EXP-TIN-2', country: 'Zimbabwe', ownerId: user._id
        });
        yield accountingIntegrationService_1.default.syncExpenseCreated({
            companyId: String(company._id), sourceId: 'expense-1', reference: 'EXP-1', amount: 40, description: 'Rates'
        });
        const first = yield debit(company._id, 'expense-1');
        assert(Boolean(first.journal), 'first expense synchronisation writes a journal');
        assert(Math.abs(first.debit - 40) < 0.001, 'first expense journal debit equals the amount');
        yield accountingIntegrationService_1.default.syncExpenseCreated({
            companyId: String(company._id), sourceId: 'expense-1', reference: 'EXP-1', amount: 40, description: 'Rates'
        });
        const repeated = yield debit(company._id, 'expense-1');
        assert(String((_a = repeated.journal) === null || _a === void 0 ? void 0 : _a._id) === String((_b = first.journal) === null || _b === void 0 ? void 0 : _b._id), 'repeated sync keeps the same journal');
        assert(Math.abs(repeated.debit - 40) < 0.001, 'repeated sync does not change the amount');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ companyId: company._id, sourceId: 'expense-1' })) === 1, 'repeated sync does not add a journal');
        yield Promise.all([
            accountingIntegrationService_1.default.syncExpenseCreated({ companyId: String(company._id), sourceId: 'expense-concurrent', reference: 'EXP-CON', amount: 15, description: 'Concurrent' }),
            accountingIntegrationService_1.default.syncExpenseCreated({ companyId: String(company._id), sourceId: 'expense-concurrent', reference: 'EXP-CON', amount: 15, description: 'Concurrent' })
        ]);
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ companyId: company._id, sourceId: 'expense-concurrent' })) === 1, 'concurrent sync leaves one journal');
        yield JournalEntry_1.JournalEntry.collection.createIndex({ description: 1 }, { unique: true, name: 'test_expense_description_unique' });
        yield accountingIntegrationService_1.default.syncExpenseCreated({
            companyId: String(company._id), sourceId: 'expense-desc-a', reference: 'EXP-DESC-A', amount: 8, description: 'shared-description'
        });
        let unrelatedThrew = false;
        try {
            yield accountingIntegrationService_1.default.syncExpenseCreated({
                companyId: String(company._id), sourceId: 'expense-desc-b', reference: 'EXP-DESC-B', amount: 9, description: 'shared-description'
            });
        }
        catch (error) {
            unrelatedThrew = error instanceof operationalFailure_1.ExpenseSyncError;
        }
        assert(unrelatedThrew, 'an unrelated duplicate-key conflict is propagated');
        const kept = yield debit(company._id, 'expense-desc-a');
        assert(Math.abs(kept.debit - 8) < 0.001, 'the unrelated conflict does not change the first expense');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: 'expense-desc-b' })) === 0, 'the unrelated conflict does not write the second expense');
        yield JournalEntry_1.JournalEntry.collection.dropIndex('test_expense_description_unique');
        let afterWriteThrew = false;
        try {
            yield accountingIntegrationService_1.default.syncExpenseCreated({
                companyId: String(company._id), sourceId: 'expense-after', reference: 'EXP-AFTER', amount: 21, description: 'PHASE_FAIL_EXPENSE_AFTER'
            });
        }
        catch (error) {
            afterWriteThrew = error instanceof operationalFailure_1.ExpenseSyncError;
        }
        assert(afterWriteThrew, 'a failure after the journal write is propagated');
        const afterFirst = yield debit(company._id, 'expense-after');
        assert(Math.abs(afterFirst.debit - 21) < 0.001, 'the journal remains after the later failure');
        yield accountingIntegrationService_1.default.syncExpenseCreated({
            companyId: String(company._id), sourceId: 'expense-after', reference: 'EXP-AFTER', amount: 21, description: 'PHASE_FAIL_EXPENSE_AFTER'
        });
        const afterRetry = yield debit(company._id, 'expense-after');
        assert(String((_c = afterRetry.journal) === null || _c === void 0 ? void 0 : _c._id) === String((_d = afterFirst.journal) === null || _d === void 0 ? void 0 : _d._id), 'retry after a later failure keeps the journal');
        assert(Math.abs(afterRetry.debit - 21) < 0.001, 'retry after a later failure does not change the amount');
        let partialThrew = false;
        try {
            yield accountingIntegrationService_1.default.syncExpenseCreated({
                companyId: String(company._id), sourceId: 'expense-partial', reference: 'EXP-PARTIAL', amount: 12, description: 'PHASE_FAIL_EXPENSE_POST'
            });
        }
        catch (error) {
            partialThrew = error instanceof operationalFailure_1.ExpenseSyncError;
        }
        assert(partialThrew, 'a failure before the journal write is propagated');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: 'expense-partial' })) === 0, 'a pre-write failure leaves no journal');
        yield accountingIntegrationService_1.default.syncExpenseCreated({
            companyId: String(company._id), sourceId: 'expense-partial', reference: 'EXP-PARTIAL', amount: 12, description: 'PHASE_FAIL_EXPENSE_POST'
        });
        const partial = yield debit(company._id, 'expense-partial');
        assert(Math.abs(partial.debit - 12) < 0.001, 'retry after a pre-write failure writes the journal once');
        let missingThrew = false;
        try {
            yield accountingIntegrationService_1.default.syncExpenseCreated({ companyId: String(company._id), sourceId: '', reference: 'EXP-MISSING', amount: 5 });
        }
        catch (error) {
            missingThrew = error instanceof operationalFailure_1.ExpenseSyncError && error.failureClass === 'permanent';
        }
        assert(missingThrew, 'a missing source id is a permanent error');
        yield accountingIntegrationService_1.default.syncExpenseCreated({
            companyId: String(company._id), sourceId: 'expense-ref-owner', reference: 'EXP-SHARED-REF', amount: 6, description: 'owner'
        });
        let conflictThrew = false;
        try {
            yield accountingIntegrationService_1.default.syncExpenseCreated({
                companyId: String(company._id), sourceId: 'expense-ref-other', reference: 'EXP-SHARED-REF', amount: 60, description: 'other source'
            });
        }
        catch (error) {
            conflictThrew = error instanceof operationalFailure_1.ExpenseSyncError;
        }
        assert(conflictThrew, 'a reference owned by another source is not treated as this expense');
        const ownerDebit = yield debit(company._id, 'expense-ref-owner');
        assert(Math.abs(ownerDebit.debit - 6) < 0.001, 'the conflicting source does not overwrite the existing amount');
        yield accountingIntegrationService_1.default.syncExpenseCreated({
            companyId: String(other._id), sourceId: 'expense-1', reference: 'EXP-OTHER-1', amount: 70, description: 'other company'
        });
        const otherDebit = yield debit(other._id, 'expense-1');
        const originalStill = yield debit(company._id, 'expense-1');
        assert(Math.abs(otherDebit.debit - 70) < 0.001, 'the other company receives its own journal');
        assert(Math.abs(originalStill.debit - 40) < 0.001, 'company isolation keeps the first company amount');
        let duplicateReviews = 0;
        try {
            yield accountingIntegrationService_1.default.syncExpenseCreated({
                companyId: String(company._id), sourceId: 'expense-review', reference: 'EXP-REVIEW', amount: 4, description: 'PHASE_FAIL_EXPENSE_POST'
            });
        }
        catch ( /* expected */_e) { /* expected */ }
        try {
            yield accountingIntegrationService_1.default.syncExpenseCreated({
                companyId: String(company._id), sourceId: 'expense-review', reference: 'EXP-REVIEW', amount: 4, description: 'PHASE_FAIL_EXPENSE_POST review again'
            });
        }
        catch ( /* seam already fired, this call should succeed */_f) { /* seam already fired, this call should succeed */ }
        duplicateReviews = yield AccountingException_1.AccountingException.countDocuments({ companyId: company._id, component: 'EXPENSE_SYNC_FAILED', 'accountingRef.transactionId': 'expense-review' });
        assert(duplicateReviews === 1, `one expense exception is stored, got ${duplicateReviews}`);
        if (failures.length) {
            console.error(failures.join('\n'));
            process.exit(1);
        }
        console.log('PASS expense synchronisation tests on local MongoDB. Cosmos DB was not used.');
        yield mongoose_1.default.disconnect();
        yield database_1.accountingConnection.close();
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
