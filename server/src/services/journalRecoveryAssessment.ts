import { roundMoney } from '../utils/money';
import { historicalTransactionDomain } from './transactionDomain';
import { allocateRentalReceipt } from './tax/paymentAllocation';
import { buildAgentReceiptJournal } from './tax/principalAgentJournal';
import { hasReversalInEffect, isReversalDocument } from './paymentReversalPolicy';

export type ReceiptJournalCandidate = {
  _id?: unknown;
  companyId?: unknown;
  sourceId?: unknown;
  sourceModule?: unknown;
  reference?: unknown;
  status?: unknown;
};

export type ReceiptJournalClassification = {
  ownJournal: ReceiptJournalCandidate | null;
  referenceCollision: { reference: string; otherPaymentId: string; journalId?: string } | null;
  otherCompanyReference: { reference: string; companyId: string; journalId?: string } | null;
};

export type RecoveryPeriodStatus = 'OPEN' | 'UNMANAGED' | 'SOFT_CLOSED' | 'CLOSED';

export type ControlledRecoveryAssessment = {
  eligible: boolean;
  manualReview: boolean;
  blockers: string[];
  checks: {
    financialWrites: false;
    existingOwnJournal: boolean;
    duplicateReceiptReference: boolean;
    otherCompanyReference: boolean;
    periodStatus: RecoveryPeriodStatus;
    journalBalanced: boolean;
    reversed: boolean;
    companyMatches: boolean;
  };
};

function idText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function receiptJournalSourceModule(payment: {
  transactionDomain?: unknown;
  paymentType?: unknown;
}): 'payment' | 'sale' | null {
  const domain = historicalTransactionDomain(payment);
  if (domain === 'SALE') return 'sale';
  if (domain === 'RENTAL') return 'payment';
  return null;
}

export function receiptJournalReference(payment: { _id?: unknown; referenceNumber?: unknown }): string {
  const paymentId = idText(payment?._id);
  const reference = String(payment?.referenceNumber || '').trim();
  return `PAY-${reference || paymentId}`;
}

/**
 * Match a receipt journal only when company, payment id, journal type, and posted status agree.
 * A journal that shares the receipt reference and belongs to another payment is reported and not adopted.
 */
export function classifyReceiptJournals(input: {
  paymentId: string;
  companyId: string;
  reference: string;
  sourceModule: 'payment' | 'sale' | null;
  journals: ReceiptJournalCandidate[];
}): ReceiptJournalClassification {
  const paymentId = String(input.paymentId);
  const companyId = String(input.companyId);
  let ownJournal: ReceiptJournalCandidate | null = null;
  let referenceCollision: ReceiptJournalClassification['referenceCollision'] = null;
  let otherCompanyReference: ReceiptJournalClassification['otherCompanyReference'] = null;

  for (const journal of input.journals) {
    const status = String(journal.status || 'posted');
    if (status !== 'posted') continue;
    const journalCompany = idText(journal.companyId);
    const sourceId = idText(journal.sourceId);
    const sourceModule = String(journal.sourceModule || '');
    const reference = String(journal.reference || '');
    const sameCompany = journalCompany === companyId;
    const samePayment = sourceId === paymentId;
    const receiptType = input.sourceModule != null && sourceModule === input.sourceModule;

    if (sameCompany && samePayment && receiptType) {
      ownJournal = journal;
      continue;
    }
    if (!sameCompany && reference === input.reference) {
      otherCompanyReference = {
        reference,
        companyId: journalCompany,
        journalId: idText(journal._id) || undefined
      };
      continue;
    }
    if (sameCompany && reference === input.reference && !samePayment) {
      referenceCollision = {
        reference,
        otherPaymentId: sourceId || 'unknown',
        journalId: idText(journal._id) || undefined
      };
    }
  }

  return { ownJournal, referenceCollision, otherCompanyReference };
}

