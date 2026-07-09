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
exports.CashPayment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const CashPaymentSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    subscriptionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subscription', index: true },
    billingPaymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BillingPayment', index: true },
    paymentSessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'PaymentSession', index: true },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true, default: 'monthly' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'ZiG', 'ZWL'], default: 'USD' },
    method: { type: String, enum: ['Cash', 'EcoCash', 'ZIPIT', 'Bank Transfer', 'Innbucks', 'Mukuru'], required: true, index: true },
    referenceNumber: { type: String, trim: true, index: true },
    proofOfPayment: { type: String, trim: true },
    proofFileName: { type: String, trim: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'More Info Requested'], default: 'Pending', index: true },
    submittedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date, default: Date.now, index: true },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    moreInfoRequestedAt: { type: Date },
    notes: { type: String, trim: true },
    adminNotes: { type: String, trim: true }
}, { timestamps: true });
CashPaymentSchema.index({ companyId: 1, status: 1, submittedAt: -1 });
CashPaymentSchema.index({ status: 1, submittedAt: -1 });
exports.CashPayment = mongoose_1.default.model('CashPayment', CashPaymentSchema, 'cashpayments');
exports.default = exports.CashPayment;
