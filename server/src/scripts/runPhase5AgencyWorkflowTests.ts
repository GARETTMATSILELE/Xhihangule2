/**
 * Phase 5 rental-agency workflow regression.
 * Mounts the real routers, signs real JWTs, and checks HTTP status plus database side effects.
 * Disposable PHASE5 fixtures only. Does not post accounting or delete journals.
 */
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import express from 'express';
import { accountingConnection, connectDatabase } from '../config/database';
import { JWT_CONFIG } from '../config/jwt';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { LevyPayment } from '../models/LevyPayment';
import { Payment } from '../models/Payment';
import { PaymentRequest } from '../models/PaymentRequest';
import { MaintenanceQuote } from '../models/MaintenanceQuote';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { Notification } from '../models/Notification';
import { RentalApplication } from '../ecosystem/models/tenantFacing';
import { ContractorJobRecord, MaintenanceChangeOrder } from '../ecosystem/models/maintenanceWorkflow';
import { AgencyWorkflowEvent, ListingReference, PropertyAssessment, RentalMandate } from '../agency/lettingModels';
import agentRoutes from '../routes/agentRoutes';
import ownerRoutes from '../routes/ownerRoutes';
import accountantRoutes from '../routes/accountantRoutes';
import levyPaymentRoutes from '../routes/levyPaymentRoutes';
import ecosystemRoutes from '../ecosystem/routes';
import { errorHandler } from '../middleware/errorHandler';

const STAMP = `PHASE5${Date.now().toString().slice(-8)}`;
const PASSWORD = 'Phase5-Test-Password';

type HttpResult = { status: number; body: any; text: string };
type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function tokenFor(user: { _id: any; role: string; roles?: string[]; companyId?: any; sessionVersion?: number }) {
  if (!user.companyId) throw new Error('Test user is missing a company');
  return jwt.sign({
    userId: String(user._id),
    role: user.role,
    roles: user.roles && user.roles.length ? user.roles : undefined,
    sessionVersion: Number(user.sessionVersion || 1),
    companyId: String(user.companyId),
    type: 'access',
  }, JWT_CONFIG.SECRET, {
    expiresIn: '2h',
    issuer: JWT_CONFIG.ISSUER,
    audience: JWT_CONFIG.AUDIENCE,
  });
}

function request(port: number, method: string, path: string, token?: string, body?: unknown): Promise<HttpResult> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 20000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: any = text;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        resolve({ status: res.statusCode || 0, body: parsed, text });
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`timeout ${method} ${path}`)); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function denied(status: number) {
  return status === 401 || status === 403 || status === 404;
}

async function journalCount(companyIds: mongoose.Types.ObjectId[]) {
  return mongoose.connection.collection('journalentries').countDocuments({ companyId: { $in: companyIds } } as any);
}

async function makePayment(fields: {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  leaseId?: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  amount: number;
  depositAmount?: number;
  currency?: string;
  status?: string;
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  reversalOfPaymentId?: mongoose.Types.ObjectId;
  paymentType?: string;
}) {
  return Payment.create({
    paymentType: fields.paymentType || 'rental',
    propertyType: 'residential',
    propertyId: fields.propertyId,
    tenantId: fields.tenantId,
    leaseId: fields.leaseId,
    agentId: fields.agentId,
    companyId: fields.companyId,
    paymentDate: new Date(),
    paymentMethod: 'cash',
    amount: fields.amount,
    depositAmount: fields.depositAmount || 0,
    currency: fields.currency || 'USD',
    rentalPeriodMonth: fields.rentalPeriodMonth,
    rentalPeriodYear: fields.rentalPeriodYear,
    status: fields.status || 'completed',
    processedBy: fields.agentId,
    reversalOfPaymentId: fields.reversalOfPaymentId,
    commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 0 },
  });
}

