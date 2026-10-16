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

export type VatDecisionEvidence = {
  registrationStatus: boolean;
  registrationEffectiveDate: Date | null;
  registrationCancelledAt: Date | null;
  taxClassification: string;
  centralVatRate: number;
  taxRateEffectiveDate: Date | null;
  propertyVatApplicable: boolean;
  treatment: 'inclusive' | 'exclusive' | 'none';
  commissionBase?: number;
  vatAmount?: number;
  reason: string;
};

const asDateOrNull = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export function stampVatDecision<T extends Record<string, any>>(
  snapshot: T,
  policy?: { decision?: VatDecisionEvidence } | null
): T & { vatDecision?: VatDecisionEvidence } {
  if (!snapshot || !policy?.decision) return snapshot;
  return {
    ...snapshot,
    vatDecision: {
      ...policy.decision,
      commissionBase: snapshot.commissionBase ?? policy.decision.commissionBase,
      vatAmount: snapshot.vatAmount ?? snapshot.vatOnCommission ?? policy.decision.vatAmount
    }
  };
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
  decision: VatDecisionEvidence;
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

  const lookedUp = await getVatRateForDate(input.companyId, input.paymentDate).catch(() => ({
    percent: 0,
    decimal: 0,
    source: 'none' as const,
    jurisdiction: undefined,
    taxRateId: undefined,
    effectiveFrom: undefined
  }));
  const applied = applicability.vatApplies && lookedUp.decimal > 0 && lookedUp.source !== 'none';
  const appliedTreatment: 'inclusive' | 'exclusive' | 'none' = !applied
    ? 'none'
    : (treatment === 'COMMISSION_VAT_INCLUSIVE' ? 'inclusive' : 'exclusive');
  const reason = applicability.vatApplies && !applied
    ? 'vat_rate_missing_on_transaction_date'
    : applicability.reason;
  const decision: VatDecisionEvidence = {
    registrationStatus: Boolean(company.vatRegistered),
    registrationEffectiveDate: asDateOrNull(company.vatRegistrationEffectiveDate),
    registrationCancelledAt: asDateOrNull(company.vatRegistrationCancelledAt),
    taxClassification: 'STANDARD_TAXABLE',
    centralVatRate: Number(lookedUp.decimal || 0),
    taxRateEffectiveDate: asDateOrNull(lookedUp.effectiveFrom),
    propertyVatApplicable: Boolean(property.vatOnCommission),
    treatment: appliedTreatment,
    reason
  };

  if (!applicability.vatApplies) {
    return {
      apply: false,
      vatRate: 0,
      treatment: 'NONE',
      reason: applicability.reason,
      reviewRequired: applicability.reviewRequired,
      reviewReason: applicability.reviewReason,
      decision
    };
  }

  if (!applied) {
    return {
      apply: false,
      vatRate: 0,
      treatment: 'NONE',
      reason: 'vat_rate_missing_on_transaction_date',
      reviewRequired: true,
      reviewReason: 'VAT_RATE_MISSING',
      jurisdiction: lookedUp.jurisdiction,
      decision
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
    jurisdiction: lookedUp.jurisdiction,
    decision
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

/**
 * Eligible commission (property flag, company registered on the payment date, central rate)
 * must keep its own VAT snapshot. A zero snapshot is a posting gap. Ineligible commission
 * with a positive VAT snapshot is also a gap. This does not recalculate or rewrite amounts.
 */
export async function commissionVatSnapshotGap(payment: any): Promise<{ code: string; detail: string } | null> {
  if (!payment || payment.reversalOfPaymentId) return null;
  if (String(payment.status || '') !== 'completed' || payment.isProvisional === true) return null;
  const paymentType = String(payment.paymentType || '');
  if (paymentType === 'sale') return null;
  const details = payment.commissionDetails || {};
  const commission = Number(details.commissionNet ?? details.totalCommission ?? 0);
  const vat = Number(details.vatOnCommission ?? details.vatAmount ?? 0);
  if (!(commission > 0) || !payment.propertyId || !payment.companyId) return null;
  const property = await Property.findById(payment.propertyId).select('vatOnCommission vatCommissionTreatment rentalType').lean();
  if (!property || !(property as any).vatOnCommission) {
    if (vat > 0.005) {
      return {
        code: 'VAT_ON_INELIGIBLE_COMMISSION',
        detail: 'VAT on commission is stored on a property that does not have VAT on commission enabled.'
      };
    }
    return null;
  }
  const policy = await resolveCommissionVatPolicy({
    companyId: String(payment.companyId),
    paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
    property,
    requestedVatOnCommission: true,
    requestedTreatment: (property as any).vatCommissionTreatment,
    commissionType: String((property as any).rentalType || '').toLowerCase() === 'introduction' ? 'introduction' : 'management'
  });
  if (!policy.apply) {
    if (vat > 0.005) {
      return {
        code: 'VAT_CHARGED_WHILE_NOT_APPLICABLE',
        detail: `VAT on commission ${vat.toFixed(2)} was stored while applicability is ${policy.reason}.`
      };
    }
    return null;
  }
  if (!(vat > 0.005)) {
    return {
      code: 'MISSING_VAT_ON_ELIGIBLE_COMMISSION',
      detail: 'This payment has commission and VAT on commission is applicable, but the VAT snapshot is missing.'
    };
  }
  return null;
}

export async function loadCgtRates(companyId: string, onDate: Date): Promise<{ cgtRate: number; cgwtRate: number }> {
  const [cgt, cgwt] = await Promise.all([
    getTaxRateForDate(companyId, 'CGT', onDate).catch(() => ({ decimal: 0 })),
    getTaxRateForDate(companyId, 'CGWT', onDate).catch(() => ({ decimal: 0 }))
  ]);
  return { cgtRate: Number(cgt.decimal || 0), cgwtRate: Number(cgwt.decimal || 0) };
}
