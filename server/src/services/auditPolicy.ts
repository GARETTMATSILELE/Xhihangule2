import { upsertFinancialReview } from './financialOperationVisibility';
import { signalOperationalFailure } from './operationalSignal';

export type AuditCategory = 'A_BEFORE_EFFECT' | 'B_AFTER_EFFECT' | 'C_DIAGNOSTIC';

/**
 * Category A must be persisted before the effect starts.
 * Category B records a gap after the effect and does not repeat it.
 * Category C is diagnostic. A failed insert is logged and the caller continues.
 */
export const AUDIT_OPERATION_POLICY: { action: string; category: AuditCategory; rule: string }[] = [
  {
    action: 'ledger.retry',
    category: 'A_BEFORE_EFFECT',
    rule: 'The started audit is required before the ledger event is claimed. A missing completion audit keeps the financial outcome and records AUDIT_EVENT_MISSING.'
  },
  {
    action: 'payment.verified',
    category: 'A_BEFORE_EFFECT',
    rule: 'Subscription activation does not start when this audit event cannot be stored. The callback receipt stays failed so a later delivery can retry.'
  },
  {
    action: 'checkout.failed',
    category: 'B_AFTER_EFFECT',
    rule: 'The session is already failed. A missing audit does not select another session or reactivate this one.'
  },
  {
    action: 'checkout.cancelled',
    category: 'B_AFTER_EFFECT',
    rule: 'The session is already cancelled. A missing audit does not reactivate it.'
  },
  {
    action: 'registration.expired',
    category: 'B_AFTER_EFFECT',
    rule: 'The company archive is already saved. A missing audit does not restore the company.'
  },
  {
    action: 'registration.archived',
    category: 'B_AFTER_EFFECT',
    rule: 'The archive is already saved. A missing audit does not repeat the archive.'
  },
  {
    action: 'registration.email_released',
    category: 'B_AFTER_EFFECT',
    rule: 'The email release is already saved. A missing audit does not repeat it.'
  },
  {
    action: 'auth.login',
    category: 'C_DIAGNOSTIC',
    rule: 'Login already succeeded. A missing audit is logged and does not undo the session.'
  },
  {
    action: 'auth.logout',
    category: 'C_DIAGNOSTIC',
    rule: 'Logout continues when the audit insert fails.'
  },
  {
    action: 'auth.signup',
    category: 'C_DIAGNOSTIC',
    rule: 'The user row is already saved. A missing audit does not delete it.'
  },
  {
    action: 'maintenance.work_order.create',
    category: 'C_DIAGNOSTIC',
    rule: 'The work order is already saved. A missing audit does not delete it.'
  },
  {
    action: 'owner.document.upload',
    category: 'C_DIAGNOSTIC',
    rule: 'The document is already saved. A missing audit does not delete it.'
  }
];

const FINANCIAL_AUDIT_ACTIONS = new Set(['checkout.failed', 'checkout.cancelled', 'ledger.retry']);

/**
 * One review row for a financial action whose effect is already stored.
 * A failed review write is logged once. This does not post accounting again.
 */
export async function noteMissingAudit(input: {
  action: string;
  companyId?: string;
  entityId?: string;
  operationId: string;
  paymentId?: string;
}): Promise<void> {
  signalOperationalFailure('AUDIT_EVENT_MISSING', {
    action: input.action,
    companyId: input.companyId,
    entityId: input.entityId,
    operationId: input.operationId
  });
  if (!input.companyId || !FINANCIAL_AUDIT_ACTIONS.has(input.action)) return;
  try {
    await upsertFinancialReview({
      companyId: input.companyId,
      component: 'AUDIT_EVENT_MISSING',
      operationId: input.operationId,
      paymentId: input.paymentId,
      missingRecord: `${input.action} audit event`,
      issueType: 'missing',
      recommendedReview: `${input.action} kept its stored outcome and the audit event was not stored. Do not repeat the financial operation.`
    });
  } catch (error) {
    signalOperationalFailure('audit_gap_unpersisted', {
      action: input.action,
      companyId: input.companyId,
      operationId: input.operationId,
      error: String((error as { message?: string })?.message || error).slice(0, 200)
    });
  }
}
