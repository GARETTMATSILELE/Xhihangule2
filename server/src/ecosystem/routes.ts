import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import {
  actorId,
  asyncHandler,
  ecosystemAuth,
  requireAgencyStaff,
  requireContractor,
  requireFlag,
  requireOwnerOrAgency,
  requireTenant,
} from './middleware';
import {
  registerPortalUser,
  updateTenantProfile,
  searchListings,
  getPublicListing,
  createViewingRequest,
  updateViewingStatus,
  upsertApplication,
  updateApplicationStatus,
  getTenantLeases,
  getTenantPayments,
  getTenantDocuments,
  getTenantFile,
  createTenantMaintenance,
} from './services/tenantPortalService';
import {
  agentReviewRequest,
  inviteContractors,
  submitQuote,
  listQuotesForAgent,
  listQuotesForContractor,
  selectQuote,
  sendQuoteToOwner,
  ownerDecideQuote,
  authoriseWork,
  contractorUpdateJob,
  tenantConfirmMaintenance,
  submitRating,
  createTenantReference,
  createMaintenanceInspection,
  acknowledgeInspection,
  requestChangeOrder,
  agentReviewChangeOrder,
  ownerDecideChangeOrder,
  assertOwnerCanActOnProperty,
} from './services/maintenanceWorkflowService';
import { TenantProfile, ViewingRequest, RentalApplication } from './models/tenantFacing';
import { QuoteInvitation, ContractorJobRecord, MaintenanceChangeOrder } from './models/maintenanceWorkflow';
import { Broadcast, BroadcastDelivery, Rating, TenantReference } from './models/engagement';
import { CommunicationPreference, NotificationDelivery, EcosystemPaymentIntent } from './models/commsAndPayments';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { MaintenanceAttachmentRecord } from '../models/MaintenanceAttachment';
import { contractorDirectoryFilter, MaintenanceContractor } from '../models/MaintenanceContractor';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { Inspection } from '../models/Inspection';
import { Payment } from '../models/Payment';
import { notifyEvent } from './services/notificationService';
import { initializeTenantPayment, verifyAndPostTenantPayment } from './services/paymentProvider';
import { ApplicationStatus, ViewingStatus, OwnerDecision, ContractorJobStatus } from './constants';
import { hasAnyRole } from '../utils/access';
import { callerCanAccessProperty, propertyIdsForCaller } from '../utils/propertyAccess';
import { Company } from '../models/Company';
import { toTenantApplication, toTenantViewing } from './listingUtils';

const router = express.Router();

function setAuthCookies(res: Response, token: string, refreshToken: string) {
  const prod = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'strict' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.cookie('refreshCsrf', crypto.randomBytes(32).toString('hex'), {
    httpOnly: false,
    secure: prod,
    sameSite: prod ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', module: 'ecosystem' });
});

router.post('/auth/register', asyncHandler(async (req, res) => {
  const role = req.body.role === 'contractor' ? 'contractor' : 'tenant';
  const result = await registerPortalUser({
    role,
    email: req.body.email,
    password: req.body.password,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    phone: req.body.phone,
    accountType: req.body.accountType === 'company' ? 'company' : 'individual',
    homeAddress: req.body.homeAddress,
    companyName: req.body.companyName,
    companyAddress: req.body.companyAddress,
    trade: req.body.trade,
    req,
  });
  setAuthCookies(res, result.tokens.token, result.tokens.refreshToken);
  res.status(201).json({
    user: {
      _id: result.user._id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: result.user.role,
      roles: result.user.roles,
    },
    token: result.tokens.token,
  });
}));

router.get('/listings', asyncHandler(async (req, res) => {
  res.json(await searchListings(req.query as any));
}));

router.get('/listings/:id', asyncHandler(async (req, res) => {
  res.json(await getPublicListing(req.params.id));
}));

router.use(ecosystemAuth);

router.get('/me/profile', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const profile = await TenantProfile.findOne({ userId: actorId(req) });
  const prefs = await CommunicationPreference.findOne({ userId: actorId(req) });
  res.json({ profile, preferences: prefs });
}));

