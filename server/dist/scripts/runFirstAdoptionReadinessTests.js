"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * First-adoption readiness regression.
 * Static checks do not touch a database.
 * HTTP checks use disposable FIRSTADOPT fixtures and delete only those fixtures.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
dotenv_1.default.config();
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("../middleware/errorHandler");
const errorHandler_2 = require("../middleware/errorHandler");
const systemAdminBootstrap_1 = require("../services/systemAdminBootstrap");
const companyUserRoles_1 = require("../utils/companyUserRoles");
const publicSignupCompany_1 = require("../utils/publicSignupCompany");
const contentDisposition_1 = require("../utils/contentDisposition");
const checks = [];
function record(name, ok, detail = '') {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function src(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function runStaticChecks() {
    var _a;
    const indexSrc = src('index.ts');
    const bootStart = indexSrc.indexOf('const initializeDatabaseBackedServices');
    const bootEnd = indexSrc.indexOf('const scheduleDatabaseReconnect');
    const boot = indexSrc.slice(bootStart, bootEnd);
    const bootstrapSrc = src('services/systemAdminBootstrap.ts');
    record('Startup does not compare or reset a stored administrator password', !boot.includes('comparePassword') && !bootstrapSrc.includes('comparePassword'));
    record('Startup source has no embedded mailbox or password literal', !indexSrc.includes('@gmail.com') && !indexSrc.includes('targetPassword') && !bootstrapSrc.includes('targetPassword'));
    record('Startup calls the opt-in bootstrap and does not force an existing user active', boot.includes('provisionBreakGlassSystemAdmin()') && !bootstrapSrc.includes('isActive = true'));
    record('Production bootstrap decision is skip', (0, systemAdminBootstrap_1.systemAdminBootstrapDecision)({
        NODE_ENV: 'production',
        ALLOW_SYSTEM_ADMIN_BOOTSTRAP: 'true',
        SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'admin@example.test',
        SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'a-long-test-password',
    }).action === 'skip');
    record('Bootstrap stays off without the explicit flag', (0, systemAdminBootstrap_1.systemAdminBootstrapDecision)({
        NODE_ENV: 'development',
        SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'admin@example.test',
        SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'a-long-test-password',
    }).action === 'skip');
    const incomplete = (0, systemAdminBootstrap_1.systemAdminBootstrapDecision)({
        NODE_ENV: 'development',
        ALLOW_SYSTEM_ADMIN_BOOTSTRAP: 'true',
        SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'admin@example.test',
        SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'short',
    });
    record('Incomplete bootstrap does not create', incomplete.action === 'skip' && incomplete.reason === 'incomplete');
    const enabled = (0, systemAdminBootstrap_1.systemAdminBootstrapDecision)({
        NODE_ENV: 'development',
        ALLOW_SYSTEM_ADMIN_BOOTSTRAP: 'true',
        SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'Admin@Example.Test',
        SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'a-long-test-password',
    });
    record('Enabled non-production bootstrap is create-only', enabled.action === 'create' && enabled.email === 'admin@example.test');
    let rejected = false;
    try {
        (0, companyUserRoles_1.assertCompanyAssignableRoleSet)('system_admin', ['admin']);
    }
    catch (error) {
        rejected = error instanceof errorHandler_1.AppError && error.statusCode === 403;
    }
    record('Company role assignment rejects system_admin', rejected);
    const allowed = (0, companyUserRoles_1.assertCompanyAssignableRoleSet)('agent', ['agent']);
    record('Company role assignment still allows agent', allowed.role === 'agent' && ((_a = allowed.roles) === null || _a === void 0 ? void 0 : _a[0]) === 'agent');
    const picked = (0, publicSignupCompany_1.publicSignupCompanyFields)({
        name: 'Pilot Agency',
        tinNumber: 'TIN-1',
        subscriptionStatus: 'ACTIVE',
        subscriptionOverride: { enabled: true },
        featureFlags: { onlinePaymentsEnabled: true },
        fiscalConfig: { apiPassword: 'secret' },
        tenantStatus: 'active',
    });
    record('Public signup keeps identity fields and drops privilege fields', picked.name === 'Pilot Agency'
        && picked.tinNumber === 'TIN-1'
        && !('subscriptionStatus' in picked)
        && !('subscriptionOverride' in picked)
        && !('featureFlags' in picked)
        && !('fiscalConfig' in picked)
        && !('tenantStatus' in picked));
    const unsafe = 'lease.pdf"\r\nContent-Type: text/html';
    const safe = (0, contentDisposition_1.safeAttachmentFilename)(unsafe);
    record('Attachment names cannot break the content-disposition header', !safe.includes('\r') && !safe.includes('\n') && !safe.includes('"'));
    const userController = src('controllers/userController.ts');
    record('User creation does not log the request body', !userController.includes('Creating user with data'));
    record('Startup still refuses automatic ledger maintenance', boot.includes('historical ledger mutation is admin/CLI only') && !boot.includes('runPropertyLedgerMaintenance('));
}
function tokenFor(user) {
    const { JWT_CONFIG } = require('../config/jwt');
    return jsonwebtoken_1.default.sign({
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
function request(port, method, requestPath, token, body, raw) {
    const payload = raw ? raw.payload : (body === undefined ? '' : JSON.stringify(body));
    const contentType = raw ? raw.contentType : (payload ? 'application/json' : '');
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            hostname: '127.0.0.1',
            port,
            method,
            path: requestPath,
            headers: Object.assign(Object.assign({}, (token ? { Authorization: `Bearer ${token}` } : {})), (payload ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) } : {})),
            timeout: 20000,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        if (payload)
            req.write(payload);
        req.end();
    });
}
function runHttpChecks() {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.env.NODE_ENV === 'production') {
            record('HTTP isolation checks were not run against production', true, 'NODE_ENV=production; disposable writes were not attempted');
            return;
        }
        const { connectDatabase } = yield Promise.resolve().then(() => __importStar(require('../config/database')));
        const { Company } = yield Promise.resolve().then(() => __importStar(require('../models/Company')));
        const { User } = yield Promise.resolve().then(() => __importStar(require('../models/User')));
        const { Property } = yield Promise.resolve().then(() => __importStar(require('../models/Property')));
        const File = (yield Promise.resolve().then(() => __importStar(require('../models/File')))).default;
        const SalesFile = (yield Promise.resolve().then(() => __importStar(require('../models/SalesFile')))).default;
        const { Deal } = yield Promise.resolve().then(() => __importStar(require('../models/Deal')));
        const userRoutes = (yield Promise.resolve().then(() => __importStar(require('../routes/userRoutes')))).default;
        const companyRoutes = (yield Promise.resolve().then(() => __importStar(require('../routes/companyRoutes')))).default;
        const fileRoutes = (yield Promise.resolve().then(() => __importStar(require('../routes/fileRoutes')))).default;
        const salesFileRoutes = (yield Promise.resolve().then(() => __importStar(require('../routes/salesFileRoutes')))).default;
        yield connectDatabase();
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use('/api/users', userRoutes);
        app.use('/api/companies', companyRoutes);
        app.use('/api/files', fileRoutes);
        app.use('/api/sales-files', salesFileRoutes);
        app.use(errorHandler_2.errorHandler);
        const server = http_1.default.createServer(app);
        yield new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const stamp = `FIRSTADOPT${Date.now().toString().slice(-8)}`;
        const password = 'FirstAdopt-Test-1';
        const createdUserIds = [];
        const createdCompanyIds = [];
        const createdPropertyIds = [];
        const createdFileIds = [];
        const createdSalesFileIds = [];
        const createdDealIds = [];
        try {
            const bootstrap = yield User.create({
                email: `${stamp}-boot@example.test`,
                password,
                firstName: 'Boot',
                lastName: 'Strap',
                role: 'admin',
                roles: ['admin'],
                isActive: true,
            });
            createdUserIds.push(bootstrap._id);
            const companyA = yield Company.create({
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
            const companyB = yield Company.create({
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
            const adminA = yield User.create({
                email: `${stamp}-admin-a@example.test`,
                password,
                firstName: 'Admin',
                lastName: 'A',
                role: 'admin',
                roles: ['admin'],
                companyId: companyA._id,
                isActive: true,
            });
            const agentA = yield User.create({
                email: `${stamp}-agent-a@example.test`,
                password,
                firstName: 'Agent',
                lastName: 'A',
                role: 'agent',
                roles: ['agent'],
                companyId: companyA._id,
                isActive: true,
            });
            const agentB = yield User.create({
                email: `${stamp}-agent-b@example.test`,
                password,
                firstName: 'Agent',
                lastName: 'B',
                role: 'agent',
                roles: ['agent'],
                companyId: companyA._id,
                isActive: true,
            });
            const accountantA = yield User.create({
                email: `${stamp}-accountant-a@example.test`,
                password,
                firstName: 'Accountant',
                lastName: 'A',
                role: 'accountant',
                roles: ['accountant'],
                companyId: companyA._id,
                isActive: true,
            });
            const adminB = yield User.create({
                email: `${stamp}-admin-b@example.test`,
                password,
                firstName: 'Admin',
                lastName: 'B',
                role: 'admin',
                roles: ['admin'],
                companyId: companyB._id,
                isActive: true,
            });
            const staff = yield User.create({
                email: `${stamp}-staff@example.test`,
                password,
                firstName: 'Staff',
                lastName: 'A',
                role: 'agent',
                roles: ['agent'],
                companyId: companyA._id,
                isActive: true,
            });
            const platform = yield User.create({
                email: `${stamp}-platform@example.test`,
                password,
                firstName: 'Platform',
                lastName: 'Admin',
                role: 'admin',
                roles: ['admin', 'system_admin'],
                isActive: true,
            });
            createdUserIds.push(adminA._id, agentA._id, agentB._id, accountantA._id, adminB._id, staff._id, platform._id);
            const propertyA = yield Property.create({
                name: `${stamp} Property A`,
                address: '10 Agent A Road',
                companyId: companyA._id,
                ownerId: agentA._id,
                agentId: agentA._id,
                rent: 900,
            });
            const propertyB = yield Property.create({
                name: `${stamp} Property B`,
                address: '20 Agent B Road',
                companyId: companyA._id,
                ownerId: agentB._id,
                agentId: agentB._id,
                rent: 800,
            });
            createdPropertyIds.push(propertyA._id, propertyB._id);
            const privateName = `${stamp}-lease.txt`;
            const privateFile = yield File.create({
                propertyId: propertyA._id,
                companyId: companyA._id,
                fileName: privateName,
                fileType: 'lease',
                fileUrl: Buffer.from('private lease').toString('base64'),
                uploadedBy: agentA._id,
            });
            const salesFile = yield SalesFile.create({
                propertyId: propertyA._id,
                companyId: companyA._id,
                fileName: `${stamp}-sale.txt`,
                docType: 'Offer',
                fileUrl: Buffer.from('private sale').toString('base64'),
                uploadedBy: agentA._id,
            });
            createdFileIds.push(privateFile._id);
            createdSalesFileIds.push(salesFile._id);
            const dealB = yield Deal.create({
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
            const escalate = yield request(port, 'POST', '/api/users', adminToken, {
                email: `${stamp}-escalated@example.test`,
                password,
                firstName: 'Escalated',
                lastName: 'User',
                role: 'system_admin',
                roles: ['system_admin'],
            });
            const escalatedCount = yield User.countDocuments({ email: `${stamp}-escalated@example.test` });
            record('Company admin cannot create a system administrator', escalate.status === 403 && escalatedCount === 0, `status ${escalate.status}, count ${escalatedCount}`);
            const beforePlatform = yield User.findById(platform._id).select('password role roles isActive updatedAt');
            const platformWrite = yield request(port, 'PUT', `/api/users/${platform._id}`, adminToken, {
                role: 'system_admin',
                password: 'Hacked-Password-1',
                isActive: false,
            });
            const afterPlatform = yield User.findById(platform._id).select('password role roles isActive updatedAt');
            record('Denied platform-user write leaves the account unchanged', platformWrite.status === 403
                && String(beforePlatform === null || beforePlatform === void 0 ? void 0 : beforePlatform.password) === String(afterPlatform === null || afterPlatform === void 0 ? void 0 : afterPlatform.password)
                && (beforePlatform === null || beforePlatform === void 0 ? void 0 : beforePlatform.role) === (afterPlatform === null || afterPlatform === void 0 ? void 0 : afterPlatform.role)
                && (beforePlatform === null || beforePlatform === void 0 ? void 0 : beforePlatform.isActive) === (afterPlatform === null || afterPlatform === void 0 ? void 0 : afterPlatform.isActive)
                && String(beforePlatform === null || beforePlatform === void 0 ? void 0 : beforePlatform.updatedAt) === String(afterPlatform === null || afterPlatform === void 0 ? void 0 : afterPlatform.updatedAt), `status ${platformWrite.status}`);
            const beforeStaff = yield User.findById(staff._id).select('password role roles updatedAt');
            const staffWrite = yield request(port, 'PUT', `/api/users/${staff._id}`, adminToken, {
                role: 'system_admin',
                roles: ['system_admin'],
                password: 'Hacked-Password-1',
            });
            const afterStaff = yield User.findById(staff._id).select('password role roles updatedAt');
            record('Denied role escalation does not change the user or password', staffWrite.status === 403
                && String(beforeStaff === null || beforeStaff === void 0 ? void 0 : beforeStaff.password) === String(afterStaff === null || afterStaff === void 0 ? void 0 : afterStaff.password)
                && (beforeStaff === null || beforeStaff === void 0 ? void 0 : beforeStaff.role) === 'agent'
                && (afterStaff === null || afterStaff === void 0 ? void 0 : afterStaff.role) === 'agent'
                && String(beforeStaff === null || beforeStaff === void 0 ? void 0 : beforeStaff.updatedAt) === String(afterStaff === null || afterStaff === void 0 ? void 0 : afterStaff.updatedAt), `status ${staffWrite.status}`);
            const foreignWrite = yield request(port, 'PUT', `/api/users/${agentA._id}`, adminBToken, { firstName: 'Taken' });
            const afterForeign = yield User.findById(agentA._id).select('firstName');
            record('Company B admin cannot update a Company A user', foreignWrite.status === 403 && (afterForeign === null || afterForeign === void 0 ? void 0 : afterForeign.firstName) === 'Agent', `status ${foreignWrite.status}`);
            const allowedWrite = yield request(port, 'PUT', `/api/users/${staff._id}`, adminToken, { role: 'accountant', roles: ['accountant'] });
            const afterAllowed = yield User.findById(staff._id).select('role');
            record('Company admin can still assign an ordinary company role', allowedWrite.status === 200 && (afterAllowed === null || afterAllowed === void 0 ? void 0 : afterAllowed.role) === 'accountant', `status ${allowedWrite.status}`);
            companyA.tenantStatus = 'suspended';
            companyA.onboardingStatus = 'SUSPENDED';
            yield companyA.save();
            const unsuspend = yield request(port, 'PUT', `/api/companies/${companyA._id}`, adminToken, {
                tenantStatus: 'active',
                onboardingStatus: 'ACTIVE',
                onboardingCompleted: true,
            });
            const afterCompany = yield Company.findById(companyA._id).select('tenantStatus onboardingStatus');
            record('Suspended company cannot clear its own suspension', unsuspend.status === 403
                && (afterCompany === null || afterCompany === void 0 ? void 0 : afterCompany.tenantStatus) === 'suspended'
                && (afterCompany === null || afterCompany === void 0 ? void 0 : afterCompany.onboardingStatus) === 'SUSPENDED', `status ${unsuspend.status}, tenant ${afterCompany === null || afterCompany === void 0 ? void 0 : afterCompany.tenantStatus}`);
            const suspendedDownload = yield request(port, 'GET', `/api/files/download/${privateFile._id}`, agentAToken);
            const suspendedFileCount = yield File.countDocuments({ _id: privateFile._id });
            record('Suspended company cannot download a portfolio file', suspendedDownload.status === 403 && suspendedFileCount === 1, `status ${suspendedDownload.status}`);
            companyA.tenantStatus = 'active';
            companyA.onboardingStatus = 'ACTIVE';
            yield companyA.save();
            const unauthenticated = yield request(port, 'GET', `/api/files/download/${privateFile._id}`);
            record('Unauthenticated file download is rejected', unauthenticated.status === 401, `status ${unauthenticated.status}`);
            const otherAgent = yield request(port, 'GET', `/api/files/download/${privateFile._id}`, agentBToken);
            const stillThere = yield File.countDocuments({ _id: privateFile._id });
            record('Another agent cannot download a portfolio file', otherAgent.status === 404 && stillThere === 1 && !otherAgent.text.includes('private lease'), `status ${otherAgent.status}`);
            const otherDelete = yield request(port, 'DELETE', `/api/files/${privateFile._id}`, agentBToken);
            const stillThereAfterDelete = yield File.countDocuments({ _id: privateFile._id });
            record('Denied file delete does not remove the document', otherDelete.status === 404 && stillThereAfterDelete === 1, `status ${otherDelete.status}`);
            const ownerDownload = yield request(port, 'GET', `/api/files/download/${privateFile._id}`, agentAToken);
            record('Assigned agent can download the file', ownerDownload.status === 200 && ownerDownload.text.includes('private lease'), `status ${ownerDownload.status}`);
            const accountantDownload = yield request(port, 'GET', `/api/files/download/${privateFile._id}`, accountantToken);
            record('Company accountant can download the company file', accountantDownload.status === 200, `status ${accountantDownload.status}`);
            const foreignDownload = yield request(port, 'GET', `/api/files/download/${privateFile._id}`, adminBToken);
            record('Company B cannot download Company A file', foreignDownload.status === 404, `status ${foreignDownload.status}`);
            const listB = yield request(port, 'GET', '/api/files', agentBToken);
            record('Agent file list excludes another agent portfolio', listB.status === 200 && !listB.text.includes(privateName), `status ${listB.status}`);
            const salesDownload = yield request(port, 'GET', `/api/sales-files/${salesFile._id}/download`, agentBToken);
            const salesRemain = yield SalesFile.countDocuments({ _id: salesFile._id });
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
            const beforeSales = yield SalesFile.countDocuments({ companyId: companyA._id });
            const substituted = yield request(port, 'POST', '/api/sales-files/upload', agentAToken, undefined, {
                contentType: `multipart/form-data; boundary=${boundary}`,
                payload: multipart,
            });
            const afterSales = yield SalesFile.countDocuments({ companyId: companyA._id });
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
            const beforeFiles = yield File.countDocuments({ companyId: companyA._id });
            const htmlResult = yield request(port, 'POST', '/api/files/upload', agentAToken, undefined, {
                contentType: `multipart/form-data; boundary=${htmlBoundary}`,
                payload: htmlUpload,
            });
            const afterFiles = yield File.countDocuments({ companyId: companyA._id });
            record('HTML upload is rejected and stores nothing', htmlResult.status === 400 && afterFiles === beforeFiles, `status ${htmlResult.status}, count ${beforeFiles}->${afterFiles}`);
        }
        finally {
            if (createdSalesFileIds.length)
                yield SalesFile.deleteMany({ _id: { $in: createdSalesFileIds } });
            yield SalesFile.deleteMany({ companyId: { $in: createdCompanyIds } });
            if (createdFileIds.length)
                yield File.deleteMany({ _id: { $in: createdFileIds } });
            yield File.deleteMany({ companyId: { $in: createdCompanyIds } });
            if (createdDealIds.length)
                yield Deal.deleteMany({ _id: { $in: createdDealIds } });
            if (createdPropertyIds.length)
                yield Property.deleteMany({ _id: { $in: createdPropertyIds } });
            if (createdUserIds.length)
                yield User.deleteMany({ _id: { $in: createdUserIds } });
            yield User.deleteMany({ email: new RegExp(`^${stamp}-`) });
            if (createdCompanyIds.length)
                yield Company.deleteMany({ _id: { $in: createdCompanyIds } });
            yield new Promise((resolve) => server.close(() => resolve()));
            const { closeDatabase } = yield Promise.resolve().then(() => __importStar(require('../config/database')));
            yield closeDatabase();
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        runStaticChecks();
        yield runHttpChecks();
        const failed = checks.filter((check) => !check.ok);
        console.log(`First-adoption readiness checks: ${checks.length - failed.length}/${checks.length} passed`);
        process.exit(failed.length ? 1 : 0);
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
