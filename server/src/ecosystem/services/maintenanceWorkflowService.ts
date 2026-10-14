import mongoose from 'mongoose';
import { MaintenanceRequest } from '../../models/MaintenanceRequest';
import { MaintenanceQuote } from '../../models/MaintenanceQuote';
import { contractorDirectoryFilter, MaintenanceContractor } from '../../models/MaintenanceContractor';
import { Property } from '../../models/Property';
import { PropertyOwner } from '../../models/PropertyOwner';
import { User } from '../../models/User';
import { Inspection } from '../../models/Inspection';
import { AppError } from '../../middleware/errorHandler';
import { QuoteInvitation, OwnerQuoteDecision, ContractorJobRecord, MaintenanceChangeOrder } from '../models/maintenanceWorkflow';
import { Rating, TenantReference } from '../models/engagement';
import { ecosystemAudit } from '../audit';
import { CommunicationPreference } from '../models/commsAndPayments';
import { isDeliverableEmail, notifyEvent, notifyCompanyStaff } from './notificationService';
import { logger } from '../../utils/logger';
import {
  assertJobTransition,
  assertMaintenanceTransition,
  assertQuoteNotLocked,
  assertQuoteTransition,
  assertWorkMayStart,
} from '../workflowMachine';
import {
  ContractorJobStatus,
  EcosystemMaintenanceStatus,
  LEGACY_STATUS_FROM_ECOSYSTEM,
  OwnerDecision,
  QuoteStatus,
} from '../constants';
import { ownerApprovalRequired } from '../flags';
import { Company } from '../../models/Company';
import { Lease } from '../../models/Lease';
import { Tenant } from '../../models/Tenant';

async function loadRequest(requestId: string, companyId?: string) {
  const query: any = { _id: requestId };
  if (companyId) query.companyId = companyId;
  const request = await MaintenanceRequest.findOne(query);
  if (!request) throw new AppError('Maintenance request not found', 404, 'NOT_FOUND');
  return request;
}

function userRoles(user: { role?: string; roles?: string[] } | null | undefined): string[] {
  return [user?.role, ...(user?.roles || [])].filter(Boolean) as string[];
}

/** Owner must own the property. Agency staff must belong to the request company. Never trust body IDs. */
export async function assertOwnerCanActOnProperty(params: {
  actorUserId: string;
  property: { propertyOwnerId?: any; ownerId?: any } | null;
  requestCompanyId: any;
}) {
  const actor = await User.findById(params.actorUserId).select('email role roles companyId').lean();
  if (!actor) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const roles = userRoles(actor);
  const isAgency = ['admin', 'agent', 'principal', 'prea'].some((role) => roles.includes(role));
  if (isAgency) {
    if (String(actor.companyId || '') !== String(params.requestCompanyId)) {
      throw new AppError('You cannot access another company\'s maintenance', 403, 'FORBIDDEN');
    }
    return;
  }
  if (!roles.includes('owner')) {
    throw new AppError('You cannot approve quotes for another owner\'s property', 403, 'FORBIDDEN');
  }
  const ownerRecord = actor.email
    ? await PropertyOwner.findOne({ email: actor.email }).select('_id').lean()
    : null;
  const owns =
    Boolean(ownerRecord && String(ownerRecord._id) === String(params.property?.propertyOwnerId || '')) ||
    String(params.property?.ownerId || '') === params.actorUserId;
  if (!owns) {
    throw new AppError('You cannot approve quotes for another owner\'s property', 403, 'FORBIDDEN');
  }
}

function workflowStatus(request: any): EcosystemMaintenanceStatus {
  return (request.ecosystemWorkflow?.status || 'REPORTED') as EcosystemMaintenanceStatus;
}

async function setWorkflowStatus(request: any, next: EcosystemMaintenanceStatus, extra?: Record<string, any>) {
  const current = workflowStatus(request);
  if (current !== next) assertMaintenanceTransition(current, next);
  request.ecosystemWorkflow = {
    ...(request.ecosystemWorkflow || {}),
    enabled: true,
    status: next,
    ...(extra || {}),
  };
  const legacy = LEGACY_STATUS_FROM_ECOSYSTEM[next];
  if (legacy) request.status = legacy;
  await request.save();
  return request;
}

export async function agentReviewRequest(params: { requestId: string; companyId: string; actorId: string; req?: any }) {
  const request = await loadRequest(params.requestId, params.companyId);
  await setWorkflowStatus(request, 'UNDER_REVIEW');
  await ecosystemAudit({
    req: params.req,
    actor: params.actorId,
    action: 'MAINTENANCE_REVIEWED',
    entity: 'MaintenanceRequest',
    entityId: params.requestId,
    newState: { status: 'UNDER_REVIEW' },
  });
  return request;
}

async function rememberContractorPhone(userId: string, phone?: string) {
  const trimmed = phone?.trim();
  if (!trimmed) return;
  const existing = await CommunicationPreference.findOne({ userId });
  if (!existing) {
    await CommunicationPreference.create({ userId, phone: trimmed });
    return;
  }
  if (!existing.phone) {
    existing.phone = trimmed;
    await existing.save();
  }
}

