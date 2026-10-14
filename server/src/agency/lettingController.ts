import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import { PaymentRequest } from '../models/PaymentRequest';
import { MaintenanceQuote } from '../models/MaintenanceQuote';
import { LevyPayment } from '../models/LevyPayment';
import { RentalApplication } from '../ecosystem/models/tenantFacing';
import { ViewingRequest } from '../ecosystem/models/tenantFacing';
import { ContractorJobRecord, MaintenanceChangeOrder } from '../ecosystem/models/maintenanceWorkflow';
import { assertApplicationTransition } from '../ecosystem/workflowMachine';
import { ApplicationStatus } from '../ecosystem/constants';
import { AgencyWorkflowEvent, ListingReference, PropertyAssessment, RentalMandate } from './lettingModels';
import { callerCanAccessProperty, propertyIdsForCaller } from '../utils/propertyAccess';
import { notifyLandlord, notifyOnce, notifyPropertyAgent } from './workflowNotify';
import {
  assertAssessmentTransition,
  assertMandateTransition,
  classifyRentCollection,
  leaseActivationBlockers,
  listingBlockers,
  maintenanceRequestBlockers,
  nextAgencyAction,
  AssessmentStatus,
  MandateStatus,
} from './lettingWorkflow';

function companyId(req: AuthRequest): string | null {
  const id = (req.user as any)?.companyId || (req.user as any)?.company;
  return id ? String(id) : null;
}

function actorId(req: AuthRequest): string | undefined {
  return (req.user as any)?.userId || (req.user as any)?._id;
}

function roles(req: AuthRequest): string[] {
  const user = req.user as any;
  const listed = Array.isArray(user?.roles) ? user.roles.filter(Boolean).map(String) : [];
  const primary = user?.role ? [String(user.role)] : [];
  return Array.from(new Set([...listed, ...primary]));
}

function isSenior(req: AuthRequest): boolean {
  return roles(req).some((role) => role === 'admin' || role === 'principal' || role === 'prea' || role === 'accountant');
}

function isOwnerRole(req: AuthRequest): boolean {
  return (req.user as any)?.role === 'owner';
}

async function audit(company: string, req: AuthRequest, action: string, entityType: string, entityId: string, previousState?: string, newState?: string, reason?: string, propertyId?: string) {
  await AgencyWorkflowEvent.create({
    companyId: company,
    propertyId,
    actorId: actorId(req),
    action,
    entityType,
    entityId,
    previousState,
    newState,
    reason,
  });
}

async function propertyInCompany(req: AuthRequest, propertyId: string, company: string) {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) return null;
  if (!(await callerCanAccessProperty(req, propertyId))) return null;
  return Property.findOne({ _id: propertyId, companyId: company }).select('name ownerId propertyOwnerId agentId rent status companyId').lean();
}

async function landlordMayDecide(req: AuthRequest, propertyId: string, company: string): Promise<boolean> {
  if (!isOwnerRole(req)) return false;
  if (!(await callerCanAccessProperty(req, propertyId))) return false;
  const user = await User.findById(actorId(req)).select('email companyId role').lean();
  if (!user || String(user.companyId) !== String(company) || user.role !== 'owner' || !user.email) return false;
  const property = await Property.findOne({ _id: propertyId, companyId: company }).select('propertyOwnerId').lean();
  if (!property) return false;
  const owner = property.propertyOwnerId
    ? await PropertyOwner.findOne({ _id: property.propertyOwnerId, companyId: company }).select('email').lean()
    : await PropertyOwner.findOne({ companyId: company, properties: propertyId }).select('email').lean();
  if (!owner?.email) return false;
  return String(owner.email).toLowerCase() === String(user.email).toLowerCase();
}

async function landlordIdForProperty(company: string, property: { _id: unknown; propertyOwnerId?: unknown }) {
  if (property.propertyOwnerId) return property.propertyOwnerId;
  const owner = await PropertyOwner.findOne({ companyId: company, properties: property._id }).select('_id').lean();
  return owner?._id;
}

async function gateAssessment(company: string, propertyId: unknown) {
  const approved = await PropertyAssessment.findOne({ companyId: company, propertyId, status: 'OWNER_APPROVED' }).sort({ updatedAt: -1 }).lean();
  if (approved) return approved;
  return PropertyAssessment.findOne({ companyId: company, propertyId }).sort({ updatedAt: -1 }).lean();
}

async function gateMandate(company: string, propertyId: unknown) {
  const signed = await RentalMandate.findOne({ companyId: company, propertyId, status: 'SIGNED' }).sort({ updatedAt: -1 }).lean();
  if (signed) return signed;
  return RentalMandate.findOne({ companyId: company, propertyId }).sort({ updatedAt: -1 }).lean();
}

