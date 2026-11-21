"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dodoCycleSuffix = dodoCycleSuffix;
exports.dodoProductEnv = dodoProductEnv;
exports.dodoCycleConfigured = dodoCycleConfigured;
exports.readDodoConfig = readDodoConfig;
exports.readProviderAvailability = readProviderAvailability;
exports.selectSubscriptionProvider = selectSubscriptionProvider;
exports.hostedCheckoutStarted = hostedCheckoutStarted;
exports.describeDodoStartup = describeDodoStartup;
const registrationPaymentPolicy_1 = require("../registrationPaymentPolicy");
function flag(value, fallback) {
    const raw = String(value !== null && value !== void 0 ? value : '').trim().toLowerCase();
    if (!raw)
        return fallback;
    return raw === 'true' || raw === '1' || raw === 'yes';
}
function dodoCycleSuffix(cycle) {
    return cycle === 'yearly' ? 'ANNUAL' : cycle.toUpperCase();
}
function dodoProductEnv(cycle, plan, env = process.env) {
    const planKey = plan ? `DODO_PAYMENTS_PRODUCT_${plan}_${dodoCycleSuffix(cycle)}` : '';
    const specific = planKey ? String(env[planKey] || '').trim() : '';
    return specific || String(env[`DODO_PAYMENTS_PRODUCT_${dodoCycleSuffix(cycle)}`] || '').trim();
}
function dodoCycleConfigured(cycle, env = process.env) {
    if (dodoProductEnv(cycle, undefined, env))
        return true;
    return ['INDIVIDUAL', 'SME', 'ENTERPRISE'].some((plan) => Boolean(String(env[`DODO_PAYMENTS_PRODUCT_${plan}_${dodoCycleSuffix(cycle)}`] || '').trim()));
}
function readDodoConfig(env = process.env) {
    const enabled = flag(env.DODO_PAYMENTS_ENABLED, false);
    const modeRaw = String(env.DODO_PAYMENTS_MODE || 'test').trim().toLowerCase();
    const mode = modeRaw === 'live' ? 'live' : modeRaw === 'test' ? 'test' : 'invalid';
    const apiKey = String(env.DODO_PAYMENTS_API_KEY || '').trim();
    const webhookKey = String(env.DODO_PAYMENTS_WEBHOOK_KEY || '').trim();
    const cycles = ['monthly', 'quarterly', 'yearly'].filter((cycle) => dodoCycleConfigured(cycle, env));
    const configured = Boolean(enabled && mode !== 'invalid' && apiKey && webhookKey && cycles.length);
    return { enabled, mode, apiKey, webhookKey, cycles, configured };
}
function readProviderAvailability(env = process.env) {
    const paynow = (0, registrationPaymentPolicy_1.paynowConfigurationState)(env);
    const paynowEnabled = flag(env.PAYNOW_ENABLED, true);
    const paynowMode = paynow.mode;
    const paynowConfigured = paynow.configured && (paynow.mode === 'test' || paynow.mode === 'live' || paynow.mode === 'unspecified');
    const dodo = readDodoConfig(env);
    return [
        {
            id: 'paynow',
            enabled: paynowEnabled,
            configured: paynowConfigured,
            available: paynowEnabled && paynowConfigured,
            mode: paynowMode,
            testMode: paynow.mode === 'test',
            cycles: ['monthly', 'yearly'],
            cardBrands: []
        },
        {
            id: 'dodo',
            enabled: dodo.enabled,
            configured: dodo.configured,
            available: dodo.enabled && dodo.configured,
            mode: dodo.mode,
            testMode: dodo.mode === 'test',
            cycles: dodo.cycles.length ? dodo.cycles : ['monthly', 'yearly'],
            cardBrands: dodo.enabled && dodo.configured ? ['visa', 'mastercard'] : [],
            reason: !dodo.enabled ? 'disabled' : dodo.mode === 'invalid' ? 'invalid_mode' : !dodo.apiKey || !dodo.webhookKey ? 'missing_credentials' : !dodo.cycles.length ? 'missing_product' : undefined
        }
    ];
}
function selectSubscriptionProvider(requested, env = process.env) {
    const providers = readProviderAvailability(env);
    const raw = String(requested !== null && requested !== void 0 ? requested : '').trim().toLowerCase();
    if (!raw) {
        const available = providers.filter((provider) => provider.available);
        if (available.length === 1)
            return { ok: true, provider: available[0].id };
        if (!available.length) {
            return { ok: false, status: 503, code: 'NO_PAYMENT_PROVIDER', message: 'No subscription payment provider is available.' };
        }
        return { ok: false, status: 400, code: 'PROVIDER_REQUIRED', message: 'Choose Paynow or Dodo Payments before checkout.' };
    }
    if (raw !== 'paynow' && raw !== 'dodo') {
        return { ok: false, status: 400, code: 'PROVIDER_INVALID', message: 'Payment provider is not supported.' };
    }
    const chosen = providers.find((provider) => provider.id === raw);
    if (!(chosen === null || chosen === void 0 ? void 0 : chosen.enabled)) {
        return {
            ok: false,
            status: 403,
            code: raw === 'dodo' ? 'DODO_DISABLED' : 'PAYNOW_DISABLED',
            message: raw === 'dodo' ? 'Dodo Payments is not enabled.' : 'Paynow is not enabled.'
        };
    }
    if (!chosen.configured || !chosen.available) {
        return {
            ok: false,
            status: 503,
            code: raw === 'dodo' ? 'DODO_NOT_CONFIGURED' : 'PAYNOW_NOT_CONFIGURED',
            message: raw === 'dodo'
                ? 'Dodo Payments is not configured. Paynow is unchanged.'
                : 'Paynow is not configured.'
        };
    }
    return { ok: true, provider: raw };
}
function hostedCheckoutStarted(session) {
    const metadata = session.metadata || {};
    return session.status === 'provider_created'
        || Boolean(String(session.pollUrl || '').trim())
        || Boolean(String(metadata.dodoCheckoutUrl || '').trim());
}
function describeDodoStartup(env = process.env) {
    const dodo = readDodoConfig(env);
    if (!dodo.enabled)
        return 'Dodo Payments is disabled. Paynow subscription checkout is unchanged.';
    if (!dodo.configured)
        return `Dodo Payments is enabled but not available (${dodo.mode === 'invalid' ? 'invalid mode' : 'incomplete configuration'}). Paynow is unchanged.`;
    return `Dodo Payments is available in ${dodo.mode} mode.`;
}