export async function inviteContractors(params: {
  requestId: string;
  companyId: string;
  actorId: string;
  contractorIds: string[];
  req?: any;
}) {
  const request = await loadRequest(params.requestId, params.companyId);
  if (!params.contractorIds?.length) throw new AppError('At least one contractor is required', 400, 'VALIDATION_ERROR');
  const property = await Property.findById(request.propertyId).select('name address').lean();
  const scopeSnapshot = {
    title: request.title,
    description: request.description,
    category: request.ecosystemWorkflow?.category || request.category,
    urgency: request.ecosystemWorkflow?.urgency,
    propertyName: property?.name || '',
    propertyLocation: property?.address || '',
    attachments: (request.attachments || []).map((file: any) => ({
      name: file?.name,
      type: file?.type,
      size: file?.size,
    })),
  };
  const portalLink = `${process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:3000'}/contractor-dashboard/jobs`;
  const submittedAt = new Date().toISOString();
  const notificationWarnings: string[] = [];

  const created = [];
  for (const contractorId of params.contractorIds) {
    const contractor = await MaintenanceContractor.findOne({
      _id: contractorId,
      ...contractorDirectoryFilter(params.companyId),
      active: { $ne: false },
    });
    if (!contractor) throw new AppError('Contractor not found', 404, 'NOT_FOUND');
    const invitation = await QuoteInvitation.findOneAndUpdate(
      { requestId: request._id, contractorId },
      {
        $setOnInsert: {
          companyId: params.companyId,
          propertyId: request.propertyId,
          invitedBy: params.actorId,
          scopeSnapshot,
          status: 'INVITED',
        },
      },
      { upsert: true, new: true }
    );
    const job = await ContractorJobRecord.findOneAndUpdate(
      { requestId: request._id, contractorId },
      {
        $setOnInsert: {
          companyId: params.companyId,
          propertyId: request.propertyId,
          status: 'QUOTE_REQUESTED',
        },
      },
      { upsert: true, new: true }
    );
    if (job && job.status === 'INVITED') {
      assertJobTransition(job.status as ContractorJobStatus, 'QUOTE_REQUESTED');
      job.status = 'QUOTE_REQUESTED';
      await job.save();
    }
    created.push(invitation);
    let recipientId = contractor.userId ? String(contractor.userId) : '';
    if (!recipientId && isDeliverableEmail(contractor.email)) {
      const matched = await User.findOne({ email: contractor.email.toLowerCase() }).select('_id').lean();
      if (matched) recipientId = String(matched._id);
    }
    if (!recipientId) {
      notificationWarnings.push(`${contractor.companyName} has no contractor portal account, so the request was saved without an in-portal notification.`);
      logger.warn('Job request saved without a portal recipient', { contractorId: String(contractor._id), requestId: params.requestId });
      continue;
    }
    try {
      await rememberContractorPhone(recipientId, contractor.phone);
      await notifyEvent({
        recipientId,
        companyId: params.companyId,
        eventType: 'QUOTE_REQUESTED',
        email: contractor.email,
        link: portalLink,
        variables: {
          maintenanceDescription: request.title || 'Maintenance request',
          propertyName: property?.name || 'the property',
          propertyReference: property?.name || String(request._id),
          propertyLocation: property?.address || 'Available in the portal after sign-in',
          submittedAt,
          portalLink,
        },
        idempotencyKey: `quote-invite:${invitation?._id}`,
      });
    } catch (error: any) {
      notificationWarnings.push(`The job request for ${contractor.companyName} was saved, but the notification could not be sent.`);
      logger.warn('Job request notification failed', { contractorId: String(contractor._id), message: error?.message });
    }
  }

  await setWorkflowStatus(request, 'QUOTE_REQUESTED');
  await ecosystemAudit({
    req: params.req,
    actor: params.actorId,
    action: 'CONTRACTOR_INVITED',
    entity: 'MaintenanceRequest',
    entityId: params.requestId,
    metadata: { contractorIds: params.contractorIds },
  });
  return { request, invitations: created, notificationWarnings };
}

