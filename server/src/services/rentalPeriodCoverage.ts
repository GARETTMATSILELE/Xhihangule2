/**
 * Effective rent already received for a rental period.
 * A reversed original is not an active receipt. A negative REV is not a new receipt.
 * A pending correction draft is not completed rent. An in-progress or incomplete
 * reversal still occupies the period.
 */
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { EventDedupRecord } from '../models/EventDedupRecord';
import { AppError } from '../middleware/errorHandler';

const ACTIVE_STATUSES = new Set(['pending', 'completed', 'paid', 'success']);
export const RENTAL_PERIOD_GUARD_SCOPE = 'rental-period-guard';
/**
 * The lease is renewed while the holder is alive. A crashed process stops renewing,
 * and another request may take the lock only after this expiry.
 * Sixty seconds is longer than the previous 30-second absolute takeover.
 */
export const RENTAL_GUARD_DEFAULTS = {
  leaseMs: 60_000,
  heartbeatMs: 15_000,
  waitMs: 8_000,
};

export type RentCoveragePayment = {
  _id?: unknown;
  amount?: number;
  depositAmount?: number;
  rentAllocated?: number | null;
  rentUsed?: number;
  status?: string;
  postingStatus?: string;
  reversalState?: string;
  reversalPaymentId?: unknown;
  reversalOfPaymentId?: unknown;
  isCorrectionEntry?: boolean;
  referenceNumber?: string;
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month?: number; year?: number };
  advancePeriodEnd?: { month?: number; year?: number };
  leaseId?: unknown;
  currency?: string;
  propertyId?: unknown;
  tenantId?: unknown;
  paymentType?: string;
};

export type RentCoverageOptions = {
  leaseId?: unknown;
  currency?: string;
};

function monthIndex(year?: number, month?: number): number | null {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return y * 12 + m;
}

export function isPendingCorrectionDraft(payment: RentCoveragePayment | null | undefined): boolean {
  if (!payment) return false;
  const status = String(payment.status || '').toLowerCase();
  if (status === 'completed' || status === 'paid' || status === 'success') return false;
  const ref = String(payment.referenceNumber || '');
  const looksLikeCorrection = payment.isCorrectionEntry === true || ref.startsWith('CORR-');
  if (!looksLikeCorrection) return false;
  return status === 'pending' || String(payment.postingStatus || '').toLowerCase() === 'draft';
}

export function countsTowardRentReceipt(
  payment: RentCoveragePayment | null | undefined,
  options: RentCoverageOptions = {}
): boolean {
  if (!payment) return false;
  const status = String(payment.status || '').toLowerCase();
  if (!ACTIVE_STATUSES.has(status)) return false;
  if (payment.reversalOfPaymentId) return false;
  if (Number(payment.amount || 0) < 0) return false;
  if (String(payment.reversalState || '') === 'reversed') return false;
  if (isPendingCorrectionDraft(payment)) return false;
  const amount = Number(payment.amount || 0);
  const deposit = Number(payment.depositAmount || 0);
  if (amount <= 0 && deposit > 0) return false;
  if (options.leaseId && payment.leaseId && String(options.leaseId) !== String(payment.leaseId)) return false;
  if (options.currency && payment.currency && String(options.currency).toUpperCase() !== String(payment.currency).toUpperCase()) {
    return false;
  }
  return true;
}

