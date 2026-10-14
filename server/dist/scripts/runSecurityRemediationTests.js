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
 * Focused checks for the first-adoption security remediation.
 * HTTP and payment fixtures are disposable and deleted afterwards.
 * Skips database writes when NODE_ENV=production.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
const productionConfig_1 = require("../config/productionConfig");
const systemAdminBootstrap_1 = require("../services/systemAdminBootstrap");
const publicSignupCompany_1 = require("../utils/publicSignupCompany");
const errorHandler_1 = require("../middleware/errorHandler");
const paymentReferenceDiagnostics_1 = require("../services/paymentReferenceDiagnostics");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const checks = [];
function record(name, ok, detail = '') {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function tokenFor(user) {
    const { JWT_CONFIG } = require('../config/jwt');
    return jsonwebtoken_1.default.sign({
        userId: String(user._id),
        role: user.role,
        roles: user.roles,
        sessionVersion: 1,
        companyId: user.companyId ? String(user.companyId) : undefined,
        type: 'access',
    }, JWT_CONFIG.SECRET, {
        expiresIn: '2h',
        issuer: JWT_CONFIG.ISSUER,
        audience: JWT_CONFIG.AUDIENCE,
    });
}
function request(port, method, requestPath, token, body) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            hostname: '127.0.0.1',
            port,
            method,
            path: requestPath,
            headers: Object.assign({ Authorization: `Bearer ${token}` }, (payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})),
            timeout: 20000,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = {};
                try {
                    json = text ? JSON.parse(text) : {};
                }
                catch (_a) {
                    json = { raw: text };
                }
                resolve({ status: res.statusCode || 0, json });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        if (payload)
            req.write(payload);
        req.end();
    });
}
function runStaticChecks() {
    const present = (0, productionConfig_1.productionStartupProblems)({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        MONGODB_URI: 'mongodb://127.0.0.1:27017/property-management',
    });
    record('Production config accepts complete secrets', present.length === 0);
    const missingJwt = (0, productionConfig_1.productionStartupProblems)({
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        MONGODB_URI: 'mongodb://127.0.0.1:27017/property-management',
    });
    record('Production config rejects a missing JWT_SECRET', missingJwt.length === 1 && missingJwt[0].startsWith('JWT_SECRET') && !missingJwt.join(' ').includes('mongodb'));
    const missingRefresh = (0, productionConfig_1.productionStartupProblems)({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(32),
        MONGODB_URI: 'mongodb://127.0.0.1:27017/property-management',
    });
    record('Production config rejects a missing JWT_REFRESH_SECRET', missingRefresh.length === 1 && missingRefresh[0].startsWith('JWT_REFRESH_SECRET'));
    const missingDb = (0, productionConfig_1.productionStartupProblems)({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        MONGODB_URI: '   ',
    });
    record('Production config rejects a missing MONGODB_URI', missingDb.includes('MONGODB_URI'));
    const weak = (0, productionConfig_1.productionStartupProblems)({
        NODE_ENV: 'production',
        JWT_SECRET: 'too-short',
        JWT_REFRESH_SECRET: 'also-short',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/property-management',
    });
    record('Production config rejects secrets shorter than 32 characters', weak.includes('JWT_SECRET (min 32 chars)') && weak.includes('JWT_REFRESH_SECRET (min 32 chars)'));
    record('Development config does not require production secrets', (0, productionConfig_1.productionStartupProblems)({ NODE_ENV: 'development' }).length === 0);
    record('Production ignores administrator bootstrap even when the flag is set', (0, systemAdminBootstrap_1.systemAdminBootstrapDecision)({
        NODE_ENV: 'production',
        ALLOW_SYSTEM_ADMIN_BOOTSTRAP: 'true',
        SYSTEM_ADMIN_BOOTSTRAP_EMAIL: 'admin@example.test',
        SYSTEM_ADMIN_BOOTSTRAP_PASSWORD: 'a-long-test-password',
    }).action === 'skip');
    record('Production signup stays closed unless explicitly allowed', (0, publicSignupCompany_1.isPublicSignupAllowed)({ NODE_ENV: 'production' }) === false
        && (0, publicSignupCompany_1.isPublicSignupAllowed)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true' }) === true);
    record('Development signup remains available for local onboarding', (0, publicSignupCompany_1.isPublicSignupAllowed)({ NODE_ENV: 'development' }) === true);
    const accountingRoutes = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', 'routes', 'accountingRoutes.ts'), 'utf8');
    record('Tax receipt uploads stay limited to PDF and images', accountingRoutes.includes("allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']")
        && accountingRoutes.includes("allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png']"));
    const paymentModel = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', 'models', 'Payment.ts'), 'utf8');
    record('Payment references are still declared unique per company', paymentModel.includes('companyId: 1, referenceNumber: 1') && paymentModel.includes('unique: true'));
    record('Same amount, type, and day is classified as a possible duplicate', (0, paymentReferenceDiagnostics_1.classifyPaymentReferenceGroup)([
        { amount: 20, paymentType: 'sale', paymentDate: '2026-01-01' },
        { amount: 20, paymentType: 'sale', paymentDate: '2026-01-01' },
    ]) === 'possible_duplicate');
    record('Different amounts sharing a reference are classified as separate transactions', (0, paymentReferenceDiagnostics_1.classifyPaymentReferenceGroup)([
        { amount: 20, paymentType: 'sale', paymentDate: '2026-01-01' },
        { amount: 40, paymentType: 'sale', paymentDate: '2026-01-02' },
    ]) === 'separate_transactions_sharing_a_reference');
}
function paymentDraft(companyId, agentId, referenceNumber, amount) {
    return {
        paymentType: 'sale',
        propertyType: 'residential',
        propertyId: new mongoose_1.default.Types.ObjectId(),
        agentId,
        companyId,
        paymentDate: new Date('2026-02-01T00:00:00.000Z'),
        paymentMethod: 'cash',
        amount,
        referenceNumber,
        processedBy: agentId,
        commissionDetails: {
            totalCommission: 0,
            preaFee: 0,
            agentShare: 0,
            agencyShare: 0,
            ownerAmount: amount,
        },
        status: 'pending',
        currency: 'USD',
    };
}
function runDatabaseChecks() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        if (process.env.NODE_ENV === 'production') {
            record('Database security checks were not run against production', true, 'NODE_ENV=production');
            return;
        }
        const { connectDatabase, closeDatabase } = yield Promise.resolve().then(() => __importStar(require('../config/database')));
        const { Company } = yield Promise.resolve().then(() => __importStar(require('../models/Company')));
        const { User } = yield Promise.resolve().then(() => __importStar(require('../models/User')));
        const { Subscription } = yield Promise.resolve().then(() => __importStar(require('../models/Subscription')));
        const { Payment } = yield Promise.resolve().then(() => __importStar(require('../models/Payment')));
        const { PaymentSession } = yield Promise.resolve().then(() => __importStar(require('../models/PaymentSession')));
        const { activateSubscriptionFromPayment } = yield Promise.resolve().then(() => __importStar(require('../services/billingActivationService')));
        const { PLAN_CONFIG } = yield Promise.resolve().then(() => __importStar(require('../types/plan')));
        const companyRoutes = (yield Promise.resolve().then(() => __importStar(require('../routes/companyRoutes')))).default;
        const billingRoutes = (yield Promise.resolve().then(() => __importStar(require('../routes/billingRoutes')))).default;
        yield connectDatabase();
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use('/api/companies', companyRoutes);
        app.use('/api/billing', billingRoutes);
        app.use(errorHandler_1.errorHandler);
        const server = http_1.default.createServer(app);
        yield new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const stamp = `SECREMED${Date.now().toString().slice(-8)}`;
        const createdUserIds = [];
        const createdCompanyIds = [];
        const createdPaymentIds = [];
        const createdSubscriptionIds = [];
        const createdSessionIds = [];
        try {
            const owner = yield User.create({
                email: `${stamp}-owner@example.test`,
                password: 'Security-Remediation-1',
                firstName: 'Owner',
                lastName: 'Test',
                role: 'admin',
                roles: ['admin'],
                isActive: true,
            });
            createdUserIds.push(owner._id);
            const company = yield Company.create({
                name: `${stamp} Agency`,
                address: '1 Test Street',
                phone: '0770000000',
                email: `${stamp}@example.test`,
                registrationNumber: `${stamp}-REG`,
                tinNumber: `${stamp}-TIN`,
                ownerId: owner._id,
                workspaceType: 'individual',
                plan: 'INDIVIDUAL',
                propertyLimit: PLAN_CONFIG.INDIVIDUAL.propertyLimit,
                featureFlags: PLAN_CONFIG.INDIVIDUAL.featureFlags,
                subscriptionStatus: 'trial',
                tenantStatus: 'active',
                isActive: true,
            });
            const other = yield Company.create({
                name: `${stamp} Other`,
                address: '2 Test Street',
                phone: '0770000001',
                email: `${stamp}-other@example.test`,
                registrationNumber: `${stamp}-REG2`,
                tinNumber: `${stamp}-TIN2`,
                ownerId: owner._id,
                workspaceType: 'individual',
                plan: 'INDIVIDUAL',
                propertyLimit: PLAN_CONFIG.INDIVIDUAL.propertyLimit,
                featureFlags: PLAN_CONFIG.INDIVIDUAL.featureFlags,
                subscriptionStatus: 'trial',
                tenantStatus: 'active',
                isActive: true,
            });
            createdCompanyIds.push(company._id, other._id);
            owner.companyId = company._id;
            yield owner.save();
            const subscription = yield Subscription.create({
                companyId: company._id,
                userId: owner._id,
                plan: 'INDIVIDUAL',
                cycle: 'monthly',
                status: 'trial',
            });
            createdSubscriptionIds.push(subscription._id);
            const token = tokenFor(owner);
            const profile = yield request(port, 'PUT', '/api/companies/current', token, {
                name: `${stamp} Renamed`,
                phone: '0770000099',
                plan: 'ENTERPRISE',
                propertyLimit: 9999,
                featureFlags: Object.assign(Object.assign({}, PLAN_CONFIG.ENTERPRISE.featureFlags), { onlinePaymentsEnabled: true }),
                subscriptionStatus: 'active',
            });
            const saved = yield Company.findById(company._id).lean();
            record('Company profile updates still save', profile.status === 200 && (saved === null || saved === void 0 ? void 0 : saved.name) === `${stamp} Renamed` && (saved === null || saved === void 0 ? void 0 : saved.phone) === '0770000099');
            record('Company profile updates cannot grant an enterprise plan', (saved === null || saved === void 0 ? void 0 : saved.plan) === 'INDIVIDUAL'
                && (saved === null || saved === void 0 ? void 0 : saved.propertyLimit) === PLAN_CONFIG.INDIVIDUAL.propertyLimit
                && ((_a = saved === null || saved === void 0 ? void 0 : saved.featureFlags) === null || _a === void 0 ? void 0 : _a.commissionEnabled) === false
                && (saved === null || saved === void 0 ? void 0 : saved.subscriptionStatus) === 'trial');
            const directPlan = yield request(port, 'PUT', `/api/companies/${company._id}/plan`, token, { plan: 'ENTERPRISE' });
            const afterDirect = yield Company.findById(company._id).select('plan').lean();
            record('Direct plan route rejects entitlement changes', directPlan.status === 403 && ((_b = directPlan.json) === null || _b === void 0 ? void 0 : _b.code) === 'PLAN_CHANGE_REQUIRES_BILLING' && (afterDirect === null || afterDirect === void 0 ? void 0 : afterDirect.plan) === 'INDIVIDUAL');
            const samePlan = yield request(port, 'POST', '/api/billing/subscriptions/change-plan', token, { plan: 'INDIVIDUAL', cycle: 'monthly' });
            const changedPlan = yield request(port, 'POST', '/api/billing/subscriptions/change-plan', token, { plan: 'ENTERPRISE', cycle: 'yearly' });
            const subscriptionAfter = yield Subscription.findById(subscription._id).lean();
            record('Repeating the current subscription plan is accepted', samePlan.status === 200 && ((_c = samePlan.json) === null || _c === void 0 ? void 0 : _c.unchanged) === true);
            record('A company user cannot change the subscription plan', changedPlan.status === 403 && (subscriptionAfter === null || subscriptionAfter === void 0 ? void 0 : subscriptionAfter.plan) === 'INDIVIDUAL' && (subscriptionAfter === null || subscriptionAfter === void 0 ? void 0 : subscriptionAfter.cycle) === 'monthly');
            const session = yield PaymentSession.create({
                companyId: company._id,
                userId: owner._id,
                idempotencyKey: `${stamp}-session`,
                provider: 'manual',
                providerRef: `${stamp}-ref`,
                plan: 'SME',
                billingCycle: 'monthly',
                amount: 1,
                currency: 'USD',
                status: 'pending',
            });
            createdSessionIds.push(session._id);
            const activation = yield activateSubscriptionFromPayment({
                paymentSessionId: String(session._id),
                provider: 'manual',
                providerRef: `${stamp}-ref`,
            });
            const activated = yield Subscription.findOne({ companyId: company._id }).lean();
            const companyAfterBilling = yield Company.findById(company._id).select('plan tenantStatus subscriptionStatus featureFlags').lean();
            record('Verified billing activation still updates the subscription', activation.alreadyProcessed === false
                && (activated === null || activated === void 0 ? void 0 : activated.plan) === 'SME'
                && (activated === null || activated === void 0 ? void 0 : activated.status) === 'active'
                && (companyAfterBilling === null || companyAfterBilling === void 0 ? void 0 : companyAfterBilling.tenantStatus) === 'active'
                && (companyAfterBilling === null || companyAfterBilling === void 0 ? void 0 : companyAfterBilling.subscriptionStatus) === 'active');
            record('Billing activation does not depend on the profile plan field', (companyAfterBilling === null || companyAfterBilling === void 0 ? void 0 : companyAfterBilling.plan) === 'INDIVIDUAL' && ((_d = companyAfterBilling === null || companyAfterBilling === void 0 ? void 0 : companyAfterBilling.featureFlags) === null || _d === void 0 ? void 0 : _d.commissionEnabled) === false);
            if ((activated === null || activated === void 0 ? void 0 : activated._id) && String(activated._id) !== String(subscription._id)) {
                createdSubscriptionIds.push(activated._id);
            }
            const first = yield Payment.create(paymentDraft(company._id, owner._id, `${stamp}-REF-A`, 25));
            const second = yield Payment.create(paymentDraft(company._id, owner._id, `${stamp}-REF-B`, 40));
            const otherCompany = yield Payment.create(paymentDraft(other._id, owner._id, `${stamp}-REF-A`, 25));
            const blankA = yield Payment.create(paymentDraft(company._id, owner._id, '', 5));
            const blankB = yield Payment.create(paymentDraft(company._id, owner._id, '', 6));
            const repeated = yield Payment.create(paymentDraft(company._id, owner._id, `${stamp}-REF-A`, 30));
            createdPaymentIds.push(first._id, second._id, otherCompany._id, blankA._id, blankB._id, repeated._id);
            const sameReferenceCount = yield Payment.countDocuments({ companyId: company._id, referenceNumber: `${stamp}-REF-A` });
            record('Independent payment references are accepted', Boolean(first._id && second._id && otherCompany._id && blankA._id && blankB._id));
            record('A repeated reference is not rejected while historical collisions block the unique index', sameReferenceCount === 2);
        }
        finally {
            if (createdPaymentIds.length)
                yield Payment.deleteMany({ _id: { $in: createdPaymentIds } });
            if (createdSessionIds.length)
                yield PaymentSession.deleteMany({ _id: { $in: createdSessionIds } });
            if (createdSubscriptionIds.length)
                yield Subscription.deleteMany({ _id: { $in: createdSubscriptionIds } });
            yield Subscription.deleteMany({ companyId: { $in: createdCompanyIds } });
            if (createdCompanyIds.length)
                yield Company.deleteMany({ _id: { $in: createdCompanyIds } });
            if (createdUserIds.length)
                yield User.deleteMany({ _id: { $in: createdUserIds } });
            yield new Promise((resolve) => server.close(() => resolve()));
            yield closeDatabase();
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        runStaticChecks();
        try {
            yield runDatabaseChecks();
        }
        catch (error) {
            record('Database security checks completed', false, error instanceof Error ? error.message : 'unknown error');
        }
        const failed = checks.filter((check) => !check.ok);
        console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
        process.exit(failed.length ? 1 : 0);
    });
}
main();
