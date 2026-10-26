import mongoose from 'mongoose';
import { TaxObligation } from '../../models/TaxObligation';
import { JournalEntry } from '../../models/JournalEntry';
import { JournalLine } from '../../models/JournalLine';
import { ChartOfAccount } from '../../models/ChartOfAccount';
import { AccountingException } from '../../models/AccountingException';
import { COLLECTIONS } from '../../config/collections';
import { GL } from './chartAccounts';
import { assessNewTaxIntegrity, type NewTaxIntegrity } from './newTaxIntegrity';

/**
 * Read-only check of taxable payments against obligations and VAT control-account lines.
 * Does not create obligations or post journals.
 */
export async function loadNewTaxIntegrity(companyId: string): Promise<NewTaxIntegrity> {
  const company = new mongoose.Types.ObjectId(companyId);
  const [payments, obligations, account, openFailedPostings] = await Promise.all([
    mongoose.connection.collection(COLLECTIONS.PAYMENTS).find(
      {
        companyId: company,
        $or: [
          { 'commissionDetails.vatOnCommission': { $gt: 0 } },
          { vatAmount: { $gt: 0 } }
        ]
      },
      {
        projection: {
          paymentDate: 1,
          status: 1,
          amount: 1,
          paymentType: 1,
          type: 1,
          vatAmount: 1,
          propertyId: 1,
          reversalOfPaymentId: 1,
          'commissionDetails.vatOnCommission': 1,
          'commissionDetails.vatRate': 1
        }
      }
    ).toArray(),
    TaxObligation.find({ companyId: company }).select('paymentId taxType taxAmount status reversalOf createdAt taxPeriod taxRate propertyId').lean(),
    ChartOfAccount.findOne({ companyId: company, code: GL.VAT_PAYABLE, isDeleted: { $ne: true } }).select('_id').lean(),
    AccountingException.countDocuments({ companyId: company, status: 'open' })
  ]);

  const lines = account
    ? await JournalLine.find({ companyId: company, accountId: (account as any)._id }).select('journalEntryId debit credit').lean()
    : [];
  const entries = lines.length
    ? await JournalEntry.find({ companyId: company, _id: { $in: lines.map((row: any) => row.journalEntryId) } }).select('sourceId').lean()
    : [];
  const entryById = new Map(entries.map((row: any) => [String(row._id), String(row.sourceId || '')]));
  const gl = new Map<string, { sourceId: string; debit: number; credit: number }>();
  for (const line of lines as any[]) {
    const sourceId = entryById.get(String(line.journalEntryId)) || '';
    const current = gl.get(sourceId) || { sourceId, debit: 0, credit: 0 };
    current.debit = Number((current.debit + Number(line.debit || 0)).toFixed(2));
    current.credit = Number((current.credit + Number(line.credit || 0)).toFixed(2));
    gl.set(sourceId, current);
  }

  return assessNewTaxIntegrity({
    openFailedPostings,
    sources: payments.map((row: any) => ({
      id: String(row._id),
      kind: String(row.type || row.paymentType || 'other'),
      status: String(row.status || ''),
      amount: Number(row.amount || 0),
      paymentDate: row.paymentDate,
      vatOnCommission: Number(row.commissionDetails?.vatOnCommission || 0),
      outputVat: Number(row.vatAmount || 0),
      taxRate: row.commissionDetails?.vatRate ?? null,
      propertyId: row.propertyId ? String(row.propertyId) : null,
      reversalOfPaymentId: row.reversalOfPaymentId ? String(row.reversalOfPaymentId) : null
    })),
    obligations: (obligations as any[]).map((row) => ({
      id: String(row._id),
      paymentId: row.paymentId ? String(row.paymentId) : '',
      taxType: String(row.taxType),
      taxAmount: Number(row.taxAmount || 0),
      status: String(row.status || ''),
      reversalOf: row.reversalOf ? String(row.reversalOf) : null,
      createdAt: row.createdAt,
      taxPeriod: row.taxPeriod || null,
      taxRate: row.taxRate ?? null,
      propertyId: row.propertyId ? String(row.propertyId) : null
    })),
    gl: [...gl.values()]
  });
}
