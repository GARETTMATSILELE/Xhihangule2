"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTaxSummary = exports.calculateSellerNetPayout = exports.calculateCommissionVAT = exports.calculateVATOnSale = exports.calculateCGT = void 0;
const DEFAULT_CONFIG = {
    cgtRate: 0.2,
    vatSaleRate: 0.15,
    vatOnCommissionRate: 0.155,
    applyVatOnSale: false
};
const money = (n) => Number(Number(n || 0).toFixed(2));
const calculateCGT = (salePrice, cgtRate = DEFAULT_CONFIG.cgtRate) => {
    return money(Math.max(0, salePrice) * Math.max(0, cgtRate));
};
exports.calculateCGT = calculateCGT;
const calculateVATOnSale = (salePrice, applyVatOnSale = DEFAULT_CONFIG.applyVatOnSale, vatSaleRate = DEFAULT_CONFIG.vatSaleRate) => {
    if (!applyVatOnSale)
        return 0;
    return money(Math.max(0, salePrice) * Math.max(0, vatSaleRate));
};
exports.calculateVATOnSale = calculateVATOnSale;
const calculateCommissionVAT = (commissionAmount, vatOnCommissionRate = DEFAULT_CONFIG.vatOnCommissionRate) => {
    return money(Math.max(0, commissionAmount) * Math.max(0, vatOnCommissionRate));
};
exports.calculateCommissionVAT = calculateCommissionVAT;
const calculateSellerNetPayout = (salePrice, deductions) => {
    const totalDeductions = money(deductions.reduce((sum, d) => sum + money(d), 0));
    return money(Math.max(0, money(salePrice) - totalDeductions));
};
exports.calculateSellerNetPayout = calculateSellerNetPayout;
const generateTaxSummary = (input) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const salePrice = money(input.salePrice);
    const commissionAmount = money(input.commissionAmount);
    const cgt = (0, exports.calculateCGT)(salePrice, (_a = input.cgtRate) !== null && _a !== void 0 ? _a : DEFAULT_CONFIG.cgtRate);
    const vatOnSale = (0, exports.calculateVATOnSale)(salePrice, (_b = input.applyVatOnSale) !== null && _b !== void 0 ? _b : DEFAULT_CONFIG.applyVatOnSale, (_c = input.vatSaleRate) !== null && _c !== void 0 ? _c : DEFAULT_CONFIG.vatSaleRate);
    const vatOnCommission = input.vatOnCommissionAmount != null
        ? money(input.vatOnCommissionAmount)
        : (0, exports.calculateCommissionVAT)(commissionAmount, (_d = input.vatOnCommissionRate) !== null && _d !== void 0 ? _d : DEFAULT_CONFIG.vatOnCommissionRate);
    const deductions = [cgt, vatOnSale, commissionAmount, vatOnCommission];
    const totalDeductions = money(deductions.reduce((sum, d) => sum + d, 0));
    const sellerNetPayout = (0, exports.calculateSellerNetPayout)(salePrice, deductions);
    return {
        cgt,
        vatOnSale,
        vatOnCommission,
        commission: commissionAmount,
        totalDeductions,
        sellerNetPayout,
        breakdown: {
            configuredRates: {
                cgtRate: (_e = input.cgtRate) !== null && _e !== void 0 ? _e : DEFAULT_CONFIG.cgtRate,
                vatSaleRate: (_f = input.vatSaleRate) !== null && _f !== void 0 ? _f : DEFAULT_CONFIG.vatSaleRate,
                vatOnCommissionRate: (_g = input.vatOnCommissionRate) !== null && _g !== void 0 ? _g : DEFAULT_CONFIG.vatOnCommissionRate
            },
            appliedRules: {
                cgtFirst: true,
                vatOnSaleApplied: (_h = input.applyVatOnSale) !== null && _h !== void 0 ? _h : DEFAULT_CONFIG.applyVatOnSale,
                vatOnCommissionApplied: true,
                vatOnCommissionSource: input.vatOnCommissionAmount != null ? 'payment' : 'calculated'
            }
        }
    };
};
exports.generateTaxSummary = generateTaxSummary;
exports.default = {
    calculateCGT: exports.calculateCGT,
    calculateVATOnSale: exports.calculateVATOnSale,
    calculateCommissionVAT: exports.calculateCommissionVAT,
    calculateSellerNetPayout: exports.calculateSellerNetPayout,
    generateTaxSummary: exports.generateTaxSummary
};
