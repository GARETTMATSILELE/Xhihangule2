import mongoose from 'mongoose';
import { TaxPeriod, ITaxPeriod } from '../models/TaxPeriod';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { AppError } from '../middleware/errorHandler';
import { findPeriodForDate } from './accountingPeriodService';
import {
  calendarPeriodBounds,
  calendarPeriodKey,
  TAX_PERIOD_TAX_TYPES,
  type TaxPeriodAssignmentStatus,
  type TaxPeriodStatus,
  type TaxPeriodTaxType
} from './tax/taxMetadataTypes';

const CLOSED_STATUSES: TaxPeriodStatus[] = ['FINALIZED', 'LOCKED'];

export function assignmentStatusForExistingPeriod(status: TaxPeriodStatus): TaxPeriodAssignmentStatus {
  return CLOSED_STATUSES.includes(status) ? 'PERIOD_CLOSED' : 'ASSIGNED';
}

function asObjectId(value: string, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new mongoose.Types.ObjectId(value);
}

export type ResolvedTaxPeriod = {
  taxType: TaxPeriodTaxType;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  taxPeriodId: string | null;
  status: TaxPeriodStatus | 'PERIOD_REQUIRED';
  assignmentStatus: TaxPeriodAssignmentStatus;
  accountingPeriodId: string | null;
};

export async function resolveTaxPeriod(input: {
  companyId: string;
  taxType: TaxPeriodTaxType;
  transactionDate: Date;
}): Promise<ResolvedTaxPeriod> {
  const periodKey = calendarPeriodKey(input.transactionDate);
  const bounds = calendarPeriodBounds(periodKey);
  const accounting = await findPeriodForDate(input.companyId, input.transactionDate);
  const existing = await TaxPeriod.findOne({
    companyId: asObjectId(input.companyId, 'companyId'),
    taxType: input.taxType,
    periodKey
  });

  if (!existing) {
    return {
      taxType: input.taxType,
      periodKey,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      taxPeriodId: null,
      status: 'PERIOD_REQUIRED',
      assignmentStatus: 'PERIOD_REQUIRED',
      accountingPeriodId: accounting?._id ? String(accounting._id) : null
    };
  }

  return {
    taxType: input.taxType,
    periodKey,
    periodStart: existing.periodStart,
    periodEnd: existing.periodEnd,
    taxPeriodId: String(existing._id),
    status: existing.status,
    assignmentStatus: assignmentStatusForExistingPeriod(existing.status),
    accountingPeriodId: existing.accountingPeriodId
      ? String(existing.accountingPeriodId)
      : accounting?._id
        ? String(accounting._id)
        : null
  };
}

export async function resolveRelevantTaxPeriods(input: {
  companyId: string;
  taxTypes: TaxPeriodTaxType[];
  transactionDate: Date;
}): Promise<ResolvedTaxPeriod[]> {
  const unique = Array.from(new Set(input.taxTypes));
  return Promise.all(
    unique.map((taxType) => resolveTaxPeriod({ companyId: input.companyId, taxType, transactionDate: input.transactionDate }))
  );
}

export async function assertTaxPeriodsAllowPosting(periods: ResolvedTaxPeriod[]): Promise<void> {
  const closed = periods.find((period) => period.assignmentStatus === 'PERIOD_CLOSED');
  if (closed) {
    throw new AppError(
      `Tax period ${closed.periodKey} (${closed.taxType}) is ${closed.status}. Corrections must use a later open period.`,
      409
    );
  }
}

export async function listTaxPeriods(companyId: string, taxType?: string): Promise<ITaxPeriod[]> {
  const query: Record<string, unknown> = { companyId: asObjectId(companyId, 'companyId') };
  if (taxType && (TAX_PERIOD_TAX_TYPES as readonly string[]).includes(taxType)) query.taxType = taxType;
  return TaxPeriod.find(query).sort({ periodStart: -1, taxType: 1 });
}

export async function openTaxPeriod(input: {
  companyId: string;
  userId: string;
  taxType: TaxPeriodTaxType;
  periodKey: string;
  notes?: string;
}): Promise<ITaxPeriod> {
  if (!(TAX_PERIOD_TAX_TYPES as readonly string[]).includes(input.taxType)) {
    throw new AppError('Invalid taxType', 400);
  }
  if (!/^\d{4}-\d{2}$/.test(input.periodKey)) throw new AppError('periodKey must be YYYY-MM', 400);
  const bounds = calendarPeriodBounds(input.periodKey);
  const accounting = await findPeriodForDate(input.companyId, bounds.periodStart);
  try {
    const created = await TaxPeriod.create({
      companyId: asObjectId(input.companyId, 'companyId'),
      taxType: input.taxType,
      periodKey: input.periodKey,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      status: 'OPEN',
      openedAt: new Date(),
      openedBy: asObjectId(input.userId, 'userId'),
      notes: input.notes,
      accountingPeriodId: accounting?._id || null
    });
    await AccountingEventLog.create({
      companyId: asObjectId(input.companyId, 'companyId'),
      eventType: 'TAX_PERIOD_OPENED',
      sourceModule: 'individual_tax_period',
      sourceId: String(created._id),
      success: true,
      message: `Opened ${input.taxType} ${input.periodKey}`,
      metadata: { taxType: input.taxType, periodKey: input.periodKey }
    });
    return created;
  } catch (error: any) {
    if (error?.code === 11000) throw new AppError('Tax period already exists for that type and month', 409);
    throw error;
  }
}

export async function updateTaxPeriodStatus(input: {
  companyId: string;
  userId: string;
  periodId: string;
  status: TaxPeriodStatus;
  notes?: string;
}): Promise<ITaxPeriod> {
  const row = await TaxPeriod.findOne({
    _id: asObjectId(input.periodId, 'periodId'),
    companyId: asObjectId(input.companyId, 'companyId')
  });
  if (!row) throw new AppError('Tax period not found', 404);
  const before = row.status;
  row.status = input.status;
  if (input.notes !== undefined) row.notes = input.notes;
  if (input.status === 'REVIEW') {
    row.reviewedAt = new Date();
    row.reviewedBy = asObjectId(input.userId, 'userId');
  }
  if (CLOSED_STATUSES.includes(input.status) || input.status === 'FINALIZED') {
    row.closedAt = new Date();
    row.closedBy = asObjectId(input.userId, 'userId');
  }
  await row.save();
  const eventType =
    input.status === 'FINALIZED'
      ? row.taxType === 'VAT'
        ? 'VAT_FINALIZED'
        : row.taxType === 'PRESUMPTIVE_RENTAL_INCOME_TAX'
          ? 'RENTAL_TAX_FINALIZED'
          : row.taxType === 'INCOME_TAX'
            ? 'INCOME_TAX_PERIOD_FINALIZED'
            : 'TAX_PERIOD_FINALIZED'
      : input.status === 'AMENDED'
        ? 'VAT_AMENDED'
        : 'TAX_PERIOD_REVIEWED';
  await AccountingEventLog.create({
    companyId: asObjectId(input.companyId, 'companyId'),
    eventType,
    sourceModule: 'individual_tax_period',
    sourceId: String(row._id),
    success: true,
    message: `Tax period ${row.periodKey} ${before} → ${input.status}`,
    metadata: { before, after: input.status }
  });
  return row;
}
