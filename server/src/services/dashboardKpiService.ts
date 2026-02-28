import mongoose from 'mongoose';
import DashboardKpiSnapshot from '../models/DashboardKpiSnapshot';
import { CompanyAccount } from '../models/CompanyAccount';
import { Invoice } from '../models/Invoice';
import { Payment } from '../models/Payment';
import { LevyPayment } from '../models/LevyPayment';
import { Lease } from '../models/Lease';
import { Property } from '../models/Property';
import Company from '../models/Company';

const toObjectId = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);
const toMoney = (value: number): number => Number(Number(value || 0).toFixed(2));

const monthKey = (year: number, month: number): string => `${year}-${month}`;

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

class DashboardKpiService {
  async refreshCompanySnapshot(companyId: string): Promise<Record<string, number | string>> {
    const companyObjectId = toObjectId(companyId);

    const [company, account, invoiceTotals, rentalProperties, activeLeases, completedRentalPayments, completedLevyPayments] =
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
          .select('_id rent levyOrMunicipalType levyOrMunicipalAmount')
          .lean(),
        Lease.find({ companyId: companyObjectId, status: 'active' })
          .select('propertyId startDate endDate')
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
          .lean()
      ]);

    const expenses = toMoney(Number(account?.totalExpenses || 0));
    const invoices = toMoney(Number(invoiceTotals[0]?.total || 0));

    const cutY = Number((company as any)?.receivablesCutover?.year);
    const cutM = Number((company as any)?.receivablesCutover?.month);
    const cutoverDate = cutY && cutM ? new Date(cutY, cutM - 1, 1) : null;
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const paidByProperty = new Map<string, Set<string>>();
    const markPaid = (propertyId: string, year: number, month: number) => {
      if (!paidByProperty.has(propertyId)) paidByProperty.set(propertyId, new Set<string>());
      paidByProperty.get(propertyId)!.add(monthKey(year, month));
    };

    for (const payment of completedRentalPayments as any[]) {
      const paymentType = String(payment.paymentType || '').toLowerCase();
      if (paymentType === 'levy' || paymentType === 'municipal' || paymentType === 'sale') continue;

      const propertyId = payment?.propertyId ? String(payment.propertyId) : '';
      if (!propertyId) continue;

      const monthsPaid = Number(payment?.advanceMonthsPaid || 1);
      const sy = Number(payment?.advancePeriodStart?.year);
      const sm = Number(payment?.advancePeriodStart?.month);
      const ey = Number(payment?.advancePeriodEnd?.year);
      const em = Number(payment?.advancePeriodEnd?.month);

      if (monthsPaid > 1 && sy && sm && ey && em) {
        let year = sy;
        let month = sm;
        while (year < ey || (year === ey && month <= em)) {
          markPaid(propertyId, year, month);
          month += 1;
          if (month > 12) {
            month = 1;
            year += 1;
          }
        }
      } else {
        const month = Number(payment?.rentalPeriodMonth || (payment?.paymentDate ? new Date(payment.paymentDate).getMonth() + 1 : 0));
        const year = Number(payment?.rentalPeriodYear || (payment?.paymentDate ? new Date(payment.paymentDate).getFullYear() : 0));
        if (year && month) markPaid(propertyId, year, month);
      }
    }

    const leasesByProperty = new Map<string, any[]>();
    for (const lease of activeLeases as any[]) {
      const propertyId = lease?.propertyId ? String(lease.propertyId) : '';
      if (!propertyId) continue;
      if (!leasesByProperty.has(propertyId)) leasesByProperty.set(propertyId, []);
      leasesByProperty.get(propertyId)!.push(lease);
    }

    let outstandingRentals = 0;
    let outstandingLevies = 0;
    for (const property of rentalProperties as any[]) {
      const propertyId = property?._id ? String(property._id) : '';
      if (!propertyId) continue;

      const monthlyRent = Number(property?.rent || 0);
      if (monthlyRent <= 0) continue;

      const paidKeys = paidByProperty.get(propertyId) || new Set<string>();
      const missingMonths = new Set<string>();
      const leases = leasesByProperty.get(propertyId) || [];

      for (const lease of leases) {
        const start = lease?.startDate ? new Date(lease.startDate) : null;
        const end = lease?.endDate ? new Date(lease.endDate) : currentMonthStart;
        if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) continue;

        let normalizedStart = new Date(start.getFullYear(), start.getMonth(), 1);
        if (cutoverDate && normalizedStart.getTime() < cutoverDate.getTime()) normalizedStart = cutoverDate;
        const normalizedEnd = new Date(Math.min(end.getTime(), currentMonthStart.getTime()));
        if (normalizedStart.getTime() > normalizedEnd.getTime()) continue;

        iterateMonths(normalizedStart, normalizedEnd, (year, month) => {
          const key = monthKey(year, month);
          if (!paidKeys.has(key)) missingMonths.add(key);
        });
      }

      outstandingRentals = toMoney(outstandingRentals + missingMonths.size * monthlyRent);
    }

    const paidLeviesByProperty = new Map<string, Set<string>>();
    const markLevyPaid = (propertyId: string, year: number, month: number) => {
      if (!paidLeviesByProperty.has(propertyId)) paidLeviesByProperty.set(propertyId, new Set<string>());
      paidLeviesByProperty.get(propertyId)!.add(monthKey(year, month));
    };

    for (const levy of completedLevyPayments as any[]) {
      const propertyId = levy?.propertyId ? String(levy.propertyId) : '';
      if (!propertyId) continue;

      const monthsPaid = Number(levy?.advanceMonthsPaid || 1);
      const sy = Number(levy?.advancePeriodStart?.year);
      const sm = Number(levy?.advancePeriodStart?.month);
      const ey = Number(levy?.advancePeriodEnd?.year);
      const em = Number(levy?.advancePeriodEnd?.month);

      if (monthsPaid > 1 && sy && sm && ey && em) {
        let year = sy;
        let month = sm;
        while (year < ey || (year === ey && month <= em)) {
          markLevyPaid(propertyId, year, month);
          month += 1;
          if (month > 12) {
            month = 1;
            year += 1;
          }
        }
      } else {
        const month = Number(levy?.levyPeriodMonth || (levy?.paymentDate ? new Date(levy.paymentDate).getMonth() + 1 : 0));
        const year = Number(levy?.levyPeriodYear || (levy?.paymentDate ? new Date(levy.paymentDate).getFullYear() : 0));
        if (year && month) markLevyPaid(propertyId, year, month);
      }
    }

    for (const property of rentalProperties as any[]) {
      if (String(property?.levyOrMunicipalType || '').toLowerCase() !== 'levy') continue;

      const propertyId = property?._id ? String(property._id) : '';
      if (!propertyId) continue;

      const monthlyLevy = Number(property?.levyOrMunicipalAmount || 0);
      if (monthlyLevy <= 0) continue;

      const paidKeys = paidLeviesByProperty.get(propertyId) || new Set<string>();
      const missingMonths = new Set<string>();
      const leases = leasesByProperty.get(propertyId) || [];

      for (const lease of leases) {
        const start = lease?.startDate ? new Date(lease.startDate) : null;
        const end = lease?.endDate ? new Date(lease.endDate) : currentMonthStart;
        if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) continue;

        let normalizedStart = new Date(start.getFullYear(), start.getMonth(), 1);
        if (cutoverDate && normalizedStart.getTime() < cutoverDate.getTime()) normalizedStart = cutoverDate;
        const normalizedEnd = new Date(Math.min(end.getTime(), currentMonthStart.getTime()));
        if (normalizedStart.getTime() > normalizedEnd.getTime()) continue;

        iterateMonths(normalizedStart, normalizedEnd, (year, month) => {
          const key = monthKey(year, month);
          if (!paidKeys.has(key)) missingMonths.add(key);
        });
      }

      outstandingLevies = toMoney(outstandingLevies + missingMonths.size * monthlyLevy);
    }

    await DashboardKpiSnapshot.updateOne(
      { companyId: companyObjectId },
      {
        $set: {
          companyId: companyObjectId,
          expenses,
          invoices,
          outstandingRentals,
          outstandingLevies,
          lastUpdated: new Date()
        }
      },
      { upsert: true }
    );

    return {
      expenses,
      invoices,
      outstandingRentals,
      outstandingLevies,
      lastUpdated: new Date().toISOString()
    };
  }

  async getCompanySnapshot(companyId: string): Promise<Record<string, number | string>> {
    const companyObjectId = toObjectId(companyId);
    const existing = await DashboardKpiSnapshot.findOne({ companyId: companyObjectId }).lean();
    if (existing) {
      // Self-heal older snapshot documents created before outstandingLevies existed.
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

