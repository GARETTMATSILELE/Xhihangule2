function requestHostname(value: string | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Redirect a listed alias to the canonical host.
 * A request that is already on the canonical host is left unchanged, including its query string.
 * The apex name is not redirected unless it is explicitly listed. POST is never redirected.
 * The host is taken from the Host header value passed in, not from a forwarded-host header.
 */
export function canonicalRedirectTarget(input: {
  hostHeader?: string;
  protocol?: string;
  originalUrl?: string;
  method?: string;
  canonicalHost?: string;
  redirectFromHosts?: string;
}): string | null {
  const canonical = requestHostname(input.canonicalHost);
  if (!canonical) return null;
  const current = requestHostname(String(input.hostHeader || '').split(',')[0]);
  if (!current || current === canonical) return null;
  const allowed = String(input.redirectFromHosts || '')
    .split(',')
    .map((item) => requestHostname(item))
    .filter(Boolean);
  if (!allowed.includes(current)) return null;
  const method = String(input.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;
  const protocol = input.protocol === 'http' ? 'http' : 'https';
  const path = String(input.originalUrl || '/');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${protocol}://${canonical}${suffix}`;
}
