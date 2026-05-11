import mongoose from 'mongoose';
import DashboardKpiSnapshot from '../models/DashboardKpiSnapshot';
import { CompanyAccount } from '../models/CompanyAccount';
import { Invoice } from '../models/Invoice';
import { Payment } from '../models/Payment';
import { LevyPayment } from '../models/LevyPayment';
import { Lease } from '../models/Lease';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import Company from '../models/Company';

const toObjectId = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);
const toMoney = (value: number): number => Number(Number(value || 0).toFixed(2));

const monthKey = (year: number, month: number): string => `${year}-${month}`;
const monthLabelFormatter = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' });
const formatMonthLabel = (year: number, month: number): string =>
  monthLabelFormatter.format(new Date(year, month - 1, 1));

const iterateMonths = (start: Date, end: Date, cb: (year: number, month: number) => void, hardCapMonths = 240): void => {
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

const getOutstandingRangeForLease = (
  lease: any,
  property: any,
  currentMonthStart: Date,
  cutoverDate: Date | null
): { start: Date; end: Date } | null => {
  const start = lease?.startDate ? new Date(lease.startDate) : null;
  const end = lease?.endDate ? new Date(lease.endDate) : currentMonthStart;
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) return null;

  const leaseStartMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const leaseEndMonth = new Date(Math.min(end.getTime(), currentMonthStart.getTime()));
  if (leaseStartMonth.getTime() > leaseEndMonth.getTime()) return null;

  const rentalType = String(property?.rentalType || '').toLowerCase();
  if (rentalType === 'introduction') {
    if (cutoverDate && leaseStartMonth.getTime() < cutoverDate.getTime()) return null;
    return { start: leaseStartMonth, end: leaseStartMonth };
  }

  let normalizedStart = leaseStartMonth;
  if (cutoverDate && normalizedStart.getTime() < cutoverDate.getTime()) normalizedStart = cutoverDate;
  if (normalizedStart.getTime() > leaseEndMonth.getTime()) return null;
  return { start: normalizedStart, end: leaseEndMonth };
};

export interface OutstandingTenantBreakdown {
  tenantId: string;
  tenantName: string;
  labels: string[];
}

export interface OutstandingPropertyBreakdown {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  totalOwedMonths: number;
  totalAmount: number;
  tenants: OutstandingTenantBreakdown[];
}

export interface DashboardOutstandingBreakdown {
  expenses: number;
  invoices: number;
  outstandingRentals: number;
  outstandingLevies: number;
  rentals: OutstandingPropertyBreakdown[];
  levies: OutstandingPropertyBreakdown[];
  lastUpdated: string;
}

class DashboardKpiService {
  private markCoveredMonths(
    entries: any[],
    getPropertyId: (entry: any) => string,
    getSingleMonth: (entry: any) => { year: number; month: number } | null
  ): Map<string, Set<string>> {
    const coveredByProperty = new Map<string, Set<string>>();
    const markCovered = (propertyId: string, year: number, month: number) => {
      if (!coveredByProperty.has(propertyId)) coveredByProperty.set(propertyId, new Set<string>());
      coveredByProperty.get(propertyId)!.add(monthKey(year, month));
    };

    for (const entry of entries) {
      const propertyId = getPropertyId(entry);
      if (!propertyId) continue;

      const monthsPaid = Number(entry?.advanceMonthsPaid || 1);
      const sy = Number(entry?.advancePeriodStart?.year);
      const sm = Number(entry?.advancePeriodStart?.month);
      const ey = Number(entry?.advancePeriodEnd?.year);
      const em = Number(entry?.advancePeriodEnd?.month);

      if (monthsPaid > 1 && sy && sm && ey && em) {
        let year = sy;
        let month = sm;
        while (year < ey || (year === ey && month <= em)) {
          markCovered(propertyId, year, month);
          month += 1;
          if (month > 12) {
            month = 1;
            year += 1;
          }
        }
        continue;
      }

      const singleMonth = getSingleMonth(entry);
      if (singleMonth?.year && singleMonth?.month) {
        markCovered(propertyId, singleMonth.year, singleMonth.month);
      }
    }

    return coveredByProperty;
  }

