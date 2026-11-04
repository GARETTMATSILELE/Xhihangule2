"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuredPlanCharge = configuredPlanCharge;
exports.registrationCreatesPaymentHold = registrationCreatesPaymentHold;
exports.enterpriseDirectCheckoutEnabled = enterpriseDirectCheckoutEnabled;
exports.resolvePublicRegistration = resolvePublicRegistration;
exports.registrationPasswordError = registrationPasswordError;
exports.isRegistrationEmail = isRegistrationEmail;
exports.companyAwaitingRegistrationPayment = companyAwaitingRegistrationPayment;
exports.isRegistrationPaymentExemptPath = isRegistrationPaymentExemptPath;
exports.evaluateProviderPoll = evaluateProviderPoll;
exports.paynowCheckoutDecision = paynowCheckoutDecision;
exports.isAllowedPaynowPollUrl = isAllowedPaynowPollUrl;
exports.paynowPayloadHash = paynowPayloadHash;
exports.verifyPaynowPayload = verifyPaynowPayload;
exports.paynowCustomerAuthEmail = paynowCustomerAuthEmail;
exports.paynowCallbackTargetDiffers = paynowCallbackTargetDiffers;
exports.paynowRequestHost = paynowRequestHost;
exports.paynowHostname = paynowHostname;
exports.isReservedProductionPaynowHost = isReservedProductionPaynowHost;
exports.evaluatePaynowDeployment = evaluatePaynowDeployment;
exports.paynowModeMatchesSession = paynowModeMatchesSession;
exports.explainUnreconciledPaynowSession = explainUnreconciledPaynowSession;
exports.paynowConfigurationState = paynowConfigurationState;
exports.productionApiUrl = productionApiUrl;
const plan_1 = require("../types/plan");
const PAID_STATUSES = ['paid', 'awaiting delivery', 'delivered'];
const FAILED_STATUSES = ['cancelled', 'canceled', 'refunded', 'disputed', 'failed', 'expired'];
const PAYMENT_HOLD_STATUSES = ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP'];
function configuredPlanCharge(plan, cycle) {
    var _a;
    if (plan !== 'INDIVIDUAL' && plan !== 'SME' && plan !== 'ENTERPRISE')
        return null;
    const pricing = (_a = plan_1.PLAN_CONFIG[plan]) === null || _a === void 0 ? void 0 : _a.pricingUSD;
    if (!pricing)
        return null;
    const amount = cycle === 'yearly' ? pricing.yearly : pricing.monthly;
    if (!Number.isFinite(amount) || amount <= 0)
        return null;
    return amount;
}
/**
 * Authenticated company creation can still opt into a payment hold.
 * Public pricing journeys do not use this flag: the free trial never checks out,
 * and Landlord / Property Manager always do.
 */
function registrationCreatesPaymentHold(env = process.env) {
    return String(env.REGISTRATION_PAYMENT_REQUIRED || '').toLowerCase() === 'true';
}
/** Direct Enterprise checkout stays off unless an operator turns this on. */
function enterpriseDirectCheckoutEnabled(env = process.env) {
    return String(env.ENTERPRISE_DIRECT_CHECKOUT || '').trim().toLowerCase() === 'true';
}
/**
 * Public signup is plan-specific.
 * Trial is always the Individual plan with no Paynow session.
 * Landlord and Property Manager require the configured price for the selected cycle.
 * Enterprise stays with sales unless ENTERPRISE_DIRECT_CHECKOUT=true.
 */
