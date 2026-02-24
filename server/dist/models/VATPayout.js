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
exports.VATPayout = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const VATPayoutSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    paymentIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment', required: true }],
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'ZWL', 'ZiG', 'ZAR'], default: 'USD' },
    recipientId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    recipientName: { type: String },
    recipientBankDetails: { type: String },
    payoutMethod: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque'], default: 'bank_transfer' },
    referenceNumber: { type: String, required: true, index: true, unique: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'completed' },
    date: { type: Date, default: () => new Date() },
    notes: { type: String },
    receiptFileName: { type: String },
    receiptContentType: { type: String },
    receiptData: { type: Buffer, select: false },
    receiptUploadedAt: { type: Date },
    receiptUploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
// Compound index to speed property/company scoped queries
VATPayoutSchema.index({ companyId: 1, propertyId: 1, date: -1 });
exports.VATPayout = mongoose_1.default.model('VATPayout', VATPayoutSchema, collections_1.COLLECTIONS.VAT_PAYOUTS || 'vatpayouts');
