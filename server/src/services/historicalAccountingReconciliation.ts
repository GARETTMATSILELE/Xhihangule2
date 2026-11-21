import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { HistoricalAccountingRepair } from '../models/HistoricalAccountingRepair';
import { findPeriodForDate } from './accountingPeriodService';
import { assessVatPayableJournal } from './vatPolicyService';
import { postPaymentAccounting } from './paymentAccountingOrchestrator';
import {
  buildExpectedAccountingProjection,
  type AccountingActualSnapshot,
  type ExpectedAccountingProjection
} from './paymentAccountingProjection';
import { loadAccountingActualSnapshot } from './paymentAccountingReconciliation';
import { commissionRateDisagrees, receiptExplainedByCommissionSnapshot } from './accountingIntegrityClassification';
import { canonicalReceiptJournalBalance } from './journalRecoveryAssessment';
import { isDepositOnlyPayment } from './accountingPostingPolicy';
import { isReversalDocument } from './paymentReversalPolicy';
import { allocateRentalReceipt } from './tax/paymentAllocation';
import { buildAgentReceiptJournal } from './tax/principalAgentJournal';
import { historicalTransactionDomain } from './transactionDomain';
import { roundMoney } from '../utils/money';
import mongoose from 'mongoose';

export const REPAIR_CLASSES = [
  'SAFE TO REPAIR',
  'REQUIRES ACCOUNTANT APPROVAL',
  'REQUIRES MANUAL INVESTIGATION',
  'ALREADY COMPLETE',
  'DUPLICATE SUSPECTED',
  'FINANCIAL MISMATCH',
  'HISTORICAL VAT REVIEW'
] as const;

export type RepairClass = (typeof REPAIR_CLASSES)[number];

const TOLERANCE = 0.05;

export type RepairAssessment = {
  paymentId: string;
  reference: string;
  propertyId: string;
  classification: RepairClass;
  confidence: 'high' | 'medium' | 'low';
  missing: string[];
  mismatched: string[];
  duplicates: string[];
  recordsToCreate: string[];
  amountsToPost: Record<string, number>;
  journalLines: Array<{ accountCode: string; debit: number; credit: number }> | null;
  journalBalanced: boolean;
  periodCode: string;
  vatEligibility: string;
  recommendedAction: string;
  fingerprint: string;
  writes: false;
};

function snapshotVat(payment: any): number {
  return roundMoney(Number(payment?.commissionDetails?.vatOnCommission ?? payment?.commissionDetails?.vatAmount ?? 0));
}

function duplicateNames(actual: AccountingActualSnapshot): string[] {
  const names: string[] = [];
  for (const [name, count] of Object.entries(actual.duplicates || {})) {
    if (Number(count) > 1) names.push(name);
  }
  if (actual.journalReferenceCollision) names.push('journal reference');
  return names;
}

function mismatchedNames(expected: ExpectedAccountingProjection, actual: AccountingActualSnapshot): string[] {
  const names: Array<'ownerIncome' | 'agentCommission' | 'companyCommission' | 'journal' | 'deposit'> = [
    'ownerIncome', 'agentCommission', 'companyCommission', 'journal', 'deposit'
  ];
  return names.filter((name) => {
    if (!actual[name] || actual.amounts?.[name] == null) return false;
    const expectedAmount = name === 'ownerIncome' && !expected.ownerIncome
      ? 0
      : roundMoney(Number(expected.amounts[name] || 0));
    return Math.abs(roundMoney(Number(actual.amounts?.[name])) - expectedAmount) > TOLERANCE;
  });
}

function missingNames(expected: ExpectedAccountingProjection, actual: AccountingActualSnapshot): string[] {
  const names: Array<'ownerIncome' | 'agentCommission' | 'companyCommission' | 'journal' | 'deposit'> = [
    'ownerIncome', 'agentCommission', 'companyCommission', 'journal', 'deposit'
  ];
  return names.filter((name) => expected[name] && !actual[name]);
}

