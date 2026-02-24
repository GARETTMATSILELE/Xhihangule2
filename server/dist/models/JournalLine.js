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
exports.JournalLine = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const JournalLineSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    journalEntryId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
    accountId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ChartOfAccount', required: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    runningBalanceSnapshot: { type: Number, required: true, default: 0 },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: false },
    agentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
JournalLineSchema.index({ companyId: 1, accountId: 1, createdAt: -1 });
JournalLineSchema.index({ companyId: 1, journalEntryId: 1 });
JournalLineSchema.pre('validate', function (next) {
    const debit = Number(this.debit || 0);
    const credit = Number(this.credit || 0);
    if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) {
        return next(new Error('Each journal line must have either debit or credit.'));
    }
    return next();
});
exports.JournalLine = mongoose_1.default.model('JournalLine', JournalLineSchema, collections_1.COLLECTIONS.JOURNAL_LINES);
