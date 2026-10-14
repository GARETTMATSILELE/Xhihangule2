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
exports.MaintenanceQuote = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const MaintenanceQuoteSchema = new mongoose_1.Schema({
    requestId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    contractorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceContractor', index: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    fileUrl: { type: String },
    fileName: { type: String },
    submittedDate: { type: Date, default: Date.now },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', index: true },
    submittedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    lineItems: [{
            description: { type: String, required: true },
            quantity: { type: Number, required: true, min: 0 },
            unitCost: { type: Number, required: true, min: 0 },
            total: { type: Number, required: true, min: 0 },
            _id: false
        }],
    subtotal: { type: Number, min: 0 },
    tax: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0 },
    currency: { type: String, default: 'USD' },
    estimatedDuration: { type: String },
    estimatedStartDate: { type: Date },
    validUntil: { type: Date },
    attachments: [{ name: { type: String }, url: { type: String }, _id: false }],
    notes: { type: String },
    status: {
        type: String,
        enum: ['DRAFT', 'INVITED', 'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'SELECTED', 'SENT_TO_OWNER', 'OWNER_APPROVED', 'OWNER_DECLINED', 'EXPIRED', 'WITHDRAWN'],
        default: 'SUBMITTED',
        index: true
    },
    version: { type: Number, default: 1, min: 1 },
    parentQuoteId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceQuote' },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    approvedAt: { type: Date },
    declinedAt: { type: Date },
}, { timestamps: true, collection: 'maintenance_quotes' });
exports.MaintenanceQuote = mongoose_1.default.model('MaintenanceQuote', MaintenanceQuoteSchema);
