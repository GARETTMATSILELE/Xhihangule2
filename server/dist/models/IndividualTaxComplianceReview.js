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
exports.IndividualTaxComplianceReview = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const complianceTypes_1 = require("../services/tax/complianceTypes");
const IndividualTaxComplianceReviewSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxYear: { type: Number, required: true, index: true },
    taxPeriodKey: { type: String, default: null, index: true },
    taxType: { type: String, required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', default: null },
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true },
    issueType: { type: String, enum: complianceTypes_1.COMPLIANCE_ISSUE_TYPES, required: true },
    severity: { type: String, enum: complianceTypes_1.COMPLIANCE_SEVERITIES, default: 'WARNING' },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: complianceTypes_1.COMPLIANCE_REVIEW_STATUSES, default: 'OPEN', index: true },
    assignedTo: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    decision: { type: String, default: null, trim: true },
    comment: { type: String, default: null, trim: true },
    evidenceId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'IndividualTaxEvidence', default: null },
    waiverReason: { type: String, default: null, trim: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null }
}, { timestamps: true });
IndividualTaxComplianceReviewSchema.index({ companyId: 1, taxYear: 1, status: 1 });
IndividualTaxComplianceReviewSchema.index({ companyId: 1, sourceType: 1, sourceId: 1 });
IndividualTaxComplianceReviewSchema.index({ companyId: 1, taxYear: 1, taxType: 1, sourceType: 1, sourceId: 1, issueType: 1 }, { unique: true });
IndividualTaxComplianceReviewSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for tax compliance reviews.'));
});
IndividualTaxComplianceReviewSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for tax compliance reviews.'));
});
exports.IndividualTaxComplianceReview = mongoose_1.default.model('IndividualTaxComplianceReview', IndividualTaxComplianceReviewSchema, collections_1.COLLECTIONS.INDIVIDUAL_TAX_COMPLIANCE_REVIEWS);
