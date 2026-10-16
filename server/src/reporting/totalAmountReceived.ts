import { moneyAmountsMatch, roundMoney } from '../utils/money';
import { StatementRentSourceName } from './statementRent';

export type ReceiptBasis =
  | 'allocation_gross'
  | 'payment_amount'
  | 'rent_plus_separate_levy'
  | 'rent_component'
  | 'unresolved';

export interface TotalAmountReceivedInput {
  paymentAmount?: number;
  depositAmount?: number;
  rentComponent?: number;
  rentSource?: StatementRentSourceName;
  levy?: number;
  /** Canonical receipt total already stored on the payment allocation, when present. */
  allocationGross?: number;
}

export interface TotalAmountReceivedResult {
  totalAmountReceived?: number;
  contractualRent?: number;
  levyIncludedInTotal: boolean;
  reviewRequired: boolean;
  basis: ReceiptBasis;
}

const positive = (value: unknown): number | undefined => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return roundMoney(amount);
};

/**
 * Total cash received from the tenant for one rental payment.
 * Uses the stored receipt when it exists. Adds a separate levy only when the
 * rent component is known to exclude it and no stored receipt is available.
 * Never adds the levy onto a figure that already contains it.
 */
export function resolveTotalAmountReceived(input: TotalAmountReceivedInput): TotalAmountReceivedResult {
  const levy = roundMoney(Math.max(0, Number(input.levy || 0)));
  const rent = positive(input.rentComponent);
  const allocationGross = positive(input.allocationGross);
  const paymentAmount = positive(input.paymentAmount);
  const deposit = positive(input.depositAmount) || 0;
  const rentPlusLevy = rent == null ? undefined : roundMoney(rent + levy);

  if (allocationGross != null) {
    const levyIncludedInTotal = levy > 0 && (
      (rentPlusLevy != null && moneyAmountsMatch(allocationGross, rentPlusLevy)) ||
      (input.rentSource === 'commission_base_plus_levy' && rent != null && moneyAmountsMatch(allocationGross, rent))
    );
    const reviewRequired = levy > 0 && rent != null
      && !moneyAmountsMatch(allocationGross, rent)
      && !(rentPlusLevy != null && moneyAmountsMatch(allocationGross, rentPlusLevy));
    return {
      totalAmountReceived: allocationGross,
      contractualRent: input.rentSource === 'commission_base_plus_levy' && rent != null
        ? roundMoney(Math.max(0, rent - levy))
        : rent,
      levyIncludedInTotal,
      reviewRequired,
      basis: 'allocation_gross'
    };
  }

  let cash = paymentAmount;
  if (cash != null && deposit > 0 && cash > deposit) {
    const netOfDeposit = roundMoney(cash - deposit);
    const depositIsSeparate = rent != null && (
      moneyAmountsMatch(netOfDeposit, rent) ||
      (rentPlusLevy != null && moneyAmountsMatch(netOfDeposit, rentPlusLevy))
    );
    if (depositIsSeparate) cash = netOfDeposit;
  }

  if (cash != null) {
    const levyIncludedInTotal = levy > 0 && (
      (rentPlusLevy != null && moneyAmountsMatch(cash, rentPlusLevy)) ||
      (input.rentSource === 'commission_base_plus_levy' && rent != null && moneyAmountsMatch(cash, rent))
    );
    const matchesKnownComponent = rent != null && (
      moneyAmountsMatch(cash, rent) ||
      (rentPlusLevy != null && moneyAmountsMatch(cash, rentPlusLevy))
    );
    return {
      totalAmountReceived: cash,
      contractualRent: input.rentSource === 'commission_base_plus_levy' && rent != null
        ? roundMoney(Math.max(0, rent - levy))
        : rent,
      levyIncludedInTotal,
      reviewRequired: levy > 0 && rent != null && !matchesKnownComponent,
      basis: 'payment_amount'
    };
  }

  if (rent != null && levy > 0 && (input.rentSource === 'rent_used' || input.rentSource === 'rent_allocated')) {
    return {
      totalAmountReceived: rentPlusLevy,
      contractualRent: rent,
      levyIncludedInTotal: true,
      reviewRequired: false,
      basis: 'rent_plus_separate_levy'
    };
  }

  if (rent != null) {
    const alreadyIncludesLevy = input.rentSource === 'commission_base_plus_levy' || input.rentSource === 'payment_amount';
    return {
      totalAmountReceived: rent,
      contractualRent: alreadyIncludesLevy ? roundMoney(Math.max(0, rent - levy)) : rent,
      levyIncludedInTotal: alreadyIncludesLevy && levy > 0,
      reviewRequired: levy > 0 && !alreadyIncludesLevy,
      basis: 'rent_component'
    };
  }

  return {
    totalAmountReceived: undefined,
    levyIncludedInTotal: false,
    reviewRequired: true,
    basis: 'unresolved'
  };
}
