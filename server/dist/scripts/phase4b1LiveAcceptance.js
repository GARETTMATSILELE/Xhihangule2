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
 * Phase 4B.1 live acceptance against the already-running local API.
 * Setup fixtures are labelled. The rental payment itself is posted only through HTTP.
 * Does not print tokens, passwords, or connection strings.
 */
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
const Payment_1 = require("../models/Payment");
const TaxRate_1 = require("../models/TaxRate");
const OwnerRentNotice_1 = require("../models/OwnerRentNotice");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const MaintenanceQuote_1 = require("../models/MaintenanceQuote");
const MaintenanceContractor_1 = require("../models/MaintenanceContractor");
const maintenanceWorkflow_1 = require("../ecosystem/models/maintenanceWorkflow");
const tenantFacing_1 = require("../ecosystem/models/tenantFacing");
const ownerRentNotificationService_1 = require("../services/ownerRentNotificationService");
const ownerWaterfall_1 = require("../reporting/ownerWaterfall");
const STAMP = Date.now().toString().slice(-8);
const PASSWORD = 'Phase4b1-Accept-1';
const BASE = '127.0.0.1';
const PORT = 5000;
const OUT = path_1.default.resolve(__dirname, '../../tmp/phase4b1-evidence.json');
const evidence = {
    startedAt: new Date().toISOString(),
    stamp: STAMP,
    setupVersusAcceptance: {
        setup: 'signup, users, property settings, VAT rate, tax profile, tenant, lease, owner link, maintenance fixture records',
        acceptance: 'POST /api/accountants/payments then read payment, accounts, journals, statement, csv, financial trace',
    },
    http: [],
};
function save() {
    fs_1.default.mkdirSync(path_1.default.dirname(OUT), { recursive: true });
    fs_1.default.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
}
function request(method, urlPath, token, body) {
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            hostname: BASE,
            port: PORT,
            path: urlPath,
            method,
            headers: Object.assign(Object.assign({}, (payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})), (token ? { Authorization: `Bearer ${token}` } : {})),
            timeout: 180000,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
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
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        if (payload)
            req.write(payload);
        req.end();
    });
}
function redact(value) {
    if (Array.isArray(value))
        return value.slice(0, 30).map(redact);
    if (!value || typeof value !== 'object')
        return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        if (/token|password|secret|authorization/i.test(key))
            continue;
        out[key] = redact(item);
    }
    return out;
}
function call(label, method, urlPath, token, body, extra) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield request(method, urlPath, token, body);
        const row = Object.assign(Object.assign({ label,
            method, path: urlPath.split('?')[0], status: result.status }, extra), { body: typeof result.body === 'string' ? result.text.slice(0, 1500) : redact(result.body) });
        evidence.http.push(row);
        save();
        return result;
    });
}
function idOf(body) {
    var _a, _b, _c, _d, _e;
    const value = (body === null || body === void 0 ? void 0 : body._id) || (body === null || body === void 0 ? void 0 : body.id) || ((_a = body === null || body === void 0 ? void 0 : body.data) === null || _a === void 0 ? void 0 : _a._id) || ((_b = body === null || body === void 0 ? void 0 : body.data) === null || _b === void 0 ? void 0 : _b.id) || ((_c = body === null || body === void 0 ? void 0 : body.payment) === null || _c === void 0 ? void 0 : _c._id) || ((_d = body === null || body === void 0 ? void 0 : body.user) === null || _d === void 0 ? void 0 : _d._id) || ((_e = body === null || body === void 0 ? void 0 : body.company) === null || _e === void 0 ? void 0 : _e._id);
    return value ? String(value) : undefined;
}
function signup(companyName, plan) {
    return __awaiter(this, void 0, void 0, function* () {
        const email = `${companyName.toLowerCase()}.${STAMP}@phase4b1.test`;
        const result = yield call(`signup ${companyName}`, 'POST', '/api/auth/signup', null, {
            email,
            password: PASSWORD,
            name: `${companyName} Admin`,
            plan,
            company: {
                name: companyName,
                address: '1 Test Close, Harare',
                phone: '0772000000',
                email,
                registrationNumber: `P4B1-${STAMP}-${companyName.slice(-4)}`,
                tinNumber: `T4B1-${STAMP}-${companyName.slice(-4)}`,
            },
        });
        if (result.status !== 201)
            throw new Error(`signup ${companyName} failed ${result.status} ${result.text.slice(0, 400)}`);
        return {
            email,
            token: result.body.token,
            userId: String(result.body.user._id),
            companyId: String(result.body.user.companyId || result.body.company._id),
        };
    });
}
function createStaff(adminToken, role, roles, label) {
    return __awaiter(this, void 0, void 0, function* () {
        const email = `${label.toLowerCase()}.${STAMP}@phase4b1.test`;
        const result = yield call(`create ${label}`, 'POST', '/api/users', adminToken, {
            email,
            password: PASSWORD,
            firstName: label,
            lastName: 'PHASE4B1',
            role,
            roles,
        });
        if (result.status >= 400)
            throw new Error(`user ${label} failed ${result.status} ${result.text.slice(0, 400)}`);
        const login = yield call(`login ${label}`, 'POST', '/api/auth/login', null, { email, password: PASSWORD });
        if (login.status !== 200)
            throw new Error(`login ${label} failed ${login.status}`);
        return { email, token: login.body.token, userId: String(login.body.user._id) };
    });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function waitForNotice(paymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let i = 0; i < 20; i++) {
            const row = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ idempotencyKey: `owner-rent-payment:${paymentId}` }).lean();
            if (row)
                return row;
            yield sleep(500);
        }
        return null;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17;
        const blocked = ['MONGODB_URI', 'ACCOUNTING_DB_URI', 'MONGODB_URI_PROPERTY', 'MONGODB_URI_ACCOUNTING', 'AZURE_COSMOS_CONNECTIONSTRING', 'CUSTOMCONNSTR_MONGODB_URI', 'FORCE_DB_URI']
            .filter((key) => Boolean(process.env[key]));
        if (process.env.NODE_ENV === 'production' || blocked.length) {
            console.error('ABORT: database environment is not a confirmed local development target');
            process.exit(2);
        }
        const health = yield request('GET', '/api/health/live', null);
        evidence.health = { status: health.status };
        if (health.status !== 200)
            throw new Error(`API health ${health.status}`);
        yield (0, database_1.connectDatabase)();
        const host = String(mongoose_1.default.connection.host || '');
        const accountingHost = String(database_1.accountingConnection.host || '');
        evidence.database = {
            nodeEnv: process.env.NODE_ENV,
            mainName: mongoose_1.default.connection.name,
            mainHostIsLocal: host === 'localhost' || host === '127.0.0.1',
            accountingName: database_1.accountingConnection.name,
            accountingHostIsLocal: accountingHost === 'localhost' || accountingHost === '127.0.0.1',
        };
        if (!evidence.database.mainHostIsLocal || !evidence.database.accountingHostIsLocal) {
            console.error('ABORT: connected host is not local');
            process.exit(2);
        }
        save();
        const historical = yield Payment_1.Payment.findOne({}).sort({ createdAt: 1 }).select('_id status amount accountingComplete updatedAt companyId').lean();
        evidence.historicalSentinel = historical ? {
            id: String(historical._id),
            status: historical.status,
            amount: historical.amount,
            accountingComplete: historical.accountingComplete,
            updatedAt: historical.updatedAt,
        } : null;
        evidence.paymentCountBefore = yield Payment_1.Payment.countDocuments({});
        const testCo = yield signup('PHASE4B1_TEST_COMPANY', 'ENTERPRISE');
        const companyA = yield signup('PHASE4B1_COMPANY_A', 'ENTERPRISE');
        const companyB = yield signup('PHASE4B1_COMPANY_B', 'ENTERPRISE');
        const individual = yield signup('PHASE4B1_INDIVIDUAL', 'INDIVIDUAL');
        evidence.identities = {
            testCompanyId: testCo.companyId,
            companyAId: companyA.companyId,
            companyBId: companyB.companyId,
            individualCompanyId: individual.companyId,
            testAdminEmail: testCo.email,
            companyAAdminEmail: companyA.email,
            companyBAdminEmail: companyB.email,
            individualEmail: individual.email,
        };
        const agent = yield createStaff(testCo.token, 'agent', ['agent', 'principal'], 'PHASE4B1_TEST_AGENT');
        const junior = yield createStaff(testCo.token, 'agent', ['agent'], 'PHASE4B1_TEST_AGENT_JUNIOR');
        const accountant = yield createStaff(testCo.token, 'accountant', ['accountant'], 'PHASE4B1_TEST_ACCOUNTANT');
        const ownerUser = yield createStaff(testCo.token, 'owner', ['owner'], 'PHASE4B1_TEST_OWNER_USER');
        evidence.identities.agentEmail = agent.email;
        evidence.identities.juniorEmail = junior.email;
        evidence.identities.accountantEmail = accountant.email;
        evidence.identities.ownerUserEmail = ownerUser.email;
        save();
        const taxProfile = yield call('set vat profile', 'PUT', `/api/companies/${testCo.companyId}`, testCo.token, {
            taxProfile: { vatRegistered: true, vatRegistrationEffectiveDate: '2020-01-01' },
        });
        const taxRate = yield call('set vat rate', 'POST', '/api/accounting/tax-rates', testCo.token, {
            taxType: 'VAT', rate: 15.5, effectiveFrom: '2020-01-01',
        });
        evidence.vatSetup = { profileStatus: taxProfile.status, rateStatus: taxRate.status, rate: redact(taxRate.body) };
        const propertyRes = yield call('create property', 'POST', '/api/properties', testCo.token, {
            name: 'PHASE4B1_TEST_PROPERTY',
            address: '1 Borrowdale Test Close, Harare',
            type: 'house',
            rent: 1000,
            commission: 10,
            rentalType: 'management',
            vatOnCommission: true,
            vatCommissionTreatment: 'exclusive',
            levyOrMunicipalType: 'levy',
            levyOrMunicipalAmount: 100,
            status: 'rented',
        });
        const propertyId = idOf(propertyRes.body);
        if (!propertyId)
            throw new Error(`property create failed ${propertyRes.status} ${propertyRes.text.slice(0, 500)}`);
        const ownerRes = yield call('create property owner', 'POST', '/api/property-owners', testCo.token, {
            email: `phase4b1_test_owner.${STAMP}@phase4b1.test`,
            password: PASSWORD,
            firstName: 'PHASE4B1_TEST_OWNER',
            lastName: 'Disposable',
            phone: '0772000001',
            propertyIds: [propertyId],
        });
        const ownerId = idOf(ownerRes.body);
        if (!ownerId)
            throw new Error(`owner create failed ${ownerRes.status} ${ownerRes.text.slice(0, 400)}`);
        const linked = yield call('link property owner', 'PUT', `/api/properties/${propertyId}`, testCo.token, {
            propertyOwnerId: ownerId,
            name: 'PHASE4B1_TEST_PROPERTY',
            address: '1 Borrowdale Test Close, Harare',
            rent: 1000,
            commission: 10,
            rentalType: 'management',
            vatOnCommission: true,
            vatCommissionTreatment: 'exclusive',
            levyOrMunicipalType: 'levy',
            levyOrMunicipalAmount: 100,
        });
        evidence.propertyLink = { status: linked.status, propertyOwnerId: ((_a = linked.body) === null || _a === void 0 ? void 0 : _a.propertyOwnerId) || ((_c = (_b = linked.body) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.propertyOwnerId) };
        const tenantRes = yield call('create tenant', 'POST', '/api/tenants', testCo.token, {
            firstName: 'PHASE4B1_TEST_TENANT',
            lastName: 'Disposable',
            email: `phase4b1_test_tenant.${STAMP}@phase4b1.test`,
            phone: '0772000002',
            propertyId,
        });
        const tenantId = idOf(tenantRes.body) || idOf((_d = tenantRes.body) === null || _d === void 0 ? void 0 : _d.tenant) || ((_f = (_e = tenantRes.body) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f._id);
        if (!tenantId)
            throw new Error(`tenant create failed ${tenantRes.status} ${tenantRes.text.slice(0, 400)}`);
        const leaseRes = yield call('create lease', 'POST', '/api/leases', testCo.token, {
            propertyId,
            tenantId,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            rentAmount: 1000,
            depositAmount: 0,
            status: 'active',
        });
        const leaseId = idOf(leaseRes.body) || ((_h = (_g = leaseRes.body) === null || _g === void 0 ? void 0 : _g.lease) === null || _h === void 0 ? void 0 : _h._id);
        if (!leaseId)
            throw new Error(`lease create failed ${leaseRes.status} ${leaseRes.text.slice(0, 500)}`);
        evidence.records = { propertyId, ownerId, tenantId: String(tenantId), leaseId: String(leaseId), agentId: agent.userId };
        function postRent(month, year, notes) {
            return __awaiter(this, void 0, void 0, function* () {
                return call(`payment ${year}-${month}`, 'POST', '/api/accountants/payments', testCo.token, {
                    paymentType: 'rental',
                    paymentDate: `${year}-${String(month).padStart(2, '0')}-11`,
                    paymentMethod: 'cash',
                    amount: 1000,
                    currency: 'USD',
                    propertyId,
                    tenantId,
                    agentId: agent.userId,
                    leaseId,
                    rentalPeriodMonth: month,
                    rentalPeriodYear: year,
                    referenceNumber: `PHASE4B1-${year}-${month}-${STAMP}`,
                    notes,
                });
            });
        }
        const paymentRes = yield postRent(10, 2026);
        const paymentId = idOf(paymentRes.body) || ((_l = (_k = (_j = paymentRes.body) === null || _j === void 0 ? void 0 : _j.data) === null || _k === void 0 ? void 0 : _k.payment) === null || _l === void 0 ? void 0 : _l._id) || ((_o = (_m = paymentRes.body) === null || _m === void 0 ? void 0 : _m.payment) === null || _o === void 0 ? void 0 : _o._id);
        if (!paymentId)
            throw new Error(`payment failed ${paymentRes.status} ${paymentRes.text.slice(0, 800)}`);
        evidence.borrowdale = { createStatus: paymentRes.status, paymentId: String(paymentId) };
        const readPay = yield call('read payment', 'GET', `/api/accountants/payments/${paymentId}`, testCo.token);
        const paymentDoc = ((_p = readPay.body) === null || _p === void 0 ? void 0 : _p.data) || ((_q = readPay.body) === null || _q === void 0 ? void 0 : _q.payment) || readPay.body;
        const snapshot = (paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.commissionDetails) || {};
        const allocation = (paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.paymentAllocation) || {};
        const waterfall = (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: Number((_s = (_r = snapshot.grossRent) !== null && _r !== void 0 ? _r : paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.amount) !== null && _s !== void 0 ? _s : 0),
            commissionAmount: Number((_u = (_t = snapshot.commissionNet) !== null && _t !== void 0 ? _t : snapshot.totalCommission) !== null && _u !== void 0 ? _u : 0),
            levyAmount: Number((_v = snapshot.levy) !== null && _v !== void 0 ? _v : 0),
            vatOnCommission: Number((_x = (_w = snapshot.vatOnCommission) !== null && _w !== void 0 ? _w : snapshot.vatAmount) !== null && _x !== void 0 ? _x : 0),
            recordedOwnerAmount: allocation.ownerPayable,
        });
        const accounts = yield database_1.accountingConnection.collection('propertyaccounts').find({
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            isArchived: { $ne: true },
        }).project({ ledgerType: 1, propertyId: 1, isArchived: 1, 'transactions.paymentId': 1, 'transactions.type': 1, 'transactions.category': 1, 'transactions.amount': 1 }).toArray();
        const journals = yield mongoose_1.default.connection.collection('journalentries').find({
            companyId: new mongoose_1.default.Types.ObjectId(testCo.companyId),
            sourceId: String(paymentId),
        }).project({ sourceModule: 1, sourceId: 1, reference: 1, status: 1 }).toArray();
        const statement = yield call('owner statement', 'GET', `/api/reporting/owner/${propertyId}?ledger=rental&includeAllTransactions=true`, testCo.token);
        const csv = yield call('owner csv', 'GET', `/api/reporting/owner/${propertyId}/csv?ledger=rental&includeAllTransactions=true`, testCo.token);
        const trace = yield call('financial trace', 'GET', `/api/accountants/payments/${paymentId}/financial-trace`, testCo.token);
        const activeAccounts = accounts.filter((row) => row.isArchived !== true);
        evidence.borrowdale.persisted = {
            status: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.status,
            currency: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.currency,
            transactionDomain: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.transactionDomain,
            paymentType: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.paymentType,
            amount: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.amount,
            rentAllocated: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.rentAllocated,
            levyAllocated: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.levyAllocated,
            accountingComplete: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.accountingComplete,
            accountingStatus: paymentDoc === null || paymentDoc === void 0 ? void 0 : paymentDoc.accountingStatus,
            commissionNet: (_y = snapshot.commissionNet) !== null && _y !== void 0 ? _y : snapshot.totalCommission,
            levy: snapshot.levy,
            vatOnCommission: (_z = snapshot.vatOnCommission) !== null && _z !== void 0 ? _z : snapshot.vatAmount,
            grossRent: snapshot.grossRent,
            ownerAmount: snapshot.ownerAmount,
            ownerPayable: allocation.ownerPayable,
            waterfall,
            activePropertyAccountCount: activeAccounts.length,
            accountLedgerTypes: activeAccounts.map((row) => row.ledgerType),
            journalCount: journals.length,
            journalModules: journals.map((row) => row.sourceModule),
            statementStatus: statement.status,
            csvStatus: csv.status,
            csvHasPaymentId: typeof csv.body === 'string' ? csv.text.includes(String(paymentId)) : JSON.stringify(csv.body).includes(String(paymentId)),
            csvExcerpt: (typeof csv.body === 'string' ? csv.text : JSON.stringify(csv.body)).slice(0, 1800),
            traceStatus: trace.status,
            traceExcerpt: redact(trace.body),
        };
        save();
        const notice1 = yield waitForNotice(String(paymentId));
        const noticeBeforeRetry = notice1 ? { status: notice1.status, updatedAt: notice1.updatedAt } : null;
        const loaded = yield Payment_1.Payment.findById(paymentId);
        if (loaded)
            yield (0, ownerRentNotificationService_1.notifyOwnerOfRentPayment)(loaded, { accountingComplete: loaded.accountingComplete === true });
        const noticeAfter = yield OwnerRentNotice_1.OwnerRentNotice.find({ paymentId }).lean();
        evidence.notification = {
            provider: 'Mailtrap SMTP is configured on the API process. Inbox delivery was not read back, so provider delivery is NOT VERIFIED.',
            scenario1: noticeBeforeRetry,
            scenario2: {
                count: noticeAfter.length,
                statuses: noticeAfter.map((row) => row.status),
                updatedAtUnchanged: noticeBeforeRetry ? String((_0 = noticeAfter[0]) === null || _0 === void 0 ? void 0 : _0.updatedAt) === String(noticeBeforeRetry.updatedAt) : false,
            },
            emailTextCheckedForTenantId: notice1 ? false : null,
        };
        save();
        const mailPayment = yield postRent(1, 2027, 'PHASE4B1_FAIL_MAIL controlled adapter failure');
        const mailPaymentId = String(idOf(mailPayment.body) || ((_2 = (_1 = mailPayment.body) === null || _1 === void 0 ? void 0 : _1.payment) === null || _2 === void 0 ? void 0 : _2._id) || '');
        const mailBefore = mailPaymentId ? yield Payment_1.Payment.findById(mailPaymentId).select('status accountingComplete').lean() : null;
        let mailNotice = mailPaymentId ? yield waitForNotice(mailPaymentId) : null;
        if (loaded && mailPaymentId) {
            const mailDoc = yield Payment_1.Payment.findById(mailPaymentId);
            if (mailDoc) {
                yield (0, ownerRentNotificationService_1.notifyOwnerOfRentPayment)(mailDoc, { accountingComplete: mailDoc.accountingComplete === true });
                yield (0, ownerRentNotificationService_1.notifyOwnerOfRentPayment)(mailDoc, { accountingComplete: mailDoc.accountingComplete === true });
            }
        }
        mailNotice = mailPaymentId ? yield OwnerRentNotice_1.OwnerRentNotice.findOne({ paymentId: mailPaymentId }).lean() : null;
        const mailCount = mailPaymentId ? yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({ paymentId: mailPaymentId }) : 0;
        const mailAfter = mailPaymentId ? yield Payment_1.Payment.findById(mailPaymentId).select('status accountingComplete').lean() : null;
        evidence.notification.scenario5 = {
            mode: 'Development seam PHASE4B1_FAIL_MAIL on the API process, then the same notifyOwnerOfRentPayment retry. First send throws; retry uses the same owner-rent-payment key.',
            paymentId: mailPaymentId,
            createStatus: mailPayment.status,
            before: mailBefore,
            after: mailAfter,
            notice: mailNotice ? { status: mailNotice.status, failureReason: mailNotice.failureReason, key: mailNotice.idempotencyKey } : null,
            noticeCount: mailCount,
            accountingUnchanged: Boolean(mailBefore && mailAfter && mailBefore.status === mailAfter.status && mailBefore.accountingComplete === mailAfter.accountingComplete),
        };
        yield call('opt out', 'POST', `/api/property-owners/${ownerId}/preferences`, testCo.token, { rentPaymentEmails: false });
        const optPayment = yield postRent(11, 2026);
        const optPaymentId = String(idOf(optPayment.body) || '');
        const optNotice = optPaymentId ? yield waitForNotice(optPaymentId) : null;
        const optPay = optPaymentId ? yield Payment_1.Payment.findById(optPaymentId).select('status accountingComplete').lean() : null;
        evidence.notification.scenario3 = {
            paymentId: optPaymentId,
            noticeStatus: (optNotice === null || optNotice === void 0 ? void 0 : optNotice.status) || null,
            accountingComplete: optPay === null || optPay === void 0 ? void 0 : optPay.accountingComplete,
            paymentStatus: optPay === null || optPay === void 0 ? void 0 : optPay.status,
        };
        const incomplete = yield postRent(12, 2026, 'PHASE26_FAIL_JOURNAL');
        const incompleteId = String(idOf(incomplete.body) || '');
        yield sleep(1500);
        const incompletePay = incompleteId ? yield Payment_1.Payment.findById(incompleteId).select('status accountingComplete notes').lean() : null;
        const incompleteNotice = incompleteId ? yield OwnerRentNotice_1.OwnerRentNotice.findOne({ paymentId: incompleteId }).lean() : null;
        evidence.notification.scenario4 = {
            paymentId: incompleteId,
            createStatus: incomplete.status,
            paymentStatus: incompletePay === null || incompletePay === void 0 ? void 0 : incompletePay.status,
            accountingComplete: incompletePay === null || incompletePay === void 0 ? void 0 : incompletePay.accountingComplete,
            noticeCreated: Boolean(incompleteNotice),
        };
        save();
        const storedRate = yield TaxRate_1.TaxRate.findOne({ companyId: testCo.companyId, taxType: 'VAT' }).select('rate effectiveFrom isActive').lean();
        evidence.vatSetup.storedRate = storedRate;
        const journalsBeforeOps = yield mongoose_1.default.connection.collection('journalentries').countDocuments({ companyId: new mongoose_1.default.Types.ObjectId(testCo.companyId) });
        const contractor = yield MaintenanceContractor_1.MaintenanceContractor.create({
            companyId: testCo.companyId,
            companyName: 'PHASE4B1 Contractor',
            contactPerson: 'PHASE4B1',
            phone: '0772000003',
            email: `phase4b1.contractor.${STAMP}@phase4b1.test`,
            trade: 'General Contractor',
            rating: 0,
            active: true,
        });
        const maint = yield MaintenanceRequest_1.MaintenanceRequest.create({
            propertyId,
            companyId: testCo.companyId,
            requestedBy: agent.userId,
            ownerId,
            title: 'PHASE4B1 test repair',
            description: 'Disposable maintenance smoke fixture',
            companyName: 'PHASE4B1',
        });
        const quote = yield MaintenanceQuote_1.MaintenanceQuote.create({
            requestId: maint._id,
            companyId: testCo.companyId,
            contractorId: contractor._id,
            propertyId,
            amount: 80,
            total: 80,
            description: 'PHASE4B1 approved quote',
            submittedDate: new Date(),
            status: 'OWNER_APPROVED',
            version: 3,
        });
        yield maintenanceWorkflow_1.ContractorJobRecord.create({
            requestId: maint._id,
            companyId: testCo.companyId,
            propertyId,
            contractorId: contractor._id,
            quoteId: quote._id,
            status: 'AUTHORISED',
            authorisedBy: agent.userId,
            authorisedAt: new Date(),
        });
        evidence.maintenanceSetup = 'Fixture records only. The payment request is the HTTP acceptance step.';
        const tooMuch = yield call('maintenance over approved', 'POST', '/api/agents/letting/maintenance-payment-requests', agent.token, {
            quoteId: String(quote._id), propertyId, amount: 500,
        });
        const okReq = yield call('maintenance within approved', 'POST', '/api/agents/letting/maintenance-payment-requests', agent.token, {
            quoteId: String(quote._id), propertyId, amount: 80, payTo: { name: 'PHASE4B1', surname: 'Contractor' },
        });
        const journalsAfterMaint = yield mongoose_1.default.connection.collection('journalentries').countDocuments({ companyId: new mongoose_1.default.Types.ObjectId(testCo.companyId) });
        const queue = yield call('accountant queue', 'GET', '/api/accountants/letting/work-queue', accountant.token);
        evidence.maintenance = {
            overStatus: tooMuch.status,
            overBody: typeof tooMuch.body === 'string' ? tooMuch.text.slice(0, 400) : redact(tooMuch.body),
            requestStatus: okReq.status,
            quoteVersion: 3,
            journalsBefore: journalsBeforeOps,
            journalsAfter: journalsAfterMaint,
            journalsUnchanged: journalsBeforeOps === journalsAfterMaint,
            queueStatus: queue.status,
            queueContainsRequest: JSON.stringify(queue.body).includes(String(quote._id)) || JSON.stringify(queue.body).includes('Maintenance'),
        };
        const levy = yield call('create levy', 'POST', '/api/levy-payments', testCo.token, {
            propertyId, paymentDate: '2026-10-11', paymentMethod: 'cash', amount: 10, currency: 'USD', levyPeriodMonth: 9, levyPeriodYear: 2026,
        });
        const levyId = idOf(levy.body);
        const journalsBeforeReceipt = yield mongoose_1.default.connection.collection('journalentries').countDocuments({ companyId: new mongoose_1.default.Types.ObjectId(testCo.companyId) });
        const levyCountBefore = levyId ? yield mongoose_1.default.connection.collection('levypayments').countDocuments({ companyId: new mongoose_1.default.Types.ObjectId(testCo.companyId) }) : 0;
        const receipt = levyId ? yield call('file levy receipt', 'POST', `/api/agents/letting/levies/${levyId}/receipt`, agent.token, {
            receiptNumber: `PHASE4B1-${STAMP}`, receiptFileUrl: `phase4b1://${STAMP}/receipt.pdf`, levyAuthority: 'PHASE4B1 Authority',
        }) : null;
        const journalsAfterReceipt = yield mongoose_1.default.connection.collection('journalentries').countDocuments({ companyId: new mongoose_1.default.Types.ObjectId(testCo.companyId) });
        const levyCountAfter = yield mongoose_1.default.connection.collection('levypayments').countDocuments({ companyId: new mongoose_1.default.Types.ObjectId(testCo.companyId) });
        evidence.levy = {
            createStatus: levy.status,
            levyId,
            receiptStatus: receipt === null || receipt === void 0 ? void 0 : receipt.status,
            journalsUnchangedByReceipt: journalsBeforeReceipt === journalsAfterReceipt,
            levyCountUnchangedByReceipt: levyCountBefore === levyCountAfter,
        };
        const bProperty = yield call('company B property', 'POST', '/api/properties', companyB.token, {
            name: 'PHASE4B1_COMPANY_B_PROPERTY', address: '2 Other Company Close', type: 'house', rent: 50, rentalType: 'management',
        });
        const bPropertyId = idOf(bProperty.body);
        const bOwner = yield call('company B owner', 'POST', '/api/property-owners', companyB.token, {
            email: `phase4b1.b.owner.${STAMP}@phase4b1.test`, password: PASSWORD, firstName: 'CompanyB', lastName: 'Owner', phone: '0772000004',
        });
        const bOwnerId = idOf(bOwner.body);
        const bTenant = yield call('company B tenant', 'POST', '/api/tenants', companyB.token, {
            firstName: 'CompanyB', lastName: 'Tenant', email: `phase4b1.b.tenant.${STAMP}@phase4b1.test`, phone: '0772000005',
        });
        const bTenantId = idOf(bTenant.body);
        let bLeaseId;
        if (bPropertyId && bTenantId) {
            const bLease = yield call('company B lease', 'POST', '/api/leases', companyB.token, {
                propertyId: bPropertyId, tenantId: bTenantId, startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: 50, depositAmount: 0,
            });
            bLeaseId = idOf(bLease.body) ? String(idOf(bLease.body)) : undefined;
        }
        const bApp = bPropertyId ? yield tenantFacing_1.RentalApplication.create({
            tenantUserId: companyB.userId, propertyId: bPropertyId, companyId: companyB.companyId, status: 'SUBMITTED', snapshot: { label: 'PHASE4B1' }, statusHistory: [{ status: 'SUBMITTED', at: new Date() }],
        }) : null;
        const bViewing = bPropertyId ? yield tenantFacing_1.ViewingRequest.create({
            tenantUserId: companyB.userId, propertyId: bPropertyId, companyId: companyB.companyId, requestedDate: new Date(), status: 'REQUESTED',
        }) : null;
        const bLevy = bPropertyId ? yield call('company B levy', 'POST', '/api/levy-payments', companyB.token, {
            propertyId: bPropertyId, paymentDate: '2026-10-11', paymentMethod: 'cash', amount: 5, currency: 'USD',
        }) : null;
        const bLevyId = bLevy ? idOf(bLevy.body) : undefined;
        const matrix = [];
        function probe(entry) {
            return __awaiter(this, void 0, void 0, function* () {
                const before = entry.mutationCheck ? yield entry.mutationCheck() : undefined;
                const result = yield request(entry.method, entry.endpoint, entry.token, entry.body);
                const after = entry.mutationCheck ? yield entry.mutationCheck() : undefined;
                const text = typeof result.body === 'string' ? result.text : JSON.stringify(result.body || '');
                const leaked = Boolean(bPropertyId && text.includes(bPropertyId) && entry.target === 'B' && entry.caller.startsWith('A'));
                matrix.push({
                    endpoint: entry.endpoint.split('?')[0],
                    method: entry.method,
                    caller: entry.caller,
                    target: entry.target,
                    status: result.status,
                    dataExposed: leaked,
                    mutation: before === undefined ? false : before !== after,
                });
            });
        }
        const bPayCount = () => __awaiter(this, void 0, void 0, function* () { return Payment_1.Payment.countDocuments({ companyId: companyB.companyId }); });
        if (bPropertyId) {
            yield probe({ endpoint: `/api/properties/${bPropertyId}`, method: 'GET', caller: 'A admin', target: 'B', token: testCo.token });
            yield probe({ endpoint: `/api/properties/${propertyId}`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
            yield probe({ endpoint: `/api/properties/${bPropertyId}`, method: 'GET', caller: 'B admin', target: 'B', token: companyB.token });
        }
        if (bOwnerId)
            yield probe({ endpoint: `/api/property-owners/${bOwnerId}`, method: 'GET', caller: 'A admin', target: 'B', token: testCo.token });
        if (ownerId)
            yield probe({ endpoint: `/api/property-owners/${ownerId}`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
        if (bApp) {
            yield probe({ endpoint: `/api/ecosystem/agency/applications/${bApp._id}/status`, method: 'POST', caller: 'A agent', target: 'B', token: agent.token, body: { status: 'UNDER_REVIEW' } });
            yield probe({ endpoint: '/api/ecosystem/agency/applications', method: 'GET', caller: 'A admin', target: 'A list', token: testCo.token });
        }
        if (bLeaseId)
            yield probe({ endpoint: `/api/leases/${bLeaseId}`, method: 'GET', caller: 'A admin', target: 'B', token: testCo.token });
        if (leaseId)
            yield probe({ endpoint: `/api/leases/${leaseId}`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
        yield probe({
            endpoint: '/api/accountants/payments', method: 'POST', caller: 'A admin', target: 'B', token: testCo.token,
            body: { paymentType: 'rental', paymentDate: '2026-08-11', paymentMethod: 'cash', amount: 10, currency: 'USD', propertyId: bPropertyId, tenantId: bTenantId, rentalPeriodMonth: 8, rentalPeriodYear: 2026 },
            mutationCheck: bPayCount,
        });
        if (paymentId)
            yield probe({ endpoint: `/api/accountants/payments/${paymentId}`, method: 'GET', caller: 'B admin', target: 'A', token: companyB.token });
        if (paymentId)
            yield probe({ endpoint: `/api/accountants/payments/${paymentId}`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
        yield probe({ endpoint: '/api/agents/letting/maintenance-payment-requests', method: 'POST', caller: 'A agent', target: 'B', token: agent.token, body: { quoteId: String(quote._id), propertyId: bPropertyId, amount: 10 } });
        if (bLevyId) {
            yield probe({ endpoint: `/api/levy-payments/${bLevyId}/receipt`, method: 'GET', caller: 'A admin', target: 'B', token: testCo.token });
            yield probe({ endpoint: `/api/agents/letting/levies/${bLevyId}/receipt`, method: 'POST', caller: 'A agent', target: 'B', token: agent.token, body: { receiptNumber: 'CROSS' } });
        }
        if (levyId)
            yield probe({ endpoint: `/api/levy-payments/${levyId}/receipt`, method: 'GET', caller: 'A admin', target: 'A', token: testCo.token });
        yield probe({ endpoint: '/api/accountants/owner-collections', method: 'POST', caller: 'A accountant', target: 'B', token: accountant.token, body: { propertyId: bPropertyId, operationalAmount: 1 } });
        yield probe({ endpoint: '/api/accountants/owner-collections', method: 'GET', caller: 'A accountant', target: 'A', token: accountant.token });
        yield probe({ endpoint: '/api/properties', method: 'GET', caller: 'unauthenticated', target: 'any', token: null });
        yield probe({ endpoint: `/api/accountants/payments/${paymentId}`, method: 'GET', caller: 'A owner role', target: 'A', token: ownerUser.token });
        if (bPropertyId)
            yield probe({ endpoint: `/api/properties/${bPropertyId}`, method: 'GET', caller: 'A owner role', target: 'B', token: ownerUser.token });
        yield probe({ endpoint: `/api/agents/letting/properties/${bPropertyId}/workspace`, method: 'GET', caller: 'A agent', target: 'B', token: agent.token });
        yield probe({ endpoint: `/api/agents/letting/properties/${propertyId}/workspace`, method: 'GET', caller: 'A agent', target: 'A', token: agent.token });
        evidence.securityMatrix = matrix;
        evidence.viewingFixtureId = bViewing ? String(bViewing._id) : null;
        save();
        const collection = yield call('owner collection', 'POST', '/api/accountants/owner-collections', accountant.token, { propertyId });
        evidence.ownerCollection = { status: collection.status, body: redact(collection.body) };
        const workspace = yield call('workspace', 'GET', `/api/agents/letting/properties/${propertyId}/workspace`, agent.token);
        const assessment = yield call('assessment', 'POST', '/api/agents/letting/assessments', agent.token, { propertyId, recommendedRent: 1000, condition: 'good' });
        const assessmentId = (_4 = (_3 = assessment.body) === null || _3 === void 0 ? void 0 : _3.data) === null || _4 === void 0 ? void 0 : _4._id;
        const submitted = assessmentId ? yield call('submit assessment', 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, agent.token, { status: 'ASSESSMENT_SUBMITTED' }) : null;
        const juniorDecision = assessmentId ? yield call('junior owner decision denied', 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, junior.token, { status: 'OWNER_APPROVED', approvedRent: 1000 }) : null;
        const approved = assessmentId ? yield call('senior owner decision', 'POST', `/api/agents/letting/assessments/${assessmentId}/status`, agent.token, { status: 'OWNER_APPROVED', approvedRent: 1000 }) : null;
        const mandate = yield call('mandate', 'POST', '/api/agents/letting/mandates', agent.token, { propertyId });
        const mandateId = (_6 = (_5 = mandate.body) === null || _5 === void 0 ? void 0 : _5.data) === null || _6 === void 0 ? void 0 : _6._id;
        const listingBlocked = yield call('listing before mandate', 'POST', '/api/agents/letting/listings', agent.token, { propertyId, platform: 'PHASE4B1 board', status: 'ACTIVE' });
        evidence.agencyApi = {
            workspace: workspace.status,
            assessment: assessment.status,
            submitted: submitted === null || submitted === void 0 ? void 0 : submitted.status,
            juniorDenied: juniorDecision === null || juniorDecision === void 0 ? void 0 : juniorDecision.status,
            approved: approved === null || approved === void 0 ? void 0 : approved.status,
            mandate: mandate.status,
            mandateId,
            listingBlocked: listingBlocked.status,
        };
        const sentinelNow = evidence.historicalSentinel
            ? yield Payment_1.Payment.findById(evidence.historicalSentinel.id).select('status amount accountingComplete updatedAt').lean()
            : null;
        evidence.historicalAfter = sentinelNow ? {
            id: String(sentinelNow._id),
            status: sentinelNow.status,
            amount: sentinelNow.amount,
            accountingComplete: sentinelNow.accountingComplete,
            updatedAt: sentinelNow.updatedAt,
            unchanged: sentinelNow.status === evidence.historicalSentinel.status
                && Number(sentinelNow.amount) === Number(evidence.historicalSentinel.amount)
                && sentinelNow.accountingComplete === evidence.historicalSentinel.accountingComplete,
        } : null;
        evidence.paymentCountAfter = yield Payment_1.Payment.countDocuments({});
        evidence.finishedAt = new Date().toISOString();
        evidence.cleanup = 'Retained. Journal entries are immutable, so disposable PHASE4B1 companies were not deleted.';
        save();
        console.log(JSON.stringify({
            out: OUT,
            paymentId: (_7 = evidence.borrowdale) === null || _7 === void 0 ? void 0 : _7.paymentId,
            accountingComplete: (_9 = (_8 = evidence.borrowdale) === null || _8 === void 0 ? void 0 : _8.persisted) === null || _9 === void 0 ? void 0 : _9.accountingComplete,
            ownerPayable: (_11 = (_10 = evidence.borrowdale) === null || _10 === void 0 ? void 0 : _10.persisted) === null || _11 === void 0 ? void 0 : _11.ownerPayable,
            waterfall: (_13 = (_12 = evidence.borrowdale) === null || _12 === void 0 ? void 0 : _12.persisted) === null || _13 === void 0 ? void 0 : _13.waterfall,
            notice: (_14 = evidence.notification) === null || _14 === void 0 ? void 0 : _14.scenario1,
            optOut: (_15 = evidence.notification) === null || _15 === void 0 ? void 0 : _15.scenario3,
            incomplete: (_16 = evidence.notification) === null || _16 === void 0 ? void 0 : _16.scenario4,
            mail: (_17 = evidence.notification) === null || _17 === void 0 ? void 0 : _17.scenario5,
            securityCases: matrix.length,
        }));
        yield mongoose_1.default.disconnect();
        process.exit(0);
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    evidence.fatal = String((error === null || error === void 0 ? void 0 : error.stack) || error);
    save();
    console.error(evidence.fatal);
    try {
        yield mongoose_1.default.disconnect();
    }
    catch ( /* ignore */_a) { /* ignore */ }
    process.exit(1);
}));
