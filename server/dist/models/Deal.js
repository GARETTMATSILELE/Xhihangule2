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
exports.Deal = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const DealSchema = new mongoose_1.Schema({
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true },
    leadId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Lead' },
    buyerName: { type: String, required: true, trim: true },
    buyerEmail: { type: String, trim: true },
    buyerPhone: { type: String, trim: true },
    stage: { type: String, enum: ['Offer', 'Due Diligence', 'Contract', 'Closing', 'Won'], default: 'Offer' },
    offerPrice: { type: Number, required: true, min: 0 },
    closeDate: { type: Date, default: null },
    won: { type: Boolean, default: false },
    notes: { type: String, default: '' },
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
    commissionPercent: { type: Number, min: 0 },
    commissionPreaPercent: { type: Number, min: 0 },
    commissionAgencyPercentRemaining: { type: Number, min: 0, max: 100 },
    commissionAgentPercentRemaining: { type: Number, min: 0, max: 100 }
}, { timestamps: true });
DealSchema.index({ companyId: 1 });
DealSchema.index({ ownerId: 1 });
DealSchema.index({ propertyId: 1 });
DealSchema.index({ companyId: 1, stage: 1 });
DealSchema.index({ companyId: 1, ownerId: 1, stage: 1 });
exports.Deal = mongoose_1.default.model('Deal', DealSchema, 'deals');
