import { IPayment } from '../models/Payment';
import accountingService from './accountingService';
import { AccountingEventLog } from '../models/AccountingEventLog';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { CompanyAccount } from '../models/CompanyAccount';
import { VatRecord } from '../models/VatRecord';
import {
  shouldPostCompanyCommission,
  shouldPostJournal
} from './accountingPostingPolicy';
import { buildAgentReceiptJournal, buildAgentReceiptReversal } from './tax/principalAgentJournal';
import { allocateRentalReceipt } from './tax/paymentAllocation';
import { filingPeriodFromDate as taxFilingPeriod } from './tax/vatCalculation';
import { GL } from './tax/chartAccounts';
import { upsertPaymentTaxObligation, reversePaymentTaxObligations } from './taxObligationService';
import { journalPaymentType } from './transactionDomain';
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { throwOnceIfArmed } from './testFailureSeam';
import { logger } from '../utils/logger';
import { classifyOperationalFailure, ExpenseSyncError } from './operationalFailure';
import { resolveFinancialReview, upsertFinancialReview } from './financialOperationVisibility';
import {
  JournalOperationIdentity,
  matchingJournalIdentity,
  persistedJournalMatchesIdentity
} from './journalDuplicateKey';

const toMoney = (value: number): number => Number(Number(value || 0).toFixed(2));

const filingPeriodFromDate = (value: Date | string | undefined): string => {
  const date = value ? new Date(value) : new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const safeObjectId = (id?: string): mongoose.Types.ObjectId | undefined => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return undefined;
  return new mongoose.Types.ObjectId(id);
};

async function findJournalForIdentity(identity: JournalOperationIdentity) {
  const companyId = identity.companyId instanceof mongoose.Types.ObjectId
    ? identity.companyId
    : new mongoose.Types.ObjectId(String(identity.companyId));
  return JournalEntry.findOne({
    companyId,
    sourceModule: identity.sourceModule,
    sourceId: identity.sourceId
  }).select('_id companyId sourceModule sourceId reference status').lean();
}

/**
 * Insert a journal once. A duplicate key is success only when the conflicting
 * index and the stored journal are this exact operation. The stored journal
 * is not updated.
 */
async function ensureJournal(
  identity: JournalOperationIdentity,
  post: () => Promise<unknown>
): Promise<void> {
  const existing = await findJournalForIdentity(identity);
  if (existing) {
    if (!persistedJournalMatchesIdentity(existing, identity)) {
      throw new Error('Existing journal does not match this posting operation');
    }
    return;
  }
  try {
    await post();
  } catch (error) {
    const matched = matchingJournalIdentity(error, [identity]);
    if (!matched) throw error;
    const raced = await findJournalForIdentity(identity);
    if (!persistedJournalMatchesIdentity(raced, identity)) throw error;
  }
}

class AccountingIntegrationService {
  private async upsertPaymentVatRecord(payment: IPayment): Promise<void> {
    const vatOnCommission = toMoney((payment.commissionDetails as any)?.vatOnCommission || 0);
    const paymentVat = toMoney((payment as any)?.vatAmount || 0);
    const totalVatCollected = toMoney(vatOnCommission + paymentVat);
    if (totalVatCollected <= 0) return;

    const filter = {
      companyId: new mongoose.Types.ObjectId(String(payment.companyId)),
      transactionId: String(payment._id),
      sourceType: payment.paymentType
    };
    const existing = await VatRecord.findOne(filter).select('status vatCollected').lean();
    if (existing) return;

    try {
      await VatRecord.updateOne(
        filter,
        {
          $setOnInsert: {
            vatCollected: totalVatCollected,
            vatPaid: 0,
            vatRate: Number((payment as any)?.vatOnCommissionRate || (payment as any)?.vatRate || 0),
            filingPeriod: filingPeriodFromDate(payment.paymentDate),
            status: 'pending'
          }
        },
        { upsert: true }
      );
    } catch (error) {
      const raced = await VatRecord.findOne(filter).select('_id').lean();
      if (!raced) throw error;
    }
  }

