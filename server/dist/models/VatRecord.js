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
exports.VatRecord = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const VatRecordSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    transactionId: { type: String, required: true },
    sourceType: { type: String, required: true },
    vatCollected: { type: Number, default: 0, min: 0 },
    vatPaid: { type: Number, default: 0, min: 0 },
    vatRate: { type: Number, default: 0, min: 0 },
    filingPeriod: { type: String, required: true },
    status: { type: String, enum: ['pending', 'submitted'], default: 'pending' }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
VatRecordSchema.index({ companyId: 1, filingPeriod: 1 });
VatRecordSchema.index({ companyId: 1, status: 1 });
VatRecordSchema.index({ companyId: 1, transactionId: 1, sourceType: 1 }, { unique: true });
exports.VatRecord = mongoose_1.default.model('VatRecord', VatRecordSchema, collections_1.COLLECTIONS.VAT_RECORDS);