async function completedDepositReceived(company: string, leaseId: mongoose.Types.ObjectId): Promise<number> {
  const payments = await Payment.find({
    companyId: company,
    leaseId,
    status: 'completed',
    depositAmount: { $gt: 0 },
  }).select('_id depositAmount reversalOfPaymentId').lean();
  const ids = payments.map((row: any) => row._id);
  const reversals = ids.length
    ? await Payment.find({ companyId: company, reversalOfPaymentId: { $in: ids } }).select('reversalOfPaymentId').lean()
    : [];
  const reversed = new Set(reversals.map((row: any) => String(row.reversalOfPaymentId)));
  return payments
    .filter((row: any) => !row.reversalOfPaymentId && !reversed.has(String(row._id)))
    .reduce((sum, row: any) => sum + Number(row.depositAmount || 0), 0);
}

function paymentMatchesLease(payment: any, lease: any): boolean {
  if (payment.leaseId) return String(payment.leaseId) === String(lease._id);
  return Boolean(payment.tenantId)
    && String(payment.propertyId) === String(lease.propertyId)
    && String(payment.tenantId) === String(lease.tenantId);
}

export async function buildRentBoardRows(req: AuthRequest, company: string) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const visibleIds = await propertyIdsForCaller(req);
  const leaseQuery: any = { companyId: company, status: 'active' };
  if (visibleIds !== 'company') leaseQuery.propertyId = { $in: visibleIds };
  const leases = await Lease.find(leaseQuery).select('propertyId tenantId rentAmount depositAmount rentDueDay').limit(200).lean();
  const propertyIds = leases.map((lease) => lease.propertyId);
  const payments = await Payment.find({
    companyId: company,
    propertyId: { $in: propertyIds },
    status: 'completed',
    rentalPeriodMonth: month,
    rentalPeriodYear: year,
    paymentType: { $in: ['rental', 'introduction'] },
  }).select('propertyId tenantId leaseId amount currency paymentDate reversalOfPaymentId').lean();
  const paymentIds = payments.map((row: any) => row._id);
  const reversalRows = paymentIds.length
    ? await Payment.find({ companyId: company, reversalOfPaymentId: { $in: paymentIds } }).select('reversalOfPaymentId').lean()
    : [];
  const reversed = new Set(reversalRows.map((row: any) => String(row.reversalOfPaymentId)));
  const counted = payments.filter((row: any) => !row.reversalOfPaymentId && !reversed.has(String(row._id)));
  const properties = await Property.find({ _id: { $in: propertyIds }, companyId: company }).select('name').lean();
  const tenants = await Tenant.find({ _id: { $in: leases.map((lease) => lease.tenantId) }, companyId: company }).select('firstName lastName').lean();
  const propertyName = new Map(properties.map((row: any) => [String(row._id), row.name]));
  const tenantName = new Map(tenants.map((row: any) => [String(row._id), [row.firstName, row.lastName].filter(Boolean).join(' ')]));

  return leases.map((lease) => {
    const matches = counted.filter((payment) => paymentMatchesLease(payment, lease));
    const currencies = Array.from(new Set(matches.map((payment: any) => String(payment.currency || '')).filter(Boolean)));
    const mixedCurrency = currencies.length > 1;
    const received = mixedCurrency ? null : matches.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const dueDay = Number((lease as any).rentDueDay || 1);
    const dueDate = new Date(year, month - 1, Math.min(dueDay, 28));
    const rent = Number(lease.rentAmount || 0);
    const lastPayment = matches.reduce<Date | null>((latest, payment: any) => {
      const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : null;
      if (!paidAt) return latest;
      if (!latest || paidAt > latest) return paidAt;
      return latest;
    }, null);
    return {
      leaseId: lease._id,
      propertyId: lease.propertyId,
      propertyName: propertyName.get(String(lease.propertyId)) || '',
      tenantId: lease.tenantId,
      tenantName: tenantName.get(String(lease.tenantId)) || '',
      rent,
      received,
      outstanding: mixedCurrency || received === null ? null : Math.max(0, rent - received),
      dueDate,
      currency: mixedCurrency ? null : (currencies[0] || null),
      mixedCurrency,
      lastPaymentDate: lastPayment,
      status: mixedCurrency || received === null ? null : classifyRentCollection({ dueDate, rent, received, now }),
    };
  });
}

export async function saveAssessment(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const property = await propertyInCompany(req, req.body?.propertyId, company);
  if (!property) return res.status(404).json({ message: 'Property was not found in this company' });
  const row = await PropertyAssessment.create({
    companyId: company,
    propertyId: property._id,
    agentId: actorId(req),
    assessmentDate: req.body.assessmentDate || new Date(),
    recommendedRent: Number(req.body.recommendedRent || 0),
    condition: req.body.condition,
    marketObservations: req.body.marketObservations,
    ownerRecommendation: req.body.ownerRecommendation,
    notes: req.body.notes,
    status: 'ASSESSMENT_DRAFT',
  });
  await audit(company, req, 'ASSESSMENT_RECORDED', 'PropertyAssessment', String(row._id), undefined, 'ASSESSMENT_DRAFT', undefined, String(row.propertyId));
  return res.status(201).json({ status: 'success', data: row });
}

