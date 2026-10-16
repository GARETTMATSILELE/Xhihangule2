import { Request, Response } from 'express';
import { CompanyAccount } from '../models/CompanyAccount';
import { CompanyExpenseIdempotencyError, recordCompanyAccountExpense } from '../services/companyAccountExpenseService';

export const getCompanyAccountSummary = async (req: Request, res: Response) => {
  try {
    const companyId = (req as any).user?.companyId;
    if (!companyId) {
      return res.status(403).json({ message: 'Company context required' });
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
    const companyId = (req as any).user?.companyId;
    if (!companyId) {
      return res.status(403).json({ message: 'Company context required' });
    }
    const account = await CompanyAccount.findOne({ companyId });
    const transactions = (account?.transactions || []).filter((t: any) => t?.isArchived !== true);
    res.json({ transactions, runningBalance: account?.runningBalance || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to fetch company transactions' });
  }
};

export const createCompanyTransaction = async (req: Request, res: Response) => {
  try {
    const userCompany = (req as any).user?.companyId;
    const bodyCompany = req.body?.companyId;
    if (userCompany && bodyCompany && String(userCompany) !== String(bodyCompany)) {
      return res.status(403).json({ message: 'Company context does not match this expense' });
    }
    const companyId = userCompany || bodyCompany;
    if (!companyId) {
      return res.status(400).json({ message: 'companyId is required' });
    }
    const idempotencyKey = String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim();
    const result = await recordCompanyAccountExpense({
      companyId: String(companyId),
      type: req.body?.type,
      amount: Number(req.body?.amount),
      date: req.body?.date,
      description: req.body?.description,
      category: req.body?.category,
      reference: req.body?.reference,
      paymentMethod: req.body?.paymentMethod,
      currency: req.body?.currency,
      payee: req.body?.payee,
      idempotencyKey: idempotencyKey || undefined,
      processedBy: (req as any).user?.userId ? String((req as any).user.userId) : undefined
    });
    return res.status(result.reused ? 200 : 201).json({
      message: result.reused ? 'Existing transaction returned' : 'Transaction recorded',
      account: result.account,
      transaction: result.transaction,
      reused: result.reused
    });
  } catch (err: any) {
    const status = err instanceof CompanyExpenseIdempotencyError ? 409 : Number(err?.statusCode) || 500;
    return res.status(status).json({ message: err.message || 'Failed to create company transaction', code: err?.code });
  }
};