export async function submitQuote(params: {
  requestId: string;
  contractorUserId: string;
  description: string;
  lineItems: Array<{ description: string; quantity: number; unitCost: number }>;
  estimatedDuration?: string;
  estimatedStartDate?: Date;
  validUntil?: Date;
  notes?: string;
  attachments?: any[];
  req?: any;
}) {
  const contractor = await MaintenanceContractor.findOne({ userId: params.contractorUserId });
  if (!contractor) throw new AppError('Contractor profile not found', 404, 'NOT_FOUND');
  const invitation = await QuoteInvitation.findOne({ requestId: params.requestId, contractorId: contractor._id });
  if (!invitation) throw new AppError('You were not invited to quote for this job', 403, 'FORBIDDEN');

  const existing = await MaintenanceQuote.findOne({
    requestId: params.requestId,
    contractorId: contractor._id,
    status: { $in: ['OWNER_APPROVED'] },
  });
  if (existing) assertQuoteNotLocked(existing.status);

  const lineItems = (params.lineItems || []).map((item) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitCost: Number(item.unitCost),
    total: Number(item.quantity) * Number(item.unitCost),
  }));
  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);

  const previous = await MaintenanceQuote.findOne({ requestId: params.requestId, contractorId: contractor._id }).sort({ version: -1 });
  if (previous) assertQuoteNotLocked(previous.status);
  const version = previous ? (previous.version || 1) + 1 : 1;

  const quote = await MaintenanceQuote.create({
    requestId: params.requestId,
    companyId: invitation.companyId,
    contractorId: contractor._id,
    propertyId: invitation.propertyId,
    amount: subtotal,
    description: params.description,
    submittedDate: new Date(),
    submittedBy: params.contractorUserId,
    createdBy: params.contractorUserId,
    lineItems,
    subtotal,
    tax: 0,
    total: subtotal,
    currency: 'USD',
    estimatedDuration: params.estimatedDuration,
    estimatedStartDate: params.estimatedStartDate,
    validUntil: params.validUntil,
    attachments: params.attachments,
    notes: params.notes,
    status: 'SUBMITTED',
    version,
    parentQuoteId: previous?._id,
    submittedAt: new Date(),
  });

  invitation.status = 'SUBMITTED';
  await invitation.save();

  const job = await ContractorJobRecord.findOne({ requestId: params.requestId, contractorId: contractor._id });
  if (job) {
    assertJobTransition(job.status as ContractorJobStatus, 'QUOTE_SUBMITTED');
    job.status = 'QUOTE_SUBMITTED';
    job.quoteId = quote._id as any;
    await job.save();
  }

  const request = await loadRequest(params.requestId);
  await setWorkflowStatus(request, 'QUOTE_RECEIVED');
  await ecosystemAudit({
    req: params.req,
    actor: params.contractorUserId,
    action: 'QUOTE_SUBMITTED',
    entity: 'MaintenanceQuote',
    entityId: String(quote._id),
    newState: { version, total: subtotal },
  });
  const property = await Property.findById(invitation.propertyId).select('name').lean();
  await notifyCompanyStaff(
    String(invitation.companyId),
    'QUOTE_RECEIVED',
    {
      contractorName: contractor.companyName || 'Contractor',
      quoteAmount: String(subtotal),
      propertyName: property?.name || 'the property',
    },
    `quote-received:${quote._id}`
  );
  return quote;
}

export async function listQuotesForAgent(requestId: string, companyId: string) {
  const quotes = await MaintenanceQuote.find({ requestId, companyId })
    .populate('contractorId', 'companyName trade rating verificationStatus')
    .sort({ total: 1, amount: 1 })
    .lean();
  return quotes.map((q: any) => ({
    ...q,
    amount: q.total ?? q.amount,
    duration: q.estimatedDuration,
    rating: q.contractorId?.rating,
  }));
}

export async function listQuotesForContractor(requestId: string, contractorUserId: string) {
  const contractor = await MaintenanceContractor.findOne({ userId: contractorUserId });
  if (!contractor) throw new AppError('Contractor profile not found', 404, 'NOT_FOUND');
  return MaintenanceQuote.find({ requestId, contractorId: contractor._id }).lean();
}

export async function selectQuote(params: {
  requestId: string;
  companyId: string;
  actorId: string;
  quoteId: string;
  reason?: string;
  req?: any;
}) {
  const request = await loadRequest(params.requestId, params.companyId);
  const current = workflowStatus(request);
  if (!['QUOTE_RECEIVED', 'QUOTE_REQUESTED', 'UNDER_REVIEW'].includes(current)) {
    throw new AppError('Quotes can only be selected while they are under review', 409, 'INVALID_STATE_TRANSITION');
  }

  const quote = await MaintenanceQuote.findOneAndUpdate(
    {
      _id: params.quoteId,
      requestId: params.requestId,
      companyId: params.companyId,
      status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'] },
    },
    { $set: { status: 'SELECTED', reviewedAt: new Date() } },
    { new: true }
  );
  if (!quote) throw new AppError('Quote not found or already selected', 409, 'INVALID_STATE_TRANSITION');
  if (params.reason) {
    quote.notes = [quote.notes, params.reason].filter(Boolean).join('\n');
    await quote.save();
  }

  await MaintenanceQuote.updateMany(
    { requestId: params.requestId, companyId: params.companyId, _id: { $ne: quote._id }, status: 'SELECTED' },
    { $set: { status: 'SUBMITTED' } }
  );

  request.ecosystemWorkflow = {
    ...(request.ecosystemWorkflow || {}),
    selectedQuoteId: quote._id as any,
  };
  await request.save();

  const job = await ContractorJobRecord.findOne({ requestId: params.requestId, contractorId: quote.contractorId });
  if (job) {
    job.status = 'SELECTED';
    job.quoteId = quote._id as any;
    await job.save();
  }

  await ecosystemAudit({
    req: params.req,
    actor: params.actorId,
    action: 'QUOTE_SELECTED',
    entity: 'MaintenanceQuote',
    entityId: String(quote._id),
    metadata: { reason: params.reason },
  });
  return quote;
}

