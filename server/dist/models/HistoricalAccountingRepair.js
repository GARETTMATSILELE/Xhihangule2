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
exports.HistoricalAccountingRepair = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const HistoricalAccountingRepairSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    referenceNumber: { type: String, required: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: false },
    classification: { type: String, required: true },
    fingerprint: { type: String, required: true },
    originalState: { type: mongoose_1.Schema.Types.Mixed, required: true },
    expectedState: { type: mongoose_1.Schema.Types.Mixed, required: true },
    recordsCreated: { type: [String], default: [] },
    amountsPosted: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    reason: { type: String, required: true },
    authorisedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    result: { type: String, enum: ['posted', 'aborted', 'failed'], required: true },
    verification: { type: String, required: true }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'historicalaccountingrepairs' });
exports.HistoricalAccountingRepair = mongoose_1.default.model('HistoricalAccountingRepair', HistoricalAccountingRepairSchema);
