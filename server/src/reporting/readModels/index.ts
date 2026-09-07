import mongoose from 'mongoose';
import { Company } from '../../models/Company';
import { Inspection } from '../../models/Inspection';
import { Lease } from '../../models/Lease';
import { MaintenanceRequest } from '../../models/MaintenanceRequest';
import PropertyAccount, { IPropertyAccount } from '../../models/PropertyAccount';
import { Payment } from '../../models/Payment';
import { Property } from '../../models/Property';
import { PropertyOwner } from '../../models/PropertyOwner';
import { Tenant } from '../../models/Tenant';
import { CanonicalLedgerEntry, LedgerQuery } from '../ledger';
import { resolveStatementRentAmount } from '../statementRent';

export interface OwnerReadModel {
  id?: string;
  displayName: string;
  email?: string;
  phone?: string;
}

export interface PropertyReadModel {
  id: string;
  name: string;
  address?: string;
  ledgerType?: 'rental' | 'sale' | string;
  ownerId?: string;
  ownerName?: string;
}

export interface OwnerReadService {
  getOwnerForProperty(companyId: string, propertyId: string): Promise<OwnerReadModel | undefined>;
}

export interface PropertyReadService {
  getProperty(companyId: string, propertyId: string): Promise<PropertyReadModel | undefined>;
}

export interface LedgerReadService {
  getLedgerEntries(query: LedgerQuery): Promise<CanonicalLedgerEntry[]>;
}

export interface PaymentCommissionSnapshot {
  paymentId: string;
  paymentDate: Date;
  referenceNumber?: string;
  grossRent: number;
  levy: number;
  commission: number;
  vatOnCommission: number;
  vatRate?: number;
  vatTreatment?: 'inclusive' | 'exclusive';
  ownerPayable: number;
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month: number; year: number };
  advancePeriodEnd?: { month: number; year: number };
}

export interface PaymentReadService {
  getPaymentTraceReferences(companyId: string, paymentIds: string[]): Promise<Record<string, unknown>>;
  getPropertyCommissionSnapshots?(
    companyId: string,
    propertyId: string,
    from: Date,
    to: Date,
    paymentIds?: string[]
  ): Promise<PaymentCommissionSnapshot[]>;
}

export interface LeaseReadService {
  getLeaseContext(companyId: string, propertyId: string): Promise<Record<string, unknown> | undefined>;
}

export interface MaintenanceReadService {
  getMaintenanceContext(companyId: string, propertyId: string): Promise<Record<string, unknown>>;
}

export interface InspectionReadService {
  getInspectionContext(companyId: string, propertyId: string): Promise<Record<string, unknown>>;
}

export interface TrustReadService {
  getTrustContext(companyId: string, propertyId: string): Promise<Record<string, unknown> | undefined>;
}

export interface ReportingReadModels {
  owner: OwnerReadService;
  property: PropertyReadService;
  ledger: LedgerReadService;
  payment: PaymentReadService;
  lease: LeaseReadService;
  maintenance: MaintenanceReadService;
  inspection: InspectionReadService;
  trust: TrustReadService;
}

const isWithinPeriod = (date: Date, from?: Date, to?: Date): boolean => {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

const toId = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  const maybeToString = (value as { toString?: () => string }).toString;
  return typeof maybeToString === 'function' ? maybeToString.call(value) : undefined;
};

const normalizeDirection = (transaction: any): 'debit' | 'credit' => {
  if (transaction.type === 'opening_balance') return transaction.direction === 'debit' ? 'debit' : 'credit';
  return ['expense', 'repair', 'maintenance', 'owner_payout'].includes(transaction.type) ? 'debit' : 'credit';
};