/** Stored rent allocation when present, including an explicit zero. Otherwise the payment amount. */
export function storedRentPortion(payment: RentCoveragePayment | null | undefined): number {
  if (!payment) return 0;
  if (payment.rentAllocated != null && payment.rentAllocated !== ('' as any)) {
    const allocated = Number(payment.rentAllocated);
    return Number.isFinite(allocated) ? allocated : 0;
  }
  const amount = Number(payment.amount || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function paymentCoversRentalMonth(
  payment: RentCoveragePayment | null | undefined,
  year: number,
  month: number
): boolean {
  if (!payment) return false;
  const target = monthIndex(year, month);
  if (target == null) return false;
  const own = monthIndex(payment.rentalPeriodYear, payment.rentalPeriodMonth);
  if (own != null && own === target) return true;
  const months = Number(payment.advanceMonthsPaid || 1);
  if (months <= 1) return false;
  const start = monthIndex(payment.advancePeriodStart?.year, payment.advancePeriodStart?.month);
  const end = monthIndex(payment.advancePeriodEnd?.year, payment.advancePeriodEnd?.month);
  if (start == null || end == null) return false;
  return target >= Math.min(start, end) && target <= Math.max(start, end);
}

/**
 * Rent this payment contributes to one rental month.
 * Advance payments contribute the monthly rent, not the whole multi-month total, to each covered month.
 */
/**
 * A pending linked correction reserves the rental period so another receipt
 * cannot compete with it. It does not count as rent received.
 * A voided or failed correction releases that reservation.
 */
export function reservesRentalPeriod(
  payment: RentCoveragePayment | null | undefined,
  options: RentCoverageOptions = {}
): boolean {
  if (countsTowardRentReceipt(payment, options)) return true;
  if (!isPendingCorrectionDraft(payment) || !payment) return false;
  if (payment.reversalOfPaymentId) return false;
  if (Number(payment.amount || 0) < 0) return false;
  const amount = Number(payment.amount || 0);
  const deposit = Number(payment.depositAmount || 0);
  if (amount <= 0 && deposit > 0) return false;
  if (options.leaseId && payment.leaseId && String(options.leaseId) !== String(payment.leaseId)) return false;
  if (options.currency && payment.currency && String(options.currency).toUpperCase() !== String(payment.currency).toUpperCase()) {
    return false;
  }
  return true;
}

function monthContribution(
  payment: RentCoveragePayment,
  year: number,
  month: number
): number {
  if (!paymentCoversRentalMonth(payment, year, month)) return 0;
  const months = Number(payment?.advanceMonthsPaid || 1);
  if (months > 1) {
    const monthly = Number(payment?.rentUsed || 0);
    if (monthly > 0) return monthly;
    const portion = storedRentPortion(payment);
    return portion > 0 ? portion / months : 0;
  }
  const portion = storedRentPortion(payment);
  return portion > 0 ? portion : 0;
}

export function coverageForMonth(
  payment: RentCoveragePayment | null | undefined,
  year: number,
  month: number,
  options: RentCoverageOptions = {}
): number {
  if (!countsTowardRentReceipt(payment, options) || !payment) return 0;
  return monthContribution(payment, year, month);
}

/** Rent held against a new receipt: received coverage plus a pending correction reservation. */
export function reservationForMonth(
  payment: RentCoveragePayment | null | undefined,
  year: number,
  month: number,
  options: RentCoverageOptions = {}
): number {
  if (!reservesRentalPeriod(payment, options) || !payment) return 0;
  return monthContribution(payment, year, month);
}

export function sumCoverageForMonth(
  payments: RentCoveragePayment[],
  year: number,
  month: number,
  options: RentCoverageOptions = {}
): number {
  return payments.reduce((sum, payment) => sum + coverageForMonth(payment, year, month, options), 0);
}

const COVERAGE_SELECT = [
  'amount', 'depositAmount', 'rentAllocated', 'rentUsed', 'status', 'postingStatus',
  'reversalState', 'reversalPaymentId', 'reversalOfPaymentId', 'isCorrectionEntry',
  'referenceNumber', 'rentalPeriodMonth', 'rentalPeriodYear', 'advanceMonthsPaid',
  'advancePeriodStart', 'advancePeriodEnd', 'leaseId', 'currency', 'propertyId', 'tenantId', 'paymentType'
].join(' ');

function objectIdOrRaw(value: unknown): unknown {
  const text = String(value || '');
  return mongoose.Types.ObjectId.isValid(text) ? new mongoose.Types.ObjectId(text) : value;
}

type PeriodCoverageParams = {
  companyId: mongoose.Types.ObjectId | string;
  propertyId: mongoose.Types.ObjectId | string;
  tenantId: mongoose.Types.ObjectId | string;
  rentalPeriodMonth: number;
  rentalPeriodYear: number;
  leaseId?: unknown;
  currency?: string;
};

async function loadPeriodPayments(params: PeriodCoverageParams): Promise<RentCoveragePayment[]> {
  const year = Number(params.rentalPeriodYear);
  const month = Number(params.rentalPeriodMonth);
  const payments = await Payment.find({
    companyId: objectIdOrRaw(params.companyId),
    propertyId: objectIdOrRaw(params.propertyId),
    tenantId: objectIdOrRaw(params.tenantId),
    paymentType: 'rental',
    status: { $in: ['pending', 'completed', 'paid', 'success'] },
    $or: [
      { rentalPeriodYear: year, rentalPeriodMonth: month },
      {
        advanceMonthsPaid: { $gt: 1 },
        'advancePeriodStart.year': { $lte: year },
        'advancePeriodEnd.year': { $gte: year }
      }
    ]
  }).select(COVERAGE_SELECT).lean();
  return payments as RentCoveragePayment[];
}

export async function sumRentCoverageForPeriod(params: PeriodCoverageParams): Promise<number> {
  const payments = await loadPeriodPayments(params);
  return sumCoverageForMonth(payments, Number(params.rentalPeriodYear), Number(params.rentalPeriodMonth), {
    leaseId: params.leaseId,
    currency: params.currency
  });
}

export async function sumRentalPeriodReservation(params: PeriodCoverageParams): Promise<number> {
  const year = Number(params.rentalPeriodYear);
  const month = Number(params.rentalPeriodMonth);
  const payments = await loadPeriodPayments(params);
  return payments.reduce(
    (sum, payment) => sum + reservationForMonth(payment, year, month, {
      leaseId: params.leaseId,
      currency: params.currency
    }),
    0
  );
}

export async function coverageByRentalKeys(
  companyId: string,
  keys: Array<{ propertyId: string; tenantId: string; year: number; month: number }>
): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  if (!keys.length) return totals;
  const or = keys.map((key) => ({
    propertyId: objectIdOrRaw(key.propertyId),
    tenantId: objectIdOrRaw(key.tenantId),
    $or: [
      { rentalPeriodYear: Number(key.year), rentalPeriodMonth: Number(key.month) },
      {
        advanceMonthsPaid: { $gt: 1 },
        'advancePeriodStart.year': { $lte: Number(key.year) },
        'advancePeriodEnd.year': { $gte: Number(key.year) }
      }
    ]
  }));
  const payments = await Payment.find({
    companyId: objectIdOrRaw(companyId),
    paymentType: 'rental',
    status: { $in: ['pending', 'completed', 'paid', 'success'] },
    $or: or
  }).select(COVERAGE_SELECT).lean();
  for (const key of keys) {
    const id = `${String(key.propertyId)}:${String(key.tenantId)}:${Number(key.year)}:${Number(key.month)}`;
    const rows = (payments as RentCoveragePayment[]).filter((payment) =>
      String(payment.propertyId) === String(key.propertyId) &&
      String(payment.tenantId) === String(key.tenantId)
    );
    totals[id] = sumCoverageForMonth(rows, Number(key.year), Number(key.month));
  }
  return totals;
}

export type RentalPeriodSlot = { year: number; month: number };

export type RentalGuardIdentity = {
  companyId?: unknown;
  propertyId?: unknown;
  tenantId?: unknown;
  rentalPeriodYear?: unknown;
  rentalPeriodMonth?: unknown;
  advanceMonthsPaid?: unknown;
  advancePeriodStart?: { month?: unknown; year?: unknown } | null;
  advancePeriodEnd?: { month?: unknown; year?: unknown } | null;
  paymentType?: unknown;
  amount?: unknown;
  depositAmount?: unknown;
  /** Accepted so callers can pass them. They are not part of the lock key. */
  leaseId?: unknown;
  currency?: unknown;
};

export type RentalGuardTiming = {
  leaseMs?: number;
  heartbeatMs?: number;
  waitMs?: number;
};

type ResolvedGuardTiming = { leaseMs: number; heartbeatMs: number; waitMs: number };

function fromMonthIndex(index: number): RentalPeriodSlot {
  const month = ((index - 1) % 12) + 1;
  const year = Math.floor((index - 1) / 12);
  return { year, month };
}

/**
 * Months a payment occupies. A missing lease or currency does not change the list.
 * An advance range is the inclusive start through end. The month count must match that span.
 */
export function enumerateRentalMonths(input: RentalGuardIdentity): { months: RentalPeriodSlot[] } | { error: string } {
  const count = Number(input.advanceMonthsPaid ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 36) {
    return { error: 'The rental period range cannot be locked safely.' };
  }
  const startYear = Number(input.advancePeriodStart?.year ?? input.rentalPeriodYear);
  const startMonth = Number(input.advancePeriodStart?.month ?? input.rentalPeriodMonth);
  const start = monthIndex(startYear, startMonth);
  if (start == null) {
    return { error: 'Rental period month and year are required before this payment can be saved.' };
  }
  let end = start;
  const endWasSupplied = input.advancePeriodEnd != null
    && (input.advancePeriodEnd.year != null || input.advancePeriodEnd.month != null);
  if (endWasSupplied) {
    end = monthIndex(Number(input.advancePeriodEnd?.year), Number(input.advancePeriodEnd?.month)) ?? NaN;
    if (!Number.isFinite(end)) return { error: 'The advance end period is not a valid month.' };
  } else if (count > 1) {
    end = start + count - 1;
  }
  if (end < start) return { error: 'The advance period ends before it starts.' };
  const span = end - start + 1;
  if (span !== count) {
    return { error: 'The advance period does not match the number of months being paid.' };
  }
  const months: RentalPeriodSlot[] = [];
  for (let index = start; index <= end; index += 1) months.push(fromMonthIndex(index));
  return { months };
}

/**
 * Lock identity is company, property, tenant, and rental month.
 * Lease and currency stay out of the key so a request that omits either one
 * still shares the lock with a request that includes it.
 * Two known currencies, or two known leases, are not treated as the same receipt.
 * They share this lock and then the coverage query applies the known difference.
 */
export function rentalMonthLockKey(
  companyId: string,
  propertyId: string,
  tenantId: string,
  year: number,
  month: number
): string {
  return `${companyId}:${propertyId}:${tenantId}:${year}:${String(month).padStart(2, '0')}`;
}

function skipsRentalLock(input: RentalGuardIdentity): boolean {
  const paymentType = String(input.paymentType || 'rental').toLowerCase();
  if (paymentType === 'sale') return true;
  const amount = Number(input.amount ?? NaN);
  const deposit = Number(input.depositAmount || 0);
  if (Number.isFinite(amount) && amount <= 0 && deposit > 0) return true;
  const propertyId = String(input.propertyId || '');
  const tenantId = String(input.tenantId || '');
  if (propertyId.startsWith('manual_') || tenantId.startsWith('manual_')) return true;
  return false;
}

export function rentalPeriodGuardKeys(input: RentalGuardIdentity): { keys: string[] } | { error: string } {
  if (skipsRentalLock(input)) return { keys: [] };
  const listed = enumerateRentalMonths(input);
  if ('error' in listed) return listed;
  const companyId = String(input.companyId || '');
  const propertyId = String(input.propertyId || '');
  const tenantId = String(input.tenantId || '');
  if (!companyId || !propertyId || !tenantId) {
    return { error: 'Company, property, and tenant are required before this rental payment can be saved.' };
  }
  return {
    keys: listed.months.map((slot) => rentalMonthLockKey(companyId, propertyId, tenantId, slot.year, slot.month)),
  };
}

/** First month key, or null when this payment does not take a rental lock. */
export function rentalPeriodGuardKey(input: RentalGuardIdentity): string | null {
  const listed = rentalPeriodGuardKeys(input);
  if ('error' in listed || listed.keys.length === 0) return null;
  return listed.keys[0];
}

export async function findCoveredAdvanceMonth(params: {
  companyId: mongoose.Types.ObjectId | string;
  propertyId: mongoose.Types.ObjectId | string;
  tenantId: mongoose.Types.ObjectId | string;
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month?: number; year?: number } | null;
  advancePeriodEnd?: { month?: number; year?: number } | null;
  leaseId?: unknown;
  currency?: string;
}): Promise<{ covered: { year: number; month: number; paid: number } | null } | { error: string }> {
  if (!(Number(params.advanceMonthsPaid || 1) > 1)) return { covered: null };
  const listed = enumerateRentalMonths(params);
  if ('error' in listed) return listed;
  for (const slot of listed.months) {
    const paid = await sumRentalPeriodReservation({
      companyId: params.companyId,
      propertyId: params.propertyId,
      tenantId: params.tenantId,
      rentalPeriodYear: slot.year,
      rentalPeriodMonth: slot.month,
      leaseId: params.leaseId,
      currency: params.currency,
    });
    if (paid > 0.009) return { covered: { year: slot.year, month: slot.month, paid } };
  }
  return { covered: null };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTiming(timing?: RentalGuardTiming): ResolvedGuardTiming {
  return {
    leaseMs: timing?.leaseMs ?? RENTAL_GUARD_DEFAULTS.leaseMs,
    heartbeatMs: timing?.heartbeatMs ?? RENTAL_GUARD_DEFAULTS.heartbeatMs,
    waitMs: timing?.waitMs ?? RENTAL_GUARD_DEFAULTS.waitMs,
  };
}

function isDuplicateKey(error: any): boolean {
  return Number(error?.code) === 11000;
}

function isTransientLockError(error: any): boolean {
  const code = Number(error?.code);
  return code === 16500 || code === 429;
}

function leaseExpiry(leaseMs: number): Date {
  return new Date(Date.now() + leaseMs);
}

/**
 * Single-document ownership. Release deletes only the caller's token.
 * A stale generation is replaced by findOneAndUpdate filtered on that token and an expired lease.
 * MongoDB applies that update to one document atomically. Cosmos DB behaviour is unverified.
 */
function beginOwnedLease(key: string, token: string, timing: ResolvedGuardTiming): () => Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const renew = async () => {
    if (stopped) return;
    const updated = await EventDedupRecord.updateOne(
      { scope: RENTAL_PERIOD_GUARD_SCOPE, eventId: key, ownerToken: token },
      { $set: { processedAt: leaseExpiry(timing.leaseMs) } }
    );
    if (updated.matchedCount === 0) stopped = true;
  };
  if (timing.heartbeatMs > 0) {
    timer = setInterval(() => {
      void renew().catch(() => undefined);
    }, timing.heartbeatMs);
    timer.unref?.();
  }
  return async () => {
    stopped = true;
    if (timer) clearInterval(timer);
    await EventDedupRecord.deleteOne({
      scope: RENTAL_PERIOD_GUARD_SCOPE,
      eventId: key,
      ownerToken: token,
    });
  };
}

