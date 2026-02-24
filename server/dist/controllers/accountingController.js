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
exports.backfillBalances = exports.postManualTransaction = exports.getBankTransactionSuggestions = exports.reconcileBankTransaction = exports.getBankReconciliation = exports.getLedger = exports.getBalanceSheet = exports.getProfitAndLoss = exports.getCommissionLiability = exports.exportVatReport = exports.getVatStatus = exports.getExpenseTrend = exports.getRevenueTrend = exports.getDashboardSummary = void 0;
const accountingService_1 = __importDefault(require("../services/accountingService"));
const accountingIntegrationService_1 = __importDefault(require("../services/accountingIntegrationService"));
const parseDate = (value) => {
    if (!value || typeof value !== 'string')
        return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return undefined;
    return parsed;
};
const getCompanyId = (req) => { var _a; return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) ? String(req.user.companyId) : undefined; };
const getDashboardSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        yield accountingService_1.default.initializeForCompany(companyId);
        const summary = yield accountingService_1.default.getDashboardSummary(companyId);
        return res.json(summary);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch dashboard summary' });
    }
});
exports.getDashboardSummary = getDashboardSummary;
const getRevenueTrend = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const months = Math.max(1, Math.min(24, Number(req.query.months || 12)));
        const trend = yield accountingService_1.default.getTrend(companyId, 'revenue', months);
        return res.json({ months, data: trend });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch revenue trend' });
    }
});
exports.getRevenueTrend = getRevenueTrend;
const getExpenseTrend = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const months = Math.max(1, Math.min(24, Number(req.query.months || 12)));
        const trend = yield accountingService_1.default.getTrend(companyId, 'expense', months);
        return res.json({ months, data: trend });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch expense trend' });
    }
});
exports.getExpenseTrend = getExpenseTrend;
const getVatStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const filingPeriod = typeof req.query.filingPeriod === 'string' ? req.query.filingPeriod : undefined;
        const status = req.query.status === 'pending' || req.query.status === 'submitted'
            ? req.query.status
            : undefined;
        const rows = yield accountingService_1.default.getVatStatus(companyId, { filingPeriod, status });
        return res.json({ data: rows });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch VAT status' });
    }
});
exports.getVatStatus = getVatStatus;
const exportVatReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const filingPeriod = typeof req.query.filingPeriod === 'string' ? req.query.filingPeriod : undefined;
        const status = req.query.status === 'pending' || req.query.status === 'submitted'
            ? req.query.status
            : undefined;
        const format = String(req.query.format || 'csv').toLowerCase();
        const rows = yield accountingService_1.default.getVatStatus(companyId, { filingPeriod, status });
        if (format === 'json') {
            return res.json({ data: rows });
        }
        const header = 'filing_period,status,vat_collected,vat_paid,vat_payable';
        const body = rows
            .map((row) => `${row.filingPeriod},${row.status},${Number(row.vatCollected || 0).toFixed(2)},${Number(row.vatPaid || 0).toFixed(2)},${Number(row.vatPayable || 0).toFixed(2)}`)
            .join('\n');
        const csv = `${header}\n${body}`;
        const periodTag = filingPeriod || 'all-periods';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="vat-report-${periodTag}.csv"`);
        return res.status(200).send(csv);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to export VAT report' });
    }
});
exports.exportVatReport = exportVatReport;
const getCommissionLiability = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const payload = yield accountingService_1.default.getCommissionLiability(companyId);
        return res.json(payload);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch commission liability' });
    }
});
exports.getCommissionLiability = getCommissionLiability;
const getProfitAndLoss = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const from = parseDate(req.query.from);
        const to = parseDate(req.query.to);
        const payload = yield accountingService_1.default.getProfitAndLoss(companyId, from, to);
        return res.json(payload);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch profit and loss' });
    }
});
exports.getProfitAndLoss = getProfitAndLoss;
const getBalanceSheet = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const payload = yield accountingService_1.default.getBalanceSheet(companyId);
        return res.json(payload);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch balance sheet' });
    }
});
exports.getBalanceSheet = getBalanceSheet;
const getLedger = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const accountCode = typeof req.query.accountCode === 'string' ? req.query.accountCode : undefined;
        const startDate = parseDate(req.query.startDate);
        const endDate = parseDate(req.query.endDate);
        const limit = Number(req.query.limit || 200);
        const data = yield accountingService_1.default.getLedger(companyId, { accountCode, startDate, endDate, limit });
        return res.json({ data });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch ledger' });
    }
});
exports.getLedger = getLedger;
const getBankReconciliation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const bankAccountId = typeof req.query.bankAccountId === 'string' ? req.query.bankAccountId : undefined;
        const matched = typeof req.query.matched === 'string'
            ? req.query.matched.toLowerCase() === 'true'
                ? true
                : req.query.matched.toLowerCase() === 'false'
                    ? false
                    : undefined
            : undefined;
        const startDate = parseDate(req.query.startDate);
        const endDate = parseDate(req.query.endDate);
        const limit = Number(req.query.limit || 200);
        const data = yield accountingService_1.default.getBankReconciliation(companyId, {
            bankAccountId,
            matched,
            startDate,
            endDate,
            limit
        });
        return res.json({ data });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch bank reconciliation data' });
    }
});
exports.getBankReconciliation = getBankReconciliation;
const reconcileBankTransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const bankTransactionId = req.params.id;
        const matched = Boolean((_a = req.body) === null || _a === void 0 ? void 0 : _a.matched);
        const matchedTransactionId = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.matchedTransactionId) === 'string' && req.body.matchedTransactionId.trim()
            ? req.body.matchedTransactionId.trim()
            : undefined;
        const row = yield accountingService_1.default.reconcileBankTransaction(companyId, bankTransactionId, {
            matched,
            matchedTransactionId
        });
        if (!row)
            return res.status(404).json({ message: 'Bank transaction not found' });
        return res.json({ message: 'Bank transaction updated', data: row });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to update bank transaction' });
    }
});
exports.reconcileBankTransaction = reconcileBankTransaction;
const getBankTransactionSuggestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const bankTransactionId = req.params.id;
        const data = yield accountingService_1.default.suggestBankTransactionMatches(companyId, bankTransactionId);
        return res.json({ data });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get suggestions' });
    }
});
exports.getBankTransactionSuggestions = getBankTransactionSuggestions;
const postManualTransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const { reference, description, transactionDate, lines } = req.body || {};
        if (!reference || !Array.isArray(lines) || lines.length < 2) {
            return res.status(400).json({ message: 'reference and at least two lines are required' });
        }
        const result = yield accountingService_1.default.postTransaction({
            companyId,
            reference,
            description,
            sourceModule: 'manual',
            sourceId: `${reference}:${Date.now()}`,
            transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
            createdBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId,
            lines
        });
        return res.status(201).json(Object.assign({ message: 'Transaction posted' }, result));
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to post transaction' });
    }
});
exports.postManualTransaction = postManualTransaction;
const backfillBalances = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const replayExisting = String(req.query.replayExisting || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.replayExisting) || '').toLowerCase() === 'true';
        let replay = { paymentsSynced: 0, expensesSynced: 0 };
        if (replayExisting) {
            replay = yield accountingIntegrationService_1.default.backfillFromExistingData(companyId);
        }
        yield accountingService_1.default.backfillCompanyBalances(companyId);
        return res.json(Object.assign({ message: 'Backfill complete', replayExisting }, replay));
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to backfill balances' });
    }
});
exports.backfillBalances = backfillBalances;
