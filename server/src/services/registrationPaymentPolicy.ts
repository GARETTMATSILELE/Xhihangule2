import { PLAN_CONFIG, Plan } from '../types/plan';

const PAID_STATUSES = ['paid', 'awaiting delivery', 'delivered'];
const FAILED_STATUSES = ['cancelled', 'canceled', 'refunded', 'disputed', 'failed', 'expired'];
const PAYMENT_HOLD_STATUSES = ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP'];

export function configuredPlanCharge(plan: string, cycle: 'monthly' | 'yearly'): number | null {
  if (plan !== 'INDIVIDUAL' && plan !== 'SME' && plan !== 'ENTERPRISE') return null;
  const pricing = PLAN_CONFIG[plan as Plan]?.pricingUSD;
  if (!pricing) return null;
  const amount = cycle === 'yearly' ? pricing.yearly : pricing.monthly;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/**
 * Authenticated company creation can still opt into a payment hold.
 * Public pricing journeys do not use this flag: the free trial never checks out,
 * and Landlord / Property Manager always do.
 */
export function registrationCreatesPaymentHold(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.REGISTRATION_PAYMENT_REQUIRED || '').toLowerCase() === 'true';
}

/** Direct Enterprise checkout stays off unless an operator turns this on. */
export function enterpriseDirectCheckoutEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.ENTERPRISE_DIRECT_CHECKOUT || '').trim().toLowerCase() === 'true';
}

export type PublicRegistrationDecision =
  | { ok: true; mode: 'trial' | 'paid'; plan: Plan; billingCycle: 'monthly' | 'yearly'; paymentRequired: boolean }
  | { ok: false; status: number; code: string; message: string };

/**
 * Public signup is plan-specific.
 * Trial is always the Individual plan with no Paynow session.
 * Landlord and Property Manager require the configured price for the selected cycle.
 * Enterprise stays with sales unless ENTERPRISE_DIRECT_CHECKOUT=true.
 */
