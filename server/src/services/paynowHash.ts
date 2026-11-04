import { paynowPayloadHash } from './registrationPaymentPolicy';

type PaynowEndpoint = {
  integrationId?: string;
  integrationKey?: string;
  resultUrl?: string;
  returnUrl?: string;
};

type PaynowItem = { title?: string; amount?: number; quantity?: number };

type PaynowPaymentLike = {
  reference?: string;
  authEmail?: string;
  items?: { items?: PaynowItem[] };
  total?: () => number;
};

/** Two decimal places, shared by the hash and the body. 20 and 20.00 must not be mixed. */
export function paynowAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/** Item titles in cart order. Does not drop the last character of the description. */
export function paynowItemSummary(payment: PaynowPaymentLike): string {
  const items = payment.items?.items;
  if (!Array.isArray(items)) return '';
  return items
    .map((item) => item?.title == null ? '' : String(item.title))
    .filter((title) => title !== '')
    .join(', ');
}

export function normalizePaynowCredential(value: unknown): string {
  let text = String(value ?? '').trim();
  if (text.length >= 2) {
    const quote = text[0];
    if ((quote === '"' || quote === "'") && text[text.length - 1] === quote) {
      text = text.slice(1, -1).trim();
    }
  }
  return text;
}

/** A production process must not read server/config/local.paynow.json. */
export function shouldLoadLocalPaynowConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.PAYNOW_DISABLE_LOCAL_CONFIG !== '1';
}

/**
 * Fields posted to Paynow, in the order they are hashed.
 * The hash is the raw values plus the integration key. Nothing is URL-encoded first.
 */
export function buildPaynowInitiationFields(
  endpoint: PaynowEndpoint,
  payment: PaynowPaymentLike,
  mobile?: { phone?: string; method?: string }
): Record<string, string> {
  const total = typeof payment.total === 'function' ? payment.total() : 0;
  const fields: Record<string, string> = {
    resulturl: String(endpoint.resultUrl || ''),
    returnurl: String(endpoint.returnUrl || ''),
    reference: String(payment.reference || ''),
    amount: paynowAmount(total),
    id: normalizePaynowCredential(endpoint.integrationId),
    additionalinfo: paynowItemSummary(payment),
    authemail: payment.authEmail == null ? '' : String(payment.authEmail)
  };
  if (mobile) {
    fields.phone = String(mobile.phone ?? '');
    fields.method = String(mobile.method ?? '');
  }
  fields.status = 'Message';
  fields.hash = paynowPayloadHash(fields, normalizePaynowCredential(endpoint.integrationKey));
  return fields;
}

/** Replace the SDK hash, which URL-encodes values and lowercases the integration key. */
export function installCorrectPaynowHashing(paynow: PaynowEndpoint & {
  build?: (payment: PaynowPaymentLike) => Record<string, string>;
  buildMobile?: (payment: PaynowPaymentLike, phone: string, method: string) => Record<string, string>;
  generateHash?: (values: Record<string, unknown>, integrationKey: string) => string;
}): void {
  paynow.integrationId = normalizePaynowCredential(paynow.integrationId);
  paynow.integrationKey = normalizePaynowCredential(paynow.integrationKey);
  paynow.generateHash = (values, integrationKey) => paynowPayloadHash(values, String(integrationKey || ''));
  paynow.build = function build(payment: PaynowPaymentLike) {
    return buildPaynowInitiationFields(this, payment);
  };
  paynow.buildMobile = function buildMobile(payment: PaynowPaymentLike, phone: string, method: string) {
    return buildPaynowInitiationFields(this, payment, { phone, method });
  };
}

export function parsePaynowBody(body: string): Record<string, string> {
  const query: Record<string, string> = {};
  const raw = String(body || '').replace(/^\uFEFF/, '');
  const pairs = (raw.startsWith('?') ? raw.slice(1) : raw).split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    const name = decodePaynowComponent(idx >= 0 ? pair.slice(0, idx) : pair);
    const value = decodePaynowComponent(idx >= 0 ? pair.slice(idx + 1) : '');
    query[name] = value;
  }
  return query;
}

export function paynowInitiationLinks(fields: Record<string, string>): {
  status: string;
  browserUrl: string;
  pollUrl: string;
  error: string;
} {
  return {
    status: String(fields.status || ''),
    browserUrl: String(fields.browserurl || fields.browserUrl || ''),
    pollUrl: String(fields.pollurl || fields.pollUrl || ''),
    error: String(fields.error || '')
  };
}

function decodePaynowComponent(value: string): string {
  try {
    return decodeURIComponent(String(value || '').replace(/%(?![\da-f]{2})/gi, '%25').replace(/\+/g, '%20'));
  } catch {
    return String(value || '');
  }
}
