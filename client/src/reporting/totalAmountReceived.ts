export type StatementRentSourceName =
  | 'rent_used'
  | 'rent_allocated'
  | 'stored_gross_rent'
  | 'commission_base_plus_levy'
  | 'payment_amount';

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
  allocationGross?: number;
}

export interface TotalAmountReceivedResult {
  totalAmountReceived?: number;
  contractualRent?: number;
  levyIncludedInTotal: boolean;
  reviewRequired: boolean;
  basis: ReceiptBasis;
}

const roundMoney = (amount: number): number => Math.round(Number(amount || 0) * 100) / 100;
const matches = (left: number, right: number): boolean => roundMoney(left) === roundMoney(right);
const positive = (value: unknown): number | undefined => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return roundMoney(amount);
};

export function explainDashboardRent(input: {
  rentUsed?: number;
  advanceMonthsPaid?: number;
  rentAllocated?: number;
  commissionBase?: number;
  levy?: number;
  grossRent?: number;
  amount?: number;
}): { amount?: number; source?: StatementRentSourceName } {
  const months = Math.max(1, Number(input.advanceMonthsPaid || 1));
  const rentUsed = Number(input.rentUsed);
  if (Number.isFinite(rentUsed) && rentUsed > 0) return { amount: roundMoney(rentUsed * months), source: 'rent_used' };
  const rentAllocated = Number(input.rentAllocated);
  if (Number.isFinite(rentAllocated) && rentAllocated > 0) return { amount: roundMoney(rentAllocated), source: 'rent_allocated' };
  const storedGrossRent = Number(input.grossRent);
  if (Number.isFinite(storedGrossRent) && storedGrossRent > 0) return { amount: roundMoney(storedGrossRent), source: 'stored_gross_rent' };
  const commissionBase = Number(input.commissionBase);
  if (Number.isFinite(commissionBase) && commissionBase > 0) {
    const levy = Number(input.levy);
    const storedLevy = Number.isFinite(levy) && levy > 0 ? levy : 0;
    return { amount: roundMoney(commissionBase + storedLevy), source: 'commission_base_plus_levy' };
  }
  const amount = Number(input.amount);
  if (Number.isFinite(amount) && amount > 0) return { amount: roundMoney(amount), source: 'payment_amount' };
  return {};
}

/** Same receipt rule as the property statement. Does not add a levy that is already inside the stored cash total. */
export function resolveTotalAmountReceived(input: TotalAmountReceivedInput): TotalAmountReceivedResult {
  const levy = roundMoney(Math.max(0, Number(input.levy || 0)));
  const rent = positive(input.rentComponent);
  const allocationGross = positive(input.allocationGross);
  const paymentAmount = positive(input.paymentAmount);
  const deposit = positive(input.depositAmount) || 0;
  const rentPlusLevy = rent == null ? undefined : roundMoney(rent + levy);

  if (allocationGross != null) {
    const levyIncludedInTotal = levy > 0 && (
      (rentPlusLevy != null && matches(allocationGross, rentPlusLevy)) ||
      (input.rentSource === 'commission_base_plus_levy' && rent != null && matches(allocationGross, rent))
    );
    const reviewRequired = levy > 0 && rent != null
      && !matches(allocationGross, rent)
      && !(rentPlusLevy != null && matches(allocationGross, rentPlusLevy));
    return {
      totalAmountReceived: allocationGross,
      contractualRent: input.rentSource === 'commission_base_plus_levy' && rent != null ? roundMoney(Math.max(0, rent - levy)) : rent,
      levyIncludedInTotal,
      reviewRequired,
      basis: 'allocation_gross'
    };
  }

  let cash = paymentAmount;
  if (cash != null && deposit > 0 && cash > deposit) {
    const netOfDeposit = roundMoney(cash - deposit);
    const depositIsSeparate = rent != null && (
      matches(netOfDeposit, rent) ||
      (rentPlusLevy != null && matches(netOfDeposit, rentPlusLevy))
    );
    if (depositIsSeparate) cash = netOfDeposit;
  }

  if (cash != null) {
    const levyIncludedInTotal = levy > 0 && (
      (rentPlusLevy != null && matches(cash, rentPlusLevy)) ||
      (input.rentSource === 'commission_base_plus_levy' && rent != null && matches(cash, rent))
    );
    const matchesKnownComponent = rent != null && (
      matches(cash, rent) ||
      (rentPlusLevy != null && matches(cash, rentPlusLevy))
    );
    return {
      totalAmountReceived: cash,
      contractualRent: input.rentSource === 'commission_base_plus_levy' && rent != null ? roundMoney(Math.max(0, rent - levy)) : rent,
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

  return { levyIncludedInTotal: false, reviewRequired: true, basis: 'unresolved' };
}
