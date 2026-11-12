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
  // Property.ownerId is the managing agent (User), not the landlord.
  // Matching it here would treat an agent id as a PropertyOwner id.
  const fromPropertyOwnerId = await Property.find({
    companyId: cid,
    propertyOwnerId: oid,
    isDeleted: { $ne: true },
  }).select('_id');

  const idSet = new Set<string>();
  fromOwnerArray.forEach((id) => idSet.add(String(id)));
  fromPropertyOwnerId.forEach((p) => idSet.add(String(p._id)));

  return Array.from(idSet).map((id) => new mongoose.Types.ObjectId(id));
}

function propertiesForOwner(owner: { _id: unknown; properties?: unknown[] }, properties: any[]): any[] {
  const wanted = new Set((owner.properties || []).map((id) => String(id)));
  const ownerId = String(owner._id);
  return properties.filter((property) =>
    wanted.has(String(property._id))
    || String(property.propertyOwnerId || '') === ownerId
  );
}

function restrictProperties<T extends { _id: unknown }>(properties: T[], visiblePropertyIds?: string[]): T[] {
  if (!visiblePropertyIds) return properties;
  const allowed = new Set(visiblePropertyIds.map(String));
  return properties.filter((property) => allowed.has(String(property._id)));
}

function limitToOwnerIds<T extends { _id: unknown }>(owners: T[], ownerIds?: string[]): T[] {
  if (!ownerIds) return owners;
  const allowed = new Set(ownerIds.map(String));
  return owners.filter((owner) => allowed.has(String(owner._id)));
}

export async function getOwnersDashboard(companyId: string, ownerIds?: string[], visiblePropertyIds?: string[]) {
  const cid = new mongoose.Types.ObjectId(companyId);
  const owners = limitToOwnerIds(
    await PropertyOwner.find({ companyId: cid }).select('-password -tokens').lean(),
    ownerIds,
  );
  const properties = await Property.find({ companyId: cid, isDeleted: { $ne: true } })
    .select('_id status occupiedUnits rent currentArrears propertyOwnerId')
    .lean();

  const ownerPropertyIds = new Set<string>();
  for (const owner of owners) {
    restrictProperties(propertiesForOwner(owner, properties), visiblePropertyIds)
      .forEach((property) => ownerPropertyIds.add(String(property._id)));
  }

  const ownerProps = properties.filter((p) => ownerPropertyIds.has(String(p._id)));
  const occupied = ownerProps.filter((p) => p.status === 'rented' || (p.occupiedUnits && p.occupiedUnits > 0)).length;
  const vacant = Math.max(0, ownerProps.length - occupied);

  const propertyIds = ownerProps.map((p) => p._id);
  const approvalRows = propertyIds.length
    ? await MaintenanceRequest.find({
      companyId: cid,
      propertyId: { $in: propertyIds },
      status: { $in: APPROVAL_STATUSES },
    }).select('propertyId').lean()
    : [];
  const approvalPropertyIds = new Set(approvalRows.map((row) => String(row.propertyId)));
  const ownersAwaitingApproval = owners.filter((owner) =>
    restrictProperties(propertiesForOwner(owner, ownerProps), visiblePropertyIds)
      .some((property) => approvalPropertyIds.has(String(property._id)))
  ).length;

  const outstandingBalance = ownerProps.reduce((s, p) => s + Number(p.currentArrears || 0), 0);
  const ownersWithBalance = owners.filter((owner) =>
    restrictProperties(propertiesForOwner(owner, ownerProps), visiblePropertyIds)
      .some((property) => Number(property.currentArrears || 0) > 0)
  ).length;

  return {
    kpis: {
      totalOwners: owners.length,
      totalProperties: ownerProps.length,
      occupiedProperties: occupied,
      vacantProperties: vacant,
      ownersAwaitingApproval,
      ownersWithOutstandingBalances: ownersWithBalance,
      totalOutstandingBalance: outstandingBalance,
    },
  };
}

export async function getOwnerListSummaries(companyId: string, ownerIds?: string[], visiblePropertyIds?: string[]) {
  const cid = new mongoose.Types.ObjectId(companyId);
  const owners = limitToOwnerIds(
    await PropertyOwner.find({ companyId: cid }).select('-password -tokens').lean(),
    ownerIds,
  );
  const allProperties = await Property.find({ companyId: cid, isDeleted: { $ne: true } })
    .select('_id status occupiedUnits rent currentArrears propertyOwnerId')
    .lean();
  const allMaintenance = await MaintenanceRequest.find({ companyId: cid }).select('propertyId status lastActivityAt updatedAt createdAt').lean();
  const leaseRows = await Lease.find({
    companyId: cid,
    status: 'active',
    propertyId: { $in: allProperties.map((property) => property._id) },
  }).select('propertyId rentAmount').lean();
  const leaseRent = new Map(leaseRows.map((lease) => [String(lease.propertyId), Number(lease.rentAmount || 0)]));

  return owners.map((owner) => {
      const props = restrictProperties(propertiesForOwner(owner, allProperties), visiblePropertyIds);
      const propertyIds = props.map((property) => property._id);
      const occupiedCount = props.filter((p) => p.status === 'rented' || (p.occupiedUnits && p.occupiedUnits > 0)).length;
      const vacantCount = Math.max(0, props.length - occupiedCount);
      // List rent and arrears use the same stored property and active-lease fields
      // as the ledger snapshot. Opening this list does not read or create ledgers.
      const monthlyRevenue = props.reduce((sum, property) => sum + Number(property.rent || leaseRent.get(String(property._id)) || 0), 0);
      const outstandingBalance = props.reduce((sum, property) => sum + Number(property.currentArrears || 0), 0);
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
        createdAt: owner.createdAt ? new Date(owner.createdAt).toISOString() : undefined,
      };
  });
}

export async function getOwnerPortfolio(ownerId: string, companyId: string, visiblePropertyIds?: string[]) {
  const owner = await PropertyOwner.findOne({ _id: ownerId, companyId }).select('-password -tokens');
  if (!owner) throw new AppError('Property owner not found', 404);

  const propertyIds = (await resolveOwnerPropertyIds(ownerId, companyId))
    .filter((id) => !visiblePropertyIds || visiblePropertyIds.includes(String(id)));
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

export async function getOwnerFinancials(ownerId: string, companyId: string, visiblePropertyIds?: string[]) {
  const propertyIds = (await resolveOwnerPropertyIds(ownerId, companyId))
    .filter((id) => !visiblePropertyIds || visiblePropertyIds.includes(String(id)));
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

export async function getOwnerMaintenance(ownerId: string, companyId: string, visiblePropertyIds?: string[]) {
  const propertyIds = (await resolveOwnerPropertyIds(ownerId, companyId))
    .filter((id) => !visiblePropertyIds || visiblePropertyIds.includes(String(id)));
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
  visiblePropertyIds?: string[];
}) {
  const [portfolio, financials, maintenance, history] = await Promise.all([
    getOwnerPortfolio(input.ownerId, input.companyId, input.visiblePropertyIds),
    getOwnerFinancials(input.ownerId, input.companyId, input.visiblePropertyIds),
    getOwnerMaintenance(input.ownerId, input.companyId, input.visiblePropertyIds),
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
