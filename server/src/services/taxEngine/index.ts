export interface TaxEngineConfig {
  cgtRate: number;
  vatSaleRate: number;
  vatOnCommissionRate: number;
  applyVatOnSale: boolean;
}

export interface SettlementInput {
  salePrice: number;
  commissionAmount: number;
  vatOnCommissionAmount?: number;
  applyVatOnSale?: boolean;
  cgtRate?: number;
  vatSaleRate?: number;
  vatOnCommissionRate?: number;
}

export interface TaxSummary {
  cgt: number;
  vatOnSale: number;
  vatOnCommission: number;
  commission: number;
  totalDeductions: number;
  sellerNetPayout: number;
  breakdown: Record<string, unknown>;
}

const DEFAULT_CONFIG: TaxEngineConfig = {
  cgtRate: 0.2,
  vatSaleRate: 0.15,
  vatOnCommissionRate: 0.155,
  applyVatOnSale: false
};

const money = (n: number): number => Number(Number(n || 0).toFixed(2));

export const calculateCGT = (salePrice: number, cgtRate = DEFAULT_CONFIG.cgtRate): number => {
  return money(Math.max(0, salePrice) * Math.max(0, cgtRate));
};

export const calculateVATOnSale = (
  salePrice: number,
  applyVatOnSale = DEFAULT_CONFIG.applyVatOnSale,
  vatSaleRate = DEFAULT_CONFIG.vatSaleRate
): number => {
  if (!applyVatOnSale) return 0;
  return money(Math.max(0, salePrice) * Math.max(0, vatSaleRate));
};

export const calculateCommissionVAT = (
  commissionAmount: number,
  vatOnCommissionRate = DEFAULT_CONFIG.vatOnCommissionRate
): number => {
  return money(Math.max(0, commissionAmount) * Math.max(0, vatOnCommissionRate));
};

export const calculateSellerNetPayout = (salePrice: number, deductions: number[]): number => {
  const totalDeductions = money(deductions.reduce((sum, d) => sum + money(d), 0));
  return money(Math.max(0, money(salePrice) - totalDeductions));
};

export const generateTaxSummary = (input: SettlementInput): TaxSummary => {
  const salePrice = money(input.salePrice);
  const commissionAmount = money(input.commissionAmount);
  const cgt = calculateCGT(salePrice, input.cgtRate ?? DEFAULT_CONFIG.cgtRate);
  const vatOnSale = calculateVATOnSale(
    salePrice,
    input.applyVatOnSale ?? DEFAULT_CONFIG.applyVatOnSale,
    input.vatSaleRate ?? DEFAULT_CONFIG.vatSaleRate
  );
  const vatOnCommission =
    input.vatOnCommissionAmount != null
      ? money(input.vatOnCommissionAmount)
      : calculateCommissionVAT(commissionAmount, input.vatOnCommissionRate ?? DEFAULT_CONFIG.vatOnCommissionRate);

  const deductions = [cgt, vatOnSale, commissionAmount, vatOnCommission];
  const totalDeductions = money(deductions.reduce((sum, d) => sum + d, 0));
  const sellerNetPayout = calculateSellerNetPayout(salePrice, deductions);

  return {
    cgt,
    vatOnSale,
    vatOnCommission,
    commission: commissionAmount,
    totalDeductions,
    sellerNetPayout,
    breakdown: {
      configuredRates: {
        cgtRate: input.cgtRate ?? DEFAULT_CONFIG.cgtRate,
        vatSaleRate: input.vatSaleRate ?? DEFAULT_CONFIG.vatSaleRate,
        vatOnCommissionRate: input.vatOnCommissionRate ?? DEFAULT_CONFIG.vatOnCommissionRate
      },
      appliedRules: {
        cgtFirst: true,
        vatOnSaleApplied: input.applyVatOnSale ?? DEFAULT_CONFIG.applyVatOnSale,
        vatOnCommissionApplied: true,
        vatOnCommissionSource: input.vatOnCommissionAmount != null ? 'payment' : 'calculated'
      }
    }
  };
};

export default {
  calculateCGT,
  calculateVATOnSale,
  calculateCommissionVAT,
  calculateSellerNetPayout,
  generateTaxSummary
};
