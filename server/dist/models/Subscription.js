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
exports.Subscription = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const subscriptionSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    onboardingSessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'OnboardingSession', required: false, index: true },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true },
    cycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    status: { type: String, enum: ['trial', 'active', 'past_due', 'canceled', 'cancelled', 'suspended', 'expired', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'], default: 'trial', index: true },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    nextPaymentAt: { type: Date },
    gracePeriodEnd: { type: Date },
    paynowRef: { type: String },
    pollUrl: { type: String },
    provider: { type: String, enum: ['paynow', 'cash', 'manual'] },
    lastPaymentSessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'PaymentSession' },
    lastPaymentAt: { type: Date },
    lastReconciledAt: { type: Date },
    trialStartDate: { type: Date },
    trialEndDate: { type: Date },
    trialDurationDays: { type: Number, default: 14 },
    cancelledAt: { type: Date },
    suspendedAt: { type: Date },
    suspensionReason: { type: String },
    adminOverride: {
        enabled: { type: Boolean, default: false, index: true },
        reason: { type: String, trim: true },
        expiresAt: { type: Date },
        updatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
        updatedAt: { type: Date }
    },
    warningHistory: [{
            type: { type: String, enum: ['14_days', '7_days', '3_days'], required: true },
            sentAt: { type: Date, default: Date.now }
        }]
}, { timestamps: true });
subscriptionSchema.index({ companyId: 1, status: 1 });
subscriptionSchema.index({ companyId: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
exports.Subscription = mongoose_1.default.model('Subscription', subscriptionSchema);
exports.default = exports.Subscription;
