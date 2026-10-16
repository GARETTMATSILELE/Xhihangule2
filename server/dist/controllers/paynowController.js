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
exports.initiatePaynowCheckout = initiatePaynowCheckout;
exports.getStatus = getStatus;
exports.createWebPayment = createWebPayment;
exports.createMobilePayment = createMobilePayment;
exports.pollTransaction = pollTransaction;
exports.handleResult = handleResult;
exports.confirmByReference = confirmByReference;
exports.handleReturn = handleReturn;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const User_1 = require("../models/User");
const plan_1 = require("../types/plan");
const systemPlanService_1 = require("../services/systemPlanService");
const registrationPaymentPolicy_1 = require("../services/registrationPaymentPolicy");
const applyPolledPayment_1 = require("../services/applyPolledPayment");
const operationalSignal_1 = require("../services/operationalSignal");
const auditService_1 = require("../services/auditService");
const logger_1 = require("../utils/logger");
const operationalFailure_1 = require("../services/operationalFailure");
const paynowCallbackService_1 = require("../services/paynowCallbackService");
// The official package does not ship TypeScript types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Paynow } = require('paynow');
function readEnv() {
    const env = {
        INTEGRATION_ID: process.env.PAYNOW_INTEGRATION_ID,
        INTEGRATION_KEY: process.env.PAYNOW_INTEGRATION_KEY,
        RESULT_URL: process.env.PAYNOW_RESULT_URL,
        RETURN_URL: process.env.PAYNOW_RETURN_URL,
        PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL
    };
    // Fallback: allow reading from server/config/local.paynow.json in development
    if ((!env.INTEGRATION_ID || !env.INTEGRATION_KEY) && (process.env.NODE_ENV !== 'production')) {
        try {
            const cfgPath = path_1.default.resolve(__dirname, '..', '..', 'config', 'local.paynow.json');
            if (fs_1.default.existsSync(cfgPath)) {
                const raw = fs_1.default.readFileSync(cfgPath, 'utf8');
                const json = JSON.parse(raw);
                env.INTEGRATION_ID = env.INTEGRATION_ID || json.PAYNOW_INTEGRATION_ID || json.INTEGRATION_ID;
                env.INTEGRATION_KEY = env.INTEGRATION_KEY || json.PAYNOW_INTEGRATION_KEY || json.INTEGRATION_KEY;
                env.RESULT_URL = env.RESULT_URL || json.PAYNOW_RESULT_URL || json.RESULT_URL;
                env.RETURN_URL = env.RETURN_URL || json.PAYNOW_RETURN_URL || json.RETURN_URL;
                env.PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || json.PUBLIC_BASE_URL;
            }
        }
        catch (_a) {
            // ignore
        }
    }
    return env;
}
function resolveBaseUrl(req, env) {
    if (env.PUBLIC_BASE_URL)
        return env.PUBLIC_BASE_URL.replace(/\/+$/, '');
    const host = req.get('host');
    const proto = req.protocol;
    return `${proto}://${host}`;
}
function getPaynowForRequest(req) {
    const env = readEnv();
    if (!env.INTEGRATION_ID || !env.INTEGRATION_KEY) {
        throw httpError('Checkout is temporarily unavailable.', 503, 'PAYNOW_NOT_CONFIGURED');
    }
    if ((0, registrationPaymentPolicy_1.paynowConfigurationState)().mode === 'invalid') {
        throw httpError('Paynow mode is not supported. Use test, sandbox, or live.', 503, 'PAYNOW_MODE_INVALID');
    }
    const paynow = new Paynow(env.INTEGRATION_ID, env.INTEGRATION_KEY);
    // Configure result/return URLs for this request (fall back to server-computed URLs)
    const base = resolveBaseUrl(req, env);
    paynow.resultUrl = (env.RESULT_URL && env.RESULT_URL.trim().length > 0)
        ? env.RESULT_URL
        : `${base}/api/paynow/result`;
    paynow.returnUrl = (env.RETURN_URL && env.RETURN_URL.trim().length > 0)
        ? env.RETURN_URL
        : `${base}/api/paynow/return`;
    return paynow;
}
function httpError(message, statusCode, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}
function initiatePaynowCheckout(req, input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!input.paymentSessionId) {
            throw httpError('A payment session is required', 400, 'PAYMENT_SESSION_REQUIRED');
        }
        const session = yield PaymentSession_1.PaymentSession.findById(input.paymentSessionId);
        if (!session) {
            throw httpError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
        }
        const callerCompanyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (callerCompanyId && String(session.companyId) !== String(callerCompanyId)) {
            throw httpError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
        }
        if (session.status === 'paid' || session.status === 'reconciled') {
            throw httpError('This payment has already been completed', 409, 'PAYMENT_ALREADY_COMPLETED');
        }
        const plan = session.plan;
        const cycle = session.billingCycle;
        if (!plan || !cycle || !plan_1.PLAN_CONFIG[plan] || !['monthly', 'yearly'].includes(cycle)) {
            throw httpError('A valid plan and billing cycle are required', 400, 'VALIDATION_ERROR');
        }
        const priced = yield (0, systemPlanService_1.chargeForPlan)(plan, cycle);
        if (priced == null || priced <= 0) {
            throw httpError('This plan does not have a payable amount', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
        }
        if (session.amount !== priced && (session.status === 'pending' || session.status === 'provider_created')) {
            session.amount = priced;
            yield session.save();
            if (session.billingPaymentId) {
                yield BillingPayment_1.BillingPayment.findByIdAndUpdate(session.billingPaymentId, { $set: { amount: priced } });
            }
        }
        const storedRedirect = String(((_b = session.rawProviderResponse) === null || _b === void 0 ? void 0 : _b.redirectUrl) || '');
        const checkoutDecision = (0, registrationPaymentPolicy_1.paynowCheckoutDecision)(session);
        if (checkoutDecision === 'closed') {
            throw httpError('This checkout can no longer be started', 409, 'PAYMENT_SESSION_CLOSED');
        }
        if (checkoutDecision === 'awaiting' && session.pollUrl) {
            if (storedRedirect) {
                return {
                    reference: String(session.providerRef || ''),
                    redirectUrl: storedRedirect,
                    pollUrl: String(session.pollUrl),
                    amount: priced
                };
            }
            throw httpError('This payment is still being confirmed. Wait for Paynow before starting another payment.', 409, 'PAYMENT_AWAITING_CONFIRMATION');
        }
        let email = String(input.email || '').trim();
        if (!email && session.userId) {
            const user = yield User_1.User.findById(session.userId).select('email').lean();
            email = String((user === null || user === void 0 ? void 0 : user.email) || '');
        }
        const ref = session.providerRef && String(session.providerRef).trim()
            ? String(session.providerRef).trim()
            : `SUBS-${session._id.toString()}`;
        const paynow = getPaynowForRequest(req);
        const payment = paynow.createPayment(ref, email || '');
        payment.add(input.description || `Mantis ${plan} ${cycle} subscription`, priced);
        let response;
        try {
            response = yield paynow.send(payment);
        }
        catch (error) {
            yield (0, auditService_1.recordAuditEvent)({
                userId: session.userId ? String(session.userId) : undefined,
                companyId: String(session.companyId),
                action: 'checkout.initiation_failed',
                entityType: 'PaymentSession',
                entityId: String(session._id),
                status: 'failure',
                metadata: { code: 'PAYNOW_CHECKOUT_FAILED' }
            });
            throw error;
        }
        if (!response || !response.success || !response.redirectUrl) {
            yield (0, auditService_1.recordAuditEvent)({
                userId: session.userId ? String(session.userId) : undefined,
                companyId: String(session.companyId),
                action: 'checkout.initiation_failed',
                entityType: 'PaymentSession',
                entityId: String(session._id),
                status: 'failure',
                metadata: { code: 'PAYNOW_CHECKOUT_FAILED' }
            });
            const error = httpError(String((response === null || response === void 0 ? void 0 : response.error) || 'Failed to create Paynow payment'), 502, 'PAYNOW_CHECKOUT_FAILED');
            throw error;
        }
        const pollUrl = String(response.pollUrl || '');
        if (pollUrl && !(0, registrationPaymentPolicy_1.isAllowedPaynowPollUrl)(pollUrl)) {
            throw httpError('Paynow returned an unexpected status URL', 502, 'PAYNOW_POLL_URL_REJECTED');
        }
        session.provider = 'paynow';
        session.providerRef = ref;
        session.pollUrl = pollUrl;
        session.status = 'provider_created';
        session.amount = priced;
        session.currency = 'USD';
        session.rawProviderResponse = {
            redirectUrl: String(response.redirectUrl),
            pollUrl
        };
        yield session.save();
        if (session.billingPaymentId) {
            yield BillingPayment_1.BillingPayment.findByIdAndUpdate(session.billingPaymentId, { $set: { providerRef: ref, amount: priced, currency: 'USD' } });
        }
        return {
            reference: ref,
            redirectUrl: String(response.redirectUrl),
            pollUrl,
            amount: priced
        };
    });
}
function readPaynowStatus(req, pollUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(0, registrationPaymentPolicy_1.isAllowedPaynowPollUrl)(pollUrl)) {
            throw httpError('Payment status URL is not allowed', 400, 'PAYNOW_POLL_URL_REJECTED');
        }
        const paynow = getPaynowForRequest(req);
        const response = yield axios_1.default.post(pollUrl, null, {
            timeout: 15000,
            responseType: 'text',
            maxRedirects: 0
        });
        const raw = typeof response.data === 'string' ? response.data : String(response.data || '');
        const parsed = paynow.parseStatusUpdate(raw);
        const fields = paynow.parseQuery(raw);
        return { parsed, fields };
    });
}
function confirmSessionPayment(req, reference, verifiedPoll) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const resolved = yield (0, applyPolledPayment_1.resolvePaynowProviderRef)(reference);
        if (resolved.kind === 'missing')
            return { found: false, activated: false, ignored: false };
        if (resolved.kind === 'ambiguous') {
            return { found: true, activated: false, ignored: true, reviewRequired: true, paymentStatus: 'review_required' };
        }
        const session = resolved.session;
        if (session.status === 'paid' || session.status === 'reconciled' || session.status === 'cancelled' || session.status === 'failed' || session.status === 'expired') {
            const applied = yield (0, applyPolledPayment_1.applyPolledPayment)(reference, verifiedPoll || {
                status: session.status,
                amount: session.amount,
                currency: session.currency,
                reference
            });
            return {
                found: applied.found,
                paymentStatus: applied.paymentStatus || session.status,
                activated: applied.activated === true,
                ignored: applied.ignored === true,
                session: applied.session || session
            };
        }
        if (!session.pollUrl) {
            return { found: true, paymentStatus: session.status, activated: false, ignored: false, session };
        }
        const polled = yield readPaynowStatus(req, session.pollUrl);
        const applied = yield (0, applyPolledPayment_1.applyPolledPayment)(reference, {
            status: (_a = polled.parsed) === null || _a === void 0 ? void 0 : _a.status,
            amount: (_b = polled.parsed) === null || _b === void 0 ? void 0 : _b.amount,
            currency: ((_c = polled.fields) === null || _c === void 0 ? void 0 : _c.currency) || ((_d = polled.fields) === null || _d === void 0 ? void 0 : _d.Currency),
            reference: (_e = polled.parsed) === null || _e === void 0 ? void 0 : _e.reference,
            paynowReference: (_f = polled.parsed) === null || _f === void 0 ? void 0 : _f.paynowReference
        });
        return {
            found: applied.found,
            paymentStatus: applied.paymentStatus || session.status,
            activated: applied.activated === true,
            ignored: applied.ignored === true,
            session: applied.session || session
        };
    });
}
function getStatus(_req, res) {
    try {
        const env = readEnv();
        const state = (0, registrationPaymentPolicy_1.paynowConfigurationState)();
        return res.json({
            status: state.configured ? 'ok' : 'disabled',
            mode: state.mode,
            hasIntegrationId: Boolean(env.INTEGRATION_ID),
            hasIntegrationKey: Boolean(env.INTEGRATION_KEY),
            resultUrl: env.RESULT_URL || null,
            returnUrl: env.RETURN_URL || null
        });
    }
    catch (e) {
        return res.status(500).json({ status: 'error', message: 'Failed to read Paynow status' });
    }
}
function createWebPayment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const body = (req.body || {});
            if (!body.paymentSessionId) {
                return res.status(400).json({ status: 'error', message: 'paymentSessionId is required', code: 'PAYMENT_SESSION_REQUIRED' });
            }
            const result = yield initiatePaynowCheckout(req, {
                paymentSessionId: body.paymentSessionId,
                email: body.email,
                description: body.description
            });
            return res.json(Object.assign({ status: 'ok' }, result));
        }
        catch (e) {
            return res.status((e === null || e === void 0 ? void 0 : e.statusCode) || 500).json({
                status: 'error',
                message: (e === null || e === void 0 ? void 0 : e.message) || 'Paynow error',
                code: (e === null || e === void 0 ? void 0 : e.code) || 'PAYNOW_ERROR'
            });
        }
    });
}
function createMobilePayment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { phone, method, email, paymentSessionId } = (req.body || {});
            if (!paymentSessionId) {
                return res.status(400).json({ status: 'error', message: 'paymentSessionId is required', code: 'PAYMENT_SESSION_REQUIRED' });
            }
            if (!phone || !method) {
                return res.status(400).json({ status: 'error', message: 'phone and method are required' });
            }
            const session = yield PaymentSession_1.PaymentSession.findById(paymentSessionId);
            const callerCompanyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
            if (!session || (callerCompanyId && String(session.companyId) !== String(callerCompanyId))) {
                return res.status(404).json({ status: 'error', message: 'Payment session not found' });
            }
            const checkoutDecision = (0, registrationPaymentPolicy_1.paynowCheckoutDecision)(session);
            if (checkoutDecision === 'completed') {
                return res.status(409).json({ status: 'error', message: 'This payment has already been completed' });
            }
            if (checkoutDecision === 'closed') {
                return res.status(409).json({ status: 'error', message: 'This checkout can no longer be started', code: 'PAYMENT_SESSION_CLOSED' });
            }
            if (checkoutDecision === 'awaiting') {
                return res.json({
                    status: 'ok',
                    reference: String(session.providerRef || ''),
                    pollUrl: String(session.pollUrl || ''),
                    instructions: ((_b = session.rawProviderResponse) === null || _b === void 0 ? void 0 : _b.instructions) || null,
                    reused: true
                });
            }
            const amt = Number(session.amount);
            if (!Number.isFinite(amt) || amt <= 0) {
                return res.status(503).json({ status: 'error', message: 'This plan does not have a payable amount', code: 'REGISTRATION_PRICE_NOT_CONFIGURED' });
            }
            const ref = session.providerRef && String(session.providerRef).trim()
                ? String(session.providerRef).trim()
                : `SUBS-${session._id.toString()}`;
            const paynow = getPaynowForRequest(req);
            const normalizedMethod = String(method).toLowerCase();
            const allowed = ['ecocash', 'onemoney', 'telecash'];
            if (!allowed.includes(normalizedMethod)) {
                return res.status(400).json({ status: 'error', message: `method must be one of: ${allowed.join(', ')}` });
            }
            // Create a standard payment, then invoke sendMobile(payment, phone, method)
            const payment = paynow.createPayment(ref, email || '');
            payment.add('Payment', amt);
            const response = yield paynow.sendMobile(payment, phone, normalizedMethod);
            if (response && response.success) {
                const pollUrl = String(response.pollUrl || '');
                if (pollUrl && !(0, registrationPaymentPolicy_1.isAllowedPaynowPollUrl)(pollUrl)) {
                    return res.status(502).json({ status: 'error', message: 'Paynow returned an unexpected status URL', code: 'PAYNOW_POLL_URL_REJECTED' });
                }
                session.provider = 'paynow';
                session.providerRef = ref;
                session.pollUrl = pollUrl;
                session.status = 'provider_created';
                session.rawProviderResponse = { pollUrl, instructions: response.instructions || null };
                yield session.save();
                return res.json({
                    status: 'ok',
                    reference: ref,
                    pollUrl,
                    instructions: response.instructions || null
                });
            }
            return res.status(502).json({
                status: 'error',
                message: 'Failed to initiate Paynow mobile payment'
            });
        }
        catch (e) {
            return res.status((e === null || e === void 0 ? void 0 : e.statusCode) || 500).json({ status: 'error', message: (e === null || e === void 0 ? void 0 : e.message) || 'Paynow error', code: e === null || e === void 0 ? void 0 : e.code });
        }
    });
}
function pollTransaction(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            const paymentSessionId = String((req.query.paymentSessionId || '')).trim();
            if (!paymentSessionId) {
                return res.status(400).json({ status: 'error', message: 'paymentSessionId is required', code: 'PAYMENT_SESSION_REQUIRED' });
            }
            const session = yield PaymentSession_1.PaymentSession.findById(paymentSessionId);
            const callerCompanyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
            if (!session || (callerCompanyId && String(session.companyId) !== String(callerCompanyId)) || !session.pollUrl) {
                return res.status(404).json({ status: 'error', message: 'Payment session not found' });
            }
            const polled = yield readPaynowStatus(req, session.pollUrl);
            return res.json({
                status: 'ok',
                details: {
                    status: (_b = polled.parsed) === null || _b === void 0 ? void 0 : _b.status,
                    amount: (_c = polled.parsed) === null || _c === void 0 ? void 0 : _c.amount,
                    reference: (_d = polled.parsed) === null || _d === void 0 ? void 0 : _d.reference
                }
            });
        }
        catch (e) {
            return res.status(500).json({ status: 'error', message: (e === null || e === void 0 ? void 0 : e.message) || 'Failed to poll Paynow transaction' });
        }
    });
}
// Paynow server-to-server notification (Instant Payment Notification)
function handleResult(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const env = readEnv();
            if (!env.INTEGRATION_KEY) {
                return res.status(503).json({ status: 'error', message: 'Paynow is not configured', code: 'PAYNOW_NOT_CONFIGURED' });
            }
            const payload = Object.assign(Object.assign({}, (req.query || {})), (req.body || {}));
            if (!(0, registrationPaymentPolicy_1.verifyPaynowPayload)(payload, env.INTEGRATION_KEY)) {
                const unverifiedReference = String(payload.reference || payload.Reference || '').trim();
                (0, operationalSignal_1.signalOperationalFailure)('paynow_callback_unverified', {
                    correlationId: unverifiedReference || 'paynow',
                    reference: unverifiedReference || undefined
                });
                return res.status(401).json({ status: 'error', message: 'Invalid Paynow signature' });
            }
            const reference = String(payload.reference || payload.Reference || '').trim();
            const eventId = String(payload.hash || payload.pollurl || payload.pollUrl || reference);
            const payloadFingerprint = [
                reference,
                String(payload.status || payload.Status || ''),
                String(payload.amount || payload.Amount || '')
            ].join('|');
            if (!reference) {
                return res.status(200).json({ status: 'received', message: 'No reference supplied' });
            }
            const outcome = yield (0, paynowCallbackService_1.processVerifiedPaynowEvent)({
                reference,
                eventId,
                payloadFingerprint,
                apply: () => __awaiter(this, void 0, void 0, function* () {
                    const confirmed = yield confirmSessionPayment(req, reference, {
                        status: String(payload.status || payload.Status || ''),
                        amount: String(payload.amount || payload.Amount || ''),
                        currency: String(payload.currency || payload.Currency || ''),
                        reference
                    });
                    return {
                        found: confirmed.found,
                        paymentStatus: confirmed.paymentStatus,
                        activated: confirmed.activated,
                        ignored: confirmed.ignored,
                        session: confirmed.session
                    };
                })
            });
            if (outcome.status === 'duplicate' || outcome.status === 'in_progress' || outcome.status === 'payload_conflict') {
                return res.status(200).json({ status: outcome.status, activated: false });
            }
            return res.status(200).json({ status: outcome.status, activated: outcome.activated });
        }
        catch (e) {
            if ((e === null || e === void 0 ? void 0 : e.statusCode) === 409) {
                return res.status(200).json({ status: 'ignored', message: e.message });
            }
            const failedReference = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.reference) || ((_b = req.query) === null || _b === void 0 ? void 0 : _b.reference) || '').trim();
            logger_1.logger.warn('paynow_callback_failed', {
                correlationId: failedReference || 'paynow',
                reference: failedReference || undefined,
                failureClass: (0, operationalFailure_1.classifyOperationalFailure)(e)
            });
            return res.status(500).json({ status: 'error', message: 'Failed to process Paynow result' });
        }
    });
}
// Customer browser return URL after payment attempt
function confirmByReference(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const reference = String((req.body || {}).reference || (req.query || {}).reference || '').trim();
            if (!reference) {
                return res.status(400).json({ status: 'error', message: 'reference is required' });
            }
            const resolved = yield (0, applyPolledPayment_1.resolvePaynowProviderRef)(reference);
            const callerCompanyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
            if (resolved.kind === 'missing') {
                return res.status(404).json({ status: 'error', message: 'Payment not found' });
            }
            if (resolved.kind === 'ambiguous') {
                const visible = !callerCompanyId || resolved.sessions.some((session) => String(session.companyId) === String(callerCompanyId));
                if (!visible)
                    return res.status(404).json({ status: 'error', message: 'Payment not found' });
                return res.status(409).json({
                    status: 'review_required',
                    message: 'This provider reference matches more than one payment session and was not activated.'
                });
            }
            if (callerCompanyId && String(resolved.session.companyId) !== String(callerCompanyId)) {
                return res.status(404).json({ status: 'error', message: 'Payment not found' });
            }
            const confirmed = yield confirmSessionPayment(req, reference);
            if (confirmed.reviewRequired) {
                return res.status(409).json({
                    status: 'review_required',
                    message: 'This provider reference matches more than one payment session and was not activated.'
                });
            }
            if (!confirmed.found) {
                return res.status(404).json({ status: 'error', message: 'Payment not found' });
            }
            return res.json({
                status: 'ok',
                paymentStatus: confirmed.paymentStatus,
                activated: confirmed.activated === true,
                reference
            });
        }
        catch (e) {
            return res.status((e === null || e === void 0 ? void 0 : e.statusCode) || 500).json({ status: 'error', message: (e === null || e === void 0 ? void 0 : e.message) || 'Failed to confirm Paynow payment' });
        }
    });
}
function handleReturn(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const clientUrl = process.env.CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://www.mantisafrica.com';
            const reference = String(((_a = req.query) === null || _a === void 0 ? void 0 : _a.reference) || ((_b = req.body) === null || _b === void 0 ? void 0 : _b.reference) || '').trim();
            const target = new URL('/billing/return', clientUrl.endsWith('/') ? clientUrl : `${clientUrl}/`);
            if (reference)
                target.searchParams.set('reference', reference);
            return res.redirect(target.toString());
        }
        catch (e) {
            return res.status(500).json({ status: 'error', message: (e === null || e === void 0 ? void 0 : e.message) || 'Failed to process Paynow return' });
        }
    });
}
