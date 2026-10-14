"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveReportingPeriod = resolveReportingPeriod;
exports.daysInRange = daysInRange;
function startOfUtcMonth(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}
function startOfNextUtcMonth(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}
function monthLabel(date) {
    return date.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function resolveReportingPeriod(basis, asOf = new Date()) {
    const normalized = String(basis || 'this_month').toLowerCase().replace(/-/g, '_');
    if (normalized === 'lifetime') {
        return { basis: 'lifetime', label: 'Lifetime' };
    }
    if (normalized === 'year_to_date') {
        const start = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
        return {
            basis: 'year_to_date',
            start,
            end: asOf,
            label: `Year to date ${asOf.getUTCFullYear()}`
        };
    }
    if (normalized === 'last_12_months') {
        const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 11, 1, 0, 0, 0, 0));
        return {
            basis: 'last_12_months',
            start,
            end: asOf,
            label: 'Last 12 months'
        };
    }
    const start = startOfUtcMonth(asOf);
    const end = startOfNextUtcMonth(asOf);
    return {
        basis: 'this_month',
        start,
        end,
        label: monthLabel(asOf)
    };
}
function daysInRange(start, end) {
    if (!start || !end)
        return 0;
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}
