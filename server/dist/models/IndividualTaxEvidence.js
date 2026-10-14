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
exports.IndividualTaxEvidence = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const complianceTypes_1 = require("../services/tax/complianceTypes");
const IndividualTaxEvidenceSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxYear: { type: Number, required: true, index: true },
    taxPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxPeriod', default: null },
    taxPeriodKey: { type: String, default: null, index: true },
    taxType: { type: String, required: true, index: true },
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true, index: true },
    documentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'File', required: true, index: true },
    documentType: { type: String, enum: complianceTypes_1.EVIDENCE_DOCUMENT_TYPES, default: 'OTHER' },
    documentStatus: { type: String, enum: complianceTypes_1.EVIDENCE_STATUSES, default: 'UPLOADED', index: true },
    description: { type: String, default: null, trim: true },
    uploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, required: true, default: () => new Date() },
    reviewStatus: { type: String, default: 'REQUIRES_REVIEW', index: true },
    reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    auditEventId: { type: String, default: null }
}, { timestamps: true });
IndividualTaxEvidenceSchema.index({ companyId: 1, taxYear: 1, taxType: 1 });
IndividualTaxEvidenceSchema.index({ companyId: 1, sourceType: 1, sourceId: 1 });
IndividualTaxEvidenceSchema.index({ companyId: 1, documentId: 1, sourceId: 1 }, { unique: true });
exports.IndividualTaxEvidence = mongoose_1.default.model('IndividualTaxEvidence', IndividualTaxEvidenceSchema, collections_1.COLLECTIONS.INDIVIDUAL_TAX_EVIDENCE);
