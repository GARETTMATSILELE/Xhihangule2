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
exports.AccountingException = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const AccountingExceptionSchema = new mongoose_1.Schema({
    kind: {
        type: String,
        enum: ['incomplete_projection', 'orphan_accounting'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['open', 'resolved', 'ignored'],
        required: true,
        default: 'open',
        index: true
    },
    issueType: {
        type: String,
        enum: ['missing', 'mismatched', 'orphaned'],
        required: false,
        index: true
    },
    component: { type: String, required: false },
    expected: { type: mongoose_1.Schema.Types.Mixed, required: false },
    actual: { type: mongoose_1.Schema.Types.Mixed, required: false },
    difference: { type: Number, required: false },
    issues: { type: [mongoose_1.Schema.Types.Mixed], required: false },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment', required: false, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: false },
    ledger: {
        type: String,
        enum: ['property', 'agent', 'company', 'journal', 'vat', 'deposit'],
        required: false
    },
    accountingRef: {
        collection: { type: String, required: false },
        accountId: { type: String, required: false },
        transactionId: { type: String, required: false }
    },
    missingComponents: { type: [String], required: false },
    error: { type: String, required: false },
    detectedAt: { type: Date, required: true, default: Date.now },
    lastCheckedAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date, required: false },
    resolvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    resolution: { type: String, required: false }
}, { timestamps: false });
AccountingExceptionSchema.index({ kind: 1, paymentId: 1, status: 1 });
AccountingExceptionSchema.index({ kind: 1, 'accountingRef.accountId': 1, 'accountingRef.transactionId': 1 });
AccountingExceptionSchema.index({ companyId: 1, status: 1, kind: 1, detectedAt: -1 });
exports.AccountingException = mongoose_1.default.model('AccountingException', AccountingExceptionSchema, collections_1.COLLECTIONS.ACCOUNTING_EXCEPTIONS);
