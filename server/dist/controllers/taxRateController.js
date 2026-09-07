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
exports.getVatOnCommissionSummary = exports.createCompanyVatRate = exports.getCurrentVatRate = exports.listCompanyTaxRates = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const taxRateService_1 = require("../services/taxRateService");
const errorHandler_1 = require("../middleware/errorHandler");
const access_1 = require("../utils/access");
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
    var _a, _b, _c;
    try {
        const companyId = getCompanyId(req);
        if (!companyId)
            return res.status(400).json({ message: 'companyId is required' });
        if (!(0, access_1.hasAnyRole)(req, ['admin', 'accountant'])) {
            return res.status(403).json({ message: 'Only admin or accountant can configure VAT rates' });
        }
        const rate = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.rate);
        const effectiveFrom = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.effectiveFrom) ? new Date(req.body.effectiveFrom) : new Date();
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
            createdBy: (_c = req.user) === null || _c === void 0 ? void 0 : _c.userId
        });
        return res.status(201).json({ status: 'success', data: created });
    }
    catch (error) {
        const status = error instanceof errorHandler_1.AppError ? error.statusCode : 500;
        return res.status(status).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to create VAT rate' });
    }
});
exports.createCompanyVatRate = createCompanyVatRate;
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
