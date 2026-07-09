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
exports.PlatformInvoice = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PlatformInvoiceSchema = new mongoose_1.Schema({
    invoiceNumber: { type: String, required: true, unique: true, index: true, trim: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    plan: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true, index: true },
    subscriptionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subscription', index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'ZiG', 'ZWL'], default: 'USD' },
    issueDate: { type: Date, required: true, default: Date.now, index: true },
    dueDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ['Draft', 'Issued', 'Paid', 'Overdue', 'Cancelled'], default: 'Draft', index: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'] },
    notes: { type: String, trim: true },
    sentAt: { type: Date },
    sentTo: { type: String, trim: true, lowercase: true },
    paidAt: { type: Date },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
PlatformInvoiceSchema.index({ companyId: 1, status: 1, dueDate: 1 });
PlatformInvoiceSchema.index({ status: 1, createdAt: -1 });
exports.PlatformInvoice = mongoose_1.default.model('PlatformInvoice', PlatformInvoiceSchema, 'platforminvoices');
exports.default = exports.PlatformInvoice;
