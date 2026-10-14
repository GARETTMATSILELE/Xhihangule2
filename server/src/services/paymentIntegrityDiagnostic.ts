/**
 * Read-only financial integrity diagnostic.
 * DETECT → REPORT. Never repair, sync, reconstruct, backfill, delete, or merge.
 */
import type { AccountingReconciliationResult } from './paymentAccountingProjection';
import type { LegacyIntroductionContextRisk } from './legacyIntroductionRisk';

export const DUPLICATE_PROJECTION_DETECTED = 'DUPLICATE_PROJECTION_DETECTED';
export const ORPHAN_PROJECTION_DETECTED = 'ORPHAN_PROJECTION_DETECTED';
export const CURRENCY_MISMATCH = 'CURRENCY_MISMATCH';
export const CURRENCY_UNSPECIFIED = 'CURRENCY_UNSPECIFIED';

export type OrphanProjectionFlag = {
  code: typeof ORPHAN_PROJECTION_DETECTED;
  action: 'FLAG';
  projectionType: string;
  projectionId?: string;
  paymentId?: string;
  propertyId?: string;
  amount?: number;
  currency?: string;
};

export type DuplicateProjectionFlag = {
  code: typeof DUPLICATE_PROJECTION_DETECTED;
  projectionType: string;
  paymentId: string;
  count: number;
};

export type CurrencyIntegrityFlag = {
  code: typeof CURRENCY_MISMATCH | typeof CURRENCY_UNSPECIFIED;
  paymentCurrency?: string;
  projectionCurrency?: string;
  action: 'FLAG';
};

export function detectOrphanProjection(input: {
  projectionType: string;
  projectionId?: string;
  paymentId?: string;
  paymentExists: boolean;
  propertyId?: string;
  amount?: number;
  currency?: string;
}): OrphanProjectionFlag | null {
  const paymentId = input.paymentId ? String(input.paymentId) : '';
  if (!paymentId || input.paymentExists) return null;
  return {
    code: ORPHAN_PROJECTION_DETECTED,
    action: 'FLAG',
    projectionType: input.projectionType,
    projectionId: input.projectionId,
    paymentId,
    propertyId: input.propertyId,
    amount: input.amount,
    currency: input.currency
  };
}

export function detectDuplicateProjections(input: {
  paymentId: string;
  projectionType: string;
  count: number;
}): DuplicateProjectionFlag | null {
  if (Number(input.count || 0) <= 1) return null;
  return {
    code: DUPLICATE_PROJECTION_DETECTED,
    projectionType: input.projectionType,
    paymentId: String(input.paymentId),
    count: Number(input.count)
  };
}

export function detectCurrencyMismatch(input: {
  paymentCurrency?: unknown;
  projectionCurrency?: unknown;
}): CurrencyIntegrityFlag | null {
  const paymentCurrency = input.paymentCurrency != null && String(input.paymentCurrency).trim()
    ? String(input.paymentCurrency).trim().toUpperCase()
    : '';
  const projectionCurrency = input.projectionCurrency != null && String(input.projectionCurrency).trim()
    ? String(input.projectionCurrency).trim().toUpperCase()
    : '';
  if (!paymentCurrency) {
    return { code: CURRENCY_UNSPECIFIED, projectionCurrency: projectionCurrency || undefined, action: 'FLAG' };
  }
  if (!projectionCurrency) return null;
  if (paymentCurrency === projectionCurrency) return null;
  return {
    code: CURRENCY_MISMATCH,
    paymentCurrency,
    projectionCurrency,
    action: 'FLAG'
  };
}

export function buildPaymentIntegrityDiagnostic(input: {
  payment: {
    _id?: unknown;
    referenceNumber?: unknown;
    propertyId?: unknown;
    tenantId?: unknown;
    leaseId?: unknown;
    status?: unknown;
    postingStatus?: unknown;
    accountingStatus?: unknown;
    accountingComplete?: unknown;
    currency?: unknown;
  };
  recon: AccountingReconciliationResult;
  legacyIntroductionRisk?: LegacyIntroductionContextRisk | null;
  currencyFlag?: CurrencyIntegrityFlag | null;
}) {
  const payment = input.payment || {};
  return {
    paymentId: String(payment._id || input.recon.paymentId),
    referenceNumber: payment.referenceNumber != null ? String(payment.referenceNumber) : null,
    propertyId: payment.propertyId != null ? String(payment.propertyId) : null,
    tenantId: payment.tenantId != null ? String(payment.tenantId) : null,
    leaseId: payment.leaseId != null ? String(payment.leaseId) : null,
    status: payment.status != null ? String(payment.status) : null,
    postingStatus: payment.postingStatus != null ? String(payment.postingStatus) : null,
    accountingStatus: payment.accountingStatus != null
      ? String(payment.accountingStatus)
      : input.recon.status,
    accountingComplete: Boolean(input.recon.accountingComplete),
    missing: input.recon.missing || [],
    mismatched: input.recon.mismatched || [],
    duplicateProjections: Object.entries(input.recon.actual?.duplicates || {})
      .map(([projectionType, count]) => detectDuplicateProjections({
        paymentId: String(payment._id || input.recon.paymentId),
        projectionType,
        count: Number(count || 0)
      }))
      .filter((row): row is DuplicateProjectionFlag => Boolean(row)),
    legacyIntroductionRisk: input.legacyIntroductionRisk || null,
    currency: input.currencyFlag || null,
    recon: input.recon
  };
}
