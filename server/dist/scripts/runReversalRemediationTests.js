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
 * Reversal remediation regression.
 * Classifier and eligibility cases always run.
 * Database cases use a disposable local MongoDB database only.
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
const VatReturn_1 = require("../models/VatReturn");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const LevyPayment_1 = require("../models/LevyPayment");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const CompanyAccount_1 = require("../models/CompanyAccount");
const AgentAccount_1 = require("../models/AgentAccount");
const PropertyOwner_1 = require("../models/PropertyOwner");
const OwnerRentNotice_1 = require("../models/OwnerRentNotice");
const IndividualVatRecord_1 = require("../models/IndividualVatRecord");
const TrustTransaction_1 = require("../models/TrustTransaction");
const commissionService_1 = require("../services/commissionService");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const vatPolicyService_1 = require("../services/vatPolicyService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const paymentAccountingReconciliation_1 = require("../services/paymentAccountingReconciliation");
const paymentAccountingOrchestrator_1 = require("../services/paymentAccountingOrchestrator");
const accountingIntegrationService_1 = __importDefault(require("../services/accountingIntegrationService"));
const accountingPostingPolicy_1 = require("../services/accountingPostingPolicy");
const paymentReversalPolicy_1 = require("../services/paymentReversalPolicy");
const journalDuplicateKey_1 = require("../services/journalDuplicateKey");
const taxObligationService_1 = require("../services/taxObligationService");
const paymentController_1 = require("../controllers/paymentController");
const ownerRentNotificationService_1 = require("../services/ownerRentNotificationService");
const trustPaymentPostingService_1 = __importDefault(require("../services/trustPaymentPostingService"));
const propertyAccountService_1 = __importDefault(require("../services/propertyAccountService"));
const database_1 = require("../config/database");
const DB = process.env.REVERSAL_REMEDIATION_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_remediation_test';
const ACCOUNTING_DB = process.env.REVERSAL_REMEDIATION_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_remediation_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures = [];
const notes = [];
const ledgerEvidence = [];
function stage(message) {
    console.error(`[reversal-remediation] ${message}`);
}
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function near(actual, expected, message) {
    if (Math.abs(Number(actual) - Number(expected)) > 0.02) {
        failures.push(`${message} (actual ${actual}, expected ${expected})`);
    }
}
function assertDisposable(uri, label) {
    const value = String(uri || '');
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch (_a) {
        throw new Error(`${label} is not a MongoDB URI`);
    }
    const host = parsed.hostname.toLowerCase();
    const name = parsed.pathname.replace(/^\//, '').toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost') {
        throw new Error(`Refusing ${label}: host is not local`);
    }
    if (!name || /prod|cosmos|azure|live/.test(name)) {
        throw new Error(`Refusing ${label}: database name is not a disposable test database`);
    }
}
function blankEmailProviders() {
    for (const key of [
        'SMTP_HOST', 'SMTP_HOST_MANTIS', 'SMTP_USER', 'SMTP_USER_MANTIS', 'SMTP_PASS', 'SMTP_PASS_MANTIS',
        'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
        'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
        'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS'
    ]) {
        delete process.env[key];
    }
}
function financeReq(userId, companyId, paymentId, body = {}) {
    return {
        user: { userId, companyId, role: 'admin', roles: ['admin'] },
        params: { id: paymentId },
        body
    };
}
function invoke(handler, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = {
            statusCode: 200,
            body: undefined,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; }
        };
        yield handler(req, res);
        return res;
    });
}
function runPureCases() {
    assert((0, paymentReversalPolicy_1.isReversalDocument)({ reversalOfPaymentId: 'a', amount: 10 }) === true, 'reversalOfPaymentId marks a reversal document');
    assert((0, paymentReversalPolicy_1.isReversalDocument)({ amount: -1 }) === true, 'a negative amount marks a reversal document');
    assert((0, paymentReversalPolicy_1.canStartPaymentReversal)({ reversalOfPaymentId: 'a', status: 'completed', postingStatus: 'posted' }).ok === false, 'a reversal document cannot start another reversal');
    assert((0, paymentReversalPolicy_1.canStartPaymentReversal)({ reversalPaymentId: 'rev', status: 'completed', postingStatus: 'posted' }).ok === false, 'an original with a reversal cannot start another reversal');
    assert((0, paymentReversalPolicy_1.canStartPaymentReversal)({ reversalState: 'reversal_incomplete', status: 'completed', postingStatus: 'posted' }).ok === false, 'an incomplete reversal cannot start another reversal');
    assert((0, paymentReversalPolicy_1.canStartPaymentReversal)({ status: 'completed', postingStatus: 'posted', amount: 10 }).ok === true, 'an ordinary posted payment can be reversed');
    assert((0, paymentReversalPolicy_1.hasReversalInEffect)({ reversalState: 'reversal_in_progress', status: 'completed', amount: 10 }) === true, 'in-progress reversal is in effect');
    assert((0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)({
        status: 'completed', amount: 1800, reversalPaymentId: 'rev', postingStatus: 'posted'
    }).reason === 'reversed_original', 'a reversed original is denied ordinary posting');
    assert((0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)({
        status: 'completed', amount: -1800, reversalOfPaymentId: 'orig', postingStatus: 'posted'
    }).reason === 'reversal_row', 'a reversal row is denied ordinary posting');
    assert((0, accountingPostingPolicy_1.shouldAttemptAccountingReversal)({ reversalOfPaymentId: 'orig', amount: -1 }) === false, 'accounting reversal does not run on a reversal document');
    assert((0, accountingPostingPolicy_1.shouldAttemptAccountingReversal)({ reversalState: 'reversal_incomplete', status: 'completed', amount: 10 }) === true, 'an incomplete original can resume reversal');
    const unrelated = (0, journalDuplicateKey_1.matchingJournalIdentity)({
        code: 11000,
        keyPattern: { description: 1 },
        keyValue: { description: 'unrelated' }
    }, [{ companyId: 'c', sourceModule: 'payment', sourceId: 'p:reversal', reference: 'REV-P' }]);
    assert(unrelated == null, 'an unrelated duplicate key is not treated as a successful reversal');
    assert((0, journalDuplicateKey_1.matchingJournalIdentity)({ code: 11000, message: 'E11000 duplicate key error' }, [{
            companyId: 'c', sourceModule: 'payment', sourceId: 'p:reversal', reference: 'REV-P'
        }]) == null, 'a duplicate key without index metadata fails closed');
    const reversedFilter = { companyId: 'c' };
    (0, paymentReversalPolicy_1.applyPaymentStatusFilter)(reversedFilter, 'reversed');
    assert(Array.isArray(reversedFilter.$and) && reversedFilter.status == null, 'reversed filter uses reversal metadata');
    const pendingFilter = {};
    (0, paymentReversalPolicy_1.applyPaymentStatusFilter)(pendingFilter, 'pending');
    assert(pendingFilter.status === 'pending', 'pending filter stays a status filter');
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10;
        runPureCases();
        blankEmailProviders();
        process.env.MANTIS_TEST_SEAM = '1';
        process.env.NODE_ENV = 'development';
        delete process.env.ACCOUNTING_PERIOD_LOCK_BEFORE;
        assertDisposable(DB, 'remediation database');
        assertDisposable(ACCOUNTING_DB, 'remediation accounting database');
        try {
            yield mongoose_1.default.connect(DB, { serverSelectionTimeoutMS: 4000 });
        }
        catch (error) {
            notes.push(`INTEGRATION SKIPPED: local MongoDB unavailable (${(error === null || error === void 0 ? void 0 : error.message) || error}). Pure cases still ran. This is not a Cosmos DB result.`);
            finish();
            return;
        }
        stage('connected');
        yield mongoose_1.default.connection.dropDatabase();
        stage('main database reset');
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB, { serverSelectionTimeoutMS: 4000 });
        stage('accounting connected');
        yield database_1.accountingConnection.dropDatabase();
        stage('accounting database reset');
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        stage('tax rules ready');
        yield Payment_1.Payment.syncIndexes();
        yield JournalEntry_1.JournalEntry.syncIndexes();
        yield JournalLine_1.JournalLine.syncIndexes();
        yield VatRecord_1.VatRecord.syncIndexes();
        yield TaxObligation_1.TaxObligation.syncIndexes();
        const user = yield User_1.User.create({
            email: 'reversal-remediation@example.test',
            password: 'test-pass-1',
            firstName: 'Remediation',
            lastName: 'Accountant',
            role: 'admin',
            roles: ['admin'],
            isActive: true,
            sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Remediation Agency',
            address: '1 Remediation Street',
            phone: '0770000091',
            email: 'remediation@example.test',
            registrationNumber: 'REM-REV-1',
            tinNumber: 'REM-REV-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            workspaceType: 'agency',
            taxProfile: { vatRegistered: true, vatNumber: 'ZW-REM', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
        });
        const property = yield Property_1.Property.create({
            companyId: company._id,
            ownerId: user._id,
            name: 'Remediation House',
            address: '1 Remediation Road',
            rentalType: 'management',
            rent: 1800,
            commission: 15,
            vatOnCommission: true,
            vatCommissionTreatment: 'exclusive'
        });
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Remediation',
            lastName: 'Tenant',
            email: 'remediation-tenant@example.test',
            phone: '0771111191',
            companyId: company._id,
            ownerId: user._id,
            status: 'Active'
        });
        const owner = yield PropertyOwner_1.PropertyOwner.create({
            email: 'remediation-owner@example.test',
            password: 'test-pass-1',
            firstName: 'Olive',
            lastName: 'Owner',
            phone: '0772222291',
            companyId: company._id,
            properties: [property._id],
            active: true
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
        function postedPayment(referenceNumber_1) {
            return __awaiter(this, arguments, void 0, function* (referenceNumber, extra = {}) {
                const payment = yield Payment_1.Payment.create(Object.assign({ companyId: company._id, propertyId: property._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id, propertyType: 'residential', amount: 1800, depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed', paymentDate: PAYMENT_DATE, rentalPeriodMonth: 10, rentalPeriodYear: 2026, transactionDomain: 'RENTAL', commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false, applyVatOnCommission: flags.vatOnCommission, vatOnCommissionRate: flags.vatRate, vatCommissionTreatment: flags.vatTreatment, commissionDetails: (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc), referenceNumber, idempotencyKey: `rem:${referenceNumber}:${new mongoose_1.default.Types.ObjectId().toString()}` }, extra));
                stage(`posting ${referenceNumber}`);
                yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(payment._id), { createdBy: String(user._id) });
                stage(`posted ${referenceNumber}`);
                return Payment_1.Payment.findById(payment._id);
            });
        }
        stage('fixtures ready');
        const payment = yield postedPayment('REM-MAIN');
        stage('main payment posted');
        const originalAmount = Number(payment === null || payment === void 0 ? void 0 : payment.amount);
        const originalDate = new Date((payment === null || payment === void 0 ? void 0 : payment.paymentDate) || 0).toISOString();
        const originalMethod = String((payment === null || payment === void 0 ? void 0 : payment.paymentMethod) || '');
        const originalJournal = yield JournalEntry_1.JournalEntry.findOne({ sourceId: String(payment === null || payment === void 0 ? void 0 : payment._id), sourceModule: 'payment' }).lean();
        const originalLines = yield JournalLine_1.JournalLine.find({ journalEntryId: originalJournal === null || originalJournal === void 0 ? void 0 : originalJournal._id }).lean();
        const originalDebit = originalLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        const originalCredit = originalLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
        const obligationBefore = yield TaxObligation_1.TaxObligation.findOne({ paymentId: payment === null || payment === void 0 ? void 0 : payment._id, reversalOf: null }).lean();
        const vatBefore = yield VatRecord_1.VatRecord.findOne({ transactionId: String(payment === null || payment === void 0 ? void 0 : payment._id) }).lean();
        const levy = yield LevyPayment_1.LevyPayment.create({
            paymentType: 'levy',
            propertyId: property._id,
            companyId: company._id,
            paymentDate: PAYMENT_DATE,
            paymentMethod: 'bank_transfer',
            amount: 120,
            referenceNumber: 'LEVY-REM-MAIN',
            notes: 'Original levy note',
            processedBy: user._id,
            status: 'completed',
            currency: 'USD',
            parentPaymentId: payment === null || payment === void 0 ? void 0 : payment._id
        });
        yield Payment_1.Payment.updateOne({ _id: payment === null || payment === void 0 ? void 0 : payment._id }, { $set: { linkedLevyPaymentId: levy._id } });
        const accountBefore = yield PropertyAccount_1.default.findOne({ propertyId: property._id, isArchived: { $ne: true } });
        assert(Boolean(accountBefore), 'posted rental created a property account');
        yield PropertyAccount_1.default.updateOne({ _id: accountBefore === null || accountBefore === void 0 ? void 0 : accountBefore._id }, {
            $push: {
                passThroughAccounts: {
                    type: 'BODY_CORPORATE',
                    label: 'Body corporate',
                    transactions: [{
                            type: 'collection',
                            amount: 120,
                            date: PAYMENT_DATE,
                            paymentId: payment === null || payment === void 0 ? void 0 : payment._id,
                            chargeTypeCode: 'RETIRED_LEVY_CODE',
                            idempotencyKey: `payment:${String(payment === null || payment === void 0 ? void 0 : payment._id)}:pt:levy`,
                            description: 'Body corporate levy',
                            referenceNumber: 'LEVY-REM-MAIN',
                            status: 'completed'
                        }],
                    totalCollected: 120,
                    totalPaid: 0,
                    runningBalance: 120
                }
            }
        });
        yield OwnerRentNotice_1.OwnerRentNotice.create({
            companyId: company._id,
            ownerId: owner._id,
            paymentId: payment === null || payment === void 0 ? void 0 : payment._id,
            propertyId: property._id,
            idempotencyKey: `owner-rent-payment:${String(payment === null || payment === void 0 ? void 0 : payment._id)}`,
            status: 'SENT'
        });
        stage('reversing main payment');
        const first = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(payment === null || payment === void 0 ? void 0 : payment._id), { reason: 'incorrect allocation' }));
        stage(`main reversal status ${first.statusCode}`);
        assert(first.statusCode === 200, `successful reversal returns 200, got ${first.statusCode} ${((_a = first.body) === null || _a === void 0 ? void 0 : _a.message) || ''} ${JSON.stringify(((_b = first.body) === null || _b === void 0 ? void 0 : _b.warnings) || [])}`);
        assert(((_c = first.body) === null || _c === void 0 ? void 0 : _c.outcome) === 'reversed', `successful reversal outcome is reversed, got ${(_d = first.body) === null || _d === void 0 ? void 0 : _d.outcome}`);
        const revCount = yield Payment_1.Payment.countDocuments({ reversalOfPaymentId: payment === null || payment === void 0 ? void 0 : payment._id, amount: { $lt: 0 } });
        const corrCount = yield Payment_1.Payment.countDocuments({ companyId: company._id, referenceNumber: 'CORR-REM-MAIN', isCorrectionEntry: true });
        assert(revCount === 1, `one REV payment, got ${revCount}`);
        assert(corrCount === 1, `one CORR draft, got ${corrCount}`);
        const originalAfter = yield Payment_1.Payment.findById(payment === null || payment === void 0 ? void 0 : payment._id).lean();
        assert(Number(originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.amount) === originalAmount, 'original amount is unchanged');
        assert(new Date((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.paymentDate) || 0).toISOString() === originalDate, 'original date is unchanged');
        assert(String((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.paymentMethod) || '') === originalMethod, 'original method is unchanged');
        assert(String((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.status) || '') === 'completed', 'original status remains the historical completed receipt');
        assert(String((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.reversalState) || '') === 'reversed', `original reversal state is reversed, got ${originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.reversalState}`);
        const reversal = yield Payment_1.Payment.findOne({ reversalOfPaymentId: payment === null || payment === void 0 ? void 0 : payment._id, amount: { $lt: 0 } }).lean();
        const corrected = yield Payment_1.Payment.findOne({ referenceNumber: 'CORR-REM-MAIN', companyId: company._id }).lean();
        assert(String((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.reversalPaymentId) || '') === String(reversal === null || reversal === void 0 ? void 0 : reversal._id), 'original points at the reversal');
        assert(String((originalAfter === null || originalAfter === void 0 ? void 0 : originalAfter.correctedPaymentId) || '') === String(corrected === null || corrected === void 0 ? void 0 : corrected._id), 'original points at the correction draft');
        assert(String((corrected === null || corrected === void 0 ? void 0 : corrected.status) || '') === 'pending', 'correction draft stays pending');
        near(Number(reversal === null || reversal === void 0 ? void 0 : reversal.amount), -1800, 'reversal amount is the negative of the original');
        const retry = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(payment === null || payment === void 0 ? void 0 : payment._id), { reason: 'incorrect allocation' }));
        assert(retry.statusCode === 200, `repeat reversal stays successful, got ${retry.statusCode} ${((_e = retry.body) === null || _e === void 0 ? void 0 : _e.message) || ''}`);
        assert((yield Payment_1.Payment.countDocuments({ reversalOfPaymentId: payment === null || payment === void 0 ? void 0 : payment._id, amount: { $lt: 0 } })) === 1, 'repeat reversal does not create another REV');
        assert((yield Payment_1.Payment.countDocuments({ referenceNumber: 'CORR-REM-MAIN', companyId: company._id })) === 1, 'repeat reversal does not create another CORR');
        const ofReversal = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(reversal === null || reversal === void 0 ? void 0 : reversal._id), { reason: 'should fail' }));
        assert(ofReversal.statusCode === 409 && ((_f = ofReversal.body) === null || _f === void 0 ? void 0 : _f.code) === 'REVERSAL_OF_REVERSAL', `reversing a REV is rejected, got ${ofReversal.statusCode} ${(_g = ofReversal.body) === null || _g === void 0 ? void 0 : _g.code}`);
        const directRev = yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(reversal === null || reversal === void 0 ? void 0 : reversal._id), { reason: 'direct' });
        assert(directRev.status === 'failed', 'direct accounting reversal of a REV fails before ledger writes');
        const repost = yield (0, paymentAccountingOrchestrator_1.postPaymentAccounting)(String(payment === null || payment === void 0 ? void 0 : payment._id), { createdBy: String(user._id) });
        assert(repost.status === 'skipped' && repost.reason === 'reversed_original', `repost of a reversed original is skipped, got ${repost.status} ${repost.reason}`);
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(payment === null || payment === void 0 ? void 0 : payment._id), sourceModule: 'payment' })) === 1, 'repost does not create another original journal');
        const journalAfter = yield JournalEntry_1.JournalEntry.findById(originalJournal === null || originalJournal === void 0 ? void 0 : originalJournal._id).lean();
        assert((journalAfter === null || journalAfter === void 0 ? void 0 : journalAfter.status) === 'posted' && String(journalAfter === null || journalAfter === void 0 ? void 0 : journalAfter.reference) === String(originalJournal === null || originalJournal === void 0 ? void 0 : originalJournal.reference), 'original journal reference and status stay');
        const originalLinesAfter = yield JournalLine_1.JournalLine.find({ journalEntryId: originalJournal === null || originalJournal === void 0 ? void 0 : originalJournal._id }).lean();
        near(originalLinesAfter.reduce((sum, line) => sum + Number(line.debit || 0), 0), originalDebit, 'original journal debits stay');
        const reversalJournal = yield JournalEntry_1.JournalEntry.findOne({ sourceId: `${payment === null || payment === void 0 ? void 0 : payment._id}:reversal` }).lean();
        const reversalLines = yield JournalLine_1.JournalLine.find({ journalEntryId: reversalJournal === null || reversalJournal === void 0 ? void 0 : reversalJournal._id }).lean();
        const reversalDebit = reversalLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        const reversalCredit = reversalLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
        near(reversalDebit, reversalCredit, 'reversal journal balances');
        near(reversalDebit, originalCredit, 'reversal debits equal original credits');
        near(reversalCredit, originalDebit, 'reversal credits equal original debits');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: `${payment === null || payment === void 0 ? void 0 : payment._id}:reversal` })) === 1, 'retry leaves one reversal journal');
        const obligationAfter = yield TaxObligation_1.TaxObligation.findById(obligationBefore === null || obligationBefore === void 0 ? void 0 : obligationBefore._id).lean();
        near(Number((obligationAfter === null || obligationAfter === void 0 ? void 0 : obligationAfter.taxAmount) || 0), Number((obligationBefore === null || obligationBefore === void 0 ? void 0 : obligationBefore.taxAmount) || 0), 'original tax amount stays');
        const taxCounters = yield TaxObligation_1.TaxObligation.find({ reversalOf: obligationBefore === null || obligationBefore === void 0 ? void 0 : obligationBefore._id }).lean();
        assert(taxCounters.length === 1, `one linked tax reversal, got ${taxCounters.length}`);
        near(yield (0, taxObligationService_1.outstandingForObligation)(String(obligationBefore === null || obligationBefore === void 0 ? void 0 : obligationBefore._id)), 0, 'reversed tax obligation has no outstanding balance');
        const vatRows = yield VatRecord_1.VatRecord.find({ transactionId: String(payment === null || payment === void 0 ? void 0 : payment._id) }).lean();
        assert(vatRows.length === 1, `one VAT record, got ${vatRows.length}`);
        near(Number(((_h = vatRows[0]) === null || _h === void 0 ? void 0 : _h.vatCollected) || 0), Number((vatBefore === null || vatBefore === void 0 ? void 0 : vatBefore.vatCollected) || 0), 'VAT amount stays');
        assert(String(((_j = vatRows[0]) === null || _j === void 0 ? void 0 : _j.status) || '') === 'reversed', 'VAT record is marked reversed without a second positive row');
        const propertyAccount = yield PropertyAccount_1.default.findOne({ propertyId: property._id, isArchived: { $ne: true } }).lean();
        const ownerRows = ((propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.transactions) || []).filter((row) => String(row.paymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id) || String(row.reversesPaymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id));
        const ownerIncome = ownerRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const ownerCounter = ownerRows.filter((row) => String(row.idempotencyKey || '').includes(':owner-income:reversal:')).reduce((sum, row) => sum + Number(row.amount || 0), 0);
        near(ownerIncome - ownerCounter, 0, 'owner income plus reversal counter is zero');
        assert(ownerRows.filter((row) => String(row.idempotencyKey || '').includes(':owner-income:reversal:')).length === 1, 'owner income counter is not duplicated');
        const agentAccount = yield AgentAccount_1.AgentAccount.findOne({ agentId: user._id }).lean();
        const commissionRows = ((agentAccount === null || agentAccount === void 0 ? void 0 : agentAccount.transactions) || []).filter((row) => row.type === 'commission' && String(row.paymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id));
        const penaltyRows = ((agentAccount === null || agentAccount === void 0 ? void 0 : agentAccount.transactions) || []).filter((row) => row.type === 'penalty' && String(row.paymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id));
        const commissionTotal = commissionRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const penaltyTotal = penaltyRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        assert(commissionRows.length > 0, 'original agent commission rows exist');
        assert(penaltyRows.length === commissionRows.length, 'each original commission row has one penalty');
        near(penaltyTotal, commissionTotal, 'agent penalty uses the original posted commission');
        const companyAccount = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: company._id }).lean();
        const companyOriginal = ((companyAccount === null || companyAccount === void 0 ? void 0 : companyAccount.transactions) || []).filter((row) => String(row.paymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id) && !row.reversesPaymentId && Number(row.amount || 0) > 0);
        const companyCounters = ((companyAccount === null || companyAccount === void 0 ? void 0 : companyAccount.transactions) || []).filter((row) => String(row.reversesPaymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id));
        near(companyCounters.reduce((sum, row) => sum + Number(row.amount || 0), 0), -companyOriginal.reduce((sum, row) => sum + Number(row.amount || 0), 0), 'company income is countered once');
        assert(companyCounters.length === 1, `one company reversal, got ${companyCounters.length}`);
        const buckets = (propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.passThroughAccounts) || [];
        const passRows = buckets.flatMap((bucket) => bucket.transactions || []).filter((row) => String(row.paymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id));
        const collections = passRows.filter((row) => row.type === 'collection');
        const collectionReversals = passRows.filter((row) => row.type === 'collection_reversal');
        const disbursements = passRows.filter((row) => row.type === 'payment');
        assert(collections.length === 1 && Number((_k = collections[0]) === null || _k === void 0 ? void 0 : _k.amount) === 120, 'original pass-through collection remains');
        assert(String(((_l = collections[0]) === null || _l === void 0 ? void 0 : _l.chargeTypeCode) || '') === 'RETIRED_LEVY_CODE', 'pass-through reversal keeps the original charge code');
        assert(collectionReversals.length === 1 && Number((_m = collectionReversals[0]) === null || _m === void 0 ? void 0 : _m.amount) === 120, 'one pass-through collection counter');
        assert(disbursements.length === 0, 'reversing a collection does not increase paid-onward');
        const passNet = yield propertyAccountService_1.default.getCompanyPassThroughSummary(String(company._id));
        near(Number((propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.passThroughPaid) || 0), 0, 'stored pass-through paid stays zero');
        notes.push(`pass-through summary collected=${passNet === null || passNet === void 0 ? void 0 : passNet.totalCollected} paid=${passNet === null || passNet === void 0 ? void 0 : passNet.totalPaid}`);
        const levyAfter = yield LevyPayment_1.LevyPayment.findById(levy._id).lean();
        const levyContra = yield LevyPayment_1.LevyPayment.find({ reversalOfLevyPaymentId: levy._id }).lean();
        assert(String((levyAfter === null || levyAfter === void 0 ? void 0 : levyAfter.status) || '') === 'completed', 'original levy status stays completed');
        assert(String((levyAfter === null || levyAfter === void 0 ? void 0 : levyAfter.notes) || '') === 'Original levy note', 'original levy notes stay');
        assert(levyContra.length === 1, `one levy contra, got ${levyContra.length}`);
        near(Number((_o = levyContra[0]) === null || _o === void 0 ? void 0 : _o.amount), -120, 'levy contra uses the original amount');
        assert(String((levyAfter === null || levyAfter === void 0 ? void 0 : levyAfter.reversalLevyPaymentId) || '') === String((_p = levyContra[0]) === null || _p === void 0 ? void 0 : _p._id), 'original levy points at its contra');
        const reversalNoticeKey = `owner-rent-reversal:${String(payment === null || payment === void 0 ? void 0 : payment._id)}:${String(reversal === null || reversal === void 0 ? void 0 : reversal._id)}`;
        const originalNotice = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ idempotencyKey: `owner-rent-payment:${String(payment === null || payment === void 0 ? void 0 : payment._id)}` }).lean();
        const reversalNotice = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ idempotencyKey: reversalNoticeKey }).lean();
        assert((originalNotice === null || originalNotice === void 0 ? void 0 : originalNotice.status) === 'SENT', 'original owner notice remains');
        assert((reversalNotice === null || reversalNotice === void 0 ? void 0 : reversalNotice.status) === 'SENT', `reversal notice was sent, got ${reversalNotice === null || reversalNotice === void 0 ? void 0 : reversalNotice.status}`);
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(originalAfter, 'incorrect allocation');
        assert((yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({ idempotencyKey: reversalNoticeKey })) === 1, 'reversal notice retry does not send a second row');
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentPayment)(reversal, { accountingComplete: true });
        assert((yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({ idempotencyKey: `owner-rent-payment:${String(reversal === null || reversal === void 0 ? void 0 : reversal._id)}` })) === 0, 'a negative REV does not send a rent-received notice');
        const individualRows = yield IndividualVatRecord_1.IndividualVatRecord.countDocuments({ companyId: company._id });
        assert(individualRows === 0, `agency company has no individual VAT rows, got ${individualRows}`);
        ledgerEvidence.push(JSON.stringify({
            rent: originalAmount,
            ownerIncome,
            ownerCounter,
            agentCommission: commissionTotal,
            agentPenalty: penaltyTotal,
            companyIncome: companyOriginal.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            companyCounter: companyCounters.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            journalOriginalDebit: originalDebit,
            journalReversalDebit: reversalDebit,
            taxAmount: Number((obligationBefore === null || obligationBefore === void 0 ? void 0 : obligationBefore.taxAmount) || 0),
            vatCollected: Number((vatBefore === null || vatBefore === void 0 ? void 0 : vatBefore.vatCollected) || 0),
            passThroughCollected: 120,
            passThroughReversed: 120,
            passThroughPaid: disbursements.length,
            levy: 120
        }));
        const concurrent = yield postedPayment('REM-CONCURRENT');
        const concurrentResults = yield Promise.all([
            invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(concurrent === null || concurrent === void 0 ? void 0 : concurrent._id), { reason: 'concurrent a' })),
            invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(concurrent === null || concurrent === void 0 ? void 0 : concurrent._id), { reason: 'concurrent b' }))
        ]);
        const concurrentRevs = yield Payment_1.Payment.countDocuments({ reversalOfPaymentId: concurrent === null || concurrent === void 0 ? void 0 : concurrent._id, amount: { $lt: 0 } });
        assert(concurrentRevs === 1, `concurrent requests create one REV, got ${concurrentRevs}`);
        assert(concurrentResults.some((result) => result.statusCode === 200 || result.statusCode === 202), 'one concurrent request is accepted');
        const lockedPeriod = yield postedPayment('REM-PERIOD');
        process.env.ACCOUNTING_PERIOD_LOCK_BEFORE = '2026-12-01T00:00:00.000Z';
        const periodBlocked = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(lockedPeriod === null || lockedPeriod === void 0 ? void 0 : lockedPeriod._id), { reason: 'period' }));
        delete process.env.ACCOUNTING_PERIOD_LOCK_BEFORE;
        assert(periodBlocked.statusCode === 409, `accounting period lock rejects reversal, got ${periodBlocked.statusCode}`);
        assert((yield Payment_1.Payment.countDocuments({ reversalOfPaymentId: lockedPeriod === null || lockedPeriod === void 0 ? void 0 : lockedPeriod._id })) === 0, 'period lock does not create a reversal');
        const vatLocked = yield postedPayment('REM-VAT-LOCK');
        const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
        yield VatReturn_1.VatReturn.create({ companyId: company._id, filingPeriod: period, status: 'SUBMITTED' });
        const vatBlocked = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(vatLocked === null || vatLocked === void 0 ? void 0 : vatLocked._id), { reason: 'vat period' }));
        yield VatReturn_1.VatReturn.deleteMany({ companyId: company._id, filingPeriod: period });
        assert(vatBlocked.statusCode === 409, `locked VAT period rejects reversal, got ${vatBlocked.statusCode} ${((_q = vatBlocked.body) === null || _q === void 0 ? void 0 : _q.message) || ''}`);
        assert((yield Payment_1.Payment.countDocuments({ reversalOfPaymentId: vatLocked === null || vatLocked === void 0 ? void 0 : vatLocked._id })) === 0, 'VAT lock does not create a reversal');
        const journalFail = yield postedPayment('REM-JOURNAL', { notes: 'PHASE27_FAIL_JOURNAL' });
        const journalFirst = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(journalFail === null || journalFail === void 0 ? void 0 : journalFail._id), { reason: 'journal seam' }));
        assert(journalFirst.statusCode === 202 && ((_r = journalFirst.body) === null || _r === void 0 ? void 0 : _r.outcome) === 'reversal_incomplete', `journal failure stays incomplete, got ${journalFirst.statusCode} ${(_s = journalFirst.body) === null || _s === void 0 ? void 0 : _s.outcome}`);
        const journalRetry = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(journalFail === null || journalFail === void 0 ? void 0 : journalFail._id), { reason: 'journal retry' }));
        assert(journalRetry.statusCode === 200, `journal retry settles, got ${journalRetry.statusCode} ${((_t = journalRetry.body) === null || _t === void 0 ? void 0 : _t.message) || ''} ${JSON.stringify(((_u = journalRetry.body) === null || _u === void 0 ? void 0 : _u.warnings) || [])}`);
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: `${journalFail === null || journalFail === void 0 ? void 0 : journalFail._id}:reversal` })) === 1, 'journal retry does not duplicate the reversal journal');
        const journalState = yield Payment_1.Payment.findById(journalFail === null || journalFail === void 0 ? void 0 : journalFail._id).select('reversalState').lean();
        assert(String((journalState === null || journalState === void 0 ? void 0 : journalState.reversalState) || '') === 'reversed', 'journal retry finishes the reversal');
        const missingJournal = yield Payment_1.Payment.create({
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            agentId: user._id,
            processedBy: user._id,
            propertyType: 'residential',
            amount: 900,
            paymentType: 'rental',
            paymentMethod: 'cash',
            rentalPeriodMonth: 10,
            rentalPeriodYear: 2026,
            status: 'completed',
            postingStatus: 'posted',
            paymentDate: PAYMENT_DATE,
            transactionDomain: 'RENTAL',
            commissionFinalized: true,
            commissionDetails: (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc),
            referenceNumber: 'REM-NO-JOURNAL',
            idempotencyKey: `rem:no-journal:${new mongoose_1.default.Types.ObjectId().toString()}`
        });
        let missingThrew = false;
        try {
            yield accountingIntegrationService_1.default.postReversalJournal(missingJournal, { reason: 'missing journal' });
        }
        catch (error) {
            missingThrew = String((error === null || error === void 0 ? void 0 : error.message) || '').includes('Original journal is missing');
        }
        assert(missingThrew, 'a missing original journal fails instead of being rebuilt');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: `${missingJournal._id}:reversal` })) === 0, 'missing journal does not create a synthesized reversal');
        const crashed = yield postedPayment('REM-CRASH');
        const crashedRev = yield Payment_1.Payment.create({
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            agentId: user._id,
            processedBy: user._id,
            propertyType: 'residential',
            amount: -1800,
            paymentType: 'rental',
            paymentMethod: 'bank_transfer',
            rentalPeriodMonth: 10,
            rentalPeriodYear: 2026,
            status: 'completed',
            postingStatus: 'posted',
            paymentDate: new Date(),
            transactionDomain: 'RENTAL',
            commissionFinalized: true,
            commissionDetails: crashed === null || crashed === void 0 ? void 0 : crashed.commissionDetails,
            referenceNumber: 'REV-REM-CRASH',
            reversalOfPaymentId: crashed === null || crashed === void 0 ? void 0 : crashed._id,
            isCorrectionEntry: true,
            idempotencyKey: `rem:crash-rev:${new mongoose_1.default.Types.ObjectId().toString()}`
        });
        yield Payment_1.Payment.updateOne({ _id: crashed === null || crashed === void 0 ? void 0 : crashed._id }, { $set: { reversalPaymentId: crashedRev._id, reversalState: 'reversal_in_progress', reversalLockAt: new Date() } });
        const resumed = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(crashed === null || crashed === void 0 ? void 0 : crashed._id), { reason: 'resume missing draft' }));
        assert(resumed.statusCode === 200, `resume creates the missing draft and settles, got ${resumed.statusCode} ${((_v = resumed.body) === null || _v === void 0 ? void 0 : _v.message) || ''}`);
        assert((yield Payment_1.Payment.countDocuments({ reversalOfPaymentId: crashed === null || crashed === void 0 ? void 0 : crashed._id, amount: { $lt: 0 } })) === 1, 'resume does not create a second REV');
        assert((yield Payment_1.Payment.countDocuments({ referenceNumber: 'CORR-REM-CRASH', companyId: company._id })) === 1, 'resume creates one correction draft');
        const stale = yield postedPayment('REM-STALE');
        yield Payment_1.Payment.updateOne({ _id: stale === null || stale === void 0 ? void 0 : stale._id }, { $set: { reversalState: 'reversal_in_progress', reversalLockAt: new Date(Date.now() - 61 * 1000) } });
        const staleResult = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(stale === null || stale === void 0 ? void 0 : stale._id), { reason: 'stale lock' }));
        assert(staleResult.statusCode === 200, `stale lock can be taken over, got ${staleResult.statusCode} ${((_w = staleResult.body) === null || _w === void 0 ? void 0 : _w.message) || ''}`);
        assert((yield Payment_1.Payment.countDocuments({ reversalOfPaymentId: stale === null || stale === void 0 ? void 0 : stale._id, amount: { $lt: 0 } })) === 1, 'stale takeover creates one REV');
        const fresh = yield postedPayment('REM-FRESH');
        yield Payment_1.Payment.updateOne({ _id: fresh === null || fresh === void 0 ? void 0 : fresh._id }, { $set: { reversalState: 'reversal_in_progress', reversalLockAt: new Date() } });
        const freshResult = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(fresh === null || fresh === void 0 ? void 0 : fresh._id), { reason: 'fresh lock' }));
        assert(freshResult.statusCode === 200, `an in-progress lock with no REV is abandoned and can be retried, got ${freshResult.statusCode} ${((_x = freshResult.body) === null || _x === void 0 ? void 0 : _x.message) || ''}`);
        assert((yield Payment_1.Payment.countDocuments({ reversalOfPaymentId: fresh === null || fresh === void 0 ? void 0 : fresh._id, amount: { $lt: 0 } })) === 1, 'abandoned fresh lock creates one REV');
        let duplicateRejected = false;
        let duplicateDetail = '';
        try {
            yield Payment_1.Payment.create({
                companyId: company._id,
                propertyId: property._id,
                tenantId: tenant._id,
                agentId: user._id,
                processedBy: user._id,
                propertyType: 'residential',
                amount: -1,
                commissionDetails: (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc),
                paymentType: 'rental',
                paymentMethod: 'cash',
                rentalPeriodMonth: 10,
                rentalPeriodYear: 2026,
                status: 'completed',
                paymentDate: new Date(),
                transactionDomain: 'RENTAL',
                referenceNumber: 'REV-DUP',
                reversalOfPaymentId: payment === null || payment === void 0 ? void 0 : payment._id,
                idempotencyKey: `rem:dup:${new mongoose_1.default.Types.ObjectId().toString()}`
            });
        }
        catch (error) {
            duplicateRejected = Number(error === null || error === void 0 ? void 0 : error.code) === 11000;
            duplicateDetail = String((error === null || error === void 0 ? void 0 : error.code) || (error === null || error === void 0 ? void 0 : error.message) || error);
        }
        assert(duplicateRejected, `the local partial unique index rejects a second full reversal (${duplicateDetail || 'insert succeeded'})`);
        const correctedDraft = yield Payment_1.Payment.findById(corrected === null || corrected === void 0 ? void 0 : corrected._id);
        yield Payment_1.Payment.updateOne({ _id: payment === null || payment === void 0 ? void 0 : payment._id }, { $set: { reversalState: 'reversal_in_progress' } });
        const blockedProgress = yield invoke(paymentController_1.updatePayment, financeReq(String(user._id), String(company._id), String(corrected === null || corrected === void 0 ? void 0 : corrected._id), { status: 'completed' }));
        assert(blockedProgress.statusCode === 409 && ((_y = blockedProgress.body) === null || _y === void 0 ? void 0 : _y.code) === 'REVERSAL_NOT_SETTLED', `completion during reversal_in_progress is rejected, got ${blockedProgress.statusCode} ${(_z = blockedProgress.body) === null || _z === void 0 ? void 0 : _z.code}`);
        yield Payment_1.Payment.updateOne({ _id: payment === null || payment === void 0 ? void 0 : payment._id }, { $set: { reversalState: 'reversal_incomplete' } });
        const blockedIncomplete = yield invoke(paymentController_1.updatePayment, financeReq(String(user._id), String(company._id), String(corrected === null || corrected === void 0 ? void 0 : corrected._id), { postingStatus: 'posted' }));
        assert(blockedIncomplete.statusCode === 409 && ((_0 = blockedIncomplete.body) === null || _0 === void 0 ? void 0 : _0.code) === 'REVERSAL_NOT_SETTLED', `postingStatus bypass during reversal_incomplete is rejected, got ${blockedIncomplete.statusCode} ${(_1 = blockedIncomplete.body) === null || _1 === void 0 ? void 0 : _1.code}`);
        const blockedStatus = yield invoke(paymentController_1.updatePaymentStatus, financeReq(String(user._id), String(company._id), String(corrected === null || corrected === void 0 ? void 0 : corrected._id), { status: 'completed' }));
        assert(blockedStatus.statusCode === 409 && ((_2 = blockedStatus.body) === null || _2 === void 0 ? void 0 : _2.code) === 'REVERSAL_NOT_SETTLED', `status route bypass is rejected, got ${blockedStatus.statusCode} ${(_3 = blockedStatus.body) === null || _3 === void 0 ? void 0 : _3.code}`);
        const otherCompany = yield Company_1.Company.create({
            name: 'Other Remediation Co',
            address: '2 Remediation Street',
            phone: '0770000092',
            email: 'other-remediation@example.test',
            registrationNumber: 'REM-REV-2',
            tinNumber: 'REM-REV-TIN-2',
            country: 'Zimbabwe',
            ownerId: user._id,
            workspaceType: 'agency'
        });
        let crossCompany = '';
        try {
            yield (0, paymentReversalPolicy_1.assertCorrectionDraftCanComplete)(correctedDraft, String(otherCompany._id));
        }
        catch (error) {
            crossCompany = String((error === null || error === void 0 ? void 0 : error.code) || '');
        }
        assert(crossCompany === 'CORRECTION_LINK_MISSING' || crossCompany === 'CORRECTION_COMPANY_MISMATCH', `cross-company completion is rejected, got ${crossCompany}`);
        const orphan = yield Payment_1.Payment.create({
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            agentId: user._id,
            processedBy: user._id,
            propertyType: 'residential',
            amount: 1800,
            paymentType: 'rental',
            paymentMethod: 'cash',
            rentalPeriodMonth: 10,
            rentalPeriodYear: 2026,
            commissionDetails: (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc),
            status: 'pending',
            postingStatus: 'draft',
            paymentDate: PAYMENT_DATE,
            transactionDomain: 'RENTAL',
            referenceNumber: 'CORR-ORPHAN',
            isCorrectionEntry: true,
            idempotencyKey: `rem:orphan:${new mongoose_1.default.Types.ObjectId().toString()}`
        });
        let orphanCode = '';
        try {
            yield (0, paymentReversalPolicy_1.assertCorrectionDraftCanComplete)(orphan, String(company._id));
        }
        catch (error) {
            orphanCode = String((error === null || error === void 0 ? void 0 : error.code) || '');
        }
        assert(orphanCode === 'CORRECTION_LINK_MISSING', `an unlinked correction draft is rejected, got ${orphanCode}`);
        yield Payment_1.Payment.updateOne({ _id: payment === null || payment === void 0 ? void 0 : payment._id }, { $set: { reversalState: 'reversed' } });
        const completed = yield invoke(paymentController_1.updatePayment, financeReq(String(user._id), String(company._id), String(corrected === null || corrected === void 0 ? void 0 : corrected._id), { status: 'completed' }));
        assert(completed.statusCode === 200, `settled correction completes through the ordinary update, got ${completed.statusCode} ${((_4 = completed.body) === null || _4 === void 0 ? void 0 : _4.message) || ''}`);
        const completedPayment = yield Payment_1.Payment.findById(corrected === null || corrected === void 0 ? void 0 : corrected._id).lean();
        assert(String((completedPayment === null || completedPayment === void 0 ? void 0 : completedPayment.status) || '') === 'completed', 'corrected payment is completed');
        assert(String((completedPayment === null || completedPayment === void 0 ? void 0 : completedPayment.postingStatus) || '') === 'posted', 'corrected payment is posted');
        const correctedJournal = yield JournalEntry_1.JournalEntry.findOne({ sourceId: String(corrected === null || corrected === void 0 ? void 0 : corrected._id), sourceModule: 'payment' }).lean();
        assert(Boolean(correctedJournal), 'corrected payment posted a journal through the ordinary pipeline');
        const propertyAfterCorrection = yield PropertyAccount_1.default.findOne({ propertyId: property._id, isArchived: { $ne: true } }).lean();
        const correctedIncome = ((propertyAfterCorrection === null || propertyAfterCorrection === void 0 ? void 0 : propertyAfterCorrection.transactions) || [])
            .filter((row) => row.type === 'income' && String(row.paymentId || '') === String(corrected === null || corrected === void 0 ? void 0 : corrected._id))
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const netAfterCorrection = ((propertyAfterCorrection === null || propertyAfterCorrection === void 0 ? void 0 : propertyAfterCorrection.transactions) || [])
            .filter((row) => String(row.paymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id) ||
            String(row.reversesPaymentId || '') === String(payment === null || payment === void 0 ? void 0 : payment._id) ||
            String(row.paymentId || '') === String(corrected === null || corrected === void 0 ? void 0 : corrected._id))
            .reduce((sum, row) => {
            if (row.type === 'income')
                return sum + Number(row.amount || 0);
            if (String(row.idempotencyKey || '').includes(':owner-income:reversal:'))
                return sum - Number(row.amount || 0);
            return sum;
        }, 0);
        near(netAfterCorrection, correctedIncome, 'original plus reversal plus correction equals the corrected owner income');
        ledgerEvidence.push(JSON.stringify({ correctedOwnerIncome: correctedIncome, netAfterCorrection }));
        const reversedQuery = { companyId: company._id };
        (0, paymentReversalPolicy_1.applyPaymentStatusFilter)(reversedQuery, 'reversed');
        const reversedRows = yield Payment_1.Payment.find(reversedQuery).select('_id referenceNumber').lean();
        const reversedIds = new Set(reversedRows.map((row) => String(row._id)));
        assert(reversedIds.has(String(payment === null || payment === void 0 ? void 0 : payment._id)) && reversedIds.has(String(reversal === null || reversal === void 0 ? void 0 : reversal._id)), 'reversed filter returns the original and the reversal');
        assert(!reversedIds.has(String(lockedPeriod === null || lockedPeriod === void 0 ? void 0 : lockedPeriod._id)), 'reversed filter does not return an untouched receipt');
        const individualCompany = yield Company_1.Company.create({
            name: 'Remediation Individual',
            address: '3 Remediation Street',
            phone: '0770000093',
            email: 'individual-remediation@example.test',
            registrationNumber: 'REM-IND-1',
            tinNumber: 'REM-IND-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            workspaceType: 'individual',
            plan: 'INDIVIDUAL'
        });
        const individualProperty = yield Property_1.Property.create({
            companyId: individualCompany._id,
            ownerId: user._id,
            name: 'Individual House',
            address: '3 Remediation Road',
            rentalType: 'management',
            rent: 1800,
            commission: 15
        });
        const individualPayment = yield Payment_1.Payment.create({
            companyId: individualCompany._id,
            propertyId: individualProperty._id,
            tenantId: tenant._id,
            agentId: user._id,
            processedBy: user._id,
            propertyType: 'residential',
            amount: 1800,
            paymentType: 'rental',
            paymentMethod: 'bank_transfer',
            status: 'completed',
            paymentDate: PAYMENT_DATE,
            rentalPeriodMonth: 10,
            rentalPeriodYear: 2026,
            transactionDomain: 'RENTAL',
            commissionFinalized: true,
            commissionDetails: (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc),
            referenceNumber: 'REM-INDIVIDUAL',
            notes: 'PHASE_FAIL_INDIVIDUAL_VAT PHASE_FAIL_INDIVIDUAL_RENTAL_TAX PHASE_FAIL_INDIVIDUAL_INCOME_TAX',
            idempotencyKey: `rem:individual:${new mongoose_1.default.Types.ObjectId().toString()}`
        });
        yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(individualPayment._id), { createdBy: String(user._id) });
        const individualReverse = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(individualCompany._id), String(individualPayment._id), { reason: 'individual tax seam' }));
        const individualState = yield Payment_1.Payment.findById(individualPayment._id).select('reversalState').lean();
        assert(individualReverse.statusCode === 202 && ((_5 = individualReverse.body) === null || _5 === void 0 ? void 0 : _5.outcome) === 'reversal_incomplete', `individual tax failure stays incomplete, got ${individualReverse.statusCode} ${(_6 = individualReverse.body) === null || _6 === void 0 ? void 0 : _6.outcome} ${JSON.stringify(((_7 = individualReverse.body) === null || _7 === void 0 ? void 0 : _7.warnings) || [])}`);
        assert(String((individualState === null || individualState === void 0 ? void 0 : individualState.reversalState) || '') === 'reversal_incomplete', 'individual tax failure stores reversal_incomplete');
        const individualRetry = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(individualCompany._id), String(individualPayment._id), { reason: 'individual retry' }));
        const individualRetried = yield Payment_1.Payment.findById(individualPayment._id).select('reversalState').lean();
        assert(((_8 = individualRetry.body) === null || _8 === void 0 ? void 0 : _8.outcome) === 'reversed' || String((individualRetried === null || individualRetried === void 0 ? void 0 : individualRetried.reversalState) || '') === 'reversed', `individual retry can settle, got ${individualRetry.statusCode} ${(_9 = individualRetry.body) === null || _9 === void 0 ? void 0 : _9.outcome}`);
        const sale = yield Payment_1.Payment.create({
            companyId: company._id,
            propertyId: property._id,
            agentId: user._id,
            processedBy: user._id,
            propertyType: 'residential',
            amount: 5000,
            paymentType: 'sale',
            paymentMethod: 'bank_transfer',
            status: 'completed',
            paymentDate: PAYMENT_DATE,
            transactionDomain: 'SALE',
            commissionFinalized: true,
            commissionDetails: (0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc),
            referenceNumber: 'REM-SALE',
            buyerName: 'Buyer Example',
            idempotencyKey: `rem:sale:${new mongoose_1.default.Types.ObjectId().toString()}`
        });
        yield trustPaymentPostingService_1.default.postBuyerPaymentToTrust({
            paymentId: String(sale._id),
            propertyId: String(property._id),
            amount: 5000,
            companyId: String(company._id),
            reference: 'REM-SALE',
            performedBy: String(user._id)
        });
        const saleReverse = yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(sale._id), { reason: 'sale trust' }));
        yield invoke(paymentController_1.reversePayment, financeReq(String(user._id), String(company._id), String(sale._id), { reason: 'sale trust retry' }));
        const trustDebits = yield TrustTransaction_1.TrustTransaction.countDocuments({ reference: `reversal:${String(sale._id)}` });
        assert(saleReverse.statusCode === 200 || saleReverse.statusCode === 202, `sale reversal is accepted, got ${saleReverse.statusCode} ${((_10 = saleReverse.body) === null || _10 === void 0 ? void 0 : _10.message) || ''}`);
        assert(trustDebits === 1, `sale trust is debited once, got ${trustDebits}`);
        stage('complete');
        finish();
    });
}
function finish() {
    console.log(JSON.stringify({
        failures,
        notes,
        ledgerEvidence,
        cosmosDb: 'UNVERIFIED',
        database: DB
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
}
main().catch((error) => {
    console.error(error);
    failures.push((error === null || error === void 0 ? void 0 : error.message) || String(error));
    finish();
});
