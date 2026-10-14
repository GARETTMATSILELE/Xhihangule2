import { calculateCapitalGain, calculateCapitalGainsWithholding, type CapitalGainResult, type CgwtApplicability, type CgwtResult } from '../tax/cgtCalculation';
import { extractInclusiveVat } from '../tax/vatCalculation';
import { buildSettlementWaterfall, type SettlementWaterfallResult } from '../tax/settlementWaterfall';
import { roundMoney } from '../../utils/money';

export interface SettlementInput {
  salePrice: number;
  commissionAmount: number;
  vatOnCommissionAmount?: number;
  applyVatOnSale?: boolean;
  saleVatAmount?: number;
  saleVatRate?: number;
  acquisitionCost?: number | null;
  improvementCosts?: number | null;
  qualifyingExpenses?: number | null;
  sellingCosts?: number | null;
  otherAdjustments?: number | null;
  cgtRate?: number | null;
  cgwtRate?: number | null;
  cgwtApplicability?: CgwtApplicability | null;
  cgwtNotApplicableReason?: string | null;
  cgtNotApplicable?: boolean;
  cgtNotApplicableReason?: string | null;
  cgtOverrideAmount?: number | null;
  cgtOverrideReason?: string | null;
  cgtOverrideUser?: string | null;
  otherDeductions?: Array<{ type?: string; amount: number; reason?: string }>;
}

export interface TaxSummary {
  cgt: CapitalGainResult;
  cgwt: CgwtResult;
  vatOnSale: number;
  vatOnCommission: number;
  commission: number;
  waterfall: SettlementWaterfallResult;
  sellerNetPayout: number;
  settlementBlocked: boolean;
  settlementStatus: 'CALCULATED' | 'REQUIRES_TAX_REVIEW' | 'PROVISIONAL';
  breakdown: Record<string, unknown>;
}

const money = (n: number): number => roundMoney(n);

export const generateTaxSummary = (input: SettlementInput): TaxSummary => {
  const salePrice = money(input.salePrice);
  const commissionAmount = money(input.commissionAmount);
  const vatOnCommission = input.vatOnCommissionAmount != null
    ? money(input.vatOnCommissionAmount)
    : 0;

  let vatOnSale = 0;
  if (input.saleVatAmount != null && Number(input.saleVatAmount) > 0) {
    vatOnSale = money(input.saleVatAmount);
  } else if (input.applyVatOnSale && Number(input.saleVatRate) > 0) {
    vatOnSale = extractInclusiveVat(salePrice, Number(input.saleVatRate)).vatAmount;
  }

  let cgt = calculateCapitalGain({
    salePrice,
    acquisitionCost: input.acquisitionCost,
    improvementCosts: input.improvementCosts,
    qualifyingExpenses: input.qualifyingExpenses,
    sellingCosts: input.sellingCosts,
    otherAdjustments: input.otherAdjustments,
    cgtRate: input.cgtRate,
    cgtNotApplicable: input.cgtNotApplicable,
    cgtNotApplicableReason: input.cgtNotApplicableReason
  });
  if (input.cgtOverrideAmount != null) {
    const reason = String(input.cgtOverrideReason || '').trim();
    if (!reason) {
      cgt = {
        ...cgt,
        calculationBasis: 'MANUAL_OVERRIDE',
        reviewRequired: true,
        reviewReason: 'MANUAL_TAX_OVERRIDE_REASON_REQUIRED',
        settlementBlocked: true,
        isFinal: false,
        isProvisional: true
      };
    } else {
      cgt = {
        ...cgt,
        cgtAmount: money(Math.max(0, Number(input.cgtOverrideAmount))),
        calculationBasis: 'MANUAL_OVERRIDE',
        reviewRequired: true,
        reviewReason: 'MANUAL_TAX_OVERRIDE',
        settlementBlocked: false,
        isFinal: true,
        isProvisional: false
      };
    }
  }

  const cgwt = calculateCapitalGainsWithholding({
    saleConsideration: salePrice,
    cgwtRate: input.cgwtRate,
    applicability: input.cgwtApplicability,
    notApplicableReason: input.cgwtNotApplicableReason
  });

  const waterfall = buildSettlementWaterfall({
    grossSaleProceeds: salePrice,
    saleVat: vatOnSale,
    cgwt: cgwt.settlementBlocked ? 0 : cgwt.cgwtAmount,
    agencyCommission: commissionAmount,
    vatOnCommission,
    otherDeductions: input.otherDeductions
  });

  const settlementBlocked = Boolean(cgt.settlementBlocked || cgwt.settlementBlocked);
  const settlementStatus = settlementBlocked
    ? 'REQUIRES_TAX_REVIEW'
    : (cgt.isProvisional ? 'PROVISIONAL' : 'CALCULATED');

  return {
    cgt,
    cgwt,
    vatOnSale,
    vatOnCommission,
    commission: commissionAmount,
    waterfall,
    sellerNetPayout: waterfall.sellerNetProceeds,
    settlementBlocked,
    settlementStatus,
    breakdown: {
      cgtIsNotPercentOfSalePrice: true,
      cgwtIndependentOfCgt: true,
      settlementBlocked,
      appliedRules: {
        saleVatFromSnapshotOrInclusiveExtract: vatOnSale > 0,
        withholdingIsNotFinalCgt: true,
        missingRateDoesNotSettleAtZero: true
      }
    }
  };
};

export default {
  generateTaxSummary,
  calculateCapitalGain,
  calculateCapitalGainsWithholding
};
