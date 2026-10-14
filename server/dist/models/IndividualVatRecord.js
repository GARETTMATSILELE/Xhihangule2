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
exports.IndividualVatRecord = exports.VAT_RECORD_KINDS = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const taxMetadataTypes_1 = require("../services/tax/taxMetadataTypes");
const individualVatApplicability_1 = require("../services/individualVatApplicability");
exports.VAT_RECORD_KINDS = ['ORIGINAL', 'REVERSAL', 'ADJUSTMENT'];
const IndividualVatRecordSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    sourceType: { type: String, enum: ['Payment', 'LandlordFinancialTransaction'], required: true },
    sourceId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    snapshotId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TransactionTaxSnapshot', default: null, index: true },
    taxPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['VAT'], default: 'VAT', required: true },
    direction: { type: String, enum: individualVatApplicability_1.VAT_DIRECTIONS, required: true, index: true },
    recordKind: { type: String, enum: exports.VAT_RECORD_KINDS, default: 'ORIGINAL', index: true },
    reversalOf: { type: mongoose_1.Schema.Types.ObjectId, ref: 'IndividualVatRecord', default: null, index: true },
    reversalReason: { type: String, default: null },
    reversalDate: { type: Date, default: null },
    reversalTransactionId: { type: String, default: null },
    treatment: { type: String, enum: individualVatApplicability_1.VAT_TREATMENTS, required: true },
    applicabilityReason: { type: String, required: true },
    grossAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    netAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxableAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    vatRate: { type: mongoose_1.Schema.Types.Mixed, default: null },
    vatAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    chargedVatAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    recoverableVatAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    inputVatEligibility: { type: String, enum: individualVatApplicability_1.INPUT_VAT_ELIGIBILITIES, default: null },
    calculationMethod: { type: String, required: true },
    calculationStatus: { type: String, enum: taxMetadataTypes_1.TAX_CALCULATION_STATUSES, required: true, index: true },
    reviewReasons: { type: [String], default: [] },
    taxRuleId: { type: String, default: null },
    taxRuleVersion: { type: Number, default: null },
    taxRuleCode: { type: String, default: null },
    taxRuleEffectiveFrom: { type: String, default: null },
    currency: { type: String, default: 'USD' },
    baseCurrency: { type: String, default: 'USD' },
    baseAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    exchangeRate: { type: Number, default: null },
    exchangeRateDate: { type: Date, default: null },
    supplier: { type: String, default: null },
    supplierTin: { type: String, default: null },
    supplierVatNumber: { type: String, default: null },
    invoiceNumber: { type: String, default: null },
    counterpartyName: { type: String, default: null },
    incomeTaxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    presumptiveTaxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    calculatedAt: { type: Date, required: true, default: () => new Date() },
    calculatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
IndividualVatRecordSchema.index({ companyId: 1, sourceType: 1, sourceId: 1, direction: 1, recordKind: 1 }, { unique: true });
IndividualVatRecordSchema.index({ companyId: 1, taxPeriodKey: 1, direction: 1, calculationStatus: 1 });
IndividualVatRecordSchema.index({ companyId: 1, taxPeriodId: 1, direction: 1 });
IndividualVatRecordSchema.pre('findOneAndUpdate', function (next) {
    next(new Error('Individual VAT records cannot be updated in place. Post a reversal.'));
});
IndividualVatRecordSchema.pre('updateOne', function (next) {
    next(new Error('Individual VAT records cannot be updated in place. Post a reversal.'));
});
IndividualVatRecordSchema.pre('updateMany', function (next) {
    next(new Error('Individual VAT records cannot be updated in place. Post a reversal.'));
});
IndividualVatRecordSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for individual VAT records.'));
});
IndividualVatRecordSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for individual VAT records.'));
});
exports.IndividualVatRecord = mongoose_1.default.model('IndividualVatRecord', IndividualVatRecordSchema, collections_1.COLLECTIONS.INDIVIDUAL_VAT_RECORDS);
