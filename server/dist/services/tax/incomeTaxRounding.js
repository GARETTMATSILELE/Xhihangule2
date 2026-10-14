"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundIncomeTaxMoney = roundIncomeTaxMoney;
exports.calculateTaxableIncomePercent = calculateTaxableIncomePercent;
const money_1 = require("../../utils/money");
const rentalTaxRounding_1 = require("./rentalTaxRounding");
/**
 * Phase G ordinary income-tax rounding.
 * TaxRule.rate is a percentage. Never hard-code a literal rate or PAYE bands.
 */
function roundIncomeTaxMoney(amount) {
    return (0, money_1.roundMoney)(amount, 2);
}
function calculateTaxableIncomePercent(taxableIncome, ratePercent) {
    const base = Number(taxableIncome || 0);
    if (base <= 0)
        return 0;
    return roundIncomeTaxMoney(base * (0, rentalTaxRounding_1.taxPercentToFraction)(ratePercent));
}
