import type { AccountingTreatment, TransactionCategory } from '../models/PropertyAccount';
import type { CapitalOrRevenue, Deductibility, LandlordSourceKind, LandlordVatMode } from '../models/LandlordFinancialTransaction';

export const LEGACY_INCOME_CATEGORIES = [
  'Rent',
  'Parking',
  'Levy Recovery',
  'Utilities Recovery',
  'Storage Income',
  'Other Income'
] as const;

export const LEGACY_EXPENSE_CATEGORIES = [
  'Maintenance',
  'Municipal',
  'Levies',
  'Security',
  'Insurance',
  'Gardening',
  'Cleaning',
  'Repairs',
  'Utilities',
  'Legal',
  'Other'
] as const;

export const CANONICAL_INCOME_CATEGORIES = [
  'RENTAL_INCOME',
  'PARKING_INCOME',
  'STORAGE_INCOME',
  'UTILITY_RECOVERY',
  'LEVY_RECOVERY',
  'OTHER_PROPERTY_INCOME',
  'INTEREST_INCOME',
  'OTHER_INCOME',
  'DEPOSIT_APPLICATION'
] as const;

export const CANONICAL_EXPENSE_CATEGORIES = [
  'MAINTENANCE',
  'REPAIRS',
  'MUNICIPAL_RATES',
  'LEVIES',
  'INSURANCE',
  'SECURITY',
  'GARDENING',
  'CLEANING',
  'UTILITIES',
  'LEGAL',
  'ACCOUNTING',
  'BANK_CHARGES',
  'PROPERTY_MANAGEMENT',
  'ADVERTISING',
  'TRAVEL',
  'OTHER_PROPERTY_EXPENSE'
] as const;

export const CANONICAL_CAPITAL_CATEGORIES = [
  'PROPERTY_ACQUISITION',
  'CAPITAL_IMPROVEMENT',
  'MAJOR_RENOVATION',
  'EQUIPMENT'
] as const;

export const CANONICAL_LIABILITY_CATEGORIES = [
  'TENANT_DEPOSIT',
  'DEPOSIT_REFUND',
  'OWNER_FUNDS'
] as const;

const LEGACY_INCOME_MAP: Record<string, string> = {
  Rent: 'RENTAL_INCOME',
  Parking: 'PARKING_INCOME',
  'Levy Recovery': 'LEVY_RECOVERY',
  'Utilities Recovery': 'UTILITY_RECOVERY',
  'Storage Income': 'STORAGE_INCOME',
  'Other Income': 'OTHER_INCOME'
};

const LEGACY_EXPENSE_MAP: Record<string, string> = {
  Maintenance: 'MAINTENANCE',
  Municipal: 'MUNICIPAL_RATES',
  Levies: 'LEVIES',
  Security: 'SECURITY',
  Insurance: 'INSURANCE',
  Gardening: 'GARDENING',
  Cleaning: 'CLEANING',
  Repairs: 'REPAIRS',
  Utilities: 'UTILITIES',
  Legal: 'LEGAL',
  Other: 'OTHER_PROPERTY_EXPENSE'
};

export function normalizeLandlordCategory(raw: string, fallbackKind: LandlordSourceKind): string {
  const value = String(raw || '').trim();
  if (!value) {
    if (fallbackKind === 'OTHER_INCOME') return 'OTHER_INCOME';
    if (fallbackKind === 'MAINTENANCE') return 'MAINTENANCE';
    if (fallbackKind === 'CAPITAL') return 'CAPITAL_IMPROVEMENT';
    if (fallbackKind === 'LIABILITY') return 'TENANT_DEPOSIT';
    return 'OTHER_PROPERTY_EXPENSE';
  }
  if (LEGACY_INCOME_MAP[value]) return LEGACY_INCOME_MAP[value];
  if (LEGACY_EXPENSE_MAP[value]) return LEGACY_EXPENSE_MAP[value];
  return value.replace(/\s+/g, '_').toUpperCase();
}

