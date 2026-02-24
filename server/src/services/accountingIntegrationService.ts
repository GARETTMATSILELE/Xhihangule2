import { IPayment } from '../models/Payment';
import accountingService from './accountingService';
import { AccountingEventLog } from '../models/AccountingEventLog';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { CompanyAccount } from '../models/CompanyAccount';
import { VatRecord } from '../models/VatRecord';

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

const isDuplicateKeyError = (error: any): boolean =>
  Boolean(error && (error.code === 11000 || String(error?.message || '').includes('duplicate key')));

class AccountingIntegrationService {
  private async upsertPaymentVatRecord(payment: IPayment): Promise<void> {
    const vatOnCommission = toMoney((payment.commissionDetails as any)?.vatOnCommission || 0);
    const paymentVat = toMoney((payment as any)?.vatAmount || 0);
    const totalVatCollected = toMoney(vatOnCommission + paymentVat);
    if (totalVatCollected <= 0) return;

    await VatRecord.updateOne(
      {
        companyId: new mongoose.Types.ObjectId(String(payment.companyId)),
        transactionId: String(payment._id),
        sourceType: payment.paymentType
      },
      {
        $set: {
          vatCollected: totalVatCollected,
          vatPaid: 0,
          vatRate: Number((payment as any)?.vatRate || 0),
          filingPeriod: filingPeriodFromDate(payment.paymentDate),
          status: 'pending'
        }
      },
      { upsert: true }
    );
  }