async function acquireOneKey(
  key: string,
  timing: ResolvedGuardTiming,
  deadline: number
): Promise<() => Promise<void>> {
  const token = randomBytes(16).toString('hex');
  while (Date.now() < deadline) {
    try {
      await EventDedupRecord.create({
        scope: RENTAL_PERIOD_GUARD_SCOPE,
        eventId: key,
        status: 'processed',
        processedAt: leaseExpiry(timing.leaseMs),
        ownerToken: token,
      });
      return beginOwnedLease(key, token, timing);
    } catch (error: any) {
      if (isTransientLockError(error)) {
        await sleep(40);
        continue;
      }
      if (!isDuplicateKey(error)) throw error;
      const existing = await EventDedupRecord.findOne({
        scope: RENTAL_PERIOD_GUARD_SCOPE,
        eventId: key,
      }).select('ownerToken processedAt').lean();
      if (!existing) continue;
      const expiresAt = new Date((existing as any).processedAt || 0).getTime();
      if (expiresAt > Date.now()) {
        await sleep(40);
        continue;
      }
      const observedToken = String((existing as any).ownerToken || '');
      if (observedToken) {
        const stolen = await EventDedupRecord.findOneAndUpdate(
          {
            scope: RENTAL_PERIOD_GUARD_SCOPE,
            eventId: key,
            ownerToken: observedToken,
            processedAt: { $lte: new Date() },
          },
          {
            $set: {
              ownerToken: token,
              processedAt: leaseExpiry(timing.leaseMs),
              status: 'processed',
            },
          },
          { new: true }
        ).lean();
        if (stolen && String((stolen as any).ownerToken) === token) {
          return beginOwnedLease(key, token, timing);
        }
      } else {
        const removed = await EventDedupRecord.deleteOne({
          scope: RENTAL_PERIOD_GUARD_SCOPE,
          eventId: key,
          processedAt: (existing as any).processedAt,
          $or: [{ ownerToken: { $exists: false } }, { ownerToken: null }, { ownerToken: '' }],
        });
        if (removed.deletedCount === 1) continue;
      }
      await sleep(40);
    }
  }
  throw new AppError('This rental period is being updated. Retry the payment.', 409, 'RENTAL_PERIOD_BUSY');
}

