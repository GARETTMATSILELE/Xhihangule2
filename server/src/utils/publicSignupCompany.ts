import { normalizeEmail } from './normalization';
import { isRegistrationEmail } from '../services/registrationPaymentPolicy';

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

/**
 * Comma-separated emails. Blank means no allowlist.
 * Entries that are not email addresses are ignored.
 * A non-blank value with no valid emails does not mean everyone may register.
 */
export function signupEmailAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return String(env.SIGNUP_EMAIL_ALLOWLIST || '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter((email) => isRegistrationEmail(email));
}

export function signupAllowlistConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.SIGNUP_EMAIL_ALLOWLIST || '').trim().length > 0;
}

export function publicSignupDecision(env: NodeJS.ProcessEnv = process.env, email?: string): {
  signupEnabled: boolean;
  allowlistRestricted: boolean;
  emailAllowed: boolean;
  code?: 'SIGNUP_DISABLED' | 'SIGNUP_NOT_INVITED';
} {
  const signupEnabled = isPublicSignupAllowed(env);
  const allowlist = signupEmailAllowlist(env);
  const allowlistConfigured = signupAllowlistConfigured(env);
  const allowlistRestricted = allowlistConfigured;
  if (!signupEnabled) {
    return { signupEnabled: false, allowlistRestricted, emailAllowed: false, code: 'SIGNUP_DISABLED' };
  }
  if (allowlistConfigured && allowlist.length === 0) {
    return { signupEnabled: true, allowlistRestricted: true, emailAllowed: false, code: 'SIGNUP_NOT_INVITED' };
  }
  const normalized = normalizeEmail(email);
  if (allowlistRestricted && normalized) {
    const emailAllowed = allowlist.includes(normalized);
    return {
      signupEnabled: true,
      allowlistRestricted,
      emailAllowed,
      code: emailAllowed ? undefined : 'SIGNUP_NOT_INVITED'
    };
  }
  return { signupEnabled: true, allowlistRestricted, emailAllowed: true };
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
