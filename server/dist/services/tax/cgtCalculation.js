"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCapitalGain = calculateCapitalGain;
exports.calculateCapitalGainsWithholding = calculateCapitalGainsWithholding;
exports.isFlatSalePriceCgt = isFlatSalePriceCgt;
const money_1 = require("../../utils/money");
function calculateCapitalGain(input) {
    const salePrice = (0, money_1.roundMoney)(Math.max(0, Number(input.salePrice || 0)));
    const acquisitionCost = input.acquisitionCost == null ? null : (0, money_1.roundMoney)(Math.max(0, Number(input.acquisitionCost)));
    const improvementCosts = (0, money_1.roundMoney)(Math.max(0, Number(input.improvementCosts || 0)));
    const qualifyingExpenses = (0, money_1.roundMoney)(Math.max(0, Number(input.qualifyingExpenses || 0)));
    const sellingCosts = (0, money_1.roundMoney)(Math.max(0, Number(input.sellingCosts || 0)));
    const otherAdjustments = (0, money_1.roundMoney)(Number(input.otherAdjustments || 0));
    const cgtRate = input.cgtRate == null ? 0 : Math.max(0, Number(input.cgtRate));
    const base = {
        salePrice,
        acquisitionCost: acquisitionCost == null ? 0 : acquisitionCost,
        improvementCosts,
        qualifyingExpenses,
        sellingCosts,
        otherAdjustments,
        cgtRate
    };
    if (input.cgtNotApplicable) {
        const reason = String(input.cgtNotApplicableReason || '').trim();
        if (!reason) {
            return Object.assign(Object.assign({}, base), { capitalGain: 0, cgtAmount: 0, calculationBasis: 'CGT_SETTLEMENT_REVIEW_REQUIRED', reviewRequired: true, reviewReason: 'CGT_NOT_APPLICABLE_REASON_REQUIRED', settlementBlocked: true, isFinal: false, isProvisional: true });
        }
        return Object.assign(Object.assign({}, base), { capitalGain: 0, cgtAmount: 0, calculationBasis: 'CGT_NOT_APPLICABLE', reviewRequired: false, settlementBlocked: false, isFinal: true, isProvisional: false });
    }
    if (acquisitionCost == null) {
        const provisionalGain = (0, money_1.roundMoney)(salePrice - improvementCosts - qualifyingExpenses - sellingCosts + otherAdjustments);
        const provisionalCgtAmount = cgtRate > 0 && provisionalGain > 0 ? (0, money_1.roundMoney)(provisionalGain * cgtRate) : 0;
        return Object.assign(Object.assign({}, base), { capitalGain: 0, cgtAmount: 0, provisionalCgtAmount, calculationBasis: 'MISSING_ACQUISITION_COST', reviewRequired: true, reviewReason: 'CGT_SETTLEMENT_REVIEW_REQUIRED', settlementBlocked: true, isFinal: false, isProvisional: true });
    }
    const capitalGain = (0, money_1.roundMoney)(salePrice - acquisitionCost - improvementCosts - qualifyingExpenses - sellingCosts + otherAdjustments);
    if (capitalGain <= 0) {
        return Object.assign(Object.assign({}, base), { capitalGain, cgtAmount: 0, calculationBasis: 'NO_GAIN', reviewRequired: false, settlementBlocked: false, isFinal: true, isProvisional: false });
    }
    if (!(cgtRate > 0)) {
        return Object.assign(Object.assign({}, base), { cgtRate: 0, capitalGain, cgtAmount: 0, calculationBasis: 'CGT_RATE_MISSING', reviewRequired: true, reviewReason: 'CGT_RATE_NOT_CONFIGURED', settlementBlocked: true, isFinal: false, isProvisional: true });
    }
    return Object.assign(Object.assign({}, base), { capitalGain, cgtAmount: (0, money_1.roundMoney)(capitalGain * cgtRate), calculationBasis: 'CAPITAL_GAIN', reviewRequired: false, settlementBlocked: false, isFinal: true, isProvisional: false });
}
function calculateCapitalGainsWithholding(input) {
    const saleConsideration = (0, money_1.roundMoney)(Math.max(0, Number(input.saleConsideration || 0)));
    const cgwtRate = input.cgwtRate == null ? 0 : Math.max(0, Number(input.cgwtRate));
    const applicability = input.applicability
        || (cgwtRate > 0 ? 'APPLICABLE' : saleConsideration > 0 ? 'REVIEW_REQUIRED' : 'NOT_APPLICABLE');
    if (applicability === 'NOT_APPLICABLE') {
        const reason = String(input.notApplicableReason || '').trim();
        if (saleConsideration > 0 && !reason) {
            return {
                saleConsideration,
                cgwtRate,
                cgwtAmount: 0,
                calculationBasis: 'CGWT_REVIEW_REQUIRED',
                applicability: 'REVIEW_REQUIRED',
                reviewRequired: true,
                reviewReason: 'CGWT_NOT_APPLICABLE_REASON_REQUIRED',
                settlementBlocked: true,
                isFinal: false
            };
        }
        return {
            saleConsideration,
            cgwtRate: 0,
            cgwtAmount: 0,
            calculationBasis: 'CGWT_NOT_APPLICABLE',
            applicability: 'NOT_APPLICABLE',
            reviewRequired: false,
            settlementBlocked: false,
            isFinal: true
        };
    }
    if (!(cgwtRate > 0)) {
        return {
            saleConsideration,
            cgwtRate: 0,
            cgwtAmount: 0,
            calculationBasis: 'CGWT_RATE_MISSING',
            applicability: 'REVIEW_REQUIRED',
            reviewRequired: saleConsideration > 0,
            reviewReason: saleConsideration > 0 ? 'CGWT_RATE_MISSING' : undefined,
            settlementBlocked: saleConsideration > 0,
            isFinal: false
        };
    }
    if (applicability === 'REVIEW_REQUIRED') {
        return {
            saleConsideration,
            cgwtRate,
            cgwtAmount: 0,
            calculationBasis: 'CGWT_REVIEW_REQUIRED',
            applicability: 'REVIEW_REQUIRED',
            reviewRequired: true,
            reviewReason: 'CGWT_APPLICABILITY_UNDECIDED',
            settlementBlocked: saleConsideration > 0,
            isFinal: false
        };
    }
    return {
        saleConsideration,
        cgwtRate,
        cgwtAmount: (0, money_1.roundMoney)(saleConsideration * cgwtRate),
        calculationBasis: 'SALE_CONSIDERATION',
        applicability: 'APPLICABLE',
        reviewRequired: false,
        settlementBlocked: false,
        isFinal: true
    };
}
function isFlatSalePriceCgt(salePrice, cgtAmount, presumedRate = 0.2) {
    const expected = (0, money_1.roundMoney)(Math.max(0, Number(salePrice || 0)) * presumedRate);
    return expected > 0 && (0, money_1.roundMoney)(cgtAmount) === expected;
}