const propertyAccountToLedgerEntries = (
  account: IPropertyAccount,
  context: { companyId: string; currency: string; from?: Date; to?: Date }
): CanonicalLedgerEntry[] => {
  const propertyId = toId(account.propertyId);
  const ownerId = toId(account.ownerId);
  const entries: CanonicalLedgerEntry[] = [];

  for (const transaction of account.transactions || []) {
    const effectiveDate = new Date(transaction.date);
    if (!isWithinPeriod(effectiveDate, context.from, context.to)) continue;
    if (transaction.status === 'cancelled' || transaction.status === 'failed') continue;

    const amount = Number(transaction.amount || 0);
    const direction = normalizeDirection(transaction);
    entries.push({
      entryId: `property:${toId(account._id) || propertyId}:${toId(transaction._id) || transaction.idempotencyKey || effectiveDate.getTime()}`,
      sourceSystem: 'property_account',
      sourceModel: 'PropertyAccount.transactions',
      sourceId: toId(transaction._id) || transaction.idempotencyKey || '',
      companyId: context.companyId,
      propertyId,
      ownerId,
      eventType: transaction.transactionCategory || transaction.type,
      direction,
      debit: direction === 'debit' ? amount : 0,
      credit: direction === 'credit' ? amount : 0,
      amount,
      currency: context.currency,
      effectiveDate,
      postedDate: transaction.createdAt ? new Date(transaction.createdAt) : effectiveDate,
      status: transaction.status,
      runningBalance: typeof (transaction as any).runningBalance === 'number' ? (transaction as any).runningBalance : undefined,
      metadata: {
        description: transaction.description,
        category: transaction.category,
        referenceNumber: transaction.referenceNumber,
        paymentId: toId(transaction.paymentId),
        accountingTreatment: transaction.accountingTreatment,
        passThroughType: transaction.passThroughType,
        recipientName: (transaction as any).recipientName
      }
    });
  }

  for (const payout of account.ownerPayouts || []) {
    const effectiveDate = new Date(payout.date);
    if (!isWithinPeriod(effectiveDate, context.from, context.to)) continue;
    if (payout.status === 'cancelled' || payout.status === 'failed') continue;
    const amount = Number(payout.amount || 0);
    entries.push({
      entryId: `owner-payout:${toId(account._id) || propertyId}:${toId(payout._id) || payout.referenceNumber}`,
      sourceSystem: 'owner_payout',
      sourceModel: 'PropertyAccount.ownerPayouts',
      sourceId: toId(payout._id) || payout.referenceNumber,
      companyId: context.companyId,
      propertyId,
      ownerId: toId(payout.recipientId) || ownerId,
      eventType: 'OWNER_PAYOUT',
      direction: 'debit',
      debit: amount,
      credit: 0,
      amount,
      currency: context.currency,
      effectiveDate,
      postedDate: payout.createdAt ? new Date(payout.createdAt) : effectiveDate,
      status: payout.status,
      metadata: {
        referenceNumber: payout.referenceNumber,
        recipientName: payout.recipientName,
        description: payout.recipientName ? `Owner payout - ${payout.recipientName}` : payout.notes,
        paymentMethod: payout.paymentMethod,
        notes: payout.notes
      }
    });
  }

  for (const passThroughAccount of account.passThroughAccounts || []) {
    for (const transaction of passThroughAccount.transactions || []) {
      const effectiveDate = new Date(transaction.date);
      if (!isWithinPeriod(effectiveDate, context.from, context.to)) continue;
      if (transaction.status === 'cancelled' || transaction.status === 'failed') continue;
      const amount = Number(transaction.amount || 0);
      const direction = transaction.type === 'collection' ? 'credit' : 'debit';
      entries.push({
        entryId: `pass-through:${toId(account._id) || propertyId}:${toId(transaction._id) || transaction.idempotencyKey || effectiveDate.getTime()}`,
        sourceSystem: 'pass_through',
        sourceModel: 'PropertyAccount.passThroughAccounts.transactions',
        sourceId: toId(transaction._id) || transaction.idempotencyKey || '',
        companyId: context.companyId,
        propertyId,
        ownerId,
        eventType: `PASS_THROUGH_${String(passThroughAccount.type || 'OTHER').toUpperCase()}_${transaction.type.toUpperCase()}`,
        direction,
        debit: direction === 'debit' ? amount : 0,
        credit: direction === 'credit' ? amount : 0,
        amount,
        currency: context.currency,
        effectiveDate,
        postedDate: transaction.createdAt ? new Date(transaction.createdAt) : effectiveDate,
        status: transaction.status,
        metadata: {
          description: transaction.description || passThroughAccount.label || passThroughAccount.type,
          category: 'PASS_THROUGH',
          referenceNumber: transaction.referenceNumber,
          paymentId: toId(transaction.paymentId),
          passThroughType: passThroughAccount.type
        }
      });
    }
  }

  return entries;
};

