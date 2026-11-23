import { describe, expect, it } from 'vitest';
import { IndividualSummary } from '../../../services/individualWorkspaceService';
import {
  activityView,
  barsHaveActivity,
  cashflowSeries,
  collectionNote,
  currenciesAreSplit,
  incomeExpenseBars,
  incomeRows,
  trendDirection
} from './presentDashboard';

function summary(overrides: Partial<IndividualSummary> = {}): IndividualSummary {
  return {
    summary: {
      totalProperties: 1,
      totalTenants: 1,
      occupiedUnits: 1,
      vacantUnits: 0,
      monthlyIncome: 1000,
      monthlyExpenses: 100,
      netProfit: 900,
      outstandingRent: 0,
      netMonthlyCashflow: 900,
      rentCollectionRate: 110
    },
    charts: {
      incomeTrend: [
        { month: '2026-10', amount: 800 },
        { month: '2026-11', amount: 1000 }
      ],
      expenseTrend: [
        { month: '2026-10', amount: 80 },
        { month: '2026-11', amount: 100 }
      ]
    },
    properties: [],
    recentActivity: [],
    ...overrides
  };
}

describe('individual dashboard presentation', () => {
  it('keeps collection above 100 percent when advance payments exist', () => {
    expect(collectionNote(110, 1000)).toBe('Includes advance payments');
    expect(collectionNote(80, 1000)).toBe('Collected against rent due');
    expect(collectionNote(100, 0)).toBe('No rent due this period');
  });

  it('does not combine income across currencies', () => {
    const data = summary({
      currencyTotals: [
        { currency: 'USD', income: 1000, expenses: 100, net: 900 },
        { currency: 'ZiG', income: 400, expenses: 50, net: 350 }
      ]
    });
    expect(currenciesAreSplit(data)).toBe(true);
    expect(incomeRows(data)).toEqual([
      { currency: 'USD', amount: 1000 },
      { currency: 'ZiG', amount: 400 }
    ]);
    expect(incomeExpenseBars(data).map((bar) => bar.label)).toEqual(['USD', 'ZiG']);
    expect(cashflowSeries(data).unavailableReason).toMatch(/separate/i);
  });

  it('charts one income bar and one expense bar for a single currency', () => {
    const bars = incomeExpenseBars(summary({ period: { basis: 'this_month', label: 'November 2026' } }));
    expect(bars).toEqual([{ label: 'November 2026', income: 1000, expenses: 100 }]);
    expect(barsHaveActivity(bars)).toBe(true);
  });

  it('uses real monthly history for cash flow and hides a single point', () => {
    const series = cashflowSeries(summary());
    expect(series.points).toEqual([
      { label: 'Oct 2026', value: 720 },
      { label: 'Nov 2026', value: 900 }
    ]);
    expect(cashflowSeries(summary({ charts: { incomeTrend: [{ month: '2026-11', amount: 1000 }], expenseTrend: [] } })).unavailableReason).toMatch(/history/i);
  });

  it('shows a trend only when a previous figure exists', () => {
    expect(trendDirection(1000, 800, true)).toBe('up');
    expect(trendDirection(1000, 800, false)).toBeNull();
    expect(trendDirection(100, 80, true)).toBe('up');
  });

  it('labels activity from the existing record type', () => {
    expect(activityView('rent_payment').tone).toBe('positive');
    expect(activityView('expense').title).toBe('Expense recorded');
    expect(activityView('maintenance').title).toBe('Maintenance reported');
  });
});
