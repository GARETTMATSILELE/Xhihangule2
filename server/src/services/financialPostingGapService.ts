import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { VatRecord } from '../models/VatRecord';
import { TaxObligation } from '../models/TaxObligation';
import { AccountingException } from '../models/AccountingException';
import PropertyAccount from '../models/PropertyAccount';
import { evaluatePermanentAccountingPolicy } from './accountingPostingPolicy';
import { roundMoney } from '../utils/money';

export type FinancialPostingGap = {
  companyId: string;
  paymentId: string;
  reference: string;
  amount: number;
  missingRecord: string;
  issueType: string;
  recommendedReview: string;
};

const money = (value: unknown) => roundMoney(Number(value || 0));

function gap(payment: any, missingRecord: string, issueType: string): FinancialPostingGap {
  const companyId = String(payment.companyId || '');
  const reference = String(payment.referenceNumber || payment._id);
  const amount = money(payment.amount);
  return {
    companyId,
    paymentId: String(payment._id),
    reference,
    amount,
    missingRecord,
    issueType,
    recommendedReview: `Review payment ${reference} for company ${companyId}, amount ${amount.toFixed(2)}. Missing or inconsistent record: ${missingRecord}. Do not rewrite historical amounts. Recover only through the existing accounting pipeline after an accountant approves it.`
  };
}

/**
 * Detection only. Does not create journals, obligations, VAT rows, or payment corrections.
 */
export async function detectFinancialPostingGaps(companyId: string, limit = 200): Promise<FinancialPostingGap[]> {
  const detected = await inspectFinancialPostingGaps(companyId, limit);
  return detected.findings;
}

async function inspectFinancialPostingGaps(companyId: string, limit = 200): Promise<{ findings: FinancialPostingGap[]; scannedPaymentIds: string[] }> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) return { findings: [], scannedPaymentIds: [] };
  const companyObjectId = new mongoose.Types.ObjectId(companyId);
  const findings: FinancialPostingGap[] = [];
  const payments = await Payment.find({
    companyId: companyObjectId,
    status: { $in: ['completed', 'reversed'] },
    isProvisional: { $ne: true }
  })
    .select('_id companyId referenceNumber amount status accountingComplete accountingStatus reversalState reversalOfPaymentId commissionDetails paymentType depositAmount')
    .sort({ updatedAt: -1 })
    .limit(Math.max(1, Math.min(limit, 200)))
    .lean();

  const originals = (payments as any[]).filter((row) => !row.reversalOfPaymentId);
  const ids = originals.map((row) => String(row._id));
  const [journals, vatRecords, obligations] = await Promise.all([
    JournalEntry.find({
      companyId: companyObjectId,
      sourceId: { $in: ids.concat(ids.map((id) => `${id}:reversal`)) },
      status: 'posted'
    }).select('_id sourceId companyId').lean(),
    VatRecord.find({
      companyId: companyObjectId,
      transactionId: { $in: ids }
    }).select('transactionId vatCollected status').lean(),
    TaxObligation.find({
      companyId: companyObjectId,
      paymentId: { $in: originals.map((row) => row._id) },
      taxType: 'VAT_ON_COMMISSION'
    }).select('paymentId taxAmount status reversalOf').lean()
  ]);

  const journalBySource = new Map((journals as any[]).map((row) => [String(row.sourceId), row]));
  const vatByPayment = new Map((vatRecords as any[]).map((row) => [String(row.transactionId), row]));
  const obligationsByPayment = new Map<string, any[]>();
  for (const row of obligations as any[]) {
    const key = String(row.paymentId);
    const list = obligationsByPayment.get(key) || [];
    list.push(row);
    obligationsByPayment.set(key, list);
  }

  for (const payment of originals) {
    const policy = evaluatePermanentAccountingPolicy(payment);
    const paymentId = String(payment._id);
    const journal = journalBySource.get(paymentId);
    const vat = money(payment.commissionDetails?.vatOnCommission ?? payment.commissionDetails?.vatAmount ?? 0);
    const linked = obligationsByPayment.get(paymentId) || [];
    const originalObligations = linked.filter((row) => row.reversalOf == null);
    const activeObligations = originalObligations.filter((row) => row.status !== 'REVERSED');
    const reversalJournal = journalBySource.get(`${paymentId}:reversal`);

    if (policy.allowed && !policy.skipJournal && money(payment.amount) > 0 && !journal) {
      findings.push(gap(payment, 'accounting journal', payment.accountingComplete === true
        ? 'ACCOUNTING_COMPLETE_WITHOUT_JOURNAL'
        : 'MISSING_JOURNAL'));
    }
    if (vat > 0 && !vatByPayment.get(paymentId) && activeObligations.length > 0) {
      findings.push(gap(payment, 'VAT collection record', 'VAT_COLLECTION_WITHOUT_RECORD'));
    }
    if (vat > 0 && activeObligations.length === 0 && !originalObligations.some((row) => row.status === 'REVERSED')) {
      findings.push(gap(payment, 'VAT tax obligation', 'MISSING_TAX_OBLIGATION'));
    }
    if (originalObligations.length > 1) {
      findings.push(gap(payment, 'original VAT tax obligation', 'DUPLICATE_ORIGINAL_OBLIGATION'));
    }
    const reversalCount = linked.filter((row) => row.reversalOf != null).length;
    if (reversalCount > originalObligations.length && originalObligations.length > 0) {
      findings.push(gap(payment, 'reversal tax obligation', 'DUPLICATE_REVERSAL_OBLIGATION'));
    }
    if (originalObligations.some((row) => row.status === 'REVERSED') && reversalCount === 0) {
      findings.push(gap(payment, 'reversal tax obligation', 'INCOMPLETE_REVERSAL'));
    }
    if (String(payment.reversalState || '') === 'reversal_incomplete' || (String(payment.status) === 'reversed' && journal && !reversalJournal)) {
      findings.push(gap(payment, 'reversal journal', 'INCOMPLETE_REVERSAL'));
    }
    if (journal && money(payment.amount) > 0) {
      const lines = await JournalLine.find({ journalEntryId: journal._id }).select('debit').lean();
      const debit = money((lines as any[]).reduce((sum, line) => sum + Number(line.debit || 0), 0));
      if (Math.abs(debit - money(payment.amount)) > 0.05) {
        findings.push(gap(payment, 'payment-to-journal amount', 'PAYMENT_JOURNAL_MISMATCH'));
      }
    }
    if (vat > 0 && activeObligations.length === 1 && Math.abs(money(activeObligations[0].taxAmount) - vat) > 0.05) {
      findings.push(gap(payment, 'VAT snapshot to tax obligation', 'SNAPSHOT_OBLIGATION_MISMATCH'));
    }
    const tracked = payment.accountingComplete != null || Boolean(payment.accountingStatus);
    if (tracked && policy.allowed && !policy.skipOwnerIncome && money(payment.amount) > 0) {
      const ownerAmount = money(payment.commissionDetails?.ownerAmount);
      if (ownerAmount <= 0) {
        findings.push(gap(payment, 'owner income amount', 'OWNER_INCOME_AMOUNT_MISSING'));
      } else {
        const income = await PropertyAccount.findOne({
          'transactions.idempotencyKey': `payment:${paymentId}`
        }).select('_id').lean();
        if (!income) {
          findings.push(gap(payment, 'owner income projection', 'OWNER_INCOME_PROJECTION_MISSING'));
        }
      }
    }
  }

  const reversalDupes = await TaxObligation.aggregate([
    { $match: { companyId: companyObjectId, reversalOf: { $type: 'objectId' } } },
    { $group: { _id: '$reversalOf', n: { $sum: 1 }, paymentId: { $first: '$paymentId' }, taxAmount: { $first: '$taxAmount' } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 50 }
  ]);
  for (const row of reversalDupes) {
    const payment = originals.find((item) => String(item._id) === String(row.paymentId));
    if (!payment) continue;
    if (findings.some((item) => item.paymentId === String(payment._id) && item.issueType === 'DUPLICATE_REVERSAL_OBLIGATION')) continue;
    findings.push(gap(payment, 'reversal tax obligation', 'DUPLICATE_REVERSAL_OBLIGATION'));
  }

  return { findings, scannedPaymentIds: originals.map((row) => String(row._id)) };
}