export async function acquireRentalPeriodGuards(
  keys: string[],
  timing?: RentalGuardTiming
): Promise<() => Promise<void>> {
  const resolved = resolveTiming(timing);
  const ordered = [...new Set(keys.filter(Boolean))].sort();
  const releases: Array<() => Promise<void>> = [];
  const releaseAll = async () => {
    for (let index = releases.length - 1; index >= 0; index -= 1) {
      await releases[index]();
    }
    releases.length = 0;
  };
  const deadline = Date.now() + resolved.waitMs;
  try {
    for (const key of ordered) {
      releases.push(await acquireOneKey(key, resolved, deadline));
    }
  } catch (error) {
    await releaseAll();
    throw error;
  }
  return releaseAll;
}

export async function acquireRentalPeriodGuard(
  key: string | null,
  timing?: RentalGuardTiming
): Promise<() => Promise<void>> {
  if (!key) return async () => {};
  return acquireRentalPeriodGuards([key], timing);
}

export async function acquireRentalPeriodGuardsForPayment(
  input: RentalGuardIdentity,
  timing?: RentalGuardTiming
): Promise<() => Promise<void>> {
  const listed = rentalPeriodGuardKeys(input);
  if ('error' in listed) {
    throw new AppError(listed.error, 400, 'RENTAL_PERIOD_REQUIRED');
  }
  return acquireRentalPeriodGuards(listed.keys, timing);
}

export async function withRentalPeriodGuard<T>(
  key: string | null,
  work: () => Promise<T>,
  timing?: RentalGuardTiming
): Promise<T> {
  const release = await acquireRentalPeriodGuard(key, timing);
  try {
    return await work();
  } finally {
    await release();
  }
}

export async function withRentalPeriodGuards<T>(
  keys: string[],
  work: () => Promise<T>,
  timing?: RentalGuardTiming
): Promise<T> {
  const release = await acquireRentalPeriodGuards(keys, timing);
  try {
    return await work();
  } finally {
    await release();
  }
}
