import mongoose from 'mongoose';
import { AccountingException } from '../models/AccountingException';
import { Payment } from '../models/Payment';
import LedgerEvent from '../models/LedgerEvent';
import { LEDGER_RETRY_LIMIT } from './ledgerEventStateMachine';

/**
 * One open financial_review row per company, component, and operation id.
 * Repeating detection updates that row. It does not insert another copy.
 */
export async function upsertFinancialReview(input: {
  companyId: string;
  component: string;
  operationId: string;
  paymentId?: string;
  amount?: number;
  missingRecord: string;
  issueType: 'missing' | 'mismatched';
  recommendedReview: string;
  actual?: string;
}): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(input.companyId)) return;
  const now = new Date();
  const companyId = new mongoose.Types.ObjectId(input.companyId);
  const paymentId = input.paymentId && mongoose.Types.ObjectId.isValid(input.paymentId)
    ? new mongoose.Types.ObjectId(input.paymentId)
    : undefined;
  await AccountingException.updateOne(
    {
      kind: 'financial_review',
      companyId,
      component: input.component,
      'accountingRef.transactionId': input.operationId
    },
    {
      $set: {
        status: 'open',
        issueType: input.issueType,
        component: input.component,
        expected: input.amount,
        actual: input.actual || input.missingRecord,
        companyId,
        error: input.recommendedReview,
        missingComponents: [input.missingRecord],
        lastCheckedAt: now,
        accountingRef: { collection: input.component, transactionId: input.operationId },
        ...(paymentId ? { paymentId } : {})
      },
      $setOnInsert: {
        kind: 'financial_review',
        detectedAt: now
      },
      $unset: { resolvedAt: 1, resolvedBy: 1, resolution: 1 }
    },
    { upsert: true }
  );
}

export async function resolveFinancialReview(
  companyId: string,
  component: string,
  operationId: string,
  resolution: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) return;
  await AccountingException.updateOne(
    {
      kind: 'financial_review',
      companyId: new mongoose.Types.ObjectId(companyId),
      component,
      'accountingRef.transactionId': operationId,
      status: 'open'
    },
    {
      $set: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolution,
        lastCheckedAt: new Date()
      }
    }
  );
}

export async function flagExhaustedLedgerEvents(companyId: string): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) return 0;
  const companyObjectId = new mongoose.Types.ObjectId(companyId);
  const payments = await Payment.find({ companyId: companyObjectId }).select('_id referenceNumber amount').limit(500).lean();
  const paymentIds = payments.map((row) => row._id);
  const events = await LedgerEvent.find({
    status: 'failed',
    $and: [
      { $or: [{ companyId: companyObjectId }, { paymentId: { $in: paymentIds } }] },
      {
        $or: [
          { attemptCount: { $gte: LEDGER_RETRY_LIMIT } },
          { failureClass: { $in: ['permanent', 'conflict'] } }
        ]
      }
    ]
  }).limit(100).lean();

  for (const event of events as any[]) {
    const payment = payments.find((row) => String(row._id) === String(event.paymentId));
    const failureClass = String(event.failureClass || 'transient');
    const operationId = String(event._id);
    await upsertFinancialReview({
      companyId,
      component: 'LEDGER_RETRY_EXHAUSTED',
      operationId,
      paymentId: event.paymentId ? String(event.paymentId) : undefined,
      amount: payment ? Number((payment as any).amount || 0) : undefined,
      missingRecord: `ledger event ${event.type}`,
      issueType: 'missing',
      actual: failureClass,
      recommendedReview: `Ledger event ${operationId} for company ${companyId} is ${failureClass} after ${event.attemptCount || 0} attempts. Source ${event.paymentId || event.levyPaymentId || 'unknown'}. Correlation ${event.correlationId || event.paymentId || operationId}. Reason: ${String(event.lastError || 'unknown').slice(0, 180)}. A transient failure can be retried as the same operation. Do not create a new financial record and do not rewrite historical amounts.`
    });
  }
  return events.length;
}
