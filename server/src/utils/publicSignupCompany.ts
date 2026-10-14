const SIGNUP_COMPANY_FIELDS = [
  'name',
  'tradingName',
  'address',
  'phone',
  'email',
  'website',
  'registrationNumber',
  'tinNumber',
  'vatNumber',
  'description',
  'country',
] as const;

/** Production signup stays closed unless an operator sets ALLOW_PUBLIC_SIGNUP=true. */
export function isPublicSignupAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return String(env.ALLOW_PUBLIC_SIGNUP || '').toLowerCase() === 'true';
}

/** Fields a public signup may supply. Subscription, flags, and fiscal secrets are not included. */
export function publicSignupCompanyFields(input: unknown): Record<string, unknown> {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const picked: Record<string, unknown> = {};
  for (const key of SIGNUP_COMPANY_FIELDS) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
}
