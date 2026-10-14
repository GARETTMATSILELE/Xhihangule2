import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { getVatRateForDate, getTaxRateForDate } from './taxRateService';
import {
  defaultSupplyTreatment,
  evaluateVatApplicability,
  isCompanyVatRegisteredOnDate,
  type CompanyVatRegistration
} from './tax/vatApplicability';
import type { CommissionVatTreatment, PropertyUseClass, VatSupplyTreatment } from './tax/taxTypes';
import { normalizeVatCommissionTreatment } from './propertyCommissionCalculator';

export function companyVatRegistrationFromDoc(company: any): CompanyVatRegistration {
  const profile = company?.taxProfile || {};
  if (typeof profile.vatRegistered === 'boolean') {
    return {
      vatRegistered: Boolean(profile.vatRegistered),
      vatRegistrationEffectiveDate: profile.vatRegistrationEffectiveDate || null,
      vatRegistrationCancelledAt: profile.vatRegistrationCancelledAt || null
    };
  }
  // Legacy: a VAT number alone is not treated as registration on a date.
  return {
    vatRegistered: false,
    vatRegistrationEffectiveDate: null,
    vatRegistrationCancelledAt: null
  };
}

export async function loadCompanyVatRegistration(companyId: string | undefined): Promise<CompanyVatRegistration> {
  if (!companyId) return { vatRegistered: false };
  const company = await Company.findById(companyId).select('taxProfile vatNumber').lean();
  return companyVatRegistrationFromDoc(company);
}

export async function resolveCommissionVatPolicy(input: {
  companyId: string;
  paymentDate: Date;
  property?: any;
  requestedVatOnCommission?: boolean;
  requestedTreatment?: string | null;
  commissionType?: 'management' | 'introduction';
}): Promise<{
  apply: boolean;
  vatRate: number;
  treatment: CommissionVatTreatment;
  reason: string;
  reviewRequired: boolean;
  reviewReason?: string;
  taxRateId?: string;
  jurisdiction?: string;
}> {
  const property = input.property || {};
  const requested = input.requestedVatOnCommission != null
    ? Boolean(input.requestedVatOnCommission)
    : Boolean(property.vatOnCommission);
  const company = await loadCompanyVatRegistration(input.companyId);
  const applicability = evaluateVatApplicability({
    company,
    transactionDate: input.paymentDate,
    supplyTreatment: 'STANDARD_TAXABLE',
    useClass: 'AGENCY_COMMISSION',
    requested
  });

  let treatment: CommissionVatTreatment = 'NONE';
  if (input.commissionType === 'introduction' && requested) {
    treatment = 'COMMISSION_VAT_INCLUSIVE';
  } else if (requested) {
    const normalized = normalizeVatCommissionTreatment(true, input.requestedTreatment || property.vatCommissionTreatment);
    treatment = normalized === 'inclusive' ? 'COMMISSION_VAT_INCLUSIVE' : 'COMMISSION_VAT_EXCLUSIVE';
  }

  if (!applicability.vatApplies) {
    return {
      apply: false,
      vatRate: 0,
      treatment: 'NONE',
      reason: applicability.reason,
      reviewRequired: applicability.reviewRequired,
      reviewReason: applicability.reviewReason
    };
  }

  const lookedUp = await getVatRateForDate(input.companyId, input.paymentDate);
  if (!(lookedUp.decimal > 0) || lookedUp.source === 'none') {
    return {
      apply: false,
      vatRate: 0,
      treatment: 'NONE',
      reason: 'vat_rate_missing_on_transaction_date',
      reviewRequired: true,
      reviewReason: 'VAT_RATE_MISSING',
      jurisdiction: lookedUp.jurisdiction
    };
  }
  return {
    apply: true,
    vatRate: lookedUp.decimal,
    treatment,
    reason: applicability.reason,
    reviewRequired: applicability.reviewRequired,
    reviewReason: applicability.reviewReason,
    taxRateId: lookedUp.taxRateId,
    jurisdiction: lookedUp.jurisdiction
  };
}

export const VAT_RATE_UNAVAILABLE_CODE = 'VAT_RATE_UNAVAILABLE';
export const VAT_RATE_UNAVAILABLE_MESSAGE = 'No centrally managed VAT rate applies on the payment date. The payment was not saved.';

export function centralVatRateBlock(policy: { reason?: string }): { code: string; message: string } | null {
  if (policy.reason === 'vat_rate_missing_on_transaction_date') {
    return { code: VAT_RATE_UNAVAILABLE_CODE, message: VAT_RATE_UNAVAILABLE_MESSAGE };
  }
  return null;
}

export function commissionVatFlagsFromPolicy(policy: {
  apply: boolean;
  treatment: CommissionVatTreatment;
  vatRate: number;
}): { vatOnCommission: boolean; vatTreatment?: 'inclusive' | 'exclusive'; vatRate: number } {
  if (!policy.apply || policy.treatment === 'NONE') {
    return { vatOnCommission: false, vatRate: 0 };
  }
  return {
    vatOnCommission: true,
    vatTreatment: policy.treatment === 'COMMISSION_VAT_INCLUSIVE' ? 'inclusive' : 'exclusive',
    vatRate: policy.vatRate
  };
}

export async function resolveSaleVatPolicy(input: {
  companyId: string;
  paymentDate: Date;
  property?: any;
  vatIncludedRequested?: boolean;
}): Promise<{
  apply: boolean;
  vatRate: number;
  reason: string;
  reviewRequired: boolean;
  reviewReason?: string;
  supplyTreatment: VatSupplyTreatment;
}> {
  const property = input.property || {};
  const useClass: PropertyUseClass = property.propertyUseClass
    || (String(property.type || '').toLowerCase() === 'commercial' ? 'COMMERCIAL' : 'SALE');
  const supplyTreatment: VatSupplyTreatment = property.saleVatTreatment
    || property.vatSupplyTreatment
    || defaultSupplyTreatment(useClass);
  const company = await loadCompanyVatRegistration(input.companyId);
  const applicability = evaluateVatApplicability({
    company,
    transactionDate: input.paymentDate,
    supplyTreatment,
    useClass,
    requested: input.vatIncludedRequested
  });
  const lookedUp = await getVatRateForDate(input.companyId, input.paymentDate);
  if (applicability.vatApplies && !(lookedUp.decimal > 0)) {
    return {
      apply: false,
      vatRate: 0,
      reason: 'vat_rate_missing_on_transaction_date',
      reviewRequired: true,
      reviewReason: 'VAT_RATE_MISSING',
      supplyTreatment
    };
  }
  return {
    apply: applicability.vatApplies && lookedUp.decimal > 0,
    vatRate: applicability.vatApplies ? lookedUp.decimal : 0,
    reason: applicability.reason,
    reviewRequired: applicability.reviewRequired,
    reviewReason: applicability.reviewReason,
    supplyTreatment
  };
}

export async function loadCgtRates(companyId: string, onDate: Date): Promise<{ cgtRate: number; cgwtRate: number }> {
  const [cgt, cgwt] = await Promise.all([
    getTaxRateForDate(companyId, 'CGT', onDate).catch(() => ({ decimal: 0 })),
    getTaxRateForDate(companyId, 'CGWT', onDate).catch(() => ({ decimal: 0 }))
  ]);
  return { cgtRate: Number(cgt.decimal || 0), cgwtRate: Number(cgwt.decimal || 0) };
}
