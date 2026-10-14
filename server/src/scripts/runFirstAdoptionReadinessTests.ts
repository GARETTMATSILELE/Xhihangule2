/**
 * First-adoption readiness regression.
 * Static checks do not touch a database.
 * HTTP checks use disposable FIRSTADOPT fixtures and delete only those fixtures.
 */
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
import http from 'http';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { errorHandler } from '../middleware/errorHandler';
import { systemAdminBootstrapDecision } from '../services/systemAdminBootstrap';
import { assertCompanyAssignableRoleSet } from '../utils/companyUserRoles';
import { publicSignupCompanyFields } from '../utils/publicSignupCompany';
import { safeAttachmentFilename } from '../utils/contentDisposition';

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function src(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
}

function runStaticChecks() {
  const indexSrc = src('index.ts');
  const bootStart = indexSrc.indexOf('const initializeDatabaseBackedServices');
  const bootEnd = indexSrc.indexOf('const scheduleDatabaseReconnect');
  const boot = indexSrc.slice(bootStart, bootEnd);
  const bootstrapSrc = src('services/systemAdminBootstrap.ts');

  record('Startup does not compare or reset a stored administrator password', !boot.includes('comparePassword') && !bootstrapSrc.includes('comparePassword'));
  record('Startup source has no embedded mailbox or password literal', !indexSrc.includes('@gmail.com') && !indexSrc.includes('targetPassword') && !bootstrapSrc.includes('targetPassword'));
  record('Startup calls the opt-in bootstrap and does not force an existing user active', boot.includes('provisionBreakGlassSystemAdmin()') && !bootstrapSrc.includes('isActive = true'));
  record('Production bootstrap decision is skip', systemAdminBootstrapDecision({
    NODE_ENV: 'production',
    ALLOW_SYSTEM_ADMIN_BOOTSTRAP: 'true',
    SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'admin@example.test',
    SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'a-long-test-password',
  } as NodeJS.ProcessEnv).action === 'skip');
  record('Bootstrap stays off without the explicit flag', systemAdminBootstrapDecision({
    NODE_ENV: 'development',
    SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'admin@example.test',
    SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'a-long-test-password',
  } as NodeJS.ProcessEnv).action === 'skip');
  const incomplete = systemAdminBootstrapDecision({
    NODE_ENV: 'development',
    ALLOW_SYSTEM_ADMIN_BOOTSTRAP: 'true',
    SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'admin@example.test',
    SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'short',
  } as NodeJS.ProcessEnv);
  record('Incomplete bootstrap does not create', incomplete.action === 'skip' && incomplete.reason === 'incomplete');
  const enabled = systemAdminBootstrapDecision({
    NODE_ENV: 'development',
    ALLOW_SYSTEM_ADMIN_BOOTSTRAP: 'true',
    SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'Admin@Example.Test',
    SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'a-long-test-password',
  } as NodeJS.ProcessEnv);
  record('Enabled non-production bootstrap is create-only', enabled.action === 'create' && enabled.email === 'admin@example.test');

  let rejected = false;
  try {
    assertCompanyAssignableRoleSet('system_admin', ['admin']);
  } catch (error) {
    rejected = error instanceof AppError && error.statusCode === 403;
  }
  record('Company role assignment rejects system_admin', rejected);

  const allowed = assertCompanyAssignableRoleSet('agent', ['agent']);
  record('Company role assignment still allows agent', allowed.role === 'agent' && allowed.roles?.[0] === 'agent');

  const picked = publicSignupCompanyFields({
    name: 'Pilot Agency',
    tinNumber: 'TIN-1',
    subscriptionStatus: 'ACTIVE',
    subscriptionOverride: { enabled: true },
    featureFlags: { onlinePaymentsEnabled: true },
    fiscalConfig: { apiPassword: 'secret' },
    tenantStatus: 'active',
  });
  record('Public signup keeps identity fields and drops privilege fields',
    picked.name === 'Pilot Agency'
    && picked.tinNumber === 'TIN-1'
    && !('subscriptionStatus' in picked)
    && !('subscriptionOverride' in picked)
    && !('featureFlags' in picked)
    && !('fiscalConfig' in picked)
    && !('tenantStatus' in picked));

  const unsafe = 'lease.pdf"\r\nContent-Type: text/html';
  const safe = safeAttachmentFilename(unsafe);
  record('Attachment names cannot break the content-disposition header', !safe.includes('\r') && !safe.includes('\n') && !safe.includes('"'));

  const userController = src('controllers/userController.ts');
  record('User creation does not log the request body', !userController.includes('Creating user with data'));
  record('Startup still refuses automatic ledger maintenance', boot.includes('historical ledger mutation is admin/CLI only') && !boot.includes('runPropertyLedgerMaintenance('));
}

