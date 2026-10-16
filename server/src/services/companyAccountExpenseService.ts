import mongoose from 'mongoose';
import { CompanyAccount, CompanyTransaction } from '../models/CompanyAccount';
import { CompanyExpenseClaim, ICompanyExpenseClaim } from '../models/CompanyExpenseClaim';
import accountingIntegrationService from './accountingIntegrationService';
import { duplicateKeyDetails } from './journalDuplicateKey';
import { signalOperationalFailure } from './operationalSignal';
import { idsEqual } from '../utils/money';

export class CompanyExpenseIdempotencyError extends Error {
  readonly statusCode = 409;
  readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor() {
    super('This idempotency key was already used for a different company expense');
    this.name = 'CompanyExpenseIdempotencyError';
  }
}

export class CompanyExpenseIdempotencyInProgressError extends Error {
  readonly statusCode = 409;
  readonly code = 'EXPENSE_IDEMPOTENCY_IN_PROGRESS';

  constructor() {
    super('This company expense idempotency key is already being recorded');
    this.name = 'CompanyExpenseIdempotencyInProgressError';
  }
}

export type CompanyExpenseInput = {
  companyId: string;
  amount: number;
  type?: string;
  date?: string | Date;
  description?: string;
  category?: string;
  reference?: string;
  paymentMethod?: string;
  currency?: string;
  payee?: string;
  idempotencyKey?: string;
  processedBy?: string;
};

export type CompanyExpenseResult = {
  account: any;
  transaction: any;
  reused: boolean;
  /**
   * True only when this process observed a duplicate-key conflict on the
   * company-expense claim identity. Application checks alone do not prove
   * that concurrent inserts were prevented.
   */
  claimConflictObserved?: boolean;
};

const KEY_PATTERN = /^[A-Za-z0-9:_-]{8,200}$/;
const CLAIM_STALE_MS = 2 * 60 * 1000;

/**
 * A request without an idempotency key is a new expense operation.
 * The server does not invent a key, and two such requests are not collapsed.
 */
export const COMPANY_EXPENSE_UNKEYED_POLICY =
  'A company expense request without an idempotency key is a separate operation. Identical unkeyed requests are not treated as retries.';

/**
 * Production evidence required before COMPANY_EXPENSE_CLAIM_UNIQUENESS=verified.
 * Application startup does not set this value, and one stored transaction is not evidence.
 */
export const COMPANY_EXPENSE_ENABLEMENT_EVIDENCE = [
  'A read-only count of companyexpenseclaims grouped by companyId and idempotencyKey shows no group with more than one document.',
  'Missing and null companyId or idempotencyKey values were counted and reviewed.',
  'The Cosmos DB partition key was read and a unique index on { companyId: 1, idempotencyKey: 1 } is supported for that key.',
  'Index company_expense_claim_identity exists, is unique, and its key is exactly those two fields.',
  'The operator then sets COMPANY_EXPENSE_CLAIM_UNIQUENESS=verified. Startup success does not set it.',
  'A local test that left one expense transaction does not enable the gate.'
] as const;

export class CompanyExpenseUniquenessUnverifiedError extends Error {
  readonly statusCode = 503;
  readonly code = 'EXPENSE_IDEMPOTENCY_UNVERIFIED';
  readonly reason: string;

  constructor(reason: string) {
    super('Keyed company expenses are closed until the claim unique index is independently verified');
    this.name = 'CompanyExpenseUniquenessUnverifiedError';
    this.reason = reason;
  }
}

export async function inspectCompanyExpenseUniqueness(): Promise<{ available: boolean; reason: string }> {
  if (process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS !== 'verified') {
    return { available: false, reason: 'attestation_absent' };
  }
  try {
    if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && (global as any).__failExpenseUniquenessProbe) {
      (global as any).__failExpenseUniquenessProbe = false;
      throw new Error('EXPENSE_UNIQUENESS_PROBE_FAILED');
    }
    const indexes = await CompanyExpenseClaim.collection.indexes();
    const found = indexes.find((index) => index.name === 'company_expense_claim_identity' && index.unique === true);
    const key = (found?.key || {}) as Record<string, unknown>;
    const fields = Object.keys(key);
    if (!found || fields.length !== 2 || key.companyId !== 1 || key.idempotencyKey !== 1) {
      return { available: false, reason: 'unique_index_absent' };
    }
    return { available: true, reason: 'attestation_and_unique_index' };
  } catch (error) {
    const code = Number((error as { code?: unknown })?.code);
    const message = String((error as { message?: string })?.message || error);
    if (code === 26 || /ns does not exist|NamespaceNotFound/i.test(message)) {
      return { available: false, reason: 'unique_index_absent' };
    }
    signalOperationalFailure('company_expense_idempotency_unready', {
      reason: 'uniqueness_probe_failed',
      error: message.slice(0, 200)
    });
    return { available: false, reason: 'uniqueness_probe_failed' };
  }
}