router.put('/me/profile', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await updateTenantProfile(actorId(req), req.body || {}));
}));

router.get('/me/overview', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const userId = actorId(req);
  const [profile, leases, payments, maintenance, viewings, applications, notifications] = await Promise.all([
    TenantProfile.findOne({ userId }).lean(),
    getTenantLeases(userId),
    getTenantPayments(userId),
    MaintenanceRequest.find({ requestedBy: userId }).sort({ createdAt: -1 }).limit(10).lean(),
    ViewingRequest.find({ tenantUserId: userId }).sort({ createdAt: -1 }).limit(10).lean(),
    RentalApplication.find({ tenantUserId: userId }).sort({ createdAt: -1 }).limit(10).lean(),
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const activeLease = (leases as any[]).find((l) => ['active', 'expiring_soon'].includes(l.status)) || (leases as any[])[0];
  const due = activeLease?.financialSummary?.outstandingBalance || 0;
  res.json({
    profile,
    lease: activeLease || null,
    rentDue: due,
    nextPayment: activeLease?.billingRules || null,
    openMaintenance: (maintenance as any[]).filter((m) => m.status !== 'closed' && m.ecosystemWorkflow?.status !== 'CLOSED'),
    recentReceipts: (payments as any[]).slice(0, 5),
    messages: notifications,
    viewings: (viewings as any[]).map(toTenantViewing),
    applications: (applications as any[]).map(toTenantApplication),
  });
}));

router.get('/me/leases', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await getTenantLeases(actorId(req)));
}));

router.get('/me/payments', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await getTenantPayments(actorId(req)));
}));

router.get('/me/receipts/:paymentId', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const payments = await getTenantPayments(actorId(req));
  const match = (payments as any[]).find((p) => String(p._id) === req.params.paymentId);
  if (!match) throw new AppError('Receipt not found', 404, 'NOT_FOUND');
  const payment = await Payment.findById(req.params.paymentId).lean();
  res.json({
    receiptNumber: payment?.referenceNumber || payment?._id,
    amount: payment?.amount,
    date: payment?.paymentDate,
    paymentMethod: payment?.paymentMethod,
    propertyId: payment?.propertyId,
  });
}));

router.get('/me/documents', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await getTenantDocuments(actorId(req), req.query.leaseId as string | undefined));
}));

router.get('/me/documents/files/:id', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await getTenantFile(actorId(req), req.params.id));
}));

router.post('/viewings', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const viewing = await createViewingRequest({
    tenantUserId: actorId(req),
    propertyId: req.body.propertyId,
    requestedDate: new Date(req.body.requestedDate),
    preferredTime: req.body.preferredTime,
    attendees: req.body.attendees,
    message: req.body.message,
    req,
  });
  res.status(201).json(viewing);
}));

router.get('/me/viewings', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const rows = await ViewingRequest.find({ tenantUserId: actorId(req) }).sort({ createdAt: -1 }).lean();
  res.json(rows.map(toTenantViewing));
}));

router.post('/applications', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const app = await upsertApplication({
    tenantUserId: actorId(req),
    propertyId: req.body.propertyId,
    notes: req.body.notes,
    documents: req.body.documents,
    submit: Boolean(req.body.submit),
    req,
  });
  res.status(201).json(app);
}));

router.get('/me/applications', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const rows = await RentalApplication.find({ tenantUserId: actorId(req) }).sort({ createdAt: -1 }).lean();
  res.json(rows.map(toTenantApplication));
}));

router.post('/maintenance', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const created = await createTenantMaintenance({
    tenantUserId: actorId(req),
    propertyId: req.body.propertyId,
    title: req.body.title,
    description: req.body.description,
    category: req.body.category || 'OTHER',
    urgency: req.body.urgency || 'NORMAL',
    preferredAccessTime: req.body.preferredAccessTime,
    attachments: req.body.attachments,
    req,
  });
  res.status(201).json(created);
}));

