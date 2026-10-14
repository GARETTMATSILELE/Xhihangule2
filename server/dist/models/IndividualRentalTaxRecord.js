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
exports.IndividualRentalTaxRecord = exports.RENTAL_TAX_RECORD_KINDS = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const individualRentalTaxCalculation_1 = require("../services/individualRentalTaxCalculation");
const rentalTaxTypes_1 = require("../services/tax/rentalTaxTypes");
exports.RENTAL_TAX_RECORD_KINDS = ['ORIGINAL', 'REVERSAL', 'ADJUSTMENT'];
const IndividualRentalTaxRecordSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    sourceType: { type: String, enum: ['Payment', 'LandlordFinancialTransaction'], required: true },
    sourceId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    snapshotId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TransactionTaxSnapshot', default: null, index: true },
    taxPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['PRESUMPTIVE_RENTAL_INCOME_TAX'], default: 'PRESUMPTIVE_RENTAL_INCOME_TAX', required: true },
    recordKind: { type: String, enum: exports.RENTAL_TAX_RECORD_KINDS, default: 'ORIGINAL', index: true },
    reversalOf: { type: mongoose_1.Schema.Types.ObjectId, ref: 'IndividualRentalTaxRecord', default: null, index: true },
    reversalReason: { type: String, default: null },
    reversalDate: { type: Date, default: null },
    reversalTransactionId: { type: String, default: null },
    rentalTaxRegime: { type: String, enum: rentalTaxTypes_1.RENTAL_TAX_REGIMES, required: true },
    applicabilityStatus: { type: String, required: true },
    applicabilityReason: { type: String, required: true },
    grossRentalAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    excludedAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxableRentalBase: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxRate: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    currency: { type: String, default: 'USD' },
    transactionCurrency: { type: String, default: 'USD' },
    baseCurrency: { type: String, default: 'USD' },
    baseAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    exchangeRate: { type: Number, default: null },
    exchangeRateDate: { type: Date, default: null },
    taxRuleId: { type: String, default: null },
    taxRuleVersion: { type: Number, default: null },
    taxRuleCode: { type: String, default: null },
    taxRuleEffectiveFrom: { type: String, default: null },
    sourceReference: { type: String, default: null },
    calculationMethod: { type: String, required: true },
    calculationStatus: { type: String, enum: individualRentalTaxCalculation_1.RENTAL_TAX_CALCULATION_STATUSES, required: true, index: true },
    reviewStatus: { type: String, required: true, index: true },
    reviewReason: { type: String, default: null },
    reviewReasons: { type: [String], default: [] },
    incomeTaxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    vatAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    calculatedAt: { type: Date, required: true, default: () => new Date() },
    calculatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });
IndividualRentalTaxRecordSchema.index({ companyId: 1, sourceType: 1, sourceId: 1, taxType: 1, recordKind: 1 }, { unique: true });
IndividualRentalTaxRecordSchema.index({ companyId: 1, taxPeriodKey: 1, calculationStatus: 1 });
IndividualRentalTaxRecordSchema.index({ companyId: 1, taxPeriodId: 1 });
IndividualRentalTaxRecordSchema.index({ companyId: 1, propertyId: 1, taxPeriodKey: 1 });
IndividualRentalTaxRecordSchema.pre('findOneAndUpdate', function (next) {
    next(new Error('Individual rental tax records cannot be updated in place. Post a reversal.'));
});
IndividualRentalTaxRecordSchema.pre('updateOne', function (next) {
    next(new Error('Individual rental tax records cannot be updated in place. Post a reversal.'));
});
IndividualRentalTaxRecordSchema.pre('updateMany', function (next) {
    next(new Error('Individual rental tax records cannot be updated in place. Post a reversal.'));
});
IndividualRentalTaxRecordSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for individual rental tax records.'));
});
IndividualRentalTaxRecordSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for individual rental tax records.'));
});
exports.IndividualRentalTaxRecord = mongoose_1.default.model('IndividualRentalTaxRecord', IndividualRentalTaxRecordSchema, collections_1.COLLECTIONS.INDIVIDUAL_RENTAL_TAX_RECORDS);
