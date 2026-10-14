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
Object.defineProperty(exports, "__esModule", { value: true });
exports.reopenAccountingPeriodHandler = exports.closeAccountingPeriodHandler = exports.postAccountingPeriod = exports.getAccountingPeriods = exports.runFinancialIntegrity = exports.reviewFinancialException = exports.getFinancialExceptions = exports.getReconciliationStatus = exports.getTrialBalance = exports.getFinancialControlsDashboard = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const financialControlsService_1 = require("../services/financialControlsService");
const trialBalanceService_1 = require("../services/trialBalanceService");
const accountingPeriodService_1 = require("../services/accountingPeriodService");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const chartAccounts_1 = require("../services/tax/chartAccounts");
const trustReconciliation_1 = require("../services/tax/trustReconciliation");
const money_1 = require("../utils/money");
const companyIdOf = (req) => {
    var _a;
    const id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
    if (!id)
        throw new errorHandler_1.AppError('Company ID required', 400);
    return String(id);
};
const actorIdOf = (req) => {
    var _a;
    const id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!id)
        throw new errorHandler_1.AppError('Authentication required', 401);
    return String(id);
};
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
exports.getFinancialControlsDashboard = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield (0, financialControlsService_1.buildFinancialControlsDashboard)(companyIdOf(req));
    return res.json({ status: 'success', data });
}));
exports.getTrialBalance = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const data = yield (0, trialBalanceService_1.buildTrialBalance)({
        companyId: companyIdOf(req),
        from: from && !Number.isNaN(from.getTime()) ? from : undefined,
        to: to && !Number.isNaN(to.getTime()) ? to : undefined
    });
    return res.json({ status: 'success', data });
}));
exports.getReconciliationStatus = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const companyId = companyIdOf(req);
    const glRows = yield ChartOfAccount_1.ChartOfAccount.find({
        companyId,
        code: { $in: [chartAccounts_1.GL.TRUST_BANK, chartAccounts_1.GL.OWNER_PAYABLE, chartAccounts_1.GL.SELLER_PAYABLE, chartAccounts_1.GL.ZIMRA_WITHHOLDING, chartAccounts_1.GL.TENANT_DEPOSITS, chartAccounts_1.GL.LEVY_PAYABLE] },
        isDeleted: { $ne: true }
    })
        .select('code balance')
        .lean();
    const glBalance = (code) => { var _a; return (0, money_1.roundMoney)(Number(((_a = glRows.find((r) => r.code === code)) === null || _a === void 0 ? void 0 : _a.balance) || 0)); };
    const trust = (0, trustReconciliation_1.buildTrustReconciliationReport)({
        trustBank: glBalance(chartAccounts_1.GL.TRUST_BANK),
        ownerPayable: glBalance(chartAccounts_1.GL.OWNER_PAYABLE),
        sellerPayable: glBalance(chartAccounts_1.GL.SELLER_PAYABLE),
        zimraWithholding: glBalance(chartAccounts_1.GL.ZIMRA_WITHHOLDING),
        tenantDeposits: glBalance(chartAccounts_1.GL.TENANT_DEPOSITS),
        levyPayable: glBalance(chartAccounts_1.GL.LEVY_PAYABLE)
    });
    return res.json({ status: 'success', data: { trust, scope: 'PARTIAL' } });
}));
exports.getFinancialExceptions = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield (0, financialControlsService_1.listFinancialExceptions)(companyIdOf(req), req.query.status ? String(req.query.status) : undefined);
    return res.json({ status: 'success', data });
}));
exports.reviewFinancialException = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const data = yield (0, financialControlsService_1.resolveFinancialException)({
        companyId: companyIdOf(req),
        id: String(req.params.id),
        actorId: actorIdOf(req),
        status: (_a = req.body) === null || _a === void 0 ? void 0 : _a.status,
        resolutionReason: ((_b = req.body) === null || _b === void 0 ? void 0 : _b.resolutionReason) || ((_c = req.body) === null || _c === void 0 ? void 0 : _c.reason)
    });
    return res.json({ status: 'success', data });
}));
exports.runFinancialIntegrity = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield (0, financialControlsService_1.runFinancialIntegrityChecks)(companyIdOf(req));
    return res.json({ status: 'success', data });
}));
exports.getAccountingPeriods = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield (0, accountingPeriodService_1.listAccountingPeriods)(companyIdOf(req));
    return res.json({ status: 'success', data });
}));
exports.postAccountingPeriod = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const data = yield (0, accountingPeriodService_1.createAccountingPeriod)({
        companyId: companyIdOf(req),
        periodStart: new Date((_a = req.body) === null || _a === void 0 ? void 0 : _a.periodStart),
        periodEnd: new Date((_b = req.body) === null || _b === void 0 ? void 0 : _b.periodEnd),
        createdBy: actorIdOf(req)
    });
    return res.status(201).json({ status: 'success', data });
}));
exports.closeAccountingPeriodHandler = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const status = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) === 'SOFT_CLOSED' ? 'SOFT_CLOSED' : 'CLOSED';
    const data = yield (0, accountingPeriodService_1.closeAccountingPeriod)({
        companyId: companyIdOf(req),
        periodId: String(req.params.id),
        actorId: actorIdOf(req),
        reason: String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.reason) || ''),
        status
    });
    return res.json({ status: 'success', data });
}));
exports.reopenAccountingPeriodHandler = asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const data = yield (0, accountingPeriodService_1.reopenAccountingPeriod)({
        companyId: companyIdOf(req),
        periodId: String(req.params.id),
        actorId: actorIdOf(req),
        reason: String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.reason) || '')
    });
    return res.json({ status: 'success', data });
}));
