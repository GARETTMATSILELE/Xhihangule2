import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { LevyPayment } from '../models/LevyPayment';
import { AppError } from '../middleware/errorHandler';
import { findCoveredAdvanceMonth, sumRentalPeriodReservation, sumRentCoverageForPeriod } from './rentalPeriodCoverage';

export type CombinedAllocationResult = {
  rentAllocated: number;
  levyAllocated: number;
  rentUsed: number;
  levyUsed: number;
  hasLevy: boolean;
  monthlyLevy: number;
};

export type CombinedAllocationError = { status: number; message: string };

const cents = (n: number) => Math.round(Number(n || 0) * 100);

/** Effective posted rent for a period. Reversed originals and pending correction drafts are not receipts. */
export async function sumRentPaidForPeriod(params: {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  rentalPeriodMonth: number;
  rentalPeriodYear: number;
  leaseId?: unknown;
  currency?: string;
}): Promise<number> {
  return sumRentCoverageForPeriod(params);
}

/** Sum levy paid for a property period (from LevyPayment collection). */
export async function sumLevyPaidForPeriod(params: {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  levyPeriodMonth: number;
  levyPeriodYear: number;
}): Promise<number> {
  const [agg] = await LevyPayment.aggregate([
    {
      $match: {
        companyId: params.companyId,
        propertyId: params.propertyId,
        levyPeriodYear: params.levyPeriodYear,
        levyPeriodMonth: params.levyPeriodMonth,
        status: { $in: ['pending', 'completed'] },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return Number(agg?.total || 0);
}

export async function loadPropertyCombinedBaselines(propertyId: mongoose.Types.ObjectId): Promise<{
  monthlyRent: number;
  monthlyLevy: number;
  hasLevy: boolean;
}> {
  const property = await Property.findById(propertyId)
    .select('rent levyOrMunicipalType levyOrMunicipalAmount')
    .lean();
  const monthlyRent = Number((property as any)?.rent || 0);
  const isLevy =
    String((property as any)?.levyOrMunicipalType || '').toLowerCase() === 'levy';
  const monthlyLevy = isLevy ? Number((property as any)?.levyOrMunicipalAmount || 0) : 0;
  return { monthlyRent, monthlyLevy, hasLevy: isLevy && monthlyLevy > 0 };
}

/** Levy-first allocation from a cash amount (excluding deposit). */
export function allocateCombinedAmount(
  amount: number,
  levyRemaining: number,
  rentRemaining: number
): { levyAllocated: number; rentAllocated: number } {
  const amountCents = cents(amount);
  const levyRemCents = Math.max(0, cents(levyRemaining));
  const rentRemCents = Math.max(0, cents(rentRemaining));
  const levyAllocatedCents = Math.min(amountCents, levyRemCents);
  const rentAllocatedCents = amountCents - levyAllocatedCents;
  return {
    levyAllocated: levyAllocatedCents / 100,
    rentAllocated: rentAllocatedCents / 100,
  };
}

export async function resolveCombinedRentalAllocation(input: {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  amount: number;
  depositAmount: number;
  rentalPeriodMonth: number;
  rentalPeriodYear: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month?: number; year?: number } | null;
  advancePeriodEnd?: { month?: number; year?: number } | null;
  leaseId?: unknown;
  currency?: string;
  rentUsed?: number;
  levyUsed?: number;
}): Promise<CombinedAllocationResult | CombinedAllocationError> {
  const amountNum = Number(input.amount || 0);
  const depositNum = Number(input.depositAmount || 0);
  const isDepositOnly = amountNum <= 0 && depositNum > 0;
  const advanceMonths = Number(input.advanceMonthsPaid || 1);
  const isAdvance = advanceMonths > 1;

  const baselines = await loadPropertyCombinedBaselines(input.propertyId);
  const rentUsed = Number(input.rentUsed || baselines.monthlyRent || 0);
  const levyUsed = Number(input.levyUsed || baselines.monthlyLevy || 0);

  if (!baselines.hasLevy) {
    if (isDepositOnly) {
      return { rentAllocated: 0, levyAllocated: 0, rentUsed, levyUsed: 0, hasLevy: false, monthlyLevy: 0 };
    }
    return { rentAllocated: amountNum, levyAllocated: 0, rentUsed, levyUsed: 0, hasLevy: false, monthlyLevy: 0 };
  }

  if (isDepositOnly) {
    return { rentAllocated: 0, levyAllocated: 0, rentUsed, levyUsed, hasLevy: true, monthlyLevy: baselines.monthlyLevy };
  }

  if (isAdvance) {
    const coveredAdvance = await findCoveredAdvanceMonth({
      companyId: input.companyId,
      propertyId: input.propertyId,
      tenantId: input.tenantId,
      rentalPeriodMonth: input.rentalPeriodMonth,
      rentalPeriodYear: input.rentalPeriodYear,
      advanceMonthsPaid: advanceMonths,
      advancePeriodStart: input.advancePeriodStart,
      advancePeriodEnd: input.advancePeriodEnd,
      leaseId: input.leaseId,
      currency: input.currency,
    });
    if ('error' in coveredAdvance) {
      return { status: 400, message: coveredAdvance.error };
    }
    if (coveredAdvance.covered) {
      return { status: 409, message: 'Overlapping advance payment already exists for this period.' };
    }
    const expectedRentCents = cents(rentUsed) * advanceMonths;
    const expectedLevyCents = cents(levyUsed) * advanceMonths;
    const expectedTotalCents = expectedRentCents + expectedLevyCents;
    const amountCents = cents(amountNum);
    if (expectedTotalCents > 0 && amountCents !== expectedTotalCents) {
      return {
        status: 400,
        message: `Amount must equal (rent ${rentUsed} + levy ${levyUsed}) x months (${advanceMonths}) = ${(expectedTotalCents / 100).toFixed(2)}`,
      };
    }
    return {
      rentAllocated: expectedRentCents / 100,
      levyAllocated: expectedLevyCents / 100,
      rentUsed,
      levyUsed,
      hasLevy: true,
      monthlyLevy: baselines.monthlyLevy,
    };
  }

  const levyPaid = await sumLevyPaidForPeriod({
    companyId: input.companyId,
    propertyId: input.propertyId,
    levyPeriodMonth: input.rentalPeriodMonth,
    levyPeriodYear: input.rentalPeriodYear,
  });
  const rentPaid = await sumRentalPeriodReservation({
    companyId: input.companyId,
    propertyId: input.propertyId,
    tenantId: input.tenantId,
    rentalPeriodMonth: input.rentalPeriodMonth,
    rentalPeriodYear: input.rentalPeriodYear,
    leaseId: input.leaseId,
    currency: input.currency,
  });

  const levyRemaining = Math.max(0, levyUsed - levyPaid);
  const rentRemaining = Math.max(0, rentUsed - rentPaid);
  const combinedRemaining = levyRemaining + rentRemaining;

  if (combinedRemaining <= 0) {
    return { status: 409, message: 'This month is fully paid (rent and levy). Change rental month.' };
  }

  const amountCents = cents(amountNum);
  if (amountCents > cents(combinedRemaining)) {
    return {
      status: 400,
      message: `Only ${combinedRemaining.toFixed(2)} remains for this month (rent + levy). Enter an amount ≤ remaining.`,
    };
  }

  const { levyAllocated, rentAllocated } = allocateCombinedAmount(amountNum, levyRemaining, rentRemaining);

  if (cents(rentAllocated) > cents(rentRemaining)) {
    return {
      status: 400,
      message: `Only ${rentRemaining.toFixed(2)} rent remains for this month after levy allocation.`,
    };
  }
  if (cents(levyAllocated) > cents(levyRemaining)) {
    return {
      status: 400,
      message: `Only ${levyRemaining.toFixed(2)} levy remains for this month.`,
    };
  }

  return { rentAllocated, levyAllocated, rentUsed, levyUsed, hasLevy: true, monthlyLevy: baselines.monthlyLevy };
}

export async function createLinkedLevyPayment(
  payment: {
    _id: mongoose.Types.ObjectId;
    propertyId: mongoose.Types.ObjectId;
    companyId: mongoose.Types.ObjectId;
    paymentDate: Date;
    paymentMethod: string;
    currency?: string;
    referenceNumber?: string;
    notes?: string;
    processedBy: mongoose.Types.ObjectId;
    levyAllocated: number;
    levyUsed?: number;
    rentalPeriodMonth?: number;
    rentalPeriodYear?: number;
    advanceMonthsPaid?: number;
    advancePeriodStart?: { month: number; year: number };
    advancePeriodEnd?: { month: number; year: number };
  },
  session?: mongoose.ClientSession
): Promise<mongoose.Types.ObjectId | undefined> {
  const levyAmount = Number(payment.levyAllocated || 0);
  if (levyAmount <= 0) return undefined;

  const levyPayment = new LevyPayment({
    paymentType: 'levy',
    propertyId: payment.propertyId,
    companyId: payment.companyId,
    paymentDate: payment.paymentDate,
    paymentMethod: payment.paymentMethod,
    amount: levyAmount,
    referenceNumber: payment.referenceNumber
      ? `${payment.referenceNumber}-LEV`
      : `LEV-${String(payment._id).slice(-6)}`,
    notes: payment.notes
      ? `Linked to rental payment ${payment.referenceNumber || payment._id}. ${payment.notes}`
      : `Linked to rental payment ${payment.referenceNumber || payment._id}`,
    processedBy: payment.processedBy,
    status: 'completed',
    currency: payment.currency || 'USD',
    monthlyLevies: payment.levyUsed,
    levyPeriodMonth: payment.rentalPeriodMonth,
    levyPeriodYear: payment.rentalPeriodYear,
    advanceMonthsPaid: payment.advanceMonthsPaid || 1,
    advancePeriodStart: payment.advancePeriodStart,
    advancePeriodEnd: payment.advancePeriodEnd,
    parentPaymentId: payment._id,
  } as any);

  await levyPayment.save(session ? { session } : undefined);
  return levyPayment._id as mongoose.Types.ObjectId;
}

/**
 * Preserve the original levy and append one contra levy.
 * Original status and notes are not rewritten.
 */
export async function reverseLinkedLevyPayment(
  linkedLevyPaymentId: mongoose.Types.ObjectId | string | undefined,
  reason: string,
  opts?: { session?: mongoose.ClientSession; reversedBy?: string }
): Promise<'reversed' | 'absent'> {
  if (!linkedLevyPaymentId) return 'absent';
  const session = opts?.session;
  const originalQuery = LevyPayment.findById(linkedLevyPaymentId);
  const original = session ? await originalQuery.session(session) : await originalQuery;
  if (!original) {
    throw new AppError('Linked levy payment was not found. The reversal was not invented.', 409);
  }
  const amount = Number(original.amount || 0);
  if (!(amount > 0)) {
    throw new AppError('Linked levy payment has no amount to reverse.', 409);
  }
  const existingQuery = LevyPayment.findOne({ reversalOfLevyPaymentId: original._id });
  const existing = session ? await existingQuery.session(session) : await existingQuery;
  if (existing) {
    if (!original.reversalLevyPaymentId) {
      await LevyPayment.updateOne(
        { _id: original._id },
        {
          $set: {
            reversalLevyPaymentId: existing._id,
            reversedAt: original.reversedAt || new Date(),
            reversalReason: original.reversalReason || reason
          }
        },
        session ? { session } : undefined
      );
    }
    return 'reversed';
  }
  const contra = new LevyPayment({
    paymentType: 'levy',
    propertyId: original.propertyId,
    companyId: original.companyId,
    paymentDate: new Date(),
    paymentMethod: original.paymentMethod,
    amount: -Math.abs(amount),
    referenceNumber: `REV-LEVY-${String(original.referenceNumber || original._id)}`,
    notes: `Reversal of levy ${String(original.referenceNumber || original._id)}. ${reason}`,
    processedBy: opts?.reversedBy && mongoose.Types.ObjectId.isValid(opts.reversedBy)
      ? new mongoose.Types.ObjectId(opts.reversedBy)
      : original.processedBy,
    status: 'completed',
    currency: original.currency || 'USD',
    monthlyLevies: original.monthlyLevies,
    levyPeriodMonth: original.levyPeriodMonth,
    levyPeriodYear: original.levyPeriodYear,
    advanceMonthsPaid: original.advanceMonthsPaid,
    advancePeriodStart: original.advancePeriodStart,
    advancePeriodEnd: original.advancePeriodEnd,
    parentPaymentId: original.parentPaymentId,
    reversalOfLevyPaymentId: original._id
  });
  await contra.save(session ? { session } : undefined);
  await LevyPayment.updateOne(
    { _id: original._id, reversalLevyPaymentId: { $exists: false } },
    {
      $set: {
        reversalLevyPaymentId: contra._id,
        reversedAt: new Date(),
        reversedBy: opts?.reversedBy && mongoose.Types.ObjectId.isValid(opts.reversedBy)
          ? new mongoose.Types.ObjectId(opts.reversedBy)
          : undefined,
        reversalReason: reason
      }
    },
    session ? { session } : undefined
  );
  return 'reversed';
}

/** @deprecated Use reverseLinkedLevyPayment. Kept so older callers do not overwrite levy history. */
export async function voidLinkedLevyPayment(
  linkedLevyPaymentId: mongoose.Types.ObjectId | string | undefined,
  reason: string,
  session?: mongoose.ClientSession
): Promise<void> {
  await reverseLinkedLevyPayment(linkedLevyPaymentId, reason, { session });
}