export function canonicalReceiptJournalBalance(payment: any): { debit: number; credit: number; balanced: boolean } {
  const amount = roundMoney(Math.max(0, Number(payment?.amount || 0)));
  const details = payment?.commissionDetails || {};
  const vatOnCommission = roundMoney(Number(details.vatOnCommission || details.vatAmount || 0));
  const paymentVat = roundMoney(Number(payment?.vatAmount || 0));
  const totalVat = roundMoney(vatOnCommission + paymentVat);
  const commissionNet = roundMoney(Number(details.commissionNet || details.totalCommission || 0));
  const levyAmount = roundMoney(Number(details.levy ?? payment?.levyAllocated ?? 0));
  const domain = historicalTransactionDomain(payment);
  const allocation = allocateRentalReceipt({
    amount,
    rent: roundMoney(Number(payment?.rentAllocated ?? details.commissionBase ?? amount - levyAmount)),
    levy: levyAmount,
    commissionBase: roundMoney(Number(details.commissionBase || 0)),
    commissionNet,
    vatOnCommission
  });
  const journal = buildAgentReceiptJournal({
    paymentType: domain === 'SALE' ? 'sale' : 'rental',
    amount,
    ownerAmount: allocation.ownerPayable,
    commissionNet: allocation.commissionNet,
    vatAmount: totalVat,
    levyAmount: domain === 'SALE' ? 0 : allocation.levyPayable
  });
  const debit = roundMoney(journal.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const credit = roundMoney(journal.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  return { debit, credit, balanced: amount > 0 && journal.balanced && debit === credit };
}

export function paymentIsReversed(payment: any): boolean {
  return isReversalDocument(payment) || hasReversalInEffect(payment) || String(payment?.status || '') === 'reversed';
}

/**
 * Dry-run decision only. It does not post, update, or adopt another payment's journal.
 */
export function assessControlledRecovery(input: {
  missingJournal: boolean;
  journalPresent: boolean;
  referenceCollision: boolean;
  otherCompanyReference: boolean;
  reversed: boolean;
  companyMatches: boolean;
  periodStatus: RecoveryPeriodStatus;
  journalBalanced: boolean;
  otherMismatches: string[];
}): ControlledRecoveryAssessment {
  const blockers: string[] = [];
  if (!input.companyMatches) blockers.push('company_mismatch');
  if (input.reversed) blockers.push('reversed_payment');
  if (input.periodStatus === 'UNMANAGED') blockers.push('period_not_established');
  if (input.periodStatus === 'CLOSED' || input.periodStatus === 'SOFT_CLOSED') blockers.push(`period_${input.periodStatus.toLowerCase()}`);
  if (!input.journalBalanced) blockers.push('journal_unbalanced');
  if (input.referenceCollision) blockers.push('receipt_reference_belongs_to_another_payment');
  if (input.otherMismatches.length) blockers.push(`mismatched:${input.otherMismatches.join(',')}`);
  if (input.journalPresent) blockers.push('receipt_journal_already_posted');
  if (!input.missingJournal && !input.journalPresent && !input.referenceCollision) blockers.push('journal_not_required');

  const eligible = input.companyMatches
    && !input.reversed
    && input.periodStatus === 'OPEN'
    && input.journalBalanced
    && !input.referenceCollision
    && input.missingJournal
    && !input.journalPresent
    && input.otherMismatches.length === 0;

  return {
    eligible,
    manualReview: !eligible && (input.referenceCollision || input.otherMismatches.length > 0 || !input.journalBalanced || input.reversed || !input.companyMatches || input.periodStatus !== 'OPEN'),
    blockers,
    checks: {
      financialWrites: false,
      existingOwnJournal: input.journalPresent,
      duplicateReceiptReference: input.referenceCollision,
      otherCompanyReference: input.otherCompanyReference,
      periodStatus: input.periodStatus,
      journalBalanced: input.journalBalanced,
      reversed: input.reversed,
      companyMatches: input.companyMatches
    }
  };
}

export type RecoveryApprovalClass =
  | 'READY FOR RECOVERY'
  | 'MISSING JOURNAL'
  | 'HISTORICAL VARIANCE'
  | 'REFERENCE COLLISION'
  | 'DEPOSIT RECONCILIATION'
  | 'PERIOD VERIFICATION'
  | 'MANUAL REVIEW';

export function classifyRecoveryApproval(input: {
  periodStatus: RecoveryPeriodStatus;
  referenceCollision: boolean;
  historicalVariance: boolean;
  ownerMismatch: boolean;
  depositExpected: boolean;
  depositMissing: boolean;
  journalBalanced: boolean;
  reversed: boolean;
  journalMissing: boolean;
  companyMatches: boolean;
  projectionsValid: boolean;
}): { exceptionClass: RecoveryApprovalClass; recommendedAction: string; readyForApproval: boolean } {
  const readyForApproval = input.companyMatches
    && !input.reversed
    && input.journalBalanced
    && input.projectionsValid
    && !input.referenceCollision
    && !input.historicalVariance
    && !input.ownerMismatch
    && !(input.depositExpected && input.depositMissing)
    && input.periodStatus === 'OPEN'
    && input.journalMissing;

  if (input.referenceCollision) {
    return {
      exceptionClass: 'REFERENCE COLLISION',
      recommendedAction: 'Do not reassign the existing journal. An accountant must decide which payment owns the receipt reference.',
      readyForApproval: false
    };
  }
  if (input.reversed || !input.companyMatches) {
    return {
      exceptionClass: 'MANUAL REVIEW',
      recommendedAction: 'Keep the payment unchanged until an accountant reviews it.',
      readyForApproval: false
    };
  }
  if (input.historicalVariance || input.ownerMismatch) {
    return {
      exceptionClass: 'HISTORICAL VARIANCE',
      recommendedAction: 'Do not reconstruct the stored owner amount. Any correction must be a separately authorised adjustment.',
      readyForApproval: false
    };
  }
  if (input.depositExpected && input.depositMissing) {
    return {
      exceptionClass: 'DEPOSIT RECONCILIATION',
      recommendedAction: 'Reconcile the deposit ledger before posting. The receipt journal must not include the deposit.',
      readyForApproval: false
    };
  }
  if (input.periodStatus !== 'OPEN') {
    return {
      exceptionClass: 'PERIOD VERIFICATION',
      recommendedAction: 'No OPEN accounting period covers this date. A missing period is not open.',
      readyForApproval: false
    };
  }
  if (!input.journalBalanced || !input.projectionsValid) {
    return {
      exceptionClass: 'MANUAL REVIEW',
      recommendedAction: 'The stored snapshot does not support a balanced recovery journal.',
      readyForApproval: false
    };
  }
  if (readyForApproval) {
    return {
      exceptionClass: 'READY FOR RECOVERY',
      recommendedAction: 'An accountant may approve a single-payment repair through the existing repair pipeline. This screen does not post.',
      readyForApproval: true
    };
  }
  if (input.journalMissing) {
    return {
      exceptionClass: 'MISSING JOURNAL',
      recommendedAction: 'The receipt journal is absent. Confirm the stored snapshot and an OPEN period before using the existing repair pipeline.',
      readyForApproval: false
    };
  }
  return {
    exceptionClass: 'MANUAL REVIEW',
    recommendedAction: 'Keep the payment unchanged until an accountant reviews it.',
    readyForApproval: false
  };
}
