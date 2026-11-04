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
 * Isolated Paynow checkout lifecycle tests.
 * Uses a disposable local database and stand-in Paynow responses.
 * Does not call Paynow, does not use merchant credentials, and does not send mail.
 */
require("./paynowLifecyclePreload");
const paynowLifecyclePreload_1 = require("./paynowLifecyclePreload");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../config/jwt");
const registrationPaymentPolicy_1 = require("../services/registrationPaymentPolicy");
const canonicalHost_1 = require("../utils/canonicalHost");
const paynowRoutes_1 = __importDefault(require("../routes/paynowRoutes"));
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Subscription_1 = require("../models/Subscription");
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const Plan_1 = require("../models/Plan");
const AuditLog_1 = require("../models/AuditLog");
const TEST_DB = 'mongodb://127.0.0.1:27017/mantis_paynow_lifecycle_test';
const AMOUNT = 19;
const KEY = 'lifecycle-test-key';
const checks = [];
function record(name, ok, detail = '') {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function resetDouble() {
    paynowLifecyclePreload_1.paynowTestDouble.mode = 'ok';
    paynowLifecyclePreload_1.paynowTestDouble.sends = 0;
    paynowLifecyclePreload_1.paynowTestDouble.last = null;
    paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Created';
    paynowLifecyclePreload_1.paynowTestDouble.pollAmount = AMOUNT.toFixed(2);
    paynowLifecyclePreload_1.paynowTestDouble.pollCurrency = '';
    paynowLifecyclePreload_1.paynowTestDouble.pollReference = '';
    paynowLifecyclePreload_1.paynowTestDouble.pollPaynowReference = '70000001';
    paynowLifecyclePreload_1.paynowTestDouble.pollFault = '';
    paynowLifecyclePreload_1.paynowTestDouble.urls = [];
    process.env.PAYNOW_MODE = 'test';
    process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
    process.env.PAYNOW_CALLBACK_HOST = 'payments.example.test';
    process.env.PAYNOW_RESULT_URL = 'https://payments.example.test/api/paynow/result';
    process.env.PAYNOW_RETURN_URL = 'https://payments.example.test/api/paynow/return';
    process.env.PUBLIC_BASE_URL = 'https://payments.example.test';
    process.env.PAYNOW_INTEGRATION_ID = '90001';
    process.env.PAYNOW_INTEGRATION_KEY = KEY;
}
function tokenFor(user) {
    return jsonwebtoken_1.default.sign({
        userId: String(user._id),
        role: user.role,
        roles: [user.role],
        sessionVersion: 1,
        companyId: user.companyId ? String(user.companyId) : undefined,
        type: 'access'
    }, jwt_1.JWT_CONFIG.SECRET, { expiresIn: '2h', issuer: jwt_1.JWT_CONFIG.ISSUER, audience: jwt_1.JWT_CONFIG.AUDIENCE });
}
function request(port, method, requestPath, token, body, contentType = 'application/json', host = 'payments.example.test', extraHeaders) {
    const payload = body === undefined ? '' : (contentType === 'application/json' ? JSON.stringify(body) : String(body));
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            hostname: '127.0.0.1',
            port,
            method,
            path: requestPath,
            headers: Object.assign(Object.assign(Object.assign({ Host: host }, (extraHeaders || {})), (token ? { Authorization: `Bearer ${token}` } : {})), (payload ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) } : {})),
            timeout: 20000
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
                    json = {};
                }
                resolve({ status: res.statusCode || 0, json, text, location: String(res.headers.location || '') });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        if (payload)
            req.write(payload);
        req.end();
    });
}
function world(label_1) {
    return __awaiter(this, arguments, void 0, function* (label, email = `${label}@example.test`) {
        const user = yield User_1.User.create({
            email,
            password: 'Register1pay',
            firstName: 'Paynow',
            lastName: label,
            role: 'admin',
            roles: ['admin'],
            isActive: true,
            sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: `Lifecycle ${label}`,
            address: '1 Test Close',
            phone: '0772000001',
            email,
            ownerId: user._id,
            companyType: 'INDIVIDUAL_LANDLORD',
            workspaceType: 'individual',
            onboardingStatus: 'PENDING_PAYMENT',
            onboardingCompleted: false,
            subscriptionStatus: 'past_due',
            isActive: true,
            plan: 'INDIVIDUAL'
        });
        user.companyId = company._id;
        yield user.save();
        const subscription = yield Subscription_1.Subscription.create({
            companyId: company._id,
            userId: user._id,
            plan: 'INDIVIDUAL',
            cycle: 'monthly',
            status: 'past_due'
        });
        const session = yield PaymentSession_1.PaymentSession.create({
            companyId: company._id,
            userId: user._id,
            subscriptionId: subscription._id,
            idempotencyKey: `lifecycle:${label}:${company._id.toString()}`,
            provider: 'paynow',
            providerRef: `SUBS-${company._id.toString()}`,
            plan: 'INDIVIDUAL',
            billingCycle: 'monthly',
            amount: AMOUNT,
            currency: 'USD',
            status: 'pending'
        });
        const billing = yield BillingPayment_1.BillingPayment.create({
            companyId: company._id,
            userId: user._id,
            subscriptionId: subscription._id,
            paymentSessionId: session._id,
            plan: 'INDIVIDUAL',
            cycle: 'monthly',
            amount: AMOUNT,
            currency: 'USD',
            method: 'card',
            provider: 'paynow',
            providerRef: session.providerRef,
            idempotencyKey: `lifecycle-billing:${label}:${company._id.toString()}`,
            status: 'pending'
        });
        session.billingPaymentId = billing._id;
        yield session.save();
        return { user, company, subscription, session, billing, token: tokenFor(user) };
    });
}
function statusMessage(status, reference, amount = AMOUNT.toFixed(2), currency = '') {
    const values = {
        reference,
        paynowreference: paynowLifecyclePreload_1.paynowTestDouble.pollPaynowReference,
        amount,
        status,
        pollurl: paynowLifecyclePreload_1.PAYNOW_LIFECYCLE_POLL
    };
    if (currency)
        values.currency = currency;
    values.hash = (0, registrationPaymentPolicy_1.paynowPayloadHash)(values, KEY);
    return Object.keys(values).map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(values[name])}`).join('&');
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
        if (process.env.NODE_ENV === 'production') {
            console.error('FAIL lifecycle tests refuse to run with NODE_ENV=production');
            process.exit(1);
        }
        process.env.PAYNOW_MODE = 'test';
        process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
        process.env.PAYNOW_INTEGRATION_ID = '90001';
        process.env.PAYNOW_INTEGRATION_KEY = KEY;
        if ((0, registrationPaymentPolicy_1.paynowConfigurationState)().mode !== 'test' || process.env.PAYNOW_INTEGRATION_KEY !== KEY || process.env.PAYNOW_INTEGRATION_ID === '23136') {
            console.error('FAIL lifecycle tests were not pinned to the isolated test integration');
            process.exit(1);
        }
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(process.env.PAYNOW_INTEGRATION_KEY || ''))) {
            console.error('FAIL lifecycle tests refused a live-style integration key');
            process.exit(1);
        }
        const documented = {
            id: '1201',
            reference: 'TEST REF',
            amount: '99.99',
            additionalinfo: 'A test ticket transaction',
            returnurl: 'http://www.google.com/search?q=returnurl',
            resulturl: 'http://www.google.com/search?q=resulturl',
            status: 'Message'
        };
        const documentedHash = (0, registrationPaymentPolicy_1.paynowPayloadHash)(documented, '3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977');
        record('Paynow documented hash example matches', documentedHash === '2A033FC38798D913D42ECB786B9B19645ADEDBDE788862032F1BD82CF3B92DEF84F316385D5B40DBB35F1A4FD7D5BFE73835174136463CDD48C9366B0749C689', documentedHash);
        record('A result URL on another host is visible before checkout', (0, registrationPaymentPolicy_1.paynowCallbackTargetDiffers)('https://www.mantisafrica.com/api/paynow/result', 'localhost:5000')
            && !(0, registrationPaymentPolicy_1.paynowCallbackTargetDiffers)('https://payments.example.test/api/paynow/result', 'payments.example.test'));
        record('Test mode can use the merchant login email without changing live checkout', (0, registrationPaymentPolicy_1.paynowCustomerAuthEmail)('garet.matsi@gmail.com', { PAYNOW_MODE: 'test', PAYNOW_INTEGRATION_ID: '90001', PAYNOW_INTEGRATION_KEY: KEY, PAYNOW_MERCHANT_EMAIL: 'merchant@example.test' }) === 'merchant@example.test'
            && (0, registrationPaymentPolicy_1.paynowCustomerAuthEmail)('garet.matsi@gmail.com', { PAYNOW_MODE: 'live', PAYNOW_INTEGRATION_ID: '90001', PAYNOW_INTEGRATION_KEY: KEY, PAYNOW_MERCHANT_EMAIL: 'merchant@example.test' }) === 'garet.matsi@gmail.com');
        const productionEnv = {
            NODE_ENV: 'production',
            PAYNOW_MODE: 'live',
            PAYNOW_INTEGRATION_ID: '90001',
            PAYNOW_INTEGRATION_KEY: KEY,
            PAYNOW_RESULT_URL: 'https://www.mantisafrica.com/api/paynow/result',
            PAYNOW_RETURN_URL: 'https://www.mantisafrica.com/api/paynow/return',
            PUBLIC_BASE_URL: 'https://www.mantisafrica.com',
            CLIENT_URL: 'https://www.mantisafrica.com'
        };
        const productionReady = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(productionEnv, { nodeEnv: 'production', requestHost: 'www.mantisafrica.com' });
        record('Production callback configuration is accepted when the host matches', productionReady.ok && productionReady.issues.length === 0);
        const wwwWithoutApex = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(Object.assign(Object.assign({}, productionEnv), { CANONICAL_HOST: 'https://www.mantisafrica.com', REDIRECT_FROM_HOSTS: '' }), { nodeEnv: 'production', requestHost: 'www.mantisafrica.com' });
        record('Checkout through www.mantisafrica.com does not require the apex domain', wwwWithoutApex.ok
            && wwwWithoutApex.resultHost === 'www.mantisafrica.com'
            && wwwWithoutApex.resultPath === '/api/paynow/result'
            && wwwWithoutApex.returnHost === 'www.mantisafrica.com'
            && wwwWithoutApex.returnPath === '/api/paynow/return');
        const apexCheckout = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(Object.assign(Object.assign({}, productionEnv), { CANONICAL_HOST: 'www.mantisafrica.com' }), { nodeEnv: 'production', requestHost: 'mantisafrica.com' });
        record('The apex hostname is not accepted as the checkout host', !apexCheckout.ok && apexCheckout.issues.includes('callback_host_mismatch') && wwwWithoutApex.ok);
        const signupQuery = '/signup?plan=INDIVIDUAL&checkout=paid&cycle=monthly';
        record('A request already on www keeps the signup parameters', (0, canonicalHost_1.canonicalRedirectTarget)({
            hostHeader: 'www.mantisafrica.com',
            protocol: 'https',
            originalUrl: signupQuery,
            method: 'GET',
            canonicalHost: 'https://www.mantisafrica.com',
            redirectFromHosts: ''
        }) === null);
        record('A listed alias redirects to www and keeps the signup parameters', (0, canonicalHost_1.canonicalRedirectTarget)({
            hostHeader: 'mantisafrica.azurewebsites.net',
            protocol: 'https',
            originalUrl: signupQuery,
            method: 'GET',
            canonicalHost: 'www.mantisafrica.com',
            redirectFromHosts: 'mantisafrica.azurewebsites.net'
        }) === `https://www.mantisafrica.com${signupQuery}`);
        record('The apex host is not redirected unless it is explicitly listed', (0, canonicalHost_1.canonicalRedirectTarget)({
            hostHeader: 'mantisafrica.com',
            protocol: 'https',
            originalUrl: signupQuery,
            method: 'GET',
            canonicalHost: 'www.mantisafrica.com',
            redirectFromHosts: ''
        }) === null
            && (0, canonicalHost_1.canonicalRedirectTarget)({
                hostHeader: 'mantisafrica.com',
                protocol: 'https',
                originalUrl: signupQuery,
                method: 'GET',
                canonicalHost: 'www.mantisafrica.com',
                redirectFromHosts: 'mantisafrica.com'
            }) === `https://www.mantisafrica.com${signupQuery}`);
        record('Paynow result posts are not redirected', (0, canonicalHost_1.canonicalRedirectTarget)({
            hostHeader: 'mantisafrica.azurewebsites.net',
            protocol: 'https',
            originalUrl: '/api/paynow/result',
            method: 'POST',
            canonicalHost: 'www.mantisafrica.com',
            redirectFromHosts: 'mantisafrica.azurewebsites.net'
        }) === null);
        const localhostCallback = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(Object.assign(Object.assign({}, productionEnv), { PAYNOW_RESULT_URL: 'http://localhost:5000/api/paynow/result', PAYNOW_RETURN_URL: 'http://localhost:5000/api/paynow/return' }), { nodeEnv: 'production', requestHost: 'localhost:5000' });
        record('Production rejects a localhost callback URL', !localhostCallback.ok && localhostCallback.issues.includes('result_url_localhost') && localhostCallback.issues.includes('result_url_not_https'));
        const missingMode = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(Object.assign(Object.assign({}, productionEnv), { PAYNOW_MODE: '' }), { nodeEnv: 'production', requestHost: 'www.mantisafrica.com' });
        record('Production rejects an unspecified Paynow mode', !missingMode.ok && missingMode.issues.includes('mode_required'));
        const wrongHost = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(productionEnv, { nodeEnv: 'production', requestHost: 'staging.example.test' });
        record('Production rejects a callback host that is not this server', !wrongHost.ok && wrongHost.issues.includes('callback_host_mismatch'));
        const azureAlias = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(Object.assign(Object.assign({}, productionEnv), { CANONICAL_HOST: 'www.mantisafrica.com', REDIRECT_FROM_HOSTS: 'mantisafrica.azurewebsites.net' }), { nodeEnv: 'production', requestHost: 'mantisafrica.azurewebsites.net' });
        record('Production accepts the Azure hostname when it redirects to the callback host', azureAlias.ok);
        const localToProduction = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(Object.assign(Object.assign({}, productionEnv), { NODE_ENV: 'development', PAYNOW_MODE: 'test', PAYNOW_MERCHANT_EMAIL: 'merchant@example.test', PAYNOW_CALLBACK_HOST: 'www.mantisafrica.com' }), { nodeEnv: 'development', requestHost: 'localhost:5000' });
        record('A local server cannot send callbacks to the production host', !localToProduction.ok && localToProduction.issues.includes('callback_host_mismatch'));
        const spoofedHost = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(Object.assign(Object.assign({}, productionEnv), { NODE_ENV: 'development', PAYNOW_MODE: 'test', PAYNOW_MERCHANT_EMAIL: 'merchant@example.test' }), { nodeEnv: 'development', requestHost: 'www.mantisafrica.com' });
        record('A spoofed Host header cannot aim a local server at production', !spoofedHost.ok && spoofedHost.issues.includes('callback_host_mismatch'));
        record('Checkout trusts the Host header and ignores X-Forwarded-Host', (0, registrationPaymentPolicy_1.paynowRequestHost)({ host: 'localhost:5000', 'x-forwarded-host': 'www.mantisafrica.com' }) === 'localhost:5000');
        const forwardedSpoof = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(productionEnv, {
            nodeEnv: 'production',
            requestHost: (0, registrationPaymentPolicy_1.paynowRequestHost)({ host: 'evil.example', 'x-forwarded-host': 'www.mantisafrica.com' })
        });
        record('An untrusted hostname is rejected even when a forwarded host names www', forwardedSpoof.issues.includes('callback_host_mismatch') && !forwardedSpoof.ok);
        const testWithoutMerchant = (0, registrationPaymentPolicy_1.evaluatePaynowDeployment)(Object.assign(Object.assign({}, productionEnv), { NODE_ENV: 'development', PAYNOW_MODE: 'test', PAYNOW_MERCHANT_EMAIL: '', PAYNOW_RESULT_URL: 'https://payments.example.test/api/paynow/result', PAYNOW_RETURN_URL: 'https://payments.example.test/api/paynow/return', PUBLIC_BASE_URL: 'https://payments.example.test' }), { nodeEnv: 'development', requestHost: 'payments.example.test' });
        record('Test mode requires the merchant email and does not fall back to live checkout', !testWithoutMerchant.ok && testWithoutMerchant.issues.includes('test_merchant_email_required'));
        const orphan = (0, registrationPaymentPolicy_1.explainUnreconciledPaynowSession)({ found: true, status: 'provider_created', verifiedAuditCount: 0 });
        const absent = (0, registrationPaymentPolicy_1.explainUnreconciledPaynowSession)({ found: false, verifiedAuditCount: 0 });
        record('An unreconciled session is explained without a write', orphan.classification === 'unreconciled' && orphan.writeAllowed === false && absent.classification === 'absent' && absent.writeAllowed === false);
        yield mongoose_1.default.connect(TEST_DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
        if (mongoose_1.default.connection.name !== 'mantis_paynow_lifecycle_test') {
            console.error('FAIL connected database was not the isolated lifecycle database');
            process.exit(1);
        }
        yield mongoose_1.default.connection.dropDatabase();
        const { WebhookEventReceipt } = yield Promise.resolve().then(() => __importStar(require('../models/WebhookEventReceipt')));
        yield Promise.all([
            PaymentSession_1.PaymentSession.syncIndexes(),
            BillingPayment_1.BillingPayment.syncIndexes(),
            WebhookEventReceipt.syncIndexes(),
            AuditLog_1.AuditLog.syncIndexes()
        ]);
        yield Plan_1.Plan.create({ code: 'INDIVIDUAL', name: 'Individual', monthlyPrice: AMOUNT, annualPrice: 200, currency: 'USD', isActive: true });
        yield Plan_1.Plan.create({ code: 'INDIVIDUAL', name: 'Individual', monthlyPrice: AMOUNT, annualPrice: 200, currency: 'USD', isActive: true });
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use(express_1.default.urlencoded({ extended: true }));
        app.use('/api/paynow', paynowRoutes_1.default);
        const server = http_1.default.createServer(app);
        yield new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
        const port = server.address().port;
        try {
            resetDouble();
            const paid = yield world('paid', 'garet.matsi@gmail.com');
            const created = yield request(port, 'POST', '/api/paynow/web/create', paid.token, { paymentSessionId: String(paid.session._id), email: 'garet.matsi@gmail.com' });
            const stored = yield PaymentSession_1.PaymentSession.findById(paid.session._id);
            const subscription = yield Subscription_1.Subscription.findById(paid.subscription._id);
            const initiated = yield AuditLog_1.AuditLog.countDocuments({ entityId: String(paid.session._id), action: 'checkout.initiated' });
            record('A Successful initiation stores USD checkout and does not activate', created.status === 200
                && created.json.redirectUrl === 'https://www.paynow.co.zw/Interface/Process?guid=lifecycle-test'
                && (stored === null || stored === void 0 ? void 0 : stored.status) === 'provider_created'
                && (stored === null || stored === void 0 ? void 0 : stored.currency) === 'USD'
                && (stored === null || stored === void 0 ? void 0 : stored.amount) === AMOUNT
                && (stored === null || stored === void 0 ? void 0 : stored.providerRef) === `SUBS-${paid.company._id.toString()}`
                && ((_a = stored === null || stored === void 0 ? void 0 : stored.rawProviderResponse) === null || _a === void 0 ? void 0 : _a.paynowReference) === '70000001'
                && (subscription === null || subscription === void 0 ? void 0 : subscription.status) === 'past_due'
                && ((_b = paynowLifecyclePreload_1.paynowTestDouble.last) === null || _b === void 0 ? void 0 : _b.amount) === AMOUNT
                && ((_c = paynowLifecyclePreload_1.paynowTestDouble.last) === null || _c === void 0 ? void 0 : _c.email) === 'merchant@example.test'
                && ((_d = stored === null || stored === void 0 ? void 0 : stored.metadata) === null || _d === void 0 ? void 0 : _d.paynowMode) === 'test'
                && ((_e = paynowLifecyclePreload_1.paynowTestDouble.last) === null || _e === void 0 ? void 0 : _e.resultUrl) === 'https://payments.example.test/api/paynow/result'
                && ((_f = paynowLifecyclePreload_1.paynowTestDouble.last) === null || _f === void 0 ? void 0 : _f.integrationId) === '90001'
                && initiated === 1, `http ${created.status} session ${stored === null || stored === void 0 ? void 0 : stored.status} subscription ${subscription === null || subscription === void 0 ? void 0 : subscription.status}`);
            resetDouble();
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = String((stored === null || stored === void 0 ? void 0 : stored.providerRef) || '');
            const again = yield request(port, 'POST', '/api/paynow/web/create', paid.token, { paymentSessionId: String(paid.session._id) });
            record('A An open checkout is not sent to Paynow a second time', again.status === 200 && paynowLifecyclePreload_1.paynowTestDouble.sends === 0);
            resetDouble();
            process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
            const merchant = yield world('merchant-email');
            yield request(port, 'POST', '/api/paynow/web/create', merchant.token, { paymentSessionId: String(merchant.session._id), email: 'garet.matsi@gmail.com' });
            record('A Test mode authemail uses the configured merchant login email', ((_g = paynowLifecyclePreload_1.paynowTestDouble.last) === null || _g === void 0 ? void 0 : _g.email) === 'merchant@example.test');
            resetDouble();
            delete process.env.PAYNOW_MERCHANT_EMAIL;
            const missingMerchant = yield world('missing-merchant-email');
            const missingMerchantCheckout = yield request(port, 'POST', '/api/paynow/web/create', missingMerchant.token, { paymentSessionId: String(missingMerchant.session._id), email: 'buyer@example.test' });
            process.env.PAYNOW_MERCHANT_EMAIL = 'merchant@example.test';
            record('A Test mode without a merchant email does not start a payment', missingMerchantCheckout.status === 503
                && missingMerchantCheckout.json.code === 'PAYNOW_TEST_MERCHANT_EMAIL_REQUIRED'
                && paynowLifecyclePreload_1.paynowTestDouble.sends === 0
                && ((_h = (yield Subscription_1.Subscription.findById(missingMerchant.subscription._id))) === null || _h === void 0 ? void 0 : _h.status) === 'past_due');
            for (const [mode, label] of [
                ['rejected', 'B Rejected initiation does not activate'],
                ['malformed', 'B Malformed initiation does not activate'],
                ['throw-hash', 'B Invalid initiation hash does not activate'],
                ['timeout', 'B Initiation timeout does not activate']
            ]) {
                resetDouble();
                paynowLifecyclePreload_1.paynowTestDouble.mode = mode;
                const row = yield world(mode);
                const response = yield request(port, 'POST', '/api/paynow/web/create', row.token, { paymentSessionId: String(row.session._id), email: 'buyer@example.test' });
                const current = yield Subscription_1.Subscription.findById(row.subscription._id);
                const session = yield PaymentSession_1.PaymentSession.findById(row.session._id);
                record(label, response.status >= 400 && (current === null || current === void 0 ? void 0 : current.status) === 'past_due' && (session === null || session === void 0 ? void 0 : session.status) === 'pending', `http ${response.status} ${session === null || session === void 0 ? void 0 : session.status}`);
            }
            resetDouble();
            const previousKey = process.env.PAYNOW_INTEGRATION_KEY;
            delete process.env.PAYNOW_INTEGRATION_KEY;
            const missingKey = yield world('missing-key');
            const missing = yield request(port, 'POST', '/api/paynow/web/create', missingKey.token, { paymentSessionId: String(missingKey.session._id) });
            process.env.PAYNOW_INTEGRATION_KEY = previousKey;
            const missingSubscription = yield Subscription_1.Subscription.findById(missingKey.subscription._id);
            record('B Missing credentials do not activate', missing.status === 503 && missing.json.code === 'PAYNOW_NOT_CONFIGURED' && (missingSubscription === null || missingSubscription === void 0 ? void 0 : missingSubscription.status) === 'past_due');
            resetDouble();
            const unauthenticated = yield request(port, 'POST', '/api/paynow/web/create', undefined, { paymentSessionId: String(paid.session._id) });
            record('I Unauthenticated checkout is rejected', unauthenticated.status === 401);
            resetDouble();
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${paid.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Paid';
            const notice = statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference);
            const first = yield request(port, 'POST', '/api/paynow/result', undefined, notice, 'application/x-www-form-urlencoded');
            const second = yield request(port, 'POST', '/api/paynow/result', undefined, notice, 'application/x-www-form-urlencoded');
            const paidSession = yield PaymentSession_1.PaymentSession.findById(paid.session._id);
            const paidSubscription = yield Subscription_1.Subscription.findById(paid.subscription._id);
            const paidBilling = yield BillingPayment_1.BillingPayment.findById(paid.billing._id);
            const paidCompany = yield Company_1.Company.findById(paid.company._id);
            const verifiedAudits = yield AuditLog_1.AuditLog.countDocuments({ entityId: String(paid.session._id), action: 'payment.verified' });
            record('C Valid notification and poll activate once', first.status === 200 && first.json.activated === true && (paidSession === null || paidSession === void 0 ? void 0 : paidSession.status) === 'reconciled' && (paidSubscription === null || paidSubscription === void 0 ? void 0 : paidSubscription.status) === 'active' && (paidBilling === null || paidBilling === void 0 ? void 0 : paidBilling.status) === 'paid' && (paidCompany === null || paidCompany === void 0 ? void 0 : paidCompany.onboardingStatus) === 'INITIALIZING_WORKSPACE' && verifiedAudits === 1, `http ${first.status} session ${paidSession === null || paidSession === void 0 ? void 0 : paidSession.status} audits ${verifiedAudits}`);
            record('E Duplicate notification does not activate again', second.status === 200 && second.json.status === 'duplicate' && second.json.activated === false && verifiedAudits === 1 && (paidBilling === null || paidBilling === void 0 ? void 0 : paidBilling.status) === 'paid');
            resetDouble();
            const newPaynowIp = yield world('new-paynow-ip');
            yield request(port, 'POST', '/api/paynow/web/create', newPaynowIp.token, { paymentSessionId: String(newPaynowIp.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Paid';
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${newPaynowIp.company._id.toString()}`;
            const newIpNotice = statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference);
            const newIpResult = yield request(port, 'POST', '/api/paynow/result', undefined, newIpNotice, 'application/x-www-form-urlencoded', 'payments.example.test', { 'X-Forwarded-For': '196.43.102.11' });
            record('A valid notification presented as the new Paynow address is accepted', newIpResult.status === 200 && newIpResult.json.activated === true && ((_j = (yield Subscription_1.Subscription.findById(newPaynowIp.subscription._id))) === null || _j === void 0 ? void 0 : _j.status) === 'active');
            const newIpDuplicate = yield request(port, 'POST', '/api/paynow/result', undefined, newIpNotice, 'application/x-www-form-urlencoded', 'payments.example.test', { 'X-Forwarded-For': '196.43.102.11' });
            record('A repeated notification from the new Paynow address does not activate again', newIpDuplicate.json.status === 'duplicate' && newIpDuplicate.json.activated === false && (yield AuditLog_1.AuditLog.countDocuments({ entityId: String(newPaynowIp.session._id), action: 'payment.verified' })) === 1);
            resetDouble();
            const otherSource = yield world('other-source-ip');
            yield request(port, 'POST', '/api/paynow/web/create', otherSource.token, { paymentSessionId: String(otherSource.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Paid';
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${otherSource.company._id.toString()}`;
            const otherNotice = statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference);
            const otherResult = yield request(port, 'POST', '/api/paynow/result', undefined, otherNotice, 'application/x-www-form-urlencoded', 'payments.example.test', { 'X-Forwarded-For': '203.0.113.10' });
            record('The result endpoint does not reject a valid notification because of its source address', otherResult.status === 200 && otherResult.json.activated === true && ((_k = (yield Subscription_1.Subscription.findById(otherSource.subscription._id))) === null || _k === void 0 ? void 0 : _k.status) === 'active');
            resetDouble();
            const spoofedIp = yield world('spoofed-paynow-ip');
            yield request(port, 'POST', '/api/paynow/web/create', spoofedIp.token, { paymentSessionId: String(spoofedIp.session._id) });
            const spoofedNotice = statusMessage('Paid', `SUBS-${spoofedIp.company._id.toString()}`).replace(/hash=[^&]+/, 'hash=NOTVALID');
            const spoofedResult = yield request(port, 'POST', '/api/paynow/result', undefined, spoofedNotice, 'application/x-www-form-urlencoded', 'payments.example.test', { 'X-Forwarded-For': '196.43.102.11' });
            record('A forwarded Paynow address does not bypass hash verification', spoofedResult.status === 401 && ((_l = (yield Subscription_1.Subscription.findById(spoofedIp.subscription._id))) === null || _l === void 0 ? void 0 : _l.status) === 'past_due' && ((_m = (yield PaymentSession_1.PaymentSession.findById(spoofedIp.session._id))) === null || _m === void 0 ? void 0 : _m.status) === 'provider_created');
            resetDouble();
            const badHash = yield world('bad-hash');
            yield request(port, 'POST', '/api/paynow/web/create', badHash.token, { paymentSessionId: String(badHash.session._id) });
            const tampered = statusMessage('Paid', `SUBS-${badHash.company._id.toString()}`).replace(/hash=[^&]+/, 'hash=NOTVALID');
            const rejected = yield request(port, 'POST', '/api/paynow/result', undefined, tampered, 'application/x-www-form-urlencoded');
            const badSubscription = yield Subscription_1.Subscription.findById(badHash.subscription._id);
            record('D Invalid hash is rejected', rejected.status === 401 && (badSubscription === null || badSubscription === void 0 ? void 0 : badSubscription.status) === 'past_due');
            const missingHash = yield request(port, 'POST', '/api/paynow/result', undefined, `reference=SUBS-${badHash.company._id.toString()}&status=Paid&amount=19.00`, 'application/x-www-form-urlencoded');
            record('D Missing hash is rejected', missingHash.status === 401 && (badSubscription === null || badSubscription === void 0 ? void 0 : badSubscription.status) === 'past_due');
            resetDouble();
            const activeBeforeUnknown = yield Subscription_1.Subscription.countDocuments({ status: 'active' });
            const unknown = yield request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', 'SUBS-does-not-exist'), 'application/x-www-form-urlencoded');
            record('D Unknown reference does not activate a subscription', unknown.status === 200 && unknown.json.activated !== true && (yield Subscription_1.Subscription.countDocuments({ status: 'active' })) === activeBeforeUnknown);
            resetDouble();
            const other = yield world('other-company');
            const foreign = yield request(port, 'POST', '/api/paynow/confirm', other.token, { reference: `SUBS-${paid.company._id.toString()}` });
            const otherSubscription = yield Subscription_1.Subscription.findById(other.subscription._id);
            record('I Another company cannot confirm this payment', foreign.status === 404 && (otherSubscription === null || otherSubscription === void 0 ? void 0 : otherSubscription.status) === 'past_due');
            const anonymousConfirm = yield request(port, 'POST', '/api/paynow/confirm', undefined, { reference: `SUBS-${paid.company._id.toString()}` });
            record('I Unauthenticated confirm is rejected', anonymousConfirm.status === 401);
            resetDouble();
            const pending = yield world('pending');
            yield request(port, 'POST', '/api/paynow/web/create', pending.token, { paymentSessionId: String(pending.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Sent';
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${pending.company._id.toString()}`;
            const pendingNotice = yield request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference), 'application/x-www-form-urlencoded');
            const pendingSubscription = yield Subscription_1.Subscription.findById(pending.subscription._id);
            const pendingSession = yield PaymentSession_1.PaymentSession.findById(pending.session._id);
            record('G Pending poll does not activate even when the notice says Paid', pendingNotice.status === 200 && pendingNotice.json.activated !== true && (pendingSubscription === null || pendingSubscription === void 0 ? void 0 : pendingSubscription.status) === 'past_due' && (pendingSession === null || pendingSession === void 0 ? void 0 : pendingSession.status) === 'provider_created');
            const returned = yield request(port, 'GET', `/api/paynow/return?reference=SUBS-${pending.company._id.toString()}`, undefined);
            const afterReturn = yield Subscription_1.Subscription.findById(pending.subscription._id);
            record('F Browser return does not activate a pending payment', returned.status === 302 && returned.location.includes('/billing/return') && (afterReturn === null || afterReturn === void 0 ? void 0 : afterReturn.status) === 'past_due');
            resetDouble();
            const low = yield world('low-amount');
            yield request(port, 'POST', '/api/paynow/web/create', low.token, { paymentSessionId: String(low.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${low.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Paid';
            paynowLifecyclePreload_1.paynowTestDouble.pollAmount = '1.00';
            const lowNotice = yield request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference, '1.00'), 'application/x-www-form-urlencoded');
            const lowSubscription = yield Subscription_1.Subscription.findById(low.subscription._id);
            record('H Lower amount is rejected', lowNotice.status === 200 && lowNotice.json.status === 'ignored' && (lowSubscription === null || lowSubscription === void 0 ? void 0 : lowSubscription.status) === 'past_due');
            resetDouble();
            const high = yield world('high-amount');
            yield request(port, 'POST', '/api/paynow/web/create', high.token, { paymentSessionId: String(high.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${high.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Paid';
            paynowLifecyclePreload_1.paynowTestDouble.pollAmount = '250.00';
            const highNotice = yield request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference, '250.00'), 'application/x-www-form-urlencoded');
            record('H Higher amount is rejected', highNotice.json.status === 'ignored' && ((_o = (yield Subscription_1.Subscription.findById(high.subscription._id))) === null || _o === void 0 ? void 0 : _o.status) === 'past_due');
            resetDouble();
            const wrongCurrency = yield world('wrong-currency');
            yield request(port, 'POST', '/api/paynow/web/create', wrongCurrency.token, { paymentSessionId: String(wrongCurrency.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${wrongCurrency.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Paid';
            paynowLifecyclePreload_1.paynowTestDouble.pollCurrency = 'ZWL';
            const currencyNotice = yield request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference, AMOUNT.toFixed(2), 'ZWL'), 'application/x-www-form-urlencoded');
            record('H Wrong currency is rejected', currencyNotice.json.status === 'ignored' && ((_p = (yield Subscription_1.Subscription.findById(wrongCurrency.subscription._id))) === null || _p === void 0 ? void 0 : _p.status) === 'past_due');
            resetDouble();
            const noCurrency = yield world('no-currency');
            yield request(port, 'POST', '/api/paynow/web/create', noCurrency.token, { paymentSessionId: String(noCurrency.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${noCurrency.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Paid';
            const noCurrencyNotice = yield request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference), 'application/x-www-form-urlencoded');
            record('H Missing currency is accepted because Paynow status updates omit it', noCurrencyNotice.json.activated === true && ((_q = (yield Subscription_1.Subscription.findById(noCurrency.subscription._id))) === null || _q === void 0 ? void 0 : _q.status) === 'active');
            resetDouble();
            const cancelled = yield world('cancelled');
            yield request(port, 'POST', '/api/paynow/web/create', cancelled.token, { paymentSessionId: String(cancelled.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${cancelled.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Cancelled';
            const cancelledNotice = yield request(port, 'POST', '/api/paynow/result', undefined, statusMessage('Cancelled', paynowLifecyclePreload_1.paynowTestDouble.pollReference), 'application/x-www-form-urlencoded');
            const cancelledSession = yield PaymentSession_1.PaymentSession.findById(cancelled.session._id);
            record('G Cancelled poll does not activate', cancelledNotice.json.activated !== true && (cancelledSession === null || cancelledSession === void 0 ? void 0 : cancelledSession.status) === 'cancelled' && ((_r = (yield Subscription_1.Subscription.findById(cancelled.subscription._id))) === null || _r === void 0 ? void 0 : _r.status) === 'past_due');
            resetDouble();
            const failed = yield world('failed');
            yield request(port, 'POST', '/api/paynow/web/create', failed.token, { paymentSessionId: String(failed.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${failed.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollFault = 'bad-hash';
            const failedPoll = yield request(port, 'POST', '/api/paynow/confirm', failed.token, { reference: paynowLifecyclePreload_1.paynowTestDouble.pollReference });
            record('G Invalid poll hash does not activate', failedPoll.status === 500 && ((_s = (yield Subscription_1.Subscription.findById(failed.subscription._id))) === null || _s === void 0 ? void 0 : _s.status) === 'past_due');
            resetDouble();
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${failed.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollFault = 'timeout';
            const timedOut = yield request(port, 'POST', '/api/paynow/confirm', failed.token, { reference: paynowLifecyclePreload_1.paynowTestDouble.pollReference });
            record('G Poll timeout does not activate', timedOut.status === 500 && ((_t = (yield Subscription_1.Subscription.findById(failed.subscription._id))) === null || _t === void 0 ? void 0 : _t.status) === 'past_due');
            resetDouble();
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${failed.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollFault = 'down';
            const down = yield request(port, 'POST', '/api/paynow/confirm', failed.token, { reference: paynowLifecyclePreload_1.paynowTestDouble.pollReference });
            record('G Unavailable poll endpoint does not activate', down.status === 500 && ((_u = (yield Subscription_1.Subscription.findById(failed.subscription._id))) === null || _u === void 0 ? void 0 : _u.status) === 'past_due');
            resetDouble();
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${failed.company._id.toString()}`;
            paynowLifecyclePreload_1.paynowTestDouble.pollFault = 'malformed';
            const malformed = yield request(port, 'POST', '/api/paynow/confirm', failed.token, { reference: paynowLifecyclePreload_1.paynowTestDouble.pollReference });
            record('G Malformed poll does not activate', malformed.status === 500 && ((_v = (yield Subscription_1.Subscription.findById(failed.subscription._id))) === null || _v === void 0 ? void 0 : _v.status) === 'past_due');
            const outside = paynowLifecyclePreload_1.paynowTestDouble.urls.filter((url) => { try {
                return new URL(url).host !== 'www.paynow.co.zw';
            }
            catch (_a) {
                return true;
            } });
            resetDouble();
            const wrongHostCheckout = yield world('wrong-host');
            delete process.env.PAYNOW_CALLBACK_HOST;
            const rejectedHost = yield request(port, 'POST', '/api/paynow/web/create', wrongHostCheckout.token, { paymentSessionId: String(wrongHostCheckout.session._id) }, 'application/json', 'localhost:5000');
            process.env.PAYNOW_CALLBACK_HOST = 'payments.example.test';
            record('A checkout from this server is rejected when the callback host differs', rejectedHost.status === 503
                && rejectedHost.json.code === 'PAYNOW_CALLBACK_URL_REJECTED'
                && rejectedHost.json.issue === 'callback_host_mismatch'
                && paynowLifecyclePreload_1.paynowTestDouble.sends === 0
                && ((_w = (yield PaymentSession_1.PaymentSession.findById(wrongHostCheckout.session._id))) === null || _w === void 0 ? void 0 : _w.status) === 'pending');
            resetDouble();
            const modeMismatch = yield world('mode-mismatch');
            yield request(port, 'POST', '/api/paynow/web/create', modeMismatch.token, { paymentSessionId: String(modeMismatch.session._id) });
            paynowLifecyclePreload_1.paynowTestDouble.pollStatus = 'Paid';
            paynowLifecyclePreload_1.paynowTestDouble.pollReference = `SUBS-${modeMismatch.company._id.toString()}`;
            process.env.PAYNOW_MODE = 'live';
            const blockedNotice = statusMessage('Paid', paynowLifecyclePreload_1.paynowTestDouble.pollReference);
            const blocked = yield request(port, 'POST', '/api/paynow/result', undefined, blockedNotice, 'application/x-www-form-urlencoded');
            const blockedSubscription = yield Subscription_1.Subscription.findById(modeMismatch.subscription._id);
            record('A test checkout is not activated while the server is in live mode', blocked.status === 200 && blocked.json.activated !== true && (blockedSubscription === null || blockedSubscription === void 0 ? void 0 : blockedSubscription.status) === 'past_due' && ((_x = (yield PaymentSession_1.PaymentSession.findById(modeMismatch.session._id))) === null || _x === void 0 ? void 0 : _x.status) === 'provider_created');
            process.env.PAYNOW_MODE = 'test';
            const retried = yield request(port, 'POST', '/api/paynow/result', undefined, blockedNotice, 'application/x-www-form-urlencoded');
            const retriedAudits = yield AuditLog_1.AuditLog.countDocuments({ entityId: String(modeMismatch.session._id), action: 'payment.verified' });
            record('A failed callback can be retried once the mode matches', retried.json.activated === true && retriedAudits === 1 && ((_y = (yield Subscription_1.Subscription.findById(modeMismatch.subscription._id))) === null || _y === void 0 ? void 0 : _y.status) === 'active');
            const retriedAgain = yield request(port, 'POST', '/api/paynow/result', undefined, blockedNotice, 'application/x-www-form-urlencoded');
            record('The retried callback does not activate the subscription again', retriedAgain.json.status === 'duplicate' && retriedAgain.json.activated === false && (yield AuditLog_1.AuditLog.countDocuments({ entityId: String(modeMismatch.session._id), action: 'payment.verified' })) === 1);
            record('J Tests stayed on the isolated database and the Paynow stand-in', mongoose_1.default.connection.name === 'mantis_paynow_lifecycle_test'
                && (0, registrationPaymentPolicy_1.paynowConfigurationState)().mode === 'test'
                && process.env.PAYNOW_INTEGRATION_KEY === KEY
                && outside.length === 0);
        }
        finally {
            yield new Promise((resolve) => server.close(() => resolve()));
            yield mongoose_1.default.disconnect();
        }
        const failed = checks.filter((check) => !check.ok);
        console.log(`${checks.length - failed.length}/${checks.length} Paynow lifecycle checks passed`);
        process.exit(failed.length === 0 ? 0 : 1);
    });
}
main().catch((error) => {
    console.error(String((error === null || error === void 0 ? void 0 : error.stack) || (error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 2000));
    process.exit(1);
});
