import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { Payment } from '../models/Payment';
import PropertyAccount from '../models/PropertyAccount';
import { AgentAccount } from '../models/AgentAccount';
import { CompanyAccount } from '../models/CompanyAccount';
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { VatRecord } from '../models/VatRecord';
import { RentalDeposit } from '../models/rentalDeposit';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { AccountingException } from '../models/AccountingException';
import { postPaymentAccounting } from './paymentAccountingOrchestrator';
import {
  AccountingActualSnapshot,
  AccountingComponent,
  AccountingReconciliationResult,
  AccountingRepairPlan,
  buildAccountingRepairPlan,
  buildExpectedAccountingProjection,
  deriveAccountingComplete,
  deriveAccountingStatus,
  evaluateAccountingReconciliation,
  isHistoricalUntrackedPayment
} from './paymentAccountingProjection';
import { computeOwnerIncomeAmount } from './paymentAccountingCompleteness';
import { idsEqual, roundMoney } from '../utils/money';

function asObjectId(paymentId: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(paymentId) ? new mongoose.Types.ObjectId(paymentId) : null;
}

export {
  buildExpectedAccountingProjection,
  evaluateAccountingReconciliation,
  deriveAccountingStatus,
  deriveAccountingComplete,
  buildAccountingRepairPlan
};

function linkedId(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value);
}

export async function loadAccountingActualSnapshot(payment: any): Promise<AccountingActualSnapshot> {
  const paymentId = String(payment?._id || '');
  const isSale = String(payment?.paymentType || '') === 'sale';
  const computedOwnerIncomeAmount = computeOwnerIncomeAmount({
    isSale,
    ownerAmount: payment?.commissionDetails?.ownerAmount,
    passThroughTotal: Number(payment?.levyAllocated || 0)
  });

  const empty: AccountingActualSnapshot = {
    ownerIncome: false,
    agentCommission: false,
    companyCommission: false,
    journal: false,
    vat: false,
    deposit: false,
    computedOwnerIncomeAmount,
    amounts: {},
    linkedPaymentIds: {},
    duplicates: {}
  };
  const oid = asObjectId(paymentId);
  if (!oid) return empty;

  const [
    propertyAccount,
    agentAccounts,
    companyAccount,
    journalHit,
    vatHit,
    deposits
  ] = await Promise.all([
    PropertyAccount.findOne({
      isArchived: { $ne: true },
      isActive: { $ne: false },
      transactions: {
        $elemMatch: {
          type: 'income',
          status: 'completed',
          idempotencyKey: `payment:${paymentId}`
        }
      }
    }).select('transactions.type transactions.status transactions.amount transactions.paymentId transactions.idempotencyKey').lean(),
    AgentAccount.find({
      transactions: {
        $elemMatch: {
          type: 'commission',
          status: 'completed',
          paymentId: paymentId
        }
      }
    }).select('transactions.type transactions.status transactions.amount transactions.paymentId').lean(),
    CompanyAccount.findOne({
      transactions: {
        $elemMatch: {
          paymentId: oid,
          isArchived: { $ne: true }
        }
      }
    }).select('transactions.paymentId transactions.amount transactions.isArchived').lean(),
    JournalEntry.findOne({
      sourceId: paymentId,
      status: 'posted'
    }).select('_id sourceId').lean(),
    VatRecord.findOne({ transactionId: paymentId }).select('_id transactionId vatCollected').lean(),
    RentalDeposit.find({ paymentId: oid, type: 'payment' }).select('_id paymentId depositAmount').lean()
  ]);

  const incomeTxs = ((propertyAccount as any)?.transactions || []).filter((tx: any) =>
    String(tx?.type || '') === 'income'
    && String(tx?.status || '') === 'completed'
    && String(tx?.idempotencyKey || '') === `payment:${paymentId}`
  );
  const incomeTx = incomeTxs[0];

  const agentTxs: any[] = [];
  for (const account of agentAccounts as any[]) {
    for (const tx of account?.transactions || []) {
      if (String(tx?.type || '') === 'commission'
        && String(tx?.status || '') === 'completed'
        && idsEqual(tx?.paymentId, paymentId)) {
        agentTxs.push(tx);
      }
    }
  }

  const companyTxs = ((companyAccount as any)?.transactions || []).filter((tx: any) =>
    idsEqual(tx?.paymentId, paymentId) && tx?.isArchived !== true
  );
  const companyTx = companyTxs[0];
  const depositDoc = (deposits as any[])[0];

  let journalAmount: number | undefined;
  if (journalHit) {
    const lines = await JournalLine.find({ journalEntryId: (journalHit as any)._id }).select('debit credit').lean();
    journalAmount = roundMoney((lines as any[]).reduce((sum, line) => sum + Number(line?.debit || 0), 0));
  }

  return {
    ownerIncome: Boolean(incomeTx),
    agentCommission: agentTxs.length > 0,
    companyCommission: Boolean(companyTx),
    journal: Boolean(journalHit),
    vat: Boolean(vatHit),
    deposit: Boolean(depositDoc),
    computedOwnerIncomeAmount,
    amounts: {
      ownerIncome: incomeTx ? roundMoney(Number(incomeTx.amount || 0)) : undefined,
      agentCommission: agentTxs.length ? roundMoney(agentTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)) : undefined,
      companyCommission: companyTx ? roundMoney(Number(companyTx.amount || 0)) : undefined,
      journal: journalAmount,
      vat: vatHit ? roundMoney(Number((vatHit as any).vatCollected || 0)) : undefined,
      deposit: depositDoc ? roundMoney(Number((depositDoc as any).depositAmount || 0)) : undefined
    },
    linkedPaymentIds: {
      ownerIncome: linkedId(incomeTx?.paymentId) || (incomeTx ? paymentId : undefined),
      agentCommission: agentTxs.length ? linkedId(agentTxs[0]?.paymentId) : undefined,
      companyCommission: linkedId(companyTx?.paymentId),
      journal: linkedId((journalHit as any)?.sourceId),
      vat: linkedId((vatHit as any)?.transactionId),
      deposit: linkedId((depositDoc as any)?.paymentId)
    },
    duplicates: {
      ownerIncome: incomeTxs.length || undefined,
      companyCommission: companyTxs.length || undefined,
      deposit: (deposits as any[]).length || undefined
    }
  };
}

