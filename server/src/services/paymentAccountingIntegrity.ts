/**
 * Read-only accounting watchdog.
 *
 * Financial ledger writers are intentionally not imported here.
 * This module may persist diagnostic integrity flags and exception rows only.
 */
import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { Payment } from '../models/Payment';
import PropertyAccount from '../models/PropertyAccount';
import { AgentAccount } from '../models/AgentAccount';
import { CompanyAccount } from '../models/CompanyAccount';
import { JournalEntry } from '../models/JournalEntry';
import { VatRecord } from '../models/VatRecord';
import { RentalDeposit } from '../models/rentalDeposit';
import { AccountingException } from '../models/AccountingException';
import { PAYMENT_RECONCILIATION_BATCH_SIZE } from './paymentReconciliationQuery';
import { buildAccountingIntegrityCandidateFilter } from './paymentAccountingProjection';
import {
  applyReconciliationOutcome,
  reconcilePayment
} from './paymentAccountingReconciliation';

function asObjectId(value: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function paymentIdFromJournalSource(sourceId: string): string {
  return String(sourceId || '').split(':')[0];
}

async function paymentExists(paymentId: string): Promise<boolean> {
  const oid = asObjectId(paymentId);
  if (!oid) return false;
  const hit = await Payment.findById(oid).select('_id').lean();
  return Boolean(hit);
}

async function flagOrphan(input: {
  ledger: 'property' | 'agent' | 'company' | 'journal' | 'vat' | 'deposit';
  paymentId: string;
  companyId?: string;
  propertyId?: string;
  accountId?: string;
  transactionId?: string;
  collection: string;
}): Promise<void> {
  const now = new Date();
  const oid = asObjectId(input.paymentId);
  await AccountingException.updateOne(
    {
      kind: 'orphan_accounting',
      ledger: input.ledger,
      'accountingRef.accountId': input.accountId || '',
      'accountingRef.transactionId': input.transactionId || input.paymentId
    },
    {
      $set: {
        status: 'open',
        paymentId: oid || undefined,
        companyId: input.companyId && mongoose.Types.ObjectId.isValid(input.companyId)
          ? new mongoose.Types.ObjectId(input.companyId)
          : undefined,
        propertyId: input.propertyId && mongoose.Types.ObjectId.isValid(input.propertyId)
          ? new mongoose.Types.ObjectId(input.propertyId)
          : undefined,
        error: `accounting record has no source Payment (${input.paymentId})`,
        lastCheckedAt: now,
        issueType: 'orphaned',
        component: input.ledger,
        expected: 'Source Payment missing',
        actual: 'Accounting record exists',
        accountingRef: {
          collection: input.collection,
          accountId: input.accountId,
          transactionId: input.transactionId || input.paymentId
        }
      },
      $setOnInsert: {
        kind: 'orphan_accounting',
        ledger: input.ledger,
        issueType: 'orphaned',
        detectedAt: now
      }
    },
    { upsert: true }
  );
}

/**
 * Windowed orphan scan. Does not scan the entire accounting corpus.
 * Recent accounts/journals only (ORPHAN_SCAN_WINDOW_HOURS). Never deletes orphans.
 */
export const ORPHAN_SCAN_WINDOW_HOURS = 48;
export async function detectOrphanAccountingRecords(limit = 50): Promise<{ scanned: number; flagged: number }> {
  const stats = { scanned: 0, flagged: 0 };
  const since = new Date(Date.now() - ORPHAN_SCAN_WINDOW_HOURS * 60 * 60 * 1000);
  const max = Math.max(1, Math.min(limit, PAYMENT_RECONCILIATION_BATCH_SIZE));

  const propertyRows = await PropertyAccount.find({
    lastUpdated: { $gte: since },
    isArchived: { $ne: true }
  }).select('_id propertyId transactions.paymentId transactions._id').limit(max).lean();

  for (const account of propertyRows as any[]) {
    for (const tx of account.transactions || []) {
      const pid = tx?.paymentId ? String(tx.paymentId) : '';
      if (!pid) continue;
      stats.scanned += 1;
      if (!(await paymentExists(pid))) {
        stats.flagged += 1;
        await flagOrphan({
          ledger: 'property',
          paymentId: pid,
          propertyId: account.propertyId ? String(account.propertyId) : undefined,
          accountId: String(account._id),
          transactionId: tx?._id ? String(tx._id) : pid,
          collection: 'propertyaccounts'
        });
      }
    }
  }

  const agentRows = await AgentAccount.find({
    lastUpdated: { $gte: since }
  }).select('_id agentId transactions.paymentId transactions._id').limit(max).lean();
  for (const account of agentRows as any[]) {
    for (const tx of account.transactions || []) {
      const pid = tx?.paymentId ? String(tx.paymentId) : '';
      if (!pid) continue;
      stats.scanned += 1;
      if (!(await paymentExists(pid))) {
        stats.flagged += 1;
        await flagOrphan({
          ledger: 'agent',
          paymentId: pid,
          accountId: String(account._id),
          transactionId: tx?._id ? String(tx._id) : pid,
          collection: 'agentaccounts'
        });
      }
    }
  }

  const companyRows = await CompanyAccount.find({
    lastUpdated: { $gte: since }
  }).select('_id companyId transactions.paymentId transactions._id').limit(max).lean();
  for (const account of companyRows as any[]) {
    for (const tx of account.transactions || []) {
      const pid = tx?.paymentId ? String(tx.paymentId) : '';
      if (!pid) continue;
      stats.scanned += 1;
      if (!(await paymentExists(pid))) {
        stats.flagged += 1;
        await flagOrphan({
          ledger: 'company',
          paymentId: pid,
          companyId: account.companyId ? String(account.companyId) : undefined,
          accountId: String(account._id),
          transactionId: tx?._id ? String(tx._id) : pid,
          collection: 'companyaccounts'
        });
      }
    }
  }

  const journals = await JournalEntry.find({
    createdAt: { $gte: since },
    sourceId: { $exists: true, $type: 'string' }
  }).select('_id companyId sourceId').limit(max).lean();
  for (const row of journals as any[]) {
    const pid = paymentIdFromJournalSource(String(row.sourceId || ''));
    if (!pid) continue;
    stats.scanned += 1;
    if (!(await paymentExists(pid))) {
      stats.flagged += 1;
      await flagOrphan({
        ledger: 'journal',
        paymentId: pid,
        companyId: row.companyId ? String(row.companyId) : undefined,
        accountId: String(row._id),
        transactionId: String(row._id),
        collection: 'journalentries'
      });
    }
  }

  const vats = await VatRecord.find({
    createdAt: { $gte: since }
  }).select('_id companyId transactionId').limit(max).lean();
  for (const row of vats as any[]) {
    const pid = String(row.transactionId || '');
    if (!pid) continue;
    stats.scanned += 1;
    if (!(await paymentExists(pid))) {
      stats.flagged += 1;
      await flagOrphan({
        ledger: 'vat',
        paymentId: pid,
        companyId: row.companyId ? String(row.companyId) : undefined,
        accountId: String(row._id),
        transactionId: pid,
        collection: 'vatrecords'
      });
    }
  }

  const deposits = await RentalDeposit.find({
    createdAt: { $gte: since },
    type: 'payment',
    paymentId: { $exists: true }
  }).select('_id companyId propertyId paymentId').limit(max).lean();
  for (const row of deposits as any[]) {
    const pid = row.paymentId ? String(row.paymentId) : '';
    if (!pid) continue;
    stats.scanned += 1;
    if (!(await paymentExists(pid))) {
      stats.flagged += 1;
      await flagOrphan({
        ledger: 'deposit',
        paymentId: pid,
        companyId: row.companyId ? String(row.companyId) : undefined,
        propertyId: row.propertyId ? String(row.propertyId) : undefined,
        accountId: String(row._id),
        transactionId: String(row._id),
        collection: 'rentaldeposits'
      });
    }
  }

  return stats;
}

/**
 * READ / COMPARE / FLAG. Zero financial writes.
 * Selection: tracked incomplete payments only (accountingComplete=false or diagnostic pending/partial/failed/incomplete).
 * Historical payments without those fields are never selected.
 */
export async function runPaymentAccountingIntegrityPass(limit = 50): Promise<{
  selected: number;
  checked: number;
  complete: number;
  incomplete: number;
  orphansFlagged: number;
}> {
  const stats = { selected: 0, checked: 0, complete: 0, incomplete: 0, orphansFlagged: 0 };
  const filter = buildAccountingIntegrityCandidateFilter();
  const rows = await Payment.find(filter)
    .select('_id companyId propertyId accountingComplete accountingStatus')
    .sort({ accountingLastAttemptAt: 1, _id: 1 })
    .limit(Math.max(1, Math.min(limit, PAYMENT_RECONCILIATION_BATCH_SIZE)))
    .lean();
  stats.selected = rows.length;

  for (const row of rows) {
    const paymentId = String((row as any)._id);
    try {
      stats.checked += 1;
      const recon = await reconcilePayment(paymentId);
      await applyReconciliationOutcome(paymentId, recon, {
        companyId: (row as any).companyId ? String((row as any).companyId) : undefined
      });
      if (recon.accountingComplete) stats.complete += 1;
      else stats.incomplete += 1;
      logger.info('Accounting integrity check', {
        paymentId,
        result: recon.accountingComplete ? 'complete' : 'incomplete',
        missing: recon.missing,
        mismatched: recon.mismatched,
        timestamp: new Date().toISOString()
      });
    } catch (e: any) {
      stats.incomplete += 1;
      logger.warn('Integrity detection failed', { paymentId, error: e?.message || e });
    }
  }

  try {
    const orphans = await detectOrphanAccountingRecords(limit);
    stats.orphansFlagged = orphans.flagged;
  } catch (e: any) {
    logger.warn('Orphan accounting detection failed', { error: e?.message || e });
  }

  logger.info('Payment accounting integrity pass completed', stats);
  return stats;
}

export type AccountingIntegritySummary = {
  totalChecked: number;
  complete: number;
  incomplete: number;
  mismatched: number;
  orphaned: number;
  exceptions: number;
  orphanScanWindowHours: number;
};

export type AccountingIntegrityListFilters = {
  status?: 'all' | 'incomplete' | 'mismatched' | 'orphaned';
  component?: string;
  dateFrom?: Date;
  dateTo?: Date;
  propertyId?: string;
  agentId?: string;
  paymentReference?: string;
  currency?: string;
  page?: number;
  limit?: number;
};

function companyOid(companyId: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    throw new Error('Invalid companyId');
  }
  return new mongoose.Types.ObjectId(companyId);
}

