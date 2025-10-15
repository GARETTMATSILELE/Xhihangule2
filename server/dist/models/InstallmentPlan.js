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
exports.InstallmentPlan = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const InstallmentPlanSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    saleId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'SalesContract', index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property' },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant' },
    currency: { type: String, default: 'USD' },
    principalAmount: { type: Number, required: true },
    interestAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    frequency: { type: String, enum: ['monthly', 'quarterly', 'once'], default: 'monthly' },
    numInstallments: { type: Number, required: true, min: 1 },
    startDate: { type: Date, required: true },
    graceDays: { type: Number, default: 0 },
    penaltyPolicy: {
        percentPerPeriod: { type: Number },
        fixedAmount: { type: Number }
    },
    status: { type: String, enum: ['open', 'closed', 'written_off'], default: 'open', index: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
InstallmentPlanSchema.index({ companyId: 1, saleId: 1 }, { unique: false });
exports.InstallmentPlan = mongoose_1.default.model('InstallmentPlan', InstallmentPlanSchema, 'installmentplans');
