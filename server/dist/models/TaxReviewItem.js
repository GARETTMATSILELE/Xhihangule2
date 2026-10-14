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
exports.TaxReviewItem = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TaxReviewItemSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    kind: { type: String, required: true, index: true },
    status: {
        type: String,
        enum: ['open', 'resolved', 'ignored', 'OPEN', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'CORRECTED_MANUALLY', 'NO_ACTION_REQUIRED'],
        default: 'OPEN',
        index: true
    },
    title: { type: String, required: true },
    detail: { type: String, required: false },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment', required: false, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: false },
    trustAccountId: { type: mongoose_1.Schema.Types.ObjectId, required: false },
    taxObligationId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxObligation', required: false },
    metadata: { type: mongoose_1.Schema.Types.Mixed, required: false },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: false, default: 'MEDIUM' },
    currentAmount: { type: Number, required: false },
    expectedBasis: { type: String, required: false },
    detectedAt: { type: Date, required: true, default: () => new Date() },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    resolution: { type: String }
}, { timestamps: true });
TaxReviewItemSchema.index({ companyId: 1, status: 1, kind: 1, detectedAt: -1 });
TaxReviewItemSchema.index({ companyId: 1, kind: 1, paymentId: 1, taxObligationId: 1 }, { unique: true, sparse: true });
exports.TaxReviewItem = mongoose_1.default.model('TaxReviewItem', TaxReviewItemSchema, collections_1.COLLECTIONS.TAX_REVIEW_ITEMS || 'taxreviewitems');
