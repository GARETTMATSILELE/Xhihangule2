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
exports.IndividualTaxPack = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const complianceTypes_1 = require("../services/tax/complianceTypes");
const IndividualTaxPackSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    taxYear: { type: Number, required: true, index: true, immutable: true },
    status: { type: String, enum: complianceTypes_1.TAX_PACK_STATUSES, default: 'GENERATED', index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    generatedAt: { type: Date, required: true, default: () => new Date() },
    generatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    supersedesPackId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'IndividualTaxPack', default: null },
    supersedeReason: { type: String, default: null, trim: true },
    accountingSummary: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    vatSummary: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    rentalTaxSummary: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    incomeTaxSummary: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    reviewSummary: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    evidenceSummary: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    paymentSummary: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    taxRuleReferences: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    sourceProjectionReferences: { type: mongoose_1.Schema.Types.Mixed, default: [] },
    readinessStatus: { type: String, default: 'IN_PROGRESS' },
    disclaimer: { type: String, required: true }
}, { timestamps: true });
IndividualTaxPackSchema.index({ companyId: 1, taxYear: 1, version: 1 }, { unique: true });
IndividualTaxPackSchema.index({ companyId: 1, taxYear: 1, status: 1 });
IndividualTaxPackSchema.pre('findOneAndUpdate', function (next) {
    next(new Error('Individual tax packs cannot be updated in place. Generate a new version.'));
});
IndividualTaxPackSchema.pre('updateOne', function (next) {
    next(new Error('Individual tax packs cannot be updated in place. Generate a new version.'));
});
IndividualTaxPackSchema.pre('updateMany', function (next) {
    next(new Error('Individual tax packs cannot be updated in place. Generate a new version.'));
});
IndividualTaxPackSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for individual tax packs.'));
});
IndividualTaxPackSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for individual tax packs.'));
});
exports.IndividualTaxPack = mongoose_1.default.model('IndividualTaxPack', IndividualTaxPackSchema, collections_1.COLLECTIONS.INDIVIDUAL_TAX_PACKS);