function money(value: unknown): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

function day(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function requestFingerprint(input: CompanyExpenseInput, type: 'income' | 'expense', amount: number): string {
  return JSON.stringify({
    type,
    amount,
    description: input.description || input.category || '',
    reference: input.reference || '',
    paymentMethod: input.paymentMethod || '',
    currency: input.currency || 'USD',
    payee: input.payee || '',
    date: input.date ? day(input.date) : ''
  });
}

function claimIdentityConflict(error: unknown, companyId: string, idempotencyKey: string): boolean {
  const details = duplicateKeyDetails(error);
  if (!details) return false;
  const fields = Object.keys(details.pattern);
  if (fields.length !== 2 || !fields.includes('companyId') || !fields.includes('idempotencyKey')) return false;
  return idsEqual(details.value.companyId, companyId) && String(details.value.idempotencyKey || '') === idempotencyKey;
}

async function pauseForClaimRaceTest(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.MANTIS_TEST_SEAM !== '1') return;
  const delay = Number((global as any).__companyExpenseClaimDelayMs || 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

async function findStored(companyId: string, idempotencyKey: string) {
  const account = await CompanyAccount.findOne({ companyId, 'transactions.idempotencyKey': idempotencyKey });
  const transaction = account?.transactions?.find((row) => row.idempotencyKey === idempotencyKey);
  return { account, transaction };
}

async function syncStoredExpense(companyId: string, idempotencyKey: string, transaction: CompanyTransaction, processedBy?: string) {
  if (transaction.type !== 'expense') return;
  const sourceId = `company-expense:${companyId}:${idempotencyKey}`;
  const reference = transaction.referenceNumber || `CEXP-${idempotencyKey}`;
  await accountingIntegrationService.syncExpenseCreated({
    companyId,
    sourceId,
    reference,
    amount: Number(transaction.amount),
    description: transaction.description || 'Company expense',
    date: transaction.date,
    createdBy: processedBy
  });
}

async function ensureAccount(companyId: string) {
  let account = await CompanyAccount.findOne({ companyId });
  if (account) return account;
  try {
    return await CompanyAccount.create({
      companyId,
      transactions: [],
      runningBalance: 0,
      totalIncome: 0,
      totalExpenses: 0
    });
  } catch (error) {
    account = await CompanyAccount.findOne({ companyId });
    if (!account) throw error;
    return account;
  }
}

async function appendExpense(input: {
  companyId: string;
  idempotencyKey: string;
  type: 'income' | 'expense';
  amount: number;
  date: Date;
  description?: string;
  reference: string;
  paymentMethod?: string;
  currency?: string;
  payee?: string;
  processedBy?: string;
}) {
  const existing = await findStored(input.companyId, input.idempotencyKey);
  if (existing.transaction) return existing;
  const account = await ensureAccount(input.companyId);
  const now = new Date();
  const txId = new mongoose.Types.ObjectId();
  const transaction: any = {
    _id: txId,
    type: input.type,
    amount: input.amount,
    date: input.date,
    description: input.description,
    referenceNumber: input.reference,
    paymentMethod: input.paymentMethod,
    currency: input.currency || 'USD',
    notes: input.payee,
    idempotencyKey: input.idempotencyKey,
    processedBy: input.processedBy && mongoose.Types.ObjectId.isValid(input.processedBy)
      ? new mongoose.Types.ObjectId(input.processedBy)
      : undefined,
    createdAt: now,
    updatedAt: now
  };
  const totals = input.type === 'income'
    ? { totalIncome: input.amount, runningBalance: input.amount }
    : { totalExpenses: input.amount, runningBalance: -input.amount };
  const updated = await CompanyAccount.findOneAndUpdate(
    { _id: account._id, 'transactions.idempotencyKey': { $ne: input.idempotencyKey } },
    { $push: { transactions: transaction }, $inc: totals, $set: { lastUpdated: now } },
    { new: true }
  );
  if (!updated) return findStored(input.companyId, input.idempotencyKey);
  const storedTx = updated.transactions.find((row: any) => String(row.idempotencyKey || '') === input.idempotencyKey) || transaction;
  return { account: updated, transaction: storedTx };
}

async function finishClaim(claim: ICompanyExpenseClaim, companyId: string, transaction: CompanyTransaction, processedBy?: string) {
  try {
    if (claim.type === 'expense') {
      await syncStoredExpense(companyId, claim.idempotencyKey, transaction, processedBy);
    }
    await CompanyExpenseClaim.updateOne({ _id: claim._id }, { $set: { status: 'posted', transactionId: transaction._id } });
  } catch (error) {
    await CompanyExpenseClaim.updateOne(
      { _id: claim._id },
      { $set: { status: 'post_failed', transactionId: transaction._id } }
    );
    throw error;
  }
}

/**
 * Record one company-account expense.
 *
 * Keyed requests insert a top-level claim before the ledger append. Concurrent
 * safety requires the unique { companyId, idempotencyKey } index on
 * companyexpenseclaims. That index is declared and is not created here.
 * Without it, two claim inserts can both succeed and both append. The code
 * does not treat that race as a successful idempotent retry.
 *
 * Unkeyed requests follow COMPANY_EXPENSE_UNKEYED_POLICY.
 */
export async function recordCompanyAccountExpense(input: CompanyExpenseInput): Promise<CompanyExpenseResult> {
  const companyId = String(input.companyId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    const error: any = new Error('companyId is required');
    error.statusCode = 400;
    throw error;
  }
  const amount = money(input.amount);
  if (!(amount > 0)) {
    const error: any = new Error('Valid amount is required');
    error.statusCode = 400;
    throw error;
  }
  const rawKey = String(input.idempotencyKey || '').trim();
  if (rawKey && !KEY_PATTERN.test(rawKey)) {
    const error: any = new Error('Idempotency key must be a stable 8 to 200 character token');
    error.statusCode = 400;
    throw error;
  }
  const type: 'income' | 'expense' = input.type === 'income' ? 'income' : 'expense';
  const txDate = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(txDate.getTime())) {
    const error: any = new Error('Valid date is required');
    error.statusCode = 400;
    throw error;
  }

  if (!rawKey) {
    const account = await ensureAccount(companyId);
    const now = new Date();
    const txId = new mongoose.Types.ObjectId();
    const reference = input.reference || `EXP-${String(txId)}`;
    const transaction: any = {
      _id: txId,
      type,
      amount,
      date: txDate,
      description: input.description || input.category || undefined,
      referenceNumber: reference,
      paymentMethod: input.paymentMethod || undefined,
      currency: input.currency || 'USD',
      notes: input.payee || undefined,
      processedBy: input.processedBy && mongoose.Types.ObjectId.isValid(input.processedBy)
        ? new mongoose.Types.ObjectId(input.processedBy)
        : undefined,
      createdAt: now,
      updatedAt: now
    };
    const totals = type === 'income'
      ? { totalIncome: amount, runningBalance: amount }
      : { totalExpenses: amount, runningBalance: -amount };
    const updated = await CompanyAccount.findOneAndUpdate(
      { _id: account._id },
      { $push: { transactions: transaction }, $inc: totals, $set: { lastUpdated: now } },
      { new: true }
    );
    if (type === 'expense') {
      await syncStoredExpense(companyId, String(txId), { ...transaction, type: 'expense' }, input.processedBy);
    }
    return { account: updated, transaction, reused: false };
  }

  const readiness = await inspectCompanyExpenseUniqueness();
  if (!readiness.available) {
    signalOperationalFailure('company_expense_idempotency_unready', {
      companyId,
      reason: readiness.reason,
      idempotencyKey: rawKey
    });
    throw new CompanyExpenseUniquenessUnverifiedError(readiness.reason);
  }

  const fingerprint = requestFingerprint(input, type, amount);
  const reference = input.reference || `CEXP-${rawKey}`;
  const existingClaims = await CompanyExpenseClaim.find({ companyId, idempotencyKey: rawKey });
  if (existingClaims.length > 1) {
    if (new Set(existingClaims.map((row) => row.fingerprint)).size > 1) {
      throw new CompanyExpenseIdempotencyError();
    }
    const stored = await findStored(companyId, rawKey);
    if (stored.transaction) {
      if (money(stored.transaction.amount) !== money(existingClaims[0].amount)) {
        throw new CompanyExpenseIdempotencyError();
      }
      if (!idsEqual(stored.account?.companyId, companyId)) throw new CompanyExpenseIdempotencyError();
      const posted = existingClaims.find((row) => row.transactionId) || existingClaims[0];
      await finishClaim(posted, companyId, stored.transaction, input.processedBy);
      return { account: stored.account, transaction: stored.transaction, reused: true, claimConflictObserved: false };
    }
    signalOperationalFailure('company_expense_claim_conflict', { companyId, idempotencyKey: rawKey, claims: existingClaims.length });
    throw new CompanyExpenseIdempotencyError();
  }
  let claim: ICompanyExpenseClaim | null = existingClaims[0] || null;
  let claimConflictObserved = false;
  if (!claim) {
    try {
      const forced = process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1'
        ? (global as any).__companyExpenseDuplicateKey
        : undefined;
      if (forced) {
        (global as any).__companyExpenseDuplicateKey = undefined;
        const duplicate: any = new Error('E11000 duplicate key error');
        duplicate.code = 11000;
        duplicate.keyPattern = forced.pattern;
        duplicate.keyValue = forced.value;
        throw duplicate;
      }
      claim = await CompanyExpenseClaim.create({
        companyId,
        idempotencyKey: rawKey,
        fingerprint,
        amount,
        type,
        reference,
        description: input.description || input.category || undefined,
        status: 'claimed'
      });
      await pauseForClaimRaceTest();
    } catch (error) {
      if (Number((error as { code?: unknown })?.code) !== 11000) throw error;
      if (!claimIdentityConflict(error, companyId, rawKey)) {
        signalOperationalFailure('company_expense_duplicate_key_unidentified', { companyId, idempotencyKey: rawKey });
        throw error;
      }
      claimConflictObserved = true;
      claim = await CompanyExpenseClaim.findOne({ companyId, idempotencyKey: rawKey });
      if (!claim) throw error;
    }
  }
  if (!idsEqual(claim.companyId, companyId) || claim.idempotencyKey !== rawKey || claim.fingerprint !== fingerprint) {
    throw new CompanyExpenseIdempotencyError();
  }

  if (!claim.transactionId) {
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
    const owned = await CompanyExpenseClaim.findOneAndUpdate(
      {
        _id: claim._id,
        transactionId: { $exists: false },
        $or: [
          { status: 'claimed' },
          { status: 'appending', updatedAt: { $lte: staleBefore } }
        ]
      },
      { $set: { status: 'appending', updatedAt: new Date() } },
      { new: true }
    );
    if (!owned) {
      const current = await CompanyExpenseClaim.findById(claim._id);
      if (current?.transactionId) {
        claim = current;
      } else if (current && current.fingerprint !== fingerprint) {
        throw new CompanyExpenseIdempotencyError();
      } else {
        throw new CompanyExpenseIdempotencyInProgressError();
      }
    } else {
      claim = owned;
    }
  }

  if (!claim.transactionId) {
    const appended = await appendExpense({
      companyId,
      idempotencyKey: rawKey,
      type,
      amount: claim.amount,
      date: txDate,
      description: claim.description,
      reference: claim.reference || reference,
      paymentMethod: input.paymentMethod,
      currency: input.currency,
      payee: input.payee,
      processedBy: input.processedBy
    });
    if (!appended.transaction) throw new Error('Company expense was not stored');
    await finishClaim(claim, companyId, appended.transaction, input.processedBy);
    return { account: appended.account, transaction: appended.transaction, reused: false, claimConflictObserved };
  }

  const stored = await findStored(companyId, rawKey);
  if (!stored.transaction) throw new Error('Company expense claim has no stored transaction');
  if (money(stored.transaction.amount) !== money(claim.amount)) throw new CompanyExpenseIdempotencyError();
  await finishClaim(claim, companyId, stored.transaction, input.processedBy);
  return { account: stored.account, transaction: stored.transaction, reused: true, claimConflictObserved };
}
