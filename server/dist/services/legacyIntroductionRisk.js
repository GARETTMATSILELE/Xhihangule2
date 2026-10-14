"use strict";
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
exports.LEGACY_INTRODUCTION_CONTEXT_RISK = void 0;
exports.detectLegacyIntroductionContextRisk = detectLegacyIntroductionContextRisk;
exports.loadLegacyIntroductionContextRisk = loadLegacyIntroductionContextRisk;
/**
 * Detection-only: historical Introduction Payments without leaseId
 * must not be silently assigned to a new lease lifecycle.
 * Never mutates Payments, commissions, owners, trust, or projections.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const introductionCommissionService_1 = require("./introductionCommissionService");
const logger_1 = require("../utils/logger");
exports.LEGACY_INTRODUCTION_CONTEXT_RISK = 'LEGACY_INTRODUCTION_CONTEXT_RISK';
function hasLeaseId(value) {
    if (value == null)
        return false;
    const text = String(value).trim();
    return text.length > 0 && text !== 'undefined' && text !== 'null';
}
function detectLegacyIntroductionContextRisk(input) {
    const tenantId = String(input.tenantId || '');
    const propertyId = String(input.propertyId || '');
    const leaseId = String(input.leaseId || '');
    if (!tenantId || !propertyId || !leaseId)
        return null;
    const legacyPayments = (input.payments || []).filter((payment) => !hasLeaseId(payment === null || payment === void 0 ? void 0 : payment.leaseId));
    const legacyIntroductionAmount = (0, introductionCommissionService_1.introductionConsumedFromPayments)(legacyPayments);
    const legacyPaymentCount = legacyPayments.filter((payment) => {
        var _a, _b;
        if (payment === null || payment === void 0 ? void 0 : payment.reversalOfPaymentId)
            return false;
        return Number(((_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.totalCommission) || 0) > 0
            || Number(((_b = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.commissionBase) || 0) > 0;
    }).length;
    if (legacyPaymentCount <= 0 && legacyIntroductionAmount <= 0)
        return null;
    return {
        code: exports.LEGACY_INTRODUCTION_CONTEXT_RISK,
        tenantId,
        propertyId,
        leaseId,
        legacyPaymentCount: legacyPaymentCount || legacyPayments.length,
        legacyIntroductionAmount,
        action: 'MANUAL_REVIEW_REQUIRED'
    };
}
function loadLegacyIntroductionContextRisk(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const tenantId = input.tenantId != null ? String(input.tenantId) : '';
        const propertyId = input.propertyId != null ? String(input.propertyId) : '';
        const leaseId = input.leaseId != null ? String(input.leaseId) : '';
        if (!tenantId || !propertyId || !leaseId)
            return null;
        if (!mongoose_1.default.Types.ObjectId.isValid(tenantId) || !mongoose_1.default.Types.ObjectId.isValid(propertyId))
            return null;
        const docs = yield Payment_1.Payment.find({
            companyId: new mongoose_1.default.Types.ObjectId(String(input.companyId)),
            tenantId: new mongoose_1.default.Types.ObjectId(tenantId),
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            paymentType: { $in: ['rental', 'introduction'] },
            status: 'completed',
            isProvisional: { $ne: true },
            isInSuspense: { $ne: true },
            $or: [{ leaseId: { $exists: false } }, { leaseId: null }]
        })
            .select('leaseId amount depositAmount reversalOfPaymentId commissionDetails.commissionBase commissionDetails.totalCommission')
            .lean();
        const risk = detectLegacyIntroductionContextRisk({
            tenantId,
            propertyId,
            leaseId,
            payments: docs
        });
        if (risk) {
            logger_1.logger.warn('Legacy Introduction context risk detected', Object.assign(Object.assign({}, risk), { action: risk.action }));
        }
        return risk;
    });
}
