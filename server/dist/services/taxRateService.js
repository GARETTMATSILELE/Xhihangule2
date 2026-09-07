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
exports.createVatRate = exports.listTaxRates = exports.getVatRateForDate = exports.ensureCompanyVatRate = exports.vatDecimalToPercent = exports.vatPercentToDecimal = exports.VAT_TAX_TYPE = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const TaxRate_1 = require("../models/TaxRate");
const money_1 = require("../utils/money");
const errorHandler_1 = require("../middleware/errorHandler");
exports.VAT_TAX_TYPE = 'VAT';
const toId = (value) => value instanceof mongoose_1.default.Types.ObjectId ? value : new mongoose_1.default.Types.ObjectId(String(value));
const startOfDayUtc = (value) => {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const toRecord = (doc) => ({
    _id: String(doc._id),
    companyId: String(doc.companyId),
    taxType: exports.VAT_TAX_TYPE,
    rate: Number(doc.rate || 0),
    effectiveFrom: new Date(doc.effectiveFrom),
    effectiveTo: doc.effectiveTo ? new Date(doc.effectiveTo) : null,
    isActive: Boolean(doc.isActive)
});
/**
 * Convert a stored percentage (15.5) into the decimal used by payment snapshots (0.155).
 */
const vatPercentToDecimal = (percent) => {
    const n = Number(percent || 0);
    if (!Number.isFinite(n) || n < 0)
        return 0;
    return (0, money_1.roundMoney)(n / 100, 6);
};
exports.vatPercentToDecimal = vatPercentToDecimal;
const vatDecimalToPercent = (decimal) => {
    const n = Number(decimal || 0);
    if (!Number.isFinite(n) || n < 0)
        return 0;
    return (0, money_1.roundMoney)(n * 100, 4);
};
exports.vatDecimalToPercent = vatDecimalToPercent;
const isEffectiveOn = (row, onDate) => {
    const from = startOfDayUtc(row.effectiveFrom);
    const to = row.effectiveTo ? startOfDayUtc(row.effectiveTo) : null;
    const day = startOfDayUtc(onDate);
    if (day < from)
        return false;
    if (to && day > to)
        return false;
    return true;
};
const companyVatPercentFallback = (companyId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const company = yield Company_1.Company.findById(companyId).select('commissionConfig.vatPercentOnCommission createdAt').lean();
    const configured = Number((_a = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _a === void 0 ? void 0 : _a.vatPercentOnCommission);
    if (Number.isFinite(configured) && configured >= 0) {
        return (0, exports.vatDecimalToPercent)(configured);
    }
    return 0;
});
const syncCompanyCurrentVat = (companyId, percent) => __awaiter(void 0, void 0, void 0, function* () {
    yield Company_1.Company.updateOne({ _id: companyId }, { $set: { 'commissionConfig.vatPercentOnCommission': (0, exports.vatPercentToDecimal)(percent) } });
});
const ensureCompanyVatRate = (companyId) => __awaiter(void 0, void 0, void 0, function* () {
    const id = toId(companyId);
    const existing = yield TaxRate_1.TaxRate.findOne({ companyId: id, taxType: exports.VAT_TAX_TYPE }).sort({ effectiveFrom: -1, createdAt: -1 });
    if (existing)
        return toRecord(existing);
    const percent = yield companyVatPercentFallback(id);
    if (!(percent > 0))
        return null;
    const company = yield Company_1.Company.findById(id).select('createdAt').lean();
    const created = yield TaxRate_1.TaxRate.create({
        companyId: id,
        taxType: exports.VAT_TAX_TYPE,
        rate: percent,
        effectiveFrom: (company === null || company === void 0 ? void 0 : company.createdAt) || new Date('1970-01-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true
    });
    return toRecord(created);
});
exports.ensureCompanyVatRate = ensureCompanyVatRate;
const getVatRateForDate = (companyId_1, ...args_1) => __awaiter(void 0, [companyId_1, ...args_1], void 0, function* (companyId, onDate = new Date()) {
    if (!companyId)
        return { percent: 0, decimal: 0, source: 'none' };
    const id = toId(companyId);
    yield (0, exports.ensureCompanyVatRate)(id);
    const rows = yield TaxRate_1.TaxRate.find({ companyId: id, taxType: exports.VAT_TAX_TYPE }).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
    const match = rows.find((row) => isEffectiveOn(row, onDate));
    if (match) {
        const percent = Number(match.rate || 0);
        return {
            percent,
            decimal: (0, exports.vatPercentToDecimal)(percent),
            source: 'taxRate',
            taxRateId: String(match._id)
        };
    }
    const fallbackPercent = yield companyVatPercentFallback(id);
    if (fallbackPercent > 0) {
        return { percent: fallbackPercent, decimal: (0, exports.vatPercentToDecimal)(fallbackPercent), source: 'company' };
    }
    return { percent: 0, decimal: 0, source: 'none' };
});
exports.getVatRateForDate = getVatRateForDate;
const listTaxRates = (companyId_1, ...args_1) => __awaiter(void 0, [companyId_1, ...args_1], void 0, function* (companyId, taxType = exports.VAT_TAX_TYPE) {
    const id = toId(companyId);
    yield (0, exports.ensureCompanyVatRate)(id);
    const rows = yield TaxRate_1.TaxRate.find({ companyId: id, taxType }).sort({ effectiveFrom: -1, createdAt: -1 });
    return rows.map((row) => toRecord(row));
});
exports.listTaxRates = listTaxRates;
const createVatRate = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const companyId = toId(input.companyId);
    const rate = Number(input.rate);
    if (!Number.isFinite(rate) || rate < 0) {
        throw new errorHandler_1.AppError('VAT rate must be a number greater than or equal to 0', 400);
    }
    const effectiveFrom = startOfDayUtc(input.effectiveFrom || new Date());
    const overlapping = yield TaxRate_1.TaxRate.findOne({
        companyId,
        taxType: exports.VAT_TAX_TYPE,
        effectiveFrom,
        isActive: true
    });
    if (overlapping) {
        throw new errorHandler_1.AppError('A VAT rate already exists for this effective date', 400);
    }
    const previous = yield TaxRate_1.TaxRate.find({
        companyId,
        taxType: exports.VAT_TAX_TYPE,
        effectiveFrom: { $lt: effectiveFrom }
    }).sort({ effectiveFrom: -1, createdAt: -1 });
    for (const row of previous) {
        if (!row.effectiveTo || startOfDayUtc(row.effectiveTo) >= effectiveFrom) {
            const closeOn = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
            row.effectiveTo = closeOn;
        }
        row.isActive = false;
        yield row.save();
    }
    const later = yield TaxRate_1.TaxRate.find({
        companyId,
        taxType: exports.VAT_TAX_TYPE,
        effectiveFrom: { $gt: effectiveFrom }
    }).sort({ effectiveFrom: 1 });
    const nextFrom = ((_a = later[0]) === null || _a === void 0 ? void 0 : _a.effectiveFrom) ? startOfDayUtc(later[0].effectiveFrom) : null;
    const created = yield TaxRate_1.TaxRate.create({
        companyId,
        taxType: exports.VAT_TAX_TYPE,
        rate,
        effectiveFrom,
        effectiveTo: nextFrom ? new Date(nextFrom.getTime() - 24 * 60 * 60 * 1000) : null,
        isActive: !nextFrom,
        createdBy: input.createdBy ? toId(input.createdBy) : null
    });
    const current = yield (0, exports.getVatRateForDate)(companyId, new Date());
    yield syncCompanyCurrentVat(companyId, current.percent);
    return toRecord(created);
});
exports.createVatRate = createVatRate;
