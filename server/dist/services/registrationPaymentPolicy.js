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
        if (key !== 'hash')
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