export async function advanceAssessment(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const row = await PropertyAssessment.findOne({ _id: req.params.id, companyId: company });
  if (!row || !(await callerCanAccessProperty(req, String(row.propertyId)))) return res.status(404).json({ message: 'Assessment was not found in this company' });
  const next = String(req.body?.status || '') as AssessmentStatus;
  if (next === 'OWNER_APPROVED' || next === 'OWNER_REJECTED') {
    if (!isOwnerRole(req)) return res.status(403).json({ message: 'Owner approval is a separate gate' });
    if (!(await landlordMayDecide(req, String(row.propertyId), company))) {
      return res.status(404).json({ message: 'Assessment was not found in this company' });
    }
  }
  try {
    assertAssessmentTransition(row.status as AssessmentStatus, next);
  } catch (error: any) {
    return res.status(error.status || 409).json({ message: error.message });
  }
  const previous = row.status;
  row.status = next;
  if (req.body?.reason) row.decisionComment = String(req.body.reason);
  if (next === 'OWNER_APPROVED') {
    const approvedRent = Number(req.body?.approvedRent ?? row.recommendedRent);
    if (approvedRent < 0) return res.status(400).json({ message: 'Approved rent cannot be negative' });
    row.approvedRent = approvedRent;
    row.decidedAt = new Date();
    row.decidedBy = actorId(req) as any;
  }
  if (next === 'OWNER_REJECTED') {
    row.decidedAt = new Date();
    row.decidedBy = actorId(req) as any;
  }
  await row.save();
  await audit(company, req, 'ASSESSMENT_STATUS', 'PropertyAssessment', String(row._id), previous, next, req.body?.reason, String(row.propertyId));
  if (next === 'ASSESSMENT_SUBMITTED') {
    await notifyLandlord(company, String(row.propertyId), `assessment-submitted:${row._id}`, 'Assessment ready for review', 'A property assessment is waiting for your price decision.');
  }
  if (next === 'OWNER_APPROVED' || next === 'OWNER_REJECTED') {
    await notifyOnce(
      company,
      row.agentId ? String(row.agentId) : undefined,
      `assessment-decision:${row._id}:${next}`,
      'Assessment decision recorded',
      next === 'OWNER_APPROVED' ? 'The landlord approved the proposed rent.' : 'The landlord requested changes to the assessment.'
    );
  }
  return res.json({ status: 'success', data: row });
}

export async function saveMandate(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const property = await propertyInCompany(req, req.body?.propertyId, company);
  if (!property) return res.status(404).json({ message: 'Property was not found in this company' });
  const approved = await PropertyAssessment.findOne({ propertyId: property._id, companyId: company, status: 'OWNER_APPROVED' }).lean();
  if (!approved) return res.status(409).json({ message: 'Owner approval of the assessment is required before a mandate' });
  const landlordId = await landlordIdForProperty(company, property);
  if (!landlordId) return res.status(409).json({ message: 'A landlord must be linked before a mandate is recorded' });
  const row = await RentalMandate.create({
    companyId: company,
    propertyId: property._id,
    ownerId: landlordId,
    agreedRent: Number(req.body?.agreedRent ?? (approved as any).approvedRent ?? (approved as any).recommendedRent),
    documentUrl: req.body?.documentUrl,
    notes: req.body?.notes,
    status: 'DRAFT',
  });
  await audit(company, req, 'MANDATE_RECORDED', 'RentalMandate', String(row._id), undefined, 'DRAFT', undefined, String(row.propertyId));
  return res.status(201).json({ status: 'success', data: row });
}

export async function advanceMandate(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const row = await RentalMandate.findOne({ _id: req.params.id, companyId: company });
  if (!row || !(await callerCanAccessProperty(req, String(row.propertyId)))) return res.status(404).json({ message: 'Mandate was not found in this company' });
  const next = String(req.body?.status || '') as MandateStatus;
  if (next === 'SIGNED') {
    const documentUrl = String(req.body?.documentUrl || row.documentUrl || '').trim();
    if (!documentUrl) return res.status(409).json({ message: 'A signed mandate document is required' });
    row.documentUrl = documentUrl;
  }
  try {
    assertMandateTransition(row.status as MandateStatus, next);
  } catch (error: any) {
    return res.status(error.status || 409).json({ message: error.message });
  }
  const previous = row.status;
  row.status = next;
  if (next === 'SIGNED') row.signedAt = new Date();
  await row.save();
  await audit(company, req, 'MANDATE_STATUS', 'RentalMandate', String(row._id), previous, next, undefined, String(row.propertyId));
  if (next === 'SIGNED') {
    await notifyPropertyAgent(company, String(row.propertyId), `mandate-signed:${row._id}`, 'Mandate recorded', 'A signed mandate document has been recorded. This is a document reference, not an electronic-signature check.');
  }
  return res.json({ status: 'success', data: row });
}

