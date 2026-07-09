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
exports.Lease = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const dashboardKpiRefreshTrigger_1 = require("../services/dashboardKpiRefreshTrigger");
const LeaseSchema = new mongoose_1.Schema({
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    rentAmount: { type: Number, required: true, min: 0 },
    depositAmount: { type: Number, required: true, min: 0 },
    status: {
        type: String,
        enum: ['draft', 'pending_approval', 'active', 'expiring_soon', 'expired', 'renewed', 'terminated', 'pending_settlement', 'closed'],
        default: 'active'
    },
    companyId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        immutable: true
    },
    ownerId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        immutable: true
    },
    previousLeaseId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lease', default: null },
    successorLeaseId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lease', default: null },
    lifecycleStatusChangedAt: { type: Date, default: Date.now },
    renewalReminderDate: { type: Date },
    terminationDate: { type: Date },
    terminationReason: { type: String, default: '' },
    moveOutDate: { type: Date },
    settlementClosedAt: { type: Date },
    billingStatus: {
        type: String,
        enum: ['current', 'partially_paid', 'overdue', 'in_arrears', 'settled', 'waived'],
        default: 'current'
    },
    billingRules: {
        frequency: { type: String, enum: ['monthly'], default: 'monthly' },
        rentDueDay: { type: Number, min: 1, max: 31 },
        escalationPercent: { type: Number, default: 0, min: 0 },
        escalationFrequencyMonths: { type: Number, default: 12, min: 1 },
        nextEscalationDate: { type: Date },
        recurringLevies: { type: Number, default: 0, min: 0 },
        recurringServiceCharges: { type: Number, default: 0, min: 0 },
        prorateMoveIn: { type: Boolean, default: true }
    },
    financialSummary: {
        totalBilled: { type: Number, default: 0 },
        totalPaid: { type: Number, default: 0 },
        outstandingBalance: { type: Number, default: 0 },
        depositHeld: { type: Number, default: 0 },
        penalties: { type: Number, default: 0 },
        moveOutSettlement: { type: Number, default: 0 }
    },
    depositSettlement: {
        depositHeld: { type: Number, default: 0 },
        deductions: { type: Number, default: 0 },
        refundDue: { type: Number, default: 0 },
        notes: { type: String, default: '' },
        settledAt: { type: Date }
    },
    documentVersions: [{
            name: { type: String, required: true },
            type: {
                type: String,
                enum: ['signed_lease', 'amendment', 'renewal', 'termination_notice', 'other'],
                default: 'other'
            },
            url: { type: String, default: '' },
            uploadedAt: { type: Date, default: Date.now }
        }],
    // Additional lease details
    monthlyRent: { type: Number, default: 0, min: 0 },
    securityDeposit: { type: Number, default: 0, min: 0 },
    petDeposit: { type: Number, default: 0, min: 0 },
    isPetAllowed: { type: Boolean, default: false },
    maxOccupants: { type: Number, default: 1, min: 1 },
    isUtilitiesIncluded: { type: Boolean, default: false },
    utilitiesDetails: { type: String, default: '' },
    rentDueDay: { type: Number, default: 1, min: 1, max: 31 },
    lateFee: { type: Number, default: 0, min: 0 },
    gracePeriod: { type: Number, default: 0, min: 0 },
}, {
    timestamps: true
});
// Add index for ownerId for faster filtering
LeaseSchema.index({ ownerId: 1 });
LeaseSchema.index({ companyId: 1, propertyId: 1, startDate: 1, endDate: 1 });
LeaseSchema.index({ companyId: 1, tenantId: 1, startDate: 1 });
LeaseSchema.index({ previousLeaseId: 1 });
LeaseSchema.index({ successorLeaseId: 1 });
const resolveCompanyId = (value) => {
    if (!value)
        return null;
    if (typeof value === 'string')
        return value;
    if (typeof (value === null || value === void 0 ? void 0 : value.toString) === 'function')
        return value.toString();
    return null;
};
LeaseSchema.post('save', function () {
    (0, dashboardKpiRefreshTrigger_1.triggerDashboardKpiRefresh)(resolveCompanyId(this.companyId));
});
LeaseSchema.post('findOneAndUpdate', function (doc) {
    var _a, _b;
    const queryCompanyId = (_b = (_a = this === null || this === void 0 ? void 0 : this.getQuery) === null || _a === void 0 ? void 0 : _a.call(this)) === null || _b === void 0 ? void 0 : _b.companyId;
    (0, dashboardKpiRefreshTrigger_1.triggerDashboardKpiRefresh)(resolveCompanyId((doc === null || doc === void 0 ? void 0 : doc.companyId) || queryCompanyId));
});
exports.Lease = mongoose_1.default.model('Lease', LeaseSchema, collections_1.COLLECTIONS.LEASES);
