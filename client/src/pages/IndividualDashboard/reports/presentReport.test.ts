import { describe, expect, it } from 'vitest';
import { buildReportCharts, comparisonText, presentRows } from './presentReport';

describe('report presentation', () => {
  it('hides internal fields and totals money without totalling percentages', () => {
    const presented = presentRows([
      { property: 'A', income: 100, expenses: 40, netProfit: 60, expenseRatio: 40, _id: 'secret', propertyId: '1' },
      { property: 'B', income: 50, expenses: 10, netProfit: 40, expenseRatio: 20, currency: 'USD' }
    ]);
    expect(presented.columns.map((column) => column.key)).not.toContain('_id');
    expect(presented.columns.map((column) => column.key)).not.toContain('propertyId');
    expect(presented.totals[0].values.income).toBe(150);
    expect(presented.totals[0].values.expenseRatio).toBeUndefined();
  });

  it('does not add different currencies together', () => {
    const presented = presentRows([
      { property: 'A', currency: 'USD', income: 100, expenses: 0, netProfit: 100 },
      { property: 'B', currency: 'ZiG', income: 80, expenses: 0, netProfit: 80 }
    ]);
    expect(presented.totals).toEqual([
      { currency: 'USD', values: { income: 100, expenses: 0, netProfit: 100 } },
      { currency: 'ZiG', values: { income: 80, expenses: 0, netProfit: 80 } }
    ]);
  });

  it('omits a percentage when the previous period is zero', () => {
    expect(comparisonText(120, 0, 'August 2026')?.percent).toBeNull();
    expect(comparisonText(120, 100, 'August 2026')?.percent).toBe(20);
    expect(comparisonText(100, null, 'August 2026')).toBeNull();
  });

  it('does not chart a single property comparison or an empty series', () => {
    expect(buildReportCharts('property-performance', [{ property: 'A', income: 10, expenses: 2, netProfit: 8 }], [])).toEqual([]);
    expect(buildReportCharts('cashflow', [], [{ currency: 'USD', points: [{ month: '2026-09', income: 0, expenses: 0, net: 0 }] }])).toEqual([]);
  });
});
