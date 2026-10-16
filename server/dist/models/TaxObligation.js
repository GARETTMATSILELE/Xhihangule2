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
exports.TaxObligation = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const taxTypes_1 = require("../services/tax/taxTypes");
const TaxObligationSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxType: { type: String, enum: taxTypes_1.TAX_TYPES, required: true, index: true },
    entityType: { type: String, required: true, default: 'payment' },
    entityId: { type: String, required: false },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: false, index: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, required: false },
    sellerId: { type: mongoose_1.Schema.Types.ObjectId, required: false },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, required: false },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment', required: false, index: true },
    saleId: { type: mongoose_1.Schema.Types.ObjectId, required: false },
    transactionId: { type: String, required: false, index: true },
    taxPeriod: { type: String, required: true, index: true },
    transactionDate: { type: Date, required: true, index: true },
    currency: { type: String, default: 'USD' },
    taxCurrency: { type: String, required: false },
    exchangeRate: { type: Number, required: false },
    exchangeRateSource: { type: String, required: false },
    exchangeRateDate: { type: Date, required: false },
    functionalAmount: { type: Number, required: false },
    taxableAmount: { type: Number, required: true, default: 0 },
    taxRate: { type: Number, required: true, default: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    calculationBasis: { type: String, required: true },
    calculationSnapshot: { type: mongoose_1.Schema.Types.Mixed, required: false },
    status: { type: String, enum: taxTypes_1.TAX_STATUSES, required: true, default: 'CALCULATED', index: true },
    calculatedAt: { type: Date, required: true, default: () => new Date() },
    withheldAt: { type: Date, required: false },
    dueDate: { type: Date, required: false },
    submittedAt: { type: Date, required: false },
    paidAt: { type: Date, required: false },
    reconciledAt: { type: Date, required: false },
    zimraReference: { type: String, required: false, trim: true },
    paymentReference: { type: String, required: false, trim: true },
    receiptDocumentId: { type: String, required: false },
    sourceLedger: { type: String, required: false },
    glAccount: { type: String, required: false },
    journalEntryId: { type: String, required: false },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    approvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    reversalOf: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxObligation', required: false, index: true },
    reversedByObligationId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxObligation', required: false }
}, { timestamps: true });
TaxObligationSchema.index({ companyId: 1, taxType: 1, taxPeriod: 1, status: 1 });
TaxObligationSchema.index({ companyId: 1, paymentId: 1, taxType: 1, reversalOf: 1 }, { unique: true, sparse: true });
// Original obligations omit reversalOf. MongoDB rejects `$exists: false` in a partial
// index because it is rewritten as `$not`. Equality to null covers missing and null
// values, so originals stay unique while reversal rows (reversalOf set) stay outside.
TaxObligationSchema.index({ companyId: 1, paymentId: 1, taxType: 1 }, {
    name: 'companyId_1_paymentId_1_taxType_1_original',
    unique: true,
    partialFilterExpression: { reversalOf: null, paymentId: { $type: 'objectId' } }
});
exports.TaxObligation = mongoose_1.default.model('TaxObligation', TaxObligationSchema, collections_1.COLLECTIONS.TAX_OBLIGATIONS || 'taxobligations');
