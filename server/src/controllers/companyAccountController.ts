import { Request, Response } from 'express';
import { CompanyAccount } from '../models/CompanyAccount';

export const getCompanyAccountSummary = async (req: Request, res: Response) => {
  try {
    const companyId = (req as any).user?.companyId || req.query.companyId;
    if (!companyId) {
      return res.status(400).json({ message: 'companyId is required' });
    }
    const account = await CompanyAccount.findOne({ companyId });
    if (!account) {
      return res.json({ runningBalance: 0, totalIncome: 0, totalExpenses: 0 });
    }
    res.json({ runningBalance: account.runningBalance, totalIncome: account.totalIncome, totalExpenses: account.totalExpenses });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to fetch company account summary' });
  }
};

export const getCompanyTransactions = async (req: Request, res: Response) => {
  try {
    const companyId = (req as any).user?.companyId || req.query.companyId;
    if (!companyId) {
      return res.status(400).json({ message: 'companyId is required' });
    }
    const account = await CompanyAccount.findOne({ companyId });
    res.json({ transactions: account?.transactions || [], runningBalance: account?.runningBalance || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to fetch company transactions' });
  }
};

export const createCompanyTransaction = async (req: Request, res: Response) => {
  try {
    const companyId = (req as any).user?.companyId || req.body.companyId;
    if (!companyId) {
      return res.status(400).json({ message: 'companyId is required' });
    }

    const { type = 'expense', amount, date, description, category, reference, paymentMethod, currency } = req.body || {};

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const now = new Date();

    // Find or create company account
    let account = await CompanyAccount.findOne({ companyId });
    if (!account) {
      account = new CompanyAccount({ companyId, transactions: [], runningBalance: 0, totalIncome: 0, totalExpenses: 0 });
    }

    // Normalize transaction
    const tx: any = {
      type: type === 'income' ? 'income' : 'expense',
      amount,
      date: date ? new Date(date) : now,
      description: description || undefined,
      category: category || undefined,
      referenceNumber: reference || undefined,
      paymentMethod: paymentMethod || undefined,
      currency: currency || 'USD',
      processedBy: (req as any).user?.userId ? (req as any).user.userId : undefined,
      createdAt: now,
      updatedAt: now
    };

    account.transactions.push(tx);
    if (tx.type === 'income') {
      account.totalIncome = (account.totalIncome || 0) + amount;
      account.runningBalance = (account.runningBalance || 0) + amount;
    } else {
      account.totalExpenses = (account.totalExpenses || 0) + amount;
      account.runningBalance = (account.runningBalance || 0) - amount;
    }
    account.lastUpdated = now;

    await account.save();

    return res.status(201).json({ message: 'Transaction recorded', account, transaction: tx });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || 'Failed to create company transaction' });
  }
};