export async function getCompanyAccountingIntegritySummary(companyId: string): Promise<AccountingIntegritySummary> {
  const cid = companyOid(companyId);
  const tracked = { companyId: cid, accountingComplete: { $in: [true, false] } };
  const [totalChecked, complete, incomplete, mismatched, orphaned, exceptions] = await Promise.all([
    Payment.countDocuments(tracked),
    Payment.countDocuments({ companyId: cid, accountingComplete: true }),
    Payment.countDocuments({ companyId: cid, accountingComplete: false }),
    AccountingException.countDocuments({ companyId: cid, status: 'open', issueType: 'mismatched' }),
    AccountingException.countDocuments({ companyId: cid, status: 'open', kind: 'orphan_accounting' }),
    AccountingException.countDocuments({ companyId: cid, status: 'open' })
  ]);
  return {
    totalChecked,
    complete,
    incomplete,
    mismatched,
    orphaned,
    exceptions,
    orphanScanWindowHours: ORPHAN_SCAN_WINDOW_HOURS
  };
}

function displayName(doc: any, fallback = ''): string {
  if (!doc) return fallback;
  if (typeof doc === 'string') return doc;
  const name = String(doc.name || '').trim();
  if (name) return name;
  const person = `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
  if (person) return person;
  if (doc.address) return String(doc.address);
  return fallback;
}

export async function listCompanyAccountingInconsistencies(
  companyId: string,
  filters: AccountingIntegrityListFilters = {}
): Promise<{ items: any[]; total: number; page: number; limit: number }> {
  const cid = companyOid(companyId);
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.max(1, Math.min(100, Number(filters.limit || 25)));
  const query: Record<string, unknown> = { companyId: cid, status: 'open' };

  const status = String(filters.status || 'all');
  if (status === 'orphaned') query.kind = 'orphan_accounting';
  else if (status === 'mismatched') query.issueType = 'mismatched';
  else if (status === 'incomplete') query.kind = 'incomplete_projection';

  if (filters.component) {
    const component = String(filters.component);
    query.$or = [
      { component },
      { missingComponents: component },
      { 'issues.component': component },
      { ledger: componentToLedger(component) }
    ];
  }

  const paymentFilter: Record<string, unknown> = { companyId: cid };
  let constrainPayments = false;
  if (filters.dateFrom || filters.dateTo) {
    const paymentDate: Record<string, Date> = {};
    if (filters.dateFrom) paymentDate.$gte = filters.dateFrom;
    if (filters.dateTo) paymentDate.$lte = filters.dateTo;
    paymentFilter.paymentDate = paymentDate;
    constrainPayments = true;
  }
  if (filters.propertyId && mongoose.Types.ObjectId.isValid(filters.propertyId)) {
    paymentFilter.propertyId = new mongoose.Types.ObjectId(filters.propertyId);
    constrainPayments = true;
  }
  if (filters.agentId && mongoose.Types.ObjectId.isValid(filters.agentId)) {
    paymentFilter.agentId = new mongoose.Types.ObjectId(filters.agentId);
    constrainPayments = true;
  }
  if (filters.currency) {
    paymentFilter.currency = filters.currency;
    constrainPayments = true;
  }
  if (filters.paymentReference && String(filters.paymentReference).trim()) {
    paymentFilter.referenceNumber = new RegExp(String(filters.paymentReference).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    constrainPayments = true;
  }

  if (constrainPayments) {
    const paymentIds = await Payment.find(paymentFilter).select('_id').limit(2000).lean();
    query.paymentId = { $in: paymentIds.map((row: any) => row._id) };
  }

  const [total, rows] = await Promise.all([
    AccountingException.countDocuments(query),
    AccountingException.find(query)
      .sort({ detectedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
  ]);

  const paymentIds = Array.from(new Set(rows.map((row: any) => row.paymentId).filter(Boolean).map((id: any) => String(id))));
  const payments = paymentIds.length
    ? await Payment.find({ _id: { $in: paymentIds }, companyId: cid })
      .select('referenceNumber paymentDate propertyId tenantId agentId currency amount depositAmount accountingComplete')
      .populate('propertyId', 'name address')
      .populate('tenantId', 'name firstName lastName')
      .lean()
    : [];
  const paymentMap = new Map(payments.map((p: any) => [String(p._id), p]));

  const items = rows.map((row: any) => {
    const payment = row.paymentId ? paymentMap.get(String(row.paymentId)) : undefined;
    const issue = Array.isArray(row.issues) && row.issues.length ? row.issues[0] : null;
    const component = row.component || issue?.component || row.ledger || (row.missingComponents || [])[0] || '';
    const statusLabel = row.kind === 'orphan_accounting'
      ? 'ORPHANED'
      : (row.issueType === 'mismatched' ? 'MISMATCHED' : 'MISSING');
    return {
      id: String(row._id),
      date: payment?.paymentDate || row.detectedAt,
      paymentReference: payment?.referenceNumber || '',
      paymentId: row.paymentId ? String(row.paymentId) : '',
      property: displayName(payment?.propertyId),
      tenant: displayName(payment?.tenantId),
      currency: payment?.currency || '',
      issue: row.error || statusLabel,
      component,
      expected: row.expected != null ? row.expected : (statusLabel === 'ORPHANED' ? 'Source Payment missing' : issue?.expected),
      actual: row.actual != null ? row.actual : (statusLabel === 'ORPHANED' ? 'Accounting record exists' : issue?.actual),
      difference: row.difference != null ? row.difference : issue?.difference,
      status: statusLabel,
      accountingComplete: payment?.accountingComplete === true,
      canRepair: row.kind !== 'orphan_accounting' && Boolean(row.paymentId)
    };
  });

  return { items, total, page, limit };
}

function componentToLedger(component: string): string | undefined {
  const map: Record<string, string> = {
    ownerIncome: 'property',
    agentCommission: 'agent',
    companyCommission: 'company',
    journal: 'journal',
    vat: 'vat',
    deposit: 'deposit',
    property: 'property',
    agent: 'agent',
    company: 'company'
  };
  return map[component];
}