function proposedJournal(payment: any): { lines: Array<{ accountCode: string; debit: number; credit: number }>; balanced: boolean } | null {
  const amount = roundMoney(Math.max(0, Number(payment?.amount || 0)));
  if (!(amount > 0)) return null;
  const details = payment?.commissionDetails || {};
  const levyAmount = roundMoney(Number(details.levy ?? payment?.levyAllocated ?? 0));
  const domain = historicalTransactionDomain(payment);
  const allocation = allocateRentalReceipt({
    amount,
    rent: roundMoney(Number(payment?.rentAllocated ?? details.commissionBase ?? amount - levyAmount)),
    levy: levyAmount,
    commissionBase: roundMoney(Number(details.commissionBase || 0)),
    commissionNet: roundMoney(Number(details.commissionNet || details.totalCommission || 0)),
    vatOnCommission: snapshotVat(payment)
  });
  const journal = buildAgentReceiptJournal({
    paymentType: domain === 'SALE' ? 'sale' : 'rental',
    amount,
    ownerAmount: allocation.ownerPayable,
    commissionNet: allocation.commissionNet,
    vatAmount: snapshotVat(payment) + roundMoney(Number(payment?.vatAmount || 0)),
    levyAmount: domain === 'SALE' ? 0 : allocation.levyPayable
  });
  return {
    lines: journal.lines.map((line) => ({
      accountCode: line.accountCode,
      debit: roundMoney(Number(line.debit || 0)),
      credit: roundMoney(Number(line.credit || 0))
    })),
    balanced: journal.balanced && canonicalReceiptJournalBalance(payment).balanced
  };
}

function finish(input: {
  payment: any;
  classification: RepairClass;
  confidence: RepairAssessment['confidence'];
  missing?: string[];
  mismatched?: string[];
  duplicates?: string[];
  recordsToCreate?: string[];
  amountsToPost?: Record<string, number>;
  journalLines?: RepairAssessment['journalLines'];
  journalBalanced?: boolean;
  periodCode: string;
  vatEligibility: string;
  recommendedAction: string;
}): RepairAssessment {
  const missing = input.missing || [];
  const recordsToCreate = input.recordsToCreate || [];
  const fingerprint = JSON.stringify({
    paymentId: String(input.payment?._id || ''),
    amount: roundMoney(Number(input.payment?.amount || 0)),
    deposit: roundMoney(Number(input.payment?.depositAmount || 0)),
    notes: String(input.payment?.notes || ''),
    snapshot: input.payment?.commissionDetails || null,
    missing,
    periodCode: input.periodCode,
    classification: input.classification
  });
  return {
    paymentId: String(input.payment?._id || ''),
    reference: String(input.payment?.referenceNumber || ''),
    propertyId: String(input.payment?.propertyId || ''),
    classification: input.classification,
    confidence: input.confidence,
    missing,
    mismatched: input.mismatched || [],
    duplicates: input.duplicates || [],
    recordsToCreate,
    amountsToPost: input.amountsToPost || {},
    journalLines: input.journalLines || null,
    journalBalanced: Boolean(input.journalBalanced),
    periodCode: input.periodCode,
    vatEligibility: input.vatEligibility,
    recommendedAction: input.recommendedAction,
    fingerprint,
    writes: false
  };
}

