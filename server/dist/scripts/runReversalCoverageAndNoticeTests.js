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
 * Duplicate-payment coverage and owner reversal notices.
 * Database cases use a disposable local MongoDB database only.
 * Email delivery uses an in-memory sender. No production database and no real email.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const PropertyOwner_1 = require("../models/PropertyOwner");
const OwnerRentNotice_1 = require("../models/OwnerRentNotice");
const EventDedupRecord_1 = require("../models/EventDedupRecord");
const database_1 = require("../config/database");
const paymentController_1 = require("../controllers/paymentController");
const rentalPeriodCoverage_1 = require("../services/rentalPeriodCoverage");
const paymentIdempotency_1 = require("../services/paymentIdempotency");
const ownerRentNotificationPolicy_1 = require("../services/ownerRentNotificationPolicy");
const ownerRentNotificationService_1 = require("../services/ownerRentNotificationService");
const DB = process.env.REVERSAL_COVERAGE_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_coverage_test';
const ACCOUNTING_DB = process.env.REVERSAL_COVERAGE_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_reversal_coverage_accounting';
const failures = [];
const sent = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function stage(message) {
    console.error(`[coverage] ${message}`);
}
function assertDisposable(uri) {
    const parsed = new URL(uri);
    const host = parsed.hostname.toLowerCase();
    const name = parsed.pathname.replace(/^\//, '').toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost')
        throw new Error(`Refusing coverage tests: host is not local (${host})`);
    if (!name || /prod|cosmos|azure|live/.test(name))
        throw new Error('Refusing coverage tests: database name is not disposable');
}
function blankEmailProviders() {
    for (const key of [
        'SMTP_HOST', 'SMTP_HOST_MANTIS', 'SMTP_USER', 'SMTP_USER_MANTIS', 'SMTP_PASS', 'SMTP_PASS_MANTIS',
        'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
        'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
        'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS', 'EMAIL_STRICT', 'EMAIL_REQUIRE_PROVIDER'
    ])
        delete process.env[key];
}
function base(overrides = {}) {
    return Object.assign({ _id: 'original', amount: 1800, depositAmount: 0, status: 'completed', paymentType: 'rental', rentalPeriodMonth: 5, rentalPeriodYear: 2026, referenceNumber: 'RCPT-1', currency: 'USD', leaseId: 'lease-a' }, overrides);
}
function runPureCoverage() {
    const month = { year: 2026, month: 5 };
    const ordinary = (0, rentalPeriodCoverage_1.coverageForMonth)(base(), month.year, month.month);
    assert(ordinary === 1800, `1 ordinary completed payment covers 1800, got ${ordinary}`);
    assert((0, rentalPeriodCoverage_1.sumCoverageForMonth)([base(), base({ _id: 'second', referenceNumber: 'RCPT-2' })], 2026, 5) === 3600, '1 a second ordinary receipt still counts');
    const inProgress = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ reversalState: 'reversal_in_progress', reversalPaymentId: 'rev' }), 2026, 5);
    assert(inProgress === 1800, `2 reversal in progress still covers the period, got ${inProgress}`);
    const incomplete = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ reversalState: 'reversal_incomplete', reversalPaymentId: 'rev' }), 2026, 5);
    assert(incomplete === 1800, `3 reversal incomplete still covers the period, got ${incomplete}`);
    const reversed = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ reversalState: 'reversed', reversalPaymentId: 'rev' }), 2026, 5);
    const rev = (0, rentalPeriodCoverage_1.coverageForMonth)(base({
        _id: 'rev', amount: -1800, reversalOfPaymentId: 'original', referenceNumber: 'REV-RCPT-1', status: 'completed'
    }), 2026, 5);
    assert(reversed === 0, `4 reversed original no longer covers the period, got ${reversed}`);
    assert((0, paymentIdempotency_1.idempotencyHolderIsRetired)({ reversalState: 'reversed', status: 'completed', amount: 1800 }) === true, '4 a reversed receipt no longer owns its submit key');
    assert((0, paymentIdempotency_1.idempotencyHolderIsRetired)({ reversalState: 'reversal_in_progress', status: 'completed', amount: 1800 }) === false, '2 an in-progress reversal still owns its submit key');
    assert((0, paymentIdempotency_1.idempotencyHolderIsRetired)({ status: 'completed', amount: 1800 }) === false, '1 an ordinary receipt still owns its submit key');
    assert(rev === 0, `5 negative REV is not a fresh receipt, got ${rev}`);
    assert((0, rentalPeriodCoverage_1.sumCoverageForMonth)([
        base({ reversalState: 'reversed', reversalPaymentId: 'rev' }),
        base({ _id: 'rev', amount: -1800, reversalOfPaymentId: 'original', referenceNumber: 'REV-RCPT-1' })
    ], 2026, 5) === 0, '8 reversed original plus REV nets to no rent coverage');
    const draft = (0, rentalPeriodCoverage_1.coverageForMonth)(base({
        _id: 'corr', status: 'pending', postingStatus: 'draft', isCorrectionEntry: true, referenceNumber: 'CORR-RCPT-1', amount: 1800
    }), 2026, 5);
    assert(draft === 0, `6 pending CORR draft is not completed rent, got ${draft}`);
    const reservedDraft = (0, rentalPeriodCoverage_1.reservationForMonth)(base({
        _id: 'corr', status: 'pending', postingStatus: 'draft', isCorrectionEntry: true, referenceNumber: 'CORR-RCPT-1', amount: 1800
    }), 2026, 5);
    assert(reservedDraft === 1800, `6 pending CORR draft reserves the period, got ${reservedDraft}`);
    const releasedDraft = (0, rentalPeriodCoverage_1.reservationForMonth)(base({
        _id: 'corr', status: 'failed', postingStatus: 'voided', isCorrectionEntry: true, referenceNumber: 'CORR-RCPT-1', amount: 1800
    }), 2026, 5);
    assert(releasedDraft === 0, `6 voided CORR draft releases the reservation, got ${releasedDraft}`);
    const completedCorr = (0, rentalPeriodCoverage_1.coverageForMonth)(base({
        _id: 'corr', status: 'completed', postingStatus: 'posted', isCorrectionEntry: true, referenceNumber: 'CORR-RCPT-1'
    }), 2026, 5);
    assert(completedCorr === 1800, `7 completed correction restores coverage, got ${completedCorr}`);
    const partial = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ amount: 900, rentAllocated: 900 }), 2026, 5);
    assert(partial === 900, `9 partial payment covers 900, got ${partial}`);
    const reversedPartial = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ amount: 900, rentAllocated: 900, reversalState: 'reversed' }), 2026, 5);
    assert(reversedPartial === 0, `9 reversing a partial payment clears that coverage, got ${reversedPartial}`);
    const advance = base({
        amount: 5400,
        rentUsed: 1800,
        advanceMonthsPaid: 3,
        rentalPeriodMonth: 5,
        advancePeriodStart: { month: 5, year: 2026 },
        advancePeriodEnd: { month: 7, year: 2026 },
    });
    assert((0, rentalPeriodCoverage_1.coverageForMonth)(advance, 2026, 5) === 1800, '10 advance covers May with one month of rent');
    assert((0, rentalPeriodCoverage_1.coverageForMonth)(advance, 2026, 6) === 1800, '10 advance covers June');
    assert((0, rentalPeriodCoverage_1.coverageForMonth)(advance, 2026, 7) === 1800, '10 advance covers July');
    assert((0, rentalPeriodCoverage_1.coverageForMonth)(Object.assign(Object.assign({}, advance), { reversalState: 'reversed' }), 2026, 6) === 0, '10 reversed advance clears each month');
    const rentLevy = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ amount: 1920, rentAllocated: 1800, levyAllocated: 120 }), 2026, 5);
    assert(rentLevy === 1800, `11 rent plus levy uses the rent allocation, got ${rentLevy}`);
    const deposit = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ amount: 0, depositAmount: 1800 }), 2026, 5);
    assert(deposit === 0, `12 deposit does not satisfy rent, got ${deposit}`);
    const otherLease = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ leaseId: 'lease-b' }), 2026, 5, { leaseId: 'lease-a' });
    assert(otherLease === 0, `15 another lease does not cover this lease, got ${otherLease}`);
    const otherCurrency = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ currency: 'ZWL' }), 2026, 5, { currency: 'USD' });
    assert(otherCurrency === 0, `15 another currency does not cover this currency, got ${otherCurrency}`);
    const legacy = (0, rentalPeriodCoverage_1.coverageForMonth)(base({
        reversalState: undefined, rentAllocated: undefined, leaseId: undefined, currency: undefined, postingStatus: undefined
    }), 2026, 5, { currency: 'USD', leaseId: 'lease-a' });
    assert(legacy === 1800, `16 legacy receipt without newer fields still covers its stored period, got ${legacy}`);
    const noPeriod = (0, rentalPeriodCoverage_1.coverageForMonth)({
        amount: 1800, status: 'completed', referenceNumber: 'RENT-MAY-2026', paymentType: 'rental'
    }, 2026, 5);
    assert(noPeriod === 0, `16 a reference string does not invent a rental period, got ${noPeriod}`);
    const failed = (0, rentalPeriodCoverage_1.coverageForMonth)(base({ status: 'failed' }), 2026, 5);
    assert(failed === 0, `failed payment does not cover the period, got ${failed}`);
}
function runPureNotices() {
    var _a;
    const unsafe = (0, ownerRentNotificationPolicy_1.sanitizeReversalReason)('wrong tenant\n<script>alert(1)</script> password: hunter2');
    assert(!unsafe.includes('hunter2') && !unsafe.includes('<script>') && !unsafe.includes('\n'), `14 reason is sanitised, got ${unsafe}`);
    const stack = (0, ownerRentNotificationPolicy_1.sanitizeReversalReason)('Error: boom at pay (C:\\app\\paymentController.ts:10:4)');
    assert(stack === '', '14 a stack trace is not included');
    const draftPosition = (0, ownerRentNotificationPolicy_1.describeRentalPeriodAfterReversal)({
        periodKnown: true,
        originalPaymentId: 'original',
        payments: [
            { _id: 'original', amount: 1800, status: 'completed', reversalState: 'reversed' },
            { _id: 'corr', amount: 1800, status: 'pending', postingStatus: 'draft', isCorrectionEntry: true, referenceNumber: 'CORR-RCPT-1' },
        ],
    });
    assert(draftPosition.status === 'correction_draft', `9 pending correction is not a completed replacement, got ${draftPosition.status}`);
    const replaced = (0, ownerRentNotificationPolicy_1.describeRentalPeriodAfterReversal)({
        periodKnown: true,
        originalPaymentId: 'original',
        payments: [
            { _id: 'original', amount: 1800, status: 'completed', reversalState: 'reversed' },
            { _id: 'new', amount: 1800, status: 'completed', referenceNumber: 'RCPT-NEW', rentAllocated: 1800 },
        ],
    });
    assert(replaced.status === 'replacement_completed' && ((_a = replaced.replacement) === null || _a === void 0 ? void 0 : _a.reference) === 'RCPT-NEW', '10 completed replacement is reported');
    const unknown = (0, ownerRentNotificationPolicy_1.describeRentalPeriodAfterReversal)({ periodKnown: false, originalPaymentId: 'original', payments: [] });
    assert(unknown.status === 'unknown', 'missing period does not claim the rent is unpaid');
    const email = (0, ownerRentNotificationPolicy_1.composeOwnerReversalNotice)({
        ownerName: 'Olive Owner',
        propertyLabel: '1 Coverage Road',
        currency: 'USD',
        originalReference: 'RCPT-1',
        originalAmount: 1800,
        reversalReference: 'REV-RCPT-1',
        reversalAmount: -1800,
        reversalDate: new Date('2026-10-20T00:00:00.000Z'),
        reason: 'wrong tenant',
        periodLabel: 'May 2026',
        position: { status: 'no_replacement' },
    });
    assert(email.text.includes('RCPT-1') && email.text.includes('REV-RCPT-1'), '8 notice names the original and the reversal');
    assert(email.text.includes('audit history') && email.text.includes('separate reversal'), '8 notice keeps the original in the audit history');
    assert(email.text.includes('No completed replacement'), '8 notice does not invent a replacement');
    assert(!email.text.toLowerCase().includes('original email was sent'), 'notice does not claim an original email was sent');
}
function invoke(handler, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = {
            statusCode: 200,
            body: undefined,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
        };
        yield handler(req, res);
        return res;
    });
}
function runDatabaseCases() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        assertDisposable(DB);
        assertDisposable(ACCOUNTING_DB);
        blankEmailProviders();
        stage('connecting');
        yield mongoose_1.default.connect(DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB, { serverSelectionTimeoutMS: 8000 });
        stage('dropping disposable database');
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.dropDatabase();
        yield Promise.all([Payment_1.Payment.init(), EventDedupRecord_1.EventDedupRecord.init(), OwnerRentNotice_1.OwnerRentNotice.init()]);
        const user = yield User_1.User.create({
            email: 'coverage-accountant@example.test',
            password: 'test-pass-1',
            firstName: 'Coverage',
            lastName: 'Accountant',
            role: 'admin',
            roles: ['admin'],
            isActive: true,
            sessionVersion: 1,
        });
        const company = yield Company_1.Company.create({
            name: 'Coverage Agency',
            address: '1 Coverage Street',
            phone: '0770000092',
            email: 'coverage@example.test',
            registrationNumber: 'COV-REV-1',
            tinNumber: 'COV-REV-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            workspaceType: 'agency',
        });
        const otherCompany = yield Company_1.Company.create({
            name: 'Other Agency',
            address: '2 Coverage Street',
            phone: '0770000093',
            email: 'other-coverage@example.test',
            registrationNumber: 'COV-REV-2',
            tinNumber: 'COV-REV-TIN-2',
            country: 'Zimbabwe',
            ownerId: user._id,
            workspaceType: 'agency',
        });
        const property = yield Property_1.Property.create({
            companyId: company._id,
            ownerId: user._id,
            name: 'Coverage House',
            address: '1 Coverage Road',
            rentalType: 'management',
            rent: 1800,
            commission: 0,
            vatOnCommission: false,
        });
        const otherProperty = yield Property_1.Property.create({
            companyId: company._id,
            ownerId: user._id,
            name: 'Other House',
            address: '9 Coverage Road',
            rentalType: 'management',
            rent: 1800,
            commission: 0,
            vatOnCommission: false,
        });
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Coverage',
            lastName: 'Tenant',
            email: 'coverage-tenant@example.test',
            phone: '0771111192',
            companyId: company._id,
            ownerId: user._id,
            status: 'Active',
        });
        const lease = yield Lease_1.Lease.create({
            propertyId: property._id,
            tenantId: tenant._id,
            companyId: company._id,
            ownerId: user._id,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
            rentAmount: 1800,
            depositAmount: 0,
            status: 'active',
        });
        const otherLease = yield Lease_1.Lease.create({
            propertyId: property._id,
            tenantId: tenant._id,
            companyId: company._id,
            ownerId: user._id,
            startDate: new Date('2027-01-01T00:00:00.000Z'),
            endDate: new Date('2027-12-31T00:00:00.000Z'),
            rentAmount: 1800,
            depositAmount: 0,
            status: 'active',
        });
        const owner = yield PropertyOwner_1.PropertyOwner.create({
            email: 'coverage-owner@example.test',
            password: 'test-pass-1',
            firstName: 'Olive',
            lastName: 'Owner',
            phone: '0772222292',
            companyId: company._id,
            properties: [property._id],
            active: true,
        });
        yield PropertyOwner_1.PropertyOwner.create({
            email: 'other-owner@example.test',
            password: 'test-pass-1',
            firstName: 'Other',
            lastName: 'Owner',
            phone: '0772222293',
            companyId: otherCompany._id,
            properties: [property._id],
            active: true,
        });
        stage('fixtures ready');
        const commission = { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 1800 };
        function rentRow(reference_1) {
            return __awaiter(this, arguments, void 0, function* (reference, extra = {}) {
                return Payment_1.Payment.create(Object.assign({ companyId: company._id, propertyId: property._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id, leaseId: lease._id, propertyType: 'residential', amount: 1800, depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed', paymentDate: new Date('2026-05-13T10:00:00.000Z'), rentalPeriodMonth: 5, rentalPeriodYear: 2026, currency: 'USD', transactionDomain: 'RENTAL', commissionDetails: commission, referenceNumber: reference }, extra));
            });
        }
        const period = {
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            rentalPeriodMonth: 5,
            rentalPeriodYear: 2026,
            leaseId: lease._id,
            currency: 'USD',
        };
        const ordinary = yield rentRow('RCPT-ORD');
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 1800, 'db 1 ordinary payment covers the period');
        const reqFor = (month, year, amount = 1800) => ({
            user: { userId: String(user._id), companyId: String(company._id), role: 'admin', roles: ['admin'] },
            body: {
                leaseId: String(lease._id),
                amount,
                paymentDate: '2026-05-20',
                paymentMethod: 'cash',
                status: 'completed',
                rentalPeriodMonth: month,
                rentalPeriodYear: year,
                currency: 'USD',
                idempotencyKey: `cov:${month}:${year}:${amount}:${new mongoose_1.default.Types.ObjectId().toString()}`,
            },
        });
        stage('api duplicate check');
        const blocked = yield invoke(paymentController_1.createPayment, reqFor(5, 2026));
        assert(blocked.statusCode === 409, `13 server rejects a duplicate for a covered period, got ${blocked.statusCode} ${(_a = blocked.body) === null || _a === void 0 ? void 0 : _a.message}`);
        ordinary.reversalState = 'reversal_in_progress';
        ordinary.reversalPaymentId = new mongoose_1.default.Types.ObjectId();
        yield ordinary.save();
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 1800, 'db 2 in-progress reversal still covers the period');
        const blockedProgress = yield invoke(paymentController_1.createPayment, reqFor(5, 2026));
        assert(blockedProgress.statusCode === 409, `db 2 API still blocks reversal in progress, got ${blockedProgress.statusCode}`);
        ordinary.reversalState = 'reversal_incomplete';
        yield ordinary.save();
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 1800, 'db 3 incomplete reversal still covers the period');
        const blockedIncomplete = yield invoke(paymentController_1.createPayment, reqFor(5, 2026));
        assert(blockedIncomplete.statusCode === 409, `db 3 API still blocks reversal incomplete, got ${blockedIncomplete.statusCode}`);
        const reversal = yield rentRow('REV-RCPT-ORD', {
            amount: -1800,
            reversalOfPaymentId: ordinary._id,
            rentalPeriodMonth: 5,
            rentalPeriodYear: 2026,
        });
        ordinary.reversalState = 'reversed';
        ordinary.reversalPaymentId = reversal._id;
        yield ordinary.save();
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 0, 'db 4 and 5 reversed original and REV leave the period open');
        yield Property_1.Property.updateOne({ _id: property._id }, { $set: { agentId: user._id } });
        const allowed = yield invoke(paymentController_1.createPayment, reqFor(5, 2026));
        assert(allowed.statusCode !== 409, `db 4 API allows a replacement after reversal, got ${allowed.statusCode} ${(_b = allowed.body) === null || _b === void 0 ? void 0 : _b.message}`);
        yield Payment_1.Payment.deleteMany({
            companyId: company._id,
            rentalPeriodMonth: 5,
            rentalPeriodYear: 2026,
            _id: { $nin: [ordinary._id, reversal._id] },
        });
        const replacementKey = `cov:replacement:${String(company._id)}`;
        const replacementReq = () => {
            const req = reqFor(8, 2026);
            req.body.idempotencyKey = replacementKey;
            return req;
        };
        yield Payment_1.Payment.deleteMany({ companyId: company._id, rentalPeriodMonth: 8, rentalPeriodYear: 2026 });
        const firstReplacement = yield invoke(paymentController_1.createPayment, replacementReq());
        assert(firstReplacement.statusCode === 201, `db 4b first receipt for an open month is created, got ${firstReplacement.statusCode} ${(_c = firstReplacement.body) === null || _c === void 0 ? void 0 : _c.message}`);
        const firstReplacementId = String(((_e = (_d = firstReplacement.body) === null || _d === void 0 ? void 0 : _d.payment) === null || _e === void 0 ? void 0 : _e._id) || '');
        const replayReplacement = yield invoke(paymentController_1.createPayment, replacementReq());
        assert(replayReplacement.statusCode === 200 && String(((_g = (_f = replayReplacement.body) === null || _f === void 0 ? void 0 : _f.payment) === null || _g === void 0 ? void 0 : _g._id) || '') === firstReplacementId, 'db 4b the same submit key replays the live receipt');
        yield Payment_1.Payment.updateOne({ _id: firstReplacementId }, { $set: { reversalState: 'reversed', reversalPaymentId: new mongoose_1.default.Types.ObjectId() } });
        const afterReversal = yield invoke(paymentController_1.createPayment, replacementReq());
        const afterReversalId = String(((_j = (_h = afterReversal.body) === null || _h === void 0 ? void 0 : _h.payment) === null || _j === void 0 ? void 0 : _j._id) || '');
        assert(afterReversal.statusCode === 201 && afterReversalId.length > 0 && afterReversalId !== firstReplacementId, `db 4b a reversed receipt does not swallow the replacement, got ${afterReversal.statusCode} ${(_k = afterReversal.body) === null || _k === void 0 ? void 0 : _k.message}`);
        const retiredKey = yield Payment_1.Payment.findById(firstReplacementId).select('idempotencyKey').lean();
        assert(!(retiredKey === null || retiredKey === void 0 ? void 0 : retiredKey.idempotencyKey), 'db 4b the reversed receipt releases the submit key');
        const liveKey = yield Payment_1.Payment.findById(afterReversalId).select('idempotencyKey reversalState').lean();
        assert(String((liveKey === null || liveKey === void 0 ? void 0 : liveKey.idempotencyKey) || '') === replacementKey && String((liveKey === null || liveKey === void 0 ? void 0 : liveKey.reversalState) || '') !== 'reversed', 'db 4b the new receipt holds the submit key');
        const corr = yield rentRow('CORR-RCPT-ORD', {
            status: 'pending',
            postingStatus: 'draft',
            isCorrectionEntry: true,
            amount: 1800,
        });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 0, 'db 6 pending CORR does not cover the period');
        corr.status = 'completed';
        corr.postingStatus = 'posted';
        yield corr.save();
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 1800, 'db 7 completed correction covers the period again');
        const blockedAgain = yield invoke(paymentController_1.createPayment, reqFor(5, 2026));
        assert(blockedAgain.statusCode === 409, `db 7 API blocks after the correction is completed, got ${blockedAgain.statusCode}`);
        yield Payment_1.Payment.deleteMany({ companyId: company._id, rentalPeriodMonth: 6, rentalPeriodYear: 2026 });
        yield rentRow('RCPT-PART', { amount: 900, rentAllocated: 900, rentalPeriodMonth: 6, rentalPeriodYear: 2026 });
        const june = Object.assign(Object.assign({}, period), { rentalPeriodMonth: 6 });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(june)) === 900, 'db 9 partial coverage is 900');
        const partialBlock = yield invoke(paymentController_1.createPayment, reqFor(6, 2026, 1800));
        assert(partialBlock.statusCode === 400, `db 9 overpayment is rejected, got ${partialBlock.statusCode} ${(_l = partialBlock.body) === null || _l === void 0 ? void 0 : _l.message}`);
        yield rentRow('RCPT-ADV', {
            amount: 5400,
            rentUsed: 1800,
            rentalPeriodMonth: 8,
            rentalPeriodYear: 2026,
            advanceMonthsPaid: 3,
            advancePeriodStart: { month: 8, year: 2026 },
            advancePeriodEnd: { month: 10, year: 2026 },
        });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(Object.assign(Object.assign({}, period), { rentalPeriodMonth: 9, rentalPeriodYear: 2026 }))) === 1800, 'db 10 September is covered by the advance payment');
        yield rentRow('RCPT-LEVY', {
            amount: 1920,
            rentAllocated: 1800,
            levyAllocated: 120,
            rentalPeriodMonth: 11,
            rentalPeriodYear: 2026,
        });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(Object.assign(Object.assign({}, period), { rentalPeriodMonth: 11 }))) === 1800, 'db 11 levy is not added to rent coverage');
        yield rentRow('RCPT-DEP', {
            amount: 0,
            depositAmount: 500,
            rentalPeriodMonth: 12,
            rentalPeriodYear: 2026,
        });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(Object.assign(Object.assign({}, period), { rentalPeriodMonth: 12 }))) === 0, 'db 12 deposit does not cover rent');
        yield rentRow('RCPT-OTHER-PROP', { propertyId: otherProperty._id, rentalPeriodMonth: 4, rentalPeriodYear: 2026 });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(Object.assign(Object.assign({}, period), { propertyId: property._id, rentalPeriodMonth: 4 }))) === 0, 'db 15 another property is isolated');
        yield rentRow('RCPT-OTHER-LEASE', { leaseId: otherLease._id, rentalPeriodMonth: 3, rentalPeriodYear: 2026 });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(Object.assign(Object.assign({}, period), { rentalPeriodMonth: 3, leaseId: lease._id }))) === 0, 'db 15 another lease is isolated');
        yield Payment_1.Payment.collection.insertOne({
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            paymentType: 'rental',
            status: 'completed',
            amount: 1800,
            referenceNumber: 'RENT-MAY-2026',
            currency: 'USD',
        });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(Object.assign(Object.assign({}, period), { rentalPeriodMonth: 2, rentalPeriodYear: 2026 }))) === 0, 'db 16 a row without a stored period does not cover February');
        yield rentRow('RCPT-LEGACY', {
            rentalPeriodMonth: 2,
            rentalPeriodYear: 2026,
            currency: undefined,
            leaseId: undefined,
            postingStatus: undefined,
        });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(Object.assign(Object.assign({}, period), { rentalPeriodMonth: 2, currency: 'USD' }))) === 1800, 'db 16 legacy receipt without optional fields still covers its period');
        yield EventDedupRecord_1.EventDedupRecord.collection.createIndex({ scope: 1, eventId: 1 }, { unique: true });
        let created = 0;
        yield Promise.all([0, 1].map(() => (0, rentalPeriodCoverage_1.withRentalPeriodGuard)(`coverage-race:${company._id}`, () => __awaiter(this, void 0, void 0, function* () {
            const covered = yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(Object.assign(Object.assign({}, period), { rentalPeriodMonth: 1, rentalPeriodYear: 2026 }));
            if (covered >= 1800)
                return;
            yield rentRow(`RCPT-RACE-${created}`, { rentalPeriodMonth: 1, rentalPeriodYear: 2026, referenceNumber: `RCPT-RACE-${new mongoose_1.default.Types.ObjectId()}` });
            created += 1;
            yield new Promise((resolve) => setTimeout(resolve, 80));
        }))));
        const raceCount = yield Payment_1.Payment.countDocuments({ companyId: company._id, rentalPeriodMonth: 1, rentalPeriodYear: 2026, amount: { $gt: 0 } });
        assert(raceCount === 1, `14 concurrent creation stored one receipt, got ${raceCount}`);
        const sender = (message) => __awaiter(this, void 0, void 0, function* () {
            sent.push(message);
        });
        const originalNotice = yield OwnerRentNotice_1.OwnerRentNotice.create({
            companyId: company._id,
            ownerId: owner._id,
            paymentId: ordinary._id,
            propertyId: property._id,
            idempotencyKey: `owner-rent-payment:${String(ordinary._id)}`,
            status: 'SENT',
        });
        const noticePayment = {
            _id: ordinary._id,
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            referenceNumber: 'RCPT-ORD',
            amount: 1800,
            currency: 'USD',
            reversalPaymentId: reversal._id,
            reversalState: 'reversal_incomplete',
            rentalPeriodMonth: 5,
            rentalPeriodYear: 2026,
        };
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(noticePayment, 'wrong tenant', { settled: false, send: sender });
        assert(sent.length === 0, '3 incomplete reversal sends no email');
        const waiting = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ idempotencyKey: `owner-rent-reversal:${ordinary._id}:${reversal._id}` }).lean();
        assert((waiting === null || waiting === void 0 ? void 0 : waiting.status) === 'AWAITING_SETTLEMENT', `3 notice waits for settlement, got ${waiting === null || waiting === void 0 ? void 0 : waiting.status}`);
        assert(((_m = (yield OwnerRentNotice_1.OwnerRentNotice.findById(originalNotice._id).lean())) === null || _m === void 0 ? void 0 : _m.status) === 'SENT', '1 original notice is not rewritten');
        noticePayment.reversalState = 'reversed';
        yield Payment_1.Payment.updateOne({ _id: corr._id }, { $set: { status: 'pending', postingStatus: 'draft', isCorrectionEntry: true } });
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(noticePayment, 'wrong tenant\n<script>alert(1)</script> password: hunter2', { settled: true, send: sender });
        assert(sent.length === 1, `1 one reversal notice is queued, got ${sent.length}`);
        assert(sent[0].to === 'coverage-owner@example.test', `13 notice goes to the property owner, got ${(_o = sent[0]) === null || _o === void 0 ? void 0 : _o.to}`);
        assert(!sent[0].text.includes('hunter2') && !sent[0].text.includes('<script>'), '14 email reason is sanitised');
        assert(sent[0].text.includes('correction draft'), '9 pending correction is not described as a completed receipt');
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(noticePayment, 'wrong tenant', { settled: true, send: sender });
        assert(sent.length === 1, '5 and 7 a second delivery does not send another email');
        const reversalRow = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ idempotencyKey: `owner-rent-reversal:${ordinary._id}:${reversal._id}` }).lean();
        assert(String(reversalRow === null || reversalRow === void 0 ? void 0 : reversalRow.paymentId) === String(ordinary._id) && String(reversalRow === null || reversalRow === void 0 ? void 0 : reversalRow.reversalPaymentId) === String(reversal._id), '15 notice stays linked to the payment pair');
        const neverSent = yield rentRow('RCPT-NO-MAIL', { rentalPeriodMonth: 7, rentalPeriodYear: 2027 });
        const neverReversal = yield rentRow('REV-NO-MAIL', { amount: -1800, reversalOfPaymentId: neverSent._id, rentalPeriodMonth: 7, rentalPeriodYear: 2027 });
        const beforeCount = yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({ idempotencyKey: `owner-rent-payment:${neverSent._id}` });
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(Object.assign(Object.assign({}, noticePayment), { _id: neverSent._id, referenceNumber: 'RCPT-NO-MAIL', reversalPaymentId: neverReversal._id, reversalState: 'reversed', rentalPeriodMonth: 7, rentalPeriodYear: 2027 }), 'allocation', { settled: true, send: sender });
        assert(beforeCount === 0 && (yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({ idempotencyKey: `owner-rent-payment:${neverSent._id}` })) === 0, '2 reversal does not invent an original sent notice');
        const failing = yield rentRow('RCPT-FAIL-MAIL', { rentalPeriodMonth: 8, rentalPeriodYear: 2027 });
        const failingRev = yield rentRow('REV-FAIL-MAIL', { amount: -1800, reversalOfPaymentId: failing._id, rentalPeriodMonth: 8, rentalPeriodYear: 2027 });
        const amountBefore = Number(failing.amount);
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(Object.assign(Object.assign({}, noticePayment), { _id: failing._id, referenceNumber: 'RCPT-FAIL-MAIL', reversalPaymentId: failingRev._id, reversalState: 'reversed', rentalPeriodMonth: 8, rentalPeriodYear: 2027 }), 'bank returned', {
            settled: true,
            send: () => __awaiter(this, void 0, void 0, function* () { throw new Error('mailbox unavailable'); }),
        });
        const failedNotice = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ idempotencyKey: `owner-rent-reversal:${failing._id}:${failingRev._id}` }).lean();
        assert((failedNotice === null || failedNotice === void 0 ? void 0 : failedNotice.status) === 'FAILED', `6 delivery failure is recorded, got ${failedNotice === null || failedNotice === void 0 ? void 0 : failedNotice.status}`);
        assert(Number((_p = (yield Payment_1.Payment.findById(failing._id).lean())) === null || _p === void 0 ? void 0 : _p.amount) === amountBefore, '6 email failure does not change the payment');
        const beforeRetry = sent.length;
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(Object.assign(Object.assign({}, noticePayment), { _id: failing._id, referenceNumber: 'RCPT-FAIL-MAIL', reversalPaymentId: failingRev._id, reversalState: 'reversed', rentalPeriodMonth: 8, rentalPeriodYear: 2027 }), 'bank returned', { settled: true, send: sender });
        assert(sent.length === beforeRetry + 1, '6 a failed notice can be delivered once on retry');
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(Object.assign(Object.assign({}, noticePayment), { _id: failing._id, referenceNumber: 'RCPT-FAIL-MAIL', reversalPaymentId: failingRev._id, reversalState: 'reversed', rentalPeriodMonth: 8, rentalPeriodYear: 2027 }), 'bank returned', { settled: true, send: sender });
        assert(sent.length === beforeRetry + 1, '7 successful delivery is not repeated');
        const revMailBefore = yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({ idempotencyKey: `owner-rent-payment:${reversal._id}` });
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentPayment)(reversal, { accountingComplete: true });
        assert((yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({ idempotencyKey: `owner-rent-payment:${reversal._id}` })) === revMailBefore, '11 REV does not send a rent-received email');
        const corrected = yield rentRow('RCPT-CORRECTED', {
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2027,
            isCorrectionEntry: true,
            status: 'completed',
            commissionDetails: Object.assign(Object.assign({}, commission), { paymentAllocation: {
                    grossAmount: 1800,
                    rent: 1800,
                    levy: 0,
                    commission: 0,
                    commissionNet: 0,
                    vatOnCommission: 0,
                    otherDeductions: 0,
                    ownerPayable: 1800,
                } }),
        });
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentPayment)(corrected, { accountingComplete: true });
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentPayment)(corrected, { accountingComplete: true });
        assert((yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({ idempotencyKey: `owner-rent-payment:${corrected._id}`, status: 'SENT' })) === 1, '12 corrected payment uses the existing notice once');
        const replacedNotice = yield rentRow('RCPT-REPLACED', { rentalPeriodMonth: 7, rentalPeriodYear: 2027, referenceNumber: 'RCPT-REPLACED' });
        const replacedStart = sent.length;
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(Object.assign(Object.assign({}, noticePayment), { _id: neverSent._id, referenceNumber: 'RCPT-NO-MAIL', reversalPaymentId: neverReversal._id, reversalState: 'reversed', rentalPeriodMonth: 7, rentalPeriodYear: 2027 }), 'allocation', { settled: true, send: sender });
        assert(sent.length === replacedStart, '5 repeat of a sent reversal notice does not send again');
        assert(String(replacedNotice.referenceNumber) === 'RCPT-REPLACED', 'replacement row remains available for the status check');
        const withReplacement = (0, ownerRentNotificationPolicy_1.composeOwnerReversalNotice)({
            ownerName: 'Olive Owner',
            propertyLabel: '1 Coverage Road',
            currency: 'USD',
            originalReference: 'RCPT-NO-MAIL',
            originalAmount: 1800,
            reversalReference: 'REV-NO-MAIL',
            reversalAmount: -1800,
            reversalDate: new Date('2026-10-20T00:00:00.000Z'),
            periodLabel: 'July 2027',
            position: (0, ownerRentNotificationPolicy_1.describeRentalPeriodAfterReversal)({
                periodKnown: true,
                originalPaymentId: String(neverSent._id),
                payments: [neverSent.toObject(), neverReversal.toObject(), replacedNotice.toObject()],
            }),
        });
        assert(withReplacement.text.includes('RCPT-REPLACED'), '10 completed replacement is named in the notice');
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        stage('pure cases');
        if (process.env.ACCOUNTING_DB_URI)
            assertDisposable(process.env.ACCOUNTING_DB_URI);
        runPureCoverage();
        runPureNotices();
        try {
            yield runDatabaseCases();
        }
        finally {
            if (database_1.accountingConnection.readyState !== 0)
                yield database_1.accountingConnection.close();
            if (mongoose_1.default.connection.readyState !== 0)
                yield mongoose_1.default.disconnect();
        }
        if (failures.length) {
            console.error(failures.map((failure) => `- ${failure}`).join('\n'));
            console.error(`coverage-notice failures: ${failures.length}`);
            process.exit(1);
        }
        console.log('coverage-notice tests passed');
        process.exit(0);
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