/** Read-only comparison. Never writes ledgers, payments, or exceptions. */
export async function reconcilePayment(paymentId: string): Promise<AccountingReconciliationResult> {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    return {
      paymentId,
      expected: buildExpectedAccountingProjection(null),
      actual: {
        ownerIncome: false,
        agentCommission: false,
        companyCommission: false,
        journal: false,
        vat: false,
        deposit: false
      },
      status: 'failed',
      accountingComplete: false,
      missing: [],
      mismatched: [],
      issues: [],
      componentStatus: {
        ownerIncome: 'MISSING',
        agentCommission: 'MISSING',
        companyCommission: 'MISSING',
        journal: 'MISSING',
        vat: 'MISSING',
        deposit: 'MISSING'
      }
    };
  }
  const expected = buildExpectedAccountingProjection(payment);
  const actual = await loadAccountingActualSnapshot(payment);
  return evaluateAccountingReconciliation({
    paymentId: String(payment._id),
    propertyId: payment.propertyId ? String(payment.propertyId) : undefined,
    expected,
    actual
  });
}

function diagnosticStatusFromRecon(recon: AccountingReconciliationResult) {
  return deriveAccountingStatus({
    reconStatus: recon.status,
    missing: recon.missing
  });
}

/**
 * Persist binary integrity on already-tracked payments only.
 * Historical documents (no accountingComplete and no accountingStatus) are never stamped.
 * Does not write financial ledgers.
 */
