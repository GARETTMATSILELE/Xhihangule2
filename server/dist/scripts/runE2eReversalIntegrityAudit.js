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
/**
 * Disposable-local end-to-end reversal integrity audit.
 * Refuses any database that is not a uniquely named local mantis_e2e_reversal_audit_* database.
 * Email and payment-provider calls are blocked. This file is an audit harness, not a production change.
 */
const RUN_ID = Date.now().toString(36);
const MAIN_DB = `mantis_e2e_reversal_audit_${RUN_ID}`;
const ACCT_DB = `mantis_e2e_reversal_audit_acct_${RUN_ID}`;
const MAIN_URI = `mongodb://127.0.0.1:27017/${MAIN_DB}`;
const ACCT_URI = `mongodb://127.0.0.1:27017/${ACCT_DB}`;
const MARKER = `E2E-REVERSAL-AUDIT-${RUN_ID}`;
const PAYMENT_DATE = '2026-10-15';
const PERIOD = { month: 10, year: 2026 };
process.env.NODE_ENV = 'development';
process.env.MANTIS_TEST_SEAM = '1';
process.env.ACCOUNTING_DASHBOARD_CACHE_TTL_MS = '0';
process.env.MONGODB_URI = MAIN_URI;
process.env.ACCOUNTING_DB_URI = ACCT_URI;
process.env.MONGODB_URI_PROPERTY = MAIN_URI;
process.env.MONGODB_URI_ACCOUNTING = ACCT_URI;
delete process.env.ACCOUNTING_PERIOD_LOCK_BEFORE;
delete process.env.AZURE_COSMOS_CONNECTIONSTRING;
delete process.env.CUSTOMCONNSTR_MONGODB_URI;
delete process.env.CUSTOMCONNSTR_MONGODB_URI_PROPERTY;
delete process.env.CUSTOMCONNSTR_ACCOUNTING_DB_URI;
delete process.env.CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING;
delete process.env.FORCE_DB_URI;
const BLOCKED_ENV = [
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
    'SMTP_HOST_MANTIS', 'SMTP_PORT_MANTIS', 'SMTP_USER_MANTIS', 'SMTP_PASS_MANTIS', 'SMTP_FROM_MANTIS',
    'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
    'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
    'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS', 'MAILTRAP_FROM_EMAIL', 'MAILTRAP_FROM_EMAIL_MANTIS',
    'PAYNOW_INTEGRATION_ID', 'PAYNOW_INTEGRATION_KEY', 'PAYNOW_RESULT_URL', 'PAYNOW_RETURN_URL', 'PAYNOW_MODE',
    'EMAIL_STRICT', 'EMAIL_REQUIRE_PROVIDER'
];
for (const key of BLOCKED_ENV)
    process.env[key] = '';
