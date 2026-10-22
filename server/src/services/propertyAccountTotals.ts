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

export function sumPropertyAccountPeriodPnl(
  transactions: any[] | undefined,
  start?: Date,
  end?: Date
): { income: number; expenses: number; net: number } {
  const rows = Array.isArray(transactions) ? transactions : [];
  let income = 0;
  let expenses = 0;
  for (const t of rows) {
    if (!isActiveStatus(t.status) || !isPnlRow(t)) continue;
    const date = t?.date ? new Date(t.date) : null;
    if (start && date && date < start) continue;
    if (end && date && date >= end) continue;
    const amount = Number(t.amount || 0);
    if (t?.type === 'income') income += amount;
    else if (t?.type !== 'opening_balance') expenses += amount;
  }
  return {
    income: Number(income.toFixed(2)),
    expenses: Number(expenses.toFixed(2)),
    net: Number((income - expenses).toFixed(2))
  };
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
