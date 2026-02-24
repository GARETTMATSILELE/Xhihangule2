import { Request, Response } from 'express';
import accountingService from '../services/accountingService';
import accountingIntegrationService from '../services/accountingIntegrationService';

const parseDate = (value: unknown): Date | undefined => {
  if (!value || typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
};

const getCompanyId = (req: Request): string | undefined => req.user?.companyId ? String(req.user.companyId) : undefined;

export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    await accountingService.initializeForCompany(companyId);
    const summary = await accountingService.getDashboardSummary(companyId);
    return res.json(summary);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch dashboard summary' });
  }
};

export const getRevenueTrend = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const months = Math.max(1, Math.min(24, Number(req.query.months || 12)));
    const trend = await accountingService.getTrend(companyId, 'revenue', months);
    return res.json({ months, data: trend });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch revenue trend' });
  }
};

export const getExpenseTrend = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const months = Math.max(1, Math.min(24, Number(req.query.months || 12)));
    const trend = await accountingService.getTrend(companyId, 'expense', months);
    return res.json({ months, data: trend });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch expense trend' });
  }
};

export const getVatStatus = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const filingPeriod = typeof req.query.filingPeriod === 'string' ? req.query.filingPeriod : undefined;
    const status =
      req.query.status === 'pending' || req.query.status === 'submitted'
        ? (req.query.status as 'pending' | 'submitted')
        : undefined;
    const rows = await accountingService.getVatStatus(companyId, { filingPeriod, status });
    return res.json({ data: rows });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch VAT status' });
  }
};

export const exportVatReport = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const filingPeriod = typeof req.query.filingPeriod === 'string' ? req.query.filingPeriod : undefined;
    const status =
      req.query.status === 'pending' || req.query.status === 'submitted'
        ? (req.query.status as 'pending' | 'submitted')
        : undefined;
    const format = String(req.query.format || 'csv').toLowerCase();
    const rows = await accountingService.getVatStatus(companyId, { filingPeriod, status });

    if (format === 'json') {
      return res.json({ data: rows });
    }

    const header = 'filing_period,status,vat_collected,vat_paid,vat_payable';
    const body = rows
      .map(
        (row) =>
          `${row.filingPeriod},${row.status},${Number(row.vatCollected || 0).toFixed(2)},${Number(
            row.vatPaid || 0
          ).toFixed(2)},${Number(row.vatPayable || 0).toFixed(2)}`
      )
      .join('\n');
    const csv = `${header}\n${body}`;
    const periodTag = filingPeriod || 'all-periods';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vat-report-${periodTag}.csv"`);
    return res.status(200).send(csv);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to export VAT report' });
  }
};

export const getCommissionLiability = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const payload = await accountingService.getCommissionLiability(companyId);
    return res.json(payload);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch commission liability' });
  }
};

export const getProfitAndLoss = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const payload = await accountingService.getProfitAndLoss(companyId, from, to);
    return res.json(payload);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch profit and loss' });
  }
};

export const getBalanceSheet = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const payload = await accountingService.getBalanceSheet(companyId);
    return res.json(payload);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch balance sheet' });
  }
};

export const getLedger = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const accountCode = typeof req.query.accountCode === 'string' ? req.query.accountCode : undefined;
    const startDate = parseDate(req.query.startDate);
    const endDate = parseDate(req.query.endDate);
    const limit = Number(req.query.limit || 200);
    const data = await accountingService.getLedger(companyId, { accountCode, startDate, endDate, limit });
    return res.json({ data });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch ledger' });
  }
};

export const getBankReconciliation = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const bankAccountId = typeof req.query.bankAccountId === 'string' ? req.query.bankAccountId : undefined;
    const matched =
      typeof req.query.matched === 'string'
        ? req.query.matched.toLowerCase() === 'true'
          ? true
          : req.query.matched.toLowerCase() === 'false'
            ? false
            : undefined
        : undefined;
    const startDate = parseDate(req.query.startDate);
    const endDate = parseDate(req.query.endDate);
    const limit = Number(req.query.limit || 200);
    const data = await accountingService.getBankReconciliation(companyId, {
      bankAccountId,
      matched,
      startDate,
      endDate,
      limit
    });
    return res.json({ data });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch bank reconciliation data' });
  }
};

export const reconcileBankTransaction = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const bankTransactionId = req.params.id;
    const matched = Boolean(req.body?.matched);
    const matchedTransactionId =
      typeof req.body?.matchedTransactionId === 'string' && req.body.matchedTransactionId.trim()
        ? req.body.matchedTransactionId.trim()
        : undefined;
    const row = await accountingService.reconcileBankTransaction(companyId, bankTransactionId, {
      matched,
      matchedTransactionId
    });
    if (!row) return res.status(404).json({ message: 'Bank transaction not found' });
    return res.json({ message: 'Bank transaction updated', data: row });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to update bank transaction' });
  }
};

export const getBankTransactionSuggestions = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const bankTransactionId = req.params.id;
    const data = await accountingService.suggestBankTransactionMatches(companyId, bankTransactionId);
    return res.json({ data });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to get suggestions' });
  }
};

export const postManualTransaction = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const { reference, description, transactionDate, lines } = req.body || {};
    if (!reference || !Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ message: 'reference and at least two lines are required' });
    }
    const result = await accountingService.postTransaction({
      companyId,
      reference,
      description,
      sourceModule: 'manual',
      sourceId: `${reference}:${Date.now()}`,
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      createdBy: req.user?.userId,
      lines
    });
    return res.status(201).json({ message: 'Transaction posted', ...result });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to post transaction' });
  }
};

export const backfillBalances = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });
    const replayExisting = String(req.query.replayExisting || req.body?.replayExisting || '').toLowerCase() === 'true';
    let replay = { paymentsSynced: 0, expensesSynced: 0 };
    if (replayExisting) {
      replay = await accountingIntegrationService.backfillFromExistingData(companyId);
    }
    await accountingService.backfillCompanyBalances(companyId);
    return res.json({ message: 'Backfill complete', replayExisting, ...replay });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to backfill balances' });
  }
};