export async function persistAccountingIntegrityFromRecon(
  paymentId: string,
  recon: AccountingReconciliationResult,
  extra?: { lastError?: string }
): Promise<{ accountingComplete: boolean; accountingStatus: string }> {
  const payment = await Payment.findById(paymentId)
    .select('accountingComplete accountingStatus')
    .lean();
  const accountingComplete = recon.accountingComplete;
  const accountingStatus = diagnosticStatusFromRecon(recon);
  if (!payment || isHistoricalUntrackedPayment(payment as any)) {
    return { accountingComplete, accountingStatus };
  }
  const now = new Date();
  const set: Record<string, unknown> = {
    accountingComplete,
    accountingStatus,
    accountingLastAttemptAt: now,
    accountingMissing: recon.missing,
    accountingMismatched: recon.mismatched || []
  };
  const unset: Record<string, 1> = {};
  if (accountingComplete) {
    set.accountingPostedAt = now;
    unset.accountingLastError = 1;
    unset.accountingNextAttemptAt = 1;
  } else {
    set.accountingLastError = extra?.lastError
      || (recon.mismatched?.length ? `mismatched:${recon.mismatched.join(',')}` : undefined)
      || (recon.missing.length ? recon.missing.join(',') : 'incomplete');
  }
  const update: Record<string, unknown> = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;
  await Payment.updateOne({ _id: paymentId }, update);
  return { accountingComplete, accountingStatus };
}

export async function upsertIncompleteAccountingException(input: {
  paymentId: string;
  companyId?: string;
  propertyId?: string;
  recon: AccountingReconciliationResult;
  error?: string;
}): Promise<void> {
  const oid = asObjectId(input.paymentId);
  if (!oid) return;
  const now = new Date();
  const mismatched = input.recon.mismatched || [];
  const issueType = mismatched.length ? 'mismatched' : 'missing';
  const primary = (input.recon.issues || [])[0];
  await AccountingException.updateOne(
    { kind: 'incomplete_projection', paymentId: oid },
    {
      $set: {
        status: 'open',
        issueType,
        component: primary?.component,
        expected: primary?.expected,
        actual: primary?.actual,
        difference: typeof primary?.difference === 'number' ? primary.difference : undefined,
        issues: input.recon.issues || [],
        companyId: input.companyId && mongoose.Types.ObjectId.isValid(input.companyId)
          ? new mongoose.Types.ObjectId(input.companyId)
          : undefined,
        propertyId: input.propertyId && mongoose.Types.ObjectId.isValid(input.propertyId)
          ? new mongoose.Types.ObjectId(input.propertyId)
          : undefined,
        missingComponents: input.recon.missing,
        error: input.error
          || (mismatched.length ? `mismatched:${mismatched.join(',')}` : undefined)
          || (input.recon.missing.length ? input.recon.missing.join(',') : 'incomplete'),
        lastCheckedAt: now
      },
      $unset: {
        resolvedAt: 1,
        resolvedBy: 1,
        resolution: 1
      },
      $setOnInsert: {
        kind: 'incomplete_projection',
        paymentId: oid,
        detectedAt: now
      }
    },
    { upsert: true }
  );
}

export async function resolveIncompleteAccountingException(
  paymentId: string,
  opts?: { resolvedBy?: string; resolution?: string }
): Promise<void> {
  const oid = asObjectId(paymentId);
  if (!oid) return;
  const now = new Date();
  await AccountingException.updateMany(
    { kind: 'incomplete_projection', paymentId: oid, status: 'open' },
    {
      $set: {
        status: 'resolved',
        lastCheckedAt: now,
        resolvedAt: now,
        resolvedBy: opts?.resolvedBy && mongoose.Types.ObjectId.isValid(opts.resolvedBy)
          ? new mongoose.Types.ObjectId(opts.resolvedBy)
          : undefined,
        resolution: opts?.resolution || 'reconcilePayment returned complete'
      }
    }
  );
}

export async function applyReconciliationOutcome(
  paymentId: string,
  recon: AccountingReconciliationResult,
  extra?: { lastError?: string; companyId?: string }
): Promise<{ accountingComplete: boolean; accountingStatus: string }> {
  const persisted = await persistAccountingIntegrityFromRecon(paymentId, recon, extra);
  if (recon.accountingComplete) {
    await resolveIncompleteAccountingException(paymentId, { resolution: 'reconcilePayment returned VALID/complete' });
  } else if (recon.status === 'incomplete' || recon.status === 'failed') {
    await upsertIncompleteAccountingException({
      paymentId,
      companyId: extra?.companyId,
      propertyId: recon.propertyId,
      recon,
      error: extra?.lastError
    });
  }
  return persisted;
}

