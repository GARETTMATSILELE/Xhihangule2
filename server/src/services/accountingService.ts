import mongoose from 'mongoose';
import { ChartOfAccount, AccountType } from '../models/ChartOfAccount';
import { JournalEntry, JournalSourceModule } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { VatRecord } from '../models/VatRecord';
import { CompanyBalance, getCompanyBalanceId } from '../models/CompanyBalance';
import { BankAccount } from '../models/BankAccount';
import { BankTransaction } from '../models/BankTransaction';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { Payment } from '../models/Payment';

export interface PostJournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  propertyId?: string;
  agentId?: string;
}

export interface PostTransactionInput {
  companyId: string;
  reference: string;
  description?: string;
  sourceModule: JournalSourceModule;
  sourceId?: string;
  transactionDate?: Date;
  createdBy?: string;
  lines: PostJournalLineInput[];
  vat?: {
    sourceType: string;
    vatCollected?: number;
    vatPaid?: number;
    vatRate?: number;
    filingPeriod?: string;
    status?: 'pending' | 'submitted';
  };
}

type AccountSeed = {
  code: string;
  name: string;
  type: AccountType;
};

const DEFAULT_ACCOUNTS: AccountSeed[] = [
  { code: '1001', name: 'Main Bank Account', type: 'asset' },
  { code: '1002', name: 'Cash On Hand', type: 'asset' },
  { code: '2101', name: 'VAT Payable', type: 'liability' },
  { code: '2102', name: 'Commission Liability', type: 'liability' },
  { code: '3001', name: 'Retained Earnings', type: 'equity' },
  { code: '4001', name: 'Rental Income', type: 'revenue' },
  { code: '4002', name: 'Sales Income', type: 'revenue' },
  { code: '5001', name: 'Operating Expense', type: 'expense' },
  { code: '5002', name: 'Commission Expense', type: 'expense' },
  { code: '5003', name: 'VAT Expense', type: 'expense' }
];

const toMoney = (value: number): number => Number(Number(value || 0).toFixed(2));

const defaultFilingPeriod = (date: Date): string => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const toObjectId = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

const ensurePositive = (value?: number): number => {
  const n = Number(value || 0);
  return n > 0 ? toMoney(n) : 0;
};

