import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth';
import individualWorkspaceService from '../services/individualWorkspaceService';
import individualTaxProfileService from '../services/individualTaxProfileService';
import individualTaxMetadataService from '../services/individualTaxMetadataService';
import individualVatService from '../services/individualVatService';
import individualRentalTaxService from '../services/individualRentalTaxService';
import individualIncomeTaxService from '../services/individualIncomeTaxService';
import individualTaxComplianceService from '../services/individualTaxComplianceService';
import individualAccountingService from '../services/individualAccountingService';
import { listTaxRules } from '../services/taxRuleRegistry';
import { listTaxPeriods, openTaxPeriod, updateTaxPeriodStatus } from '../services/taxPeriodService';
import { TAX_PERIOD_TAX_TYPES, type TaxPeriodStatus, type TaxPeriodTaxType } from '../services/tax/taxMetadataTypes';
import { AppError } from '../middleware/errorHandler';

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
    period: {
      basis: 'this_month',
      label: 'This month',
      start: null,
      end: null
    },
    summary: {
      totalProperties: 0,
      totalTenants: 0,
      occupiedUnits: 0,
      vacantUnits: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      netProfit: 0,
      yearToDateProfit: 0,
      financialYearProfit: 0,
      annualisedRunRate: 0,
      rentCollected: 0,
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
    const data = await individualWorkspaceService.getSummary(req.user!.companyId!, String(req.query.period || 'this_month'));
    res.json({ status: 'success', data });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    res.json({ status: 'success', data: emptyIndividualDashboard(), warning: 'Some legacy property accounting data is not initialized yet.' });
  }
}));

router.get('/accounting', asyncHandler(async (req, res) => {
  try {
    const data = await individualWorkspaceService.getAccounting(req.user!.companyId!, String(req.query.period || 'this_month'));
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
      month: req.query.month as string | undefined,
      taxPeriodId: req.query.taxPeriodId as string | undefined,
      taxPeriodKey: req.query.taxPeriodKey as string | undefined,
      taxTreatment: req.query.taxTreatment as string | undefined,
      taxCalculationStatus: req.query.taxCalculationStatus as string | undefined,
      taxType: req.query.taxType as string | undefined
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
      month: req.query.month as string | undefined,
      taxPeriodId: req.query.taxPeriodId as string | undefined,
      taxPeriodKey: req.query.taxPeriodKey as string | undefined,
      taxTreatment: req.query.taxTreatment as string | undefined,
      taxCalculationStatus: req.query.taxCalculationStatus as string | undefined,
      taxType: req.query.taxType as string | undefined
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

router.get('/tax-profile', asyncHandler(async (req, res) => {
  const data = await individualTaxProfileService.getOwnerProfile(req.user!.companyId!);
  res.json({ status: 'success', data });
}));

router.put('/tax-profile', asyncHandler(async (req, res) => {
  const data = await individualTaxProfileService.updateOwnerProfile(
    req.user!.companyId!,
    req.user!.userId,
    req.body || {}
  );
  res.json({ status: 'success', data });
}));

router.get('/properties/:id/tax-profile', asyncHandler(async (req, res) => {
  const data = await individualTaxProfileService.getPropertyProfile(req.user!.companyId!, req.params.id);
  res.json({ status: 'success', data });
}));

router.put('/properties/:id/tax-profile', asyncHandler(async (req, res) => {
  const data = await individualTaxProfileService.updatePropertyProfile(
    req.user!.companyId!,
    req.user!.userId,
    req.params.id,
    req.body || {}
  );
  res.json({ status: 'success', data });
}));

router.get('/tax/rules', asyncHandler(async (req, res) => {
  const taxType = typeof req.query.taxType === 'string' ? req.query.taxType : undefined;
  const data = await listTaxRules(taxType);
  res.json({ status: 'success', data });
}));

router.get('/tax/periods', asyncHandler(async (req, res) => {
  const [periods, summaries] = await Promise.all([
    listTaxPeriods(req.user!.companyId!, typeof req.query.taxType === 'string' ? req.query.taxType : undefined),
    individualTaxMetadataService.periodSummaries(req.user!.companyId!)
  ]);
  res.json({ status: 'success', data: { periods, summaries } });
}));

router.post('/tax/periods', asyncHandler(async (req, res) => {
  const taxType = String(req.body?.taxType || '');
  if (!(TAX_PERIOD_TAX_TYPES as readonly string[]).includes(taxType)) {
    res.status(400).json({ status: 'error', message: 'Invalid taxType' });
    return;
  }
  const data = await openTaxPeriod({
    companyId: req.user!.companyId!,
    userId: req.user!.userId,
    taxType: taxType as TaxPeriodTaxType,
    periodKey: String(req.body?.periodKey || ''),
    notes: req.body?.notes
  });
  res.status(201).json({ status: 'success', data });
}));

router.get('/tax/periods/:id', asyncHandler(async (req, res) => {
  const periods = await listTaxPeriods(req.user!.companyId!);
  const period = periods.find((row) => String(row._id) === req.params.id);
  if (!period) {
    res.status(404).json({ status: 'error', message: 'Tax period not found' });
    return;
  }
  const transactions = await individualTaxMetadataService.listForPeriod(req.user!.companyId!, period.periodKey, period.taxType);
  const classified = transactions.filter((row) => row.taxCalculationStatus !== 'REVIEW_REQUIRED').length;
  const requiresReview = transactions.filter((row) => row.taxCalculationStatus === 'REVIEW_REQUIRED').length;
  res.json({
    status: 'success',
    data: {
      period,
      transactions,
      classified,
      requiresReview,
      notCalculated: transactions.length,
      taxAmount: null,
      vatPayable: null
    }
  });
}));

router.put('/tax/periods/:id', asyncHandler(async (req, res) => {
  const data = await updateTaxPeriodStatus({
    companyId: req.user!.companyId!,
    userId: req.user!.userId,
    periodId: req.params.id,
    status: String(req.body?.status || 'REVIEW') as TaxPeriodStatus,
    notes: req.body?.notes
  });
  res.json({ status: 'success', data });
}));

router.get('/tax/vat/working-paper', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const format = String(req.query.format || 'json').toLowerCase();
  if (format === 'json') {
    const data = await individualVatService.workingPaper(req.user!.companyId!, periodKey);
    res.json({ status: 'success', data });
    return;
  }
  const exported = await individualVatService.exportWorkingPaper(req.user!.companyId!, periodKey, format);
  res.setHeader('Content-Type', exported.contentType);
  const extension = format === 'xlsx' || format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
  res.setHeader('Content-Disposition', `attachment; filename="${exported.filename || `vat-working-paper.${extension}`}"`);
  res.send(exported.body);
}));

router.get('/tax/vat', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const data = await individualVatService.overview(req.user!.companyId!, periodKey);
  res.json({ status: 'success', data });
}));

