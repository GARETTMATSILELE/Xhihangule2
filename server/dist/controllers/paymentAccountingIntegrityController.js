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
exports.listAccountingIntegrityInconsistencies = exports.getTrustVisibility = exports.getPaymentFinancialTrace = exports.getAccountingIntegritySummary = void 0;
const paymentAccountingIntegrity_1 = require("../services/paymentAccountingIntegrity");
const financialTraceService_1 = require("../services/financialTraceService");
function parseDate(value) {
    if (!value || typeof value !== 'string')
        return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return undefined;
    return parsed;
}
const getAccountingIntegritySummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    if (!companyId)
        return res.status(400).json({ message: 'companyId is required' });
    try {
        const summary = yield (0, paymentAccountingIntegrity_1.getCompanyAccountingIntegritySummary)(companyId);
        return res.json(summary);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to load accounting integrity summary' });
    }
});
exports.getAccountingIntegritySummary = getAccountingIntegritySummary;
const getPaymentFinancialTrace = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    if (!companyId)
        return res.status(400).json({ message: 'companyId is required' });
    try {
        const trace = yield (0, financialTraceService_1.buildFinancialTrace)(companyId, String(req.params.id));
        if (!trace)
            return res.status(404).json({ message: 'Payment not found' });
        return res.json(trace);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to load financial trace' });
    }
});
exports.getPaymentFinancialTrace = getPaymentFinancialTrace;
const getTrustVisibility = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    if (!companyId)
        return res.status(400).json({ message: 'companyId is required' });
    try {
        const rows = yield (0, financialTraceService_1.listTrustVisibility)(companyId, Number(req.query.limit || 50));
        return res.json({ rows });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to load trust visibility' });
    }
});
exports.getTrustVisibility = getTrustVisibility;
const listAccountingIntegrityInconsistencies = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    if (!companyId)
        return res.status(400).json({ message: 'companyId is required' });
    try {
        const result = yield (0, paymentAccountingIntegrity_1.listCompanyAccountingInconsistencies)(companyId, {
            status: req.query.status,
            component: typeof req.query.component === 'string' ? req.query.component : undefined,
            dateFrom: parseDate(req.query.dateFrom || req.query.startDate),
            dateTo: parseDate(req.query.dateTo || req.query.endDate),
            propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined,
            agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
            paymentReference: typeof req.query.paymentReference === 'string' ? req.query.paymentReference : undefined,
            currency: typeof req.query.currency === 'string' ? req.query.currency : undefined,
            page: Number(req.query.page || 1),
            limit: Number(req.query.limit || 25)
        });
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to list accounting inconsistencies' });
    }
});
exports.listAccountingIntegrityInconsistencies = listAccountingIntegrityInconsistencies;
