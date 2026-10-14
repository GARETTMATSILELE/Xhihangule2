import { roundMoney } from '../../utils/money';

/**
 * Phase E VAT rounding policy (individual landlord working papers).
 *
 * - TaxRule.rate is a **percentage** (15.5 means 15.5%).
 * - extractInclusiveVat / exclusiveVatOn take a **0–1 fraction**.
 * - Convert once with vatPercentToFraction. Never hard-code 15 or 15.5 in calculation.
 * - Round to 2 decimal places with roundMoney at the calculation result boundary
 *   (gross, net, vatAmount). Do not round intermediate divisions except via those helpers.
 * - Do not use VAT = 0 as a stand-in for NOT_APPLICABLE.
 */
export function vatPercentToFraction(percent: number | null | undefined): number {
  return Math.max(0, Number(percent || 0)) / 100;
}

export function roundVatMoney(amount: number): number {
  return roundMoney(amount, 2);
}
