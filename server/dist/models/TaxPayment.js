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
exports.TaxPayment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TaxPaymentSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'USD' },
    paymentDate: { type: Date, required: true, default: () => new Date() },
    bankAccountCode: { type: String, required: true, default: '1001' },
    zimraReference: { type: String, trim: true },
    paymentReference: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: ['DRAFT', 'POSTED', 'REVERSED'], default: 'POSTED', index: true },
    allocations: [
        {
            taxObligationId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxObligation', required: true },
            taxType: { type: String, required: true },
            taxPeriod: { type: String, required: false },
            amount: { type: Number, required: true, min: 0.01 }
        }
    ],
    unallocatedAmount: { type: Number, required: false, min: 0, default: 0 },
    unallocatedReason: { type: String, trim: true },
    journalEntryId: { type: String, required: false },
    receiptFileName: { type: String },
    receiptContentType: { type: String },
    receiptData: { type: Buffer, select: false },
    receiptUploadedAt: { type: Date },
    receiptUploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
TaxPaymentSchema.index({ companyId: 1, paymentDate: -1 });
TaxPaymentSchema.index({ companyId: 1, 'allocations.taxObligationId': 1 });
exports.TaxPayment = mongoose_1.default.model('TaxPayment', TaxPaymentSchema, collections_1.COLLECTIONS.TAX_PAYMENTS || 'taxpayments');
