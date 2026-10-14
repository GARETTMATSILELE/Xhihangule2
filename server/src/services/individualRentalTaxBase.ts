import { roundRentalTaxMoney } from './tax/rentalTaxRounding';
import type { TransactionTaxSourceKind } from './tax/taxMetadataTypes';

const RENT_CATEGORIES = new Set([
  'RENTAL_INCOME',
  'RENT',
  'DEPOSIT_APPLICATION'
]);

const EXCLUDED_CATEGORIES = new Set([
  'LEVY_RECOVERY',
  'UTILITY_RECOVERY',
  'TENANT_DEPOSIT',
  'DEPOSIT_REFUND',
  'OWNER_FUNDS'
]);

const REVIEW_CATEGORIES = new Set([
  'PARKING_INCOME',
  'STORAGE_INCOME',
  'OTHER_PROPERTY_INCOME',
  'OTHER_INCOME',
  'INTEREST_INCOME'
]);

export type RentalTaxBaseResult = {
  calculationMethod: string;
  grossRentalAmount: number | null;
  excludedAmount: number | null;
  taxableRentalBase: number | null;
  reviewReasons: string[];
  status: 'READY' | 'REVIEW_REQUIRED' | 'NOT_APPLICABLE';
  notes: string;
};

function empty(status: RentalTaxBaseResult['status'], extra: Partial<RentalTaxBaseResult> = {}): RentalTaxBaseResult {
  return {
    calculationMethod: extra.calculationMethod || 'GROSS_RENTAL_PERCENT',
    grossRentalAmount: extra.grossRentalAmount ?? null,
    excludedAmount: extra.excludedAmount ?? null,
    taxableRentalBase: extra.taxableRentalBase ?? null,
    reviewReasons: extra.reviewReasons || [],
    status,
    notes: extra.notes || ''
  };
}

/**
 * Rule-driven rental tax base. PN 08: 15% of **gross rental received**, no deductions.
 * Deposits are not rent. Identified levies/recoveries are excluded as pass-through,
 * not because they are an "allowance". Unclear splits go to REVIEW_REQUIRED.
 * VAT amounts are never used as the rental-tax base.
 */
export function resolveRentalTaxBase(input: {
  sourceKind: TransactionTaxSourceKind;
  calculationMethod?: string | null;
  amount?: number | null;
  rentAllocated?: number | null;
  levyAllocated?: number | null;
  depositAmount?: number | null;
  category?: string | null;
}): RentalTaxBaseResult {
  const method = String(input.calculationMethod || 'GROSS_RENTAL_PERCENT');
  const reviewReasons: string[] = [];

  if (input.sourceKind === 'PAYMENT_DEPOSIT' || input.sourceKind === 'LIABILITY') {
    return empty('NOT_APPLICABLE', {
      calculationMethod: method,
      grossRentalAmount: Number(input.amount || 0),
      excludedAmount: Number(input.amount || 0),
      taxableRentalBase: null,
      notes: 'Deposit received is not rental income'
    });
  }

  if (input.sourceKind !== 'PAYMENT_RENT' && input.sourceKind !== 'OTHER_INCOME') {
    return empty('NOT_APPLICABLE', {
      calculationMethod: method,
      notes: 'Transaction is not a rental receipt'
    });
  }

  if (method !== 'GROSS_RENTAL_PERCENT') {
    reviewReasons.push('TAX_BASE_CANNOT_BE_DETERMINED');
    return empty('REVIEW_REQUIRED', {
      calculationMethod: method,
      reviewReasons,
      notes: 'Configured calculation method is not GROSS_RENTAL_PERCENT'
    });
  }

  const category = String(input.category || '').toUpperCase().replace(/\s+/g, '_');
  if (input.sourceKind === 'OTHER_INCOME') {
    if (EXCLUDED_CATEGORIES.has(category)) {
      return empty('NOT_APPLICABLE', {
        calculationMethod: method,
        grossRentalAmount: Number(input.amount || 0),
        excludedAmount: Number(input.amount || 0),
        taxableRentalBase: null,
        notes: 'Identified pass-through or liability is not gross rental'
      });
    }
    if (REVIEW_CATEGORIES.has(category) || (!category && input.sourceKind === 'OTHER_INCOME')) {
      if (!RENT_CATEGORIES.has(category)) {
        reviewReasons.push('TAX_BASE_CANNOT_BE_DETERMINED');
        if (category === 'LEVY_RECOVERY' || category === 'UTILITY_RECOVERY') {
          reviewReasons.push('PASS_THROUGH_TREATMENT_UNCLEAR');
        }
        return empty('REVIEW_REQUIRED', {
          calculationMethod: method,
          grossRentalAmount: Number(input.amount || 0),
          excludedAmount: null,
          taxableRentalBase: null,
          reviewReasons,
          notes: 'Receipt is not classified as rent of business premises'
        });
      }
    }
  }

  const gross = roundRentalTaxMoney(Number(input.amount || 0));
  const deposit = Math.max(0, Number(input.depositAmount || 0));
  const levy = Math.max(0, Number(input.levyAllocated || 0));
  const excluded = roundRentalTaxMoney(deposit + levy);

  if (input.rentAllocated != null && Number.isFinite(Number(input.rentAllocated))) {
    const rent = roundRentalTaxMoney(Number(input.rentAllocated));
    return empty('READY', {
      calculationMethod: method,
      grossRentalAmount: gross,
      excludedAmount: excluded,
      taxableRentalBase: rent,
      notes: 'Gross rental received after identified deposit and levy splits'
    });
  }

  if (input.sourceKind === 'PAYMENT_RENT') {
    const base = roundRentalTaxMoney(gross - excluded);
    if (base < 0) {
      reviewReasons.push('TAX_BASE_CANNOT_BE_DETERMINED');
      return empty('REVIEW_REQUIRED', {
        calculationMethod: method,
        grossRentalAmount: gross,
        excludedAmount: excluded,
        taxableRentalBase: null,
        reviewReasons,
        notes: 'Identified exclusions exceed the receipt'
      });
    }
    if (!(gross > 0) && !(base > 0) && !(excluded > 0)) {
      reviewReasons.push('TAX_BASE_CANNOT_BE_DETERMINED');
      return empty('REVIEW_REQUIRED', {
        calculationMethod: method,
        grossRentalAmount: gross,
        excludedAmount: excluded,
        taxableRentalBase: null,
        reviewReasons,
        notes: 'Rental receipt amount is missing'
      });
    }
    return empty('READY', {
      calculationMethod: method,
      grossRentalAmount: gross,
      excludedAmount: excluded,
      taxableRentalBase: base,
      notes: 'Gross rental received; deposits and identified levies excluded'
    });
  }

  if (RENT_CATEGORIES.has(category)) {
    return empty('READY', {
      calculationMethod: method,
      grossRentalAmount: gross,
      excludedAmount: 0,
      taxableRentalBase: gross,
      notes: category === 'DEPOSIT_APPLICATION'
        ? 'Deposit applied to rent is treated as rental income'
        : 'Gross rental received; no deductions'
    });
  }

  reviewReasons.push('TAX_BASE_CANNOT_BE_DETERMINED');
  return empty('REVIEW_REQUIRED', {
    calculationMethod: method,
    grossRentalAmount: gross,
    excludedAmount: null,
    taxableRentalBase: null,
    reviewReasons,
    notes: 'Cannot determine whether the receipt is gross rental'
  });
}