router.get('/me/maintenance', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await MaintenanceRequest.find({ requestedBy: actorId(req) }).sort({ createdAt: -1 }).lean());
}));

router.post('/maintenance/:id/confirm', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await tenantConfirmMaintenance({
    requestId: req.params.id,
    tenantUserId: actorId(req),
    confirm: req.body.confirm !== false,
    comment: req.body.comment,
    req,
  }));
}));

router.post('/payments/online/initialize', requireTenant(), requireFlag('tenantPortalEnabled'), requireFlag('onlinePaymentsEnabled'), asyncHandler(async (req, res) => {
  const intent = await initializeTenantPayment({
    tenantUserId: actorId(req),
    propertyId: req.body.propertyId,
    amount: Number(req.body.amount),
    idempotencyKey: req.body.idempotencyKey || `${actorId(req)}:${req.body.propertyId}:${req.body.amount}:${req.body.period || 'current'}`,
    leaseId: req.body.leaseId,
  });
  res.status(201).json(intent);
}));

router.post('/payments/online/:intentId/verify', requireTenant(), requireFlag('tenantPortalEnabled'), requireFlag('onlinePaymentsEnabled'), asyncHandler(async (req, res) => {
  res.json(await verifyAndPostTenantPayment(req.params.intentId, actorId(req)));
}));

router.get('/me/payment-intents', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await EcosystemPaymentIntent.find({ tenantUserId: actorId(req) }).sort({ createdAt: -1 }).lean());
}));

router.get('/me/notifications', asyncHandler(async (req, res) => {
  res.json(await Notification.find({ userId: actorId(req) }).sort({ createdAt: -1 }).limit(100).lean());
}));

router.put('/me/preferences', asyncHandler(async (req, res) => {
  const prefs = await CommunicationPreference.findOneAndUpdate(
    { userId: actorId(req) },
    { $set: req.body || {} },
    { new: true, upsert: true }
  );
  res.json(prefs);
}));

// Agency viewing / application queues
router.get('/agency/viewings', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const ids = await propertyIdsForCaller(req);
  const filter: any = { companyId: req.user?.companyId };
  if (ids !== 'company') filter.propertyId = { $in: ids };
  res.json(await ViewingRequest.find(filter).sort({ createdAt: -1 }).limit(200).lean());
}));

router.post('/agency/viewings/:id/status', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const viewing = await ViewingRequest.findOne({ _id: req.params.id, companyId: req.user?.companyId }).select('propertyId');
  if (!viewing || !(await callerCanAccessProperty(req, String(viewing.propertyId)))) {
    return res.status(404).json({ message: 'Viewing was not found in this company' });
  }
  res.json(await updateViewingStatus({
    viewingId: req.params.id,
    companyId: String(req.user?.companyId),
    actorId: actorId(req),
    status: req.body.status as ViewingStatus,
    notes: req.body.notes,
    proposedDate: req.body.proposedDate ? new Date(req.body.proposedDate) : undefined,
    req,
  }));
}));

router.get('/agency/applications', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const ids = await propertyIdsForCaller(req);
  const filter: any = { companyId: req.user?.companyId };
  if (ids !== 'company') filter.propertyId = { $in: ids };
  res.json(await RentalApplication.find(filter).sort({ createdAt: -1 }).limit(200).lean());
}));

router.post('/agency/applications/:id/status', requireAgencyStaff(), asyncHandler(async (req, res) => {
  if (req.body?.status === 'OWNER_APPROVED' || req.body?.status === 'OWNER_DECLINED') {
    return res.status(403).json({ message: 'Owner approval is a separate gate. An agent cannot approve an applicant from this route.' });
  }
  const application = await RentalApplication.findOne({ _id: req.params.id, companyId: req.user?.companyId }).select('propertyId');
  if (!application || !(await callerCanAccessProperty(req, String(application.propertyId)))) {
    return res.status(404).json({ message: 'Application was not found in this company' });
  }
  res.json(await updateApplicationStatus({
    applicationId: req.params.id,
    companyId: String(req.user?.companyId),
    actorId: actorId(req),
    status: req.body.status as ApplicationStatus,
    note: req.body.note,
    req,
  }));
}));

