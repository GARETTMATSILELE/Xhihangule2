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
exports.HistoricalVatRecognition = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const HistoricalVatRecognitionSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment', required: true },
    referenceNumber: { type: String, required: true },
    receiptDate: { type: Date, required: true },
    periodClass: { type: String, enum: ['before_registration', 'on_or_after_registration'], required: true },
    snapshotVatAmount: { type: Number, required: true },
    snapshotVatRate: { type: Number, required: true },
    recognitionAmount: { type: Number, required: true },
    status: { type: String, enum: ['review', 'approved', 'recognised', 'rejected'], required: true },
    physicalBookReference: { type: String, required: false },
    taxTreatmentBasis: { type: String, required: false },
    septemberTaxTreatmentApproved: { type: Boolean, default: false },
    recognitionReason: { type: String, required: false },
    blockedReason: { type: String, required: false },
    approvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    approvedAt: { type: Date, required: false },
    recognisedAt: { type: Date, required: false },
    rejectedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    rejectedAt: { type: Date, required: false },
    journalEntryId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'JournalEntry', required: false },
    taxObligationId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxObligation', required: false }
}, { timestamps: true, collection: 'historicalvatrecognitions' });
HistoricalVatRecognitionSchema.index({ companyId: 1, paymentId: 1 }, { unique: true });
exports.HistoricalVatRecognition = mongoose_1.default.model('HistoricalVatRecognition', HistoricalVatRecognitionSchema);
