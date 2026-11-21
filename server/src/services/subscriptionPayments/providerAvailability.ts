import { paynowConfigurationState } from '../registrationPaymentPolicy';

export type SubscriptionProviderId = 'paynow' | 'dodo';
export type SubscriptionCycle = 'monthly' | 'quarterly' | 'yearly';

export interface ProviderAvailability {
  id: SubscriptionProviderId;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  mode: string;
  testMode: boolean;
  cycles: SubscriptionCycle[];
  cardBrands: Array<'visa' | 'mastercard'>;
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

export function readProviderAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability[] {
  const paynow = paynowConfigurationState(env);
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
      status: 503,
      code: raw === 'dodo' ? 'DODO_NOT_CONFIGURED' : 'PAYNOW_NOT_CONFIGURED',
      message: raw === 'dodo'
        ? 'Dodo Payments is not configured. Paynow is unchanged.'
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