export function classifyLandlordCategory(category: string): {
  sourceKind: LandlordSourceKind;
  accountingTreatment: AccountingTreatment;
  transactionCategory: TransactionCategory;
  capitalOrRevenue: CapitalOrRevenue;
  deductibility: Deductibility;
  vatModeDefault: LandlordVatMode;
  ledgerType: 'income' | 'expense' | 'maintenance' | 'other';
} {
  const code = category.toUpperCase();
  if (code === 'DEPOSIT_APPLICATION') {
    return {
      sourceKind: 'OTHER_INCOME',
      accountingTreatment: 'PROPERTY_INCOME',
      transactionCategory: 'RENT',
      capitalOrRevenue: 'REVENUE',
      deductibility: 'NOT_APPLICABLE',
      vatModeDefault: 'UNKNOWN',
      ledgerType: 'income'
    };
  }
  if ((CANONICAL_LIABILITY_CATEGORIES as readonly string[]).includes(code) || code === 'DEPOSIT') {
    return {
      sourceKind: 'LIABILITY',
      accountingTreatment: 'LIABILITY',
      transactionCategory: 'DEPOSIT',
      capitalOrRevenue: 'ACCOUNTANT_REVIEW',
      deductibility: 'NOT_APPLICABLE',
      vatModeDefault: 'NO_VAT',
      ledgerType: 'other'
    };
  }
  if ((CANONICAL_CAPITAL_CATEGORIES as readonly string[]).includes(code)) {
    return {
      sourceKind: 'CAPITAL',
      accountingTreatment: 'CAPITAL',
      transactionCategory: 'OTHER',
      capitalOrRevenue: 'CAPITAL',
      deductibility: 'CAPITAL',
      vatModeDefault: 'ACCOUNTANT_REVIEW',
      ledgerType: 'other'
    };
  }
  if ((CANONICAL_INCOME_CATEGORIES as readonly string[]).includes(code)) {
    return {
      sourceKind: 'OTHER_INCOME',
      accountingTreatment: 'PROPERTY_INCOME',
      transactionCategory: code === 'RENTAL_INCOME' ? 'RENT' : 'OTHER',
      capitalOrRevenue: 'REVENUE',
      deductibility: 'NOT_APPLICABLE',
      vatModeDefault: 'UNKNOWN',
      ledgerType: 'income'
    };
  }
  if (code === 'MAINTENANCE') {
    return {
      sourceKind: 'MAINTENANCE',
      accountingTreatment: 'PROPERTY_EXPENSE',
      transactionCategory: 'MAINTENANCE',
      capitalOrRevenue: 'REVENUE',
      deductibility: 'ACCOUNTANT_REVIEW',
      vatModeDefault: 'UNKNOWN',
      ledgerType: 'maintenance'
    };
  }
  return {
    sourceKind: 'EXPENSE',
    accountingTreatment: 'PROPERTY_EXPENSE',
    transactionCategory: 'OTHER',
    capitalOrRevenue: 'REVENUE',
    deductibility: 'ACCOUNTANT_REVIEW',
    vatModeDefault: 'UNKNOWN',
    ledgerType: 'expense'
  };
}

export function isAllowedLegacyCategory(entryType: 'income' | 'expense' | 'maintenance', category: string): boolean {
  if (entryType === 'income') {
    return (LEGACY_INCOME_CATEGORIES as readonly string[]).includes(category)
      || (CANONICAL_INCOME_CATEGORIES as readonly string[]).includes(category);
  }
  const allowed = [
    ...LEGACY_EXPENSE_CATEGORIES,
    ...CANONICAL_EXPENSE_CATEGORIES,
    ...CANONICAL_CAPITAL_CATEGORIES,
    ...CANONICAL_LIABILITY_CATEGORIES
  ];
  return allowed.includes(category as any);
}
