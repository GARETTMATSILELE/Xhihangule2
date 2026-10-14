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
exports.MaintenanceChangeOrder = exports.ContractorJobRecord = exports.OwnerQuoteDecision = exports.QuoteInvitation = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const QuoteInvitationSchema = new mongoose_1.Schema({
    requestId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true },
    contractorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceContractor', required: true, index: true },
    invitedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    scopeSnapshot: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['INVITED', 'SUBMITTED', 'WITHDRAWN'], default: 'INVITED', index: true },
}, { timestamps: true, collection: 'quote_invitations' });
QuoteInvitationSchema.index({ requestId: 1, contractorId: 1 }, { unique: true });
exports.QuoteInvitation = mongoose_1.default.model('QuoteInvitation', QuoteInvitationSchema);
const OwnerQuoteDecisionSchema = new mongoose_1.Schema({
    requestId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    quoteId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceQuote', required: true, index: true },
    quoteVersion: { type: Number, required: true, min: 1 },
    ownerUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    decision: {
        type: String,
        enum: ['APPROVE', 'DECLINE', 'REQUEST_CHANGES', 'REQUEST_ANOTHER_QUOTE'],
        required: true,
    },
    comment: { type: String },
    decidedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'owner_quote_decisions' });
OwnerQuoteDecisionSchema.index({ quoteId: 1, quoteVersion: 1, ownerUserId: 1 }, { unique: true });
exports.OwnerQuoteDecision = mongoose_1.default.model('OwnerQuoteDecision', OwnerQuoteDecisionSchema);
const ContractorJobRecordSchema = new mongoose_1.Schema({
    requestId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true },
    contractorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceContractor', required: true, index: true },
    quoteId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceQuote' },
    ownerApprovalId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'OwnerQuoteDecision' },
    authorisedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    authorisedAt: { type: Date },
    status: {
        type: String,
        enum: ['INVITED', 'QUOTE_REQUESTED', 'QUOTE_SUBMITTED', 'SELECTED', 'AUTHORISED', 'ACCEPTED', 'SCHEDULED', 'WORK_IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'CLOSED'],
        default: 'INVITED',
        index: true,
    },
    scheduledAt: { type: Date },
    completionNotes: { type: String },
    completionPhotos: [{ url: { type: String }, name: { type: String }, _id: false }],
    actualCompletionDate: { type: Date },
    materialsUsed: { type: String },
    additionalCosts: { type: Number, min: 0, default: 0 },
    invoiceUrl: { type: String },
}, { timestamps: true, collection: 'contractor_job_records' });
ContractorJobRecordSchema.index({ requestId: 1, contractorId: 1 });
exports.ContractorJobRecord = mongoose_1.default.model('ContractorJobRecord', ContractorJobRecordSchema);
const MaintenanceChangeOrderSchema = new mongoose_1.Schema({
    requestId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    jobId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ContractorJobRecord', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    originalQuoteId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceQuote', required: true },
    requestedAmount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: ['REQUESTED', 'AGENT_REVIEW', 'OWNER_APPROVED', 'OWNER_DECLINED'],
        default: 'REQUESTED',
        index: true,
    },
    agentReviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    ownerDecision: { type: String },
    ownerDecidedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, collection: 'maintenance_change_orders' });
exports.MaintenanceChangeOrder = mongoose_1.default.model('MaintenanceChangeOrder', MaintenanceChangeOrderSchema);