  private async ensurePaymentVatObligations(payment: IPayment, opts?: { createdBy?: string }): Promise<void> {
    const companyId = String(payment.companyId);
    const paymentId = String(payment._id);
    const vatOnCommission = toMoney((payment.commissionDetails as any)?.vatOnCommission || 0);
    const paymentVat = toMoney((payment as any)?.vatAmount || 0);
    const commissionNet = toMoney(
      Number((payment.commissionDetails as any)?.commissionNet || (payment.commissionDetails as any)?.totalCommission || 0)
    );
    const effectiveVatRate = Number((payment as any)?.vatOnCommissionRate || (payment.commissionDetails as any)?.vatRate || (payment as any)?.vatRate || 0);
    const propertyId = (payment as any)?.propertyId ? String((payment as any).propertyId) : undefined;
    const period = taxFilingPeriod(payment.paymentDate);
    const details = (payment.commissionDetails || {}) as any;
    if (vatOnCommission > 0) {
      throwOnceIfArmed(paymentId, String((payment as any).notes || ''), 'PHASE_FAIL_OBLIGATION_ONCE');
      if (
        process.env.NODE_ENV !== 'production' &&
        process.env.MANTIS_TEST_SEAM === '1' &&
        String((payment as any).notes || '').includes('FAIL_VAT_OBLIGATION')
      ) {
        throw new Error('FAIL_VAT_OBLIGATION');
      }
      await upsertPaymentTaxObligation({
        companyId,
        taxType: 'VAT_ON_COMMISSION',
        paymentId,
        propertyId,
        taxPeriod: period,
        transactionDate: payment.paymentDate,
        currency: (payment as any).currency,
        taxableAmount: commissionNet,
        taxRate: effectiveVatRate,
        taxAmount: vatOnCommission,
        calculationBasis: String(details.vatTreatment || 'COMMISSION_VAT'),
        calculationSnapshot: {
          paymentId,
          commissionBase: details.commissionBase,
          commissionRate: details.commissionRate,
          commissionNet,
          vatTreatment: details.vatTreatment,
          vatRate: details.vatRate ?? effectiveVatRate,
          vatAmount: vatOnCommission,
          vatRuleId: details.vatRuleId,
          vatTaxPoint: details.vatTaxPoint || payment.paymentDate,
          vatDecision: details.vatDecision
        },
        glAccount: GL.VAT_PAYABLE,
        createdBy: opts?.createdBy
      });
    }
    if (paymentVat > 0) {
      await upsertPaymentTaxObligation({
        companyId,
        taxType: 'VAT_OUTPUT',
        paymentId,
        propertyId,
        taxPeriod: period,
        transactionDate: payment.paymentDate,
        currency: (payment as any).currency,
        taxableAmount: toMoney(Number(payment.amount || 0) - paymentVat),
        taxRate: Number((payment as any)?.vatRate || 0),
        taxAmount: paymentVat,
        calculationBasis: 'PROPERTY_SALE_VAT',
        glAccount: GL.VAT_PAYABLE,
        createdBy: opts?.createdBy
      });
    }
  }

  async reversePaymentVatRecord(payment: IPayment): Promise<'reversed' | 'skipped'> {
    const result = await VatRecord.updateOne(
      {
        companyId: new mongoose.Types.ObjectId(String(payment.companyId)),
        transactionId: String(payment._id),
        status: { $ne: 'reversed' }
      },
      { $set: { status: 'reversed' } }
    );
    if (Number((result as any).matchedCount || (result as any).n || 0) > 0) return 'reversed';
    const existing = await VatRecord.findOne({
      transactionId: String(payment._id),
      status: 'reversed'
    }).select('_id').lean();
    return existing ? 'reversed' : 'skipped';
  }

