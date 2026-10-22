import mongoose from 'mongoose';
import { VatReturn } from '../models/VatReturn';
import { TaxObligation } from '../models/TaxObligation';
import { Payment } from '../models/Payment';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { GL } from './tax/chartAccounts';
import { roundMoney } from '../utils/money';
import { AppError } from '../middleware/errorHandler';
import { isReversalDocument } from './paymentReversalPolicy';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

const periodBounds = (filingPeriod: string): { start: Date; end: Date } => {
  const [year, month] = filingPeriod.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
};

export async function glOutputVatForPeriod(companyId: string, filingPeriod: string): Promise<number> {
  const companyObjectId = toId(companyId);
  const account = await ChartOfAccount.findOne({
    companyId: companyObjectId,
    code: GL.VAT_PAYABLE,
    isDeleted: { $ne: true }
  }).select('_id').lean();
  if (!account) return 0;
  const { start, end } = periodBounds(filingPeriod);
  const entries = await JournalEntry.find({
    companyId: companyObjectId,
    transactionDate: { $gte: start, $lte: end }
  }).select('_id').lean();
  if (!entries.length) return 0;
  const summed = await JournalLine.aggregate([
    {
      $match: {
        companyId: companyObjectId,
        accountId: account._id,
        journalEntryId: { $in: entries.map((row) => row._id) }
      }
    },
    { $group: { _id: null, credits: { $sum: '$credit' }, debits: { $sum: '$debit' } } }
  ]);
  // Net movement on the VAT payable account for journals dated in this filing period.
  // A reversal journal dated in a later period does not reduce this period's credit.
  return roundMoney(Number(summed[0]?.credits || 0) - Number(summed[0]?.debits || 0));
}

