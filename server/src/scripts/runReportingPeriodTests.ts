import assert from 'assert';
import { periodTaxScope, previousReportingPeriod, resolveReportingPeriod } from '../services/individualReportingPeriod';
import { sumPropertyAccountPeriodPnl, sumPropertyAccountPeriodPnlByCurrency } from '../services/propertyAccountTotals';

const asOf = new Date(Date.UTC(2026, 8, 17, 12, 0, 0));

const thisMonth = resolveReportingPeriod('this_month', asOf);
assert.strictEqual(thisMonth.basis, 'this_month');
assert.strictEqual(thisMonth.start?.toISOString(), '2026-09-01T00:00:00.000Z');
assert.strictEqual(thisMonth.end?.toISOString(), '2026-10-01T00:00:00.000Z');
assert.ok(thisMonth.label.includes('2026'));

const ytd = resolveReportingPeriod('year_to_date', asOf);
assert.strictEqual(ytd.basis, 'year_to_date');
assert.strictEqual(ytd.start?.getUTCMonth(), 0);
assert.strictEqual(ytd.start?.getUTCFullYear(), 2026);

const previous = resolveReportingPeriod('previous_month', asOf);
assert.strictEqual(previous.start?.toISOString(), '2026-08-01T00:00:00.000Z');
assert.strictEqual(previous.end?.toISOString(), '2026-09-01T00:00:00.000Z');

const quarter = resolveReportingPeriod('this_quarter', asOf);
assert.strictEqual(quarter.label, 'Q3 2026');
assert.strictEqual(quarter.start?.toISOString(), '2026-07-01T00:00:00.000Z');
assert.strictEqual(quarter.end?.toISOString(), '2026-10-01T00:00:00.000Z');

const year = resolveReportingPeriod('this_year', asOf);
assert.strictEqual(year.start?.toISOString(), '2026-01-01T00:00:00.000Z');
assert.strictEqual(year.end?.toISOString(), '2027-01-01T00:00:00.000Z');

const priorYear = resolveReportingPeriod('previous_year', asOf);
assert.strictEqual(priorYear.start?.getUTCFullYear(), 2025);
assert.strictEqual(priorYear.end?.toISOString(), '2026-01-01T00:00:00.000Z');

const custom = resolveReportingPeriod('custom', asOf, { start: '2026-03-01', end: '2026-03-31' });
assert.strictEqual(custom.start?.toISOString(), '2026-03-01T00:00:00.000Z');
assert.strictEqual(custom.end?.toISOString(), '2026-04-01T00:00:00.000Z');

const harare = resolveReportingPeriod('this_month', asOf, { timeZone: 'Africa/Harare' });
assert.strictEqual(harare.start?.toISOString(), '2026-08-31T22:00:00.000Z');
assert.strictEqual(harare.end?.toISOString(), '2026-09-30T22:00:00.000Z');

const before = previousReportingPeriod(thisMonth, 'UTC');
assert.strictEqual(before?.start?.toISOString(), previous.start?.toISOString());
assert.strictEqual(previousReportingPeriod({ basis: 'lifetime', label: 'Lifetime' }, 'UTC'), null);
assert.strictEqual(periodTaxScope(thisMonth, 'UTC').monthKey, '2026-09');
assert.strictEqual(periodTaxScope(year, 'UTC').kind, 'year');
assert.strictEqual(periodTaxScope(quarter, 'UTC').kind, 'unsupported');

const mixed = sumPropertyAccountPeriodPnlByCurrency([
  { type: 'income', status: 'completed', amount: 100, currency: 'USD', date: '2026-09-02' },
  { type: 'expense', status: 'completed', amount: 40, currency: 'USD', date: '2026-09-03' },
  { type: 'income', status: 'completed', amount: 80, currency: 'ZiG', date: '2026-09-04' },
  { type: 'income', status: 'completed', amount: 999, currency: 'USD', date: '2026-08-01' },
  { type: 'income', status: 'completed', amount: 50, currency: 'USD', date: '2026-09-05', accountingTreatment: 'LIABILITY' }
], new Date('2026-09-01T00:00:00.000Z'), new Date('2026-10-01T00:00:00.000Z'), 'USD');
assert.deepStrictEqual(mixed, [
  { currency: 'USD', income: 100, expenses: 40, net: 60 },
  { currency: 'ZiG', income: 80, expenses: 0, net: 80 }
]);
const combined = sumPropertyAccountPeriodPnl([
  { type: 'income', status: 'completed', amount: 100, date: '2026-09-02' },
  { type: 'expense', status: 'completed', amount: 40, date: '2026-09-03' }
], new Date('2026-09-01T00:00:00.000Z'), new Date('2026-10-01T00:00:00.000Z'));
assert.strictEqual(combined.net, 60);

console.log('Reporting period tests passed');
