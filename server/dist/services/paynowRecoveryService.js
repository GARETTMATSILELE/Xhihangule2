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
exports.recoverOutstandingPaynowSessions = recoverOutstandingPaynowSessions;
exports.startPaynowRecoveryJob = startPaynowRecoveryJob;
const axios_1 = __importDefault(require("axios"));
const PaymentSession_1 = require("../models/PaymentSession");
const applyPolledPayment_1 = require("./applyPolledPayment");
const logger_1 = require("../utils/logger");
const paynowHash_1 = require("./paynowHash");
const registrationPaymentPolicy_1 = require("./registrationPaymentPolicy");
const BATCH_LIMIT = 10;
function integrationKey() {
    return (0, paynowHash_1.normalizePaynowCredential)(process.env.PAYNOW_INTEGRATION_KEY);
}
function recoverOutstandingPaynowSessions() {
    return __awaiter(this, arguments, void 0, function* (now = new Date()) {
        var _a, _b;
        if (!integrationKey())
            return { checked: 0, applied: 0 };
        const candidates = yield PaymentSession_1.PaymentSession.find({
            provider: 'paynow',
            status: 'provider_created',
            pollUrl: { $exists: true, $nin: [null, ''] }
        }).sort({ createdAt: 1 }).limit(BATCH_LIMIT);
        let checked = 0;
        let applied = 0;
        for (const session of candidates) {
            const decision = (0, registrationPaymentPolicy_1.paynowRecoveryDecision)(session, now);
            if (decision.action !== 'poll')
                continue;
            const claimed = yield PaymentSession_1.PaymentSession.findOneAndUpdate({ _id: session._id, status: 'provider_created' }, {
                $inc: { 'metadata.paynowRecovery.attempts': 1 },
                $set: { 'metadata.paynowRecovery.lastAttemptAt': now }
            }, { new: true });
            if (!claimed || Number(((_b = (_a = claimed.metadata) === null || _a === void 0 ? void 0 : _a.paynowRecovery) === null || _b === void 0 ? void 0 : _b.attempts) || 0) > registrationPaymentPolicy_1.PAYNOW_RECOVERY_MAX_ATTEMPTS) {
                continue;
            }
            checked += 1;
            const reference = String(claimed.providerRef || '');
            try {
                const outcome = yield recoverOneSession(claimed);
                if (outcome === 'applied')
                    applied += 1;
                logger_1.logger.info('paynow_recovery_checked', {
                    correlationId: reference,
                    reference,
                    paymentSessionId: String(claimed._id),
                    outcome
                });
            }
            catch (error) {
                logger_1.logger.warn('paynow_recovery_failed', {
                    correlationId: reference,
                    reference,
                    paymentSessionId: String(claimed._id),
                    error: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 160)
                });
            }
        }
        return { checked, applied };
    });
}
function recoverOneSession(session) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const pollUrl = String(session.pollUrl || '');
        const reference = String(session.providerRef || '');
        if (!(0, registrationPaymentPolicy_1.isAllowedPaynowPollUrl)(pollUrl))
            return 'rejected';
        const response = yield axios_1.default.post(pollUrl, null, { timeout: 15000, responseType: 'text', maxRedirects: 0 });
        const raw = typeof response.data === 'string' ? response.data : String(response.data || '');
        const fields = (0, paynowHash_1.parsePaynowBody)(raw);
        if (!(0, registrationPaymentPolicy_1.verifyPaynowPayload)(fields, integrationKey()))
            return 'unverified';
        const poll = {
            status: fields.status,
            amount: fields.amount,
            currency: fields.currency,
            reference: fields.reference,
            paynowReference: fields.paynowreference,
            origin: 'verified_poll'
        };
        const storedPaynowReference = String(((_a = session.rawProviderResponse) === null || _a === void 0 ? void 0 : _a.paynowReference) || '').trim();
        if (storedPaynowReference && poll.paynowReference && storedPaynowReference !== poll.paynowReference)
            return 'rejected';
        if (String(session.companyId || '') === '')
            return 'rejected';
        const verdict = (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: Number(session.amount), currency: String(session.currency || 'USD'), providerRef: reference }, poll);
        if (verdict.outcome === 'pending')
            return 'pending';
        if (verdict.outcome === 'rejected')
            return 'rejected';
        yield (0, applyPolledPayment_1.applyPolledPayment)(reference, poll);
        return 'applied';
    });
}
let recoveryTimer;
let recoveryStarted = false;
function startPaynowRecoveryJob() {
    var _a, _b;
    if (recoveryStarted || process.env.NODE_ENV !== 'production' || process.env.PAYNOW_RECOVERY_DISABLED === '1')
        return;
    recoveryStarted = true;
    const run = () => {
        recoverOutstandingPaynowSessions().catch((error) => {
            logger_1.logger.warn('paynow_recovery_failed', {
                error: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 160)
            });
        });
    };
    const initial = setTimeout(run, 15000);
    (_a = initial.unref) === null || _a === void 0 ? void 0 : _a.call(initial);
    recoveryTimer = setInterval(run, 2 * 60 * 1000);
    (_b = recoveryTimer.unref) === null || _b === void 0 ? void 0 : _b.call(recoveryTimer);
}
