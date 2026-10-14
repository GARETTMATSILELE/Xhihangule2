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
exports.getVatOnCommissionSummary = exports.createCentralVatRate = exports.listCentralVatRates = exports.createCompanyVatRate = exports.getCurrentVatRate = exports.listCompanyTaxRates = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const taxRateService_1 = require("../services/taxRateService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const errorHandler_1 = require("../middleware/errorHandler");
const access_1 = require("../utils/access");
const AdminAuditLog_1 = __importDefault(require("../models/AdminAuditLog"));
const getCompanyId = (req) => { var _a; return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) ? String(req.user.companyId) : undefined; };
const listCompanyTaxRates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const taxType = String(req.query.taxType || 'VAT');
        const rows = yield (0, taxRateService_1.listTaxRates)(companyId, taxType);
        return res.json({ status: 'success', data: rows });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to list tax rates' });
    }
});
exports.listCompanyTaxRates = listCompanyTaxRates;
const getCurrentVatRate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const onDate = req.query.date ? new Date(String(req.query.date)) : new Date();
        if (Number.isNaN(onDate.getTime())) {
            return res.status(400).json({ message: 'Invalid date' });
        }
        const rate = yield (0, taxRateService_1.getVatRateForDate)(companyId, onDate);
        return res.json({
            status: 'success',
            data: {
                taxType: 'VAT',
                rate: rate.percent,
                decimalRate: rate.decimal,
                source: rate.source,
                taxRateId: rate.taxRateId,
                jurisdiction: rate.jurisdiction,
                effectiveFrom: rate.effectiveFrom,
                managedBy: 'mantis',
                asOf: onDate
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get current VAT rate' });
    }
});
exports.getCurrentVatRate = getCurrentVatRate;
const createCompanyVatRate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const requestedType = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.taxType) || 'VAT').toUpperCase();
        if (requestedType === 'VAT') {
            return res.status(403).json({
                message: 'Standard VAT rates are managed centrally by Mantis. Company users cannot set a VAT rate.',
                code: 'VAT_RATE_CENTRALLY_MANAGED'
            });
        }
        if (!(0, access_1.hasAnyRole)(req, ['admin', 'accountant'])) {
            return res.status(403).json({ message: 'Only admin or accountant can configure this tax rate' });
        }
        const rate = Number((_b = req.body) === null || _b === void 0 ? void 0 : _b.rate);
        const effectiveFrom = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.effectiveFrom) ? new Date(req.body.effectiveFrom) : new Date();
        if (!Number.isFinite(rate) || rate < 0) {
            return res.status(400).json({ message: 'VAT rate must be a number greater than or equal to 0' });
        }
        if (Number.isNaN(effectiveFrom.getTime())) {
            return res.status(400).json({ message: 'Invalid effectiveFrom date' });
        }
        const created = yield (0, taxRateService_1.createVatRate)({
            companyId,
            rate,
            effectiveFrom,
            createdBy: (_d = req.user) === null || _d === void 0 ? void 0 : _d.userId,
            taxType: ['VAT', 'CGT', 'CGWT'].includes(String(((_e = req.body) === null || _e === void 0 ? void 0 : _e.taxType) || 'VAT'))
                ? String(((_f = req.body) === null || _f === void 0 ? void 0 : _f.taxType) || 'VAT')
                : 'VAT'
        });
        return res.status(201).json({ status: 'success', data: created });
    }
    catch (error) {
        const status = error instanceof errorHandler_1.AppError ? error.statusCode : 500;
        return res.status(status).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to create VAT rate' });
    }
});
exports.createCompanyVatRate = createCompanyVatRate;
const requireSystemAdmin = (req) => {
    var _a, _b;
    const roles = Array.isArray((_a = req.user) === null || _a === void 0 ? void 0 : _a.roles)
        ? req.user.roles
        : (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) ? [req.user.role] : []);
    if (!roles.includes('system_admin')) {
        throw new errorHandler_1.AppError('System admin required', 403);
    }
};
const listCentralVatRates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        requireSystemAdmin(req);
        const jurisdiction = String(req.query.jurisdiction || 'ZW');
        const rows = yield (0, taxRuleRegistry_1.listStandardVatRates)(jurisdiction);
        return res.json({ status: 'success', data: rows, managedBy: 'mantis' });
    }
    catch (error) {
        const status = error instanceof errorHandler_1.AppError ? error.statusCode : 500;
        return res.status(status).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to list central VAT rates' });
    }
});
exports.listCentralVatRates = listCentralVatRates;
const createCentralVatRate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        requireSystemAdmin(req);
        const rate = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.rate);
        const effectiveFrom = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.effectiveFrom) ? new Date(req.body.effectiveFrom) : null;
        const sourceReference = String(((_c = req.body) === null || _c === void 0 ? void 0 : _c.sourceReference) || '').trim();
        if (!effectiveFrom || Number.isNaN(effectiveFrom.getTime())) {
            return res.status(400).json({ message: 'A valid effectiveFrom date is required' });
        }
        const created = yield (0, taxRuleRegistry_1.createCentralStandardVatRate)({
            jurisdiction: ((_d = req.body) === null || _d === void 0 ? void 0 : _d.jurisdiction) || 'ZW',
            rate,
            effectiveFrom,
            sourceReference,
            notes: (_e = req.body) === null || _e === void 0 ? void 0 : _e.notes,
            createdBy: (_f = req.user) === null || _f === void 0 ? void 0 : _f.userId
        });
        yield AdminAuditLog_1.default.create({
            actorId: String(((_g = req.user) === null || _g === void 0 ? void 0 : _g.userId) || ''),
            actorEmail: String(((_h = req.user) === null || _h === void 0 ? void 0 : _h.email) || ''),
            action: 'central_vat_rate:create',
            payload: { jurisdiction: created.jurisdiction, rate: created.rate, effectiveFrom: created.effectiveFrom, sourceReference },
            result: { id: created.id, version: created.version },
            success: true,
            startedAt: new Date(),
            completedAt: new Date()
        });
        return res.status(201).json({ status: 'success', data: created });
    }
    catch (error) {
        const status = error instanceof errorHandler_1.AppError ? error.statusCode : 400;
        return res.status(status >= 400 && status < 600 ? status : 400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to create central VAT rate' });
    }
});
exports.createCentralVatRate = createCentralVatRate;
const getVatOnCommissionSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        const now = new Date();
        const start = req.query.startDate ? new Date(String(req.query.startDate)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const end = req.query.endDate ? new Date(String(req.query.endDate)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({ message: 'Invalid date range' });
        }
        const rows = yield Payment_1.Payment.aggregate([
            {
                $match: {
                    companyId: new mongoose_1.default.Types.ObjectId(companyId),
                    status: 'completed',
                    paymentDate: { $gte: start, $lte: end },
                    'commissionDetails.vatOnCommission': { $gt: 0 }
                }
            },
            {
                $group: {
                    _id: null,
                    vatCollected: { $sum: '$commissionDetails.vatOnCommission' },
                    transactions: { $sum: 1 },
                    properties: { $addToSet: '$propertyId' }
                }
            }
        ]);
        const row = rows[0] || { vatCollected: 0, transactions: 0, properties: [] };
        return res.json({
            status: 'success',
            data: {
                startDate: start,
                endDate: end,
                vatCollected: Number(Number(row.vatCollected || 0).toFixed(2)),
                transactions: Number(row.transactions || 0),
                properties: Array.isArray(row.properties) ? row.properties.length : 0
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to summarise VAT on commission' });
    }
});
exports.getVatOnCommissionSummary = getVatOnCommissionSummary;