export function classifyHistoricalAccountingCase(input: {
  payment: any;
  expected: ExpectedAccountingProjection;
  actual: AccountingActualSnapshot;
  vatRecognise: boolean;
  vatReason: string;
  periodCode: string;
  rateDisagrees: boolean;
}): RepairAssessment {
  const payment = input.payment || {};
  const duplicates = duplicateNames(input.actual);
  const mismatched = mismatchedNames(input.expected, input.actual);
  const missing = missingNames(input.expected, input.actual);
  const explained = receiptExplainedByCommissionSnapshot(payment) || isDepositOnlyPayment(payment) || isReversalDocument(payment);
  const journal = missing.includes('journal') ? proposedJournal(payment) : null;
  const amounts = Object.fromEntries(missing.map((name) => [name, roundMoney(Number((input.expected.amounts as any)[name] || 0))]));

  if (isReversalDocument(payment) || input.expected.reason === 'reversed_original' || input.expected.reason === 'reversal_row') {
    return finish({
      payment,
      classification: 'REQUIRES MANUAL INVESTIGATION',
      confidence: 'low',
      periodCode: input.periodCode,
      vatEligibility: input.vatReason,
      recommendedAction: 'Reconcile the original receipt and its reversal together. Do not recreate the positive receipt.'
    });
  }
  if (isDepositOnlyPayment(payment) || input.expected.reason === 'deposit_only') {
    return finish({
      payment,
      classification: missing.includes('deposit') ? 'REQUIRES MANUAL INVESTIGATION' : 'ALREADY COMPLETE',
      confidence: missing.includes('deposit') ? 'low' : 'high',
      missing: missing.includes('deposit') ? ['deposit'] : [],
      periodCode: input.periodCode,
      vatEligibility: 'not_applicable',
      recommendedAction: 'Deposit-only cash is not rental income or rental commission. No rental projection is proposed.'
    });
  }
  if (duplicates.length) {
    return finish({
      payment,
      classification: 'DUPLICATE SUSPECTED',
      confidence: 'low',
      duplicates,
      periodCode: input.periodCode,
      vatEligibility: input.vatReason,
      recommendedAction: 'An equivalent record already exists. Do not create another journal or projection.'
    });
  }
  if (mismatched.length) {
    return finish({
      payment,
      classification: 'FINANCIAL MISMATCH',
      confidence: 'low',
      mismatched,
      periodCode: input.periodCode,
      vatEligibility: input.vatReason,
      recommendedAction: 'An existing amount disagrees with the original snapshot. It is not replaced or deleted.'
    });
  }
  if (input.rateDisagrees) {
    return finish({
      payment,
      classification: 'REQUIRES MANUAL INVESTIGATION',
      confidence: 'low',
      periodCode: input.periodCode,
      vatEligibility: input.vatReason,
      recommendedAction: 'The stored commission rate is not changed by reconciliation. Review the original arrangement before any allocation change.'
    });
  }
  if (snapshotVat(payment) > 0.005 && !input.vatRecognise) {
    return finish({
      payment,
      classification: 'HISTORICAL VAT REVIEW',
      confidence: 'low',
      periodCode: input.periodCode,
      vatEligibility: input.vatReason,
      recommendedAction: 'Snapshot VAT is not authority for a liability. Use the separate historical VAT recognition workflow after the required evidence and approval.'
    });
  }
  if (!missing.length) {
    return finish({
      payment,
      classification: 'ALREADY COMPLETE',
      confidence: 'high',
      periodCode: input.periodCode,
      vatEligibility: input.vatReason,
      journalBalanced: input.actual.journal ? true : false,
      recommendedAction: 'The required records already exist and agree. Nothing is created.'
    });
  }
  if (!explained || (missing.includes('journal') && !journal?.balanced)) {
    return finish({
      payment,
      classification: 'REQUIRES MANUAL INVESTIGATION',
      confidence: 'low',
      missing,
      periodCode: input.periodCode,
      vatEligibility: input.vatReason,
      recommendedAction: 'The original snapshot does not support a balanced journal. No record is proposed.'
    });
  }
  if (input.periodCode !== 'OPEN') {
    return finish({
      payment,
      classification: 'REQUIRES ACCOUNTANT APPROVAL',
      confidence: 'medium',
      missing,
      recordsToCreate: missing,
      amountsToPost: amounts,
      journalLines: missing.includes('journal') ? journal?.lines || null : null,
      journalBalanced: Boolean(journal?.balanced),
      periodCode: input.periodCode,
      vatEligibility: input.vatReason,
      recommendedAction: 'The receipt period is not open. Do not post the missing record into a different open period, and do not reopen the historical period automatically.'
    });
  }
  return finish({
    payment,
    classification: 'SAFE TO REPAIR',
    confidence: 'high',
    missing,
    recordsToCreate: missing,
    amountsToPost: amounts,
    journalLines: missing.includes('journal') ? journal?.lines || null : null,
    journalBalanced: !missing.includes('journal') || Boolean(journal?.balanced),
    periodCode: input.periodCode,
    vatEligibility: input.vatReason,
    recommendedAction: 'Create only the missing records through the normal payment accounting workflow. Existing correct records stay untouched.'
  });
}

export async function assessHistoricalAccountingPayment(paymentId: string): Promise<RepairAssessment> {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment) {
    return finish({
      payment: { _id: paymentId },
      classification: 'REQUIRES MANUAL INVESTIGATION',
      confidence: 'low',
      periodCode: 'MISSING',
      vatEligibility: 'missing_payment',
      recommendedAction: 'Payment was not found. Nothing is created.'
    });
  }
  const [property, period, vat] = await Promise.all([
    (payment as any).propertyId ? Property.findById((payment as any).propertyId).select('commission').lean() : null,
    findPeriodForDate(String((payment as any).companyId), new Date((payment as any).paymentDate || Date.now())),
    assessVatPayableJournal({ payment })
  ]);
  const expected = buildExpectedAccountingProjection(payment);
  const actual = await loadAccountingActualSnapshot(payment);
  return classifyHistoricalAccountingCase({
    payment,
    expected,
    actual,
    vatRecognise: vat.recognise,
    vatReason: vat.reason,
    periodCode: period?.status === 'OPEN' ? 'OPEN' : (period?.status || 'PERIOD_NOT_ESTABLISHED'),
    rateDisagrees: commissionRateDisagrees(payment, (property as any)?.commission)
  });
}