export async function ensureDepositLedgerFromPayment(
  payment: any,
  session?: mongoose.ClientSession
): Promise<'inserted' | 'existing' | 'skipped'> {
  const depositAmount = Number(payment?.depositAmount || 0);
  if (depositAmount <= 0 || !payment?._id) return 'skipped';
  if (payment.reversalOfPaymentId || Number(payment.amount || 0) < 0) return 'skipped';
  const filter = { paymentId: payment._id, type: 'payment' };
  const insertDoc = {
    propertyId: payment.propertyId,
    agentId: payment.agentId,
    companyId: payment.companyId,
    tenantId: payment.tenantId,
    depositAmount,
    depositDate: payment.paymentDate || new Date(),
    paymentId: payment._id,
    type: 'payment',
    referenceNumber: payment.referenceNumber,
    notes: payment.notes || '',
    processedBy: payment.processedBy,
    paymentMethod: payment.paymentMethod
  };
  const existing = await RentalDeposit.findOne(filter).select('_id').session(session || null).lean();
  if (existing) return 'existing';
  try {
    const result = await RentalDeposit.findOneAndUpdate(
      filter,
      { $setOnInsert: insertDoc },
      { upsert: true, new: true, rawResult: true, session: session || undefined }
    );
    const upserted = Boolean((result as any)?.lastErrorObject?.upserted || (result as any)?.upsertedId);
    return upserted ? 'inserted' : 'existing';
  } catch (e: any) {
    const raced = await RentalDeposit.findOne(filter).select('_id').session(session || null).lean();
    if (raced) return 'existing';
    throw e;
  }
}

async function writeRepairAudit(input: {
  paymentId: string;
  companyId?: string;
  userId?: string;
  reason?: string;
  dryRun: boolean;
  previousStatus?: string;
  previousComplete?: boolean;
  detectedIssues?: unknown[];
  componentsDetectedMissing: AccountingComponent[];
  componentsMismatched?: AccountingComponent[];
  componentsCreated: AccountingComponent[];
  componentsModified?: AccountingComponent[];
  componentsSkipped: AccountingComponent[];
  result: string;
  finalRecon?: AccountingReconciliationResult;
}): Promise<void> {
  if (!input.companyId) return;
  try {
    await AccountingEventLog.create({
      companyId: new mongoose.Types.ObjectId(input.companyId),
      eventType: 'payment_accounting_repair',
      sourceModule: 'payment',
      sourceId: input.paymentId,
      success: input.result === 'complete' || input.dryRun,
      message: input.dryRun ? 'dry-run' : input.result,
      metadata: {
        paymentId: input.paymentId,
        performedBy: input.userId,
        user: input.userId,
        timestamp: new Date().toISOString(),
        reason: input.reason || '',
        dryRun: input.dryRun,
        previousStatus: input.previousStatus,
        previousComplete: input.previousComplete,
        detectedIssues: input.detectedIssues || [],
        componentsDetectedMissing: input.componentsDetectedMissing,
        componentsMismatched: input.componentsMismatched || [],
        componentsCreated: input.componentsCreated,
        recordsCreated: input.componentsCreated,
        recordsModified: input.componentsModified || [],
        recordsSkipped: input.componentsSkipped,
        componentsSkipped: input.componentsSkipped,
        result: input.result,
        finalReconciliation: input.finalRecon
          ? {
              accountingComplete: input.finalRecon.accountingComplete,
              status: input.finalRecon.status,
              missing: input.finalRecon.missing,
              mismatched: input.finalRecon.mismatched,
              issues: input.finalRecon.issues
            }
          : undefined
      }
    });
  } catch (e: any) {
    logger.warn('Failed to write accounting repair audit', {
      paymentId: input.paymentId,
      error: e?.message || e
    });
  }
}

