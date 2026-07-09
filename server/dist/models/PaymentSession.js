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
exports.PaymentSession = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PaymentSessionSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    subscriptionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subscription', required: false, index: true },
    onboardingSessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'OnboardingSession', required: false, index: true },
    billingPaymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BillingPayment', required: false, index: true },
    idempotencyKey: { type: String, required: true, trim: true, index: true },
    provider: { type: String, enum: ['paynow', 'cash', 'manual'], required: true, index: true },
    providerRef: { type: String, trim: true, index: true },
    pollUrl: { type: String, trim: true },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'ZWL'], default: 'USD' },
    status: {
        type: String,
        enum: ['pending', 'provider_created', 'paid', 'failed', 'cancelled', 'expired', 'reconciled'],
        default: 'pending',
        index: true
    },
    paidAt: { type: Date },
    failedAt: { type: Date },
    lastWebhookEventId: { type: String, trim: true },
    rawProviderResponse: { type: mongoose_1.Schema.Types.Mixed },
    metadata: { type: mongoose_1.Schema.Types.Mixed }
}, { timestamps: true });
PaymentSessionSchema.index({ idempotencyKey: 1 }, { unique: true });
PaymentSessionSchema.index({ provider: 1, providerRef: 1 }, { sparse: true });
PaymentSessionSchema.index({ companyId: 1, status: 1, createdAt: -1 });
exports.PaymentSession = mongoose_1.default.model('PaymentSession', PaymentSessionSchema, 'payment_sessions');
exports.default = exports.PaymentSession;
