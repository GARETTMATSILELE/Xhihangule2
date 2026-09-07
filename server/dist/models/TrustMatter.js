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
exports.TrustMatter = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TrustMatterDocumentSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: [
            'AGREEMENT_OF_SALE',
            'OFFER_LETTER',
            'PROOF_OF_PAYMENT',
            'DEPOSIT_SLIP',
            'TRANSFER_DOCUMENTS',
            'CGT_CLEARANCE',
            'RATES_CLEARANCE',
            'COMMISSION_INVOICE',
            'SELLER_STATEMENT',
            'BUYER_STATEMENT',
            'TAX_CERTIFICATE',
            'OTHER_DOCUMENTS'
        ],
        required: true
    },
    label: { type: String, required: true, trim: true },
    status: {
        type: String,
        enum: ['MISSING', 'REQUESTED', 'RECEIVED', 'APPROVED', 'WAIVED'],
        default: 'MISSING'
    },
    fileId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'File', required: false },
    fileName: { type: String, required: false, trim: true },
    reference: { type: String, required: false, trim: true },
    notes: { type: String, required: false, trim: true },
    receivedAt: { type: Date, required: false },
    approvedAt: { type: Date, required: false },
    updatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    updatedAt: { type: Date, required: false }
}, { _id: false });
const TrustMatterSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true, index: true },
    trustAccountId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TrustAccount', required: true, immutable: true, unique: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, immutable: true, index: true },
    buyerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Buyer', required: false, index: true },
    sellerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    dealId: { type: String, required: false, trim: true },
    matterNumber: { type: String, required: true, trim: true, index: true },
    purchasePrice: { type: Number, required: true, default: 0, min: 0 },
    custodyType: {
        type: String,
        enum: ['AGENCY_CASH', 'AGENCY_TRUST_BANK', 'LAWYER_TRUST_ACCOUNT', 'ESCROW', 'DEVELOPER', 'OTHER'],
        default: 'AGENCY_TRUST_BANK',
        index: true
    },
    custodyDetails: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['OPEN', 'SETTLED', 'CLOSED'], default: 'OPEN', index: true },
    settlementStatus: { type: String, default: 'PENDING', trim: true },
    workflowStage: {
        type: String,
        enum: [
            'TRUST_MATTER_OPENED',
            'BUYER_DEPOSIT_RECEIVED',
            'FUNDS_HELD',
            'SETTLEMENT_CALCULATED',
            'SETTLEMENT_APPROVED',
            'FUNDS_ALLOCATED',
            'SELLER_PAID',
            'TAXES_PAID',
            'TRUST_BALANCED',
            'TRUST_CLOSED'
        ],
        default: 'TRUST_MATTER_OPENED',
        index: true
    },
    dateOpened: { type: Date, required: true, default: () => new Date(), index: true },
    dateClosed: { type: Date, required: false },
    responsibleAccountant: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    responsibleAgent: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    responsiblePrincipal: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    jurisdiction: {
        country: { type: String, default: 'Zimbabwe' },
        currency: { type: String, default: 'USD' },
        trustRules: { type: String, default: 'ZW_ESTATE_AGENCY_TRUST' },
        taxRules: { type: String, default: 'ZW_DEFAULT' },
        defaultCustody: { type: String, default: 'AGENCY_TRUST_BANK' },
        vatEnabled: { type: Boolean, default: true },
        cgtEnabled: { type: Boolean, default: true },
        escrowEnabled: { type: Boolean, default: true }
    },
    documents: { type: [TrustMatterDocumentSchema], default: [] },
    reconciliationMetadata: {
        lastReconciledAt: { type: Date, required: false },
        lastReconciledBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
        notes: { type: String, required: false, trim: true }
    }
}, { timestamps: true });
TrustMatterSchema.index({ companyId: 1, matterNumber: 1 }, { unique: true });
TrustMatterSchema.index({ companyId: 1, status: 1, workflowStage: 1, createdAt: -1 });
TrustMatterSchema.index({ companyId: 1, custodyType: 1, status: 1 });
exports.TrustMatter = mongoose_1.default.model('TrustMatter', TrustMatterSchema, collections_1.COLLECTIONS.TRUST_MATTERS);
