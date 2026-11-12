const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeOwnerEmail(email: unknown): string {
  return String(email || '').trim().toLowerCase();
}

export function phoneDigits(phone: unknown): string {
  return String(phone || '').replace(/\D/g, '');
}

export function validateNewPropertyOwner(input: {
  email?: unknown;
  password?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
}): string | null {
  const email = normalizeOwnerEmail(input.email);
  const firstName = String(input.firstName || '').trim();
  const lastName = String(input.lastName || '').trim();
  const phone = String(input.phone || '').trim();
  const password = String(input.password || '');
  if (!email || !password || !firstName || !lastName || !phone) {
    return 'First name, last name, email, phone and password are required';
  }
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address';
  if (password.length < 6) return 'Password must be at least 6 characters';
  const digits = phoneDigits(phone);
  if (digits.length < 7 || digits.length > 15) return 'Enter a valid phone number';
  return null;
}

export function validateOwnerContact(input: { email?: unknown; phone?: unknown }): string | null {
  if (input.email !== undefined && String(input.email || '').trim()) {
    if (!EMAIL_RE.test(normalizeOwnerEmail(input.email))) return 'Enter a valid email address';
  }
  if (input.phone !== undefined && String(input.phone || '').trim()) {
    const digits = phoneDigits(input.phone);
    if (digits.length < 7 || digits.length > 15) return 'Enter a valid phone number';
  }
  return null;
}

/**
 * Hard-delete only when the owner has no property link and no historical record.
 * Anything else is deactivated so leases, ledgers and ownership history stay intact.
 */
export function ownerRetirementMode(input: {
  linkedPropertyCount: number;
  leaseCount: number;
  paymentCount: number;
  accountCount: number;
  historyCount: number;
  documentCount: number;
}): 'deactivate' | 'delete' {
  const protectedCount = input.linkedPropertyCount
    + input.leaseCount
    + input.paymentCount
    + input.accountCount
    + input.historyCount
    + input.documentCount;
  return protectedCount > 0 ? 'deactivate' : 'delete';
}
