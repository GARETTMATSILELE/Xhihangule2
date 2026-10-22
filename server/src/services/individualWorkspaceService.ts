import mongoose from 'mongoose';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import propertyAccountService from './propertyAccountService';
import { AppError } from '../middleware/errorHandler';
import individualAccountingService from './individualAccountingService';
import individualTaxMetadataService from './individualTaxMetadataService';
import { LandlordFinancialTransaction } from '../models/LandlordFinancialTransaction';
import { TransactionTaxSnapshot } from '../models/TransactionTaxSnapshot';
import { sumPropertyAccountPeriodPnl } from './propertyAccountTotals';
import { daysInRange, resolveReportingPeriod } from './individualReportingPeriod';
import { countsTowardRentReceipt } from './rentalPeriodCoverage';

type EntryType = 'income' | 'expense' | 'maintenance';
type ReportType =
  | 'property-performance'
  | 'rent-collection'
  | 'expense'
  | 'profit-loss'
  | 'occupancy'
  | 'cashflow'
  | 'tax-preparation';

const INCOME_CATEGORIES = ['Rent', 'Parking', 'Levy Recovery', 'Utilities Recovery', 'Storage Income', 'Other Income'];
const EXPENSE_CATEGORIES = ['Maintenance', 'Municipal', 'Levies', 'Security', 'Insurance', 'Gardening', 'Cleaning', 'Repairs', 'Utilities', 'Legal', 'Other'];

function asObjectId(value: string) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new AppError('Invalid id', 400);
  return new mongoose.Types.ObjectId(value);
}

function monthBounds(month?: string) {
  if (!month) {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
    };
  }
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12) throw new AppError('Month must use YYYY-MM format', 400);
  return {
    start: new Date(year, monthIndex - 1, 1),
    end: new Date(year, monthIndex, 1)
  };
}

function monthKey(value: Date | string | undefined) {
  const date = value ? new Date(value) : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function txSignedAmount(tx: any) {
  const amount = Number(tx?.amount || 0);
  if (tx?.type === 'income') return amount;
  if (tx?.type === 'opening_balance') return tx?.direction === 'debit' ? -amount : amount;
  return -amount;
}

function buildRunningLedger(transactions: any[]) {
  let runningBalance = 0;
  return [...transactions]
    .sort((a, b) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime())
    .map((tx) => {
      runningBalance += txSignedAmount(tx);
      return { ...(tx.toObject?.() ?? tx), runningBalance };
    });
}

function trendFromTransactions(transactions: any[], type?: 'income' | 'expense') {
  const months: Record<string, number> = {};
  for (const tx of transactions) {
    const isIncome = tx.type === 'income';
    if (type === 'income' && !isIncome) continue;
    if (type === 'expense' && (isIncome || tx.type === 'opening_balance')) continue;
    const key = monthKey(tx.date);
    months[key] = (months[key] || 0) + Number(tx.amount || 0);
  }
  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({ month, amount }));
}

function collectionStatus(expected: number, collected: number) {
  if (expected <= 0 || collected >= expected) return 'green';
  if (collected > 0) return 'amber';
  return 'red';
}

function entityId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    // Mongoose ObjectId exposes `_id` as itself; never recurse into that.
    if (typeof (value as { toHexString?: () => string }).toHexString === 'function') {
      return String(value);
    }
    const obj = value as { _id?: unknown; $oid?: string };
    if (obj.$oid) return String(obj.$oid);
    if (obj._id && obj._id !== value) return entityId(obj._id);
  }
  try {
    return String(value);
  } catch {
    return '';
  }
}

