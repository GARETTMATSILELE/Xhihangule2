const toMoney = (value: number): number => Number(Number(value || 0).toFixed(2));

export const outstandingMonthKey = (year: number, month: number): string => `${year}-${month}`;

const monthLabelFormatter = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' });
export const formatOutstandingMonthLabel = (year: number, month: number): string =>
  monthLabelFormatter.format(new Date(year, month - 1, 1));

export const iterateOutstandingMonths = (
  start: Date,
  end: Date,
  cb: (year: number, month: number) => void,
  hardCapMonths = 240
): void => {
  let year = start.getFullYear();
  let month = start.getMonth() + 1;
  let count = 0;
  while ((year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth() + 1)) && count < hardCapMonths) {
    cb(year, month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    count += 1;
  }
};

export const getOutstandingRangeForLease = (
  lease: any,
  property: any,
  currentMonthStart: Date,
  cutoverDate: Date | null,
  options?: { introductionSatisfied?: boolean }
): { start: Date; end: Date } | null => {
  const start = lease?.startDate ? new Date(lease.startDate) : null;
  const end = lease?.endDate ? new Date(lease.endDate) : currentMonthStart;
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) return null;

  const leaseStartMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const leaseEndMonth = new Date(Math.min(end.getTime(), currentMonthStart.getTime()));
  if (leaseStartMonth.getTime() > leaseEndMonth.getTime()) return null;

  const rentalType = String(property?.rentalType || '').toLowerCase();
  if (rentalType === 'introduction' && options?.introductionSatisfied !== true) {
    if (cutoverDate && leaseStartMonth.getTime() < cutoverDate.getTime()) return null;
    return { start: leaseStartMonth, end: leaseStartMonth };
  }

  let normalizedStart = leaseStartMonth;
  if (cutoverDate && normalizedStart.getTime() < cutoverDate.getTime()) normalizedStart = cutoverDate;
  if (normalizedStart.getTime() > leaseEndMonth.getTime()) return null;
  return { start: normalizedStart, end: leaseEndMonth };
};

export function computeOutstandingForLease(input: {
  rentalType?: string;
  leaseStart: Date;
  leaseEnd?: Date | null;
  currentMonthStart: Date;
  cutoverDate: Date | null;
  paidKeys: Set<string>;
  monthlyAmount: number;
  introductionRemaining?: number;
  mode?: 'rent' | 'levy';
}): { labels: string[]; missingCount: number; totalAmount: number } {
  const rentalType = String(input.rentalType || '').toLowerCase();
  const monthlyAmount = toMoney(Number(input.monthlyAmount || 0));
  const introRemaining = toMoney(Math.max(0, Number(input.introductionRemaining || 0)));
  const introductionSatisfied = rentalType !== 'introduction' || introRemaining <= 0;
  const range = getOutstandingRangeForLease(
    { startDate: input.leaseStart, endDate: input.leaseEnd },
    { rentalType },
    input.currentMonthStart,
    input.cutoverDate,
    rentalType === 'introduction' ? { introductionSatisfied } : undefined
  );
  if (!range || monthlyAmount <= 0) {
    return { labels: [], missingCount: 0, totalAmount: 0 };
  }

  if (rentalType === 'introduction' && !introductionSatisfied && input.mode !== 'levy') {
    return {
      labels: [formatOutstandingMonthLabel(range.start.getFullYear(), range.start.getMonth() + 1)],
      missingCount: 1,
      totalAmount: introRemaining > 0 ? introRemaining : monthlyAmount
    };
  }

  const labels: string[] = [];
  iterateOutstandingMonths(range.start, range.end, (year, month) => {
    const key = outstandingMonthKey(year, month);
    if (!input.paidKeys.has(key)) {
      labels.push(formatOutstandingMonthLabel(year, month));
    }
  });
  return {
    labels,
    missingCount: labels.length,
    totalAmount: toMoney(labels.length * monthlyAmount)
  };
}
