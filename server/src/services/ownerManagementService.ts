import mongoose from 'mongoose';
import { PropertyOwner } from '../models/PropertyOwner';
import { Property } from '../models/Property';
import { Lease } from '../models/Lease';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import {
  getPropertyFinancialSnapshots,
  mergeMonthlyIncome,
  aggregateOwnerLedgerTotals,
} from './propertyFinancialSnapshotService';
import { OwnerDocument } from '../models/OwnerDocument';
import { OwnerBankingDetails } from '../models/OwnerBankingDetails';
import { OwnerPreferences } from '../models/OwnerPreferences';
import { OwnershipHistory } from '../models/OwnershipHistory';
import { AppError } from '../middleware/errorHandler';
import { normalizeMaintenanceStatus, OPEN_STATUSES } from '../utils/maintenanceStatus';
import { generateTrustReportPdf } from './reportGenerator';
import { recordAuditEvent } from './auditService';

const APPROVAL_STATUSES = ['awaiting_approval', 'pending_approval'];

export async function resolveOwnerPropertyIds(ownerId: string, companyId: string): Promise<mongoose.Types.ObjectId[]> {
  const owner = await PropertyOwner.findOne({ _id: ownerId, companyId });
  if (!owner) throw new AppError('Property owner not found', 404);

  const cid = new mongoose.Types.ObjectId(companyId);
  const oid = owner._id as mongoose.Types.ObjectId;

  const fromOwnerArray = (owner.properties || []).map((p) => new mongoose.Types.ObjectId(String(p)));
  const fromPropertyOwnerId = await Property.find({
    companyId: cid,
    $or: [{ ownerId: oid }, { propertyOwnerId: oid }],
    isDeleted: { $ne: true },
  }).select('_id');

  const idSet = new Set<string>();
  fromOwnerArray.forEach((id) => idSet.add(String(id)));
  fromPropertyOwnerId.forEach((p) => idSet.add(String(p._id)));

  return Array.from(idSet).map((id) => new mongoose.Types.ObjectId(id));
}

export async function getOwnersDashboard(companyId: string) {
  const cid = new mongoose.Types.ObjectId(companyId);
  const owners = await PropertyOwner.find({ companyId: cid }).select('-password').lean();
  const properties = await Property.find({ companyId: cid, isDeleted: { $ne: true } }).lean();

  const ownerPropertyIds = new Set<string>();
  for (const owner of owners) {
    const ids = await resolveOwnerPropertyIds(String(owner._id), companyId);
    ids.forEach((id) => ownerPropertyIds.add(String(id)));
  }

  const ownerProps = properties.filter((p) => ownerPropertyIds.has(String(p._id)));
  const occupied = ownerProps.filter((p) => p.status === 'rented' || (p.occupiedUnits && p.occupiedUnits > 0)).length;
  const vacant = Math.max(0, ownerProps.length - occupied);

  const propertyIds = ownerProps.map((p) => p._id);
  const maintenancePending = await MaintenanceRequest.countDocuments({
    companyId: cid,
    propertyId: { $in: propertyIds },
    status: { $in: APPROVAL_STATUSES },
  });

  const outstandingBalance = ownerProps.reduce((s, p) => s + Number(p.currentArrears || 0), 0);
  const ownersWithBalance = owners.filter((o) => {
    const props = ownerProps.filter((p) => String(p.ownerId) === String(o._id) || (o.properties || []).some((pid: any) => String(pid) === String(p._id)));
    return props.some((p) => Number(p.currentArrears || 0) > 0);
  }).length;

  return {
    kpis: {
      totalOwners: owners.length,
      totalProperties: ownerProps.length,
      occupiedProperties: occupied,
      vacantProperties: vacant,
      ownersAwaitingApproval: maintenancePending,
      ownersWithOutstandingBalances: ownersWithBalance,
      totalOutstandingBalance: outstandingBalance,
    },
  };
}

