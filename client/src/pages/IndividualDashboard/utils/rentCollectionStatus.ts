import { Lease } from '../../../types/lease';
import { Payment } from '../../../types/payment';
import { Property } from '../../../types/property';
import { Tenant } from '../../../types/tenant';

export type PortfolioRentStatusLabel = 'No overdue payments' | 'Paid up to date' | 'Overdue';

export type RentPeriodBalance = {
  month: number;
  year: number;
  key: string;
  label: string;
  dueDate: Date;
  expected: number;
  paid: number;
  outstanding: number;
  status: 'paid' | 'partial' | 'overdue';
};

export type PropertyRentStatus = {
  leaseId: string;
  propertyId: string;
  tenantId: string;
  propertyName: string;
  tenantName: string;
  leaseStart: Date;
  leaseEnd: Date;
  leaseStarted: boolean;
  monthlyRent: number;
  periods: RentPeriodBalance[];
  overduePeriods: RentPeriodBalance[];
  outstandingTotal: number;
  paidTotal: number;
  expectedTotal: number;
  status: 'not_started' | 'paid_up_to_date' | 'overdue';
  statusLabel: PortfolioRentStatusLabel;
};

export type PortfolioRentStatus = {
  label: PortfolioRentStatusLabel;
  color: 'success' | 'error';
  outstandingTotal: number;
  overdueProperties: PropertyRentStatus[];
  properties: PropertyRentStatus[];
  startedLeaseCount: number;
};

const ACTIVE_LEASE_STATUSES = new Set(['active', 'expiring_soon']);
const COMPLETED_PAYMENT_STATUSES = new Set(['completed', 'paid', 'success']);

export function getId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as { $oid?: string; _id?: unknown };
    if (obj.$oid) return String(obj.$oid);
    if (obj._id) return getId(obj._id);
  }
  return String(value);
}