router.get('/tax/vat/transactions', asyncHandler(async (req, res) => {
  const data = await individualVatService.transactions(req.user!.companyId!, {
    periodKey: typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined,
    direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined
  });
  res.json({ status: 'success', data });
}));

router.get('/tax/vat/review', asyncHandler(async (req, res) => {
  const data = await individualVatService.reviewQueue(req.user!.companyId!);
  res.json({ status: 'success', data });
}));

router.get('/tax/vat/reconciliation', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const data = await individualVatService.reconcile(req.user!.companyId!, periodKey);
  res.json({ status: 'success', data });
}));

router.get('/tax/rental/working-paper', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const format = String(req.query.format || 'json').toLowerCase();
  if (format === 'json') {
    const data = await individualRentalTaxService.workingPaper(req.user!.companyId!, periodKey);
    res.json({ status: 'success', data });
    return;
  }
  const exported = await individualRentalTaxService.exportWorkingPaper(req.user!.companyId!, periodKey, format);
  res.setHeader('Content-Type', exported.contentType);
  const extension = format === 'xlsx' || format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
  res.setHeader('Content-Disposition', `attachment; filename="${exported.filename || `rental-tax-working-paper.${extension}`}"`);
  res.send(exported.body);
}));

router.get('/tax/rental', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const data = await individualRentalTaxService.overview(req.user!.companyId!, periodKey);
  res.json({ status: 'success', data });
}));

router.get('/tax/rental/transactions', asyncHandler(async (req, res) => {
  const data = await individualRentalTaxService.transactions(req.user!.companyId!, {
    periodKey: typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined
  });
  res.json({ status: 'success', data });
}));

