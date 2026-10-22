/**
 * Introduction rental commission is one month's applicable rent, collected once per
 * tenant + property + lease. Subsequent rental goes to the owner.
 * Levy and deposit never satisfy Introduction.
 * When VAT is enabled, it is extracted from the one-month amount (inclusive), never added on top.
 */
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { CommissionService, applyLevyPassThroughToSnapshot } from './commissionService';
import { calculatePropertyCommission, type PropertyCommissionResult } from './propertyCommissionCalculator';
import { roundMoney } from '../utils/money';
import {
  introductionTargetFromLease,
  resolveIntroductionLeaseContext,
  type IntroductionContextError,
  type IntroductionContextOk
} from './introductionLeaseContext';

export type IntroductionAllocation = {
  oneMonthRent: number;
  alreadyConsumed: number;
  remainingBefore: number;
  introThisPayment: number;
  ownerRent: number;
  levyAllocated: number;
  remainingAfter: number;
  satisfied: boolean;
};

export type IntroductionLifecycleState = {
  tenantId: string;
  propertyId: string;
  leaseId: string;
  introductionTarget: number;
  introductionConsumed: number;
  introductionRemaining: number;
  vatEnabled: boolean;
  vatRate?: number;
  satisfied: boolean;
};

export function computeIntroductionAllocation(input: {
  rentAllocated: number;
  levyAllocated?: number;
  oneMonthRent: number;
  alreadyConsumed?: number;
}): IntroductionAllocation {
  const oneMonthRent = roundMoney(Math.max(0, Number(input.oneMonthRent || 0)));
  const rentAllocated = roundMoney(Math.max(0, Number(input.rentAllocated || 0)));
  const levyAllocated = roundMoney(Math.max(0, Number(input.levyAllocated || 0)));
  const alreadyConsumed = roundMoney(Math.max(0, Number(input.alreadyConsumed || 0)));
  const remainingBefore = roundMoney(Math.max(0, oneMonthRent - alreadyConsumed));
  const introThisPayment = roundMoney(Math.min(rentAllocated, remainingBefore));
  const ownerRent = roundMoney(Math.max(0, rentAllocated - introThisPayment));
  const remainingAfter = roundMoney(Math.max(0, remainingBefore - introThisPayment));
  return {
    oneMonthRent,
    alreadyConsumed,
    remainingBefore,
    introThisPayment,
    ownerRent,
    levyAllocated,
    remainingAfter,
    satisfied: remainingAfter <= 0 && oneMonthRent > 0
  };
}

export function introductionAllocationReconciles(input: {
  amount: number;
  depositAmount?: number;
  introThisPayment: number;
  ownerRent: number;
  levyAllocated?: number;
}): boolean {
  const amount = roundMoney(Number(input.amount || 0));
  const intro = roundMoney(Number(input.introThisPayment || 0));
  const ownerRent = roundMoney(Number(input.ownerRent || 0));
  const levy = roundMoney(Number(input.levyAllocated || 0));
  return roundMoney(intro + ownerRent + levy) === amount;
}

/** Rent already consumed as introduction commission from existing Payment snapshots. */
export function introductionConsumedFromPayments(payments: Array<{
  amount?: number;
  depositAmount?: number;
  reversalOfPaymentId?: unknown;
  commissionDetails?: { commissionBase?: number; totalCommission?: number };
}>): number {
  let consumed = 0;
  for (const payment of payments || []) {
    if (payment?.reversalOfPaymentId) continue;
    if (String((payment as any)?.reversalState || '') === 'reversed') continue;
    if (Number(payment?.amount || 0) < 0) continue;
    const deposit = Number(payment?.depositAmount || 0);
    const amount = Number(payment?.amount || 0);
    if (deposit > 0 && amount <= 0) continue;
    const total = Number(payment?.commissionDetails?.totalCommission || 0);
    const base = Number(payment?.commissionDetails?.commissionBase || 0);
    if (total > 0 && base > 0) consumed += base;
  }
  return roundMoney(consumed);
}