  /**
   * Company commission projection writer for a Payment.
   * Call only from paymentAccountingOrchestrator (or explicit repair via orchestrator).
   * Do not call from scheduled jobs, GET handlers, integrity, or historical sync.
   * Payment.commissionDetails is the source of truth; CompanyAccount is a projection.
   */
  async postCompanyCommission(payment: IPayment): Promise<void> {
    if (!shouldPostCompanyCommission(payment)) return;
    const agencyShare = toMoney((payment.commissionDetails as any)?.agencyShare || 0);
    if (!(agencyShare > 0) || !payment.companyId) return;
    const companyId = payment.companyId;
    const desiredSource = journalPaymentType(payment) === 'sale' ? 'sales_commission' : 'rental_commission';
    const txDoc = {
      type: 'income',
      source: desiredSource,
      amount: agencyShare,
      date: (payment as any).paymentDate || new Date(),
      currency: (payment as any).currency || 'USD',
      paymentMethod: (payment as any).paymentMethod,
      paymentId: payment._id,
      referenceNumber: payment.referenceNumber,
      description: desiredSource === 'sales_commission' ? 'Sales commission income' : 'Rental commission income',
      processedBy: (payment as any).processedBy,
      notes: (payment as any).notes
    };
    await CompanyAccount.updateOne(
      { companyId },
      { $setOnInsert: { companyId, runningBalance: 0, totalIncome: 0, totalExpenses: 0, lastUpdated: new Date() } },
      { upsert: true }
    );
    await CompanyAccount.updateOne(
      { companyId, transactions: { $not: { $elemMatch: { paymentId: payment._id, isArchived: { $ne: true } } } } },
      {
        $push: { transactions: txDoc },
        $inc: { totalIncome: agencyShare, runningBalance: agencyShare },
        $set: { lastUpdated: new Date() }
      }
    );
  }

