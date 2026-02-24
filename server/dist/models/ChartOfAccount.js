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
exports.ChartOfAccount = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const ChartOfAccountSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: ['revenue', 'expense', 'asset', 'liability', 'equity'],
        required: true
    },
    parentAccountId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ChartOfAccount', required: false },
    balance: { type: Number, default: 0 },
    currency: { type: String, enum: ['USD', 'ZWL'], default: 'USD' },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, required: false }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });
ChartOfAccountSchema.index({ companyId: 1, code: 1 }, { unique: true });
ChartOfAccountSchema.index({ companyId: 1, type: 1 });
ChartOfAccountSchema.index({ companyId: 1, parentAccountId: 1 });
// Prevent hard deletes to keep auditability.
ChartOfAccountSchema.pre('deleteOne', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for chart of accounts. Use soft delete.'));
});
ChartOfAccountSchema.pre('deleteMany', { document: false, query: true }, function (next) {
    next(new Error('Hard delete is disabled for chart of accounts. Use soft delete.'));
});
ChartOfAccountSchema.pre('findOneAndDelete', function (next) {
    next(new Error('Hard delete is disabled for chart of accounts. Use soft delete.'));
});
exports.ChartOfAccount = mongoose_1.default.model('ChartOfAccount', ChartOfAccountSchema, collections_1.COLLECTIONS.CHART_OF_ACCOUNTS);
