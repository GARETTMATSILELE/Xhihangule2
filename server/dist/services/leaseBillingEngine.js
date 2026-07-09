"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaseBillingEngine = void 0;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function clampDate(date, min, max) {
    if (date < min)
        return min;
    if (date > max)
        return max;
    return date;
}
function prorateAmount(monthlyAmount, periodStart, periodEnd, monthStart) {
    const monthEnd = endOfMonth(monthStart);
    const daysInMonth = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / MS_PER_DAY) + 1);
    const occupiedDays = Math.max(0, Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY) + 1);
    return Math.round((monthlyAmount * occupiedDays / daysInMonth) * 100) / 100;
}
class LeaseBillingEngine {
    static generateMonthlyPeriods(lease, fromDate = lease.startDate, toDate = lease.endDate) {
        var _a, _b, _c, _d;
        const start = new Date(Math.max(lease.startDate.getTime(), fromDate.getTime()));
        const end = new Date(Math.min(lease.endDate.getTime(), toDate.getTime()));
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end)
            return [];
        const periods = [];
        const rentDueDay = ((_a = lease.billingRules) === null || _a === void 0 ? void 0 : _a.rentDueDay) || lease.rentDueDay || 1;
        const prorateMoveIn = ((_b = lease.billingRules) === null || _b === void 0 ? void 0 : _b.prorateMoveIn) !== false;
        const recurringLevies = Number(((_c = lease.billingRules) === null || _c === void 0 ? void 0 : _c.recurringLevies) || 0);
        const recurringServiceCharges = Number(((_d = lease.billingRules) === null || _d === void 0 ? void 0 : _d.recurringServiceCharges) || 0);
        let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor <= end) {
            const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
            const monthEnd = endOfMonth(monthStart);
            const periodStart = clampDate(monthStart, start, end);
            const periodEnd = clampDate(monthEnd, start, end);
            const isPartial = periodStart.getTime() !== monthStart.getTime() || periodEnd.getTime() !== monthEnd.getTime();
            const rentAmount = isPartial && prorateMoveIn
                ? prorateAmount(Number(lease.rentAmount || 0), periodStart, periodEnd, monthStart)
                : Number(lease.rentAmount || 0);
            const dueDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(rentDueDay, monthEnd.getDate()));
            periods.push({
                leaseId: String(lease._id),
                label: monthStart.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
                periodStart,
                periodEnd,
                dueDate,
                rentAmount,
                levyAmount: recurringLevies,
                serviceChargeAmount: recurringServiceCharges,
                totalAmount: rentAmount + recurringLevies + recurringServiceCharges,
                status: dueDate < new Date() ? 'overdue' : 'current'
            });
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }
        return periods;
    }
}
exports.LeaseBillingEngine = LeaseBillingEngine;
