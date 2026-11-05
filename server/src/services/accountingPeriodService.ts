import mongoose from 'mongoose';
import { AccountingPeriod, AccountingPeriodStatus, IAccountingPeriod } from '../models/AccountingPeriod';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { AppError } from '../middleware/errorHandler';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

export function calendarPeriodIdentity(start: Date, end: Date): { financialYear: number; period: number } {
  return {
    financialYear: start.getUTCFullYear(),
    period: start.getUTCMonth() + 1
  };
}

export type PeriodPostingDecision = {
  allowed: boolean;
  periodStatus: AccountingPeriodStatus | 'UNMANAGED';
  code: 'OPEN' | 'SOFT_CLOSED_OVERRIDE' | 'PERIOD_SOFT_CLOSED' | 'PERIOD_CLOSED' | 'PERIOD_NOT_ESTABLISHED';
};

/** A missing period is not open. Only an explicit OPEN document allows ordinary posting. */
export function decidePeriodPosting(status: AccountingPeriodStatus | null, overrideReason?: string): PeriodPostingDecision {
  if (!status) return { allowed: false, periodStatus: 'UNMANAGED', code: 'PERIOD_NOT_ESTABLISHED' };
  if (status === 'OPEN') return { allowed: true, periodStatus: 'OPEN', code: 'OPEN' };
  if (status === 'CLOSED') return { allowed: false, periodStatus: 'CLOSED', code: 'PERIOD_CLOSED' };
  if (!String(overrideReason || '').trim()) {
    return { allowed: false, periodStatus: 'SOFT_CLOSED', code: 'PERIOD_SOFT_CLOSED' };
  }
  return { allowed: true, periodStatus: 'SOFT_CLOSED', code: 'SOFT_CLOSED_OVERRIDE' };
}

export function previewAccountingPeriod(financialYear: number, month: number): {
  financialYear: number;
  month: number;
  periodStart: Date;
  periodEnd: Date;
} {
  if (!Number.isInteger(financialYear) || financialYear < 1900 || financialYear > 2100) {
    throw new AppError('A financial year is required', 400, 'PERIOD_YEAR_REQUIRED');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError('A calendar month from 1 to 12 is required', 400, 'PERIOD_MONTH_REQUIRED');
  }
  const periodStart = new Date(Date.UTC(financialYear, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(financialYear, month, 0, 23, 59, 59, 999));
  return { financialYear, month, periodStart, periodEnd };
}

export function assertPeriodActivationConfirmed(confirmed: unknown): void {
  if (confirmed !== true) {
    throw new AppError(
      'Explicit confirmation is required before an accounting period can be opened.',
      400,
      'PERIOD_CONFIRMATION_REQUIRED'
    );
  }
}

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

export async function openExplicitPeriodForDate(input: {
  companyId: string;
  date: Date;
  createdBy?: string;
}): Promise<IAccountingPeriod> {
  const { periodStart, periodEnd } = utcMonthBounds(input.date);
  const existing = await AccountingPeriod.findOne({
    companyId: toId(input.companyId),
    periodStart,
    periodEnd
  });
  if (existing) return existing;
  return createAccountingPeriod({
    companyId: input.companyId,
    periodStart,
    periodEnd,
    createdBy: input.createdBy
  });
}

export async function ensureCurrentOpenPeriod(companyId: string): Promise<IAccountingPeriod | null> {
  const { periodStart, periodEnd } = utcMonthBounds();
  return AccountingPeriod.findOne({
    companyId: toId(companyId),
    periodStart,
    periodEnd
  });
}

export type PeriodActivationResult = {
  period: IAccountingPeriod;
  created: boolean;
  alreadyExisted: boolean;
};

let periodIndexReady = false;

export async function ensurePeriodIdentityIndex(): Promise<void> {
  if (periodIndexReady) return;
  try {
    await AccountingPeriod.collection.createIndex(
      { companyId: 1, financialYear: 1, month: 1 },
      { unique: true, name: 'company_financial_year_month_unique' }
    );
    periodIndexReady = true;
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.code === 85 || error?.code === 86 || /already exists/i.test(message)) {
      periodIndexReady = true;
      return;
    }
    throw new AppError(
      'The accounting period identity index is not available. The period was not created.',
      503,
      'PERIOD_INDEX_UNAVAILABLE'
    );
  }
}

