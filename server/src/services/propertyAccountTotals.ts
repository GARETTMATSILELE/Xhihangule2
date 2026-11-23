/**
 * Deterministic PropertyAccount total calculation.
 * Cancelled, failed, and reversed-status rows are excluded.
 * PASS_THROUGH, LIABILITY (tenant deposits) and CAPITAL are excluded from owner P&L.
 */

const NON_PNL_TREATMENTS = new Set(['PASS_THROUGH', 'LIABILITY', 'CAPITAL']);

function isPnlRow(t: any): boolean {
  return !NON_PNL_TREATMENTS.has(String(t?.accountingTreatment || ''));
}

export type PropertyAccountTotals = {
  totalIncome: number;
  totalExpenses: number;
  totalOwnerPayouts: number;
  openingBalance: number;
  runningBalance: number;
  passThroughCollected: number;
  passThroughPaid: number;
  passThroughOutstanding: number;
};

const ACTIVE = new Set(['completed']);

function isActiveStatus(status: unknown): boolean {
  return ACTIVE.has(String(status || ''));
}

export function computePropertyAccountTotals(account: {
  transactions?: any[];
  ownerPayouts?: any[];
  passThroughAccounts?: any[];
}): PropertyAccountTotals {
  const transactions = Array.isArray(account.transactions) ? account.transactions : [];
  const ownerPayouts = Array.isArray(account.ownerPayouts) ? account.ownerPayouts : [];
  const passThroughAccounts = Array.isArray(account.passThroughAccounts) ? account.passThroughAccounts : [];

  const totalIncome = transactions
    .filter((t) => t?.type === 'income' && isActiveStatus(t.status) && isPnlRow(t))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalExpenses = transactions
    .filter(
      (t) =>
        t?.type !== 'income' &&
        t?.type !== 'opening_balance' &&
        isActiveStatus(t.status) &&
        isPnlRow(t)
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalOwnerPayouts = ownerPayouts
    .filter((p) => isActiveStatus(p.status))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const openingBalance = transactions
    .filter((t) => t?.type === 'opening_balance' && isActiveStatus(t.status))
    .reduce((sum, t) => sum + (t.direction === 'debit' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0);

  let passThroughCollected = 0;
  let passThroughPaid = 0;
  for (const bucket of passThroughAccounts) {
    const entries = Array.isArray(bucket?.transactions) ? bucket.transactions : [];
    const collected = entries
      .filter((t: any) => t?.type === 'collection' && isActiveStatus(t.status))
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const reversed = entries
      .filter((t: any) => t?.type === 'collection_reversal' && isActiveStatus(t.status))
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    passThroughCollected += collected - reversed;
    passThroughPaid += entries
      .filter((t: any) => t?.type === 'payment' && isActiveStatus(t.status))
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
  }

  const runningBalance = totalIncome - totalExpenses - totalOwnerPayouts + openingBalance;
  return {
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpenses: Number(totalExpenses.toFixed(2)),
    totalOwnerPayouts: Number(totalOwnerPayouts.toFixed(2)),
    openingBalance: Number(openingBalance.toFixed(2)),
    runningBalance: Number(runningBalance.toFixed(2)),
    passThroughCollected: Number(passThroughCollected.toFixed(2)),
    passThroughPaid: Number(passThroughPaid.toFixed(2)),
    passThroughOutstanding: Number((passThroughCollected - passThroughPaid).toFixed(2))
  };
}

type PnlKind = 'income' | 'expense';

function forEachPnlAmount(
  transactions: any[] | undefined,
  start: Date | undefined,
  end: Date | undefined,
  visit: (entry: any, amount: number, kind: PnlKind) => void
) {
  const rows = Array.isArray(transactions) ? transactions : [];
  for (const t of rows) {
    if (!isActiveStatus(t?.status) || !isPnlRow(t)) continue;
    const date = t?.date ? new Date(t.date) : null;
    if (start && date && date < start) continue;
    if (end && date && date >= end) continue;
    const amount = Number(t.amount || 0);
    if (t?.type === 'income') visit(t, amount, 'income');
    else if (t?.type !== 'opening_balance') visit(t, amount, 'expense');
  }
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function entryCurrency(entry: any, fallbackCurrency: string) {
  const currency = String(entry?.currency || fallbackCurrency || 'USD').trim();
  return currency || fallbackCurrency || 'USD';
}

export function sumPropertyAccountPeriodPnl(
  transactions: any[] | undefined,
  start?: Date,
  end?: Date
): { income: number; expenses: number; net: number } {
  let income = 0;
  let expenses = 0;
  forEachPnlAmount(transactions, start, end, (_entry, amount, kind) => {
    if (kind === 'income') income += amount;
    else expenses += amount;
  });
  return {
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    net: roundMoney(income - expenses)
  };
}

export type CurrencyPnl = { currency: string; income: number; expenses: number; net: number };

export function sumPropertyAccountPeriodPnlByCurrency(
  transactions: any[] | undefined,
  start: Date | undefined,
  end: Date | undefined,
  fallbackCurrency = 'USD'
): CurrencyPnl[] {
  const buckets = new Map<string, { income: number; expenses: number }>();
  forEachPnlAmount(transactions, start, end, (entry, amount, kind) => {
    const currency = entryCurrency(entry, fallbackCurrency);
    const bucket = buckets.get(currency) || { income: 0, expenses: 0 };
    if (kind === 'income') bucket.income += amount;
    else bucket.expenses += amount;
    buckets.set(currency, bucket);
  });
  return Array.from(buckets.entries())
    .map(([currency, bucket]) => ({
      currency,
      income: roundMoney(bucket.income),
      expenses: roundMoney(bucket.expenses),
      net: roundMoney(bucket.income - bucket.expenses)
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export type PnlSeriesPoint = { month: string; income: number; expenses: number; net: number };

export function sumPropertyAccountPeriodSeries(
  transactions: any[] | undefined,
  start: Date | undefined,
  end: Date | undefined,
  monthOf: (date: Date) => string,
  fallbackCurrency = 'USD'
): Array<{ currency: string; points: PnlSeriesPoint[] }> {
  const buckets = new Map<string, Map<string, { income: number; expenses: number }>>();
  forEachPnlAmount(transactions, start, end, (entry, amount, kind) => {
    const date = entry?.date ? new Date(entry.date) : null;
    if (!date || Number.isNaN(date.getTime())) return;
    const currency = entryCurrency(entry, fallbackCurrency);
    const month = monthOf(date);
    if (!buckets.has(currency)) buckets.set(currency, new Map());
    const months = buckets.get(currency)!;
    const point = months.get(month) || { income: 0, expenses: 0 };
    if (kind === 'income') point.income += amount;
    else point.expenses += amount;
    months.set(month, point);
  });
  return Array.from(buckets.entries())
    .map(([currency, months]) => ({
      currency,
      points: Array.from(months.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, point]) => ({
          month,
          income: roundMoney(point.income),
          expenses: roundMoney(point.expenses),
          net: roundMoney(point.income - point.expenses)
        }))
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function sumPendingOperatingBills(
  transactions: any[] | undefined,
  start?: Date,
  end?: Date,
  fallbackCurrency = 'USD'
): Array<{ currency: string; amount: number }> {
  const rows = Array.isArray(transactions) ? transactions : [];
  const buckets = new Map<string, number>();
  for (const entry of rows) {
    if (String(entry?.status || '') !== 'pending') continue;
    if (!isPnlRow(entry)) continue;
    if (entry?.type === 'income' || entry?.type === 'opening_balance') continue;
    const date = entry?.date ? new Date(entry.date) : null;
    if (start && date && date < start) continue;
    if (end && date && date >= end) continue;
    const currency = entryCurrency(entry, fallbackCurrency);
    buckets.set(currency, (buckets.get(currency) || 0) + Number(entry.amount || 0));
  }
  return Array.from(buckets.entries())
    .map(([currency, amount]) => ({ currency, amount: roundMoney(amount) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function computeAgentAccountTotals(account: { transactions?: any[] }): {
  totalCommissions: number;
  totalPayouts: number;
  totalPenalties: number;
  runningBalance: number;
} {
  const transactions = Array.isArray(account.transactions) ? [...account.transactions] : [];
  transactions.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
  let commissionCents = 0;
  let payoutCents = 0;
  let penaltyCents = 0;
  let balanceCents = 0;
  for (const t of transactions) {
    if (!isActiveStatus(t.status)) continue;
    const amountCents = Math.round(Number(t.amount || 0) * 100);
    if (t.type === 'commission') {
      commissionCents += amountCents;
      balanceCents += amountCents;
    } else if (t.type === 'payout') {
      payoutCents += amountCents;
      balanceCents -= amountCents;
    } else if (t.type === 'penalty') {
      penaltyCents += amountCents;
      balanceCents -= amountCents;
    }
  }
  return {
    totalCommissions: Number((commissionCents / 100).toFixed(2)),
    totalPayouts: Number((payoutCents / 100).toFixed(2)),
    totalPenalties: Number((penaltyCents / 100).toFixed(2)),
    runningBalance: Number((balanceCents / 100).toFixed(2))
  };
}
