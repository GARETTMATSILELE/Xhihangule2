import { roundMoney } from '../../utils/money';

/**
 * Phase F rental-tax rounding policy (individual landlord working papers).
 *
 * - TaxRule.rate is a **percentage** (15 means 15%).
 * - Convert once with taxPercentToFraction. Never hard-code a literal rate in calculation.
 * - taxAmount = roundMoney(taxBase × fraction, 2).
 * - Currency is the transaction currency unless an explicit conversion basis is stored.
 * - Do not use taxAmount = 0 as a stand-in for NOT_APPLICABLE or REVIEW_REQUIRED.
 */
export function taxPercentToFraction(percent: number | null | undefined): number {
  return Math.max(0, Number(percent || 0)) / 100;
}

export function roundRentalTaxMoney(amount: number): number {
  return roundMoney(amount, 2);
}

export function calculateGrossRentalPercent(taxBase: number, ratePercent: number): number {
  return roundRentalTaxMoney(Number(taxBase || 0) * taxPercentToFraction(ratePercent));
}
