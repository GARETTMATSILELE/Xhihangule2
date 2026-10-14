"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTaxSummary = void 0;
const cgtCalculation_1 = require("../tax/cgtCalculation");
const vatCalculation_1 = require("../tax/vatCalculation");
const settlementWaterfall_1 = require("../tax/settlementWaterfall");
const money_1 = require("../../utils/money");
const money = (n) => (0, money_1.roundMoney)(n);
const generateTaxSummary = (input) => {
    const salePrice = money(input.salePrice);
    const commissionAmount = money(input.commissionAmount);
    const vatOnCommission = input.vatOnCommissionAmount != null
        ? money(input.vatOnCommissionAmount)
        : 0;
    let vatOnSale = 0;
    if (input.saleVatAmount != null && Number(input.saleVatAmount) > 0) {
        vatOnSale = money(input.saleVatAmount);
    }
    else if (input.applyVatOnSale && Number(input.saleVatRate) > 0) {
        vatOnSale = (0, vatCalculation_1.extractInclusiveVat)(salePrice, Number(input.saleVatRate)).vatAmount;
    }
    let cgt = (0, cgtCalculation_1.calculateCapitalGain)({
        salePrice,
        acquisitionCost: input.acquisitionCost,
        improvementCosts: input.improvementCosts,
        qualifyingExpenses: input.qualifyingExpenses,
        sellingCosts: input.sellingCosts,
        otherAdjustments: input.otherAdjustments,
        cgtRate: input.cgtRate,
        cgtNotApplicable: input.cgtNotApplicable,
        cgtNotApplicableReason: input.cgtNotApplicableReason
    });
    if (input.cgtOverrideAmount != null) {
        const reason = String(input.cgtOverrideReason || '').trim();
        if (!reason) {
            cgt = Object.assign(Object.assign({}, cgt), { calculationBasis: 'MANUAL_OVERRIDE', reviewRequired: true, reviewReason: 'MANUAL_TAX_OVERRIDE_REASON_REQUIRED', settlementBlocked: true, isFinal: false, isProvisional: true });
        }
        else {
            cgt = Object.assign(Object.assign({}, cgt), { cgtAmount: money(Math.max(0, Number(input.cgtOverrideAmount))), calculationBasis: 'MANUAL_OVERRIDE', reviewRequired: true, reviewReason: 'MANUAL_TAX_OVERRIDE', settlementBlocked: false, isFinal: true, isProvisional: false });
        }
    }
    const cgwt = (0, cgtCalculation_1.calculateCapitalGainsWithholding)({
        saleConsideration: salePrice,
        cgwtRate: input.cgwtRate,
        applicability: input.cgwtApplicability,
        notApplicableReason: input.cgwtNotApplicableReason
    });
    const waterfall = (0, settlementWaterfall_1.buildSettlementWaterfall)({
        grossSaleProceeds: salePrice,
        saleVat: vatOnSale,
        cgwt: cgwt.settlementBlocked ? 0 : cgwt.cgwtAmount,
        agencyCommission: commissionAmount,
        vatOnCommission,
        otherDeductions: input.otherDeductions
    });
    const settlementBlocked = Boolean(cgt.settlementBlocked || cgwt.settlementBlocked);
    const settlementStatus = settlementBlocked
        ? 'REQUIRES_TAX_REVIEW'
        : (cgt.isProvisional ? 'PROVISIONAL' : 'CALCULATED');
    return {
        cgt,
        cgwt,
        vatOnSale,
        vatOnCommission,
        commission: commissionAmount,
        waterfall,
        sellerNetPayout: waterfall.sellerNetProceeds,
        settlementBlocked,
        settlementStatus,
        breakdown: {
            cgtIsNotPercentOfSalePrice: true,
            cgwtIndependentOfCgt: true,
            settlementBlocked,
            appliedRules: {
                saleVatFromSnapshotOrInclusiveExtract: vatOnSale > 0,
                withholdingIsNotFinalCgt: true,
                missingRateDoesNotSettleAtZero: true
            }
        }
    };
};
exports.generateTaxSummary = generateTaxSummary;
exports.default = {
    generateTaxSummary: exports.generateTaxSummary,
    calculateCapitalGain: cgtCalculation_1.calculateCapitalGain,
    calculateCapitalGainsWithholding: cgtCalculation_1.calculateCapitalGainsWithholding
};
