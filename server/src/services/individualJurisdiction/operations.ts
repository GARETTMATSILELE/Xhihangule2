import { roundMoney } from '../../utils/money';
import type { JurisdictionCode } from './publishedRules';

export const BILL_CATEGORIES = ['Municipal', 'Municipal Rates', 'Levies', 'Insurance', 'Utilities'] as const;

export const SIMPLE_EXPENSE_CATEGORIES = [
  'Repairs',
  'Maintenance',
  'Utilities',
  'Levies',
  'Municipal Rates',
  'Insurance',
  'Security',
  'Property Management',
  'Other'
] as const;

const QUALIFYING_RENTAL_EXPENSES = new Set([
  'REPAIRS',
  'MAINTENANCE',
  'UTILITIES',
  'LEVIES',
  'MUNICIPAL',
  'MUNICIPAL_RATES',
  'INSURANCE',
  'SECURITY',
  'PROPERTY_MANAGEMENT',
  'PROPERTY MANAGEMENT'
]);

export type SettlementStatus = 'UNSETTLED' | 'SETTLED' | 'NOT_AN_OBLIGATION';

export function isBillCategory(category?: string | null): boolean {
  return (BILL_CATEGORIES as readonly string[]).includes(String(category || ''));
}

export function settlementForEntry(category: string | undefined, paymentStatus?: string | null): SettlementStatus {
  if (!isBillCategory(category)) return 'NOT_AN_OBLIGATION';
  const status = String(paymentStatus || 'unpaid').trim().toLowerCase();
  return status === 'paid' || status === 'settled' || status === 'completed' ? 'SETTLED' : 'UNSETTLED';
}

export function sameObligation(
  existing: { propertyId: string; category: string; amount: number; date: string | Date; reference?: string | null; settlementStatus?: string | null },
  candidate: { propertyId: string; category: string; amount: number; date: string | Date; reference?: string | null }
): boolean {
  if (existing.settlementStatus !== 'UNSETTLED') return false;
  if (String(existing.propertyId) !== String(candidate.propertyId)) return false;
  if (String(existing.category) !== String(candidate.category)) return false;
  if (roundMoney(existing.amount) !== roundMoney(candidate.amount)) return false;
  const left = new Date(existing.date).toISOString().slice(0, 10);
  const right = new Date(candidate.date).toISOString().slice(0, 10);
  if (left !== right) return false;
  return String(existing.reference || '') === String(candidate.reference || '');
}

export function deriveExpenseTaxMetadata(category: string): {
  deductibility: 'DEDUCTIBLE' | 'ACCOUNTANT_REVIEW';
  capitalOrRevenue: 'REVENUE' | 'ACCOUNTANT_REVIEW';
  vatMode: 'UNKNOWN';
  inputVatEligibility: 'REVIEW_REQUIRED';
} {
  const code = String(category || '').trim().toUpperCase().replace(/\s+/g, '_');
  const qualifying = QUALIFYING_RENTAL_EXPENSES.has(code) || QUALIFYING_RENTAL_EXPENSES.has(String(category || '').trim().toUpperCase());
  return {
    deductibility: qualifying ? 'DEDUCTIBLE' : 'ACCOUNTANT_REVIEW',
    capitalOrRevenue: qualifying ? 'REVENUE' : 'ACCOUNTANT_REVIEW',
    vatMode: 'UNKNOWN',
    inputVatEligibility: 'REVIEW_REQUIRED'
  };
}

export type MoneyRow = { amount: number; currency: string };

export type ConversionInput = {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rate?: number | null;
  rateDate?: string | null;
  source?: string | null;
};

export type ConversionResult = {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number | null;
  currency: string;
  rate: number | null;
  rateDate: string | null;
  source: string | null;
  conversionRequired: boolean;
  originalPreserved: true;
};

export function convertForReporting(input: ConversionInput): ConversionResult {
  const from = String(input.fromCurrency || '').trim().toUpperCase() || 'USD';
  const to = String(input.toCurrency || '').trim().toUpperCase() || from;
  const originalAmount = roundMoney(input.amount);
  if (from === to) {
    return {
      originalAmount,
      originalCurrency: from,
      convertedAmount: originalAmount,
      currency: to,
      rate: 1,
      rateDate: input.rateDate || null,
      source: 'SAME_CURRENCY',
      conversionRequired: false,
      originalPreserved: true
    };
  }
  const rate = input.rate == null ? null : Number(input.rate);
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return {
      originalAmount,
      originalCurrency: from,
      convertedAmount: null,
      currency: to,
      rate: null,
      rateDate: input.rateDate || null,
      source: input.source || null,
      conversionRequired: true,
      originalPreserved: true
    };
  }
  return {
    originalAmount,
    originalCurrency: from,
    convertedAmount: roundMoney(originalAmount * rate),
    currency: to,
    rate,
    rateDate: input.rateDate || null,
    source: input.source || 'USER_PROVIDED',
    conversionRequired: false,
    originalPreserved: true
  };
}

export function sumSameCurrency(rows: MoneyRow[]): { total: number | null; currency: string | null; mixed: boolean } {
  const currencies = Array.from(new Set(rows.map((row) => String(row.currency || '').toUpperCase()).filter(Boolean)));
  if (currencies.length !== 1) return { total: null, currency: currencies[0] || null, mixed: currencies.length > 1 };
  return {
    total: roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
    currency: currencies[0],
    mixed: false
  };
}