function tokenFor(user: { _id: any; role: string; roles?: string[]; companyId?: any; sessionVersion?: number }) {
  const { JWT_CONFIG } = require('../config/jwt') as typeof import('../config/jwt');
  return jwt.sign({
    userId: String(user._id),
    role: user.role,
    roles: user.roles && user.roles.length ? user.roles : undefined,
    sessionVersion: Number(user.sessionVersion || 1),
    companyId: user.companyId ? String(user.companyId) : undefined,
    type: 'access',
  }, JWT_CONFIG.SECRET, {
    expiresIn: '2h',
    issuer: JWT_CONFIG.ISSUER,
    audience: JWT_CONFIG.AUDIENCE,
  });
}

function request(port: number, method: string, requestPath: string, token?: string, body?: unknown, raw?: { contentType: string; payload: string }): Promise<{ status: number; text: string }> {
  const payload = raw ? raw.payload : (body === undefined ? '' : JSON.stringify(body));
  const contentType = raw ? raw.contentType : (payload ? 'application/json' : '');
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: requestPath,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 20000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runHttpChecks() {
  if (process.env.NODE_ENV === 'production') {
    record('HTTP isolation checks were not run against production', true, 'NODE_ENV=production; disposable writes were not attempted');
    return;
  }

  const { connectDatabase } = await import('../config/database');
  const { Company } = await import('../models/Company');
  const { User } = await import('../models/User');
  const { Property } = await import('../models/Property');
  const File = (await import('../models/File')).default;
  const SalesFile = (await import('../models/SalesFile')).default;
  const { Deal } = await import('../models/Deal');
  const userRoutes = (await import('../routes/userRoutes')).default;
  const companyRoutes = (await import('../routes/companyRoutes')).default;
  const fileRoutes = (await import('../routes/fileRoutes')).default;
  const salesFileRoutes = (await import('../routes/salesFileRoutes')).default;

  await connectDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/sales-files', salesFileRoutes);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port as number;

  const stamp = `FIRSTADOPT${Date.now().toString().slice(-8)}`;
  const password = 'FirstAdopt-Test-1';
  const createdUserIds: mongoose.Types.ObjectId[] = [];
  const createdCompanyIds: mongoose.Types.ObjectId[] = [];
  const createdPropertyIds: mongoose.Types.ObjectId[] = [];
  const createdFileIds: mongoose.Types.ObjectId[] = [];
  const createdSalesFileIds: mongoose.Types.ObjectId[] = [];
  const createdDealIds: mongoose.Types.ObjectId[] = [];

  try {
    const bootstrap = await User.create({
      email: `${stamp}-boot@example.test`,
      password,
      firstName: 'Boot',
      lastName: 'Strap',
      role: 'admin',
      roles: ['admin'],
      isActive: true,
    });
    createdUserIds.push(bootstrap._id);

    const companyA = await Company.create({
      name: `${stamp} Agency A`,
      address: '1 Test Street',
      phone: '0770000000',
      email: `${stamp}-a@example.test`,
      registrationNumber: `${stamp}-A-REG`,
      tinNumber: `${stamp}-A-TIN`,
      ownerId: bootstrap._id,
      workspaceType: 'agency',
      subscriptionStatus: 'trial',
      tenantStatus: 'active',
      onboardingStatus: 'ACTIVE',
      isActive: true,
    });
    const companyB = await Company.create({
      name: `${stamp} Agency B`,
      address: '2 Test Street',
      phone: '0770000001',
      email: `${stamp}-b@example.test`,
      registrationNumber: `${stamp}-B-REG`,
      tinNumber: `${stamp}-B-TIN`,
      ownerId: bootstrap._id,
      workspaceType: 'agency',
      subscriptionStatus: 'trial',
      tenantStatus: 'active',
      isActive: true,
    });
    createdCompanyIds.push(companyA._id, companyB._id);

    const adminA = await User.create({
      email: `${stamp}-admin-a@example.test`,
      password,
      firstName: 'Admin',
      lastName: 'A',
      role: 'admin',
      roles: ['admin'],
      companyId: companyA._id,
      isActive: true,
    });
    const agentA = await User.create({
      email: `${stamp}-agent-a@example.test`,
      password,
      firstName: 'Agent',
      lastName: 'A',
      role: 'agent',
      roles: ['agent'],
      companyId: companyA._id,
      isActive: true,
    });
    const agentB = await User.create({
      email: `${stamp}-agent-b@example.test`,
      password,
      firstName: 'Agent',
      lastName: 'B',
      role: 'agent',
      roles: ['agent'],
      companyId: companyA._id,
      isActive: true,
    });
    const accountantA = await User.create({
      email: `${stamp}-accountant-a@example.test`,
      password,
      firstName: 'Accountant',
      lastName: 'A',
      role: 'accountant',
      roles: ['accountant'],
      companyId: companyA._id,
      isActive: true,
    });
    const adminB = await User.create({
      email: `${stamp}-admin-b@example.test`,
      password,
      firstName: 'Admin',
      lastName: 'B',
      role: 'admin',
      roles: ['admin'],
      companyId: companyB._id,
      isActive: true,
    });
    const staff = await User.create({
      email: `${stamp}-staff@example.test`,
      password,
      firstName: 'Staff',
      lastName: 'A',
      role: 'agent',
      roles: ['agent'],
      companyId: companyA._id,
      isActive: true,
    });
    const platform = await User.create({
      email: `${stamp}-platform@example.test`,
      password,
      firstName: 'Platform',
      lastName: 'Admin',
      role: 'admin',
      roles: ['admin', 'system_admin'],
      isActive: true,
    });
    createdUserIds.push(adminA._id, agentA._id, agentB._id, accountantA._id, adminB._id, staff._id, platform._id);

    const propertyA = await Property.create({
      name: `${stamp} Property A`,
      address: '10 Agent A Road',
      companyId: companyA._id,
      ownerId: agentA._id,
      agentId: agentA._id,
      rent: 900,
    });
    const propertyB = await Property.create({
      name: `${stamp} Property B`,
      address: '20 Agent B Road',
      companyId: companyA._id,
      ownerId: agentB._id,
      agentId: agentB._id,
      rent: 800,
    });
    createdPropertyIds.push(propertyA._id, propertyB._id);

    const privateName = `${stamp}-lease.txt`;
    const privateFile = await File.create({
      propertyId: propertyA._id,
      companyId: companyA._id,
      fileName: privateName,
      fileType: 'lease',
      fileUrl: Buffer.from('private lease').toString('base64'),
      uploadedBy: agentA._id,
    });
    const salesFile = await SalesFile.create({
      propertyId: propertyA._id,
      companyId: companyA._id,
      fileName: `${stamp}-sale.txt`,
      docType: 'Offer',
      fileUrl: Buffer.from('private sale').toString('base64'),
      uploadedBy: agentA._id,
    });
    createdFileIds.push(privateFile._id);
    createdSalesFileIds.push(salesFile._id);

    const dealB = await Deal.create({
      propertyId: propertyB._id,
      buyerName: `${stamp} Buyer`,
      stage: 'Offer',
      offerPrice: 1000,
      companyId: companyA._id,
      ownerId: agentB._id,
    });
    createdDealIds.push(dealB._id);

    const adminToken = tokenFor(adminA);
    const agentAToken = tokenFor(agentA);
    const agentBToken = tokenFor(agentB);
    const accountantToken = tokenFor(accountantA);
    const adminBToken = tokenFor(adminB);

    const escalate = await request(port, 'POST', '/api/users', adminToken, {
      email: `${stamp}-escalated@example.test`,
      password,
      firstName: 'Escalated',
      lastName: 'User',
      role: 'system_admin',
      roles: ['system_admin'],
    });
    const escalatedCount = await User.countDocuments({ email: `${stamp}-escalated@example.test` });
    record('Company admin cannot create a system administrator', escalate.status === 403 && escalatedCount === 0, `status ${escalate.status}, count ${escalatedCount}`);

    const beforePlatform = await User.findById(platform._id).select('password role roles isActive updatedAt');
    const platformWrite = await request(port, 'PUT', `/api/users/${platform._id}`, adminToken, {
      role: 'system_admin',
      password: 'Hacked-Password-1',
      isActive: false,
    });
    const afterPlatform = await User.findById(platform._id).select('password role roles isActive updatedAt');
    record('Denied platform-user write leaves the account unchanged',
      platformWrite.status === 403
      && String(beforePlatform?.password) === String(afterPlatform?.password)
      && beforePlatform?.role === afterPlatform?.role
      && beforePlatform?.isActive === afterPlatform?.isActive
      && String(beforePlatform?.updatedAt) === String(afterPlatform?.updatedAt),
      `status ${platformWrite.status}`);

    const beforeStaff = await User.findById(staff._id).select('password role roles updatedAt');
    const staffWrite = await request(port, 'PUT', `/api/users/${staff._id}`, adminToken, {
      role: 'system_admin',
      roles: ['system_admin'],
      password: 'Hacked-Password-1',
    });
    const afterStaff = await User.findById(staff._id).select('password role roles updatedAt');
    record('Denied role escalation does not change the user or password',
      staffWrite.status === 403
      && String(beforeStaff?.password) === String(afterStaff?.password)
      && beforeStaff?.role === 'agent'
      && afterStaff?.role === 'agent'
      && String(beforeStaff?.updatedAt) === String(afterStaff?.updatedAt),
      `status ${staffWrite.status}`);

    const foreignWrite = await request(port, 'PUT', `/api/users/${agentA._id}`, adminBToken, { firstName: 'Taken' });
    const afterForeign = await User.findById(agentA._id).select('firstName');
    record('Company B admin cannot update a Company A user', foreignWrite.status === 403 && afterForeign?.firstName === 'Agent', `status ${foreignWrite.status}`);

    const allowedWrite = await request(port, 'PUT', `/api/users/${staff._id}`, adminToken, { role: 'accountant', roles: ['accountant'] });
    const afterAllowed = await User.findById(staff._id).select('role');
    record('Company admin can still assign an ordinary company role', allowedWrite.status === 200 && afterAllowed?.role === 'accountant', `status ${allowedWrite.status}`);

    companyA.tenantStatus = 'suspended';
    companyA.onboardingStatus = 'SUSPENDED';
    await companyA.save();
    const unsuspend = await request(port, 'PUT', `/api/companies/${companyA._id}`, adminToken, {
      tenantStatus: 'active',
      onboardingStatus: 'ACTIVE',
      onboardingCompleted: true,
    });
    const afterCompany = await Company.findById(companyA._id).select('tenantStatus onboardingStatus');
    record('Suspended company cannot clear its own suspension',
      unsuspend.status === 403
      && afterCompany?.tenantStatus === 'suspended'
      && afterCompany?.onboardingStatus === 'SUSPENDED',
      `status ${unsuspend.status}, tenant ${afterCompany?.tenantStatus}`);
    const suspendedDownload = await request(port, 'GET', `/api/files/download/${privateFile._id}`, agentAToken);
    const suspendedFileCount = await File.countDocuments({ _id: privateFile._id });
    record('Suspended company cannot download a portfolio file', suspendedDownload.status === 403 && suspendedFileCount === 1, `status ${suspendedDownload.status}`);
    companyA.tenantStatus = 'active';
    companyA.onboardingStatus = 'ACTIVE';
    await companyA.save();

    const unauthenticated = await request(port, 'GET', `/api/files/download/${privateFile._id}`);
    record('Unauthenticated file download is rejected', unauthenticated.status === 401, `status ${unauthenticated.status}`);

    const otherAgent = await request(port, 'GET', `/api/files/download/${privateFile._id}`, agentBToken);
    const stillThere = await File.countDocuments({ _id: privateFile._id });
    record('Another agent cannot download a portfolio file', otherAgent.status === 404 && stillThere === 1 && !otherAgent.text.includes('private lease'), `status ${otherAgent.status}`);

    const otherDelete = await request(port, 'DELETE', `/api/files/${privateFile._id}`, agentBToken);
    const stillThereAfterDelete = await File.countDocuments({ _id: privateFile._id });
    record('Denied file delete does not remove the document', otherDelete.status === 404 && stillThereAfterDelete === 1, `status ${otherDelete.status}`);

    const ownerDownload = await request(port, 'GET', `/api/files/download/${privateFile._id}`, agentAToken);
    record('Assigned agent can download the file', ownerDownload.status === 200 && ownerDownload.text.includes('private lease'), `status ${ownerDownload.status}`);

    const accountantDownload = await request(port, 'GET', `/api/files/download/${privateFile._id}`, accountantToken);
    record('Company accountant can download the company file', accountantDownload.status === 200, `status ${accountantDownload.status}`);

    const foreignDownload = await request(port, 'GET', `/api/files/download/${privateFile._id}`, adminBToken);
    record('Company B cannot download Company A file', foreignDownload.status === 404, `status ${foreignDownload.status}`);

    const listB = await request(port, 'GET', '/api/files', agentBToken);
    record('Agent file list excludes another agent portfolio', listB.status === 200 && !listB.text.includes(privateName), `status ${listB.status}`);

    const salesDownload = await request(port, 'GET', `/api/sales-files/${salesFile._id}/download`, agentBToken);
    const salesRemain = await SalesFile.countDocuments({ _id: salesFile._id });
    record('Another agent cannot download a sales file', salesDownload.status === 404 && salesRemain === 1, `status ${salesDownload.status}`);

    const boundary = '----FirstAdoptBoundary';
    const multipart = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="propertyId"',
      '',
      String(propertyA._id),
      `--${boundary}`,
      'Content-Disposition: form-data; name="dealId"',
      '',
      String(dealB._id),
      `--${boundary}`,
      'Content-Disposition: form-data; name="docType"',
      '',
      'Offer',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="note.txt"',
      'Content-Type: text/plain',
      '',
      'substituted',
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const beforeSales = await SalesFile.countDocuments({ companyId: companyA._id });
    const substituted = await request(port, 'POST', '/api/sales-files/upload', agentAToken, undefined, {
      contentType: `multipart/form-data; boundary=${boundary}`,
      payload: multipart,
    });
    const afterSales = await SalesFile.countDocuments({ companyId: companyA._id });
    record('A sales file cannot be attached to another portfolio deal', substituted.status === 404 && afterSales === beforeSales, `status ${substituted.status}, count ${beforeSales}->${afterSales}`);

    const htmlBoundary = '----FirstAdoptHtml';
    const htmlUpload = [
      `--${htmlBoundary}`,
      'Content-Disposition: form-data; name="propertyId"',
      '',
      String(propertyA._id),
      `--${htmlBoundary}`,
      'Content-Disposition: form-data; name="fileType"',
      '',
      'lease',
      `--${htmlBoundary}`,
      'Content-Disposition: form-data; name="file"; filename="shell.html"',
      'Content-Type: text/plain',
      '',
      '<html></html>',
      `--${htmlBoundary}--`,
      '',
    ].join('\r\n');
    const beforeFiles = await File.countDocuments({ companyId: companyA._id });
    const htmlResult = await request(port, 'POST', '/api/files/upload', agentAToken, undefined, {
      contentType: `multipart/form-data; boundary=${htmlBoundary}`,
      payload: htmlUpload,
    });
    const afterFiles = await File.countDocuments({ companyId: companyA._id });
    record('HTML upload is rejected and stores nothing', htmlResult.status === 400 && afterFiles === beforeFiles, `status ${htmlResult.status}, count ${beforeFiles}->${afterFiles}`);
  } finally {
    if (createdSalesFileIds.length) await SalesFile.deleteMany({ _id: { $in: createdSalesFileIds } });
    await SalesFile.deleteMany({ companyId: { $in: createdCompanyIds } });
    if (createdFileIds.length) await File.deleteMany({ _id: { $in: createdFileIds } });
    await File.deleteMany({ companyId: { $in: createdCompanyIds } });
    if (createdDealIds.length) await Deal.deleteMany({ _id: { $in: createdDealIds } });
    if (createdPropertyIds.length) await Property.deleteMany({ _id: { $in: createdPropertyIds } });
    if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
    await User.deleteMany({ email: new RegExp(`^${stamp}-`) });
    if (createdCompanyIds.length) await Company.deleteMany({ _id: { $in: createdCompanyIds } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const { closeDatabase } = await import('../config/database');
    await closeDatabase();
  }
}

async function main() {
  runStaticChecks();
  await runHttpChecks();
  const failed = checks.filter((check) => !check.ok);
  console.log(`First-adoption readiness checks: ${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
