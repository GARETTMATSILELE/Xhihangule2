export type AccountingDateSet = {
  originalTransactionDate: Date | null;
  accountingDate: Date;
  settlementDate: Date | null;
  bankPaymentDate: Date | null;
  postedAt: Date;
};

function copyDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * The accounting date controls the period gate and the ledger date.
 * The original transaction date is copied and is never replaced by the posting time.
 * A bank payment date is stored beside the accounting date and does not move the period.
 */
export function resolveAccountingDates(input: {
  originalTransactionDate?: Date | string | null;
  accountingDate?: Date | string | null;
  settlementDate?: Date | string | null;
  bankPaymentDate?: Date | string | null;
  postedAt?: Date;
}): AccountingDateSet {
  const postedAt = copyDate(input.postedAt) || new Date();
  const originalTransactionDate = copyDate(input.originalTransactionDate);
  const explicitAccountingDate = copyDate(input.accountingDate);
  const accountingDate = explicitAccountingDate || originalTransactionDate || postedAt;
  return {
    originalTransactionDate,
    accountingDate: new Date(accountingDate.getTime()),
    settlementDate: copyDate(input.settlementDate),
    bankPaymentDate: copyDate(input.bankPaymentDate),
    postedAt
  };
}
