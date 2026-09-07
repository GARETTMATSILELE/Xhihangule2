import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import { Company } from '../models/Company';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import {
  asId,
  classifyPropertyCategory,
  deriveOccupancyStatus,
  formatLeasePeriod,
  formatLeaseStatus,
  formatPaidUpTo,
  formatPropertyType,
  matchesPropertyTypeFilter,
  personName,
  pickCurrentLease,
  recencyTimestamp,
} from '../services/propertyReportDataset';

const activePropertyVisibilityFilter = {
  isDeleted: { $ne: true },
  propertyOperationalStatus: { $ne: 'Archived' },
};

const COMPANY_WIDE_REPORT_ROLES = ['admin', 'accountant', 'principal', 'prea'];

function userRoles(req: Request): string[] {
  const roles = ((req.user as any)?.roles as string[] | undefined) || [req.user?.role];
  return (roles || []).filter(Boolean).map(String);
}

function reportScopeForUser(req: Request, explicit?: 'agent' | 'company'): 'agent' | 'company' {
  if (explicit === 'company') return 'company';
  if (userRoles(req).some((role) => COMPANY_WIDE_REPORT_ROLES.includes(role))) return 'company';
  return explicit || 'agent';
}

function parseIdList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
}

async function sendPropertyDetailsReport(req: Request, res: Response, scope: 'agent' | 'company') {
  try {
    if (!req.user?.userId) {
      throw new AppError('Authentication required', 401);
    }
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const companyId = new mongoose.Types.ObjectId(req.user.companyId);
    const occupancyFilter = String(req.query.occupancy || 'all').toLowerCase();
    const typeFilter = String(req.query.propertyType || 'all').toLowerCase() as 'all' | 'residential' | 'commercial';
    const requestedIds = parseIdList(req.query.propertyIds);

    const query: Record<string, unknown> = {
      companyId,
      ...activePropertyVisibilityFilter,
    };
    if (scope === 'agent') {
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }
    if (requestedIds.length) {
      query._id = { $in: requestedIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const [properties, company] = await Promise.all([
      Property.find(query)
        .populate('propertyOwnerId', 'firstName lastName email phone')
        .select('name address type propertyCategory propertySubtype status propertyOperationalStatus rent commission levyOrMunicipalAmount createdAt updatedAt propertyOwnerId ownerId agentId')
        .lean(),
      Company.findById(companyId).select('name tradingName logo workspacePreferences defaultCurrency').lean(),
    ]);

    const propertyIds = properties.map((property: any) => property._id);
    const ownerIds = properties
      .map((property: any) => asId(property.propertyOwnerId))
      .filter((id: string) => mongoose.Types.ObjectId.isValid(id));
    const agentIds = [...new Set(
      properties
        .map((property: any) => asId(property.agentId) || asId(property.ownerId))
        .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
    )];
    const [leases, tenants, payments, linkedOwners, agents] = propertyIds.length
      ? await Promise.all([
          Lease.find({ companyId, propertyId: { $in: propertyIds } }).lean(),
          Tenant.find({
            companyId,
            $or: [
              { propertyId: { $in: propertyIds } },
              { propertyIds: { $in: propertyIds } },
            ],
          }).lean(),
          Payment.find({
            companyId,
            propertyId: { $in: propertyIds },
            paymentType: 'rental',
            status: { $in: ['completed', 'paid', 'success'] },
          })
            .select('propertyId leaseId tenantId rentalPeriodMonth rentalPeriodYear advancePeriodStart advancePeriodEnd advanceMonthsPaid paymentDate status paymentType')
            .lean(),
          PropertyOwner.find({
            companyId,
            $or: [
              { properties: { $in: propertyIds } },
              ...(ownerIds.length ? [{ _id: { $in: ownerIds.map((id: string) => new mongoose.Types.ObjectId(id)) } }] : []),
            ],
          })
            .select('firstName lastName email phone properties')
            .lean(),
          agentIds.length
            ? User.find({ _id: { $in: agentIds.map((id) => new mongoose.Types.ObjectId(id)) } })
                .select('firstName lastName email')
                .lean()
            : Promise.resolve([]),
        ])
      : [[], [], [], [], []];

    const leasesByProperty = new Map<string, any[]>();
    for (const lease of leases as any[]) {
      const propertyId = asId(lease.propertyId);
      if (!propertyId) continue;
      const rows = leasesByProperty.get(propertyId) || [];
      rows.push(lease);
      leasesByProperty.set(propertyId, rows);
    }

    const tenantsByProperty = new Map<string, any[]>();
    for (const tenant of tenants as any[]) {
      const ids = [asId(tenant.propertyId), ...(Array.isArray(tenant.propertyIds) ? tenant.propertyIds.map(asId) : [])].filter(Boolean);
      for (const propertyId of ids) {
        const rows = tenantsByProperty.get(propertyId) || [];
        rows.push(tenant);
        tenantsByProperty.set(propertyId, rows);
      }
    }

    const paymentsByProperty = new Map<string, any[]>();
    for (const payment of payments as any[]) {
      const propertyId = asId(payment.propertyId);
      if (!propertyId) continue;
      const rows = paymentsByProperty.get(propertyId) || [];
      rows.push(payment);
      paymentsByProperty.set(propertyId, rows);
    }

    const ownersById = new Map<string, any>();
    const ownersByProperty = new Map<string, any>();
    for (const owner of linkedOwners as any[]) {
      ownersById.set(asId(owner._id), owner);
      for (const propertyId of (owner.properties || []).map(asId).filter(Boolean)) {
        if (!ownersByProperty.has(propertyId)) ownersByProperty.set(propertyId, owner);
      }
    }

    const agentsById = new Map<string, any>();
    for (const agent of agents as any[]) {
      agentsById.set(asId(agent._id), agent);
    }

    const currency =
      (company as any)?.workspacePreferences?.currency ||
      (company as any)?.defaultCurrency ||
      'USD';

    const rows = properties.map((property: any) => {
      const propertyId = asId(property._id);
      const propertyLeases = leasesByProperty.get(propertyId) || [];
      const propertyTenants = tenantsByProperty.get(propertyId) || [];
      const occupancyStatus = deriveOccupancyStatus(property, propertyLeases, propertyTenants);
      const currentLease = occupancyStatus === 'Rented' ? pickCurrentLease(propertyLeases) : null;
      const tenantFromLease = currentLease
        ? propertyTenants.find((tenant) => asId(tenant._id) === asId(currentLease.tenantId))
        : null;
      const tenant = tenantFromLease || propertyTenants.find((item) => String(item?.status || 'Active').toLowerCase() !== 'inactive') || null;
      const populatedOwner = property.propertyOwnerId && typeof property.propertyOwnerId === 'object' && personName(property.propertyOwnerId)
        ? property.propertyOwnerId
        : null;
      const owner =
        populatedOwner ||
        ownersById.get(asId(property.propertyOwnerId)) ||
        ownersByProperty.get(propertyId) ||
        null;
      const rentAmount = Number(currentLease?.rentAmount ?? currentLease?.monthlyRent ?? property.rent);
      const commissionPercent = property.commission == null ? null : Number(property.commission);
      const commissionAmount =
        Number.isFinite(rentAmount) && rentAmount >= 0 && commissionPercent != null && Number.isFinite(commissionPercent)
          ? Math.round(((rentAmount * commissionPercent) / 100) * 100) / 100
          : null;
      const levyAmount = property.levyOrMunicipalAmount == null ? null : Number(property.levyOrMunicipalAmount);
      const ownerName = personName(owner);
      const associatedAgentId = asId(property.agentId) || asId(property.ownerId);
      const agent = associatedAgentId ? agentsById.get(associatedAgentId) : null;
      const agentName = personName(agent);
      const tenantName = personName(tenant);
      const propertyCategory = classifyPropertyCategory(property);
      const leasePayments = currentLease
        ? (paymentsByProperty.get(propertyId) || []).filter((payment) => {
            const paymentLeaseId = asId(payment.leaseId);
            return !paymentLeaseId || paymentLeaseId === asId(currentLease._id);
          })
        : [];

      return {
        id: propertyId,
        address: property.address || '',
        name: property.name || '',
        propertyType: formatPropertyType(property),
        propertyCategory: propertyCategory || '',
        occupancyStatus,
        ownerName,
        agentId: associatedAgentId,
        agentName,
        tenantName,
        tenantPhone: tenant?.phone || '',
        tenantEmail: tenant?.email || '',
        rentAmount: Number.isFinite(rentAmount) ? rentAmount : null,
        commissionPercent,
        commissionAmount,
        levyAmount: levyAmount != null && Number.isFinite(levyAmount) ? levyAmount : null,
        currency,
        leaseStartDate: currentLease?.startDate || null,
        leaseEndDate: currentLease?.endDate || null,
        leasePeriod: formatLeasePeriod(currentLease?.startDate, currentLease?.endDate),
        paidUpTo: formatPaidUpTo(leasePayments),
        leaseStatus: formatLeaseStatus(currentLease),
        createdAt: property.createdAt || null,
        updatedAt: property.updatedAt || null,
        recency: recencyTimestamp(property),
      };
    }).filter((row) => {
      if (occupancyFilter === 'rented' && row.occupancyStatus !== 'Rented') return false;
      if (occupancyFilter === 'vacant' && row.occupancyStatus !== 'Vacant') return false;
      if (!matchesPropertyTypeFilter(row.propertyCategory, typeFilter)) return false;
      return true;
    });

    res.json({
      reportType: 'property-details',
      company: {
        name: (company as any)?.tradingName || (company as any)?.name || '',
        logo: (company as any)?.logo || '',
      },
      generatedAt: new Date().toISOString(),
      properties: rows,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error fetching property details report:', error);
    res.status(500).json({ message: 'Error fetching property details report' });
  }
}

export const getAgentPropertyDetailsReport = (req: Request, res: Response) =>
  sendPropertyDetailsReport(req, res, reportScopeForUser(req, 'agent'));

export const getCompanyPropertyDetailsReport = (req: Request, res: Response) =>
  sendPropertyDetailsReport(req, res, reportScopeForUser(req, 'company'));
