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
exports.TaxPeriod = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const taxMetadataTypes_1 = require("../services/tax/taxMetadataTypes");
const TaxPeriodSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    taxType: { type: String, enum: taxMetadataTypes_1.TAX_PERIOD_TAX_TYPES, required: true, index: true },
    periodKey: { type: String, required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: taxMetadataTypes_1.TAX_PERIOD_STATUSES, default: 'OPEN', index: true },
    currency: { type: String, default: 'USD', trim: true },
    openedAt: { type: Date, required: true, default: () => new Date() },
    openedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true },
    accountingPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AccountingPeriod', default: null }
}, { timestamps: true });
TaxPeriodSchema.index({ companyId: 1, taxType: 1, periodKey: 1 }, { unique: true });
TaxPeriodSchema.index({ companyId: 1, taxType: 1, periodStart: 1, periodEnd: 1 });
TaxPeriodSchema.index({ companyId: 1, status: 1, periodStart: -1 });
exports.TaxPeriod = mongoose_1.default.model('TaxPeriod', TaxPeriodSchema, collections_1.COLLECTIONS.TAX_PERIODS);