export class PropertyAccountReportingReadService implements OwnerReadService, PropertyReadService, LedgerReadService {
  async getOwnerForProperty(companyId: string, propertyId: string): Promise<OwnerReadModel | undefined> {
    const [account, property] = await Promise.all([
      this.getAccount(companyId, propertyId),
      this.getPropertyDocument(companyId, propertyId)
    ]);
    const ownerId = toId(account?.ownerId) || toId((property as any)?.ownerId) || toId((property as any)?.propertyOwnerId);
    const owner = ownerId && mongoose.isValidObjectId(ownerId)
      ? await PropertyOwner.findById(ownerId).select('_id firstName lastName email phone').lean()
      : await PropertyOwner.findOne({ companyId, properties: { $in: [propertyId] } }).select('_id firstName lastName email phone').lean();
    return {
      id: owner ? toId((owner as any)._id) : ownerId,
      displayName: account?.ownerName
        || (owner ? `${(owner as any).firstName || ''} ${(owner as any).lastName || ''}`.trim() : '')
        || 'Unknown Owner',
      email: (owner as any)?.email,
      phone: (owner as any)?.phone
    };
  }

  async getProperty(companyId: string, propertyId: string): Promise<PropertyReadModel | undefined> {
    const [account, property] = await Promise.all([
      this.getAccount(companyId, propertyId),
      this.getPropertyDocument(companyId, propertyId)
    ]);
    if (!account && !property) return undefined;
    return {
      id: propertyId,
      name: account?.propertyName || (property as any)?.name || 'Property',
      address: account?.propertyAddress || (property as any)?.address,
      ledgerType: account?.ledgerType || ((property as any)?.rentalType === 'sale' ? 'sale' : 'rental'),
      ownerId: toId(account?.ownerId) || toId((property as any)?.ownerId) || toId((property as any)?.propertyOwnerId),
      ownerName: account?.ownerName
    };
  }

  async getLedgerEntries(query: LedgerQuery): Promise<CanonicalLedgerEntry[]> {
    const account = query.propertyId ? await this.getAccount(query.companyId, query.propertyId) : undefined;
    if (!account) return [];
    const companyContext = await new CompanyReportingReadService().getCompanyContext(query.companyId);
    const entries = propertyAccountToLedgerEntries(account, {
      companyId: query.companyId,
      currency: companyContext.currency || 'USD',
      from: query.from,
      to: query.to
    });
    if (!query.eventTypes?.length) return entries;
    const allowed = new Set(query.eventTypes.map((type) => type.toUpperCase()));
    return entries.filter((entry) => allowed.has(entry.eventType.toUpperCase()));
  }

  private async getAccount(companyId: string, propertyId: string): Promise<IPropertyAccount | undefined> {
    if (!mongoose.isValidObjectId(propertyId)) return undefined;
    const account = await PropertyAccount.findOne({
      propertyId: new mongoose.Types.ObjectId(propertyId),
      isArchived: { $ne: true },
      isActive: { $ne: false }
    }).sort({ updatedAt: -1 });
    return account || undefined;
  }

  private async getPropertyDocument(companyId: string, propertyId: string) {
    if (!mongoose.isValidObjectId(propertyId)) return undefined;
    return Property.findOne({
      _id: propertyId,
      ...(companyId ? { companyId } : {}),
      isDeleted: { $ne: true }
    }).select('_id name address ownerId propertyOwnerId rentalType rent occupancyRate currentArrears status propertyOperationalStatus').lean();
  }
}

class EmptyReadService implements PaymentReadService, TrustReadService {
  async getPaymentTraceReferences(): Promise<Record<string, unknown>> {
    return {};
  }

  async getPropertyCommissionSnapshots(): Promise<PaymentCommissionSnapshot[]> {
    return [];
  }

  async getTrustContext(): Promise<Record<string, unknown> | undefined> {
    return undefined;
  }
}

