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

export function calculateTaxBreakdown(items: any[], discount: number = 0, taxPercentage: number = 15): TaxBreakdownResult {
  const subtotal = items.reduce((sum: number, item: any) => sum + Number(item?.netPrice || 0), 0);
  const amountExcludingTax = subtotal - Number(discount || 0);
  const taxAmount = (amountExcludingTax * Number(taxPercentage || 0)) / 100;
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
  const totalCommission = (Number(amount || 0) * Number(commissionPercentage || 0)) / 100;
  const preaFee = totalCommission * preaPercent;
  const remainingCommission = totalCommission - preaFee;
  const agentShare = remainingCommission * agentPercent;
  const agencyShare = remainingCommission * agencyPercent;
  return {
    totalCommission,
    preaFee,
    agentShare,
    agencyShare,
    ownerAmount: Number(amount || 0) - totalCommission
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