  private buildOutstandingBreakdown(params: {
    properties: any[];
    leasesByProperty: Map<string, any[]>;
    paidByProperty: Map<string, Set<string>>;
    tenantById: Map<string, any>;
    currentMonthStart: Date;
    cutoverDate: Date | null;
    getMonthlyAmount: (property: any) => number;
    includeProperty?: (property: any) => boolean;
  }): OutstandingPropertyBreakdown[] {
    const {
      properties,
      leasesByProperty,
      paidByProperty,
      tenantById,
      currentMonthStart,
      cutoverDate,
      getMonthlyAmount,
      includeProperty = () => true
    } = params;

    return properties
      .filter(includeProperty)
      .map((property) => {
        const propertyId = property?._id ? String(property._id) : '';
        if (!propertyId) return null;

        const monthlyAmount = Number(getMonthlyAmount(property) || 0);
        if (monthlyAmount <= 0) return null;

        const paidKeys = paidByProperty.get(propertyId) || new Set<string>();
        const leases = leasesByProperty.get(propertyId) || [];
        const propertyMissingMonths = new Set<string>();
        const tenants: OutstandingTenantBreakdown[] = [];

        for (const lease of leases) {
          const range = getOutstandingRangeForLease(lease, property, currentMonthStart, cutoverDate);
          if (!range) continue;

          const labels: string[] = [];
          iterateMonths(range.start, range.end, (year, month) => {
            const key = monthKey(year, month);
            if (!paidKeys.has(key)) {
              propertyMissingMonths.add(key);
              labels.push(formatMonthLabel(year, month));
            }
          });

          if (!labels.length) continue;

          const tenantId = lease?.tenantId ? String(lease.tenantId) : '';
          const tenant = tenantById.get(tenantId);
          const tenantName =
            tenant
              ? (`${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() ||
                tenant.name ||
                tenant.fullName ||
                'Unknown Tenant')
              : 'Unknown Tenant';

          tenants.push({
            tenantId,
            tenantName,
            labels
          });
        }

        if (!propertyMissingMonths.size) return null;

        return {
          propertyId,
          propertyName: property?.name || 'Unnamed Property',
          propertyAddress: property?.address || '',
          totalOwedMonths: propertyMissingMonths.size,
          totalAmount: toMoney(propertyMissingMonths.size * monthlyAmount),
          tenants
        } satisfies OutstandingPropertyBreakdown;
      })
      .filter((row): row is OutstandingPropertyBreakdown => Boolean(row))
      .sort((a, b) => b.totalOwedMonths - a.totalOwedMonths);
  }

  async getCompanyOutstandingBreakdown(companyId: string): Promise<DashboardOutstandingBreakdown> {
    const companyObjectId = toObjectId(companyId);

    const [company, account, invoiceTotals, rentalProperties, activeLeases, completedRentalPayments, completedLevyPayments, tenants] =
      await Promise.all([
        Company.findById(companyObjectId)
          .select('receivablesCutover')
          .lean(),
        CompanyAccount.findOne({ companyId: companyObjectId }).select('totalExpenses').lean(),
        Invoice.aggregate([
          { $match: { companyId: companyObjectId } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]),
        Property.find({
          companyId: companyObjectId,
          rentalType: { $nin: ['sale', 'sales'] }
        })
          .select('_id name address rent levyOrMunicipalType levyOrMunicipalAmount rentalType')
          .lean(),
        Lease.find({ companyId: companyObjectId, status: 'active' })
          .select('propertyId tenantId startDate endDate status')
          .lean(),
        Payment.find({
          companyId: companyObjectId,
          status: { $in: ['completed'] },
          paymentType: { $nin: ['sale'] }
        })
          .select('propertyId paymentDate paymentType status rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd')
          .lean(),
        LevyPayment.find({
          companyId: companyObjectId,
          status: { $in: ['completed', 'paid_out', 'paid'] as any }
        })
          .select('propertyId paymentDate status levyPeriodMonth levyPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd')
          .lean(),
        Tenant.find({ companyId: companyObjectId })
          .select('_id firstName lastName name fullName')
          .lean()
      ]);

    const expenses = toMoney(Number(account?.totalExpenses || 0));
    const invoices = toMoney(Number(invoiceTotals[0]?.total || 0));

    const cutY = Number((company as any)?.receivablesCutover?.year);
    const cutM = Number((company as any)?.receivablesCutover?.month);
    const cutoverDate = cutY && cutM ? new Date(cutY, cutM - 1, 1) : null;
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const tenantById = new Map<string, any>(
      (tenants as any[]).map((tenant) => [String(tenant._id), tenant])
    );

    const leasesByProperty = new Map<string, any[]>();
    for (const lease of activeLeases as any[]) {
      const propertyId = lease?.propertyId ? String(lease.propertyId) : '';
      if (!propertyId) continue;
      if (!leasesByProperty.has(propertyId)) leasesByProperty.set(propertyId, []);
      leasesByProperty.get(propertyId)!.push(lease);
    }

    const rentalPaidByProperty = this.markCoveredMonths(
      (completedRentalPayments as any[]).filter((payment) => {
        const paymentType = String(payment?.paymentType || '').toLowerCase();
        return paymentType !== 'levy' && paymentType !== 'municipal' && paymentType !== 'sale';
      }),
      (payment) => (payment?.propertyId ? String(payment.propertyId) : ''),
      (payment) => {
        const month = Number(payment?.rentalPeriodMonth || (payment?.paymentDate ? new Date(payment.paymentDate).getMonth() + 1 : 0));
        const year = Number(payment?.rentalPeriodYear || (payment?.paymentDate ? new Date(payment.paymentDate).getFullYear() : 0));
        return year && month ? { year, month } : null;
      }
    );

    const levyPaidByProperty = this.markCoveredMonths(
      completedLevyPayments as any[],
      (payment) => (payment?.propertyId ? String(payment.propertyId) : ''),
      (payment) => {
        const month = Number(payment?.levyPeriodMonth || (payment?.paymentDate ? new Date(payment.paymentDate).getMonth() + 1 : 0));
        const year = Number(payment?.levyPeriodYear || (payment?.paymentDate ? new Date(payment.paymentDate).getFullYear() : 0));
        return year && month ? { year, month } : null;
      }
    );

    const rentals = this.buildOutstandingBreakdown({
      properties: rentalProperties as any[],
      leasesByProperty,
      paidByProperty: rentalPaidByProperty,
      tenantById,
      currentMonthStart,
      cutoverDate,
      getMonthlyAmount: (property) => Number(property?.rent || 0)
    });

    const levies = this.buildOutstandingBreakdown({
      properties: rentalProperties as any[],
      leasesByProperty,
      paidByProperty: levyPaidByProperty,
      tenantById,
      currentMonthStart,
      cutoverDate,
      getMonthlyAmount: (property) => Number(property?.levyOrMunicipalAmount || 0),
      includeProperty: (property) => String(property?.levyOrMunicipalType || '').toLowerCase() === 'levy'
    });

    const outstandingRentals = toMoney(rentals.reduce((sum, row) => sum + row.totalAmount, 0));
    const outstandingLevies = toMoney(levies.reduce((sum, row) => sum + row.totalAmount, 0));
    const lastUpdated = new Date().toISOString();

    await DashboardKpiSnapshot.updateOne(
      { companyId: companyObjectId },
      {
        $set: {
          companyId: companyObjectId,
          expenses,
          invoices,
          outstandingRentals,
          outstandingLevies,
          lastUpdated: new Date(lastUpdated)
        }
      },
      { upsert: true }
    );

    return {
      expenses,
      invoices,
      outstandingRentals,
      outstandingLevies,
      rentals,
      levies,
      lastUpdated
    };
  }

  async refreshCompanySnapshot(companyId: string): Promise<Record<string, number | string>> {
    const data = await this.getCompanyOutstandingBreakdown(companyId);
    return {
      expenses: data.expenses,
      invoices: data.invoices,
      outstandingRentals: data.outstandingRentals,
      outstandingLevies: data.outstandingLevies,
      lastUpdated: data.lastUpdated
    };
  }

  async getCompanySnapshot(companyId: string): Promise<Record<string, number | string>> {
    const companyObjectId = toObjectId(companyId);
    const existing = await DashboardKpiSnapshot.findOne({ companyId: companyObjectId }).lean();
    if (existing) {
      if (typeof (existing as any).outstandingLevies !== 'number') {
        return this.refreshCompanySnapshot(companyId);
      }
      return {
        expenses: toMoney(Number(existing.expenses || 0)),
        invoices: toMoney(Number(existing.invoices || 0)),
        outstandingRentals: toMoney(Number(existing.outstandingRentals || 0)),
        outstandingLevies: toMoney(Number((existing as any).outstandingLevies || 0)),
        lastUpdated: existing.lastUpdated ? new Date(existing.lastUpdated).toISOString() : new Date().toISOString()
      };
    }
    return this.refreshCompanySnapshot(companyId);
  }
}

export default new DashboardKpiService();

