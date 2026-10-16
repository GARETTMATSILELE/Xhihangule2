import { logger } from '../utils/logger';
import {
  evaluatePermanentAccountingPolicy,
  shouldAttemptAccountingReversal
} from './accountingPostingPolicy';
import ledgerEventService from './ledgerEventService';
import propertyAccountService from './propertyAccountService';
import agentAccountService from './agentAccountService';
import accountingIntegrationService from './accountingIntegrationService';
import { Payment } from '../models/Payment';
import { Company } from '../models/Company';
import individualTaxMetadataService from './individualTaxMetadataService';
import individualVatService from './individualVatService';
import individualRentalTaxService from './individualRentalTaxService';
import individualIncomeTaxService from './individualIncomeTaxService';
import {
  classifyReversalOutcome,
  ReversalProgress
} from './ledgerEventStateMachine';
import { AccountingException } from '../models/AccountingException';
import { isPermanentAccountingFailure, mayPostSaleTrust, OwnerIncomeAmountMissingError } from './transactionDomain';
import { reversePaymentTaxObligations } from './taxObligationService';
import { throwOnceIfArmed } from './testFailureSeam';
import trustPaymentPostingService from './trustPaymentPostingService';
import { classifyOperationalFailure } from './operationalFailure';
import { signalOperationalFailure } from './operationalSignal';
import { upsertFinancialReview } from './financialOperationVisibility';

export type AccountingArtifactResult = 'posted' | 'reversed' | 'skipped' | 'failed' | 'absent' | 'already_applied';

export type PaymentPostingResult = {
  paymentId: string;
  status: 'posted' | 'skipped' | 'partial' | 'failed';
  reason?: string;
  artifacts: Record<string, AccountingArtifactResult>;
  errors: string[];
};

export type PaymentReversalResult = {
  paymentId: string;
  status: 'already_reversed' | 'reversed' | 'partial' | 'failed';
  artifacts: Record<string, AccountingArtifactResult>;
  errors: string[];
};

async function persistOwnerIncomeFailure(
  payment: { _id?: unknown; companyId?: unknown; propertyId?: unknown },
  message: string,
  haystack = ''
): Promise<boolean> {
  const paymentId = String(payment._id || '');
  const companyId = payment.companyId ? String(payment.companyId) : '';
  let durable = false;
  try {
    throwOnceIfArmed(paymentId, haystack, 'PHASE_FAIL_LEDGER_RECORD');
    durable = await ledgerEventService.recordPermanentOwnerIncomeFailure(paymentId, message);
  } catch (error) {
    signalOperationalFailure('owner_income_ledger_failure_unpersisted', {
      correlationId: paymentId,
      paymentId,
      companyId: companyId || undefined,
      failureClass: classifyOperationalFailure(error),
      error: message.slice(0, 200)
    });
  }
  const recorded = await recordOwnerIncomeException(payment, message, haystack);
  if (recorded) durable = true;
  if (!durable) {
    signalOperationalFailure('owner_income_failure_unpersisted', {
      correlationId: paymentId,
      paymentId,
      companyId: companyId || undefined,
      failureClass: 'permanent',
      error: message.slice(0, 200),
      alert: 'database persistence unavailable'
    });
  }
  return durable;
}

async function recordOwnerIncomeException(
  payment: { _id?: unknown; companyId?: unknown; propertyId?: unknown },
  message: string,
  haystack = ''
): Promise<boolean> {
  const paymentId = String(payment._id || '');
  const companyId = payment.companyId ? String(payment.companyId) : '';
  try {
    throwOnceIfArmed(paymentId, haystack, 'PHASE_FAIL_EXCEPTION_RECORD');
    const now = new Date();
    await AccountingException.updateOne(
      {
        paymentId: payment._id,
        kind: 'incomplete_projection',
        component: 'ownerIncome',
        status: 'open'
      },
      {
        $set: {
          issueType: 'missing',
          ledger: 'property',
          error: message,
          companyId: payment.companyId,
          propertyId: payment.propertyId,
          lastCheckedAt: now,
          detectedAt: now
        },
        $setOnInsert: {
          kind: 'incomplete_projection',
          status: 'open',
          component: 'ownerIncome',
          paymentId: payment._id
        }
      },
      { upsert: true }
    );
    return true;
  } catch (error) {
    signalOperationalFailure('owner_income_exception_persist_failed', {
      correlationId: paymentId,
      paymentId,
      companyId: companyId || undefined,
      failureClass: classifyOperationalFailure(error),
      error: message.slice(0, 200)
    });
    try {
      throwOnceIfArmed(paymentId, haystack, 'PHASE_FAIL_EXCEPTION_VISIBILITY');
      if (companyId) {
        await upsertFinancialReview({
          companyId,
          component: 'OWNER_INCOME_EXCEPTION_UNRECORDED',
          operationId: paymentId,
          paymentId,
          missingRecord: 'owner income exception',
          issueType: 'missing',
          recommendedReview: `Owner income failed for payment ${paymentId} and the exception row was not stored. Accounting is not complete. Do not create a replacement financial operation.`
        });
      }
    } catch (visibilityError) {
      signalOperationalFailure('owner_income_exception_visibility_failed', {
        correlationId: paymentId,
        paymentId,
        companyId: companyId || undefined,
        failureClass: classifyOperationalFailure(visibilityError),
        error: message.slice(0, 200)
      });
    }
    return false;
  }
}

