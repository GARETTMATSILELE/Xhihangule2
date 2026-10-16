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
 * Paynow callback idempotency on a disposable local database.
 * Does not call Paynow and does not use the application database.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const PaymentSession_1 = require("../models/PaymentSession");
const Subscription_1 = require("../models/Subscription");
const WebhookEventReceipt_1 = require("../models/WebhookEventReceipt");
const AccountingException_1 = require("../models/AccountingException");
const applyPolledPayment_1 = require("../services/applyPolledPayment");
const registrationPaymentPolicy_1 = require("../services/registrationPaymentPolicy");
const paynowCallbackService_1 = require("../services/paynowCallbackService");
const database_1 = require("../config/database");
const DB = process.env.PAYNOW_CALLBACK_DB || 'mongodb://127.0.0.1:27017/mantis_paynow_callback_test';
const ACCOUNTING_DB = process.env.PAYNOW_CALLBACK_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_paynow_callback_accounting';
const failures = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function paidPoll(reference) {
    return { status: 'paid', amount: 600, currency: 'USD', reference };
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
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
        yield WebhookEventReceipt_1.WebhookEventReceipt.syncIndexes();
        yield PaymentSession_1.PaymentSession.syncIndexes();
        const user = yield User_1.User.create({
            email: 'paynow-callback@example.test', password: 'test-pass-1', firstName: 'Paynow', lastName: 'Callback',
            role: 'admin', roles: ['admin'], isActive: true, sessionVersion: 1
        });
        function company(name_1) {
            return __awaiter(this, arguments, void 0, function* (name, status = 'PENDING_PAYMENT') {
                return Company_1.Company.create({
                    name, address: '1 Callback Street', phone: '0770000201', email: `${name}@example.test`,
                    registrationNumber: name, tinNumber: name, country: 'Zimbabwe', ownerId: user._id,
                    onboardingStatus: status
                });
            });
        }
        function session(row) {
            return __awaiter(this, void 0, void 0, function* () {
                return PaymentSession_1.PaymentSession.create({
                    companyId: row.companyId,
                    userId: user._id,
                    idempotencyKey: `paynow:${row.reference}:${new mongoose_1.default.Types.ObjectId().toString()}`,
                    provider: 'paynow',
                    providerRef: row.reference,
                    plan: 'SME',
                    billingCycle: 'monthly',
                    amount: 600,
                    currency: 'USD',
                    status: row.status || 'provider_created',
                    metadata: row.seam ? { testSeam: row.seam } : undefined
                });
            });
        }
        function deliver(reference_1, eventId_1) {
            return __awaiter(this, arguments, void 0, function* (reference, eventId, poll = paidPoll(reference), payloadFingerprint) {
                return (0, paynowCallbackService_1.processVerifiedPaynowEvent)({
                    reference,
                    eventId,
                    payloadFingerprint,
                    apply: () => (0, applyPolledPayment_1.applyPolledPayment)(reference, poll)
                });
            });
        }
        const registered = yield company('Callback Co');
        yield session({ companyId: registered._id, reference: 'REF-REPEAT' });
        const first = yield deliver('REF-REPEAT', 'hash-repeat');
        const second = yield deliver('REF-REPEAT', 'hash-repeat');
        assert(first.activated === true, 'the first paid callback activates registration');
        assert(second.status === 'duplicate' && second.activated === false, 'the same webhook event does not activate again');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: registered._id })) === 1, 'repeated delivery leaves one subscription');
        assert(((_a = (yield Company_1.Company.findById(registered._id))) === null || _a === void 0 ? void 0 : _a.onboardingStatus) === 'INITIALIZING_WORKSPACE', 'registration moves to workspace initialisation');
        const concurrentCompany = yield company('Concurrent Co');
        yield session({ companyId: concurrentCompany._id, reference: 'REF-CONCURRENT' });
        const concurrent = yield Promise.all([
            deliver('REF-CONCURRENT', 'hash-concurrent'),
            deliver('REF-CONCURRENT', 'hash-concurrent')
        ]);
        assert(concurrent.filter((row) => row.activated).length === 1, 'concurrent delivery of one event activates once');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: concurrentCompany._id })) === 1, 'concurrent delivery leaves one subscription');
        const partialCompany = yield company('Partial Co');
        const partialSession = yield session({ companyId: partialCompany._id, reference: 'REF-PARTIAL', seam: 'PHASE_FAIL_ACTIVATION_AFTER_PAID' });
        let partialThrew = false;
        try {
            yield deliver('REF-PARTIAL', 'hash-partial');
        }
        catch (_4) {
            partialThrew = true;
        }
        assert(partialThrew, 'a failure after payment confirmation is propagated');
        assert(((_b = (yield PaymentSession_1.PaymentSession.findById(partialSession._id))) === null || _b === void 0 ? void 0 : _b.status) === 'paid', 'the session stays paid after the activation failure');
        assert(((_c = (yield Company_1.Company.findById(partialCompany._id))) === null || _c === void 0 ? void 0 : _c.onboardingStatus) === 'PENDING_PAYMENT', 'registration is not activated by the failed callback');
        const resumed = yield deliver('REF-PARTIAL', 'hash-partial');
        assert(resumed.activated === true, 'retry after the partial failure resumes activation');
        assert(((_d = (yield PaymentSession_1.PaymentSession.findById(partialSession._id))) === null || _d === void 0 ? void 0 : _d.status) === 'reconciled', 'the retried session is reconciled');
        assert(((_e = (yield Company_1.Company.findById(partialCompany._id))) === null || _e === void 0 ? void 0 : _e.onboardingStatus) === 'INITIALIZING_WORKSPACE', 'retry activates registration once');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: partialCompany._id })) === 1, 'partial-failure retry leaves one subscription');
        const cancelledCompany = yield company('Cancelled Co');
        const cancelled = yield session({ companyId: cancelledCompany._id, reference: 'REF-CANCELLED', status: 'cancelled' });
        const cancelledResult = yield deliver('REF-CANCELLED', 'hash-cancelled');
        assert(cancelledResult.ignored === true && cancelledResult.activated === false, 'a callback does not activate a cancelled checkout');
        assert(((_f = (yield PaymentSession_1.PaymentSession.findById(cancelled._id))) === null || _f === void 0 ? void 0 : _f.status) === 'cancelled', 'the cancelled session stays cancelled');
        const failedCompany = yield company('Failed Co');
        const failedSession = yield session({ companyId: failedCompany._id, reference: 'REF-FAILED', status: 'failed' });
        const failedResult = yield deliver('REF-FAILED', 'hash-failed');
        assert(failedResult.ignored === true && failedResult.activated === false, 'a delayed callback does not activate a failed checkout');
        assert(((_g = (yield PaymentSession_1.PaymentSession.findById(failedSession._id))) === null || _g === void 0 ? void 0 : _g.status) === 'failed', 'the failed session stays failed');
        const expiredCompany = yield company('Expired Co');
        const expiredSession = yield session({ companyId: expiredCompany._id, reference: 'REF-EXPIRED', status: 'expired' });
        const expiredResult = yield deliver('REF-EXPIRED', 'hash-expired');
        assert(expiredResult.ignored === true && expiredResult.activated === false, 'a delayed callback does not activate an expired checkout');
        assert(((_h = (yield PaymentSession_1.PaymentSession.findById(expiredSession._id))) === null || _h === void 0 ? void 0 : _h.status) === 'expired', 'the expired session stays expired');
        assert(((_j = (yield Company_1.Company.findById(cancelledCompany._id))) === null || _j === void 0 ? void 0 : _j.onboardingStatus) === 'PENDING_PAYMENT', 'a cancelled checkout does not activate registration');
        const pendingCompany = yield company('Pending Co');
        yield session({ companyId: pendingCompany._id, reference: 'REF-PENDING' });
        const pending = yield deliver('REF-PENDING', 'hash-pending', { status: 'sent', amount: 600, currency: 'USD', reference: 'REF-PENDING' });
        assert(pending.activated === false, 'a non-paid callback does not activate registration');
        assert(((_k = (yield Company_1.Company.findById(pendingCompany._id))) === null || _k === void 0 ? void 0 : _k.onboardingStatus) === 'PENDING_PAYMENT', 'a pending callback leaves registration unpaid');
        const sameTxn = yield company('Same Transaction Co');
        yield session({ companyId: sameTxn._id, reference: 'REF-SAME' });
        yield deliver('REF-SAME', 'hash-a');
        const otherHash = yield deliver('REF-SAME', 'hash-b');
        assert(otherHash.activated === false, 'a changed event hash does not activate a completed registration again');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: sameTxn._id })) === 1, 'two event hashes for one paid session leave one subscription');
        assert((yield WebhookEventReceipt_1.WebhookEventReceipt.countDocuments({ provider: 'paynow', eventId: { $in: ['hash-a', 'hash-b'] } })) === 2, 'different hashes are different callback receipts');
        const raceCompany = yield company('Race Co');
        yield session({ companyId: raceCompany._id, reference: 'REF-RACE' });
        const raced = yield Promise.allSettled([
            deliver('REF-RACE', 'hash-race-a'),
            deliver('REF-RACE', 'hash-race-b')
        ]);
        assert(raced.filter((row) => row.status === 'fulfilled' && row.value.activated).length === 1, 'two callback ids for one session activate once');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: raceCompany._id })) === 1, 'two callback ids leave one subscription');
        const fingerCompany = yield company('Fingerprint Co');
        yield session({ companyId: fingerCompany._id, reference: 'REF-FINGER' });
        const firstFinger = yield deliver('REF-FINGER', 'hash-finger', paidPoll('REF-FINGER'), 'REF-FINGER|Paid|600');
        const changedFinger = yield deliver('REF-FINGER', 'hash-finger', { status: 'cancelled', amount: 600, currency: 'USD', reference: 'REF-FINGER' }, 'REF-FINGER|Cancelled|600');
        assert(firstFinger.activated === true, 'the first fingerprinted callback activates');
        assert(changedFinger.status === 'payload_conflict' && changedFinger.activated === false, 'a changed payload for the same event is not treated as an ordinary duplicate');
        assert(((_l = (yield PaymentSession_1.PaymentSession.findOne({ providerRef: 'REF-FINGER' }))) === null || _l === void 0 ? void 0 : _l.status) === 'reconciled', 'the changed payload does not undo the paid session');
        const expireProvider = yield company('Provider Expired Co');
        const expireSession = yield session({ companyId: expireProvider._id, reference: 'REF-PROVIDER-EXPIRED' });
        const expiredPoll = yield deliver('REF-PROVIDER-EXPIRED', 'hash-provider-expired', { status: 'expired', amount: 600, currency: 'USD', reference: 'REF-PROVIDER-EXPIRED' });
        assert(expiredPoll.activated === false, 'an expired provider status does not activate');
        assert(((_m = (yield PaymentSession_1.PaymentSession.findById(expireSession._id))) === null || _m === void 0 ? void 0 : _m.status) === 'expired', 'an expired provider status is stored as expired');
        const latePaid = yield deliver('REF-PROVIDER-EXPIRED', 'hash-provider-expired-late');
        assert(latePaid.activated === false && latePaid.ignored === true, 'a later paid callback does not activate an expired checkout');
        assert((0, registrationPaymentPolicy_1.paynowCheckoutDecision)({ status: 'provider_created', pollUrl: 'https://www.paynow.co.zw/Interface/Poll' }) === 'awaiting', 'an open Paynow poll is not started again');
        assert((0, registrationPaymentPolicy_1.paynowCheckoutDecision)({ status: 'cancelled' }) === 'closed', 'a cancelled checkout is not started again');
        assert((0, registrationPaymentPolicy_1.paynowCheckoutDecision)({ status: 'pending' }) === 'create', 'a session without a poll can start checkout');
        assert((0, registrationPaymentPolicy_1.paynowCheckoutDecision)({ status: 'provider_created', pollUrl: 'https://example.invalid/poll' }) === 'closed', 'an unexpected poll URL does not start another payment');
        const duplicateRefCompany = yield company('Duplicate Ref Co');
        yield session({ companyId: duplicateRefCompany._id, reference: 'REF-DUP' });
        yield session({ companyId: duplicateRefCompany._id, reference: 'REF-DUP' });
        assert((yield PaymentSession_1.PaymentSession.countDocuments({ providerRef: 'REF-DUP' })) === 2, 'providerRef is not unique, so two sessions can share it');
        const ambiguous = yield deliver('REF-DUP', 'hash-dup');
        assert(ambiguous.activated === false && ambiguous.ignored === true, 'an ambiguous provider reference is not activated');
        const dupSessions = yield PaymentSession_1.PaymentSession.find({ providerRef: 'REF-DUP' }).select('status').lean();
        assert(dupSessions.every((row) => row.status === 'provider_created'), 'neither ambiguous session is changed');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: duplicateRefCompany._id })) === 0, 'an ambiguous provider reference does not create a subscription');
        const review = yield AccountingException_1.AccountingException.findOne({
            companyId: duplicateRefCompany._id,
            kind: 'financial_review',
            component: 'PAYNOW_PROVIDER_REF_AMBIGUOUS'
        }).lean();
        assert(Boolean(review), 'an ambiguous provider reference records a review');
        const ambiguousConcurrent = yield company('Ambiguous Concurrent Co');
        yield session({ companyId: ambiguousConcurrent._id, reference: 'REF-DUP-CONCURRENT' });
        yield session({ companyId: ambiguousConcurrent._id, reference: 'REF-DUP-CONCURRENT' });
        const concurrentAmbiguous = yield Promise.all([
            deliver('REF-DUP-CONCURRENT', 'hash-dup-concurrent-a'),
            deliver('REF-DUP-CONCURRENT', 'hash-dup-concurrent-b')
        ]);
        assert(concurrentAmbiguous.every((row) => row.activated === false), 'concurrent callbacks do not activate an ambiguous provider reference');
        assert((yield PaymentSession_1.PaymentSession.find({ providerRef: 'REF-DUP-CONCURRENT' }).select('status').lean()).every((row) => row.status === 'provider_created'), 'concurrent ambiguous callbacks leave both sessions unchanged');
        const reviewFailureCompany = yield company('Review Failure Co');
        yield session({ companyId: reviewFailureCompany._id, reference: 'REF-REVIEW-FAIL' });
        yield session({ companyId: reviewFailureCompany._id, reference: 'REF-REVIEW-FAIL' });
        global.__failPaynowReview = true;
        const reviewFailure = yield deliver('REF-REVIEW-FAIL', 'hash-review-fail');
        assert(reviewFailure.activated === false && reviewFailure.ignored === true, 'a review-write failure still does not activate an ambiguous reference');
        assert((yield PaymentSession_1.PaymentSession.countDocuments({ providerRef: 'REF-REVIEW-FAIL', status: 'provider_created' })) === 2, 'a review-write failure leaves both sessions unchanged');
        assert((yield AccountingException_1.AccountingException.countDocuments({ component: 'PAYNOW_PROVIDER_REF_AMBIGUOUS', 'accountingRef.transactionId': 'REF-REVIEW-FAIL' })) === 0, 'the failed review write is not reported as a stored review');
        const auditGateCompany = yield company('Audit Gate Co');
        const auditGateSession = yield session({ companyId: auditGateCompany._id, reference: 'REF-AUDIT-GATE' });
        global.__failAuditAction = 'payment.verified';
        let auditGateThrew = false;
        try {
            yield deliver('REF-AUDIT-GATE', 'hash-audit-gate');
        }
        catch (error) {
            auditGateThrew = (error === null || error === void 0 ? void 0 : error.code) === 'AUDIT_PERSIST_FAILED';
        }
        assert(auditGateThrew, 'activation does not start when the payment audit cannot be stored');
        assert(((_o = (yield PaymentSession_1.PaymentSession.findById(auditGateSession._id))) === null || _o === void 0 ? void 0 : _o.status) === 'provider_created', 'a missing activation audit leaves the session unpaid');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: auditGateCompany._id })) === 0, 'a missing activation audit does not create a subscription');
        const failedAuditCompany = yield company('Failed Audit Co');
        const failedAuditSession = yield session({ companyId: failedAuditCompany._id, reference: 'REF-FAIL-AUDIT' });
        global.__failAuditAction = 'checkout.cancelled';
        const failedAudit = yield deliver('REF-FAIL-AUDIT', 'hash-fail-audit', { status: 'cancelled', amount: 600, currency: 'USD', reference: 'REF-FAIL-AUDIT' });
        assert(failedAudit.activated === false, 'a cancelled callback does not activate registration');
        assert(((_p = (yield PaymentSession_1.PaymentSession.findById(failedAuditSession._id))) === null || _p === void 0 ? void 0 : _p.status) === 'cancelled', 'the cancelled outcome stays cancelled when its audit write fails');
        assert((yield AccountingException_1.AccountingException.countDocuments({ component: 'AUDIT_EVENT_MISSING', 'accountingRef.transactionId': String(failedAuditSession._id) })) === 1, 'a missing cancellation audit is recorded for review');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: failedAuditCompany._id })) === 0, 'a missing cancellation audit does not create a subscription');
        const missingMeta = yield company('Missing Key Co');
        const missingSession = yield session({ companyId: missingMeta._id, reference: 'REF-NO-META' });
        global.__paynowDuplicateKey = { code: 11000 };
        let missingMetaThrew = false;
        try {
            yield deliver('REF-NO-META', 'hash-no-meta');
        }
        catch (_5) {
            missingMetaThrew = true;
        }
        assert(missingMetaThrew, 'a duplicate key without index metadata does not count as the same event');
        assert(((_q = (yield PaymentSession_1.PaymentSession.findById(missingSession._id))) === null || _q === void 0 ? void 0 : _q.status) === 'provider_created', 'missing duplicate-key metadata does not activate the session');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: missingMeta._id })) === 0, 'missing duplicate-key metadata does not create a subscription');
        const otherIndex = yield company('Other Index Co');
        const otherSession = yield session({ companyId: otherIndex._id, reference: 'REF-OTHER-INDEX' });
        global.__paynowDuplicateKey = { code: 11000, keyPattern: { email: 1 }, keyValue: { email: 'other@example.test' } };
        let otherThrew = false;
        try {
            yield deliver('REF-OTHER-INDEX', 'hash-other-index');
        }
        catch (_6) {
            otherThrew = true;
        }
        assert(otherThrew, 'an unrelated duplicate key does not count as this Paynow event');
        assert(((_r = (yield PaymentSession_1.PaymentSession.findById(otherSession._id))) === null || _r === void 0 ? void 0 : _r.status) === 'provider_created', 'an unrelated duplicate key leaves the session unchanged');
        const uncertainCompany = yield company('Uncertain Receipt Co');
        const uncertainSession = yield session({ companyId: uncertainCompany._id, reference: 'REF-UNCERTAIN' });
        global.__paynowUncertainReceiptCreate = true;
        let uncertainThrew = false;
        try {
            yield deliver('REF-UNCERTAIN', 'hash-uncertain');
        }
        catch (_7) {
            uncertainThrew = true;
        }
        const uncertainRetry = yield (0, paynowCallbackService_1.claimPaynowEvent)('hash-uncertain');
        assert(uncertainThrew, 'an uncertain receipt write is not treated as payment success');
        assert(uncertainRetry.action === 'in_progress', 'an uncertain receipt write does not start a second callback');
        assert(((_s = (yield PaymentSession_1.PaymentSession.findById(uncertainSession._id))) === null || _s === void 0 ? void 0 : _s.status) === 'provider_created', 'an uncertain receipt write does not mark the session paid');
        function backdateClaim(id) {
            return __awaiter(this, void 0, void 0, function* () {
                yield PaymentSession_1.PaymentSession.updateOne({ _id: id }, { $set: { 'metadata.activationClaimedAt': new Date(Date.now() - 10 * 60 * 1000) } });
            });
        }
        const afterClaim = yield company('After Claim Co');
        const afterClaimSession = yield session({ companyId: afterClaim._id, reference: 'REF-AFTER-CLAIM', seam: 'PHASE_FAIL_ACTIVATION_AFTER_CLAIM' });
        let afterClaimThrew = false;
        try {
            yield deliver('REF-AFTER-CLAIM', 'hash-after-claim');
        }
        catch (_8) {
            afterClaimThrew = true;
        }
        assert(afterClaimThrew, 'a failure after the activation claim is propagated');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: afterClaim._id })) === 0, 'a failure after the claim does not create a subscription');
        assert(((_t = (yield PaymentSession_1.PaymentSession.findById(afterClaimSession._id))) === null || _t === void 0 ? void 0 : _t.status) === 'paid', 'a failure after the claim keeps the payment');
        yield backdateClaim(afterClaimSession._id);
        const afterClaimResume = yield deliver('REF-AFTER-CLAIM', 'hash-after-claim');
        assert(afterClaimResume.activated === true, 'a stale activation claim can resume the same session');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: afterClaim._id })) === 1, 'resuming after the claim creates one subscription');
        const afterSub = yield company('After Subscription Co');
        const afterSubSession = yield session({ companyId: afterSub._id, reference: 'REF-AFTER-SUB', seam: 'PHASE_FAIL_ACTIVATION_AFTER_SUBSCRIPTION' });
        let afterSubThrew = false;
        try {
            yield deliver('REF-AFTER-SUB', 'hash-after-sub');
        }
        catch (_9) {
            afterSubThrew = true;
        }
        assert(afterSubThrew, 'a failure after subscription creation is propagated');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: afterSub._id })) === 1, 'the subscription created before the failure is kept');
        assert(((_u = (yield PaymentSession_1.PaymentSession.findById(afterSubSession._id))) === null || _u === void 0 ? void 0 : _u.status) === 'paid', 'the session stays paid until reconciliation is stored');
        yield backdateClaim(afterSubSession._id);
        const afterSubResume = yield deliver('REF-AFTER-SUB', 'hash-after-sub');
        assert(afterSubResume.activated === true, 'retry after subscription creation finishes the same session');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: afterSub._id })) === 1, 'retry after subscription creation does not create a second subscription');
        const afterDone = yield company('After Reconciled Co');
        const afterDoneSession = yield session({ companyId: afterDone._id, reference: 'REF-AFTER-DONE', seam: 'PHASE_FAIL_ACTIVATION_AFTER_RECONCILED' });
        let afterDoneThrew = false;
        try {
            yield deliver('REF-AFTER-DONE', 'hash-after-done');
        }
        catch (_10) {
            afterDoneThrew = true;
        }
        assert(afterDoneThrew, 'a failure after reconciliation is propagated');
        assert(((_v = (yield PaymentSession_1.PaymentSession.findById(afterDoneSession._id))) === null || _v === void 0 ? void 0 : _v.status) === 'reconciled', 'reconciliation stays stored when the following write fails');
        assert(((_w = (yield Company_1.Company.findById(afterDone._id))) === null || _w === void 0 ? void 0 : _w.onboardingStatus) === 'PENDING_PAYMENT', 'registration stays unpaid when the completion write fails');
        const afterDoneResume = yield deliver('REF-AFTER-DONE', 'hash-after-done');
        assert(afterDoneResume.activated === false, 'a reconciled session is not activated a second time');
        assert(((_x = (yield Company_1.Company.findById(afterDone._id))) === null || _x === void 0 ? void 0 : _x.onboardingStatus) === 'INITIALIZING_WORKSPACE', 'retry finishes registration for the reconciled session');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: afterDone._id })) === 1, 'retry after reconciliation leaves one subscription');
        const refundCompany = yield company('Refund Co');
        yield session({ companyId: refundCompany._id, reference: 'REF-LATE-REFUND' });
        yield deliver('REF-LATE-REFUND', 'hash-late-paid');
        const refunded = yield deliver('REF-LATE-REFUND', 'hash-late-refund', { status: 'refunded', amount: 600, currency: 'USD', reference: 'REF-LATE-REFUND' });
        assert(refunded.activated === false, 'a late refund does not activate another subscription');
        assert(((_y = (yield PaymentSession_1.PaymentSession.findOne({ providerRef: 'REF-LATE-REFUND' }))) === null || _y === void 0 ? void 0 : _y.status) === 'reconciled', 'a late refund leaves the paid session reconciled');
        assert((yield AccountingException_1.AccountingException.countDocuments({ companyId: refundCompany._id, component: 'PAYNOW_LATE_STATUS' })) === 1, 'a late refund records one review');
        const refundAgain = yield deliver('REF-LATE-REFUND', 'hash-late-refund', { status: 'refunded', amount: 600, currency: 'USD', reference: 'REF-LATE-REFUND' });
        assert(refundAgain.status === 'duplicate', 'the same refund event is not reviewed as a new payment');
        assert((yield AccountingException_1.AccountingException.countDocuments({ companyId: refundCompany._id, component: 'PAYNOW_LATE_STATUS' })) === 1, 'repeating the refund event leaves one review');
        assert((yield Subscription_1.Subscription.countDocuments({ companyId: refundCompany._id })) === 1, 'a late refund does not create a second subscription');
        const disputeCompany = yield company('Dispute Co');
        yield session({ companyId: disputeCompany._id, reference: 'REF-LATE-DISPUTE' });
        yield deliver('REF-LATE-DISPUTE', 'hash-dispute-paid');
        global.__failPaynowLateReview = true;
        const disputed = yield deliver('REF-LATE-DISPUTE', 'hash-dispute', { status: 'disputed', amount: 600, currency: 'USD', reference: 'REF-LATE-DISPUTE' });
        assert(disputed.activated === false, 'a late dispute does not activate another subscription');
        assert(((_z = (yield PaymentSession_1.PaymentSession.findOne({ providerRef: 'REF-LATE-DISPUTE' }))) === null || _z === void 0 ? void 0 : _z.status) === 'reconciled', 'a late dispute leaves the paid session reconciled');
        assert((yield AccountingException_1.AccountingException.countDocuments({ companyId: disputeCompany._id, component: 'PAYNOW_LATE_STATUS' })) === 0, 'a failed dispute review is not reported as stored');
        yield deliver('REF-LATE-DISPUTE', 'hash-dispute-2', { status: 'disputed', amount: 600, currency: 'USD', reference: 'REF-LATE-DISPUTE' });
        assert((yield AccountingException_1.AccountingException.countDocuments({ companyId: disputeCompany._id, component: 'PAYNOW_LATE_STATUS' })) === 1, 'a later dispute event can record the review');
        assert(((_0 = (yield PaymentSession_1.PaymentSession.findOne({ providerRef: 'REF-LATE-DISPUTE' }))) === null || _0 === void 0 ? void 0 : _0.status) === 'reconciled', 'the stored dispute review does not reverse the session');
        const unknownCompany = yield company('Unknown Status Co');
        yield session({ companyId: unknownCompany._id, reference: 'REF-UNKNOWN' });
        yield deliver('REF-UNKNOWN', 'hash-unknown-paid');
        const unknown = yield deliver('REF-UNKNOWN', 'hash-unknown', { status: 'processing', amount: 600, currency: 'USD', reference: 'REF-UNKNOWN' });
        assert(unknown.activated === false, 'an unrecognised status does not activate a reconciled session again');
        assert(((_1 = (yield PaymentSession_1.PaymentSession.findOne({ providerRef: 'REF-UNKNOWN' }))) === null || _1 === void 0 ? void 0 : _1.status) === 'reconciled', 'an unrecognised status does not overwrite a reconciled session');
        const stalePending = yield company('Stale Pending Co');
        const staleSession = yield session({ companyId: stalePending._id, reference: 'REF-STALE', seam: 'PHASE_FAIL_ACTIVATION_AFTER_PAID' });
        try {
            yield deliver('REF-STALE', 'hash-stale');
        }
        catch ( /* payment stored, activation stopped */_11) { /* payment stored, activation stopped */ }
        const stale = yield deliver('REF-STALE', 'hash-stale-pending', { status: 'sent', amount: 600, currency: 'USD', reference: 'REF-STALE' });
        assert(stale.activated === false, 'an older pending callback does not finish a paid session');
        assert(((_2 = (yield PaymentSession_1.PaymentSession.findById(staleSession._id))) === null || _2 === void 0 ? void 0 : _2.status) === 'paid', 'an older pending callback leaves the paid session paid');
        const conflictCompany = yield company('Conflict Refund Co');
        yield session({ companyId: conflictCompany._id, reference: 'REF-CONFLICT-REFUND' });
        yield deliver('REF-CONFLICT-REFUND', 'hash-conflict', paidPoll('REF-CONFLICT-REFUND'), 'REF-CONFLICT-REFUND|Paid|600');
        const conflictRefund = yield deliver('REF-CONFLICT-REFUND', 'hash-conflict', { status: 'refunded', amount: 600, currency: 'USD', reference: 'REF-CONFLICT-REFUND' }, 'REF-CONFLICT-REFUND|Refunded|600');
        assert(conflictRefund.status === 'payload_conflict' && conflictRefund.activated === false, 'a changed refund fingerprint is not an ordinary duplicate');
        assert(((_3 = (yield PaymentSession_1.PaymentSession.findOne({ providerRef: 'REF-CONFLICT-REFUND' }))) === null || _3 === void 0 ? void 0 : _3.status) === 'reconciled', 'a conflicting refund fingerprint does not reverse the session');
        assert((yield AccountingException_1.AccountingException.countDocuments({ companyId: conflictCompany._id, component: 'PAYNOW_LATE_STATUS' })) === 1, 'a conflicting refund fingerprint records a review');
        const modeEnv = { PAYNOW_INTEGRATION_ID: 'id', PAYNOW_INTEGRATION_KEY: 'key' };
        assert((0, registrationPaymentPolicy_1.paynowConfigurationState)(Object.assign(Object.assign({}, modeEnv), { PAYNOW_MODE: 'test' })).mode === 'test', 'test mode stays test');
        assert((0, registrationPaymentPolicy_1.paynowConfigurationState)(Object.assign(Object.assign({}, modeEnv), { PAYNOW_MODE: 'sandbox' })).mode === 'test', 'sandbox mode stays test');
        assert((0, registrationPaymentPolicy_1.paynowConfigurationState)(Object.assign(Object.assign({}, modeEnv), { PAYNOW_MODE: 'live' })).mode === 'live', 'live mode stays live');
        assert((0, registrationPaymentPolicy_1.paynowConfigurationState)(modeEnv).mode === 'unspecified', 'a blank mode does not choose test or live');
        assert((0, registrationPaymentPolicy_1.paynowConfigurationState)(Object.assign(Object.assign({}, modeEnv), { PAYNOW_MODE: 'production' })).mode === 'invalid', 'an unknown mode is invalid');
        assert((0, registrationPaymentPolicy_1.paynowConfigurationState)({}).mode === 'unconfigured', 'missing credentials stay unconfigured');
        if (failures.length) {
            console.error(failures.join('\n'));
            process.exit(1);
        }
        console.log('PASS Paynow callback tests on local MongoDB. Paynow was not called and Cosmos DB was not used.');
        yield mongoose_1.default.disconnect();
        yield database_1.accountingConnection.close();
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
