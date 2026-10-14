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
 * Isolated live API E2E for the ecosystem overlay.
 * Uses local Mongo + the running API. Does not print passwords.
 * Safe to re-run: deletes only @mantis-e2e.test records.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const File_1 = __importDefault(require("../models/File"));
const Payment_1 = require("../models/Payment");
const MaintenanceContractor_1 = require("../models/MaintenanceContractor");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const MaintenanceQuote_1 = require("../models/MaintenanceQuote");
const JournalEntry_1 = require("../models/JournalEntry");
const Notification_1 = require("../models/Notification");
const maintenanceWorkflow_1 = require("../ecosystem/models/maintenanceWorkflow");
const commsAndPayments_1 = require("../ecosystem/models/commsAndPayments");
const tenantFacing_1 = require("../ecosystem/models/tenantFacing");
const API = process.env.ECOSYSTEM_E2E_API || 'http://localhost:5000';
const DOMAIN = 'mantis-e2e.test';
const PASSWORD = process.env.ECOSYSTEM_E2E_PASSWORD || `E2e!${crypto_1.default.randomBytes(8).toString('hex')}`;
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';
const checks = [];
function record(name, result, detail) {
    checks.push({ name, result, detail });
    const suffix = detail ? ` — ${detail}` : '';
    console.log(`  ${result.padEnd(7)} ${name}${suffix}`);
}
function api(path_1) {
    return __awaiter(this, arguments, void 0, function* (path, opts = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (opts.token)
            headers.Authorization = `Bearer ${opts.token}`;
        const res = yield fetch(`${API}${path}`, {
            method: opts.method || 'GET',
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
        let json = null;
        try {
            json = yield res.json();
        }
        catch (_a) {
            json = null;
        }
        return { status: res.status, json };
    });
}
function login(email) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        for (let attempt = 0; attempt < 4; attempt++) {
            const res = yield api('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
            if (res.status === 429) {
                yield new Promise((r) => setTimeout(r, 65000));
                continue;
            }
            if (res.status >= 400 || !((_a = res.json) === null || _a === void 0 ? void 0 : _a.token)) {
                throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.json)}`);
            }
            return res.json.token;
        }
        throw new Error(`Login rate-limited for ${email}`);
    });
}
function expectStatus(name, got, allowed) {
    return __awaiter(this, void 0, void 0, function* () {
        if (allowed.includes(got))
            record(name, 'PASS', `HTTP ${got}`);
        else
            record(name, 'FAIL', `HTTP ${got}, expected ${allowed.join('|')}`);
    });
}
function wipeE2E() {
    return __awaiter(this, void 0, void 0, function* () {
        const users = yield User_1.User.find({ email: { $regex: `@${DOMAIN}$`, $options: 'i' } }).select('_id').lean();
        const userIds = users.map((u) => u._id);
        const companies = yield Company_1.Company.find({ email: { $regex: `@${DOMAIN}$`, $options: 'i' } }).select('_id').lean();
        const companyIds = companies.map((c) => c._id);
        const properties = yield Property_1.Property.find({
            $or: [{ companyId: { $in: companyIds } }, { name: { $regex: '^E2E ' } }],
        }).select('_id').lean();
        const propertyIds = properties.map((p) => p._id);
        const tenants = yield Tenant_1.Tenant.find({
            $or: [{ companyId: { $in: companyIds } }, { email: { $regex: `@${DOMAIN}$`, $options: 'i' } }],
        }).select('_id').lean();
        const tenantIds = tenants.map((t) => t._id);
        yield Promise.all([
            User_1.User.deleteMany({ _id: { $in: userIds } }),
            Company_1.Company.deleteMany({ _id: { $in: companyIds } }),
            Property_1.Property.deleteMany({ _id: { $in: propertyIds } }),
            PropertyOwner_1.PropertyOwner.deleteMany({ email: { $regex: `@${DOMAIN}$`, $options: 'i' } }),
            Tenant_1.Tenant.deleteMany({ _id: { $in: tenantIds } }),
            Lease_1.Lease.deleteMany({ companyId: { $in: companyIds } }),
            File_1.default.deleteMany({ companyId: { $in: companyIds } }),
            Payment_1.Payment.deleteMany({ companyId: { $in: companyIds } }),
            MaintenanceContractor_1.MaintenanceContractor.deleteMany({ companyId: { $in: companyIds } }),
            MaintenanceRequest_1.MaintenanceRequest.deleteMany({ companyId: { $in: companyIds } }),
            MaintenanceQuote_1.MaintenanceQuote.deleteMany({ companyId: { $in: companyIds } }),
            maintenanceWorkflow_1.QuoteInvitation.deleteMany({ companyId: { $in: companyIds } }),
            maintenanceWorkflow_1.ContractorJobRecord.deleteMany({ companyId: { $in: companyIds } }),
            maintenanceWorkflow_1.MaintenanceChangeOrder.deleteMany({ companyId: { $in: companyIds } }),
            tenantFacing_1.ViewingRequest.deleteMany({ companyId: { $in: companyIds } }),
            tenantFacing_1.RentalApplication.deleteMany({ companyId: { $in: companyIds } }),
            tenantFacing_1.TenantProfile.deleteMany({ companyId: { $in: companyIds } }),
            commsAndPayments_1.EcosystemPaymentIntent.deleteMany({ companyId: { $in: companyIds } }),
            Notification_1.Notification.deleteMany({ userId: { $in: userIds } }),
            commsAndPayments_1.NotificationDelivery.deleteMany({ recipientId: { $in: userIds } }),
        ]);
    });
}
function makeUser(params) {
    return __awaiter(this, void 0, void 0, function* () {
        return User_1.User.create({
            email: params.email,
            password: PASSWORD,
            firstName: params.firstName,
            lastName: params.lastName,
            role: params.role,
            roles: [params.role],
            companyId: params.companyId,
            isActive: true,
        });
    });
}
function seedCompany(tag) {
    return __awaiter(this, void 0, void 0, function* () {
        const admin = yield makeUser({
            email: `ecosystem-admin-${tag}@${DOMAIN}`,
            firstName: 'Admin',
            lastName: tag.toUpperCase(),
            role: 'admin',
        });
        const stamp = `${Date.now()}${tag}`;
        const company = yield Company_1.Company.create({
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
        admin.companyId = company._id;
        yield admin.save();
        const agent = yield makeUser({
            email: `ecosystem-agent-${tag}@${DOMAIN}`,
            firstName: 'Agent',
            lastName: tag.toUpperCase(),
            role: 'agent',
            companyId: company._id,
        });
        const ownerUser = yield makeUser({
            email: `ecosystem-owner-${tag}@${DOMAIN}`,
            firstName: 'Owner',
            lastName: tag.toUpperCase(),
            role: 'owner',
            companyId: company._id,
        });
        const ownerDoc = yield PropertyOwner_1.PropertyOwner.create({
            email: ownerUser.email,
            password: PASSWORD,
            firstName: 'Owner',
            lastName: tag.toUpperCase(),
            phone: tag === 'a' ? '0711000011' : '0711000012',
            companyId: company._id,
            properties: [],
            active: true,
        });
        const tenantUser = yield makeUser({
            email: `ecosystem-tenant-${tag}@${DOMAIN}`,
            firstName: 'Tenant',
            lastName: tag.toUpperCase(),
            role: 'tenant',
            companyId: company._id,
        });
        const property = yield Property_1.Property.create({
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
        ownerDoc.properties = [property._id];
        yield ownerDoc.save();
        const tenant = yield Tenant_1.Tenant.create({
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
        yield tenantFacing_1.TenantProfile.create({
            userId: tenantUser._id,
            companyId: company._id,
            tenantId: tenant._id,
            fullName: `Tenant ${tag.toUpperCase()}`,
            email: tenantUser.email,
            profileCompletionPercent: 40,
        });
        const lease = yield Lease_1.Lease.create({
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
        const leaseFile = yield File_1.default.create({
            propertyId: property._id,
            companyId: company._id,
            fileName: 'signed-lease.pdf',
            fileType: 'lease',
            fileUrl: 'data:application/pdf;base64,AAA=',
            uploadedBy: agent._id,
        });
        const taxFile = yield File_1.default.create({
            propertyId: property._id,
            companyId: company._id,
            fileName: 'owner-tax-return.pdf',
            fileType: 'tax',
            fileUrl: 'data:application/pdf;base64,SECRET=',
            uploadedBy: agent._id,
        });
        const payment = yield Payment_1.Payment.create({
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
            const user = yield makeUser({
                email: `ecosystem-contractor-${letter}@${DOMAIN}`,
                firstName: 'Contractor',
                lastName: letter.toUpperCase(),
                role: 'contractor',
                companyId: company._id,
            });
            const profile = yield MaintenanceContractor_1.MaintenanceContractor.create({
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
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6;
        const health = yield api('/api/ecosystem/health');
        if (health.status !== 200) {
            record('API health', 'BLOCKED', `HTTP ${health.status}`);
            printSummary();
            process.exit(2);
        }
        record('API health', 'PASS');
        yield mongoose_1.default.connect(MONGO);
        yield wipeE2E();
        const a = yield seedCompany('a');
        const b = yield seedCompany('b');
        const tokens = {
            agentA: yield login(a.agent.email),
            agentB: yield login(b.agent.email),
            ownerA: yield login(a.ownerUser.email),
            ownerB: yield login(b.ownerUser.email),
            tenantA: yield login(a.tenantUser.email),
            tenantB: yield login(b.tenantUser.email),
            contractorA: yield login(a.contractors[0].user.email),
            contractorB: yield login(a.contractors[1].user.email),
            contractorC: yield login(a.contractors[2].user.email),
        };
        record('Test users login', 'PASS', 'owner/agent/tenant/contractor A+B');
        const journalsBefore = yield JournalEntry_1.JournalEntry.countDocuments({ companyId: a.company._id });
        const paymentsBefore = yield Payment_1.Payment.countDocuments({ companyId: a.company._id });
        const overview = yield api('/api/ecosystem/me/overview', { token: tokens.tenantA });
        expectStatus('Tenant dashboard overview', overview.status, [200]);
        const profile = yield api('/api/ecosystem/me/profile', { token: tokens.tenantA });
        expectStatus('Tenant profile', profile.status, [200]);
        const listings = yield api('/api/ecosystem/listings');
        const listingItems = ((_a = listings.json) === null || _a === void 0 ? void 0 : _a.items) || listings.json;
        const listingOk = listings.status === 200 && Array.isArray(listingItems) && listingItems.some((row) => String(row._id) === String(a.property._id));
        record('Public listings', listingOk ? 'PASS' : 'FAIL', `HTTP ${listings.status} count=${Array.isArray(listingItems) ? listingItems.length : 0}`);
        const listing = yield api(`/api/ecosystem/listings/${a.property._id}`);
        expectStatus('Open listing', listing.status, [200]);
        const viewing = yield api('/api/ecosystem/viewings', {
            token: tokens.tenantA,
            method: 'POST',
            body: { propertyId: String(a.property._id), requestedDate: new Date().toISOString(), message: 'Please show the unit' },
        });
        expectStatus('Request viewing', viewing.status, [201, 200]);
        const application = yield api('/api/ecosystem/applications', {
            token: tokens.tenantA,
            method: 'POST',
            body: { propertyId: String(a.property._id), notes: 'E2E apply', submit: true },
        });
        expectStatus('Submit application', application.status, [201, 200]);
        const leases = yield api('/api/ecosystem/me/leases', { token: tokens.tenantA });
        expectStatus('Tenant lease', leases.status, [200]);
        const payments = yield api('/api/ecosystem/me/payments', { token: tokens.tenantA });
        const paymentVisible = payments.status === 200 && Array.isArray(payments.json) && payments.json.some((p) => String(p._id) === String(a.payment._id));
        record('Tenant canonical payment', paymentVisible ? 'PASS' : 'FAIL', `HTTP ${payments.status}`);
        const receipt = yield api(`/api/ecosystem/me/receipts/${a.payment._id}`, { token: tokens.tenantA });
        expectStatus('Tenant receipt', receipt.status, [200]);
        const docs = yield api('/api/ecosystem/me/documents', { token: tokens.tenantA });
        const files = ((_b = docs.json) === null || _b === void 0 ? void 0 : _b.files) || [];
        const listedLease = files.some((f) => String(f._id) === String(a.leaseFile._id));
        const listedTax = files.some((f) => String(f._id) === String(a.taxFile._id));
        const listedUrl = files.some((f) => f.url || f.fileUrl);
        record('Tenant document allowlist', listedLease && !listedTax && !listedUrl ? 'PASS' : 'FAIL', `lease=${listedLease} tax=${listedTax} url=${listedUrl}`);
        const ownFile = yield api(`/api/ecosystem/me/documents/files/${a.leaseFile._id}`, { token: tokens.tenantA });
        expectStatus('Tenant allowed file', ownFile.status, [200]);
        const taxDirect = yield api(`/api/ecosystem/me/documents/files/${a.taxFile._id}`, { token: tokens.tenantA });
        expectStatus('Tenant denied tax file', taxDirect.status, [403]);
        const crossFile = yield api(`/api/ecosystem/me/documents/files/${b.leaseFile._id}`, { token: tokens.tenantA });
        expectStatus('Tenant A cannot read Property B file', crossFile.status, [403]);
        const tenantBFile = yield api(`/api/ecosystem/me/documents/files/${a.leaseFile._id}`, { token: tokens.tenantB });
        expectStatus('Tenant B cannot read Property A file', tenantBFile.status, [403]);
        const crossLease = yield api(`/api/ecosystem/me/receipts/${b.payment._id}`, { token: tokens.tenantA });
        expectStatus('Tenant A cannot read Tenant B receipt', crossLease.status, [403, 404]);
        const crossMaint = yield api('/api/ecosystem/maintenance', {
            token: tokens.tenantA,
            method: 'POST',
            body: { propertyId: String(b.property._id), title: 'cross', description: 'should fail', category: 'PLUMBING', urgency: 'NORMAL' },
        });
        expectStatus('Tenant A cannot report on Property B', crossMaint.status, [403]);
        const online = yield api('/api/ecosystem/payments/online/initialize', {
            token: tokens.tenantA,
            method: 'POST',
            body: { propertyId: String(a.property._id), amount: 500, companyId: String(b.company._id) },
        });
        expectStatus('Online payments remain disabled', online.status, [403]);
        const reported = yield api('/api/ecosystem/maintenance', {
            token: tokens.tenantA,
            method: 'POST',
            body: { propertyId: String(a.property._id), title: 'Plumbing leak', description: 'Kitchen sink leak', category: 'PLUMBING', urgency: 'URGENT' },
        });
        expectStatus('Tenant report maintenance', reported.status, [201, 200]);
        const requestId = ((_c = reported.json) === null || _c === void 0 ? void 0 : _c._id) || ((_e = (_d = reported.json) === null || _d === void 0 ? void 0 : _d.request) === null || _e === void 0 ? void 0 : _e._id);
        if (!requestId) {
            record('Maintenance workflow', 'FAIL', 'no request id');
            printSummary();
            yield mongoose_1.default.disconnect();
            process.exit(1);
        }
        const companyBMaint = yield api(`/api/ecosystem/agency/maintenance/${requestId}/review`, { token: tokens.agentB, method: 'POST', body: {} });
        expectStatus('Agent B cannot review Company A maintenance', companyBMaint.status, [403, 404]);
        const review = yield api(`/api/ecosystem/agency/maintenance/${requestId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
        expectStatus('Agent review', review.status, [200]);
        const invite = yield api(`/api/ecosystem/agency/maintenance/${requestId}/invite`, {
            token: tokens.agentA,
            method: 'POST',
            body: { contractorIds: a.contractors.map((c) => String(c.profile._id)) },
        });
        expectStatus('Invite three contractors', invite.status, [200, 201]);
        const jobsA = yield api('/api/ecosystem/contractor/jobs', { token: tokens.contractorA });
        const jobA = Array.isArray(jobsA.json) ? jobsA.json.find((j) => String(j.requestId) === String(requestId)) : null;
        const startEarly = yield api(`/api/ecosystem/contractor/jobs/${jobA === null || jobA === void 0 ? void 0 : jobA._id}/status`, {
            token: tokens.contractorA,
            method: 'POST',
            body: { status: 'WORK_IN_PROGRESS', companyId: String(a.company._id) },
        });
        expectStatus('Start work before approvals rejected', startEarly.status, [403, 409]);
        const quoteA = yield api(`/api/ecosystem/contractor/maintenance/${requestId}/quotes`, {
            token: tokens.contractorA,
            method: 'POST',
            body: { description: 'Fix sink A', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 100 }] },
        });
        const quoteB = yield api(`/api/ecosystem/contractor/maintenance/${requestId}/quotes`, {
            token: tokens.contractorB,
            method: 'POST',
            body: { description: 'Fix sink B', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 120 }] },
        });
        const quoteC = yield api(`/api/ecosystem/contractor/maintenance/${requestId}/quotes`, {
            token: tokens.contractorC,
            method: 'POST',
            body: { description: 'Fix sink C', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 95 }] },
        });
        expectStatus('Contractor A quote $100', quoteA.status, [201, 200]);
        expectStatus('Contractor B quote $120', quoteB.status, [201, 200]);
        expectStatus('Contractor C quote $95', quoteC.status, [201, 200]);
        const contractorQuotes = yield api('/api/ecosystem/contractor/quotes', { token: tokens.contractorA });
        const sawCompetitor = Array.isArray(contractorQuotes.json) && contractorQuotes.json.some((q) => { var _a, _b; return Number((_a = q.total) !== null && _a !== void 0 ? _a : q.amount) === 120 || Number((_b = q.total) !== null && _b !== void 0 ? _b : q.amount) === 95; });
        record('Contractor A cannot see competitor quotes', !sawCompetitor && contractorQuotes.status === 200 ? 'PASS' : 'FAIL');
        const agencyQuotes = yield api(`/api/ecosystem/agency/maintenance/${requestId}/quotes`, { token: tokens.contractorA });
        expectStatus('Contractor cannot use agency quote list', agencyQuotes.status, [403]);
        const allQuotes = yield api(`/api/ecosystem/agency/maintenance/${requestId}/quotes`, { token: tokens.agentA });
        const quoteCount = Array.isArray(allQuotes.json) ? allQuotes.json.length : 0;
        record('Agent sees all three quotes', quoteCount === 3 ? 'PASS' : 'FAIL', `count=${quoteCount}`);
        const selectedId = (_f = quoteA.json) === null || _f === void 0 ? void 0 : _f._id;
        const select = yield api(`/api/ecosystem/agency/maintenance/${requestId}/quotes/${selectedId}/select`, {
            token: tokens.agentA,
            method: 'POST',
            body: { reason: 'Known plumber' },
        });
        expectStatus('Agent select quote', select.status, [200]);
        const send = yield api(`/api/ecosystem/agency/maintenance/${requestId}/send-to-owner`, { token: tokens.agentA, method: 'POST', body: {} });
        expectStatus('Send quote to owner', send.status, [200]);
        const ownerBDecide = yield api(`/api/ecosystem/owner/maintenance/${requestId}/decision`, {
            token: tokens.ownerB,
            method: 'POST',
            body: { decision: 'APPROVE' },
        });
        expectStatus('Owner B cannot approve Owner A quote', ownerBDecide.status, [403]);
        const ownerBQuote = yield api(`/api/ecosystem/owner/maintenance/${requestId}/quote`, { token: tokens.ownerB });
        expectStatus('Owner B cannot read Owner A quote', ownerBQuote.status, [403]);
        const ownerADecide = yield api(`/api/ecosystem/owner/maintenance/${requestId}/decision`, {
            token: tokens.ownerA,
            method: 'POST',
            body: { decision: 'APPROVE' },
        });
        expectStatus('Owner A approve', ownerADecide.status, [200]);
        const editLocked = yield api(`/api/ecosystem/contractor/maintenance/${requestId}/quotes`, {
            token: tokens.contractorA,
            method: 'POST',
            body: { description: 'Edit v1', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 999 }] },
        });
        expectStatus('Edit owner-approved quote rejected', editLocked.status, [403, 409]);
        const lockedQuote = yield MaintenanceQuote_1.MaintenanceQuote.findById(selectedId).lean();
        record('Original quote amount intact', Number((_g = lockedQuote === null || lockedQuote === void 0 ? void 0 : lockedQuote.total) !== null && _g !== void 0 ? _g : lockedQuote === null || lockedQuote === void 0 ? void 0 : lockedQuote.amount) === 100 ? 'PASS' : 'FAIL', `amount=${(_h = lockedQuote === null || lockedQuote === void 0 ? void 0 : lockedQuote.total) !== null && _h !== void 0 ? _h : lockedQuote === null || lockedQuote === void 0 ? void 0 : lockedQuote.amount}`);
        const authorise = yield api(`/api/ecosystem/agency/maintenance/${requestId}/authorise`, { token: tokens.agentA, method: 'POST', body: {} });
        expectStatus('Agent authorise contractor', authorise.status, [200]);
        const jobsAfter = yield api('/api/ecosystem/contractor/jobs', { token: tokens.contractorA });
        const authorisedJob = Array.isArray(jobsAfter.json) ? jobsAfter.json.find((j) => String(j.requestId) === String(requestId)) : null;
        const accept = yield api(`/api/ecosystem/contractor/jobs/${authorisedJob === null || authorisedJob === void 0 ? void 0 : authorisedJob._id}/status`, {
            token: tokens.contractorA,
            method: 'POST',
            body: { status: 'ACCEPTED' },
        });
        expectStatus('Contractor accept', accept.status, [200]);
        const start = yield api(`/api/ecosystem/contractor/jobs/${authorisedJob === null || authorisedJob === void 0 ? void 0 : authorisedJob._id}/status`, {
            token: tokens.contractorA,
            method: 'POST',
            body: { status: 'WORK_IN_PROGRESS' },
        });
        expectStatus('Contractor start work', start.status, [200]);
        const complete = yield api(`/api/ecosystem/contractor/jobs/${authorisedJob === null || authorisedJob === void 0 ? void 0 : authorisedJob._id}/status`, {
            token: tokens.contractorA,
            method: 'POST',
            body: { status: 'COMPLETED', completion: { notes: 'Leak repaired', actualCompletionDate: new Date().toISOString() } },
        });
        expectStatus('Contractor complete work', complete.status, [200]);
        const confirm = yield api(`/api/ecosystem/maintenance/${requestId}/confirm`, {
            token: tokens.tenantA,
            method: 'POST',
            body: { confirm: true },
        });
        expectStatus('Tenant confirm completion', confirm.status, [200]);
        const change = yield api(`/api/ecosystem/contractor/jobs/${authorisedJob === null || authorisedJob === void 0 ? void 0 : authorisedJob._id}/change-orders`, {
            token: tokens.contractorA,
            method: 'POST',
            body: { requestedAmount: 50, description: 'Extra parts' },
        });
        expectStatus('Change order +50', change.status, [201, 200]);
        const changeId = ((_k = (_j = change.json) === null || _j === void 0 ? void 0 : _j.changeOrder) === null || _k === void 0 ? void 0 : _k._id) || ((_l = change.json) === null || _l === void 0 ? void 0 : _l._id);
        const originalAmount = (_m = change.json) === null || _m === void 0 ? void 0 : _m.originalQuoteAmount;
        record('Change order keeps original $100', Number(originalAmount) === 100 ? 'PASS' : 'FAIL', `original=${originalAmount}`);
        if (changeId) {
            const agentCo = yield api(`/api/ecosystem/agency/change-orders/${changeId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
            expectStatus('Agent review change order', agentCo.status, [200]);
            const ownerCo = yield api(`/api/ecosystem/owner/change-orders/${changeId}/decision`, {
                token: tokens.ownerA,
                method: 'POST',
                body: { decision: 'APPROVE' },
            });
            expectStatus('Owner approve change order', ownerCo.status, [200]);
            const stillOriginal = yield MaintenanceQuote_1.MaintenanceQuote.findById(selectedId).lean();
            record('Approved quote unchanged after change order', Number((_o = stillOriginal === null || stillOriginal === void 0 ? void 0 : stillOriginal.total) !== null && _o !== void 0 ? _o : stillOriginal === null || stillOriginal === void 0 ? void 0 : stillOriginal.amount) === 100 ? 'PASS' : 'FAIL');
        }
        const declineReq = yield api('/api/ecosystem/maintenance', {
            token: tokens.tenantA,
            method: 'POST',
            body: { propertyId: String(a.property._id), title: 'Second leak', description: 'Bathroom', category: 'PLUMBING', urgency: 'NORMAL' },
        });
        const declineId = (_p = declineReq.json) === null || _p === void 0 ? void 0 : _p._id;
        if (declineId) {
            yield api(`/api/ecosystem/agency/maintenance/${declineId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
            yield api(`/api/ecosystem/agency/maintenance/${declineId}/invite`, {
                token: tokens.agentA,
                method: 'POST',
                body: { contractorIds: [String(a.contractors[0].profile._id)] },
            });
            const q2 = yield api(`/api/ecosystem/contractor/maintenance/${declineId}/quotes`, {
                token: tokens.contractorA,
                method: 'POST',
                body: { description: 'Bathroom', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 80 }] },
            });
            yield api(`/api/ecosystem/agency/maintenance/${declineId}/quotes/${(_q = q2.json) === null || _q === void 0 ? void 0 : _q._id}/select`, { token: tokens.agentA, method: 'POST', body: {} });
            yield api(`/api/ecosystem/agency/maintenance/${declineId}/send-to-owner`, { token: tokens.agentA, method: 'POST', body: {} });
            const declined = yield api(`/api/ecosystem/owner/maintenance/${declineId}/decision`, {
                token: tokens.ownerA,
                method: 'POST',
                body: { decision: 'DECLINE', comment: 'Too expensive' },
            });
            expectStatus('Owner decline', declined.status, [200]);
        }
        else {
            record('Owner decline', 'FAIL', 'second request missing');
        }
        const ownerAQueue = yield api('/api/ecosystem/owner/maintenance', { token: tokens.ownerA });
        const ownerSeesB = Array.isArray(ownerAQueue.json) && ownerAQueue.json.some((m) => String(m.companyId) === String(b.company._id) || String(m.propertyId) === String(b.property._id));
        record('Owner A queue isolated', ownerAQueue.status === 200 && !ownerSeesB ? 'PASS' : 'FAIL');
        const agentAQueue = yield api('/api/ecosystem/agency/maintenance', { token: tokens.agentA });
        const agentSeesB = Array.isArray(agentAQueue.json) && agentAQueue.json.some((m) => String(m.companyId) === String(b.company._id));
        record('Agent A queue isolated', agentAQueue.status === 200 && !agentSeesB ? 'PASS' : 'FAIL');
        const tenantBOverview = yield api('/api/ecosystem/me/leases', { token: tokens.tenantB });
        const tenantBSeesA = Array.isArray(tenantBOverview.json) && tenantBOverview.json.some((l) => String(l._id) === String(a.lease._id));
        record('Tenant B cannot see Tenant A lease', tenantBOverview.status === 200 && !tenantBSeesA ? 'PASS' : 'FAIL');
        const contractorX = b.contractors[0];
        const tokenX = yield login(contractorX.user.email);
        const xJobs = yield api('/api/ecosystem/contractor/jobs', { token: tokenX });
        const xSeesA = Array.isArray(xJobs.json) && xJobs.json.some((j) => String(j.companyId) === String(a.company._id));
        record('Company B contractor cannot see Company A jobs', xJobs.status === 200 && !xSeesA ? 'PASS' : 'FAIL');
        const notifications = yield api('/api/ecosystem/me/notifications', { token: tokens.agentA });
        expectStatus('Agent in-app notifications', notifications.status, [200]);
        const deliveries = yield commsAndPayments_1.NotificationDelivery.find({ recipientId: { $in: [a.agent._id, a.tenantUser._id, a.ownerUser._id, a.contractors[0].user._id] } }).lean();
        const sms = deliveries.filter((d) => d.channel === 'SMS');
        const wa = deliveries.filter((d) => d.channel === 'WHATSAPP');
        const inApp = deliveries.filter((d) => d.channel === 'IN_APP' && d.status === 'SENT');
        const skipped = [...sms, ...wa].every((d) => d.status === 'SKIPPED') && (sms.length + wa.length > 0 || true);
        record('In-app notifications delivered', inApp.length > 0 ? 'PASS' : 'FAIL', `inApp=${inApp.length}`);
        record('SMS/WhatsApp skipped', skipped ? 'PASS' : 'FAIL', `sms=${sms.length} wa=${wa.length}`);
        const journalsAfter = yield JournalEntry_1.JournalEntry.countDocuments({ companyId: a.company._id });
        const paymentsAfter = yield Payment_1.Payment.countDocuments({ companyId: a.company._id });
        record('No journals created by quote workflow', journalsAfter === journalsBefore ? 'PASS' : 'FAIL', `${journalsBefore}->${journalsAfter}`);
        record('No extra payments created by quote workflow', paymentsAfter === paymentsBefore ? 'PASS' : 'FAIL', `${paymentsBefore}->${paymentsAfter}`);
        const intents = yield commsAndPayments_1.EcosystemPaymentIntent.countDocuments({ companyId: a.company._id, posted: true });
        record('No posted payment intents', intents === 0 ? 'PASS' : 'FAIL');
        const payBeforeCanonical = yield Payment_1.Payment.countDocuments({ companyId: a.company._id });
        const journalsBeforeCanonical = yield JournalEntry_1.JournalEntry.countDocuments({ companyId: a.company._id });
        const canonical = yield api('/api/payments', {
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
        }
        else {
            record('Canonical createPayment', 'FAIL', `HTTP ${canonical.status} ${String(((_r = canonical.json) === null || _r === void 0 ? void 0 : _r.message) || ((_s = canonical.json) === null || _s === void 0 ? void 0 : _s.error) || '').slice(0, 160)}`);
        }
        const newPaymentId = ((_u = (_t = canonical.json) === null || _t === void 0 ? void 0 : _t.payment) === null || _u === void 0 ? void 0 : _u._id) || ((_v = canonical.json) === null || _v === void 0 ? void 0 : _v._id);
        const payAfterCanonical = yield Payment_1.Payment.countDocuments({ companyId: a.company._id });
        const journalsAfterCanonical = yield JournalEntry_1.JournalEntry.countDocuments({ companyId: a.company._id });
        record('Canonical payment count +1', canonical.status < 400 && payAfterCanonical === payBeforeCanonical + 1 ? 'PASS' : canonical.status >= 400 ? 'FAIL' : 'FAIL', `payments ${payBeforeCanonical}->${payAfterCanonical} HTTP ${canonical.status}`);
        record('Canonical journals posted', canonical.status < 400 && journalsAfterCanonical >= journalsBeforeCanonical + 1 ? 'PASS' : canonical.status >= 400 ? 'FAIL' : 'FAIL', `journals ${journalsBeforeCanonical}->${journalsAfterCanonical}`);
        if (newPaymentId) {
            const tenantReceipt = yield api(`/api/ecosystem/me/receipts/${newPaymentId}`, { token: tokens.tenantA });
            expectStatus('Tenant reads canonical receipt', tenantReceipt.status, [200]);
            const duplicateIntent = yield commsAndPayments_1.EcosystemPaymentIntent.countDocuments({ companyId: a.company._id });
            record('Ecosystem did not add a payment intent for canonical rent', duplicateIntent === 0 ? 'PASS' : 'FAIL', `intents=${duplicateIntent}`);
        }
        const changesReq = yield api('/api/ecosystem/maintenance', {
            token: tokens.tenantA,
            method: 'POST',
            body: { propertyId: String(a.property._id), title: 'Request-changes leak', description: 'Gutter', category: 'PLUMBING', urgency: 'NORMAL' },
        });
        const changesId = (_w = changesReq.json) === null || _w === void 0 ? void 0 : _w._id;
        if (changesId) {
            yield api(`/api/ecosystem/agency/maintenance/${changesId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
            yield api(`/api/ecosystem/agency/maintenance/${changesId}/invite`, {
                token: tokens.agentA,
                method: 'POST',
                body: { contractorIds: [String(a.contractors[0].profile._id)] },
            });
            const q3 = yield api(`/api/ecosystem/contractor/maintenance/${changesId}/quotes`, {
                token: tokens.contractorA,
                method: 'POST',
                body: { description: 'Gutter', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 88 }] },
            });
            const q3Amount = Number((_y = (_x = q3.json) === null || _x === void 0 ? void 0 : _x.total) !== null && _y !== void 0 ? _y : (_z = q3.json) === null || _z === void 0 ? void 0 : _z.amount);
            yield api(`/api/ecosystem/agency/maintenance/${changesId}/quotes/${(_0 = q3.json) === null || _0 === void 0 ? void 0 : _0._id}/select`, { token: tokens.agentA, method: 'POST', body: {} });
            yield api(`/api/ecosystem/agency/maintenance/${changesId}/send-to-owner`, { token: tokens.agentA, method: 'POST', body: {} });
            const requested = yield api(`/api/ecosystem/owner/maintenance/${changesId}/decision`, {
                token: tokens.ownerA,
                method: 'POST',
                body: { decision: 'REQUEST_CHANGES', comment: 'Please itemise materials' },
            });
            expectStatus('Owner request changes', requested.status, [200]);
            const afterChange = yield MaintenanceQuote_1.MaintenanceQuote.findById((_1 = q3.json) === null || _1 === void 0 ? void 0 : _1._id).lean();
            record('Request-changes leaves quote amount intact', Number((_2 = afterChange === null || afterChange === void 0 ? void 0 : afterChange.total) !== null && _2 !== void 0 ? _2 : afterChange === null || afterChange === void 0 ? void 0 : afterChange.amount) === q3Amount ? 'PASS' : 'FAIL');
            const jobsChange = yield api('/api/ecosystem/contractor/jobs', { token: tokens.contractorA });
            const jobChange = Array.isArray(jobsChange.json) ? jobsChange.json.find((j) => String(j.requestId) === String(changesId)) : null;
            const startBlocked = yield api(`/api/ecosystem/contractor/jobs/${jobChange === null || jobChange === void 0 ? void 0 : jobChange._id}/status`, {
                token: tokens.contractorA,
                method: 'POST',
                body: { status: 'WORK_IN_PROGRESS' },
            });
            expectStatus('Cannot start work after request-changes', startBlocked.status, [403, 409]);
        }
        else {
            record('Owner request changes', 'FAIL', 'request missing');
        }
        const reopenReq = yield api('/api/ecosystem/maintenance', {
            token: tokens.tenantA,
            method: 'POST',
            body: { propertyId: String(a.property._id), title: 'Reopen leak', description: 'Still dripping', category: 'PLUMBING', urgency: 'NORMAL' },
        });
        const reopenId = (_3 = reopenReq.json) === null || _3 === void 0 ? void 0 : _3._id;
        if (reopenId) {
            yield api(`/api/ecosystem/agency/maintenance/${reopenId}/review`, { token: tokens.agentA, method: 'POST', body: {} });
            yield api(`/api/ecosystem/agency/maintenance/${reopenId}/invite`, {
                token: tokens.agentA,
                method: 'POST',
                body: { contractorIds: [String(a.contractors[0].profile._id)] },
            });
            const q4 = yield api(`/api/ecosystem/contractor/maintenance/${reopenId}/quotes`, {
                token: tokens.contractorA,
                method: 'POST',
                body: { description: 'Reopen', lineItems: [{ description: 'Labour', quantity: 1, unitCost: 40 }] },
            });
            yield api(`/api/ecosystem/agency/maintenance/${reopenId}/quotes/${(_4 = q4.json) === null || _4 === void 0 ? void 0 : _4._id}/select`, { token: tokens.agentA, method: 'POST', body: {} });
            yield api(`/api/ecosystem/agency/maintenance/${reopenId}/send-to-owner`, { token: tokens.agentA, method: 'POST', body: {} });
            yield api(`/api/ecosystem/owner/maintenance/${reopenId}/decision`, { token: tokens.ownerA, method: 'POST', body: { decision: 'APPROVE' } });
            yield api(`/api/ecosystem/agency/maintenance/${reopenId}/authorise`, { token: tokens.agentA, method: 'POST', body: {} });
            const jobsReopen = yield api('/api/ecosystem/contractor/jobs', { token: tokens.contractorA });
            const jobReopen = Array.isArray(jobsReopen.json) ? jobsReopen.json.find((j) => String(j.requestId) === String(reopenId)) : null;
            yield api(`/api/ecosystem/contractor/jobs/${jobReopen === null || jobReopen === void 0 ? void 0 : jobReopen._id}/status`, { token: tokens.contractorA, method: 'POST', body: { status: 'ACCEPTED' } });
            yield api(`/api/ecosystem/contractor/jobs/${jobReopen === null || jobReopen === void 0 ? void 0 : jobReopen._id}/status`, { token: tokens.contractorA, method: 'POST', body: { status: 'WORK_IN_PROGRESS' } });
            yield api(`/api/ecosystem/contractor/jobs/${jobReopen === null || jobReopen === void 0 ? void 0 : jobReopen._id}/status`, {
                token: tokens.contractorA,
                method: 'POST',
                body: { status: 'COMPLETED', completion: { notes: 'Attempted fix', actualCompletionDate: new Date().toISOString() } },
            });
            const reopened = yield api(`/api/ecosystem/maintenance/${reopenId}/confirm`, {
                token: tokens.tenantA,
                method: 'POST',
                body: { confirm: false, comment: 'Still leaking' },
            });
            expectStatus('Tenant report-problem reopens from COMPLETED', reopened.status, [200]);
            const reopenedDoc = yield MaintenanceRequest_1.MaintenanceRequest.findById(reopenId).lean();
            record('Reopened status', ((_5 = reopenedDoc === null || reopenedDoc === void 0 ? void 0 : reopenedDoc.ecosystemWorkflow) === null || _5 === void 0 ? void 0 : _5.status) === 'REOPENED' ? 'PASS' : 'FAIL', String((_6 = reopenedDoc === null || reopenedDoc === void 0 ? void 0 : reopenedDoc.ecosystemWorkflow) === null || _6 === void 0 ? void 0 : _6.status));
        }
        else {
            record('Tenant report-problem reopens from COMPLETED', 'FAIL', 'request missing');
        }
        yield Company_1.Company.updateOne({ _id: b.company._id }, {
            $set: {
                'featureFlags.tenantPortalEnabled': false,
                'featureFlags.contractorPortalEnabled': false,
                'featureFlags.propertyMarketplaceEnabled': false,
                'featureFlags.maintenanceQuotesEnabled': false,
                'featureFlags.onlinePaymentsEnabled': false,
            },
        });
        const bDisabled = yield api('/api/ecosystem/me/overview', { token: tokens.tenantB });
        expectStatus('Company B blocked when only company flags are off', bDisabled.status, [403]);
        const aEnabled = yield api('/api/ecosystem/me/overview', { token: tokens.tenantA });
        expectStatus('Company A still enabled via company flags', aEnabled.status, [200]);
        const { notifyEvent } = yield Promise.resolve().then(() => __importStar(require('../ecosystem/services/notificationService')));
        const { CommunicationPreference } = yield Promise.resolve().then(() => __importStar(require('../ecosystem/models/commsAndPayments')));
        yield CommunicationPreference.findOneAndUpdate({ userId: a.tenantUser._id }, { $set: { smsAvailable: true, smsOperational: true, phone: '0711000021', inAppAvailable: true, emailAvailable: true } }, { upsert: true });
        process.env.SMS_ENABLED = 'true';
        process.env.SMS_PROVIDER = 'unconfigured';
        const failKey = `e2e-notify-fail:${a.tenantUser._id}`;
        yield notifyEvent({
            recipientId: String(a.tenantUser._id),
            companyId: String(a.company._id),
            eventType: 'VIEWING_CONFIRMED',
            variables: { propertyName: 'E2E Property A' },
            idempotencyKey: failKey,
        });
        yield notifyEvent({
            recipientId: String(a.tenantUser._id),
            companyId: String(a.company._id),
            eventType: 'VIEWING_CONFIRMED',
            variables: { propertyName: 'E2E Property A' },
            idempotencyKey: failKey,
        });
        const failRows = yield commsAndPayments_1.NotificationDelivery.find({ idempotencyKey: { $regex: `^${failKey}` } }).lean();
        const inAppFail = failRows.filter((d) => d.channel === 'IN_APP' && d.status === 'SENT');
        const smsFail = failRows.filter((d) => d.channel === 'SMS' && d.status === 'FAILED');
        record('Notification failure does not block in-app', inAppFail.length === 1 && smsFail.length >= 1 ? 'PASS' : 'FAIL', `inApp=${inAppFail.length} smsFailed=${smsFail.length}`);
        record('Notification idempotency keeps a single in-app SENT', inAppFail.length === 1 ? 'PASS' : 'FAIL');
        const register = yield api('/api/ecosystem/auth/register', {
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
        yield mongoose_1.default.disconnect();
        const failed = checks.filter((c) => c.result === 'FAIL').length;
        const blocked = checks.filter((c) => c.result === 'BLOCKED').length;
        process.exit(failed || blocked ? 1 : 0);
    });
}
function printSummary() {
    const pass = checks.filter((c) => c.result === 'PASS').length;
    const fail = checks.filter((c) => c.result === 'FAIL').length;
    const blocked = checks.filter((c) => c.result === 'BLOCKED').length;
    console.log(`\nLive E2E: ${pass} PASS / ${fail} FAIL / ${blocked} BLOCKED / ${checks.length} total`);
}
run().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(error);
    record('Harness', 'FAIL', String((error === null || error === void 0 ? void 0 : error.message) || error));
    printSummary();
    try {
        yield mongoose_1.default.disconnect();
    }
    catch (_a) { }
    process.exit(1);
}));
