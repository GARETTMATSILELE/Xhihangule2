import { roundMoney } from '../../utils/money';

export type PaymentAllocation = {
  grossAmount: number;
  rent: number;
  levy: number;
  commissionBase: number;
  commission: number;
  commissionNet: number;
  vatOnCommission: number;
  otherDeductions: number;
  ownerPayable: number;
  levyPayable: number;
  companyRevenue: number;
  taxLiabilities: {
    vatOnCommission: number;
  };
  trustLiability: number;
  source: 'canonical_payment_allocation';
};

export type PaymentAllocationInput = {
  amount: number;
  rent?: number;
  levy?: number;
  commissionBase?: number;
  commissionNet: number;
  vatOnCommission: number;
  otherDeductions?: number;
};

/**
 * Single authoritative rental receipt split.
 * Levy is a separate client liability (body corporate / municipality pass-through).
 * Owner payable is the residual after commission, VAT on commission, levy, and other deductions.
 *
 * Trust residual = owner payable + levy payable = gross − company revenue − VAT − other deductions.
 */
export function allocateRentalReceipt(input: PaymentAllocationInput): PaymentAllocation {
  const grossAmount = roundMoney(Math.max(0, Number(input.amount || 0)));
  const levy = roundMoney(Math.max(0, Number(input.levy || 0)));
  const rent = roundMoney(Math.max(0, Number(input.rent != null ? input.rent : grossAmount - levy)));
  const commissionNet = roundMoney(Math.max(0, Number(input.commissionNet || 0)));
  const vatOnCommission = roundMoney(Math.max(0, Number(input.vatOnCommission || 0)));
  const otherDeductions = roundMoney(Math.max(0, Number(input.otherDeductions || 0)));
  const commissionBase = roundMoney(Math.max(0, Number(input.commissionBase != null ? input.commissionBase : rent)));
  const companyRevenue = commissionNet;
  const trustLiability = roundMoney(Math.max(0, grossAmount - companyRevenue - vatOnCommission - otherDeductions));
  const levyPayable = roundMoney(Math.min(levy, trustLiability));
  const ownerPayable = roundMoney(Math.max(0, trustLiability - levyPayable));

  return {
    grossAmount,
    rent,
    levy,
    commissionBase,
    commission: commissionNet,
    commissionNet,
    vatOnCommission,
    otherDeductions,
    ownerPayable,
    levyPayable,
    companyRevenue,
    taxLiabilities: { vatOnCommission },
    trustLiability,
    source: 'canonical_payment_allocation'
  };
}

export function allocationBalances(allocation: PaymentAllocation): boolean {
  const credits = roundMoney(
    allocation.companyRevenue +
      allocation.vatOnCommission +
      allocation.otherDeductions +
      allocation.ownerPayable +
      allocation.levyPayable
  );
  return credits === allocation.grossAmount && allocation.trustLiability === roundMoney(allocation.ownerPayable + allocation.levyPayable);
}
