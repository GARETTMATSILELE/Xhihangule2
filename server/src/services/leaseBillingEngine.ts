import { ILease } from '../models/Lease';

export type GeneratedBillingPeriod = {
  leaseId: string;
  label: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  rentAmount: number;
  levyAmount: number;
  serviceChargeAmount: number;
  totalAmount: number;
  status: 'current' | 'partially_paid' | 'overdue' | 'in_arrears' | 'settled' | 'waived';
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function clampDate(date: Date, min: Date, max: Date): Date {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function prorateAmount(monthlyAmount: number, periodStart: Date, periodEnd: Date, monthStart: Date): number {
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / MS_PER_DAY) + 1);
  const occupiedDays = Math.max(0, Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY) + 1);
  return Math.round((monthlyAmount * occupiedDays / daysInMonth) * 100) / 100;
}

export class LeaseBillingEngine {
  static generateMonthlyPeriods(lease: ILease, fromDate = lease.startDate, toDate = lease.endDate): GeneratedBillingPeriod[] {
    const start = new Date(Math.max(lease.startDate.getTime(), fromDate.getTime()));
    const end = new Date(Math.min(lease.endDate.getTime(), toDate.getTime()));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

    const periods: GeneratedBillingPeriod[] = [];
    const rentDueDay = lease.billingRules?.rentDueDay || lease.rentDueDay || 1;
    const prorateMoveIn = lease.billingRules?.prorateMoveIn !== false;
    const recurringLevies = Number(lease.billingRules?.recurringLevies || 0);
    const recurringServiceCharges = Number(lease.billingRules?.recurringServiceCharges || 0);

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