async function existingPeriodForIdentity(companyId: string, financialYear: number, month: number): Promise<IAccountingPeriod | null> {
  return AccountingPeriod.findOne({
    companyId: toId(companyId),
    financialYear,
    month
  });
}

async function insertOpenPeriod(input: {
  companyId: string;
  financialYear: number;
  month: number;
  periodStart: Date;
  periodEnd: Date;
  createdBy?: string;
}): Promise<PeriodActivationResult> {
  await ensurePeriodIdentityIndex();
  const sameCompany = await AccountingPeriod.find({ companyId: toId(input.companyId) })
    .select('periodStart periodEnd financialYear month')
    .lean();
  const overlap = sameCompany.find((row) => (
    !(row.financialYear === input.financialYear && row.month === input.month)
    && rangesOverlap(input.periodStart, input.periodEnd, new Date(row.periodStart), new Date(row.periodEnd))
  ));
  if (overlap) throw new AppError('Accounting periods for a company cannot overlap', 409, 'PERIOD_OVERLAP');
  const held = await existingPeriodForIdentity(input.companyId, input.financialYear, input.month);
  if (held) return { period: held, created: false, alreadyExisted: true };
  try {
    const created = await AccountingPeriod.create({
      companyId: toId(input.companyId),
      financialYear: input.financialYear,
      month: input.month,
      period: input.month,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      startDate: input.periodStart,
      endDate: input.periodEnd,
      status: 'OPEN',
      createdBy: input.createdBy ? toId(input.createdBy) : undefined
    });
    await logPeriodEvent({
      companyId: input.companyId,
      eventType: 'period_created',
      sourceId: String(created._id),
      message: 'Period opened explicitly',
      metadata: {
        actorId: input.createdBy,
        financialYear: input.financialYear,
        period: input.month,
        before: null,
        after: 'OPEN'
      }
    });
    return { period: created, created: true, alreadyExisted: false };
  } catch (err: any) {
    if (err?.code === 11000) {
      const existing = await existingPeriodForIdentity(input.companyId, input.financialYear, input.month);
      if (existing) return { period: existing, created: false, alreadyExisted: true };
      throw new AppError('An accounting period already exists for that company and month', 409, 'PERIOD_ALREADY_EXISTS');
    }
    throw err;
  }
}

export async function activateAccountingPeriod(input: {
  companyId: string;
  financialYear: number;
  month: number;
  createdBy: string;
  confirmed: boolean;
}): Promise<PeriodActivationResult> {
  assertPeriodActivationConfirmed(input.confirmed);
  const preview = previewAccountingPeriod(input.financialYear, input.month);
  return insertOpenPeriod({
    companyId: input.companyId,
    financialYear: preview.financialYear,
    month: preview.month,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    createdBy: input.createdBy
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
  const identity = calendarPeriodIdentity(input.periodStart, input.periodEnd);
  const result = await insertOpenPeriod({
    companyId: input.companyId,
    financialYear: identity.financialYear,
    month: identity.period,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    createdBy: input.createdBy
  });
  return result.period;
}

export async function findPeriodForDate(companyId: string, transactionDate: Date): Promise<IAccountingPeriod | null> {
  return AccountingPeriod.findOne({
    companyId: toId(companyId),
    periodStart: { $lte: transactionDate },
    periodEnd: { $gte: transactionDate }
  });
}

/**
 * A missing period is not open. CLOSED rejects. SOFT_CLOSED requires an authorised reason.
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
  const decision = decidePeriodPosting(period?.status || null, input.overrideReason);
  if (!decision.allowed) {
    const message = decision.code === 'PERIOD_NOT_ESTABLISHED'
      ? 'No accounting period covers this date. A missing period is not open. Create an OPEN period for this company before posting.'
      : decision.code === 'PERIOD_SOFT_CLOSED'
        ? `Period ${period?.periodStart.toISOString().slice(0, 10)} is SOFT_CLOSED. An accountant override reason is required to post.`
        : `Period ${period?.periodStart.toISOString().slice(0, 10)} is CLOSED. Corrections must use a reversal plus a new posting in an open period.`;
    throw new AppError(message, 409, decision.code);
  }
  if (decision.code === 'SOFT_CLOSED_OVERRIDE' && period) {
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
  }
  return { allowed: true, periodStatus: decision.periodStatus };
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
  row.reopeningReason = row.reopenReason;
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
