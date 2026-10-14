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
exports.TaxOverride = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TaxOverrideSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    field: { type: String, required: true },
    originalValue: { type: mongoose_1.Schema.Types.Mixed, required: true },
    newValue: { type: mongoose_1.Schema.Types.Mixed, required: true },
    reason: { type: String, required: true, trim: true, minlength: 1 },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, required: true, default: () => new Date() },
    approvalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    supportingDocumentId: { type: String, required: false }
}, { timestamps: true });
TaxOverrideSchema.index({ companyId: 1, entityType: 1, entityId: 1, timestamp: -1 });
TaxOverrideSchema.pre('validate', function (next) {
    if (!String(this.reason || '').trim()) {
        return next(new Error('A reason is required for every tax override'));
    }
    return next();
});
exports.TaxOverride = mongoose_1.default.model('TaxOverride', TaxOverrideSchema, collections_1.COLLECTIONS.TAX_OVERRIDES || 'taxoverrides');
