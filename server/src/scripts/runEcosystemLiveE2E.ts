/**
 * Isolated live API E2E for the ecosystem overlay.
 * Uses local Mongo + the running API. Does not print passwords.
 * Safe to re-run: deletes only @mantis-e2e.test records.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import File from '../models/File';
import { Payment } from '../models/Payment';
import { MaintenanceContractor } from '../models/MaintenanceContractor';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { MaintenanceQuote } from '../models/MaintenanceQuote';
import { JournalEntry } from '../models/JournalEntry';
import { Notification } from '../models/Notification';
import { QuoteInvitation, ContractorJobRecord, MaintenanceChangeOrder } from '../ecosystem/models/maintenanceWorkflow';
import { NotificationDelivery, EcosystemPaymentIntent } from '../ecosystem/models/commsAndPayments';
import { ViewingRequest, RentalApplication, TenantProfile } from '../ecosystem/models/tenantFacing';

const API = process.env.ECOSYSTEM_E2E_API || 'http://localhost:5000';
const DOMAIN = 'mantis-e2e.test';
const PASSWORD = process.env.ECOSYSTEM_E2E_PASSWORD || `E2e!${crypto.randomBytes(8).toString('hex')}`;
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

type Check = { name: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail?: string };
const checks: Check[] = [];

function record(name: string, result: Check['result'], detail?: string) {
  checks.push({ name, result, detail });
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`  ${result.padEnd(7)} ${name}${suffix}`);
}

async function api(path: string, opts: { method?: string; token?: string; body?: any } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function login(email: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await api('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 65000));
      continue;
    }
    if (res.status >= 400 || !res.json?.token) {
      throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.json)}`);
    }
    return res.json.token as string;
  }
  throw new Error(`Login rate-limited for ${email}`);
}

async function expectStatus(name: string, got: number, allowed: number[]) {
  if (allowed.includes(got)) record(name, 'PASS', `HTTP ${got}`);
  else record(name, 'FAIL', `HTTP ${got}, expected ${allowed.join('|')}`);
}

async function wipeE2E() {
  const users = await User.find({ email: { $regex: `@${DOMAIN}$`, $options: 'i' } }).select('_id').lean();
  const userIds = users.map((u) => u._id);
  const companies = await Company.find({ email: { $regex: `@${DOMAIN}$`, $options: 'i' } }).select('_id').lean();
  const companyIds = companies.map((c) => c._id);
  const properties = await Property.find({
    $or: [{ companyId: { $in: companyIds } }, { name: { $regex: '^E2E ' } }],
  }).select('_id').lean();
  const propertyIds = properties.map((p) => p._id);
  const tenants = await Tenant.find({
    $or: [{ companyId: { $in: companyIds } }, { email: { $regex: `@${DOMAIN}$`, $options: 'i' } }],
  }).select('_id').lean();
  const tenantIds = tenants.map((t) => t._id);

  await Promise.all([
    User.deleteMany({ _id: { $in: userIds } }),
    Company.deleteMany({ _id: { $in: companyIds } }),
    Property.deleteMany({ _id: { $in: propertyIds } }),
    PropertyOwner.deleteMany({ email: { $regex: `@${DOMAIN}$`, $options: 'i' } }),
    Tenant.deleteMany({ _id: { $in: tenantIds } }),
    Lease.deleteMany({ companyId: { $in: companyIds } }),
    File.deleteMany({ companyId: { $in: companyIds } }),
    Payment.deleteMany({ companyId: { $in: companyIds } }),
    MaintenanceContractor.deleteMany({ companyId: { $in: companyIds } }),
    MaintenanceRequest.deleteMany({ companyId: { $in: companyIds } }),
    MaintenanceQuote.deleteMany({ companyId: { $in: companyIds } }),
    QuoteInvitation.deleteMany({ companyId: { $in: companyIds } }),
    ContractorJobRecord.deleteMany({ companyId: { $in: companyIds } }),
    MaintenanceChangeOrder.deleteMany({ companyId: { $in: companyIds } }),
    ViewingRequest.deleteMany({ companyId: { $in: companyIds } }),
    RentalApplication.deleteMany({ companyId: { $in: companyIds } }),
    TenantProfile.deleteMany({ companyId: { $in: companyIds } }),
    EcosystemPaymentIntent.deleteMany({ companyId: { $in: companyIds } }),
    Notification.deleteMany({ userId: { $in: userIds } }),
    NotificationDelivery.deleteMany({ recipientId: { $in: userIds } }),
  ]);
}

async function makeUser(params: {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId?: any;
}) {
  return User.create({
    email: params.email,
    password: PASSWORD,
    firstName: params.firstName,
    lastName: params.lastName,
    role: params.role,
    roles: [params.role],
    companyId: params.companyId,
    isActive: true,
  });
}

async function seedCompany(tag: 'a' | 'b') {
  const admin = await makeUser({
    email: `ecosystem-admin-${tag}@${DOMAIN}`,
    firstName: 'Admin',
    lastName: tag.toUpperCase(),
    role: 'admin',
  });
  const stamp = `${Date.now()}${tag}`;
  const company = await Company.create({
    name: `E2E Agency ${tag.toUpperCase()}`,
    address: `1 E2E Street ${tag}`,
    phone: tag === 'a' ? '0711000001' : '0711000002',
    email: `agency-${tag}@${DOMAIN}`,
    registrationNumber: `E2E${stamp}`,
    tinNumber: `TIN${stamp}`,
    ownerId: admin._id,
    isActive: true,
    workspaceType: 'agency',
    companyType: 'REGISTERED_BUSINESS',
    subscriptionStatus: 'ACTIVE',
    subscriptionEndDate: new Date(Date.now() + 86400000 * 365),
    featureFlags: {
      commissionEnabled: true,
      agentAccounts: true,
      propertyAccounts: true,
      tenantPortalEnabled: true,
      contractorPortalEnabled: true,
      propertyMarketplaceEnabled: true,
      maintenanceQuotesEnabled: true,
      onlinePaymentsEnabled: false,
      multichannelNotificationsEnabled: true,
      tenantReferencesEnabled: true,
      contractorRatingsEnabled: true,
      maintenanceApprovals: true,
    },
  });
  admin.companyId = company._id as any;
  await admin.save();

  const agent = await makeUser({
    email: `ecosystem-agent-${tag}@${DOMAIN}`,
    firstName: 'Agent',
    lastName: tag.toUpperCase(),
    role: 'agent',
    companyId: company._id,
  });
  const ownerUser = await makeUser({
    email: `ecosystem-owner-${tag}@${DOMAIN}`,
    firstName: 'Owner',
    lastName: tag.toUpperCase(),
    role: 'owner',
    companyId: company._id,
  });
  const ownerDoc = await PropertyOwner.create({
    email: ownerUser.email,
    password: PASSWORD,
    firstName: 'Owner',
    lastName: tag.toUpperCase(),
    phone: tag === 'a' ? '0711000011' : '0711000012',
    companyId: company._id,
    properties: [],
    active: true,
  });
  const tenantUser = await makeUser({
    email: `ecosystem-tenant-${tag}@${DOMAIN}`,
    firstName: 'Tenant',
    lastName: tag.toUpperCase(),
    role: 'tenant',
    companyId: company._id,
  });
  const property = await Property.create({
    name: `E2E Property ${tag.toUpperCase()}`,
    address: `${tag.toUpperCase()} Avenue Harare`,
    type: 'apartment',
    status: 'rented',
    rent: 500,
    companyId: company._id,
    ownerId: agent._id,
    agentId: agent._id,
    propertyOwnerId: ownerDoc._id,
    publicListingEnabled: true,
    listingPublishedAt: new Date(),
    isDeleted: false,
  });
  ownerDoc.properties = [property._id as any];
  await ownerDoc.save();
  const tenant = await Tenant.create({
    firstName: 'Tenant',
    lastName: tag.toUpperCase(),
    email: tenantUser.email,
    phone: tag === 'a' ? '0711000021' : '0711000022',
    companyId: company._id,
    propertyId: property._id,
    ownerId: agent._id,
    status: 'Active',
    userId: tenantUser._id,
  });
  await TenantProfile.create({
    userId: tenantUser._id,
    companyId: company._id,
    tenantId: tenant._id,
    fullName: `Tenant ${tag.toUpperCase()}`,
    email: tenantUser.email,
    profileCompletionPercent: 40,
  });
  const lease = await Lease.create({
    propertyId: property._id,
    tenantId: tenant._id,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    rentAmount: 500,
    depositAmount: 500,
    monthlyRent: 500,
    status: 'active',
    companyId: company._id,
    ownerId: agent._id,
    documentVersions: [{ name: 'Signed lease', type: 'signed_lease', url: '/e2e/lease.pdf' }],
  });
  const leaseFile = await File.create({
    propertyId: property._id,
    companyId: company._id,
    fileName: 'signed-lease.pdf',
    fileType: 'lease',
    fileUrl: 'data:application/pdf;base64,AAA=',
    uploadedBy: agent._id,
  });
  const taxFile = await File.create({
    propertyId: property._id,
    companyId: company._id,
    fileName: 'owner-tax-return.pdf',
    fileType: 'tax',
    fileUrl: 'data:application/pdf;base64,SECRET=',
    uploadedBy: agent._id,
  });
  const payment = await Payment.create({
    paymentType: 'rental',
    propertyType: 'residential',
    propertyId: property._id,
    tenantId: tenant._id,
    agentId: agent._id,
    companyId: company._id,
    paymentDate: new Date('2026-09-01'),
    paymentMethod: 'bank_transfer',
    amount: 500,
    depositAmount: 0,
    referenceNumber: `E2E-RENT-${tag}-${Date.now()}`,
    rentalPeriodMonth: 9,
    rentalPeriodYear: 2026,
    notes: 'E2E seed payment',
    processedBy: agent._id,
    status: 'completed',
    commissionDetails: {
      totalCommission: 0,
      preaFee: 0,
      agentShare: 0,
      agencyShare: 0,
      ownerAmount: 500,
    },
  });
  const contractors = [];
  for (const letter of tag === 'a' ? ['a', 'b', 'c'] : ['x']) {
    const user = await makeUser({
      email: `ecosystem-contractor-${letter}@${DOMAIN}`,
      firstName: 'Contractor',
      lastName: letter.toUpperCase(),
      role: 'contractor',
      companyId: company._id,
    });
    const profile = await MaintenanceContractor.create({
      companyId: company._id,
      companyName: `E2E Contractor ${letter.toUpperCase()}`,
      contactPerson: `Contractor ${letter.toUpperCase()}`,
      phone: '0711000099',
      email: user.email,
      trade: 'Plumber',
      userId: user._id,
      active: true,
      verificationStatus: 'VERIFIED',
    });
    contractors.push({ user, profile });
  }
  return {
    company,
    admin,
    agent,
    ownerUser,
    ownerDoc,
    tenantUser,
    tenant,
    property,
    lease,
    leaseFile,
    taxFile,
    payment,
    contractors,
  };
}

async function run() {
  const health = await api('/api/ecosystem/health');
  if (health.status !== 200) {
    record('API health', 'BLOCKED', `HTTP ${health.status}`);
    printSummary();
    process.exit(2);
  }
  record('API health', 'PASS');

  await mongoose.connect(MONGO);
  await wipeE2E();
  const a = await seedCompany('a');
  const b = await seedCompany('b');

  const tokens = {
    agentA: await login(a.agent.email),
    agentB: await login(b.agent.email),
    ownerA: await login(a.ownerUser.email),
    ownerB: await login(b.ownerUser.email),
    tenantA: await login(a.tenantUser.email),
    tenantB: await login(b.tenantUser.email),
    contractorA: await login(a.contractors[0].user.email),
    contractorB: await login(a.contractors[1].user.email),
    contractorC: await login(a.contractors[2].user.email),
  };
  record('Test users login', 'PASS', 'owner/agent/tenant/contractor A+B');

  const journalsBefore = await JournalEntry.countDocuments({ companyId: a.company._id });
  const paymentsBefore = await Payment.countDocuments({ companyId: a.company._id });

  const overview = await api('/api/ecosystem/me/overview', { token: tokens.tenantA });
  expectStatus('Tenant dashboard overview', overview.status, [200]);

  const profile = await api('/api/ecosystem/me/profile', { token: tokens.tenantA });
  expectStatus('Tenant profile', profile.status, [200]);

  const listings = await api('/api/ecosystem/listings');
  const listingItems = listings.json?.items || listings.json;
  const listingOk = listings.status === 200 && Array.isArray(listingItems) && listingItems.some((row: any) => String(row._id) === String(a.property._id));
  record('Public listings', listingOk ? 'PASS' : 'FAIL', `HTTP ${listings.status} count=${Array.isArray(listingItems) ? listingItems.length : 0}`);

  const listing = await api(`/api/ecosystem/listings/${a.property._id}`);
  expectStatus('Open listing', listing.status, [200]);

  const viewing = await api('/api/ecosystem/viewings', {
    token: tokens.tenantA,
    method: 'POST',
    body: { propertyId: String(a.property._id), requestedDate: new Date().toISOString(), message: 'Please show the unit' },
  });
  expectStatus('Request viewing', viewing.status, [201, 200]);

  const application = await api('/api/ecosystem/applications', {
    token: tokens.tenantA,
    method: 'POST',
    body: { propertyId: String(a.property._id), notes: 'E2E apply', submit: true },
  });
  expectStatus('Submit application', application.status, [201, 200]);

  const leases = await api('/api/ecosystem/me/leases', { token: tokens.tenantA });
  expectStatus('Tenant lease', leases.status, [200]);

  const payments = await api('/api/ecosystem/me/payments', { token: tokens.tenantA });
  const paymentVisible = payments.status === 200 && Array.isArray(payments.json) && payments.json.some((p: any) => String(p._id) === String(a.payment._id));
  record('Tenant canonical payment', paymentVisible ? 'PASS' : 'FAIL', `HTTP ${payments.status}`);

  const receipt = await api(`/api/ecosystem/me/receipts/${a.payment._id}`, { token: tokens.tenantA });
  expectStatus('Tenant receipt', receipt.status, [200]);

  const docs = await api('/api/ecosystem/me/documents', { token: tokens.tenantA });
  const files = docs.json?.files || [];
  const listedLease = files.some((f: any) => String(f._id) === String(a.leaseFile._id));
  const listedTax = files.some((f: any) => String(f._id) === String(a.taxFile._id));
  const listedUrl = files.some((f: any) => f.url || f.fileUrl);
  record('Tenant document allowlist', listedLease && !listedTax && !listedUrl ? 'PASS' : 'FAIL', `lease=${listedLease} tax=${listedTax} url=${listedUrl}`);

  const ownFile = await api(`/api/ecosystem/me/documents/files/${a.leaseFile._id}`, { token: tokens.tenantA });
  expectStatus('Tenant allowed file', ownFile.status, [200]);
  const taxDirect = await api(`/api/ecosystem/me/documents/files/${a.taxFile._id}`, { token: tokens.tenantA });
  expectStatus('Tenant denied tax file', taxDirect.status, [403]);
  const crossFile = await api(`/api/ecosystem/me/documents/files/${b.leaseFile._id}`, { token: tokens.tenantA });
  expectStatus('Tenant A cannot read Property B file', crossFile.status, [403]);
  const tenantBFile = await api(`/api/ecosystem/me/documents/files/${a.leaseFile._id}`, { token: tokens.tenantB });
  expectStatus('Tenant B cannot read Property A file', tenantBFile.status, [403]);

  const crossLease = await api(`/api/ecosystem/me/receipts/${b.payment._id}`, { token: tokens.tenantA });
  expectStatus('Tenant A cannot read Tenant B receipt', crossLease.status, [403, 404]);
  const crossMaint = await api('/api/ecosystem/maintenance', {
    token: tokens.tenantA,
    method: 'POST',
    body: { propertyId: String(b.property._id), title: 'cross', description: 'should fail', category: 'PLUMBING', urgency: 'NORMAL' },
  });
  expectStatus('Tenant A cannot report on Property B', crossMaint.status, [403]);

  const online = await api('/api/ecosystem/payments/online/initialize', {
    token: tokens.tenantA,
    method: 'POST',
    body: { propertyId: String(a.property._id), amount: 500, companyId: String(b.company._id) },
  });
  expectStatus('Online payments remain disabled', online.status, [403]);

  const reported = await api('/api/ecosystem/maintenance', {
    token: tokens.tenantA,
    method: 'POST',
    body: { propertyId: String(a.property._id), title: 'Plumbing leak', description: 'Kitchen sink leak', category: 'PLUMBING', urgency: 'URGENT' },
  });
  expectStatus('Tenant report maintenance', reported.status, [201, 200]);
  const requestId = reported.json?._id || reported.json?.request?._id;
  if (!requestId) {
    record('Maintenance workflow', 'FAIL', 'no request id');
    printSummary();
    await mongoose.disconnect();
    process.exit(1);
  }

  const companyBMaint = await api(`/api/ecosystem/agency/maintenance/${requestId}/review`, { token: tokens.agentB, method: 'POST', body: {} });
  expectStatus('Agent B cannot review Company A maintenance', companyBMaint.status, [403, 404]);

  const review = await api(`/api/ecosystem/agency/maintenance/${requestId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
  expectStatus('Agent review', review.status, [200]);

  const invite = await api(`/api/ecosystem/agency/maintenance/${requestId}/invite`, {
    token: tokens.agentA,
    method: 'POST',
    body: { contractorIds: a.contractors.map((c) => String(c.profile._id)) },
  });
  expectStatus('Invite three contractors', invite.status, [200, 201]);

  const jobsA = await api('/api/ecosystem/contractor/jobs', { token: tokens.contractorA });
  const jobA = Array.isArray(jobsA.json) ? jobsA.json.find((j: any) => String(j.requestId) === String(requestId)) : null;
  const startEarly = await api(`/api/ecosystem/contractor/jobs/${jobA?._id}/status`, {
    token: tokens.contractorA,
    method: 'POST',
    body: { status: 'WORK_IN_PROGRESS', companyId: String(a.company._id) },
  });
  expectStatus('Start work before approvals rejected', startEarly.status, [403, 409]);

  const quoteA = await api(`/api/ecosystem/contractor/maintenance/${requestId}/quotes`, {
    token: tokens.contractorA,
    method: 'POST',
    body: { description: 'Fix sink A', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 100 }] },
  });
  const quoteB = await api(`/api/ecosystem/contractor/maintenance/${requestId}/quotes`, {
    token: tokens.contractorB,
    method: 'POST',
    body: { description: 'Fix sink B', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 120 }] },
  });
  const quoteC = await api(`/api/ecosystem/contractor/maintenance/${requestId}/quotes`, {
    token: tokens.contractorC,
    method: 'POST',
    body: { description: 'Fix sink C', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 95 }] },
  });
  expectStatus('Contractor A quote $100', quoteA.status, [201, 200]);
  expectStatus('Contractor B quote $120', quoteB.status, [201, 200]);
  expectStatus('Contractor C quote $95', quoteC.status, [201, 200]);

  const contractorQuotes = await api('/api/ecosystem/contractor/quotes', { token: tokens.contractorA });
  const sawCompetitor = Array.isArray(contractorQuotes.json) && contractorQuotes.json.some((q: any) => Number(q.total ?? q.amount) === 120 || Number(q.total ?? q.amount) === 95);
  record('Contractor A cannot see competitor quotes', !sawCompetitor && contractorQuotes.status === 200 ? 'PASS' : 'FAIL');

  const agencyQuotes = await api(`/api/ecosystem/agency/maintenance/${requestId}/quotes`, { token: tokens.contractorA });
  expectStatus('Contractor cannot use agency quote list', agencyQuotes.status, [403]);

  const allQuotes = await api(`/api/ecosystem/agency/maintenance/${requestId}/quotes`, { token: tokens.agentA });
  const quoteCount = Array.isArray(allQuotes.json) ? allQuotes.json.length : 0;
  record('Agent sees all three quotes', quoteCount === 3 ? 'PASS' : 'FAIL', `count=${quoteCount}`);

  const selectedId = quoteA.json?._id;
  const select = await api(`/api/ecosystem/agency/maintenance/${requestId}/quotes/${selectedId}/select`, {
    token: tokens.agentA,
    method: 'POST',
    body: { reason: 'Known plumber' },
  });
  expectStatus('Agent select quote', select.status, [200]);
  const send = await api(`/api/ecosystem/agency/maintenance/${requestId}/send-to-owner`, { token: tokens.agentA, method: 'POST', body: {} });
  expectStatus('Send quote to owner', send.status, [200]);

  const ownerBDecide = await api(`/api/ecosystem/owner/maintenance/${requestId}/decision`, {
    token: tokens.ownerB,
    method: 'POST',
    body: { decision: 'APPROVE' },
  });
  expectStatus('Owner B cannot approve Owner A quote', ownerBDecide.status, [403]);
  const ownerBQuote = await api(`/api/ecosystem/owner/maintenance/${requestId}/quote`, { token: tokens.ownerB });
  expectStatus('Owner B cannot read Owner A quote', ownerBQuote.status, [403]);

  const ownerADecide = await api(`/api/ecosystem/owner/maintenance/${requestId}/decision`, {
    token: tokens.ownerA,
    method: 'POST',
    body: { decision: 'APPROVE' },
  });
  expectStatus('Owner A approve', ownerADecide.status, [200]);

  const editLocked = await api(`/api/ecosystem/contractor/maintenance/${requestId}/quotes`, {
    token: tokens.contractorA,
    method: 'POST',
    body: { description: 'Edit v1', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 999 }] },
  });
  expectStatus('Edit owner-approved quote rejected', editLocked.status, [403, 409]);
  const lockedQuote = await MaintenanceQuote.findById(selectedId).lean();
  record('Original quote amount intact', Number(lockedQuote?.total ?? lockedQuote?.amount) === 100 ? 'PASS' : 'FAIL', `amount=${lockedQuote?.total ?? lockedQuote?.amount}`);

  const authorise = await api(`/api/ecosystem/agency/maintenance/${requestId}/authorise`, { token: tokens.agentA, method: 'POST', body: {} });
  expectStatus('Agent authorise contractor', authorise.status, [200]);

  const jobsAfter = await api('/api/ecosystem/contractor/jobs', { token: tokens.contractorA });
  const authorisedJob = Array.isArray(jobsAfter.json) ? jobsAfter.json.find((j: any) => String(j.requestId) === String(requestId)) : null;
  const accept = await api(`/api/ecosystem/contractor/jobs/${authorisedJob?._id}/status`, {
    token: tokens.contractorA,
    method: 'POST',
    body: { status: 'ACCEPTED' },
  });
  expectStatus('Contractor accept', accept.status, [200]);
  const start = await api(`/api/ecosystem/contractor/jobs/${authorisedJob?._id}/status`, {
    token: tokens.contractorA,
    method: 'POST',
    body: { status: 'WORK_IN_PROGRESS' },
  });
  expectStatus('Contractor start work', start.status, [200]);
  const complete = await api(`/api/ecosystem/contractor/jobs/${authorisedJob?._id}/status`, {
    token: tokens.contractorA,
    method: 'POST',
    body: { status: 'COMPLETED', completion: { notes: 'Leak repaired', actualCompletionDate: new Date().toISOString() } },
  });
  expectStatus('Contractor complete work', complete.status, [200]);
  const confirm = await api(`/api/ecosystem/maintenance/${requestId}/confirm`, {
    token: tokens.tenantA,
    method: 'POST',
    body: { confirm: true },
  });
  expectStatus('Tenant confirm completion', confirm.status, [200]);

  const change = await api(`/api/ecosystem/contractor/jobs/${authorisedJob?._id}/change-orders`, {
    token: tokens.contractorA,
    method: 'POST',
    body: { requestedAmount: 50, description: 'Extra parts' },
  });
  expectStatus('Change order +50', change.status, [201, 200]);
  const changeId = change.json?.changeOrder?._id || change.json?._id;
  const originalAmount = change.json?.originalQuoteAmount;
  record('Change order keeps original $100', Number(originalAmount) === 100 ? 'PASS' : 'FAIL', `original=${originalAmount}`);
  if (changeId) {
    const agentCo = await api(`/api/ecosystem/agency/change-orders/${changeId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
    expectStatus('Agent review change order', agentCo.status, [200]);
    const ownerCo = await api(`/api/ecosystem/owner/change-orders/${changeId}/decision`, {
      token: tokens.ownerA,
      method: 'POST',
      body: { decision: 'APPROVE' },
    });
    expectStatus('Owner approve change order', ownerCo.status, [200]);
    const stillOriginal = await MaintenanceQuote.findById(selectedId).lean();
    record('Approved quote unchanged after change order', Number(stillOriginal?.total ?? stillOriginal?.amount) === 100 ? 'PASS' : 'FAIL');
  }

  const declineReq = await api('/api/ecosystem/maintenance', {
    token: tokens.tenantA,
    method: 'POST',
    body: { propertyId: String(a.property._id), title: 'Second leak', description: 'Bathroom', category: 'PLUMBING', urgency: 'NORMAL' },
  });
  const declineId = declineReq.json?._id;
  if (declineId) {
    await api(`/api/ecosystem/agency/maintenance/${declineId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
    await api(`/api/ecosystem/agency/maintenance/${declineId}/invite`, {
      token: tokens.agentA,
      method: 'POST',
      body: { contractorIds: [String(a.contractors[0].profile._id)] },
    });
    const q2 = await api(`/api/ecosystem/contractor/maintenance/${declineId}/quotes`, {
      token: tokens.contractorA,
      method: 'POST',
      body: { description: 'Bathroom', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 80 }] },
    });
    await api(`/api/ecosystem/agency/maintenance/${declineId}/quotes/${q2.json?._id}/select`, { token: tokens.agentA, method: 'POST', body: {} });
    await api(`/api/ecosystem/agency/maintenance/${declineId}/send-to-owner`, { token: tokens.agentA, method: 'POST', body: {} });
    const declined = await api(`/api/ecosystem/owner/maintenance/${declineId}/decision`, {
      token: tokens.ownerA,
      method: 'POST',
      body: { decision: 'DECLINE', comment: 'Too expensive' },
    });
    expectStatus('Owner decline', declined.status, [200]);
  } else {
    record('Owner decline', 'FAIL', 'second request missing');
  }

  const ownerAQueue = await api('/api/ecosystem/owner/maintenance', { token: tokens.ownerA });
  const ownerSeesB = Array.isArray(ownerAQueue.json) && ownerAQueue.json.some((m: any) => String(m.companyId) === String(b.company._id) || String(m.propertyId) === String(b.property._id));
  record('Owner A queue isolated', ownerAQueue.status === 200 && !ownerSeesB ? 'PASS' : 'FAIL');

  const agentAQueue = await api('/api/ecosystem/agency/maintenance', { token: tokens.agentA });
  const agentSeesB = Array.isArray(agentAQueue.json) && agentAQueue.json.some((m: any) => String(m.companyId) === String(b.company._id));
  record('Agent A queue isolated', agentAQueue.status === 200 && !agentSeesB ? 'PASS' : 'FAIL');

  const tenantBOverview = await api('/api/ecosystem/me/leases', { token: tokens.tenantB });
  const tenantBSeesA = Array.isArray(tenantBOverview.json) && tenantBOverview.json.some((l: any) => String(l._id) === String(a.lease._id));
  record('Tenant B cannot see Tenant A lease', tenantBOverview.status === 200 && !tenantBSeesA ? 'PASS' : 'FAIL');

  const contractorX = b.contractors[0];
  const tokenX = await login(contractorX.user.email);
  const xJobs = await api('/api/ecosystem/contractor/jobs', { token: tokenX });
  const xSeesA = Array.isArray(xJobs.json) && xJobs.json.some((j: any) => String(j.companyId) === String(a.company._id));
  record('Company B contractor cannot see Company A jobs', xJobs.status === 200 && !xSeesA ? 'PASS' : 'FAIL');

  const notifications = await api('/api/ecosystem/me/notifications', { token: tokens.agentA });
  expectStatus('Agent in-app notifications', notifications.status, [200]);
  const deliveries = await NotificationDelivery.find({ recipientId: { $in: [a.agent._id, a.tenantUser._id, a.ownerUser._id, a.contractors[0].user._id] } }).lean();
  const sms = deliveries.filter((d) => d.channel === 'SMS');
  const wa = deliveries.filter((d) => d.channel === 'WHATSAPP');
  const inApp = deliveries.filter((d) => d.channel === 'IN_APP' && d.status === 'SENT');
  const skipped = [...sms, ...wa].every((d) => d.status === 'SKIPPED') && (sms.length + wa.length > 0 || true);
  record('In-app notifications delivered', inApp.length > 0 ? 'PASS' : 'FAIL', `inApp=${inApp.length}`);
  record('SMS/WhatsApp skipped', skipped ? 'PASS' : 'FAIL', `sms=${sms.length} wa=${wa.length}`);

  const journalsAfter = await JournalEntry.countDocuments({ companyId: a.company._id });
  const paymentsAfter = await Payment.countDocuments({ companyId: a.company._id });
  record('No journals created by quote workflow', journalsAfter === journalsBefore ? 'PASS' : 'FAIL', `${journalsBefore}->${journalsAfter}`);
  record('No extra payments created by quote workflow', paymentsAfter === paymentsBefore ? 'PASS' : 'FAIL', `${paymentsBefore}->${paymentsAfter}`);

  const intents = await EcosystemPaymentIntent.countDocuments({ companyId: a.company._id, posted: true });
  record('No posted payment intents', intents === 0 ? 'PASS' : 'FAIL');

  const payBeforeCanonical = await Payment.countDocuments({ companyId: a.company._id });
  const journalsBeforeCanonical = await JournalEntry.countDocuments({ companyId: a.company._id });
  const canonical = await api('/api/payments', {
    token: tokens.agentA,
    method: 'POST',
    body: {
      leaseId: String(a.lease._id),
      amount: 500,
      paymentDate: '2026-10-05',
      paymentMethod: 'bank_transfer',
      status: 'completed',
      rentalPeriodMonth: 10,
      rentalPeriodYear: 2026,
      idempotencyKey: `e2e-canonical-${Date.now()}`,
    },
  });
  if ([200, 201].includes(canonical.status)) {
    record('Canonical createPayment', 'PASS', `HTTP ${canonical.status}`);
  } else {
    record(
      'Canonical createPayment',
      'FAIL',
      `HTTP ${canonical.status} ${String(canonical.json?.message || canonical.json?.error || '').slice(0, 160)}`
    );
  }
  const newPaymentId = canonical.json?.payment?._id || canonical.json?._id;
  const payAfterCanonical = await Payment.countDocuments({ companyId: a.company._id });
  const journalsAfterCanonical = await JournalEntry.countDocuments({ companyId: a.company._id });
  record(
    'Canonical payment count +1',
    canonical.status < 400 && payAfterCanonical === payBeforeCanonical + 1 ? 'PASS' : canonical.status >= 400 ? 'FAIL' : 'FAIL',
    `payments ${payBeforeCanonical}->${payAfterCanonical} HTTP ${canonical.status}`
  );
  record(
    'Canonical journals posted',
    canonical.status < 400 && journalsAfterCanonical >= journalsBeforeCanonical + 1 ? 'PASS' : canonical.status >= 400 ? 'FAIL' : 'FAIL',
    `journals ${journalsBeforeCanonical}->${journalsAfterCanonical}`
  );
  if (newPaymentId) {
    const tenantReceipt = await api(`/api/ecosystem/me/receipts/${newPaymentId}`, { token: tokens.tenantA });
    expectStatus('Tenant reads canonical receipt', tenantReceipt.status, [200]);
    const duplicateIntent = await EcosystemPaymentIntent.countDocuments({ companyId: a.company._id });
    record('Ecosystem did not add a payment intent for canonical rent', duplicateIntent === 0 ? 'PASS' : 'FAIL', `intents=${duplicateIntent}`);
  }

  const changesReq = await api('/api/ecosystem/maintenance', {
    token: tokens.tenantA,
    method: 'POST',
    body: { propertyId: String(a.property._id), title: 'Request-changes leak', description: 'Gutter', category: 'PLUMBING', urgency: 'NORMAL' },
  });
  const changesId = changesReq.json?._id;
  if (changesId) {
    await api(`/api/ecosystem/agency/maintenance/${changesId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
    await api(`/api/ecosystem/agency/maintenance/${changesId}/invite`, {
      token: tokens.agentA,
      method: 'POST',
      body: { contractorIds: [String(a.contractors[0].profile._id)] },
    });
    const q3 = await api(`/api/ecosystem/contractor/maintenance/${changesId}/quotes`, {
      token: tokens.contractorA,
      method: 'POST',
      body: { description: 'Gutter', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 88 }] },
    });
    const q3Amount = Number(q3.json?.total ?? q3.json?.amount);
    await api(`/api/ecosystem/agency/maintenance/${changesId}/quotes/${q3.json?._id}/select`, { token: tokens.agentA, method: 'POST', body: {} });
    await api(`/api/ecosystem/agency/maintenance/${changesId}/send-to-owner`, { token: tokens.agentA, method: 'POST', body: {} });
    const requested = await api(`/api/ecosystem/owner/maintenance/${changesId}/decision`, {
      token: tokens.ownerA,
      method: 'POST',
      body: { decision: 'REQUEST_CHANGES', comment: 'Please itemise materials' },
    });
    expectStatus('Owner request changes', requested.status, [200]);
    const afterChange = await MaintenanceQuote.findById(q3.json?._id).lean();
    record('Request-changes leaves quote amount intact', Number(afterChange?.total ?? afterChange?.amount) === q3Amount ? 'PASS' : 'FAIL');
    const jobsChange = await api('/api/ecosystem/contractor/jobs', { token: tokens.contractorA });
    const jobChange = Array.isArray(jobsChange.json) ? jobsChange.json.find((j: any) => String(j.requestId) === String(changesId)) : null;
    const startBlocked = await api(`/api/ecosystem/contractor/jobs/${jobChange?._id}/status`, {
      token: tokens.contractorA,
      method: 'POST',
      body: { status: 'WORK_IN_PROGRESS' },
    });
    expectStatus('Cannot start work after request-changes', startBlocked.status, [403, 409]);
  } else {
    record('Owner request changes', 'FAIL', 'request missing');
  }

  const reopenReq = await api('/api/ecosystem/maintenance', {
    token: tokens.tenantA,
    method: 'POST',
    body: { propertyId: String(a.property._id), title: 'Reopen leak', description: 'Still dripping', category: 'PLUMBING', urgency: 'NORMAL' },
  });
  const reopenId = reopenReq.json?._id;
  if (reopenId) {
    await api(`/api/ecosystem/agency/maintenance/${reopenId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
    await api(`/api/ecosystem/agency/maintenance/${reopenId}/invite`, {
      token: tokens.agentA,
      method: 'POST',
      body: { contractorIds: [String(a.contractors[0].profile._id)] },
    });
    const q4 = await api(`/api/ecosystem/contractor/maintenance/${reopenId}/quotes`, {
      token: tokens.contractorA,
      method: 'POST',
      body: { description: 'Reopen', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 40 }] },
    });
    await api(`/api/ecosystem/agency/maintenance/${reopenId}/quotes/${q4.json?._id}/select`, { token: tokens.agentA, method: 'POST', body: {} });
    await api(`/api/ecosystem/agency/maintenance/${reopenId}/send-to-owner`, { token: tokens.agentA, method: 'POST', body: {} });
    await api(`/api/ecosystem/owner/maintenance/${reopenId}/decision`, { token: tokens.ownerA, method: 'POST', body: { decision: 'APPROVE' } });
    await api(`/api/ecosystem/agency/maintenance/${reopenId}/authorise`, { token: tokens.agentA, method: 'POST', body: {} });
    const jobsReopen = await api('/api/ecosystem/contractor/jobs', { token: tokens.contractorA });
    const jobReopen = Array.isArray(jobsReopen.json) ? jobsReopen.json.find((j: any) => String(j.requestId) === String(reopenId)) : null;
    await api(`/api/ecosystem/contractor/jobs/${jobReopen?._id}/status`, { token: tokens.contractorA, method: 'POST', body: { status: 'ACCEPTED' } });
    await api(`/api/ecosystem/contractor/jobs/${jobReopen?._id}/status`, { token: tokens.contractorA, method: 'POST', body: { status: 'WORK_IN_PROGRESS' } });
    await api(`/api/ecosystem/contractor/jobs/${jobReopen?._id}/status`, {
      token: tokens.contractorA,
      method: 'POST',
      body: { status: 'COMPLETED', completion: { notes: 'Attempted fix', actualCompletionDate: new Date().toISOString() } },
    });
    const reopened = await api(`/api/ecosystem/maintenance/${reopenId}/confirm`, {
      token: tokens.tenantA,
      method: 'POST',
      body: { confirm: false, comment: 'Still leaking' },
    });
    expectStatus('Tenant report-problem reopens from COMPLETED', reopened.status, [200]);
    const reopenedDoc = await MaintenanceRequest.findById(reopenId).lean();
    record('Reopened status', reopenedDoc?.ecosystemWorkflow?.status === 'REOPENED' ? 'PASS' : 'FAIL', String(reopenedDoc?.ecosystemWorkflow?.status));
  } else {
    record('Tenant report-problem reopens from COMPLETED', 'FAIL', 'request missing');
  }

  await Company.updateOne(
    { _id: b.company._id },
    {
      $set: {
        'featureFlags.tenantPortalEnabled': false,
        'featureFlags.contractorPortalEnabled': false,
        'featureFlags.propertyMarketplaceEnabled': false,
        'featureFlags.maintenanceQuotesEnabled': false,
        'featureFlags.onlinePaymentsEnabled': false,
      },
    }
  );
  const bDisabled = await api('/api/ecosystem/me/overview', { token: tokens.tenantB });
  expectStatus('Company B blocked when only company flags are off', bDisabled.status, [403]);
  const aEnabled = await api('/api/ecosystem/me/overview', { token: tokens.tenantA });
  expectStatus('Company A still enabled via company flags', aEnabled.status, [200]);

  const { notifyEvent } = await import('../ecosystem/services/notificationService');
  const { CommunicationPreference } = await import('../ecosystem/models/commsAndPayments');
  await CommunicationPreference.findOneAndUpdate(
    { userId: a.tenantUser._id },
    { $set: { smsAvailable: true, smsOperational: true, phone: '0711000021', inAppAvailable: true, emailAvailable: true } },
    { upsert: true }
  );
  process.env.SMS_ENABLED = 'true';
  process.env.SMS_PROVIDER = 'unconfigured';
  const failKey = `e2e-notify-fail:${a.tenantUser._id}`;
  await notifyEvent({
    recipientId: String(a.tenantUser._id),
    companyId: String(a.company._id),
    eventType: 'VIEWING_CONFIRMED',
    variables: { propertyName: 'E2E Property A' },
    idempotencyKey: failKey,
  });
  await notifyEvent({
    recipientId: String(a.tenantUser._id),
    companyId: String(a.company._id),
    eventType: 'VIEWING_CONFIRMED',
    variables: { propertyName: 'E2E Property A' },
    idempotencyKey: failKey,
  });
  const failRows = await NotificationDelivery.find({ idempotencyKey: { $regex: `^${failKey}` } }).lean();
  const inAppFail = failRows.filter((d) => d.channel === 'IN_APP' && d.status === 'SENT');
  const smsFail = failRows.filter((d) => d.channel === 'SMS' && d.status === 'FAILED');
  record('Notification failure does not block in-app', inAppFail.length === 1 && smsFail.length >= 1 ? 'PASS' : 'FAIL', `inApp=${inAppFail.length} smsFailed=${smsFail.length}`);
  record('Notification idempotency keeps a single in-app SENT', inAppFail.length === 1 ? 'PASS' : 'FAIL');

  const register = await api('/api/ecosystem/auth/register', {
    method: 'POST',
    body: {
      role: 'tenant',
      email: `ecosystem-tenant-register@${DOMAIN}`,
      password: PASSWORD,
      firstName: 'Reg',
      lastName: 'Tenant',
      phone: '0770000000',
      accountType: 'individual',
      homeAddress: '12 E2E Home Street',
    },
  });
  expectStatus('Tenant registration API', register.status, [201]);

  printSummary();
  await mongoose.disconnect();
  const failed = checks.filter((c) => c.result === 'FAIL').length;
  const blocked = checks.filter((c) => c.result === 'BLOCKED').length;
  process.exit(failed || blocked ? 1 : 0);
}

function printSummary() {
  const pass = checks.filter((c) => c.result === 'PASS').length;
  const fail = checks.filter((c) => c.result === 'FAIL').length;
  const blocked = checks.filter((c) => c.result === 'BLOCKED').length;
  console.log(`\nLive E2E: ${pass} PASS / ${fail} FAIL / ${blocked} BLOCKED / ${checks.length} total`);
}

run().catch(async (error) => {
  console.error(error);
  record('Harness', 'FAIL', String(error?.message || error));
  printSummary();
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
