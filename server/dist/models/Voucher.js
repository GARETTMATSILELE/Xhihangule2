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
exports.Voucher = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const voucherSchema = new mongoose_1.Schema({
    code: { type: String, required: true, unique: true, index: true },
    pinHash: { type: String, required: true },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true },
    cycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    amount: { type: Number, required: true },
    validFrom: { type: Date },
    validUntil: { type: Date, index: true },
    maxRedemptions: { type: Number, default: 1 },
    status: { type: String, enum: ['Unused', 'Redeemed', 'Expired', 'Cancelled'], default: 'Unused', index: true },
    redeemedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company' },
    redeemedAt: { type: Date },
    cancelledBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    auditHistory: [{
            action: { type: String, required: true, trim: true },
            userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company' },
            plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'] },
            details: { type: mongoose_1.Schema.Types.Mixed },
            createdAt: { type: Date, default: Date.now }
        }],
    metadata: { type: mongoose_1.Schema.Types.Mixed }
}, { timestamps: true });
voucherSchema.index({ status: 1, validUntil: 1 });
voucherSchema.index({ redeemedBy: 1, redeemedAt: -1 });
exports.Voucher = mongoose_1.default.model('Voucher', voucherSchema);
exports.default = exports.Voucher;
