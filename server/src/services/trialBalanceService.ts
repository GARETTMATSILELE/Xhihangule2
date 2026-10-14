import mongoose from 'mongoose';
import { JournalLine } from '../models/JournalLine';
import { JournalEntry } from '../models/JournalEntry';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { roundMoney } from '../utils/money';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

export type TrialBalanceStatus = 'BALANCED' | 'UNBALANCED' | 'REQUIRES_REVIEW';

export type TrialBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
};

export async function buildTrialBalance(input: {
  companyId: string;
  from?: Date;
  to?: Date;
  currency?: string;
}): Promise<{
  totalDebits: number;
  totalCredits: number;
  difference: number;
  accountCount: number;
  journalCount: number;
  postingCount: number;
  dateRange: { from?: string; to?: string };
  currency: string;
  status: TrialBalanceStatus;
  accounts: TrialBalanceRow[];
}> {
  const companyObjectId = toId(input.companyId);
  const dateFilter: Record<string, unknown> = { companyId: companyObjectId };
  if (input.from || input.to) {
    const entryQuery: Record<string, unknown> = { companyId: companyObjectId };
    if (input.from || input.to) {
      entryQuery.transactionDate = {
        ...(input.from ? { $gte: input.from } : {}),
        ...(input.to ? { $lte: input.to } : {})
      };
    }
    const entries = await JournalEntry.find(entryQuery).select('_id').lean();
    dateFilter.journalEntryId = { $in: entries.map((row) => row._id) };
  }

  const [grouped, journalCount, postingCount] = await Promise.all([
    JournalLine.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$accountId',
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
          lines: { $sum: 1 }
        }
      }
    ]),
    JournalEntry.countDocuments(
      input.from || input.to
        ? {
            companyId: companyObjectId,
            transactionDate: {
              ...(input.from ? { $gte: input.from } : {}),
              ...(input.to ? { $lte: input.to } : {})
            }
          }
        : { companyId: companyObjectId }
    ),
    JournalLine.countDocuments(dateFilter)
  ]);

  const accounts = await ChartOfAccount.find({
    companyId: companyObjectId,
    _id: { $in: grouped.map((row) => row._id) }
  })
    .select('code name')
    .lean();
  const nameById = new Map(accounts.map((row) => [String(row._id), row]));

  const rows: TrialBalanceRow[] = grouped.map((row) => {
    const meta = nameById.get(String(row._id));
    const debit = roundMoney(Number(row.debit || 0));
    const credit = roundMoney(Number(row.credit || 0));
    return {
      accountId: String(row._id),
      accountCode: meta?.code || 'UNKNOWN',
      accountName: meta?.name || 'Unknown account',
      debit,
      credit,
      balance: roundMoney(debit - credit)
    };
  }).sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalDebits = roundMoney(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredits = roundMoney(rows.reduce((s, r) => s + r.credit, 0));
  const difference = roundMoney(totalDebits - totalCredits);
  const unknownAccounts = rows.filter((r) => r.accountCode === 'UNKNOWN').length;
  let status: TrialBalanceStatus = Math.abs(difference) <= 0.005 ? 'BALANCED' : 'UNBALANCED';
  if (unknownAccounts > 0 && status === 'BALANCED') status = 'REQUIRES_REVIEW';

  return {
    totalDebits,
    totalCredits,
    difference,
    accountCount: rows.length,
    journalCount,
    postingCount,
    dateRange: {
      from: input.from ? input.from.toISOString() : undefined,
      to: input.to ? input.to.toISOString() : undefined
    },
    currency: input.currency || 'USD',
    status,
    accounts: rows
  };
}
