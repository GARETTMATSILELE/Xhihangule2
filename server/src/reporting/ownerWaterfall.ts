import { moneyAmountsMatch, moneyDifference, roundMoney } from '../utils/money';

/**
 * Explains the owner amount from amounts already stored on the payment snapshot.
 * It does not look up today's tax rate, commission percent, or property type.
 */
export interface OwnerWaterfallExplanation {
  grossAmount: number;
  commissionAmount: number;
  levyAmount: number;
  vatOnCommission: number;
  vatRate?: number;
  netOwnerAmount: number;
  recordedOwnerAmount?: number;
  difference: number;
  reviewRequired: boolean;
  formula: string;
}

export function explainOwnerWaterfall(input: {
  grossAmount: number;
  commissionAmount: number;
  levyAmount: number;
  vatOnCommission: number;
  vatRate?: number;
  recordedOwnerAmount?: number;
}): OwnerWaterfallExplanation {
  const grossAmount = roundMoney(input.grossAmount);
  const commissionAmount = roundMoney(input.commissionAmount);
  const levyAmount = roundMoney(input.levyAmount);
  const vatOnCommission = roundMoney(input.vatOnCommission);
  const netOwnerAmount = roundMoney(grossAmount - commissionAmount - levyAmount - vatOnCommission);
  const recordedOwnerAmount = input.recordedOwnerAmount == null
    ? undefined
    : roundMoney(input.recordedOwnerAmount);
  const difference = recordedOwnerAmount == null ? 0 : moneyDifference(netOwnerAmount, recordedOwnerAmount);
  return {
    grossAmount,
    commissionAmount,
    levyAmount,
    vatOnCommission,
    vatRate: input.vatRate,
    netOwnerAmount,
    recordedOwnerAmount,
    difference,
    reviewRequired: recordedOwnerAmount != null && !moneyAmountsMatch(netOwnerAmount, recordedOwnerAmount),
    formula: 'Total amount received − commission − levy − VAT on commission = net amount due to owner'
  };
}