function resolvePublicRegistration(input, env = process.env) {
    const cycleRaw = input.billingCycle;
    if (cycleRaw && cycleRaw !== 'monthly' && cycleRaw !== 'yearly') {
        return { ok: false, status: 400, code: 'UNSUPPORTED_BILLING_CYCLE', message: 'That billing frequency is not available' };
    }
    const billingCycle = cycleRaw === 'yearly' ? 'yearly' : 'monthly';
    const modeRaw = String(input.registrationMode || '').trim().toLowerCase();
    if (modeRaw && modeRaw !== 'trial' && modeRaw !== 'paid') {
        return { ok: false, status: 400, code: 'UNSUPPORTED_REGISTRATION', message: 'That registration type is not available' };
    }
    const paidRequested = modeRaw === 'paid' || (modeRaw === '' && (input.plan === 'SME' || input.plan === 'ENTERPRISE'));
    if (!paidRequested) {
        return { ok: true, mode: 'trial', plan: 'INDIVIDUAL', billingCycle, paymentRequired: false };
    }
    const plan = input.plan;
    if (plan === 'ENTERPRISE' && !enterpriseDirectCheckoutEnabled(env)) {
        return {
            ok: false,
            status: 400,
            code: 'ENTERPRISE_SALES_ONLY',
            message: 'Enterprise is arranged with sales. Direct checkout is not available.'
        };
    }
    if (plan !== 'INDIVIDUAL' && plan !== 'SME' && plan !== 'ENTERPRISE') {
        return { ok: false, status: 400, code: 'UNSUPPORTED_PLAN', message: 'That plan is not available for checkout' };
    }
    return { ok: true, mode: 'paid', plan, billingCycle, paymentRequired: true };
}
function registrationPasswordError(password) {
    if (!password || password.length < 8)
        return 'Password must be at least 8 characters long';
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
        return 'Password must include a letter and a number';
    return null;
}
function isRegistrationEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
function companyAwaitingRegistrationPayment(onboardingStatus) {
    return PAYMENT_HOLD_STATUSES.includes(String(onboardingStatus || ''));
}
/** Billing, Paynow, and auth stay available while a new company is waiting to pay. */
function isRegistrationPaymentExemptPath(url) {
    const path = String(url || '');
    return path.includes('/api/billing')
        || path.includes('/api/paynow')
        || path.includes('/api/subscriptions')
        || path.includes('/api/subscription')
        || path.includes('/api/auth')
        || path.includes('/api/onboarding');
}
function evaluateProviderPoll(expected, poll) {
    const reference = String(poll.reference || '').trim();
    if (reference && expected.providerRef && reference !== expected.providerRef) {
        return { outcome: 'rejected', reason: 'Payment reference does not match' };
    }
    const currency = String(poll.currency || '').trim();
    if (currency && currency.toUpperCase() !== String(expected.currency || 'USD').toUpperCase()) {
        return { outcome: 'rejected', reason: 'Currency does not match the invoice' };
    }
    const state = String(poll.status || '').trim().toLowerCase();
    if (PAID_STATUSES.includes(state)) {
        const paidAmount = Number(poll.amount);
        if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(expected.amount)) > 0.05) {
            return { outcome: 'rejected', reason: 'Paid amount does not match the invoice' };
        }
        return { outcome: 'paid' };
    }
    if (FAILED_STATUSES.includes(state)) {
        const status = state === 'canceled' ? 'cancelled'
            : state === 'expired' ? 'expired'
                : state === 'cancelled' ? 'cancelled'
                    : state === 'refunded' ? 'refunded'
                        : state === 'disputed' ? 'disputed'
                            : 'failed';
        return { outcome: 'failed', status };
    }
    return { outcome: 'pending', status: state || 'pending' };
}
function paynowCheckoutDecision(session) {
    const status = String(session.status || '');
    if (status === 'paid' || status === 'reconciled')
        return 'completed';
    if (status === 'cancelled' || status === 'failed' || status === 'expired')
        return 'closed';
    if ((status === 'pending' || status === 'provider_created') && session.pollUrl) {
        return isAllowedPaynowPollUrl(session.pollUrl) ? 'awaiting' : 'closed';
    }
    return 'create';
}
function isAllowedPaynowPollUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:')
            return false;
        const host = parsed.hostname.toLowerCase();
        return host === 'www.paynow.co.zw' || host.endsWith('.paynow.co.zw');
    }
    catch (_a) {
        return false;
    }
}
/** Same concatenation order as the Paynow SDK: every field except hash, then the integration key. */
function paynowPayloadHash(values, integrationKey) {
    const sha512 = require('js-sha512').sha512;
    let material = '';
    for (const key of Object.keys(values)) {
        if (key.toLowerCase() === 'hash')
            continue;
        material += values[key] == null ? '' : String(values[key]);
    }
    material += String(integrationKey || '').toLowerCase();
    return sha512(material).toUpperCase();
}
function verifyPaynowPayload(values, integrationKey) {
    const hash = values.hash == null ? '' : String(values.hash);
    if (!hash || !integrationKey)
        return false;
    return hash === paynowPayloadHash(values, integrationKey);
}
/**
 * Paynow test mode can complete "TESTING: Faked Success" only when authemail is the
 * merchant account that owns the integration. Live checkout keeps the customer email.
 * A blank merchant email leaves the customer email unchanged.
 */
