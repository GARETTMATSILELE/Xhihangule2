import { roundMoney } from '../../utils/money';
import { taxPercentToFraction } from './rentalTaxRounding';

/**
 * Phase G ordinary income-tax rounding.
 * TaxRule.rate is a percentage. Never hard-code a literal rate or PAYE bands.
 */
export function roundIncomeTaxMoney(amount: number): number {
  return roundMoney(amount, 2);
}

export function calculateTaxableIncomePercent(taxableIncome: number, ratePercent: number): number {
  const base = Number(taxableIncome || 0);
  if (base <= 0) return 0;
  return roundIncomeTaxMoney(base * taxPercentToFraction(ratePercent));
}
