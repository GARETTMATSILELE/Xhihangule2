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
exports.TrustSettlement = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TrustSettlementSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    trustAccountId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TrustAccount', required: true, immutable: true, index: true, unique: true },
    salePrice: { type: Number, required: true, min: 0 },
    grossProceeds: { type: Number, required: true, min: 0 },
    deductions: [
        {
            type: { type: String, required: true },
            amount: { type: Number, required: true, min: 0 }
        }
    ],
    netPayout: { type: Number, required: true, min: 0 },
    settlementDate: { type: Date, required: true, default: () => new Date() },
    locked: { type: Boolean, required: true, default: false, index: true }
}, { timestamps: true });
TrustSettlementSchema.index({ companyId: 1, settlementDate: -1 });
exports.TrustSettlement = mongoose_1.default.model('TrustSettlement', TrustSettlementSchema, collections_1.COLLECTIONS.TRUST_SETTLEMENTS);