  async syncPaymentReceived(payment: IPayment, opts?: { createdBy?: string }): Promise<void> {
    const companyId = String(payment.companyId);
    const paymentId = String(payment._id);
    try {
      // Reversal entries are handled by syncPaymentReversed.
      if ((payment as any)?.reversalOfPaymentId) return;
      if (Number(payment.amount || 0) < 0) return;
      const amount = toMoney(payment.amount || 0);
      const vatOnCommission = toMoney((payment.commissionDetails as any)?.vatOnCommission || 0);
      const paymentVat = toMoney((payment as any)?.vatAmount || 0);
      const totalVatCollected = toMoney(vatOnCommission + paymentVat);
      const effectiveVatRate = Number((payment as any)?.vatRate || 0);
      const incomeCode = payment.paymentType === 'sale' ? '4002' : '4001';
      const incomeCredit = toMoney(Math.max(0, amount - totalVatCollected));

      if (amount > 0) {
        await accountingService.postTransaction({
          companyId,
          reference: `PAY-${payment.referenceNumber || paymentId}`,
          description: `Auto-post payment ${payment.referenceNumber || paymentId}`,
          sourceModule: payment.paymentType === 'sale' ? 'sale' : 'payment',
          sourceId: paymentId,
          transactionDate: payment.paymentDate,
          createdBy: opts?.createdBy,
          lines: [
            {
              accountCode: '1001',
              debit: amount,
              propertyId: (payment as any)?.propertyId ? String((payment as any).propertyId) : undefined,
              agentId: (payment as any)?.agentId ? String((payment as any).agentId) : undefined
            },
            { accountCode: incomeCode, credit: incomeCredit }
          ].concat(totalVatCollected > 0 ? [{ accountCode: '2101', credit: totalVatCollected }] : []),
          vat: totalVatCollected > 0
            ? {
                sourceType: payment.paymentType,
                vatCollected: totalVatCollected,
                vatRate: effectiveVatRate,
                filingPeriod: filingPeriodFromDate(payment.paymentDate),
                status: 'pending'
              }
            : undefined
        });
      }

      const agentShare = toMoney((payment.commissionDetails as any)?.agentShare || 0);
      if (agentShare > 0) {
        await accountingService.postTransaction({
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
        });
      }
    } catch (error: any) {
      if (isDuplicateKeyError(error)) {
        // Payment may already be journal-posted; still ensure the VAT record reflects full payment VAT.
        await this.upsertPaymentVatRecord(payment);
        return;
      }
      await AccountingEventLog.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        eventType: 'payment_sync_failed',
        sourceModule: payment.paymentType === 'sale' ? 'sale' : 'payment',
        sourceId: paymentId,
        success: false,
        message: error?.message || 'Failed to sync payment to accounting',
        metadata: { paymentReference: payment.referenceNumber }
      });
    }
  }

  async syncPaymentReversed(payment: IPayment, opts?: { createdBy?: string; reason?: string }): Promise<void> {
    const companyId = String(payment.companyId);
    const paymentId = String(payment._id);
    try {
      const amount = toMoney(Math.abs(payment.amount || 0));
      const vatOnCommission = toMoney((payment.commissionDetails as any)?.vatOnCommission || 0);
      const paymentVat = toMoney((payment as any)?.vatAmount || 0);
      const totalVatCollected = toMoney(vatOnCommission + paymentVat);
      const incomeCode = payment.paymentType === 'sale' ? '4002' : '4001';
      const incomeDebit = toMoney(Math.max(0, amount - totalVatCollected));

      if (amount > 0) {
        await accountingService.postTransaction({
          companyId,
          reference: `REV-PAY-${payment.referenceNumber || paymentId}`,
          description: `Reversal of payment ${payment.referenceNumber || paymentId}`,
          sourceModule: payment.paymentType === 'sale' ? 'sale' : 'payment',
          sourceId: `${paymentId}:reversal`,
          transactionDate: new Date(),
          createdBy: opts?.createdBy,
          lines: [
            {
              accountCode: '1001',
              credit: amount,
              propertyId: (payment as any)?.propertyId ? String((payment as any).propertyId) : undefined,
              agentId: (payment as any)?.agentId ? String((payment as any).agentId) : undefined
            },
            { accountCode: incomeCode, debit: incomeDebit }
          ].concat(totalVatCollected > 0 ? [{ accountCode: '2101', debit: totalVatCollected }] : []),
        });
      }

      const agentShare = toMoney((payment.commissionDetails as any)?.agentShare || 0);
      if (agentShare > 0) {
        await accountingService.postTransaction({
          companyId,
          reference: `REV-COM-${payment.referenceNumber || paymentId}`,
          description: `Reversal of commission payable for ${payment.referenceNumber || paymentId}`,
          sourceModule: 'commission',
          sourceId: `${paymentId}:commission:reversal`,
          transactionDate: new Date(),
          createdBy: opts?.createdBy,
          lines: [
            {
              accountCode: '5002',
              credit: agentShare
            },
            {
              accountCode: '2102',
              debit: agentShare,
              agentId: (payment as any)?.agentId ? String((payment as any).agentId) : undefined
            }
          ]
        });
      }

      // Keep company-level commission rollups consistent with reversal.
      try {
        const result = await CompanyAccount.updateOne(
          { companyId: new mongoose.Types.ObjectId(companyId), 'transactions.paymentId': payment._id },
          { $set: { 'transactions.$[t].isArchived': true, lastUpdated: new Date() } },
          { arrayFilters: [{ 't.paymentId': payment._id, 't.isArchived': { $ne: true } }] as any }
        );
        if (Number((result as any)?.modifiedCount || 0) > 0) {
          const fresh = await CompanyAccount.findOne({ companyId: new mongoose.Types.ObjectId(companyId) }).lean();
          const active = Array.isArray((fresh as any)?.transactions)
            ? (fresh as any).transactions.filter((t: any) => t?.isArchived !== true)
            : [];
          const totalIncome = active
            .filter((t: any) => t?.type === 'income')
            .reduce((sum: number, t: any) => sum + Number(t?.amount || 0), 0);
          const totalExpenses = active
            .filter((t: any) => t?.type !== 'income')
            .reduce((sum: number, t: any) => sum + Number(t?.amount || 0), 0);
          await CompanyAccount.updateOne(
            { companyId: new mongoose.Types.ObjectId(companyId) },
            { $set: { totalIncome, totalExpenses, runningBalance: totalIncome - totalExpenses, lastUpdated: new Date() } }
          );
        }
      } catch {
        // Non-fatal: accounting journal reversal remains source of truth.
      }
    } catch (error: any) {
      if (isDuplicateKeyError(error)) return;
      await AccountingEventLog.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        eventType: 'payment_reversal_sync_failed',
        sourceModule: payment.paymentType === 'sale' ? 'sale' : 'payment',
        sourceId: paymentId,
        success: false,
        message: error?.message || 'Failed to sync payment reversal to accounting',
        metadata: { paymentReference: payment.referenceNumber, reason: opts?.reason || '' }
      });
    }
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
    try {
      const amount = toMoney(input.amount);
      if (amount <= 0) return;
      await accountingService.postTransaction({
        companyId: input.companyId,
        reference: input.reference,
        description: input.description || 'Auto-post expense',
        sourceModule: 'expense',
        sourceId: input.sourceId,
        transactionDate: input.date || new Date(),
        createdBy: input.createdBy,
        lines: [
          { accountCode: '5001', debit: amount, propertyId: input.propertyId },
          { accountCode: '1001', credit: amount, propertyId: input.propertyId }
        ]
      });
    } catch (error: any) {
      if (isDuplicateKeyError(error)) return;
      const companyObjectId = safeObjectId(input.companyId);
      if (!companyObjectId) return;
      await AccountingEventLog.create({
        companyId: companyObjectId,
        eventType: 'expense_sync_failed',
        sourceModule: 'expense',
        sourceId: input.sourceId,
        success: false,
        message: error?.message || 'Failed to sync expense to accounting',
        metadata: { reference: input.reference }
      });
    }
  }

  async backfillFromExistingData(companyId: string): Promise<{ paymentsSynced: number; expensesSynced: number }> {
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