class PaymentReportingReadService implements PaymentReadService {
  async getPaymentTraceReferences(): Promise<Record<string, unknown>> {
    return {};
  }

  async getPropertyCommissionSnapshots(
    companyId: string,
    propertyId: string,
    from: Date,
    to: Date,
    paymentIds?: string[]
  ): Promise<PaymentCommissionSnapshot[]> {
    if (!mongoose.isValidObjectId(propertyId) || !mongoose.isValidObjectId(companyId)) return [];
    const filter: Record<string, unknown> = {
      companyId: new mongoose.Types.ObjectId(companyId),
      propertyId: new mongoose.Types.ObjectId(propertyId),
      status: 'completed',
      paymentType: { $in: ['rental', 'introduction'] }
    };
    const validPaymentIds = (paymentIds || [])
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (validPaymentIds.length > 0) {
      filter.$or = [
        { _id: { $in: validPaymentIds } },
        { paymentDate: { $gte: from, $lte: to } }
      ];
    } else {
      filter.paymentDate = { $gte: from, $lte: to };
    }
    const rows = await Payment.find(filter).select(
      'paymentDate amount rentUsed rentAllocated levyAllocated levyUsed commissionDetails referenceNumber rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd vatOnCommissionRate vatCommissionTreatment'
    ).lean();

    return rows.map((row: any) => {
      const cd = row.commissionDetails || {};
      const levy = Number(cd.levy ?? row.levyAllocated ?? 0);
      const rentAmount = resolveStatementRentAmount({
        rentUsed: row.rentUsed,
        advanceMonthsPaid: row.advanceMonthsPaid,
        rentAllocated: row.rentAllocated,
        commissionBase: cd.commissionBase,
        levy,
        grossRent: cd.grossRent,
        amount: row.amount
      });
      const vatRateRaw = cd.vatRate ?? row.vatOnCommissionRate;
      const vatRate = vatRateRaw == null || vatRateRaw === '' ? undefined : Number(vatRateRaw);
      const vatTreatment = cd.vatTreatment || row.vatCommissionTreatment;
      return {
        paymentId: String(row._id),
        paymentDate: row.paymentDate,
        referenceNumber: row.referenceNumber ? String(row.referenceNumber) : undefined,
        grossRent: rentAmount ?? 0,
        levy,
        commission: Number(cd.commissionNet ?? cd.totalCommission ?? 0),
        vatOnCommission: Number(cd.vatOnCommission ?? cd.vatAmount ?? 0),
        vatRate: Number.isFinite(Number(vatRate)) ? Number(vatRate) : undefined,
        vatTreatment: vatTreatment === 'inclusive' || vatTreatment === 'exclusive' ? vatTreatment : undefined,
        ownerPayable: Number(cd.ownerAmount != null ? Number(cd.ownerAmount) - levy : 0),
        rentalPeriodMonth: Number.isFinite(Number(row.rentalPeriodMonth)) ? Number(row.rentalPeriodMonth) : undefined,
        rentalPeriodYear: Number.isFinite(Number(row.rentalPeriodYear)) ? Number(row.rentalPeriodYear) : undefined,
        advanceMonthsPaid: Number.isFinite(Number(row.advanceMonthsPaid)) ? Number(row.advanceMonthsPaid) : undefined,
        advancePeriodStart: row.advancePeriodStart?.month && row.advancePeriodStart?.year
          ? { month: Number(row.advancePeriodStart.month), year: Number(row.advancePeriodStart.year) }
          : undefined,
        advancePeriodEnd: row.advancePeriodEnd?.month && row.advancePeriodEnd?.year
          ? { month: Number(row.advancePeriodEnd.month), year: Number(row.advancePeriodEnd.year) }
          : undefined
      };
    });
  }
}