router.get('/agency/maintenance', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const ids = await propertyIdsForCaller(req);
  const filter: any = { companyId: req.user?.companyId };
  if (ids !== 'company') filter.propertyId = { $in: ids };
  if (req.query.status) filter['ecosystemWorkflow.status'] = req.query.status;
  if (req.query.propertyId) filter.propertyId = req.query.propertyId;
  if (req.query.urgency) filter['ecosystemWorkflow.urgency'] = req.query.urgency;
  res.json(await MaintenanceRequest.find(filter).sort({ updatedAt: -1 }).limit(200).lean());
}));

router.post('/agency/maintenance/:id/review', requireAgencyStaff(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await agentReviewRequest({ requestId: req.params.id, companyId: String(req.user?.companyId), actorId: actorId(req), req }));
}));

router.post('/agency/maintenance/:id/invite', requireAgencyStaff(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await inviteContractors({
    requestId: req.params.id,
    companyId: String(req.user?.companyId),
    actorId: actorId(req),
    contractorIds: req.body.contractorIds || [],
    req,
  }));
}));

router.get('/agency/maintenance/:id/quotes', requireAgencyStaff(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await listQuotesForAgent(req.params.id, String(req.user?.companyId)));
}));

router.post('/agency/maintenance/:id/quotes/:quoteId/select', requireAgencyStaff(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await selectQuote({
    requestId: req.params.id,
    companyId: String(req.user?.companyId),
    actorId: actorId(req),
    quoteId: req.params.quoteId,
    reason: req.body.reason,
    req,
  }));
}));

router.post('/agency/maintenance/:id/send-to-owner', requireAgencyStaff(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await sendQuoteToOwner({ requestId: req.params.id, companyId: String(req.user?.companyId), actorId: actorId(req), req }));
}));

router.post('/agency/maintenance/:id/authorise', requireAgencyStaff(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await authoriseWork({ requestId: req.params.id, companyId: String(req.user?.companyId), actorId: actorId(req), req }));
}));

router.get('/agency/maintenance/:id/change-orders', requireAgencyStaff(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await MaintenanceChangeOrder.find({ requestId: req.params.id, companyId: req.user?.companyId }).sort({ createdAt: -1 }).lean());
}));

router.post('/agency/change-orders/:id/review', requireAgencyStaff(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await agentReviewChangeOrder({
    changeOrderId: req.params.id,
    companyId: String(req.user?.companyId),
    actorId: actorId(req),
    req,
  }));
}));

router.get('/owner/maintenance', requireOwnerOrAgency(), asyncHandler(async (req, res) => {
  const filter: any = {};
  if (hasAnyRole(req, ['owner'])) {
    const owner = await User.findById(actorId(req)).select('email').lean();
    const ownerDoc = owner?.email ? await (await import('../models/PropertyOwner')).PropertyOwner.findOne({ email: owner.email }).lean() : null;
    const properties = await Property.find({
      $or: [
        { propertyOwnerId: ownerDoc?._id },
        { ownerId: actorId(req) },
      ],
    }).select('_id').lean();
    filter.propertyId = { $in: properties.map((p) => p._id) };
  } else {
    filter.companyId = req.user?.companyId;
  }
  res.json(await MaintenanceRequest.find(filter).sort({ updatedAt: -1 }).limit(200).lean());
}));

router.post('/owner/maintenance/:id/decision', requireOwnerOrAgency(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await ownerDecideQuote({
    requestId: req.params.id,
    ownerUserId: actorId(req),
    decision: req.body.decision as OwnerDecision,
    comment: req.body.comment,
    req,
  }));
}));

