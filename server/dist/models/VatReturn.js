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
exports.VatReturn = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const VatReturnSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    filingPeriod: { type: String, required: true, index: true },
    status: {
        type: String,
        enum: ['OPEN', 'PREPARED', 'REVIEWED', 'SUBMITTED', 'PAID', 'RECONCILED'],
        default: 'OPEN',
        index: true
    },
    taxableSupplies: { type: Number, default: 0 },
    exemptSupplies: { type: Number, default: 0 },
    zeroRatedSupplies: { type: Number, default: 0 },
    outputVat: { type: Number, default: 0 },
    inputVat: { type: Number, default: 0 },
    vatOnCommission: { type: Number, default: 0 },
    vatOnSales: { type: Number, default: 0 },
    vatWithholdingCredits: { type: Number, default: 0 },
    adjustments: { type: Number, default: 0 },
    netVatPayable: { type: Number, default: 0 },
    glOutputVat: { type: Number, default: 0 },
    obligationOutputVat: { type: Number, default: 0 },
    reconciliationDifference: { type: Number, default: 0 },
    reconciliationStatus: { type: String, enum: ['MATCHED', 'RECONCILIATION_REQUIRED', 'TIMING_DIFFERENCE'], required: false },
    reconciliationNote: { type: String, trim: true },
    zimraReturnReference: { type: String, trim: true },
    submittedAt: { type: Date },
    amountSubmitted: { type: Number },
    paymentDate: { type: Date },
    paymentReference: { type: String, trim: true },
    receiptDocumentId: { type: String },
    notes: { type: String, trim: true },
    preparedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
VatReturnSchema.index({ companyId: 1, filingPeriod: 1 }, { unique: true });
exports.VatReturn = mongoose_1.default.model('VatReturn', VatReturnSchema, collections_1.COLLECTIONS.VAT_RETURNS || 'vatreturns');
