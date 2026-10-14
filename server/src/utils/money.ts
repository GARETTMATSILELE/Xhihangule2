import mongoose from 'mongoose';

export interface TaxBreakdownResult {
  subtotal: number;
  amountExcludingTax: number;
  taxAmount: number;
  totalAmount: number;
}

export interface CommissionSplit {
  totalCommission: number;
  preaFee: number;
  agentShare: number;
  agencyShare: number;
  ownerAmount: number;
}

export function roundMoney(amount: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(Number(amount || 0) * factor) / factor;
}

/** Compare monetary values after canonical rounding. Avoids int/float false mismatches. */
export function moneyAmountsMatch(a: unknown, b: unknown): boolean {
  return roundMoney(Number(a || 0)) === roundMoney(Number(b || 0));
}

export function moneyDifference(expected: unknown, actual: unknown): number {
  return roundMoney(Number(actual || 0) - Number(expected || 0));
}

/** Compare Mongo ObjectId / string identities without false mismatches. */
export function idsEqual(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

export function calculateTaxBreakdown(items: any[], discount: number = 0, taxPercentage: number = 15): TaxBreakdownResult {
  const lines = (items || []).map((item: any) => ({
    net: Number(item?.netPrice || 0),
    rate: item?.taxPercentage == null || item?.taxPercentage === ''
      ? Number(taxPercentage || 0)
      : Number(item.taxPercentage || 0)
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.net, 0);
  const discountAmount = Number(discount || 0);
  const amountExcludingTax = subtotal - discountAmount;
  const rates = lines.map((line) => line.rate);
  const uniformRate = rates.length === 0 || rates.every((rate) => rate === rates[0]);
  const taxAmount = uniformRate
    ? (amountExcludingTax * Number(rates[0] ?? taxPercentage ?? 0)) / 100
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

export function computeCommissionFallback(amount: number, commissionPercentage: number, options?: {
  preaPercentOfTotal?: number;
  agentPercentOfRemaining?: number;
  agencyPercentOfRemaining?: number;
}): CommissionSplit {
  const preaPercent = Math.max(0, Math.min(1, options?.preaPercentOfTotal ?? 0.03));
  const agentPercent = Math.max(0, Math.min(1, options?.agentPercentOfRemaining ?? 0.6));
  const agencyPercent = Math.max(0, Math.min(1, options?.agencyPercentOfRemaining ?? 0.4));
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

export function formatCurrency(amount: number, currency: 'USD' | 'ZAR' | 'ZiG' = 'USD'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
  if (currency === 'ZAR') {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
  }
  // ZiG formatting (no ISO code)
  return `ZiG ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount || 0))}`;
}