class AccountingService {
  private indexesEnsured = false;

  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;
    await Promise.all([
      ChartOfAccount.collection.createIndex({ companyId: 1, code: 1 }, { unique: true }),
      ChartOfAccount.collection.createIndex({ companyId: 1, type: 1 }),
      ChartOfAccount.collection.createIndex({ companyId: 1, parentAccountId: 1 }),
      JournalEntry.collection.createIndex({ companyId: 1, transactionDate: -1 }),
      JournalEntry.collection.createIndex({ companyId: 1, sourceModule: 1, transactionDate: -1 }),
      JournalEntry.collection.createIndex({ companyId: 1, reference: 1 }, { unique: true }),
      JournalLine.collection.createIndex({ companyId: 1, accountId: 1, createdAt: -1 }),
      JournalLine.collection.createIndex({ companyId: 1, journalEntryId: 1 }),
      VatRecord.collection.createIndex({ companyId: 1, filingPeriod: 1 }),
      VatRecord.collection.createIndex({ companyId: 1, status: 1 }),
      CompanyBalance.collection.createIndex({ companyId: 1 }, { unique: true }),
      BankTransaction.collection.createIndex({ companyId: 1, bankAccountId: 1, matched: 1 })
    ]);
    this.indexesEnsured = true;
  }

  async initializeForCompany(companyId: string): Promise<void> {
    await this.ensureIndexes();
    await this.ensureDefaultChartOfAccounts(companyId);
    await this.ensureCompanyBalance(companyId);
  }

  async ensureDefaultChartOfAccounts(companyId: string, session?: mongoose.ClientSession): Promise<void> {
    const companyObjectId = toObjectId(companyId);
    for (const account of DEFAULT_ACCOUNTS) {
      await ChartOfAccount.updateOne(
        { companyId: companyObjectId, code: account.code },
        {
          $setOnInsert: {
            companyId: companyObjectId,
            code: account.code,
            name: account.name,
            type: account.type,
            balance: 0,
            currency: 'USD',
            isActive: true,
            isDeleted: false
          }
        },
        { upsert: true, session }
      );
    }
  }

  async ensureCompanyBalance(companyId: string, session?: mongoose.ClientSession): Promise<void> {
    const companyObjectId = toObjectId(companyId);
    const id = getCompanyBalanceId(companyId);
    await CompanyBalance.updateOne(
      { companyId: companyObjectId },
      {
        $setOnInsert: {
          _id: id,
          companyId: companyObjectId,
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          vatPayable: 0,
          commissionLiability: 0,
          lastUpdated: new Date()
        }
      },
      { upsert: true, session }
    );
  }

  async postTransaction(input: PostTransactionInput): Promise<{ journalEntryId: string }> {
    await this.ensureIndexes();
    const run = async (session?: mongoose.ClientSession): Promise<{ journalEntryId: string }> => {
      await this.ensureDefaultChartOfAccounts(input.companyId, session);
      await this.ensureCompanyBalance(input.companyId, session);

      const companyObjectId = toObjectId(input.companyId);
      const transactionDate = input.transactionDate || new Date();
      const preparedLines = input.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: ensurePositive(line.debit),
        credit: ensurePositive(line.credit),
        propertyId: line.propertyId,
        agentId: line.agentId
      }));

      const totalDebit = toMoney(preparedLines.reduce((sum, line) => sum + line.debit, 0));
      const totalCredit = toMoney(preparedLines.reduce((sum, line) => sum + line.credit, 0));
      if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
        throw new Error(`Journal is unbalanced. debit=${totalDebit}, credit=${totalCredit}`);
      }

      const accountCodes = Array.from(new Set(preparedLines.map((line) => line.accountCode)));
      const accounts = await ChartOfAccount.find({
        companyId: companyObjectId,
        code: { $in: accountCodes },
        isDeleted: { $ne: true }
      }).session(session || null);
      const accountMap = new Map(accounts.map((account) => [account.code, account]));

      for (const code of accountCodes) {
        if (!accountMap.has(code)) {
          throw new Error(`Chart of account not found for code ${code}`);
        }
      }

      const journalEntry = await JournalEntry.create(
        [
          {
            companyId: companyObjectId,
            reference: input.reference,
            description: input.description,
            sourceModule: input.sourceModule,
            sourceId: input.sourceId,
            status: 'posted',
            transactionDate,
            createdBy: input.createdBy ? toObjectId(input.createdBy) : undefined
          }
        ],
        session ? { session } : undefined
      );
      const createdEntry = journalEntry[0];

      const journalLinesToInsert: Array<Record<string, unknown>> = [];
      let deltaRevenue = 0;
      let deltaExpenses = 0;
      let deltaVatPayable = 0;
      let deltaCommissionLiability = 0;

      for (const line of preparedLines) {
        const account = accountMap.get(line.accountCode)!;
        const delta = toMoney(line.debit - line.credit);
        const nextBalance = toMoney((account.balance || 0) + delta);
        account.balance = nextBalance;
        await account.save(session ? { session } : undefined);

        if (account.type === 'revenue') {
          deltaRevenue = toMoney(deltaRevenue + (line.credit - line.debit));
        } else if (account.type === 'expense') {
          deltaExpenses = toMoney(deltaExpenses + (line.debit - line.credit));
        }
        if (account.code === '2101') {
          deltaVatPayable = toMoney(deltaVatPayable + (line.credit - line.debit));
        }
        if (account.code === '2102') {
          deltaCommissionLiability = toMoney(deltaCommissionLiability + (line.credit - line.debit));
        }

        journalLinesToInsert.push({
          companyId: companyObjectId,
          journalEntryId: createdEntry._id,
          accountId: account._id,
          debit: line.debit,
          credit: line.credit,
          runningBalanceSnapshot: nextBalance,
          propertyId: line.propertyId ? toObjectId(line.propertyId) : undefined,
          agentId: line.agentId ? toObjectId(line.agentId) : undefined
        });
      }

      if (session) {
        await JournalLine.insertMany(journalLinesToInsert, { session });
      } else {
        await JournalLine.insertMany(journalLinesToInsert);
      }

      const existingBalance = await CompanyBalance.findOne({ companyId: companyObjectId }).session(session || null);
      const totalRevenue = toMoney((existingBalance?.totalRevenue || 0) + deltaRevenue);
      const totalExpenses = toMoney((existingBalance?.totalExpenses || 0) + deltaExpenses);
      const vatPayable = toMoney((existingBalance?.vatPayable || 0) + deltaVatPayable);
      const commissionLiability = toMoney((existingBalance?.commissionLiability || 0) + deltaCommissionLiability);
      await CompanyBalance.updateOne(
        { companyId: companyObjectId },
        {
          $set: {
            _id: getCompanyBalanceId(input.companyId),
            totalRevenue,
            totalExpenses,
            netProfit: toMoney(totalRevenue - totalExpenses),
            vatPayable,
            commissionLiability,
            lastUpdated: new Date()
          }
        },
        { upsert: true, session }
      );

      if (input.vat) {
        await VatRecord.updateOne(
          {
            companyId: companyObjectId,
            transactionId: input.sourceId || String(createdEntry._id),
            sourceType: input.vat.sourceType
          },
          {
            $set: {
              vatCollected: toMoney(input.vat.vatCollected || 0),
              vatPaid: toMoney(input.vat.vatPaid || 0),
              vatRate: Number(input.vat.vatRate || 0),
              filingPeriod: input.vat.filingPeriod || defaultFilingPeriod(transactionDate),
              status: input.vat.status || 'pending'
            }
          },
          { upsert: true, session }
        );
      }

      await AccountingEventLog.create(
        [
          {
            companyId: companyObjectId,
            eventType: 'transaction_posted',
            sourceModule: input.sourceModule,
            sourceId: input.sourceId,
            success: true,
            message: `Posted transaction ${input.reference}`,
            metadata: {
              journalEntryId: createdEntry._id.toString(),
              totalDebit,
              totalCredit
            }
          }
        ],
        session ? { session } : undefined
      );

      return { journalEntryId: createdEntry._id.toString() };
    };

    let session: mongoose.ClientSession | null = null;
    try {
      session = await mongoose.startSession();
      let result: { journalEntryId: string } = { journalEntryId: '' };
      await session.withTransaction(async () => {
        result = await run(session || undefined);
      });
      return result;
    } catch (error: any) {
      // Cosmos/Mongo API deployments may disable transactions.
      if (error?.code === 20 || /Transaction numbers are only allowed/.test(String(error?.message || ''))) {
        return run(undefined);
      }
      throw error;
    } finally {
      if (session) {
        try {
          session.endSession();
        } catch {
          // no-op
        }
      }
    }
  }

  async getProfitAndLoss(companyId: string, from?: Date, to?: Date): Promise<{ revenue: number; expenses: number; netProfit: number }> {
    const companyObjectId = toObjectId(companyId);
    const dateMatch = from || to ? { createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {};
    const rows = await JournalLine.aggregate([
      { $match: { companyId: companyObjectId, ...dateMatch } },
      {
        $lookup: {
          from: 'chartofaccounts',
          localField: 'accountId',
          foreignField: '_id',
          as: 'account'
        }
      },
      { $unwind: '$account' },
      {
        $match: {
          'account.companyId': companyObjectId,
          'account.type': { $in: ['revenue', 'expense'] }
        }
      },
      {
        $group: {
          _id: '$account.type',
          revenueAmount: { $sum: { $subtract: ['$credit', '$debit'] } },
          expenseAmount: { $sum: { $subtract: ['$debit', '$credit'] } }
        }
      }
    ]);

    const revenue = toMoney(rows.find((row) => row._id === 'revenue')?.revenueAmount || 0);
    const expenses = toMoney(rows.find((row) => row._id === 'expense')?.expenseAmount || 0);
    return { revenue, expenses, netProfit: toMoney(revenue - expenses) };
  }

  async getBalanceSheet(companyId: string): Promise<{ assets: number; liabilities: number; equity: number }> {
    const companyObjectId = toObjectId(companyId);
    const rows = await ChartOfAccount.aggregate([
      { $match: { companyId: companyObjectId, isDeleted: { $ne: true }, isActive: true } },
      { $group: { _id: '$type', total: { $sum: '$balance' } } }
    ]);
    return {
      assets: toMoney(rows.find((row) => row._id === 'asset')?.total || 0),
      liabilities: toMoney(rows.find((row) => row._id === 'liability')?.total || 0),
      equity: toMoney(rows.find((row) => row._id === 'equity')?.total || 0)
    };
  }

  async getDashboardSummary(companyId: string): Promise<Record<string, number | string>> {
    const companyObjectId = toObjectId(companyId);
    await this.ensureCompanyBalance(companyId);
    const [balance, cash, unreconciledBank, pendingVat, pendingExpense, unpaidCommissions, completedPaymentRevenue] = await Promise.all([
      CompanyBalance.findOne({ companyId: companyObjectId }).lean(),
      BankAccount.aggregate([{ $match: { companyId: companyObjectId } }, { $group: { _id: null, total: { $sum: '$currentBalance' } } }]),
      BankTransaction.countDocuments({ companyId: companyObjectId, matched: false }),
      VatRecord.countDocuments({ companyId: companyObjectId, status: 'pending' }),
      JournalEntry.countDocuments({ companyId: companyObjectId, sourceModule: 'expense' }),
      JournalLine.aggregate([
        {
          $lookup: {
            from: 'chartofaccounts',
            localField: 'accountId',
            foreignField: '_id',
            as: 'account'
          }
        },
        { $unwind: '$account' },
        { $match: { companyId: companyObjectId, 'account.code': '2102' } },
        { $group: { _id: null, amount: { $sum: { $subtract: ['$credit', '$debit'] } } } }
      ]),
      Payment.aggregate([
        { $match: { companyId: companyObjectId, status: 'completed' } },
        { $group: { _id: null, amount: { $sum: '$commissionDetails.agencyShare' } } }
      ])
    ]);

    const cashBalance = toMoney(cash[0]?.total || 0);
    const vatDueAmount = toMoney(balance?.vatPayable || 0);
    const ledgerRevenue = toMoney(balance?.totalRevenue || 0);
    const paymentRevenue = toMoney(completedPaymentRevenue[0]?.amount || 0);
    const totalRevenue = toMoney(Math.max(ledgerRevenue, paymentRevenue));
    const totalExpenses = toMoney(balance?.totalExpenses || 0);
    const netProfit = toMoney(totalRevenue - totalExpenses);

    // Self-heal stale dashboard snapshots so subsequent calls stay stable.
    if (totalRevenue !== ledgerRevenue || netProfit !== toMoney(balance?.netProfit || 0)) {
      await CompanyBalance.updateOne(
        { companyId: companyObjectId },
        {
          $set: {
            _id: getCompanyBalanceId(companyId),
            totalRevenue,
            netProfit,
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      );
    }

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      vatPayable: vatDueAmount,
      commissionLiability: toMoney(balance?.commissionLiability || unpaidCommissions[0]?.amount || 0),
      cashBalance,
      unreconciledBankTransactions: unreconciledBank,
      vatDuePeriods: pendingVat,
      pendingExpenses: pendingExpense,
      unpaidCommissions: Math.max(0, toMoney(unpaidCommissions[0]?.amount || 0)),
      lastUpdated: balance?.lastUpdated?.toISOString() || new Date().toISOString()
    };
  }

  async getTrend(companyId: string, accountType: 'revenue' | 'expense', months = 12): Promise<Array<{ month: string; total: number }>> {
    const companyObjectId = toObjectId(companyId);
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months + 1);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await JournalLine.aggregate([
      { $match: { companyId: companyObjectId, createdAt: { $gte: since } } },
      {
        $lookup: {
          from: 'chartofaccounts',
          localField: 'accountId',
          foreignField: '_id',
          as: 'account'
        }
      },
      { $unwind: '$account' },
      { $match: { 'account.companyId': companyObjectId, 'account.type': accountType } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          value: {
            $sum: accountType === 'revenue'
              ? { $subtract: ['$credit', '$debit'] }
              : { $subtract: ['$debit', '$credit'] }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    return rows.map((row) => ({
      month: `${row._id.year}-${String(row._id.month).padStart(2, '0')}`,
      total: toMoney(row.value || 0)
    }));
  }

  async getVatStatus(
    companyId: string,
    filters?: { filingPeriod?: string; status?: 'pending' | 'submitted' }
  ): Promise<Array<{ filingPeriod: string; vatCollected: number; vatPaid: number; vatPayable: number; status: string }>> {
    const companyObjectId = toObjectId(companyId);
    const rows = await VatRecord.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          ...(filters?.filingPeriod ? { filingPeriod: filters.filingPeriod } : {}),
          ...(filters?.status ? { status: filters.status } : {})
        }
      },
      {
        $group: {
          _id: { filingPeriod: '$filingPeriod', status: '$status' },
          vatCollected: { $sum: '$vatCollected' },
          vatPaid: { $sum: '$vatPaid' }
        }
      },
      { $sort: { '_id.filingPeriod': -1 } }
    ]);

    return rows.map((row) => ({
      filingPeriod: row._id.filingPeriod,
      status: row._id.status,
      vatCollected: toMoney(row.vatCollected || 0),
      vatPaid: toMoney(row.vatPaid || 0),
      vatPayable: toMoney((row.vatCollected || 0) - (row.vatPaid || 0))
    }));
  }

  async getBankReconciliation(
    companyId: string,
    params?: { bankAccountId?: string; matched?: boolean; startDate?: Date; endDate?: Date; limit?: number }
  ): Promise<Array<Record<string, unknown>>> {
    const companyObjectId = toObjectId(companyId);
    const query: Record<string, unknown> = { companyId: companyObjectId };
    if (params?.bankAccountId && mongoose.Types.ObjectId.isValid(params.bankAccountId)) {
      query.bankAccountId = toObjectId(params.bankAccountId);
    }
    if (typeof params?.matched === 'boolean') {
      query.matched = params.matched;
    }
    if (params?.startDate || params?.endDate) {
      query.transactionDate = {
        ...(params.startDate ? { $gte: params.startDate } : {}),
        ...(params.endDate ? { $lte: params.endDate } : {})
      };
    }
    const rows = await BankTransaction.find(query)
      .sort({ transactionDate: -1, createdAt: -1 })
      .limit(Math.min(Math.max(Number(params?.limit || 200), 1), 500))
      .populate('bankAccountId', 'name accountNumber')
      .lean();
    return rows as Array<Record<string, unknown>>;
  }

  async reconcileBankTransaction(
    companyId: string,
    bankTransactionId: string,
    payload: { matched: boolean; matchedTransactionId?: string }
  ): Promise<Record<string, unknown> | null> {
    const companyObjectId = toObjectId(companyId);
    if (!mongoose.Types.ObjectId.isValid(bankTransactionId)) {
      throw new Error('Invalid bankTransactionId');
    }
    const updated = await BankTransaction.findOneAndUpdate(
      { _id: toObjectId(bankTransactionId), companyId: companyObjectId },
      {
        $set: {
          matched: payload.matched,
          matchedTransactionId: payload.matched ? payload.matchedTransactionId : undefined
        }
      },
      { new: true }
    )
      .populate('bankAccountId', 'name accountNumber')
      .lean();
    return updated as Record<string, unknown> | null;
  }

  async suggestBankTransactionMatches(
    companyId: string,
    bankTransactionId: string
  ): Promise<Array<{ journalEntryId: string; reference: string; description?: string; transactionDate: Date; amount: number; score: number; reasons: string[] }>> {
    const companyObjectId = toObjectId(companyId);
    if (!mongoose.Types.ObjectId.isValid(bankTransactionId)) {
      throw new Error('Invalid bankTransactionId');
    }
    const bankTx = await BankTransaction.findOne({ _id: toObjectId(bankTransactionId), companyId: companyObjectId }).lean();
    if (!bankTx) {
      throw new Error('Bank transaction not found');
    }

    const txDate = new Date(bankTx.transactionDate);
    const minDate = new Date(txDate);
    minDate.setDate(minDate.getDate() - 14);
    const maxDate = new Date(txDate);
    maxDate.setDate(maxDate.getDate() + 14);
    const targetAmount = Math.abs(Number(bankTx.amount || 0));
    const minAmount = Math.max(0, targetAmount - 5);
    const maxAmount = targetAmount + 5;

    const candidates = await JournalEntry.aggregate([
      {
        $match: {
          companyId: companyObjectId,
          transactionDate: { $gte: minDate, $lte: maxDate }
        }
      },
      {
        $lookup: {
          from: 'journallines',
          let: { entryId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$journalEntryId', '$$entryId'] } } },
            {
              $lookup: {
                from: 'chartofaccounts',
                localField: 'accountId',
                foreignField: '_id',
                as: 'account'
              }
            },
            { $unwind: '$account' },
            { $match: { 'account.code': '1001' } },
            { $project: { _id: 0, movement: { $abs: { $subtract: ['$debit', '$credit'] } } } }
          ],
          as: 'cashLines'
        }
      },
      {
        $project: {
          _id: 1,
          reference: 1,
          description: 1,
          transactionDate: 1,
          amount: { $ifNull: [{ $arrayElemAt: ['$cashLines.movement', 0] }, 0] }
        }
      },
      {
        $match: {
          amount: { $gte: minAmount, $lte: maxAmount }
        }
      },
      { $sort: { transactionDate: -1 } },
      { $limit: 30 }
    ]);

    const normalizedRef = String(bankTx.reference || '').trim().toLowerCase();
    const result = candidates
      .map((candidate: any) => {
        const reasons: string[] = [];
        let score = 0;
        const candidateAmount = Number(candidate.amount || 0);
        const amountDiff = Math.abs(candidateAmount - targetAmount);
        if (amountDiff < 0.01) {
          score += 55;
          reasons.push('exact_amount');
        } else if (amountDiff <= 1) {
          score += 40;
          reasons.push('near_amount');
        } else if (amountDiff <= 5) {
          score += 25;
          reasons.push('close_amount');
        }

        const daysDiff = Math.abs(
          Math.round((new Date(candidate.transactionDate).getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24))
        );
        if (daysDiff === 0) {
          score += 25;
          reasons.push('same_day');
        } else if (daysDiff <= 2) {
          score += 18;
          reasons.push('within_2_days');
        } else if (daysDiff <= 7) {
          score += 10;
          reasons.push('within_7_days');
        }

        const candidateRef = String(candidate.reference || '').toLowerCase();
        if (normalizedRef && candidateRef && (candidateRef.includes(normalizedRef) || normalizedRef.includes(candidateRef))) {
          score += 20;
          reasons.push('reference_match');
        }

        return {
          journalEntryId: String(candidate._id),
          reference: String(candidate.reference || ''),
          description: candidate.description ? String(candidate.description) : undefined,
          transactionDate: new Date(candidate.transactionDate),
          amount: toMoney(candidateAmount),
          score,
          reasons
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return result;
  }

  async getCommissionLiability(companyId: string): Promise<{ outstandingLiability: number }> {
    const companyObjectId = toObjectId(companyId);
    const rows = await JournalLine.aggregate([
      {
        $lookup: {
          from: 'chartofaccounts',
          localField: 'accountId',
          foreignField: '_id',
          as: 'account'
        }
      },
      { $unwind: '$account' },
      { $match: { companyId: companyObjectId, 'account.code': '2102' } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$credit', '$debit'] } } } }
    ]);
    return { outstandingLiability: toMoney(rows[0]?.total || 0) };
  }

  async getLedger(
    companyId: string,
    params: { accountCode?: string; startDate?: Date; endDate?: Date; limit?: number }
  ): Promise<Array<Record<string, unknown>>> {
    const companyObjectId = toObjectId(companyId);
    const match: Record<string, unknown> = { companyId: companyObjectId };
    if (params.startDate || params.endDate) {
      match.createdAt = {
        ...(params.startDate ? { $gte: params.startDate } : {}),
        ...(params.endDate ? { $lte: params.endDate } : {})
      };
    }

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: 'chartofaccounts',
          localField: 'accountId',
          foreignField: '_id',
          as: 'account'
        }
      },
      { $unwind: '$account' }
    ];
    if (params.accountCode) {
      pipeline.push({ $match: { 'account.code': params.accountCode } });
    }
    pipeline.push(
      {
        $lookup: {
          from: 'journalentries',
          localField: 'journalEntryId',
          foreignField: '_id',
          as: 'entry'
        }
      },
      { $unwind: '$entry' },
      { $sort: { createdAt: -1 } },
      { $limit: Math.min(Math.max(Number(params.limit || 100), 1), 500) },
      {
        $project: {
          _id: 1,
          createdAt: 1,
          debit: 1,
          credit: 1,
          runningBalanceSnapshot: 1,
          accountCode: '$account.code',
          accountName: '$account.name',
          reference: '$entry.reference',
          description: '$entry.description',
          sourceModule: '$entry.sourceModule',
          transactionDate: '$entry.transactionDate'
        }
      }
    );
    return JournalLine.aggregate(pipeline);
  }

  async backfillCompanyBalances(companyId: string): Promise<void> {
    const companyObjectId = toObjectId(companyId);
    const [pnl, commissionLiability, vatRows] = await Promise.all([
      this.getProfitAndLoss(companyId),
      this.getCommissionLiability(companyId),
      VatRecord.aggregate([
        { $match: { companyId: companyObjectId } },
        { $group: { _id: null, vatCollected: { $sum: '$vatCollected' }, vatPaid: { $sum: '$vatPaid' } } }
      ])
    ]);

    const vatPayable = toMoney((vatRows[0]?.vatCollected || 0) - (vatRows[0]?.vatPaid || 0));
    await CompanyBalance.updateOne(
      { companyId: companyObjectId },
      {
        $set: {
          _id: getCompanyBalanceId(companyId),
          totalRevenue: pnl.revenue,
          totalExpenses: pnl.expenses,
          netProfit: pnl.netProfit,
          vatPayable,
          commissionLiability: commissionLiability.outstandingLiability,
          lastUpdated: new Date()
        }
      },
      { upsert: true }
    );
  }
}

export default new AccountingService();