class LeaseReportingReadService implements LeaseReadService {
  async getLeaseContext(companyId: string, propertyId: string): Promise<Record<string, unknown> | undefined> {
    if (!mongoose.isValidObjectId(propertyId)) return undefined;
    const lease = await Lease.findOne({
      companyId,
      propertyId,
      status: { $in: ['active', 'expiring_soon', 'pending_settlement'] }
    }).sort({ startDate: -1 }).lean();
    if (!lease) return undefined;
    const tenant = await Tenant.findById((lease as any).tenantId).select('_id firstName lastName email phone').lean();
    return {
      tenant: tenant ? {
        id: toId((tenant as any)._id),
        displayName: `${(tenant as any).firstName || ''} ${(tenant as any).lastName || ''}`.trim() || 'Tenant',
        email: (tenant as any).email,
        phone: (tenant as any).phone,
        type: 'tenant'
      } : undefined,
      lease: {
        id: toId((lease as any)._id),
        status: (lease as any).status,
        startDate: (lease as any).startDate?.toISOString?.(),
        endDate: (lease as any).endDate?.toISOString?.()
      },
      monthlyRent: Number((lease as any).monthlyRent || (lease as any).rentAmount || 0),
      deposit: Number((lease as any).securityDeposit || (lease as any).depositAmount || 0),
      nextDueDate: (() => {
        const now = new Date();
        const dueDay = Number((lease as any).rentDueDay || 1);
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, Math.max(1, Math.min(28, dueDay)))).toISOString();
      })(),
      occupancy: 'occupied'
    };
  }
}

class MaintenanceReportingReadService implements MaintenanceReadService {
  async getMaintenanceContext(companyId: string, propertyId: string): Promise<Record<string, unknown>> {
    if (!mongoose.isValidObjectId(propertyId)) return { open: 0, closed: 0, notes: [] };
    const rows = await MaintenanceRequest.find({ companyId, propertyId }).select('status title description updatedAt').sort({ updatedAt: -1 }).limit(50).lean();
    const openStatuses = new Set(['draft', 'pending', 'assigned', 'in_progress', 'awaiting_payment', 'owner_review']);
    const open = rows.filter((row: any) => openStatuses.has(String(row.status || '').toLowerCase())).length;
    const closed = rows.filter((row: any) => ['completed', 'closed', 'cancelled'].includes(String(row.status || '').toLowerCase())).length;
    return {
      open,
      closed,
      notes: rows.slice(0, 3).map((row: any) => row.title || row.description).filter(Boolean)
    };
  }
}

class InspectionReportingReadService implements InspectionReadService {
  async getInspectionContext(companyId: string, propertyId: string): Promise<Record<string, unknown>> {
    if (!mongoose.isValidObjectId(propertyId)) return { notes: [] };
    const rows = await Inspection.find({ companyId, propertyId }).select('scheduledDate completedAt nextInspectionDate notes status').sort({ scheduledDate: -1 }).limit(10).lean();
    const completed = rows.find((row: any) => row.completedAt || row.status === 'completed');
    const upcoming = rows.find((row: any) => row.nextInspectionDate || new Date(row.scheduledDate || 0) > new Date());
    return {
      lastInspectionDate: (completed as any)?.completedAt?.toISOString?.() || (completed as any)?.scheduledDate?.toISOString?.(),
      nextInspectionDate: (upcoming as any)?.nextInspectionDate?.toISOString?.() || (upcoming as any)?.scheduledDate?.toISOString?.(),
      notes: rows.slice(0, 3).map((row: any) => row.notes).filter(Boolean)
    };
  }
}

export class CompanyReportingReadService {
  async getCompanyContext(companyId: string): Promise<{ name?: string; currency?: string }> {
    const company = mongoose.isValidObjectId(companyId)
      ? await Company.findById(companyId).select('name tradingName defaultCurrency workspacePreferences').lean()
      : undefined;
    return {
      name: (company as any)?.tradingName || (company as any)?.name,
      currency: (company as any)?.workspacePreferences?.currency || (company as any)?.defaultCurrency || 'USD'
    };
  }
}

export const createDefaultReportingReadModels = (): ReportingReadModels => {
  const propertyAccountReadService = new PropertyAccountReportingReadService();
  const emptyReadService = new EmptyReadService();
  return {
    owner: propertyAccountReadService,
    property: propertyAccountReadService,
    ledger: propertyAccountReadService,
    payment: new PaymentReportingReadService(),
    lease: new LeaseReportingReadService(),
    maintenance: new MaintenanceReportingReadService(),
    inspection: new InspectionReportingReadService(),
    trust: emptyReadService
  };
};

