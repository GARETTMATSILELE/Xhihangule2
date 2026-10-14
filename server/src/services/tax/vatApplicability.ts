import type { PropertyUseClass, VatSupplyTreatment } from './taxTypes';

export type CompanyVatRegistration = {
  vatRegistered: boolean;
  vatRegistrationEffectiveDate?: Date | string | null;
  vatRegistrationCancelledAt?: Date | string | null;
};

export type VatApplicabilityInput = {
  company: CompanyVatRegistration;
  transactionDate: Date;
  supplyTreatment: VatSupplyTreatment;
  useClass?: PropertyUseClass;
  requested?: boolean;
};

export type VatApplicabilityResult = {
  vatApplies: boolean;
  reason: string;
  reviewRequired: boolean;
  reviewReason?: string;
};

const startOfDayUtc = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

export function isCompanyVatRegisteredOnDate(company: CompanyVatRegistration, transactionDate: Date): boolean {
  if (!company?.vatRegistered) return false;
  const day = startOfDayUtc(transactionDate);
  if (company.vatRegistrationEffectiveDate) {
    const from = startOfDayUtc(new Date(company.vatRegistrationEffectiveDate));
    if (day < from) return false;
  }
  if (company.vatRegistrationCancelledAt) {
    const to = startOfDayUtc(new Date(company.vatRegistrationCancelledAt));
    if (day > to) return false;
  }
  return true;
}

export function defaultSupplyTreatment(useClass?: PropertyUseClass): VatSupplyTreatment {
  if (useClass === 'RESIDENTIAL_DWELLING') return 'EXEMPT';
  if (useClass === 'AGENCY_COMMISSION') return 'STANDARD_TAXABLE';
  if (useClass === 'COMMERCIAL' || useClass === 'SALE') return 'ACCOUNTANT_REVIEW';
  if (useClass === 'MIXED_USE' || useClass === 'SHORT_TERM_ACCOMMODATION') return 'ACCOUNTANT_REVIEW';
  return 'OUT_OF_SCOPE';
}

/**
 * VAT is charged only when the company is registered on the date, the supply is
 * taxable, and (for optional flags) the service was requested as taxable.
 * A property "VAT enabled" flag alone is not sufficient.
 */
export function evaluateVatApplicability(input: VatApplicabilityInput): VatApplicabilityResult {
  const registered = isCompanyVatRegisteredOnDate(input.company, input.transactionDate);
  if (!registered) {
    return {
      vatApplies: false,
      reason: 'company_not_vat_registered_on_date',
      reviewRequired: Boolean(input.requested),
      reviewReason: input.requested ? 'VAT_CHARGED_WHILE_COMPANY_NOT_REGISTERED' : undefined
    };
  }

  const treatment = input.supplyTreatment || defaultSupplyTreatment(input.useClass);
  if (treatment === 'ACCOUNTANT_REVIEW') {
    return {
      vatApplies: false,
      reason: 'supply_requires_accountant_review',
      reviewRequired: true,
      reviewReason: 'SALE_VAT_APPLICABILITY_UNCERTAIN'
    };
  }
  if (treatment === 'EXEMPT' || treatment === 'OUT_OF_SCOPE' || treatment === 'ZERO_RATED') {
    return {
      vatApplies: false,
      reason: `supply_${treatment.toLowerCase()}`,
      reviewRequired: Boolean(input.requested) && treatment !== 'ZERO_RATED',
      reviewReason: input.requested && treatment !== 'ZERO_RATED' ? 'VAT_REQUESTED_ON_NON_TAXABLE_SUPPLY' : undefined
    };
  }

  if (treatment === 'STANDARD_TAXABLE') {
    if (input.requested === false) {
      return { vatApplies: false, reason: 'taxable_but_not_selected', reviewRequired: false };
    }
    return { vatApplies: true, reason: 'standard_taxable_registered', reviewRequired: false };
  }

  return { vatApplies: false, reason: 'unknown_treatment', reviewRequired: true, reviewReason: 'SALE_VAT_APPLICABILITY_UNCERTAIN' };
}