export function resolvePublicRegistration(input: {
  plan?: string;
  registrationMode?: string;
  billingCycle?: string;
}, env: NodeJS.ProcessEnv = process.env): PublicRegistrationDecision {
  const cycleRaw = input.billingCycle;
  if (cycleRaw && cycleRaw !== 'monthly' && cycleRaw !== 'yearly') {
    return { ok: false, status: 400, code: 'UNSUPPORTED_BILLING_CYCLE', message: 'That billing frequency is not available' };
  }
  const billingCycle: 'monthly' | 'yearly' = cycleRaw === 'yearly' ? 'yearly' : 'monthly';
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

export function registrationPasswordError(password: string): string | null {
  if (!password || password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must include a letter and a number';
  return null;
}

export function isRegistrationEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function companyAwaitingRegistrationPayment(onboardingStatus?: string | null): boolean {
  return PAYMENT_HOLD_STATUSES.includes(String(onboardingStatus || ''));
}

/** Billing, Paynow, and auth stay available while a new company is waiting to pay. */
export function isRegistrationPaymentExemptPath(url: string): boolean {
  const path = String(url || '');
  return path.includes('/api/billing')
    || path.includes('/api/paynow')
    || path.includes('/api/subscriptions')
    || path.includes('/api/subscription')
    || path.includes('/api/auth')
    || path.includes('/api/onboarding');
}

export type ProviderPoll = {
  status?: string;
  amount?: number | string;
  currency?: string;
  reference?: string;
  paynowReference?: string;
};

export type ProviderPollDecision =
  | { outcome: 'paid' }
  | { outcome: 'failed'; status: string }
  | { outcome: 'pending'; status: string }
  | { outcome: 'rejected'; reason: string };

export function evaluateProviderPoll(
  expected: { amount: number; currency: string; providerRef?: string },
  poll: ProviderPoll
): ProviderPollDecision {
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

export function paynowCheckoutDecision(session: { status?: string; pollUrl?: string }): 'completed' | 'closed' | 'awaiting' | 'create' {
  const status = String(session.status || '');
  if (status === 'paid' || status === 'reconciled') return 'completed';
  if (status === 'cancelled' || status === 'failed' || status === 'expired') return 'closed';
  if ((status === 'pending' || status === 'provider_created') && session.pollUrl) {
    return isAllowedPaynowPollUrl(session.pollUrl) ? 'awaiting' : 'closed';
  }
  return 'create';
}

export function isAllowedPaynowPollUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'www.paynow.co.zw' || host.endsWith('.paynow.co.zw');
  } catch {
    return false;
  }
}

/** Same concatenation order as the Paynow SDK: every field except hash, then the integration key. */
export function paynowPayloadHash(values: Record<string, unknown>, integrationKey: string): string {
  const sha512 = require('js-sha512').sha512 as (value: string) => string;
  let material = '';
  for (const key of Object.keys(values)) {
    if (key.toLowerCase() === 'hash') continue;
    material += values[key] == null ? '' : String(values[key]);
  }
  material += String(integrationKey || '').toLowerCase();
  return sha512(material).toUpperCase();
}

export function verifyPaynowPayload(values: Record<string, unknown>, integrationKey: string): boolean {
  const hash = values.hash == null ? '' : String(values.hash);
  if (!hash || !integrationKey) return false;
  return hash === paynowPayloadHash(values, integrationKey);
}

/**
 * Paynow test mode can complete "TESTING: Faked Success" only when authemail is the
 * merchant account that owns the integration. Live checkout keeps the customer email.
 * A blank merchant email leaves the customer email unchanged.
 */
export function paynowCustomerAuthEmail(customerEmail: string, env: NodeJS.ProcessEnv = process.env): string {
  const customer = String(customerEmail || '').trim();
  if (paynowConfigurationState(env).mode !== 'test') return customer;
  const merchant = String(env.PAYNOW_MERCHANT_EMAIL || '').trim();
  return merchant || customer;
}

/** True when Paynow will notify a different host from the one that created the checkout. */
export function paynowCallbackTargetDiffers(resultUrl: string, requestHost: string): boolean {
  const request = paynowHostname(requestHost);
  if (!request) return false;
  return Boolean(paynowHostname(resultUrl)) && paynowHostname(resultUrl) !== request;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function paynowHostname(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

/** Hosts that belong to the deployed Mantis site. A local process must not send Paynow there. */
export function isReservedProductionPaynowHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'mantisafrica.com' || host === 'www.mantisafrica.com' || host.endsWith('.azurewebsites.net');
}

export type PaynowDeploymentIssue =
  | 'credentials_missing'
  | 'mode_required'
  | 'mode_invalid'
  | 'test_merchant_email_required'
  | 'result_url_required'
  | 'return_url_required'
  | 'result_url_not_https'
  | 'return_url_not_https'
  | 'result_url_localhost'
  | 'return_url_localhost'
  | 'result_path_invalid'
  | 'return_path_invalid'
  | 'callback_host_mismatch'
  | 'return_host_mismatch'
  | 'public_base_mismatch';

export type PaynowDeploymentDecision = {
  ok: boolean;
  mode: 'live' | 'test' | 'unconfigured' | 'unspecified' | 'invalid';
  issues: PaynowDeploymentIssue[];
  resultUrl: string;
  returnUrl: string;
  resultHost: string;
  returnHost: string;
  resultPath: string;
  returnPath: string;
};

function inspectedUrl(value: string): { protocol: string; hostname: string; pathname: string } | null {
  try {
    const url = new URL(value);
    return {
      protocol: url.protocol,
      hostname: url.hostname.toLowerCase(),
      pathname: url.pathname.replace(/\/+$/, '') || '/'
    };
  } catch {
    return null;
  }
}

/**
 * Decide whether this process may create a Paynow checkout.
 * PAYNOW_MODE does not change the merchant integration's mode on Paynow.
 * A loopback process cannot nominate the production host as its callback.
 */
export function evaluatePaynowDeployment(
  env: NodeJS.ProcessEnv,
  input: { nodeEnv?: string; requestHost?: string } = {}
): PaynowDeploymentDecision {
  const nodeEnv = input.nodeEnv ?? env.NODE_ENV ?? '';
  const production = nodeEnv === 'production';
  const state = paynowConfigurationState(env);
  const issues: PaynowDeploymentIssue[] = [];
  if (!state.configured) issues.push('credentials_missing');
  if (state.mode === 'invalid') issues.push('mode_invalid');
  if (state.configured && (state.mode === 'unspecified' || state.mode === 'unconfigured')) issues.push('mode_required');
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
  if (!result) issues.push(resultUrl ? 'result_url_not_https' : 'result_url_required');
  if (!returning) issues.push(returnUrl ? 'return_url_not_https' : 'return_url_required');

  if (result) {
    const secure = result.protocol === 'https:' || (!production && isLoopbackHost(result.hostname) && result.protocol === 'http:');
    if (!secure) issues.push('result_url_not_https');
    if (production && isLoopbackHost(result.hostname)) issues.push('result_url_localhost');
    if (result.pathname !== '/api/paynow/result') issues.push('result_path_invalid');
  }
  if (returning) {
    const secure = returning.protocol === 'https:' || (!production && isLoopbackHost(returning.hostname) && returning.protocol === 'http:');
    if (!secure) issues.push('return_url_not_https');
    if (production && isLoopbackHost(returning.hostname)) issues.push('return_url_localhost');
    if (returning.pathname !== '/api/paynow/return') issues.push('return_path_invalid');
  }

  const resultHost = result?.hostname || '';
  const returnHost = returning?.hostname || '';
  if (resultHost && requestHost && resultHost !== requestHost) {
    const override = paynowHostname(env.PAYNOW_CALLBACK_HOST || '');
    const canonical = paynowHostname(env.CANONICAL_HOST || env.PUBLIC_BASE_URL || '');
    const redirects = String(env.REDIRECT_FROM_HOSTS || '').split(',').map((item) => paynowHostname(item)).filter(Boolean);
    const harness = !production && isLoopbackHost(requestHost) && override === resultHost && !isReservedProductionPaynowHost(resultHost);
    const azureAlias = production && requestHost.endsWith('.azurewebsites.net') && Boolean(canonical) && canonical === resultHost;
    const redirectAlias = production && Boolean(canonical) && resultHost === canonical && redirects.includes(requestHost);
    if (!harness && !azureAlias && !redirectAlias) issues.push('callback_host_mismatch');
  }
  const publicHost = paynowHostname(env.PUBLIC_BASE_URL || '');
  if (publicHost && resultHost && publicHost !== resultHost) issues.push('public_base_mismatch');
  const clientHost = paynowHostname(env.CLIENT_URL || env.PUBLIC_BASE_URL || '');
  if (returnHost && resultHost && returnHost !== resultHost && returnHost !== clientHost) issues.push('return_host_mismatch');

  const mode = state.mode === 'test' || state.mode === 'live' ? state.mode : state.mode;
  return {
    ok: issues.length === 0,
    mode,
    issues,
    resultUrl,
    returnUrl,
    resultHost,
    returnHost,
    resultPath: result?.pathname || '',
    returnPath: returning?.pathname || ''
  };
}

/** A checkout stamped test or live can be completed only while the server is still in that mode. */
export function paynowModeMatchesSession(sessionMode: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const stamped = String(sessionMode || '').trim().toLowerCase();
  if (stamped !== 'test' && stamped !== 'live') return true;
  return paynowConfigurationState(env).mode === stamped;
}

/**
 * Read-only explanation for a Paynow reference. This never authorises a write.
 * Paynow reporting Paid is not evidence that this database holds the session.
 */
export function explainUnreconciledPaynowSession(input: {
  found: boolean;
  status?: string;
  verifiedAuditCount: number;
}): { classification: 'absent' | 'unreconciled' | 'reconciled' | 'closed'; writeAllowed: false; reason: string } {
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

export function paynowConfigurationState(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  mode: 'live' | 'test' | 'unconfigured' | 'unspecified' | 'invalid';
} {
  const configured = Boolean(String(env.PAYNOW_INTEGRATION_ID || '').trim() && String(env.PAYNOW_INTEGRATION_KEY || '').trim());
  if (!configured) return { configured: false, mode: 'unconfigured' };
  const mode = String(env.PAYNOW_MODE || '').trim().toLowerCase();
  if (!mode) return { configured: true, mode: 'unspecified' };
  if (mode === 'test' || mode === 'sandbox') return { configured: true, mode: 'test' };
  if (mode === 'live') return { configured: true, mode: 'live' };
  return { configured: true, mode: 'invalid' };
}

export function productionApiUrl(candidate: string, nodeEnv: string, browserOrigin?: string): string {
  const value = String(candidate || '').trim();
  const local = /localhost|127\.0\.0\.1/i.test(value);
  if (nodeEnv === 'production' && local && browserOrigin) {
    return `${browserOrigin.replace(/\/$/, '')}/api`;
  }
  return value;
}