router.get('/owner/maintenance/:id/quote', requireOwnerOrAgency(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  const request = await MaintenanceRequest.findById(req.params.id).lean();
  if (!request) throw new AppError('Maintenance request not found', 404, 'NOT_FOUND');
  const property = await Property.findById(request.propertyId).select('propertyOwnerId ownerId companyId').lean();
  await assertOwnerCanActOnProperty({
    actorUserId: actorId(req),
    property,
    requestCompanyId: request.companyId,
  });
  const quoteId = (request as any).ecosystemWorkflow?.selectedQuoteId;
  if (!quoteId) throw new AppError('No quote has been sent for approval', 404, 'NOT_FOUND');
  const { MaintenanceQuote } = await import('../models/MaintenanceQuote');
  const quote = await MaintenanceQuote.findById(quoteId).select('amount total estimatedDuration status version description lineItems currency').lean();
  res.json({ request: { _id: request._id, title: request.title, description: request.description, status: (request as any).ecosystemWorkflow?.status }, quote });
}));

router.post('/owner/change-orders/:id/decision', requireOwnerOrAgency(), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.json(await ownerDecideChangeOrder({
    changeOrderId: req.params.id,
    ownerUserId: actorId(req),
    decision: req.body.decision === 'DECLINE' ? 'DECLINE' : 'APPROVE',
    comment: req.body.comment,
    req,
  }));
}));

router.get('/contractor/me', requireContractor(), requireFlag('contractorPortalEnabled'), asyncHandler(async (req, res) => {
  let profile = await MaintenanceContractor.findOne({ userId: actorId(req) });
  res.json(profile);
}));

router.put('/contractor/me', requireContractor(), requireFlag('contractorPortalEnabled'), asyncHandler(async (req, res) => {
  const allowed = ['companyName', 'contactPerson', 'phone', 'email', 'trade', 'address', 'notes', 'skills', 'serviceAreas', 'availability', 'description'];
  const update: any = { userId: actorId(req) };
  for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
  const existing = await MaintenanceContractor.findOne({ userId: actorId(req) });
  if (existing) {
    Object.assign(existing, update);
    await existing.save();
    return res.json(existing);
  }
  if (!req.user?.companyId) throw new AppError('Create your company profile before saving contractor details', 400, 'NO_COMPANY');
  const created = await MaintenanceContractor.create({
    companyId: req.user.companyId,
    companyName: req.body.companyName || `${req.body.contactPerson || 'Contractor'}`,
    contactPerson: req.body.contactPerson || 'Contact',
    phone: req.body.phone || '0000000000',
    email: req.body.email,
    trade: req.body.trade || 'General Contractor',
    userId: actorId(req),
    verificationStatus: 'UNVERIFIED',
    skills: req.body.skills || [],
    serviceAreas: req.body.serviceAreas || [],
  });
  res.status(201).json(created);
}));

router.get('/contractor/invitations', requireContractor(), requireFlag('contractorPortalEnabled'), asyncHandler(async (req, res) => {
  const contractor = await MaintenanceContractor.findOne({ userId: actorId(req) });
  if (!contractor) return res.json([]);
  const invitations = await QuoteInvitation.find({ contractorId: contractor._id }).sort({ createdAt: -1 }).lean();
  const requestIds = invitations.map((inv) => inv.requestId);
  const [jobs, photos] = await Promise.all([
    ContractorJobRecord.find({ contractorId: contractor._id, requestId: { $in: requestIds } }).select('_id requestId status').lean(),
    MaintenanceAttachmentRecord.find({ requestId: { $in: requestIds }, type: 'BEFORE' }).select('requestId fileUrl fileName mimeType').lean(),
  ]);
  const jobByRequest = new Map(jobs.map((job) => [String(job.requestId), job]));
  res.json(invitations.map((inv) => ({
    ...inv,
    jobId: jobByRequest.get(String(inv.requestId))?._id,
    jobStatus: jobByRequest.get(String(inv.requestId))?.status,
    photos: photos
      .filter((photo) => String(photo.requestId) === String(inv.requestId))
      .map((photo) => ({ fileUrl: photo.fileUrl, fileName: photo.fileName, mimeType: photo.mimeType })),
  })));
}));

