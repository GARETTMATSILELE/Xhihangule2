import { roundMoney } from '../utils/money';

export type VatCommissionTreatment = 'inclusive' | 'exclusive';

export interface CommissionResult {
  totalCommission: number;
  preaFee: number;
  agentShare: number;
  agencyShare: number;
  ownerAmount: number;
}

export interface PropertyCommissionInput {
  grossRent: number;
  levy?: number;
  commissionPercentage: number;
  vatOnCommission?: boolean;
  vatTreatment?: VatCommissionTreatment | null;
  /** Decimal VAT rate, e.g. 0.155 for 15.5%. */
  vatRate?: number;
  commissionEnabled?: boolean;
  preaPercentOfTotal?: number;
  agentPercentOfRemaining?: number;
  agencyPercentOfRemaining?: number;
}

export interface PropertyCommissionResult extends CommissionResult {
  grossRent: number;
  levy: number;
  commissionBase: number;
  commissionRate: number;
  commissionGross: number;
  commissionNet: number;
  vatOnCommission: boolean;
  vatTreatment?: VatCommissionTreatment;
  vatRate?: number;
  vatAmount: number;
  totalDeductions: number;
  ownerPayable: number;
}

const clampUnit = (value: number | undefined, fallback: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : fallback));

const splitCommission = (
  splitBase: number,
  options: Pick<PropertyCommissionInput, 'preaPercentOfTotal' | 'agentPercentOfRemaining' | 'agencyPercentOfRemaining'>
) => {
  const preaPercentOfTotal = clampUnit(options.preaPercentOfTotal, 0.03);
  const agentPercentOfRemaining = clampUnit(options.agentPercentOfRemaining, 0.6);
  const agencyPercentOfRemaining = clampUnit(options.agencyPercentOfRemaining, 0.4);
  const preaFee = roundMoney(splitBase * preaPercentOfTotal);
  const remainingCommission = roundMoney(splitBase - preaFee);
  const agentShare = roundMoney(remainingCommission * agentPercentOfRemaining);
  const agencyShare = roundMoney(remainingCommission * agencyPercentOfRemaining);
  return { preaFee, agentShare, agencyShare };
};

export const normalizeVatCommissionTreatment = (
  vatOnCommission: boolean,
  treatment?: string | null
): VatCommissionTreatment | undefined => {
  if (!vatOnCommission) return undefined;
  return String(treatment || '').toLowerCase() === 'inclusive' ? 'inclusive' : 'exclusive';
};

export const sanitizePropertyVatSettings = (input: {
  vatOnCommission?: unknown;
  vatCommissionTreatment?: unknown;
}): { vatOnCommission: boolean; vatCommissionTreatment?: VatCommissionTreatment } => {
  const vatOnCommission = Boolean(input.vatOnCommission);
  return {
    vatOnCommission,
    vatCommissionTreatment: normalizeVatCommissionTreatment(vatOnCommission, input.vatCommissionTreatment as string | null)
  };
};

export const calculatePropertyCommission = (input: PropertyCommissionInput): PropertyCommissionResult => {
  const grossRent = roundMoney(Math.max(0, Number(input.grossRent || 0)));
  const levy = roundMoney(Math.max(0, Number(input.levy || 0)));
  const commissionRate = Math.max(0, Number(input.commissionPercentage || 0));
  const commissionBase = roundMoney(Math.max(0, grossRent - levy));
  const vatOnCommission = Boolean(input.vatOnCommission);
  const vatTreatment = normalizeVatCommissionTreatment(vatOnCommission, input.vatTreatment);
  const vatRate = vatOnCommission ? Math.max(0, Number(input.vatRate || 0)) : 0;

  if (input.commissionEnabled === false) {
    return {
      grossRent,
      levy,
      commissionBase,
      commissionRate,
      commissionGross: 0,
      commissionNet: 0,
      totalCommission: 0,
      preaFee: 0,
      agentShare: 0,
      agencyShare: 0,
      vatOnCommission: false,
      vatTreatment: undefined,
      vatRate: undefined,
      vatAmount: 0,
      totalDeductions: levy,
      ownerPayable: commissionBase,
      ownerAmount: roundMoney(commissionBase + levy)
    };
  }

  const calculatedCommission = roundMoney((commissionBase * commissionRate) / 100);
  let commissionGross = calculatedCommission;
  let commissionNet = calculatedCommission;
  let vatAmount = 0;

  if (vatOnCommission && vatRate > 0 && calculatedCommission > 0) {
    if (vatTreatment === 'inclusive') {
      commissionGross = calculatedCommission;
      commissionNet = roundMoney(commissionGross / (1 + vatRate));
      vatAmount = roundMoney(commissionGross - commissionNet);
    } else {
      commissionGross = calculatedCommission;
      commissionNet = calculatedCommission;
      vatAmount = roundMoney(commissionGross * vatRate);
    }
  }

  const ownerCommissionDeduction = vatTreatment === 'inclusive'
    ? commissionGross
    : roundMoney(commissionNet + vatAmount);
  const ownerPayable = roundMoney(Math.max(0, commissionBase - ownerCommissionDeduction));
  const split = splitCommission(commissionNet, input);
  const totalDeductions = roundMoney(levy + ownerCommissionDeduction);

  return {
    grossRent,
    levy,
    commissionBase,
    commissionRate,
    commissionGross,
    commissionNet,
    totalCommission: commissionNet,
    preaFee: split.preaFee,
    agentShare: split.agentShare,
    agencyShare: split.agencyShare,
    vatOnCommission,
    vatTreatment,
    vatRate: vatOnCommission ? vatRate : undefined,
    vatAmount,
    totalDeductions,
    ownerPayable,
    ownerAmount: roundMoney(ownerPayable + levy)
  };
};

export const toPaymentCommissionSnapshot = (result: PropertyCommissionResult) => ({
  totalCommission: result.totalCommission,
  preaFee: result.preaFee,
  agentShare: result.agentShare,
  agencyShare: result.agencyShare,
  vatOnCommission: result.vatAmount,
  ownerAmount: result.ownerAmount,
  levy: result.levy,
  commissionBase: result.commissionBase,
  commissionRate: result.commissionRate,
  commissionGross: result.commissionGross,
  commissionNet: result.commissionNet,
  vatTreatment: result.vatTreatment,
  vatRate: result.vatRate,
  vatAmount: result.vatAmount
});

export const applyLevyPassThroughToSnapshot = (
  result: PropertyCommissionResult,
  rentPortion: number,
  levyPortion: number
) => {
  const snapshot = toPaymentCommissionSnapshot(result);
  const ownerCommissionDeduction = result.vatTreatment === 'inclusive'
    ? result.commissionGross
    : roundMoney(result.totalCommission + result.vatAmount);
  snapshot.levy = roundMoney(Math.max(0, levyPortion));
  snapshot.ownerAmount = roundMoney(Math.max(0, roundMoney(rentPortion) - ownerCommissionDeduction) + snapshot.levy);
  return snapshot;
};
