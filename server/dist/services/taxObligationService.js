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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertPaymentTaxObligation = upsertPaymentTaxObligation;
exports.reversePaymentTaxObligations = reversePaymentTaxObligations;
exports.outstandingForObligation = outstandingForObligation;
exports.markObligationsPaid = markObligationsPaid;
exports.openReview = openReview;
const mongoose_1 = __importDefault(require("mongoose"));
const TaxObligation_1 = require("../models/TaxObligation");
const TaxReviewItem_1 = require("../models/TaxReviewItem");
const taxTypes_1 = require("./tax/taxTypes");
const fxPolicy_1 = require("./tax/fxPolicy");
const money_1 = require("../utils/money");
const testFailureSeam_1 = require("./testFailureSeam");
const toId = (value) => value instanceof mongoose_1.default.Types.ObjectId ? value : new mongoose_1.default.Types.ObjectId(String(value));
function duplicateKeyDetails(error) {
    var _a, _b;
    if (Number(error === null || error === void 0 ? void 0 : error.code) !== 11000)
        return null;
    const pattern = (error === null || error === void 0 ? void 0 : error.keyPattern) || ((_a = error === null || error === void 0 ? void 0 : error.errorResponse) === null || _a === void 0 ? void 0 : _a.keyPattern);
    const value = (error === null || error === void 0 ? void 0 : error.keyValue) || ((_b = error === null || error === void 0 ? void 0 : error.errorResponse) === null || _b === void 0 ? void 0 : _b.keyValue);
    if (!pattern || typeof pattern !== 'object' || !value || typeof value !== 'object')
        return null;
    return { pattern, value };
}
function keyMatchesObligationIdentity(value, identity) {
    if (identity.companyId == null || identity.paymentId == null || identity.taxType == null)
        return false;
    if (value.companyId != null && !(0, money_1.idsEqual)(value.companyId, identity.companyId))
        return false;
    if (value.paymentId != null && !(0, money_1.idsEqual)(value.paymentId, identity.paymentId))
        return false;
    if (value.taxType != null && String(value.taxType) !== String(identity.taxType))
        return false;
    return value.companyId != null && value.paymentId != null && value.taxType != null;
}
/** 11000 is an original collision only when the index key is this company, payment, and tax type. */
function isExpectedOriginalDuplicate(error, identity) {
    const details = duplicateKeyDetails(error);
    if (!details)
        return false;
    const fields = Object.keys(details.pattern);
    const coversIdentity = fields.includes('companyId') && fields.includes('paymentId') && fields.includes('taxType');
    if (!coversIdentity || !keyMatchesObligationIdentity(details.value, identity))
        return false;
    if (fields.includes('reversalOf') && details.value.reversalOf != null)
        return false;
    return true;
}
/** 11000 is a reversal collision only when the index key is this original's reversal row. */
function isExpectedReversalDuplicate(error, original) {
    const details = duplicateKeyDetails(error);
    if (!details)
        return false;
    const fields = Object.keys(details.pattern);
    if (!fields.includes('reversalOf') || !fields.includes('companyId') || !fields.includes('paymentId') || !fields.includes('taxType')) {
        return false;
    }
    if (!(0, money_1.idsEqual)(details.value.reversalOf, original._id))
        return false;
    return keyMatchesObligationIdentity(details.value, original);
}
function upsertPaymentTaxObligation(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const taxAmount = (0, money_1.roundMoney)(Number(input.taxAmount || 0));
        if (!(taxAmount > 0) && input.status !== 'ACCOUNTANT_REVIEW')
            return null;
        const companyId = toId(input.companyId);
        const paymentId = toId(input.paymentId);
        const existing = yield TaxObligation_1.TaxObligation.findOne({
            companyId,
            paymentId,
            taxType: input.taxType,
            reversalOf: null
        });
        if (existing)
            return String(existing._id);
        const fx = (0, fxPolicy_1.resolveTaxFx)({
            transactionCurrency: input.currency,
            taxCurrency: input.currency,
            functionalCurrency: input.currency,
            exchangeRate: 1,
            rateSource: 'SAME_CURRENCY',
            rateDate: input.transactionDate
        });
        if (fx.fxReviewRequired) {
            yield openReview({
                companyId: input.companyId,
                kind: 'FX_REVIEW_REQUIRED',
                title: 'FX conversion is not available',
                paymentId: input.paymentId,
                detail: 'Transaction currency differs from tax/functional currency and no sourced rate was provided. Rate 1 was not applied.'
            });
        }
        try {
            const created = yield TaxObligation_1.TaxObligation.create({
                companyId,
                taxType: input.taxType,
                entityType: 'payment',
                entityId: input.paymentId,
                propertyId: input.propertyId ? toId(input.propertyId) : undefined,
                paymentId,
                transactionId: input.paymentId,
                taxPeriod: input.taxPeriod,
                transactionDate: input.transactionDate,
                currency: fx.transactionCurrency,
                taxCurrency: fx.taxCurrency,
                exchangeRate: fx.exchangeRate == null ? undefined : fx.exchangeRate,
                exchangeRateSource: fx.rateSource,
                exchangeRateDate: fx.rateDate || input.transactionDate,
                functionalAmount: fx.fxReviewRequired ? undefined : taxAmount,
                taxableAmount: (0, money_1.roundMoney)(input.taxableAmount || 0),
                taxRate: Number(input.taxRate || 0),
                taxAmount,
                calculationBasis: input.calculationBasis,
                calculationSnapshot: input.calculationSnapshot,
                status: fx.fxReviewRequired ? 'ACCOUNTANT_REVIEW' : (input.status || (taxAmount > 0 ? 'PAYABLE' : 'CALCULATED')),
                calculatedAt: new Date(),
                glAccount: input.glAccount,
                sourceLedger: input.sourceLedger || 'company_journal',
                journalEntryId: input.journalEntryId,
                createdBy: input.createdBy ? toId(input.createdBy) : undefined,
                reversalOf: null
            });
            return String(created._id);
        }
        catch (error) {
            if (isExpectedOriginalDuplicate(error, { companyId, paymentId, taxType: input.taxType })) {
                const raced = yield TaxObligation_1.TaxObligation.findOne({
                    companyId,
                    paymentId,
                    taxType: input.taxType,
                    reversalOf: null
                });
                if (raced)
                    return String(raced._id);
            }
            throw error;
        }
    });
}
function linkOriginalToExistingReversal(original, reversalId) {
    return __awaiter(this, void 0, void 0, function* () {
        let dirty = false;
        if (!original.reversedByObligationId) {
            original.reversedByObligationId = reversalId;
            dirty = true;
        }
        if (original.status !== 'REVERSED') {
            original.status = 'REVERSED';
            dirty = true;
        }
        if (dirty)
            yield original.save();
    });
}
function reversePaymentTaxObligations(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const originals = yield TaxObligation_1.TaxObligation.find({
            companyId: toId(input.companyId),
            paymentId: toId(input.paymentId),
            reversalOf: null
        });
        if (!originals.length)
            return 'skipped';
        (0, testFailureSeam_1.throwOnceIfArmed)(String(input.paymentId), `${String(input.notes || '')} ${String(input.reason || '')}`, 'PHASE28_FAIL_TAX');
        for (const original of originals) {
            const preservedAmount = Number(original.taxAmount || 0);
            const existing = yield TaxObligation_1.TaxObligation.findOne({
                companyId: original.companyId,
                paymentId: original.paymentId,
                taxType: original.taxType,
                reversalOf: original._id
            });
            if (existing) {
                yield linkOriginalToExistingReversal(original, existing._id);
                continue;
            }
            let reversal;
            try {
                reversal = yield TaxObligation_1.TaxObligation.create({
                    companyId: original.companyId,
                    taxType: original.taxType,
                    entityType: original.entityType,
                    entityId: original.entityId,
                    propertyId: original.propertyId,
                    paymentId: original.paymentId,
                    transactionId: `${original.transactionId || original.paymentId}:reversal`,
                    taxPeriod: original.taxPeriod,
                    transactionDate: new Date(),
                    currency: original.currency,
                    taxableAmount: original.taxableAmount,
                    taxRate: original.taxRate,
                    taxAmount: preservedAmount,
                    calculationBasis: `REVERSAL_OF:${original._id}`,
                    calculationSnapshot: {
                        originalId: String(original._id),
                        originalTaxAmount: preservedAmount,
                        originalTaxRate: original.taxRate,
                        originalTaxPeriod: original.taxPeriod,
                        originalTaxType: original.taxType
                    },
                    status: 'REVERSED',
                    calculatedAt: new Date(),
                    glAccount: original.glAccount,
                    sourceLedger: original.sourceLedger,
                    reversalOf: original._id,
                    createdBy: input.createdBy ? toId(input.createdBy) : undefined
                });
            }
            catch (error) {
                if (!isExpectedReversalDuplicate(error, original))
                    throw error;
                reversal = yield TaxObligation_1.TaxObligation.findOne({
                    companyId: original.companyId,
                    paymentId: original.paymentId,
                    taxType: original.taxType,
                    reversalOf: original._id
                });
                if (!reversal)
                    throw error;
            }
            yield linkOriginalToExistingReversal(original, reversal._id);
        }
        return 'reversed';
    });
}
function outstandingForObligation(obligationId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const row = yield TaxObligation_1.TaxObligation.findById(obligationId).lean();
        if (!row || row.status === 'REVERSED')
            return 0;
        if ((0, taxTypes_1.isSettledStatus)(row.status))
            return 0;
        const { TaxPayment } = yield Promise.resolve().then(() => __importStar(require('../models/TaxPayment')));
        const paid = yield TaxPayment.aggregate([
            { $match: { status: 'POSTED', 'allocations.taxObligationId': row._id } },
            { $unwind: '$allocations' },
            { $match: { 'allocations.taxObligationId': row._id } },
            { $group: { _id: null, total: { $sum: '$allocations.amount' } } }
        ]);
        return (0, money_1.roundMoney)(Math.max(0, Number(row.taxAmount || 0) - Number(((_a = paid[0]) === null || _a === void 0 ? void 0 : _a.total) || 0)));
    });
}
function markObligationsPaid(input) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const alloc of input.allocations) {
            const remaining = yield outstandingForObligation(alloc.taxObligationId);
            const obligation = yield TaxObligation_1.TaxObligation.findById(alloc.taxObligationId);
            if (!obligation)
                throw new Error('Tax obligation not found');
            if (obligation.status === 'REVERSED')
                throw new Error('Cannot pay a reversed tax obligation');
            if ((0, money_1.roundMoney)(alloc.amount) - remaining > 0.0001) {
                throw new Error(`Allocation exceeds outstanding ${remaining.toFixed(2)} for obligation ${alloc.taxObligationId}`);
            }
            const newOutstanding = (0, money_1.roundMoney)(remaining - alloc.amount);
            obligation.paymentReference = input.paymentReference || obligation.paymentReference;
            obligation.zimraReference = input.zimraReference || obligation.zimraReference;
            obligation.paidAt = input.paidAt;
            obligation.status = newOutstanding <= 0.005 ? 'PAID' : ((0, taxTypes_1.isPayableStatus)(obligation.status) ? obligation.status : 'PAYABLE');
            if (newOutstanding <= 0.005)
                obligation.reconciledAt = input.paidAt;
            if (newOutstanding <= 0.005 && obligation.status === 'PAID') {
                // keep PAID; accountant can later mark RECONCILED
            }
            yield obligation.save();
        }
    });
}
function openReview(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            yield TaxReviewItem_1.TaxReviewItem.updateOne({
                companyId: toId(input.companyId),
                kind: input.kind,
                paymentId: input.paymentId ? toId(input.paymentId) : undefined,
                taxObligationId: input.taxObligationId ? toId(input.taxObligationId) : undefined,
                status: 'open'
            }, {
                $setOnInsert: {
                    companyId: toId(input.companyId),
                    kind: input.kind,
                    status: 'open',
                    title: input.title,
                    detail: input.detail,
                    paymentId: input.paymentId ? toId(input.paymentId) : undefined,
                    propertyId: input.propertyId ? toId(input.propertyId) : undefined,
                    taxObligationId: input.taxObligationId ? toId(input.taxObligationId) : undefined,
                    metadata: input.metadata,
                    severity: ((_a = input.metadata) === null || _a === void 0 ? void 0 : _a.severity) || 'MEDIUM',
                    currentAmount: (_b = input.metadata) === null || _b === void 0 ? void 0 : _b.currentAmount,
                    expectedBasis: (_c = input.metadata) === null || _c === void 0 ? void 0 : _c.expectedBasis,
                    detectedAt: new Date()
                }
            }, { upsert: true });
        }
        catch (_d) {
            // duplicate review is non-fatal
        }
    });
}