export async function sendQuoteToOwner(params: {
  requestId: string;
  companyId: string;
  actorId: string;
  req?: any;
}) {
  const request = await loadRequest(params.requestId, params.companyId);
  const quoteId = request.ecosystemWorkflow?.selectedQuoteId;
  if (!quoteId) throw new AppError('Select a quote before sending it to the owner', 400, 'QUOTE_NOT_SELECTED');
  const quote = await MaintenanceQuote.findOneAndUpdate(
    { _id: quoteId, status: 'SELECTED' },
    { $set: { status: 'SENT_TO_OWNER' } },
    { new: true }
  );
  if (!quote) throw new AppError('Selected quote is not ready to send to the owner', 409, 'INVALID_STATE_TRANSITION');
  await setWorkflowStatus(request, 'OWNER_APPROVAL');

  const property = await Property.findById(request.propertyId).select('name propertyOwnerId').lean();
  const owner = property?.propertyOwnerId
    ? await PropertyOwner.findById(property.propertyOwnerId).select('email').lean()
    : null;
  const ownerUser = owner?.email ? await User.findOne({ email: owner.email, role: { $in: ['owner'] } }).select('_id').lean() : null;
  if (ownerUser) {
    await notifyEvent({
      recipientId: String(ownerUser._id),
      companyId: params.companyId,
      eventType: 'QUOTE_SENT_TO_OWNER',
      variables: {
        quoteAmount: String(quote.total ?? quote.amount),
        propertyName: property?.name || 'the property',
      },
      idempotencyKey: `quote-owner:${quote._id}:${quote.version}`,
    });
  }

  await ecosystemAudit({
    req: params.req,
    actor: params.actorId,
    action: 'QUOTE_SENT_TO_OWNER',
    entity: 'MaintenanceQuote',
    entityId: String(quote._id),
    metadata: { version: quote.version },
  });
  return { request, quote };
}