router.get('/contractor/quotes', requireContractor(), requireFlag('contractorPortalEnabled'), asyncHandler(async (req, res) => {
  const contractor = await MaintenanceContractor.findOne({ userId: actorId(req) });
  if (!contractor) return res.json([]);
  const { MaintenanceQuote } = await import('../models/MaintenanceQuote');
  res.json(await MaintenanceQuote.find({ contractorId: contractor._id }).sort({ createdAt: -1 }).lean());
}));

router.post('/contractor/maintenance/:id/quotes', requireContractor(), requireFlag('contractorPortalEnabled'), asyncHandler(async (req, res) => {
  res.status(201).json(await submitQuote({
    requestId: req.params.id,
    contractorUserId: actorId(req),
    description: req.body.description,
    lineItems: req.body.lineItems || [],
    estimatedDuration: req.body.estimatedDuration,
    estimatedStartDate: req.body.estimatedStartDate ? new Date(req.body.estimatedStartDate) : undefined,
    validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
    notes: req.body.notes,
    attachments: req.body.attachments,
    req,
  }));
}));

router.get('/contractor/jobs', requireContractor(), requireFlag('contractorPortalEnabled'), asyncHandler(async (req, res) => {
  const contractor = await MaintenanceContractor.findOne({ userId: actorId(req) });
  if (!contractor) return res.json([]);
  const filter: any = { contractorId: contractor._id };
  if (req.query.status) filter.status = req.query.status;
  res.json(await ContractorJobRecord.find(filter).sort({ updatedAt: -1 }).lean());
}));

router.post('/contractor/jobs/:id/status', requireContractor(), requireFlag('contractorPortalEnabled'), asyncHandler(async (req, res) => {
  res.json(await contractorUpdateJob({
    jobId: req.params.id,
    contractorUserId: actorId(req),
    status: req.body.status as ContractorJobStatus,
    scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : undefined,
    completion: req.body.completion,
    req,
  }));
}));

router.post('/contractor/jobs/:id/change-orders', requireContractor(), requireFlag('contractorPortalEnabled'), requireFlag('maintenanceQuotesEnabled'), asyncHandler(async (req, res) => {
  res.status(201).json(await requestChangeOrder({
    jobId: req.params.id,
    contractorUserId: actorId(req),
    requestedAmount: Number(req.body.requestedAmount),
    description: req.body.description,
    req,
  }));
}));

router.post('/ratings', requireFlag('contractorRatingsEnabled'), asyncHandler(async (req, res) => {
  const role = hasAnyRole(req, ['tenant']) ? 'tenant' : hasAnyRole(req, ['owner']) ? 'owner' : 'agent';
  res.status(201).json(await submitRating({
    jobId: req.body.jobId,
    raterUserId: actorId(req),
    raterRole: role as any,
    scores: req.body.scores,
    comment: req.body.comment,
  }));
}));

router.get('/contractor/ratings', requireContractor(), requireFlag('contractorPortalEnabled'), asyncHandler(async (req, res) => {
  const contractor = await MaintenanceContractor.findOne({ userId: actorId(req) });
  if (!contractor) return res.json([]);
  res.json(await Rating.find({ contractorId: contractor._id }).sort({ createdAt: -1 }).lean());
}));

router.post('/agency/references', requireAgencyStaff(), requireFlag('tenantReferencesEnabled'), asyncHandler(async (req, res) => {
  res.status(201).json(await createTenantReference({
    companyId: String(req.user?.companyId),
    actorId: actorId(req),
    leaseId: req.body.leaseId,
    payload: {
      rentPaymentHistory: req.body.rentPaymentHistory,
      outstandingBalance: req.body.outstandingBalance,
      propertyCondition: req.body.propertyCondition,
      maintenanceCooperation: req.body.maintenanceCooperation,
      leaseCompliance: req.body.leaseCompliance,
      communication: req.body.communication,
      moveOutCondition: req.body.moveOutCondition,
      depositOutcome: req.body.depositOutcome,
      publicNotes: req.body.publicNotes,
      privateNotes: req.body.privateNotes,
    },
  }));
}));

