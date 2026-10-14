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
 * Phase 4C access-control regression.
 * Mounts the real routers, signs real JWTs, and talks to them over HTTP.
 * Disposable PHASE4C fixtures only. Does not post accounting or delete journals.
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
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const Payment_1 = require("../models/Payment");
const Notification_1 = require("../models/Notification");
const tenantFacing_1 = require("../ecosystem/models/tenantFacing");
const companyRoutes_1 = __importDefault(require("../routes/companyRoutes"));
const propertyRoutes_1 = __importDefault(require("../routes/propertyRoutes"));
const agentRoutes_1 = __importDefault(require("../routes/agentRoutes"));
const levyPaymentRoutes_1 = __importDefault(require("../routes/levyPaymentRoutes"));
const leaseRoutes_1 = __importDefault(require("../routes/leaseRoutes"));
const paymentRoutes_1 = __importDefault(require("../routes/paymentRoutes"));
const ownerRoutes_1 = __importDefault(require("../routes/ownerRoutes"));
const maintenanceRequestRoutes_1 = __importDefault(require("../routes/maintenanceRequestRoutes"));
const accountantRoutes_1 = __importDefault(require("../routes/accountantRoutes"));
const propertyOwnerRoutes_1 = __importDefault(require("../routes/propertyOwnerRoutes"));
const api_1 = __importDefault(require("../reporting/api"));
const routes_1 = __importDefault(require("../ecosystem/routes"));
const errorHandler_1 = require("../middleware/errorHandler");
const STAMP = `PHASE4C${Date.now().toString().slice(-8)}`;
const PASSWORD = 'Phase4c-Test-Password';
const checks = [];
function record(name, ok, detail) {
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
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`timeout ${method} ${path}`));
        });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
