export type PaymentStatus = 'paid' | 'partial' | 'overdue';

export interface OwnerFinancialSummaryInput {
  grossIncome: number;
  expenses: number;
  commissionRate: number;
  amountPaidToOwner: number;
}

export interface OwnerFinancialSummary {
  grossIncome: number;
  expenses: number;
  commissionRate: number;
  managementFee: number;
  netAmountPayable: number;
  amountPaidToOwner: number;
  balanceOwedToOwner: number;
}

export interface UnifiedTransactionItem {
  id: string;
  date: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateOwnerFinancialSummary = (
  input: OwnerFinancialSummaryInput
): OwnerFinancialSummary => {
  const grossIncome = toNumber(input.grossIncome);
  const expenses = toNumber(input.expenses);
  const commissionRate = Math.max(0, toNumber(input.commissionRate));
  const amountPaidToOwner = toNumber(input.amountPaidToOwner);

  // Owner dashboard excludes management fees; payable is based on cash movement only.
  const managementFee = 0;
  const netAmountPayable = grossIncome - expenses;
  const balanceOwedToOwner = netAmountPayable - amountPaidToOwner;

  return {
    grossIncome,
    expenses,
    commissionRate,
    managementFee,
    netAmountPayable,
    amountPaidToOwner,
    balanceOwedToOwner,
  };
};

export const derivePaymentStatus = (expectedRent: number, receivedAmount: number): PaymentStatus => {
  const expected = Math.max(0, toNumber(expectedRent));
  const received = Math.max(0, toNumber(receivedAmount));

  if (expected === 0) {
    return received > 0 ? 'paid' : 'overdue';
  }
  if (received >= expected) return 'paid';
  if (received > 0) return 'partial';
  return 'overdue';
};

export const daysUntil = (dateStr?: string): number | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const ms = date.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

export const buildUnifiedTransactions = (transactions: any[]): UnifiedTransactionItem[] => {
  const items = Array.isArray(transactions) ? transactions : [];

  return items
    .filter((tx) => tx?.type === 'income' || tx?.type === 'expense')
    .map((tx, index): UnifiedTransactionItem => {
      const transactionType: UnifiedTransactionItem['type'] =
        tx?.type === 'expense' ? 'expense' : 'income';

      return {
        id: String(tx?.id || tx?._id || `${tx?.type || 'tx'}-${index}`),
        date: String(tx?.date || tx?.createdAt || new Date(0).toISOString()),
        type: transactionType,
        description: String(
          tx?.description || (transactionType === 'income' ? 'Rent payment received' : 'Property expense')
        ),
        amount: toNumber(tx?.amount),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};
