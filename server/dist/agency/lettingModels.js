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
exports.AgencyWorkflowEvent = exports.ListingReference = exports.RentalMandate = exports.PropertyAssessment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const assessmentSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    agentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    assessmentDate: { type: Date, required: true },
    recommendedRent: { type: Number, required: true, min: 0 },
    approvedRent: { type: Number, min: 0 },
    condition: { type: String },
    marketObservations: { type: String },
    ownerRecommendation: { type: String },
    notes: { type: String },
    status: { type: String, enum: ['ASSESSMENT_DRAFT', 'ASSESSMENT_SUBMITTED', 'OWNER_APPROVED', 'OWNER_REJECTED'], default: 'ASSESSMENT_DRAFT' },
    decidedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionComment: { type: String },
}, { timestamps: true, collection: 'property_assessments' });
exports.PropertyAssessment = mongoose_1.default.model('PropertyAssessment', assessmentSchema);
const mandateSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'PropertyOwner' },
    status: { type: String, enum: ['DRAFT', 'SENT', 'SIGNED', 'DECLINED', 'EXPIRED'], default: 'DRAFT' },
    agreedRent: { type: Number, min: 0 },
    documentUrl: { type: String },
    signedAt: { type: Date },
    notes: { type: String },
}, { timestamps: true, collection: 'rental_mandates' });
exports.RentalMandate = mongoose_1.default.model('RentalMandate', mandateSchema);
const listingSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    platform: { type: String, required: true },
    reference: { type: String },
    url: { type: String },
    status: { type: String, enum: ['PRE_LISTING', 'ACTIVE', 'REMOVED'], default: 'PRE_LISTING' },
    listedAt: { type: Date },
    removedAt: { type: Date },
    listedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    lastVerifiedAt: { type: Date },
    notes: { type: String },
}, { timestamps: true, collection: 'listing_references' });
exports.ListingReference = mongoose_1.default.model('ListingReference', listingSchema);
const auditSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', index: true },
    actorId: { type: mongoose_1.Schema.Types.ObjectId },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    previousState: { type: String },
    newState: { type: String },
    reason: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'agency_workflow_events' });
exports.AgencyWorkflowEvent = mongoose_1.default.model('AgencyWorkflowEvent', auditSchema);