export async function dryRunCompanyHistoricalAccounting(companyId: string): Promise<{
  investigated: number;
  counts: Record<RepairClass, number>;
  rows: RepairAssessment[];
  writes: false;
}> {
  const payments = await Payment.find({
    companyId,
    status: { $in: ['completed', 'reversed'] },
    isProvisional: { $ne: true },
    paymentType: { $ne: 'sale' }
  }).select('_id').limit(5000).lean();
  const rows: RepairAssessment[] = [];
  for (const payment of payments) {
    rows.push(await assessHistoricalAccountingPayment(String(payment._id)));
  }
  const counts = Object.fromEntries(REPAIR_CLASSES.map((name) => [name, 0])) as Record<RepairClass, number>;
  for (const row of rows) counts[row.classification] += 1;
  return { investigated: rows.length, counts, rows, writes: false };
}

export async function executeHistoricalAccountingRepair(input: {
  companyId: string;
  paymentId: string;
  authorisedBy: string;
  confirm: boolean;
  reason: string;
  fingerprint: string;
}): Promise<Record<string, unknown>> {
  if (input.confirm !== true) return { ok: false, result: 'aborted', reason: 'EXPLICIT_AUTHORISATION_REQUIRED', created: [] };
  const reason = String(input.reason || '').trim();
  if (reason.length < 10) return { ok: false, result: 'aborted', reason: 'REPAIR_REASON_REQUIRED', created: [] };
  const payment = await Payment.findOne({ _id: input.paymentId, companyId: input.companyId }).lean();
  if (!payment) return { ok: false, result: 'aborted', reason: 'PAYMENT_NOT_FOUND', created: [] };
  const assessment = await assessHistoricalAccountingPayment(String(payment._id));
  const snapshotBefore = JSON.stringify((payment as any).commissionDetails || null);
  if (assessment.classification !== 'SAFE TO REPAIR' || assessment.fingerprint !== input.fingerprint) {
    await HistoricalAccountingRepair.create({
      companyId: payment.companyId,
      paymentId: payment._id,
      referenceNumber: String((payment as any).referenceNumber || ''),
      propertyId: (payment as any).propertyId,
      classification: assessment.classification,
      fingerprint: assessment.fingerprint,
      originalState: { missing: assessment.missing, periodCode: assessment.periodCode },
      expectedState: { recordsToCreate: assessment.recordsToCreate, amountsToPost: assessment.amountsToPost },
      recordsCreated: [],
      amountsPosted: {},
      reason,
      authorisedBy: new mongoose.Types.ObjectId(input.authorisedBy),
      result: 'aborted',
      verification: assessment.fingerprint === input.fingerprint
        ? 'The receipt is not safe to repair.'
        : 'The receipt changed after the dry run. The repair was aborted.'
    });
    return {
      ok: false,
      result: 'aborted',
      reason: assessment.fingerprint === input.fingerprint ? assessment.classification : 'SOURCE_CHANGED',
      created: []
    };
  }
  const posted = await postPaymentAccounting(String(payment._id), { createdBy: input.authorisedBy });
  const after = await assessHistoricalAccountingPayment(String(payment._id));
  const snapshotAfter = JSON.stringify(((await Payment.findById(payment._id).select('commissionDetails').lean()) as any)?.commissionDetails || null);
  const created = assessment.recordsToCreate.filter((name) => !after.missing.includes(name));
  const snapshotPreserved = snapshotBefore === snapshotAfter;
  const verified = after.classification === 'ALREADY COMPLETE' && snapshotPreserved && posted.status !== 'failed';
  await HistoricalAccountingRepair.create({
    companyId: payment.companyId,
    paymentId: payment._id,
    referenceNumber: String((payment as any).referenceNumber || ''),
    propertyId: (payment as any).propertyId,
    classification: assessment.classification,
    fingerprint: assessment.fingerprint,
    originalState: { missing: assessment.missing },
    expectedState: { recordsToCreate: assessment.recordsToCreate, amountsToPost: assessment.amountsToPost, journalLines: assessment.journalLines },
    recordsCreated: created,
    amountsPosted: assessment.amountsToPost,
    reason,
    authorisedBy: new mongoose.Types.ObjectId(input.authorisedBy),
    result: verified ? 'posted' : 'failed',
    verification: verified
      ? 'Missing records now exist once. The original snapshot was not rewritten.'
      : `Post status ${posted.status}. Remaining missing: ${after.missing.join(', ') || 'none'}. Snapshot preserved: ${snapshotPreserved}.`
  });
  return {
    ok: verified,
    result: verified ? 'posted' : 'failed',
    created,
    snapshotPreserved,
    duplicateRunLeavesExistingRecords: true
  };
}