export async function getOwnerListSummaries(companyId: string) {
  const cid = new mongoose.Types.ObjectId(companyId);
  const owners = await PropertyOwner.find({ companyId: cid }).select('-password').lean();
  const allProperties = await Property.find({ companyId: cid, isDeleted: { $ne: true } }).lean();
  const allMaintenance = await MaintenanceRequest.find({ companyId: cid }).lean();

  return Promise.all(
    owners.map(async (owner) => {
      const propertyIds = await resolveOwnerPropertyIds(String(owner._id), companyId);
      const props = allProperties.filter((p) => propertyIds.some((id) => String(id) === String(p._id)));
      const occupiedCount = props.filter((p) => p.status === 'rented').length;
      const vacantCount = Math.max(0, props.length - occupiedCount);
      const snapshots = await getPropertyFinancialSnapshots(propertyIds, companyId);
      const snapList = props
        .map((p) => snapshots.get(String(p._id)))
        .filter((s): s is NonNullable<typeof s> => !!s);
      const totals = snapList.length
        ? aggregateOwnerLedgerTotals(snapList)
        : {
            monthlyRevenue: props.reduce((s, p) => s + Number(p.rent || 0), 0),
            tenantArrears: props.reduce((s, p) => s + Number(p.currentArrears || 0), 0),
          };
      const monthlyRevenue = totals.monthlyRevenue;
      const outstandingBalance = totals.tenantArrears;
      const maint = allMaintenance.filter((m) => propertyIds.some((pid) => String(pid) === String(m.propertyId)));
      const pendingMaintenanceCount = maint.filter((m) =>
        OPEN_STATUSES.includes(normalizeMaintenanceStatus(m.status)) &&
        !['closed', 'rejected', 'verified'].includes(normalizeMaintenanceStatus(m.status))
      ).length;

      const lastActivity = maint.reduce((latest, m) => {
        const d = new Date(m.lastActivityAt || m.updatedAt || m.createdAt).getTime();
        return d > latest ? d : latest;
      }, new Date(owner.updatedAt || owner.createdAt).getTime());

      return {
        _id: owner._id,
        ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        phone: owner.phone,
        active: owner.active !== false,
        propertyCount: props.length,
        occupiedCount,
        vacantCount,
        monthlyRevenue,
        outstandingBalance,
        pendingMaintenanceCount,
        lastActivity: new Date(lastActivity).toISOString(),
      };
    })
  );
}

