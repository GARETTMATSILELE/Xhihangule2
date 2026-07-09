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
exports.OnboardingSession = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const OnboardingSessionSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    subscriptionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subscription', required: false, index: true },
    paymentSessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'PaymentSession', required: false, index: true },
    idempotencyKey: { type: String, required: true, trim: true, index: true },
    status: {
        type: String,
        enum: ['PENDING_SETUP', 'PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'INITIALIZING_WORKSPACE', 'ACTIVE', 'FAILED_SETUP', 'SUSPENDED'],
        default: 'PENDING_SETUP',
        index: true
    },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    companyType: { type: String, enum: ['INDIVIDUAL_LANDLORD', 'REGISTERED_BUSINESS'], required: true },
    workspaceType: { type: String, enum: ['agency', 'individual'], default: 'agency', index: true },
    currentStep: { type: String, required: false, index: true },
    retryCount: { type: Number, default: 0, min: 0 },
    lastError: { type: String, required: false },
    metadata: { type: mongoose_1.Schema.Types.Mixed, required: false },
    completedAt: { type: Date, required: false }
}, { timestamps: true });
OnboardingSessionSchema.index({ idempotencyKey: 1 }, { unique: true });
OnboardingSessionSchema.index({ companyId: 1, status: 1 });
exports.OnboardingSession = mongoose_1.default.model('OnboardingSession', OnboardingSessionSchema, 'onboarding_sessions');
exports.default = exports.OnboardingSession;
