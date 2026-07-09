import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';
import { LevyPayment } from '../models/LevyPayment';

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

/** Sum rent applied for a rental period (uses rentAllocated when present). */
export async function sumRentPaidForPeriod(params: {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  rentalPeriodMonth: number;
  rentalPeriodYear: number;
}): Promise<number> {
  const [agg] = await Payment.aggregate([
    {
      $match: {
        companyId: params.companyId,
        paymentType: 'rental',
        propertyId: params.propertyId,
        tenantId: params.tenantId,
        rentalPeriodYear: params.rentalPeriodYear,
        rentalPeriodMonth: params.rentalPeriodMonth,
        status: { $in: ['pending', 'completed'] },
      },
    },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [
              { $gt: [{ $ifNull: ['$rentAllocated', 0] }, 0] },
              '$rentAllocated',
              '$amount',
            ],
          },
        },
      },
    },
  ]);
  return Number(agg?.total || 0);
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
  const rentPaid = await sumRentPaidForPeriod({
    companyId: input.companyId,
    propertyId: input.propertyId,
    tenantId: input.tenantId,
    rentalPeriodMonth: input.rentalPeriodMonth,
    rentalPeriodYear: input.rentalPeriodYear,
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

/** Void linked levy when a rental payment is reversed. */
export async function voidLinkedLevyPayment(
  linkedLevyPaymentId: mongoose.Types.ObjectId | string | undefined,
  reason: string,
  session?: mongoose.ClientSession
): Promise<void> {
  if (!linkedLevyPaymentId) return;
  await LevyPayment.updateOne(
    { _id: new mongoose.Types.ObjectId(String(linkedLevyPaymentId)) },
    {
      $set: {
        status: 'failed',
        notes: `Voided: ${reason}`,
      },
    },
    session ? { session } : undefined
  );
}
