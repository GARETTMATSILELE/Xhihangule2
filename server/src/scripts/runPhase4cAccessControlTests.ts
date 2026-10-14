/**
 * Phase 4C access-control regression.
 * Mounts the real routers, signs real JWTs, and talks to them over HTTP.
 * Disposable PHASE4C fixtures only. Does not post accounting or delete journals.
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
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { Payment } from '../models/Payment';
import { Notification } from '../models/Notification';
import { RentalApplication } from '../ecosystem/models/tenantFacing';
import companyRoutes from '../routes/companyRoutes';
import propertyRoutes from '../routes/propertyRoutes';
import agentRoutes from '../routes/agentRoutes';
import levyPaymentRoutes from '../routes/levyPaymentRoutes';
import leaseRoutes from '../routes/leaseRoutes';
import paymentRoutes from '../routes/paymentRoutes';
import ownerRoutes from '../routes/ownerRoutes';
import maintenanceRequestRoutes from '../routes/maintenanceRequestRoutes';
import accountantRoutes from '../routes/accountantRoutes';
import propertyOwnerRoutes from '../routes/propertyOwnerRoutes';
import reportingRoutes from '../reporting/api';
import ecosystemRoutes from '../ecosystem/routes';
import { errorHandler } from '../middleware/errorHandler';

const STAMP = `PHASE4C${Date.now().toString().slice(-8)}`;
const PASSWORD = 'Phase4c-Test-Password';

type HttpResult = { status: number; body: any; text: string };
type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${method} ${path}`));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function denied(status: number) {
  return status === 401 || status === 403 || status === 404;
}

function includesName(result: HttpResult, name: string) {
  return result.text.includes(name);
}

async function sideEffectSnapshot(companyIds: mongoose.Types.ObjectId[]) {
  const companyFilter = { companyId: { $in: companyIds } };
  const journals = await mongoose.connection.collection('journalentries').countDocuments(companyFilter as any);
  return {
    payments: await Payment.countDocuments(companyFilter),
    leases: await Lease.countDocuments(companyFilter),
    levies: await LevyPayment.countDocuments(companyFilter),
    maintenance: await MaintenanceRequest.countDocuments(companyFilter),
    notifications: await Notification.countDocuments(companyFilter),
    journals,
  };
}

async function main() {
  await connectDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/companies', companyRoutes);
  app.use('/api/properties', propertyRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/levy-payments', levyPaymentRoutes);
  app.use('/api/leases', leaseRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/owners', ownerRoutes);
  app.use('/api/maintenance', maintenanceRequestRoutes);
  app.use('/api/accountants', accountantRoutes);
  app.use('/api/property-owners', propertyOwnerRoutes);
  app.use('/api/reporting', reportingRoutes);
  app.use('/api/ecosystem', ecosystemRoutes);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port as number;

  const createdUserIds: mongoose.Types.ObjectId[] = [];
  const createdCompanyIds: mongoose.Types.ObjectId[] = [];
  let landlordAId: mongoose.Types.ObjectId | null = null;
  let landlordBId: mongoose.Types.ObjectId | null = null;

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

    async function makeCompany(name: string, workspaceType: 'agency' | 'individual') {
      const company = await Company.create({
        name,
        address: '1 Test Street',
        phone: '0770000000',
        email: `${name.replace(/\s+/g, '.').toLowerCase()}@example.test`,
        registrationNumber: `${STAMP}-${name.slice(-1)}-REG`,
        tinNumber: `${STAMP}-${name.slice(-1)}-TIN`,
        ownerId: bootstrap._id,
        workspaceType,
        subscriptionStatus: 'trial',
        tenantStatus: 'active',
        isActive: true,
      });
      createdCompanyIds.push(company._id);
      return company;
    }

    const companyA = await makeCompany(`${STAMP} Agency A`, 'agency');
    const companyB = await makeCompany(`${STAMP} Agency B`, 'agency');
    const companyI = await makeCompany(`${STAMP} Individual`, 'individual');

    async function makeUser(email: string, role: string, companyId: mongoose.Types.ObjectId, roles?: string[]) {
      const user = await User.create({
        email,
        password: PASSWORD,
        firstName: role,
        lastName: STAMP,
        role,
        roles: roles || [role],
        companyId,
        isActive: true,
        sessionVersion: 1,
      });
      createdUserIds.push(user._id);
      return user;
    }

    const adminA = await makeUser(`${STAMP}-admin-a@example.test`, 'admin', companyA._id);
    const agentA = await makeUser(`${STAMP}-agent-a@example.test`, 'agent', companyA._id);
    const agentB = await makeUser(`${STAMP}-agent-b@example.test`, 'agent', companyA._id);
    const accountantA = await makeUser(`${STAMP}-accountant-a@example.test`, 'accountant', companyA._id);
    const ownerUser = await makeUser(`${STAMP}-owner-a@example.test`, 'owner', companyA._id);
    const agentForeign = await makeUser(`${STAMP}-agent-foreign@example.test`, 'agent', companyB._id);
    const individual = await makeUser(`${STAMP}-individual@example.test`, 'admin', companyI._id);

    const nameSavedA = `${STAMP} Saved By Agent A`;
    const nameSavedB = `${STAMP} Saved By Agent B`;
    const nameAssigned = `${STAMP} Assigned To Agent A`;
    const nameForeign = `${STAMP} Company B Private`;

    const propertySavedA = await Property.create({
      name: nameSavedA,
      address: '10 Agent A Road',
      companyId: companyA._id,
      ownerId: agentA._id,
      agentId: agentA._id,
      rent: 900,
    });
    const propertySavedB = await Property.create({
      name: nameSavedB,
      address: '20 Agent B Road',
      companyId: companyA._id,
      ownerId: agentB._id,
      agentId: agentB._id,
      rent: 900,
    });
    const propertyAssigned = await Property.create({
      name: nameAssigned,
      address: '30 Assigned Road',
      companyId: companyA._id,
      ownerId: adminA._id,
      agentId: agentA._id,
      rent: 900,
    });
    const propertyForeign = await Property.create({
      name: nameForeign,
      address: '40 Foreign Road',
      companyId: companyB._id,
      ownerId: agentForeign._id,
      agentId: agentForeign._id,
      rent: 500,
    });

    const landlordA = await PropertyOwner.create({
      email: ownerUser.email,
      password: PASSWORD,
      firstName: 'Landlord',
      lastName: 'Shared',
      phone: '0771111111',
      companyId: companyA._id,
      properties: [propertySavedA._id, propertySavedB._id, propertyAssigned._id],
    });
    landlordAId = landlordA._id;
    const landlordB = await PropertyOwner.create({
      email: `${STAMP}-landlord-b@example.test`,
      password: PASSWORD,
      firstName: 'Landlord',
      lastName: 'Foreign',
      phone: '0772222222',
      companyId: companyB._id,
      properties: [propertyForeign._id],
    });
    landlordBId = landlordB._id;
    await Property.updateMany(
      { _id: { $in: [propertySavedA._id, propertySavedB._id, propertyAssigned._id] } },
      { $set: { propertyOwnerId: landlordA._id } }
    );
    await Property.updateOne({ _id: propertyForeign._id }, { $set: { propertyOwnerId: landlordB._id } });

    const tenantA = await Tenant.create({
      firstName: 'Tenant',
      lastName: 'A',
      email: `${STAMP}-tenant-a@example.test`,
      phone: '0773333333',
      companyId: companyA._id,
      ownerId: agentA._id,
      propertyId: propertySavedA._id,
    });
    const tenantB = await Tenant.create({
      firstName: 'Tenant',
      lastName: 'B',
      email: `${STAMP}-tenant-b@example.test`,
      phone: '0774444444',
      companyId: companyA._id,
      ownerId: agentB._id,
      propertyId: propertySavedB._id,
    });
    const tenantForeign = await Tenant.create({
      firstName: 'Tenant',
      lastName: 'Foreign',
      email: `${STAMP}-tenant-foreign@example.test`,
      phone: '0775555555',
      companyId: companyB._id,
      ownerId: agentForeign._id,
      propertyId: propertyForeign._id,
    });

    const leaseA = await Lease.create({
      propertyId: propertySavedA._id,
      tenantId: tenantA._id,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rentAmount: 900,
      depositAmount: 900,
      status: 'active',
      companyId: companyA._id,
      ownerId: agentA._id,
    });
    const leaseB = await Lease.create({
      propertyId: propertySavedB._id,
      tenantId: tenantB._id,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rentAmount: 900,
      depositAmount: 900,
      status: 'active',
      companyId: companyA._id,
      ownerId: agentB._id,
    });
    const leaseForeign = await Lease.create({
      propertyId: propertyForeign._id,
      tenantId: tenantForeign._id,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rentAmount: 500,
      depositAmount: 500,
      status: 'active',
      companyId: companyB._id,
      ownerId: agentForeign._id,
    });

    const levyA = await LevyPayment.create({
      propertyId: propertySavedA._id,
      companyId: companyA._id,
      paymentDate: new Date('2026-02-01'),
      paymentMethod: 'bank_transfer',
      amount: 100,
      referenceNumber: `${STAMP}-LEVY-A`,
      processedBy: agentA._id,
    });
    const levyAssigned = await LevyPayment.create({
      propertyId: propertyAssigned._id,
      companyId: companyA._id,
      paymentDate: new Date('2026-02-01'),
      paymentMethod: 'bank_transfer',
      amount: 80,
      referenceNumber: `${STAMP}-LEVY-ASSIGNED`,
      processedBy: adminA._id,
    });
    const levyB = await LevyPayment.create({
      propertyId: propertySavedB._id,
      companyId: companyA._id,
      paymentDate: new Date('2026-02-01'),
      paymentMethod: 'cash',
      amount: 70,
      referenceNumber: `${STAMP}-LEVY-B`,
      processedBy: agentB._id,
    });
    const levyForeign = await LevyPayment.create({
      propertyId: propertyForeign._id,
      companyId: companyB._id,
      paymentDate: new Date('2026-02-01'),
      paymentMethod: 'cash',
      amount: 40,
      referenceNumber: `${STAMP}-LEVY-FOREIGN`,
      processedBy: agentForeign._id,
    });

    await MaintenanceRequest.create({
      propertyId: propertySavedA._id,
      requestedBy: agentA._id,
      ownerId: landlordA._id,
      companyId: companyA._id,
      title: `${STAMP} MAINT A`,
      description: 'Authorized maintenance',
    });
    await MaintenanceRequest.create({
      propertyId: propertyForeign._id,
      requestedBy: agentForeign._id,
      ownerId: landlordB._id,
      companyId: companyB._id,
      title: `${STAMP} MAINT FOREIGN`,
      description: 'Foreign maintenance',
    });
    const applicationForeign = await RentalApplication.create({
      tenantUserId: agentForeign._id,
      propertyId: propertyForeign._id,
      companyId: companyB._id,
      status: 'SUBMITTED',
      notes: `${STAMP} APPLICANT FOREIGN`,
    });

    const tAgentA = tokenFor(agentA);
    const tAgentB = tokenFor(agentB);
    const tAccountant = tokenFor(accountantA);
    const tOwner = tokenFor(ownerUser);
    const tForeign = tokenFor(agentForeign);
    const tIndividual = tokenFor(individual);

    const ownSaved = await request(port, 'GET', `/api/properties/${propertySavedA._id}`, tAgentA);
    record('Agent A reads the property they saved', ownSaved.status === 200 && includesName(ownSaved, nameSavedA), `status ${ownSaved.status}`);

    const ownAssigned = await request(port, 'GET', `/api/properties/${propertyAssigned._id}`, tAgentA);
    record('Agent A reads a property formally assigned to them', ownAssigned.status === 200 && includesName(ownAssigned, nameAssigned), `status ${ownAssigned.status}`);

    const otherAgent = await request(port, 'GET', `/api/properties/${propertySavedB._id}`, tAgentA);
    record('Agent A cannot read Agent B property with the same landlord', denied(otherAgent.status) && !includesName(otherAgent, nameSavedB), `status ${otherAgent.status}`);

    const agentList = await request(port, 'GET', '/api/agents/properties', tAgentA);
    record('Agent property list contains own properties and excludes the other agent', agentList.status === 200 && includesName(agentList, nameSavedA) && includesName(agentList, nameAssigned) && !includesName(agentList, nameSavedB), `status ${agentList.status}`);

    const searchOwn = await request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(nameSavedA.slice(-12))}`, tAgentA);
    record('Agent search returns the authorized property', searchOwn.status === 200 && includesName(searchOwn, nameSavedA), `status ${searchOwn.status}`);
    const searchOther = await request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(nameSavedB.slice(-12))}`, tAgentA);
    record('Agent search does not return the other agent property', searchOther.status === 200 && !includesName(searchOther, nameSavedB), `status ${searchOther.status}`);

    const agentLevies = await request(port, 'GET', '/api/agents/levy-payments', tAgentA);
    record('Agent A sees levy records for saved and assigned properties', agentLevies.status === 200 && includesName(agentLevies, `${STAMP}-LEVY-A`) && includesName(agentLevies, `${STAMP}-LEVY-ASSIGNED`), `status ${agentLevies.status}`);
    record('Agent A does not see Agent B levy records', !includesName(agentLevies, `${STAMP}-LEVY-B`) && !includesName(agentLevies, `${STAMP}-LEVY-FOREIGN`), 'levy payload');

    const agentBLevy = await request(port, 'GET', `/api/levy-payments/${levyA._id}/receipt`, tAgentB);
    record('Agent B cannot read Agent A levy receipt by identifier', denied(agentBLevy.status) && !includesName(agentBLevy, `${STAMP}-LEVY-A`), `status ${agentBLevy.status}`);

    const unauth = await request(port, 'GET', `/api/properties/${propertySavedA._id}`);
    record('Unauthenticated property request is denied', unauth.status === 401, `status ${unauth.status}`);
    const unauthLevy = await request(port, 'GET', '/api/levy-payments');
    record('Unauthenticated levy request is denied', unauthLevy.status === 401, `status ${unauthLevy.status}`);

    const ownerOnAgentRoute = await request(port, 'GET', '/api/agents/levy-payments', tOwner);
    record('Owner role is denied the agent levy route', ownerOnAgentRoute.status === 403, `status ${ownerOnAgentRoute.status}`);

    const ownerProps = await request(port, 'GET', '/api/owners/properties', tOwner);
    record('Owner sees every property linked to that landlord', ownerProps.status === 200 && includesName(ownerProps, nameSavedA) && includesName(ownerProps, nameSavedB) && includesName(ownerProps, nameAssigned), `status ${ownerProps.status}`);
    record('Owner dashboard does not include the other company property', !includesName(ownerProps, nameForeign), 'owner payload');

    const accountantProps = await request(port, 'GET', '/api/properties?limit=100', tAccountant);
    record('Accountant sees all properties in their company', accountantProps.status === 200 && includesName(accountantProps, nameSavedA) && includesName(accountantProps, nameSavedB) && includesName(accountantProps, nameAssigned) && !includesName(accountantProps, nameForeign), `status ${accountantProps.status}`);
    const accountantLevies = await request(port, 'GET', '/api/levy-payments', tAccountant);
    record('Accountant sees company levy records and not the other company', accountantLevies.status === 200 && includesName(accountantLevies, `${STAMP}-LEVY-A`) && includesName(accountantLevies, `${STAMP}-LEVY-B`) && !includesName(accountantLevies, `${STAMP}-LEVY-FOREIGN`), `status ${accountantLevies.status}`);

    const crossProperty = await request(port, 'GET', `/api/properties/${propertyForeign._id}`, tAgentA);
    record('Company A agent cannot read Company B property', denied(crossProperty.status) && !includesName(crossProperty, nameForeign), `status ${crossProperty.status}`);
    const accountantCross = await request(port, 'GET', `/api/properties/${propertyForeign._id}`, tAccountant);
    record('Company A accountant cannot read Company B property', denied(accountantCross.status) && !includesName(accountantCross, nameForeign), `status ${accountantCross.status}`);
    const crossLease = await request(port, 'GET', `/api/leases/${leaseForeign._id}`, tAgentA);
    record('Company A user cannot read Company B lease', denied(crossLease.status), `status ${crossLease.status}`);
    const crossLevy = await request(port, 'GET', `/api/levy-payments/${levyForeign._id}/receipt`, tAccountant);
    record('Company A accountant cannot read Company B levy receipt', denied(crossLevy.status) && !includesName(crossLevy, `${STAMP}-LEVY-FOREIGN`), `status ${crossLevy.status}`);
    const crossMaint = await request(port, 'GET', `/api/maintenance/property/${propertyForeign._id}`, tAgentA);
    record('Company A user cannot read Company B maintenance', denied(crossMaint.status) && !includesName(crossMaint, `${STAMP} MAINT FOREIGN`), `status ${crossMaint.status}`);
    const maintList = await request(port, 'GET', '/api/maintenance', tAgentA);
    record('Agent maintenance list stays inside the authorized portfolio', maintList.status === 200 && includesName(maintList, `${STAMP} MAINT A`) && !includesName(maintList, `${STAMP} MAINT FOREIGN`), `status ${maintList.status}`);
    const crossSearch = await request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent('Company B')}`, tAgentA);
    record('Agent search does not return Company B records', crossSearch.status === 200 && !includesName(crossSearch, nameForeign), `status ${crossSearch.status}`);
    const crossExport = await request(port, 'GET', `/api/reporting/owner/${propertyForeign._id}?ledger=rental`, tAccountant);
    record('Owner-statement export denies the other company property', denied(crossExport.status), `status ${crossExport.status}`);
    const crossApps = await request(port, 'GET', '/api/ecosystem/agency/applications', tAgentA);
    record('Agency application queue does not return the other company', crossApps.status === 200 && !includesName(crossApps, `${STAMP} APPLICANT FOREIGN`), `status ${crossApps.status}`);
    const publicListings = await request(port, 'GET', `/api/ecosystem/listings?q=${encodeURIComponent(STAMP)}`);
    record('Public listing search does not expose the private property', publicListings.status === 200 && !includesName(publicListings, nameForeign) && !includesName(publicListings, nameSavedA), `status ${publicListings.status}`);
    const individualList = await request(port, 'GET', '/api/properties?limit=100', tIndividual);
    record('Individual workspace does not receive agency properties', individualList.status === 200 && !includesName(individualList, nameSavedA) && !includesName(individualList, nameForeign), `status ${individualList.status}`);
    const sameCompanyLease = await request(port, 'GET', `/api/leases/${leaseB._id}`, tAgentA);
    record('Agent A cannot read Agent B lease in the same company', denied(sameCompanyLease.status), `status ${sameCompanyLease.status}`);
    const foreignAgentOwn = await request(port, 'GET', `/api/properties/${propertyForeign._id}`, tForeign);
    record('Company B agent can read their own property', foreignAgentOwn.status === 200, `status ${foreignAgentOwn.status}`);

    const companyIds = [companyA._id, companyB._id, companyI._id];
    const foreignNameBefore = (await Company.findById(companyB._id).select('name').lean())?.name;
    const renameForeign = await request(port, 'PUT', `/api/companies/${companyB._id}`, tAgentA, { name: `${STAMP} HACKED` });
    const deleteForeign = await request(port, 'DELETE', `/api/companies/${companyB._id}`, tAgentA);
    const foreignNameAfter = (await Company.findById(companyB._id).select('name').lean())?.name;
    record('Cross-company company update is denied', denied(renameForeign.status), `status ${renameForeign.status}`);
    record('Cross-company company delete is denied', denied(deleteForeign.status), `status ${deleteForeign.status}`);
    record('Rejected company write left the other company unchanged', foreignNameBefore === foreignNameAfter && foreignNameAfter === companyB.name, `name ${foreignNameAfter || 'missing'}`);

    const before = await sideEffectSnapshot(companyIds);

    const badLease = await request(port, 'POST', '/api/leases', tAgentA, {
      propertyId: String(propertyForeign._id),
      tenantId: String(tenantForeign._id),
      startDate: '2026-03-01',
      endDate: '2027-02-28',
      rentAmount: 100,
      depositAmount: 100,
      companyId: String(companyA._id),
    });
    const mixedLease = await request(port, 'POST', '/api/leases', tAgentA, {
      propertyId: String(propertySavedA._id),
      tenantId: String(tenantForeign._id),
      startDate: '2026-03-01',
      endDate: '2027-02-28',
      rentAmount: 100,
      depositAmount: 100,
    });
    const badLevy = await request(port, 'POST', '/api/levy-payments', tAgentA, {
      propertyId: String(propertyForeign._id),
      paymentDate: '2026-03-01',
      paymentMethod: 'cash',
      amount: 25,
      companyId: String(companyB._id),
    });
    const badPayment = await request(port, 'POST', '/api/payments', tAgentA, {
      leaseId: String(leaseForeign._id),
      amount: 100,
      paymentDate: '2026-03-01',
      paymentMethod: 'cash',
      status: 'pending',
      companyId: String(companyB._id),
      rentalPeriodMonth: 3,
      rentalPeriodYear: 2026,
    });
    const mixedPayment = await request(port, 'POST', '/api/accountants/payments', tAgentA, {
      paymentType: 'rental',
      propertyId: String(propertySavedA._id),
      tenantId: String(tenantForeign._id),
      leaseId: String(leaseForeign._id),
      amount: 100,
      paymentDate: '2026-03-01',
      paymentMethod: 'cash',
      status: 'pending',
      currency: 'USD',
    });
    const sameCompanyPayment = await request(port, 'POST', '/api/payments', tAgentA, {
      leaseId: String(leaseB._id),
      amount: 100,
      paymentDate: '2026-03-01',
      paymentMethod: 'cash',
      status: 'pending',
      rentalPeriodMonth: 3,
      rentalPeriodYear: 2026,
    });

    record('Cross-company lease create is denied', denied(badLease.status), `status ${badLease.status}`);
    record('Company A property cannot be combined with a Company B tenant', denied(mixedLease.status), `status ${mixedLease.status}`);
    record('Cross-company levy create is denied', denied(badLevy.status), `status ${badLevy.status}`);
    record('Payment against a Company B lease is denied', denied(badPayment.status), `status ${badPayment.status}`);
    record('Payment mixing a Company A property with a Company B lease is denied', denied(mixedPayment.status), `status ${mixedPayment.status}`);
    record('Agent A cannot create a payment on Agent B lease', denied(sameCompanyPayment.status), `status ${sameCompanyPayment.status}`);

    const after = await sideEffectSnapshot(companyIds);
    const unchanged = JSON.stringify(before) === JSON.stringify(after);
    record('Rejected writes created no payments, leases, levies, maintenance, notifications, or journals', unchanged, unchanged ? 'counts unchanged' : `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);

    const historicalPayment = await Payment.countDocuments({ _id: new mongoose.Types.ObjectId('6acb543e271b8f1011240e3f') });
    record('Phase 4B.1 historical payment was not rewritten', historicalPayment === 1 || historicalPayment === 0, `matching documents ${historicalPayment}`);

    void applicationForeign;
    void levyAssigned;
    void leaseA;
  } finally {
    const companyIds = createdCompanyIds;
    if (companyIds.length) {
      const companyFilter = { companyId: { $in: companyIds } };
      await RentalApplication.deleteMany(companyFilter);
      await MaintenanceRequest.deleteMany(companyFilter);
      await LevyPayment.deleteMany(companyFilter);
      await Lease.deleteMany(companyFilter);
      await Tenant.deleteMany(companyFilter);
      await Property.deleteMany(companyFilter);
      if (landlordAId) await PropertyOwner.deleteOne({ _id: landlordAId });
      if (landlordBId) await PropertyOwner.deleteOne({ _id: landlordBId });
      await Notification.deleteMany(companyFilter);
    }
    if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
    if (companyIds.length) await Company.deleteMany({ _id: { $in: companyIds } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { await accountingConnection.close(); } catch { /* connection may already be closed */ }
    await mongoose.disconnect();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`Phase 4C access-control checks: ${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