function paynowCustomerAuthEmail(customerEmail, env = process.env) {
    const customer = String(customerEmail || '').trim();
    if (paynowConfigurationState(env).mode !== 'test')
        return customer;
    const merchant = String(env.PAYNOW_MERCHANT_EMAIL || '').trim();
    return merchant || customer;
}
/** True when Paynow will notify a different host from the one that created the checkout. */
function paynowCallbackTargetDiffers(resultUrl, requestHost) {
    const request = paynowHostname(requestHost);
    if (!request)
        return false;
    return Boolean(paynowHostname(resultUrl)) && paynowHostname(resultUrl) !== request;
}
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
/** The Host header only. X-Forwarded-Host is not a trusted checkout host. */
function paynowRequestHost(headers) {
    const raw = headers === null || headers === void 0 ? void 0 : headers.host;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value || '').split(',')[0].trim();
}
function paynowHostname(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    try {
        return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname.toLowerCase();
    }
    catch (_a) {
        return '';
    }
}
function isLoopbackHost(hostname) {
    return LOOPBACK_HOSTS.has(hostname);
}
/** Hosts that belong to the deployed Mantis site. A local process must not send Paynow there. */
function isReservedProductionPaynowHost(hostname) {
    const host = hostname.toLowerCase();
    return host === 'mantisafrica.com' || host === 'www.mantisafrica.com' || host.endsWith('.azurewebsites.net');
}
function inspectedUrl(value) {
    try {
        const url = new URL(value);
        return {
            protocol: url.protocol,
            hostname: url.hostname.toLowerCase(),
            pathname: url.pathname.replace(/\/+$/, '') || '/'
        };
    }
    catch (_a) {
        return null;
    }
}
/**
 * Decide whether this process may create a Paynow checkout.
 * PAYNOW_MODE does not change the merchant integration's mode on Paynow.
 * A loopback process cannot nominate the production host as its callback.
 */
function evaluatePaynowDeployment(env, input = {}) {
    var _a, _b;
    const nodeEnv = (_b = (_a = input.nodeEnv) !== null && _a !== void 0 ? _a : env.NODE_ENV) !== null && _b !== void 0 ? _b : '';
    const production = nodeEnv === 'production';
    const state = paynowConfigurationState(env);
    const issues = [];
    if (!state.configured)
        issues.push('credentials_missing');
    if (state.mode === 'invalid')
        issues.push('mode_invalid');
    if (state.configured && (state.mode === 'unspecified' || state.mode === 'unconfigured'))
        issues.push('mode_required');
    if (state.mode === 'test' && !isRegistrationEmail(String(env.PAYNOW_MERCHANT_EMAIL || ''))) {
        issues.push('test_merchant_email_required');
    }
    const requestHost = paynowHostname(input.requestHost || '');
    let resultUrl = String(env.PAYNOW_RESULT_URL || '').trim();
    let returnUrl = String(env.PAYNOW_RETURN_URL || '').trim();
    if (!resultUrl && !production && isLoopbackHost(requestHost)) {
        resultUrl = `http://${String(input.requestHost || '').trim()}/api/paynow/result`;
    }
    if (!returnUrl && resultUrl) {
        const derived = inspectedUrl(resultUrl);
        if (derived) {
            const url = new URL(resultUrl);
            url.pathname = '/api/paynow/return';
            url.search = '';
            returnUrl = url.toString();
        }
    }
    const result = resultUrl ? inspectedUrl(resultUrl) : null;
    const returning = returnUrl ? inspectedUrl(returnUrl) : null;
    if (!result)
        issues.push(resultUrl ? 'result_url_not_https' : 'result_url_required');
    if (!returning)
        issues.push(returnUrl ? 'return_url_not_https' : 'return_url_required');
    if (result) {
        const secure = result.protocol === 'https:' || (!production && isLoopbackHost(result.hostname) && result.protocol === 'http:');
        if (!secure)
            issues.push('result_url_not_https');
        if (production && isLoopbackHost(result.hostname))
            issues.push('result_url_localhost');
        if (result.pathname !== '/api/paynow/result')
            issues.push('result_path_invalid');
    }
    if (returning) {
        const secure = returning.protocol === 'https:' || (!production && isLoopbackHost(returning.hostname) && returning.protocol === 'http:');
        if (!secure)
            issues.push('return_url_not_https');
        if (production && isLoopbackHost(returning.hostname))
            issues.push('return_url_localhost');
        if (returning.pathname !== '/api/paynow/return')
            issues.push('return_path_invalid');
    }
    const resultHost = (result === null || result === void 0 ? void 0 : result.hostname) || '';
    const returnHost = (returning === null || returning === void 0 ? void 0 : returning.hostname) || '';
    if (!production && resultHost && isReservedProductionPaynowHost(resultHost) && !issues.includes('callback_host_mismatch')) {
        issues.push('callback_host_mismatch');
    }
    if (resultHost && requestHost && resultHost !== requestHost) {
        const override = paynowHostname(env.PAYNOW_CALLBACK_HOST || '');
        const canonical = paynowHostname(env.CANONICAL_HOST || env.PUBLIC_BASE_URL || '');
        const redirects = String(env.REDIRECT_FROM_HOSTS || '').split(',').map((item) => paynowHostname(item)).filter(Boolean);
        const harness = !production && isLoopbackHost(requestHost) && override === resultHost && !isReservedProductionPaynowHost(resultHost);
        const azureAlias = production && requestHost.endsWith('.azurewebsites.net') && Boolean(canonical) && canonical === resultHost;
        const redirectAlias = production && Boolean(canonical) && resultHost === canonical && redirects.includes(requestHost);
        if (!harness && !azureAlias && !redirectAlias)
            issues.push('callback_host_mismatch');
    }
    const publicHost = paynowHostname(env.PUBLIC_BASE_URL || '');
    if (publicHost && resultHost && publicHost !== resultHost)
        issues.push('public_base_mismatch');
    const clientHost = paynowHostname(env.CLIENT_URL || env.PUBLIC_BASE_URL || '');
    if (returnHost && resultHost && returnHost !== resultHost && returnHost !== clientHost)
        issues.push('return_host_mismatch');
    const mode = state.mode === 'test' || state.mode === 'live' ? state.mode : state.mode;
    return {
        ok: issues.length === 0,
        mode,
        issues,
        resultUrl,
        returnUrl,
        resultHost,
        returnHost,
        resultPath: (result === null || result === void 0 ? void 0 : result.pathname) || '',
        returnPath: (returning === null || returning === void 0 ? void 0 : returning.pathname) || ''
    };
}
/** A checkout stamped test or live can be completed only while the server is still in that mode. */
function paynowModeMatchesSession(sessionMode, env = process.env) {
    const stamped = String(sessionMode || '').trim().toLowerCase();
    if (stamped !== 'test' && stamped !== 'live')
        return true;
    return paynowConfigurationState(env).mode === stamped;
}
/**
 * Read-only explanation for a Paynow reference. This never authorises a write.
 * Paynow reporting Paid is not evidence that this database holds the session.
 */
