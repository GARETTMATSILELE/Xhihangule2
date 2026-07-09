import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth';
import individualWorkspaceService from '../services/individualWorkspaceService';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isNotFoundError(error: any) {
  return Number(error?.statusCode || error?.status || error?.response?.status || 0) === 404;
}

function emptyIndividualDashboard() {
  return {
    summary: {
      totalProperties: 0,
      totalTenants: 0,
      occupiedUnits: 0,
      vacantUnits: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      netProfit: 0,
      outstandingRent: 0,
      netMonthlyCashflow: 0,
      rentCollectionRate: 100
    },
    charts: {
      incomeTrend: [],
      expenseTrend: [],
      cashflowTrend: [],
      propertyProfitability: [],
      occupancyRate: [],
      rentCollectionTrend: []
    },
    properties: [],
    recentActivity: []
  };
}

async function requireIndividualWorkspace(req: Request, _res: Response, next: NextFunction) {
  try {
    await individualWorkspaceService.assertIndividualCompany(req.user?.companyId);
    next();
  } catch (error) {
    next(error);
  }
}

router.use(auth);
router.use(requireIndividualWorkspace);

router.get('/dashboard', asyncHandler(async (req, res) => {
  try {
    const data = await individualWorkspaceService.getSummary(req.user!.companyId!);
    res.json({ status: 'success', data });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    res.json({ status: 'success', data: emptyIndividualDashboard(), warning: 'Some legacy property accounting data is not initialized yet.' });
  }
}));

router.get('/accounting', asyncHandler(async (req, res) => {
  try {
    const data = await individualWorkspaceService.getAccounting(req.user!.companyId!);
    res.json({ status: 'success', data });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    const fallback = emptyIndividualDashboard();
    res.json({
      status: 'success',
      data: {
        ...fallback,
        overview: {
          incomeThisMonth: 0,
          expensesThisMonth: 0,
          netProfit: 0,
          outstandingRent: 0
        },
        topPerformingProperties: [],
        worstPerformingProperties: []
      },
      warning: 'Some legacy property accounting data is not initialized yet.'
    });
  }
}));

router.get('/properties/:propertyId/ledger', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.getLedger(req.user!.companyId!, req.params.propertyId);
  res.json({ status: 'success', data });
}));

router.get('/income', asyncHandler(async (req, res) => {
  try {
    const data = await individualWorkspaceService.listEntries(req.user!.companyId!, 'income', {
      propertyId: req.query.propertyId as string | undefined,
      month: req.query.month as string | undefined
    });
    res.json({ status: 'success', data });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    res.json({ status: 'success', data: [] });
  }
}));

router.post('/income', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.postEntry(
    req.user!.companyId!,
    req.user!.userId,
    'income',
    req.body,
    req.get('Idempotency-Key') || undefined
  );
  res.status(201).json({ status: 'success', data });
}));

router.put('/income/:propertyId/:transactionId', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.correctEntry(req.user!.companyId!, req.user!.userId, req.params.propertyId, req.params.transactionId, req.body, 'edit');
  res.json({ status: 'success', data });
}));

router.delete('/income/:propertyId/:transactionId', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.correctEntry(req.user!.companyId!, req.user!.userId, req.params.propertyId, req.params.transactionId, {}, 'delete');
  res.json({ status: 'success', data });
}));

router.get('/expenses', asyncHandler(async (req, res) => {
  try {
    const data = await individualWorkspaceService.listEntries(req.user!.companyId!, 'expense', {
      propertyId: req.query.propertyId as string | undefined,
      month: req.query.month as string | undefined
    });
    res.json({ status: 'success', data });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    res.json({ status: 'success', data: [] });
  }
}));

router.post('/expenses', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.postEntry(
    req.user!.companyId!,
    req.user!.userId,
    'expense',
    req.body,
    req.get('Idempotency-Key') || undefined
  );
  res.status(201).json({ status: 'success', data });
}));

router.put('/expenses/:propertyId/:transactionId', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.correctEntry(req.user!.companyId!, req.user!.userId, req.params.propertyId, req.params.transactionId, req.body, 'edit');
  res.json({ status: 'success', data });
}));

router.delete('/expenses/:propertyId/:transactionId', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.correctEntry(req.user!.companyId!, req.user!.userId, req.params.propertyId, req.params.transactionId, {}, 'delete');
  res.json({ status: 'success', data });
}));

router.post('/maintenance/:id/approve', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.markMaintenanceApproved(req.user!.companyId!, req.params.id);
  res.json({ status: 'success', data });
}));

router.post('/maintenance/:id/record-expense', asyncHandler(async (req, res) => {
  const data = await individualWorkspaceService.recordMaintenanceExpense(
    req.user!.companyId!,
    req.user!.userId,
    req.params.id,
    req.body,
    req.get('Idempotency-Key') || undefined
  );
  res.json({ status: 'success', data });
}));

router.get('/reports/:reportType', asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  const result = await individualWorkspaceService.getReport(req.user!.companyId!, req.params.reportType as any, format);
  if (result.contentType === 'application/json') {
    res.json({ status: 'success', data: result.body });
    return;
  }
  const extension = format === 'excel' ? 'xls' : format === 'pdf' ? 'pdf' : 'csv';
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.reportType}.${extension}"`);
  res.send(result.body);
}));

export default router;
