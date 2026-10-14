import mongoose from 'mongoose';
import { User } from '../../models/User';
import { Tenant } from '../../models/Tenant';
import { Property } from '../../models/Property';
import { Lease } from '../../models/Lease';
import { Payment } from '../../models/Payment';
import File from '../../models/File';
import { MaintenanceRequest } from '../../models/MaintenanceRequest';
import { Company } from '../../models/Company';
import { CONTRACTOR_TRADES, MaintenanceContractor } from '../../models/MaintenanceContractor';
import { AuthService } from '../../services/authService';
import { AppError } from '../../middleware/errorHandler';
import { TenantProfile, ViewingRequest, RentalApplication } from '../models/tenantFacing';
import { CommunicationPreference } from '../models/commsAndPayments';
import { ecosystemAudit } from '../audit';
import { notifyEvent, notifyCompanyStaff } from './notificationService';
import { assertApplicationTransition, assertViewingTransition } from '../workflowMachine';
import { ApplicationStatus, ViewingStatus, LEGACY_STATUS_FROM_ECOSYSTEM } from '../constants';
import { isFlagEnabledForCompany } from '../flags';
import { computeProfileCompletion, toPublicListing } from '../listingUtils';
import { isTenantVisiblePropertyFile, toTenantFileSummary } from '../documentAccess';
import { EcosystemDocument } from '../models/engagement';
import { Inspection } from '../../models/Inspection';
import { notifyLandlord } from '../../agency/workflowNotify';

export { computeProfileCompletion, toPublicListing };

const authService = AuthService.getInstance();

export async function registerPortalUser(params: {
  role: 'tenant' | 'contractor';
  accountType?: 'individual' | 'company';
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  homeAddress?: string;
  companyName?: string;
  companyAddress?: string;
  trade?: string;
  req?: any;
}) {
  const email = String(params.email || '').trim().toLowerCase();
  const firstName = String(params.firstName || '').trim();
  const lastName = String(params.lastName || '').trim();
  const phone = String(params.phone || '').trim();
  const accountType = params.accountType === 'company' ? 'company' : 'individual';
  const companyName = String(params.companyName || '').trim();
  const companyAddress = String(params.companyAddress || '').trim();
  const homeAddress = String(params.homeAddress || '').trim();
  const trade = String(params.trade || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();
  if (!email || !params.password || !firstName || !lastName) {
    throw new AppError('First name, last name, email and password are required', 400, 'VALIDATION_ERROR');
  }
  if (params.password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400, 'VALIDATION_ERROR');
  }
  if (!phone) {
    throw new AppError('Phone is required', 400, 'VALIDATION_ERROR');
  }
  if (accountType === 'company') {
    if (!companyName) throw new AppError('Company name is required', 400, 'VALIDATION_ERROR');
    if (!companyAddress) throw new AppError('Company address is required', 400, 'VALIDATION_ERROR');
  } else if (!homeAddress) {
    throw new AppError('Home address is required', 400, 'VALIDATION_ERROR');
  }
  if (params.role === 'contractor' && !CONTRACTOR_TRADES.includes(trade as any)) {
    throw new AppError('Select a valid trade', 400, 'VALIDATION_ERROR');
  }
  const displayName = accountType === 'company' ? companyName : fullName;
  const address = accountType === 'company' ? companyAddress : homeAddress;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already registered', 400, 'EMAIL_EXISTS');

  const user = await User.create({
    email,
    password: params.password,
    firstName,
    lastName,
    role: params.role,
    roles: [params.role],
    isActive: true,
  });

  let company: any;
  try {
    company = await Company.create({
      name: displayName,
      email,
      address,
      phone,
      ownerId: user._id,
      companyType: 'INDIVIDUAL_LANDLORD',
      workspaceType: 'individual',
      plan: 'INDIVIDUAL',
      tenantStatus: 'active',
      onboardingStatus: 'ACTIVE',
      onboardingCompleted: true,
      isActive: true,
      subscriptionStatus: 'active',
      featureFlags: {
        tenantPortalEnabled: params.role === 'tenant',
        contractorPortalEnabled: params.role === 'contractor',
        maintenanceQuotesEnabled: params.role === 'contractor',
        propertyMarketplaceEnabled: false,
      },
    });
    user.companyId = company._id;
    await user.save();

    await CommunicationPreference.create({
      userId: user._id,
      emailAvailable: true,
      inAppAvailable: true,
      phone,
    });

    if (params.role === 'tenant') {
      const profile = await TenantProfile.create({
        userId: user._id,
        companyId: company._id,
        fullName,
        email,
        phone,
        address,
        profileCompletionPercent: 0,
      });
      profile.profileCompletionPercent = computeProfileCompletion(profile.toObject());
      await profile.save();
    } else {
      await MaintenanceContractor.create({
        companyId: company._id,
        companyName: displayName,
        contactPerson: fullName,
        phone,
        email,
        trade,
        address: address === 'N/A' ? undefined : address,
        userId: user._id,
        active: true,
        verificationStatus: 'UNVERIFIED',
      });
    }
  } catch (error) {
    await MaintenanceContractor.deleteMany({ userId: user._id });
    await TenantProfile.deleteMany({ userId: user._id });
    await CommunicationPreference.deleteMany({ userId: user._id });
    if (company?._id) await Company.deleteOne({ _id: company._id });
    await User.deleteOne({ _id: user._id });
    throw error;
  }

  await ecosystemAudit({
    req: params.req,
    actor: String(user._id),
    action: params.role === 'tenant' ? 'TENANT_REGISTERED' : 'CONTRACTOR_REGISTERED',
    entity: 'User',
    entityId: String(user._id),
    newState: { role: params.role, email },
  });

  const tokens = await authService.login(email, params.password);
  return { user, tokens };
}