router.get('/tax/rental/review', asyncHandler(async (req, res) => {
  const data = await individualRentalTaxService.reviewQueue(req.user!.companyId!);
  res.json({ status: 'success', data });
}));

router.get('/tax/rental/reconciliation', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const data = await individualRentalTaxService.reconcile(req.user!.companyId!, periodKey);
  res.json({ status: 'success', data });
}));

router.get('/tax/rental/annual', asyncHandler(async (req, res) => {
  const year = typeof req.query.year === 'string' ? Number(req.query.year) : undefined;
  const data = await individualRentalTaxService.annualSchedule(req.user!.companyId!, year);
  res.json({ status: 'success', data });
}));

router.post('/tax/rental/payments', asyncHandler(async (req, res) => {
  const data = await individualRentalTaxService.recordPayment({
    companyId: req.user!.companyId!,
    userId: req.user!.userId,
    taxPeriodId: req.body?.taxPeriodId,
    taxPeriodKey: req.body?.taxPeriodKey,
    propertyId: req.body?.propertyId,
    amount: Number(req.body?.amount || 0),
    currency: req.body?.currency,
    paymentDate: req.body?.paymentDate,
    paymentMethod: req.body?.paymentMethod,
    paymentReference: req.body?.paymentReference,
    zimraReference: req.body?.zimraReference || req.body?.ZIMRAReference,
    documentId: req.body?.documentId,
    notes: req.body?.notes
  });
  res.status(201).json({ status: 'success', data });
}));

router.get('/tax/income/working-paper', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const format = String(req.query.format || 'json').toLowerCase();
  if (format === 'json') {
    const data = await individualIncomeTaxService.workingPaper(req.user!.companyId!, periodKey);
    res.json({ status: 'success', data });
    return;
  }
  const exported = await individualIncomeTaxService.exportWorkingPaper(req.user!.companyId!, periodKey, format);
  res.setHeader('Content-Type', exported.contentType);
  const extension = format === 'xlsx' || format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
  res.setHeader('Content-Disposition', `attachment; filename="${exported.filename || `income-tax-working-paper.${extension}`}"`);
  res.send(exported.body);
}));

router.get('/tax/income', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const data = await individualIncomeTaxService.overview(req.user!.companyId!, periodKey);
  res.json({ status: 'success', data });
}));

router.get('/tax/income/transactions', asyncHandler(async (req, res) => {
  const data = await individualIncomeTaxService.transactions(req.user!.companyId!, {
    periodKey: typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined
  });
  res.json({ status: 'success', data });
}));

router.get('/tax/income/review', asyncHandler(async (req, res) => {
  const data = await individualIncomeTaxService.reviewQueue(req.user!.companyId!);
  res.json({ status: 'success', data });
}));

router.get('/tax/income/reconciliation', asyncHandler(async (req, res) => {
  const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
  const data = await individualIncomeTaxService.reconcile(req.user!.companyId!, periodKey);
  res.json({ status: 'success', data });
}));

router.get('/tax/income/annual', asyncHandler(async (req, res) => {
  const year = typeof req.query.year === 'string' ? Number(req.query.year) : undefined;
  const data = await individualIncomeTaxService.annualSchedule(req.user!.companyId!, year);
  res.json({ status: 'success', data });
}));

router.post('/tax/income/calculate', asyncHandler(async (req, res) => {
  const periodKey = String(req.body?.taxPeriodKey || req.query.periodKey || '');
  if (!periodKey) {
    res.status(400).json({ status: 'fail', message: 'taxPeriodKey is required' });
    return;
  }
  const data = await individualIncomeTaxService.calculatePeriod(req.user!.companyId!, periodKey, req.user!.userId);
  res.json({ status: 'success', data });
}));

router.post('/tax/income/adjustments', asyncHandler(async (req, res) => {
  const data = await individualIncomeTaxService.createAdjustment({
    companyId: req.user!.companyId!,
    userId: req.user!.userId,
    taxPeriodKey: req.body?.taxPeriodKey,
    taxPeriodId: req.body?.taxPeriodId,
    propertyId: req.body?.propertyId,
    adjustmentType: req.body?.adjustmentType,
    amount: Number(req.body?.amount || 0),
    currency: req.body?.currency,
    reason: req.body?.reason,
    explanation: req.body?.explanation || req.body?.supportingExplanation,
    sourceTransactionIds: req.body?.sourceTransactionIds,
    supportingDocumentIds: req.body?.supportingDocumentIds,
    ruleId: req.body?.ruleId,
    ruleVersion: req.body?.ruleVersion
  });
  res.status(201).json({ status: 'success', data });
}));

