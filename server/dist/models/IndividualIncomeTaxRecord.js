"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndividualIncomeTaxRecord = exports.INCOME_TAX_RECORD_KINDS = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const incomeTaxTypes_1 = require("../services/tax/incomeTaxTypes");
exports.INCOME_TAX_RECORD_KINDS = ['ORIGINAL', 'REVERSAL'];
const IndividualIncomeTaxRecordSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxpayerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', default: null },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    sourceType: { type: String, enum: ['Payment', 'LandlordFinancialTransaction'], required: true },
    sourceId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    snapshotId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TransactionTaxSnapshot', default: null, index: true },
    taxpayerProfileSnapshotId: { type: String, default: null },
    taxPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['INCOME_TAX'], default: 'INCOME_TAX', required: true },
    recordKind: { type: String, enum: exports.INCOME_TAX_RECORD_KINDS, default: 'ORIGINAL', index: true },
    reversalOf: { type: mongoose_1.Schema.Types.ObjectId, ref: 'IndividualIncomeTaxRecord', default: null, index: true },
    reversalRecordId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'IndividualIncomeTaxRecord', default: null },
    reversalReason: { type: String, default: null },
    reversalDate: { type: Date, default: null },
    incomeTaxRegime: { type: String, required: true },
    classification: { type: String, enum: incomeTaxTypes_1.INCOME_TAX_CLASSIFICATIONS, required: true, index: true },
    accountingIncome: { type: mongoose_1.Schema.Types.Mixed, default: null },
    accountingExpenses: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxableIncomeBeforeAdjustments: { type: mongoose_1.Schema.Types.Mixed, default: null },
    addBacks: { type: mongoose_1.Schema.Types.Mixed, default: null },
    deductions: { type: mongoose_1.Schema.Types.Mixed, default: null },
    exemptIncome: { type: mongoose_1.Schema.Types.Mixed, default: null },
    capitalAdjustments: { type: mongoose_1.Schema.Types.Mixed, default: null },
    otherTaxAdjustments: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxableIncome: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxableContribution: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxRate: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxCurrency: { type: String, default: 'USD' },
    currency: { type: String, default: 'USD' },
    transactionCurrency: { type: String, default: 'USD' },
    baseCurrency: { type: String, default: 'USD' },
    exchangeRate: { type: Number, default: null },
    exchangeRateDate: { type: Date, default: null },
    exchangeRateSource: { type: String, default: null },
    taxRuleId: { type: String, default: null },
    taxRuleVersion: { type: Number, default: null },
    taxRuleCode: { type: String, default: null },
    taxRuleEffectiveFrom: { type: String, default: null },
    taxRuleEffectiveTo: { type: String, default: null },
    sourceReference: { type: String, default: null },
    calculationMethod: { type: String, required: true },
    calculationStatus: { type: String, enum: incomeTaxTypes_1.INCOME_TAX_CALCULATION_STATUSES, required: true, index: true },
    reviewStatus: { type: String, required: true, index: true },
    reviewReason: { type: String, default: null },
    reviewReasons: { type: [String], default: [] },
    supportingDocumentStatus: { type: String, default: 'NOT_REQUIRED' },
    vatAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    presumptiveTaxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    calculatedAt: { type: Date, required: true, default: () => new Date() },
    finalizedAt: { type: Date, default: null },
    calculatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });
IndividualIncomeTaxRecordSchema.index({ companyId: 1, sourceType: 1, sourceId: 1, taxType: 1, recordKind: 1 }, { unique: true });
IndividualIncomeTaxRecordSchema.index({ companyId: 1, taxPeriodId: 1 });
IndividualIncomeTaxRecordSchema.index({ companyId: 1, taxPeriodKey: 1 });
IndividualIncomeTaxRecordSchema.index({ companyId: 1, propertyId: 1, taxPeriodKey: 1 });
IndividualIncomeTaxRecordSchema.index({ companyId: 1, calculationStatus: 1 });
IndividualIncomeTaxRecordSchema.pre('findOneAndUpdate', function (next) {
    next(new Error('Individual income tax records cannot be updated in place. Post a reversal.'));
});
IndividualIncomeTaxRecordSchema.pre('updateOne', function (next) {
    next(new Error('Individual income tax records cannot be updated in place. Post a reversal.'));
});
IndividualIncomeTaxRecordSchema.pre('updateMany', function (next) {
    next(new Error('Individual income tax records cannot be updated in place. Post a reversal.'));
});
IndividualIncomeTaxRecordSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for individual income tax records.'));
});
IndividualIncomeTaxRecordSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for individual income tax records.'));
});
exports.IndividualIncomeTaxRecord = mongoose_1.default.model('IndividualIncomeTaxRecord', IndividualIncomeTaxRecordSchema, collections_1.COLLECTIONS.INDIVIDUAL_INCOME_TAX_RECORDS);