function displayName(entity: any, fallback: string): string {
  if (!entity) return fallback;
  if (typeof entity === 'string') return fallback;
  const name = entity.name || entity.address;
  if (name) return String(name);
  const person = [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim();
  return person || fallback;
}

export function parseLocalDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value as string | number);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function addMonths(year: number, month: number, count: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + count, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function toMoney(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export function isActiveLease(lease: Lease | Record<string, unknown>): boolean {
  return ACTIVE_LEASE_STATUSES.has(String((lease as any).status || '').toLowerCase());
}

function isCountablePayment(payment: Payment | Record<string, unknown>): boolean {
  const status = String((payment as any).status || '').toLowerCase();
  const type = String((payment as any).paymentType || 'rental').toLowerCase();
  return COMPLETED_PAYMENT_STATUSES.has(status) && (!type || type === 'rental');
}

function paymentMatchesLease(payment: Payment | Record<string, unknown>, lease: Lease | Record<string, unknown>): boolean {
  const paymentLeaseId = getId((payment as any).leaseId);
  const leaseId = getId((lease as any)._id);
  if (paymentLeaseId && leaseId && paymentLeaseId === leaseId) return true;

  const paymentPropertyId = getId((payment as any).propertyId);
  const leasePropertyId = getId((lease as any).propertyId);
  if (!paymentPropertyId || paymentPropertyId !== leasePropertyId) return false;

  const paymentTenantId = getId((payment as any).tenantId);
  const leaseTenantId = getId((lease as any).tenantId);
  return !paymentTenantId || !leaseTenantId || paymentTenantId === leaseTenantId;
}

function coveredMonthsFromPayment(payment: Payment | Record<string, unknown>): Array<{ year: number; month: number }> {
  const advanceStart = (payment as any).advancePeriodStart;
  const advanceEnd = (payment as any).advancePeriodEnd;
  const startMonth = Number(advanceStart?.month || (payment as any).rentalPeriodMonth || 0);
  const startYear = Number(advanceStart?.year || (payment as any).rentalPeriodYear || 0);
  const months: Array<{ year: number; month: number }> = [];

  if (startMonth >= 1 && startMonth <= 12 && startYear >= 1900) {
    if (advanceEnd?.month && advanceEnd?.year) {
      let cursor = { year: startYear, month: startMonth };
      const end = { year: Number(advanceEnd.year), month: Number(advanceEnd.month) };
      while (cursor.year < end.year || (cursor.year === end.year && cursor.month <= end.month)) {
        months.push(cursor);
        cursor = addMonths(cursor.year, cursor.month, 1);
      }
      return months;
    }

    const count = Math.max(1, Number((payment as any).advanceMonthsPaid || 1));
    for (let i = 0; i < count; i += 1) {
      months.push(addMonths(startYear, startMonth, i));
    }
    return months;
  }

  const paymentDate = parseLocalDate((payment as any).paymentDate || (payment as any).createdAt);
  if (!paymentDate) return [];
  return [{ year: paymentDate.getFullYear(), month: paymentDate.getMonth() + 1 }];
}

function dueDateForMonth(year: number, month: number, rentDueDay: number, leaseStart: Date, leaseEnd: Date): Date {
  const monthEnd = new Date(year, month, 0);
  const dueDay = Math.min(Math.max(1, rentDueDay), monthEnd.getDate());
  let dueDate = new Date(year, month - 1, dueDay);
  if (dueDate < leaseStart) dueDate = leaseStart;
  if (dueDate > leaseEnd) dueDate = leaseEnd;
  return dueDate;
}

function generateDuePeriods(lease: Lease | Record<string, unknown>, asOf: Date): Array<Omit<RentPeriodBalance, 'paid' | 'outstanding' | 'status'>> {
  const leaseStart = parseLocalDate((lease as any).startDate);
  const leaseEnd = parseLocalDate((lease as any).endDate);
  if (!leaseStart || !leaseEnd) return [];

  const today = startOfDay(asOf);
  if (today < leaseStart) return [];

  const lastBillable = today < leaseEnd ? today : leaseEnd;
  const rentDueDay = Number((lease as any).billingRules?.rentDueDay || (lease as any).rentDueDay || 1) || 1;
  const expected = toMoney((lease as any).rentAmount ?? (lease as any).monthlyRent ?? 0);
  const periods: Array<Omit<RentPeriodBalance, 'paid' | 'outstanding' | 'status'>> = [];

  let cursor = new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1);
  const lastMonth = new Date(lastBillable.getFullYear(), lastBillable.getMonth(), 1);

  while (cursor <= lastMonth) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const dueDate = dueDateForMonth(year, month, rentDueDay, leaseStart, leaseEnd);
    if (dueDate <= today && dueDate >= leaseStart) {
      periods.push({
        month,
        year,
        key: monthKey(year, month),
        label: monthLabel(year, month),
        dueDate,
        expected
      });
    }
    cursor = new Date(year, month, 1);
  }

  return periods;
}

function allocatePayments(
  periods: Array<Omit<RentPeriodBalance, 'paid' | 'outstanding' | 'status'>>,
  payments: Array<Payment | Record<string, unknown>>
): RentPeriodBalance[] {
  const paidByMonth = new Map<string, number>();
  let leftover = 0;

  for (const payment of payments) {
    const amount = toMoney((payment as any).amount);
    if (amount <= 0) continue;
    const months = coveredMonthsFromPayment(payment);
    if (!months.length) {
      leftover += amount;
      continue;
    }
    const share = toMoney(amount / months.length);
    months.forEach((item, index) => {
      const key = monthKey(item.year, item.month);
      const applied = index === months.length - 1 ? toMoney(amount - share * (months.length - 1)) : share;
      paidByMonth.set(key, toMoney((paidByMonth.get(key) || 0) + applied));
    });
  }

  const balances: RentPeriodBalance[] = periods.map((period) => {
    const paid = toMoney(paidByMonth.get(period.key) || 0);
    paidByMonth.delete(period.key);
    const outstanding = toMoney(Math.max(0, period.expected - paid));
    return {
      ...period,
      paid,
      outstanding,
      status: outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'overdue'
    };
  });

  leftover += Array.from(paidByMonth.values()).reduce((sum, value) => sum + value, 0);

  for (const period of balances) {
    if (leftover <= 0 || period.outstanding <= 0) continue;
    const applied = Math.min(period.outstanding, leftover);
    period.paid = toMoney(period.paid + applied);
    period.outstanding = toMoney(period.outstanding - applied);
    leftover = toMoney(leftover - applied);
    period.status = period.outstanding <= 0 ? 'paid' : period.paid > 0 ? 'partial' : 'overdue';
  }

  return balances;
}

