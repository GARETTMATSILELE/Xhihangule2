import { IndividualSummary } from '../../../services/individualWorkspaceService';

export const DASHBOARD_FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

export function dashboardMoney(value: number, currency = 'USD') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function axisMoney(value: number, currency = 'USD') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

export function currenciesAreSplit(data: IndividualSummary) {
  return (data.currencyTotals?.length || 0) > 1;
}

export function reportingCurrency(data: IndividualSummary) {
  return data.account?.currency || data.currencyTotals?.[0]?.currency || 'USD';
}

export type MoneyRow = { currency: string; amount: number };

export function incomeRows(data: IndividualSummary): MoneyRow[] {
  if (currenciesAreSplit(data)) {
    return (data.currencyTotals || []).map((row) => ({ currency: row.currency, amount: row.income }));
  }
  return [{ currency: reportingCurrency(data), amount: data.summary.monthlyIncome }];
}

export function expenseRows(data: IndividualSummary): MoneyRow[] {
  if (currenciesAreSplit(data)) {
    return (data.currencyTotals || []).map((row) => ({ currency: row.currency, amount: row.expenses }));
  }
  return [{ currency: reportingCurrency(data), amount: data.summary.monthlyExpenses }];
}

export function netRows(data: IndividualSummary): MoneyRow[] {
  if (currenciesAreSplit(data)) {
    return (data.currencyTotals || []).map((row) => ({ currency: row.currency, amount: row.net }));
  }
  return [{ currency: reportingCurrency(data), amount: data.summary.netProfit }];
}

export type TrendDirection = 'up' | 'down' | 'flat';

export function trendDirection(current: number, previous: number | undefined, enabled: boolean): TrendDirection | null {
  if (!enabled || previous == null || Number.isNaN(previous)) return null;
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

const PERIOD_LABELS: Record<string, string> = {
  this_quarter: 'This Quarter',
  this_year: 'This Year',
  previous_year: 'Previous Year',
  year_to_date: 'Year to Date',
  custom: 'Custom Date Range'
};

export function selectedPeriodLabel(period?: string | null, apiLabel?: string | null) {
  if (apiLabel) return apiLabel;
  const key = period || 'this_month';
  if (key === 'this_month' || key === 'previous_month') {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return PERIOD_LABELS[key] || 'This month';
}

export function monthLabel(value: string, style: 'short' | 'long' = 'short') {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString('en-US', { month: style === 'long' ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' });
}

export function activityDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export type ActivityTone = 'positive' | 'negative' | 'neutral';

export function activityView(type: string): { title: string; tone: ActivityTone } {
  const key = String(type || '').toLowerCase();
  if (key.includes('rent') || key === 'income') return { title: 'Rent received', tone: 'positive' };
  if (key.includes('bill')) return { title: 'Bill recorded', tone: 'negative' };
  if (key.includes('expense')) return { title: 'Expense recorded', tone: 'negative' };
  if (key.includes('maintenance')) return { title: 'Maintenance reported', tone: 'neutral' };
  if (key.includes('lease')) return { title: key.includes('renew') ? 'Lease renewal due' : 'Lease created', tone: 'neutral' };
  const title = key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return { title: title || 'Activity', tone: 'neutral' };
}

export function collectionNote(rate: number, expectedRent: number, rentCurrenciesReliable = true) {
  if (!rentCurrenciesReliable) return 'Rent was received in more than one currency.';
  if (expectedRent <= 0) return 'No rent due this period';
  if (rate > 100) return 'Includes advance payments';
  return 'Collected against rent due';
}

export function expectedRentTotal(data: IndividualSummary) {
  return (data.properties || []).reduce((sum, property) => sum + Number(property.expectedRent || 0), 0);
}

export type PeriodBar = { label: string; income: number; expenses: number };

export function incomeExpenseBars(data: IndividualSummary, periodLabel?: string): PeriodBar[] {
  if (currenciesAreSplit(data)) {
    return (data.currencyTotals || []).map((row) => ({
      label: row.currency,
      income: row.income,
      expenses: row.expenses
    }));
  }
  return [{
    label: data.period?.label || periodLabel || 'This period',
    income: Number(data.summary.monthlyIncome || 0),
    expenses: Number(data.summary.monthlyExpenses || 0)
  }];
}

export function barsHaveActivity(bars: PeriodBar[]) {
  return bars.some((bar) => bar.income !== 0 || bar.expenses !== 0);
}

export type CashPoint = { label: string; value: number };

export function cashflowSeries(data: IndividualSummary): { currency: string; points: CashPoint[]; unavailableReason?: string } {
  const currency = reportingCurrency(data);
  if (currenciesAreSplit(data)) {
    return { currency, points: [], unavailableReason: 'Cash flow stays separate for each currency.' };
  }
  const scoped = (data.periodSeries || []).find((series) => series.currency === currency && series.points.length >= 2)
    || ((data.periodSeries || []).length === 1 && (data.periodSeries || [])[0].points.length >= 2 ? data.periodSeries![0] : undefined);
  if (scoped) {
    return {
      currency: scoped.currency,
      points: scoped.points.map((point) => ({ label: monthLabel(point.month), value: point.net }))
    };
  }
  const income = data.charts?.incomeTrend || [];
  const expenses = data.charts?.expenseTrend || [];
  const labels: string[] = [];
  [...income, ...expenses].forEach((row) => {
    const label = String(row.month || '');
    if (label && !labels.includes(label)) labels.push(label);
  });
  if (labels.every((label) => /^\d{4}-\d{2}$/.test(label))) labels.sort();
  const points = labels.map((label) => ({
    label: monthLabel(label),
    value: Number(income.find((row) => row.month === label)?.amount || 0) - Number(expenses.find((row) => row.month === label)?.amount || 0)
  }));
  if (points.length < 2) {
    return { currency, points: [], unavailableReason: 'Not enough history to chart cash flow yet.' };
  }
  return { currency, points };
}