export async function ownerDecideQuote(params: {
  requestId: string;
  ownerUserId: string;
  decision: OwnerDecision;
  comment?: string;
  req?: any;
}) {
  const request = await loadRequest(params.requestId);
  const property = await Property.findById(request.propertyId).select('propertyOwnerId companyId name ownerId').lean();
  if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
  await assertOwnerCanActOnProperty({
    actorUserId: params.ownerUserId,
    property,
    requestCompanyId: request.companyId,
  });

  const quoteId = request.ecosystemWorkflow?.selectedQuoteId;
  if (!quoteId) throw new AppError('No quote has been sent for approval', 400, 'QUOTE_NOT_SELECTED');
  const quote = await MaintenanceQuote.findById(quoteId);
  if (!quote) throw new AppError('Quote not found', 404, 'NOT_FOUND');
  if (quote.status !== 'SENT_TO_OWNER') {
    throw new AppError('This quote is not awaiting owner approval', 409, 'INVALID_STATE_TRANSITION');
  }

  const existing = await OwnerQuoteDecision.findOne({ quoteId: quote._id, quoteVersion: quote.version || 1, ownerUserId: params.ownerUserId });
  if (existing) return { decision: existing, quote, request };

  let decision;
  try {
    decision = await OwnerQuoteDecision.create({
      requestId: request._id,
      companyId: request.companyId,
      quoteId: quote._id,
      quoteVersion: quote.version || 1,
      ownerUserId: params.ownerUserId,
      decision: params.decision,
      comment: params.comment,
      decidedAt: new Date(),
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const dup = await OwnerQuoteDecision.findOne({ quoteId: quote._id, quoteVersion: quote.version || 1, ownerUserId: params.ownerUserId });
      if (dup) return { decision: dup, quote, request };
    }
    throw error;
  }

  const ownerUserDoc = await User.findById(params.ownerUserId).select('firstName lastName').lean();
  const ownerName = `${ownerUserDoc?.firstName || ''} ${ownerUserDoc?.lastName || ''}`.trim() || 'Owner';

  if (params.decision === 'APPROVE') {
    const updatedQuote = await MaintenanceQuote.findOneAndUpdate(
      { _id: quote._id, status: 'SENT_TO_OWNER' },
      { $set: { status: 'OWNER_APPROVED', approvedAt: new Date() } },
      { new: true }
    );
    if (!updatedQuote) throw new AppError('This quote is no longer awaiting owner approval', 409, 'INVALID_STATE_TRANSITION');
    quote.status = 'OWNER_APPROVED';
    await setWorkflowStatus(request, 'APPROVED', {
      approvedQuoteId: quote._id,
      ownerApprovalId: decision._id,
    });
  } else {
    const nextQuoteStatus = params.decision === 'DECLINE' ? 'OWNER_DECLINED' : 'UNDER_REVIEW';
    const updatedQuote = await MaintenanceQuote.findOneAndUpdate(
      { _id: quote._id, status: 'SENT_TO_OWNER' },
      { $set: { status: nextQuoteStatus, declinedAt: new Date() } },
      { new: true }
    );
    if (!updatedQuote) throw new AppError('This quote is no longer awaiting owner approval', 409, 'INVALID_STATE_TRANSITION');
    quote.status = nextQuoteStatus;
    await setWorkflowStatus(request, params.decision === 'DECLINE' ? 'DECLINED' : 'QUOTE_REQUESTED');
  }

  await ecosystemAudit({
    req: params.req,
    actor: params.ownerUserId,
    action: params.decision === 'APPROVE' ? 'OWNER_APPROVED_QUOTE' : params.decision === 'DECLINE' ? 'OWNER_DECLINED_QUOTE' : 'OWNER_REQUESTED_CHANGES',
    entity: 'OwnerQuoteDecision',
    entityId: String(decision._id),
    previousState: { quoteStatus: 'SENT_TO_OWNER', quoteVersion: quote.version },
    newState: { quoteStatus: quote.status, decision: params.decision },
    metadata: { quoteId: String(quote._id), quoteVersion: quote.version, decision: params.decision, comment: params.comment },
  });

  await notifyCompanyStaff(
    String(request.companyId),
    params.decision === 'APPROVE' ? 'OWNER_QUOTE_APPROVED' : 'OWNER_QUOTE_DECLINED',
    { ownerName, propertyName: property.name || 'the property' },
    `owner-decision:${decision._id}`
  );

  return { decision, quote, request };
}

export async function authoriseWork(params: {
  requestId: string;
  companyId: string;
  actorId: string;
  req?: any;
}) {
  const request = await loadRequest(params.requestId, params.companyId);
  const company = await Company.findById(params.companyId).select('featureFlags').lean();
  const needsOwner = ownerApprovalRequired(company as any);
  const approvedQuoteId = request.ecosystemWorkflow?.approvedQuoteId;
  const ownerApprovalId = request.ecosystemWorkflow?.ownerApprovalId;
  if (needsOwner && (!approvedQuoteId || !ownerApprovalId)) {
    throw new AppError('Owner approval is required before authorising work', 403, 'WORK_NOT_AUTHORISED');
  }
  const quote = await MaintenanceQuote.findById(approvedQuoteId || request.ecosystemWorkflow?.selectedQuoteId);
  if (!quote) throw new AppError('Approved quote not found', 404, 'NOT_FOUND');
  if (needsOwner && quote.status !== 'OWNER_APPROVED') {
    throw new AppError('Cannot authorise work without an owner-approved quote', 403, 'WORK_NOT_AUTHORISED');
  }

  let job = await ContractorJobRecord.findOne({ requestId: request._id, contractorId: quote.contractorId });
  if (!job) {
    job = await ContractorJobRecord.create({
      requestId: request._id,
      companyId: params.companyId,
      propertyId: request.propertyId,
      contractorId: quote.contractorId,
      quoteId: quote._id,
      status: 'SELECTED',
    });
  }
  assertJobTransition(job.status as ContractorJobStatus, 'AUTHORISED');
  job.status = 'AUTHORISED';
  job.authorisedBy = params.actorId as any;
  job.authorisedAt = new Date();
  job.ownerApprovalId = ownerApprovalId as any;
  job.quoteId = quote._id as any;
  await job.save();

  await setWorkflowStatus(request, 'AUTHORISED', {
    authorisedBy: params.actorId,
    authorisedAt: new Date(),
    contractorJobId: job._id,
  });
  request.contractorId = quote.contractorId as any;
  await request.save();

  const contractor = await MaintenanceContractor.findById(quote.contractorId);
  if (contractor?.userId) {
    const property = await Property.findById(request.propertyId).select('name').lean();
    await notifyEvent({
      recipientId: String(contractor.userId),
      companyId: params.companyId,
      eventType: 'CONTRACTOR_AUTHORISED',
      variables: { propertyName: property?.name || 'the property', contractorName: contractor.companyName },
      idempotencyKey: `job-auth:${job._id}`,
    });
  }

  await ecosystemAudit({
    req: params.req,
    actor: params.actorId,
    action: 'AGENT_AUTHORISED_WORK',
    entity: 'ContractorJobRecord',
    entityId: String(job._id),
    metadata: { approvedQuoteId: String(quote._id), ownerApprovalId: String(ownerApprovalId || '') },
  });
  return { request, job };
}

export async function contractorUpdateJob(params: {
  jobId: string;
  contractorUserId: string;
  status: ContractorJobStatus;
  scheduledAt?: Date;
  completion?: {
    notes?: string;
    photos?: any[];
    actualCompletionDate?: Date;
    materialsUsed?: string;
    additionalCosts?: number;
    invoiceUrl?: string;
  };
  req?: any;
}) {
  const contractor = await MaintenanceContractor.findOne({ userId: params.contractorUserId });
  if (!contractor) throw new AppError('Contractor profile not found', 404, 'NOT_FOUND');
  const job = await ContractorJobRecord.findOne({ _id: params.jobId, contractorId: contractor._id });
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND');

  const previous = job.status;
  const next = params.status;
  const company = await Company.findById(job.companyId).select('featureFlags').lean();
  const needsOwner = ownerApprovalRequired(company as any);
  if (['ACCEPTED', 'SCHEDULED', 'WORK_IN_PROGRESS', 'COMPLETED'].includes(next)) {
    assertWorkMayStart({
      ownerApproved: needsOwner ? Boolean(job.ownerApprovalId) : true,
      agentAuthorised: Boolean(job.authorisedBy && job.authorisedAt),
      status: next,
    });
  }
  assertJobTransition(job.status as ContractorJobStatus, next);
  job.status = next;
  if (params.scheduledAt) job.scheduledAt = params.scheduledAt;
  if (params.completion) {
    if ((params.completion.additionalCosts || 0) > 0) {
      await MaintenanceChangeOrder.create({
        requestId: job.requestId,
        jobId: job._id,
        companyId: job.companyId,
        originalQuoteId: job.quoteId,
        requestedAmount: params.completion.additionalCosts,
        description: params.completion.notes || 'Additional costs requested',
        status: 'REQUESTED',
      });
      // Additional cost is a change order. It does not mutate the original approved quote.
    }
    job.completionNotes = params.completion.notes;
    job.completionPhotos = params.completion.photos;
    job.actualCompletionDate = params.completion.actualCompletionDate;
    job.materialsUsed = params.completion.materialsUsed;
    job.invoiceUrl = params.completion.invoiceUrl;
  }
  await job.save();

  if (next === 'CANCELLED' && (previous === 'INVITED' || previous === 'QUOTE_REQUESTED')) {
    await QuoteInvitation.updateOne(
      { requestId: job.requestId, contractorId: contractor._id, status: 'INVITED' },
      { $set: { status: 'WITHDRAWN' } }
    );
  }

  const request = await loadRequest(String(job.requestId));
  const map: Record<string, EcosystemMaintenanceStatus> = {
    ACCEPTED: 'AUTHORISED',
    SCHEDULED: 'SCHEDULED',
    WORK_IN_PROGRESS: 'WORK_IN_PROGRESS',
    COMPLETED: 'COMPLETED',
  };
  if (map[next]) await setWorkflowStatus(request, map[next]);

  if (next === 'COMPLETED') {
    const tenantUserId = request.requestedBy;
    const property = await Property.findById(request.propertyId).select('name').lean();
    await notifyEvent({
      recipientId: String(tenantUserId),
      companyId: String(job.companyId),
      eventType: 'WORK_COMPLETED',
      variables: { propertyName: property?.name || 'the property' },
      idempotencyKey: `work-complete:${job._id}`,
    });
    await notifyCompanyStaff(
      String(job.companyId),
      'WORK_COMPLETED',
      { propertyName: property?.name || 'the property' },
      `work-complete:${job._id}:staff`
    );
    await ecosystemAudit({
      req: params.req,
      actor: params.contractorUserId,
      action: 'WORK_COMPLETED',
      entity: 'ContractorJobRecord',
      entityId: String(job._id),
    });
  }
  return job;
}

export async function tenantConfirmMaintenance(params: {
  requestId: string;
  tenantUserId: string;
  confirm: boolean;
  comment?: string;
  req?: any;
}) {
  const request = await loadRequest(params.requestId);
  if (String(request.requestedBy) !== params.tenantUserId) {
    throw new AppError('You can only confirm your own maintenance request', 403, 'FORBIDDEN');
  }
  if (params.confirm) {
    await setWorkflowStatus(request, 'TENANT_CONFIRMATION', { tenantConfirmedAt: new Date() });
    await setWorkflowStatus(request, 'CLOSED');
    await ecosystemAudit({
      req: params.req,
      actor: params.tenantUserId,
      action: 'TENANT_CONFIRMED',
      entity: 'MaintenanceRequest',
      entityId: params.requestId,
    });
  } else {
    await setWorkflowStatus(request, 'REOPENED');
    await ecosystemAudit({
      req: params.req,
      actor: params.tenantUserId,
      action: 'MAINTENANCE_REOPENED',
      entity: 'MaintenanceRequest',
      entityId: params.requestId,
      metadata: { comment: params.comment },
    });
    const property = await Property.findById(request.propertyId).select('name').lean();
    await notifyEvent({
      recipientId: String(request.requestedBy),
      companyId: String(request.companyId),
      eventType: 'MAINTENANCE_REOPENED',
      variables: { propertyName: property?.name || 'the property' },
      idempotencyKey: `maint-reopen:${request._id}:${Date.now()}`,
    });
  }
  return request;
}

export async function submitRating(params: {
  jobId: string;
  raterUserId: string;
  raterRole: 'tenant' | 'owner' | 'agent' | 'admin';
  scores: { quality: number; professionalism: number; timeliness: number; communication: number; overall: number };
  comment?: string;
}) {
  const job = await ContractorJobRecord.findById(params.jobId);
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND');
  if (!['COMPLETED', 'CLOSED'].includes(job.status)) {
    throw new AppError('Ratings are only allowed after the job is completed', 400, 'JOB_NOT_COMPLETED');
  }
  if (String(job.contractorId) === params.raterUserId) {
    throw new AppError('You cannot rate your own account', 403, 'FORBIDDEN');
  }
  const contractor = await MaintenanceContractor.findById(job.contractorId);
  if (contractor?.userId && String(contractor.userId) === params.raterUserId) {
    throw new AppError('You cannot rate your own account', 403, 'FORBIDDEN');
  }

  const request = await loadRequest(String(job.requestId));
  const property = await Property.findById(request.propertyId).select('propertyOwnerId ownerId companyId').lean();
  const raterUser = await User.findById(params.raterUserId).select('email role roles companyId').lean();
  let permitted = false;
  if (params.raterRole === 'tenant') {
    permitted = String(request.requestedBy) === params.raterUserId;
  } else if (params.raterRole === 'agent' || params.raterRole === 'admin') {
    permitted = String(raterUser?.companyId || '') === String(job.companyId);
  } else if (params.raterRole === 'owner') {
    const ownerRecord = raterUser?.email
      ? await PropertyOwner.findOne({ email: raterUser.email }).select('_id').lean()
      : null;
    permitted =
      String(property?.ownerId || '') === params.raterUserId ||
      Boolean(ownerRecord && String(ownerRecord._id) === String(property?.propertyOwnerId));
  }
  if (!permitted) {
    throw new AppError('You can only rate contractors for jobs you participated in', 403, 'FORBIDDEN');
  }

  try {
    const rating = await Rating.create({
      companyId: job.companyId,
      raterUserId: params.raterUserId,
      rateeUserId: contractor?.userId,
      contractorId: job.contractorId,
      jobId: job._id,
      raterRole: params.raterRole,
      ...params.scores,
      comment: params.comment,
    });
    if (contractor) {
      const all = await Rating.find({ contractorId: contractor._id }).select('overall').lean();
      const avg = all.reduce((s, r) => s + r.overall, 0) / all.length;
      contractor.rating = Math.round(avg * 10) / 10;
      await contractor.save();
    }
    return rating;
  } catch (error: any) {
    if (error?.code === 11000) throw new AppError('You have already rated this job', 409, 'DUPLICATE_RATING');
    throw error;
  }
}

export async function createTenantReference(params: {
  companyId: string;
  actorId: string;
  leaseId: string;
  payload: Record<string, any>;
}) {
  const lease = await Lease.findOne({ _id: params.leaseId, companyId: params.companyId });
  if (!lease) throw new AppError('Lease not found', 404, 'NOT_FOUND');
  if (!['expired', 'terminated', 'closed', 'pending_settlement'].includes(lease.status)) {
    throw new AppError('References can be created after the tenancy has ended', 400, 'LEASE_ACTIVE');
  }
  try {
    return await TenantReference.create({
      companyId: params.companyId,
      tenantId: lease.tenantId,
      leaseId: lease._id,
      propertyId: lease.propertyId,
      createdBy: params.actorId,
      ...params.payload,
    });
  } catch (error: any) {
    if (error?.code === 11000) throw new AppError('A reference already exists for this lease', 409, 'DUPLICATE_REFERENCE');
    throw error;
  }
}

export async function requestChangeOrder(params: {
  jobId: string;
  contractorUserId: string;
  requestedAmount: number;
  description: string;
  req?: any;
}) {
  const contractor = await MaintenanceContractor.findOne({ userId: params.contractorUserId });
  if (!contractor) throw new AppError('Contractor profile not found', 404, 'NOT_FOUND');
  const job = await ContractorJobRecord.findOne({ _id: params.jobId, contractorId: contractor._id });
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND');
  if (!job.quoteId) throw new AppError('No original quote to attach a change order to', 400, 'VALIDATION_ERROR');
  const original = await MaintenanceQuote.findById(job.quoteId).select('amount total status').lean();
  if (!original || original.status !== 'OWNER_APPROVED') {
    throw new AppError('Change orders require an owner-approved original quote', 400, 'QUOTE_NOT_APPROVED');
  }
  const changeOrder = await MaintenanceChangeOrder.create({
    requestId: job.requestId,
    jobId: job._id,
    companyId: job.companyId,
    originalQuoteId: job.quoteId,
    requestedAmount: Number(params.requestedAmount),
    description: params.description,
    status: 'REQUESTED',
  });
  await ecosystemAudit({
    req: params.req,
    actor: params.contractorUserId,
    action: 'CHANGE_ORDER_REQUESTED',
    entity: 'MaintenanceChangeOrder',
    entityId: String(changeOrder._id),
    metadata: { originalAmount: original.total ?? original.amount, requestedAmount: params.requestedAmount },
  });
  await notifyCompanyStaff(
    String(job.companyId),
    'QUOTE_RECEIVED',
    { contractorName: contractor.companyName, quoteAmount: String(params.requestedAmount), propertyName: 'maintenance change order' },
    `change-order:${changeOrder._id}:requested`
  );
  return { changeOrder, originalQuoteAmount: original.total ?? original.amount };
}

export async function agentReviewChangeOrder(params: {
  changeOrderId: string;
  companyId: string;
  actorId: string;
  req?: any;
}) {
  const changeOrder = await MaintenanceChangeOrder.findOne({ _id: params.changeOrderId, companyId: params.companyId });
  if (!changeOrder) throw new AppError('Change order not found', 404, 'NOT_FOUND');
  if (changeOrder.status !== 'REQUESTED') {
    throw new AppError('Change order is not awaiting agent review', 409, 'INVALID_STATE_TRANSITION');
  }
  changeOrder.status = 'AGENT_REVIEW';
  changeOrder.agentReviewedBy = params.actorId as any;
  await changeOrder.save();
  await ecosystemAudit({
    req: params.req,
    actor: params.actorId,
    action: 'CHANGE_ORDER_AGENT_REVIEW',
    entity: 'MaintenanceChangeOrder',
    entityId: String(changeOrder._id),
    previousState: { status: 'REQUESTED' },
    newState: { status: 'AGENT_REVIEW' },
  });
  return changeOrder;
}

export async function ownerDecideChangeOrder(params: {
  changeOrderId: string;
  ownerUserId: string;
  decision: 'APPROVE' | 'DECLINE';
  comment?: string;
  req?: any;
}) {
  const changeOrder = await MaintenanceChangeOrder.findById(params.changeOrderId);
  if (!changeOrder) throw new AppError('Change order not found', 404, 'NOT_FOUND');
  if (changeOrder.status !== 'AGENT_REVIEW') {
    throw new AppError('Owner can only decide after agent review', 409, 'INVALID_STATE_TRANSITION');
  }
  const request = await loadRequest(String(changeOrder.requestId));
  const property = await Property.findById(request.propertyId).select('propertyOwnerId ownerId name companyId').lean();
  await assertOwnerCanActOnProperty({
    actorUserId: params.ownerUserId,
    property,
    requestCompanyId: request.companyId,
  });

  const previous = changeOrder.status;
  changeOrder.status = params.decision === 'APPROVE' ? 'OWNER_APPROVED' : 'OWNER_DECLINED';
  changeOrder.ownerDecision = params.decision;
  changeOrder.ownerDecidedBy = params.ownerUserId as any;
  await changeOrder.save();

  const original = await MaintenanceQuote.findById(changeOrder.originalQuoteId).select('amount total').lean();
  await ecosystemAudit({
    req: params.req,
    actor: params.ownerUserId,
    action: params.decision === 'APPROVE' ? 'CHANGE_ORDER_APPROVED' : 'CHANGE_ORDER_DECLINED',
    entity: 'MaintenanceChangeOrder',
    entityId: String(changeOrder._id),
    previousState: { status: previous, originalAmount: original?.total ?? original?.amount },
    newState: { status: changeOrder.status, additionalAmount: changeOrder.requestedAmount, comment: params.comment },
  });
  await notifyCompanyStaff(
    String(changeOrder.companyId),
    params.decision === 'APPROVE' ? 'OWNER_QUOTE_APPROVED' : 'OWNER_QUOTE_DECLINED',
    { ownerName: 'Owner', propertyName: property?.name || 'the property' },
    `change-order:${changeOrder._id}:${params.decision}`
  );
  return { changeOrder, originalQuoteAmount: original?.total ?? original?.amount, additionalApproved: params.decision === 'APPROVE' ? changeOrder.requestedAmount : 0 };
}

export async function createMaintenanceInspection(params: {
  companyId: string;
  actorId: string;
  requestId: string;
  checklist?: any[];
  notes?: string;
}) {
  const request = await loadRequest(params.requestId, params.companyId);
  return Inspection.create({
    propertyId: request.propertyId,
    companyId: params.companyId,
    ownerId: params.actorId,
    scheduledDate: new Date(),
    type: 'maintenance',
    status: 'completed',
    notes: params.notes,
    checklist: params.checklist || [],
    sourceMaintenanceRequestId: request._id,
    generatedBy: 'manual',
    frequency: 'ad_hoc',
  });
}

export async function acknowledgeInspection(params: {
  inspectionId: string;
  userId: string;
  role: 'tenant' | 'owner' | 'agent';
  signature: string;
}) {
  const inspection = await Inspection.findById(params.inspectionId);
  if (!inspection) throw new AppError('Inspection not found', 404, 'NOT_FOUND');
  inspection.report = inspection.report || {};
  if ((inspection.report as any).acknowledgedLocked) {
    throw new AppError('This inspection acknowledgement is locked', 409, 'INSPECTION_LOCKED');
  }
  if (params.role === 'tenant') {
    if ((inspection.report as any).tenantSignature) {
      throw new AppError('Tenant has already acknowledged this inspection', 409, 'ALREADY_ACKNOWLEDGED');
    }
    const tenants = await Tenant.find({ userId: params.userId }).select('_id').lean();
    const tenantIds = tenants.map((t) => String(t._id));
    if (inspection.tenantId && !tenantIds.includes(String(inspection.tenantId))) {
      throw new AppError('You can only acknowledge your own inspection', 403, 'FORBIDDEN');
    }
    (inspection.report as any).tenantSignature = params.signature;
    (inspection.report as any).tenantAcknowledgedAt = new Date();
  } else {
    if ((inspection.report as any).agentSignature) {
      throw new AppError('This inspection has already been acknowledged', 409, 'ALREADY_ACKNOWLEDGED');
    }
    (inspection.report as any).agentSignature = params.signature;
    (inspection.report as any).agentAcknowledgedAt = new Date();
  }
  if ((inspection.report as any).tenantSignature && (inspection.report as any).agentSignature) {
    (inspection.report as any).acknowledgedLocked = true;
    (inspection.report as any).lockedAt = new Date();
  }
  inspection.markModified('report');
  await inspection.save();
  return inspection;
}
