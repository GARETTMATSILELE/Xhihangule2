import { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler';
import {
  buildFinancialControlsDashboard,
  listFinancialExceptions,
  resolveFinancialException,
  runFinancialIntegrityChecks
} from '../services/financialControlsService';
import { buildTrialBalance } from '../services/trialBalanceService';
import {
  closeAccountingPeriod,
  createAccountingPeriod,
  listAccountingPeriods,
  reopenAccountingPeriod
} from '../services/accountingPeriodService';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { GL } from '../services/tax/chartAccounts';
import { buildTrustReconciliationReport } from '../services/tax/trustReconciliation';
import { roundMoney } from '../utils/money';

const companyIdOf = (req: Request): string => {
  const id = req.user?.companyId;
  if (!id) throw new AppError('Company ID required', 400);
  return String(id);
};

const actorIdOf = (req: Request): string => {
  const id = req.user?.userId;
  if (!id) throw new AppError('Authentication required', 401);
  return String(id);
};

const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const getFinancialControlsDashboard = asyncHandler(async (req: Request, res: Response) => {
  const data = await buildFinancialControlsDashboard(companyIdOf(req));
  return res.json({ status: 'success', data });
});

export const getTrialBalance = asyncHandler(async (req: Request, res: Response) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const data = await buildTrialBalance({
    companyId: companyIdOf(req),
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined
  });
  return res.json({ status: 'success', data });
});

export const getReconciliationStatus = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyIdOf(req);
  const glRows = await ChartOfAccount.find({
    companyId,
    code: { $in: [GL.TRUST_BANK, GL.OWNER_PAYABLE, GL.SELLER_PAYABLE, GL.ZIMRA_WITHHOLDING, GL.TENANT_DEPOSITS, GL.LEVY_PAYABLE] },
    isDeleted: { $ne: true }
  })
    .select('code balance')
    .lean();
  const glBalance = (code: string) => roundMoney(Number(glRows.find((r) => r.code === code)?.balance || 0));
  const trust = buildTrustReconciliationReport({
    trustBank: glBalance(GL.TRUST_BANK),
    ownerPayable: glBalance(GL.OWNER_PAYABLE),
    sellerPayable: glBalance(GL.SELLER_PAYABLE),
    zimraWithholding: glBalance(GL.ZIMRA_WITHHOLDING),
    tenantDeposits: glBalance(GL.TENANT_DEPOSITS),
    levyPayable: glBalance(GL.LEVY_PAYABLE)
  });
  return res.json({ status: 'success', data: { trust, scope: 'PARTIAL' } });
});

export const getFinancialExceptions = asyncHandler(async (req: Request, res: Response) => {
  const data = await listFinancialExceptions(companyIdOf(req), req.query.status ? String(req.query.status) : undefined);
  return res.json({ status: 'success', data });
});

export const reviewFinancialException = asyncHandler(async (req: Request, res: Response) => {
  const data = await resolveFinancialException({
    companyId: companyIdOf(req),
    id: String(req.params.id),
    actorId: actorIdOf(req),
    status: req.body?.status,
    resolutionReason: req.body?.resolutionReason || req.body?.reason
  });
  return res.json({ status: 'success', data });
});

export const runFinancialIntegrity = asyncHandler(async (req: Request, res: Response) => {
  const data = await runFinancialIntegrityChecks(companyIdOf(req));
  return res.json({ status: 'success', data });
});

export const getAccountingPeriods = asyncHandler(async (req: Request, res: Response) => {
  const data = await listAccountingPeriods(companyIdOf(req));
  return res.json({ status: 'success', data });
});

export const postAccountingPeriod = asyncHandler(async (req: Request, res: Response) => {
  const data = await createAccountingPeriod({
    companyId: companyIdOf(req),
    periodStart: new Date(req.body?.periodStart),
    periodEnd: new Date(req.body?.periodEnd),
    createdBy: actorIdOf(req)
  });
  return res.status(201).json({ status: 'success', data });
});

export const closeAccountingPeriodHandler = asyncHandler(async (req: Request, res: Response) => {
  const status = req.body?.status === 'SOFT_CLOSED' ? 'SOFT_CLOSED' : 'CLOSED';
  const data = await closeAccountingPeriod({
    companyId: companyIdOf(req),
    periodId: String(req.params.id),
    actorId: actorIdOf(req),
    reason: String(req.body?.reason || ''),
    status
  });
  return res.json({ status: 'success', data });
});

export const reopenAccountingPeriodHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reopenAccountingPeriod({
    companyId: companyIdOf(req),
    periodId: String(req.params.id),
    actorId: actorIdOf(req),
    reason: String(req.body?.reason || '')
  });
  return res.json({ status: 'success', data });
});
