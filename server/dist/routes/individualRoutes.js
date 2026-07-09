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
        const data = yield individualWorkspaceService_1.default.getSummary(req.user.companyId);
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
        const data = yield individualWorkspaceService_1.default.getAccounting(req.user.companyId);
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
            month: req.query.month
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
            month: req.query.month
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
router.get('/reports/:reportType', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const format = String(req.query.format || 'json').toLowerCase();
    const result = yield individualWorkspaceService_1.default.getReport(req.user.companyId, req.params.reportType, format);
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