export async function flagFinancialPostingGaps(companyId: string): Promise<number> {
  const detected = await inspectFinancialPostingGaps(companyId);
  const findings = detected.findings;
  const scanned = new Set(detected.scannedPaymentIds);
  const now = new Date();
  const seen = new Set<string>();
  for (const finding of findings) {
    const key = `${finding.paymentId}:${finding.issueType}`;
    seen.add(key);
    await AccountingException.updateOne(
      {
        kind: 'financial_review',
        paymentId: new mongoose.Types.ObjectId(finding.paymentId),
        component: finding.issueType
      },
      {
        $set: {
          status: 'open',
          issueType: finding.issueType.includes('MISMATCH') || finding.issueType.includes('DUPLICATE') ? 'mismatched' : 'missing',
          component: finding.issueType,
          expected: finding.amount,
          actual: finding.missingRecord,
          companyId: new mongoose.Types.ObjectId(finding.companyId),
          error: finding.recommendedReview,
          missingComponents: [finding.missingRecord],
          lastCheckedAt: now
        },
        $setOnInsert: {
          kind: 'financial_review',
          paymentId: new mongoose.Types.ObjectId(finding.paymentId),
          detectedAt: now
        },
        $unset: { resolvedAt: 1, resolvedBy: 1, resolution: 1 }
      },
      { upsert: true }
    );
  }

  const open = await AccountingException.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    kind: 'financial_review',
    status: 'open'
  }).select('_id paymentId component').lean();
  for (const row of open as any[]) {
    if (!scanned.has(String(row.paymentId))) continue;
    const key = `${String(row.paymentId)}:${String(row.component)}`;
    if (seen.has(key)) continue;
    await AccountingException.updateOne(
      { _id: row._id },
      { $set: { status: 'resolved', resolvedAt: now, resolution: 'Detection no longer reports this gap. Financial records were not changed.', lastCheckedAt: now } }
    );
  }
  return findings.length;
}