export function deriveIntroductionState(input: {
  tenantId: string;
  propertyId: string;
  leaseId: string;
  introductionTarget: number;
  payments: Array<{
    amount?: number;
    depositAmount?: number;
    reversalOfPaymentId?: unknown;
    commissionDetails?: { commissionBase?: number; totalCommission?: number };
  }>;
  vatEnabled?: boolean;
  vatRate?: number;
}): IntroductionLifecycleState {
  const introductionTarget = roundMoney(Math.max(0, Number(input.introductionTarget || 0)));
  const introductionConsumed = introductionConsumedFromPayments(input.payments);
  const introductionRemaining = roundMoney(Math.max(0, introductionTarget - introductionConsumed));
  return {
    tenantId: String(input.tenantId),
    propertyId: String(input.propertyId),
    leaseId: String(input.leaseId),
    introductionTarget,
    introductionConsumed,
    introductionRemaining,
    vatEnabled: Boolean(input.vatEnabled),
    vatRate: input.vatRate,
    satisfied: introductionRemaining <= 0 && introductionTarget > 0
  };
}

export async function loadIntroductionConsumedRent(input: {
  companyId: mongoose.Types.ObjectId | string;
  propertyId: mongoose.Types.ObjectId | string;
  tenantId: mongoose.Types.ObjectId | string;
  leaseId: mongoose.Types.ObjectId | string;
  excludePaymentId?: mongoose.Types.ObjectId | string;
}): Promise<number> {
  const filter: Record<string, unknown> = {
    companyId: new mongoose.Types.ObjectId(String(input.companyId)),
    propertyId: new mongoose.Types.ObjectId(String(input.propertyId)),
    tenantId: new mongoose.Types.ObjectId(String(input.tenantId)),
    leaseId: new mongoose.Types.ObjectId(String(input.leaseId)),
    paymentType: { $in: ['rental', 'introduction'] },
    status: 'completed',
    isProvisional: { $ne: true },
    isInSuspense: { $ne: true }
  };
  if (input.excludePaymentId && mongoose.Types.ObjectId.isValid(String(input.excludePaymentId))) {
    filter._id = { $ne: new mongoose.Types.ObjectId(String(input.excludePaymentId)) };
  }
  const docs = await Payment.find(filter)
    .select('amount depositAmount reversalOfPaymentId commissionDetails.commissionBase commissionDetails.totalCommission')
    .lean();
  return introductionConsumedFromPayments(docs as any[]);
}

export function snapshotFromIntroductionAllocation(
  allocation: IntroductionAllocation,
  vat: {
    vatOnCommission?: boolean;
    vatTreatment?: 'inclusive' | 'exclusive' | null;
    vatRate?: number;
    preaPercentOfTotal?: number;
    agentPercentOfRemaining?: number;
    agencyPercentOfRemaining?: number;
  } = {}
): PropertyCommissionResult {
  return calculatePropertyCommission({
    grossRent: allocation.introThisPayment,
    levy: 0,
    commissionPercentage: allocation.introThisPayment > 0 ? 100 : 0,
    vatOnCommission: Boolean(vat.vatOnCommission),
    vatTreatment: vat.vatTreatment,
    vatRate: vat.vatRate,
    preaPercentOfTotal: vat.preaPercentOfTotal,
    agentPercentOfRemaining: vat.agentPercentOfRemaining,
    agencyPercentOfRemaining: vat.agencyPercentOfRemaining,
    commissionType: 'introduction'
  });
}

export function applyIntroductionOwnerRemainder(
  result: PropertyCommissionResult,
  allocation: IntroductionAllocation
) {
  const snapshot = applyLevyPassThroughToSnapshot(
    result,
    allocation.introThisPayment + allocation.ownerRent,
    allocation.levyAllocated
  );
  snapshot.ownerAmount = roundMoney(allocation.ownerRent + allocation.levyAllocated);
  return snapshot;
}

