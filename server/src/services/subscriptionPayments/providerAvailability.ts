import { paynowConfigurationState } from '../registrationPaymentPolicy';

export type SubscriptionProviderId = 'paynow' | 'dodo';
export type SubscriptionCycle = 'monthly' | 'quarterly' | 'yearly';
export type PaynowMethodId = 'ecocash' | 'card';

export interface ProviderMethod {
  id: string;
  label: string;
}

export interface ProviderAvailability {
  id: SubscriptionProviderId;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  mode: string;
  testMode: boolean;
  cycles: SubscriptionCycle[];
  cardBrands: Array<'visa' | 'mastercard'>;
  methods: ProviderMethod[];
  reason?: string;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function dodoCycleSuffix(cycle: SubscriptionCycle): string {
  return cycle === 'yearly' ? 'ANNUAL' : cycle.toUpperCase();
}

export function dodoProductEnv(cycle: SubscriptionCycle, plan?: string, env: NodeJS.ProcessEnv = process.env): string {
  const planKey = plan ? `DODO_PAYMENTS_PRODUCT_${plan}_${dodoCycleSuffix(cycle)}` : '';
  const specific = planKey ? String(env[planKey] || '').trim() : '';
  return specific || String(env[`DODO_PAYMENTS_PRODUCT_${dodoCycleSuffix(cycle)}`] || '').trim();
}

export function dodoCycleConfigured(cycle: SubscriptionCycle, env: NodeJS.ProcessEnv = process.env): boolean {
  if (dodoProductEnv(cycle, undefined, env)) return true;
  return ['INDIVIDUAL', 'SME', 'ENTERPRISE'].some((plan) => Boolean(String(env[`DODO_PAYMENTS_PRODUCT_${plan}_${dodoCycleSuffix(cycle)}`] || '').trim()));
}

export function readDodoConfig(env: NodeJS.ProcessEnv = process.env) {
  const enabled = flag(env.DODO_PAYMENTS_ENABLED, false);
  const modeRaw = String(env.DODO_PAYMENTS_MODE || 'test').trim().toLowerCase();
  const mode = modeRaw === 'live' ? 'live' : modeRaw === 'test' ? 'test' : 'invalid';
  const apiKey = String(env.DODO_PAYMENTS_API_KEY || '').trim();
  const webhookKey = String(env.DODO_PAYMENTS_WEBHOOK_KEY || '').trim();
  const cycles = (['monthly', 'quarterly', 'yearly'] as SubscriptionCycle[]).filter((cycle) => dodoCycleConfigured(cycle, env));
  const configured = Boolean(enabled && mode !== 'invalid' && apiKey && webhookKey && cycles.length);
  return { enabled, mode, apiKey, webhookKey, cycles, configured };
}

export function paynowMethodFlags(env: NodeJS.ProcessEnv = process.env): { card: boolean; ecocash: boolean } {
  return {
    card: flag(env.PAYNOW_CARD_ENABLED, false),
    ecocash: flag(env.PAYNOW_ECOCASH_ENABLED, true)
  };
}

export function paynowMethods(env: NodeJS.ProcessEnv = process.env): ProviderMethod[] {
  const flags = paynowMethodFlags(env);
  const methods: ProviderMethod[] = [];
  if (flags.ecocash) methods.push({ id: 'ecocash', label: 'EcoCash' });
  if (flags.card) methods.push({ id: 'card', label: 'Visa and Mastercard' });
  return methods;
}

export function selectPaynowMethod(requested: unknown, env: NodeJS.ProcessEnv = process.env):
  | { ok: true; method: PaynowMethodId }
  | { ok: false; status: number; code: string; message: string } {
  const flags = paynowMethodFlags(env);
  const enabled = (['ecocash', 'card'] as PaynowMethodId[]).filter((method) => flags[method]);
  const raw = String(requested ?? '').trim().toLowerCase();
  if (!enabled.length) {
    return { ok: false, status: 403, code: 'PAYNOW_METHOD_DISABLED', message: 'Paynow is not available for checkout.' };
  }
  if (!raw) {
    if (enabled.length === 1) return { ok: true, method: enabled[0] };
    return { ok: false, status: 400, code: 'PAYNOW_METHOD_REQUIRED', message: 'Choose EcoCash or card before continuing.' };
  }
  if (raw !== 'ecocash' && raw !== 'card') {
    return { ok: false, status: 400, code: 'PAYNOW_METHOD_INVALID', message: 'That Paynow payment method is not supported.' };
  }
  if (raw === 'card' && !flags.card) {
    return {
      ok: false,
      status: 403,
      code: 'PAYNOW_CARD_DISABLED',
      message: 'Visa and Mastercard are not available through Paynow. Use EcoCash, or pay by card with Dodo Payments.'
    };
  }
  if (raw === 'ecocash' && !flags.ecocash) {
    return { ok: false, status: 403, code: 'PAYNOW_ECOCASH_DISABLED', message: 'EcoCash is not available through Paynow.' };
  }
  return { ok: true, method: raw };
}

export function readProviderAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability[] {
  const paynow = paynowConfigurationState(env);
  const paynowEnabled = flag(env.PAYNOW_ENABLED, true);
  const paynowMode = paynow.mode;
  const paynowConfigured = paynow.configured && (paynow.mode === 'test' || paynow.mode === 'live' || paynow.mode === 'unspecified');
  const methods = paynowMethods(env);
  const dodo = readDodoConfig(env);
  const dodoCard = dodo.enabled && dodo.configured;
  return [
    {
      id: 'dodo',
      enabled: dodo.enabled,
      configured: dodo.configured,
      available: dodoCard,
      mode: dodo.mode,
      testMode: dodo.mode === 'test',
      cycles: dodo.cycles.length ? dodo.cycles : ['monthly', 'yearly'],
      cardBrands: dodoCard ? ['visa', 'mastercard'] : [],
      methods: dodoCard ? [{ id: 'card', label: 'Visa and Mastercard' }] : [],
      reason: !dodo.enabled ? 'disabled' : dodo.mode === 'invalid' ? 'invalid_mode' : !dodo.apiKey || !dodo.webhookKey ? 'missing_credentials' : !dodo.cycles.length ? 'missing_product' : undefined
    },
    {
      id: 'paynow',
      enabled: paynowEnabled,
      configured: paynowConfigured,
      available: paynowEnabled && paynowConfigured && methods.length > 0,
      mode: paynowMode,
      testMode: paynow.mode === 'test',
      cycles: ['monthly', 'yearly'],
      cardBrands: [],
      methods,
      reason: !paynowEnabled ? 'disabled' : !paynowConfigured ? 'not_configured' : !methods.length ? 'no_enabled_method' : undefined
    }
  ];
}

export function selectSubscriptionProvider(requested: unknown, env: NodeJS.ProcessEnv = process.env):
  | { ok: true; provider: SubscriptionProviderId }
  | { ok: false; status: number; code: string; message: string } {
  const providers = readProviderAvailability(env);
  const raw = String(requested ?? '').trim().toLowerCase();
  if (!raw) {
    const available = providers.filter((provider) => provider.available);
    if (available.length === 1) return { ok: true, provider: available[0].id };
    if (!available.length) {
      return { ok: false, status: 503, code: 'NO_PAYMENT_PROVIDER', message: 'No subscription payment provider is available.' };
    }
    return { ok: false, status: 400, code: 'PROVIDER_REQUIRED', message: 'Choose Paynow or Dodo Payments before checkout.' };
  }
  if (raw !== 'paynow' && raw !== 'dodo') {
    return { ok: false, status: 400, code: 'PROVIDER_INVALID', message: 'Payment provider is not supported.' };
  }
  const chosen = providers.find((provider) => provider.id === raw);
  if (!chosen?.enabled) {
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
      status: chosen.reason === 'no_enabled_method' ? 403 : 503,
      code: raw === 'dodo' ? 'DODO_NOT_CONFIGURED' : chosen.reason === 'no_enabled_method' ? 'PAYNOW_METHOD_DISABLED' : 'PAYNOW_NOT_CONFIGURED',
      message: raw === 'dodo'
        ? 'Dodo Payments is not configured. Paynow is unchanged.'
        : chosen.reason === 'no_enabled_method'
          ? 'Paynow is not available for checkout.'
          : 'Paynow is not configured.'
    };
  }
  return { ok: true, provider: raw };
}

export function hostedCheckoutStarted(session: { status?: string; pollUrl?: string; metadata?: Record<string, unknown> | null }): boolean {
  const metadata = session.metadata || {};
  return session.status === 'provider_created'
    || Boolean(String(session.pollUrl || '').trim())
    || Boolean(String(metadata.dodoCheckoutUrl || '').trim());
}

export function describeDodoStartup(env: NodeJS.ProcessEnv = process.env): string {
  const dodo = readDodoConfig(env);
  if (!dodo.enabled) return 'Dodo Payments is disabled. Paynow subscription checkout is unchanged.';
  if (!dodo.configured) return `Dodo Payments is enabled but not available (${dodo.mode === 'invalid' ? 'invalid mode' : 'incomplete configuration'}). Paynow is unchanged.`;
  return `Dodo Payments is available in ${dodo.mode} mode.`;
}
