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
import { introductionConsumedFromPayments } from './introductionCommissionService';
import {
  computeOutstandingForLease,
  formatOutstandingMonthLabel,
  getOutstandingRangeForLease,
  iterateOutstandingMonths,
  outstandingMonthKey
} from './outstandingLeaseCalculation';

export {
  computeOutstandingForLease,
  getOutstandingRangeForLease
};

const toObjectId = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);
const toMoney = (value: number): number => Number(Number(value || 0).toFixed(2));

const monthKey = outstandingMonthKey;
const formatMonthLabel = formatOutstandingMonthLabel;
const iterateMonths = iterateOutstandingMonths;

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
    introductionRemainingByKey?: Map<string, number>;
    mode?: 'rent' | 'levy';
  }): OutstandingPropertyBreakdown[] {
    const {
      properties,
      leasesByProperty,
      paidByProperty,
      tenantById,
      currentMonthStart,
      cutoverDate,
      getMonthlyAmount,
      includeProperty = () => true,
      introductionRemainingByKey,
      mode = 'rent'
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
        let totalAmount = 0;

        for (const lease of leases) {
          const tenantId = lease?.tenantId ? String(lease.tenantId) : '';
          const leaseId = lease?._id ? String(lease._id) : '';
          const introKey = `${propertyId}:${tenantId}:${leaseId}`;
          const rentalType = String(property?.rentalType || '').toLowerCase();
          const defaultIntro = Number(lease?.rentAmount || lease?.monthlyRent || property?.rent || 0);
          const introductionRemaining = rentalType === 'introduction'
            ? (introductionRemainingByKey?.has(introKey)
              ? Number(introductionRemainingByKey.get(introKey) || 0)
              : defaultIntro)
            : 0;
          const computed = computeOutstandingForLease({
            rentalType,
            leaseStart: lease?.startDate,
            leaseEnd: lease?.endDate,
            currentMonthStart,
            cutoverDate,
            paidKeys,
            monthlyAmount,
            introductionRemaining,
            mode
          });
          if (!computed.labels.length) continue;
          computed.labels.forEach((label) => propertyMissingMonths.add(label));
          totalAmount = toMoney(totalAmount + computed.totalAmount);

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
            labels: computed.labels
          });
        }

        if (!propertyMissingMonths.size) return null;

        return {
          propertyId,
          propertyName: property?.name || 'Unnamed Property',
          propertyAddress: property?.address || '',
          totalOwedMonths: propertyMissingMonths.size,
          totalAmount,
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
          .select('propertyId tenantId startDate endDate status rentAmount monthlyRent')
          .lean(),
        Payment.find({
          companyId: companyObjectId,
          status: { $in: ['completed'] },
          paymentType: { $nin: ['sale'] }
        })
          .select('propertyId tenantId leaseId paymentDate paymentType status rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd amount depositAmount reversalOfPaymentId commissionDetails.commissionBase commissionDetails.totalCommission')
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

    const rentalTypeByProperty = new Map<string, string>(
      (rentalProperties as any[]).map((property) => [String(property._id), String(property?.rentalType || '').toLowerCase()])
    );
    for (const payment of completedRentalPayments as any[]) {
      const propertyId = payment?.propertyId ? String(payment.propertyId) : '';
      if (!propertyId || rentalTypeByProperty.get(propertyId) !== 'introduction') continue;
      const monthsPaid = Number(payment?.advanceMonthsPaid || 1);
      if (monthsPaid <= 1) continue;
      const hasPeriod = Number(payment?.advancePeriodStart?.year) && Number(payment?.advancePeriodStart?.month);
      if (hasPeriod) continue;
      const month = Number(payment?.rentalPeriodMonth || (payment?.paymentDate ? new Date(payment.paymentDate).getMonth() + 1 : 0));
      const year = Number(payment?.rentalPeriodYear || (payment?.paymentDate ? new Date(payment.paymentDate).getFullYear() : 0));
      if (!year || !month) continue;
      if (!rentalPaidByProperty.has(propertyId)) rentalPaidByProperty.set(propertyId, new Set<string>());
      let y = year;
      let m = month;
      for (let i = 0; i < monthsPaid; i += 1) {
        rentalPaidByProperty.get(propertyId)!.add(monthKey(y, m));
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }

    const levyPaidByProperty = this.markCoveredMonths(
      completedLevyPayments as any[],
      (payment) => (payment?.propertyId ? String(payment.propertyId) : ''),
      (payment) => {
        const month = Number(payment?.levyPeriodMonth || (payment?.paymentDate ? new Date(payment.paymentDate).getMonth() + 1 : 0));
        const year = Number(payment?.levyPeriodYear || (payment?.paymentDate ? new Date(payment.paymentDate).getFullYear() : 0));
        return year && month ? { year, month } : null;
      }
    );

    const introductionRemainingByKey = new Map<string, number>();
    const introPaymentsByKey = new Map<string, any[]>();
    for (const payment of completedRentalPayments as any[]) {
      const paymentType = String(payment?.paymentType || '').toLowerCase();
      if (paymentType === 'levy' || paymentType === 'municipal' || paymentType === 'sale') continue;
      const propertyId = payment?.propertyId ? String(payment.propertyId) : '';
      const tenantId = payment?.tenantId ? String(payment.tenantId) : '';
      const leaseId = payment?.leaseId ? String(payment.leaseId) : '';
      if (!propertyId || !tenantId || !leaseId) continue;
      const key = `${propertyId}:${tenantId}:${leaseId}`;
      if (!introPaymentsByKey.has(key)) introPaymentsByKey.set(key, []);
      introPaymentsByKey.get(key)!.push(payment);
    }
    const rentByLease = new Map<string, number>();
    for (const lease of activeLeases as any[]) {
      const propertyId = lease?.propertyId ? String(lease.propertyId) : '';
      const tenantId = lease?.tenantId ? String(lease.tenantId) : '';
      const leaseId = lease?._id ? String(lease._id) : '';
      if (!propertyId || !tenantId || !leaseId) continue;
      rentByLease.set(
        `${propertyId}:${tenantId}:${leaseId}`,
        Number(lease?.rentAmount || lease?.monthlyRent || 0)
      );
    }
    const rentByProperty = new Map<string, number>(
      (rentalProperties as any[]).map((property) => [String(property._id), Number(property?.rent || 0)])
    );
    for (const [key, payments] of introPaymentsByKey.entries()) {
      const propertyId = key.split(':')[0];
      const oneMonth = Number(rentByLease.get(key) || rentByProperty.get(propertyId) || 0);
      const consumed = introductionConsumedFromPayments(payments);
      introductionRemainingByKey.set(key, toMoney(Math.max(0, oneMonth - consumed)));
    }

    const rentals = this.buildOutstandingBreakdown({
      properties: rentalProperties as any[],
      leasesByProperty,
      paidByProperty: rentalPaidByProperty,
      tenantById,
      currentMonthStart,
      cutoverDate,
      getMonthlyAmount: (property) => Number(property?.rent || 0),
      introductionRemainingByKey,
      mode: 'rent'
    });

    const levies = this.buildOutstandingBreakdown({
      properties: rentalProperties as any[],
      leasesByProperty,
      paidByProperty: levyPaidByProperty,
      tenantById,
      currentMonthStart,
      cutoverDate,
      getMonthlyAmount: (property) => Number(property?.levyOrMunicipalAmount || 0),
      includeProperty: (property) => String(property?.levyOrMunicipalType || '').toLowerCase() === 'levy',
      introductionRemainingByKey,
      mode: 'levy'
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

