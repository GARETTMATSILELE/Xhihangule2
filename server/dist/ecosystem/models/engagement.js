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
exports.BroadcastDelivery = exports.Broadcast = exports.TenantReference = exports.Rating = exports.EcosystemDocument = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const EcosystemDocumentSchema = new mongoose_1.Schema({
    ownerUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    documentType: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    accessRoles: [{ type: String }],
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'ecosystem_documents' });
exports.EcosystemDocument = mongoose_1.default.model('EcosystemDocument', EcosystemDocumentSchema);
const RatingSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    raterUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rateeUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    contractorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceContractor', index: true },
    jobId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ContractorJobRecord', required: true, index: true },
    raterRole: { type: String, enum: ['tenant', 'owner', 'agent', 'admin'], required: true },
    quality: { type: Number, min: 1, max: 5, required: true },
    professionalism: { type: Number, min: 1, max: 5, required: true },
    timeliness: { type: Number, min: 1, max: 5, required: true },
    communication: { type: Number, min: 1, max: 5, required: true },
    overall: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'ecosystem_ratings' });
RatingSchema.index({ jobId: 1, raterUserId: 1 }, { unique: true });
exports.Rating = mongoose_1.default.model('EcosystemRating', RatingSchema);
const TenantReferenceSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    leaseId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lease', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    rentPaymentHistory: { type: String },
    outstandingBalance: { type: Number, min: 0 },
    propertyCondition: { type: String },
    maintenanceCooperation: { type: String },
    leaseCompliance: { type: String },
    communication: { type: String },
    moveOutCondition: { type: String },
    depositOutcome: { type: String },
    publicNotes: { type: String },
    privateNotes: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'tenant_references' });
TenantReferenceSchema.index({ leaseId: 1 }, { unique: true });
exports.TenantReference = mongoose_1.default.model('TenantReference', TenantReferenceSchema);
const BroadcastSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    senderId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ['NORMAL', 'IMPORTANT', 'URGENT', 'EMERGENCY'], default: 'NORMAL' },
    scope: { type: String, enum: ['TENANT', 'PROPERTY', 'BUILDING', 'PORTFOLIO', 'ALL_AGENCY_TENANTS'], required: true },
    audience: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    attachments: [{ name: { type: String }, url: { type: String }, _id: false }],
    scheduledAt: { type: Date },
    expiresAt: { type: Date },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'broadcasts' });
exports.Broadcast = mongoose_1.default.model('Broadcast', BroadcastSchema);
const BroadcastDeliverySchema = new mongoose_1.Schema({
    broadcastId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Broadcast', required: true, index: true },
    recipientUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'], default: 'QUEUED' },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'broadcast_deliveries' });
BroadcastDeliverySchema.index({ broadcastId: 1, recipientUserId: 1 }, { unique: true });
exports.BroadcastDelivery = mongoose_1.default.model('BroadcastDelivery', BroadcastDeliverySchema);
