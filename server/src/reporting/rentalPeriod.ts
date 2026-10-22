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

const resolvePeriodRange = (
  input: RentalPeriodInput
): { start: { month: number; year: number }; end: { month: number; year: number } } | undefined => {
  const start =
    toMonthYear(input.advancePeriodStart?.month, input.advancePeriodStart?.year) ||
    toMonthYear(input.rentalPeriodMonth, input.rentalPeriodYear);
  if (!start) return undefined;

  const monthsPaid = Number(input.advanceMonthsPaid || 0);
  const explicitEnd = toMonthYear(input.advancePeriodEnd?.month, input.advancePeriodEnd?.year);
  const end = explicitEnd || (monthsPaid > 1 ? addMonths(start, monthsPaid - 1) : start);
  return { start, end };
};

/** Covered months only, for example "June" or "June–August". No payment date fallback. */
const formatCoveredMonthPhrase = (input: RentalPeriodInput): string | undefined => {
  const range = resolvePeriodRange(input);
  if (!range) return undefined;
  const { start, end } = range;

  if (end.year === start.year && end.month === start.month) {
    return MONTH_NAMES[start.month - 1];
  }

  if (end.year === start.year) {
    return `${MONTH_NAMES[start.month - 1]}–${MONTH_NAMES[end.month - 1]}`;
  }

  return `${monthLabel(start)}–${monthLabel(end)}`;
};

/**
 * Month the receipt covers, for agent-account transaction descriptions.
 * A June rental reads "June rent". A same-year advance reads "June–August rent".
 * Does not infer a month from the payment date.
 */
export const formatPaidMonthLabel = (input: RentalPeriodInput): string | undefined => {
  const phrase = formatCoveredMonthPhrase(input);
  if (!phrase) return undefined;
  return `${phrase} rent`;
};

export interface AgentCommissionLabelInput extends RentalPeriodInput {
  paymentType?: string;
}

/**
 * Description shown for a commission or commission-reversal row.
 * Rental rows name the month being paid. Sale and introduction rows omit receipt numbers.
 */
export const formatAgentCommissionDescription = (
  input: AgentCommissionLabelInput,
  options?: { reversal?: boolean; propertyName?: string }
): string | undefined => {
  const reversal = Boolean(options?.reversal);
  const paymentType = String(input.paymentType || '').toLowerCase();
  const propertyName = String(options?.propertyName || '').trim();
  const withProperty = (label: string | undefined): string | undefined => {
    if (!label) return undefined;
    return propertyName ? `${label} — ${propertyName}` : label;
  };

  if (paymentType === 'sale') {
    return withProperty(reversal ? 'Sale commission reversal' : 'Sale commission');
  }

  const coveredMonths = formatCoveredMonthPhrase(input);
  if (paymentType === 'introduction') {
    if (!coveredMonths) return withProperty(reversal ? 'Introduction commission reversal' : 'Introduction commission');
    return withProperty(reversal ? `${coveredMonths} introduction reversal` : `${coveredMonths} introduction`);
  }

  if (paymentType && paymentType !== 'rental') return undefined;
  if (!coveredMonths) return undefined;
  const rentLabel = `${coveredMonths} rent`;
  return withProperty(reversal ? `${rentLabel} reversal` : rentLabel);
};

/**
 * Formats stored rental-period metadata for landlord statements.
 * Does not infer a rental month from the payment/transaction date.
 */
export const formatRentPeriodDescription = (input: RentalPeriodInput): string | undefined => {
  const range = resolvePeriodRange(input);
  if (!range) return undefined;
  const { start, end } = range;

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
