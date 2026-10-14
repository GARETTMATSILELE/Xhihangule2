import mongoose from 'mongoose';
import { AccountingPeriod, AccountingPeriodStatus, IAccountingPeriod } from '../models/AccountingPeriod';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { AppError } from '../middleware/errorHandler';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

export function utcMonthBounds(date = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { periodStart, periodEnd };
}

async function logPeriodEvent(input: {
  companyId: string;
  eventType: string;
  sourceId: string;
  message: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await AccountingEventLog.create({
    companyId: toId(input.companyId),
    eventType: input.eventType,
    sourceModule: 'period',
    sourceId: input.sourceId,
    success: true,
    message: input.message,
    metadata: input.metadata
  });
}

export async function listAccountingPeriods(companyId: string): Promise<IAccountingPeriod[]> {
  return AccountingPeriod.find({ companyId: toId(companyId) }).sort({ periodStart: -1 }).lean() as any;
}

export async function ensureCurrentOpenPeriod(companyId: string): Promise<IAccountingPeriod> {
  const { periodStart, periodEnd } = utcMonthBounds();
  const existing = await AccountingPeriod.findOne({
    companyId: toId(companyId),
    periodStart,
    periodEnd
  });
  if (existing) return existing;
  return AccountingPeriod.create({
    companyId: toId(companyId),
    periodStart,
    periodEnd,
    status: 'OPEN'
  });
}

export async function createAccountingPeriod(input: {
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  createdBy?: string;
}): Promise<IAccountingPeriod> {
  if (!(input.periodEnd > input.periodStart)) {
    throw new AppError('periodEnd must be after periodStart', 400);
  }
  try {
    return await AccountingPeriod.create({
      companyId: toId(input.companyId),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'OPEN'
    });
  } catch (err: any) {
    if (err?.code === 11000) throw new AppError('An accounting period already exists for that range', 409);
    throw err;
  }
}

export async function findPeriodForDate(companyId: string, transactionDate: Date): Promise<IAccountingPeriod | null> {
  return AccountingPeriod.findOne({
    companyId: toId(companyId),
    periodStart: { $lte: transactionDate },
    periodEnd: { $gte: transactionDate }
  });
}

/**
 * If no period document covers the date, posting is allowed (legacy OPEN default).
 * CLOSED rejects. SOFT_CLOSED requires overrideReason.
 */
export async function assertPeriodAllowsPosting(input: {
  companyId: string;
  transactionDate: Date;
  overrideReason?: string;
  actorId?: string;
  sourceModule?: string;
  sourceId?: string;
}): Promise<{ allowed: true; periodStatus: AccountingPeriodStatus | 'UNMANAGED' }> {
  const period = await findPeriodForDate(input.companyId, input.transactionDate);
  if (!period) return { allowed: true, periodStatus: 'UNMANAGED' };
  if (period.status === 'OPEN') return { allowed: true, periodStatus: 'OPEN' };
  if (period.status === 'SOFT_CLOSED') {
    if (!String(input.overrideReason || '').trim()) {
      throw new AppError(
        `Period ${period.periodStart.toISOString().slice(0, 10)} is SOFT_CLOSED. An accountant override reason is required to post.`,
        409
      );
    }
    await logPeriodEvent({
      companyId: input.companyId,
      eventType: 'period_soft_close_override',
      sourceId: String(period._id),
      message: 'Posting override on SOFT_CLOSED period',
      metadata: {
        actorId: input.actorId,
        reason: String(input.overrideReason).trim(),
        sourceModule: input.sourceModule,
        sourceId: input.sourceId,
        before: 'SOFT_CLOSED',
        after: 'SOFT_CLOSED'
      }
    });
    return { allowed: true, periodStatus: 'SOFT_CLOSED' };
  }
  throw new AppError(
    `Period ${period.periodStart.toISOString().slice(0, 10)} is CLOSED. Corrections must use a reversal plus a new posting in an open period.`,
    409
  );
}

export async function closeAccountingPeriod(input: {
  companyId: string;
  periodId: string;
  actorId: string;
  reason: string;
  status: 'SOFT_CLOSED' | 'CLOSED';
}): Promise<IAccountingPeriod> {
  if (!String(input.reason || '').trim()) throw new AppError('A close reason is required', 400);
  const row = await AccountingPeriod.findOne({ _id: input.periodId, companyId: toId(input.companyId) });
  if (!row) throw new AppError('Accounting period not found', 404);
  if (row.status === 'CLOSED' && input.status === 'CLOSED') {
    throw new AppError('Period is already CLOSED', 409);
  }
  const before = row.status;
  row.status = input.status;
  row.closedBy = toId(input.actorId);
  row.closedAt = new Date();
  row.closeReason = String(input.reason).trim();
  await row.save();
  await logPeriodEvent({
    companyId: input.companyId,
    eventType: input.status === 'CLOSED' ? 'period_closed' : 'period_soft_closed',
    sourceId: String(row._id),
    message: `Period ${input.status}`,
    metadata: {
      actorId: input.actorId,
      reason: row.closeReason,
      before,
      after: row.status
    }
  });
  return row;
}

export async function reopenAccountingPeriod(input: {
  companyId: string;
  periodId: string;
  actorId: string;
  reason: string;
}): Promise<IAccountingPeriod> {
  if (!String(input.reason || '').trim()) throw new AppError('A reopen reason is required', 400);
  const row = await AccountingPeriod.findOne({ _id: input.periodId, companyId: toId(input.companyId) });
  if (!row) throw new AppError('Accounting period not found', 404);
  if (row.status === 'OPEN') throw new AppError('Period is already OPEN', 409);
  const before = row.status;
  row.status = 'OPEN';
  row.reopenedBy = toId(input.actorId);
  row.reopenedAt = new Date();
  row.reopenReason = String(input.reason).trim();
  await row.save();
  await logPeriodEvent({
    companyId: input.companyId,
    eventType: 'period_reopened',
    sourceId: String(row._id),
    message: 'Period reopened',
    metadata: {
      actorId: input.actorId,
      reason: row.reopenReason,
      before,
      after: 'OPEN'
    }
  });
  return row;
}
