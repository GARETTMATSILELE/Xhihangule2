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
exports.IndividualIncomeTaxAdjustment = exports.INCOME_TAX_ADJUSTMENT_STATUSES = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const incomeTaxTypes_1 = require("../services/tax/incomeTaxTypes");
exports.INCOME_TAX_ADJUSTMENT_STATUSES = ['PENDING', 'APPROVED', 'REVERSED'];
const IndividualIncomeTaxAdjustmentSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    taxPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['INCOME_TAX'], default: 'INCOME_TAX', required: true },
    adjustmentType: { type: String, enum: incomeTaxTypes_1.INCOME_TAX_ADJUSTMENT_TYPES, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    reason: { type: String, required: true, trim: true },
    explanation: { type: String, default: null, trim: true },
    sourceTransactionIds: { type: [String], default: [] },
    supportingDocumentIds: { type: [String], default: [] },
    ruleId: { type: String, default: null },
    ruleVersion: { type: Number, default: null },
    sourceReference: { type: String, default: null },
    status: { type: String, enum: exports.INCOME_TAX_ADJUSTMENT_STATUSES, default: 'PENDING', index: true },
    reviewStatus: { type: String, default: 'REVIEW_REQUIRED', index: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null }
}, { timestamps: true });
IndividualIncomeTaxAdjustmentSchema.index({ companyId: 1, taxPeriodKey: 1, status: 1 });
IndividualIncomeTaxAdjustmentSchema.index({ companyId: 1, taxPeriodId: 1 });
exports.IndividualIncomeTaxAdjustment = mongoose_1.default.model('IndividualIncomeTaxAdjustment', IndividualIncomeTaxAdjustmentSchema, collections_1.COLLECTIONS.INDIVIDUAL_INCOME_TAX_ADJUSTMENTS);