export type RepairPaymentAccountingOptions = {
  createdBy?: string;
  userId?: string;
  reason?: string;
  dryRun?: boolean;
};

export type RepairPaymentAccountingResult = {
  dryRun: boolean;
  recon: AccountingReconciliationResult;
  plan: AccountingRepairPlan;
  accountingComplete: boolean;
  accountingStatus: string;
  componentsCreated: AccountingComponent[];
  componentsSkipped: AccountingComponent[];
  requiresManualReview: AccountingComponent[];
};

/**
 * Explicit, targeted, payment-scoped repair. Never called by the integrity job.
 * Dry-run writes nothing financial. Write mode only creates missing projections via existing writers.
 * Mismatched projections are not auto-corrected.
 */
export async function repairPaymentAccounting(
  paymentId: string,
  opts?: RepairPaymentAccountingOptions
): Promise<RepairPaymentAccountingResult> {
  if (!paymentId || !String(paymentId).trim()) {
    throw new Error('repairPaymentAccounting requires an explicit paymentId');
  }
  const dryRun = opts?.dryRun === true;
  const reason = String(opts?.reason || '').trim();
  if (!dryRun && !reason) {
    const err = new Error('Manual accounting repair requires a non-empty reason') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const reconBefore = await reconcilePayment(paymentId);
  const plan = buildAccountingRepairPlan(reconBefore);
  const payment = await Payment.findById(paymentId).select('companyId').lean();
  const companyId = payment?.companyId ? String((payment as any).companyId) : undefined;

  if (dryRun) {
    await writeRepairAudit({
      paymentId,
      companyId,
      userId: opts?.userId,
      reason,
      dryRun: true,
      previousStatus: reconBefore.status,
      previousComplete: reconBefore.accountingComplete,
      detectedIssues: reconBefore.issues,
      componentsDetectedMissing: reconBefore.missing,
      componentsMismatched: reconBefore.mismatched,
      componentsCreated: [],
      componentsSkipped: plan.wouldNotModify,
      result: reconBefore.status,
      finalRecon: reconBefore
    });
    return {
      dryRun: true,
      recon: reconBefore,
      plan,
      accountingComplete: reconBefore.accountingComplete,
      accountingStatus: diagnosticStatusFromRecon(reconBefore),
      componentsCreated: [],
      componentsSkipped: plan.wouldNotModify,
      requiresManualReview: plan.requiresManualReview
    };
  }

  let postResult: { errors?: string[] } = { errors: [] };
  let depositResult: 'inserted' | 'existing' | 'skipped' = 'skipped';
  if (plan.wouldCreate.length > 0) {
    postResult = await postPaymentAccounting(paymentId, { createdBy: opts?.createdBy || opts?.userId });
    const paymentDoc = await Payment.findById(paymentId);
    if (paymentDoc && plan.wouldCreate.includes('deposit')) {
      try {
        depositResult = await ensureDepositLedgerFromPayment(paymentDoc);
      } catch (e: any) {
        logger.warn('Deposit ledger repair failed', { paymentId, error: e?.message || e });
      }
    }
  }

  const recon = await reconcilePayment(paymentId);
  const persisted = await applyReconciliationOutcome(paymentId, recon, {
    lastError: postResult.errors?.length
      ? postResult.errors.join('; ')
      : (recon.mismatched?.length ? `mismatched:${recon.mismatched.join(',')}` : undefined),
    companyId
  });
  const created: AccountingComponent[] = reconBefore.missing.filter((c) => !recon.missing.includes(c));
  if (depositResult === 'inserted' && !created.includes('deposit')) created.push('deposit');
  const finalPlan = buildAccountingRepairPlan(recon);
  await writeRepairAudit({
    paymentId,
    companyId,
    userId: opts?.userId,
    reason,
    dryRun: false,
    previousStatus: reconBefore.status,
    previousComplete: reconBefore.accountingComplete,
    detectedIssues: reconBefore.issues,
    componentsDetectedMissing: reconBefore.missing,
    componentsMismatched: reconBefore.mismatched,
    componentsCreated: created,
    componentsModified: [],
    componentsSkipped: plan.wouldNotModify,
    result: recon.status,
    finalRecon: recon
  });
  logger.info('Explicit payment accounting repair finished', {
    paymentId,
    attempt: 1,
    reason,
    result: recon.status,
    missing: recon.missing,
    mismatched: recon.mismatched,
    requiresManualReview: finalPlan.requiresManualReview,
    timestamp: new Date().toISOString(),
    dryRun: false
  });
  return {
    dryRun: false,
    recon,
    plan: finalPlan,
    accountingComplete: persisted.accountingComplete,
    accountingStatus: persisted.accountingStatus,
    componentsCreated: created,
    componentsSkipped: plan.wouldNotModify,
    requiresManualReview: finalPlan.requiresManualReview
  };
}

/**
 * Normal payment-creation posting + verification. Not a repair loop.
 * If projection is incomplete, the payment remains saved and accountingComplete stays false.
 */
export async function ensurePaymentAccountingPosted(
  paymentId: string,
  opts?: { createdBy?: string }
): Promise<{ recon: AccountingReconciliationResult; accountingComplete: boolean; accountingStatus: string }> {
  const postResult = await postPaymentAccounting(paymentId, { createdBy: opts?.createdBy });
  const recon = await reconcilePayment(paymentId);
  const payment = await Payment.findById(paymentId).select('companyId').lean();
  const persisted = await applyReconciliationOutcome(paymentId, recon, {
    lastError: postResult.errors?.length ? postResult.errors.join('; ') : undefined,
    companyId: payment?.companyId ? String((payment as any).companyId) : undefined
  });
  if (!recon.accountingComplete) {
    logger.warn('Payment accounting incomplete after posting', {
      paymentId,
      reason: postResult.errors?.length ? postResult.errors.join('; ') : recon.missing.join(','),
      result: recon.status,
      missing: recon.missing,
      timestamp: new Date().toISOString()
    });
  }
  return { recon, accountingComplete: persisted.accountingComplete, accountingStatus: persisted.accountingStatus };
}

/** Observation-only status refresh after an existing writer succeeds. Never posts ledgers. */
export async function refreshPaymentAccountingStatus(paymentId: string): Promise<string> {
  const tracked = await Payment.findById(paymentId).select('accountingComplete accountingStatus companyId').lean();
  if (!tracked || isHistoricalUntrackedPayment(tracked as any)) return 'untouched';
  const recon = await reconcilePayment(paymentId);
  const persisted = await applyReconciliationOutcome(paymentId, recon, {
    companyId: (tracked as any).companyId ? String((tracked as any).companyId) : undefined
  });
  return persisted.accountingStatus;
}

export function initialAccountingStatusForNewPayment(payment: {
  status?: string;
  isProvisional?: boolean;
  isInSuspense?: boolean;
}): 'pending' | 'not_applicable' | undefined {
  if (payment.isProvisional === true || payment.isInSuspense === true) return 'not_applicable';
  if (String(payment.status || '') === 'completed') return 'pending';
  return undefined;
}

export function initialAccountingIntegrityFields(payment: {
  status?: string;
  isProvisional?: boolean;
  isInSuspense?: boolean;
}): { accountingStatus?: 'pending' | 'not_applicable'; accountingComplete?: boolean } {
  const status = initialAccountingStatusForNewPayment(payment);
  if (status === 'not_applicable') return { accountingStatus: 'not_applicable', accountingComplete: true };
  if (status === 'pending') return { accountingStatus: 'pending', accountingComplete: false };
  return {};
}

/** Mark a payment as integrity-tracked when it first becomes a completed posting candidate. */
export function activateAccountingTrackingForCompletion(payment: any): void {
  if (!payment) return;
  const current = String(payment.accountingStatus || '');
  if (!current || current === 'not_applicable' || payment.accountingComplete == null) {
    payment.accountingStatus = 'pending';
    payment.accountingComplete = false;
  }
}