export async function updateTenantProfile(userId: string, patch: Record<string, any>) {
  const allowed = [
    'fullName', 'phone', 'idNumber', 'passportNumber', 'address', 'employmentStatus',
    'employer', 'emergencyContactName', 'emergencyContactPhone', 'householdSize',
    'pets', 'rentalPreferences', 'preferredLocations', 'previousRentalInfo', 'documents',
  ];
  const update: Record<string, any> = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }
  const current = await TenantProfile.findOne({ userId });
  if (!current) throw new AppError('Profile not found', 404, 'NOT_FOUND');
  Object.assign(current, update);
  current.profileCompletionPercent = computeProfileCompletion(current.toObject());
  await current.save();
  return current;
}

const LISTING_PUBLIC_PROJECTION = {
  name: 1,
  address: 1,
  type: 1,
  propertyCategory: 1,
  propertySubtype: 1,
  bedrooms: 1,
  bathrooms: 1,
  area: 1,
  description: 1,
  images: 1,
  videos: 1,
  amenities: 1,
  rent: 1,
  deposit: 1,
  availableFrom: 1,
  paymentTerms: 1,
  leaseRequirements: 1,
  status: 1,
  propertyOperationalStatus: 1,
  companyId: 1,
};

export async function searchListings(query: Record<string, any>) {
  // Every tenant can browse properties any company has published.
  // Agencies still opt in with featureFlags.propertyMarketplaceEnabled before they can publish.
  const filter: any = {
    publicListingEnabled: true,
    isDeleted: { $ne: true },
    status: { $in: ['available', 'rented'] },
    propertyUse: { $in: ['Rental', 'Both', null, undefined] },
  };
  if (query.companyId && mongoose.isValidObjectId(query.companyId)) {
    filter.companyId = query.companyId;
  }
  if (query.propertyType) filter.type = query.propertyType;
  if (query.bedrooms) filter.bedrooms = { $gte: Number(query.bedrooms) };
  if (query.bathrooms) filter.bathrooms = { $gte: Number(query.bathrooms) };
  if (query.minRent || query.maxRent) {
    filter.rent = {};
    if (query.minRent) filter.rent.$gte = Number(query.minRent);
    if (query.maxRent) filter.rent.$lte = Number(query.maxRent);
  }
  if (query.location) {
    filter.$or = [
      { address: { $regex: String(query.location), $options: 'i' } },
      { name: { $regex: String(query.location), $options: 'i' } },
    ];
  }
  if (query.amenities) {
    const list = String(query.amenities).split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length) filter.amenities = { $all: list };
  }
  if (query.availability === 'available') {
    filter.status = 'available';
    filter.propertyOperationalStatus = { $in: ['Vacant', 'Reserved', null, undefined] };
  }

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
  const [items, total] = await Promise.all([
    Property.find(filter).select(LISTING_PUBLIC_PROJECTION).sort({ listingPublishedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Property.countDocuments(filter),
  ]);
  return { items: items.map(toPublicListing), total, page, limit };
}

export async function getPublicListing(id: string) {
  const property = await Property.findOne({
    _id: id,
    publicListingEnabled: true,
    isDeleted: { $ne: true },
  }).select(LISTING_PUBLIC_PROJECTION).lean();
  if (!property) throw new AppError('Listing not found', 404, 'NOT_FOUND');
  return toPublicListing(property);
}

export async function createViewingRequest(params: {
  tenantUserId: string;
  propertyId: string;
  requestedDate: Date;
  preferredTime?: string;
  attendees?: number;
  message?: string;
  req?: any;
}) {
  const property = await Property.findById(params.propertyId).select('companyId publicListingEnabled name').lean();
  if (!property || !property.publicListingEnabled) throw new AppError('Property is not available for viewing', 404, 'NOT_FOUND');

  const viewing = await ViewingRequest.create({
    tenantUserId: params.tenantUserId,
    propertyId: params.propertyId,
    companyId: property.companyId,
    requestedDate: params.requestedDate,
    preferredTime: params.preferredTime,
    attendees: params.attendees || 1,
    message: params.message,
    status: 'REQUESTED',
  });

  await ecosystemAudit({
    req: params.req,
    actor: params.tenantUserId,
    action: 'VIEWING_REQUESTED',
    entity: 'ViewingRequest',
    entityId: String(viewing._id),
    newState: { status: 'REQUESTED' },
  });
  await notifyEvent({
    recipientId: params.tenantUserId,
    companyId: String(property.companyId),
    eventType: 'VIEWING_REQUESTED',
    variables: { tenantName: 'You', propertyName: property.name || 'the property' },
    idempotencyKey: `viewing:${viewing._id}:requested`,
  });
  await notifyCompanyStaff(String(property.companyId), 'VIEWING_REQUESTED', {
    tenantName: 'A tenant',
    propertyName: property.name || 'the property',
  }, `viewing:${viewing._id}:requested:staff`);
  return viewing;
}

export async function updateViewingStatus(params: {
  viewingId: string;
  companyId: string;
  actorId: string;
  status: ViewingStatus;
  notes?: string;
  proposedDate?: Date;
  req?: any;
}) {
  const viewing = await ViewingRequest.findOne({ _id: params.viewingId, companyId: params.companyId });
  if (!viewing) throw new AppError('Viewing not found', 404, 'NOT_FOUND');
  assertViewingTransition(viewing.status as ViewingStatus, params.status);
  const previous = viewing.status;
  viewing.status = params.status;
  if (params.notes) viewing.agentNotes = params.notes;
  if (params.proposedDate) viewing.proposedDate = params.proposedDate;
  await viewing.save();
  await ecosystemAudit({
    req: params.req,
    actor: params.actorId,
    action: `VIEWING_${params.status}`,
    entity: 'ViewingRequest',
    entityId: String(viewing._id),
    previousState: { status: previous },
    newState: { status: viewing.status },
  });
  if (params.status === 'CONFIRMED') {
    const property = await Property.findById(viewing.propertyId).select('name').lean();
    await notifyEvent({
      recipientId: String(viewing.tenantUserId),
      companyId: params.companyId,
      eventType: 'VIEWING_CONFIRMED',
      variables: { propertyName: property?.name || 'the property' },
      idempotencyKey: `viewing:${viewing._id}:confirmed`,
    });
  } else if (params.status === 'RESCHEDULED') {
    const property = await Property.findById(viewing.propertyId).select('name').lean();
    await notifyEvent({
      recipientId: String(viewing.tenantUserId),
      companyId: params.companyId,
      eventType: 'VIEWING_RESCHEDULED',
      variables: { propertyName: property?.name || 'the property' },
      idempotencyKey: `viewing:${viewing._id}:rescheduled:${viewing.proposedDate?.toISOString() || 'na'}`,
    });
  } else if (params.status === 'DECLINED') {
    const property = await Property.findById(viewing.propertyId).select('name').lean();
    await notifyEvent({
      recipientId: String(viewing.tenantUserId),
      companyId: params.companyId,
      eventType: 'VIEWING_DECLINED',
      variables: { propertyName: property?.name || 'the property' },
      idempotencyKey: `viewing:${viewing._id}:declined`,
    });
  }
  return viewing;
}

export async function upsertApplication(params: {
  tenantUserId: string;
  propertyId: string;
  notes?: string;
  documents?: any[];
  submit?: boolean;
  req?: any;
}) {
  const property = await Property.findById(params.propertyId).select('companyId publicListingEnabled name propertyOwnerId').lean();
  if (!property || !property.publicListingEnabled) throw new AppError('Property is not available', 404, 'NOT_FOUND');
  const profile = await TenantProfile.findOne({ userId: params.tenantUserId }).lean();
  let app = await RentalApplication.findOne({
    tenantUserId: params.tenantUserId,
    propertyId: params.propertyId,
    status: { $in: ['DRAFT', 'MORE_INFORMATION_REQUIRED'] },
  });
  if (!app) {
    app = await RentalApplication.create({
      tenantUserId: params.tenantUserId,
      propertyId: params.propertyId,
      companyId: property.companyId,
      ownerId: property.propertyOwnerId,
      status: 'DRAFT',
      notes: params.notes,
      documents: params.documents || [],
      snapshot: {},
      statusHistory: [{ status: 'DRAFT', at: new Date(), by: params.tenantUserId }],
    });
  }
  if (params.notes !== undefined) app.notes = params.notes;
  if (params.documents) app.documents = params.documents;
  if (params.submit) {
    assertApplicationTransition(app.status as ApplicationStatus, 'SUBMITTED');
    app.snapshot = {
      profile: profile || {},
      capturedAt: new Date().toISOString(),
      propertyName: property.name,
    };
    app.status = 'SUBMITTED';
    app.submittedAt = new Date();
    app.statusHistory.push({ status: 'SUBMITTED', at: new Date(), by: params.tenantUserId as any });
    await ecosystemAudit({
      req: params.req,
      actor: params.tenantUserId,
      action: 'APPLICATION_SUBMITTED',
      entity: 'RentalApplication',
      entityId: String(app._id),
      newState: { status: 'SUBMITTED' },
    });
    await notifyEvent({
      recipientId: params.tenantUserId,
      companyId: String(property.companyId),
      eventType: 'APPLICATION_SUBMITTED',
      variables: { tenantName: profile?.fullName || 'Tenant', propertyName: property.name || 'the property' },
      idempotencyKey: `application:${app._id}:submitted`,
    });
    await notifyCompanyStaff(String(property.companyId), 'APPLICATION_SUBMITTED', {
      tenantName: profile?.fullName || 'Tenant',
      propertyName: property.name || 'the property',
    }, `application:${app._id}:submitted:staff`);
  }
  await app.save();
  return app;
}

export async function updateApplicationStatus(params: {
  applicationId: string;
  companyId: string;
  actorId: string;
  status: ApplicationStatus;
  note?: string;
  req?: any;
}) {
  const app = await RentalApplication.findOne({ _id: params.applicationId, companyId: params.companyId });
  if (!app) throw new AppError('Application not found', 404, 'NOT_FOUND');
  assertApplicationTransition(app.status as ApplicationStatus, params.status);
  const previous = app.status;
  app.status = params.status;
  if (params.note) app.agentNotes = params.note;
  app.statusHistory.push({ status: params.status, at: new Date(), by: params.actorId as any, note: params.note });
  await app.save();
  await ecosystemAudit({
    req: params.req,
    actor: params.actorId,
    action: `APPLICATION_${params.status}`,
    entity: 'RentalApplication',
    entityId: String(app._id),
    previousState: { status: previous },
    newState: { status: params.status },
  });
  if (params.status === 'SENT_TO_OWNER') {
    await notifyLandlord(params.companyId, String(app.propertyId), `application-shortlist:${app._id}`, 'Shortlist ready for review', 'A rental application is waiting for your decision.');
  }
  if (params.status === 'APPROVED' || params.status === 'DECLINED') {
    const property = await Property.findById(app.propertyId).select('name').lean();
    await notifyEvent({
      recipientId: String(app.tenantUserId),
      companyId: params.companyId,
      eventType: params.status === 'APPROVED' ? 'APPLICATION_APPROVED' : 'APPLICATION_DECLINED',
      variables: { propertyName: property?.name || 'the property' },
      idempotencyKey: `application:${app._id}:${params.status}`,
    });
  }
  return app;
}

export async function getTenantLeases(userId: string) {
  const tenants = await Tenant.find({ userId });
  const tenantIds = tenants.map((t) => t._id);
  if (!tenantIds.length) return [];
  return Lease.find({ tenantId: { $in: tenantIds } })
    .populate('propertyId', 'name address images')
    .sort({ startDate: -1 })
    .lean();
}

export async function getTenantPayments(userId: string) {
  const tenants = await Tenant.find({ userId });
  const tenantIds = tenants.map((t) => t._id);
  if (!tenantIds.length) return [];
  return Payment.find({ tenantId: { $in: tenantIds } })
    .select('amount paymentDate paymentMethod referenceNumber rentalPeriodMonth rentalPeriodYear propertyId status notes')
    .populate('propertyId', 'name address')
    .sort({ paymentDate: -1 })
    .limit(200)
    .lean();
}

export async function getTenantDocuments(userId: string, leaseId?: string) {
  const leases = await getTenantLeases(userId);
  const scoped = leaseId ? leases.filter((l: any) => String(l._id) === leaseId) : leases;
  const propertyIds = scoped.map((l: any) => l.propertyId?._id || l.propertyId).filter(Boolean);
  const tenantIds = (await Tenant.find({ userId }).select('_id').lean()).map((t) => t._id);

  const rawFiles = propertyIds.length
    ? await File.find({ propertyId: { $in: propertyIds } }).select('fileName fileType propertyId uploadedAt').lean()
    : [];
  const files = rawFiles.filter(isTenantVisiblePropertyFile).map((file) => toTenantFileSummary(file));

  const ownDocs = await EcosystemDocument.find({ ownerUserId: userId }).select('documentType fileName entityType entityId createdAt').lean();
  const inspections = tenantIds.length
    ? await Inspection.find({ tenantId: { $in: tenantIds } }).select('_id type scheduledDate status propertyId').lean()
    : [];
  const maintenance = await MaintenanceRequest.find({ requestedBy: userId }).select('_id title attachments propertyId createdAt').lean();

  return {
    leases: scoped.map((l: any) => ({
      _id: l._id,
      documents: l.documentVersions || [],
      property: l.propertyId,
    })),
    files,
    ownUploads: ownDocs,
    inspections: inspections.map((i: any) => ({
      _id: i._id,
      type: i.type,
      scheduledDate: i.scheduledDate,
      status: i.status,
      propertyId: i.propertyId,
    })),
    maintenanceAttachments: maintenance.flatMap((m: any) =>
      (m.attachments || []).map((att: any) => ({
        requestId: m._id,
        title: m.title,
        name: att.name || att.fileName,
        url: att.url,
      }))
    ),
  };
}

export async function getTenantFile(userId: string, fileId: string) {
  const file = await File.findById(fileId).select('fileName fileType fileUrl propertyId uploadedAt').lean();
  if (!file) throw new AppError('Document not found', 404, 'NOT_FOUND');
  const leases = await getTenantLeases(userId);
  const allowedProperties = new Set(leases.map((l: any) => String(l.propertyId?._id || l.propertyId)));
  if (!allowedProperties.has(String(file.propertyId)) || !isTenantVisiblePropertyFile(file)) {
    throw new AppError('You cannot access this document', 403, 'FORBIDDEN');
  }
  return toTenantFileSummary(file, true);
}

export async function createTenantMaintenance(params: {
  tenantUserId: string;
  propertyId: string;
  title: string;
  description: string;
  category: string;
  urgency: string;
  preferredAccessTime?: string;
  attachments?: any[];
  req?: any;
}) {
  const tenants = await Tenant.find({ userId: params.tenantUserId });
  const allowedPropertyIds = new Set(tenants.flatMap((t) => [String(t.propertyId || ''), ...(t.propertyIds || []).map(String)]));
  const leases = await Lease.find({ tenantId: { $in: tenants.map((t) => t._id) }, status: { $in: ['active', 'expiring_soon'] } });
  leases.forEach((l) => allowedPropertyIds.add(String(l.propertyId)));
  if (!allowedPropertyIds.has(String(params.propertyId))) {
    throw new AppError('You can only report maintenance for your leased properties', 403, 'FORBIDDEN');
  }
  const property = await Property.findById(params.propertyId).select('companyId propertyOwnerId ownerId name').lean();
  if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
  const company = await Company.findById(property.companyId).select('featureFlags').lean();
  const quotesEnabled = isFlagEnabledForCompany(company as any, 'maintenanceQuotesEnabled');

  const request = await MaintenanceRequest.create({
    propertyId: params.propertyId,
    requestedBy: params.tenantUserId,
    ownerId: property.propertyOwnerId || property.ownerId,
    title: params.title,
    description: params.description,
    priority: params.urgency === 'EMERGENCY' || params.urgency === 'URGENT' ? 'high' : params.urgency === 'LOW' ? 'low' : 'medium',
    status: quotesEnabled ? 'draft' : 'draft',
    category: params.category,
    attachments: params.attachments || [],
    companyId: property.companyId,
    ecosystemWorkflow: quotesEnabled
      ? {
          enabled: true,
          status: 'REPORTED',
          category: params.category,
          urgency: params.urgency,
          preferredAccessTime: params.preferredAccessTime,
          reportedByTenantId: tenants[0]?._id,
        }
      : { enabled: false, category: params.category, urgency: params.urgency },
  });

  await ecosystemAudit({
    req: params.req,
    actor: params.tenantUserId,
    action: 'MAINTENANCE_REPORTED',
    entity: 'MaintenanceRequest',
    entityId: String(request._id),
    newState: { status: request.ecosystemWorkflow?.status || request.status },
  });
  await notifyEvent({
    recipientId: params.tenantUserId,
    companyId: String(property.companyId),
    eventType: 'MAINTENANCE_REQUEST_RECEIVED',
    variables: {
      tenantName: 'You',
      maintenanceDescription: params.title,
      propertyName: property.name || 'the property',
    },
    idempotencyKey: `maint:${request._id}:reported`,
  });
  await notifyCompanyStaff(String(property.companyId), 'MAINTENANCE_REQUEST_RECEIVED', {
    tenantName: 'A tenant',
    maintenanceDescription: params.title,
    propertyName: property.name || 'the property',
  }, `maint:${request._id}:reported:staff`);
  return request;
}

export { LEGACY_STATUS_FROM_ECOSYSTEM };
