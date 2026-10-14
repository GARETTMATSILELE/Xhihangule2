import mongoose from 'mongoose';
import { TaxObligation } from '../models/TaxObligation';
import { TaxPayment } from '../models/TaxPayment';
import { VatRecord } from '../models/VatRecord';
import accountingService from './accountingService';
import { buildVatPaymentJournal, buildWithholdingRemittanceJournal } from './tax/principalAgentJournal';
import { GL } from './tax/chartAccounts';
import { markObligationsPaid, outstandingForObligation } from './taxObligationService';
import { roundMoney } from '../utils/money';
import { AppError } from '../middleware/errorHandler';
import type { CanonicalTaxType } from './tax/taxTypes';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

export async function recordZimraPayment(input: {
  companyId: string;
  createdBy: string;
  amount: number;
  paymentDate: Date;
  bankAccountCode?: string;
  zimraReference?: string;
  paymentReference?: string;
  notes?: string;
  allocations: Array<{ taxObligationId: string; amount: number }>;
  unallocatedAmount?: number;
  unallocatedReason?: string;
}): Promise<{ paymentId: string; journalEntryId?: string; unallocatedAmount: number }> {
  const amount = roundMoney(Number(input.amount || 0));
  if (!(amount > 0)) throw new AppError('A positive payment amount is required', 400);
  if (!input.allocations?.length) throw new AppError('At least one tax allocation is required', 400);

  const allocated = roundMoney(input.allocations.reduce((s, a) => s + Number(a.amount || 0), 0));
  const unallocatedAmount = roundMoney(Number(input.unallocatedAmount || 0));
  if (unallocatedAmount < 0) throw new AppError('Unallocated amount cannot be negative', 400);
  if (Math.abs(allocated + unallocatedAmount - amount) > 0.0001) {
    throw new AppError(
      `Allocations (${allocated.toFixed(2)}) plus unallocated (${unallocatedAmount.toFixed(2)}) must equal the payment amount (${amount.toFixed(2)}). Overpayments cannot be silently dropped.`,
      400
    );
  }
  if (unallocatedAmount > 0 && !String(input.unallocatedReason || '').trim()) {
    throw new AppError('An unallocated amount requires an explicit reason or another documented allocation', 400);
  }

  const types = new Set<CanonicalTaxType>();
  const allocationDocs: Array<{ taxObligationId: mongoose.Types.ObjectId; taxType: CanonicalTaxType; taxPeriod?: string; amount: number }> = [];
  for (const alloc of input.allocations) {
    const outstanding = await outstandingForObligation(alloc.taxObligationId);
    if (roundMoney(alloc.amount) - outstanding > 0.0001) {
      throw new AppError(`Cannot allocate ${alloc.amount} — outstanding is ${outstanding.toFixed(2)}`, 400);
    }
    const obligation = await TaxObligation.findById(alloc.taxObligationId).lean();
    if (!obligation || String(obligation.companyId) !== String(input.companyId)) {
      throw new AppError('Tax obligation not found', 404);
    }
    if (obligation.status === 'REVERSED') throw new AppError('Cannot allocate to a reversed obligation', 400);
    types.add(obligation.taxType as CanonicalTaxType);
    allocationDocs.push({
      taxObligationId: toId(alloc.taxObligationId),
      taxType: obligation.taxType as CanonicalTaxType,
      taxPeriod: obligation.taxPeriod,
      amount: roundMoney(alloc.amount)
    });
  }

  const vatTypes = ['VAT_OUTPUT', 'VAT_ON_COMMISSION', 'VAT_INPUT', 'VAT_WITHHOLDING'];
  const isVatPayment = [...types].every((t) => vatTypes.includes(t));
  const lines = isVatPayment
    ? buildVatPaymentJournal({
      amount,
      bankAccountCode: input.bankAccountCode || GL.COMPANY_BANK,
      allocatedAmount: allocated,
      unallocatedAmount
    })
    : [
      ...buildWithholdingRemittanceJournal({ amount: allocated, bankAccountCode: input.bankAccountCode || GL.TRUST_BANK }),
      ...(unallocatedAmount > 0
        ? [
          { accountCode: GL.TAX_PREPAYMENT, debit: unallocatedAmount },
          { accountCode: input.bankAccountCode || GL.TRUST_BANK, credit: unallocatedAmount }
        ]
        : [])
    ];

    const identity = [
      input.companyId,
      String(input.zimraReference || '').trim(),
      String(input.paymentReference || '').trim(),
      amount.toFixed(2),
      input.paymentDate.toISOString().slice(0, 10),
      input.allocations.map((a) => `${a.taxObligationId}:${roundMoney(a.amount)}`).sort().join(',')
    ].join('|');
    const posted = await accountingService.postTransaction({
    companyId: input.companyId,
    reference: `ZIMRA-${String(input.zimraReference || input.paymentReference || identity).slice(0, 80)}`,
    description: `ZIMRA payment ${input.paymentReference || input.zimraReference || ''}`.trim(),
    sourceModule: 'tax',
    sourceId: `taxpay:${identity}`,
    transactionDate: input.paymentDate,
    createdBy: input.createdBy,
    lines
  });

  const payment = await TaxPayment.create({
    companyId: toId(input.companyId),
    amount,
    currency: 'USD',
    paymentDate: input.paymentDate,
    bankAccountCode: input.bankAccountCode || (isVatPayment ? GL.COMPANY_BANK : GL.TRUST_BANK),
    zimraReference: input.zimraReference,
    paymentReference: input.paymentReference,
    notes: input.notes,
    status: 'POSTED',
    allocations: allocationDocs,
    unallocatedAmount,
    unallocatedReason: unallocatedAmount > 0 ? String(input.unallocatedReason || '').trim() : undefined,
    journalEntryId: posted.journalEntryId,
    createdBy: toId(input.createdBy)
  });

  await markObligationsPaid({
    allocations: input.allocations,
    paymentReference: input.paymentReference,
    zimraReference: input.zimraReference,
    paidAt: input.paymentDate
  });

  if (isVatPayment) {
    for (const alloc of input.allocations) {
      const obligation = await TaxObligation.findById(alloc.taxObligationId).lean();
      if (!obligation?.paymentId) continue;
      await VatRecord.updateOne(
        {
          companyId: toId(input.companyId),
          transactionId: String(obligation.paymentId),
          sourceType: { $in: ['rental', 'sale', 'introduction'] }
        },
        { $inc: { vatPaid: roundMoney(alloc.amount) } }
      );
    }
  }

  return { paymentId: String(payment._id), journalEntryId: posted.journalEntryId, unallocatedAmount };
}

export async function attachTaxPaymentReceipt(input: {
  companyId: string;
  paymentId: string;
  uploadedBy: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}): Promise<void> {
  const row = await TaxPayment.findOne({ _id: input.paymentId, companyId: toId(input.companyId) });
  if (!row) throw new AppError('Tax payment not found', 404);
  row.receiptFileName = input.fileName;
  row.receiptContentType = input.contentType;
  row.receiptData = input.data;
  row.receiptUploadedAt = new Date();
  row.receiptUploadedBy = toId(input.uploadedBy);
  await row.save();
}
