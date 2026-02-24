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
exports.JournalEntry = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const JournalEntrySchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    reference: { type: String, required: true, trim: true },
    description: { type: String, required: false },
    sourceModule: {
        type: String,
        enum: ['payment', 'expense', 'sale', 'commission', 'manual'],
        required: true
    },
    sourceId: { type: String, required: false },
    status: { type: String, enum: ['posted'], default: 'posted', immutable: true },
    transactionDate: { type: Date, required: true, index: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
JournalEntrySchema.index({ companyId: 1, transactionDate: -1 });
JournalEntrySchema.index({ companyId: 1, sourceModule: 1, transactionDate: -1 });
JournalEntrySchema.index({ companyId: 1, reference: 1 }, { unique: true });
JournalEntrySchema.index({ companyId: 1, sourceModule: 1, sourceId: 1 }, { unique: true, sparse: true });
// Journal entries are immutable and non-deletable.
JournalEntrySchema.pre('save', function (next) {
    if (!this.isNew && this.isModified()) {
        return next(new Error('Journal entries are immutable after posting.'));
    }
    return next();
});
JournalEntrySchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for journal entries.'));
});
JournalEntrySchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for journal entries.'));
});
JournalEntrySchema.pre('findOneAndDelete', function (next) {
    next(new Error('Hard delete is disabled for journal entries.'));
});
exports.JournalEntry = mongoose_1.default.model('JournalEntry', JournalEntrySchema, collections_1.COLLECTIONS.JOURNAL_ENTRIES);
