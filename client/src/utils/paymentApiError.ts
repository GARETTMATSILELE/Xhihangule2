export function formatPaymentApiError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data || typeof data !== 'object') return fallback;
  const message = typeof data.message === 'string' && data.message.trim() ? data.message : fallback;
  const parts = [message];
  if (typeof data.code === 'string' && data.code.trim()) {
    parts.push(`(${data.code})`);
  }
  if (Array.isArray(data.missing) && data.missing.length) {
    parts.push(`Missing: ${data.missing.join(', ')}`);
  }
  if (Array.isArray(data.mismatches) && data.mismatches.length) {
    parts.push(`Mismatches: ${data.mismatches.join(', ')}`);
  }
  return parts.join(' ');
}
