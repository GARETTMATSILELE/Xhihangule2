"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LandlordFinancialTransaction = exports.CAPITAL_OR_REVENUE = exports.DEDUCTIBILITY = exports.VAT_MODES = exports.LANDLORD_SOURCE_KINDS = void 0;
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const collections_1 = require("../config/collections");
exports.LANDLORD_SOURCE_KINDS = [
    'EXPENSE',
    'OTHER_INCOME',
    'MAINTENANCE',
    'CAPITAL',
    'LIABILITY',
    'REVERSAL'
];
exports.VAT_MODES = ['NO_VAT', 'VAT_INCLUSIVE', 'VAT_EXCLUSIVE', 'UNKNOWN', 'ACCOUNTANT_REVIEW'];
exports.DEDUCTIBILITY = [
    'DEDUCTIBLE',
    'NON_DEDUCTIBLE',
    'PARTIALLY_DEDUCTIBLE',
    'CAPITAL',
    'ACCOUNTANT_REVIEW',
    'NOT_APPLICABLE'
];
exports.CAPITAL_OR_REVENUE = ['REVENUE', 'CAPITAL', 'MIXED', 'ACCOUNTANT_REVIEW'];
const LandlordFinancialTransactionSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceKind: { type: String, enum: exports.LANDLORD_SOURCE_KINDS, required: true, index: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', trim: true },
    date: { type: Date, required: true, index: true },
    supplier: { type: String, trim: true },
    supplierTin: { type: String, trim: true },
    supplierVatNumber: { type: String, trim: true },
    invoiceNumber: { type: String, trim: true },
    paymentMethod: { type: String, trim: true },
    referenceNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    attachments: { type: [String], default: [] },
    vatMode: { type: String, enum: exports.VAT_MODES, default: 'UNKNOWN' },
    accountingTreatment: { type: String, required: true },
    transactionCategory: { type: String, required: false },
    capitalOrRevenue: { type: String, enum: exports.CAPITAL_OR_REVENUE, default: 'REVENUE' },
    deductibility: { type: String, enum: exports.DEDUCTIBILITY, default: 'ACCOUNTANT_REVIEW' },
    inputVatEligibility: { type: String, required: false, trim: true },
    taxReviewStatus: {
        type: String,
        enum: ['UNCLASSIFIED', 'READY', 'ACCOUNTANT_REVIEW'],
        default: 'UNCLASSIFIED',
        index: true
    },
    idempotencyKey: { type: String, required: true },
    propertyAccountId: { type: mongoose_1.Schema.Types.ObjectId },
    propertyAccountTransactionId: { type: mongoose_1.Schema.Types.ObjectId },
    reversalOf: { type: mongoose_1.Schema.Types.ObjectId, ref: 'LandlordFinancialTransaction' },
    reversedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'LandlordFinancialTransaction' },
    status: { type: String, enum: ['POSTED', 'REVERSED'], default: 'POSTED', index: true },
    accountingPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AccountingPeriod' },
    sourceMaintenanceId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest' },
    taxSnapshotId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TransactionTaxSnapshot', required: false, index: true },
    taxCalculationStatus: { type: String, required: false, index: true },
    taxPeriodKey: { type: String, required: false, index: true }
}, { timestamps: true });
LandlordFinancialTransactionSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true });
LandlordFinancialTransactionSchema.index({ companyId: 1, propertyId: 1, date: -1 });
LandlordFinancialTransactionSchema.index({ companyId: 1, sourceKind: 1, status: 1, date: -1 });
LandlordFinancialTransactionSchema.index({ companyId: 1, taxPeriodKey: 1, taxCalculationStatus: 1 });
function onlyAllowedCanonicalUpdate(update) {
    const set = ((update === null || update === void 0 ? void 0 : update.$set) || update || {});
    const keys = Object.keys(set).filter((key) => key !== 'updatedAt');
    const allowed = new Set(['status', 'reversedBy', 'propertyAccountId', 'propertyAccountTransactionId', 'taxSnapshotId', 'taxCalculationStatus', 'taxPeriodKey']);
    return keys.length > 0 && keys.every((key) => allowed.has(key));
}
LandlordFinancialTransactionSchema.pre('findOneAndUpdate', function (next) {
    if (onlyAllowedCanonicalUpdate(this.getUpdate()))
        return next();
    next(new Error('Landlord financial transactions cannot be updated in place. Post a reversal.'));
});
LandlordFinancialTransactionSchema.pre('updateOne', function (next) {
    if (onlyAllowedCanonicalUpdate(this.getUpdate()))
        return next();
    next(new Error('Landlord financial transactions cannot be updated in place. Post a reversal.'));
});
LandlordFinancialTransactionSchema.pre('updateMany', function (next) {
    next(new Error('Landlord financial transactions cannot be updated in place. Post a reversal.'));
});
LandlordFinancialTransactionSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for landlord financial transactions.'));
});
LandlordFinancialTransactionSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for landlord financial transactions.'));
});
exports.LandlordFinancialTransaction = database_1.accountingConnection.model('LandlordFinancialTransaction', LandlordFinancialTransactionSchema, collections_1.COLLECTIONS.LANDLORD_FINANCIAL_TRANSACTIONS);
exports.default = exports.LandlordFinancialTransaction;
