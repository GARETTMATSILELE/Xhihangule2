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
exports.TransactionTaxSnapshot = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const taxMetadataTypes_1 = require("../services/tax/taxMetadataTypes");
const TaxRuleReferenceSchema = new mongoose_1.Schema({
    taxType: { type: String, required: true },
    ruleId: { type: String, default: null },
    ruleCode: { type: String, default: null },
    ruleVersion: { type: Number, default: null },
    effectiveFrom: { type: String, default: null },
    sourceReference: { type: String, default: null },
    configuredRate: { type: Number, default: null },
    taxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxCalculationStatus: { type: String, enum: taxMetadataTypes_1.TAX_CALCULATION_STATUSES, required: true }
}, { _id: false });
const TaxProfileSnapshotSchema = new mongoose_1.Schema({
    vatRegistered: { type: Boolean, required: true },
    vatNumber: { type: String, default: '' },
    rentalTaxRegime: { type: String, required: true },
    incomeTaxRegistered: { type: Boolean, required: true },
    propertyUseClass: { type: String, default: null },
    vatSupplyTreatment: { type: String, required: true },
    rentalTaxTreatment: { type: String, required: true },
    ownerProfileVersion: { type: Number, required: true, default: 1 },
    propertyUpdatedAt: { type: String, default: null }
}, { _id: false });
const TransactionTaxSnapshotSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    sourceType: { type: String, enum: ['Payment', 'LandlordFinancialTransaction'], required: true },
    sourceId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    sourceKind: { type: String, enum: taxMetadataTypes_1.TRANSACTION_TAX_SOURCE_KINDS, required: true, index: true },
    transactionDate: { type: Date, required: true, index: true },
    accountingPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AccountingPeriod', default: null },
    taxPeriodKey: { type: String, required: true, index: true },
    taxPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    periodAssignmentStatus: { type: String, enum: taxMetadataTypes_1.TAX_PERIOD_ASSIGNMENT_STATUSES, required: true },
    taxTypesRelevant: { type: [String], default: [] },
    taxRuleReferences: { type: [TaxRuleReferenceSchema], default: [] },
    taxProfileSnapshot: { type: TaxProfileSnapshotSchema, required: true },
    vatTreatment: { type: String, required: true },
    rentalTaxTreatment: { type: String, required: true },
    rentalTaxRegime: { type: String, required: true },
    deductibility: { type: String, default: null },
    capitalOrRevenue: { type: String, default: null },
    classificationSource: { type: String, enum: taxMetadataTypes_1.TAX_CLASSIFICATION_SOURCES, required: true },
    classificationStatus: { type: String, enum: taxMetadataTypes_1.TAX_CALCULATION_STATUSES, required: true },
    taxCalculationStatus: { type: String, enum: taxMetadataTypes_1.TAX_CALCULATION_STATUSES, required: true, index: true },
    reviewReasons: { type: [String], default: [] },
    taxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxableAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    taxRate: { type: mongoose_1.Schema.Types.Mixed, default: null },
    vatAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    presumptiveTaxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    incomeTaxAmount: { type: mongoose_1.Schema.Types.Mixed, default: null },
    classifiedAt: { type: Date, required: true, default: () => new Date() },
    classifiedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
TransactionTaxSnapshotSchema.index({ companyId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
TransactionTaxSnapshotSchema.index({ companyId: 1, taxPeriodKey: 1, taxCalculationStatus: 1 });
TransactionTaxSnapshotSchema.index({ companyId: 1, propertyId: 1, transactionDate: -1 });
TransactionTaxSnapshotSchema.pre('save', function (next) {
    if (!this.isNew && this.isModified()) {
        return next(new Error('Tax snapshots are immutable after posting.'));
    }
    if (this.taxAmount != null || this.vatAmount != null || this.presumptiveTaxAmount != null || this.incomeTaxAmount != null) {
        return next(new Error('Phase D tax snapshots cannot store calculated tax amounts.'));
    }
    return next();
});
TransactionTaxSnapshotSchema.pre('findOneAndUpdate', function (next) {
    next(new Error('Tax snapshots cannot be updated in place.'));
});
TransactionTaxSnapshotSchema.pre('updateOne', function (next) {
    next(new Error('Tax snapshots cannot be updated in place.'));
});
TransactionTaxSnapshotSchema.pre('updateMany', function (next) {
    next(new Error('Tax snapshots cannot be updated in place.'));
});
TransactionTaxSnapshotSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for tax snapshots.'));
});
TransactionTaxSnapshotSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for tax snapshots.'));
});
exports.TransactionTaxSnapshot = mongoose_1.default.model('TransactionTaxSnapshot', TransactionTaxSnapshotSchema, collections_1.COLLECTIONS.TRANSACTION_TAX_SNAPSHOTS);
