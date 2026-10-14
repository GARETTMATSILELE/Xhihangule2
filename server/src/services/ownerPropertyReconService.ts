import { roundMoney } from '../utils/money';
import { allocateRentalReceipt, allocationBalances, type PaymentAllocation } from './tax/paymentAllocation';
import { buildAgentReceiptJournal } from './tax/principalAgentJournal';
import { GL } from './tax/chartAccounts';

export type PaymentControlStatus =
  | 'FULLY_ALLOCATED'
  | 'PARTIALLY_ALLOCATED'
  | 'UNALLOCATED'
  | 'OVERPAYMENT'
  | 'REQUIRES_REVIEW';

export function classifyReceiptControlStatus(input: {
  paymentAmount: number;
  rent?: number;
  levy?: number;
}): { status: PaymentControlStatus; unallocatedAmount: number } {
  const paymentAmount = roundMoney(Math.max(0, Number(input.paymentAmount || 0)));
  const rent = roundMoney(Math.max(0, Number(input.rent || 0)));
  const levy = roundMoney(Math.max(0, Number(input.levy || 0)));
  const expected = roundMoney(rent + levy);
  if (!(paymentAmount > 0)) {
    return { status: 'UNALLOCATED', unallocatedAmount: 0 };
  }
  if (!(expected > 0)) {
    return { status: 'REQUIRES_REVIEW', unallocatedAmount: paymentAmount };
  }
  const unallocatedAmount = roundMoney(Math.max(0, paymentAmount - expected));
  if (unallocatedAmount > 0.005) {
    return { status: 'OVERPAYMENT', unallocatedAmount };
  }
  if (paymentAmount + 0.005 < expected) {
    return { status: 'PARTIALLY_ALLOCATED', unallocatedAmount: 0 };
  }
  return { status: 'FULLY_ALLOCATED', unallocatedAmount: 0 };
}

export function canonicalRentLevyExample(): {
  allocation: PaymentAllocation;
  journalAgrees: boolean;
  companyRevenueIsCommission: boolean;
} {
  const allocation = allocateRentalReceipt({
    amount: 1050,
    rent: 1000,
    levy: 50,
    commissionBase: 1000,
    commissionNet: 150,
    vatOnCommission: 23.25
  });
  const journal = buildAgentReceiptJournal({
    paymentType: 'rental',
    amount: allocation.grossAmount,
    ownerAmount: allocation.ownerPayable,
    commissionNet: allocation.commissionNet,
    vatAmount: allocation.vatOnCommission,
    levyAmount: allocation.levyPayable
  });
  return {
    allocation,
    journalAgrees:
      allocationBalances(allocation) &&
      journal.companyRevenue === 150 &&
      journal.ownerLiability === 826.75 &&
      journal.levyLiability === 50 &&
      journal.lines.some((l) => l.accountCode === GL.TRUST_BANK && l.debit === 1050) &&
      journal.lines.some((l) => l.accountCode === GL.AGENCY_REVENUE && l.credit === 150),
    companyRevenueIsCommission: allocation.companyRevenue === 150 && allocation.grossAmount === 1050
  };
}