function asState(value: AccountingArtifactResult): ReversalProgress[keyof ReversalProgress] {
  if (value === 'failed') return 'failed';
  if (value === 'posted') return 'active';
  if (value === 'reversed' || value === 'already_applied') return 'reversed';
  return 'absent';
}

/**
 * Single write-side entry for posting a completed payment to every ledger.
 * Failures enqueue retryable LedgerEvents and are never swallowed as HTTP success
 * without an observable event.
 */
export async function postPaymentAccounting(
  paymentId: string,
  opts?: { createdBy?: string }
): Promise<PaymentPostingResult> {
  const errors: string[] = [];
  const artifacts: Record<string, AccountingArtifactResult> = {};
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    return { paymentId, status: 'failed', reason: 'missing_payment', artifacts, errors: ['Payment not found'] };
  }

  const policy = evaluatePermanentAccountingPolicy(payment);
  if (!policy.allowed) {
    if (policy.reason === 'deposit_only') {
      await individualTaxMetadataService.safeAttachForPayment(paymentId);
    }
    return {
      paymentId,
      status: 'skipped',
      reason: policy.reason,
      artifacts: {
        ownerIncome: 'skipped',
        agentCommission: 'skipped',
        companyCommission: 'skipped',
        journal: 'skipped',
        trust: 'skipped'
      },
      errors: []
    };
  }

  if (!policy.skipOwnerIncome) {
    try {
      throwOnceIfArmed(paymentId, String((payment as any).notes || ''), 'PHASE_FAIL_OWNER_INCOME');
      await propertyAccountService.recordIncomeFromPayment(paymentId);
      artifacts.ownerIncome = 'posted';
    } catch (e: any) {
      artifacts.ownerIncome = 'failed';
      errors.push(`ownerIncome: ${e?.message || e}`);
      if (e instanceof OwnerIncomeAmountMissingError || e?.code === 'OWNER_INCOME_AMOUNT_MISSING') {
        const durable = await persistOwnerIncomeFailure(
          payment,
          e?.message || String(e),
          String((payment as any).notes || '')
        );
        if (!durable) {
          errors.push('ownerIncome.exception: the owner-income failure was not durably recorded');
        }
      }
      if (!isPermanentAccountingFailure(e)) {
        try {
          await ledgerEventService.enqueueOwnerIncomeEvent(paymentId);
        } catch (enqueueErr: any) {
          errors.push(`ownerIncome.enqueue: ${enqueueErr?.message || enqueueErr}`);
        }
      }
    }
  } else {
    artifacts.ownerIncome = 'skipped';
  }

  if (!policy.skipAgentCommission) {
    try {
      throwOnceIfArmed(paymentId, String((payment as any).notes || ''), 'PHASE_FAIL_AGENT_COMMISSION');
      await agentAccountService.syncCommissionForPayment(paymentId);
      artifacts.agentCommission = 'posted';
    } catch (e: any) {
      artifacts.agentCommission = 'failed';
      errors.push(`agentCommission: ${e?.message || e}`);
      try {
        await ledgerEventService.enqueueEvent('agent_commission', paymentId);
      } catch (enqueueErr: any) {
        errors.push(`agentCommission.enqueue: ${enqueueErr?.message || enqueueErr}`);
      }
    }
  } else {
    artifacts.agentCommission = 'skipped';
  }

  if (!policy.skipCompanyCommission) {
    try {
      throwOnceIfArmed(paymentId, String((payment as any).notes || ''), 'PHASE_FAIL_COMPANY_COMMISSION');
      await accountingIntegrationService.postCompanyCommission(payment as any);
      artifacts.companyCommission = 'posted';
    } catch (e: any) {
      artifacts.companyCommission = 'failed';
      errors.push(`companyCommission: ${e?.message || e}`);
      try {
        await ledgerEventService.enqueueEvent('company_commission', paymentId);
      } catch (enqueueErr: any) {
        errors.push(`companyCommission.enqueue: ${enqueueErr?.message || enqueueErr}`);
      }
    }
  } else {
    artifacts.companyCommission = 'skipped';
  }

  if (!policy.skipJournal) {
    try {
      const journalSeamKey = String(paymentId);
      const journalSeams = (global as any).__phase26JournalSeam || ((global as any).__phase26JournalSeam = new Set<string>());
      if (
        process.env.NODE_ENV !== 'production' &&
        process.env.MANTIS_TEST_SEAM === '1' &&
        String((payment as any).notes || '').includes('PHASE26_FAIL_JOURNAL') &&
        !journalSeams.has(journalSeamKey)
      ) {
        journalSeams.add(journalSeamKey);
        throw new Error('PHASE26_FAIL_JOURNAL');
      }
      await accountingIntegrationService.syncPaymentReceived(payment as any, { createdBy: opts?.createdBy });
      artifacts.journal = 'posted';
    } catch (e: any) {
      artifacts.journal = 'failed';
      errors.push(`journal: ${e?.message || e}`);
      if (!isPermanentAccountingFailure(e)) {
        try {
          await ledgerEventService.enqueueEvent('journal', paymentId);
        } catch (enqueueErr: any) {
          errors.push(`journal.enqueue: ${enqueueErr?.message || enqueueErr}`);
        }
      }
    }
  } else {
    artifacts.journal = 'skipped';
  }

  const failed = Object.values(artifacts).some((v) => v === 'failed');
  const posted = Object.values(artifacts).some((v) => v === 'posted');
  const status: PaymentPostingResult['status'] = failed ? (posted ? 'partial' : 'failed') : 'posted';
  if (failed) {
    logger.warn('Payment accounting post incomplete', { paymentId, artifacts, errors });
  }
  const company = await Company.findById(payment.companyId).select('workspaceType plan').lean();
  if ((company as any)?.workspaceType === 'individual' || (company as any)?.plan === 'INDIVIDUAL') {
    await individualTaxMetadataService.safeAttachForPayment(paymentId);
  }
  return { paymentId, status, artifacts, errors, reason: policy.reason };
}