export async function prepareVatReturn(companyId: string, filingPeriod: string, preparedBy?: string) {
  if (!/^\d{4}-\d{2}$/.test(filingPeriod)) {
    throw new AppError('filingPeriod must be YYYY-MM', 400);
  }
  const companyObjectId = toId(companyId);
  const vatTypes = ['VAT_OUTPUT', 'VAT_ON_COMMISSION', 'VAT_INPUT', 'VAT_WITHHOLDING'];
  const obligations = await TaxObligation.find({
    companyId: companyObjectId,
    taxPeriod: filingPeriod,
    taxType: { $in: vatTypes },
    status: { $ne: 'REVERSED' }
  }).lean();

  const payments = await Payment.find({
    companyId: companyObjectId,
    status: 'completed',
    isProvisional: { $ne: true },
    reversalOfPaymentId: { $exists: false }
  })
    .select('amount paymentDate paymentType commissionDetails vatAmount vatRate vatIncluded reversalState reversalOfPaymentId isCorrectionEntry referenceNumber')
    .lean();

  const inPeriod = (date: Date) => {
    const d = new Date(date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return key === filingPeriod;
  };

  let taxableSupplies = 0;
  let exemptSupplies = 0;
  let zeroRatedSupplies = 0;
  for (const payment of payments) {
    // Historical status stays on the payment. A fully reversed original and its
    // negative REV do not contribute taxable supplies again. The replacement does.
    if (isReversalDocument(payment)) continue;
    if (String((payment as any).reversalState || '') === 'reversed') continue;
    if (Number((payment as any).amount || 0) < 0) continue;
    if (!inPeriod(payment.paymentDate as Date)) continue;
    const vatOnCommission = Number((payment as any)?.commissionDetails?.vatOnCommission || 0);
    const saleVat = Number((payment as any)?.vatAmount || 0);
    const commissionNet = Number((payment as any)?.commissionDetails?.commissionNet || (payment as any)?.commissionDetails?.totalCommission || 0);
    const treatment = String((payment as any)?.commissionDetails?.vatSupplyTreatment || '').toUpperCase();
    if (treatment === 'ZERO_RATED') {
      zeroRatedSupplies = roundMoney(zeroRatedSupplies + commissionNet);
    } else if (vatOnCommission > 0 || saleVat > 0) {
      taxableSupplies = roundMoney(taxableSupplies + commissionNet);
    } else {
      exemptSupplies = roundMoney(exemptSupplies + Number(payment.amount || 0));
    }
  }

  const vatOnCommission = roundMoney(
    obligations.filter((o) => o.taxType === 'VAT_ON_COMMISSION').reduce((s, o) => s + Number(o.taxAmount || 0), 0)
  );
  const vatOnSales = roundMoney(
    obligations.filter((o) => o.taxType === 'VAT_OUTPUT').reduce((s, o) => s + Number(o.taxAmount || 0), 0)
  );
  const inputVat = roundMoney(
    obligations.filter((o) => o.taxType === 'VAT_INPUT').reduce((s, o) => s + Number(o.taxAmount || 0), 0)
  );
  const vatWithholdingCredits = roundMoney(
    obligations.filter((o) => o.taxType === 'VAT_WITHHOLDING').reduce((s, o) => s + Number(o.taxAmount || 0), 0)
  );
  const outputVat = roundMoney(vatOnCommission + vatOnSales);
  const netVatPayable = roundMoney(outputVat - inputVat - vatWithholdingCredits);
  const glOutputVat = await glOutputVatForPeriod(companyId, filingPeriod);
  const obligationOutputVat = outputVat;
  const reconciliationDifference = roundMoney(obligationOutputVat - glOutputVat);
  const reconciliationStatus = Math.abs(reconciliationDifference) <= 0.005 ? 'MATCHED' : 'RECONCILIATION_REQUIRED';

  const doc = await VatReturn.findOneAndUpdate(
    { companyId: companyObjectId, filingPeriod },
    {
      $set: {
        taxableSupplies,
        exemptSupplies,
        zeroRatedSupplies,
        outputVat,
        inputVat,
        vatOnCommission,
        vatOnSales,
        vatWithholdingCredits,
        adjustments: 0,
        netVatPayable,
        glOutputVat,
        obligationOutputVat,
        reconciliationDifference,
        reconciliationStatus,
        preparedBy: preparedBy ? toId(preparedBy) : undefined,
        status: 'PREPARED'
      },
      $setOnInsert: { companyId: companyObjectId, filingPeriod }
    },
    { upsert: true, new: true }
  );

  await TaxObligation.updateMany(
    {
      companyId: companyObjectId,
      taxPeriod: filingPeriod,
      taxType: { $in: vatTypes },
      status: { $in: ['CALCULATED', 'PAYABLE', 'WITHHELD'] }
    },
    { $set: { status: 'RETURN_PREPARED' } }
  );

  return doc;
}

export async function updateVatReturnStatus(input: {
  companyId: string;
  filingPeriod: string;
  status: 'REVIEWED' | 'SUBMITTED' | 'PAID' | 'RECONCILED';
  zimraReturnReference?: string;
  paymentReference?: string;
  paymentDate?: Date;
  amountSubmitted?: number;
  notes?: string;
  reviewedBy?: string;
}) {
  const row = await VatReturn.findOne({ companyId: toId(input.companyId), filingPeriod: input.filingPeriod });
  if (!row) throw new AppError('VAT return not found — prepare it first', 404);
  if (input.status === 'PAID') {
    const remaining = await TaxObligation.find({
      companyId: toId(input.companyId),
      taxPeriod: input.filingPeriod,
      taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
      status: { $nin: ['PAID', 'RECONCILED', 'REVERSED'] }
    }).select('_id').lean();
    if (remaining.length) {
      throw new AppError('VAT return cannot be marked PAID until matching ZIMRA tax payments clear the outstanding obligations', 400);
    }
  }
  if (input.status === 'RECONCILED') {
    const difference = roundMoney(Number(row.reconciliationDifference || 0));
    if (Math.abs(difference) > 0.005) {
      const note = String(input.notes || row.reconciliationNote || '').trim();
      if (!note) {
        throw new AppError('RECONCILIATION REQUIRED. A material difference exists between tax-obligation output VAT and GL 2101. Document the timing difference before marking RECONCILED.', 400);
      }
      row.reconciliationStatus = 'TIMING_DIFFERENCE';
      row.reconciliationNote = note;
    } else {
      row.reconciliationStatus = 'MATCHED';
    }
  }
  row.status = input.status;
  if (input.zimraReturnReference) row.zimraReturnReference = input.zimraReturnReference;
  if (input.paymentReference) row.paymentReference = input.paymentReference;
  if (input.paymentDate) row.paymentDate = input.paymentDate;
  if (input.amountSubmitted != null) row.amountSubmitted = input.amountSubmitted;
  if (input.notes) row.notes = input.notes;
  if (input.status === 'SUBMITTED') row.submittedAt = new Date();
  if (input.reviewedBy && input.status === 'REVIEWED') row.reviewedBy = toId(input.reviewedBy);
  await row.save();

  if (input.status === 'SUBMITTED') {
    await TaxObligation.updateMany(
      {
        companyId: toId(input.companyId),
        taxPeriod: input.filingPeriod,
        taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION', 'VAT_INPUT', 'VAT_WITHHOLDING'] },
        status: 'RETURN_PREPARED'
      },
      { $set: { status: 'RETURN_SUBMITTED', submittedAt: new Date(), zimraReference: input.zimraReturnReference } }
    );
  }
  return row;
}

export async function listVatReturns(companyId: string) {
  return VatReturn.find({ companyId: toId(companyId) }).sort({ filingPeriod: -1 }).lean();
}

export async function isVatPeriodLocked(companyId: string, transactionDate: Date): Promise<boolean> {
  const period = `${transactionDate.getUTCFullYear()}-${String(transactionDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const row = await VatReturn.findOne({
    companyId: toId(companyId),
    filingPeriod: period,
    status: { $in: ['SUBMITTED', 'PAID', 'RECONCILED'] }
  }).select('_id').lean();
  return Boolean(row);
}

export async function assertVatPeriodOpen(companyId: string, transactionDate: Date, opts?: { allowAdjustment?: boolean }): Promise<void> {
  if (opts?.allowAdjustment) return;
  if (await isVatPeriodLocked(companyId, transactionDate)) {
    throw new AppError('VAT period is locked. Post an adjustment or reversal in the current open period.', 409);
  }
}
