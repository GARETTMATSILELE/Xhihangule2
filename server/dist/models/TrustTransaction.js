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
exports.TrustTransaction = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TrustTransactionSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    trustAccountId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TrustAccount', required: true, immutable: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, immutable: true, index: true },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment', required: false, immutable: true, index: true },
    type: {
        type: String,
        enum: ['BUYER_PAYMENT', 'TRANSFER_TO_SELLER', 'CGT_DEDUCTION', 'COMMISSION_DEDUCTION', 'VAT_DEDUCTION', 'VAT_ON_COMMISSION', 'REFUND'],
        required: true,
        index: true
    },
    debit: { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },
    vatComponent: { type: Number, required: false, min: 0, default: 0 },
    runningBalance: { type: Number, required: true },
    reference: { type: String, required: false, trim: true },
    sourceEvent: { type: String, required: false, trim: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false, immutable: true }
}, { timestamps: true });
TrustTransactionSchema.index({ trustAccountId: 1, createdAt: -1 });
TrustTransactionSchema.index({ companyId: 1, propertyId: 1, createdAt: -1 });
TrustTransactionSchema.index({ companyId: 1, type: 1, createdAt: -1 });
TrustTransactionSchema.index({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $exists: true, $type: 'objectId' } } });
TrustTransactionSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
    return next(new Error('Trust transactions are immutable. Create a correcting entry instead.'));
});
exports.TrustTransaction = mongoose_1.default.model('TrustTransaction', TrustTransactionSchema, collections_1.COLLECTIONS.TRUST_TRANSACTIONS);