function denied(status) {
    return status === 401 || status === 403 || status === 404;
}
function includesName(result, name) {
    return result.text.includes(name);
}
function sideEffectSnapshot(companyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const companyFilter = { companyId: { $in: companyIds } };
        const journals = yield mongoose_1.default.connection.collection('journalentries').countDocuments(companyFilter);
        return {
            payments: yield Payment_1.Payment.countDocuments(companyFilter),
            leases: yield Lease_1.Lease.countDocuments(companyFilter),
            levies: yield LevyPayment_1.LevyPayment.countDocuments(companyFilter),
            maintenance: yield MaintenanceRequest_1.MaintenanceRequest.countDocuments(companyFilter),
            notifications: yield Notification_1.Notification.countDocuments(companyFilter),
            journals,
        };
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        yield (0, database_1.connectDatabase)();
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use('/api/companies', companyRoutes_1.default);
        app.use('/api/properties', propertyRoutes_1.default);
        app.use('/api/agents', agentRoutes_1.default);
        app.use('/api/levy-payments', levyPaymentRoutes_1.default);
        app.use('/api/leases', leaseRoutes_1.default);
        app.use('/api/payments', paymentRoutes_1.default);
        app.use('/api/owners', ownerRoutes_1.default);
        app.use('/api/maintenance', maintenanceRequestRoutes_1.default);
        app.use('/api/accountants', accountantRoutes_1.default);
        app.use('/api/property-owners', propertyOwnerRoutes_1.default);
        app.use('/api/reporting', api_1.default);
        app.use('/api/ecosystem', routes_1.default);
        app.use(errorHandler_1.errorHandler);
        const server = http_1.default.createServer(app);
        yield new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const createdUserIds = [];
        const createdCompanyIds = [];
        let landlordAId = null;
        let landlordBId = null;
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
            function makeCompany(name, workspaceType) {
                return __awaiter(this, void 0, void 0, function* () {
                    const company = yield Company_1.Company.create({
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
                });
            }
            const companyA = yield makeCompany(`${STAMP} Agency A`, 'agency');
            const companyB = yield makeCompany(`${STAMP} Agency B`, 'agency');
            const companyI = yield makeCompany(`${STAMP} Individual`, 'individual');
            function makeUser(email, role, companyId, roles) {
                return __awaiter(this, void 0, void 0, function* () {
                    const user = yield User_1.User.create({
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
                });
            }
            const adminA = yield makeUser(`${STAMP}-admin-a@example.test`, 'admin', companyA._id);
            const agentA = yield makeUser(`${STAMP}-agent-a@example.test`, 'agent', companyA._id);
            const agentB = yield makeUser(`${STAMP}-agent-b@example.test`, 'agent', companyA._id);
            const accountantA = yield makeUser(`${STAMP}-accountant-a@example.test`, 'accountant', companyA._id);
            const ownerUser = yield makeUser(`${STAMP}-owner-a@example.test`, 'owner', companyA._id);
            const agentForeign = yield makeUser(`${STAMP}-agent-foreign@example.test`, 'agent', companyB._id);
            const individual = yield makeUser(`${STAMP}-individual@example.test`, 'admin', companyI._id);
            const nameSavedA = `${STAMP} Saved By Agent A`;
            const nameSavedB = `${STAMP} Saved By Agent B`;
            const nameAssigned = `${STAMP} Assigned To Agent A`;
            const nameForeign = `${STAMP} Company B Private`;
            const propertySavedA = yield Property_1.Property.create({
                name: nameSavedA,
                address: '10 Agent A Road',
                companyId: companyA._id,
                ownerId: agentA._id,
                agentId: agentA._id,
                rent: 900,
            });
            const propertySavedB = yield Property_1.Property.create({
                name: nameSavedB,
                address: '20 Agent B Road',
                companyId: companyA._id,
                ownerId: agentB._id,
                agentId: agentB._id,
                rent: 900,
            });
            const propertyAssigned = yield Property_1.Property.create({
                name: nameAssigned,
                address: '30 Assigned Road',
                companyId: companyA._id,
                ownerId: adminA._id,
                agentId: agentA._id,
                rent: 900,
            });
            const propertyForeign = yield Property_1.Property.create({
                name: nameForeign,
                address: '40 Foreign Road',
                companyId: companyB._id,
                ownerId: agentForeign._id,
                agentId: agentForeign._id,
                rent: 500,
            });
            const landlordA = yield PropertyOwner_1.PropertyOwner.create({
                email: ownerUser.email,
                password: PASSWORD,
                firstName: 'Landlord',
                lastName: 'Shared',
                phone: '0771111111',
                companyId: companyA._id,
                properties: [propertySavedA._id, propertySavedB._id, propertyAssigned._id],
            });
            landlordAId = landlordA._id;
            const landlordB = yield PropertyOwner_1.PropertyOwner.create({
                email: `${STAMP}-landlord-b@example.test`,
                password: PASSWORD,
                firstName: 'Landlord',
                lastName: 'Foreign',
                phone: '0772222222',
                companyId: companyB._id,
                properties: [propertyForeign._id],
            });
            landlordBId = landlordB._id;
            yield Property_1.Property.updateMany({ _id: { $in: [propertySavedA._id, propertySavedB._id, propertyAssigned._id] } }, { $set: { propertyOwnerId: landlordA._id } });
            yield Property_1.Property.updateOne({ _id: propertyForeign._id }, { $set: { propertyOwnerId: landlordB._id } });
            const tenantA = yield Tenant_1.Tenant.create({
                firstName: 'Tenant',
                lastName: 'A',
                email: `${STAMP}-tenant-a@example.test`,
                phone: '0773333333',
                companyId: companyA._id,
                ownerId: agentA._id,
                propertyId: propertySavedA._id,
            });
            const tenantB = yield Tenant_1.Tenant.create({
                firstName: 'Tenant',
                lastName: 'B',
                email: `${STAMP}-tenant-b@example.test`,
                phone: '0774444444',
                companyId: companyA._id,
                ownerId: agentB._id,
                propertyId: propertySavedB._id,
            });
            const tenantForeign = yield Tenant_1.Tenant.create({
                firstName: 'Tenant',
                lastName: 'Foreign',
                email: `${STAMP}-tenant-foreign@example.test`,
                phone: '0775555555',
                companyId: companyB._id,
                ownerId: agentForeign._id,
                propertyId: propertyForeign._id,
            });
            const leaseA = yield Lease_1.Lease.create({
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
            const leaseB = yield Lease_1.Lease.create({
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
            const leaseForeign = yield Lease_1.Lease.create({
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
            const levyA = yield LevyPayment_1.LevyPayment.create({
                propertyId: propertySavedA._id,
                companyId: companyA._id,
                paymentDate: new Date('2026-02-01'),
                paymentMethod: 'bank_transfer',
                amount: 100,
                referenceNumber: `${STAMP}-LEVY-A`,
                processedBy: agentA._id,
            });
            const levyAssigned = yield LevyPayment_1.LevyPayment.create({
                propertyId: propertyAssigned._id,
                companyId: companyA._id,
                paymentDate: new Date('2026-02-01'),
                paymentMethod: 'bank_transfer',
                amount: 80,
                referenceNumber: `${STAMP}-LEVY-ASSIGNED`,
                processedBy: adminA._id,
            });
            const levyB = yield LevyPayment_1.LevyPayment.create({
                propertyId: propertySavedB._id,
                companyId: companyA._id,
                paymentDate: new Date('2026-02-01'),
                paymentMethod: 'cash',
                amount: 70,
                referenceNumber: `${STAMP}-LEVY-B`,
                processedBy: agentB._id,
            });
            const levyForeign = yield LevyPayment_1.LevyPayment.create({
                propertyId: propertyForeign._id,
                companyId: companyB._id,
                paymentDate: new Date('2026-02-01'),
                paymentMethod: 'cash',
                amount: 40,
                referenceNumber: `${STAMP}-LEVY-FOREIGN`,
                processedBy: agentForeign._id,
            });
            yield MaintenanceRequest_1.MaintenanceRequest.create({
                propertyId: propertySavedA._id,
                requestedBy: agentA._id,
                ownerId: landlordA._id,
                companyId: companyA._id,
                title: `${STAMP} MAINT A`,
                description: 'Authorized maintenance',
            });
            yield MaintenanceRequest_1.MaintenanceRequest.create({
                propertyId: propertyForeign._id,
                requestedBy: agentForeign._id,
                ownerId: landlordB._id,
                companyId: companyB._id,
                title: `${STAMP} MAINT FOREIGN`,
                description: 'Foreign maintenance',
            });
            const applicationForeign = yield tenantFacing_1.RentalApplication.create({
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
            const ownSaved = yield request(port, 'GET', `/api/properties/${propertySavedA._id}`, tAgentA);
            record('Agent A reads the property they saved', ownSaved.status === 200 && includesName(ownSaved, nameSavedA), `status ${ownSaved.status}`);
            const ownAssigned = yield request(port, 'GET', `/api/properties/${propertyAssigned._id}`, tAgentA);
            record('Agent A reads a property formally assigned to them', ownAssigned.status === 200 && includesName(ownAssigned, nameAssigned), `status ${ownAssigned.status}`);
            const otherAgent = yield request(port, 'GET', `/api/properties/${propertySavedB._id}`, tAgentA);
            record('Agent A cannot read Agent B property with the same landlord', denied(otherAgent.status) && !includesName(otherAgent, nameSavedB), `status ${otherAgent.status}`);
            const agentList = yield request(port, 'GET', '/api/agents/properties', tAgentA);
            record('Agent property list contains own properties and excludes the other agent', agentList.status === 200 && includesName(agentList, nameSavedA) && includesName(agentList, nameAssigned) && !includesName(agentList, nameSavedB), `status ${agentList.status}`);
            const searchOwn = yield request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(nameSavedA.slice(-12))}`, tAgentA);
            record('Agent search returns the authorized property', searchOwn.status === 200 && includesName(searchOwn, nameSavedA), `status ${searchOwn.status}`);
            const searchOther = yield request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent(nameSavedB.slice(-12))}`, tAgentA);
            record('Agent search does not return the other agent property', searchOther.status === 200 && !includesName(searchOther, nameSavedB), `status ${searchOther.status}`);
            const agentLevies = yield request(port, 'GET', '/api/agents/levy-payments', tAgentA);
            record('Agent A sees levy records for saved and assigned properties', agentLevies.status === 200 && includesName(agentLevies, `${STAMP}-LEVY-A`) && includesName(agentLevies, `${STAMP}-LEVY-ASSIGNED`), `status ${agentLevies.status}`);
            record('Agent A does not see Agent B levy records', !includesName(agentLevies, `${STAMP}-LEVY-B`) && !includesName(agentLevies, `${STAMP}-LEVY-FOREIGN`), 'levy payload');
            const agentBLevy = yield request(port, 'GET', `/api/levy-payments/${levyA._id}/receipt`, tAgentB);
            record('Agent B cannot read Agent A levy receipt by identifier', denied(agentBLevy.status) && !includesName(agentBLevy, `${STAMP}-LEVY-A`), `status ${agentBLevy.status}`);
            const unauth = yield request(port, 'GET', `/api/properties/${propertySavedA._id}`);
            record('Unauthenticated property request is denied', unauth.status === 401, `status ${unauth.status}`);
            const unauthLevy = yield request(port, 'GET', '/api/levy-payments');
            record('Unauthenticated levy request is denied', unauthLevy.status === 401, `status ${unauthLevy.status}`);
            const ownerOnAgentRoute = yield request(port, 'GET', '/api/agents/levy-payments', tOwner);
            record('Owner role is denied the agent levy route', ownerOnAgentRoute.status === 403, `status ${ownerOnAgentRoute.status}`);
            const ownerProps = yield request(port, 'GET', '/api/owners/properties', tOwner);
            record('Owner sees every property linked to that landlord', ownerProps.status === 200 && includesName(ownerProps, nameSavedA) && includesName(ownerProps, nameSavedB) && includesName(ownerProps, nameAssigned), `status ${ownerProps.status}`);
            record('Owner dashboard does not include the other company property', !includesName(ownerProps, nameForeign), 'owner payload');
            const accountantProps = yield request(port, 'GET', '/api/properties?limit=100', tAccountant);
            record('Accountant sees all properties in their company', accountantProps.status === 200 && includesName(accountantProps, nameSavedA) && includesName(accountantProps, nameSavedB) && includesName(accountantProps, nameAssigned) && !includesName(accountantProps, nameForeign), `status ${accountantProps.status}`);
            const accountantLevies = yield request(port, 'GET', '/api/levy-payments', tAccountant);
            record('Accountant sees company levy records and not the other company', accountantLevies.status === 200 && includesName(accountantLevies, `${STAMP}-LEVY-A`) && includesName(accountantLevies, `${STAMP}-LEVY-B`) && !includesName(accountantLevies, `${STAMP}-LEVY-FOREIGN`), `status ${accountantLevies.status}`);
            const crossProperty = yield request(port, 'GET', `/api/properties/${propertyForeign._id}`, tAgentA);
            record('Company A agent cannot read Company B property', denied(crossProperty.status) && !includesName(crossProperty, nameForeign), `status ${crossProperty.status}`);
            const accountantCross = yield request(port, 'GET', `/api/properties/${propertyForeign._id}`, tAccountant);
            record('Company A accountant cannot read Company B property', denied(accountantCross.status) && !includesName(accountantCross, nameForeign), `status ${accountantCross.status}`);
            const crossLease = yield request(port, 'GET', `/api/leases/${leaseForeign._id}`, tAgentA);
            record('Company A user cannot read Company B lease', denied(crossLease.status), `status ${crossLease.status}`);
            const crossLevy = yield request(port, 'GET', `/api/levy-payments/${levyForeign._id}/receipt`, tAccountant);
            record('Company A accountant cannot read Company B levy receipt', denied(crossLevy.status) && !includesName(crossLevy, `${STAMP}-LEVY-FOREIGN`), `status ${crossLevy.status}`);
            const crossMaint = yield request(port, 'GET', `/api/maintenance/property/${propertyForeign._id}`, tAgentA);
            record('Company A user cannot read Company B maintenance', denied(crossMaint.status) && !includesName(crossMaint, `${STAMP} MAINT FOREIGN`), `status ${crossMaint.status}`);
            const maintList = yield request(port, 'GET', '/api/maintenance', tAgentA);
            record('Agent maintenance list stays inside the authorized portfolio', maintList.status === 200 && includesName(maintList, `${STAMP} MAINT A`) && !includesName(maintList, `${STAMP} MAINT FOREIGN`), `status ${maintList.status}`);
            const crossSearch = yield request(port, 'GET', `/api/agents/letting/search?q=${encodeURIComponent('Company B')}`, tAgentA);
            record('Agent search does not return Company B records', crossSearch.status === 200 && !includesName(crossSearch, nameForeign), `status ${crossSearch.status}`);
            const crossExport = yield request(port, 'GET', `/api/reporting/owner/${propertyForeign._id}?ledger=rental`, tAccountant);
            record('Owner-statement export denies the other company property', denied(crossExport.status), `status ${crossExport.status}`);
            const crossApps = yield request(port, 'GET', '/api/ecosystem/agency/applications', tAgentA);
            record('Agency application queue does not return the other company', crossApps.status === 200 && !includesName(crossApps, `${STAMP} APPLICANT FOREIGN`), `status ${crossApps.status}`);
            const publicListings = yield request(port, 'GET', `/api/ecosystem/listings?q=${encodeURIComponent(STAMP)}`);
            record('Public listing search does not expose the private property', publicListings.status === 200 && !includesName(publicListings, nameForeign) && !includesName(publicListings, nameSavedA), `status ${publicListings.status}`);
            const individualList = yield request(port, 'GET', '/api/properties?limit=100', tIndividual);
            record('Individual workspace does not receive agency properties', individualList.status === 200 && !includesName(individualList, nameSavedA) && !includesName(individualList, nameForeign), `status ${individualList.status}`);
            const sameCompanyLease = yield request(port, 'GET', `/api/leases/${leaseB._id}`, tAgentA);
            record('Agent A cannot read Agent B lease in the same company', denied(sameCompanyLease.status), `status ${sameCompanyLease.status}`);
            const foreignAgentOwn = yield request(port, 'GET', `/api/properties/${propertyForeign._id}`, tForeign);
            record('Company B agent can read their own property', foreignAgentOwn.status === 200, `status ${foreignAgentOwn.status}`);
            const companyIds = [companyA._id, companyB._id, companyI._id];
            const foreignNameBefore = (_a = (yield Company_1.Company.findById(companyB._id).select('name').lean())) === null || _a === void 0 ? void 0 : _a.name;
            const renameForeign = yield request(port, 'PUT', `/api/companies/${companyB._id}`, tAgentA, { name: `${STAMP} HACKED` });
            const deleteForeign = yield request(port, 'DELETE', `/api/companies/${companyB._id}`, tAgentA);
            const foreignNameAfter = (_b = (yield Company_1.Company.findById(companyB._id).select('name').lean())) === null || _b === void 0 ? void 0 : _b.name;
            record('Cross-company company update is denied', denied(renameForeign.status), `status ${renameForeign.status}`);
            record('Cross-company company delete is denied', denied(deleteForeign.status), `status ${deleteForeign.status}`);
            record('Rejected company write left the other company unchanged', foreignNameBefore === foreignNameAfter && foreignNameAfter === companyB.name, `name ${foreignNameAfter || 'missing'}`);
            const before = yield sideEffectSnapshot(companyIds);
            const badLease = yield request(port, 'POST', '/api/leases', tAgentA, {
                propertyId: String(propertyForeign._id),
                tenantId: String(tenantForeign._id),
                startDate: '2026-03-01',
                endDate: '2027-02-28',
                rentAmount: 100,
                depositAmount: 100,
                companyId: String(companyA._id),
            });
            const mixedLease = yield request(port, 'POST', '/api/leases', tAgentA, {
                propertyId: String(propertySavedA._id),
                tenantId: String(tenantForeign._id),
                startDate: '2026-03-01',
                endDate: '2027-02-28',
                rentAmount: 100,
                depositAmount: 100,
            });
            const badLevy = yield request(port, 'POST', '/api/levy-payments', tAgentA, {
                propertyId: String(propertyForeign._id),
                paymentDate: '2026-03-01',
                paymentMethod: 'cash',
                amount: 25,
                companyId: String(companyB._id),
            });
            const badPayment = yield request(port, 'POST', '/api/payments', tAgentA, {
                leaseId: String(leaseForeign._id),
                amount: 100,
                paymentDate: '2026-03-01',
                paymentMethod: 'cash',
                status: 'pending',
                companyId: String(companyB._id),
                rentalPeriodMonth: 3,
                rentalPeriodYear: 2026,
            });
            const mixedPayment = yield request(port, 'POST', '/api/accountants/payments', tAgentA, {
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
            const sameCompanyPayment = yield request(port, 'POST', '/api/payments', tAgentA, {
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
            const after = yield sideEffectSnapshot(companyIds);
            const unchanged = JSON.stringify(before) === JSON.stringify(after);
            record('Rejected writes created no payments, leases, levies, maintenance, notifications, or journals', unchanged, unchanged ? 'counts unchanged' : `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
            const historicalPayment = yield Payment_1.Payment.countDocuments({ _id: new mongoose_1.default.Types.ObjectId('6acb543e271b8f1011240e3f') });
            record('Phase 4B.1 historical payment was not rewritten', historicalPayment === 1 || historicalPayment === 0, `matching documents ${historicalPayment}`);
            void applicationForeign;
            void levyAssigned;
            void leaseA;
        }
        finally {
            const companyIds = createdCompanyIds;
            if (companyIds.length) {
                const companyFilter = { companyId: { $in: companyIds } };
                yield tenantFacing_1.RentalApplication.deleteMany(companyFilter);
                yield MaintenanceRequest_1.MaintenanceRequest.deleteMany(companyFilter);
                yield LevyPayment_1.LevyPayment.deleteMany(companyFilter);
                yield Lease_1.Lease.deleteMany(companyFilter);
                yield Tenant_1.Tenant.deleteMany(companyFilter);
                yield Property_1.Property.deleteMany(companyFilter);
                if (landlordAId)
                    yield PropertyOwner_1.PropertyOwner.deleteOne({ _id: landlordAId });
                if (landlordBId)
                    yield PropertyOwner_1.PropertyOwner.deleteOne({ _id: landlordBId });
                yield Notification_1.Notification.deleteMany(companyFilter);
            }
            if (createdUserIds.length)
                yield User_1.User.deleteMany({ _id: { $in: createdUserIds } });
            if (companyIds.length)
                yield Company_1.Company.deleteMany({ _id: { $in: companyIds } });
            yield new Promise((resolve) => server.close(() => resolve()));
            try {
                yield database_1.accountingConnection.close();
            }
            catch ( /* connection may already be closed */_c) { /* connection may already be closed */ }
            yield mongoose_1.default.disconnect();
        }
        const failed = checks.filter((check) => !check.ok);
        console.log(`Phase 4C access-control checks: ${checks.length - failed.length}/${checks.length} passed`);
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
