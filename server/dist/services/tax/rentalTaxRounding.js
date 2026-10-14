"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxPercentToFraction = taxPercentToFraction;
exports.roundRentalTaxMoney = roundRentalTaxMoney;
exports.calculateGrossRentalPercent = calculateGrossRentalPercent;
const money_1 = require("../../utils/money");
/**
 * Phase F rental-tax rounding policy (individual landlord working papers).
 *
 * - TaxRule.rate is a **percentage** (15 means 15%).
 * - Convert once with taxPercentToFraction. Never hard-code a literal rate in calculation.
 * - taxAmount = roundMoney(taxBase × fraction, 2).
 * - Currency is the transaction currency unless an explicit conversion basis is stored.
 * - Do not use taxAmount = 0 as a stand-in for NOT_APPLICABLE or REVIEW_REQUIRED.
 */
function taxPercentToFraction(percent) {
    return Math.max(0, Number(percent || 0)) / 100;
}
function roundRentalTaxMoney(amount) {
    return (0, money_1.roundMoney)(amount, 2);
}
function calculateGrossRentalPercent(taxBase, ratePercent) {
    return roundRentalTaxMoney(Number(taxBase || 0) * taxPercentToFraction(ratePercent));
}