router.post('/tax/income/adjustments/:id/approve', asyncHandler(async (req, res) => {
  const data = await individualIncomeTaxService.approveAdjustment(req.user!.companyId!, req.params.id, req.user!.userId);
  res.json({ status: 'success', data });
}));

router.post('/tax/income/payments', asyncHandler(async (req, res) => {
  const data = await individualIncomeTaxService.recordPayment({
    companyId: req.user!.companyId!,
    userId: req.user!.userId,
    taxPeriodId: req.body?.taxPeriodId,
    taxPeriodKey: req.body?.taxPeriodKey,
    propertyId: req.body?.propertyId,
    amount: Number(req.body?.amount || 0),
    currency: req.body?.currency,
    paymentDate: req.body?.paymentDate,
    paymentMethod: req.body?.paymentMethod,
    paymentReference: req.body?.paymentReference,
    zimraReference: req.body?.zimraReference || req.body?.ZIMRAReference,
    documentId: req.body?.documentId,
    notes: req.body?.notes
  });
  res.status(201).json({ status: 'success', data });
}));

router.post('/deposits/apply', asyncHandler(async (req, res) => {
  const data = await individualAccountingService.applyDepositToRent({
    companyId: req.user!.companyId!,
    userId: req.user!.userId,
    propertyId: String(req.body?.propertyId || ''),
    amount: Number(req.body?.amount || 0),
    date: req.body?.date,
    rentalDepositId: req.body?.rentalDepositId,
    notes: req.body?.notes,
    reference: req.body?.reference,
    currency: req.body?.currency,
    vatMode: req.body?.vatMode,
    idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotencyKey
  });
  res.status(201).json({ status: 'success', data });
}));

function parseTaxYear(value: string | undefined) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    throw new AppError('Invalid tax year', 400);
  }
  return year;
}

router.get('/tax/compliance', asyncHandler(async (req, res) => {
  const years = await individualTaxComplianceService.listYears(req.user!.companyId!);
  const taxYear = typeof req.query.taxYear === 'string' ? parseTaxYear(req.query.taxYear) : years[0];
  const data = await individualTaxComplianceService.overview(req.user!.companyId!, taxYear);
  res.json({ status: 'success', data: { ...data, years } });
}));

router.get('/tax/compliance/:taxYear', asyncHandler(async (req, res) => {
  const taxYear = parseTaxYear(req.params.taxYear);
  const data = await individualTaxComplianceService.overview(req.user!.companyId!, taxYear);
  res.json({ status: 'success', data });
}));

router.get('/tax/compliance/:taxYear/readiness', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.readiness(req.user!.companyId!, parseTaxYear(req.params.taxYear));
  res.json({ status: 'success', data });
}));

router.get('/tax/compliance/:taxYear/reviews', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.syncReviews(req.user!.companyId!, parseTaxYear(req.params.taxYear), req.user!.userId);
  res.json({ status: 'success', data });
}));

router.get('/tax/compliance/:taxYear/evidence', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.listEvidence(req.user!.companyId!, parseTaxYear(req.params.taxYear));
  res.json({ status: 'success', data });
}));

router.get('/tax/compliance/:taxYear/reconciliation', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.reconciliation(req.user!.companyId!, parseTaxYear(req.params.taxYear));
  res.json({ status: 'success', data });
}));

router.get('/tax/compliance/:taxYear/checklist', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.checklist(req.user!.companyId!, parseTaxYear(req.params.taxYear));
  res.json({ status: 'success', data });
}));

router.get('/tax/compliance/:taxYear/pack', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.getPack(req.user!.companyId!, parseTaxYear(req.params.taxYear));
  res.json({ status: 'success', data });
}));

router.get('/tax/compliance/:taxYear/pack/export', asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'pdf').toLowerCase();
  const exported = await individualTaxComplianceService.exportPack(req.user!.companyId!, parseTaxYear(req.params.taxYear), format);
  res.setHeader('Content-Type', exported.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
  res.send(exported.body);
}));

