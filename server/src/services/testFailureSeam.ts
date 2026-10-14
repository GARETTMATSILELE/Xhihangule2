const fired = new Set<string>();

/**
 * Development-only one-shot failure injection.
 * Armed only when NODE_ENV is not production and MANTIS_TEST_SEAM=1,
 * and the payment notes or reversal reason contains the token.
 */
export function throwOnceIfArmed(paymentId: string, haystack: string, token: string): void {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.MANTIS_TEST_SEAM !== '1') return;
  if (!haystack.includes(token)) return;
  const key = `${token}:${paymentId}`;
  if (fired.has(key)) return;
  fired.add(key);
  throw new Error(token);
}
