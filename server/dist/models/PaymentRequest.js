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
exports.PaymentRequest = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PaymentRequestSchema = new mongoose_1.Schema({
    companyId: {
        type: String,
        required: true,
        index: true
    },
    propertyId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        required: false,
        ref: 'Property'
    },
    tenantId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Tenant'
    },
    ownerId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'PropertyOwner'
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        enum: ['USD', 'ZWL'],
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    requestDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    dueDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'rejected'],
        default: 'pending'
    },
    notes: {
        type: String
    },
    requestedBy: {
        type: String,
        required: true
    },
    requestedByUser: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User'
    },
    processedBy: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User'
    },
    processedDate: {
        type: Date
    },
    payTo: {
        name: {
            type: String,
            required: true
        },
        surname: {
            type: String,
            required: true
        },
        bankDetails: String,
        accountNumber: String,
        address: String
    },
    developmentId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Development'
    },
    developmentUnitId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'DevelopmentUnit'
    },
    reportHtml: { type: String },
    approval: {
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        approvedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
        approvedByName: { type: String },
        approvedByRole: { type: String, enum: ['principal', 'prea', 'admin'] },
        approvedAt: { type: Date },
        notes: { type: String }
    },
    readyForAccounting: { type: Boolean, default: false }
}, {
    timestamps: true
});
// Indexes for better query performance
PaymentRequestSchema.index({ companyId: 1, status: 1 });
PaymentRequestSchema.index({ companyId: 1, requestDate: -1 });
PaymentRequestSchema.index({ status: 1, dueDate: 1 });
exports.PaymentRequest = mongoose_1.default.model('PaymentRequest', PaymentRequestSchema);
