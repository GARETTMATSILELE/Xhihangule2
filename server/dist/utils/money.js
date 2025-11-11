"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundMoney = roundMoney;
exports.calculateTaxBreakdown = calculateTaxBreakdown;
exports.computeCommissionFallback = computeCommissionFallback;
exports.formatCurrency = formatCurrency;
function roundMoney(amount, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(Number(amount || 0) * factor) / factor;
}
function calculateTaxBreakdown(items, discount = 0, taxPercentage = 15) {
    const subtotal = items.reduce((sum, item) => sum + Number((item === null || item === void 0 ? void 0 : item.netPrice) || 0), 0);
    const amountExcludingTax = subtotal - Number(discount || 0);
    const taxAmount = (amountExcludingTax * Number(taxPercentage || 0)) / 100;
    const totalAmount = amountExcludingTax + taxAmount;
    return {
        subtotal,
        amountExcludingTax,
        taxAmount,
        totalAmount
    };
}
function computeCommissionFallback(amount, commissionPercentage, options) {
    var _a, _b, _c;
    const preaPercent = Math.max(0, Math.min(1, (_a = options === null || options === void 0 ? void 0 : options.preaPercentOfTotal) !== null && _a !== void 0 ? _a : 0.03));
    const agentPercent = Math.max(0, Math.min(1, (_b = options === null || options === void 0 ? void 0 : options.agentPercentOfRemaining) !== null && _b !== void 0 ? _b : 0.6));
    const agencyPercent = Math.max(0, Math.min(1, (_c = options === null || options === void 0 ? void 0 : options.agencyPercentOfRemaining) !== null && _c !== void 0 ? _c : 0.4));
    const totalCommission = (Number(amount || 0) * Number(commissionPercentage || 0)) / 100;
    const preaFee = totalCommission * preaPercent;
    const remainingCommission = totalCommission - preaFee;
    const agentShare = remainingCommission * agentPercent;
    const agencyShare = remainingCommission * agencyPercent;
    return {
        totalCommission,
        preaFee,
        agentShare,
        agencyShare,
        ownerAmount: Number(amount || 0) - totalCommission
    };
}
function formatCurrency(amount, currency = 'USD') {
    if (currency === 'USD') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
    if (currency === 'ZAR') {
        return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
    }
    // ZiG formatting (no ISO code)
    return `ZiG ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount || 0))}`;
}
