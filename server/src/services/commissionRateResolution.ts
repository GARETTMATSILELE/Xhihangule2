export const COMMISSION_RATE_REQUIRED = 'COMMISSION_RATE_REQUIRED';

export type CommissionRateResolution =
  | { ok: true; percent: number }
  | { ok: false; code: typeof COMMISSION_RATE_REQUIRED; message: string };

/**
 * The stored property commission percentage is the only rate a payment may use.
 * A missing or invalid percentage is a configuration error. 100% is not assumed.
 */
export function resolveStoredCommissionPercentage(value: unknown): CommissionRateResolution {
  if (value == null || value === '') {
    return {
      ok: false,
      code: COMMISSION_RATE_REQUIRED,
      message: 'A property commission percentage from 0 to 100 is required. 100% is not assumed.'
    };
  }
  const percent = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return {
      ok: false,
      code: COMMISSION_RATE_REQUIRED,
      message: 'Property commission percentage must be a number from 0 to 100. 100% is not assumed.'
    };
  }
  return { ok: true, percent };
}
