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
exports.TaxPayout = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TaxPayoutSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    trustAccountId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TrustAccount', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    taxType: { type: String, enum: ['CGT', 'VAT', 'VAT_ON_COMMISSION'], required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    payoutDate: { type: Date, required: true, default: () => new Date() },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    receiptFileName: { type: String },
    receiptContentType: { type: String },
    receiptData: { type: Buffer, select: false },
    receiptUploadedAt: { type: Date },
    receiptUploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
TaxPayoutSchema.index({ companyId: 1, taxType: 1, propertyId: 1, payoutDate: -1 });
exports.TaxPayout = mongoose_1.default.model('TaxPayout', TaxPayoutSchema, collections_1.COLLECTIONS.TAX_PAYOUTS || 'taxpayouts');
