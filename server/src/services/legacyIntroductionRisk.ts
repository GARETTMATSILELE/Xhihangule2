/**
 * Detection-only: historical Introduction Payments without leaseId
 * must not be silently assigned to a new lease lifecycle.
 * Never mutates Payments, commissions, owners, trust, or projections.
 */
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { introductionConsumedFromPayments } from './introductionCommissionService';
import { logger } from '../utils/logger';

export const LEGACY_INTRODUCTION_CONTEXT_RISK = 'LEGACY_INTRODUCTION_CONTEXT_RISK';

export type LegacyIntroductionContextRisk = {
  code: typeof LEGACY_INTRODUCTION_CONTEXT_RISK;
  tenantId: string;
  propertyId: string;
  leaseId: string;
  legacyPaymentCount: number;
  legacyIntroductionAmount: number;
  action: 'MANUAL_REVIEW_REQUIRED';
};

function hasLeaseId(value: unknown): boolean {
  if (value == null) return false;
  const text = String(value).trim();
  return text.length > 0 && text !== 'undefined' && text !== 'null';
}

export function detectLegacyIntroductionContextRisk(input: {
  tenantId: string;
  propertyId: string;
  leaseId: string;
  payments: Array<{
    leaseId?: unknown;
    reversalOfPaymentId?: unknown;
    amount?: number;
    depositAmount?: number;
    commissionDetails?: { commissionBase?: number; totalCommission?: number };
  }>;
}): LegacyIntroductionContextRisk | null {
  const tenantId = String(input.tenantId || '');
  const propertyId = String(input.propertyId || '');
  const leaseId = String(input.leaseId || '');
  if (!tenantId || !propertyId || !leaseId) return null;

  const legacyPayments = (input.payments || []).filter((payment) => !hasLeaseId(payment?.leaseId));
  const legacyIntroductionAmount = introductionConsumedFromPayments(legacyPayments);
  const legacyPaymentCount = legacyPayments.filter((payment) => {
    if (payment?.reversalOfPaymentId) return false;
    return Number(payment?.commissionDetails?.totalCommission || 0) > 0
      || Number(payment?.commissionDetails?.commissionBase || 0) > 0;
  }).length;

  if (legacyPaymentCount <= 0 && legacyIntroductionAmount <= 0) return null;

  return {
    code: LEGACY_INTRODUCTION_CONTEXT_RISK,
    tenantId,
    propertyId,
    leaseId,
    legacyPaymentCount: legacyPaymentCount || legacyPayments.length,
    legacyIntroductionAmount,
    action: 'MANUAL_REVIEW_REQUIRED'
  };
}

export async function loadLegacyIntroductionContextRisk(input: {
  companyId: mongoose.Types.ObjectId | string;
  tenantId?: unknown;
  propertyId?: unknown;
  leaseId?: unknown;
}): Promise<LegacyIntroductionContextRisk | null> {
  const tenantId = input.tenantId != null ? String(input.tenantId) : '';
  const propertyId = input.propertyId != null ? String(input.propertyId) : '';
  const leaseId = input.leaseId != null ? String(input.leaseId) : '';
  if (!tenantId || !propertyId || !leaseId) return null;
  if (!mongoose.Types.ObjectId.isValid(tenantId) || !mongoose.Types.ObjectId.isValid(propertyId)) return null;

  const docs = await Payment.find({
    companyId: new mongoose.Types.ObjectId(String(input.companyId)),
    tenantId: new mongoose.Types.ObjectId(tenantId),
    propertyId: new mongoose.Types.ObjectId(propertyId),
    paymentType: { $in: ['rental', 'introduction'] },
    status: 'completed',
    isProvisional: { $ne: true },
    isInSuspense: { $ne: true },
    $or: [{ leaseId: { $exists: false } }, { leaseId: null }]
  })
    .select('leaseId amount depositAmount reversalOfPaymentId commissionDetails.commissionBase commissionDetails.totalCommission')
    .lean();

  const risk = detectLegacyIntroductionContextRisk({
    tenantId,
    propertyId,
    leaseId,
    payments: docs as any[]
  });
  if (risk) {
    logger.warn('Legacy Introduction context risk detected', {
      ...risk,
      action: risk.action
    });
  }
  return risk;
}
