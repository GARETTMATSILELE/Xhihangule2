import { roundMoney } from '../../utils/money';

export type CapitalGainInput = {
  salePrice: number;
  acquisitionCost?: number | null;
  improvementCosts?: number | null;
  qualifyingExpenses?: number | null;
  sellingCosts?: number | null;
  otherAdjustments?: number | null;
  /** Decimal CGT rate on the gain, e.g. 0.20. Must be supplied; never inferred from sale price. */
  cgtRate?: number | null;
  cgtNotApplicable?: boolean;
  cgtNotApplicableReason?: string | null;
};

export type CapitalGainResult = {
  salePrice: number;
  acquisitionCost: number;
  improvementCosts: number;
  qualifyingExpenses: number;
  sellingCosts: number;
  otherAdjustments: number;
  capitalGain: number;
  cgtRate: number;
  cgtAmount: number;
  provisionalCgtAmount?: number;
  calculationBasis:
    | 'CAPITAL_GAIN'
    | 'MISSING_ACQUISITION_COST'
    | 'NO_GAIN'
    | 'MANUAL_OVERRIDE'
    | 'CGT_RATE_MISSING'
    | 'CGT_NOT_APPLICABLE'
    | 'CGT_SETTLEMENT_REVIEW_REQUIRED';
  reviewRequired: boolean;
  reviewReason?: string;
  settlementBlocked: boolean;
  isFinal: boolean;
  isProvisional: boolean;
};

export type CgwtApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'REVIEW_REQUIRED';

export type CgwtInput = {
  saleConsideration: number;
  /** Decimal withholding rate on consideration. Independent of final CGT. */
  cgwtRate?: number | null;
  applicability?: CgwtApplicability | null;
  notApplicableReason?: string | null;
};

export type CgwtResult = {
  saleConsideration: number;
  cgwtRate: number;
  cgwtAmount: number;
  calculationBasis: 'SALE_CONSIDERATION' | 'CGWT_RATE_MISSING' | 'CGWT_NOT_APPLICABLE' | 'CGWT_REVIEW_REQUIRED';
  applicability: CgwtApplicability;
  reviewRequired: boolean;
  reviewReason?: string;
  settlementBlocked: boolean;
  isFinal: boolean;
};

export function calculateCapitalGain(input: CapitalGainInput): CapitalGainResult {
  const salePrice = roundMoney(Math.max(0, Number(input.salePrice || 0)));
  const acquisitionCost = input.acquisitionCost == null ? null : roundMoney(Math.max(0, Number(input.acquisitionCost)));
  const improvementCosts = roundMoney(Math.max(0, Number(input.improvementCosts || 0)));
  const qualifyingExpenses = roundMoney(Math.max(0, Number(input.qualifyingExpenses || 0)));
  const sellingCosts = roundMoney(Math.max(0, Number(input.sellingCosts || 0)));
  const otherAdjustments = roundMoney(Number(input.otherAdjustments || 0));
  const cgtRate = input.cgtRate == null ? 0 : Math.max(0, Number(input.cgtRate));

  const base = {
    salePrice,
    acquisitionCost: acquisitionCost == null ? 0 : acquisitionCost,
    improvementCosts,
    qualifyingExpenses,
    sellingCosts,
    otherAdjustments,
    cgtRate
  };

  if (input.cgtNotApplicable) {
    const reason = String(input.cgtNotApplicableReason || '').trim();
    if (!reason) {
      return {
        ...base,
        capitalGain: 0,
        cgtAmount: 0,
        calculationBasis: 'CGT_SETTLEMENT_REVIEW_REQUIRED',
        reviewRequired: true,
        reviewReason: 'CGT_NOT_APPLICABLE_REASON_REQUIRED',
        settlementBlocked: true,
        isFinal: false,
        isProvisional: true
      };
    }
    return {
      ...base,
      capitalGain: 0,
      cgtAmount: 0,
      calculationBasis: 'CGT_NOT_APPLICABLE',
      reviewRequired: false,
      settlementBlocked: false,
      isFinal: true,
      isProvisional: false
    };
  }

  if (acquisitionCost == null) {
    const provisionalGain = roundMoney(salePrice - improvementCosts - qualifyingExpenses - sellingCosts + otherAdjustments);
    const provisionalCgtAmount = cgtRate > 0 && provisionalGain > 0 ? roundMoney(provisionalGain * cgtRate) : 0;
    return {
      ...base,
      capitalGain: 0,
      cgtAmount: 0,
      provisionalCgtAmount,
      calculationBasis: 'MISSING_ACQUISITION_COST',
      reviewRequired: true,
      reviewReason: 'CGT_SETTLEMENT_REVIEW_REQUIRED',
      settlementBlocked: true,
      isFinal: false,
      isProvisional: true
    };
  }

  const capitalGain = roundMoney(
    salePrice - acquisitionCost - improvementCosts - qualifyingExpenses - sellingCosts + otherAdjustments
  );

  if (capitalGain <= 0) {
    return {
      ...base,
      capitalGain,
      cgtAmount: 0,
      calculationBasis: 'NO_GAIN',
      reviewRequired: false,
      settlementBlocked: false,
      isFinal: true,
      isProvisional: false
    };
  }

  if (!(cgtRate > 0)) {
    return {
      ...base,
      cgtRate: 0,
      capitalGain,
      cgtAmount: 0,
      calculationBasis: 'CGT_RATE_MISSING',
      reviewRequired: true,
      reviewReason: 'CGT_RATE_NOT_CONFIGURED',
      settlementBlocked: true,
      isFinal: false,
      isProvisional: true
    };
  }

  return {
    ...base,
    capitalGain,
    cgtAmount: roundMoney(capitalGain * cgtRate),
    calculationBasis: 'CAPITAL_GAIN',
    reviewRequired: false,
    settlementBlocked: false,
    isFinal: true,
    isProvisional: false
  };
}

