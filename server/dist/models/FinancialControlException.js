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
exports.FinancialControlException = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const FinancialControlExceptionSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    type: { type: String, required: true, index: true },
    severity: {
        type: String,
        enum: ['INFO', 'WARNING', 'HIGH', 'CRITICAL'],
        required: true,
        default: 'WARNING'
    },
    status: {
        type: String,
        enum: ['OPEN', 'UNDER_REVIEW', 'EXPLAINED', 'RESOLVED', 'WAIVED'],
        required: true,
        default: 'OPEN',
        index: true
    },
    entityType: { type: String, required: false },
    entityId: { type: String, required: false },
    description: { type: String, required: true },
    expected: { type: mongoose_1.Schema.Types.Mixed, required: false },
    actual: { type: mongoose_1.Schema.Types.Mixed, required: false },
    difference: { type: Number, required: false },
    currency: { type: String, required: false, default: 'USD' },
    detectedAt: { type: Date, required: true, default: Date.now },
    detectedBy: { type: String, required: false },
    assignedTo: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    reviewedAt: { type: Date, required: false },
    resolution: { type: String, required: false },
    resolutionReason: { type: String, required: false }
}, { timestamps: false });
FinancialControlExceptionSchema.index({ companyId: 1, status: 1, type: 1, detectedAt: -1 });
FinancialControlExceptionSchema.index({ companyId: 1, type: 1, entityType: 1, entityId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'UNDER_REVIEW'] } } });
FinancialControlExceptionSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for financial control exceptions.'));
});
FinancialControlExceptionSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for financial control exceptions.'));
});
FinancialControlExceptionSchema.pre('findOneAndDelete', function (next) {
    next(new Error('Hard delete is disabled for financial control exceptions.'));
});
exports.FinancialControlException = mongoose_1.default.model('FinancialControlException', FinancialControlExceptionSchema, collections_1.COLLECTIONS.FINANCIAL_CONTROL_EXCEPTIONS);
