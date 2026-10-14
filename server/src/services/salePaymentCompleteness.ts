/**
 * Sale Payment financial completeness.
 * Sale price is Payment.amount (gross). Commission and splits live on Payment.commissionDetails.
 * This module validates; it does not recalculate sale commission formulas.
 */

export const SALE_PAYMENT_INCOMPLETE_CODE = 'SALE_PAYMENT_INCOMPLETE';
export const SALE_PAYMENT_INCOMPLETE_MESSAGE = 'Sale payment is missing required financial data.';
export const WEBHOOK_PAYMENT_TYPE_UNKNOWN_CODE = 'WEBHOOK_PAYMENT_TYPE_UNKNOWN';

export function classifyPropertyFinancialKind(
  rentalType: unknown
): 'rental' | 'sale' | 'unknown' {
  const kind = String(rentalType || '').trim().toLowerCase();
  if (kind === 'management' || kind === 'introduction') return 'rental';
  if (kind === 'sale' || kind === 'sales') return 'sale';
  return 'unknown';
}

const isPresentFiniteNumber = (value: unknown): boolean => {
  if (value == null || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n);
};

export type SalePaymentCompletenessInput = {
  amount?: unknown;
  commissionDetails?: {
    totalCommission?: unknown;
    preaFee?: unknown;
    agentShare?: unknown;
    agencyShare?: unknown;
    agentSplit?: {
      ownerAgentShare?: unknown;
      collaboratorAgentShare?: unknown;
    } | null;
  } | null;
};

export type SalePaymentCompletenessResult =
  | { ok: true; missing: [] }
  | { ok: false; missing: string[] };

export function validateSalePaymentCompleteness(
  input: SalePaymentCompletenessInput
): SalePaymentCompletenessResult {
  const missing: string[] = [];
  const details = input?.commissionDetails || {};

  if (!isPresentFiniteNumber(input?.amount) || Number(input.amount) <= 0) {
    missing.push('salePrice');
  }

  if (!isPresentFiniteNumber(details.totalCommission) || Number(details.totalCommission) <= 0) {
    missing.push('commissionDetails.totalCommission');
  }

  if (!isPresentFiniteNumber(details.agentShare) || Number(details.agentShare) < 0) {
    missing.push('commissionDetails.agentShare');
  }

  if (!isPresentFiniteNumber(details.agencyShare) || Number(details.agencyShare) < 0) {
    missing.push('commissionDetails.agencyShare');
  }

  const total = Number(details.totalCommission);
  const agentShare = Number(details.agentShare);
  const agencyShare = Number(details.agencyShare);
  if (
    Number.isFinite(total) &&
    total > 0 &&
    Number.isFinite(agentShare) &&
    Number.isFinite(agencyShare) &&
    agentShare === 0 &&
    agencyShare === 0
  ) {
    if (!missing.includes('commissionDetails.agentShare')) missing.push('commissionDetails.agentShare');
    if (!missing.includes('commissionDetails.agencyShare')) missing.push('commissionDetails.agencyShare');
  }

  const split = details.agentSplit;
  if (split && typeof split === 'object') {
    if (!isPresentFiniteNumber(split.ownerAgentShare) || Number(split.ownerAgentShare) < 0) {
      missing.push('commissionDetails.agentSplit.ownerAgentShare');
    }
    if (!isPresentFiniteNumber(split.collaboratorAgentShare) || Number(split.collaboratorAgentShare) < 0) {
      missing.push('commissionDetails.agentSplit.collaboratorAgentShare');
    }
  }

  if (missing.length) {
    return { ok: false, missing };
  }
  return { ok: true, missing: [] };
}

export function salePaymentIncompleteResponse(missing: string[]) {
  return {
    status: 'error' as const,
    success: false as const,
    code: SALE_PAYMENT_INCOMPLETE_CODE,
    message: SALE_PAYMENT_INCOMPLETE_MESSAGE,
    missing: [...missing]
  };
}
