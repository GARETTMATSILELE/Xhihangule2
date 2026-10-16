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
 * Reversal and original tax-obligation idempotency on a disposable database.
 * Does not open the application database.
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
const commissionService_1 = require("../services/commissionService");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const vatPolicyService_1 = require("../services/vatPolicyService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const paymentAccountingReconciliation_1 = require("../services/paymentAccountingReconciliation");
const paymentAccountingOrchestrator_1 = require("../services/paymentAccountingOrchestrator");
const taxObligationService_1 = require("../services/taxObligationService");
const database_1 = require("../config/database");
const DB = process.env.VAT_REVERSAL_DB || 'mongodb://127.0.0.1:27017/vat_reversal_idempotency_test';
const ACCOUNTING_DB = process.env.VAT_REVERSAL_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/vat_reversal_idempotency_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        process.env.MANTIS_TEST_SEAM = '1';
        yield mongoose_1.default.connect(DB);
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        yield TaxObligation_1.TaxObligation.collection.createIndex({ companyId: 1, paymentId: 1, taxType: 1, reversalOf: 1 }, { unique: true, sparse: true, name: 'companyId_1_paymentId_1_taxType_1_reversalOf_1' });
        yield TaxObligation_1.TaxObligation.collection.createIndex({ companyId: 1, paymentId: 1, taxType: 1 }, {
            unique: true,
            name: 'companyId_1_paymentId_1_taxType_1_original',
            partialFilterExpression: { reversalOf: null, paymentId: { $type: 'objectId' } }
        });
        const user = yield User_1.User.create({
            email: 'vat-reversal@example.test',
            password: 'test-pass-1',
            firstName: 'Reversal',
            lastName: 'Tester',
            role: 'admin',
            roles: ['admin'],
            isActive: true,
            sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Reversal Idempotency Co',
            address: '1 Test Street',
            phone: '0770000041',
            email: 'reversal-co@example.test',
            registrationNumber: 'REV-IDEMP-1',
            tinNumber: 'REV-IDEMP-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            taxProfile: { vatRegistered: true, vatNumber: 'ZW-REV', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
        });
        const property = yield Property_1.Property.create({
            companyId: company._id,
            ownerId: user._id,
            name: 'Reversal House',
            address: '1 Reversal Road',
            rentalType: 'management',
            rent: 1800,
            commission: 15,
            vatOnCommission: true,
            vatCommissionTreatment: 'exclusive'
        });
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Reversal',
            lastName: 'Tenant',
            email: 'reversal-tenant@example.test',
            phone: '0771111141',
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
        function postedPayment(notes) {
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
                    rentalPeriodMonth: Math.floor(Math.random() * 12) + 1,
                    rentalPeriodYear: 2024 + Math.floor(Math.random() * 2),
                    transactionDomain: 'RENTAL',
                    commissionFinalized: true,
                    accountingStatus: 'pending',
                    accountingComplete: false,
                    applyVatOnCommission: flags.vatOnCommission,
                    vatOnCommissionRate: flags.vatRate,
                    vatCommissionTreatment: flags.vatTreatment,
                    commissionDetails: (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc),
                    notes,
                    idempotencyKey: `rev:${new mongoose_1.default.Types.ObjectId().toString()}`
                });
                yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(payment._id), { createdBy: String(user._id) });
                return payment;
            });
        }
        const payment = yield postedPayment();
        const originalBefore = yield TaxObligation_1.TaxObligation.findOne({ paymentId: payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        assert(Number(originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore.taxAmount) === 41.85 && (originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore.status) === 'PAYABLE', `original obligation is 41.85 PAYABLE, got ${originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore.taxAmount} ${originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore.status}`);
        const first = yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(payment._id), { reason: 'idempotency reversal' });
        assert(first.artifacts.tax === 'reversed' && first.artifacts.vatRecord === 'reversed', `first reversal posted tax and VAT, got ${first.artifacts.tax} ${first.artifacts.vatRecord} ${first.errors.join('; ')}`);
        const originalAfter = yield TaxObligation_1.TaxObligation.findById(originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore._id).lean();
        const reversalRows = yield TaxObligation_1.TaxObligation.find({ paymentId: payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore._id }).lean();
        assert(reversalRows.length === 1, `first reversal creates one reversal, got ${reversalRows.length}`);
        assert((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.status) === 'REVERSED' && Number(originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.taxAmount) === 41.85, 'first reversal keeps the original amount and marks it reversed');
        assert(String((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.reversalOf) || '') === '', 'the original remains distinguishable from the reversal');
        assert(String(reversalRows[0].reversalOf) === String(originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore._id), 'the reversal points at the original');
        const vatBeforeRetry = yield VatRecord_1.VatRecord.countDocuments({ transactionId: String(payment._id) });
        const journalsBeforeRetry = yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: { $in: [String(payment._id), `${payment._id}:reversal`] } });
        const second = yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(payment._id), { reason: 'idempotency reversal retry' });
        const reversalAfterRetry = yield TaxObligation_1.TaxObligation.find({ paymentId: payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore._id }).lean();
        const originalAfterRetry = yield TaxObligation_1.TaxObligation.findById(originalBefore === null || originalBefore === void 0 ? void 0 : originalBefore._id).lean();
        assert(second.artifacts.tax === 'reversed', `retry reversal stays reversed, got ${second.artifacts.tax} ${second.errors.join('; ')}`);
        assert(reversalAfterRetry.length === 1 && String(reversalAfterRetry[0]._id) === String(reversalRows[0]._id), 'retry returns the existing reversal');
        assert(Number(reversalAfterRetry[0].taxAmount) === Number(reversalRows[0].taxAmount) && reversalAfterRetry[0].status === reversalRows[0].status, 'retry does not change the reversal amount or status');
        assert(Number(originalAfterRetry === null || originalAfterRetry === void 0 ? void 0 : originalAfterRetry.taxAmount) === 41.85 && (originalAfterRetry === null || originalAfterRetry === void 0 ? void 0 : originalAfterRetry.status) === 'REVERSED', 'retry does not change the original amount or status');
        assert((yield VatRecord_1.VatRecord.countDocuments({ transactionId: String(payment._id) })) === vatBeforeRetry, 'retry does not add a VAT collection record');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: { $in: [String(payment._id), `${payment._id}:reversal`] } })) === journalsBeforeRetry, 'retry does not add an accounting journal');
        const concurrentPayment = yield postedPayment();
        const concurrentOriginal = yield TaxObligation_1.TaxObligation.findOne({ paymentId: concurrentPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const concurrentResults = yield Promise.all([
            (0, taxObligationService_1.reversePaymentTaxObligations)({ companyId: String(company._id), paymentId: String(concurrentPayment._id), reason: 'concurrent a' }),
            (0, taxObligationService_1.reversePaymentTaxObligations)({ companyId: String(company._id), paymentId: String(concurrentPayment._id), reason: 'concurrent b' })
        ]);
        const concurrentReversals = yield TaxObligation_1.TaxObligation.find({ reversalOf: concurrentOriginal === null || concurrentOriginal === void 0 ? void 0 : concurrentOriginal._id }).lean();
        const concurrentOriginalAfter = yield TaxObligation_1.TaxObligation.findById(concurrentOriginal === null || concurrentOriginal === void 0 ? void 0 : concurrentOriginal._id).lean();
        assert(concurrentResults.every((result) => result === 'reversed'), `concurrent reversals both resolve, got ${concurrentResults.join(',')}`);
        assert(concurrentReversals.length === 1, `concurrent reversals leave one reversal, got ${concurrentReversals.length}`);
        assert(Number(concurrentOriginalAfter === null || concurrentOriginalAfter === void 0 ? void 0 : concurrentOriginalAfter.taxAmount) === 41.85 && (concurrentOriginalAfter === null || concurrentOriginalAfter === void 0 ? void 0 : concurrentOriginalAfter.status) === 'REVERSED', 'concurrent reversal keeps the original amount');
        const unrelatedPayment = yield postedPayment();
        const unrelatedOriginal = yield TaxObligation_1.TaxObligation.findOne({ paymentId: unrelatedPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const decoyReversalOf = new mongoose_1.default.Types.ObjectId();
        yield TaxObligation_1.TaxObligation.collection.insertOne({
            companyId: company._id,
            paymentId: new mongoose_1.default.Types.ObjectId(),
            taxType: 'VAT_OUTPUT',
            transactionId: `${unrelatedPayment._id}:reversal`,
            reversalOf: decoyReversalOf,
            taxAmount: 5,
            taxableAmount: 10,
            taxRate: 0.155,
            taxPeriod: '2026-10',
            transactionDate: PAYMENT_DATE,
            status: 'REVERSED',
            entityType: 'payment',
            calculationBasis: 'UNRELATED_INDEX',
            calculatedAt: new Date()
        });
        yield TaxObligation_1.TaxObligation.collection.createIndex({ transactionId: 1 }, { unique: true, name: 'transactionId_unique_probe' });
        let unrelatedThrew = false;
        try {
            yield (0, taxObligationService_1.reversePaymentTaxObligations)({ companyId: String(company._id), paymentId: String(unrelatedPayment._id), reason: 'unrelated index' });
        }
        catch (error) {
            unrelatedThrew = Number(error === null || error === void 0 ? void 0 : error.code) === 11000;
        }
        const unrelatedOriginalAfter = yield TaxObligation_1.TaxObligation.findById(unrelatedOriginal === null || unrelatedOriginal === void 0 ? void 0 : unrelatedOriginal._id).lean();
        const unrelatedReversals = yield TaxObligation_1.TaxObligation.countDocuments({ reversalOf: unrelatedOriginal === null || unrelatedOriginal === void 0 ? void 0 : unrelatedOriginal._id });
        assert(unrelatedThrew, 'an unrelated duplicate-key error is not treated as a successful reversal');
        assert((unrelatedOriginalAfter === null || unrelatedOriginalAfter === void 0 ? void 0 : unrelatedOriginalAfter.status) === 'PAYABLE' && Number(unrelatedOriginalAfter === null || unrelatedOriginalAfter === void 0 ? void 0 : unrelatedOriginalAfter.taxAmount) === 41.85, 'the failed reversal leaves the original unchanged');
        assert(unrelatedReversals === 0, 'the failed reversal does not leave a reversal for that original');
        yield TaxObligation_1.TaxObligation.collection.dropIndex('transactionId_unique_probe');
        yield TaxObligation_1.TaxObligation.deleteOne({ calculationBasis: 'UNRELATED_INDEX' });
        const recovered = yield (0, taxObligationService_1.reversePaymentTaxObligations)({ companyId: String(company._id), paymentId: String(unrelatedPayment._id), reason: 'retry after unrelated failure' });
        assert(recovered === 'reversed', 'a failed reversal can be retried after the conflicting key is gone');
        assert((yield TaxObligation_1.TaxObligation.countDocuments({ reversalOf: unrelatedOriginal === null || unrelatedOriginal === void 0 ? void 0 : unrelatedOriginal._id })) === 1, 'the retry creates one reversal');
        const seamPayment = yield postedPayment('PHASE28_FAIL_TAX');
        const seamOriginal = yield TaxObligation_1.TaxObligation.findOne({ paymentId: seamPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        let seamThrew = false;
        try {
            yield (0, taxObligationService_1.reversePaymentTaxObligations)({ companyId: String(company._id), paymentId: String(seamPayment._id), notes: 'PHASE28_FAIL_TAX', reason: 'seam' });
        }
        catch (error) {
            seamThrew = String((error === null || error === void 0 ? void 0 : error.message) || '').includes('PHASE28_FAIL_TAX');
        }
        assert(seamThrew, 'an injected reversal failure is surfaced');
        assert(((_a = (yield TaxObligation_1.TaxObligation.findById(seamOriginal === null || seamOriginal === void 0 ? void 0 : seamOriginal._id).lean())) === null || _a === void 0 ? void 0 : _a.status) === 'PAYABLE', 'the injected failure does not mark the original reversed');
        const seamRetry = yield (0, taxObligationService_1.reversePaymentTaxObligations)({ companyId: String(company._id), paymentId: String(seamPayment._id), notes: 'PHASE28_FAIL_TAX', reason: 'seam retry' });
        assert(seamRetry === 'reversed' && (yield TaxObligation_1.TaxObligation.countDocuments({ reversalOf: seamOriginal === null || seamOriginal === void 0 ? void 0 : seamOriginal._id })) === 1, 'the same reversal succeeds on the next attempt');
        const raceCompany = company._id;
        const racePayment = new mongoose_1.default.Types.ObjectId();
        const raceBase = {
            companyId: String(raceCompany),
            taxType: 'VAT_ON_COMMISSION',
            paymentId: String(racePayment),
            taxPeriod: '2026-10',
            transactionDate: PAYMENT_DATE,
            currency: 'USD',
            taxableAmount: 270,
            taxRate: 0.155,
            calculationBasis: 'ORIGINAL_RACE'
        };
        const raceIds = yield Promise.all([
            (0, taxObligationService_1.upsertPaymentTaxObligation)(Object.assign(Object.assign({}, raceBase), { taxAmount: 41.85 })),
            (0, taxObligationService_1.upsertPaymentTaxObligation)(Object.assign(Object.assign({}, raceBase), { taxAmount: 77 }))
        ]);
        const raceRows = yield TaxObligation_1.TaxObligation.find({ paymentId: racePayment, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const raceRetry = yield (0, taxObligationService_1.upsertPaymentTaxObligation)(Object.assign(Object.assign({}, raceBase), { taxAmount: 99.99 }));
        const raceAfter = yield TaxObligation_1.TaxObligation.findById(raceIds[0]).lean();
        assert(raceRows.length === 1 && String(raceIds[0]) === String(raceIds[1]), `concurrent originals collapse to one row, got ${raceRows.length}`);
        assert(String(raceRetry) === String(raceRows[0]._id) && Number(raceAfter === null || raceAfter === void 0 ? void 0 : raceAfter.taxAmount) === Number(raceRows[0].taxAmount), 'a later original upsert does not overwrite the stored amount');
        const clashJournal = `clash-${new mongoose_1.default.Types.ObjectId().toString()}`;
        yield TaxObligation_1.TaxObligation.collection.createIndex({ journalEntryId: 1 }, { unique: true, sparse: true, name: 'journalEntryId_unique_probe' });
        yield TaxObligation_1.TaxObligation.collection.insertOne({
            companyId: company._id,
            paymentId: new mongoose_1.default.Types.ObjectId(),
            taxType: 'VAT_OUTPUT',
            reversalOf: null,
            taxAmount: 1,
            taxableAmount: 1,
            taxRate: 0,
            taxPeriod: '2026-10',
            transactionDate: PAYMENT_DATE,
            status: 'PAYABLE',
            entityType: 'payment',
            calculationBasis: 'UNRELATED_ORIGINAL',
            journalEntryId: clashJournal,
            calculatedAt: new Date()
        });
        const clashPayment = new mongoose_1.default.Types.ObjectId();
        let clashThrew = false;
        try {
            yield (0, taxObligationService_1.upsertPaymentTaxObligation)(Object.assign(Object.assign({}, raceBase), { paymentId: String(clashPayment), taxAmount: 41.85, calculationBasis: 'NEW_ORIGINAL', journalEntryId: clashJournal }));
        }
        catch (error) {
            clashThrew = Number(error === null || error === void 0 ? void 0 : error.code) === 11000;
        }
        assert(clashThrew, 'a duplicate-key error from another index is not treated as an existing original');
        assert((yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: clashPayment })) === 0, 'the rejected original was not saved');
        if (failures.length) {
            console.error(failures.join('\n'));
            throw new Error(`${failures.length} reversal idempotency assertion(s) failed`);
        }
        console.log('VAT reversal idempotency tests passed');
    });
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield mongoose_1.default.connection.dropDatabase().catch(() => undefined);
    yield database_1.accountingConnection.dropDatabase().catch(() => undefined);
    yield mongoose_1.default.disconnect().catch(() => undefined);
    yield database_1.accountingConnection.close().catch(() => undefined);
}));