router.get('/agency/references', requireAgencyStaff(), requireFlag('tenantReferencesEnabled'), asyncHandler(async (req, res) => {
  const filter: any = { companyId: req.user?.companyId };
  if (req.query.tenantId) filter.tenantId = req.query.tenantId;
  res.json(await TenantReference.find(filter).sort({ createdAt: -1 }).lean());
}));

router.post('/agency/inspections', requireAgencyStaff(), asyncHandler(async (req, res) => {
  res.status(201).json(await createMaintenanceInspection({
    companyId: String(req.user?.companyId),
    actorId: actorId(req),
    requestId: req.body.requestId,
    checklist: req.body.checklist,
    notes: req.body.notes,
  }));
}));

router.post('/inspections/:id/acknowledge', asyncHandler(async (req, res) => {
  const role = hasAnyRole(req, ['tenant']) ? 'tenant' : hasAnyRole(req, ['owner']) ? 'owner' : 'agent';
  res.json(await acknowledgeInspection({
    inspectionId: req.params.id,
    userId: actorId(req),
    role: role as any,
    signature: req.body.signature || 'acknowledged',
  }));
}));

router.get('/me/inspections', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const tenants = await Tenant.find({ userId: actorId(req) });
  res.json(await Inspection.find({ tenantId: { $in: tenants.map((t) => t._id) } }).sort({ scheduledDate: -1 }).lean());
}));

router.post('/agency/broadcasts', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const broadcast = await Broadcast.create({
    companyId: req.user?.companyId,
    senderId: actorId(req),
    title: req.body.title,
    message: req.body.message,
    priority: req.body.priority || 'NORMAL',
    scope: req.body.scope || 'ALL_AGENCY_TENANTS',
    audience: req.body.audience || {},
    attachments: req.body.attachments,
    scheduledAt: req.body.scheduledAt,
    expiresAt: req.body.expiresAt,
  });
  const tenantQuery: any = { companyId: req.user?.companyId };
  if (req.body.scope === 'PROPERTY' && req.body.audience?.propertyId) {
    tenantQuery.$or = [
      { propertyId: req.body.audience.propertyId },
      { propertyIds: req.body.audience.propertyId },
    ];
  }
  if (req.body.scope === 'PORTFOLIO' && Array.isArray(req.body.audience?.propertyIds) && req.body.audience.propertyIds.length) {
    tenantQuery.$or = [
      { propertyId: { $in: req.body.audience.propertyIds } },
      { propertyIds: { $in: req.body.audience.propertyIds } },
    ];
  }
  if (req.body.scope === 'TENANT' && req.body.audience?.tenantId) tenantQuery._id = req.body.audience.tenantId;
  const tenants = await Tenant.find(tenantQuery).select('userId').lean();
  const recipientIds = tenants.map((t) => t.userId).filter(Boolean);
  for (const recipientId of recipientIds) {
    await BroadcastDelivery.create({ broadcastId: broadcast._id, recipientUserId: recipientId, status: 'QUEUED' });
    await notifyEvent({
      recipientId: String(recipientId),
      companyId: String(req.user?.companyId),
      eventType: 'BROADCAST_MESSAGE',
      variables: { title: broadcast.title, message: broadcast.message },
      operational: broadcast.priority === 'EMERGENCY' || broadcast.priority === 'URGENT',
      idempotencyKey: `broadcast:${broadcast._id}:${recipientId}`,
    });
  }
  res.status(201).json({ broadcast, recipients: recipientIds.length });
}));

router.get('/me/broadcasts', requireTenant(), requireFlag('tenantPortalEnabled'), asyncHandler(async (req, res) => {
  const deliveries = await BroadcastDelivery.find({ recipientUserId: actorId(req) }).sort({ createdAt: -1 }).limit(50).lean();
  const ids = deliveries.map((d) => d.broadcastId);
  res.json(await Broadcast.find({ _id: { $in: ids } }).sort({ createdAt: -1 }).lean());
}));