export type PropertyFinancialInput = {
  currency: string;
  monthlyRent: number;
  rentCollected: number;
  transactions: Array<{ type?: string; category?: string; amount?: number; currency?: string; date?: string | Date; obligationStatus?: string | null }>;
  periodStart: Date;
  periodEnd: Date;
};

export function buildPropertyFinancialOverview(input: PropertyFinancialInput) {
  const currency = String(input.currency || 'USD').toUpperCase();
  const inPeriod = (value?: string | Date) => {
    if (!value) return false;
    const date = new Date(value);
    return date >= input.periodStart && date < input.periodEnd;
  };
  const foreign = input.transactions.filter((row) => row.currency && String(row.currency).toUpperCase() !== currency);
  const usable = input.transactions.filter((row) => !row.currency || String(row.currency).toUpperCase() === currency);
  const sum = (rows: typeof usable) => roundMoney(rows.reduce((total, row) => total + Number(row.amount || 0), 0));
  const outstanding = (categories: string[]) => sum(usable.filter((row) =>
    categories.includes(String(row.category || '')) && row.obligationStatus === 'UNSETTLED'
  ));
  const monthlyExpenses = sum(usable.filter((row) => inPeriod(row.date) && row.type !== 'income' && row.type !== 'opening_balance'));
  const rentCollected = roundMoney(input.rentCollected);
  const monthlyRent = roundMoney(input.monthlyRent);
  return {
    currency,
    monthlyRental: monthlyRent,
    rentCollected,
    outstandingRent: roundMoney(Math.max(0, monthlyRent - rentCollected)),
    outstandingLevies: outstanding(['Levies']),
    municipalCharges: outstanding(['Municipal', 'Municipal Rates']),
    utilities: outstanding(['Utilities']),
    insurance: outstanding(['Insurance']),
    totalOutstandingBills: outstanding(['Levies', 'Municipal', 'Municipal Rates', 'Utilities', 'Insurance']),
    monthlyExpenses,
    netOperatingIncome: roundMoney(rentCollected - monthlyExpenses),
    mixedCurrency: foreign.length > 0,
    conversionRequired: foreign.length > 0,
    originalAmountsPreserved: true
  };
}

export const INDIVIDUAL_NOTIFICATION_EVENTS = [
  'RENT_PAID',
  'RENT_OVERDUE',
  'LEASE_EXPIRING',
  'INSPECTION_DUE',
  'MAINTENANCE_COMPLETED',
  'MUNICIPAL_BILL_DUE',
  'EXPENSE_ADDED',
  'TENANT_ADDED'
] as const;

export type IndividualNotificationEvent = (typeof INDIVIDUAL_NOTIFICATION_EVENTS)[number];

export type IndividualEventPrefs = Partial<Record<IndividualNotificationEvent, { email?: boolean; inApp?: boolean }>>;

const TEMPLATE_TO_OWNER_EVENT: Record<string, IndividualNotificationEvent> = {
  RENT_PAYMENT_RECEIVED: 'RENT_PAID',
  RENT_PAYMENT_REMINDER: 'RENT_OVERDUE',
  LEASE_EXPIRING: 'LEASE_EXPIRING',
  INSPECTION_DUE: 'INSPECTION_DUE',
  WORK_COMPLETED: 'MAINTENANCE_COMPLETED',
  MAINTENANCE_COMPLETED: 'MAINTENANCE_COMPLETED',
  MUNICIPAL_BILL_DUE: 'MUNICIPAL_BILL_DUE',
  EXPENSE_ADDED: 'EXPENSE_ADDED',
  TENANT_ADDED: 'TENANT_ADDED'
};

export function defaultNotificationPreferences(): Record<IndividualNotificationEvent, { email: boolean; inApp: boolean }> {
  return INDIVIDUAL_NOTIFICATION_EVENTS.reduce((prefs, event) => {
    prefs[event] = { email: true, inApp: true };
    return prefs;
  }, {} as Record<IndividualNotificationEvent, { email: boolean; inApp: boolean }>);
}

/** inherit = NotificationService keeps its existing channel rules. skip = this owner turned the channel off. */
export function individualChannelDecision(
  stored: IndividualEventPrefs | null | undefined,
  templateOrEvent: string,
  channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP'
): 'inherit' | 'send' | 'skip' {
  if (!stored || typeof stored !== 'object') return 'inherit';
  const event = TEMPLATE_TO_OWNER_EVENT[templateOrEvent];
  if (!event) return 'inherit';
  if (channel !== 'IN_APP' && channel !== 'EMAIL') return 'inherit';
  const row = stored[event];
  if (!row) return 'send';
  if (channel === 'EMAIL' && row.email === false) return 'skip';
  if (channel === 'IN_APP' && row.inApp === false) return 'skip';
  return 'send';
}

export function jurisdictionProfileLabel(code: JurisdictionCode): string {
  if (code === 'ZA') return 'South Africa';
  if (code === 'GLOBAL') return 'Other countries';
  return 'Zimbabwe';
}
