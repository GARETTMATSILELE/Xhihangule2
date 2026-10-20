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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Payment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const dashboardKpiRefreshTrigger_1 = require("../services/dashboardKpiRefreshTrigger");
const paymentFinancialImmutability_1 = require("../services/paymentFinancialImmutability");
const PaymentSchema = new mongoose_1.Schema({
    paymentType: {
        type: String,
        enum: ['sale', 'rental', 'introduction'],
        required: true,
    },
    transactionDomain: {
        type: String,
        enum: ['RENTAL', 'SALE'],
        required: false,
        immutable: true
    },
    saleMode: {
        type: String,
        enum: ['quick', 'installment'],
        required: false,
        default: 'quick'
    },
    propertyType: {
        type: String,
        enum: ['residential', 'commercial'],
        required: true,
    },
    propertyId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Property',
        required: function requiredProperty() {
            if (this.paymentType === 'sale' && (this.developmentId || this.developmentUnitId))
                return false;
            return true;
        },
    },
    tenantId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: function requiredTenant() {
            return this.paymentType !== 'sale';
        },
    },
    agentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    companyId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        immutable: true
    },
    ownerId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        immutable: true
    },
    paymentDate: {
        type: Date,
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'credit_card', 'mobile_money', 'online_payment', 'other'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    depositAmount: {
        type: Number,
        required: false,
        default: 0,
    },
    referenceNumber: {
        type: String,
        required: false,
        default: '',
    },
    // Add rental period fields
    rentalPeriodMonth: {
        type: Number,
        required: function () { return this.paymentType === 'rental'; },
        min: 1,
        max: 12,
    },
    rentalPeriodYear: {
        type: Number,
        required: function () { return this.paymentType === 'rental'; },
    },
    // Advance payment fields
    advanceMonthsPaid: {
        type: Number,
        required: false,
        min: 1,
        default: 1,
    },
    advancePeriodStart: {
        month: { type: Number, min: 1, max: 12 },
        year: { type: Number },
    },
    advancePeriodEnd: {
        month: { type: Number, min: 1, max: 12 },
        year: { type: Number },
    },
    rentUsed: {
        type: Number,
        required: false,
    },
    rentAllocated: {
        type: Number,
        required: false,
    },
    levyAllocated: {
        type: Number,
        required: false,
    },
    levyUsed: {
        type: Number,
        required: false,
    },
    linkedLevyPaymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'LevyPayment',
        required: false,
    },
    chargeTypeCode: {
        type: String,
        required: false,
        uppercase: true,
        trim: true
    },
    paymentLines: [{
            chargeTypeCode: {
                type: String,
                required: true,
                uppercase: true,
                trim: true
            },
            chargeTypeId: {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'ChargeType',
                required: false
            },
            amount: {
                type: Number,
                required: true,
                min: 0
            },
            description: {
                type: String,
                required: false
            },
            referenceId: {
                type: String,
                required: false
            },
            metadata: {
                type: mongoose_1.Schema.Types.Mixed,
                required: false
            }
        }],
    notes: {
        type: String,
    },
    processedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    commissionDetails: {
        totalCommission: {
            type: Number,
            required: true,
        },
        preaFee: {
            type: Number,
            required: true,
        },
        agentShare: {
            type: Number,
            required: true,
        },
        agencyShare: {
            type: Number,
            required: true,
        },
        vatOnCommission: {
            type: Number,
            required: false,
            default: 0,
        },
        ownerAmount: {
            type: Number,
            required: true,
        },
        levy: { type: Number, required: false, default: 0 },
        commissionBase: { type: Number, required: false },
        commissionRate: { type: Number, required: false },
        commissionGross: { type: Number, required: false },
        commissionNet: { type: Number, required: false },
        vatTreatment: { type: String, enum: ['inclusive', 'exclusive'], required: false },
        vatRate: { type: Number, required: false, min: 0, max: 1 },
        vatAmount: { type: Number, required: false, default: 0 },
        vatJurisdiction: { type: String, required: false },
        vatRuleId: { type: String, required: false },
        vatTaxPoint: { type: Date, required: false },
        vatDecision: {
            registrationStatus: { type: Boolean, required: false },
            registrationEffectiveDate: { type: Date, required: false },
            registrationCancelledAt: { type: Date, required: false },
            taxClassification: { type: String, required: false },
            centralVatRate: { type: Number, required: false },
            taxRateEffectiveDate: { type: Date, required: false },
            propertyVatApplicable: { type: Boolean, required: false },
            treatment: { type: String, enum: ['inclusive', 'exclusive', 'none'], required: false },
            commissionBase: { type: Number, required: false },
            vatAmount: { type: Number, required: false },
            reason: { type: String, required: false }
        },
        agentSplit: {
            ownerAgentShare: { type: Number, required: false, default: 0 },
            collaboratorAgentShare: { type: Number, required: false, default: 0 },
            ownerUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
            collaboratorUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
            splitPercentOwner: { type: Number, required: false, min: 0, max: 100 },
            splitPercentCollaborator: { type: Number, required: false, min: 0, max: 100 },
        },
        paymentAllocation: {
            grossAmount: { type: Number, required: false },
            rent: { type: Number, required: false },
            levy: { type: Number, required: false },
            commissionBase: { type: Number, required: false },
            commission: { type: Number, required: false },
            commissionNet: { type: Number, required: false },
            vatOnCommission: { type: Number, required: false },
            otherDeductions: { type: Number, required: false },
            ownerPayable: { type: Number, required: false },
            levyPayable: { type: Number, required: false },
            companyRevenue: { type: Number, required: false },
            taxLiabilities: {
                vatOnCommission: { type: Number, required: false }
            },
            trustLiability: { type: Number, required: false },
            source: { type: String, required: false }
        }
    },
    vatIncluded: {
        type: Boolean,
        required: false,
        default: false
    },
    vatRate: {
        type: Number,
        required: false,
        min: 0,
        max: 1,
        default: 0
    },
    vatAmount: {
        type: Number,
        required: false,
        min: 0,
        default: 0
    },
    applyVatOnCommission: {
        type: Boolean,
        required: false,
        default: false
    },
    vatOnCommissionRate: {
        type: Number,
        required: false,
        min: 0,
        max: 1,
        default: 0
    },
    vatCommissionTreatment: {
        type: String,
        enum: ['inclusive', 'exclusive'],
        required: false
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'reversed', 'refunded'],
        default: 'pending',
    },
    postingStatus: {
        type: String,
        enum: ['draft', 'posted', 'reversed', 'voided'],
        default: 'draft',
        index: true,
    },
    accountingComplete: {
        type: Boolean,
        required: false,
        index: true
    },
    accountingStatus: {
        type: String,
        enum: ['pending', 'posted', 'partial', 'failed', 'not_applicable', 'incomplete'],
        required: false,
        index: true
    },
    accountingLastAttemptAt: { type: Date, required: false },
    accountingPostedAt: { type: Date, required: false },
    accountingRetryCount: { type: Number, required: false, default: undefined },
    accountingLastError: { type: String, required: false },
    accountingMissing: { type: [String], required: false },
    accountingMismatched: { type: [String], required: false },
    accountingNextAttemptAt: { type: Date, required: false },
    currency: {
        type: String,
        enum: ['USD', 'ZWL'],
        default: 'USD',
    },
    leaseId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Lease',
    },
    recipientId: {
        type: mongoose_1.Schema.Types.Mixed, // ObjectId or string
        required: false,
    },
    recipientType: {
        type: String,
        required: false,
    },
    reason: {
        type: String,
        required: false,
    },
    // Manual entry fields for properties/tenants not in database
    manualPropertyAddress: {
        type: String,
        required: false,
    },
    manualTenantName: {
        type: String,
        required: false,
    },
    buyerName: {
        type: String,
        required: false,
    },
    sellerName: {
        type: String,
        required: false,
    },
    // Provisional workflow fields
    isProvisional: {
        type: Boolean,
        default: false
    },
    isInSuspense: {
        type: Boolean,
        default: false
    },
    commissionFinalized: {
        type: Boolean,
        default: true
    },
    provisionalRelationshipType: {
        type: String,
        enum: ['unknown', 'management', 'introduction'],
        default: 'unknown'
    },
    finalizedAt: {
        type: Date,
        required: false
    },
    finalizedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    saleId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'SalesContract',
        required: false
    },
    developmentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Development',
        required: false
    },
    developmentUnitId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'DevelopmentUnit',
        required: false
    },
    trustEventEmittedAt: {
        type: Date,
        required: false
    },
    lastTrustEventSource: {
        type: String,
        required: false
    },
    externalProvider: {
        type: String,
        required: false
    },
    externalTransactionId: {
        type: String,
        required: false
    },
    idempotencyKey: {
        type: String,
        required: false,
        index: true
    },
    reversalOfPaymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Payment',
        index: true,
        required: false,
    },
    reversalPaymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Payment',
        required: false,
    },
    reversalState: {
        type: String,
        enum: ['reversal_in_progress', 'reversal_incomplete', 'reversed'],
        required: false,
    },
    reversalLockAt: {
        type: Date,
        required: false,
    },
    reversalLockBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    },
    correctedPaymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Payment',
        required: false,
    },
    reversedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    },
    reversedAt: {
        type: Date,
        required: false,
    },
    reversalReason: {
        type: String,
        required: false,
    },
    voidedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    },
    voidedAt: {
        type: Date,
        required: false,
    },
    voidReason: {
        type: String,
        required: false,
    },
    isCorrectionEntry: {
        type: Boolean,
        default: false,
        index: true,
    },
}, {
    timestamps: true
});
// Add indexes for common queries
PaymentSchema.index({ companyId: 1, paymentDate: -1 });
PaymentSchema.index({ companyId: 1, paymentType: 1, paymentDate: -1 });
// Optimize sales queries by mode and development linkage
PaymentSchema.index({ companyId: 1, paymentType: 1, saleMode: 1, developmentId: 1, paymentDate: -1 });
// Support accountant dashboard/collections where paid-to-date is grouped by saleId
PaymentSchema.index({ companyId: 1, paymentType: 1, status: 1, saleId: 1 });
// Support rental outstanding aggregation by company + period + tenant/property
PaymentSchema.index({ companyId: 1, paymentType: 1, status: 1, propertyId: 1, tenantId: 1, rentalPeriodYear: 1, rentalPeriodMonth: 1 });
// Support provisional suggestion lookups in accountant workflows
PaymentSchema.index({ companyId: 1, isProvisional: 1, createdAt: -1 });
PaymentSchema.index({ propertyId: 1 });
PaymentSchema.index({ tenantId: 1 });
PaymentSchema.index({ agentId: 1 });
PaymentSchema.index({ status: 1 });
// Add compound index for agent commission queries
PaymentSchema.index({ agentId: 1, status: 1, paymentDate: -1 });
PaymentSchema.index({ saleId: 1 });
PaymentSchema.index({ developmentId: 1 });
PaymentSchema.index({ developmentUnitId: 1 });
PaymentSchema.index({ isProvisional: 1 });
PaymentSchema.index({ reversalOfPaymentId: 1 });
PaymentSchema.index({ reversalOfPaymentId: 1 }, {
    name: 'one_full_reversal_per_payment',
    unique: true,
    partialFilterExpression: { reversalOfPaymentId: { $exists: true }, amount: { $lt: 0 } }
});
PaymentSchema.index({ companyId: 1, postingStatus: 1, paymentDate: -1 });
PaymentSchema.index({ accountingComplete: 1, accountingLastAttemptAt: 1 });
PaymentSchema.index({ accountingStatus: 1, accountingNextAttemptAt: 1 });
PaymentSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } });
PaymentSchema.index({ companyId: 1, externalProvider: 1, externalTransactionId: 1 }, {
    unique: true,
    partialFilterExpression: {
        externalProvider: { $exists: true, $type: 'string', $gt: '' },
        externalTransactionId: { $exists: true, $type: 'string', $gt: '' }
    }
});
// Ensure a payment reference cannot repeat within a company (guards manual edits/imports)
PaymentSchema.index({ companyId: 1, referenceNumber: 1 }, {
    unique: true,
    partialFilterExpression: {
        referenceNumber: { $exists: true, $type: 'string', $gt: '' }
    }
});
// Prevent history-changing bulk updates on core fields; use document.save() with workflows instead
function isIllegalPaymentUpdate(update) {
    const setOps = ['$set', '$unset'];
    const protectedKeys = new Set([
        'amount', 'paymentDate', 'paymentMethod', 'propertyId', 'tenantId', 'agentId', 'companyId',
        'referenceNumber', 'currency', 'rentalPeriodMonth', 'rentalPeriodYear', 'advanceMonthsPaid',
        'advancePeriodStart', 'advancePeriodEnd', 'processedBy', 'recipientId', 'recipientType', 'reason'
    ]);
    for (const op of setOps) {
        const payload = update[op];
        if (!payload || typeof payload !== 'object')
            continue;
        for (const key of Object.keys(payload)) {
            // Allow operational flags and enrichment fields
            if (key.startsWith('commissionDetails'))
                continue;
            if ([
                'status', 'isProvisional', 'isInSuspense', 'commissionFinalized', 'provisionalRelationshipType',
                'finalizedAt', 'finalizedBy', 'idempotencyKey', 'manualPropertyAddress', 'manualTenantName',
                'buyerName', 'sellerName', 'saleId', 'developmentId', 'developmentUnitId', 'notes',
                'postingStatus', 'accountingComplete', 'accountingStatus', 'accountingLastAttemptAt', 'accountingPostedAt', 'accountingRetryCount',
                'accountingLastError', 'accountingMissing', 'accountingMismatched', 'accountingNextAttemptAt',
                'vatIncluded', 'vatRate', 'vatAmount', 'applyVatOnCommission', 'vatOnCommissionRate', 'vatCommissionTreatment',
                'reversalOfPaymentId', 'reversalPaymentId', 'correctedPaymentId',
                'reversedBy', 'reversedAt', 'reversalReason', 'voidedBy', 'voidedAt', 'voidReason', 'isCorrectionEntry'
            ].includes(key))
                continue;
            if (protectedKeys.has(key))
                return true;
        }
    }
    return false;
}
PaymentSchema.pre('save', function (next) {
    try {
        if (!this.isNew) {
            const stillProvisional = this.isProvisional === true || this.isInSuspense === true;
            const finalizing = this.isModified('isProvisional') || this.isModified('isInSuspense');
            const statusChanging = this.isModified('status');
            if (!stillProvisional && !finalizing && !statusChanging && (0, paymentFinancialImmutability_1.isCompletedFinancialPayment)(this)) {
                const modifiedFinancial = paymentFinancialImmutability_1.PAYMENT_FINANCIAL_FIELDS.filter((field) => this.isModified(field));
                if (modifiedFinancial.length) {
                    return next(new Error(paymentFinancialImmutability_1.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE));
                }
            }
        }
        const lines = Array.isArray(this.paymentLines) ? this.paymentLines : [];
        if (lines.length > 0) {
            this.amount = Number(lines.reduce((sum, line) => sum + Number((line === null || line === void 0 ? void 0 : line.amount) || 0), 0).toFixed(2));
        }
        // Keep postingStatus consistent with status to avoid "completed but draft" conflicts.
        // This is critical for reversal eligibility and ledger posting correctness.
        const status = String(this.status || '').toLowerCase();
        if (status === 'completed')
            this.postingStatus = 'posted';
        else if (status === 'reversed')
            this.postingStatus = 'reversed';
        else if (status === 'failed')
            this.postingStatus = 'voided';
        else
            this.postingStatus = 'draft';
        return next();
    }
    catch (e) {
        return next(e);
    }
});
PaymentSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'], function () {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const update = ((_b = (_a = this).getUpdate) === null || _b === void 0 ? void 0 : _b.call(_a)) || {};
        if (isIllegalPaymentUpdate(update)) {
            throw new Error('Payment records are immutable. Create a correcting payment instead of editing core fields.');
        }
        const attemptedFinancial = (0, paymentFinancialImmutability_1.financialFieldsInQueryUpdate)(update);
        if (attemptedFinancial.length === 0)
            return;
        const query = ((_d = (_c = this).getQuery) === null || _d === void 0 ? void 0 : _d.call(_c)) || {};
        const matched = yield this.model.find(query)
            .select('status postingStatus isProvisional isInSuspense')
            .limit(50)
            .lean();
        if (matched.some((doc) => (0, paymentFinancialImmutability_1.isCompletedFinancialPayment)(doc))) {
            throw new Error(paymentFinancialImmutability_1.COMPLETED_PAYMENT_IMMUTABLE_MESSAGE);
        }
    });
});
const resolveCompanyId = (value) => {
    if (!value)
        return null;
    if (typeof value === 'string')
        return value;
    if (typeof (value === null || value === void 0 ? void 0 : value.toString) === 'function')
        return value.toString();
    return null;
};
PaymentSchema.post('save', function () {
    (0, dashboardKpiRefreshTrigger_1.triggerDashboardKpiRefresh)(resolveCompanyId(this.companyId));
});
PaymentSchema.post('findOneAndUpdate', function (doc) {
    var _a, _b;
    const queryCompanyId = (_b = (_a = this === null || this === void 0 ? void 0 : this.getQuery) === null || _a === void 0 ? void 0 : _a.call(this)) === null || _b === void 0 ? void 0 : _b.companyId;
    (0, dashboardKpiRefreshTrigger_1.triggerDashboardKpiRefresh)(resolveCompanyId((doc === null || doc === void 0 ? void 0 : doc.companyId) || queryCompanyId));
});
PaymentSchema.post('updateOne', function () {
    var _a, _b;
    const queryCompanyId = (_b = (_a = this === null || this === void 0 ? void 0 : this.getQuery) === null || _a === void 0 ? void 0 : _a.call(this)) === null || _b === void 0 ? void 0 : _b.companyId;
    (0, dashboardKpiRefreshTrigger_1.triggerDashboardKpiRefresh)(resolveCompanyId(queryCompanyId));
});
exports.Payment = mongoose_1.default.model('Payment', PaymentSchema, collections_1.COLLECTIONS.PAYMENTS);
