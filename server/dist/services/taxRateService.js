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
exports.createVatRate = exports.listTaxRates = exports.listCentralVatRatesForCompany = exports.getTaxRateForDate = exports.periodsOverlap = exports.getVatRateForDate = exports.vatDecimalToPercent = exports.vatPercentToDecimal = exports.VAT_TAX_TYPE = void 0;
exports.selectRateEffectiveOn = selectRateEffectiveOn;
exports.detectVatRateReview = detectVatRateReview;
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const TaxRate_1 = require("../models/TaxRate");
const money_1 = require("../utils/money");
const errorHandler_1 = require("../middleware/errorHandler");
const vatCalculation_1 = require("./tax/vatCalculation");
const taxRuleRegistry_1 = require("./taxRuleRegistry");
exports.VAT_TAX_TYPE = 'VAT';
const toId = (value) => value instanceof mongoose_1.default.Types.ObjectId ? value : new mongoose_1.default.Types.ObjectId(String(value));
const startOfDayUtc = (value) => {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const toRecord = (doc) => ({
    _id: String(doc._id),
    companyId: String(doc.companyId),
    taxType: (doc.taxType || exports.VAT_TAX_TYPE),
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
function selectRateEffectiveOn(rows, onDate) {
    return rows.find((row) => isEffectiveOn(row, onDate));
}
function jurisdictionForCompany(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!companyId)
            return 'ZW';
        const company = yield Company_1.Company.findById(toId(companyId)).select('country').lean();
        return (0, taxRuleRegistry_1.jurisdictionCodeFromCountry)(company === null || company === void 0 ? void 0 : company.country);
    });
}
const getVatRateForDate = (companyId_1, ...args_1) => __awaiter(void 0, [companyId_1, ...args_1], void 0, function* (companyId, onDate = new Date()) {
    var _a;
    const jurisdiction = yield jurisdictionForCompany(companyId);
    if (!jurisdiction)
        return { percent: 0, decimal: 0, source: 'none' };
    const rule = yield (0, taxRuleRegistry_1.getEffectiveStandardVatRule)(onDate, jurisdiction);
    const percent = Number((_a = rule === null || rule === void 0 ? void 0 : rule.rate) !== null && _a !== void 0 ? _a : 0);
    if (!rule || !(percent > 0)) {
        return { percent: 0, decimal: 0, source: 'none', jurisdiction };
    }
    return {
        percent,
        decimal: (0, exports.vatPercentToDecimal)(percent),
        source: 'central',
        taxRateId: rule.id,
        jurisdiction,
        effectiveFrom: rule.effectiveFrom
    };
});
exports.getVatRateForDate = getVatRateForDate;
const periodsOverlap = (a, b) => {
    const aFrom = startOfDayUtc(a.effectiveFrom);
    const bFrom = startOfDayUtc(b.effectiveFrom);
    const aTo = a.effectiveTo ? startOfDayUtc(a.effectiveTo) : null;
    const bTo = b.effectiveTo ? startOfDayUtc(b.effectiveTo) : null;
    if (aTo && aTo < aFrom)
        return false;
    if (bTo && bTo < bFrom)
        return false;
    if (aTo && bFrom > aTo)
        return false;
    if (bTo && aFrom > bTo)
        return false;
    return true;
};
exports.periodsOverlap = periodsOverlap;
function detectVatRateReview(_companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const change = startOfDayUtc(vatCalculation_1.VAT_RATE_CHANGE_2026);
        const covering = yield (0, taxRuleRegistry_1.getEffectiveStandardVatRule)(change, 'ZW');
        if (!covering) {
            return {
                required: true,
                currentRate: null,
                expectedRate: vatCalculation_1.STANDARD_VAT_PERCENT_FROM_2026,
                coveringFrom: change,
                message: 'No central Zimbabwe VAT rate covers 1 January 2026. A system administrator must add it to the Mantis VAT registry. No historical transaction has been modified.'
            };
        }
        const currentRate = Number(covering.rate || 0);
        if (currentRate === vatCalculation_1.STANDARD_VAT_PERCENT_FROM_2026)
            return null;
        return {
            required: true,
            currentRate,
            expectedRate: vatCalculation_1.STANDARD_VAT_PERCENT_FROM_2026,
            coveringFrom: change,
            message: `Central Zimbabwe VAT rate covering 1 January 2026 is ${currentRate}%. Review is for the system administrator. No historical transaction has been modified.`
        };
    });
}
const getTaxRateForDate = (companyId_1, taxType_1, ...args_1) => __awaiter(void 0, [companyId_1, taxType_1, ...args_1], void 0, function* (companyId, taxType, onDate = new Date()) {
    if (!companyId)
        return { percent: 0, decimal: 0, source: 'none' };
    const id = toId(companyId);
    if (taxType === 'VAT') {
        const vat = yield (0, exports.getVatRateForDate)(id, onDate);
        return { percent: vat.percent, decimal: vat.decimal, source: vat.source === 'none' ? 'none' : 'taxRate', taxRateId: vat.taxRateId };
    }
    const rows = yield TaxRate_1.TaxRate.find({ companyId: id, taxType }).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
    const match = selectRateEffectiveOn(rows, onDate);
    if (!match)
        return { percent: 0, decimal: 0, source: 'none' };
    const percent = Number(match.rate || 0);
    return { percent, decimal: (0, exports.vatPercentToDecimal)(percent), source: 'taxRate', taxRateId: String(match._id) };
});
exports.getTaxRateForDate = getTaxRateForDate;
const listCentralVatRatesForCompany = (companyId) => __awaiter(void 0, void 0, void 0, function* () {
    const jurisdiction = yield jurisdictionForCompany(companyId);
    if (!jurisdiction)
        return [];
    const rules = yield (0, taxRuleRegistry_1.listStandardVatRates)(jurisdiction);
    const today = startOfDayUtc(new Date());
    return rules.map((rule) => ({
        _id: rule.id,
        companyId: '',
        taxType: 'VAT',
        rate: Number(rule.rate || 0),
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        isActive: isEffectiveOn({ effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo }, today) && rule.status === 'ACTIVE',
        jurisdiction: rule.jurisdiction,
        sourceReference: rule.sourceReference,
        notes: rule.notes,
        managedBy: 'mantis'
    }));
});
exports.listCentralVatRatesForCompany = listCentralVatRatesForCompany;
const listTaxRates = (companyId_1, ...args_1) => __awaiter(void 0, [companyId_1, ...args_1], void 0, function* (companyId, taxType = exports.VAT_TAX_TYPE) {
    if (String(taxType || exports.VAT_TAX_TYPE).toUpperCase() === exports.VAT_TAX_TYPE) {
        return (0, exports.listCentralVatRatesForCompany)(companyId);
    }
    const id = toId(companyId);
    const rows = yield TaxRate_1.TaxRate.find({ companyId: id, taxType }).sort({ effectiveFrom: -1, createdAt: -1 });
    return rows.map((row) => toRecord(row));
});
exports.listTaxRates = listTaxRates;
const createVatRate = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const companyId = toId(input.companyId);
    const taxType = input.taxType || exports.VAT_TAX_TYPE;
    if (taxType === exports.VAT_TAX_TYPE) {
        throw new errorHandler_1.AppError('Standard VAT rates are managed centrally by Mantis and cannot be set for a company', 403);
    }
    const rate = Number(input.rate);
    if (!Number.isFinite(rate) || rate < 0) {
        throw new errorHandler_1.AppError('Rate must be a number greater than or equal to 0', 400);
    }
    const effectiveFrom = startOfDayUtc(input.effectiveFrom || new Date());
    const duplicateDate = yield TaxRate_1.TaxRate.findOne({
        companyId,
        taxType,
        effectiveFrom
    });
    if (duplicateDate) {
        throw new errorHandler_1.AppError('A rate already exists for this effective date. Historical rates cannot be overwritten.', 400);
    }
    const previous = yield TaxRate_1.TaxRate.find({
        companyId,
        taxType,
        effectiveFrom: { $lt: effectiveFrom }
    }).sort({ effectiveFrom: -1, createdAt: -1 });
    for (const row of previous) {
        if (!row.effectiveTo || startOfDayUtc(row.effectiveTo) >= effectiveFrom) {
            const closeOn = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
            if (closeOn < startOfDayUtc(row.effectiveFrom)) {
                throw new errorHandler_1.AppError('New rate would overlap an existing rate period', 400);
            }
            row.effectiveTo = closeOn;
        }
        row.isActive = false;
        yield row.save();
    }
    const later = yield TaxRate_1.TaxRate.find({
        companyId,
        taxType,
        effectiveFrom: { $gt: effectiveFrom }
    }).sort({ effectiveFrom: 1 });
    const nextFrom = ((_a = later[0]) === null || _a === void 0 ? void 0 : _a.effectiveFrom) ? startOfDayUtc(later[0].effectiveFrom) : null;
    const newTo = nextFrom ? new Date(nextFrom.getTime() - 24 * 60 * 60 * 1000) : null;
    const remaining = yield TaxRate_1.TaxRate.find({ companyId, taxType, effectiveFrom: { $ne: effectiveFrom } });
    const candidate = { effectiveFrom, effectiveTo: newTo };
    for (const row of remaining) {
        if ((0, exports.periodsOverlap)(candidate, { effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo })) {
            throw new errorHandler_1.AppError('A rate already covers part of this period. Historical rates cannot be overwritten.', 400);
        }
    }
    const created = yield TaxRate_1.TaxRate.create({
        companyId,
        taxType,
        rate,
        effectiveFrom,
        effectiveTo: newTo,
        isActive: !nextFrom,
        createdBy: input.createdBy ? toId(input.createdBy) : null
    });
    return toRecord(created);
});
exports.createVatRate = createVatRate;