export async function getOwnerPortfolio(ownerId: string, companyId: string) {
  const owner = await PropertyOwner.findOne({ _id: ownerId, companyId }).select('-password');
  if (!owner) throw new AppError('Property owner not found', 404);

  const propertyIds = await resolveOwnerPropertyIds(ownerId, companyId);
  const properties = await Property.find({ _id: { $in: propertyIds }, companyId }).lean();
  const leases = await Lease.find({ propertyId: { $in: propertyIds }, companyId, status: 'active' })
    .populate('tenantId', 'firstName lastName email')
    .lean();
  const snapshots = await getPropertyFinancialSnapshots(propertyIds, companyId);

  const portfolio = properties.map((prop) => {
    const lease = leases.find((l) => String(l.propertyId) === String(prop._id));
    const tenant = lease?.tenantId as any;
    const snap = snapshots.get(String(prop._id));
    const isOccupied = prop.status === 'rented' || !!lease;
    let occupancyStatus = isOccupied ? 'Occupied' : 'Vacant';
    if (prop.status === 'maintenance') occupancyStatus = 'Maintenance Required';
    if (lease?.endDate) {
      const days = (new Date(lease.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (days > 0 && days <= 60) occupancyStatus = 'Lease Expiring';
    }

    return {
      _id: prop._id,
      propertyName: prop.name,
      address: prop.address,
      tenantName: tenant ? `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() : null,
      leaseStatus: lease?.status || 'none',
      monthlyRent: snap?.monthlyRent ?? Number(prop.rent || lease?.rentAmount || 0),
      outstandingBalance: snap?.tenantArrears ?? Number(prop.currentArrears || 0),
      trustBalance: snap?.ledger.runningBalance ?? 0,
      totalIncome: snap?.ledger.totalIncome ?? 0,
      totalOwnerPayouts: snap?.ledger.totalOwnerPayouts ?? 0,
      propertyAccountId: snap?.ledger.accountId,
      occupancyStatus,
      leaseId: lease?._id,
      tenantId: tenant?._id,
    };
  });

  const occupiedUnits = portfolio.filter((p) => p.occupancyStatus === 'Occupied').length;
  const vacantUnits = portfolio.filter((p) => p.occupancyStatus === 'Vacant').length;

  return {
    owner,
    header: {
      ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
      email: owner.email,
      phone: owner.phone,
      totalProperties: portfolio.length,
      occupiedUnits,
      vacantUnits,
    },
    portfolio,
  };
}

export async function getOwnerFinancials(ownerId: string, companyId: string) {
  const propertyIds = await resolveOwnerPropertyIds(ownerId, companyId);
  const properties = await Property.find({ _id: { $in: propertyIds }, companyId }).lean();
  const snapshots = await getPropertyFinancialSnapshots(propertyIds, companyId);
  const snapList = Array.from(snapshots.values());
  const totals = aggregateOwnerLedgerTotals(snapList);
  const monthlyRentCollection = mergeMonthlyIncome(snapList);

  const commissionEarned = snapList.reduce((sum, s) => {
    // Expenses on the property ledger (maintenance, fees, etc.) — same source as accountant view
    return sum + s.ledger.totalExpenses;
  }, 0);

  return {
    summary: {
      rentCollected: totals.rentCollected,
      outstandingRent: totals.tenantArrears,
      ownerPayouts: totals.ownerPayouts,
      commissionEarned,
      netRevenue: totals.rentCollected - totals.totalExpenses - totals.ownerPayouts,
      monthlyRevenue: totals.monthlyRevenue,
      trustBalance: totals.trustBalance,
    },
    charts: {
      monthlyRentCollection,
      ownerRevenueTrend: monthlyRentCollection,
      outstandingBalances: properties
        .map((p) => {
          const snap = snapshots.get(String(p._id));
          const amount = snap?.tenantArrears ?? Number(p.currentArrears || 0);
          return { propertyName: p.name, amount, trustBalance: snap?.ledger.runningBalance ?? 0 };
        })
        .filter((b) => b.amount > 0 || b.trustBalance > 0),
    },
    propertyLedgers: snapList.map((s) => ({
      propertyId: s.propertyId,
      propertyName: s.propertyName,
      ...s.ledger,
    })),
    dataSource: 'property_account_ledger',
  };
}

export async function getOwnerMaintenance(ownerId: string, companyId: string) {
  const propertyIds = await resolveOwnerPropertyIds(ownerId, companyId);
  const requests = await MaintenanceRequest.find({ companyId, propertyId: { $in: propertyIds } })
    .populate('propertyId', 'name address')
    .sort({ updatedAt: -1 })
    .lean();

  const summary = {
    open: requests.filter((r) => OPEN_STATUSES.includes(normalizeMaintenanceStatus(r.status))).length,
    awaitingApproval: requests.filter((r) => APPROVAL_STATUSES.includes(r.status)).length,
    inProgress: requests.filter((r) => ['in_progress', 'assigned', 'funded'].includes(normalizeMaintenanceStatus(r.status))).length,
    completed: requests.filter((r) => ['completed', 'verified', 'closed'].includes(normalizeMaintenanceStatus(r.status))).length,
  };

  return {
    summary,
    requests: requests.map((r) => ({
      _id: r._id,
      issue: r.title,
      propertyName: (r.propertyId as any)?.name,
      status: normalizeMaintenanceStatus(r.status),
      statusRaw: r.status,
      cost: Number(r.paidAmount || r.estimatedCost || 0),
      createdAt: r.createdAt,
    })),
  };
}

export async function getOwnerDocuments(ownerId: string, companyId: string) {
  return OwnerDocument.find({ ownerId, companyId }).sort({ uploadedAt: -1 });
}

export async function uploadOwnerDocument(input: {
  ownerId: string;
  companyId: string;
  userId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
}) {
  const latest = await OwnerDocument.findOne({
    ownerId: input.ownerId,
    companyId: input.companyId,
    fileName: input.fileName,
  }).sort({ version: -1 });

  const doc = await OwnerDocument.create({
    ownerId: input.ownerId,
    companyId: input.companyId,
    documentType: input.documentType,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    version: (latest?.version || 0) + 1,
    uploadedBy: input.userId,
    uploadedAt: new Date(),
  });

  await recordAuditEvent({
    userId: input.userId,
    companyId: input.companyId,
    action: 'owner.document.upload',
    entityType: 'OwnerDocument',
    entityId: String(doc._id),
  });

  return doc;
}

export async function upsertOwnerBanking(ownerId: string, companyId: string, data: Record<string, string>) {
  return OwnerBankingDetails.findOneAndUpdate(
    { ownerId, companyId },
    { $set: { ...data, ownerId, companyId } },
    { upsert: true, new: true }
  );
}

export async function upsertOwnerPreferences(ownerId: string, companyId: string, data: Record<string, boolean>) {
  return OwnerPreferences.findOneAndUpdate(
    { ownerId, companyId },
    { $set: { ...data, ownerId, companyId } },
    { upsert: true, new: true }
  );
}

export async function getOwnerProfileExtras(ownerId: string, companyId: string) {
  const [banking, preferences] = await Promise.all([
    OwnerBankingDetails.findOne({ ownerId, companyId }).lean(),
    OwnerPreferences.findOne({ ownerId, companyId }).lean(),
  ]);
  return { banking, preferences };
}

export async function addOwnershipHistory(input: {
  propertyId: string;
  ownerId: string;
  companyId: string;
  userId: string;
  startDate: string;
  endDate?: string;
  ownershipPercentage?: number;
  notes?: string;
}) {
  const history = await OwnershipHistory.create({
    propertyId: input.propertyId,
    ownerId: input.ownerId,
    companyId: input.companyId,
    startDate: new Date(input.startDate),
    endDate: input.endDate ? new Date(input.endDate) : undefined,
    ownershipPercentage: input.ownershipPercentage ?? 100,
    notes: input.notes,
    createdBy: input.userId,
  });

  await recordAuditEvent({
    userId: input.userId,
    companyId: input.companyId,
    action: 'ownership.history.create',
    entityType: 'OwnershipHistory',
    entityId: String(history._id),
  });

  return history;
}

export async function getOwnershipHistory(ownerId: string, companyId: string) {
  return OwnershipHistory.find({ ownerId, companyId })
    .populate('propertyId', 'name address')
    .sort({ startDate: -1 });
}

export async function getPropertyOwnershipHistory(propertyId: string, companyId: string) {
  return OwnershipHistory.find({ propertyId, companyId })
    .populate('ownerId', 'firstName lastName email')
    .sort({ startDate: -1 });
}

export async function generateOwnerDocument(input: {
  type: 'owner-statement' | 'portfolio-report' | 'outstanding-rent' | 'maintenance-summary' | 'ownership-history';
  ownerId: string;
  companyId: string;
  companyName: string;
}) {
  const [portfolio, financials, maintenance, history] = await Promise.all([
    getOwnerPortfolio(input.ownerId, input.companyId),
    getOwnerFinancials(input.ownerId, input.companyId),
    getOwnerMaintenance(input.ownerId, input.companyId),
    getOwnershipHistory(input.ownerId, input.companyId),
  ]);

  const rows: Record<string, unknown>[] = [];
  if (input.type === 'portfolio-report') {
    portfolio.portfolio.forEach((p) => rows.push({ Property: p.propertyName, Status: p.occupancyStatus, Rent: p.monthlyRent }));
  } else if (input.type === 'outstanding-rent') {
    financials.charts.outstandingBalances.forEach((b) => rows.push({ Property: b.propertyName, Outstanding: b.amount }));
  } else if (input.type === 'maintenance-summary') {
    maintenance.requests.forEach((r) => rows.push({ Issue: r.issue, Property: r.propertyName, Status: r.status, Cost: r.cost }));
  } else if (input.type === 'ownership-history') {
    history.forEach((h: any) =>
      rows.push({
        Property: h.propertyId?.name,
        From: new Date(h.startDate).toLocaleDateString(),
        To: h.endDate ? new Date(h.endDate).toLocaleDateString() : 'Present',
        Share: `${h.ownershipPercentage}%`,
      })
    );
  } else {
    rows.push(
      { Metric: 'Monthly Revenue', Value: financials.summary.monthlyRevenue },
      { Metric: 'Outstanding Rent', Value: financials.summary.outstandingRent },
      { Metric: 'Properties', Value: portfolio.header.totalProperties }
    );
  }

  return generateTrustReportPdf({
    reportType: input.type as any,
    companyName: input.companyName,
    propertyLabel: portfolio.header.ownerName,
    auditReference: input.ownerId,
    rows,
    totals: financials.summary,
  });
}