  async syncPaymentReceived(payment: IPayment, opts?: { createdBy?: string }): Promise<void> {
    const companyId = String(payment.companyId);
    const paymentId = String(payment._id);
    try {
      if (!shouldPostJournal(payment)) return;
      // Reversal entries are handled by syncPaymentReversed.
      if ((payment as any)?.reversalOfPaymentId) return;
      if (Number(payment.amount || 0) < 0) return;
      const amount = toMoney(payment.amount || 0);
      const vatOnCommission = toMoney((payment.commissionDetails as any)?.vatOnCommission || 0);
      const paymentVat = toMoney((payment as any)?.vatAmount || 0);
      const totalVatCollected = toMoney(vatOnCommission + paymentVat);
      const commissionNet = toMoney(
        Number((payment.commissionDetails as any)?.commissionNet || (payment.commissionDetails as any)?.totalCommission || 0)
      );
      const effectiveVatRate = Number((payment as any)?.vatOnCommissionRate || (payment as any)?.vatRate || 0);
      const propertyId = (payment as any)?.propertyId ? String((payment as any).propertyId) : undefined;
      const agentId = (payment as any)?.agentId ? String((payment as any).agentId) : undefined;
      const levyAmount = toMoney(
        Number((payment.commissionDetails as any)?.levy ?? (payment as any)?.levyAllocated ?? 0)
      );
      const allocation = allocateRentalReceipt({
        amount,
        rent: toMoney(Number((payment as any)?.rentAllocated ?? (payment.commissionDetails as any)?.commissionBase ?? amount - levyAmount)),
        levy: levyAmount,
        commissionBase: toMoney(Number((payment.commissionDetails as any)?.commissionBase || 0)),
        commissionNet,
        vatOnCommission: vatOnCommission
      });
      const domainPaymentType = journalPaymentType(payment);
      const receiptJournal = buildAgentReceiptJournal({
        paymentType: domainPaymentType,
        amount,
        ownerAmount: allocation.ownerPayable,
        commissionNet: allocation.commissionNet,
        vatAmount: totalVatCollected,
        levyAmount: domainPaymentType === 'sale' ? 0 : allocation.levyPayable,
        propertyId,
        agentId
      });

      const sourceModule = journalPaymentType(payment) === 'sale' ? 'sale' : 'payment';
      const companyObjectId = new mongoose.Types.ObjectId(companyId);
      if (amount > 0 && receiptJournal.lines.length > 0) {
        await ensureJournal(
          {
            companyId: companyObjectId,
            sourceModule,
            sourceId: paymentId,
            reference: `PAY-${payment.referenceNumber || paymentId}`
          },
          () => accountingService.postTransaction({
            companyId,
            reference: `PAY-${payment.referenceNumber || paymentId}`,
            description: `Agent collection ${payment.referenceNumber || paymentId} (commission as company revenue; principal funds as client liability)`,
            sourceModule,
            sourceId: paymentId,
            transactionDate: payment.paymentDate,
            createdBy: opts?.createdBy,
            lines: receiptJournal.lines,
            seamHaystack: String((payment as any).notes || ''),
            vat: totalVatCollected > 0
              ? {
                  sourceType: payment.paymentType,
                  vatCollected: totalVatCollected,
                  vatRate: effectiveVatRate,
                  filingPeriod: filingPeriodFromDate(payment.paymentDate),
                  status: 'pending'
                }
              : undefined
          })
        );
      }

      if (totalVatCollected > 0) {
        await this.upsertPaymentVatRecord(payment);
      }

      await this.ensurePaymentVatObligations(payment, opts);

      const agentShare = toMoney((payment.commissionDetails as any)?.agentShare || 0);
      if (agentShare > 0) {
        await ensureJournal(
          {
            companyId: companyObjectId,
            sourceModule: 'commission',
            sourceId: `${paymentId}:commission`,
            reference: `COM-${payment.referenceNumber || paymentId}`
          },
          () => accountingService.postTransaction({
            companyId,
            reference: `COM-${payment.referenceNumber || paymentId}`,
            description: `Auto-post commission payable for ${payment.referenceNumber || paymentId}`,
            sourceModule: 'commission',
            sourceId: `${paymentId}:commission`,
            transactionDate: payment.paymentDate,
            createdBy: opts?.createdBy,
            lines: [
              { accountCode: '5002', debit: agentShare },
              {
                accountCode: '2102',
                credit: agentShare,
                agentId: (payment as any)?.agentId ? String((payment as any).agentId) : undefined
              }
            ]
          })
        );
      }
    } catch (error: any) {
      const failureClass = classifyOperationalFailure(error);
      logger.warn('payment_accounting_sync_failed', {
        correlationId: paymentId,
        paymentId,
        companyId,
        failureClass,
        code: error?.code
      });
      await AccountingEventLog.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        eventType: 'payment_sync_failed',
        sourceModule: journalPaymentType(payment) === 'sale' ? 'sale' : 'payment',
        sourceId: paymentId,
        success: false,
        message: error?.message || 'Failed to sync payment to accounting',
        metadata: { paymentReference: payment.referenceNumber, failureClass }
      });
      throw error;
    }
  }

  async postCompanyCommissionReversal(
    payment: IPayment,
    opts?: { createdBy?: string; reason?: string; reversalPaymentId?: string }
  ): Promise<'reversed' | 'skipped'> {
    const companyId = String(payment.companyId);
    const paymentId = String(payment._id);
    throwOnceIfArmed(
      paymentId,
      `${String((payment as any).notes || '')} ${String(opts?.reason || '')}`,
      'PHASE27_FAIL_COMPANY'
    );
    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const account = await CompanyAccount.findOne({ companyId: companyObjectId }).lean();
    const originalLines = Array.isArray((account as any)?.transactions)
      ? (account as any).transactions.filter(
          (t: any) =>
            String(t?.paymentId || '') === paymentId &&
            !t?.reversesPaymentId &&
            t?.isArchived !== true &&
            Number(t?.amount || 0) > 0
        )
      : [];
    if (!originalLines.length) return 'skipped';
    const already = Array.isArray((account as any)?.transactions)
      && (account as any).transactions.some((t: any) => String(t?.reversesPaymentId || '') === paymentId);
    if (already) return 'reversed';

    const posted = toMoney(originalLines.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0));
    const source = originalLines[0]?.source || (journalPaymentType(payment) === 'sale' ? 'sales_commission' : 'rental_commission');
    const reversalPaymentId = opts?.reversalPaymentId && mongoose.Types.ObjectId.isValid(opts.reversalPaymentId)
      ? new mongoose.Types.ObjectId(opts.reversalPaymentId)
      : undefined;
    const counter: any = {
      type: 'income',
      source,
      amount: -posted,
      date: new Date(),
      currency: (payment as any).currency || 'USD',
      reversesPaymentId: payment._id,
      referenceNumber: `REV-COM-${payment.referenceNumber || paymentId}`,
      description: `Reversal of ${source} for ${payment.referenceNumber || paymentId}`,
      notes: opts?.reason || 'Payment reversal',
      processedBy: opts?.createdBy && mongoose.Types.ObjectId.isValid(opts.createdBy)
        ? new mongoose.Types.ObjectId(opts.createdBy)
        : undefined,
      isArchived: false
    };
    if (reversalPaymentId) counter.paymentId = reversalPaymentId;

    const result = await CompanyAccount.updateOne(
      {
        companyId: companyObjectId,
        transactions: { $not: { $elemMatch: { reversesPaymentId: payment._id } } }
      },
      {
        $push: { transactions: counter },
        $inc: { totalIncome: -posted, runningBalance: -posted },
        $set: { lastUpdated: new Date() }
      }
    );
    if (Number((result as any).matchedCount || 0) === 0) {
      const fresh = await CompanyAccount.findOne({
        companyId: companyObjectId,
        'transactions.reversesPaymentId': payment._id
      }).select('_id').lean();
      if (!fresh) {
        throw new Error('Company commission reversal was not recorded');
      }
    }
    return 'reversed';
  }

  async postReversalJournal(
    payment: IPayment,
    opts?: { createdBy?: string; reason?: string }
  ): Promise<'reversed' | 'skipped'> {
    const companyId = String(payment.companyId);
    const paymentId = String(payment._id);
    throwOnceIfArmed(
      paymentId,
      `${String((payment as any).notes || '')} ${String(opts?.reason || '')}`,
      'PHASE27_FAIL_JOURNAL'
    );
    const sourceModule = journalPaymentType(payment) === 'sale' ? 'sale' : 'payment';
    const companyObjectId = new mongoose.Types.ObjectId(companyId);
    const reversalReference = `REV-PAY-${payment.referenceNumber || paymentId}`;
    const reversalIdentity: JournalOperationIdentity = {
      companyId: companyObjectId,
      sourceModule,
      sourceId: `${paymentId}:reversal`,
      reference: reversalReference
    };
    try {
      const existing = await findJournalForIdentity(reversalIdentity);
      if (existing && !persistedJournalMatchesIdentity(existing, reversalIdentity)) {
        throw new Error('Existing reversal journal does not match this payment');
      }
      if (!existing) {
        const original = await JournalEntry.findOne({
          companyId: companyObjectId,
          sourceModule,
          sourceId: paymentId
        }).lean();
        let lines: Array<{ accountCode: string; debit?: number; credit?: number; propertyId?: string; agentId?: string }> = [];
        if (original) {
          const stored = await JournalLine.find({ journalEntryId: (original as any)._id }).lean();
          const accounts = await ChartOfAccount.find({
            _id: { $in: stored.map((line: any) => line.accountId) }
          }).select('code').lean();
          const codeById = new Map(accounts.map((account: any) => [String(account._id), String(account.code)]));
          lines = stored
            .map((line: any) => ({
              accountCode: codeById.get(String(line.accountId)) || '',
              debit: toMoney(Number(line.credit || 0)),
              credit: toMoney(Number(line.debit || 0)),
              propertyId: line.propertyId ? String(line.propertyId) : undefined,
              agentId: line.agentId ? String(line.agentId) : undefined
            }))
            .filter((line) => line.accountCode && ((line.debit || 0) > 0 || (line.credit || 0) > 0));
        } else {
          throw new Error('Original journal is missing. The reversal was not constructed from current configuration.');
        }
        if (original && lines.length === 0) {
          throw new Error('Original journal lines could not be reversed');
        }
        if (lines.length > 0) {
          await ensureJournal(reversalIdentity, () => accountingService.postTransaction({
            companyId,
            reference: reversalReference,
            description: `Reversal of agent collection ${payment.referenceNumber || paymentId}`,
            sourceModule,
            sourceId: `${paymentId}:reversal`,
            transactionDate: new Date(),
            createdBy: opts?.createdBy,
            lines
          }));
        } else if (!original) {
          return 'skipped';
        }
      }

      const agentShare = toMoney((payment.commissionDetails as any)?.agentShare || 0);
      if (agentShare > 0) {
        await ensureJournal(
          {
            companyId: companyObjectId,
            sourceModule: 'commission',
            sourceId: `${paymentId}:commission:reversal`,
            reference: `REV-AGT-${payment.referenceNumber || paymentId}`
          },
          () => accountingService.postTransaction({
            companyId,
            reference: `REV-AGT-${payment.referenceNumber || paymentId}`,
            description: `Reversal of commission payable for ${payment.referenceNumber || paymentId}`,
            sourceModule: 'commission',
            sourceId: `${paymentId}:commission:reversal`,
            transactionDate: new Date(),
            createdBy: opts?.createdBy,
            lines: [
              { accountCode: '5002', credit: agentShare },
              {
                accountCode: '2102',
                debit: agentShare,
                agentId: (payment as any)?.agentId ? String((payment as any).agentId) : undefined
              }
            ]
          })
        );
      }
      return 'reversed';
    } catch (error: any) {
      const failureClass = classifyOperationalFailure(error);
      logger.warn('payment_reversal_journal_failed', {
        correlationId: paymentId,
        paymentId,
        companyId,
        failureClass,
        code: error?.code
      });
      await AccountingEventLog.create({
        companyId: companyObjectId,
        eventType: 'payment_reversal_sync_failed',
        sourceModule,
        sourceId: paymentId,
        success: false,
        message: error?.message || 'Failed to sync payment reversal to accounting',
        metadata: { paymentReference: payment.referenceNumber, failureClass }
      });
      throw error;
    }
  }

  async syncPaymentReversed(
    payment: IPayment,
    opts?: { createdBy?: string; reason?: string; reversalPaymentId?: string }
  ): Promise<void> {
    await this.postCompanyCommissionReversal(payment, opts);
    await this.postReversalJournal(payment, opts);
    await reversePaymentTaxObligations({
      companyId: String(payment.companyId),
      paymentId: String(payment._id),
      createdBy: opts?.createdBy,
      reason: opts?.reason,
      notes: String((payment as any).notes || '')
    });
  }

  async syncExpenseCreated(input: {
    companyId: string;
    sourceId: string;
    reference: string;
    amount: number;
    description?: string;
    date?: Date;
    createdBy?: string;
    propertyId?: string;
  }): Promise<void> {
    const companyObjectId = safeObjectId(input.companyId);
    const sourceId = String(input.sourceId || '').trim();
    const reference = String(input.reference || '').trim();
    if (!companyObjectId) {
      throw new ExpenseSyncError('Expense sync requires a valid company id', 'permanent', 'EXPENSE_COMPANY_REQUIRED');
    }
    if (!sourceId || !reference) {
      throw new ExpenseSyncError('Expense sync requires a source id and reference', 'permanent', 'EXPENSE_SOURCE_REQUIRED');
    }
    const amount = toMoney(input.amount);
    if (amount <= 0) return;

    const identity: JournalOperationIdentity = {
      companyId: companyObjectId,
      sourceModule: 'expense',
      sourceId,
      reference
    };
    try {
      await ensureJournal(identity, () => {
        throwOnceIfArmed(sourceId, String(input.description || ''), 'PHASE_FAIL_EXPENSE_POST');
        return accountingService.postTransaction({
          companyId: input.companyId,
          reference,
          description: input.description || 'Auto-post expense',
          sourceModule: 'expense',
          sourceId,
          transactionDate: input.date || new Date(),
          createdBy: input.createdBy,
          lines: [
            { accountCode: '5001', debit: amount, propertyId: input.propertyId },
            { accountCode: '1001', credit: amount, propertyId: input.propertyId }
          ]
        });
      });
      throwOnceIfArmed(sourceId, String(input.description || ''), 'PHASE_FAIL_EXPENSE_AFTER');
      const stored = await findJournalForIdentity(identity);
      if (!persistedJournalMatchesIdentity(stored, identity)) {
        throw new ExpenseSyncError('Expense journal was not stored for this source', 'conflict', 'EXPENSE_SOURCE_MISSING');
      }
      await resolveFinancialReview(
        input.companyId,
        'EXPENSE_SYNC_FAILED',
        sourceId,
        'The expense journal for this source is present. Amounts were not rewritten.'
      );
    } catch (error: any) {
      const failureClass = error instanceof ExpenseSyncError
        ? error.failureClass
        : (String(error?.message || '').includes('does not match this posting') ? 'conflict' : classifyOperationalFailure(error));
      const syncError = error instanceof ExpenseSyncError
        ? error
        : new ExpenseSyncError(
          error?.message || 'Failed to sync expense to accounting',
          failureClass,
          error?.code || 'EXPENSE_SYNC_FAILED'
        );
      logger.warn('expense_sync_failed', {
        correlationId: sourceId,
        companyId: input.companyId,
        sourceId,
        failureClass,
        code: syncError.code
      });
      await AccountingEventLog.create({
        companyId: companyObjectId,
        eventType: 'expense_sync_failed',
        sourceModule: 'expense',
        sourceId,
        success: false,
        message: syncError.message,
        metadata: { reference, failureClass, amount }
      });
      await upsertFinancialReview({
        companyId: input.companyId,
        component: 'EXPENSE_SYNC_FAILED',
        operationId: sourceId,
        amount,
        missingRecord: 'expense journal',
        issueType: failureClass === 'conflict' ? 'mismatched' : 'missing',
        actual: failureClass,
        recommendedReview: `Expense source ${sourceId} for company ${input.companyId}, amount ${amount.toFixed(2)}, did not finish. Failure class ${failureClass}. Do not create another expense. Retry this source through syncExpenseCreated. Do not rewrite historical amounts.`
      });
      throw syncError;
    }
  }

  async backfillFromExistingData(companyId: string): Promise<{ paymentsSynced: number; expensesSynced: number }> {
    // EXPLICIT HISTORICAL MIGRATION ONLY. Never call from integrity, GET, reporting, or scheduled jobs.
    const companyObjectId = safeObjectId(companyId);
    if (!companyObjectId) {
      return { paymentsSynced: 0, expensesSynced: 0 };
    }

    let paymentsSynced = 0;
    let expensesSynced = 0;
    const payments = await Payment.find({ companyId: companyObjectId, status: 'completed' }).sort({ createdAt: 1 });
    for (const payment of payments) {
      await this.syncPaymentReceived(payment);
      paymentsSynced += 1;
    }

    const account = await CompanyAccount.findOne({ companyId: companyObjectId }).lean();
    const transactions = Array.isArray((account as any)?.transactions) ? (account as any).transactions : [];
    for (const tx of transactions) {
      if (String(tx?.type) !== 'expense') continue;
      const amount = Number(tx?.amount || 0);
      if (!(amount > 0)) continue;
      await this.syncExpenseCreated({
        companyId,
        sourceId: String(tx?._id || `${companyId}:${tx?.date || Date.now()}`),
        reference: String(tx?.referenceNumber || tx?.reference || `EXP-${Date.now()}`),
        amount,
        description: tx?.description || tx?.category || 'Backfilled expense',
        date: tx?.date ? new Date(tx.date) : new Date()
      });
      expensesSynced += 1;
    }

    return { paymentsSynced, expensesSynced };
  }
}

export default new AccountingIntegrationService();
