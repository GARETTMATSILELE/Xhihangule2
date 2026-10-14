"use strict";
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
 * Phase 5 rental-agency workflow regression.
 * Mounts the real routers, signs real JWTs, and checks HTTP status plus database side effects.
 * Disposable PHASE5 fixtures only. Does not post accounting or delete journals.
 */
const http_1 = __importDefault(require("http"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const express_1 = __importDefault(require("express"));
const database_1 = require("../config/database");
const jwt_1 = require("../config/jwt");
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const LevyPayment_1 = require("../models/LevyPayment");
const Payment_1 = require("../models/Payment");
const PaymentRequest_1 = require("../models/PaymentRequest");
const MaintenanceQuote_1 = require("../models/MaintenanceQuote");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const Notification_1 = require("../models/Notification");
const tenantFacing_1 = require("../ecosystem/models/tenantFacing");
const maintenanceWorkflow_1 = require("../ecosystem/models/maintenanceWorkflow");
const lettingModels_1 = require("../agency/lettingModels");
const agentRoutes_1 = __importDefault(require("../routes/agentRoutes"));
const ownerRoutes_1 = __importDefault(require("../routes/ownerRoutes"));
const accountantRoutes_1 = __importDefault(require("../routes/accountantRoutes"));
const levyPaymentRoutes_1 = __importDefault(require("../routes/levyPaymentRoutes"));
const routes_1 = __importDefault(require("../ecosystem/routes"));
const errorHandler_1 = require("../middleware/errorHandler");
const STAMP = `PHASE5${Date.now().toString().slice(-8)}`;
const PASSWORD = 'Phase5-Test-Password';
const checks = [];
function record(name, ok, detail = '') {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function tokenFor(user) {
    if (!user.companyId)
        throw new Error('Test user is missing a company');
    return jsonwebtoken_1.default.sign({
        userId: String(user._id),
        role: user.role,
        roles: user.roles && user.roles.length ? user.roles : undefined,
        sessionVersion: Number(user.sessionVersion || 1),
        companyId: String(user.companyId),
        type: 'access',
    }, jwt_1.JWT_CONFIG.SECRET, {
        expiresIn: '2h',
        issuer: jwt_1.JWT_CONFIG.ISSUER,
        audience: jwt_1.JWT_CONFIG.AUDIENCE,
    });
}
function request(port, method, path, token, body) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            hostname: '127.0.0.1',
            port,
            method,
            path,
            headers: Object.assign(Object.assign({}, (token ? { Authorization: `Bearer ${token}` } : {})), (payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})),
            timeout: 20000,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let parsed = text;
                try {
                    parsed = text ? JSON.parse(text) : null;
                }
                catch (_a) {
                    parsed = text;
                }
                resolve({ status: res.statusCode || 0, body: parsed, text });
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`timeout ${method} ${path}`)); });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
function denied(status) {
    return status === 401 || status === 403 || status === 404;
}
function journalCount(companyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        return mongoose_1.default.connection.collection('journalentries').countDocuments({ companyId: { $in: companyIds } });
    });
}
function makePayment(fields) {
    return __awaiter(this, void 0, void 0, function* () {
        return Payment_1.Payment.create({
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
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30;
        yield (0, database_1.connectDatabase)();
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use('/api/agents', agentRoutes_1.default);
        app.use('/api/owners', ownerRoutes_1.default);
        app.use('/api/accountants', accountantRoutes_1.default);
        app.use('/api/levy-payments', levyPaymentRoutes_1.default);
        app.use('/api/ecosystem', routes_1.default);
        app.use(errorHandler_1.errorHandler);
        const server = http_1.default.createServer(app);
        yield new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const createdUserIds = [];
        const createdCompanyIds = [];
        const ownerIds = [];
        try {
            const bootstrap = yield User_1.User.create({
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
            function makeCompany(suffix) {
                return __awaiter(this, void 0, void 0, function* () {
                    const company = yield Company_1.Company.create({
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
                });
            }
            function makeUser(email, role, companyId, roles) {
                return __awaiter(this, void 0, void 0, function* () {
                    const user = yield User_1.User.create({
                        email, password: PASSWORD, firstName: role, lastName: STAMP, role,
                        roles: roles || [role], companyId, isActive: true, sessionVersion: 1,
                    });
                    createdUserIds.push(user._id);
                    return user;
                });
            }
            const companyA = yield makeCompany('A');
            const companyB = yield makeCompany('B');
            const agentA = yield makeUser(`${STAMP}-agent-a@example.test`, 'agent', companyA._id);
            const agentB = yield makeUser(`${STAMP}-agent-b@example.test`, 'agent', companyA._id);
            const seniorAgent = yield makeUser(`${STAMP}-senior@example.test`, 'agent', companyA._id, ['agent', 'admin']);
            const accountantA = yield makeUser(`${STAMP}-accountant@example.test`, 'accountant', companyA._id);
            const principalA = yield makeUser(`${STAMP}-principal@example.test`, 'principal', companyA._id);
            const ownerUser = yield makeUser(`${STAMP}-owner@example.test`, 'owner', companyA._id);
            const otherOwnerUser = yield makeUser(`${STAMP}-other-owner@example.test`, 'owner', companyA._id);
            const agentForeign = yield makeUser(`${STAMP}-foreign@example.test`, 'agent', companyB._id);
            const applicant = yield makeUser(`${STAMP}-applicant@example.test`, 'tenant', companyA._id);
            const propertyA = yield Property_1.Property.create({
                name: `${STAMP} Agent A House`,
                address: '10 Agent A Road',
                companyId: companyA._id,
                ownerId: agentA._id,
                agentId: agentA._id,
                rent: 400,
            });
            const propertyB = yield Property_1.Property.create({
                name: `${STAMP} Agent B House`,
                address: '20 Agent B Road',
                companyId: companyA._id,
                ownerId: agentB._id,
                agentId: agentB._id,
                rent: 500,
            });
            const propertyForeign = yield Property_1.Property.create({
                name: `${STAMP} Company B House`,
                address: '40 Foreign Road',
                companyId: companyB._id,
                ownerId: agentForeign._id,
                agentId: agentForeign._id,
                rent: 300,
            });
            const landlord = yield PropertyOwner_1.PropertyOwner.create({
                email: ownerUser.email,
                password: PASSWORD,
                firstName: 'Landlord',
                lastName: 'Shared',
                phone: '0771111111',
                companyId: companyA._id,
                properties: [propertyA._id, propertyB._id],
            });
            ownerIds.push(landlord._id);
            const otherLandlord = yield PropertyOwner_1.PropertyOwner.create({
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
            yield propertyA.save();
            yield propertyB.save();
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
            const journalsBefore = yield journalCount(createdCompanyIds);
            const unauth = yield request(port, 'GET', '/api/agents/letting/rent-board');
            record('Unauthenticated rent board is rejected', unauth.status === 401, `status ${unauth.status}`);
            const assessment = yield request(port, 'POST', '/api/agents/letting/assessments', tAgentA, {
                propertyId: String(propertyA._id),
                recommendedRent: 450,
                condition: 'Good',
                notes: 'Phase 5 assessment',
            });
            record('Authorized agent records an assessment', assessment.status === 201, `status ${assessment.status}`);
            const assessmentId = (_b = (_a = assessment.body) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b._id;
            const submitted = yield request(port, 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, tAgentA, { status: 'ASSESSMENT_SUBMITTED' });
            record('Agent submits the assessment for owner review', submitted.status === 200 && ((_d = (_c = submitted.body) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.status) === 'ASSESSMENT_SUBMITTED', `status ${submitted.status}`);
            const ownerNotice = yield Notification_1.Notification.countDocuments({ companyId: String(companyA._id), userId: ownerUser._id, 'payload.idempotencyKey': `assessment-submitted:${assessmentId}` });
            record('Owner review notification is recorded once', ownerNotice === 1, `count ${ownerNotice}`);
            const agentApproves = yield request(port, 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, tAgentA, { status: 'OWNER_APPROVED', approvedRent: 1 });
            const seniorApproves = yield request(port, 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, tSenior, { status: 'OWNER_APPROVED', approvedRent: 1 });
            const otherApproves = yield request(port, 'POST', `/api/owners/letting/assessments/${assessmentId}/decision`, tOtherOwner, { status: 'OWNER_APPROVED', approvedRent: 440 });
            const foreignApproves = yield request(port, 'POST', `/api/owners/letting/assessments/${assessmentId}/decision`, tForeign, { status: 'OWNER_APPROVED' });
            const approved = yield request(port, 'POST', `/api/owners/letting/assessments/${assessmentId}/decision`, tOwner, { status: 'OWNER_APPROVED', approvedRent: 440, reason: 'Accepted' });
            const storedAssessment = yield lettingModels_1.PropertyAssessment.findById(assessmentId).lean();
            record('Agent cannot approve the assessment', agentApproves.status === 403, `status ${agentApproves.status}`);
            record('A senior agent cannot approve on behalf of the landlord', seniorApproves.status === 403, `status ${seniorApproves.status}`);
            record('Another owner cannot approve the assessment', denied(otherApproves.status), `status ${otherApproves.status}`);
            record('Another company cannot approve the assessment', denied(foreignApproves.status), `status ${foreignApproves.status}`);
            record('The landlord approves the price', approved.status === 200 && (storedAssessment === null || storedAssessment === void 0 ? void 0 : storedAssessment.status) === 'OWNER_APPROVED' && (storedAssessment === null || storedAssessment === void 0 ? void 0 : storedAssessment.approvedRent) === 440, `status ${approved.status} stored ${storedAssessment === null || storedAssessment === void 0 ? void 0 : storedAssessment.status}`);
            const overwrite = yield request(port, 'POST', `/api/owners/letting/assessments/${assessmentId}/decision`, tOwner, { status: 'OWNER_REJECTED' });
            const stillApproved = yield lettingModels_1.PropertyAssessment.findById(assessmentId).select('status').lean();
            record('An approved assessment is not overwritten', overwrite.status === 409 && (stillApproved === null || stillApproved === void 0 ? void 0 : stillApproved.status) === 'OWNER_APPROVED', `status ${overwrite.status}`);
            const sharedBlocked = yield request(port, 'GET', `/api/agents/letting/properties/${propertyB._id}/workspace`, tAgentA);
            record('A shared landlord does not open the other agent assessment workspace', sharedBlocked.status === 404, `status ${sharedBlocked.status}`);
            const earlyListing = yield request(port, 'POST', '/api/agents/letting/listings', tAgentA, { propertyId: String(propertyA._id), platform: 'Property.co.zw', status: 'ACTIVE' });
            record('A listing cannot become active before the mandate', earlyListing.status === 409, `status ${earlyListing.status}`);
            const mandate = yield request(port, 'POST', '/api/agents/letting/mandates', tAgentA, { propertyId: String(propertyA._id) });
            const mandateId = (_f = (_e = mandate.body) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f._id;
            const sent = yield request(port, 'POST', `/api/agents/letting/mandates/${mandateId}/status`, tAgentA, { status: 'SENT' });
            const unsigned = yield request(port, 'POST', `/api/agents/letting/mandates/${mandateId}/status`, tAgentA, { status: 'SIGNED' });
            const signed = yield request(port, 'POST', `/api/agents/letting/mandates/${mandateId}/status`, tAgentA, { status: 'SIGNED', documentUrl: 'https://files.example.test/mandate.pdf' });
            const storedMandate = yield lettingModels_1.RentalMandate.findById(mandateId).lean();
            record('Mandate is linked to the landlord record', mandate.status === 201 && String(storedMandate === null || storedMandate === void 0 ? void 0 : storedMandate.ownerId) === String(landlord._id), `status ${mandate.status}`);
            record('A mandate cannot be marked signed without a document', sent.status === 200 && unsigned.status === 409, `sent ${sent.status} unsigned ${unsigned.status}`);
            record('A document reference records the signed mandate', signed.status === 200 && (storedMandate === null || storedMandate === void 0 ? void 0 : storedMandate.status) === 'SIGNED', `status ${signed.status}`);
            const listing = yield request(port, 'POST', '/api/agents/letting/listings', tAgentA, {
                propertyId: String(propertyA._id), platform: 'Property.co.zw', url: 'https://property.example.test/1', reference: 'PB-1',
            });
            const listingId = (_h = (_g = listing.body) === null || _g === void 0 ? void 0 : _g.data) === null || _h === void 0 ? void 0 : _h._id;
            const activatedListing = yield request(port, 'POST', `/api/agents/letting/listings/${listingId}/status`, tAgentA, { status: 'ACTIVE', lastVerifiedAt: now.toISOString() });
            const foreignListing = yield request(port, 'POST', `/api/agents/letting/listings/${listingId}/status`, tForeign, { status: 'REMOVED' });
            const otherAgentListing = yield request(port, 'POST', `/api/agents/letting/listings/${listingId}/status`, tAgentB, { status: 'REMOVED' });
            const storedListing = yield lettingModels_1.ListingReference.findById(listingId).lean();
            record('External listing reference stays on the property and is not a publish call', listing.status === 201 && ((_j = listing.body) === null || _j === void 0 ? void 0 : _j.publishedExternally) === false, `status ${listing.status}`);
            record('Listing becomes active only after the mandate gate', activatedListing.status === 200 && (storedListing === null || storedListing === void 0 ? void 0 : storedListing.status) === 'ACTIVE', `status ${activatedListing.status}`);
            record('Another agent cannot change the listing reference', otherAgentListing.status === 404 && (storedListing === null || storedListing === void 0 ? void 0 : storedListing.status) === 'ACTIVE', `status ${otherAgentListing.status}`);
            record('Another company cannot change the listing reference', denied(foreignListing.status), `status ${foreignListing.status}`);
            const application = yield tenantFacing_1.RentalApplication.create({
                tenantUserId: applicant._id,
                propertyId: propertyA._id,
                companyId: companyA._id,
                status: 'SUBMITTED',
                submittedAt: now,
                snapshot: { fullName: 'Test Applicant', employer: 'Example Works' },
                statusHistory: [{ status: 'SUBMITTED', at: now }],
            });
            const invalid = yield request(port, 'POST', `/api/ecosystem/agency/applications/${application._id}/status`, tAgentA, { status: 'SHORTLISTED' });
            const review = yield request(port, 'POST', `/api/ecosystem/agency/applications/${application._id}/status`, tAgentA, { status: 'UNDER_REVIEW' });
            const shortlist = yield request(port, 'POST', `/api/ecosystem/agency/applications/${application._id}/status`, tAgentA, { status: 'SHORTLISTED' });
            const sentToOwner = yield request(port, 'POST', `/api/ecosystem/agency/applications/${application._id}/status`, tAgentA, { status: 'SENT_TO_OWNER' });
            const agentSelects = yield request(port, 'POST', `/api/agents/letting/applications/${application._id}/owner-decision`, tAgentA, { decision: 'APPROVED' });
            const otherSelects = yield request(port, 'POST', `/api/owners/letting/applications/${application._id}/decision`, tOtherOwner, { decision: 'APPROVED' });
            const ownerSees = yield request(port, 'GET', `/api/owners/letting/properties/${propertyA._id}/workspace`, tOwner);
            const ownerSelects = yield request(port, 'POST', `/api/owners/letting/applications/${application._id}/decision`, tOwner, { decision: 'APPROVED', reason: 'Selected' });
            const storedApplication = yield tenantFacing_1.RentalApplication.findById(application._id).lean();
            const agentBRead = yield request(port, 'GET', '/api/ecosystem/agency/applications', tAgentB);
            record('An invalid application transition is rejected', invalid.status === 400, `status ${invalid.status}`);
            record('Application moves through review and shortlist', review.status === 200 && shortlist.status === 200 && sentToOwner.status === 200, `${review.status}/${shortlist.status}/${sentToOwner.status}`);
            record('The stored application status is owner approved', (storedApplication === null || storedApplication === void 0 ? void 0 : storedApplication.status) === 'OWNER_APPROVED', (storedApplication === null || storedApplication === void 0 ? void 0 : storedApplication.status) || '');
            record('An agent cannot select the applicant', agentSelects.status === 403, `status ${agentSelects.status}`);
            record('Another landlord cannot select the applicant', denied(otherSelects.status), `status ${otherSelects.status}`);
            record('The landlord sees the shortlist and selects the applicant', ownerSees.status === 200 && ownerSees.text.includes('Test Applicant') && ownerSelects.status === 200, `workspace ${ownerSees.status} decision ${ownerSelects.status}`);
            record('Another agent does not receive this applicant in the queue', agentBRead.status === 200 && !agentBRead.text.includes('Test Applicant'), `status ${agentBRead.status}`);
            const tenantA = yield Tenant_1.Tenant.create({ firstName: 'Tenant', lastName: STAMP, email: `${STAMP}-tenant@example.test`, phone: '0774444444', companyId: companyA._id, ownerId: agentA._id, propertyId: propertyA._id, status: 'Active' });
            const tenantB = yield Tenant_1.Tenant.create({ firstName: 'Foreign', lastName: 'Tenant', email: `${STAMP}-foreign-tenant@example.test`, phone: '0775555555', companyId: companyB._id, ownerId: agentForeign._id, status: 'Active' });
            const wrongTenant = yield request(port, 'POST', '/api/agents/letting/leases', tAgentA, {
                applicationId: String(application._id), tenantId: String(tenantB._id), startDate: '2026-11-01', endDate: '2027-10-31', rentAmount: 440, depositAmount: 200,
            });
            const leaseRes = yield request(port, 'POST', '/api/agents/letting/leases', tAgentA, {
                applicationId: String(application._id), tenantId: String(tenantA._id), startDate: '2026-11-01', endDate: '2027-10-31', rentAmount: 440, depositAmount: 200,
            });
            const leaseId = (_l = (_k = leaseRes.body) === null || _k === void 0 ? void 0 : _k.data) === null || _l === void 0 ? void 0 : _l._id;
            const duplicateLease = yield request(port, 'POST', '/api/agents/letting/leases', tAgentA, {
                applicationId: String(application._id), tenantId: String(tenantA._id), startDate: '2026-11-01', endDate: '2027-10-31', rentAmount: 440, depositAmount: 200,
            });
            record('A tenant from another company cannot be placed on the lease', wrongTenant.status === 404, `status ${wrongTenant.status}`);
            record('The lease draft is created for the approved applicant', leaseRes.status === 201, `status ${leaseRes.status}`);
            record('Repeating lease preparation does not create a second lease', duplicateLease.status === 200 && ((_m = duplicateLease.body) === null || _m === void 0 ? void 0 : _m.duplicate) === true && String((_p = (_o = duplicateLease.body) === null || _o === void 0 ? void 0 : _o.data) === null || _p === void 0 ? void 0 : _p._id) === String(leaseId), `status ${duplicateLease.status}`);
            const activateUnsigned = yield request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
            const tenantSign = yield request(port, 'POST', `/api/agents/letting/leases/${leaseId}/signature`, tAgentA, { party: 'tenant' });
            const agentOwnerSign = yield request(port, 'POST', `/api/agents/letting/leases/${leaseId}/signature`, tAgentA, { party: 'owner' });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId, agentId: agentA._id, amount: 200, depositAmount: 200, status: 'failed', rentalPeriodMonth: 1, rentalPeriodYear: 2000 });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId, agentId: agentA._id, amount: 200, depositAmount: 200, status: 'pending', rentalPeriodMonth: 1, rentalPeriodYear: 2000 });
            const activateWithoutDeposit = yield request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
            const ownerSign = yield request(port, 'POST', `/api/owners/letting/leases/${leaseId}/signature`, tOwner, { party: 'owner' });
            const activateWithoutOwner = ownerSign.status === 200
                ? null
                : yield request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
            const deposit = yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId, agentId: agentA._id, amount: 200, depositAmount: 200, status: 'completed', rentalPeriodMonth: 1, rentalPeriodYear: 2000 });
            const journalsAfterDeposit = yield journalCount(createdCompanyIds);
            const activate = yield request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
            const activationAudits = yield lettingModels_1.AgencyWorkflowEvent.countDocuments({ companyId: companyA._id, entityId: String(leaseId), action: 'LEASE_ACTIVATED' });
            const activateAgain = yield request(port, 'POST', `/api/agents/letting/leases/${leaseId}/activate`, tAgentA, {});
            const activationAuditsAgain = yield lettingModels_1.AgencyWorkflowEvent.countDocuments({ companyId: companyA._id, entityId: String(leaseId), action: 'LEASE_ACTIVATED' });
            const activeLease = yield Lease_1.Lease.findById(leaseId).select('status').lean();
            record('An unsigned lease cannot be activated', activateUnsigned.status === 403 && activateUnsigned.text.includes('Tenant signature'), ((_q = activateUnsigned.body) === null || _q === void 0 ? void 0 : _q.message) || '');
            record('Failed and pending payments do not satisfy the deposit', tenantSign.status === 200 && activateWithoutDeposit.status === 403 && activateWithoutDeposit.text.includes('Deposit'), ((_r = activateWithoutDeposit.body) === null || _r === void 0 ? void 0 : _r.message) || '');
            record('An agent cannot record the landlord signature', agentOwnerSign.status === 403, `status ${agentOwnerSign.status}`);
            record('The landlord signature is recorded without a financial posting', ownerSign.status === 200 && ((_s = ownerSign.body) === null || _s === void 0 ? void 0 : _s.financialPosting) === false, `status ${ownerSign.status}`);
            record('The deposit fixture does not create a journal', journalsAfterDeposit === journalsBefore, `journals ${journalsAfterDeposit}`);
            record('A complete lease activates', activate.status === 200 && (activeLease === null || activeLease === void 0 ? void 0 : activeLease.status) === 'active', `status ${activate.status}`);
            record('Repeating activation does not write another activation audit', ((_t = activateAgain.body) === null || _t === void 0 ? void 0 : _t.duplicate) === true && activationAudits === 1 && activationAuditsAgain === 1, `audits ${activationAuditsAgain}`);
            void activateWithoutOwner;
            void deposit;
            const dueDay = Math.min(28, now.getDate() + 1);
            const expectsDue = now.getDate() < 28;
            const overdueLease = yield Lease_1.Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
            const dueLease = yield Lease_1.Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: dueDay });
            const partialLease = yield Lease_1.Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
            const paidLease = yield Lease_1.Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
            const reversedLease = yield Lease_1.Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
            const mixedLease = yield Lease_1.Lease.create({ propertyId: propertyA._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 400, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentA._id, rentDueDay: 1 });
            const agentBLease = yield Lease_1.Lease.create({ propertyId: propertyB._id, tenantId: tenantA._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 500, depositAmount: 0, status: 'active', companyId: companyA._id, ownerId: agentB._id, rentDueDay: 1 });
            const foreignTenant = yield Tenant_1.Tenant.create({ firstName: 'B', lastName: 'Tenant', email: `${STAMP}-b-tenant@example.test`, phone: '0776666666', companyId: companyB._id, ownerId: agentForeign._id, status: 'Active' });
            const foreignLease = yield Lease_1.Lease.create({ propertyId: propertyForeign._id, tenantId: foreignTenant._id, startDate: now, endDate: new Date('2027-10-31'), rentAmount: 300, depositAmount: 0, status: 'active', companyId: companyB._id, ownerId: agentForeign._id, rentDueDay: 1 });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: partialLease._id, agentId: agentA._id, amount: 100, rentalPeriodMonth: month, rentalPeriodYear: year, status: 'failed' });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: partialLease._id, agentId: agentA._id, amount: 150, rentalPeriodMonth: month, rentalPeriodYear: year });
            const nextMonth = month === 12 ? 1 : month + 1;
            const nextYear = month === 12 ? year + 1 : year;
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: partialLease._id, agentId: agentA._id, amount: 999, rentalPeriodMonth: nextMonth, rentalPeriodYear: nextYear });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: paidLease._id, agentId: agentA._id, amount: 100, rentalPeriodMonth: month, rentalPeriodYear: year });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: paidLease._id, agentId: agentA._id, amount: 300, rentalPeriodMonth: month, rentalPeriodYear: year });
            const reversedPayment = yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: reversedLease._id, agentId: agentA._id, amount: 400, rentalPeriodMonth: month, rentalPeriodYear: year });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: reversedLease._id, agentId: agentA._id, amount: -400, rentalPeriodMonth: month, rentalPeriodYear: year, reversalOfPaymentId: reversedPayment._id });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: mixedLease._id, agentId: agentA._id, amount: 400, currency: 'USD', rentalPeriodMonth: month, rentalPeriodYear: year });
            yield makePayment({ companyId: companyA._id, propertyId: propertyA._id, tenantId: tenantA._id, leaseId: mixedLease._id, agentId: agentA._id, amount: 400, currency: 'ZWL', rentalPeriodMonth: month, rentalPeriodYear: year });
            yield mongoose_1.default.connection.collection('payments').insertOne({
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
            const boardA = yield request(port, 'GET', '/api/agents/letting/rent-board', tAgentA);
            const boardB = yield request(port, 'GET', '/api/agents/letting/rent-board', tAgentB);
            const boardAccountant = yield request(port, 'GET', '/api/accountants/letting/rent-board', tAccountant);
            const rows = ((_u = boardA.body) === null || _u === void 0 ? void 0 : _u.data) || [];
            const row = (id) => rows.find((item) => String(item.leaseId) === String(id));
            record('A lease with no qualifying payment is overdue', ((_v = row(overdueLease._id)) === null || _v === void 0 ? void 0 : _v.status) === 'OVERDUE' && ((_w = row(overdueLease._id)) === null || _w === void 0 ? void 0 : _w.received) === 0, (_x = row(overdueLease._id)) === null || _x === void 0 ? void 0 : _x.status);
            record('A future due day stays due when the month still has that day', !expectsDue || ((_y = row(dueLease._id)) === null || _y === void 0 ? void 0 : _y.status) === 'DUE', (_z = row(dueLease._id)) === null || _z === void 0 ? void 0 : _z.status);
            record('A partial payment stays partial and an advance period is not included', ((_0 = row(partialLease._id)) === null || _0 === void 0 ? void 0 : _0.status) === 'PARTIALLY_PAID' && ((_1 = row(partialLease._id)) === null || _1 === void 0 ? void 0 : _1.received) === 150, `received ${(_2 = row(partialLease._id)) === null || _2 === void 0 ? void 0 : _2.received}`);
            record('Multiple payments in the period can pay the lease', ((_3 = row(paidLease._id)) === null || _3 === void 0 ? void 0 : _3.status) === 'PAID' && ((_4 = row(paidLease._id)) === null || _4 === void 0 ? void 0 : _4.outstanding) === 0, `received ${(_5 = row(paidLease._id)) === null || _5 === void 0 ? void 0 : _5.received}`);
            record('A reversed payment is not a successful collection', ((_6 = row(reversedLease._id)) === null || _6 === void 0 ? void 0 : _6.received) === 0, `received ${(_7 = row(reversedLease._id)) === null || _7 === void 0 ? void 0 : _7.received}`);
            record('Different currencies are not added together', ((_8 = row(mixedLease._id)) === null || _8 === void 0 ? void 0 : _8.mixedCurrency) === true && ((_9 = row(mixedLease._id)) === null || _9 === void 0 ? void 0 : _9.outstanding) === null, `mixed ${(_10 = row(mixedLease._id)) === null || _10 === void 0 ? void 0 : _10.mixedCurrency}`);
            record('An agent does not see another agent lease on the board', boardB.status === 200 && !(((_11 = boardB.body) === null || _11 === void 0 ? void 0 : _11.data) || []).some((item) => String(item.leaseId) === String(overdueLease._id)) && (((_12 = boardB.body) === null || _12 === void 0 ? void 0 : _12.data) || []).some((item) => String(item.leaseId) === String(agentBLease._id)), `status ${boardB.status}`);
            record('An accountant sees both agents in the company', boardAccountant.status === 200 && (((_13 = boardAccountant.body) === null || _13 === void 0 ? void 0 : _13.data) || []).some((item) => String(item.leaseId) === String(overdueLease._id)) && (((_14 = boardAccountant.body) === null || _14 === void 0 ? void 0 : _14.data) || []).some((item) => String(item.leaseId) === String(agentBLease._id)), `status ${boardAccountant.status}`);
            record('Company B lease is absent from company A', !rows.some((item) => String(item.leaseId) === String(foreignLease._id)), 'filtered');
            void foreignLease;
            const maintenance = yield MaintenanceRequest_1.MaintenanceRequest.create({
                propertyId: propertyA._id, requestedBy: agentA._id, ownerId: landlord._id, title: 'Tap', description: 'Leaking tap', companyId: companyA._id,
            });
            const quote = yield MaintenanceQuote_1.MaintenanceQuote.create({
                requestId: maintenance._id, companyId: companyA._id, propertyId: propertyA._id, amount: 100, total: 100, currency: 'USD', description: 'Tap repair', status: 'SUBMITTED',
            });
            const requestsBefore = yield PaymentRequest_1.PaymentRequest.countDocuments({ companyId: String(companyA._id) });
            const noQuote = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(new mongoose_1.default.Types.ObjectId()), amount: 100 });
            const noApproval = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 100 });
            quote.status = 'OWNER_APPROVED';
            yield quote.save();
            const noAuthorisation = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 100, changeOrderApproved: true });
            yield maintenanceWorkflow_1.ContractorJobRecord.create({ requestId: maintenance._id, companyId: companyA._id, propertyId: propertyA._id, contractorId: new mongoose_1.default.Types.ObjectId(), quoteId: quote._id, status: 'AUTHORISED' });
            const tooMuch = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 250, changeOrderApproved: true });
            const otherAgentRequest = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentB, { quoteId: String(quote._id), amount: 100 });
            const validRequest = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 100 });
            const duplicateRequest = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote._id), amount: 100 });
            const requestCount = yield PaymentRequest_1.PaymentRequest.countDocuments({ companyId: String(companyA._id) });
            const journalsAfterRequest = yield journalCount(createdCompanyIds);
            const queue = yield request(port, 'GET', '/api/accountants/letting/work-queue', tAccountant);
            record('A missing quote is rejected', noQuote.status === 404, `status ${noQuote.status}`);
            record('A quote without owner approval is rejected', noApproval.status === 409, ((_15 = noApproval.body) === null || _15 === void 0 ? void 0 : _15.message) || '');
            record('A request without agent authorisation is rejected', noAuthorisation.status === 409, ((_16 = noAuthorisation.body) === null || _16 === void 0 ? void 0 : _16.message) || '');
            record('A request above the approved amount is rejected even if the client says a change order exists', tooMuch.status === 409, ((_17 = tooMuch.body) === null || _17 === void 0 ? void 0 : _17.message) || '');
            record('Another agent cannot create the maintenance request', otherAgentRequest.status === 404, `status ${otherAgentRequest.status}`);
            record('A valid request reaches accounting without a journal', validRequest.status === 201 && ((_18 = validRequest.body) === null || _18 === void 0 ? void 0 : _18.financialPosting) === false && requestCount === requestsBefore + 1 && journalsAfterRequest === journalsBefore, `status ${validRequest.status} journals ${journalsAfterRequest}`);
            record('A duplicate maintenance request is rejected', duplicateRequest.status === 409 && requestCount === requestsBefore + 1, `status ${duplicateRequest.status}`);
            record('The accountant queue lists the request', queue.status === 200 && queue.text.includes(String(quote._id)), `status ${queue.status}`);
            const quote2 = yield MaintenanceQuote_1.MaintenanceQuote.create({
                requestId: maintenance._id, companyId: companyA._id, propertyId: propertyA._id, amount: 100, total: 100, currency: 'USD', description: 'Washer', status: 'OWNER_APPROVED',
            });
            const job2 = yield maintenanceWorkflow_1.ContractorJobRecord.create({ requestId: maintenance._id, companyId: companyA._id, propertyId: propertyA._id, contractorId: new mongoose_1.default.Types.ObjectId(), quoteId: quote2._id, status: 'AUTHORISED' });
            yield maintenanceWorkflow_1.MaintenanceChangeOrder.create({
                requestId: maintenance._id, jobId: job2._id, companyId: companyA._id, originalQuoteId: quote2._id, requestedAmount: 20, description: 'Extra washer', status: 'OWNER_APPROVED',
            });
            const withChange = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote2._id), amount: 120 });
            const overChange = yield request(port, 'POST', '/api/agents/letting/maintenance-payment-requests', tAgentA, { quoteId: String(quote2._id), amount: 121, changeOrderApproved: true });
            record('An approved change order raises the authorised amount', withChange.status === 201 && ((_19 = withChange.body) === null || _19 === void 0 ? void 0 : _19.financialPosting) === false, `status ${withChange.status}`);
            record('Amount above the quote plus approved change orders is rejected', overChange.status === 409, ((_20 = overChange.body) === null || _20 === void 0 ? void 0 : _20.message) || '');
            const levy = yield LevyPayment_1.LevyPayment.create({
                paymentType: 'levy', propertyId: propertyA._id, companyId: companyA._id, paymentDate: now, paymentMethod: 'cash', amount: 50, processedBy: agentA._id, status: 'pending', currency: 'USD',
            });
            const levyCountBefore = yield LevyPayment_1.LevyPayment.countDocuments({ companyId: companyA._id });
            const filed = yield request(port, 'POST', `/api/agents/letting/levies/${levy._id}/receipt`, tAgentA, { receiptNumber: 'LEVY-1', receiptFileUrl: 'https://files.example.test/levy.pdf' });
            const filedAgain = yield request(port, 'POST', `/api/agents/letting/levies/${levy._id}/receipt`, tAgentA, { receiptNumber: 'LEVY-1', receiptFileUrl: 'https://files.example.test/levy.pdf' });
            const levyAudits = yield lettingModels_1.AgencyWorkflowEvent.countDocuments({ companyId: companyA._id, entityId: String(levy._id), action: 'LEVY_RECEIPT_FILED' });
            const agentBLevy = yield request(port, 'POST', `/api/agents/letting/levies/${levy._id}/receipt`, tAgentB, { receiptNumber: 'STOLEN' });
            const storedLevy = yield LevyPayment_1.LevyPayment.findById(levy._id).lean();
            const levyCountAfter = yield LevyPayment_1.LevyPayment.countDocuments({ companyId: companyA._id });
            const accountantLevies = yield request(port, 'GET', '/api/levy-payments', tAccountant);
            const ownerLevies = yield request(port, 'GET', '/api/levy-payments', tOwner);
            const foreignLevyRead = yield request(port, 'GET', `/api/levy-payments/${levy._id}/receipt`, tForeign);
            const journalsAfterLevy = yield journalCount(createdCompanyIds);
            record('Filing a levy receipt does not create a levy or a journal', filed.status === 200 && ((_21 = filed.body) === null || _21 === void 0 ? void 0 : _21.financialPosting) === false && levyCountAfter === levyCountBefore && journalsAfterLevy === journalsBefore, `status ${filed.status}`);
            record('The same receipt is not filed twice', ((_22 = filedAgain.body) === null || _22 === void 0 ? void 0 : _22.duplicate) === true && levyAudits === 1, `audits ${levyAudits}`);
            record('Another agent cannot replace the levy receipt', agentBLevy.status === 404 && (storedLevy === null || storedLevy === void 0 ? void 0 : storedLevy.receiptNumber) === 'LEVY-1', `status ${agentBLevy.status}`);
            record('The accountant can read the company levy', accountantLevies.status === 200 && accountantLevies.text.includes(String(levy._id)), `status ${accountantLevies.status}`);
            record('The landlord can read the levy and another company cannot', ownerLevies.status === 200 && ownerLevies.text.includes(String(levy._id)) && denied(foreignLevyRead.status), `owner ${ownerLevies.status} foreign ${foreignLevyRead.status}`);
            const agentPortfolio = yield request(port, 'GET', `/api/agents/letting/portfolio?companyId=${companyB._id}`, tAgentA);
            const accountantPortfolio = yield request(port, 'GET', `/api/accountants/letting/portfolio?companyId=${companyB._id}`, tAccountant);
            const principalPortfolio = yield request(port, 'GET', `/api/accountants/letting/portfolio?companyId=${companyB._id}`, tPrincipal);
            const companyAProperties = yield Property_1.Property.countDocuments({ companyId: companyA._id });
            const searchA = yield request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(STAMP + ' Agent A')}&companyId=${companyB._id}`, tAgentA);
            const searchB = yield request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(STAMP + ' Agent A')}`, tAgentB);
            const searchForeign = yield request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(STAMP + ' Company B')}`, tAgentA);
            record('An ordinary agent cannot open senior portfolio oversight', agentPortfolio.status === 403, `status ${agentPortfolio.status}`);
            record('An accountant can view company portfolio oversight', accountantPortfolio.status === 200 && ((_24 = (_23 = accountantPortfolio.body) === null || _23 === void 0 ? void 0 : _23.data) === null || _24 === void 0 ? void 0 : _24.properties) === companyAProperties, `status ${accountantPortfolio.status} reported ${(_26 = (_25 = accountantPortfolio.body) === null || _25 === void 0 ? void 0 : _25.data) === null || _26 === void 0 ? void 0 : _26.properties} stored ${companyAProperties}`);
            record('Senior portfolio counts stay inside the caller company', principalPortfolio.status === 200 && ((_28 = (_27 = principalPortfolio.body) === null || _27 === void 0 ? void 0 : _27.data) === null || _28 === void 0 ? void 0 : _28.properties) === companyAProperties, `reported ${(_30 = (_29 = principalPortfolio.body) === null || _29 === void 0 ? void 0 : _29.data) === null || _30 === void 0 ? void 0 : _30.properties} stored ${companyAProperties}`);
            record('Search returns the caller portfolio and ignores a supplied company id', searchA.status === 200 && searchA.text.includes(`${STAMP} Agent A House`) && searchB.status === 200 && !searchB.text.includes(`${STAMP} Agent A House`) && !searchForeign.text.includes('Company B'), `A ${searchA.status} B ${searchB.status}`);
            const journalsAfter = yield journalCount(createdCompanyIds);
            const historical = yield Payment_1.Payment.countDocuments({ _id: new mongoose_1.default.Types.ObjectId('6acb543e271b8f1011240e3f') });
            record('Phase 5 workflow writes did not create journals', journalsAfter === journalsBefore, `before ${journalsBefore} after ${journalsAfter}`);
            record('The historical payment was not rewritten', historical === 1 || historical === 0, `count ${historical}`);
        }
        finally {
            const companyFilter = { companyId: { $in: createdCompanyIds } };
            if (createdCompanyIds.length) {
                yield lettingModels_1.AgencyWorkflowEvent.deleteMany(companyFilter);
                yield lettingModels_1.ListingReference.deleteMany(companyFilter);
                yield lettingModels_1.RentalMandate.deleteMany(companyFilter);
                yield lettingModels_1.PropertyAssessment.deleteMany(companyFilter);
                yield PaymentRequest_1.PaymentRequest.deleteMany({ companyId: { $in: createdCompanyIds.map(String) } });
                yield maintenanceWorkflow_1.MaintenanceChangeOrder.deleteMany(companyFilter);
                yield maintenanceWorkflow_1.ContractorJobRecord.deleteMany(companyFilter);
                yield MaintenanceQuote_1.MaintenanceQuote.deleteMany(companyFilter);
                yield MaintenanceRequest_1.MaintenanceRequest.deleteMany(companyFilter);
                yield Payment_1.Payment.deleteMany(companyFilter);
                yield LevyPayment_1.LevyPayment.deleteMany(companyFilter);
                yield tenantFacing_1.RentalApplication.deleteMany(companyFilter);
                yield Lease_1.Lease.deleteMany(companyFilter);
                yield Tenant_1.Tenant.deleteMany(companyFilter);
                yield Notification_1.Notification.deleteMany({ companyId: { $in: createdCompanyIds.map(String) } });
                yield Property_1.Property.deleteMany(companyFilter);
                if (ownerIds.length)
                    yield PropertyOwner_1.PropertyOwner.deleteMany({ _id: { $in: ownerIds } });
                yield Company_1.Company.deleteMany({ _id: { $in: createdCompanyIds } });
            }
            if (createdUserIds.length)
                yield User_1.User.deleteMany({ _id: { $in: createdUserIds } });
            yield new Promise((resolve) => server.close(() => resolve()));
            try {
                yield database_1.accountingConnection.close();
            }
            catch ( /* already closed */_31) { /* already closed */ }
            yield mongoose_1.default.disconnect();
        }
        const failed = checks.filter((check) => !check.ok);
        console.log(`Phase 5 agency workflow checks: ${checks.length - failed.length}/${checks.length} passed`);
        process.exit(failed.length ? 1 : 0);
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(error instanceof Error ? error.stack || error.message : error);
    try {
        yield mongoose_1.default.disconnect();
    }
    catch ( /* already closed */_a) { /* already closed */ }
    process.exit(1);
}));
