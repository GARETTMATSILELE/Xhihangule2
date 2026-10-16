"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
 * Code-side integrity gaps on disposable local databases.
 * Does not use property-management, the application accounting database, or Cosmos DB.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Payment_1 = require("../models/Payment");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const CompanyAccount_1 = require("../models/CompanyAccount");
const JournalEntry_1 = require("../models/JournalEntry");
const AccountingException_1 = require("../models/AccountingException");
const LedgerEvent_1 = __importDefault(require("../models/LedgerEvent"));
const AuditLog_1 = require("../models/AuditLog");
const propertyAccountService_1 = __importStar(require("../services/propertyAccountService"));
const CompanyExpenseClaim_1 = require("../models/CompanyExpenseClaim");
const companyAccountExpenseService_1 = require("../services/companyAccountExpenseService");
const financialPostingGapService_1 = require("../services/financialPostingGapService");
const paymentAccountingOrchestrator_1 = require("../services/paymentAccountingOrchestrator");
const ledgerEventService_1 = __importDefault(require("../services/ledgerEventService"));
const roles_1 = require("../middleware/roles");
const auth_1 = require("../middleware/auth");
const paymentAccountingIntegrityController_1 = require("../controllers/paymentAccountingIntegrityController");
const paymentAccountingIntegrity_1 = require("../services/paymentAccountingIntegrity");
const financialOperationVisibility_1 = require("../services/financialOperationVisibility");
const database_1 = require("../config/database");
const DB = process.env.INTEGRITY_GAP_DB || 'mongodb://127.0.0.1:27017/mantis_integrity_gap_test';
const ACCOUNTING_DB = process.env.INTEGRITY_GAP_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_integrity_gap_accounting';
const failures = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function forcedConflict(value) {
    global.__propertyAccountConflict = value;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (DB.includes('property-management') || /\/accounting(\?|$)/.test(ACCOUNTING_DB)) {
            console.error('Refusing to run against an application database');
            process.exit(1);
        }
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
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB, { autoIndex: false, serverSelectionTimeoutMS: 4000 });
        yield database_1.accountingConnection.dropDatabase();
        yield JournalEntry_1.JournalEntry.syncIndexes();
        yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1 }, { unique: true, partialFilterExpression: { isArchived: false }, name: 'test_active_property_ledger' });
        const user = yield User_1.User.create({
            email: 'integrity-gap@example.test', password: 'test-pass-1', firstName: 'Integrity', lastName: 'Gap',
            role: 'accountant', roles: ['accountant'], isActive: true, sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Integrity Co', address: '1 Integrity Street', phone: '0770000401', email: 'integrity@example.test',
            registrationNumber: 'GAP-1', tinNumber: 'GAP-TIN', country: 'Zimbabwe', ownerId: user._id
        });
        const otherCompany = yield Company_1.Company.create({
            name: 'Other Integrity Co', address: '2 Integrity Street', phone: '0770000402', email: 'other-integrity@example.test',
            registrationNumber: 'GAP-2', tinNumber: 'GAP-TIN-2', country: 'Zimbabwe', ownerId: user._id
        });
        function makeProperty(ownerCompany, name) {
            return __awaiter(this, void 0, void 0, function* () {
                return Property_1.Property.create({
                    companyId: ownerCompany._id, ownerId: user._id, name, address: `${name} Road`,
                    rentalType: 'management', rent: 1000, commission: 10
                });
            });
        }
        const firstProperty = yield makeProperty(company, 'First House');
        const created = yield propertyAccountService_1.default.getOrCreatePropertyAccount(String(firstProperty._id), 'rental');
        assert(Boolean(created === null || created === void 0 ? void 0 : created._id), 'first property account is created');
        const repeated = yield propertyAccountService_1.default.getOrCreatePropertyAccount(String(firstProperty._id), 'rental');
        assert(String(repeated._id) === String(created._id), 'repeated creation returns the same property account');
        assert((yield PropertyAccount_1.default.countDocuments({ propertyId: firstProperty._id, ledgerType: 'rental', isArchived: false })) === 1, 'repeated creation does not add an account');
        const concurrentProperty = yield makeProperty(company, 'Concurrent House');
        const concurrentAccounts = yield Promise.all([
            propertyAccountService_1.default.getOrCreatePropertyAccount(String(concurrentProperty._id), 'rental'),
            propertyAccountService_1.default.getOrCreatePropertyAccount(String(concurrentProperty._id), 'rental')
        ]);
        assert(String(concurrentAccounts[0]._id) === String(concurrentAccounts[1]._id), 'concurrent creation returns one property account');
        assert((yield PropertyAccount_1.default.countDocuments({ propertyId: concurrentProperty._id, isArchived: false })) === 1, 'concurrent creation leaves one active account');
        const foreignProperty = yield makeProperty(otherCompany, 'Foreign House');
        const foreignAccount = yield propertyAccountService_1.default.getOrCreatePropertyAccount(String(foreignProperty._id), 'rental');
        assert(String(foreignAccount._id) !== String(created._id), 'another company property gets its own account');
        assert(String(foreignAccount.propertyId) === String(foreignProperty._id), 'the foreign account stays on its own property');
        const missingProperty = yield makeProperty(company, 'Missing Conflict');
        forcedConflict({
            propertyName: 'Missing Conflict',
            pattern: { propertyId: 1, ledgerType: 1 },
            keyValue: { propertyId: missingProperty._id, ledgerType: 'rental' }
        });
        let missingThrew = false;
        try {
            yield propertyAccountService_1.default.getOrCreatePropertyAccount(String(missingProperty._id), 'rental');
        }
        catch (_j) {
            missingThrew = true;
        }
        forcedConflict(null);
        assert(missingThrew, 'a matching duplicate key with no stored account is propagated');
        assert((yield PropertyAccount_1.default.countDocuments({ propertyId: missingProperty._id })) === 0, 'the missing conflict does not invent an account');
        const unrelatedProperty = yield makeProperty(company, 'Unrelated Conflict');
        forcedConflict({
            propertyName: 'Unrelated Conflict',
            pattern: { propertyName: 1 },
            keyValue: { propertyName: 'Unrelated Conflict' },
            insertVisibleAccount: true
        });
        let unrelatedThrew = false;
        try {
            yield propertyAccountService_1.default.getOrCreatePropertyAccount(String(unrelatedProperty._id), 'rental');
        }
        catch (_k) {
            unrelatedThrew = true;
        }
        forcedConflict(null);
        assert(unrelatedThrew, 'an unrelated duplicate key is propagated even when one account can be reloaded');
        assert(!(0, propertyAccountService_1.propertyLedgerDuplicateMatches)({ code: 11000, keyPattern: { propertyName: 1 }, keyValue: { propertyName: 'Unrelated Conflict' } }, unrelatedProperty._id, 'rental'), 'an unrelated index is not the property ledger identity');
        const crossedProperty = yield makeProperty(otherCompany, 'Crossed Conflict');
        forcedConflict({
            propertyName: 'Crossed Conflict',
            pattern: { propertyId: 1, ledgerType: 1 },
            keyValue: { propertyId: firstProperty._id, ledgerType: 'rental' },
            insertVisibleAccount: true
        });
        let crossedThrew = false;
        try {
            yield propertyAccountService_1.default.getOrCreatePropertyAccount(String(crossedProperty._id), 'rental');
        }
        catch (_l) {
            crossedThrew = true;
        }
        forcedConflict(null);
        assert(crossedThrew, 'a duplicate key for another property is not returned as this company account');
        assert(String((_a = (yield PropertyAccount_1.default.findById(created._id))) === null || _a === void 0 ? void 0 : _a.propertyId) === String(firstProperty._id), 'the original company account is unchanged');
        const expenseDate = new Date('2026-10-15T00:00:00.000Z');
        const expenseInput = {
            companyId: String(company._id),
            amount: 40,
            date: expenseDate,
            description: 'Rates',
            reference: 'BILL-40',
            paymentMethod: 'bank_transfer',
            payee: 'Municipality',
            idempotencyKey: 'company-expense:stable-key-1'
        };
        delete process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS;
        let closedGate = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(expenseInput);
        }
        catch (error) {
            closedGate = error instanceof companyAccountExpenseService_1.CompanyExpenseUniquenessUnverifiedError;
        }
        assert(closedGate, 'a keyed expense is refused while uniqueness is unverified');
        assert((yield CompanyExpenseClaim_1.CompanyExpenseClaim.countDocuments({ companyId: company._id })) === 0, 'a closed gate writes no claim');
        assert((yield CompanyAccount_1.CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions).length === 0, 'a closed gate writes no expense transaction');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ companyId: company._id, sourceModule: 'expense' })) === 0, 'a closed gate writes no expense journal');
        process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS = 'verified';
        const attestedOnly = yield (0, companyAccountExpenseService_1.inspectCompanyExpenseUniqueness)();
        assert(attestedOnly.available === false && attestedOnly.reason === 'unique_index_absent', 'an attestation without the unique index does not open the gate');
        let attestedWrite = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(expenseInput);
        }
        catch (error) {
            attestedWrite = error instanceof companyAccountExpenseService_1.CompanyExpenseUniquenessUnverifiedError;
        }
        assert(attestedWrite, 'an attestation without the unique index writes no keyed expense');
        yield CompanyExpenseClaim_1.CompanyExpenseClaim.collection.createIndex({ companyId: 1, idempotencyKey: 1 }, { unique: true, name: 'company_expense_claim_identity' });
        const ready = yield (0, companyAccountExpenseService_1.inspectCompanyExpenseUniqueness)();
        assert(ready.available === true && ready.reason === 'attestation_and_unique_index', 'the gate opens only when the attestation and the observed unique index agree');
        const firstExpense = yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(expenseInput);
        const secondExpense = yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(expenseInput);
        assert(firstExpense.reused === false && secondExpense.reused === true, 'a repeated expense key reuses the stored transaction');
        assert(String(secondExpense.transaction._id) === String(firstExpense.transaction._id), 'the repeated expense is the original transaction');
        const expenseAccounts = yield CompanyAccount_1.CompanyAccount.find({ companyId: company._id });
        const keyed = expenseAccounts.flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === expenseInput.idempotencyKey));
        assert(keyed.length === 1, 'a repeated expense key does not add a transaction');
        assert(expenseAccounts.reduce((sum, account) => sum + Number(account.totalExpenses || 0), 0) === 40, 'a repeated expense key does not change the total');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ companyId: company._id, sourceModule: 'expense', sourceId: `company-expense:${company._id}:${expenseInput.idempotencyKey}` })) === 1, 'a repeated expense key leaves one journal');
        global.__companyExpenseClaimDelayMs = 300;
        const indexedKey = 'company-expense:indexed-concurrent';
        const indexedResults = yield Promise.allSettled([
            (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: indexedKey, reference: 'BILL-IDX', description: 'Indexed concurrent', amount: 15 })),
            (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: indexedKey, reference: 'BILL-IDX', description: 'Indexed concurrent', amount: 15 }))
        ]);
        global.__companyExpenseClaimDelayMs = 0;
        const indexedTx = (yield CompanyAccount_1.CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === indexedKey));
        assert(indexedResults.some((row) => row.status === 'fulfilled'), 'with the claim unique index, one concurrent request records the expense');
        assert(indexedTx.length === 1, 'with the claim unique index, concurrent requests leave one expense');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: `company-expense:${company._id}:${indexedKey}` })) === 1, 'with the claim unique index, concurrent requests leave one journal');
        let conflicted = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { amount: 99 }));
        }
        catch (error) {
            conflicted = error instanceof companyAccountExpenseService_1.CompanyExpenseIdempotencyError;
        }
        assert(conflicted, 'the same expense key with a different amount is rejected');
        assert(expenseAccounts && (yield CompanyAccount_1.CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === expenseInput.idempotencyKey)).length === 1, 'a conflicting payload does not add a transaction');
        const failedKey = 'company-expense:failed-post';
        let postFailed = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: failedKey, reference: 'BILL-FAIL', description: 'PHASE_FAIL_EXPENSE_POST', amount: 21 }));
        }
        catch (_m) {
            postFailed = true;
        }
        assert(postFailed, 'a failed expense posting is propagated');
        const failedStored = (yield CompanyAccount_1.CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === failedKey));
        assert(failedStored.length === 1 && failedStored[0].amount === 21, 'the failed posting keeps the original expense amount');
        const retriedPost = yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: failedKey, reference: 'BILL-FAIL', description: 'PHASE_FAIL_EXPENSE_POST', amount: 21 }));
        assert(retriedPost.reused === true, 'retry after a failed posting reuses the expense');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: `company-expense:${company._id}:${failedKey}` })) === 1, 'retry after a failed posting leaves one journal');
        yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: 'company-expense:other-key', reference: 'BILL-OTHER', description: 'Other bill', amount: 8 }));
        yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { companyId: String(otherCompany._id), idempotencyKey: expenseInput.idempotencyKey, reference: 'BILL-40', description: 'Rates' }));
        assert((yield CompanyAccount_1.CompanyAccount.find({ companyId: otherCompany._id })).flatMap((account) => account.transactions).length === 1, 'the same key in another company is a separate expense');
        delete process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS;
        const afterStoredExpense = yield (0, companyAccountExpenseService_1.inspectCompanyExpenseUniqueness)();
        assert(afterStoredExpense.available === false, 'a stored expense transaction does not make the idempotency guarantee available');
        let closedAfterSuccess = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: 'company-expense:after-close', reference: 'BILL-CLOSED', description: 'Closed again', amount: 3 }));
        }
        catch (error) {
            closedAfterSuccess = error instanceof companyAccountExpenseService_1.CompanyExpenseUniquenessUnverifiedError;
        }
        assert(closedAfterSuccess, 'removing the attestation closes keyed expenses again');
        assert((yield CompanyExpenseClaim_1.CompanyExpenseClaim.countDocuments({ idempotencyKey: 'company-expense:after-close' })) === 0, 'a closed gate does not add a claim after an earlier success');
        process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS = 'verified';
        global.__failExpenseUniquenessProbe = true;
        let probeFailed = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: 'company-expense:probe-fail', reference: 'BILL-PROBE', description: 'Probe fail', amount: 4 }));
        }
        catch (error) {
            probeFailed = error instanceof companyAccountExpenseService_1.CompanyExpenseUniquenessUnverifiedError;
        }
        assert(probeFailed, 'a failed uniqueness probe refuses the keyed expense');
        assert((yield CompanyExpenseClaim_1.CompanyExpenseClaim.countDocuments({ idempotencyKey: 'company-expense:probe-fail' })) === 0, 'a failed uniqueness probe writes no claim');
        const missingKey = 'company-expense:missing-claim';
        global.__companyExpenseDuplicateKey = {
            pattern: { companyId: 1, idempotencyKey: 1 },
            value: { companyId: company._id, idempotencyKey: missingKey }
        };
        let missingClaim = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: missingKey, reference: 'BILL-MISS', description: 'Missing claim', amount: 6 }));
        }
        catch (_o) {
            missingClaim = true;
        }
        assert(missingClaim, 'a duplicate key with no stored claim is propagated');
        assert((yield CompanyExpenseClaim_1.CompanyExpenseClaim.countDocuments({ idempotencyKey: missingKey })) === 0, 'a missing claim is not invented');
        const unknownKey = 'company-expense:unknown-index';
        global.__companyExpenseDuplicateKey = { pattern: { otherField: 1 }, value: { otherField: 'x' } };
        let unknownDuplicate = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: unknownKey, reference: 'BILL-UNK', description: 'Unknown index', amount: 7 }));
        }
        catch (error) {
            unknownDuplicate = !(error instanceof companyAccountExpenseService_1.CompanyExpenseIdempotencyError) && !(error instanceof companyAccountExpenseService_1.CompanyExpenseUniquenessUnverifiedError);
        }
        assert(unknownDuplicate, 'a duplicate key without the claim identity metadata is propagated');
        assert((yield CompanyExpenseClaim_1.CompanyExpenseClaim.countDocuments({ idempotencyKey: unknownKey })) === 0, 'an unidentified duplicate key writes no claim');
        yield CompanyExpenseClaim_1.CompanyExpenseClaim.collection.dropIndex('company_expense_claim_identity');
        const ambiguousKey = 'company-expense:ambiguous-claims';
        yield CompanyExpenseClaim_1.CompanyExpenseClaim.create({ companyId: company._id, idempotencyKey: ambiguousKey, fingerprint: 'a', amount: 9, type: 'expense', status: 'claimed' });
        yield CompanyExpenseClaim_1.CompanyExpenseClaim.create({ companyId: company._id, idempotencyKey: ambiguousKey, fingerprint: 'b', amount: 9, type: 'expense', status: 'claimed' });
        let ambiguousClaims = false;
        try {
            yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)(Object.assign(Object.assign({}, expenseInput), { idempotencyKey: ambiguousKey, reference: 'BILL-AMB', description: 'Ambiguous', amount: 9 }));
        }
        catch (error) {
            ambiguousClaims = error instanceof companyAccountExpenseService_1.CompanyExpenseUniquenessUnverifiedError;
        }
        assert(ambiguousClaims, 'conflicting claims stay closed when the unique index is absent');
        assert((yield CompanyAccount_1.CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === ambiguousKey)).length === 0, 'conflicting claims do not append an expense');
        delete process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS;
        const unkeyedA = yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)({ companyId: String(company._id), amount: 5, description: 'No key', date: expenseDate });
        const unkeyedB = yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)({ companyId: String(company._id), amount: 5, description: 'No key', date: expenseDate });
        assert(String(unkeyedA.transaction._id) !== String(unkeyedB.transaction._id), 'two expenses without an idempotency key stay separate');
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Gap', lastName: 'Tenant', email: 'gap-tenant@example.test', phone: '0771111401',
            companyId: company._id, ownerId: user._id, status: 'Active'
        });
        let ownerSequence = 0;
        function ownerPayment(notes_1) {
            return __awaiter(this, arguments, void 0, function* (notes, propertyId = firstProperty._id) {
                ownerSequence += 1;
                return Payment_1.Payment.create({
                    companyId: company._id, propertyId, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
                    propertyType: 'residential', amount: 100, depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer',
                    status: 'completed', paymentDate: expenseDate, rentalPeriodMonth: ownerSequence, rentalPeriodYear: 2026,
                    transactionDomain: 'RENTAL', commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false,
                    referenceNumber: `GAP-${ownerSequence}`, notes, idempotencyKey: `gap:${new mongoose_1.default.Types.ObjectId().toString()}`,
                    commissionDetails: { ownerAmount: 0, agencyShare: 0, agentShare: 0, preaFee: 0, totalCommission: 0 }
                });
            });
        }
        const ownerProperty = yield makeProperty(company, 'Owner Income House');
        const missingOwner = yield ownerPayment('owner-missing', ownerProperty._id);
        const missingResult = yield (0, paymentAccountingOrchestrator_1.postPaymentAccounting)(String(missingOwner._id));
        assert(missingResult.artifacts.ownerIncome === 'failed', 'owner-income failure stays failed');
        assert(missingResult.status !== 'posted', 'owner-income failure does not mark accounting posted');
        assert(((_b = (yield Payment_1.Payment.findById(missingOwner._id))) === null || _b === void 0 ? void 0 : _b.accountingComplete) !== true, 'owner-income failure does not mark accounting complete');
        assert((yield AccountingException_1.AccountingException.countDocuments({ paymentId: missingOwner._id, kind: 'incomplete_projection', component: 'ownerIncome' })) === 1, 'the owner-income exception is recorded once');
        assert((yield LedgerEvent_1.default.countDocuments({ paymentId: missingOwner._id, type: 'owner_income', failureClass: 'permanent' })) === 1, 'the owner-income failure is stored on one ledger event');
        const repeatedOwner = yield (0, paymentAccountingOrchestrator_1.postPaymentAccounting)(String(missingOwner._id));
        assert(repeatedOwner.artifacts.ownerIncome === 'failed', 'a repeated owner-income failure stays failed');
        assert((yield LedgerEvent_1.default.countDocuments({ paymentId: missingOwner._id, type: 'owner_income' })) === 1, 'a repeated owner-income failure does not create another ledger event');
        assert((yield PropertyAccount_1.default.countDocuments({ 'transactions.idempotencyKey': `payment:${missingOwner._id}` })) === 0, 'a repeated owner-income failure does not create an income row');
        const hidden = yield ownerPayment('PHASE_FAIL_EXCEPTION_RECORD', ownerProperty._id);
        const hiddenResult = yield (0, paymentAccountingOrchestrator_1.postPaymentAccounting)(String(hidden._id));
        assert(hiddenResult.artifacts.ownerIncome === 'failed', 'a failed exception write keeps owner income failed');
        assert((yield AccountingException_1.AccountingException.countDocuments({ paymentId: hidden._id, kind: 'incomplete_projection' })) === 0, 'the failed exception write does not pretend the exception exists');
        assert((yield LedgerEvent_1.default.countDocuments({ paymentId: hidden._id, type: 'owner_income', status: 'failed' })) === 1, 'a failed exception write remains visible on the ledger event');
        assert(((_c = (yield Payment_1.Payment.findById(hidden._id))) === null || _c === void 0 ? void 0 : _c.accountingComplete) !== true, 'a failed exception write does not mark accounting complete');
        const invisible = yield ownerPayment('PHASE_FAIL_LEDGER_RECORD PHASE_FAIL_EXCEPTION_RECORD PHASE_FAIL_EXCEPTION_VISIBILITY', ownerProperty._id);
        const invisibleResult = yield (0, paymentAccountingOrchestrator_1.postPaymentAccounting)(String(invisible._id));
        assert(invisibleResult.status !== 'posted', 'a failed visibility write does not mark accounting posted');
        assert(invisibleResult.errors.some((error) => error.includes('not durably recorded')), 'a failed visibility write remains in the posting result');
        assert((yield AccountingException_1.AccountingException.countDocuments({ paymentId: invisible._id })) === 0, 'both exception writes can fail without a database row');
        assert((yield LedgerEvent_1.default.countDocuments({ paymentId: invisible._id })) === 0, 'a database outage leaves no ledger event either');
        const rediscovered = yield (0, financialPostingGapService_1.detectFinancialPostingGaps)(String(company._id));
        assert(rediscovered.some((row) => row.paymentId === String(invisible._id) && row.issueType === 'OWNER_INCOME_AMOUNT_MISSING'), 'a later integrity pass rediscovers the owner-income failure from the payment');
        yield (0, financialOperationVisibility_1.upsertFinancialReview)({
            companyId: String(company._id),
            component: 'LEDGER_RETRY_EXHAUSTED',
            operationId: 'review-row',
            missingRecord: 'ledger event',
            issueType: 'missing',
            actual: 'permanent',
            recommendedReview: 'Do not repair this historical row.'
        });
        const integrity = yield (0, paymentAccountingIntegrity_1.listCompanyAccountingInconsistencies)(String(company._id), { component: 'LEDGER_RETRY_EXHAUSTED' });
        const reviewRow = integrity.items.find((item) => item.operationId === 'review-row');
        assert(Boolean(reviewRow) && reviewRow.canRepair === false, 'the generic repair action stays disabled for a financial review');
        const transient = yield LedgerEvent_1.default.create({
            type: 'levy_collection', companyId: company._id, status: 'failed', failureClass: 'transient',
            attemptCount: 8, correlationId: 'corr-transient'
        });
        const permanent = yield LedgerEvent_1.default.create({
            type: 'levy_collection', companyId: company._id, status: 'failed', failureClass: 'permanent', attemptCount: 8
        });
        const conflictEvent = yield LedgerEvent_1.default.create({
            type: 'levy_collection', companyId: company._id, status: 'failed', failureClass: 'conflict', attemptCount: 8
        });
        let permanentCode = '';
        try {
            yield ledgerEventService_1.default.retryFailedEvent(String(permanent._id), String(company._id), { userId: String(user._id), requestId: 'corr-permanent' });
        }
        catch (error) {
            permanentCode = (error === null || error === void 0 ? void 0 : error.code) || '';
        }
        let conflictCode = '';
        try {
            yield ledgerEventService_1.default.retryFailedEvent(String(conflictEvent._id), String(company._id), { userId: String(user._id), requestId: 'corr-conflict' });
        }
        catch (error) {
            conflictCode = (error === null || error === void 0 ? void 0 : error.code) || '';
        }
        assert(permanentCode === 'LEDGER_EVENT_NOT_RETRYABLE', 'a permanent ledger failure cannot be retried');
        assert(conflictCode === 'LEDGER_EVENT_NOT_RETRYABLE', 'a conflict ledger failure cannot be retried');
        assert(((_d = (yield LedgerEvent_1.default.findById(permanent._id))) === null || _d === void 0 ? void 0 : _d.attemptCount) === 8, 'a refused permanent retry does not change the event');
        assert((yield LedgerEvent_1.default.countDocuments({ _id: permanent._id })) === 1, 'a refused retry does not create another event');
        let otherCode = '';
        try {
            yield ledgerEventService_1.default.retryFailedEvent(String(transient._id), String(otherCompany._id), { userId: String(user._id), requestId: 'corr-other' });
        }
        catch (error) {
            otherCode = (error === null || error === void 0 ? void 0 : error.code) || '';
        }
        assert(otherCode === 'LEDGER_EVENT_COMPANY_MISMATCH', 'another company cannot retry the event');
        const concurrentRetry = yield Promise.allSettled([
            ledgerEventService_1.default.retryFailedEvent(String(transient._id), String(company._id), { userId: String(user._id), requestId: 'corr-retry' }),
            ledgerEventService_1.default.retryFailedEvent(String(transient._id), String(company._id), { userId: String(user._id), requestId: 'corr-retry' })
        ]);
        assert((yield LedgerEvent_1.default.countDocuments({ _id: transient._id })) === 1, 'concurrent retries do not create a second ledger event');
        assert(concurrentRetry.filter((row) => row.status === 'fulfilled').length === 0, 'the incomplete levy retry does not report success');
        const retryAudit = yield AuditLog_1.AuditLog.findOne({
            action: 'ledger.retry',
            entityId: String(transient._id),
            status: 'failure',
            'metadata.correlationId': 'corr-retry'
        }).lean();
        assert(Boolean(retryAudit), 'a ledger retry writes an audit event');
        assert(String((retryAudit === null || retryAudit === void 0 ? void 0 : retryAudit.userId) || '') === String(user._id), 'the audit event identifies the operator');
        assert(((_e = retryAudit === null || retryAudit === void 0 ? void 0 : retryAudit.metadata) === null || _e === void 0 ? void 0 : _e.correlationId) === 'corr-retry', 'the audit event identifies the correlation id');
        assert(((_f = retryAudit === null || retryAudit === void 0 ? void 0 : retryAudit.metadata) === null || _f === void 0 ? void 0 : _f.operation) === 'levy_collection', 'the audit event identifies the operation');
        let unauthenticated = 0;
        yield (0, auth_1.auth)({ headers: {}, cookies: {} }, {
            status(code) { unauthenticated = code; return this; },
            json() { return this; }
        }, () => { unauthenticated = 200; });
        assert(unauthenticated === 401, 'an unauthenticated request cannot pass the accountant route authentication');
        const agentBlocked = yield new Promise((resolve) => {
            try {
                (0, roles_1.canViewAccountantDashboard)({ user: { role: 'agent', roles: ['agent'], companyId: company._id } }, {}, () => resolve(200));
            }
            catch (error) {
                resolve((error === null || error === void 0 ? void 0 : error.statusCode) || 403);
            }
        });
        assert(agentBlocked === 403, 'an agent cannot use the accountant retry authorisation');
        let controllerStatus = 0;
        yield (0, paymentAccountingIntegrityController_1.retryFailedLedgerEvent)({ user: undefined, params: { id: String(transient._id) }, get: () => undefined }, {
            status(code) { controllerStatus = code; return this; },
            json() { return this; }
        });
        assert(controllerStatus === 401, 'the retry controller rejects a missing user');
        const adminAllowed = yield new Promise((resolve) => {
            try {
                (0, roles_1.canViewAccountantDashboard)({ user: { role: 'admin', roles: ['admin'], companyId: company._id } }, {}, () => resolve(200));
            }
            catch (error) {
                resolve((error === null || error === void 0 ? void 0 : error.statusCode) || 403);
            }
        });
        assert(adminAllowed === 200, 'an admin can use the accountant retry authorisation');
        const auditGate = yield LedgerEvent_1.default.create({
            type: 'levy_collection', companyId: company._id, status: 'failed', failureClass: 'transient', attemptCount: 8
        });
        global.__failAuditResult = 'started';
        let auditGateCode = '';
        try {
            yield ledgerEventService_1.default.retryFailedEvent(String(auditGate._id), String(company._id), { userId: String(user._id), requestId: 'corr-audit-gate' });
        }
        catch (error) {
            auditGateCode = (error === null || error === void 0 ? void 0 : error.code) || '';
        }
        global.__failAuditResult = undefined;
        assert(auditGateCode === 'AUDIT_PERSIST_FAILED', 'a retry does not start when the audit event cannot be stored');
        assert(((_g = (yield LedgerEvent_1.default.findById(auditGate._id))) === null || _g === void 0 ? void 0 : _g.status) === 'failed', 'a blocked audit leaves the ledger event unclaimed');
        const journalBefore = yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(missingOwner._id), sourceModule: 'payment' });
        const journalRetry = yield LedgerEvent_1.default.create({
            type: 'journal', paymentId: missingOwner._id, companyId: company._id, status: 'failed',
            failureClass: 'transient', attemptCount: 8, correlationId: 'corr-journal-audit'
        });
        global.__failAuditResult = 'completed';
        const journalResult = yield ledgerEventService_1.default.retryFailedEvent(String(journalRetry._id), String(company._id), { userId: String(user._id), requestId: 'corr-journal-audit' });
        global.__failAuditResult = undefined;
        assert(journalResult.status === 'completed' && journalResult.auditPersisted === false, 'a completed retry reports that the audit event was not stored');
        assert(((_h = (yield LedgerEvent_1.default.findById(journalRetry._id))) === null || _h === void 0 ? void 0 : _h.status) === 'completed', 'a missing audit event does not undo the completed retry');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(missingOwner._id), sourceModule: 'payment' })) === journalBefore, 'a missing audit event does not create another journal');
        assert((yield AccountingException_1.AccountingException.countDocuments({ component: 'AUDIT_EVENT_MISSING', 'accountingRef.transactionId': String(journalRetry._id) })) === 1, 'a missing audit event is recorded for review');
        let repeatedRetry = '';
        try {
            yield ledgerEventService_1.default.retryFailedEvent(String(journalRetry._id), String(company._id), { userId: String(user._id), requestId: 'corr-journal-audit-again' });
        }
        catch (error) {
            repeatedRetry = (error === null || error === void 0 ? void 0 : error.code) || '';
        }
        assert(repeatedRetry === 'LEDGER_EVENT_NOT_RETRYABLE', 'a completed retry is not posted again after an audit gap');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(missingOwner._id), sourceModule: 'payment' })) === journalBefore, 'a repeated retry after an audit gap does not add a journal');
        if (failures.length) {
            console.error(failures.join('\n'));
            process.exit(1);
        }
        console.log('PASS integrity gap tests on local MongoDB. Cosmos DB was not used.');
        yield mongoose_1.default.disconnect();
        yield database_1.accountingConnection.close();
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