export async function saveListing(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const property = await propertyInCompany(req, req.body?.propertyId, company);
  if (!property) return res.status(404).json({ message: 'Property was not found in this company' });
  const [assessment, mandate] = await Promise.all([
    gateAssessment(company, property._id),
    gateMandate(company, property._id),
  ]);
  const requested = req.body?.status === 'ACTIVE' ? 'ACTIVE' : 'PRE_LISTING';
  if (requested === 'ACTIVE') {
    const blockers = listingBlockers({ assessmentStatus: (assessment as any)?.status, mandateStatus: (mandate as any)?.status });
    if (blockers.length) return res.status(409).json({ message: blockers[0], blockers });
  }
  const row = await ListingReference.create({
    companyId: company,
    propertyId: property._id,
    platform: String(req.body?.platform || 'Other'),
    reference: req.body?.reference,
    url: req.body?.url,
    status: requested,
    listedAt: requested === 'ACTIVE' ? new Date() : undefined,
    lastVerifiedAt: req.body?.lastVerifiedAt ? new Date(req.body.lastVerifiedAt) : undefined,
    listedBy: actorId(req),
    notes: req.body?.notes,
  });
  await audit(company, req, 'LISTING_RECORDED', 'ListingReference', String(row._id), undefined, requested, undefined, String(row.propertyId));
  return res.status(201).json({ status: 'success', data: row, publishedExternally: false });
}

export async function updateListing(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const row = await ListingReference.findOne({ _id: req.params.id, companyId: company });
  if (!row || !(await callerCanAccessProperty(req, String(row.propertyId)))) return res.status(404).json({ message: 'Listing reference was not found in this company' });
  const next = req.body?.status ? String(req.body.status) : row.status;
  if (!['PRE_LISTING', 'ACTIVE', 'REMOVED'].includes(next)) return res.status(400).json({ message: 'Listing status is not supported' });
  if (next === 'ACTIVE') {
    const [assessment, mandate] = await Promise.all([
      gateAssessment(company, row.propertyId),
      gateMandate(company, row.propertyId),
    ]);
    const blockers = listingBlockers({ assessmentStatus: (assessment as any)?.status, mandateStatus: (mandate as any)?.status });
    if (blockers.length) return res.status(409).json({ message: blockers[0], blockers });
  }
  const previous = row.status;
  row.status = next;
  if (req.body?.platform) row.platform = String(req.body.platform);
  if (req.body?.reference !== undefined) row.reference = req.body.reference;
  if (req.body?.url !== undefined) row.url = req.body.url;
  if (req.body?.notes !== undefined) row.notes = req.body.notes;
  if (req.body?.lastVerifiedAt) {
    const verified = new Date(req.body.lastVerifiedAt);
    if (Number.isNaN(verified.getTime())) return res.status(400).json({ message: 'Last verified date is not valid' });
    row.lastVerifiedAt = verified;
  }
  if (next === 'ACTIVE' && !row.listedAt) row.listedAt = new Date();
  if (next === 'REMOVED') row.removedAt = new Date();
  await row.save();
  await audit(company, req, 'LISTING_STATUS', 'ListingReference', String(row._id), previous, next, undefined, String(row.propertyId));
  return res.json({ status: 'success', data: row, publishedExternally: false });
}

