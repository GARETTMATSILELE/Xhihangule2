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
 * Reversal-journal duplicate-key handling.
 * Classifier cases always run. Database cases use a disposable local database.
 * They do not open the application database and they are not Cosmos DB results.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Payment_1 = require("../models/Payment");
const TaxObligation_1 = require("../models/TaxObligation");
const VatRecord_1 = require("../models/VatRecord");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const commissionService_1 = require("../services/commissionService");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const vatPolicyService_1 = require("../services/vatPolicyService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const paymentAccountingReconciliation_1 = require("../services/paymentAccountingReconciliation");
const paymentAccountingOrchestrator_1 = require("../services/paymentAccountingOrchestrator");
const accountingIntegrationService_1 = __importDefault(require("../services/accountingIntegrationService"));
const journalDuplicateKey_1 = require("../services/journalDuplicateKey");
const database_1 = require("../config/database");
const DB = process.env.REVERSAL_JOURNAL_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_journal_test';
const ACCOUNTING_DB = process.env.REVERSAL_JOURNAL_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_journal_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures = [];
const notes = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function identity(overrides) {
    return Object.assign({ companyId: 'company-1', sourceModule: 'payment', sourceId: 'payment-1:reversal', reference: 'REV-PAY-1' }, overrides);
}
function runClassifierCases() {
    var _a, _b;
    const same = identity();
    const sourceError = {
        code: 11000,
        keyPattern: { companyId: 1, sourceModule: 1, sourceId: 1 },
        keyValue: { companyId: 'company-1', sourceModule: 'payment', sourceId: 'payment-1:reversal' }
    };
    assert(((_a = (0, journalDuplicateKey_1.matchingJournalIdentity)(sourceError, [same])) === null || _a === void 0 ? void 0 : _a.sourceId) === 'payment-1:reversal', 'source-index duplicate matches this reversal');
    assert((0, journalDuplicateKey_1.matchingJournalIdentity)({
        code: 11000,
        keyPattern: { companyId: 1, sourceModule: 1, sourceId: 1 },
        keyValue: { companyId: 'company-1', sourceModule: 'payment', sourceId: 'other:reversal' }
    }, [same]) == null, 'source-index duplicate for another payment is not this reversal');
    assert(((_b = (0, journalDuplicateKey_1.matchingJournalIdentity)({
        code: 11000,
        keyPattern: { companyId: 1, reference: 1 },
        keyValue: { companyId: 'company-1', reference: 'REV-PAY-1' }
    }, [same])) === null || _b === void 0 ? void 0 : _b.reference) === 'REV-PAY-1', 'reference-index duplicate can name this reversal');
    assert((0, journalDuplicateKey_1.matchingJournalIdentity)({
        code: 11000,
        keyPattern: { description: 1 },
        keyValue: { description: 'unrelated' }
    }, [same]) == null, 'unrelated journal index is not an idempotent reversal');
    assert((0, journalDuplicateKey_1.matchingJournalIdentity)({ code: 11000, message: 'E11000 duplicate key error' }, [same]) == null, 'duplicate key without index metadata is not success');
    assert((0, journalDuplicateKey_1.persistedJournalMatchesIdentity)(null, same) === false, 'missing journal after a duplicate key is not success');
    assert((0, journalDuplicateKey_1.persistedJournalMatchesIdentity)({
        companyId: 'company-1',
        sourceModule: 'payment',
        sourceId: 'payment-1:reversal'
    }, same), 'stored journal with the same source identity is the reversal');
    assert((0, journalDuplicateKey_1.persistedJournalMatchesIdentity)({
        companyId: 'company-1',
        sourceModule: 'payment',
        sourceId: 'payment-1'
    }, same) === false, 'the original journal is not the reversal journal');
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        runClassifierCases();
        process.env.MANTIS_TEST_SEAM = '1';
        process.env.NODE_ENV = 'development';
        try {
            yield mongoose_1.default.connect(DB, { serverSelectionTimeoutMS: 4000 });
        }
        catch (error) {
            notes.push(`INTEGRATION SKIPPED: local MongoDB unavailable (${(error === null || error === void 0 ? void 0 : error.message) || error}). Classifier cases still ran. This is not a Cosmos DB pass.`);
            finish();
            return;
        }
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        yield JournalEntry_1.JournalEntry.syncIndexes();
        yield JournalLine_1.JournalLine.syncIndexes();
        yield VatRecord_1.VatRecord.syncIndexes();
        yield TaxObligation_1.TaxObligation.syncIndexes();
        const user = yield User_1.User.create({
            email: 'reversal-journal@example.test',
            password: 'test-pass-1',
            firstName: 'Journal',
            lastName: 'Reversal',
            role: 'admin',
            roles: ['admin'],
            isActive: true,
            sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Journal Reversal Co',
            address: '1 Journal Street',
            phone: '0770000081',
            email: 'journal-reversal@example.test',
            registrationNumber: 'JRN-REV-1',
            tinNumber: 'JRN-REV-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            taxProfile: { vatRegistered: true, vatNumber: 'ZW-JRN', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
        });
        const property = yield Property_1.Property.create({
            companyId: company._id,
            ownerId: user._id,
            name: 'Journal House',
            address: '1 Journal Road',
            rentalType: 'management',
            rent: 1800,
            commission: 15,
            vatOnCommission: true,
            vatCommissionTreatment: 'exclusive'
        });
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Journal',
            lastName: 'Tenant',
            email: 'journal-tenant@example.test',
            phone: '0771111181',
            companyId: company._id,
            ownerId: user._id,
            status: 'Active'
        });
        const policy = yield (0, vatPolicyService_1.resolveCommissionVatPolicy)({
            companyId: String(company._id),
            paymentDate: PAYMENT_DATE,
            property,
            requestedVatOnCommission: true,
            requestedTreatment: 'exclusive',
            commissionType: 'management'
        });
        const flags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)(policy);
        const calc = yield commissionService_1.CommissionService.calculateForProperty({
            companyId: company._id,
            grossRent: 1800,
            levy: 0,
            commissionPercentage: 15,
            vatOnCommission: flags.vatOnCommission,
            vatTreatment: flags.vatTreatment,
            vatRate: flags.vatRate,
            paymentDate: PAYMENT_DATE,
            commissionType: 'management'
        });
        function postedPayment(notesText, referenceNumber) {
            return __awaiter(this, void 0, void 0, function* () {
                const payment = yield Payment_1.Payment.create({
                    companyId: company._id,
                    propertyId: property._id,
                    tenantId: tenant._id,
                    agentId: user._id,
                    processedBy: user._id,
                    propertyType: 'residential',
                    amount: 1800,
                    depositAmount: 0,
                    paymentType: 'rental',
                    paymentMethod: 'bank_transfer',
                    status: 'completed',
                    paymentDate: PAYMENT_DATE,
                    rentalPeriodMonth: 3,
                    rentalPeriodYear: 2026,
                    transactionDomain: 'RENTAL',
                    commissionFinalized: true,
                    accountingStatus: 'pending',
                    accountingComplete: false,
                    applyVatOnCommission: flags.vatOnCommission,
                    vatOnCommissionRate: flags.vatRate,
                    vatCommissionTreatment: flags.vatTreatment,
                    commissionDetails: (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc),
                    referenceNumber: referenceNumber || `JRN-${new mongoose_1.default.Types.ObjectId().toString()}`,
                    notes: notesText,
                    idempotencyKey: `jrn:${new mongoose_1.default.Types.ObjectId().toString()}`
                });
                yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(payment._id), { createdBy: String(user._id) });
                return Payment_1.Payment.findById(payment._id);
            });
        }
        const payment = yield postedPayment(undefined, 'JRN-FIRST');
        const originalJournalBefore = yield JournalEntry_1.JournalEntry.findOne({ sourceId: String(payment === null || payment === void 0 ? void 0 : payment._id), sourceModule: 'payment' }).lean();
        const originalLinesBefore = yield JournalLine_1.JournalLine.find({ journalEntryId: originalJournalBefore === null || originalJournalBefore === void 0 ? void 0 : originalJournalBefore._id }).select('debit credit').lean();
        const originalDebit = originalLinesBefore.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        const obligationBefore = yield TaxObligation_1.TaxObligation.findOne({ paymentId: payment === null || payment === void 0 ? void 0 : payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const vatBefore = yield VatRecord_1.VatRecord.findOne({ transactionId: String(payment === null || payment === void 0 ? void 0 : payment._id) }).lean();
        const first = yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(payment === null || payment === void 0 ? void 0 : payment._id), { reason: 'first reversal' });
        assert(first.artifacts.journal === 'reversed', `first reversal journals, got ${first.artifacts.journal} ${first.errors.join('; ')}`);
        const reversalJournal = yield JournalEntry_1.JournalEntry.findOne({ sourceId: `${payment === null || payment === void 0 ? void 0 : payment._id}:reversal` }).lean();
        assert(Boolean(reversalJournal), 'first reversal stores one reversal journal');
        const originalAfter = yield JournalEntry_1.JournalEntry.findById(originalJournalBefore === null || originalJournalBefore === void 0 ? void 0 : originalJournalBefore._id).lean();
        assert(String(originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.reference) === String(originalJournalBefore === null || originalJournalBefore === void 0 ? void 0 : originalJournalBefore.reference) && (originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.status) === 'posted', 'reversal does not change the original journal reference or status');
        const originalLinesAfter = yield JournalLine_1.JournalLine.find({ journalEntryId: originalJournalBefore === null || originalJournalBefore === void 0 ? void 0 : originalJournalBefore._id }).select('debit credit').lean();
        const originalDebitAfter = originalLinesAfter.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        assert(originalDebitAfter === originalDebit, 'reversal does not change original journal amounts');
        const retry = yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(payment === null || payment === void 0 ? void 0 : payment._id), { reason: 'retry reversal' });
        const reversalJournals = yield JournalEntry_1.JournalEntry.find({ sourceId: `${payment === null || payment === void 0 ? void 0 : payment._id}:reversal` }).lean();
        assert(retry.artifacts.journal === 'reversed', `retry reversal stays reversed, got ${retry.artifacts.journal} ${retry.errors.join('; ')}`);
        assert(reversalJournals.length === 1 && String(reversalJournals[0]._id) === String(reversalJournal === null || reversalJournal === void 0 ? void 0 : reversalJournal._id), 'retry does not create or replace the reversal journal');
        assert(String(reversalJournals[0].reference) === String(reversalJournal === null || reversalJournal === void 0 ? void 0 : reversalJournal.reference), 'retry does not change the reversal reference');
        const obligationAfter = yield TaxObligation_1.TaxObligation.findById(obligationBefore === null || obligationBefore === void 0 ? void 0 : obligationBefore._id).lean();
        const vatAfter = yield VatRecord_1.VatRecord.findById(vatBefore === null || vatBefore === void 0 ? void 0 : vatBefore._id).lean();
        assert(Number(obligationAfter === null || obligationAfter === void 0 ? void 0 : obligationAfter.taxAmount) === Number(obligationBefore === null || obligationBefore === void 0 ? void 0 : obligationBefore.taxAmount), 'reversal keeps the original tax obligation amount');
        assert(Number(vatAfter === null || vatAfter === void 0 ? void 0 : vatAfter.vatCollected) === Number(vatBefore === null || vatBefore === void 0 ? void 0 : vatBefore.vatCollected), 'reversal keeps the VAT collection amount');
        const concurrent = yield postedPayment(undefined, 'JRN-CONCURRENT');
        const concurrentResults = yield Promise.all([
            (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(concurrent === null || concurrent === void 0 ? void 0 : concurrent._id), { reason: 'concurrent a' }),
            (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(concurrent === null || concurrent === void 0 ? void 0 : concurrent._id), { reason: 'concurrent b' })
        ]);
        const concurrentJournals = yield JournalEntry_1.JournalEntry.find({ sourceId: `${concurrent === null || concurrent === void 0 ? void 0 : concurrent._id}:reversal` }).lean();
        assert(concurrentResults.every((row) => row.artifacts.journal === 'reversed' || row.status === 'reversed' || row.status === 'already_reversed' || row.status === 'partial'), `concurrent reversals resolve, got ${concurrentResults.map((row) => row.status).join(',')}`);
        assert(concurrentJournals.length === 1, `concurrent reversals leave one journal, got ${concurrentJournals.length}`);
        const unrelated = yield postedPayment(undefined, 'JRN-UNRELATED');
        yield JournalEntry_1.JournalEntry.collection.createIndex({ description: 1 }, { unique: true, name: 'test_only_unrelated_description' });
        const description = `Reversal of agent collection ${(unrelated === null || unrelated === void 0 ? void 0 : unrelated.referenceNumber) || (unrelated === null || unrelated === void 0 ? void 0 : unrelated._id)}`;
        const decoy = yield JournalEntry_1.JournalEntry.create({
            companyId: company._id,
            reference: `UNRELATED-${unrelated === null || unrelated === void 0 ? void 0 : unrelated._id}`,
            description,
            sourceModule: 'manual',
            sourceId: `unrelated:${unrelated === null || unrelated === void 0 ? void 0 : unrelated._id}`,
            status: 'posted',
            transactionDate: new Date()
        });
        let unrelatedThrew = false;
        try {
            yield accountingIntegrationService_1.default.postReversalJournal(unrelated, { reason: 'unrelated index' });
        }
        catch (error) {
            unrelatedThrew = Number(error === null || error === void 0 ? void 0 : error.code) === 11000;
        }
        const decoyAfter = yield JournalEntry_1.JournalEntry.findById(decoy._id).lean();
        assert(unrelatedThrew, 'duplicate key on an unrelated journal index is propagated');
        assert(String(decoyAfter === null || decoyAfter === void 0 ? void 0 : decoyAfter.reference) === String(decoy.reference) && (decoyAfter === null || decoyAfter === void 0 ? void 0 : decoyAfter.status) === 'posted', 'unrelated collision does not overwrite the existing journal');
        assert(!(yield JournalEntry_1.JournalEntry.findOne({ sourceId: `${unrelated === null || unrelated === void 0 ? void 0 : unrelated._id}:reversal` }).lean()), 'unrelated collision does not invent a reversal journal');
        yield JournalEntry_1.JournalEntry.collection.dropIndex('test_only_unrelated_description');
        const missing = yield postedPayment(undefined, 'JRN-MISSING');
        const blocker = yield JournalEntry_1.JournalEntry.create({
            companyId: company._id,
            reference: `REV-PAY-${missing === null || missing === void 0 ? void 0 : missing.referenceNumber}`,
            description: 'reference owned by a different journal',
            sourceModule: 'manual',
            sourceId: `not-the-reversal:${missing === null || missing === void 0 ? void 0 : missing._id}`,
            status: 'posted',
            transactionDate: new Date()
        });
        const blockerBefore = { reference: blocker.reference, status: blocker.status, sourceId: blocker.sourceId };
        let missingThrew = false;
        let missingReturned;
        try {
            missingReturned = yield accountingIntegrationService_1.default.postReversalJournal(missing, { reason: 'missing reversal row' });
        }
        catch (error) {
            missingThrew = Number(error === null || error === void 0 ? void 0 : error.code) === 11000;
        }
        const blockerAfter = yield JournalEntry_1.JournalEntry.findById(blocker._id).lean();
        assert(missingThrew && missingReturned !== 'reversed', 'duplicate key without the expected reversal journal is propagated');
        assert((blockerAfter === null || blockerAfter === void 0 ? void 0 : blockerAfter.reference) === blockerBefore.reference && (blockerAfter === null || blockerAfter === void 0 ? void 0 : blockerAfter.sourceId) === blockerBefore.sourceId && (blockerAfter === null || blockerAfter === void 0 ? void 0 : blockerAfter.status) === 'posted', 'missing reversal row does not overwrite the conflicting journal');
        const failed = yield postedPayment('PHASE27_FAIL_JOURNAL', 'JRN-FAIL');
        const failedOriginal = yield JournalEntry_1.JournalEntry.findOne({ sourceId: String(failed === null || failed === void 0 ? void 0 : failed._id), sourceModule: 'payment' }).lean();
        const failedFirst = yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(failed === null || failed === void 0 ? void 0 : failed._id), { reason: 'PHASE27_FAIL_JOURNAL' });
        assert(failedFirst.artifacts.journal === 'failed', `injected journal failure stays failed, got ${failedFirst.artifacts.journal}`);
        const failedRetry = yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(failed === null || failed === void 0 ? void 0 : failed._id), { reason: 'safe retry' });
        const failedOriginalAfter = yield JournalEntry_1.JournalEntry.findById(failedOriginal === null || failedOriginal === void 0 ? void 0 : failedOriginal._id).lean();
        assert(failedRetry.artifacts.journal === 'reversed', `retry after failure posts the reversal, got ${failedRetry.artifacts.journal} ${failedRetry.errors.join('; ')}`);
        assert(String(failedOriginalAfter === null || failedOriginalAfter === void 0 ? void 0 : failedOriginalAfter.reference) === String(failedOriginal === null || failedOriginal === void 0 ? void 0 : failedOriginal.reference) && (failedOriginalAfter === null || failedOriginalAfter === void 0 ? void 0 : failedOriginalAfter.status) === 'posted', 'failed reversal and retry keep the original journal');
        notes.push('Database cases ran on local MongoDB. They do not verify Cosmos DB.');
        finish();
    });
}
function finish() {
    if (failures.length) {
        console.error(failures.map((row) => `FAIL ${row}`).join('\n'));
        console.error(notes.join('\n'));
        process.exit(1);
    }
    console.log(['PASS reversal journal duplicate-key cases', ...notes].join('\n'));
    process.exit(0);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