router.get('/tax/compliance/:taxYear/drill/:sourceType/:sourceId', asyncHandler(async (req, res) => {
  const sourceType = req.params.sourceType === 'payment' || req.params.sourceType === 'Payment' ? 'Payment' : 'LandlordFinancialTransaction';
  const data = await individualTaxComplianceService.drillDown(req.user!.companyId!, sourceType, req.params.sourceId);
  res.json({ status: 'success', data });
}));

router.post('/tax/compliance/:taxYear/pack/generate', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.generatePack(
    req.user!.companyId!,
    parseTaxYear(req.params.taxYear),
    req.user!.userId,
    req.body?.supersedeReason
  );
  res.status(201).json({ status: 'success', data });
}));

router.post('/tax/compliance/:taxYear/pack/finalize', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.finalizePack(req.user!.companyId!, parseTaxYear(req.params.taxYear), req.user!.userId);
  res.json({ status: 'success', data });
}));

router.post('/tax/compliance/:taxYear/evidence', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.attachEvidence({
    companyId: req.user!.companyId!,
    userId: req.user!.userId,
    taxYear: parseTaxYear(req.params.taxYear),
    taxType: String(req.body?.taxType || 'INCOME_TAX'),
    sourceType: String(req.body?.sourceType || 'File'),
    sourceId: String(req.body?.sourceId || req.body?.documentId || ''),
    documentId: String(req.body?.documentId || ''),
    documentType: req.body?.documentType,
    description: req.body?.description,
    taxPeriodKey: req.body?.taxPeriodKey,
    propertyId: req.body?.propertyId
  });
  res.status(201).json({ status: 'success', data });
}));

router.post('/tax/compliance/evidence/:id/review', asyncHandler(async (req, res) => {
  const status = String(req.body?.status || 'REVIEWED') as 'REVIEWED' | 'ACCEPTED' | 'REQUIRES_REVIEW';
  const data = await individualTaxComplianceService.reviewEvidence(req.user!.companyId!, req.params.id, req.user!.userId, status);
  res.json({ status: 'success', data });
}));

router.post('/tax/compliance/reviews/:id/review', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.startReview(req.user!.companyId!, req.params.id, req.user!.userId);
  res.json({ status: 'success', data });
}));

router.post('/tax/compliance/reviews/:id/resolve', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.resolveReview(req.user!.companyId!, req.params.id, req.user!.userId, {
    decision: req.body?.decision,
    comment: req.body?.comment,
    evidenceId: req.body?.evidenceId
  });
  res.json({ status: 'success', data });
}));

router.post('/tax/compliance/reviews/:id/waive', asyncHandler(async (req, res) => {
  const data = await individualTaxComplianceService.waiveReview(req.user!.companyId!, req.params.id, req.user!.userId, req.body?.reason);
  res.json({ status: 'success', data });
}));

router.get('/tax/review', asyncHandler(async (req, res) => {
  const data = await individualTaxMetadataService.reviewQueue(req.user!.companyId!);
  res.json({ status: 'success', data });
}));

router.get('/tax/integrity', asyncHandler(async (req, res) => {
  const data = await individualTaxMetadataService.integrity(req.user!.companyId!);
  res.json({ status: 'success', data });
}));

router.get('/transactions/:sourceType/:sourceId/tax', asyncHandler(async (req, res) => {
  const sourceType = req.params.sourceType === 'payment' ? 'Payment' : 'LandlordFinancialTransaction';
  const data = await individualTaxMetadataService.getForSource(req.user!.companyId!, sourceType, req.params.sourceId);
  res.json({ status: 'success', data });
}));

router.get('/reports/:reportType', asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  const result = await individualWorkspaceService.getReport(req.user!.companyId!, req.params.reportType as any, format, {
    taxPeriodId: typeof req.query.taxPeriodId === 'string' ? req.query.taxPeriodId : undefined,
    taxPeriodKey: typeof req.query.taxPeriodKey === 'string' ? req.query.taxPeriodKey : undefined,
    taxTreatment: typeof req.query.taxTreatment === 'string' ? req.query.taxTreatment : undefined,
    taxCalculationStatus: typeof req.query.taxCalculationStatus === 'string' ? req.query.taxCalculationStatus : undefined,
    taxType: typeof req.query.taxType === 'string' ? req.query.taxType : undefined
  });
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
