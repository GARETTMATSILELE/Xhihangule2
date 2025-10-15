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
exports.LevyPayment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const LevyPaymentSchema = new mongoose_1.Schema({
    paymentType: {
        type: String,
        enum: ['levy'],
        required: true,
        default: 'levy',
    },
    propertyId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Property',
        required: true,
    },
    companyId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        immutable: true
    },
    paymentDate: {
        type: Date,
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'credit_card', 'mobile_money'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    referenceNumber: {
        type: String,
        required: false,
        default: '',
    },
    notes: {
        type: String,
    },
    processedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'paid_out'],
        default: 'pending',
    },
    currency: {
        type: String,
        enum: ['USD', 'ZWL'],
        default: 'USD',
    },
    monthlyLevies: {
        type: Number,
        required: false,
    },
    payout: {
        paidOut: { type: Boolean, default: false },
        paidToName: { type: String },
        paidToAccount: { type: String },
        paidToContact: { type: String },
        payoutDate: { type: Date },
        payoutMethod: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque'] },
        payoutReference: { type: String },
        acknowledgedBy: { type: String },
        acknowledgedAt: { type: Date },
        notes: { type: String },
        processedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }
    },
}, {
    timestamps: true
});
LevyPaymentSchema.index({ companyId: 1, paymentDate: -1 });
LevyPaymentSchema.index({ propertyId: 1 });
exports.LevyPayment = mongoose_1.default.model('LevyPayment', LevyPaymentSchema, collections_1.COLLECTIONS.LEVY_PAYMENTS);
