"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const individualReportingPeriod_1 = require("../services/individualReportingPeriod");
const propertyAccountTotals_1 = require("../services/propertyAccountTotals");
const asOf = new Date(Date.UTC(2026, 8, 17, 12, 0, 0));
const thisMonth = (0, individualReportingPeriod_1.resolveReportingPeriod)('this_month', asOf);
assert_1.default.strictEqual(thisMonth.basis, 'this_month');
assert_1.default.strictEqual((_a = thisMonth.start) === null || _a === void 0 ? void 0 : _a.toISOString(), '2026-09-01T00:00:00.000Z');
assert_1.default.strictEqual((_b = thisMonth.end) === null || _b === void 0 ? void 0 : _b.toISOString(), '2026-10-01T00:00:00.000Z');
assert_1.default.ok(thisMonth.label.includes('2026'));
const ytd = (0, individualReportingPeriod_1.resolveReportingPeriod)('year_to_date', asOf);
assert_1.default.strictEqual(ytd.basis, 'year_to_date');
assert_1.default.strictEqual((_c = ytd.start) === null || _c === void 0 ? void 0 : _c.getUTCMonth(), 0);
assert_1.default.strictEqual((_d = ytd.start) === null || _d === void 0 ? void 0 : _d.getUTCFullYear(), 2026);
const previous = (0, individualReportingPeriod_1.resolveReportingPeriod)('previous_month', asOf);
assert_1.default.strictEqual((_e = previous.start) === null || _e === void 0 ? void 0 : _e.toISOString(), '2026-08-01T00:00:00.000Z');
assert_1.default.strictEqual((_f = previous.end) === null || _f === void 0 ? void 0 : _f.toISOString(), '2026-09-01T00:00:00.000Z');
const quarter = (0, individualReportingPeriod_1.resolveReportingPeriod)('this_quarter', asOf);
assert_1.default.strictEqual(quarter.label, 'Q3 2026');
assert_1.default.strictEqual((_g = quarter.start) === null || _g === void 0 ? void 0 : _g.toISOString(), '2026-07-01T00:00:00.000Z');
assert_1.default.strictEqual((_h = quarter.end) === null || _h === void 0 ? void 0 : _h.toISOString(), '2026-10-01T00:00:00.000Z');
const year = (0, individualReportingPeriod_1.resolveReportingPeriod)('this_year', asOf);
assert_1.default.strictEqual((_j = year.start) === null || _j === void 0 ? void 0 : _j.toISOString(), '2026-01-01T00:00:00.000Z');
assert_1.default.strictEqual((_k = year.end) === null || _k === void 0 ? void 0 : _k.toISOString(), '2027-01-01T00:00:00.000Z');
const priorYear = (0, individualReportingPeriod_1.resolveReportingPeriod)('previous_year', asOf);
assert_1.default.strictEqual((_l = priorYear.start) === null || _l === void 0 ? void 0 : _l.getUTCFullYear(), 2025);
assert_1.default.strictEqual((_m = priorYear.end) === null || _m === void 0 ? void 0 : _m.toISOString(), '2026-01-01T00:00:00.000Z');
const custom = (0, individualReportingPeriod_1.resolveReportingPeriod)('custom', asOf, { start: '2026-03-01', end: '2026-03-31' });
assert_1.default.strictEqual((_o = custom.start) === null || _o === void 0 ? void 0 : _o.toISOString(), '2026-03-01T00:00:00.000Z');
assert_1.default.strictEqual((_p = custom.end) === null || _p === void 0 ? void 0 : _p.toISOString(), '2026-04-01T00:00:00.000Z');
const harare = (0, individualReportingPeriod_1.resolveReportingPeriod)('this_month', asOf, { timeZone: 'Africa/Harare' });
assert_1.default.strictEqual((_q = harare.start) === null || _q === void 0 ? void 0 : _q.toISOString(), '2026-08-31T22:00:00.000Z');
assert_1.default.strictEqual((_r = harare.end) === null || _r === void 0 ? void 0 : _r.toISOString(), '2026-09-30T22:00:00.000Z');
const before = (0, individualReportingPeriod_1.previousReportingPeriod)(thisMonth, 'UTC');
assert_1.default.strictEqual((_s = before === null || before === void 0 ? void 0 : before.start) === null || _s === void 0 ? void 0 : _s.toISOString(), (_t = previous.start) === null || _t === void 0 ? void 0 : _t.toISOString());
assert_1.default.strictEqual((0, individualReportingPeriod_1.previousReportingPeriod)({ basis: 'lifetime', label: 'Lifetime' }, 'UTC'), null);
assert_1.default.strictEqual((0, individualReportingPeriod_1.periodTaxScope)(thisMonth, 'UTC').monthKey, '2026-09');
assert_1.default.strictEqual((0, individualReportingPeriod_1.periodTaxScope)(year, 'UTC').kind, 'year');
assert_1.default.strictEqual((0, individualReportingPeriod_1.periodTaxScope)(quarter, 'UTC').kind, 'unsupported');
const mixed = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnlByCurrency)([
    { type: 'income', status: 'completed', amount: 100, currency: 'USD', date: '2026-09-02' },
    { type: 'expense', status: 'completed', amount: 40, currency: 'USD', date: '2026-09-03' },
    { type: 'income', status: 'completed', amount: 80, currency: 'ZiG', date: '2026-09-04' },
    { type: 'income', status: 'completed', amount: 999, currency: 'USD', date: '2026-08-01' },
    { type: 'income', status: 'completed', amount: 50, currency: 'USD', date: '2026-09-05', accountingTreatment: 'LIABILITY' }
], new Date('2026-09-01T00:00:00.000Z'), new Date('2026-10-01T00:00:00.000Z'), 'USD');
assert_1.default.deepStrictEqual(mixed, [
    { currency: 'USD', income: 100, expenses: 40, net: 60 },
    { currency: 'ZiG', income: 80, expenses: 0, net: 80 }
]);
const combined = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnl)([
    { type: 'income', status: 'completed', amount: 100, date: '2026-09-02' },
    { type: 'expense', status: 'completed', amount: 40, date: '2026-09-03' }
], new Date('2026-09-01T00:00:00.000Z'), new Date('2026-10-01T00:00:00.000Z'));
assert_1.default.strictEqual(combined.net, 60);
console.log('Reporting period tests passed');
