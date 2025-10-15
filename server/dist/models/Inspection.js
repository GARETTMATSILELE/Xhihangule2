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
exports.Inspection = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const InspectionSchema = new mongoose_1.Schema({
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant' },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    scheduledDate: { type: Date, required: true },
    nextInspectionDate: { type: Date },
    notes: { type: String, default: '' },
    frequency: { type: String, enum: ['quarterly', 'ad_hoc'], default: 'quarterly' },
    report: {
        conditionSummary: { type: String, default: '' },
        issuesFound: { type: String, default: '' },
        actionsRequired: { type: String, default: '' },
        inspectorName: { type: String, default: '' },
        inspectedAt: { type: Date },
    },
    attachments: [
        {
            fileName: { type: String, required: true },
            fileType: { type: String, required: true },
            fileUrl: { type: String, required: true },
            uploadedAt: { type: Date, default: () => new Date() },
            uploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true }
        }
    ],
}, { timestamps: true });
InspectionSchema.index({ ownerId: 1 });
InspectionSchema.index({ companyId: 1 });
InspectionSchema.index({ propertyId: 1, scheduledDate: -1 });
InspectionSchema.index({ nextInspectionDate: 1 });
exports.Inspection = mongoose_1.default.model('Inspection', InspectionSchema, collections_1.COLLECTIONS.INSPECTIONS || 'inspections');