/**
 * Comprehensive, idempotent reversal of every payment-derived ledger artifact.
 * Safe to call from the reverse controller, change stream, and LedgerEvent retry.
 */
export async function reversePaymentAccounting(
  paymentId: string,
  opts?: { processedBy?: string; reason?: string; reversalPaymentId?: string }
): Promise<PaymentReversalResult> {
  const errors: string[] = [];
  const artifacts: Record<string, AccountingArtifactResult> = {};
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    return { paymentId, status: 'failed', artifacts, errors: ['Payment not found'] };
  }
  if (!shouldAttemptAccountingReversal(payment) && String(payment.status) !== 'reversed') {
    // Still allow explicit reversal of a completed payment whose status flip already committed.
    if (String(payment.status) !== 'completed' && String(payment.postingStatus) !== 'reversed') {
      return { paymentId, status: 'failed', artifacts, errors: ['Payment is not in a reversible state'] };
    }
  }

  try {
    throwOnceIfArmed(paymentId, `${String((payment as any).notes || '')} ${String(opts?.reason || '')}`, 'PHASE_FAIL_REVERSAL_OWNER');
    const income = await propertyAccountService.reverseIncomeFromPayment(paymentId, {
      processedBy: opts?.processedBy,
      reason: opts?.reason
    });
    artifacts.ownerIncome = income.countered ? 'reversed' : 'skipped';
    artifacts.configuredExpense = 'reversed';
    artifacts.passThrough = 'reversed';
  } catch (e: any) {
    artifacts.ownerIncome = 'failed';
    artifacts.configuredExpense = 'failed';
    artifacts.passThrough = 'failed';
    errors.push(`propertyAccount: ${e?.message || e}`);
  }

  try {
    await agentAccountService.reverseCommissionForPayment(paymentId, opts?.reason);
    artifacts.agentCommission = 'reversed';
  } catch (e: any) {
    artifacts.agentCommission = 'failed';
    errors.push(`agentCommission: ${e?.message || e}`);
  }

  try {
    artifacts.companyCommission = await accountingIntegrationService.postCompanyCommissionReversal(payment as any, {
      createdBy: opts?.processedBy,
      reason: opts?.reason,
      reversalPaymentId: opts?.reversalPaymentId
    });
  } catch (e: any) {
    artifacts.companyCommission = 'failed';
    errors.push(`companyCommission: ${e?.message || e}`);
  }

  try {
    artifacts.journal = await accountingIntegrationService.postReversalJournal(payment as any, {
      createdBy: opts?.processedBy,
      reason: opts?.reason
    });
  } catch (e: any) {
    artifacts.journal = 'failed';
    errors.push(`journal: ${e?.message || e}`);
  }

  try {
    artifacts.tax = await reversePaymentTaxObligations({
      companyId: String(payment.companyId),
      paymentId,
      createdBy: opts?.processedBy,
      reason: opts?.reason,
      notes: String((payment as any).notes || '')
    });
    artifacts.vatRecord = await accountingIntegrationService.reversePaymentVatRecord(payment as any);
  } catch (e: any) {
    artifacts.tax = 'failed';
    errors.push(`tax: ${e?.message || e}`);
  }

  if (mayPostSaleTrust(payment as any)) {
    try {
      const trustResult = await trustPaymentPostingService.reverseBuyerPaymentInTrust({
        paymentId,
        reversalPaymentId: opts?.reversalPaymentId,
        companyId: String(payment.companyId),
        performedBy: opts?.processedBy,
        reason: opts?.reason,
        sourceEvent: 'payment.reversed'
      });
      artifacts.trust = (trustResult as any)?.skipped ? 'skipped' : 'reversed';
    } catch (e: any) {
      artifacts.trust = 'failed';
      errors.push(`trust: ${e?.message || e}`);
    }
  } else {
    artifacts.trust = 'skipped';
  }

  const progress: ReversalProgress = {
    ownerIncome: asState(artifacts.ownerIncome || 'absent'),
    configuredExpense: asState(artifacts.configuredExpense || 'absent'),
    companyCommission: asState(artifacts.companyCommission || 'absent'),
    agentCommission: asState(artifacts.agentCommission || 'absent'),
    trust: asState(artifacts.trust || 'absent'),
    journal: asState(artifacts.journal || 'absent')
  };
  let status = classifyReversalOutcome(progress);
  if (artifacts.tax === 'failed') status = status === 'failed' ? 'failed' : 'partial';
  if (errors.length && status === 'reversed') status = 'partial';
  if (errors.length && status === 'already_reversed') status = 'partial';

  if (status === 'partial' || status === 'failed') {
    try {
      await ledgerEventService.enqueueEvent('payment_reversal', paymentId, {
        reversalPaymentId: opts?.reversalPaymentId,
        reason: opts?.reason
      });
    } catch (enqueueErr: any) {
      errors.push(`reversal.enqueue: ${enqueueErr?.message || enqueueErr}`);
    }
    logger.warn('Payment accounting reversal incomplete', { paymentId, artifacts, errors });
  }

  const company = await Company.findById(payment.companyId).select('workspaceType plan').lean();
  if ((company as any)?.workspaceType === 'individual' || (company as any)?.plan === 'INDIVIDUAL') {
    await individualVatService.safeReverseForSource({
      companyId: String(payment.companyId),
      sourceType: 'Payment',
      sourceId: paymentId,
      reason: opts?.reason,
      reversalTransactionId: opts?.reversalPaymentId,
      userId: opts?.processedBy
    });
    await individualRentalTaxService.safeReverseForSource({
      companyId: String(payment.companyId),
      sourceType: 'Payment',
      sourceId: paymentId,
      reason: opts?.reason,
      reversalTransactionId: opts?.reversalPaymentId,
      userId: opts?.processedBy
    });
    await individualIncomeTaxService.safeReverseForSource({
      companyId: String(payment.companyId),
      sourceType: 'Payment',
      sourceId: paymentId,
      reason: opts?.reason,
      reversalTransactionId: opts?.reversalPaymentId,
      userId: opts?.processedBy
    });
  }

  const reversalComplete = status === 'reversed' || status === 'already_reversed';
  const reversalState = reversalComplete ? 'reversed' : 'reversal_incomplete';
  if (!reversalComplete) {
    signalOperationalFailure('reversal_incomplete', {
      paymentId,
      companyId: payment.companyId ? String(payment.companyId) : undefined,
      status
    });
  }
  const reversalPaymentId = opts?.reversalPaymentId || (payment as any).reversalPaymentId;
  await Payment.updateOne({ _id: payment._id }, { $set: { reversalState } });
  if (reversalPaymentId) {
    await Payment.updateOne(
      { _id: reversalPaymentId },
      { $set: { reversalState, accountingComplete: reversalComplete, status: 'completed' } }
    );
  }

  return { paymentId, status, artifacts, errors };
}

export default {
  postPaymentAccounting,
  reversePaymentAccounting
};
