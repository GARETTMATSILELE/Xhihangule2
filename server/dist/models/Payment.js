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
exports.Payment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const PaymentSchema = new mongoose_1.Schema({
    paymentType: {
        type: String,
        enum: ['introduction', 'rental'],
        required: true,
    },
    propertyType: {
        type: String,
        enum: ['residential', 'commercial'],
        required: true,
    },
    propertyId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Property',
        required: true,
    },
    tenantId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
    },
    agentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
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
        required: false,
        immutable: true
    },
    paymentDate: {
        type: Date,
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'credit_card', 'mobile_money'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    depositAmount: {
        type: Number,
        required: false,
        default: 0,
    },
    referenceNumber: {
        type: String,
        required: false,
        default: '',
    },
    // Add rental period fields
    rentalPeriodMonth: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
    },
    rentalPeriodYear: {
        type: Number,
        required: true,
    },
    // Advance payment fields
    advanceMonthsPaid: {
        type: Number,
        required: false,
        min: 1,
        default: 1,
    },
    advancePeriodStart: {
        month: { type: Number, min: 1, max: 12 },
        year: { type: Number },
    },
    advancePeriodEnd: {
        month: { type: Number, min: 1, max: 12 },
        year: { type: Number },
    },
    rentUsed: {
        type: Number,
        required: false,
    },
    notes: {
        type: String,
    },
    processedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    commissionDetails: {
        totalCommission: {
            type: Number,
            required: true,
        },
        preaFee: {
            type: Number,
            required: true,
        },
        agentShare: {
            type: Number,
            required: true,
        },
        agencyShare: {
            type: Number,
            required: true,
        },
        ownerAmount: {
            type: Number,
            required: true,
        },
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending',
    },
    currency: {
        type: String,
        enum: ['USD', 'ZWL'],
        default: 'USD',
    },
    leaseId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Lease',
    },
    recipientId: {
        type: mongoose_1.Schema.Types.Mixed, // ObjectId or string
        required: false,
    },
    recipientType: {
        type: String,
        required: false,
    },
    reason: {
        type: String,
        required: false,
    },
}, {
    timestamps: true
});
// Add indexes for common queries
PaymentSchema.index({ companyId: 1, paymentDate: -1 });
PaymentSchema.index({ propertyId: 1 });
PaymentSchema.index({ tenantId: 1 });
PaymentSchema.index({ agentId: 1 });
PaymentSchema.index({ status: 1 });
exports.Payment = mongoose_1.default.model('Payment', PaymentSchema, collections_1.COLLECTIONS.PAYMENTS);