function collectOccupiedPropertyIds(tenants: any[], leases: any[]): Set<string> {
  const occupied = new Set<string>();
  const endedLeaseStatuses = new Set(['terminated', 'closed', 'draft', 'pending_approval']);

  for (const tenant of tenants || []) {
    if (String(tenant?.status || 'Active').toLowerCase() === 'inactive') continue;
    const linked = [
      entityId(tenant?.propertyId),
      ...((Array.isArray(tenant?.propertyIds) ? tenant.propertyIds : []).map(entityId))
    ].filter(Boolean);
    linked.forEach((propertyId) => occupied.add(propertyId));
  }

  for (const lease of leases || []) {
    if (endedLeaseStatuses.has(String(lease?.status || '').toLowerCase())) continue;
    if (!entityId(lease?.tenantId)) continue;
    const propertyId = entityId(lease?.propertyId);
    if (propertyId) occupied.add(propertyId);
  }

  return occupied;
}

function toCsv(rows: any[]) {
  if (!rows.length) return '';
  const headers = Array.from(rows.reduce((set: Set<string>, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
    return set;
  }, new Set<string>())) as string[];
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row?.[header])).join(','))
  ].join('\n');
}

async function toPdf(title: string, rows: any[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  page.drawText(title, { x: 40, y, size: 16, font: bold });
  y -= 28;
  page.drawText(`Generated ${new Date().toLocaleString()}`, { x: 40, y, size: 9, font });
  y -= 24;

  const lines = rows.length
    ? rows.flatMap((row) => Object.entries(row).map(([key, value]) => `${key}: ${value ?? ''}`).concat(''))
    : ['No data'];

  for (const line of lines) {
    if (y < 40) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(String(line).slice(0, 110), { x: 40, y, size: 9, font });
    y -= 14;
  }

  return Buffer.from(await pdf.save());
}

export class IndividualWorkspaceService {
  async assertIndividualCompany(companyId?: string) {
    if (!companyId) throw new AppError('Company ID is required', 400);
    const company = await Company.findById(companyId).select('_id workspaceType plan featureFlags').lean();
    if (!company) throw new AppError('Company not found', 404);
    const isIndividual = (company as any).workspaceType === 'individual' || (company as any).plan === 'INDIVIDUAL';
    if (!isIndividual) throw new AppError('Individual workspace access required', 403);
    return company;
  }

  private async getCompanyProperties(companyId: string) {
    return Property.find({ companyId: asObjectId(companyId), isDeleted: { $ne: true } }).sort({ name: 1 }).lean();
  }

  private async getAccounts(properties: any[]) {
    return Promise.all(
      properties.map(async (property) => {
        let account: any;
        try {
          account = await propertyAccountService.getPropertyAccount(String(property._id));
        } catch (error: any) {
          // A legacy or partially-created property should not make the whole
          // individual workspace unusable. Treat missing ledgers as empty
          // profit-centre ledgers until the first income/expense is posted.
          const status = Number(error?.statusCode || error?.status || error?.response?.status || 0);
          if (status !== 404) throw error;
          account = {
            _id: '',
            propertyId: String(property._id),
            ledgerType: 'rental',
            transactions: [],
            ownerPayouts: [],
            runningBalance: 0,
            totalIncome: 0,
            totalExpenses: 0,
            totalOwnerPayouts: 0
          };
        }
        return { property, account };
      })
    );
  }

  private propertyMetrics(
    row: { property: any; account: any },
    activeLeaseCountByProperty: Map<string, number>,
    collectedThisMonth: Map<string, number>,
    occupiedPropertyIds: Set<string>,
    periodStart?: Date,
    periodEnd?: Date,
    yearStart?: Date,
    yearEnd?: Date,
    periodDays = 30
  ) {
    const { property, account } = row;
    const units = Math.max(1, Number(property.units || 1));
    const isOccupied = occupiedPropertyIds.has(String(property._id));
    const occupiedUnits = isOccupied ? units : 0;
    const occupancyPercent = isOccupied ? 100 : 0;
    const monthlyRent = Number(property.rent || 0);
    const expectedRent = activeLeaseCountByProperty.has(String(property._id)) ? monthlyRent : 0;
    const collectedRent = Number(collectedThisMonth.get(String(property._id)) || 0);
    const pnl = sumPropertyAccountPeriodPnl(account.transactions, periodStart, periodEnd);
    const ytd = sumPropertyAccountPeriodPnl(account.transactions, yearStart, yearEnd);
    const lifetime = sumPropertyAccountPeriodPnl(account.transactions);
    const monthlyIncome = pnl.income;
    const monthlyExpenses = pnl.expenses;
    const netProfit = pnl.net;
    const collectionPercent = expectedRent > 0 ? Math.min(100, Math.round((collectedRent / expectedRent) * 100)) : 100;
    const expenseRatio = monthlyIncome > 0 ? Math.round((monthlyExpenses / monthlyIncome) * 100) : 0;
    const profitabilityPercent = monthlyIncome > 0 ? Math.round((netProfit / monthlyIncome) * 100) : 0;
    return {
      propertyId: String(property._id),
      propertyName: property.name,
      address: property.address,
      image: Array.isArray(property.images) ? property.images[0] : undefined,
      status: property.status,
      occupancyStatus: occupiedUnits > 0 ? 'Occupied' : 'Vacant',
      units,
      occupiedUnits,
      vacantUnits: Math.max(0, units - occupiedUnits),
      monthlyRent,
      expectedRent,
      collectedRent,
      outstandingRent: Math.max(0, expectedRent - collectedRent),
      rentCollectionStatus: collectionStatus(expectedRent, collectedRent),
      monthlyIncome,
      monthlyExpenses,
      netProfit,
      yearToDateProfit: ytd.net,
      financialYearProfit: ytd.net,
      annualisedRunRate: Number(((netProfit / Math.max(1, periodDays)) * 365).toFixed(2)),
      lifetimeIncome: lifetime.income,
      lifetimeExpenses: lifetime.expenses,
      lifetimeNet: lifetime.net,
      runningBalance: Number(account.runningBalance || 0),
      occupancyPercent,
      collectionPercent,
      profitabilityPercent,
      expenseRatio,
      maintenanceDue: property.status === 'maintenance' || property.propertyOperationalStatus === 'Under Maintenance'
    };
  }

  async getSummary(companyId: string, periodBasis?: string) {
    const period = resolveReportingPeriod(periodBasis);
    const ytd = resolveReportingPeriod('year_to_date');
    const periodDays = daysInRange(period.start, period.end) || 30;
    const [properties, tenants, leases, payments, maintenance] = await Promise.all([
      this.getCompanyProperties(companyId),
      Tenant.find({ companyId: asObjectId(companyId) }).lean(),
      Lease.find({ companyId: asObjectId(companyId), status: { $in: ['active', 'expiring_soon'] } }).lean(),
      Payment.find({ companyId: asObjectId(companyId), status: { $in: ['completed', 'paid', 'success'] } as any }).sort({ paymentDate: -1 }).limit(200).lean(),
      MaintenanceRequest.find({ companyId: asObjectId(companyId) }).sort({ updatedAt: -1 }).limit(50).lean()
    ]);
    const rows = await this.getAccounts(properties);
    const collectStart = period.start || new Date(0);
    const collectEnd = period.end || new Date();
    const activeLeaseCountByProperty = new Map<string, number>();
    for (const lease of leases) activeLeaseCountByProperty.set(String(lease.propertyId), (activeLeaseCountByProperty.get(String(lease.propertyId)) || 0) + 1);
    const collectedThisMonth = new Map<string, number>();
    for (const payment of payments) {
      if (!countsTowardRentReceipt(payment as any)) continue;
      const date = new Date((payment as any).paymentDate || (payment as any).createdAt);
      if (date >= collectStart && date < collectEnd) {
        const pid = String((payment as any).propertyId || '');
        collectedThisMonth.set(pid, (collectedThisMonth.get(pid) || 0) + Number((payment as any).amount || 0));
      }
    }
    const occupiedPropertyIds = collectOccupiedPropertyIds(tenants, leases);
    const propertyMetrics = rows.map((row) => this.propertyMetrics(
      row,
      activeLeaseCountByProperty,
      collectedThisMonth,
      occupiedPropertyIds,
      period.start,
      period.end,
      ytd.start,
      ytd.end,
      periodDays
    ));
    const monthlyIncome = propertyMetrics.reduce((sum, p) => sum + p.monthlyIncome, 0);
    const monthlyExpenses = propertyMetrics.reduce((sum, p) => sum + p.monthlyExpenses, 0);
    const yearToDateProfit = propertyMetrics.reduce((sum, p) => sum + p.yearToDateProfit, 0);
    const annualisedRunRate = propertyMetrics.reduce((sum, p) => sum + p.annualisedRunRate, 0);
    const expectedRent = propertyMetrics.reduce((sum, p) => sum + p.expectedRent, 0);
    const collectedRent = propertyMetrics.reduce((sum, p) => sum + p.collectedRent, 0);
    const allTransactions = rows.flatMap((row) => row.account.transactions || []);
    const recentActivity = [
      ...payments.slice(0, 10).map((payment: any) => ({
        type: 'rent_payment',
        date: payment.paymentDate || payment.createdAt,
        description: payment.referenceNumber ? `Rent payment ${payment.referenceNumber}` : 'Rent payment recorded',
        amount: Number(payment.amount || 0),
        propertyId: String(payment.propertyId || '')
      })),
      ...allTransactions
        .filter((tx: any) => tx.type !== 'income')
        .slice(-10)
        .map((tx: any) => ({
          type: 'expense',
          date: tx.date || tx.createdAt,
          description: tx.description,
          amount: Number(tx.amount || 0),
          propertyId: ''
        })),
      ...leases
        .filter((lease: any) => lease.endDate && new Date(lease.endDate).getTime() < Date.now() + 45 * 24 * 60 * 60 * 1000)
        .slice(0, 10)
        .map((lease: any) => ({
          type: 'lease_renewal',
          date: lease.endDate,
          description: 'Lease renewal due',
          amount: 0,
          propertyId: String(lease.propertyId || '')
        })),
      ...maintenance.slice(0, 10).map((item: any) => ({
        type: 'maintenance',
        date: item.updatedAt || item.createdAt,
        description: item.title || 'Maintenance request',
        amount: Number(item.paidAmount || item.estimatedCost || 0),
        propertyId: String(item.propertyId || '')
      }))
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 20);

    return {
      period: {
        basis: period.basis,
        label: period.label,
        start: period.start?.toISOString() || null,
        end: period.end?.toISOString() || null
      },
      summary: {
        totalProperties: properties.length,
        totalTenants: tenants.length,
        occupiedUnits: propertyMetrics.filter((p) => p.occupancyStatus === 'Occupied').length,
        vacantUnits: propertyMetrics.filter((p) => p.occupancyStatus !== 'Occupied').length,
        monthlyIncome,
        monthlyExpenses,
        netProfit: monthlyIncome - monthlyExpenses,
        yearToDateProfit,
        financialYearProfit: yearToDateProfit,
        annualisedRunRate: Number(annualisedRunRate.toFixed(2)),
        rentCollected: collectedRent,
        outstandingRent: Math.max(0, expectedRent - collectedRent),
        netMonthlyCashflow: monthlyIncome - monthlyExpenses,
        rentCollectionRate: expectedRent > 0 ? Math.round((collectedRent / expectedRent) * 100) : 100
      },
      charts: {
        incomeTrend: trendFromTransactions(allTransactions, 'income'),
        expenseTrend: trendFromTransactions(allTransactions, 'expense'),
        cashflowTrend: trendFromTransactions(allTransactions).map((row) => ({ month: row.month, amount: row.amount })),
        propertyProfitability: propertyMetrics.map((p) => ({ propertyName: p.propertyName, netProfit: p.netProfit })),
        occupancyRate: propertyMetrics.map((p) => ({ propertyName: p.propertyName, occupancyPercent: p.occupancyPercent })),
        rentCollectionTrend: propertyMetrics.map((p) => ({ propertyName: p.propertyName, collectionPercent: p.collectionPercent }))
      },
      properties: propertyMetrics,
      recentActivity
    };
  }

  async getAccounting(companyId: string, periodBasis?: string) {
    const data = await this.getSummary(companyId, periodBasis);
    const properties = [...data.properties].sort((a, b) => b.netProfit - a.netProfit);
    return {
      ...data,
      overview: {
        periodLabel: data.period.label,
        incomeThisMonth: data.summary.monthlyIncome,
        expensesThisMonth: data.summary.monthlyExpenses,
        netProfit: data.summary.netProfit,
        yearToDateProfit: data.summary.yearToDateProfit,
        outstandingRent: data.summary.outstandingRent
      },
      topPerformingProperties: properties.slice(0, 5),
      worstPerformingProperties: properties.slice(-5).reverse()
    };
  }

  async getLedger(companyId: string, propertyId: string) {
    const property = await Property.findOne({ _id: asObjectId(propertyId), companyId: asObjectId(companyId), isDeleted: { $ne: true } }).lean();
    if (!property) throw new AppError('Property not found', 404);
    const account = await propertyAccountService.getPropertyAccount(propertyId);
    return {
      property,
      account: {
        ...(account.toObject?.() ?? account),
        transactions: buildRunningLedger(account.transactions || [])
      }
    };
  }

  async listEntries(companyId: string, type: 'income' | 'expense', filters: {
    propertyId?: string;
    month?: string;
    taxPeriodId?: string;
    taxPeriodKey?: string;
    taxTreatment?: string;
    taxCalculationStatus?: string;
    taxType?: string;
  }) {
    const properties = filters.propertyId
      ? [await Property.findOne({ _id: asObjectId(filters.propertyId), companyId: asObjectId(companyId), isDeleted: { $ne: true } }).lean()]
      : await this.getCompanyProperties(companyId);
    const propertyList = properties.filter(Boolean) as any[];
    const rows = await this.getAccounts(propertyList);
    const bounds = filters.month ? monthBounds(filters.month) : null;
    const mapped = rows.flatMap(({ property, account }) => {
      return (account.transactions || [])
        .filter((tx: any) => type === 'income' ? tx.type === 'income' : tx.type !== 'income' && tx.type !== 'opening_balance')
        .filter((tx: any) => {
          if (!bounds) return true;
          const date = new Date(tx.date || tx.createdAt);
          return date >= bounds.start && date < bounds.end;
        })
        .map((tx: any) => ({ ...(tx.toObject?.() ?? tx), propertyId: String(property._id), propertyName: property.name }));
    }).sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

    const paIds = mapped.map((tx: any) => tx._id).filter(Boolean);
    const canonical = paIds.length
      ? await LandlordFinancialTransaction.find({
          companyId: asObjectId(companyId),
          propertyAccountTransactionId: { $in: paIds }
        })
          .select('_id propertyAccountTransactionId taxPeriodKey taxCalculationStatus deductibility capitalOrRevenue')
          .lean()
      : [];
    const snapshots = canonical.length
      ? await TransactionTaxSnapshot.find({
          companyId: asObjectId(companyId),
          sourceType: 'LandlordFinancialTransaction',
          sourceId: { $in: canonical.map((row) => row._id) }
        })
          .select('sourceId taxPeriodKey taxPeriodId taxCalculationStatus vatTreatment rentalTaxTreatment taxTypesRelevant classificationSource reviewReasons')
          .lean()
      : [];
    const lftByPa = new Map(canonical.map((row) => [String(row.propertyAccountTransactionId), row]));
    const snapBySource = new Map(snapshots.map((row) => [String(row.sourceId), row]));

    return mapped
      .map((tx: any) => {
        const lft = lftByPa.get(String(tx._id));
        const snap = lft ? snapBySource.get(String(lft._id)) : null;
        return {
          ...tx,
          taxPeriodKey: snap?.taxPeriodKey || lft?.taxPeriodKey || null,
          taxPeriodId: snap?.taxPeriodId ? String(snap.taxPeriodId) : null,
          taxCalculationStatus: snap?.taxCalculationStatus || lft?.taxCalculationStatus || null,
          vatTreatment: snap?.vatTreatment || null,
          rentalTaxTreatment: snap?.rentalTaxTreatment || null,
          taxTypesRelevant: snap?.taxTypesRelevant || [],
          deductibility: lft?.deductibility || tx.deductibility || null,
          capitalOrRevenue: lft?.capitalOrRevenue || tx.capitalOrRevenue || null,
          taxAmount: null,
          vatAmount: null
        };
      })
      .filter((tx: any) => {
        if (filters.taxPeriodKey && tx.taxPeriodKey !== filters.taxPeriodKey) return false;
        if (filters.taxPeriodId && tx.taxPeriodId !== filters.taxPeriodId) return false;
        if (filters.taxCalculationStatus && tx.taxCalculationStatus !== filters.taxCalculationStatus) return false;
        if (filters.taxType && !(tx.taxTypesRelevant || []).includes(filters.taxType)) return false;
        if (filters.taxTreatment && tx.vatTreatment !== filters.taxTreatment && tx.rentalTaxTreatment !== filters.taxTreatment) return false;
        return true;
      });
  }

  async postEntry(companyId: string, userId: string, entryType: EntryType, body: any, idempotencyKey?: string) {
    const propertyId = String(body.propertyId || body.property || '');
    const canonical = await individualAccountingService.postEntry({
      companyId,
      userId,
      entryType: entryType === 'maintenance' ? 'maintenance' : entryType,
      propertyId,
      category: body.category,
      description: body.description,
      amount: Number(body.amount || 0),
      date: body.date,
      reference: body.reference || body.referenceNumber,
      notes: body.notes,
      receiptUrl: body.receiptUrl,
      attachments: body.attachments,
      supplier: body.supplier,
      supplierTin: body.supplierTin,
      supplierVatNumber: body.supplierVatNumber,
      invoiceNumber: body.invoiceNumber,
      paymentMethod: body.paymentMethod,
      currency: body.currency,
      vatMode: body.vatMode,
      capitalOrRevenue: body.capitalOrRevenue,
      deductibility: body.deductibility,
      inputVatEligibility: body.inputVatEligibility,
      sourceMaintenanceId: body.sourceMaintenanceId || body.maintenanceId,
      overrideReason: body.overrideReason,
      idempotencyKey: idempotencyKey || body.idempotencyKey
    });
    const account = await propertyAccountService.getOrCreatePropertyAccount(propertyId);
    const tax = await individualTaxMetadataService.getForSource(
      companyId,
      'LandlordFinancialTransaction',
      String(canonical._id)
    );
    return { account, tax };
  }

  async correctEntry(companyId: string, userId: string, propertyId: string, transactionId: string, body: any, mode: 'edit' | 'delete') {
    try {
      await individualAccountingService.reverseEntry({
        companyId,
        userId,
        propertyId,
        transactionId,
        mode,
        replacement: mode === 'edit'
          ? {
              companyId,
              userId,
              entryType: body.entryType || (body.category && String(body.category).toUpperCase().includes('INCOME') ? 'income' : 'expense'),
              propertyId,
              ...body
            }
          : undefined
      });
      return this.getLedger(companyId, propertyId);
    } catch (error: any) {
      if (Number(error?.statusCode || 0) !== 404) throw error;
    }

    const ledger = await this.getLedger(companyId, propertyId);
    const tx = (ledger.account.transactions || []).find((item: any) => String(item._id) === String(transactionId));
    if (!tx) throw new AppError('Ledger entry not found', 404);
    const reversalType: EntryType = tx.type === 'income' ? 'expense' : 'income';
    await this.postEntry(companyId, userId, reversalType, {
      propertyId,
      amount: Number(tx.amount || 0),
      date: new Date(),
      category: reversalType === 'income' ? 'Other Income' : 'Other',
      description: `${mode === 'delete' ? 'Delete' : 'Edit'} reversal: ${tx.description || tx.category || 'ledger entry'}`,
      reference: `REV-${String(tx._id).slice(-8)}`,
      notes: `Correction entry for ${tx._id}`
    }, `${mode}:reversal:${transactionId}`);
    if (mode === 'delete') return this.getLedger(companyId, propertyId);
    const newType: EntryType = tx.type === 'income' ? 'income' : 'expense';
    await this.postEntry(companyId, userId, newType, { ...body, propertyId }, `${mode}:replacement:${transactionId}`);
    return this.getLedger(companyId, propertyId);
  }

  async markMaintenanceApproved(companyId: string, id: string) {
    const request = await MaintenanceRequest.findOneAndUpdate(
      { _id: asObjectId(id), companyId: asObjectId(companyId) },
      { $set: { status: 'approved', lastActivityAt: new Date() } },
      { new: true }
    );
    if (!request) throw new AppError('Maintenance request not found', 404);
    return request;
  }

  async recordMaintenanceExpense(companyId: string, userId: string, id: string, body: any, idempotencyKey?: string) {
    const request = await MaintenanceRequest.findOne({ _id: asObjectId(id), companyId: asObjectId(companyId) });
    if (!request) throw new AppError('Maintenance request not found', 404);
    const amount = Number(body.amount || request.paidAmount || request.estimatedCost || request.requestedAmount || 0);
    const account = await this.postEntry(companyId, userId, 'maintenance', {
      propertyId: String(request.propertyId),
      amount,
      date: body.date || new Date(),
      category: 'Maintenance',
      description: body.description || request.title || 'Maintenance expense',
      reference: body.reference || request.paymentReference,
      attachments: body.attachments
    }, idempotencyKey || `maintenance:${id}`);
    request.status = 'closed' as any;
    request.paymentStatus = 'paid';
    request.paidAmount = amount;
    request.paymentDate = body.date ? new Date(body.date) : new Date();
    request.paymentReference = body.reference || request.paymentReference;
    request.lastActivityAt = new Date();
    await request.save();
    return { request, account };
  }

  async getReport(companyId: string, reportType: ReportType, format: string, filters: {
    taxPeriodId?: string;
    taxPeriodKey?: string;
    taxTreatment?: string;
    taxCalculationStatus?: string;
    taxType?: string;
  } = {}) {
    const data = await this.getAccounting(companyId);
    const taxFilters = {
      taxPeriodId: filters.taxPeriodId,
      taxPeriodKey: filters.taxPeriodKey,
      taxTreatment: filters.taxTreatment,
      taxCalculationStatus: filters.taxCalculationStatus,
      taxType: filters.taxType
    };
    let rows: any[];
    switch (reportType) {
      case 'rent-collection':
        rows = data.properties.map((p) => ({
          property: p.propertyName,
          expectedRent: p.expectedRent,
          collectedRent: p.collectedRent,
          outstandingRent: p.outstandingRent,
          collectionPercent: p.collectionPercent,
          status: p.rentCollectionStatus
        }));
        break;
      case 'expense':
        rows = await this.listEntries(companyId, 'expense', taxFilters);
        break;
      case 'profit-loss':
      case 'cashflow':
      case 'tax-preparation':
      case 'property-performance':
        rows = data.properties.map((p) => ({
          property: p.propertyName,
          income: p.monthlyIncome,
          expenses: p.monthlyExpenses,
          netProfit: p.netProfit,
          yearToDateProfit: p.yearToDateProfit,
          annualisedRunRate: p.annualisedRunRate,
          expenseRatio: p.expenseRatio,
          profitabilityPercent: p.profitabilityPercent
        }));
        break;
      case 'occupancy':
        rows = data.properties.map((p) => ({
          property: p.propertyName,
          units: p.units,
          occupiedUnits: p.occupiedUnits,
          vacantUnits: p.vacantUnits,
          occupancyPercent: p.occupancyPercent
        }));
        break;
      default:
        rows = data.properties;
    }

    if (format === 'pdf') {
      return {
        contentType: 'application/pdf',
        body: await toPdf(reportType, rows)
      };
    }
    if (format === 'csv' || format === 'excel') {
      return {
        contentType: format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv',
        body: toCsv(rows)
      };
    }
    return { contentType: 'application/json', body: { reportType, rows, filters: taxFilters, generatedAt: new Date().toISOString() } };
  }
}

export default new IndividualWorkspaceService();
