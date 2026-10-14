"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const individualWorkspaceService_1 = __importDefault(require("../services/individualWorkspaceService"));
const individualTaxProfileService_1 = __importDefault(require("../services/individualTaxProfileService"));
const individualTaxMetadataService_1 = __importDefault(require("../services/individualTaxMetadataService"));
const individualVatService_1 = __importDefault(require("../services/individualVatService"));
const individualRentalTaxService_1 = __importDefault(require("../services/individualRentalTaxService"));
const individualIncomeTaxService_1 = __importDefault(require("../services/individualIncomeTaxService"));
const individualTaxComplianceService_1 = __importDefault(require("../services/individualTaxComplianceService"));
const individualAccountingService_1 = __importDefault(require("../services/individualAccountingService"));
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const taxPeriodService_1 = require("../services/taxPeriodService");
const taxMetadataTypes_1 = require("../services/tax/taxMetadataTypes");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
function isNotFoundError(error) {
    var _a;
    return Number((error === null || error === void 0 ? void 0 : error.statusCode) || (error === null || error === void 0 ? void 0 : error.status) || ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) || 0) === 404;
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
function requireIndividualWorkspace(req, _res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            yield individualWorkspaceService_1.default.assertIndividualCompany((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
            next();
        }
        catch (error) {
            next(error);
        }
    });
}
router.use(auth_1.auth);
router.use(requireIndividualWorkspace);
router.get('/dashboard', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield individualWorkspaceService_1.default.getSummary(req.user.companyId, String(req.query.period || 'this_month'));
        res.json({ status: 'success', data });
    }
    catch (error) {
        if (!isNotFoundError(error))
            throw error;
        res.json({ status: 'success', data: emptyIndividualDashboard(), warning: 'Some legacy property accounting data is not initialized yet.' });
    }
})));
router.get('/accounting', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield individualWorkspaceService_1.default.getAccounting(req.user.companyId, String(req.query.period || 'this_month'));
        res.json({ status: 'success', data });
    }
    catch (error) {
        if (!isNotFoundError(error))
            throw error;
        const fallback = emptyIndividualDashboard();
        res.json({
            status: 'success',
            data: Object.assign(Object.assign({}, fallback), { overview: {
                    incomeThisMonth: 0,
                    expensesThisMonth: 0,
                    netProfit: 0,
                    outstandingRent: 0
                }, topPerformingProperties: [], worstPerformingProperties: [] }),
            warning: 'Some legacy property accounting data is not initialized yet.'
        });
    }
})));
router.get('/properties/:propertyId/ledger', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.getLedger(req.user.companyId, req.params.propertyId);
    res.json({ status: 'success', data });
})));
router.get('/income', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield individualWorkspaceService_1.default.listEntries(req.user.companyId, 'income', {
            propertyId: req.query.propertyId,
            month: req.query.month,
            taxPeriodId: req.query.taxPeriodId,
            taxPeriodKey: req.query.taxPeriodKey,
            taxTreatment: req.query.taxTreatment,
            taxCalculationStatus: req.query.taxCalculationStatus,
            taxType: req.query.taxType
        });
        res.json({ status: 'success', data });
    }
    catch (error) {
        if (!isNotFoundError(error))
            throw error;
        res.json({ status: 'success', data: [] });
    }
})));
router.post('/income', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.postEntry(req.user.companyId, req.user.userId, 'income', req.body, req.get('Idempotency-Key') || undefined);
    res.status(201).json({ status: 'success', data });
})));
router.put('/income/:propertyId/:transactionId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.correctEntry(req.user.companyId, req.user.userId, req.params.propertyId, req.params.transactionId, req.body, 'edit');
    res.json({ status: 'success', data });
})));
router.delete('/income/:propertyId/:transactionId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.correctEntry(req.user.companyId, req.user.userId, req.params.propertyId, req.params.transactionId, {}, 'delete');
    res.json({ status: 'success', data });
})));
router.get('/expenses', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield individualWorkspaceService_1.default.listEntries(req.user.companyId, 'expense', {
            propertyId: req.query.propertyId,
            month: req.query.month,
            taxPeriodId: req.query.taxPeriodId,
            taxPeriodKey: req.query.taxPeriodKey,
            taxTreatment: req.query.taxTreatment,
            taxCalculationStatus: req.query.taxCalculationStatus,
            taxType: req.query.taxType
        });
        res.json({ status: 'success', data });
    }
    catch (error) {
        if (!isNotFoundError(error))
            throw error;
        res.json({ status: 'success', data: [] });
    }
})));
router.post('/expenses', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.postEntry(req.user.companyId, req.user.userId, 'expense', req.body, req.get('Idempotency-Key') || undefined);
    res.status(201).json({ status: 'success', data });
})));
router.put('/expenses/:propertyId/:transactionId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.correctEntry(req.user.companyId, req.user.userId, req.params.propertyId, req.params.transactionId, req.body, 'edit');
    res.json({ status: 'success', data });
})));
router.delete('/expenses/:propertyId/:transactionId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.correctEntry(req.user.companyId, req.user.userId, req.params.propertyId, req.params.transactionId, {}, 'delete');
    res.json({ status: 'success', data });
})));
router.post('/maintenance/:id/approve', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.markMaintenanceApproved(req.user.companyId, req.params.id);
    res.json({ status: 'success', data });
})));
router.post('/maintenance/:id/record-expense', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualWorkspaceService_1.default.recordMaintenanceExpense(req.user.companyId, req.user.userId, req.params.id, req.body, req.get('Idempotency-Key') || undefined);
    res.json({ status: 'success', data });
})));
router.get('/tax-profile', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxProfileService_1.default.getOwnerProfile(req.user.companyId);
    res.json({ status: 'success', data });
})));
router.put('/tax-profile', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxProfileService_1.default.updateOwnerProfile(req.user.companyId, req.user.userId, req.body || {});
    res.json({ status: 'success', data });
})));
router.get('/properties/:id/tax-profile', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxProfileService_1.default.getPropertyProfile(req.user.companyId, req.params.id);
    res.json({ status: 'success', data });
})));
router.put('/properties/:id/tax-profile', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxProfileService_1.default.updatePropertyProfile(req.user.companyId, req.user.userId, req.params.id, req.body || {});
    res.json({ status: 'success', data });
})));
router.get('/tax/rules', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const taxType = typeof req.query.taxType === 'string' ? req.query.taxType : undefined;
    const data = yield (0, taxRuleRegistry_1.listTaxRules)(taxType);
    res.json({ status: 'success', data });
})));
router.get('/tax/periods', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const [periods, summaries] = yield Promise.all([
        (0, taxPeriodService_1.listTaxPeriods)(req.user.companyId, typeof req.query.taxType === 'string' ? req.query.taxType : undefined),
        individualTaxMetadataService_1.default.periodSummaries(req.user.companyId)
    ]);
    res.json({ status: 'success', data: { periods, summaries } });
})));
router.post('/tax/periods', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const taxType = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.taxType) || '');
    if (!taxMetadataTypes_1.TAX_PERIOD_TAX_TYPES.includes(taxType)) {
        res.status(400).json({ status: 'error', message: 'Invalid taxType' });
        return;
    }
    const data = yield (0, taxPeriodService_1.openTaxPeriod)({
        companyId: req.user.companyId,
        userId: req.user.userId,
        taxType: taxType,
        periodKey: String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.periodKey) || ''),
        notes: (_c = req.body) === null || _c === void 0 ? void 0 : _c.notes
    });
    res.status(201).json({ status: 'success', data });
})));
router.get('/tax/periods/:id', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periods = yield (0, taxPeriodService_1.listTaxPeriods)(req.user.companyId);
    const period = periods.find((row) => String(row._id) === req.params.id);
    if (!period) {
        res.status(404).json({ status: 'error', message: 'Tax period not found' });
        return;
    }
    const transactions = yield individualTaxMetadataService_1.default.listForPeriod(req.user.companyId, period.periodKey, period.taxType);
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
})));
router.put('/tax/periods/:id', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const data = yield (0, taxPeriodService_1.updateTaxPeriodStatus)({
        companyId: req.user.companyId,
        userId: req.user.userId,
        periodId: req.params.id,
        status: String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || 'REVIEW'),
        notes: (_b = req.body) === null || _b === void 0 ? void 0 : _b.notes
    });
    res.json({ status: 'success', data });
})));
router.get('/tax/vat/working-paper', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'json') {
        const data = yield individualVatService_1.default.workingPaper(req.user.companyId, periodKey);
        res.json({ status: 'success', data });
        return;
    }
    const exported = yield individualVatService_1.default.exportWorkingPaper(req.user.companyId, periodKey, format);
    res.setHeader('Content-Type', exported.contentType);
    const extension = format === 'xlsx' || format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename || `vat-working-paper.${extension}`}"`);
    res.send(exported.body);
})));
router.get('/tax/vat', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const data = yield individualVatService_1.default.overview(req.user.companyId, periodKey);
    res.json({ status: 'success', data });
})));
router.get('/tax/vat/transactions', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualVatService_1.default.transactions(req.user.companyId, {
        periodKey: typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined,
        direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined
    });
    res.json({ status: 'success', data });
})));
router.get('/tax/vat/review', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualVatService_1.default.reviewQueue(req.user.companyId);
    res.json({ status: 'success', data });
})));
router.get('/tax/vat/reconciliation', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const data = yield individualVatService_1.default.reconcile(req.user.companyId, periodKey);
    res.json({ status: 'success', data });
})));
router.get('/tax/rental/working-paper', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'json') {
        const data = yield individualRentalTaxService_1.default.workingPaper(req.user.companyId, periodKey);
        res.json({ status: 'success', data });
        return;
    }
    const exported = yield individualRentalTaxService_1.default.exportWorkingPaper(req.user.companyId, periodKey, format);
    res.setHeader('Content-Type', exported.contentType);
    const extension = format === 'xlsx' || format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename || `rental-tax-working-paper.${extension}`}"`);
    res.send(exported.body);
})));
router.get('/tax/rental', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const data = yield individualRentalTaxService_1.default.overview(req.user.companyId, periodKey);
    res.json({ status: 'success', data });
})));
router.get('/tax/rental/transactions', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualRentalTaxService_1.default.transactions(req.user.companyId, {
        periodKey: typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined
    });
    res.json({ status: 'success', data });
})));
router.get('/tax/rental/review', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualRentalTaxService_1.default.reviewQueue(req.user.companyId);
    res.json({ status: 'success', data });
})));
router.get('/tax/rental/reconciliation', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const data = yield individualRentalTaxService_1.default.reconcile(req.user.companyId, periodKey);
    res.json({ status: 'success', data });
})));
router.get('/tax/rental/annual', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const year = typeof req.query.year === 'string' ? Number(req.query.year) : undefined;
    const data = yield individualRentalTaxService_1.default.annualSchedule(req.user.companyId, year);
    res.json({ status: 'success', data });
})));
router.post('/tax/rental/payments', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const data = yield individualRentalTaxService_1.default.recordPayment({
        companyId: req.user.companyId,
        userId: req.user.userId,
        taxPeriodId: (_a = req.body) === null || _a === void 0 ? void 0 : _a.taxPeriodId,
        taxPeriodKey: (_b = req.body) === null || _b === void 0 ? void 0 : _b.taxPeriodKey,
        propertyId: (_c = req.body) === null || _c === void 0 ? void 0 : _c.propertyId,
        amount: Number(((_d = req.body) === null || _d === void 0 ? void 0 : _d.amount) || 0),
        currency: (_e = req.body) === null || _e === void 0 ? void 0 : _e.currency,
        paymentDate: (_f = req.body) === null || _f === void 0 ? void 0 : _f.paymentDate,
        paymentMethod: (_g = req.body) === null || _g === void 0 ? void 0 : _g.paymentMethod,
        paymentReference: (_h = req.body) === null || _h === void 0 ? void 0 : _h.paymentReference,
        zimraReference: ((_j = req.body) === null || _j === void 0 ? void 0 : _j.zimraReference) || ((_k = req.body) === null || _k === void 0 ? void 0 : _k.ZIMRAReference),
        documentId: (_l = req.body) === null || _l === void 0 ? void 0 : _l.documentId,
        notes: (_m = req.body) === null || _m === void 0 ? void 0 : _m.notes
    });
    res.status(201).json({ status: 'success', data });
})));
router.get('/tax/income/working-paper', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'json') {
        const data = yield individualIncomeTaxService_1.default.workingPaper(req.user.companyId, periodKey);
        res.json({ status: 'success', data });
        return;
    }
    const exported = yield individualIncomeTaxService_1.default.exportWorkingPaper(req.user.companyId, periodKey, format);
    res.setHeader('Content-Type', exported.contentType);
    const extension = format === 'xlsx' || format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename || `income-tax-working-paper.${extension}`}"`);
    res.send(exported.body);
})));
router.get('/tax/income', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const data = yield individualIncomeTaxService_1.default.overview(req.user.companyId, periodKey);
    res.json({ status: 'success', data });
})));
router.get('/tax/income/transactions', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualIncomeTaxService_1.default.transactions(req.user.companyId, {
        periodKey: typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined
    });
    res.json({ status: 'success', data });
})));
router.get('/tax/income/review', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualIncomeTaxService_1.default.reviewQueue(req.user.companyId);
    res.json({ status: 'success', data });
})));
router.get('/tax/income/reconciliation', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const periodKey = typeof req.query.periodKey === 'string' ? req.query.periodKey : undefined;
    const data = yield individualIncomeTaxService_1.default.reconcile(req.user.companyId, periodKey);
    res.json({ status: 'success', data });
})));
router.get('/tax/income/annual', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const year = typeof req.query.year === 'string' ? Number(req.query.year) : undefined;
    const data = yield individualIncomeTaxService_1.default.annualSchedule(req.user.companyId, year);
    res.json({ status: 'success', data });
})));
router.post('/tax/income/calculate', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const periodKey = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.taxPeriodKey) || req.query.periodKey || '');
    if (!periodKey) {
        res.status(400).json({ status: 'fail', message: 'taxPeriodKey is required' });
        return;
    }
    const data = yield individualIncomeTaxService_1.default.calculatePeriod(req.user.companyId, periodKey, req.user.userId);
    res.json({ status: 'success', data });
})));
router.post('/tax/income/adjustments', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const data = yield individualIncomeTaxService_1.default.createAdjustment({
        companyId: req.user.companyId,
        userId: req.user.userId,
        taxPeriodKey: (_a = req.body) === null || _a === void 0 ? void 0 : _a.taxPeriodKey,
        taxPeriodId: (_b = req.body) === null || _b === void 0 ? void 0 : _b.taxPeriodId,
        propertyId: (_c = req.body) === null || _c === void 0 ? void 0 : _c.propertyId,
        adjustmentType: (_d = req.body) === null || _d === void 0 ? void 0 : _d.adjustmentType,
        amount: Number(((_e = req.body) === null || _e === void 0 ? void 0 : _e.amount) || 0),
        currency: (_f = req.body) === null || _f === void 0 ? void 0 : _f.currency,
        reason: (_g = req.body) === null || _g === void 0 ? void 0 : _g.reason,
        explanation: ((_h = req.body) === null || _h === void 0 ? void 0 : _h.explanation) || ((_j = req.body) === null || _j === void 0 ? void 0 : _j.supportingExplanation),
        sourceTransactionIds: (_k = req.body) === null || _k === void 0 ? void 0 : _k.sourceTransactionIds,
        supportingDocumentIds: (_l = req.body) === null || _l === void 0 ? void 0 : _l.supportingDocumentIds,
        ruleId: (_m = req.body) === null || _m === void 0 ? void 0 : _m.ruleId,
        ruleVersion: (_o = req.body) === null || _o === void 0 ? void 0 : _o.ruleVersion
    });
    res.status(201).json({ status: 'success', data });
})));
router.post('/tax/income/adjustments/:id/approve', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualIncomeTaxService_1.default.approveAdjustment(req.user.companyId, req.params.id, req.user.userId);
    res.json({ status: 'success', data });
})));
router.post('/tax/income/payments', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const data = yield individualIncomeTaxService_1.default.recordPayment({
        companyId: req.user.companyId,
        userId: req.user.userId,
        taxPeriodId: (_a = req.body) === null || _a === void 0 ? void 0 : _a.taxPeriodId,
        taxPeriodKey: (_b = req.body) === null || _b === void 0 ? void 0 : _b.taxPeriodKey,
        propertyId: (_c = req.body) === null || _c === void 0 ? void 0 : _c.propertyId,
        amount: Number(((_d = req.body) === null || _d === void 0 ? void 0 : _d.amount) || 0),
        currency: (_e = req.body) === null || _e === void 0 ? void 0 : _e.currency,
        paymentDate: (_f = req.body) === null || _f === void 0 ? void 0 : _f.paymentDate,
        paymentMethod: (_g = req.body) === null || _g === void 0 ? void 0 : _g.paymentMethod,
        paymentReference: (_h = req.body) === null || _h === void 0 ? void 0 : _h.paymentReference,
        zimraReference: ((_j = req.body) === null || _j === void 0 ? void 0 : _j.zimraReference) || ((_k = req.body) === null || _k === void 0 ? void 0 : _k.ZIMRAReference),
        documentId: (_l = req.body) === null || _l === void 0 ? void 0 : _l.documentId,
        notes: (_m = req.body) === null || _m === void 0 ? void 0 : _m.notes
    });
    res.status(201).json({ status: 'success', data });
})));
router.post('/deposits/apply', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const data = yield individualAccountingService_1.default.applyDepositToRent({
        companyId: req.user.companyId,
        userId: req.user.userId,
        propertyId: String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.propertyId) || ''),
        amount: Number(((_b = req.body) === null || _b === void 0 ? void 0 : _b.amount) || 0),
        date: (_c = req.body) === null || _c === void 0 ? void 0 : _c.date,
        rentalDepositId: (_d = req.body) === null || _d === void 0 ? void 0 : _d.rentalDepositId,
        notes: (_e = req.body) === null || _e === void 0 ? void 0 : _e.notes,
        reference: (_f = req.body) === null || _f === void 0 ? void 0 : _f.reference,
        currency: (_g = req.body) === null || _g === void 0 ? void 0 : _g.currency,
        vatMode: (_h = req.body) === null || _h === void 0 ? void 0 : _h.vatMode,
        idempotencyKey: req.get('Idempotency-Key') || ((_j = req.body) === null || _j === void 0 ? void 0 : _j.idempotencyKey)
    });
    res.status(201).json({ status: 'success', data });
})));
function parseTaxYear(value) {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) {
        throw new errorHandler_1.AppError('Invalid tax year', 400);
    }
    return year;
}
router.get('/tax/compliance', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const years = yield individualTaxComplianceService_1.default.listYears(req.user.companyId);
    const taxYear = typeof req.query.taxYear === 'string' ? parseTaxYear(req.query.taxYear) : years[0];
    const data = yield individualTaxComplianceService_1.default.overview(req.user.companyId, taxYear);
    res.json({ status: 'success', data: Object.assign(Object.assign({}, data), { years }) });
})));
router.get('/tax/compliance/:taxYear', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const taxYear = parseTaxYear(req.params.taxYear);
    const data = yield individualTaxComplianceService_1.default.overview(req.user.companyId, taxYear);
    res.json({ status: 'success', data });
})));
router.get('/tax/compliance/:taxYear/readiness', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxComplianceService_1.default.readiness(req.user.companyId, parseTaxYear(req.params.taxYear));
    res.json({ status: 'success', data });
})));
router.get('/tax/compliance/:taxYear/reviews', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxComplianceService_1.default.syncReviews(req.user.companyId, parseTaxYear(req.params.taxYear), req.user.userId);
    res.json({ status: 'success', data });
})));
router.get('/tax/compliance/:taxYear/evidence', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxComplianceService_1.default.listEvidence(req.user.companyId, parseTaxYear(req.params.taxYear));
    res.json({ status: 'success', data });
})));
router.get('/tax/compliance/:taxYear/reconciliation', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxComplianceService_1.default.reconciliation(req.user.companyId, parseTaxYear(req.params.taxYear));
    res.json({ status: 'success', data });
})));
router.get('/tax/compliance/:taxYear/checklist', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxComplianceService_1.default.checklist(req.user.companyId, parseTaxYear(req.params.taxYear));
    res.json({ status: 'success', data });
})));
router.get('/tax/compliance/:taxYear/pack', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxComplianceService_1.default.getPack(req.user.companyId, parseTaxYear(req.params.taxYear));
    res.json({ status: 'success', data });
})));
router.get('/tax/compliance/:taxYear/pack/export', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const format = String(req.query.format || 'pdf').toLowerCase();
    const exported = yield individualTaxComplianceService_1.default.exportPack(req.user.companyId, parseTaxYear(req.params.taxYear), format);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.send(exported.body);
})));
router.get('/tax/compliance/:taxYear/drill/:sourceType/:sourceId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const sourceType = req.params.sourceType === 'payment' || req.params.sourceType === 'Payment' ? 'Payment' : 'LandlordFinancialTransaction';
    const data = yield individualTaxComplianceService_1.default.drillDown(req.user.companyId, sourceType, req.params.sourceId);
    res.json({ status: 'success', data });
})));
router.post('/tax/compliance/:taxYear/pack/generate', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const data = yield individualTaxComplianceService_1.default.generatePack(req.user.companyId, parseTaxYear(req.params.taxYear), req.user.userId, (_a = req.body) === null || _a === void 0 ? void 0 : _a.supersedeReason);
    res.status(201).json({ status: 'success', data });
})));
router.post('/tax/compliance/:taxYear/pack/finalize', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxComplianceService_1.default.finalizePack(req.user.companyId, parseTaxYear(req.params.taxYear), req.user.userId);
    res.json({ status: 'success', data });
})));
router.post('/tax/compliance/:taxYear/evidence', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const data = yield individualTaxComplianceService_1.default.attachEvidence({
        companyId: req.user.companyId,
        userId: req.user.userId,
        taxYear: parseTaxYear(req.params.taxYear),
        taxType: String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.taxType) || 'INCOME_TAX'),
        sourceType: String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.sourceType) || 'File'),
        sourceId: String(((_c = req.body) === null || _c === void 0 ? void 0 : _c.sourceId) || ((_d = req.body) === null || _d === void 0 ? void 0 : _d.documentId) || ''),
        documentId: String(((_e = req.body) === null || _e === void 0 ? void 0 : _e.documentId) || ''),
        documentType: (_f = req.body) === null || _f === void 0 ? void 0 : _f.documentType,
        description: (_g = req.body) === null || _g === void 0 ? void 0 : _g.description,
        taxPeriodKey: (_h = req.body) === null || _h === void 0 ? void 0 : _h.taxPeriodKey,
        propertyId: (_j = req.body) === null || _j === void 0 ? void 0 : _j.propertyId
    });
    res.status(201).json({ status: 'success', data });
})));
router.post('/tax/compliance/evidence/:id/review', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const status = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || 'REVIEWED');
    const data = yield individualTaxComplianceService_1.default.reviewEvidence(req.user.companyId, req.params.id, req.user.userId, status);
    res.json({ status: 'success', data });
})));
router.post('/tax/compliance/reviews/:id/review', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxComplianceService_1.default.startReview(req.user.companyId, req.params.id, req.user.userId);
    res.json({ status: 'success', data });
})));
router.post('/tax/compliance/reviews/:id/resolve', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const data = yield individualTaxComplianceService_1.default.resolveReview(req.user.companyId, req.params.id, req.user.userId, {
        decision: (_a = req.body) === null || _a === void 0 ? void 0 : _a.decision,
        comment: (_b = req.body) === null || _b === void 0 ? void 0 : _b.comment,
        evidenceId: (_c = req.body) === null || _c === void 0 ? void 0 : _c.evidenceId
    });
    res.json({ status: 'success', data });
})));
router.post('/tax/compliance/reviews/:id/waive', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const data = yield individualTaxComplianceService_1.default.waiveReview(req.user.companyId, req.params.id, req.user.userId, (_a = req.body) === null || _a === void 0 ? void 0 : _a.reason);
    res.json({ status: 'success', data });
})));
router.get('/tax/review', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxMetadataService_1.default.reviewQueue(req.user.companyId);
    res.json({ status: 'success', data });
})));
router.get('/tax/integrity', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield individualTaxMetadataService_1.default.integrity(req.user.companyId);
    res.json({ status: 'success', data });
})));
router.get('/transactions/:sourceType/:sourceId/tax', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const sourceType = req.params.sourceType === 'payment' ? 'Payment' : 'LandlordFinancialTransaction';
    const data = yield individualTaxMetadataService_1.default.getForSource(req.user.companyId, sourceType, req.params.sourceId);
    res.json({ status: 'success', data });
})));
router.get('/reports/:reportType', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const format = String(req.query.format || 'json').toLowerCase();
    const result = yield individualWorkspaceService_1.default.getReport(req.user.companyId, req.params.reportType, format, {
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
})));
exports.default = router;