router.get('/agency/contractors', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const filter: any = {
    ...contractorDirectoryFilter(req.user?.companyId ? String(req.user.companyId) : undefined),
    active: { $ne: false },
  };
  if (req.query.trade) filter.trade = req.query.trade;
  if (req.query.verification) filter.verificationStatus = req.query.verification;
  if (req.query.serviceArea) filter.serviceAreas = req.query.serviceArea;
  res.json(await MaintenanceContractor.find(filter).sort({ companyName: 1 }).lean());
}));

router.put('/agency/properties/:id/listing', requireAgencyStaff(), requireFlag('propertyMarketplaceEnabled'), asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.id, companyId: req.user?.companyId });
  if (!property || !(await callerCanAccessProperty(req, String(property._id)))) throw new AppError('Property not found', 404, 'NOT_FOUND');
  if (req.body.publicListingEnabled !== undefined) {
    property.publicListingEnabled = Boolean(req.body.publicListingEnabled);
    property.listingPublishedAt = property.publicListingEnabled ? new Date() : undefined;
  }
  if (req.body.availableFrom) property.availableFrom = new Date(req.body.availableFrom);
  if (req.body.deposit !== undefined) property.deposit = Number(req.body.deposit);
  if (req.body.paymentTerms !== undefined) property.paymentTerms = req.body.paymentTerms;
  if (req.body.leaseRequirements !== undefined) property.leaseRequirements = req.body.leaseRequirements;
  if (req.body.videos) property.videos = req.body.videos;
  await property.save();
  res.json({ _id: property._id, publicListingEnabled: property.publicListingEnabled });
}));

router.get('/agency/settings/ecosystem', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const company = await Company.findById(req.user?.companyId).select('featureFlags').lean();
  res.json(company?.featureFlags || {});
}));

router.put('/agency/settings/ecosystem', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const allowed = [
    'tenantPortalEnabled', 'contractorPortalEnabled', 'propertyMarketplaceEnabled',
    'maintenanceQuotesEnabled', 'onlinePaymentsEnabled', 'multichannelNotificationsEnabled',
    'tenantReferencesEnabled', 'contractorRatingsEnabled',
  ];
  const $set: any = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) $set[`featureFlags.${key}`] = Boolean(req.body[key]);
  }
  const company = await Company.findByIdAndUpdate(req.user?.companyId, { $set }, { new: true }).select('featureFlags');
  res.json(company?.featureFlags || {});
}));

router.get('/agency/dashboard', requireAgencyStaff(), asyncHandler(async (req, res) => {
  const companyId = req.user?.companyId;
  const [maintenance, viewings, applications, jobs] = await Promise.all([
    MaintenanceRequest.find({ companyId, 'ecosystemWorkflow.enabled': true }).select('title ecosystemWorkflow status propertyId').lean(),
    ViewingRequest.find({ companyId, status: { $in: ['REQUESTED', 'UNDER_REVIEW'] } }).countDocuments(),
    RentalApplication.find({ companyId, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }).countDocuments(),
    ContractorJobRecord.find({ companyId, status: { $in: ['AUTHORISED', 'ACCEPTED', 'SCHEDULED', 'WORK_IN_PROGRESS'] } }).countDocuments(),
  ]);
  res.json({
    maintenanceRequests: maintenance.length,
    quotesAwaitingReview: maintenance.filter((m: any) => m.ecosystemWorkflow?.status === 'QUOTE_RECEIVED').length,
    quotesAwaitingOwner: maintenance.filter((m: any) => m.ecosystemWorkflow?.status === 'OWNER_APPROVAL').length,
    approvedWork: maintenance.filter((m: any) => ['APPROVED', 'AUTHORISED'].includes(m.ecosystemWorkflow?.status)).length,
    contractorJobs: jobs,
    viewingRequests: viewings,
    applications,
  });
}));

export default router;
