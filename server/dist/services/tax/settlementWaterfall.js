"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSettlementWaterfall = buildSettlementWaterfall;
const money_1 = require("../../utils/money");
/**
 * Auditable seller settlement waterfall. CGT liability is NOT a step here —
 * Capital Gains Withholding Tax is the trust deduction; final CGT is recorded separately.
 */
function buildSettlementWaterfall(input) {
    const gross = (0, money_1.roundMoney)(Math.max(0, Number(input.grossSaleProceeds || 0)));
    const steps = [
        {
            type: 'SELLER_NET',
            basis: 'GROSS_SALE_PROCEEDS',
            amount: gross,
            reason: 'Gross sale proceeds received into trust'
        }
    ];
    const deductions = [];
    const saleVat = (0, money_1.roundMoney)(Math.max(0, Number(input.saleVat || 0)));
    if (saleVat > 0) {
        deductions.push({
            type: 'VAT_OUTPUT',
            basis: 'PROPERTY_SALE_VAT',
            amount: saleVat,
            reason: 'Property sale output VAT withheld from seller proceeds'
        });
    }
    const cgwt = (0, money_1.roundMoney)(Math.max(0, Number(input.cgwt || 0)));
    if (cgwt > 0) {
        deductions.push({
            type: 'CAPITAL_GAINS_WITHHOLDING_TAX',
            basis: 'SALE_CONSIDERATION',
            amount: cgwt,
            reason: 'Capital Gains Withholding Tax withheld pending remittance to ZIMRA'
        });
    }
    const commission = (0, money_1.roundMoney)(Math.max(0, Number(input.agencyCommission || 0)));
    if (commission > 0) {
        deductions.push({
            type: 'AGENCY_COMMISSION',
            basis: 'COMMISSION_BASE',
            amount: commission,
            reason: 'Agency commission on sale'
        });
    }
    const vatOnCommission = (0, money_1.roundMoney)(Math.max(0, Number(input.vatOnCommission || 0)));
    if (vatOnCommission > 0) {
        deductions.push({
            type: 'VAT_ON_COMMISSION',
            basis: 'COMMISSION',
            amount: vatOnCommission,
            reason: 'VAT on agency commission'
        });
    }
    for (const other of input.otherDeductions || []) {
        const amount = (0, money_1.roundMoney)(Math.max(0, Number(other.amount || 0)));
        if (!(amount > 0))
            continue;
        deductions.push({
            type: 'OTHER_DEDUCTION',
            basis: String(other.type || 'OTHER'),
            amount,
            reason: other.reason || 'Other authorised deduction'
        });
    }
    const totalDeductions = (0, money_1.roundMoney)(deductions.reduce((s, d) => s + d.amount, 0));
    const sellerNetProceeds = (0, money_1.roundMoney)(Math.max(0, gross - totalDeductions));
    return {
        steps: [...steps, ...deductions, {
                type: 'SELLER_NET',
                basis: 'NET_AFTER_WATERFALL',
                amount: sellerNetProceeds,
                reason: 'Net seller proceeds after authorised deductions'
            }],
        sellerNetProceeds,
        totalDeductions
    };
}