export function calculateCapitalGainsWithholding(input: CgwtInput): CgwtResult {
  const saleConsideration = roundMoney(Math.max(0, Number(input.saleConsideration || 0)));
  const cgwtRate = input.cgwtRate == null ? 0 : Math.max(0, Number(input.cgwtRate));
  const applicability: CgwtApplicability = input.applicability
    || (cgwtRate > 0 ? 'APPLICABLE' : saleConsideration > 0 ? 'REVIEW_REQUIRED' : 'NOT_APPLICABLE');

  if (applicability === 'NOT_APPLICABLE') {
    const reason = String(input.notApplicableReason || '').trim();
    if (saleConsideration > 0 && !reason) {
      return {
        saleConsideration,
        cgwtRate,
        cgwtAmount: 0,
        calculationBasis: 'CGWT_REVIEW_REQUIRED',
        applicability: 'REVIEW_REQUIRED',
        reviewRequired: true,
        reviewReason: 'CGWT_NOT_APPLICABLE_REASON_REQUIRED',
        settlementBlocked: true,
        isFinal: false
      };
    }
    return {
      saleConsideration,
      cgwtRate: 0,
      cgwtAmount: 0,
      calculationBasis: 'CGWT_NOT_APPLICABLE',
      applicability: 'NOT_APPLICABLE',
      reviewRequired: false,
      settlementBlocked: false,
      isFinal: true
    };
  }

  if (!(cgwtRate > 0)) {
    return {
      saleConsideration,
      cgwtRate: 0,
      cgwtAmount: 0,
      calculationBasis: 'CGWT_RATE_MISSING',
      applicability: 'REVIEW_REQUIRED',
      reviewRequired: saleConsideration > 0,
      reviewReason: saleConsideration > 0 ? 'CGWT_RATE_MISSING' : undefined,
      settlementBlocked: saleConsideration > 0,
      isFinal: false
    };
  }

  if (applicability === 'REVIEW_REQUIRED') {
    return {
      saleConsideration,
      cgwtRate,
      cgwtAmount: 0,
      calculationBasis: 'CGWT_REVIEW_REQUIRED',
      applicability: 'REVIEW_REQUIRED',
      reviewRequired: true,
      reviewReason: 'CGWT_APPLICABILITY_UNDECIDED',
      settlementBlocked: saleConsideration > 0,
      isFinal: false
    };
  }

  return {
    saleConsideration,
    cgwtRate,
    cgwtAmount: roundMoney(saleConsideration * cgwtRate),
    calculationBasis: 'SALE_CONSIDERATION',
    applicability: 'APPLICABLE',
    reviewRequired: false,
    settlementBlocked: false,
    isFinal: true
  };
}

export function isFlatSalePriceCgt(salePrice: number, cgtAmount: number, presumedRate = 0.2): boolean {
  const expected = roundMoney(Math.max(0, Number(salePrice || 0)) * presumedRate);
  return expected > 0 && roundMoney(cgtAmount) === expected;
}
