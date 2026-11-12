import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { VatRecord } from '../models/VatRecord';
import { getVatRateForDate, getTaxRateForDate } from './taxRateService';
import {
  defaultSupplyTreatment,
  evaluateVatApplicability,
  isCompanyVatRegisteredOnDate,
  type CompanyVatRegistration
} from './tax/vatApplicability';
import type { CommissionVatTreatment, PropertyUseClass, VatSupplyTreatment } from './tax/taxTypes';
import { normalizeVatCommissionTreatment } from './propertyCommissionCalculator';
import { roundMoney } from '../utils/money';

export function companyVatRegistrationFromDoc(company: any): CompanyVatRegistration {
  const profile = company?.taxProfile || {};
  if (typeof profile.vatRegistered === 'boolean') {
    return {
      vatRegistered: Boolean(profile.vatRegistered),
      vatRegistrationEffectiveDate: profile.vatRegistrationEffectiveDate || null,
      vatRegistrationCancelledAt: profile.vatRegistrationCancelledAt || null,
      vatCategory: profile.vatCategory ?? null
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

  const configurationGap = commissionVatConfigurationGap({
    requested,
    vatCategory: company.vatCategory,
    treatment: input.requestedTreatment || property.vatCommissionTreatment
  });
  if (configurationGap) {
    decision.reason = configurationGap.reason;
    decision.treatment = 'none';
    return {
      apply: false,
      vatRate: 0,
      treatment: 'NONE',
      reason: configurationGap.reason,
      reviewRequired: true,
      reviewReason: configurationGap.reviewReason,
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

export function commissionVatConfigurationGap(input: {
  requested: boolean;
  vatCategory?: string | null;
  treatment?: string | null;
}): { reason: 'vat_category_not_configured' | 'vat_treatment_not_configured'; reviewReason: 'VAT_CONFIGURATION_INCOMPLETE' } | null {
  if (!input.requested) return null;
  const category = String(input.vatCategory || '').trim();
  const treatment = String(input.treatment || '').trim().toLowerCase();
  if (!category) {
    return { reason: 'vat_category_not_configured', reviewReason: 'VAT_CONFIGURATION_INCOMPLETE' };
  }
  if (treatment !== 'inclusive' && treatment !== 'exclusive') {
    return { reason: 'vat_treatment_not_configured', reviewReason: 'VAT_CONFIGURATION_INCOMPLETE' };
  }
  return null;
}

export const VAT_RATE_UNAVAILABLE_CODE = 'VAT_RATE_UNAVAILABLE';
export const VAT_RATE_UNAVAILABLE_MESSAGE = 'No centrally managed VAT rate applies on the payment date. The payment was not saved.';

export function centralVatRateBlock(policy: { reason?: string }): { code: string; message: string } | null {
  if (policy.reason === 'vat_rate_missing_on_transaction_date') {
    return { code: VAT_RATE_UNAVAILABLE_CODE, message: VAT_RATE_UNAVAILABLE_MESSAGE };
  }
  return null;
}

/** The payment snapshot rate is authoritative. An absent snapshot rate may use the payment flag. */
export function authoritativeSnapshotVatRate(payment: any): number {
  const details = payment?.commissionDetails || {};
  if (details.vatRate != null && details.vatRate !== '') {
    const snapshot = Number(details.vatRate);
    return Number.isFinite(snapshot) ? snapshot : 0;
  }
  const flagged = Number(payment?.vatOnCommissionRate);
  return Number.isFinite(flagged) ? flagged : 0;
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
export const HISTORICAL_VAT_OBLIGATION_APPROVAL_REQUIRED = 'HISTORICAL_VAT_OBLIGATION_APPROVAL_REQUIRED';
export const HISTORICAL_VAT_JOURNAL_REVIEW_REQUIRED = 'HISTORICAL_VAT_JOURNAL_REVIEW_REQUIRED';
export const HISTORICAL_VAT_RECORD_RATE_UNSUPPORTED = 'HISTORICAL_VAT_RECORD_RATE_UNSUPPORTED';
export const VAT_RECORD_AMOUNT_DISAGREES = 'VAT_RECORD_AMOUNT_DISAGREES';

const CONTEMPORANEOUS_VAT_DECISION = 'standard_taxable_registered';

/**
 * A VAT obligation is created only when the receipt date is eligible under the
 * company registration, VAT category, property flag, and treatment.
 * A stored snapshot amount is not enough. A historical receipt whose own VAT
 * decision does not record that eligibility also needs an explicit accountant
 * approval. This function does not write a snapshot, VAT record, or obligation.
 */
export async function assessVatObligationCreation(input: {
  payment: any;
  approveHistoricalVatObligation?: boolean;
}): Promise<{ create: boolean; reason: string }> {
  const payment = input.payment;
  const vat = Number(payment?.commissionDetails?.vatOnCommission ?? payment?.commissionDetails?.vatAmount ?? 0);
  if (!(vat > 0.005)) return { create: false, reason: 'no_commission_vat' };
  if (!payment?.companyId || !payment?.propertyId) {
    return { create: false, reason: 'vat_context_incomplete' };
  }
  const property = await Property.findById(payment.propertyId)
    .select('vatOnCommission vatCommissionTreatment rentalType')
    .lean();
  const policy = await resolveCommissionVatPolicy({
    companyId: String(payment.companyId),
    paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
    property: property || {},
    requestedVatOnCommission: Boolean((property as any)?.vatOnCommission),
    requestedTreatment: (property as any)?.vatCommissionTreatment,
    commissionType: String((property as any)?.rentalType || payment.paymentType || '').toLowerCase() === 'introduction'
      ? 'introduction'
      : 'management'
  });
  if (!policy.apply) {
    return { create: false, reason: policy.reason || 'vat_not_eligible_on_receipt_date' };
  }
  const decisionReason = String(payment?.commissionDetails?.vatDecision?.reason || '');
  if (decisionReason === CONTEMPORANEOUS_VAT_DECISION) {
    return { create: true, reason: 'receipt_date_eligibility_established' };
  }
  if (input.approveHistoricalVatObligation === true) {
    return { create: true, reason: 'accountant_approved_historical_vat_obligation' };
  }
  return { create: false, reason: HISTORICAL_VAT_OBLIGATION_APPROVAL_REQUIRED };
}

/**
 * A VAT payable journal line needs the same eligibility as an obligation, and
 * the amount must already agree with any VAT record. A snapshot amount is not
 * authority. A stored rate of zero is not replaced by the snapshot rate.
 * This function does not write a journal, VAT record, snapshot, or obligation.
 */
export async function assessVatPayableJournal(input: {
  payment: any;
  approveHistoricalVatObligation?: boolean;
}): Promise<{ recognise: boolean; reason: string; amount: number; rate: number }> {
  const payment = input.payment;
  const snapshotAmount = roundMoney(Number(payment?.commissionDetails?.vatOnCommission ?? payment?.commissionDetails?.vatAmount ?? 0));
  const decision = await assessVatObligationCreation(input);
  if (!decision.create) {
    return { recognise: false, reason: decision.reason || HISTORICAL_VAT_JOURNAL_REVIEW_REQUIRED, amount: 0, rate: 0 };
  }
  const snapshotRate = authoritativeSnapshotVatRate(payment);
  const record = await VatRecord.findOne({
    companyId: payment.companyId,
    transactionId: String(payment._id)
  }).select('vatCollected vatRate').lean();
  if (record) {
    const recordRate = Number((record as any).vatRate);
    const recordAmount = roundMoney(Number((record as any).vatCollected || 0));
    if (!Number.isFinite(recordRate) || recordRate <= 0) {
      return { recognise: false, reason: HISTORICAL_VAT_RECORD_RATE_UNSUPPORTED, amount: 0, rate: 0 };
    }
    if (Math.abs(recordAmount - snapshotAmount) > 0.009 || Math.abs(recordRate - snapshotRate) > 0.0001) {
      return { recognise: false, reason: VAT_RECORD_AMOUNT_DISAGREES, amount: 0, rate: 0 };
    }
    return { recognise: true, reason: decision.reason, amount: recordAmount, rate: recordRate };
  }
  return { recognise: true, reason: decision.reason, amount: snapshotAmount, rate: snapshotRate };
}

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
