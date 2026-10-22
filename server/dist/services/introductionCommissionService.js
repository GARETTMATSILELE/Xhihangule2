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
exports.computeIntroductionAllocation = computeIntroductionAllocation;
exports.introductionAllocationReconciles = introductionAllocationReconciles;
exports.introductionConsumedFromPayments = introductionConsumedFromPayments;
exports.deriveIntroductionState = deriveIntroductionState;
exports.loadIntroductionConsumedRent = loadIntroductionConsumedRent;
exports.snapshotFromIntroductionAllocation = snapshotFromIntroductionAllocation;
exports.applyIntroductionOwnerRemainder = applyIntroductionOwnerRemainder;
exports.buildIntroductionRentalCommission = buildIntroductionRentalCommission;
exports.prepareIntroductionRentalCommission = prepareIntroductionRentalCommission;
/**
 * Introduction rental commission is one month's applicable rent, collected once per
 * tenant + property + lease. Subsequent rental goes to the owner.
 * Levy and deposit never satisfy Introduction.
 * When VAT is enabled, it is extracted from the one-month amount (inclusive), never added on top.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const commissionService_1 = require("./commissionService");
const propertyCommissionCalculator_1 = require("./propertyCommissionCalculator");
const money_1 = require("../utils/money");
const introductionLeaseContext_1 = require("./introductionLeaseContext");
function computeIntroductionAllocation(input) {
    const oneMonthRent = (0, money_1.roundMoney)(Math.max(0, Number(input.oneMonthRent || 0)));
    const rentAllocated = (0, money_1.roundMoney)(Math.max(0, Number(input.rentAllocated || 0)));
    const levyAllocated = (0, money_1.roundMoney)(Math.max(0, Number(input.levyAllocated || 0)));
    const alreadyConsumed = (0, money_1.roundMoney)(Math.max(0, Number(input.alreadyConsumed || 0)));
    const remainingBefore = (0, money_1.roundMoney)(Math.max(0, oneMonthRent - alreadyConsumed));
    const introThisPayment = (0, money_1.roundMoney)(Math.min(rentAllocated, remainingBefore));
    const ownerRent = (0, money_1.roundMoney)(Math.max(0, rentAllocated - introThisPayment));
    const remainingAfter = (0, money_1.roundMoney)(Math.max(0, remainingBefore - introThisPayment));
    return {
        oneMonthRent,
        alreadyConsumed,
        remainingBefore,
        introThisPayment,
        ownerRent,
        levyAllocated,
        remainingAfter,
        satisfied: remainingAfter <= 0 && oneMonthRent > 0
    };
}
function introductionAllocationReconciles(input) {
    const amount = (0, money_1.roundMoney)(Number(input.amount || 0));
    const intro = (0, money_1.roundMoney)(Number(input.introThisPayment || 0));
    const ownerRent = (0, money_1.roundMoney)(Number(input.ownerRent || 0));
    const levy = (0, money_1.roundMoney)(Number(input.levyAllocated || 0));
    return (0, money_1.roundMoney)(intro + ownerRent + levy) === amount;
}
/** Rent already consumed as introduction commission from existing Payment snapshots. */
function introductionConsumedFromPayments(payments) {
    var _a, _b;
    let consumed = 0;
    for (const payment of payments || []) {
        if (payment === null || payment === void 0 ? void 0 : payment.reversalOfPaymentId)
            continue;
        if (String((payment === null || payment === void 0 ? void 0 : payment.reversalState) || '') === 'reversed')
            continue;
        if (Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0) < 0)
            continue;
        const deposit = Number((payment === null || payment === void 0 ? void 0 : payment.depositAmount) || 0);
        const amount = Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0);
        if (deposit > 0 && amount <= 0)
            continue;
        const total = Number(((_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.totalCommission) || 0);
        const base = Number(((_b = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.commissionBase) || 0);
        if (total > 0 && base > 0)
            consumed += base;
    }
    return (0, money_1.roundMoney)(consumed);
}
function deriveIntroductionState(input) {
    const introductionTarget = (0, money_1.roundMoney)(Math.max(0, Number(input.introductionTarget || 0)));
    const introductionConsumed = introductionConsumedFromPayments(input.payments);
    const introductionRemaining = (0, money_1.roundMoney)(Math.max(0, introductionTarget - introductionConsumed));
    return {
        tenantId: String(input.tenantId),
        propertyId: String(input.propertyId),
        leaseId: String(input.leaseId),
        introductionTarget,
        introductionConsumed,
        introductionRemaining,
        vatEnabled: Boolean(input.vatEnabled),
        vatRate: input.vatRate,
        satisfied: introductionRemaining <= 0 && introductionTarget > 0
    };
}
function loadIntroductionConsumedRent(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const filter = {
            companyId: new mongoose_1.default.Types.ObjectId(String(input.companyId)),
            propertyId: new mongoose_1.default.Types.ObjectId(String(input.propertyId)),
            tenantId: new mongoose_1.default.Types.ObjectId(String(input.tenantId)),
            leaseId: new mongoose_1.default.Types.ObjectId(String(input.leaseId)),
            paymentType: { $in: ['rental', 'introduction'] },
            status: 'completed',
            isProvisional: { $ne: true },
            isInSuspense: { $ne: true }
        };
        if (input.excludePaymentId && mongoose_1.default.Types.ObjectId.isValid(String(input.excludePaymentId))) {
            filter._id = { $ne: new mongoose_1.default.Types.ObjectId(String(input.excludePaymentId)) };
        }
        const docs = yield Payment_1.Payment.find(filter)
            .select('amount depositAmount reversalOfPaymentId commissionDetails.commissionBase commissionDetails.totalCommission')
            .lean();
        return introductionConsumedFromPayments(docs);
    });
}
function snapshotFromIntroductionAllocation(allocation, vat = {}) {
    return (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: allocation.introThisPayment,
        levy: 0,
        commissionPercentage: allocation.introThisPayment > 0 ? 100 : 0,
        vatOnCommission: Boolean(vat.vatOnCommission),
        vatTreatment: vat.vatTreatment,
        vatRate: vat.vatRate,
        preaPercentOfTotal: vat.preaPercentOfTotal,
        agentPercentOfRemaining: vat.agentPercentOfRemaining,
        agencyPercentOfRemaining: vat.agencyPercentOfRemaining,
        commissionType: 'introduction'
    });
}
function applyIntroductionOwnerRemainder(result, allocation) {
    const snapshot = (0, commissionService_1.applyLevyPassThroughToSnapshot)(result, allocation.introThisPayment + allocation.ownerRent, allocation.levyAllocated);
    snapshot.ownerAmount = (0, money_1.roundMoney)(allocation.ownerRent + allocation.levyAllocated);
    return snapshot;
}
function buildIntroductionRentalCommission(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const alreadyConsumed = yield loadIntroductionConsumedRent(input);
        const allocation = computeIntroductionAllocation({
            rentAllocated: input.rentAllocated,
            levyAllocated: input.levyAllocated,
            oneMonthRent: input.oneMonthRent,
            alreadyConsumed
        });
        const result = yield commissionService_1.CommissionService.calculateForProperty({
            companyId: input.companyId,
            grossRent: allocation.introThisPayment,
            levy: 0,
            commissionPercentage: allocation.introThisPayment > 0 ? 100 : 0,
            vatOnCommission: input.vatOnCommission,
            vatTreatment: input.vatTreatment,
            vatRate: input.vatRate,
            paymentDate: input.paymentDate,
            commissionType: 'introduction'
        });
        const snapshot = applyIntroductionOwnerRemainder(result, allocation);
        return { allocation, snapshot, result };
    });
}
function prepareIntroductionRentalCommission(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const context = yield (0, introductionLeaseContext_1.resolveIntroductionLeaseContext)(input);
        if (!context.ok)
            return context;
        const oneMonthRent = (0, money_1.roundMoney)(Number(input.rentUsed || 0) > 0
            ? Number(input.rentUsed)
            : (0, introductionLeaseContext_1.introductionTargetFromLease)(context.lease, { rent: input.propertyRent }));
        if (!(oneMonthRent > 0) && Number(input.rentAllocated || 0) > 0) {
            return {
                ok: false,
                code: 'INTRODUCTION_RENT_UNDETERMINED',
                message: 'Introduction commission cannot be determined because one month\'s rent is missing or zero.',
                missing: ['lease.rentAmount']
            };
        }
        const built = yield buildIntroductionRentalCommission({
            companyId: input.companyId,
            propertyId: context.propertyId,
            tenantId: context.tenantId,
            leaseId: context.leaseId,
            rentAllocated: input.rentAllocated,
            levyAllocated: input.levyAllocated,
            oneMonthRent,
            vatOnCommission: input.vatOnCommission,
            vatTreatment: input.vatTreatment,
            vatRate: input.vatRate,
            paymentDate: input.paymentDate,
            excludePaymentId: input.excludePaymentId
        });
        try {
            const { loadLegacyIntroductionContextRisk } = yield Promise.resolve().then(() => __importStar(require('./legacyIntroductionRisk')));
            yield loadLegacyIntroductionContextRisk({
                companyId: input.companyId,
                tenantId: context.tenantId,
                propertyId: context.propertyId,
                leaseId: context.leaseId
            });
        }
        catch (_a) {
            // Detection must never block Introduction calculation.
        }
        return Object.assign(Object.assign({ ok: true, context }, built), { oneMonthRent });
    });
}