export async function shortlistApplication(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const app = await RentalApplication.findOne({ _id: req.params.id, companyId: company });
  if (!app || !(await callerCanAccessProperty(req, String(app.propertyId)))) return res.status(404).json({ message: 'Application was not found in this company' });
  const next = String(req.body?.status || 'SHORTLISTED') as ApplicationStatus;
  if (next === 'OWNER_APPROVED' || next === 'OWNER_DECLINED') {
    return res.status(403).json({ message: 'Owner approval is a separate gate' });
  }
  try {
    assertApplicationTransition(app.status as ApplicationStatus, next);
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
  const previous = app.status;
  app.status = next;
  if (req.body?.recommendation) app.agentNotes = String(req.body.recommendation);
  app.statusHistory.push({ status: next, at: new Date(), by: actorId(req) as any, note: req.body?.recommendation });
  await app.save();
  await audit(company, req, 'APPLICATION_STATUS', 'RentalApplication', String(app._id), previous, next, undefined, String(app.propertyId));
  if (next === 'SENT_TO_OWNER') {
    await notifyLandlord(company, String(app.propertyId), `application-shortlist:${app._id}`, 'Shortlist ready for review', 'A rental application is waiting for your decision.');
  }
  return res.json({ status: 'success', data: app });
}

export async function ownerApplicationDecision(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  if (!isOwnerRole(req)) return res.status(403).json({ message: 'Owner approval is a separate gate' });
  const app = await RentalApplication.findOne({ _id: req.params.id, companyId: company });
  if (!app || !(await callerCanAccessProperty(req, String(app.propertyId)))) return res.status(404).json({ message: 'Application was not found in this company' });
  if (!(await landlordMayDecide(req, String(app.propertyId), company))) {
    return res.status(404).json({ message: 'Application was not found in this company' });
  }
  const next = req.body?.decision === 'DECLINED'
    ? 'OWNER_DECLINED'
    : req.body?.decision === 'APPROVED'
      ? 'OWNER_APPROVED'
      : req.body?.decision === 'FURTHER'
        ? 'UNDER_REVIEW'
        : '';
  if (!next) return res.status(400).json({ message: 'Decision must be APPROVED, DECLINED, or FURTHER' });
  try {
    assertApplicationTransition(app.status as ApplicationStatus, next as ApplicationStatus);
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
  const previous = app.status;
  app.status = next;
  app.statusHistory.push({ status: next, at: new Date(), by: actorId(req) as any, note: req.body?.reason });
  await app.save();
  await audit(company, req, 'OWNER_APPLICANT_DECISION', 'RentalApplication', String(app._id), previous, next, req.body?.reason, String(app.propertyId));
  await notifyPropertyAgent(
    company,
    String(app.propertyId),
    `application-decision:${app._id}:${next}`,
    'Applicant decision recorded',
    next === 'OWNER_APPROVED' ? 'The landlord selected an applicant.' : 'The landlord recorded an applicant decision.'
  );
  return res.json({ status: 'success', data: app });
}

export async function ownerLettingWorkspace(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const property = await propertyInCompany(req, req.params.propertyId, company);
  if (!property || !(await landlordMayDecide(req, String(property._id), company))) {
    return res.status(404).json({ message: 'Property was not found in this company' });
  }
  const [assessment, mandate, applications] = await Promise.all([
    gateAssessment(company, property._id),
    gateMandate(company, property._id),
    RentalApplication.find({
      propertyId: property._id,
      companyId: company,
      status: { $in: ['SENT_TO_OWNER', 'OWNER_APPROVED', 'OWNER_DECLINED'] },
    }).select('status submittedAt snapshot documents statusHistory createdAt').sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  return res.json({
    status: 'success',
    data: {
      property: { _id: property._id, name: (property as any).name },
      assessment,
      mandate: mandate ? { _id: (mandate as any)._id, status: (mandate as any).status, agreedRent: (mandate as any).agreedRent, signedAt: (mandate as any).signedAt } : null,
      shortlist: applications,
    },
  });
}

export async function prepareAgencyLease(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const app = await RentalApplication.findOne({ _id: req.body?.applicationId, companyId: company });
  if (!app || app.status !== 'OWNER_APPROVED') {
    return res.status(409).json({ message: 'Owner approval required before a lease draft' });
  }
  const property = await propertyInCompany(req, String(app.propertyId), company);
  if (!property) return res.status(404).json({ message: 'Property was not found in this company' });
  const existing = await Lease.findOne({ companyId: company, applicationId: app._id });
  if (existing) return res.json({ status: 'success', data: existing, duplicate: true });
  if (!req.body?.tenantId || !mongoose.Types.ObjectId.isValid(String(req.body.tenantId))) {
    return res.status(400).json({ message: 'A tenant in this company is required' });
  }
  const tenant = await Tenant.findOne({ _id: req.body.tenantId, companyId: company }).select('_id propertyId companyId');
  if (!tenant) return res.status(404).json({ message: 'Tenant was not found in this company' });
  if (tenant.propertyId && String(tenant.propertyId) !== String(app.propertyId)) {
    return res.status(409).json({ message: 'Tenant is linked to a different property' });
  }
  const lease = await Lease.create({
    propertyId: app.propertyId,
    tenantId: tenant._id,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    rentAmount: Number(req.body.rentAmount || 0),
    depositAmount: Number(req.body.depositAmount || 0),
    monthlyRent: Number(req.body.rentAmount || 0),
    status: 'draft',
    companyId: company,
    ownerId: actorId(req),
    agencyWorkflow: true,
    applicationId: app._id,
  } as any);
  await audit(company, req, 'LEASE_DRAFT', 'Lease', String(lease._id), undefined, 'draft', undefined, String(lease.propertyId));
  return res.status(201).json({ status: 'success', data: lease });
}

export async function signAgencyLease(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const lease = await Lease.findOne({ _id: req.params.id, companyId: company });
  if (!lease || !(await callerCanAccessProperty(req, String(lease.propertyId)))) return res.status(404).json({ message: 'Lease was not found in this company' });
  const party = req.body?.party;
  if (party === 'owner') {
    if (!(await landlordMayDecide(req, String(lease.propertyId), company))) {
      return res.status(403).json({ message: 'Owner signature is a separate gate' });
    }
    if ((lease as any).ownerSignedAt) return res.json({ status: 'success', data: lease, financialPosting: false });
    (lease as any).ownerSignedAt = new Date();
  } else if (party === 'tenant') {
    if (isOwnerRole(req)) return res.status(403).json({ message: 'Tenant signature is recorded by the agency' });
    if ((lease as any).tenantSignedAt) return res.json({ status: 'success', data: lease, financialPosting: false });
    (lease as any).tenantSignedAt = new Date();
  } else {
    return res.status(400).json({ message: 'Party must be tenant or owner' });
  }
  await lease.save();
  await audit(company, req, 'LEASE_SIGNATURE', 'Lease', String(lease._id), undefined, party, undefined, String(lease.propertyId));
  return res.json({ status: 'success', data: lease, financialPosting: false });
}

export async function activateAgencyLease(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const lease = await Lease.findOne({ _id: req.params.id, companyId: company });
  if (!lease || !(await callerCanAccessProperty(req, String(lease.propertyId)))) return res.status(404).json({ message: 'Lease was not found in this company' });
  if (lease.status === 'active') return res.json({ status: 'success', data: lease, duplicate: true });
  const application = (lease as any).applicationId
    ? await RentalApplication.findOne({ _id: (lease as any).applicationId, companyId: company }).lean()
    : null;
  const tenant = await Tenant.findOne({ _id: lease.tenantId, companyId: company }).select('_id').lean();
  const property = await Property.findOne({ _id: lease.propertyId, companyId: company }).select('_id').lean();
  if (!tenant || !property) return res.status(404).json({ message: 'Lease relationships were not found in this company' });
  const depositReceived = await completedDepositReceived(company, lease._id);
  const blockers = leaseActivationBlockers({
    applicationStatus: (application as any)?.status,
    tenantSignedAt: (lease as any).tenantSignedAt,
    ownerSignedAt: (lease as any).ownerSignedAt,
    depositRequired: Number(lease.depositAmount || 0),
    depositReceived,
  });
  if (blockers.length) return res.status(403).json({ message: blockers[0], blockers });
  const previous = lease.status;
  lease.status = 'active';
  await lease.save();
  await audit(company, req, 'LEASE_ACTIVATED', 'Lease', String(lease._id), previous, 'active', undefined, String(lease.propertyId));
  await notifyLandlord(company, String(lease.propertyId), `lease-activated:${lease._id}`, 'Lease activated', 'A lease for your property is now active.');
  return res.json({ status: 'success', data: lease });
}

export async function rentCollectionBoard(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const rows = await buildRentBoardRows(req, company);
  return res.json({ status: 'success', data: rows });
}

export async function requestMaintenancePayment(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const quote = await MaintenanceQuote.findOne({ _id: req.body?.quoteId, companyId: company }).lean();
  if (!quote || !(await callerCanAccessProperty(req, String(quote.propertyId)))) return res.status(404).json({ message: 'Quote was not found in this company' });
  const requestedAmount = Number(req.body?.amount || 0);
  if (!(requestedAmount > 0)) return res.status(400).json({ message: 'Requested amount must be greater than zero', financialPosting: false });
  const currency = String(quote.currency || 'USD');
  if (currency !== 'USD' && currency !== 'ZWL') {
    return res.status(409).json({ message: 'This quote currency cannot be recorded on a payment request', financialPosting: false });
  }
  const job = await ContractorJobRecord.findOne({ quoteId: quote._id, companyId: company, status: { $in: ['AUTHORISED', 'ACCEPTED', 'SCHEDULED', 'WORK_IN_PROGRESS', 'COMPLETED', 'CLOSED'] } }).lean();
  const changeOrders = await MaintenanceChangeOrder.find({
    companyId: company,
    originalQuoteId: quote._id,
    status: 'OWNER_APPROVED',
  }).select('requestedAmount').lean();
  const approvedAmount = Number(quote.total || quote.amount || 0) + changeOrders.reduce((sum, row) => sum + Number(row.requestedAmount || 0), 0);
  const blockers = maintenanceRequestBlockers({
    quoteStatus: quote.status,
    quotePropertyId: quote.propertyId ? String(quote.propertyId) : undefined,
    requestPropertyId: req.body?.propertyId ? String(req.body.propertyId) : (quote.propertyId ? String(quote.propertyId) : undefined),
    quoteCompanyId: String(quote.companyId),
    requestCompanyId: company,
    approvedAmount,
    requestedAmount,
    changeOrderApproved: false,
    agentAuthorised: Boolean(job),
  });
  if (blockers.length) return res.status(409).json({ message: blockers[0], blockers, financialPosting: false });
  const reason = `Maintenance quote ${quote._id}`;
  const existing = await PaymentRequest.findOne({ companyId: company, reason, status: 'pending' }).lean();
  if (existing) return res.status(409).json({ message: 'A payment request for this quote is already pending', financialPosting: false });
  const request = await PaymentRequest.create({
    companyId: company,
    propertyId: quote.propertyId || req.body.propertyId,
    amount: requestedAmount,
    currency,
    reason,
    requestDate: new Date(),
    dueDate: req.body.dueDate || new Date(),
    status: 'pending',
    requestedBy: String(actorId(req) || ''),
    requestedByUser: actorId(req),
    payTo: req.body.payTo || { name: 'Contractor', surname: 'Payee' },
    readyForAccounting: true,
    maintenanceRequestId: quote.requestId,
    approval: { status: 'pending' },
  });
  await audit(company, req, 'MAINTENANCE_PAYMENT_REQUESTED', 'PaymentRequest', String(request._id), undefined, 'pending', undefined, quote.propertyId ? String(quote.propertyId) : undefined);
  const accountants = await User.find({ companyId: company, role: 'accountant', isActive: { $ne: false } }).select('_id').limit(20).lean();
  for (const accountant of accountants) {
    await notifyOnce(company, String(accountant._id), `maintenance-payment-request:${request._id}:${accountant._id}`, 'Maintenance payment request', 'A maintenance payment request is waiting for accounting review. The request is not a payment.');
  }
  return res.status(201).json({ status: 'success', data: request, financialPosting: false });
}

export async function fileLevyReceipt(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const levy = await LevyPayment.findOne({ _id: req.params.id, companyId: company });
  if (!levy || !(await callerCanAccessProperty(req, String(levy.propertyId)))) return res.status(404).json({ message: 'Levy was not found in this company' });
  const receiptNumber = req.body?.receiptNumber ? String(req.body.receiptNumber) : '';
  const receiptFileUrl = req.body?.receiptFileUrl ? String(req.body.receiptFileUrl) : '';
  const sameReceipt = Boolean(receiptNumber)
    && levy.receiptNumber === receiptNumber
    && (!receiptFileUrl || (levy as any).receiptFileUrl === receiptFileUrl);
  if (sameReceipt) return res.json({ status: 'success', data: levy, financialPosting: false, duplicate: true });
  (levy as any).receiptNumber = receiptNumber || levy.receiptNumber;
  if (receiptFileUrl) (levy as any).receiptFileUrl = receiptFileUrl;
  if (req.body?.levyAuthority) (levy as any).levyAuthority = req.body.levyAuthority;
  (levy as any).receiptUploadedBy = actorId(req);
  (levy as any).receiptUploadedAt = new Date();
  if (req.body?.notes) levy.notes = req.body.notes;
  await levy.save();
  await audit(company, req, 'LEVY_RECEIPT_FILED', 'LevyPayment', String(levy._id), undefined, undefined, undefined, String(levy.propertyId));
  return res.json({ status: 'success', data: levy, financialPosting: false });
}

export async function propertyWorkspace(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const property = await propertyInCompany(req, req.params.propertyId, company);
  if (!property) return res.status(404).json({ message: 'Property was not found in this company' });
  const [assessment, mandate, listings, applications, viewings, lease, events] = await Promise.all([
    gateAssessment(company, property._id),
    gateMandate(company, property._id),
    ListingReference.find({ propertyId: property._id, companyId: company }).sort({ createdAt: -1 }).limit(10).lean(),
    RentalApplication.find({ propertyId: property._id, companyId: company }).sort({ createdAt: -1 }).limit(20).lean(),
    ViewingRequest.find({ propertyId: property._id, companyId: company }).sort({ createdAt: -1 }).limit(20).lean(),
    Lease.findOne({ propertyId: property._id, companyId: company }).sort({ createdAt: -1 }).lean(),
    AgencyWorkflowEvent.find({ companyId: company, propertyId: property._id }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  const review = (applications as any[]).filter((row) => ['SUBMITTED', 'UNDER_REVIEW'].includes(row.status)).length;
  const shortlisted = (applications as any[]).filter((row) => row.status === 'SHORTLISTED').length;
  const awaitingOwner = (applications as any[]).filter((row) => row.status === 'SENT_TO_OWNER').length;
  const activeListing = (listings as any[]).find((row) => row.status === 'ACTIVE');
  const depositReceived = lease ? await completedDepositReceived(company, (lease as any)._id) : 0;
  const nextAction = nextAgencyAction({
    assessmentStatus: (assessment as any)?.status,
    mandateStatus: (mandate as any)?.status,
    listingStatus: activeListing ? 'ACTIVE' : (listings as any[])[0]?.status,
    applicationsAwaitingReview: review,
    shortlisted,
    awaitingOwner,
    lease: lease ? {
      status: (lease as any).status,
      tenantSignedAt: (lease as any).tenantSignedAt,
      ownerSignedAt: (lease as any).ownerSignedAt,
      depositOutstanding: Number((lease as any).depositAmount || 0) > depositReceived + 0.001,
    } : null,
  });
  return res.json({
    status: 'success',
    data: { property, assessment, mandate, listings, applications, viewings, lease, events, nextAction },
  });
}

export async function agencySearch(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.json({ status: 'success', data: [] });
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(safe, 'i');
  const visibleIds = await propertyIdsForCaller(req);
  const propertyQuery: any = { companyId: company, name: regex };
  if (visibleIds !== 'company') propertyQuery._id = { $in: visibleIds };
  const [properties, leases] = await Promise.all([
    Property.find(propertyQuery).select('name rent status').limit(8).lean(),
    Lease.find({
      companyId: company,
      ...(visibleIds === 'company' ? {} : { propertyId: { $in: visibleIds } }),
    }).select('propertyId status rentAmount').limit(8).lean(),
  ]);
  return res.json({
    status: 'success',
    data: [
      ...properties.map((row: any) => ({ type: 'property', id: row._id, label: row.name, path: `/agent-dashboard/properties/${row._id}` })),
      ...leases.map((row: any) => ({ type: 'lease', id: row._id, label: `Lease ${row.status}`, path: `/agent-dashboard/leases` })),
    ],
  });
}

function scopedPropertyFilter(company: string, visibleIds: mongoose.Types.ObjectId[] | 'company') {
  return visibleIds === 'company'
    ? { companyId: company }
    : { companyId: company, _id: { $in: visibleIds } };
}

function scopedChildFilter(company: string, visibleIds: mongoose.Types.ObjectId[] | 'company') {
  return visibleIds === 'company'
    ? { companyId: company }
    : { companyId: company, propertyId: { $in: visibleIds } };
}

export async function seniorPortfolio(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  if (!isSenior(req)) return res.status(403).json({ message: 'Portfolio oversight is limited to senior agency roles' });
  const visibleIds = await propertyIdsForCaller(req);
  const properties = scopedPropertyFilter(company, visibleIds);
  const children = scopedChildFilter(company, visibleIds);
  const assessedIds = await PropertyAssessment.distinct('propertyId', children);
  const [propertyCount, assessments, mandates, listings, review, shortlist, leases, requests, levies, board] = await Promise.all([
    Property.countDocuments(properties),
    PropertyAssessment.countDocuments({ ...children, status: 'ASSESSMENT_SUBMITTED' }),
    RentalMandate.countDocuments({ ...children, status: { $in: ['DRAFT', 'SENT'] } }),
    ListingReference.countDocuments({ ...children, status: 'PRE_LISTING' }),
    RentalApplication.countDocuments({ ...children, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
    RentalApplication.countDocuments({ ...children, status: 'SENT_TO_OWNER' }),
    Lease.countDocuments({
      ...children,
      status: 'draft',
      $or: [
        { tenantSignedAt: null },
        { tenantSignedAt: { $exists: false } },
        { ownerSignedAt: null },
        { ownerSignedAt: { $exists: false } },
      ],
    }),
    PaymentRequest.countDocuments({ ...children, readyForAccounting: true, status: 'pending' }),
    LevyPayment.countDocuments({ ...children, receiptNumber: { $in: [null, ''] } }),
    buildRentBoardRows(req, company),
  ]);
  const awaitingAssessment = await Property.countDocuments({
    ...properties,
    ...(assessedIds.length ? { _id: { $nin: assessedIds } } : {}),
  });
  return res.json({
    status: 'success',
    data: {
      properties: propertyCount,
      propertiesAwaitingAssessment: awaitingAssessment,
      assessmentsAwaitingOwner: assessments,
      mandatesAwaitingSignature: mandates,
      listingsAwaitingCompletion: listings,
      applicationsAwaitingReview: review,
      shortlistsAwaitingOwner: shortlist,
      leasesAwaitingSignature: leases,
      rentRequiringCollection: board.filter((row) => row.status === 'DUE' || row.status === 'OVERDUE' || row.status === 'PARTIALLY_PAID').length,
      maintenancePaymentsAwaitingAccounting: requests,
      leviesAwaitingReceipt: levies,
    },
  });
}

export async function accountantWorkQueue(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const requests = await PaymentRequest.find({ companyId: company, readyForAccounting: true, status: 'pending' }).select('propertyId amount currency reason status createdAt').limit(50).lean();
  return res.json({
    status: 'success',
    data: { maintenancePaymentRequests: requests },
    note: 'A request is not a financial posting.',
  });
}