export function derivePropertyRentStatus(
  lease: Lease | Record<string, unknown>,
  payments: Array<Payment | Record<string, unknown>>,
  properties: Property[],
  tenants: Tenant[],
  asOf = new Date()
): PropertyRentStatus {
  const leaseId = getId((lease as any)._id);
  const propertyId = getId((lease as any).propertyId);
  const tenantId = getId((lease as any).tenantId);
  const property = properties.find((item) => getId(item._id) === propertyId);
  const tenant = tenants.find((item) => getId(item._id) === tenantId);
  const leaseStart = parseLocalDate((lease as any).startDate) || startOfDay(asOf);
  const leaseEnd = parseLocalDate((lease as any).endDate) || startOfDay(asOf);
  const leaseStarted = startOfDay(asOf) >= leaseStart;
  const matchingPayments = payments.filter((payment) => isCountablePayment(payment) && paymentMatchesLease(payment, lease));
  const periods = allocatePayments(generateDuePeriods(lease, asOf), matchingPayments);
  const overduePeriods = periods.filter((period) => period.outstanding > 0);
  const outstandingTotal = toMoney(overduePeriods.reduce((sum, period) => sum + period.outstanding, 0));
  const paidTotal = toMoney(periods.reduce((sum, period) => sum + period.paid, 0));
  const expectedTotal = toMoney(periods.reduce((sum, period) => sum + period.expected, 0));
  const status: PropertyRentStatus['status'] = !leaseStarted
    ? 'not_started'
    : outstandingTotal > 0
      ? 'overdue'
      : 'paid_up_to_date';
  const statusLabel: PortfolioRentStatusLabel = status === 'overdue' ? 'Overdue' : status === 'not_started' ? 'No overdue payments' : 'Paid up to date';

  return {
    leaseId,
    propertyId,
    tenantId,
    propertyName: property?.name || displayName((lease as any).propertyId, 'Property'),
    tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}`.trim() : displayName((lease as any).tenantId, 'Tenant'),
    leaseStart,
    leaseEnd,
    leaseStarted,
    monthlyRent: toMoney((lease as any).rentAmount ?? (lease as any).monthlyRent ?? property?.rent ?? 0),
    periods,
    overduePeriods,
    outstandingTotal,
    paidTotal,
    expectedTotal,
    status,
    statusLabel
  };
}

export function derivePortfolioRentStatus(
  leases: Array<Lease | Record<string, unknown>>,
  payments: Array<Payment | Record<string, unknown>>,
  properties: Property[],
  tenants: Tenant[],
  asOf = new Date()
): PortfolioRentStatus {
  const propertiesStatus = (leases || [])
    .filter(isActiveLease)
    .map((lease) => derivePropertyRentStatus(lease, payments, properties, tenants, asOf));

  const overdueProperties = propertiesStatus.filter((item) => item.status === 'overdue');
  const startedLeaseCount = propertiesStatus.filter((item) => item.leaseStarted).length;
  const outstandingTotal = toMoney(overdueProperties.reduce((sum, item) => sum + item.outstandingTotal, 0));

  let label: PortfolioRentStatusLabel = 'No overdue payments';
  if (overdueProperties.length > 0) label = 'Overdue';
  else if (startedLeaseCount > 0) label = 'Paid up to date';

  return {
    label,
    color: overdueProperties.length > 0 ? 'error' : 'success',
    outstandingTotal,
    overdueProperties,
    properties: propertiesStatus,
    startedLeaseCount
  };
}
