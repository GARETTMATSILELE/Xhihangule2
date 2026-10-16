import { roundMoney } from '../utils/money';

export interface StatementRentSource {
  rentUsed?: number;
  advanceMonthsPaid?: number;
  rentAllocated?: number;
  commissionBase?: number;
  levy?: number;
  grossRent?: number;
  amount?: number;
}

export type StatementRentSourceName =
  | 'rent_used'
  | 'rent_allocated'
  | 'stored_gross_rent'
  | 'commission_base_plus_levy'
  | 'payment_amount';

export interface ExplainedStatementRent {
  amount?: number;
  source?: StatementRentSourceName;
}

/**
 * Landlord-facing rent component from stored payment fields.
 * Does not reconstruct rent from commission + owner amount.
 * commissionBase is rent less levy, so a stored levy is restored only when rentUsed/rentAllocated are absent.
 * payment.amount is a last-resort stored snapshot used only when no rent snapshot fields exist.
 * The source tells the receipt total whether this figure already includes the levy.
 */
export const explainStatementRentAmount = (input: StatementRentSource): ExplainedStatementRent => {
  const months = Math.max(1, Number(input.advanceMonthsPaid || 1));
  const rentUsed = Number(input.rentUsed);
  if (Number.isFinite(rentUsed) && rentUsed > 0) {
    return { amount: roundMoney(rentUsed * months), source: 'rent_used' };
  }

  const rentAllocated = Number(input.rentAllocated);
  if (Number.isFinite(rentAllocated) && rentAllocated > 0) {
    return { amount: roundMoney(rentAllocated), source: 'rent_allocated' };
  }

  const storedGrossRent = Number(input.grossRent);
  if (Number.isFinite(storedGrossRent) && storedGrossRent > 0) {
    return { amount: roundMoney(storedGrossRent), source: 'stored_gross_rent' };
  }

  const commissionBase = Number(input.commissionBase);
  if (Number.isFinite(commissionBase) && commissionBase > 0) {
    const levy = Number(input.levy);
    const storedLevy = Number.isFinite(levy) && levy > 0 ? levy : 0;
    return { amount: roundMoney(commissionBase + storedLevy), source: 'commission_base_plus_levy' };
  }

  const amount = Number(input.amount);
  if (Number.isFinite(amount) && amount > 0) {
    return { amount: roundMoney(amount), source: 'payment_amount' };
  }

  return {};
};

export const resolveStatementRentAmount = (input: StatementRentSource): number | undefined =>
  explainStatementRentAmount(input).amount;
