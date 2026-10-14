"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundMoney = roundMoney;
exports.moneyAmountsMatch = moneyAmountsMatch;
exports.moneyDifference = moneyDifference;
exports.idsEqual = idsEqual;
exports.calculateTaxBreakdown = calculateTaxBreakdown;
exports.computeCommissionFallback = computeCommissionFallback;
exports.formatCurrency = formatCurrency;
function roundMoney(amount, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(Number(amount || 0) * factor) / factor;
}
/** Compare monetary values after canonical rounding. Avoids int/float false mismatches. */
function moneyAmountsMatch(a, b) {
    return roundMoney(Number(a || 0)) === roundMoney(Number(b || 0));
}
function moneyDifference(expected, actual) {
    return roundMoney(Number(actual || 0) - Number(expected || 0));
}
/** Compare Mongo ObjectId / string identities without false mismatches. */
function idsEqual(a, b) {
    return String(a !== null && a !== void 0 ? a : '') === String(b !== null && b !== void 0 ? b : '');
}
function calculateTaxBreakdown(items, discount = 0, taxPercentage = 15) {
    var _a, _b;
    const lines = (items || []).map((item) => ({
        net: Number((item === null || item === void 0 ? void 0 : item.netPrice) || 0),
        rate: (item === null || item === void 0 ? void 0 : item.taxPercentage) == null || (item === null || item === void 0 ? void 0 : item.taxPercentage) === ''
            ? Number(taxPercentage || 0)
            : Number(item.taxPercentage || 0)
    }));
    const subtotal = lines.reduce((sum, line) => sum + line.net, 0);
    const discountAmount = Number(discount || 0);
    const amountExcludingTax = subtotal - discountAmount;
    const rates = lines.map((line) => line.rate);
    const uniformRate = rates.length === 0 || rates.every((rate) => rate === rates[0]);
    const taxAmount = uniformRate
        ? (amountExcludingTax * Number((_b = (_a = rates[0]) !== null && _a !== void 0 ? _a : taxPercentage) !== null && _b !== void 0 ? _b : 0)) / 100
        : lines.reduce((sum, line) => {
            const share = subtotal === 0 ? 0 : line.net / subtotal;
            const lineAfterDiscount = line.net - discountAmount * share;
            return sum + (lineAfterDiscount * line.rate) / 100;
        }, 0);
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
    const commissionBase = roundMoney(Math.max(0, Number(amount || 0)));
    const totalCommission = roundMoney((commissionBase * Number(commissionPercentage || 0)) / 100);
    const preaFee = roundMoney(totalCommission * preaPercent);
    const remainingCommission = roundMoney(totalCommission - preaFee);
    const agentShare = roundMoney(remainingCommission * agentPercent);
    const agencyShare = roundMoney(remainingCommission * agencyPercent);
    return {
        totalCommission,
        preaFee,
        agentShare,
        agencyShare,
        ownerAmount: roundMoney(commissionBase - totalCommission)
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
