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
exports.TrustAccount = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TrustAccountSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, immutable: true, index: true },
    buyerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Buyer', required: false, index: true },
    sellerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    dealId: { type: String, required: false },
    openingBalance: { type: Number, required: true, default: 0, min: 0 },
    runningBalance: { type: Number, required: true, default: 0 },
    closingBalance: { type: Number, required: true, default: 0 },
    purchasePrice: { type: Number, required: true, default: 0, min: 0 },
    amountReceived: { type: Number, required: true, default: 0, min: 0 },
    amountOutstanding: { type: Number, required: true, default: 0, min: 0 },
    status: { type: String, enum: ['OPEN', 'SETTLED', 'CLOSED'], default: 'OPEN', index: true },
    workflowState: {
        type: String,
        enum: ['VALUED', 'LISTED', 'DEPOSIT_RECEIVED', 'TRUST_OPEN', 'TAX_PENDING', 'SETTLED', 'TRANSFER_COMPLETE', 'TRUST_CLOSED'],
        default: 'TRUST_OPEN'
    },
    lastTransactionAt: { type: Date, required: false },
    lockReason: { type: String, required: false },
    closedAt: { type: Date, required: false }
}, { timestamps: true });
TrustAccountSchema.index({ companyId: 1, propertyId: 1, status: 1 });
TrustAccountSchema.index({ propertyId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'SETTLED'] } } });
TrustAccountSchema.index({ companyId: 1, buyerId: 1, status: 1 });
TrustAccountSchema.index({ companyId: 1, status: 1, createdAt: -1 });
TrustAccountSchema.index({ companyId: 1, propertyId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'SETTLED'] } } });
exports.TrustAccount = mongoose_1.default.model('TrustAccount', TrustAccountSchema, collections_1.COLLECTIONS.TRUST_ACCOUNTS);
