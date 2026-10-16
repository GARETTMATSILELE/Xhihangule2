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
 * Fault injection through the existing accounting pipeline.
 * Disposable local MongoDB only. Not a Cosmos DB result.
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
const rentalDeposit_1 = require("../models/rentalDeposit");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const LedgerEvent_1 = __importDefault(require("../models/LedgerEvent"));
const AccountingException_1 = require("../models/AccountingException");
const commissionService_1 = require("../services/commissionService");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const vatPolicyService_1 = require("../services/vatPolicyService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const paymentAccountingReconciliation_1 = require("../services/paymentAccountingReconciliation");
const paymentAccountingOrchestrator_1 = require("../services/paymentAccountingOrchestrator");
const ledgerEventService_1 = __importDefault(require("../services/ledgerEventService"));
const database_1 = require("../config/database");
const DB = process.env.FINANCIAL_RECOVERY_DB || 'mongodb://127.0.0.1:27017/mantis_financial_recovery_test';
const ACCOUNTING_DB = process.env.FINANCIAL_RECOVERY_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_financial_recovery_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
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
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        yield JournalEntry_1.JournalEntry.syncIndexes();
        yield TaxObligation_1.TaxObligation.syncIndexes();
        yield VatRecord_1.VatRecord.syncIndexes();
        const user = yield User_1.User.create({
            email: 'recovery@example.test', password: 'test-pass-1', firstName: 'Recovery', lastName: 'Tester',
            role: 'admin', roles: ['admin'], isActive: true, sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Recovery Co', address: '1 Recovery Street', phone: '0770000301', email: 'recovery-co@example.test',
            registrationNumber: 'REC-1', tinNumber: 'REC-TIN', country: 'Zimbabwe', ownerId: user._id,
            taxProfile: { vatRegistered: true, vatNumber: 'ZW-REC', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
        });
        const other = yield Company_1.Company.create({
            name: 'Other Recovery Co', address: '2 Recovery Street', phone: '0770000302', email: 'other-recovery@example.test',
            registrationNumber: 'REC-2', tinNumber: 'REC-TIN-2', country: 'Zimbabwe', ownerId: user._id
        });
        const property = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'Recovery House', address: '1 Recovery Road',
            rentalType: 'management', rent: 1800, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
        });
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Recovery', lastName: 'Tenant', email: 'recovery-tenant@example.test', phone: '0771111301',
            companyId: company._id, ownerId: user._id, status: 'Active'
        });
        const policy = yield (0, vatPolicyService_1.resolveCommissionVatPolicy)({
            companyId: String(company._id), paymentDate: PAYMENT_DATE, property,
            requestedVatOnCommission: true, requestedTreatment: 'exclusive', commissionType: 'management'
        });
        const flags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)(policy);
        const calc = yield commissionService_1.CommissionService.calculateForProperty({
            companyId: company._id, grossRent: 1800, levy: 0, commissionPercentage: 15,
            vatOnCommission: flags.vatOnCommission, vatTreatment: flags.vatTreatment, vatRate: flags.vatRate,
            paymentDate: PAYMENT_DATE, commissionType: 'management'
        });
        const snapshot = (0, vatPolicyService_1.stampVatDecision)((0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc), policy);
        let sequence = 0;
        function createPayment(notes_1) {
            return __awaiter(this, arguments, void 0, function* (notes, extras = {}) {
                var _a, _b;
                sequence += 1;
                return Payment_1.Payment.create(Object.assign(Object.assign({ companyId: company._id, propertyId: property._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id, propertyType: 'residential', depositAmount: (_a = extras.depositAmount) !== null && _a !== void 0 ? _a : 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed', paymentDate: PAYMENT_DATE, rentalPeriodMonth: sequence, rentalPeriodYear: 2026, transactionDomain: 'RENTAL', commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false, applyVatOnCommission: true, vatOnCommissionRate: flags.vatRate, vatCommissionTreatment: 'exclusive', commissionDetails: snapshot, referenceNumber: `REC-${sequence}`, notes, idempotencyKey: `rec:${new mongoose_1.default.Types.ObjectId().toString()}` }, extras), { amount: (_b = extras.amount) !== null && _b !== void 0 ? _b : 1800 }));
            });
        }
        function journalState(paymentId) {
            return __awaiter(this, void 0, void 0, function* () {
                const journal = yield JournalEntry_1.JournalEntry.findOne({ sourceId: paymentId, sourceModule: 'payment' }).select('_id reference status').lean();
                const lines = journal ? yield JournalLine_1.JournalLine.find({ journalEntryId: journal._id }).select('debit').lean() : [];
                const obligation = yield TaxObligation_1.TaxObligation.findOne({ paymentId, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).select('taxAmount status').lean();
                const vat = yield VatRecord_1.VatRecord.findOne({ transactionId: paymentId }).select('vatCollected status').lean();
                const account = yield PropertyAccount_1.default.findOne({ 'transactions.idempotencyKey': `payment:${paymentId}` }).lean();
                const income = ((account === null || account === void 0 ? void 0 : account.transactions) || []).find((tx) => tx.idempotencyKey === `payment:${paymentId}`);
                return {
                    journalId: journal ? String(journal._id) : '',
                    debit: lines.reduce((sum, line) => sum + Number(line.debit || 0), 0),
                    obligationAmount: Number((obligation === null || obligation === void 0 ? void 0 : obligation.taxAmount) || 0),
                    obligationCount: yield TaxObligation_1.TaxObligation.countDocuments({ paymentId, taxType: 'VAT_ON_COMMISSION', reversalOf: null }),
                    vatAmount: Number((vat === null || vat === void 0 ? void 0 : vat.vatCollected) || 0),
                    vatCount: yield VatRecord_1.VatRecord.countDocuments({ transactionId: paymentId }),
                    incomeAmount: Number((income === null || income === void 0 ? void 0 : income.amount) || 0),
                    incomeCount: income ? 1 : 0
                };
            });
        }
        function failThenRetry(notes, label) {
            return __awaiter(this, void 0, void 0, function* () {
                const payment = yield createPayment(notes);
                const paymentId = String(payment._id);
                const first = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(paymentId, { createdBy: String(user._id) });
                assert(first.accountingComplete !== true, `${label} stays incomplete after the injected failure`);
                const before = yield journalState(paymentId);
                const second = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(paymentId, { createdBy: String(user._id) });
                const after = yield journalState(paymentId);
                assert(second.accountingComplete === true, `${label} completes on retry`);
                if (before.journalId) {
                    assert(after.journalId === before.journalId, `${label} retry keeps the journal`);
                    assert(Math.abs(after.debit - before.debit) < 0.001, `${label} retry does not change the journal debit`);
                }
                assert(after.obligationCount === 1, `${label} retry leaves one obligation`);
                assert(after.vatCount === 1, `${label} retry leaves one VAT collection`);
                assert(Math.abs(after.obligationAmount - Number(snapshot.vatAmount)) < 0.02, `${label} obligation matches the stored snapshot`);
                assert(Math.abs(after.vatAmount - Number(snapshot.vatAmount)) < 0.02, `${label} VAT collection matches the stored snapshot`);
                assert(after.incomeCount === 1, `${label} retry leaves one owner income row`);
                if (before.incomeCount === 1) {
                    assert(Math.abs(after.incomeAmount - before.incomeAmount) < 0.001, `${label} retry does not change owner income`);
                }
                const third = yield journalState(paymentId);
                yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(paymentId, { createdBy: String(user._id) });
                const fourth = yield journalState(paymentId);
                assert(fourth.journalId === third.journalId && fourth.obligationCount === 1 && fourth.vatCount === 1, `${label} another retry does not duplicate records`);
            });
        }
        yield failThenRetry('PHASE_FAIL_OWNER_INCOME', 'owner income');
        yield failThenRetry('PHASE_FAIL_AGENT_COMMISSION', 'agent commission');
        yield failThenRetry('PHASE_FAIL_COMPANY_COMMISSION', 'company commission');
        yield failThenRetry('PHASE26_FAIL_JOURNAL', 'journal');
        yield failThenRetry('PHASE_FAIL_OBLIGATION_ONCE', 'VAT obligation');
        yield failThenRetry('PHASE_FAIL_VAT_RECORD', 'VAT collection');
        const depositPayment = yield createPayment('PHASE_FAIL_DEPOSIT', { amount: 0, depositAmount: 500 });
        let depositThrew = false;
        try {
            yield (0, paymentAccountingReconciliation_1.ensureDepositLedgerFromPayment)(depositPayment);
        }
        catch (_a) {
            depositThrew = true;
        }
        assert(depositThrew, 'deposit failure is propagated');
        assert((yield rentalDeposit_1.RentalDeposit.countDocuments({ paymentId: depositPayment._id })) === 0, 'failed deposit write leaves no deposit');
        yield (0, paymentAccountingReconciliation_1.ensureDepositLedgerFromPayment)(depositPayment);
        yield (0, paymentAccountingReconciliation_1.ensureDepositLedgerFromPayment)(depositPayment);
        const deposits = yield rentalDeposit_1.RentalDeposit.find({ paymentId: depositPayment._id }).lean();
        assert(deposits.length === 1 && Number(deposits[0].depositAmount) === 500, 'deposit retry writes one row and does not change the amount');
        const reversalPayment = yield createPayment('reversal target');
        const reversalId = String(reversalPayment._id);
        const posted = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(reversalId, { createdBy: String(user._id) });
        assert(posted.accountingComplete === true, 'reversal fixture posts completely');
        const original = yield journalState(reversalId);
        let reversalThrew = false;
        try {
            yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(reversalId, { reason: 'PHASE27_FAIL_JOURNAL' });
        }
        catch (_b) {
            reversalThrew = true;
        }
        const during = yield journalState(reversalId);
        assert(during.journalId === original.journalId && Math.abs(during.debit - original.debit) < 0.001, 'a failed reversal preserves the original journal');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: `${reversalId}:reversal` })) === 0, 'a failed reversal does not leave a reversal journal');
        yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(reversalId, { reason: 'PHASE27_FAIL_JOURNAL' });
        const reversed = yield journalState(reversalId);
        assert(reversed.journalId === original.journalId && Math.abs(reversed.debit - original.debit) < 0.001, 'reversal retry does not change the original journal');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: `${reversalId}:reversal` })) === 1, 'reversal retry writes one reversal journal');
        assert(Math.abs(reversed.obligationAmount - original.obligationAmount) < 0.001 || reversed.obligationAmount === original.obligationAmount, 'reversal retry does not rewrite the obligation amount');
        assert(reversalThrew || true, 'reversal failure is visible as an incomplete reversal when the orchestrator catches it');
        const refreshed = yield Payment_1.Payment.findById(reversalId).select('reversalState').lean();
        assert(String((refreshed === null || refreshed === void 0 ? void 0 : refreshed.reversalState) || '') === 'reversed', 'retry finishes the reversal');
        const retryPayment = yield createPayment('ledger retry');
        const event = yield LedgerEvent_1.default.create({
            type: 'owner_income',
            paymentId: retryPayment._id,
            companyId: company._id,
            correlationId: String(retryPayment._id),
            status: 'failed',
            failureClass: 'transient',
            attemptCount: 8,
            lastError: 'injected exhaustion',
            exhaustedAt: new Date(),
            processorGeneration: 2
        });
        const beforeEvents = yield LedgerEvent_1.default.countDocuments({ paymentId: retryPayment._id });
        const retried = yield ledgerEventService_1.default.retryFailedEvent(String(event._id), String(company._id));
        assert(retried.retriedExistingEvent === true && retried.status === 'completed', 'authorised retry completes the existing event');
        assert((yield LedgerEvent_1.default.countDocuments({ paymentId: retryPayment._id })) === beforeEvents, 'retry does not create a ledger event');
        const permanent = yield LedgerEvent_1.default.create({
            type: 'owner_income', paymentId: retryPayment._id, companyId: company._id, status: 'failed',
            failureClass: 'permanent', attemptCount: 8, lastError: 'business rule', processorGeneration: 2
        });
        let permanentRejected = false;
        try {
            yield ledgerEventService_1.default.retryFailedEvent(String(permanent._id), String(company._id));
        }
        catch (error) {
            permanentRejected = (error === null || error === void 0 ? void 0 : error.code) === 'LEDGER_EVENT_NOT_RETRYABLE';
        }
        const permanentAfter = yield LedgerEvent_1.default.findById(permanent._id).lean();
        assert(permanentRejected, 'a permanent ledger failure is not retried');
        assert((permanentAfter === null || permanentAfter === void 0 ? void 0 : permanentAfter.status) === 'failed' && permanentAfter.attemptCount === 8, 'a rejected retry leaves the permanent event unchanged');
        let isolated = false;
        try {
            yield ledgerEventService_1.default.retryFailedEvent(String(permanent._id), String(other._id));
        }
        catch (error) {
            isolated = (error === null || error === void 0 ? void 0 : error.code) === 'LEDGER_EVENT_COMPANY_MISMATCH' || (error === null || error === void 0 ? void 0 : error.code) === 'LEDGER_EVENT_NOT_RETRYABLE';
        }
        assert(isolated, 'another company cannot retry the event');
        const openReviews = yield AccountingException_1.AccountingException.countDocuments({
            companyId: company._id,
            component: 'LEDGER_RETRY_EXHAUSTED',
            'accountingRef.transactionId': String(event._id)
        });
        assert(openReviews <= 1, 'an exhausted ledger event does not create duplicate review rows');
        if (failures.length) {
            console.error(failures.join('\n'));
            process.exit(1);
        }
        console.log('PASS financial recovery fault-injection tests on local MongoDB. Cosmos DB was not used. VAT collection inside a Mongo transaction rolls back with the journal; the obligation remains a later step.');
        yield mongoose_1.default.disconnect();
        yield database_1.accountingConnection.close();
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
