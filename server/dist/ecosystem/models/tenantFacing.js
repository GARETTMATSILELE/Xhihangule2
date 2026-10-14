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
exports.RentalApplication = exports.ViewingRequest = exports.TenantProfile = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const TenantProfileSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', index: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    idNumber: { type: String, trim: true },
    passportNumber: { type: String, trim: true },
    address: { type: String },
    employmentStatus: { type: String },
    employer: { type: String },
    emergencyContactName: { type: String },
    emergencyContactPhone: { type: String },
    householdSize: { type: Number, min: 1 },
    pets: { type: String },
    rentalPreferences: { type: String },
    preferredLocations: [{ type: String }],
    previousRentalInfo: { type: String },
    documents: [{ type: { type: String }, url: { type: String }, name: { type: String }, _id: false }],
    profileCompletionPercent: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true, collection: 'tenant_profiles' });
exports.TenantProfile = mongoose_1.default.model('TenantProfile', TenantProfileSchema);
const ViewingRequestSchema = new mongoose_1.Schema({
    tenantUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    requestedDate: { type: Date, required: true },
    preferredTime: { type: String },
    attendees: { type: Number, min: 1, default: 1 },
    message: { type: String },
    status: {
        type: String,
        enum: ['REQUESTED', 'UNDER_REVIEW', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'DECLINED'],
        default: 'REQUESTED',
        index: true,
    },
    agentNotes: { type: String },
    proposedDate: { type: Date },
}, { timestamps: true, collection: 'viewing_requests' });
ViewingRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 });
exports.ViewingRequest = mongoose_1.default.model('ViewingRequest', ViewingRequestSchema);
const RentalApplicationSchema = new mongoose_1.Schema({
    tenantUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'PropertyOwner' },
    status: {
        type: String,
        enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'SENT_TO_OWNER', 'OWNER_APPROVED', 'OWNER_DECLINED', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'LEASE_PREPARATION', 'LEASE_SIGNED'],
        default: 'DRAFT',
        index: true,
    },
    notes: { type: String },
    agentNotes: { type: String },
    submittedAt: { type: Date },
    snapshot: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    documents: [{ type: { type: String }, url: { type: String }, name: { type: String }, _id: false }],
    statusHistory: [{
            status: { type: String, required: true },
            at: { type: Date, default: Date.now },
            by: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            note: { type: String },
            _id: false,
        }],
}, { timestamps: true, collection: 'rental_applications' });
RentalApplicationSchema.index({ companyId: 1, propertyId: 1, tenantUserId: 1 });
exports.RentalApplication = mongoose_1.default.model('RentalApplication', RentalApplicationSchema);
