"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutstandingRangeForLease = exports.iterateOutstandingMonths = exports.formatOutstandingMonthLabel = exports.outstandingMonthKey = void 0;
exports.computeOutstandingForLease = computeOutstandingForLease;
const toMoney = (value) => Number(Number(value || 0).toFixed(2));
const outstandingMonthKey = (year, month) => `${year}-${month}`;
exports.outstandingMonthKey = outstandingMonthKey;
const monthLabelFormatter = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' });
const formatOutstandingMonthLabel = (year, month) => monthLabelFormatter.format(new Date(year, month - 1, 1));
exports.formatOutstandingMonthLabel = formatOutstandingMonthLabel;
const iterateOutstandingMonths = (start, end, cb, hardCapMonths = 240) => {
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
exports.iterateOutstandingMonths = iterateOutstandingMonths;
const getOutstandingRangeForLease = (lease, property, currentMonthStart, cutoverDate, options) => {
    const start = (lease === null || lease === void 0 ? void 0 : lease.startDate) ? new Date(lease.startDate) : null;
    const end = (lease === null || lease === void 0 ? void 0 : lease.endDate) ? new Date(lease.endDate) : currentMonthStart;
    if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime()))
        return null;
    const leaseStartMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const leaseEndMonth = new Date(Math.min(end.getTime(), currentMonthStart.getTime()));
    if (leaseStartMonth.getTime() > leaseEndMonth.getTime())
        return null;
    const rentalType = String((property === null || property === void 0 ? void 0 : property.rentalType) || '').toLowerCase();
    if (rentalType === 'introduction' && (options === null || options === void 0 ? void 0 : options.introductionSatisfied) !== true) {
        if (cutoverDate && leaseStartMonth.getTime() < cutoverDate.getTime())
            return null;
        return { start: leaseStartMonth, end: leaseStartMonth };
    }
    let normalizedStart = leaseStartMonth;
    if (cutoverDate && normalizedStart.getTime() < cutoverDate.getTime())
        normalizedStart = cutoverDate;
    if (normalizedStart.getTime() > leaseEndMonth.getTime())
        return null;
    return { start: normalizedStart, end: leaseEndMonth };
};
exports.getOutstandingRangeForLease = getOutstandingRangeForLease;
function computeOutstandingForLease(input) {
    const rentalType = String(input.rentalType || '').toLowerCase();
    const monthlyAmount = toMoney(Number(input.monthlyAmount || 0));
    const introRemaining = toMoney(Math.max(0, Number(input.introductionRemaining || 0)));
    const introductionSatisfied = rentalType !== 'introduction' || introRemaining <= 0;
    const range = (0, exports.getOutstandingRangeForLease)({ startDate: input.leaseStart, endDate: input.leaseEnd }, { rentalType }, input.currentMonthStart, input.cutoverDate, rentalType === 'introduction' ? { introductionSatisfied } : undefined);
    if (!range || monthlyAmount <= 0) {
        return { labels: [], missingCount: 0, totalAmount: 0 };
    }
    if (rentalType === 'introduction' && !introductionSatisfied && input.mode !== 'levy') {
        return {
            labels: [(0, exports.formatOutstandingMonthLabel)(range.start.getFullYear(), range.start.getMonth() + 1)],
            missingCount: 1,
            totalAmount: introRemaining > 0 ? introRemaining : monthlyAmount
        };
    }
    const labels = [];
    (0, exports.iterateOutstandingMonths)(range.start, range.end, (year, month) => {
        const key = (0, exports.outstandingMonthKey)(year, month);
        if (!input.paidKeys.has(key)) {
            labels.push((0, exports.formatOutstandingMonthLabel)(year, month));
        }
    });
    return {
        labels,
        missingCount: labels.length,
        totalAmount: toMoney(labels.length * monthlyAmount)
    };
}
