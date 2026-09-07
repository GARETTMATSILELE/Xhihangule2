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
import {
  classifyReversalOutcome,
  ReversalProgress
} from './ledgerEventStateMachine';

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
      await propertyAccountService.recordIncomeFromPayment(paymentId);
      artifacts.ownerIncome = 'posted';
    } catch (e: any) {
      artifacts.ownerIncome = 'failed';
      errors.push(`ownerIncome: ${e?.message || e}`);
      try {
        await ledgerEventService.enqueueOwnerIncomeEvent(paymentId);
      } catch (enqueueErr: any) {
        errors.push(`ownerIncome.enqueue: ${enqueueErr?.message || enqueueErr}`);
      }
    }
  } else {
    artifacts.ownerIncome = 'skipped';
  }

  if (!policy.skipAgentCommission) {
    try {
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
      await accountingIntegrationService.syncPaymentReceived(payment as any, { createdBy: opts?.createdBy });
      artifacts.journal = 'posted';
    } catch (e: any) {
      artifacts.journal = 'failed';
      errors.push(`journal: ${e?.message || e}`);
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
    await propertyAccountService.reverseIncomeFromPayment(paymentId, {
      processedBy: opts?.processedBy,
      reason: opts?.reason
    });
    artifacts.ownerIncome = 'reversed';
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
    await accountingIntegrationService.syncPaymentReversed(payment as any, {
      createdBy: opts?.processedBy,
      reason: opts?.reason
    });
    artifacts.journal = 'reversed';
    artifacts.companyCommission = 'reversed';
  } catch (e: any) {
    artifacts.journal = 'failed';
    artifacts.companyCommission = 'failed';
    errors.push(`journal/company: ${e?.message || e}`);
  }

  const progress: ReversalProgress = {
    ownerIncome: asState(artifacts.ownerIncome || 'absent'),
    configuredExpense: asState(artifacts.configuredExpense || 'absent'),
    companyCommission: asState(artifacts.companyCommission || 'absent'),
    agentCommission: asState(artifacts.agentCommission || 'absent'),
    trust: 'absent',
    journal: asState(artifacts.journal || 'absent')
  };
  let status = classifyReversalOutcome(progress);
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

  return { paymentId, status, artifacts, errors };
}

export default {
  postPaymentAccounting,
  reversePaymentAccounting
};