const results = [];
const capturedMail = [];
const blockedExternal = [];
let mailShouldFail = false;
function record(row) {
    results.push(row);
    console.error(`[${row.status}] ${row.name}`);
}
function assertDisposable(uri, expectedName) {
    const parsed = new URL(uri);
    const host = parsed.hostname.toLowerCase();
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost') {
        throw new Error(`Refusing audit: host is not local (${host})`);
    }
    if (name !== expectedName || !/^mantis_e2e_reversal_audit(_acct)?_[a-z0-9]+$/.test(name)) {
        throw new Error(`Refusing audit: database ${name} is not the disposable run database`);
    }
    if (/prod|cosmos|azure|live|property-management|^accounting$/.test(name)) {
        throw new Error(`Refusing audit: database name is not disposable (${name})`);
    }
}
function near(actual, expected, tolerance = 0.02) {
    return Math.abs(Number(actual || 0) - Number(expected || 0)) <= tolerance;
}
function money(value) {
    return Number(Number(value || 0).toFixed(2));
}
function invoke(handler, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = {
            statusCode: 200,
            body: undefined,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
        };
        yield handler(req, res);
        return res;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31;
        assertDisposable(MAIN_URI, MAIN_DB);
        assertDisposable(ACCT_URI, ACCT_DB);
        const mongoose = (yield Promise.resolve().then(() => __importStar(require('mongoose')))).default;
        const emailService = yield Promise.resolve().then(() => __importStar(require('../services/emailService')));
        const sendTarget = emailService.sendMail ? emailService : emailService.default;
        sendTarget.sendMail = (params) => __awaiter(this, void 0, void 0, function* () {
            capturedMail.push({ to: params.to, subject: params.subject, text: params.text });
            if (mailShouldFail) {
                mailShouldFail = false;
                throw new Error('AUDIT_INJECTED_MAIL_FAILURE');
            }
        });
        const originalFetch = (_a = globalThis.fetch) === null || _a === void 0 ? void 0 : _a.bind(globalThis);
        globalThis.fetch = ((input, init) => __awaiter(this, void 0, void 0, function* () {
            const raw = typeof input === 'string' ? input : input === null || input === void 0 ? void 0 : input.url;
            const host = new URL(String(raw)).hostname.toLowerCase();
            if (host !== '127.0.0.1' && host !== 'localhost') {
                blockedExternal.push(host);
                throw new Error(`Blocked external request to ${host}`);
            }
            if (!originalFetch)
                throw new Error('No local fetch implementation');
            return originalFetch(input, init);
        }));
        const emailStatus = sendTarget.getEmailConfigStatus();
        if (emailStatus.anyProviderConfigured || emailStatus.smtpConfigured) {
            throw new Error('Refusing audit: an email provider is still configured');
        }
        if (String(process.env.PAYNOW_INTEGRATION_ID || '').trim() || String(process.env.PAYNOW_INTEGRATION_KEY || '').trim()) {
            throw new Error('Refusing audit: Paynow credentials are still configured');
        }
        const { accountingConnection } = yield Promise.resolve().then(() => __importStar(require('../config/database')));
        const { Company } = yield Promise.resolve().then(() => __importStar(require('../models/Company')));
        const { User } = yield Promise.resolve().then(() => __importStar(require('../models/User')));
        const { Property } = yield Promise.resolve().then(() => __importStar(require('../models/Property')));
        const { Tenant } = yield Promise.resolve().then(() => __importStar(require('../models/Tenant')));
        const { Lease } = yield Promise.resolve().then(() => __importStar(require('../models/Lease')));
        const { Payment } = yield Promise.resolve().then(() => __importStar(require('../models/Payment')));
        const { PropertyOwner } = yield Promise.resolve().then(() => __importStar(require('../models/PropertyOwner')));
        const { OwnerRentNotice } = yield Promise.resolve().then(() => __importStar(require('../models/OwnerRentNotice')));
        const { TaxObligation } = yield Promise.resolve().then(() => __importStar(require('../models/TaxObligation')));
        const { VatRecord } = yield Promise.resolve().then(() => __importStar(require('../models/VatRecord')));
        const { JournalEntry } = yield Promise.resolve().then(() => __importStar(require('../models/JournalEntry')));
        const { JournalLine } = yield Promise.resolve().then(() => __importStar(require('../models/JournalLine')));
        const { CompanyAccount } = yield Promise.resolve().then(() => __importStar(require('../models/CompanyAccount')));
        const { AgentAccount } = yield Promise.resolve().then(() => __importStar(require('../models/AgentAccount')));
        const PropertyAccount = (yield Promise.resolve().then(() => __importStar(require('../models/PropertyAccount')))).default;
        const { createPayment, updatePaymentStatus, reversePayment } = yield Promise.resolve().then(() => __importStar(require('../controllers/paymentController')));
        const { getDashboardSummary, getVatStatus, getDashboardOutstanding } = yield Promise.resolve().then(() => __importStar(require('../controllers/accountingController')));
        const { getPropertyTransactions } = yield Promise.resolve().then(() => __importStar(require('../controllers/propertyAccountController')));
        const { CommissionService } = yield Promise.resolve().then(() => __importStar(require('../services/commissionService')));
        const { ensureSystemTaxRules } = yield Promise.resolve().then(() => __importStar(require('../services/taxRuleRegistry')));
        const { resolveCommissionVatPolicy } = yield Promise.resolve().then(() => __importStar(require('../services/vatPolicyService')));
        const { reconcilePayment } = yield Promise.resolve().then(() => __importStar(require('../services/paymentAccountingReconciliation')));
        const { prepareVatReturn } = yield Promise.resolve().then(() => __importStar(require('../services/vatReturnService')));
        const { sumRentalPeriodReservation, sumRentCoverageForPeriod } = yield Promise.resolve().then(() => __importStar(require('../services/rentalPeriodCoverage')));
        const { createPaymentAccountant, createPaymentPublic } = yield Promise.resolve().then(() => __importStar(require('../controllers/paymentController')));
        const { createAgentPayment } = yield Promise.resolve().then(() => __importStar(require('../controllers/agentController')));
        const { evaluatePermanentAccountingPolicy, completedPaymentRequiresFinalizedCommission } = yield Promise.resolve().then(() => __importStar(require('../services/accountingPostingPolicy')));
        const { buildExpectedAccountingProjection } = yield Promise.resolve().then(() => __importStar(require('../services/paymentAccountingProjection')));
        const accountingService = (yield Promise.resolve().then(() => __importStar(require('../services/accountingService')))).default;
        yield mongoose.connect(MAIN_URI, { serverSelectionTimeoutMS: 8000, autoIndex: false });
        yield accountingConnection.openUri(ACCT_URI, { serverSelectionTimeoutMS: 8000 });
        const mainName = String(mongoose.connection.name || '');
        const acctName = String(accountingConnection.name || '');
        const mainHost = String(mongoose.connection.host || '');
        if (mainName !== MAIN_DB || acctName !== ACCT_DB || (mainHost !== '127.0.0.1' && mainHost !== 'localhost')) {
            throw new Error(`Refusing audit after connect: main=${mainHost}/${mainName} accounting=${acctName}`);
        }
        yield mongoose.connection.dropDatabase();
        yield accountingConnection.dropDatabase();
        yield ensureSystemTaxRules();
        yield Promise.all([
            JournalEntry.syncIndexes(),
            JournalLine.syncIndexes(),
            TaxObligation.syncIndexes(),
            VatRecord.syncIndexes(),
            Payment.syncIndexes(),
            OwnerRentNotice.syncIndexes(),
        ]);
        const accountant = yield User.create({
            email: `e2e-accountant-${RUN_ID}@example.test`,
            password: 'test-pass-1',
            firstName: 'Audit',
            lastName: 'Accountant',
            role: 'accountant',
            roles: ['accountant'],
            isActive: true,
            sessionVersion: 1,
        });
        const agent = yield User.create({
            email: `e2e-agent-${RUN_ID}@example.test`,
            password: 'test-pass-1',
            firstName: 'Audit',
            lastName: 'Agent',
            role: 'agent',
            roles: ['agent'],
            isActive: true,
            sessionVersion: 1,
        });
        const company = yield Company.create({
            name: `E2E Reversal Audit ${RUN_ID}`,
            address: '1 Audit Lane',
            phone: '0770000001',
            email: `e2e-company-${RUN_ID}@example.test`,
            registrationNumber: `E2E-${RUN_ID}`,
            tinNumber: `E2E-TIN-${RUN_ID}`,
            country: 'Zimbabwe',
            ownerId: accountant._id,
            workspaceType: 'agency',
            taxProfile: {
                vatRegistered: true,
                vatNumber: `ZW-E2E-${RUN_ID}`,
                vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z'),
            },
            commissionConfig: {
                preaPercentOfTotal: 0.03,
                agentPercentOfRemaining: 0.6,
                agencyPercentOfRemaining: 0.4,
            },
        });
        accountant.companyId = company._id;
        agent.companyId = company._id;
        yield accountant.save();
        yield agent.save();
        const property = yield Property.create({
            companyId: company._id,
            ownerId: accountant._id,
            agentId: agent._id,
            name: `E2E House ${RUN_ID}`,
            address: `1 ${MARKER} Road`,
            rentalType: 'management',
            rent: 1800,
            commission: 15,
            vatOnCommission: true,
            vatCommissionTreatment: 'exclusive',
        });
        const tenant = yield Tenant.create({
            firstName: 'Audit',
            lastName: 'Tenant',
            email: `e2e-tenant-${RUN_ID}@example.test`,
            phone: '0770000002',
            companyId: company._id,
            ownerId: accountant._id,
            status: 'Active',
        });
        const lease = yield Lease.create({
            propertyId: property._id,
            tenantId: tenant._id,
            companyId: company._id,
            ownerId: accountant._id,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2027-12-31T00:00:00.000Z'),
            rentAmount: 1800,
            depositAmount: 0,
            status: 'active',
        });
        yield PropertyOwner.create({
            email: `e2e-owner-${RUN_ID}@example.test`,
            password: 'test-pass-1',
            firstName: 'Audit',
            lastName: 'Owner',
            phone: '0770000003',
            companyId: company._id,
            properties: [property._id],
            active: true,
        });
        const actor = {
            userId: String(accountant._id),
            companyId: String(company._id),
            role: 'accountant',
            roles: ['accountant'],
        };
        const paymentDate = new Date(`${PAYMENT_DATE}T10:00:00.000Z`);
        const storedProperty = yield Property.findById(property._id).lean();
        const policy = yield resolveCommissionVatPolicy({
            companyId: String(company._id),
            paymentDate,
            property: storedProperty,
            requestedVatOnCommission: true,
            requestedTreatment: 'exclusive',
            commissionType: 'management',
        });
        const expectedCalc = yield CommissionService.calculateForProperty({
            companyId: company._id,
            grossRent: 1800,
            levy: 0,
            commissionPercentage: Number(storedProperty.commission || 0),
            vatOnCommission: policy.apply,
            vatTreatment: policy.treatment === 'COMMISSION_VAT_INCLUSIVE' ? 'inclusive' : 'exclusive',
            vatRate: policy.vatRate,
            paymentDate,
            commissionType: 'management',
        });
        const expected = {
            grossRent: money(expectedCalc.grossRent),
            commission: money(expectedCalc.commissionNet),
            vat: money(expectedCalc.vatAmount),
            ownerPayable: money(expectedCalc.ownerAmount),
            agentCommission: money(expectedCalc.agentShare),
            companyIncome: money(expectedCalc.agencyShare),
            preaFee: money(expectedCalc.preaFee),
            vatRate: Number(policy.vatRate || 0),
            treatment: policy.treatment,
            vatReason: policy.reason,
        };
        console.error(`WATERFALL ${JSON.stringify(expected)}`);
        const periodQuery = () => ({
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            rentalPeriodYear: PERIOD.year,
            rentalPeriodMonth: PERIOD.month,
            leaseId: lease._id,
            currency: 'USD',
        });
        function coverage() {
            return __awaiter(this, arguments, void 0, function* (month = PERIOD.month, year = PERIOD.year, currency = 'USD', leaseId = lease._id) {
                return sumRentCoverageForPeriod({
                    companyId: company._id,
                    propertyId: property._id,
                    tenantId: tenant._id,
                    rentalPeriodYear: year,
                    rentalPeriodMonth: month,
                    leaseId,
                    currency,
                });
            });
        }
        function snapshot(label) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d, _e, _f;
                const lines = yield JournalLine.find({ companyId: company._id }).select('debit credit').lean();
                const debit = money(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
                const credit = money(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
                const propertyAccount = yield PropertyAccount.findOne({ propertyId: property._id, ledgerType: 'rental' }).lean();
                const companyAccount = yield CompanyAccount.findOne({ companyId: company._id }).lean();
                const agentAccount = yield AgentAccount.findOne({ agentId: agent._id }).lean();
                const obligations = yield TaxObligation.find({ companyId: company._id }).lean();
                const activeTax = obligations.filter((row) => String(row.status) !== 'REVERSED');
                const vatLiability = money(activeTax.filter((row) => row.taxType === 'VAT_ON_COMMISSION').reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
                const taxObligations = money(activeTax.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
                const passThrough = ((propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.passThroughAccounts) || []).reduce((sum, row) => sum + Number(row.runningBalance || 0), 0);
                const trustJournals = yield JournalEntry.countDocuments({ companyId: company._id, sourceModule: 'trust' });
                const dash = yield invoke(getDashboardSummary, { user: actor, query: {} });
                const outstanding = yield invoke(getDashboardOutstanding, { user: actor, query: {} });
                const vatStatus = yield invoke(getVatStatus, { user: actor, query: { filingPeriod: '2026-10' } });
                const statement = yield invoke(getPropertyTransactions, { user: actor, params: { propertyId: String(property._id) }, query: { includePayouts: 'true' } });
                return {
                    label,
                    validRentCoverage: money(yield coverage()),
                    ownerIncome: money(propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.runningBalance),
                    agentCommission: money(agentAccount === null || agentAccount === void 0 ? void 0 : agentAccount.runningBalance),
                    companyIncome: money(companyAccount === null || companyAccount === void 0 ? void 0 : companyAccount.runningBalance),
                    companyTotalIncome: money(companyAccount === null || companyAccount === void 0 ? void 0 : companyAccount.totalIncome),
                    vatLiability,
                    taxObligations,
                    trustBalance: trustJournals === 0 ? null : trustJournals,
                    passThroughBalance: ((_a = propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.passThroughAccounts) === null || _a === void 0 ? void 0 : _a.length) ? money(passThrough) : null,
                    levyBalance: null,
                    propertyAccountBalance: money(propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.runningBalance),
                    companyAccountBalance: money(companyAccount === null || companyAccount === void 0 ? void 0 : companyAccount.runningBalance),
                    journalDebit: debit,
                    journalCredit: credit,
                    journalDifference: money(debit - credit),
                    dashboardRevenue: money((_b = dash.body) === null || _b === void 0 ? void 0 : _b.totalRevenue),
                    dashboardVat: money((_c = dash.body) === null || _c === void 0 ? void 0 : _c.vatPayable),
                    outstandingRentals: money((_d = outstanding.body) === null || _d === void 0 ? void 0 : _d.outstandingRentals),
                    statementCount: Array.isArray((_e = statement.body) === null || _e === void 0 ? void 0 : _e.data) ? statement.body.data.length : -1,
                    statementBalance: money(propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.netOwnerBalance),
                    vatStatus: ((_f = vatStatus.body) === null || _f === void 0 ? void 0 : _f.data) || [],
                    obligationCount: obligations.length,
                    activeObligationCount: activeTax.length,
                };
            });
        }
        function settleMail() {
            return __awaiter(this, void 0, void 0, function* () {
                yield new Promise((resolve) => setTimeout(resolve, 400));
            });
        }
        function paymentRequest(month, year, amount = 1800, currency = 'USD', status = 'pending') {
            return {
                user: actor,
                headers: {},
                params: {},
                body: {
                    leaseId: String(lease._id),
                    amount,
                    paymentDate: year === 2026 && month === 10 ? PAYMENT_DATE : `${year}-${String(month).padStart(2, '0')}-15`,
                    paymentMethod: 'bank_transfer',
                    status,
                    rentalPeriodMonth: month,
                    rentalPeriodYear: year,
                    currency,
                    idempotencyKey: `${MARKER}:${month}:${year}:${currency}:${amount}:${new mongoose.Types.ObjectId().toString()}`,
                },
            };
        }
        function createAndComplete(month_1, year_1) {
            return __awaiter(this, arguments, void 0, function* (month, year, note = '') {
                var _a, _b;
                const created = yield invoke(createPayment, paymentRequest(month, year));
                const id = String(((_b = (_a = created.body) === null || _a === void 0 ? void 0 : _a.payment) === null || _b === void 0 ? void 0 : _b._id) || '');
                if (created.statusCode !== 201 || !id) {
                    return { created, completed: null, id };
                }
                if (note)
                    yield Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} ${note}` } });
                const completed = yield invoke(updatePaymentStatus, {
                    user: actor,
                    params: { id },
                    body: { status: 'completed', reason: `${MARKER} complete` },
                });
                yield settleMail();
                return { created, completed, id };
            });
        }
        const before = yield snapshot('before');
        record({
            name: 'environment is a disposable local standalone MongoDB',
            status: 'PASS',
            expected: '127.0.0.1 disposable databases, no replica set, no Cosmos claim',
            actual: `main=${mainHost}/${mainName}; accounting=${acctName}; replicaSet=none`,
        });
        const created = yield invoke(createPayment, paymentRequest(PERIOD.month, PERIOD.year));
        const originalId = String(((_c = (_b = created.body) === null || _b === void 0 ? void 0 : _b.payment) === null || _c === void 0 ? void 0 : _c._id) || '');
        record({
            name: 'create the demo rental through createPayment',
            status: created.statusCode === 201 && originalId ? 'PASS' : 'FAIL',
            expected: 'HTTP 201 pending rental receipt',
            actual: `HTTP ${created.statusCode} ${((_d = created.body) === null || _d === void 0 ? void 0 : _d.message) || ''} accountingComplete=${(_e = created.body) === null || _e === void 0 ? void 0 : _e.accountingComplete}`,
            ids: { paymentId: originalId },
        });
        if (!originalId)
            throw new Error('Demo payment was not created');
        yield Payment.updateOne({ _id: originalId }, { $set: { notes: MARKER } });
        const pending = yield Payment.findById(originalId).lean();
        const pendingCoverage = yield coverage();
        record({
            name: 'pending non-correction receipt occupies the period and does not post accounting',
            status: (pending === null || pending === void 0 ? void 0 : pending.status) === 'pending' && (pending === null || pending === void 0 ? void 0 : pending.accountingComplete) !== true && pendingCoverage === 1800 ? 'PASS' : 'FAIL',
            expected: 'status pending, accounting not complete, coverage 1800',
            actual: `status=${pending === null || pending === void 0 ? void 0 : pending.status} accountingComplete=${pending === null || pending === void 0 ? void 0 : pending.accountingComplete} coverage=${pendingCoverage}`,
            ids: { paymentId: originalId },
        });
        const completed = yield invoke(updatePaymentStatus, {
            user: actor,
            params: { id: originalId },
            body: { status: 'completed', reason: `${MARKER} complete original` },
        });
        yield settleMail();
        const posted = yield Payment.findById(originalId).lean();
        const postedRecon = yield reconcilePayment(originalId);
        record({
            name: 'complete the original payment through updatePaymentStatus',
            status: completed.statusCode === 200 && (posted === null || posted === void 0 ? void 0 : posted.status) === 'completed' && (posted === null || posted === void 0 ? void 0 : posted.accountingComplete) === true ? 'PASS' : 'FAIL',
            expected: 'completed and accountingComplete',
            actual: `HTTP ${completed.statusCode} status=${posted === null || posted === void 0 ? void 0 : posted.status} posting=${posted === null || posted === void 0 ? void 0 : posted.postingStatus} accounting=${posted === null || posted === void 0 ? void 0 : posted.accountingComplete} recon=${postedRecon.status} missing=${(postedRecon.missing || []).join(',')}`,
            ids: { paymentId: originalId, reference: String((posted === null || posted === void 0 ? void 0 : posted.referenceNumber) || '') },
            persisted: ['payments', 'journalentries', 'taxobligations', 'vatrecords', 'propertyaccounts', 'companyaccounts', 'agentaccounts'],
        });
        if ((posted === null || posted === void 0 ? void 0 : posted.accountingComplete) !== true) {
            record({
                name: 'reversal and replacement',
                status: 'UNVERIFIED',
                expected: 'reversal only after accounting settlement',
                actual: 'Stopped because the original payment did not reach accountingComplete',
            });
            throw new Error('Original payment did not settle');
        }
        const originalSnapshot = {
            amount: money(posted === null || posted === void 0 ? void 0 : posted.amount),
            currency: String((posted === null || posted === void 0 ? void 0 : posted.currency) || ''),
            commission: JSON.parse(JSON.stringify((posted === null || posted === void 0 ? void 0 : posted.commissionDetails) || {})),
            vatRate: posted === null || posted === void 0 ? void 0 : posted.vatOnCommissionRate,
            ownerAmount: money((_f = posted === null || posted === void 0 ? void 0 : posted.commissionDetails) === null || _f === void 0 ? void 0 : _f.ownerAmount),
            vatAmount: money((_h = (_g = posted === null || posted === void 0 ? void 0 : posted.commissionDetails) === null || _g === void 0 ? void 0 : _g.vatAmount) !== null && _h !== void 0 ? _h : (_j = posted === null || posted === void 0 ? void 0 : posted.commissionDetails) === null || _j === void 0 ? void 0 : _j.vatOnCommission),
        };
        const afterOriginal = yield snapshot('after-original');
        const originalJournal = yield JournalEntry.findOne({ companyId: company._id, sourceModule: 'payment', sourceId: originalId }).lean();
        const originalLines = originalJournal
            ? yield JournalLine.find({ journalEntryId: originalJournal._id }).lean()
            : [];
        const duplicateWhileCovered = yield invoke(createPayment, paymentRequest(PERIOD.month, PERIOD.year));
        record({
            name: 'duplicate receipt is blocked while the original covers the period',
            status: duplicateWhileCovered.statusCode === 409 ? 'PASS' : 'FAIL',
            expected: 'HTTP 409',
            actual: `HTTP ${duplicateWhileCovered.statusCode} ${((_k = duplicateWhileCovered.body) === null || _k === void 0 ? void 0 : _k.message) || ''}`,
        });
        record({
            name: 'original waterfall matches the stored commission snapshot',
            status: near(originalSnapshot.amount, expected.grossRent)
                && near(originalSnapshot.commission.commissionNet, expected.commission)
                && near(originalSnapshot.vatAmount, expected.vat)
                && near(originalSnapshot.ownerAmount, expected.ownerPayable)
                && near(originalSnapshot.commission.agentShare, expected.agentCommission)
                && near(originalSnapshot.commission.agencyShare, expected.companyIncome)
                ? 'PASS' : 'FAIL',
            expected: JSON.stringify(expected),
            actual: JSON.stringify(originalSnapshot),
            ids: { paymentId: originalId },
        });
        const vatReturnAfterOriginal = yield prepareVatReturn(String(company._id), '2026-10', String(accountant._id));
        record({
            name: 'VAT return after the original receipt uses the active obligation',
            status: near(Number(vatReturnAfterOriginal.vatOnCommission || 0), expected.vat)
                && near(Number(vatReturnAfterOriginal.taxableSupplies || 0), expected.commission)
                && near(Number(vatReturnAfterOriginal.glOutputVat || 0), expected.vat)
                && vatReturnAfterOriginal.reconciliationStatus === 'MATCHED'
                ? 'PASS' : 'FAIL',
            expected: `taxable supplies ${expected.commission}, VAT ${expected.vat}, GL net ${expected.vat}, MATCHED`,
            actual: `vatOnCommission=${vatReturnAfterOriginal.vatOnCommission} outputVat=${vatReturnAfterOriginal.outputVat} glOutputVat=${vatReturnAfterOriginal.glOutputVat} difference=${vatReturnAfterOriginal.reconciliationDifference} taxableSupplies=${vatReturnAfterOriginal.taxableSupplies} status=${vatReturnAfterOriginal.reconciliationStatus}`,
        });
        const reversal = yield invoke(reversePayment, {
            user: actor,
            params: { id: originalId },
            body: { reason: `${MARKER} wrong allocation` },
        });
        yield settleMail();
        const reversedOriginal = yield Payment.findById(originalId).lean();
        const reversalId = String((reversedOriginal === null || reversedOriginal === void 0 ? void 0 : reversedOriginal.reversalPaymentId) || ((_m = (_l = reversal.body) === null || _l === void 0 ? void 0 : _l.reversalPayment) === null || _m === void 0 ? void 0 : _m._id) || '');
        const reversalDoc = reversalId ? yield Payment.findById(reversalId).lean() : null;
        const correctionId = String((reversedOriginal === null || reversedOriginal === void 0 ? void 0 : reversedOriginal.correctedPaymentId) || ((_p = (_o = reversal.body) === null || _o === void 0 ? void 0 : _o.correctedPayment) === null || _p === void 0 ? void 0 : _p._id) || '');
        const correction = correctionId ? yield Payment.findById(correctionId).lean() : null;
        const reversalCount = yield Payment.countDocuments({ companyId: company._id, reversalOfPaymentId: originalId, amount: { $lt: 0 } });
        record({
            name: 'reverse the original through reversePayment',
            status: reversal.statusCode === 200
                && String((reversedOriginal === null || reversedOriginal === void 0 ? void 0 : reversedOriginal.reversalState) || '') === 'reversed'
                && reversalCount === 1
                && reversalDoc
                && correction
                ? 'PASS' : 'FAIL',
            expected: 'HTTP 200, reversalState reversed, one negative reversal, one correction draft',
            actual: `HTTP ${reversal.statusCode} outcome=${(_q = reversal.body) === null || _q === void 0 ? void 0 : _q.outcome} state=${reversedOriginal === null || reversedOriginal === void 0 ? void 0 : reversedOriginal.reversalState} reversals=${reversalCount} warnings=${JSON.stringify(((_r = reversal.body) === null || _r === void 0 ? void 0 : _r.warnings) || [])}`,
            ids: { paymentId: originalId, reversalId, correctionId },
        });
        const originalAfterReverse = yield Payment.findById(originalId).lean();
        const snapshotUnchanged = money(originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.amount) === originalSnapshot.amount
            && money((_s = originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.commissionDetails) === null || _s === void 0 ? void 0 : _s.ownerAmount) === originalSnapshot.ownerAmount
            && money((_u = (_t = originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.commissionDetails) === null || _t === void 0 ? void 0 : _t.vatAmount) !== null && _u !== void 0 ? _u : (_v = originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.commissionDetails) === null || _v === void 0 ? void 0 : _v.vatOnCommission) === originalSnapshot.vatAmount
            && money((_w = originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.commissionDetails) === null || _w === void 0 ? void 0 : _w.agentShare) === money(originalSnapshot.commission.agentShare)
            && String((originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.status) || '') === 'completed';
        record({
            name: 'original amount and financial snapshot stay unchanged',
            status: snapshotUnchanged ? 'PASS' : 'FAIL',
            expected: `amount ${originalSnapshot.amount}, owner ${originalSnapshot.ownerAmount}, VAT ${originalSnapshot.vatAmount}, status completed`,
            actual: `amount=${originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.amount} owner=${(_x = originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.commissionDetails) === null || _x === void 0 ? void 0 : _x.ownerAmount} vat=${(_y = originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.commissionDetails) === null || _y === void 0 ? void 0 : _y.vatAmount} agent=${(_z = originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.commissionDetails) === null || _z === void 0 ? void 0 : _z.agentShare} status=${originalAfterReverse === null || originalAfterReverse === void 0 ? void 0 : originalAfterReverse.status}`,
        });
        const reversalJournal = yield JournalEntry.findOne({ companyId: company._id, sourceModule: 'payment', sourceId: `${originalId}:reversal` }).lean();
        const reversalLines = reversalJournal ? yield JournalLine.find({ journalEntryId: reversalJournal._id }).lean() : [];
        const originalPaired = originalLines.map((line) => `${line.accountId}:${money(line.debit)}:${money(line.credit)}`).sort().join('|');
        const reversalPaired = reversalLines.map((line) => `${line.accountId}:${money(line.credit)}:${money(line.debit)}`).sort().join('|');
        record({
            name: 'payment journal reversal swaps the original posted lines',
            status: originalLines.length > 0 && originalPaired === reversalPaired ? 'PASS' : 'FAIL',
            expected: 'reversal debits and credits swap the stored original lines',
            actual: `originalLines=${originalLines.length} reversalLines=${reversalLines.length} match=${originalPaired === reversalPaired}`,
            ids: { originalJournalId: String((originalJournal === null || originalJournal === void 0 ? void 0 : originalJournal._id) || ''), reversalJournalId: String((reversalJournal === null || reversalJournal === void 0 ? void 0 : reversalJournal._id) || '') },
        });
        const retry = yield invoke(reversePayment, {
            user: actor,
            params: { id: originalId },
            body: { reason: `${MARKER} retry` },
        });
        const reversalCountAfterRetry = yield Payment.countDocuments({ companyId: company._id, reversalOfPaymentId: originalId, amount: { $lt: 0 } });
        const correctionCount = yield Payment.countDocuments({ companyId: company._id, referenceNumber: `CORR-${posted === null || posted === void 0 ? void 0 : posted.referenceNumber}`, isCorrectionEntry: true, reversalOfPaymentId: { $exists: false } });
        const reversalJournalCount = yield JournalEntry.countDocuments({ companyId: company._id, sourceModule: 'payment', sourceId: `${originalId}:reversal` });
        record({
            name: 'retrying a settled reversal does not create another reversal, draft, or journal',
            status: retry.statusCode === 200
                && ((_0 = retry.body) === null || _0 === void 0 ? void 0 : _0.alreadyReversed) !== false
                && reversalCountAfterRetry === 1
                && correctionCount === 1
                && reversalJournalCount === 1
                ? 'PASS' : 'FAIL',
            expected: 'one reversal, one draft, one reversal journal',
            actual: `HTTP ${retry.statusCode} outcome=${(_1 = retry.body) === null || _1 === void 0 ? void 0 : _1.outcome} reversals=${reversalCountAfterRetry} drafts=${correctionCount} journals=${reversalJournalCount}`,
        });
        const afterReversal = yield snapshot('after-reversal');
        const coverageAfterReversal = yield coverage();
        const reservationAfterReversal = yield sumRentalPeriodReservation(periodQuery());
        const vatReturnAfterReversal = yield prepareVatReturn(String(company._id), '2026-10', String(accountant._id));
        record({
            name: 'VAT return after a same-period settled reversal nets the original',
            status: near(Number(vatReturnAfterReversal.taxableSupplies || 0), 0)
                && near(Number(vatReturnAfterReversal.vatOnCommission || 0), 0)
                && near(Number(vatReturnAfterReversal.glOutputVat || 0), 0)
                && vatReturnAfterReversal.reconciliationStatus === 'MATCHED'
                ? 'PASS' : 'FAIL',
            expected: 'taxable supplies 0, VAT obligation 0, GL net 0, MATCHED. Same filing period because the reversal journal is dated today and the original payment is October 2026.',
            actual: `taxableSupplies=${vatReturnAfterReversal.taxableSupplies} vatOnCommission=${vatReturnAfterReversal.vatOnCommission} glOutputVat=${vatReturnAfterReversal.glOutputVat} difference=${vatReturnAfterReversal.reconciliationDifference} status=${vatReturnAfterReversal.reconciliationStatus}`,
        });
        const competingBody = Object.assign(Object.assign({}, paymentRequest(PERIOD.month, PERIOD.year, 1800).body), { propertyId: String(property._id), tenantId: String(tenant._id), paymentType: 'rental' });
        const agentActor = Object.assign(Object.assign({}, actor), { userId: String(agent._id), role: 'agent', roles: ['agent'] });
        const [competingLease, competingAccountant, competingPublic, competingAgent] = yield Promise.all([
            invoke(createPayment, Object.assign(Object.assign({}, paymentRequest(PERIOD.month, PERIOD.year, 1800)), { body: competingBody })),
            invoke(createPaymentAccountant, { user: actor, body: competingBody }),
            invoke(createPaymentPublic, { user: actor, body: Object.assign(Object.assign({}, competingBody), { status: 'pending' }) }),
            invoke(createAgentPayment, { user: agentActor, headers: {}, body: Object.assign(Object.assign({}, competingBody), { status: 'pending' }) }),
        ]);
        record({
            name: 'fully reversed period no longer counts the original as rent coverage',
            status: coverageAfterReversal === 0 ? 'PASS' : 'FAIL',
            expected: 'coverage 0',
            actual: `coverage=${coverageAfterReversal}`,
        });
        record({
            name: 'pending correction reserves the period and blocks competing receipts',
            status: near(reservationAfterReversal, 1800)
                && competingLease.statusCode === 409
                && competingAccountant.statusCode === 409
                && competingPublic.statusCode === 409
                && competingAgent.statusCode === 409
                ? 'PASS' : 'FAIL',
            expected: 'reservation 1800 and HTTP 409 from lease, accountant, public, and agent creation',
            actual: `reservation=${reservationAfterReversal} lease=${competingLease.statusCode} ${((_2 = competingLease.body) === null || _2 === void 0 ? void 0 : _2.message) || ''} accountant=${competingAccountant.statusCode} ${((_3 = competingAccountant.body) === null || _3 === void 0 ? void 0 : _3.message) || ''} public=${competingPublic.statusCode} ${((_4 = competingPublic.body) === null || _4 === void 0 ? void 0 : _4.message) || ''} agent=${competingAgent.statusCode} ${((_5 = competingAgent.body) === null || _5 === void 0 ? void 0 : _5.message) || ''}`,
        });
        const earlyComplete = correctionId
            ? null
            : null;
        void earlyComplete;
        const draftBeforeSettlementCheck = correction;
        record({
            name: 'correction draft is pending and does not cover rent',
            status: draftBeforeSettlementCheck
                && draftBeforeSettlementCheck.status === 'pending'
                && String(draftBeforeSettlementCheck.postingStatus || '') === 'draft'
                && coverageAfterReversal === 0
                ? 'PASS' : 'FAIL',
            expected: 'pending draft and coverage 0',
            actual: `status=${draftBeforeSettlementCheck === null || draftBeforeSettlementCheck === void 0 ? void 0 : draftBeforeSettlementCheck.status} posting=${draftBeforeSettlementCheck === null || draftBeforeSettlementCheck === void 0 ? void 0 : draftBeforeSettlementCheck.postingStatus} coverage=${coverageAfterReversal}`,
            ids: { correctionId },
        });
        const replacement = yield invoke(updatePaymentStatus, {
            user: actor,
            params: { id: correctionId },
            body: { status: 'completed', reason: `${MARKER} complete correction` },
        });
        yield settleMail();
        const replacementDoc = yield Payment.findById(correctionId).lean();
        const replacementRecon = correctionId ? yield reconcilePayment(correctionId) : null;
        record({
            name: 'complete the correction draft through updatePaymentStatus',
            status: replacement.statusCode === 200 && (replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.accountingComplete) === true ? 'PASS' : 'FAIL',
            expected: 'HTTP 200 and accountingComplete',
            actual: `HTTP ${replacement.statusCode} ${((_6 = replacement.body) === null || _6 === void 0 ? void 0 : _6.message) || ''} status=${replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.status} accounting=${replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.accountingComplete} recon=${replacementRecon === null || replacementRecon === void 0 ? void 0 : replacementRecon.status} missing=${((replacementRecon === null || replacementRecon === void 0 ? void 0 : replacementRecon.missing) || []).join(',')}`,
            ids: { correctionId, reference: String((replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.referenceNumber) || '') },
        });
        const afterReplacement = yield snapshot('after-replacement');
        const secondDuplicate = yield invoke(createPayment, paymentRequest(PERIOD.month, PERIOD.year));
        record({
            name: 'completed correction covers the period and blocks another receipt',
            status: near(afterReplacement.validRentCoverage, 1800) && secondDuplicate.statusCode === 409 ? 'PASS' : 'FAIL',
            expected: 'coverage 1800 and HTTP 409',
            actual: `coverage=${afterReplacement.validRentCoverage} HTTP ${secondDuplicate.statusCode} ${((_7 = secondDuplicate.body) === null || _7 === void 0 ? void 0 : _7.message) || ''}`,
        });
        const repeatPost = yield accountingService.getDashboardSummary(String(company._id));
        void repeatPost;
        const retryAfterReplacement = yield invoke(reversePayment, {
            user: actor,
            params: { id: originalId },
            body: { reason: `${MARKER} retry after replacement` },
        });
        const finalReversalCount = yield Payment.countDocuments({ companyId: company._id, reversalOfPaymentId: originalId, amount: { $lt: 0 } });
        record({
            name: 'another reversal retry after replacement leaves one reversal',
            status: finalReversalCount === 1 && retryAfterReplacement.statusCode === 200 ? 'PASS' : 'FAIL',
            expected: 'one reversal',
            actual: `HTTP ${retryAfterReplacement.statusCode} reversals=${finalReversalCount}`,
        });
        const uncachedAgency = yield accountingService.agencyRevenue(String(company._id));
        const cachedAgency = yield accountingService.getDashboardSummary(String(company._id));
        const refreshedAgency = yield accountingService.getDashboardSummary(String(company._id));
        const correctionNotices = yield OwnerRentNotice.find({
            companyId: company._id,
            paymentId: correctionId,
            idempotencyKey: /^owner-rent-payment:/,
        }).lean();
        const originalNotices = yield OwnerRentNotice.find({
            companyId: company._id,
            paymentId: originalId,
            idempotencyKey: /^owner-rent-payment:/,
        }).lean();
        const unfinalizedSample = {
            _id: 'corr-sample',
            status: 'completed',
            paymentType: 'rental',
            amount: 1800,
            agentId: String(agent._id),
            commissionFinalized: false,
            isCorrectionEntry: true,
            referenceNumber: 'CORR-SAMPLE',
            commissionDetails: { agentShare: expected.agentCommission, agencyShare: expected.companyIncome, ownerAmount: expected.ownerPayable },
        };
        const unfinalizedPolicy = evaluatePermanentAccountingPolicy(unfinalizedSample);
        const unfinalizedProjection = buildExpectedAccountingProjection(unfinalizedSample);
        record({
            name: 'an unfinalized correction with stored shares still requires agent and company projections',
            status: completedPaymentRequiresFinalizedCommission(unfinalizedSample)
                && unfinalizedPolicy.skipAgentCommission === false
                && unfinalizedPolicy.skipCompanyCommission === false
                && unfinalizedProjection.agentCommission === true
                && unfinalizedProjection.companyCommission === true
                ? 'PASS' : 'FAIL',
            expected: 'positive shares stay required and an unfinalized completed correction cannot be treated as not applicable',
            actual: `requiresFinalized=${completedPaymentRequiresFinalizedCommission(unfinalizedSample)} skipAgent=${unfinalizedPolicy.skipAgentCommission} skipCompany=${unfinalizedPolicy.skipCompanyCommission} agentRequired=${unfinalizedProjection.agentCommission} companyRequired=${unfinalizedProjection.companyCommission}`,
        });
        record({
            name: 'completed correction restores one owner, agent, and company posting',
            status: near(afterReplacement.ownerIncome, expected.ownerPayable)
                && near(afterReplacement.agentCommission, expected.agentCommission)
                && near(afterReplacement.companyIncome, expected.companyIncome)
                && (replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.accountingComplete) === true
                && (replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.commissionFinalized) === true
                && ((_9 = (_8 = replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.commissionDetails) === null || _8 === void 0 ? void 0 : _8.paymentAllocation) === null || _9 === void 0 ? void 0 : _9.grossAmount)
                ? 'PASS' : 'FAIL',
            expected: `owner ${expected.ownerPayable}, agent ${expected.agentCommission}, agency ${expected.companyIncome}, allocation present, accountingComplete`,
            actual: `owner=${afterReplacement.ownerIncome} agent=${afterReplacement.agentCommission} company=${afterReplacement.companyIncome} finalized=${replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.commissionFinalized} accounting=${replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.accountingComplete} allocation=${(_11 = (_10 = replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.commissionDetails) === null || _10 === void 0 ? void 0 : _10.paymentAllocation) === null || _11 === void 0 ? void 0 : _11.grossAmount}`,
        });
        record({
            name: 'owner rent-received notice is sent once for the completed correction',
            status: correctionNotices.length === 1
                && ((_12 = correctionNotices[0]) === null || _12 === void 0 ? void 0 : _12.status) === 'SENT'
                && originalNotices.length === 1
                ? 'PASS' : 'FAIL',
            expected: 'one SENT notice for the correction and the original notice is not resent',
            actual: `correctionNotices=${correctionNotices.length}:${correctionNotices.map((row) => row.status).join(',')} originalNotices=${originalNotices.length}`,
        });
        record({
            name: 'agency revenue matches company-account income before and after cache refresh',
            status: near(uncachedAgency, expected.companyIncome)
                && near(Number(cachedAgency.totalRevenue || 0), expected.companyIncome)
                && near(Number(refreshedAgency.totalRevenue || 0), expected.companyIncome)
                ? 'PASS' : 'FAIL',
            expected: `agency revenue ${expected.companyIncome} uncached and from the dashboard summary`,
            actual: `uncached=${uncachedAgency} cached=${cachedAgency.totalRevenue} refreshed=${refreshedAgency.totalRevenue}`,
        });
        record({
            name: 'outstanding rent follows settled reversal and completed replacement',
            status: near(before.outstandingRentals, afterOriginal.outstandingRentals + 1800)
                && near(afterReversal.outstandingRentals, before.outstandingRentals)
                && near(afterReplacement.outstandingRentals, afterOriginal.outstandingRentals)
                ? 'PASS' : 'FAIL',
            expected: 'outstanding falls by 1800 after the original, returns after reversal, and falls again after the correction',
            actual: `before=${before.outstandingRentals} afterOriginal=${afterOriginal.outstandingRentals} afterReversal=${afterReversal.outstandingRentals} afterReplacement=${afterReplacement.outstandingRentals}`,
        });
        const vatReturnFinal = yield prepareVatReturn(String(company._id), '2026-10', String(accountant._id));
        record({
            name: 'VAT return after the completed correction counts the replacement once',
            status: near(Number(vatReturnFinal.taxableSupplies || 0), expected.commission)
                && near(Number(vatReturnFinal.vatOnCommission || 0), expected.vat)
                && near(Number(vatReturnFinal.glOutputVat || 0), expected.vat)
                && vatReturnFinal.reconciliationStatus === 'MATCHED'
                ? 'PASS' : 'FAIL',
            expected: `taxable supplies ${expected.commission}, VAT ${expected.vat}, GL net ${expected.vat}, MATCHED`,
            actual: `taxableSupplies=${vatReturnFinal.taxableSupplies} vatOnCommission=${vatReturnFinal.vatOnCommission} outputVat=${vatReturnFinal.outputVat} glOutputVat=${vatReturnFinal.glOutputVat} difference=${vatReturnFinal.reconciliationDifference} status=${vatReturnFinal.reconciliationStatus}`,
        });
        const notices = yield OwnerRentNotice.find({ companyId: company._id }).lean();
        const originalUnchangedAtEnd = yield Payment.findById(originalId).lean();
        const stillUnchanged = money(originalUnchangedAtEnd === null || originalUnchangedAtEnd === void 0 ? void 0 : originalUnchangedAtEnd.amount) === originalSnapshot.amount
            && money((_14 = (_13 = originalUnchangedAtEnd === null || originalUnchangedAtEnd === void 0 ? void 0 : originalUnchangedAtEnd.commissionDetails) === null || _13 === void 0 ? void 0 : _13.vatAmount) !== null && _14 !== void 0 ? _14 : (_15 = originalUnchangedAtEnd === null || originalUnchangedAtEnd === void 0 ? void 0 : originalUnchangedAtEnd.commissionDetails) === null || _15 === void 0 ? void 0 : _15.vatOnCommission) === originalSnapshot.vatAmount;
        const primary = {
            before,
            afterOriginal,
            afterReversal,
            afterReplacement,
            expected,
            original: {
                id: originalId,
                reference: posted === null || posted === void 0 ? void 0 : posted.referenceNumber,
                snapshot: originalSnapshot,
                unchanged: snapshotUnchanged && stillUnchanged,
            },
            reversal: {
                id: reversalId,
                reference: reversalDoc === null || reversalDoc === void 0 ? void 0 : reversalDoc.referenceNumber,
                amount: reversalDoc === null || reversalDoc === void 0 ? void 0 : reversalDoc.amount,
                reversalOf: String((reversalDoc === null || reversalDoc === void 0 ? void 0 : reversalDoc.reversalOfPaymentId) || ''),
            },
            correction: {
                id: correctionId,
                reference: replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.referenceNumber,
                amount: replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.amount,
                commission: (replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.commissionDetails) || null,
                accountingComplete: replacementDoc === null || replacementDoc === void 0 ? void 0 : replacementDoc.accountingComplete,
            },
            vatReturnFinal: {
                vatOnCommission: vatReturnFinal.vatOnCommission,
                outputVat: vatReturnFinal.outputVat,
                glOutputVat: vatReturnFinal.glOutputVat,
                reconciliationDifference: vatReturnFinal.reconciliationDifference,
                taxableSupplies: vatReturnFinal.taxableSupplies,
                reconciliationStatus: vatReturnFinal.reconciliationStatus,
            },
            notices: notices.map((row) => ({
                key: row.idempotencyKey,
                status: row.status,
                paymentId: String(row.paymentId || ''),
                reversalPaymentId: String(row.reversalPaymentId || ''),
            })),
            mail: capturedMail.map((row) => ({ to: row.to, subject: row.subject, text: row.text })),
        };
        function side(name, month, year, fn) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d, _e;
                try {
                    const postedSide = yield createAndComplete(month, year);
                    if (!postedSide.id || ((_a = postedSide.completed) === null || _a === void 0 ? void 0 : _a.statusCode) !== 200) {
                        record({ name, status: 'FAIL', expected: 'side payment completes', actual: `create ${postedSide.created.statusCode} complete ${(_b = postedSide.completed) === null || _b === void 0 ? void 0 : _b.statusCode} ${((_d = (_c = postedSide.completed) === null || _c === void 0 ? void 0 : _c.body) === null || _d === void 0 ? void 0 : _d.message) || ((_e = postedSide.created.body) === null || _e === void 0 ? void 0 : _e.message) || ''}` });
                        return;
                    }
                    const sideDoc = yield Payment.findById(postedSide.id).select('accountingComplete').lean();
                    if ((sideDoc === null || sideDoc === void 0 ? void 0 : sideDoc.accountingComplete) !== true) {
                        record({ name, status: 'FAIL', expected: 'side payment accountingComplete', actual: `accountingComplete=${sideDoc === null || sideDoc === void 0 ? void 0 : sideDoc.accountingComplete}`, ids: { paymentId: postedSide.id } });
                        return;
                    }
                    yield fn(postedSide.id);
                }
                catch (error) {
                    record({ name, status: 'FAIL', expected: 'side case runs', actual: (error === null || error === void 0 ? void 0 : error.message) || String(error) });
                }
            });
        }
        yield side('failure before reversal save then immediate retry', 11, 2026, (id) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            yield Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE28_FAIL_BEFORE_REVERSAL_SAVE` } });
            const first = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE28_FAIL_BEFORE_REVERSAL_SAVE` } });
            const mid = yield Payment.findById(id).lean();
            const blocked = yield invoke(createPayment, paymentRequest(11, 2026));
            const second = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry immediately` } });
            const after = yield Payment.findById(id).lean();
            const count = yield Payment.countDocuments({ reversalOfPaymentId: id, amount: { $lt: 0 } });
            const open = String((mid === null || mid === void 0 ? void 0 : mid.reversalState) || '') === 'reversal_in_progress' || String((mid === null || mid === void 0 ? void 0 : mid.reversalState) || '') === 'reversal_incomplete';
            record({
                name: 'failure before reversal save then immediate retry',
                status: first.statusCode >= 400
                    && open
                    && blocked.statusCode === 409
                    && second.statusCode === 200
                    && String((after === null || after === void 0 ? void 0 : after.reversalState) || '') === 'reversed'
                    && count === 1
                    ? 'PASS' : 'FAIL',
                expected: 'abandoned in-progress lock with no REV is retried into one settled reversal',
                actual: `first=${first.statusCode} ${((_a = first.body) === null || _a === void 0 ? void 0 : _a.message) || ((_b = first.body) === null || _b === void 0 ? void 0 : _b.outcome) || ''} midState=${mid === null || mid === void 0 ? void 0 : mid.reversalState} blocked=${blocked.statusCode} retry=${second.statusCode} ${((_c = second.body) === null || _c === void 0 ? void 0 : _c.message) || ((_d = second.body) === null || _d === void 0 ? void 0 : _d.outcome) || ''} after=${after === null || after === void 0 ? void 0 : after.reversalState} reversals=${count}`,
                ids: { paymentId: id },
            });
        }));
        yield side('journal reversal failure then retry', 12, 2026, (id) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            yield Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE27_FAIL_JOURNAL` } });
            const first = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE27_FAIL_JOURNAL` } });
            const mid = yield Payment.findById(id).lean();
            const blocked = yield invoke(createPayment, paymentRequest(12, 2026));
            const draft = (mid === null || mid === void 0 ? void 0 : mid.correctedPaymentId)
                ? yield invoke(updatePaymentStatus, { user: actor, params: { id: String(mid.correctedPaymentId) }, body: { status: 'completed', reason: 'too early' } })
                : { statusCode: 0, body: { message: 'no draft' } };
            const second = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry journal` } });
            const after = yield Payment.findById(id).lean();
            const journals = yield JournalEntry.countDocuments({ sourceId: `${id}:reversal`, sourceModule: 'payment' });
            record({
                name: 'journal reversal failure then retry',
                status: (first.statusCode === 202 || first.statusCode === 500)
                    && String((mid === null || mid === void 0 ? void 0 : mid.reversalState) || '') === 'reversal_incomplete'
                    && blocked.statusCode === 409
                    && draft.statusCode === 409
                    && second.statusCode === 200
                    && String((after === null || after === void 0 ? void 0 : after.reversalState) || '') === 'reversed'
                    && journals === 1
                    ? 'PASS' : 'FAIL',
                expected: 'incomplete first, blocked competing receipt, blocked early correction, settled retry, one reversal journal',
                actual: `first=${first.statusCode} ${((_a = first.body) === null || _a === void 0 ? void 0 : _a.outcome) || ''} mid=${mid === null || mid === void 0 ? void 0 : mid.reversalState} blocked=${blocked.statusCode} earlyDraft=${draft.statusCode} ${((_b = draft.body) === null || _b === void 0 ? void 0 : _b.code) || ((_c = draft.body) === null || _c === void 0 ? void 0 : _c.message) || ''} retry=${second.statusCode} ${((_d = second.body) === null || _d === void 0 ? void 0 : _d.outcome) || ''} after=${after === null || after === void 0 ? void 0 : after.reversalState} journals=${journals}`,
                ids: { paymentId: id },
            });
        }));
        yield side('tax reversal failure then retry', 1, 2027, (id) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            yield Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE28_FAIL_TAX` } });
            const first = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE28_FAIL_TAX` } });
            const mid = yield Payment.findById(id).select('reversalState accountingComplete').lean();
            const second = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry tax` } });
            const after = yield Payment.findById(id).select('reversalState').lean();
            const rows = yield TaxObligation.countDocuments({ paymentId: id });
            record({
                name: 'tax reversal failure then retry',
                status: (first.statusCode === 202 || first.statusCode === 500)
                    && String((mid === null || mid === void 0 ? void 0 : mid.reversalState) || '') !== 'reversed'
                    && second.statusCode === 200
                    && String((after === null || after === void 0 ? void 0 : after.reversalState) || '') === 'reversed'
                    ? 'PASS' : 'FAIL',
                expected: 'first incomplete, retry settled, no duplicate tax rows beyond original plus one reversal',
                actual: `first=${first.statusCode} ${((_a = first.body) === null || _a === void 0 ? void 0 : _a.outcome) || ((_b = first.body) === null || _b === void 0 ? void 0 : _b.message) || ''} mid=${mid === null || mid === void 0 ? void 0 : mid.reversalState} retry=${second.statusCode} ${(((_c = second.body) === null || _c === void 0 ? void 0 : _c.outcome) || '')} after=${after === null || after === void 0 ? void 0 : after.reversalState} obligationRows=${rows}`,
                ids: { paymentId: id },
            });
        }));
        yield side('company-account reversal failure then retry', 2, 2027, (id) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            yield Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE27_FAIL_COMPANY` } });
            const first = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE27_FAIL_COMPANY` } });
            const mid = yield Payment.findById(id).select('reversalState').lean();
            const second = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry company` } });
            const after = yield Payment.findById(id).select('reversalState').lean();
            record({
                name: 'separate accounting-connection company reversal failure then retry',
                status: (first.statusCode === 202 || first.statusCode === 500)
                    && String((mid === null || mid === void 0 ? void 0 : mid.reversalState) || '') === 'reversal_incomplete'
                    && second.statusCode === 200
                    && String((after === null || after === void 0 ? void 0 : after.reversalState) || '') === 'reversed'
                    ? 'PASS' : 'FAIL',
                expected: 'company reversal failure stays incomplete and retry settles',
                actual: `first=${first.statusCode} ${((_a = first.body) === null || _a === void 0 ? void 0 : _a.outcome) || ''} warnings=${JSON.stringify(((_b = first.body) === null || _b === void 0 ? void 0 : _b.warnings) || [])} mid=${mid === null || mid === void 0 ? void 0 : mid.reversalState} retry=${second.statusCode} ${((_c = second.body) === null || _c === void 0 ? void 0 : _c.outcome) || ''} after=${after === null || after === void 0 ? void 0 : after.reversalState}`,
                ids: { paymentId: id },
            });
        }));
        yield side('owner-income reversal failure then retry', 3, 2027, (id) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            yield Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE_FAIL_REVERSAL_OWNER` } });
            const first = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} PHASE_FAIL_REVERSAL_OWNER` } });
            const mid = yield Payment.findById(id).select('reversalState').lean();
            const second = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} retry owner` } });
            const after = yield Payment.findById(id).select('reversalState').lean();
            record({
                name: 'owner-income reversal failure then retry',
                status: (first.statusCode === 202 || first.statusCode === 500)
                    && String((mid === null || mid === void 0 ? void 0 : mid.reversalState) || '') === 'reversal_incomplete'
                    && second.statusCode === 200
                    && String((after === null || after === void 0 ? void 0 : after.reversalState) || '') === 'reversed'
                    ? 'PASS' : 'FAIL',
                expected: 'owner reversal failure stays incomplete and retry settles',
                actual: `first=${first.statusCode} ${((_a = first.body) === null || _a === void 0 ? void 0 : _a.outcome) || ''} mid=${mid === null || mid === void 0 ? void 0 : mid.reversalState} retry=${second.statusCode} ${((_b = second.body) === null || _b === void 0 ? void 0 : _b.outcome) || ''} after=${after === null || after === void 0 ? void 0 : after.reversalState}`,
                ids: { paymentId: id },
            });
        }));
        yield side('concurrent reversal attempts', 5, 2027, (id) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const [a, b] = yield Promise.all([
                invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} concurrent a` } }),
                invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} concurrent b` } }),
            ]);
            const count = yield Payment.countDocuments({ reversalOfPaymentId: id, amount: { $lt: 0 } });
            const drafts = yield Payment.countDocuments({ companyId: company._id, referenceNumber: new RegExp(`^CORR-`), isCorrectionEntry: true, notes: new RegExp(String(((_a = (yield Payment.findById(id).select('referenceNumber').lean())) === null || _a === void 0 ? void 0 : _a.referenceNumber) || 'NO-MATCH')) });
            const state = String(((_b = (yield Payment.findById(id).select('reversalState').lean())) === null || _b === void 0 ? void 0 : _b.reversalState) || '');
            record({
                name: 'concurrent reversal attempts create one reversal',
                status: count === 1
                    && (state === 'reversed' || state === 'reversal_incomplete')
                    && a.statusCode !== 500
                    && b.statusCode !== 500
                    ? 'PASS' : 'FAIL',
                expected: 'exactly one negative reversal',
                actual: `responses=${a.statusCode}/${b.statusCode} outcomes=${((_c = a.body) === null || _c === void 0 ? void 0 : _c.outcome) || ((_d = a.body) === null || _d === void 0 ? void 0 : _d.message)}/${((_e = b.body) === null || _e === void 0 ? void 0 : _e.outcome) || ((_f = b.body) === null || _f === void 0 ? void 0 : _f.message)} reversals=${count} state=${state} matchingDraftNotes=${drafts}`,
                ids: { paymentId: id },
            });
        }));
        yield side('owner notice failure does not change the payment', 7, 2027, (id) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const beforeAmount = money((_a = (yield Payment.findById(id).lean())) === null || _a === void 0 ? void 0 : _a.amount);
            yield Payment.updateOne({ _id: id }, { $set: { notes: `${MARKER} PHASE4B1_FAIL_MAIL` } });
            mailShouldFail = true;
            const response = yield invoke(reversePayment, { user: actor, params: { id }, body: { reason: `${MARKER} notice failure` } });
            yield settleMail();
            const afterDoc = yield Payment.findById(id).lean();
            const notice = yield OwnerRentNotice.findOne({ paymentId: id, idempotencyKey: new RegExp('owner-rent-reversal') }).lean();
            record({
                name: 'owner notice failure does not change the financial payment',
                status: money(afterDoc === null || afterDoc === void 0 ? void 0 : afterDoc.amount) === beforeAmount && response.statusCode < 500 ? 'PASS' : 'FAIL',
                expected: 'payment amount unchanged; notice failure is recorded or the reversal mail path reports failure',
                actual: `HTTP ${response.statusCode} amount=${afterDoc === null || afterDoc === void 0 ? void 0 : afterDoc.amount} state=${afterDoc === null || afterDoc === void 0 ? void 0 : afterDoc.reversalState} notice=${(notice === null || notice === void 0 ? void 0 : notice.status) || 'none'} reason=${(notice === null || notice === void 0 ? void 0 : notice.failureReason) || ''}`,
                ids: { paymentId: id },
            });
        }));
        const historical = yield createAndComplete(6, 2025);
        if (historical.id && ((_16 = historical.completed) === null || _16 === void 0 ? void 0 : _16.statusCode) === 200) {
            const old = yield Payment.findById(historical.id).lean();
            const oldVat = money((_18 = (_17 = old === null || old === void 0 ? void 0 : old.commissionDetails) === null || _17 === void 0 ? void 0 : _17.vatAmount) !== null && _18 !== void 0 ? _18 : (_19 = old === null || old === void 0 ? void 0 : old.commissionDetails) === null || _19 === void 0 ? void 0 : _19.vatOnCommission);
            const oldRate = Number((old === null || old === void 0 ? void 0 : old.vatOnCommissionRate) || 0);
            const response = yield invoke(reversePayment, { user: actor, params: { id: historical.id }, body: { reason: `${MARKER} historical rate probe` } });
            const draft = ((_20 = (yield Payment.findById(historical.id).lean())) === null || _20 === void 0 ? void 0 : _20.correctedPaymentId)
                ? yield Payment.findById((yield Payment.findById(historical.id).lean()).correctedPaymentId).lean()
                : null;
            const draftVat = money((_22 = (_21 = draft === null || draft === void 0 ? void 0 : draft.commissionDetails) === null || _21 === void 0 ? void 0 : _21.vatAmount) !== null && _22 !== void 0 ? _22 : (_23 = draft === null || draft === void 0 ? void 0 : draft.commissionDetails) === null || _23 === void 0 ? void 0 : _23.vatOnCommission);
            const draftRate = Number((draft === null || draft === void 0 ? void 0 : draft.vatOnCommissionRate) || 0);
            const juneReturn = yield prepareVatReturn(String(company._id), '2025-06', String(accountant._id));
            record({
                name: '2025 receipt keeps its dated VAT rate and a later reversal stays visible',
                status: response.statusCode === 200
                    && near(oldRate, 0.15)
                    && near(draftRate, oldRate)
                    && near(draftVat, oldVat)
                    && near(Number(juneReturn.vatOnCommission || 0), 0)
                    && juneReturn.reconciliationStatus === 'RECONCILIATION_REQUIRED'
                    ? 'PASS' : 'FAIL',
                expected: 'draft keeps the June 2025 15% VAT. June obligations net to 0 because both rows are REVERSED. The reversal journal is dated in the reversal month, so the June GL credit remains and the return stays RECONCILIATION_REQUIRED. Amounts are not rewritten.',
                actual: `HTTP ${response.statusCode} originalRate=${oldRate} originalVat=${oldVat} draftRate=${draftRate} draftVat=${draftVat} juneSupplies=${juneReturn.taxableSupplies} juneObligation=${juneReturn.vatOnCommission} juneGl=${juneReturn.glOutputVat} juneDifference=${juneReturn.reconciliationDifference} juneStatus=${juneReturn.reconciliationStatus}`,
                ids: { paymentId: historical.id },
            });
        }
        else {
            record({
                name: '2025 receipt reversal journal uses stored facts and the draft rate is inspected',
                status: 'UNVERIFIED',
                expected: 'a June 2025 receipt can be posted',
                actual: `create ${historical.created.statusCode} ${((_24 = historical.created.body) === null || _24 === void 0 ? void 0 : _24.message) || ''} complete ${((_25 = historical.completed) === null || _25 === void 0 ? void 0 : _25.statusCode) || 0} ${((_27 = (_26 = historical.completed) === null || _26 === void 0 ? void 0 : _26.body) === null || _27 === void 0 ? void 0 : _27.message) || ''}`,
            });
        }
        const zwl = yield invoke(createPayment, paymentRequest(9, 2026, 1800, 'ZWL', 'pending'));
        const usdCover = yield createAndComplete(9, 2026);
        record({
            name: 'currency isolation',
            status: zwl.statusCode === 201 && ((_28 = usdCover.completed) === null || _28 === void 0 ? void 0 : _28.statusCode) === 200 ? 'PASS' : 'FAIL',
            expected: 'ZWL pending receipt does not stop a USD receipt for the same month',
            actual: `ZWL HTTP ${zwl.statusCode}; USD create ${usdCover.created.statusCode} complete ${(_29 = usdCover.completed) === null || _29 === void 0 ? void 0 : _29.statusCode}`,
        });
        const depositAttempt = yield invoke(createPayment, paymentRequest(8, 2026, 0));
        record({
            name: 'deposit-only receipt through createPayment',
            status: 'UNVERIFIED',
            expected: 'deposit-only rent coverage is exercised only if this API accepts amount 0',
            actual: `HTTP ${depositAttempt.statusCode} ${((_30 = depositAttempt.body) === null || _30 === void 0 ? void 0 : _30.message) || ((_31 = depositAttempt.body) === null || _31 === void 0 ? void 0 : _31.status) || ''}`,
        });
        const output = {
            runId: RUN_ID,
            marker: MARKER,
            environment: {
                main: MAIN_URI,
                accounting: ACCT_URI,
                host: mainHost,
                replicaSet: false,
                cosmos: false,
                emailProviderConfigured: false,
                paynowConfigured: false,
                externalHostsBlocked: blockedExternal,
            },
            expected,
            primary,
            results,
        };
        const fs = yield Promise.resolve().then(() => __importStar(require('fs')));
        const path = yield Promise.resolve().then(() => __importStar(require('path')));
        const outDir = path.join(process.cwd(), 'tmp');
        fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, `e2e-reversal-audit-${RUN_ID}.json`);
        fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
        console.log(`EVIDENCE ${outFile}`);
        console.log(JSON.stringify({ runId: RUN_ID, results: results.map((row) => ({ name: row.name, status: row.status, actual: row.actual })) }, null, 2));
        yield mongoose.disconnect();
        yield accountingConnection.close();
        process.exit(results.some((row) => row.status === 'FAIL') ? 1 : 0);
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error('AUDIT_ABORTED');
    console.error((error === null || error === void 0 ? void 0 : error.stack) || (error === null || error === void 0 ? void 0 : error.message) || error);
    console.log(JSON.stringify({ runId: RUN_ID, aborted: true, results }, null, 2));
    process.exit(1);
}));
