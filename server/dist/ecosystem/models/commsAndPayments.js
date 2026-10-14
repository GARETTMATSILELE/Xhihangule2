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
exports.EcosystemPaymentIntent = exports.NotificationDelivery = exports.CommunicationPreference = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const CommunicationPreferenceSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    emailAvailable: { type: Boolean, default: true },
    smsAvailable: { type: Boolean, default: false },
    whatsappAvailable: { type: Boolean, default: false },
    inAppAvailable: { type: Boolean, default: true },
    emailOperational: { type: Boolean, default: true },
    smsOperational: { type: Boolean, default: true },
    whatsappOperational: { type: Boolean, default: true },
    emailMarketing: { type: Boolean, default: false },
    smsMarketing: { type: Boolean, default: false },
    whatsappMarketing: { type: Boolean, default: false },
    phone: { type: String },
    whatsappNumber: { type: String },
}, { timestamps: true, collection: 'communication_preferences' });
exports.CommunicationPreference = mongoose_1.default.model('CommunicationPreference', CommunicationPreferenceSchema);
const NotificationDeliverySchema = new mongoose_1.Schema({
    notificationId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Notification', index: true },
    recipientId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventType: { type: String, required: true, index: true },
    channel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'], required: true, index: true },
    status: { type: String, enum: ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'], default: 'QUEUED', index: true },
    provider: { type: String },
    providerMessageId: { type: String, index: true },
    templateName: { type: String },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
}, { timestamps: true, collection: 'notification_deliveries' });
exports.NotificationDelivery = mongoose_1.default.model('NotificationDelivery', NotificationDeliverySchema);
const EcosystemPaymentIntentSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    tenantUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant' },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true },
    leaseId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lease' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    provider: { type: String, default: 'stub' },
    status: {
        type: String,
        enum: ['pending', 'provider_created', 'paid', 'failed', 'cancelled', 'expired', 'reconciled'],
        default: 'pending',
        index: true,
    },
    idempotencyKey: { type: String, required: true, unique: true },
    providerRef: { type: String, index: true },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment' },
    rawProviderResponse: { type: mongoose_1.Schema.Types.Mixed },
}, { timestamps: true, collection: 'ecosystem_payment_intents' });
exports.EcosystemPaymentIntent = mongoose_1.default.model('EcosystemPaymentIntent', EcosystemPaymentIntentSchema);
