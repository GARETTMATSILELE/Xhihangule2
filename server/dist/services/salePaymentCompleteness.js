"use strict";
/**
 * Sale Payment financial completeness.
 * Sale price is Payment.amount (gross). Commission and splits live on Payment.commissionDetails.
 * This module validates; it does not recalculate sale commission formulas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBHOOK_PAYMENT_TYPE_UNKNOWN_CODE = exports.SALE_PAYMENT_INCOMPLETE_MESSAGE = exports.SALE_PAYMENT_INCOMPLETE_CODE = void 0;
exports.classifyPropertyFinancialKind = classifyPropertyFinancialKind;
exports.validateSalePaymentCompleteness = validateSalePaymentCompleteness;
exports.salePaymentIncompleteResponse = salePaymentIncompleteResponse;
exports.SALE_PAYMENT_INCOMPLETE_CODE = 'SALE_PAYMENT_INCOMPLETE';
exports.SALE_PAYMENT_INCOMPLETE_MESSAGE = 'Sale payment is missing required financial data.';
exports.WEBHOOK_PAYMENT_TYPE_UNKNOWN_CODE = 'WEBHOOK_PAYMENT_TYPE_UNKNOWN';
function classifyPropertyFinancialKind(rentalType) {
    const kind = String(rentalType || '').trim().toLowerCase();
    if (kind === 'management' || kind === 'introduction')
        return 'rental';
    if (kind === 'sale' || kind === 'sales')
        return 'sale';
    return 'unknown';
}
const isPresentFiniteNumber = (value) => {
    if (value == null || value === '')
        return false;
    const n = Number(value);
    return Number.isFinite(n);
};
function validateSalePaymentCompleteness(input) {
    const missing = [];
    const details = (input === null || input === void 0 ? void 0 : input.commissionDetails) || {};
    if (!isPresentFiniteNumber(input === null || input === void 0 ? void 0 : input.amount) || Number(input.amount) <= 0) {
        missing.push('salePrice');
    }
    if (!isPresentFiniteNumber(details.totalCommission) || Number(details.totalCommission) <= 0) {
        missing.push('commissionDetails.totalCommission');
    }
    if (!isPresentFiniteNumber(details.agentShare) || Number(details.agentShare) < 0) {
        missing.push('commissionDetails.agentShare');
    }
    if (!isPresentFiniteNumber(details.agencyShare) || Number(details.agencyShare) < 0) {
        missing.push('commissionDetails.agencyShare');
    }
    const total = Number(details.totalCommission);
    const agentShare = Number(details.agentShare);
    const agencyShare = Number(details.agencyShare);
    if (Number.isFinite(total) &&
        total > 0 &&
        Number.isFinite(agentShare) &&
        Number.isFinite(agencyShare) &&
        agentShare === 0 &&
        agencyShare === 0) {
        if (!missing.includes('commissionDetails.agentShare'))
            missing.push('commissionDetails.agentShare');
        if (!missing.includes('commissionDetails.agencyShare'))
            missing.push('commissionDetails.agencyShare');
    }
    const split = details.agentSplit;
    if (split && typeof split === 'object') {
        if (!isPresentFiniteNumber(split.ownerAgentShare) || Number(split.ownerAgentShare) < 0) {
            missing.push('commissionDetails.agentSplit.ownerAgentShare');
        }
        if (!isPresentFiniteNumber(split.collaboratorAgentShare) || Number(split.collaboratorAgentShare) < 0) {
            missing.push('commissionDetails.agentSplit.collaboratorAgentShare');
        }
    }
    if (missing.length) {
        return { ok: false, missing };
    }
    return { ok: true, missing: [] };
}
function salePaymentIncompleteResponse(missing) {
    return {
        status: 'error',
        success: false,
        code: exports.SALE_PAYMENT_INCOMPLETE_CODE,
        message: exports.SALE_PAYMENT_INCOMPLETE_MESSAGE,
        missing: [...missing]
    };
}
