import { AppError } from '../middleware/errorHandler';

const LEGAL_FIELDS = ['registrationNumber', 'tinNumber'] as const;

/**
 * Blank legal identifiers must not be stored. A unique index treats "" as a real key,
 * which makes the next landlord profile save fail after payment.
 */
export function companyProfileWrite(
  updateData: Record<string, unknown>,
  companyType: string
): { $set: Record<string, unknown>; $unset: Record<string, 1> } {
  const set: Record<string, unknown> = { ...updateData };
  const unset: Record<string, 1> = {};
  const registered = companyType === 'REGISTERED_BUSINESS';
  for (const field of LEGAL_FIELDS) {
    if (set[field] === undefined) continue;
    const value = String(set[field] ?? '').trim();
    if (value) {
      set[field] = value;
      continue;
    }
    if (registered) {
      throw new AppError(
        field === 'registrationNumber'
          ? 'Registration number is required for a registered business'
          : 'TIN number is required for a registered business',
        400,
        'COMPANY_VALIDATION'
      );
    }
    delete set[field];
    unset[field] = 1;
    unset[field === 'registrationNumber' ? 'normalizedRegistrationNumber' : 'normalizedTinNumber'] = 1;
  }
  return { $set: set, $unset: unset };
}

export function companyUpdateError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const named = error as { name?: string; message?: string; code?: number; errors?: Record<string, { message?: string }> };
  if (named?.name === 'ValidationError') {
    const first = named.errors ? Object.values(named.errors).find((item) => item?.message)?.message : '';
    return new AppError(first || 'Company details are not valid', 400, 'COMPANY_VALIDATION');
  }
  if (named?.code === 11000) {
    return new AppError('A company with those details already exists. Sign in with the original account.', 409, 'DUPLICATE_COMPANY');
  }
  return new AppError('Error updating company', 500, 'COMPANY_UPDATE_FAILED');
}