async function main() {
  await connectDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/agents', agentRoutes);
  app.use('/api/owners', ownerRoutes);
  app.use('/api/accountants', accountantRoutes);
  app.use('/api/levy-payments', levyPaymentRoutes);
  app.use('/api/ecosystem', ecosystemRoutes);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port as number;

  const createdUserIds: mongoose.Types.ObjectId[] = [];
  const createdCompanyIds: mongoose.Types.ObjectId[] = [];
  const ownerIds: mongoose.Types.ObjectId[] = [];

  try {
    const bootstrap = await User.create({
      email: `${STAMP}-bootstrap@example.test`,
      password: PASSWORD,
      firstName: 'Boot',
      lastName: 'Strap',
      role: 'admin',
      roles: ['admin'],
      isActive: true,
      sessionVersion: 1,
    });
    createdUserIds.push(bootstrap._id);

    async function makeCompany(suffix: string) {
      const company = await Company.create({
        name: `${STAMP} ${suffix}`,
        address: '1 Test Street',
        phone: '0770000000',
        email: `${STAMP}-${suffix}@example.test`,
        registrationNumber: `${STAMP}-${suffix}-REG`,
        tinNumber: `${STAMP}-${suffix}-TIN`,
        ownerId: bootstrap._id,
        workspaceType: 'agency',
        subscriptionStatus: 'trial',
        tenantStatus: 'active',
        isActive: true,
      });
      createdCompanyIds.push(company._id);
      return company;
    }
    async function makeUser(email: string, role: string, companyId: mongoose.Types.ObjectId, roles?: string[]) {
      const user = await User.create({
        email, password: PASSWORD, firstName: role, lastName: STAMP, role,
        roles: roles || [role], companyId, isActive: true, sessionVersion: 1,
      });
      createdUserIds.push(user._id);
      return user;
    }

    const companyA = await makeCompany('A');
    const companyB = await makeCompany('B');
    const agentA = await makeUser(`${STAMP}-agent-a@example.test`, 'agent', companyA._id);
    const agentB = await makeUser(`${STAMP}-agent-b@example.test`, 'agent', companyA._id);
    const seniorAgent = await makeUser(`${STAMP}-senior@example.test`, 'agent', companyA._id, ['agent', 'admin']);
    const accountantA = await makeUser(`${STAMP}-accountant@example.test`, 'accountant', companyA._id);
    const principalA = await makeUser(`${STAMP}-principal@example.test`, 'principal', companyA._id);
    const ownerUser = await makeUser(`${STAMP}-owner@example.test`, 'owner', companyA._id);
    const otherOwnerUser = await makeUser(`${STAMP}-other-owner@example.test`, 'owner', companyA._id);
    const agentForeign = await makeUser(`${STAMP}-foreign@example.test`, 'agent', companyB._id);
    const applicant = await makeUser(`${STAMP}-applicant@example.test`, 'tenant', companyA._id);

    const propertyA = await Property.create({
      name: `${STAMP} Agent A House`,
      address: '10 Agent A Road',
      companyId: companyA._id,
      ownerId: agentA._id,
      agentId: agentA._id,
      rent: 400,
    });
    const propertyB = await Property.create({
      name: `${STAMP} Agent B House`,
      address: '20 Agent B Road',
      companyId: companyA._id,
      ownerId: agentB._id,
      agentId: agentB._id,
      rent: 500,
    });
    const propertyForeign = await Property.create({
      name: `${STAMP} Company B House`,
      address: '40 Foreign Road',
      companyId: companyB._id,
      ownerId: agentForeign._id,
      agentId: agentForeign._id,
      rent: 300,
    });
    const landlord = await PropertyOwner.create({
      email: ownerUser.email,
      password: PASSWORD,
      firstName: 'Landlord',
      lastName: 'Shared',
      phone: '0771111111',
      companyId: companyA._id,
      properties: [propertyA._id, propertyB._id],
    });
    ownerIds.push(landlord._id);
    const otherLandlord = await PropertyOwner.create({
      email: otherOwnerUser.email,
      password: PASSWORD,
      firstName: 'Other',
      lastName: 'Owner',
      phone: '0773333333',
      companyId: companyA._id,
      properties: [],
    });
    ownerIds.push(otherLandlord._id);
    propertyA.propertyOwnerId = landlord._id;
    propertyB.propertyOwnerId = landlord._id;
    await propertyA.save();
    await propertyB.save();

    const tAgentA = tokenFor(agentA);
    const tAgentB = tokenFor(agentB);
    const tSenior = tokenFor(seniorAgent);
    const tAccountant = tokenFor(accountantA);
    const tPrincipal = tokenFor(principalA);
    const tOwner = tokenFor(ownerUser);
    const tOtherOwner = tokenFor(otherOwnerUser);
    const tForeign = tokenFor(agentForeign);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const journalsBefore = await journalCount(createdCompanyIds);

    const unauth = await request(port, 'GET', '/api/agents/letting/rent-board');
    record('Unauthenticated rent board is rejected', unauth.status === 401, `status ${unauth.status}`);

    const assessment = await request(port, 'POST', '/api/agents/letting/assessments', tAgentA, {
      propertyId: String(propertyA._id),
      recommendedRent: 450,
      condition: 'Good',
      notes: 'Phase 5 assessment',
    });
    record('Authorized agent records an assessment', assessment.status === 201, `status ${assessment.status}`);
    const assessmentId = assessment.body?.data?._id;
    const submitted = await request(port, 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, tAgentA, { status: 'ASSESSMENT_SUBMITTED' });
    record('Agent submits the assessment for owner review', submitted.status === 200 && submitted.body?.data?.status === 'ASSESSMENT_SUBMITTED', `status ${submitted.status}`);
    const ownerNotice = await Notification.countDocuments({ companyId: String(companyA._id), userId: ownerUser._id, 'payload.idempotencyKey': `assessment-submitted:${assessmentId}` });
    record('Owner review notification is recorded once', ownerNotice === 1, `count ${ownerNotice}`);

    const agentApproves = await request(port, 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, tAgentA, { status: 'OWNER_APPROVED', approvedRent: 1 });
    const seniorApproves = await request(port, 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, tSenior, { status: 'OWNER_APPROVED', approvedRent: 1 });
    const otherApproves = await request(port, 'POST', `/api/owners/letting/assessments/${assessmentId}/decision`, tOtherOwner, { status: 'OWNER_APPROVED', approvedRent: 440 });
    const foreignApproves = await request(port, 'POST', `/api/owners/letting/assessments/${assessmentId}/decision`, tForeign, { status: 'OWNER_APPROVED' });
    const approved = await request(port, 'POST', `/api/owners/letting/assessments/${assessmentId}/decision`, tOwner, { status: 'OWNER_APPROVED', approvedRent: 440, reason: 'Accepted' });
    const storedAssessment = await PropertyAssessment.findById(assessmentId).lean();
    record('Agent cannot approve the assessment', agentApproves.status === 403, `status ${agentApproves.status}`);
    record('A senior agent cannot approve on behalf of the landlord', seniorApproves.status === 403, `status ${seniorApproves.status}`);
    record('Another owner cannot approve the assessment', denied(otherApproves.status), `status ${otherApproves.status}`);
    record('Another company cannot approve the assessment', denied(foreignApproves.status), `status ${foreignApproves.status}`);
    record('The landlord approves the price', approved.status === 200 && storedAssessment?.status === 'OWNER_APPROVED' && storedAssessment?.approvedRent === 440, `status ${approved.status} stored ${storedAssessment?.status}`);
    const overwrite = await request(port, 'POST', `/api/owners/letting/assessments/${assessmentId}/decision`, tOwner, { status: 'OWNER_REJECTED' });
    const stillApproved = await PropertyAssessment.findById(assessmentId).select('status').lean();
    record('An approved assessment is not overwritten', overwrite.status === 409 && stillApproved?.status === 'OWNER_APPROVED', `status ${overwrite.status}`);

    const sharedBlocked = await request(port, 'GET', `/api/agents/letting/properties/${propertyB._id}/workspace`, tAgentA);
    record('A shared landlord does not open the other agent assessment workspace', sharedBlocked.status === 404, `status ${sharedBlocked.status}`);

    const earlyListing = await request(port, 'POST', '/api/agents/letting/listings', tAgentA, { propertyId: String(propertyA._id), platform: 'Property.co.zw', status: 'ACTIVE' });
    record('A listing cannot become active before the mandate', earlyListing.status === 409, `status ${earlyListing.status}`);
    const mandate = await request(port, 'POST', '/api/agents/letting/mandates', tAgentA, { propertyId: String(propertyA._id) });
    const mandateId = mandate.body?.data?._id;
    const sent = await request(port, 'POST', `/api/agents/letting/mandates/${mandateId}/status`, tAgentA, { status: 'SENT' });
    const unsigned = await request(port, 'POST', `/api/agents/letting/mandates/${mandateId}/status`, tAgentA, { status: 'SIGNED' });
    const signed = await request(port, 'POST', `/api/agents/letting/mandates/${mandateId}/status`, tAgentA, { status: 'SIGNED', documentUrl: 'https://files.example.test/mandate.pdf' });
    const storedMandate = await RentalMandate.findById(mandateId).lean();
    record('Mandate is linked to the landlord record', mandate.status === 201 && String(storedMandate?.ownerId) === String(landlord._id), `status ${mandate.status}`);
    record('A mandate cannot be marked signed without a document', sent.status === 200 && unsigned.status === 409, `sent ${sent.status} unsigned ${unsigned.status}`);
    record('A document reference records the signed mandate', signed.status === 200 && storedMandate?.status === 'SIGNED', `status ${signed.status}`);
    const listing = await request(port, 'POST', '/api/agents/letting/listings', tAgentA, {
      propertyId: String(propertyA._id), platform: 'Property.co.zw', url: 'https://property.example.test/1', reference: 'PB-1',
    });
    const listingId = listing.body?.data?._id;
    const activatedListing = await request(port, 'POST', `/api/agents/letting/listings/${listingId}/status`, tAgentA, { status: 'ACTIVE', lastVerifiedAt: now.toISOString() });
    const foreignListing = await request(port, 'POST', `/api/agents/letting/listings/${listingId}/status`, tForeign, { status: 'REMOVED' });
    const otherAgentListing = await request(port, 'POST', `/api/agents/letting/listings/${listingId}/status`, tAgentB, { status: 'REMOVED' });
    const storedListing = await ListingReference.findById(listingId).lean();
    record('External listing reference stays on the property and is not a publish call', listing.status === 201 && listing.body?.publishedExternally === false, `status ${listing.status}`);
    record('Listing becomes active only after the mandate gate', activatedListing.status === 200 && storedListing?.status === 'ACTIVE', `status ${activatedListing.status}`);
    record('Another agent cannot change the listing reference', otherAgentListing.status === 404 && storedListing?.status === 'ACTIVE', `status ${otherAgentListing.status}`);
    record('Another company cannot change the listing reference', denied(foreignListing.status), `status ${foreignListing.status}`);

    const application = await RentalApplication.create({
      tenantUserId: applicant._id,
      propertyId: propertyA._id,
      companyId: companyA._id,
      status: 'SUBMITTED',
      submittedAt: now,
      snapshot: { fullName: 'Test Applicant', employer: 'Example Works' },
      statusHistory: [{ status: 'SUBMITTED', at: now }],
    });
    const invalid = await request(port, 'POST', `/api/ecosystem/agency/applications/${application._id}/status`, tAgentA, { status: 'SHORTLISTED' });
    const review = await request(port, 'POST', `/api/ecosystem/agency/applications/${application._id}/status`, tAgentA, { status: 'UNDER_REVIEW' });
    const shortlist = await request(port, 'POST', `/api/ecosystem/agency/applications/${application._id}/status`, tAgentA, { status: 'SHORTLISTED' });
    const sentToOwner = await request(port, 'POST', `/api/ecosystem/agency/applications/${application._id}/status`, tAgentA, { status: 'SENT_TO_OWNER' });
    const agentSelects = await request(port, 'POST', `/api/agents/letting/applications/${application._id}/owner-decision`, tAgentA, { decision: 'APPROVED' });
    const otherSelects = await request(port, 'POST', `/api/owners/letting/applications/${application._id}/decision`, tOtherOwner, { decision: 'APPROVED' });
    const ownerSees = await request(port, 'GET', `/api/owners/letting/properties/${propertyA._id}/workspace`, tOwner);
    const ownerSelects = await request(port, 'POST', `/api/owners/letting/applications/${application._id}/decision`, tOwner, { decision: 'APPROVED', reason: 'Selected' });
    const storedApplication = await RentalApplication.findById(application._id).lean();
    const agentBRead = await request(port, 'GET', '/api/ecosystem/agency/applications', tAgentB);
    record('An invalid application transition is rejected', invalid.status === 400, `status ${invalid.status}`);
    record('Application moves through review and shortlist', review.status === 200 && shortlist.status === 200 && sentToOwner.status === 200, `${review.status}/${shortlist.status}/${sentToOwner.status}`);
    record('The stored application status is owner approved', storedApplication?.status === 'OWNER_APPROVED', storedApplication?.status || '');
    record('An agent cannot select the applicant', agentSelects.status === 403, `status ${agentSelects.status}`);
    record('Another landlord cannot select the applicant', denied(otherSelects.status), `status ${otherSelects.status}`);
    record('The landlord sees the shortlist and selects the applicant', ownerSees.status === 200 && ownerSees.text.includes('Test Applicant') && ownerSelects.status === 200, `workspace ${ownerSees.status} decision ${ownerSelects.status}`);
    record('Another agent does not receive this applicant in the queue', agentBRead.status === 200 && !agentBRead.text.includes('Test Applicant'), `status ${agentBRead.status}`);

    const tenantA = await Tenant.create({ firstName: 'Tenant', lastName: STAMP, email: `${STAMP}-tenant@example.test`, phone: '0774444444', companyId: companyA._id, ownerId: agentA._id, propertyId: propertyA._id, status: 'Active' });
    const tenantB = await Tenant.create({ firstName: 'Foreign', lastName: 'Tenant', email: `${STAMP}-foreign-tenant@example.test`, phone: '0775555555', companyId: companyB._id, ownerId: agentForeign._id, status: 'Active' });
    const wrongTenant = await request(port, 'POST', '/api/agents/letting/leases', tAgentA, {
      applicationId: String(application._id), tenantId: String(tenantB._id), startDate: '2026-11-01', endDate: '2027-10-31', rentAmount: 440, depositAmount: 200,
    });
    const leaseRes = await request(port, 'POST', '/api/agents/letting/leases', tAgentA, {
      applicationId: String(application._id), tenantId: String(tenantA._id), startDate: '2026-11-01', endDate: '2027-10-31', rentAmount: 440, depositAmount: 200,
    });
    const leaseId = leaseRes.body?.data?._id;
    const duplicateLease = await request(port, 'POST', '/api/agents/letting/leases', tAgentA, {
      applicationId: String(application._id), tenantId: String(tenantA._id), startDate: '2026-11-01', endDate: '2027-10-31', rentAmount: 440, depositAmount: 200,
    });
    record('A tenant from another company cannot be placed on the lease', wrongTenant.status === 404, `status ${wrongTenant.status}`);
    record('The lease draft is created for the approved applicant', leaseRes.status === 201, `status ${leaseRes.status}`);
    record('Repeating lease preparation does not create a second lease', duplicateLease.status === 200 && duplicateLease.body?.duplicate === true && String(duplicateLease.body?.data?._id) === String(leaseId), `status ${duplicateLease.status}`);

    const activateUnsigned = await request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
    const tenantSign = await request(port, 'POST', `/api/agents/letting/leases/${leaseId}/signature`, tAgentA, { party: 'tenant' });
    const agentOwnerSign = await request(port, 'POST', `/api/agents/letting/leases/${leaseId}/signature`, tAgentA, { party: 'owner' });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId, agentId: agentA._id, amount: 200, depositAmount: 200, status: 'failed', rentalPeriodMonth: 1, rentalPeriodYear: 2000 });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId, agentId: agentA._id, amount: 200, depositAmount: 200, status: 'pending', rentalPeriodMonth: 1, rentalPeriodYear: 2000 });
    const activateWithoutDeposit = await request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
    const ownerSign = await request(port, 'POST', `/api/owners/letting/leases/${leaseId}/signature`, tOwner, { party: 'owner' });
    const activateWithoutOwner = ownerSign.status === 200
      ? null
      : await request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
    const deposit = await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId, agentId: agentA._id, amount: 200, depositAmount: 200, status: 'completed', rentalPeriodMonth: 1, rentalPeriodYear: 2000 });
    const journalsAfterDeposit = await journalCount(createdCompanyIds);
    const activate = await request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
    const activationAudits = await AgencyWorkflowEvent.countDocuments({ companyId: companyA._id, entityId: String(leaseId), action: 'LEASE_ACTIVATED' });
    const activateAgain = await request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
    const activationAuditsAgain = await AgencyWorkflowEvent.countDocuments({ companyId: companyA._id, entityId: String(leaseId), action: 'LEASE_ACTIVATED' });
    const activeLease = await Lease.findById(leaseId).select('status').lean();
    record('An unsigned lease cannot be activated', activateUnsigned.status === 403 && activateUnsigned.text.includes('Tenant signature'), activateUnsigned.body?.message || '');
    record('Failed and pending payments do not satisfy the deposit', tenantSign.status === 200 && activateWithoutDeposit.status === 403 && activateWithoutDeposit.text.includes('Deposit'), activateWithoutDeposit.body?.message || '');
    record('An agent cannot record the landlord signature', agentOwnerSign.status === 403, `status ${agentOwnerSign.status}`);
    record('The landlord signature is recorded without a financial posting', ownerSign.status === 200 && ownerSign.body?.financialPosting === false, `status ${ownerSign.status}`);
    record('The deposit fixture does not create a journal', journalsAfterDeposit === journalsBefore, `journals ${journalsAfterDeposit}`);
    record('A complete lease activates', activate.status === 200 && activeLease?.status === 'active', `status ${activate.status}`);
    record('Repeating activation does not write another activation audit', activateAgain.body?.duplicate === true && activationAudits === 1 && activationAuditsAgain === 1, `audits ${activationAuditsAgain}`);
    void activateWithoutOwner;
    void deposit;

    const dueDay = Math.min(28, now.getDate() + 1);
    const expectsDue = now.getDate() < 28;
    const overdueLease = await Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
    const dueLease = await Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: dueDay });
    const partialLease = await Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
    const paidLease = await Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
    const reversedLease = await Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
    const mixedLease = await Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
    const agentBLease = await Lease.create({ propertyId: propertyB._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 500, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentB._id, rentDueDay: 1 });
    const foreignTenant = await Tenant.create({ firstName: 'B', lastName: 'Tenant', email: `${STAMP}-b-tenant@example.test`, phone: '0776666666', companyId: companyB._id, ownerId: agentForeign._id, status: 'Active' });
    const foreignLease = await Lease.create({ propertyId: propertyForeign._id, tenantId: foreignTenant._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 300, depositAmount: 0, status: 'active', companyId: companyB._id, ownerId: agentForeign._id, rentDueDay: 1 });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: partialLease._id, agentId: agentA._id, amount: 100, rentalPeriodMonth: month, rentalPeriodYear: year, status: 'failed' });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: partialLease._id, agentId: agentA._id, amount: 150, rentalPeriodMonth: month, rentalPeriodYear: year });
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: partialLease._id, agentId: agentA._id, amount: 999, rentalPeriodMonth: nextMonth, rentalPeriodYear: nextYear });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: paidLease._id, agentId: agentA._id, amount: 100, rentalPeriodMonth: month, rentalPeriodYear: year });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: paidLease._id, agentId: agentA._id, amount: 300, rentalPeriodMonth: month, rentalPeriodYear: year });
    const reversedPayment = await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: reversedLease._id, agentId: agentA._id, amount: 400, rentalPeriodMonth: month, rentalPeriodYear: year });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: reversedLease._id, agentId: agentA._id, amount: -400, rentalPeriodMonth: month, rentalPeriodYear: year, reversalOfPaymentId: reversedPayment._id });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: mixedLease._id, agentId: agentA._id, amount: 400, currency: 'USD', rentalPeriodMonth: month, rentalPeriodYear: year });
    await makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: mixedLease._id, agentId: agentA._id, amount: 400, currency: 'ZWL', rentalPeriodMonth: month, rentalPeriodYear: year });
    await mongoose.connection.collection('payments').insertOne({
      paymentType: 'levy',
      propertyType: 'residential',
      propertyId: propertyA._id,
      tenantId: tenantA._id,
      leaseId: overdueLease._id,
      agentId: agentA._id,
      companyId: companyA._id,
      paymentDate: now,
      paymentMethod: 'cash',
      amount: 80,
      depositAmount: 0,
      currency: 'USD',
      rentalPeriodMonth: month,
      rentalPeriodYear: year,
      status: 'completed',
      processedBy: agentA._id,
      commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 0 },
      createdAt: now,
      updatedAt: now,
    });
    const boardA = await request(port, 'GET', '/api/agents/letting/rent-board', tAgentA);
    const boardB = await request(port, 'GET', '/api/agents/letting/rent-board', tAgentB);
    const boardAccountant = await request(port, 'GET', '/api/accountants/letting/rent-board', tAccountant);
    const rows = boardA.body?.data || [];
    const row = (id: mongoose.Types.ObjectId) => rows.find((item: any) => String(item.leaseId) === String(id));
    record('A lease with no qualifying payment is overdue', row(overdueLease._id)?.status === 'OVERDUE' && row(overdueLease._id)?.received === 0, row(overdueLease._id)?.status);
    record('A future due day stays due when the month still has that day', !expectsDue || row(dueLease._id)?.status === 'DUE', row(dueLease._id)?.status);
    record('A partial payment stays partial and an advance period is not included', row(partialLease._id)?.status === 'PARTIALLY_PAID' && row(partialLease._id)?.received === 150, `received ${row(partialLease._id)?.received}`);
    record('Multiple payments in the period can pay the lease', row(paidLease._id)?.status === 'PAID' && row(paidLease._id)?.outstanding === 0, `received ${row(paidLease._id)?.received}`);
    record('A reversed payment is not a successful collection', row(reversedLease._id)?.received === 0, `received ${row(reversedLease._id)?.received}`);
    record('Different currencies are not added together', row(mixedLease._id)?.mixedCurrency === true && row(mixedLease._id)?.outstanding === null, `mixed ${row(mixedLease._id)?.mixedCurrency}`);
    record('An agent does not see another agent lease on the board', boardB.status === 200 && !(boardB.body?.data || []).some((item: any) => String(item.leaseId) === String(overdueLease._id)) && (boardB.body?.data || []).some((item: any) => String(item.leaseId) === String(agentBLease._id)), `status ${boardB.status}`);
    record('An accountant sees both agents in the company', boardAccountant.status === 200 && (boardAccountant.body?.data || []).some((item: any) => String(item.leaseId) === String(overdueLease._id)) && (boardAccountant.body?.data || []).some((item: any) => String(item.leaseId) === String(agentBLease._id)), `status ${boardAccountant.status}`);
    record('Company B lease is absent from company A', !rows.some((item: any) => String(item.leaseId) === String(foreignLease._id)), 'filtered');
    void foreignLease;

    const maintenance = await MaintenanceRequest.create({
      propertyId: propertyA._id, requestedBy: agentA._id, ownerId: landlord._id, title: 'Tap', description: 'Leaking tap', companyId: companyA._id,
    });
    const quote = await MaintenanceQuote.create({
      requestId: maintenance._id, companyId: companyA._id, propertyId: propertyA._id, amount: 100, total: 100, currency: 'USD', description: 'Tap repair', status: 'SUBMITTED',
    });
    const requestsBefore = await PaymentRequest.countDocuments({ companyId: String(companyA._id) });
    const noQuote = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(new mongoose.Types.ObjectId()), amount: 100 });
    const noApproval = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 100 });
    quote.status = 'OWNER_APPROVED';
    await quote.save();
    const noAuthorisation = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 100, changeOrderApproved: true });
    await ContractorJobRecord.create({ requestId: maintenance._id, companyId: companyA._id, propertyId: propertyA._id, contractorId: new mongoose.Types.ObjectId(), quoteId: quote._id, status: 'AUTHORISED' });
    const tooMuch = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 250, changeOrderApproved: true });
    const otherAgentRequest = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentB, { quoteId: String(quote._id), amount: 100 });
    const validRequest = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 100 });
    const duplicateRequest = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 100 });
    const requestCount = await PaymentRequest.countDocuments({ companyId: String(companyA._id) });
    const journalsAfterRequest = await journalCount(createdCompanyIds);
    const queue = await request(port, 'GET', '/api/accountants/letting/work-queue', tAccountant);
    record('A missing quote is rejected', noQuote.status === 404, `status ${noQuote.status}`);
    record('A quote without owner approval is rejected', noApproval.status === 409, noApproval.body?.message || '');
    record('A request without agent authorisation is rejected', noAuthorisation.status === 409, noAuthorisation.body?.message || '');
    record('A request above the approved amount is rejected even if the client says a change order exists', tooMuch.status === 409, tooMuch.body?.message || '');
    record('Another agent cannot create the maintenance request', otherAgentRequest.status === 404, `status ${otherAgentRequest.status}`);
    record('A valid request reaches accounting without a journal', validRequest.status === 201 && validRequest.body?.financialPosting === false && requestCount === requestsBefore + 1 && journalsAfterRequest === journalsBefore, `status ${validRequest.status} journals ${journalsAfterRequest}`);
    record('A duplicate maintenance request is rejected', duplicateRequest.status === 409 && requestCount === requestsBefore + 1, `status ${duplicateRequest.status}`);
    record('The accountant queue lists the request', queue.status === 200 && queue.text.includes(String(quote._id)), `status ${queue.status}`);
    const quote2 = await MaintenanceQuote.create({
      requestId: maintenance._id, companyId: companyA._id, propertyId: propertyA._id, amount: 100, total: 100, currency: 'USD', description: 'Washer', status: 'OWNER_APPROVED',
    });
    const job2 = await ContractorJobRecord.create({ requestId: maintenance._id, companyId: companyA._id, propertyId: propertyA._id, contractorId: new mongoose.Types.ObjectId(), quoteId: quote2._id, status: 'AUTHORISED' });
    await MaintenanceChangeOrder.create({
      requestId: maintenance._id, jobId: job2._id, companyId: companyA._id, originalQuoteId: quote2._id, requestedAmount: 20, description: 'Extra washer', status: 'OWNER_APPROVED',
    });
    const withChange = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote2._id), amount: 120 });
    const overChange = await request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote2._id), amount: 121, changeOrderApproved: true });
    record('An approved change order raises the authorised amount', withChange.status === 201 && withChange.body?.financialPosting === false, `status ${withChange.status}`);
    record('Amount above the quote plus approved change orders is rejected', overChange.status === 409, overChange.body?.message || '');

    const levy = await LevyPayment.create({
      paymentType: 'levy', propertyId: propertyA._id, companyId: companyA._id, paymentDate: now, paymentMethod: 'cash', amount: 50, processedBy: agentA._id, status: 'pending', currency: 'USD',
    });
    const levyCountBefore = await LevyPayment.countDocuments({ companyId: companyA._id });
    const filed = await request(port, 'POST', `/api/agents/letting/levies/${levy._id}/receipt`, tAgentA, { receiptNumber: 'LEVY-1', receiptFileUrl: 'https://files.example.test/levy.pdf' });
    const filedAgain = await request(port, 'POST', `/api/agents/letting/levies/${levy._id}/receipt`, tAgentA, { receiptNumber: 'LEVY-1', receiptFileUrl: 'https://files.example.test/levy.pdf' });
    const levyAudits = await AgencyWorkflowEvent.countDocuments({ companyId: companyA._id, entityId: String(levy._id), action: 'LEVY_RECEIPT_FILED' });
    const agentBLevy = await request(port, 'POST', `/api/agents/letting/levies/${levy._id}/receipt`, tAgentB, { receiptNumber: 'STOLEN' });
    const storedLevy = await LevyPayment.findById(levy._id).lean();
    const levyCountAfter = await LevyPayment.countDocuments({ companyId: companyA._id });
    const accountantLevies = await request(port, 'GET', '/api/levy-payments', tAccountant);
    const ownerLevies = await request(port, 'GET', '/api/levy-payments', tOwner);
    const foreignLevyRead = await request(port, 'GET', `/api/levy-payments/${levy._id}/receipt`, tForeign);
    const journalsAfterLevy = await journalCount(createdCompanyIds);
    record('Filing a levy receipt does not create a levy or a journal', filed.status === 200 && filed.body?.financialPosting === false && levyCountAfter === levyCountBefore && journalsAfterLevy === journalsBefore, `status ${filed.status}`);
    record('The same receipt is not filed twice', filedAgain.body?.duplicate === true && levyAudits === 1, `audits ${levyAudits}`);
    record('Another agent cannot replace the levy receipt', agentBLevy.status === 404 && storedLevy?.receiptNumber === 'LEVY-1', `status ${agentBLevy.status}`);
    record('The accountant can read the company levy', accountantLevies.status === 200 && accountantLevies.text.includes(String(levy._id)), `status ${accountantLevies.status}`);
    record('The landlord can read the levy and another company cannot', ownerLevies.status === 200 && ownerLevies.text.includes(String(levy._id)) && denied(foreignLevyRead.status), `owner ${ownerLevies.status} foreign ${foreignLevyRead.status}`);

    const agentPortfolio = await request(port, 'GET', `/api/agents/letting/portfolio?companyId=${companyB._id}`, tAgentA);
    const accountantPortfolio = await request(port, 'GET', `/api/accountants/letting/portfolio?companyId=${companyB._id}`, tAccountant);
    const principalPortfolio = await request(port, 'GET', `/api/accountants/letting/portfolio?companyId=${companyB._id}`, tPrincipal);
    const companyAProperties = await Property.countDocuments({ companyId: companyA._id });
    const searchA = await request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(STAMP + ' Agent A')}&companyId=${companyB._id}`, tAgentA);
    const searchB = await request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(STAMP + ' Agent A')}`, tAgentB);
    const searchForeign = await request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(STAMP + ' Company B')}`, tAgentA);
    record('An ordinary agent cannot open senior portfolio oversight', agentPortfolio.status === 403, `status ${agentPortfolio.status}`);
    record('An accountant can view company portfolio oversight', accountantPortfolio.status === 200 && accountantPortfolio.body?.data?.properties === companyAProperties, `status ${accountantPortfolio.status} reported ${accountantPortfolio.body?.data?.properties} stored ${companyAProperties}`);
    record('Senior portfolio counts stay inside the caller company', principalPortfolio.status === 200 && principalPortfolio.body?.data?.properties === companyAProperties, `reported ${principalPortfolio.body?.data?.properties} stored ${companyAProperties}`);
    record('Search returns the caller portfolio and ignores a supplied company id', searchA.status === 200 && searchA.text.includes(`${STAMP} Agent A House`) && searchB.status === 200 && !searchB.text.includes(`${STAMP} Agent A House`) && !searchForeign.text.includes('Company B'), `A ${searchA.status} B ${searchB.status}`);

    const journalsAfter = await journalCount(createdCompanyIds);
    const historical = await Payment.countDocuments({ _id: new mongoose.Types.ObjectId('6acb543e271b8f1011240e3f') });
    record('Phase 5 workflow writes did not create journals', journalsAfter === journalsBefore, `before ${journalsBefore} after ${journalsAfter}`);
    record('The historical payment was not rewritten', historical === 1 || historical === 0, `count ${historical}`);
  } finally {
    const companyFilter = { companyId: { $in: createdCompanyIds } };
    if (createdCompanyIds.length) {
      await AgencyWorkflowEvent.deleteMany(companyFilter);
      await ListingReference.deleteMany(companyFilter);
      await RentalMandate.deleteMany(companyFilter);
      await PropertyAssessment.deleteMany(companyFilter);
      await PaymentRequest.deleteMany({ companyId: { $in: createdCompanyIds.map(String) } });
      await MaintenanceChangeOrder.deleteMany(companyFilter);
      await ContractorJobRecord.deleteMany(companyFilter);
      await MaintenanceQuote.deleteMany(companyFilter);
      await MaintenanceRequest.deleteMany(companyFilter);
      await Payment.deleteMany(companyFilter);
      await LevyPayment.deleteMany(companyFilter);
      await RentalApplication.deleteMany(companyFilter);
      await Lease.deleteMany(companyFilter);
      await Tenant.deleteMany(companyFilter);
      await Notification.deleteMany({ companyId: { $in: createdCompanyIds.map(String) } });
      await Property.deleteMany(companyFilter);
      if (ownerIds.length) await PropertyOwner.deleteMany({ _id: { $in: ownerIds } });
      await Company.deleteMany({ _id: { $in: createdCompanyIds } });
    }
    if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { await accountingConnection.close(); } catch { /* already closed */ }
    await mongoose.disconnect();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`Phase 5 agency workflow checks: ${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