function explainUnreconciledPaynowSession(input) {
    if (!input.found) {
        return {
            classification: 'absent',
            writeAllowed: false,
            reason: 'This database has no payment session for the reference. A Paynow Paid status does not prove the session was stored here, and no session should be created to match it.'
        };
    }
    if (input.status === 'paid' || input.status === 'reconciled') {
        return {
            classification: 'reconciled',
            writeAllowed: false,
            reason: 'The session is already paid or reconciled. Diagnosis does not change it.'
        };
    }
    if ((input.status === 'provider_created' || input.status === 'pending') && input.verifiedAuditCount === 0) {
        return {
            classification: 'unreconciled',
            writeAllowed: false,
            reason: 'The session is still waiting and has no payment.verified audit. The result notification was not applied on this database. Do not mark it paid from a Paynow status alone.'
        };
    }
    return {
        classification: 'closed',
        writeAllowed: false,
        reason: `The session status is ${input.status || 'unknown'}. Diagnosis does not change historical payment records.`
    };
}
function paynowConfigurationState(env = process.env) {
    const configured = Boolean(String(env.PAYNOW_INTEGRATION_ID || '').trim() && String(env.PAYNOW_INTEGRATION_KEY || '').trim());
    if (!configured)
        return { configured: false, mode: 'unconfigured' };
    const mode = String(env.PAYNOW_MODE || '').trim().toLowerCase();
    if (!mode)
        return { configured: true, mode: 'unspecified' };
    if (mode === 'test' || mode === 'sandbox')
        return { configured: true, mode: 'test' };
    if (mode === 'live')
        return { configured: true, mode: 'live' };
    return { configured: true, mode: 'invalid' };
}
function productionApiUrl(candidate, nodeEnv, browserOrigin) {
    const value = String(candidate || '').trim();
    const local = /localhost|127\.0\.0\.1/i.test(value);
    if (nodeEnv === 'production' && local && browserOrigin) {
        return `${browserOrigin.replace(/\/$/, '')}/api`;
    }
    return value;
}
