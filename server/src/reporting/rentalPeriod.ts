const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;

export interface RentalPeriodInput {
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month?: number; year?: number };
  advancePeriodEnd?: { month?: number; year?: number };
}

const toMonthYear = (month?: number, year?: number): { month: number; year: number } | undefined => {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || !Number.isInteger(y) || m < 1 || m > 12 || y < 1900) return undefined;
  return { month: m, year: y };
};

const addMonths = (start: { month: number; year: number }, extraMonths: number): { month: number; year: number } => {
  const index = start.year * 12 + (start.month - 1) + extraMonths;
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1
  };
};

const monthLabel = (value: { month: number; year: number }): string =>
  `${MONTH_NAMES[value.month - 1]} ${value.year}`;

/**
 * Formats stored rental-period metadata for landlord statements.
 * Does not infer a rental month from the payment/transaction date.
 */
export const formatRentPeriodDescription = (input: RentalPeriodInput): string | undefined => {
  const start =
    toMonthYear(input.advancePeriodStart?.month, input.advancePeriodStart?.year) ||
    toMonthYear(input.rentalPeriodMonth, input.rentalPeriodYear);
  if (!start) return undefined;

  const monthsPaid = Number(input.advanceMonthsPaid || 0);
  const explicitEnd = toMonthYear(input.advancePeriodEnd?.month, input.advancePeriodEnd?.year);
  const end = explicitEnd || (monthsPaid > 1 ? addMonths(start, monthsPaid - 1) : start);

  if (end.year === start.year && end.month === start.month) {
    return `${monthLabel(start)} Rent`;
  }

  if (end.year === start.year) {
    return `${MONTH_NAMES[start.month - 1]}–${MONTH_NAMES[end.month - 1]} ${start.year} Rent`;
  }

  return `${monthLabel(start)}–${monthLabel(end)} Rent`;
};

export const cleanStatementDescription = (description?: string, fallback = 'Transaction'): string => {
  const text = String(description || '').trim();
  if (!text) return fallback;
  const withoutRef = text
    .replace(/\s*[-–—]\s*(REF[-_:]?\s*\S+)/gi, '')
    .replace(/\bREF[-_:]?\s*\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!withoutRef) return fallback;
  if (/^rental income$/i.test(withoutRef)) return 'Rental Income';
  if (/^sale income$/i.test(withoutRef)) return 'Sale Income';
  if (/^owner payout$/i.test(withoutRef)) return 'Owner Payout';
  return withoutRef;
};