export async function buildIntroductionRentalCommission(input: {
  companyId: mongoose.Types.ObjectId | string;
  propertyId: mongoose.Types.ObjectId | string;
  tenantId: mongoose.Types.ObjectId | string;
  leaseId: mongoose.Types.ObjectId | string;
  rentAllocated: number;
  levyAllocated?: number;
  oneMonthRent: number;
  vatOnCommission?: boolean;
  vatTreatment?: 'inclusive' | 'exclusive' | null;
  vatRate?: number;
  paymentDate?: Date;
  excludePaymentId?: mongoose.Types.ObjectId | string;
}): Promise<{
  allocation: IntroductionAllocation;
  snapshot: ReturnType<typeof applyLevyPassThroughToSnapshot>;
  result: PropertyCommissionResult;
}> {
  const alreadyConsumed = await loadIntroductionConsumedRent(input);
  const allocation = computeIntroductionAllocation({
    rentAllocated: input.rentAllocated,
    levyAllocated: input.levyAllocated,
    oneMonthRent: input.oneMonthRent,
    alreadyConsumed
  });
  const result = await CommissionService.calculateForProperty({
    companyId: input.companyId,
    grossRent: allocation.introThisPayment,
    levy: 0,
    commissionPercentage: allocation.introThisPayment > 0 ? 100 : 0,
    vatOnCommission: input.vatOnCommission,
    vatTreatment: input.vatTreatment,
    vatRate: input.vatRate,
    paymentDate: input.paymentDate,
    commissionType: 'introduction'
  });
  const snapshot = applyIntroductionOwnerRemainder(result, allocation);
  return { allocation, snapshot, result };
}

export async function prepareIntroductionRentalCommission(input: {
  companyId: mongoose.Types.ObjectId | string;
  tenantId?: unknown;
  propertyId?: unknown;
  leaseId?: unknown;
  rentAllocated: number;
  levyAllocated?: number;
  vatOnCommission?: boolean;
  vatTreatment?: 'inclusive' | 'exclusive' | null;
  vatRate?: number;
  paymentDate?: Date;
  excludePaymentId?: mongoose.Types.ObjectId | string;
  propertyRent?: number;
  rentUsed?: number;
}): Promise<
  | { ok: true; context: IntroductionContextOk; allocation: IntroductionAllocation; snapshot: ReturnType<typeof applyLevyPassThroughToSnapshot>; result: PropertyCommissionResult; oneMonthRent: number }
  | IntroductionContextError
  | { ok: false; code: 'INTRODUCTION_RENT_UNDETERMINED'; message: string; missing: string[] }
> {
  const context = await resolveIntroductionLeaseContext(input);
  if (!context.ok) return context;
  const oneMonthRent = roundMoney(
    Number(input.rentUsed || 0) > 0
      ? Number(input.rentUsed)
      : introductionTargetFromLease(context.lease, { rent: input.propertyRent })
  );
  if (!(oneMonthRent > 0) && Number(input.rentAllocated || 0) > 0) {
    return {
      ok: false,
      code: 'INTRODUCTION_RENT_UNDETERMINED',
      message: 'Introduction commission cannot be determined because one month\'s rent is missing or zero.',
      missing: ['lease.rentAmount']
    };
  }
  const built = await buildIntroductionRentalCommission({
    companyId: input.companyId,
    propertyId: context.propertyId,
    tenantId: context.tenantId,
    leaseId: context.leaseId,
    rentAllocated: input.rentAllocated,
    levyAllocated: input.levyAllocated,
    oneMonthRent,
    vatOnCommission: input.vatOnCommission,
    vatTreatment: input.vatTreatment,
    vatRate: input.vatRate,
    paymentDate: input.paymentDate,
    excludePaymentId: input.excludePaymentId
  });
  try {
    const { loadLegacyIntroductionContextRisk } = await import('./legacyIntroductionRisk');
    await loadLegacyIntroductionContextRisk({
      companyId: input.companyId,
      tenantId: context.tenantId,
      propertyId: context.propertyId,
      leaseId: context.leaseId
    });
  } catch {
    // Detection must never block Introduction calculation.
  }
  return { ok: true, context, ...built, oneMonthRent };
}
