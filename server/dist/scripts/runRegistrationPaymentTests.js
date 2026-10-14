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
 * Registration and subscription-payment checks.
 * Uses the local development database and disposable fixtures.
 * Does not call Paynow and does not move money.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
const publicSignupCompany_1 = require("../utils/publicSignupCompany");
const registrationPaymentPolicy_1 = require("../services/registrationPaymentPolicy");
const abandonedRegistrationService_1 = require("../services/abandonedRegistrationService");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const checks = [];
function record(name, ok, detail = '') {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function tokenFor(user) {
    const { JWT_CONFIG } = require('../config/jwt');
    const jwt = require('jsonwebtoken');
    return jwt.sign({
        userId: String(user._id),
        role: user.role,
        roles: user.roles,
        sessionVersion: 1,
        companyId: user.companyId ? String(user.companyId) : undefined,
        type: 'access'
    }, JWT_CONFIG.SECRET, { expiresIn: '2h', issuer: JWT_CONFIG.ISSUER, audience: JWT_CONFIG.AUDIENCE });
}
function request(port, method, requestPath, token, body) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            hostname: '127.0.0.1',
            port,
            method,
            path: requestPath,
            headers: Object.assign(Object.assign({}, (token ? { Authorization: `Bearer ${token}` } : {})), (payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})),
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
function registrationInput(stamp, suffix, key, registrationMode = 'trial', plan = 'INDIVIDUAL', billingCycle = 'monthly') {
    return {
        email: `${stamp}-${suffix}@example.test`,
        password: 'Register1pay',
        name: 'Registration Admin',
        plan,
        billingCycle,
        registrationMode,
        company: {
            name: `${stamp} ${suffix}`,
            email: `${stamp}-${suffix}@example.test`,
            address: '1 Test Close',
            phone: '0772000000',
            registrationNumber: `${stamp}-${suffix}-REG`,
            tinNumber: `${stamp}-${suffix}-TIN`,
            country: 'Zimbabwe',
            companyType: 'REGISTERED_BUSINESS',
            workspaceType: 'individual'
        },
        idempotencyKey: key || `${stamp}-${suffix}`
    };
}
function runStaticChecks() {
    record('Production signup stays closed unless explicitly allowed', (0, publicSignupCompany_1.isPublicSignupAllowed)({ NODE_ENV: 'production' }) === false
        && (0, publicSignupCompany_1.isPublicSignupAllowed)({ NODE_ENV: 'production', ALLOW_PUBLIC_SIGNUP: 'true' }) === true);
    record('Abandoned paid registrations are retained for 7 days by default', (0, abandonedRegistrationService_1.abandonedRegistrationRetentionMs)({}) === 7 * 86400000
        && (0, abandonedRegistrationService_1.abandonedRegistrationRetentionMs)({ ABANDONED_REGISTRATION_RETENTION_DAYS: '3' }) === 3 * 86400000);
    record('Payment hold is explicit and trial remains the default', (0, registrationPaymentPolicy_1.registrationCreatesPaymentHold)({}) === false
        && (0, registrationPaymentPolicy_1.registrationCreatesPaymentHold)({ REGISTRATION_PAYMENT_REQUIRED: 'true' }) === true);
    record('Configured Individual monthly price is used', (0, registrationPaymentPolicy_1.configuredPlanCharge)('INDIVIDUAL', 'monthly') === 250);
    record('A plan without a positive price is not invented', (0, registrationPaymentPolicy_1.configuredPlanCharge)('NOT_A_PLAN', 'monthly') === null);
    record('Weak passwords are rejected', (0, registrationPaymentPolicy_1.registrationPasswordError)('short') !== null && (0, registrationPaymentPolicy_1.registrationPasswordError)('Register1pay') === null);
    record('Wrong amount is rejected', (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: 250, currency: 'USD', providerRef: 'SUBS-1' }, { status: 'Paid', amount: 10, reference: 'SUBS-1' }).outcome === 'rejected');
    record('Wrong currency is rejected', (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: 250, currency: 'USD', providerRef: 'SUBS-1' }, { status: 'Paid', amount: 250, currency: 'ZWL', reference: 'SUBS-1' }).outcome === 'rejected');
    record('Mismatched reference is rejected', (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: 250, currency: 'USD', providerRef: 'SUBS-1' }, { status: 'Paid', amount: 250, reference: 'OTHER' }).outcome === 'rejected');
    record('Matching paid poll is accepted', (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: 250, currency: 'USD', providerRef: 'SUBS-1' }, { status: 'Paid', amount: '250.00', reference: 'SUBS-1' }).outcome === 'paid');
    record('Cancelled and pending polls do not count as paid', (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: 250, currency: 'USD' }, { status: 'Cancelled', amount: 250 }).outcome === 'failed'
        && (0, registrationPaymentPolicy_1.evaluateProviderPoll)({ amount: 250, currency: 'USD' }, { status: 'Sent', amount: 250 }).outcome === 'pending');
    record('Poll URLs must be Paynow HTTPS', (0, registrationPaymentPolicy_1.isAllowedPaynowPollUrl)('https://www.paynow.co.zw/interface/pollstatus')
        && !(0, registrationPaymentPolicy_1.isAllowedPaynowPollUrl)('http://www.paynow.co.zw/interface/pollstatus')
        && !(0, registrationPaymentPolicy_1.isAllowedPaynowPollUrl)('https://127.0.0.1/poll'));
    const payload = { reference: 'SUBS-1', amount: '250.00', status: 'Paid' };
    payload.hash = (0, registrationPaymentPolicy_1.paynowPayloadHash)(payload, 'integration-key');
    record('Valid Paynow hash is accepted and a bad hash is rejected', (0, registrationPaymentPolicy_1.verifyPaynowPayload)(payload, 'integration-key')
        && !(0, registrationPaymentPolicy_1.verifyPaynowPayload)(Object.assign(Object.assign({}, payload), { hash: 'not-the-hash' }), 'integration-key'));
    record('Missing Paynow credentials are unconfigured and modes stay distinct', (0, registrationPaymentPolicy_1.paynowConfigurationState)({}).mode === 'unconfigured'
        && (0, registrationPaymentPolicy_1.paynowConfigurationState)({ PAYNOW_INTEGRATION_ID: 'id', PAYNOW_INTEGRATION_KEY: 'key', PAYNOW_MODE: 'test' }).mode === 'test'
        && (0, registrationPaymentPolicy_1.paynowConfigurationState)({ PAYNOW_INTEGRATION_ID: 'id', PAYNOW_INTEGRATION_KEY: 'key', PAYNOW_MODE: 'live' }).mode === 'live');
    record('Production API configuration does not keep a localhost base', (0, registrationPaymentPolicy_1.productionApiUrl)('http://localhost:5000/api', 'production', 'https://www.mantisafrica.com') === 'https://www.mantisafrica.com/api');
    const trialOffer = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'SME', registrationMode: 'trial', billingCycle: 'yearly' });
    const landlordMonthly = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'INDIVIDUAL', registrationMode: 'paid', billingCycle: 'monthly' });
    const landlordYearly = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'INDIVIDUAL', registrationMode: 'paid', billingCycle: 'yearly' });
    const managerMonthly = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'SME', registrationMode: 'paid', billingCycle: 'monthly' });
    const managerYearly = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'SME', registrationMode: 'paid', billingCycle: 'yearly' });
    const enterpriseClosed = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'ENTERPRISE', registrationMode: 'paid', billingCycle: 'monthly' }, {});
    const enterpriseOpen = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'ENTERPRISE', registrationMode: 'paid', billingCycle: 'monthly' }, { ENTERPRISE_DIRECT_CHECKOUT: 'true' });
    const weekly = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({ plan: 'INDIVIDUAL', registrationMode: 'paid', billingCycle: 'weekly' });
    record('Free trial registration does not require payment', Boolean(trialOffer.ok && trialOffer.mode === 'trial' && trialOffer.plan === 'INDIVIDUAL' && trialOffer.paymentRequired === false));
    record('Landlord and Property Manager prices resolve for monthly and yearly', Boolean(landlordMonthly.ok && landlordYearly.ok && managerMonthly.ok && managerYearly.ok)
        && (0, registrationPaymentPolicy_1.configuredPlanCharge)('INDIVIDUAL', 'monthly') === 250
        && (0, registrationPaymentPolicy_1.configuredPlanCharge)('INDIVIDUAL', 'yearly') === 3000
        && (0, registrationPaymentPolicy_1.configuredPlanCharge)('SME', 'monthly') === 600
        && (0, registrationPaymentPolicy_1.configuredPlanCharge)('SME', 'yearly') === 7200);
    record('Enterprise does not enter direct checkout unless configured', !enterpriseClosed.ok && enterpriseClosed.ok === false && enterpriseClosed.code === 'ENTERPRISE_SALES_ONLY'
        && enterpriseOpen.ok && enterpriseOpen.mode === 'paid');
    record('An unsupported billing frequency is rejected', !weekly.ok && weekly.ok === false && weekly.code === 'UNSUPPORTED_BILLING_CYCLE');
    record('Pending registration does not open the workspace', (0, registrationPaymentPolicy_1.companyAwaitingRegistrationPayment)('PENDING_PAYMENT')
        && !(0, registrationPaymentPolicy_1.companyAwaitingRegistrationPayment)('ACTIVE')
        && !(0, registrationPaymentPolicy_1.companyAwaitingRegistrationPayment)('INITIALIZING_WORKSPACE'));
}
function runDatabaseChecks() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        if (process.env.NODE_ENV === 'production') {
            record('Database registration checks were not run against production', true, 'NODE_ENV=production');
            return;
        }
        const { connectDatabase, closeDatabase } = yield Promise.resolve().then(() => __importStar(require('../config/database')));
        const { OnboardingService } = yield Promise.resolve().then(() => __importStar(require('../services/onboardingService')));
        const { applyPolledPayment } = yield Promise.resolve().then(() => __importStar(require('../services/applyPolledPayment')));
        const { User } = yield Promise.resolve().then(() => __importStar(require('../models/User')));
        const { Company } = yield Promise.resolve().then(() => __importStar(require('../models/Company')));
        const { Subscription } = yield Promise.resolve().then(() => __importStar(require('../models/Subscription')));
        const { PaymentSession } = yield Promise.resolve().then(() => __importStar(require('../models/PaymentSession')));
        const { BillingPayment } = yield Promise.resolve().then(() => __importStar(require('../models/BillingPayment')));
        const { OnboardingSession } = yield Promise.resolve().then(() => __importStar(require('../models/OnboardingSession')));
        const { WebhookEventReceipt } = yield Promise.resolve().then(() => __importStar(require('../models/WebhookEventReceipt')));
        const paynowRoutes = (yield Promise.resolve().then(() => __importStar(require('../routes/paynowRoutes')))).default;
        const { ensurePaymentSessionProviderRefIndex } = yield Promise.resolve().then(() => __importStar(require('../services/paymentSessionReferenceIndex')));
        yield connectDatabase();
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use(express_1.default.urlencoded({ extended: true }));
        app.get('/api/workspace', auth_1.authWithCompany, (req, res) => { var _a; return res.json({ ok: true, companyId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId }); });
        app.use('/api/paynow', paynowRoutes);
        app.use(errorHandler_1.errorHandler);
        const server = http_1.default.createServer(app);
        yield new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const service = OnboardingService.getInstance();
        const stamp = `REGPAY${Date.now().toString().slice(-8)}`;
        const previousKey = process.env.PAYNOW_INTEGRATION_KEY;
        const previousMode = process.env.PAYNOW_MODE;
        process.env.PAYNOW_INTEGRATION_KEY = 'registration-test-key';
        process.env.PAYNOW_MODE = 'test';
        const createdCompanyIds = [];
        const startedAt = new Date();
        const rentalPaymentsBefore = yield mongoose_1.default.connection.collection('payments').countDocuments();
        try {
            const beforeUsers = yield User.countDocuments({ email: `${stamp}-invalid@example.test` });
            let invalidRejected = false;
            try {
                yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'invalid')), { password: 'short' }));
            }
            catch (error) {
                invalidRejected = (error === null || error === void 0 ? void 0 : error.code) === 'VALIDATION_ERROR';
            }
            const afterUsers = yield User.countDocuments({ email: `${stamp}-invalid@example.test` });
            record('Invalid registration is rejected without creating a user', invalidRejected && beforeUsers === afterUsers);
            let partialRejected = false;
            try {
                yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'partial')), { company: Object.assign(Object.assign({}, registrationInput(stamp, 'partial').company), { address: '', phone: '' }) }));
            }
            catch (error) {
                partialRejected = (error === null || error === void 0 ? void 0 : error.statusCode) === 400 || (error === null || error === void 0 ? void 0 : error.statusCode) === 500;
            }
            const partialUser = yield User.findOne({ email: `${stamp}-partial@example.test` });
            const partialCompany = yield Company.findOne({ email: `${stamp}-partial@example.test` });
            record('A failed company save does not leave an administrator without a company', partialRejected && !partialUser && !partialCompany);
            const first = yield service.start(registrationInput(stamp, 'trial', `${stamp}-trial`));
            createdCompanyIds.push(first.company._id);
            const repeat = yield service.start(registrationInput(stamp, 'trial', `${stamp}-trial`));
            const companyCount = yield Company.countDocuments({ _id: first.company._id });
            const admin = yield User.findById(first.user._id);
            record('A valid registration creates the company and its administrator', Boolean(((_a = first.company) === null || _a === void 0 ? void 0 : _a._id) && ((_b = first.user) === null || _b === void 0 ? void 0 : _b._id)));
            record('The initial administrator is a company admin and not a system administrator', (admin === null || admin === void 0 ? void 0 : admin.role) === 'admin' && !((admin === null || admin === void 0 ? void 0 : admin.roles) || []).includes('system_admin'));
            record('The administrator belongs to the new company', String(admin === null || admin === void 0 ? void 0 : admin.companyId) === String(first.company._id));
            const trialSessions = yield PaymentSession.countDocuments({ companyId: first.company._id });
            const trialDays = (new Date(first.subscription.trialEndDate).getTime() - new Date(first.subscription.trialStartDate).getTime()) / 86400000;
            record('Repeated registration does not create a second company or restart the trial', repeat.alreadyProcessed === true
                && companyCount === 1
                && new Date(repeat.subscription.trialEndDate).getTime() === new Date(first.subscription.trialEndDate).getTime());
            record('Free trial registration creates an active company without a Paynow session', first.company.tenantStatus === 'active'
                && first.company.onboardingStatus === 'ACTIVE'
                && first.company.plan === 'INDIVIDUAL'
                && first.subscription.status === 'trial'
                && first.subscription.trialDurationDays === 14
                && trialDays > 13.9
                && trialDays < 14.1
                && !first.paymentSession
                && trialSessions === 0
                && ((_c = first.company.featureFlags) === null || _c === void 0 ? void 0 : _c.onlinePaymentsEnabled) !== true);
            const trialEndBefore = new Date(first.subscription.trialEndDate).getTime();
            const trialStartBefore = new Date(first.subscription.trialStartDate).getTime();
            let takeoverBlocked = false;
            let takeoverMessage = '';
            try {
                yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'takeover', `${stamp}-takeover`)), { email: first.user.email, password: 'Wrongpass1' }));
            }
            catch (error) {
                takeoverBlocked = (error === null || error === void 0 ? void 0 : error.code) === 'REGISTRATION_SIGN_IN_REQUIRED';
                takeoverMessage = String((error === null || error === void 0 ? void 0 : error.message) || '');
            }
            const resumedTrial = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'resume-trial', `${stamp}-resume-trial`)), { email: first.user.email }));
            record('An unauthenticated person cannot take over another user\'s pending registration', takeoverBlocked
                && !takeoverMessage.includes(String(first.company._id))
                && !takeoverMessage.toLowerCase().includes('payment')
                && (yield Company.countDocuments({ _id: first.company._id })) === 1);
            record('Retrying an active trial does not create another company or change trial dates', String(resumedTrial.company._id) === String(first.company._id)
                && new Date(resumedTrial.subscription.trialEndDate).getTime() === trialEndBefore
                && new Date(resumedTrial.subscription.trialStartDate).getTime() === trialStartBefore
                && resumedTrial.subscription.status === 'trial'
                && (yield Company.countDocuments({ normalizedEmail: String(first.user.email) })) === 1);
            let duplicateCompany = false;
            try {
                yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'tin', `${stamp}-tin`)), { company: Object.assign(Object.assign({}, registrationInput(stamp, 'tin').company), { tinNumber: first.company.tinNumber }) }));
            }
            catch (error) {
                duplicateCompany = (error === null || error === void 0 ? void 0 : error.code) === 'DUPLICATE_COMPANY';
            }
            record('Duplicate company registration is rejected', duplicateCompany);
            const blankLandlord = Object.assign(Object.assign({}, registrationInput(stamp, 'blankid', `${stamp}-blankid`)), { company: Object.assign(Object.assign({}, registrationInput(stamp, 'blankid').company), { companyType: 'INDIVIDUAL_LANDLORD', registrationNumber: '', tinNumber: '', workspaceType: 'individual' }) });
            const blankOne = yield service.start(blankLandlord);
            const blankTwo = yield service.start(Object.assign(Object.assign({}, blankLandlord), { email: `${stamp}-blankid-2@example.test`, idempotencyKey: `${stamp}-blankid-2`, company: Object.assign(Object.assign({}, blankLandlord.company), { name: `${stamp} blankid 2`, email: `${stamp}-blankid-2@example.test` }) }));
            createdCompanyIds.push(blankOne.company._id, blankTwo.company._id);
            const storedBlank = yield Company.findById(blankOne.company._id).lean();
            record('A landlord without a TIN is not rejected because another blank TIN exists', Boolean(((_d = blankOne.company) === null || _d === void 0 ? void 0 : _d._id) && ((_e = blankTwo.company) === null || _e === void 0 ? void 0 : _e._id))
                && !(storedBlank === null || storedBlank === void 0 ? void 0 : storedBlank.tinNumber)
                && !(storedBlank === null || storedBlank === void 0 ? void 0 : storedBlank.registrationNumber));
            const trialToken = tokenFor(admin);
            const trialWorkspace = yield request(port, 'GET', '/api/workspace', trialToken);
            record('A trial administrator can authenticate to the company workspace', trialWorkspace.status === 200 && trialWorkspace.json.companyId === String(first.company._id));
            const previousPaynowId = process.env.PAYNOW_INTEGRATION_ID;
            const previousPaynowKey = process.env.PAYNOW_INTEGRATION_KEY;
            delete process.env.PAYNOW_INTEGRATION_ID;
            delete process.env.PAYNOW_INTEGRATION_KEY;
            const trialWithoutPaynow = yield service.start(registrationInput(stamp, 'nopaynow', `${stamp}-nopaynow`));
            process.env.PAYNOW_INTEGRATION_ID = previousPaynowId;
            process.env.PAYNOW_INTEGRATION_KEY = previousPaynowKey || 'registration-test-key';
            createdCompanyIds.push(trialWithoutPaynow.company._id);
            record('Trial registration succeeds when Paynow credentials are absent', ((_f = trialWithoutPaynow.company) === null || _f === void 0 ? void 0 : _f.tenantStatus) === 'active' && !trialWithoutPaynow.paymentSession);
            const { AuthService } = yield Promise.resolve().then(() => __importStar(require('../services/authService')));
            const loggedIn = yield AuthService.getInstance().login(`${stamp}-trial@example.test`, 'Register1pay');
            record('Existing login accepts the company administrator', Boolean(loggedIn.token) && String(loggedIn.user.companyId) === String(first.company._id));
            const held = yield service.start(registrationInput(stamp, 'held', `${stamp}-held`, 'paid'));
            createdCompanyIds.push(held.company._id);
            const heldAdmin = yield User.findById(held.user._id);
            const heldToken = tokenFor(heldAdmin);
            const blocked = yield request(port, 'GET', '/api/workspace', heldToken);
            const heldCompany = yield Company.findById(held.company._id);
            const { chargeForPlan } = yield Promise.resolve().then(() => __importStar(require('../services/systemPlanService')));
            const landlordMonthly = yield chargeForPlan('INDIVIDUAL', 'monthly');
            record('Landlord registration waits for payment at the configured monthly price', held.company.plan === 'INDIVIDUAL'
                && held.subscription.cycle === 'monthly'
                && held.paymentSession.amount === landlordMonthly
                && held.paymentSession.currency === 'USD'
                && String(held.paymentSession.companyId) === String(held.company._id)
                && held.company.onboardingStatus === 'PENDING_PAYMENT'
                && held.company.isActive === false
                && blocked.status === 403
                && blocked.json.code === 'PAYMENT_REQUIRED');
            yield PaymentSession.updateOne({ _id: held.paymentSession._id }, {
                $set: {
                    status: 'provider_created',
                    pollUrl: 'https://www.paynow.co.zw/interface/pollstatus?guid=registration-test',
                    rawProviderResponse: { redirectUrl: 'https://www.paynow.co.zw/Payment/ConfirmPayment/registration-test' }
                }
            });
            const destination = yield request(port, 'POST', '/api/paynow/web/create', heldToken, {
                paymentSessionId: String(held.paymentSession._id),
                amount: 1,
                reference: 'client-picked-reference'
            });
            yield PaymentSession.updateOne({ _id: held.paymentSession._id }, { $set: { status: 'pending' }, $unset: { pollUrl: '', rawProviderResponse: '' } });
            record('A payment session returns its Paynow destination and ignores a client amount', destination.status === 200 && destination.json.redirectUrl === 'https://www.paynow.co.zw/Payment/ConfirmPayment/registration-test');
            const fakePaid = yield request(port, 'POST', '/api/paynow/confirm', heldToken, {
                reference: held.paymentSession.providerRef,
                paymentStatus: 'paid',
                success: true
            });
            const afterFake = yield Company.findById(held.company._id);
            record('A client-side paid flag cannot activate a company', fakePaid.status === 200
                && fakePaid.json.paymentStatus !== 'paid'
                && (afterFake === null || afterFake === void 0 ? void 0 : afterFake.onboardingStatus) === 'PENDING_PAYMENT'
                && (afterFake === null || afterFake === void 0 ? void 0 : afterFake.tenantStatus) === 'pending');
            const invoiceAmount = Number(held.paymentSession.amount);
            const badAmount = yield applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Paid', amount: invoiceAmount + 25, reference: held.paymentSession.providerRef }).then(() => 'accepted').catch((error) => (error === null || error === void 0 ? void 0 : error.code) || (error === null || error === void 0 ? void 0 : error.message));
            const afterBadAmount = yield Company.findById(held.company._id);
            record('An incorrect provider amount does not activate the company', badAmount === 'PAYMENT_MISMATCH' && (afterBadAmount === null || afterBadAmount === void 0 ? void 0 : afterBadAmount.onboardingStatus) === 'PENDING_PAYMENT');
            const badCurrency = yield applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Paid', amount: invoiceAmount, currency: 'ZWL', reference: held.paymentSession.providerRef }).then(() => 'accepted').catch((error) => error === null || error === void 0 ? void 0 : error.code);
            record('A currency mismatch does not activate the company', badCurrency === 'PAYMENT_MISMATCH');
            const cancelled = yield applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Cancelled', amount: invoiceAmount, reference: held.paymentSession.providerRef });
            const afterCancel = yield Company.findById(held.company._id);
            record('A cancelled payment does not activate the company', cancelled.activated === false && cancelled.paymentStatus === 'cancelled' && (afterCancel === null || afterCancel === void 0 ? void 0 : afterCancel.onboardingStatus) === 'PENDING_PAYMENT');
            yield PaymentSession.updateOne({ _id: held.paymentSession._id }, { $set: { status: 'pending', failedAt: null } });
            const pending = yield applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Sent', amount: invoiceAmount, reference: held.paymentSession.providerRef });
            const afterPending = yield Company.findById(held.company._id);
            record('A pending payment does not activate the company', pending.activated === false && (afterPending === null || afterPending === void 0 ? void 0 : afterPending.tenantStatus) === 'pending');
            const paid = yield applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Paid', amount: held.paymentSession.amount, currency: 'USD', reference: held.paymentSession.providerRef, paynowReference: `${stamp}-paynow` });
            const paidAgain = yield applyPolledPayment(String(held.paymentSession.providerRef), { status: 'Paid', amount: held.paymentSession.amount, currency: 'USD', reference: held.paymentSession.providerRef });
            const subscriptionCount = yield Subscription.countDocuments({ companyId: held.company._id });
            const billingCount = yield BillingPayment.countDocuments({ companyId: held.company._id, status: 'paid' });
            const activated = yield Company.findById(held.company._id);
            const opened = yield request(port, 'GET', '/api/workspace', heldToken);
            record('A verified payment activates the held company once', paid.activated === true
                && paidAgain.activated === false
                && (activated === null || activated === void 0 ? void 0 : activated.tenantStatus) === 'active'
                && (activated === null || activated === void 0 ? void 0 : activated.subscriptionStatus) === 'active'
                && subscriptionCount === 1
                && billingCount === 1
                && opened.status === 200);
            const other = yield service.start(registrationInput(stamp, 'otherco', `${stamp}-otherco`, 'paid'));
            createdCompanyIds.push(other.company._id);
            const manager = yield service.start(registrationInput(stamp, 'manager', `${stamp}-manager`, 'paid', 'SME', 'yearly'));
            createdCompanyIds.push(manager.company._id);
            const foreignCheckout = yield request(port, 'POST', '/api/paynow/web/create', tokenFor({ _id: other.user._id, role: 'admin', roles: ['admin'], companyId: other.company._id }), {
                paymentSessionId: String(held.paymentSession._id)
            });
            record('Property Manager yearly checkout uses the configured price for that company', manager.company.plan === 'SME'
                && manager.paymentSession.billingCycle === 'yearly'
                && manager.paymentSession.amount === (yield chargeForPlan('SME', 'yearly'))
                && String(manager.paymentSession.companyId) === String(manager.company._id));
            record('A company cannot use another company payment session', foreignCheckout.status === 404);
            const badHash = yield request(port, 'POST', '/api/paynow/result', undefined, {
                reference: other.paymentSession.providerRef,
                status: 'Paid',
                amount: '250.00',
                hash: 'not-a-valid-signature'
            });
            const afterBadHash = yield Company.findById(other.company._id);
            record('An invalid Paynow signature is rejected', badHash.status === 401 && (afterBadHash === null || afterBadHash === void 0 ? void 0 : afterBadHash.onboardingStatus) === 'PENDING_PAYMENT' && (afterBadHash === null || afterBadHash === void 0 ? void 0 : afterBadHash.subscriptionStatus) !== 'active');
            const signed = {
                reference: String(other.paymentSession.providerRef),
                status: 'Paid',
                amount: '250.00'
            };
            signed.hash = (0, registrationPaymentPolicy_1.paynowPayloadHash)(signed, 'registration-test-key');
            const firstNotice = yield request(port, 'POST', '/api/paynow/result', undefined, signed);
            const secondNotice = yield request(port, 'POST', '/api/paynow/result', undefined, signed);
            const receipts = yield WebhookEventReceipt.countDocuments({ provider: 'paynow', eventId: String(signed.hash) });
            const stillTrial = yield Company.findById(other.company._id);
            record('A signed notice without a Paynow status URL does not activate the company', firstNotice.status === 200 && (stillTrial === null || stillTrial === void 0 ? void 0 : stillTrial.onboardingStatus) === 'PENDING_PAYMENT' && (stillTrial === null || stillTrial === void 0 ? void 0 : stillTrial.subscriptionStatus) !== 'active');
            record('A duplicate signed notice is ignored', secondNotice.json.status === 'duplicate' && receipts === 1);
            const unauthenticated = yield request(port, 'POST', '/api/paynow/web/create', undefined, { paymentSessionId: String(other.paymentSession._id) });
            record('Unauthenticated checkout is rejected', unauthenticated.status === 401);
            const priced = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'yearly', `${stamp}-yearly`, 'paid', 'INDIVIDUAL', 'yearly')), { amount: 1 }));
            const pricedAgain = yield service.start(registrationInput(stamp, 'yearly', `${stamp}-yearly`, 'paid', 'INDIVIDUAL', 'yearly'));
            createdCompanyIds.push(priced.company._id);
            const pricedCompanies = yield Company.countDocuments({ _id: priced.company._id });
            record('Yearly Landlord checkout uses the configured price and ignores a client amount', priced.paymentSession.amount === (yield chargeForPlan('INDIVIDUAL', 'yearly')) && priced.paymentSession.billingCycle === 'yearly');
            record('A repeated paid registration does not create another company', pricedAgain.alreadyProcessed === true && pricedCompanies === 1);
            const previousNodeEnv = process.env.NODE_ENV;
            const savedPaynowId = process.env.PAYNOW_INTEGRATION_ID;
            const savedPaynowKey = process.env.PAYNOW_INTEGRATION_KEY;
            const unconfigured = yield service.start(registrationInput(stamp, 'unconfigured', `${stamp}-unconfigured`, 'paid'));
            createdCompanyIds.push(unconfigured.company._id);
            delete process.env.PAYNOW_INTEGRATION_ID;
            delete process.env.PAYNOW_INTEGRATION_KEY;
            process.env.NODE_ENV = 'production';
            const unconfiguredCheckout = yield request(port, 'POST', '/api/paynow/web/create', tokenFor({
                _id: unconfigured.user._id,
                role: 'admin',
                roles: ['admin'],
                companyId: unconfigured.company._id
            }), {
                paymentSessionId: String(unconfigured.paymentSession._id),
                amount: 1
            });
            process.env.NODE_ENV = previousNodeEnv;
            process.env.PAYNOW_INTEGRATION_ID = savedPaynowId;
            process.env.PAYNOW_INTEGRATION_KEY = savedPaynowKey;
            const unconfiguredCompany = yield Company.findById(unconfigured.company._id);
            record('Checkout initiation fails safely when Paynow is not configured', unconfiguredCheckout.status === 503
                && unconfiguredCheckout.json.code === 'PAYNOW_NOT_CONFIGURED'
                && (unconfiguredCompany === null || unconfiguredCompany === void 0 ? void 0 : unconfiguredCompany.onboardingStatus) === 'PENDING_PAYMENT'
                && (unconfiguredCompany === null || unconfiguredCompany === void 0 ? void 0 : unconfiguredCompany.subscriptionStatus) !== 'active');
            let enterpriseRejected = false;
            try {
                yield service.start(registrationInput(stamp, 'enterprise', `${stamp}-enterprise`, 'paid', 'ENTERPRISE'));
            }
            catch (error) {
                enterpriseRejected = (error === null || error === void 0 ? void 0 : error.code) === 'ENTERPRISE_SALES_ONLY';
            }
            const enterpriseCompany = yield Company.findOne({ email: `${stamp}-enterprise@example.test` });
            record('Enterprise registration does not start checkout', enterpriseRejected && !enterpriseCompany);
            let unsupportedCycle = false;
            try {
                yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'weekly', `${stamp}-weekly`, 'paid')), { billingCycle: 'weekly' }));
            }
            catch (error) {
                unsupportedCycle = (error === null || error === void 0 ? void 0 : error.code) === 'UNSUPPORTED_BILLING_CYCLE';
            }
            record('An unsupported billing frequency does not create a company', unsupportedCycle && !(yield Company.findOne({ email: `${stamp}-weekly@example.test` })));
            const { Plan: PlanModel } = yield Promise.resolve().then(() => __importStar(require('../models/Plan')));
            const { seedDefaultPlans } = yield Promise.resolve().then(() => __importStar(require('../services/systemPlanService')));
            yield seedDefaultPlans();
            const savedYearly = (_g = (yield PlanModel.findOne({ code: 'SME' }).select('annualPrice').lean())) === null || _g === void 0 ? void 0 : _g.annualPrice;
            yield PlanModel.updateOne({ code: 'SME' }, { $set: { annualPrice: 0 } });
            let missingYearly = false;
            try {
                yield service.start(registrationInput(stamp, 'noyearly', `${stamp}-noyearly`, 'paid', 'SME', 'yearly'));
            }
            catch (error) {
                missingYearly = (error === null || error === void 0 ? void 0 : error.code) === 'REGISTRATION_PRICE_NOT_CONFIGURED';
            }
            finally {
                yield PlanModel.updateOne({ code: 'SME' }, { $set: { annualPrice: savedYearly !== null && savedYearly !== void 0 ? savedYearly : 0 } });
            }
            record('A missing yearly price is rejected instead of using the monthly price', missingYearly && !(yield Company.findOne({ email: `${stamp}-noyearly@example.test` })));
            const closed = yield service.start(registrationInput(stamp, 'closed', `${stamp}-closed`, 'paid'));
            createdCompanyIds.push(closed.company._id);
            const closedStill = yield Company.findById(closed.company._id);
            const closedAdmin = yield User.findById(closed.user._id);
            record('A new paid registration creates one company and one administrator', Boolean(((_h = closed.company) === null || _h === void 0 ? void 0 : _h._id) && ((_j = closed.user) === null || _j === void 0 ? void 0 : _j._id))
                && (yield User.countDocuments({ companyId: closed.company._id })) === 1
                && (yield Company.countDocuments({ _id: closed.company._id })) === 1);
            record('Browser closure does not destroy the registration', (closedStill === null || closedStill === void 0 ? void 0 : closedStill.onboardingStatus) === 'PENDING_PAYMENT' && (closedAdmin === null || closedAdmin === void 0 ? void 0 : closedAdmin.email) === closed.user.email && (closedStill === null || closedStill === void 0 ? void 0 : closedStill.isActive) === false);
            const resumedClosed = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'closed-retry', `${stamp}-closed-retry`, 'paid')), { email: closed.user.email, company: Object.assign(Object.assign({}, registrationInput(stamp, 'closed', `${stamp}-closed`, 'paid').company), { email: closed.user.email }) }));
            record('A pending registration can resume checkout', String(resumedClosed.company._id) === String(closed.company._id)
                && String((_k = resumedClosed.paymentSession) === null || _k === void 0 ? void 0 : _k._id) === String(closed.paymentSession._id)
                && ((_l = resumedClosed.resume) === null || _l === void 0 ? void 0 : _l.code) === 'PENDING_REGISTRATION');
            record('An authenticated pending user can resume checkout', resumedClosed.alreadyProcessed === true && Boolean((_m = resumedClosed.paymentSession) === null || _m === void 0 ? void 0 : _m._id));
            record('Retrying registration does not create a duplicate company', (yield Company.countDocuments({ normalizedEmail: String(closed.user.email) })) === 1);
            record('Retrying checkout does not create a duplicate subscription', (yield Subscription.countDocuments({ companyId: closed.company._id })) === 1
                && String(resumedClosed.subscription._id) === String(closed.subscription._id));
            const resumedUnconfigured = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'unconfigured-retry', `${stamp}-unconfigured-retry`, 'paid')), { email: unconfigured.user.email, company: Object.assign(Object.assign({}, registrationInput(stamp, 'unconfigured', `${stamp}-unconfigured`, 'paid').company), { email: unconfigured.user.email }) }));
            record('Checkout initiation failure leaves the registration recoverable', String(resumedUnconfigured.company._id) === String(unconfigured.company._id)
                && resumedUnconfigured.company.onboardingStatus === 'PENDING_PAYMENT'
                && resumedUnconfigured.company.subscriptionStatus !== 'active');
            const cancelCo = yield service.start(registrationInput(stamp, 'cancelco', `${stamp}-cancelco`, 'paid'));
            createdCompanyIds.push(cancelCo.company._id);
            const cancelAmount = Number(cancelCo.paymentSession.amount);
            const cancelPoll = yield applyPolledPayment(String(cancelCo.paymentSession.providerRef), {
                status: 'Cancelled',
                amount: cancelAmount,
                currency: 'USD',
                reference: cancelCo.paymentSession.providerRef
            });
            const cancelRetry = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'cancel-retry', `${stamp}-cancel-retry`, 'paid')), { email: cancelCo.user.email, company: Object.assign(Object.assign({}, registrationInput(stamp, 'cancelco', `${stamp}-cancelco`, 'paid').company), { email: cancelCo.user.email }) }));
            const afterCancelRetry = yield Company.findById(cancelCo.company._id);
            record('Customer cancellation does not permanently block the email address', cancelPoll.activated === false
                && String(cancelRetry.company._id) === String(cancelCo.company._id)
                && (afterCancelRetry === null || afterCancelRetry === void 0 ? void 0 : afterCancelRetry.onboardingStatus) === 'PENDING_PAYMENT'
                && (yield Company.countDocuments({ normalizedEmail: String(cancelCo.user.email) })) === 1);
            record('A cancelled payment does not activate the subscription', cancelPoll.paymentStatus === 'cancelled' && (afterCancelRetry === null || afterCancelRetry === void 0 ? void 0 : afterCancelRetry.subscriptionStatus) !== 'active');
            const failedCo = yield service.start(registrationInput(stamp, 'failedco', `${stamp}-failedco`, 'paid'));
            createdCompanyIds.push(failedCo.company._id);
            const failedPoll = yield applyPolledPayment(String(failedCo.paymentSession.providerRef), {
                status: 'Failed',
                amount: Number(failedCo.paymentSession.amount),
                currency: 'USD',
                reference: failedCo.paymentSession.providerRef
            });
            const afterFailed = yield Company.findById(failedCo.company._id);
            const failedRetry = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'failed-retry', `${stamp}-failed-retry`, 'paid')), { email: failedCo.user.email, company: Object.assign(Object.assign({}, registrationInput(stamp, 'failedco', `${stamp}-failedco`, 'paid').company), { email: failedCo.user.email }) }));
            record('A failed payment does not activate the subscription', failedPoll.activated === false
                && (afterFailed === null || afterFailed === void 0 ? void 0 : afterFailed.onboardingStatus) === 'PENDING_PAYMENT'
                && (afterFailed === null || afterFailed === void 0 ? void 0 : afterFailed.subscriptionStatus) !== 'active'
                && String(failedRetry.company._id) === String(failedCo.company._id)
                && (yield Subscription.countDocuments({ companyId: failedCo.company._id })) === 1);
            const ambiguous = yield service.start(registrationInput(stamp, 'ambiguous', `${stamp}-ambiguous`, 'paid'));
            createdCompanyIds.push(ambiguous.company._id);
            const old = new Date(Date.now() - 8 * 86400000);
            yield Company.collection.updateOne({ _id: ambiguous.company._id }, { $set: { createdAt: old, updatedAt: old } });
            yield User.collection.updateOne({ _id: ambiguous.user._id }, { $set: { createdAt: old, updatedAt: old } });
            yield PaymentSession.collection.updateOne({ _id: ambiguous.paymentSession._id }, {
                $set: {
                    createdAt: old,
                    updatedAt: old,
                    status: 'pending',
                    pollUrl: 'https://www.paynow.co.zw/interface/pollstatus?guid=ambiguous'
                }
            });
            yield OnboardingSession.collection.updateOne({ _id: ambiguous.onboardingSession._id }, { $set: { createdAt: old, updatedAt: old } });
            const { releaseAbandonedRegistration } = yield Promise.resolve().then(() => __importStar(require('../services/abandonedRegistrationService')));
            const deferred = yield releaseAbandonedRegistration(ambiguous.company._id);
            const ambiguousStill = yield Company.findById(ambiguous.company._id);
            const ambiguousUser = yield User.findById(ambiguous.user._id);
            const ambiguousResume = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'ambiguous-retry', `${stamp}-ambiguous-retry`, 'paid')), { email: ambiguous.user.email, company: Object.assign(Object.assign({}, registrationInput(stamp, 'ambiguous', `${stamp}-ambiguous`, 'paid').company), { email: ambiguous.user.email }) }));
            record('A pending Paynow transaction is not treated as failure without checking provider state', deferred === 'deferred'
                && (ambiguousStill === null || ambiguousStill === void 0 ? void 0 : ambiguousStill.onboardingStatus) === 'PENDING_PAYMENT'
                && (ambiguousUser === null || ambiguousUser === void 0 ? void 0 : ambiguousUser.email) === ambiguous.user.email
                && String(ambiguousResume.company._id) === String(ambiguous.company._id)
                && ((_o = ambiguousResume.resume) === null || _o === void 0 ? void 0 : _o.code) === 'PAYMENT_IN_PROGRESS');
            const paidRetry = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'held-retry', `${stamp}-held-retry`, 'paid')), { email: `${stamp}-held@example.test`, company: Object.assign(Object.assign({}, registrationInput(stamp, 'held', `${stamp}-held`, 'paid').company), { email: `${stamp}-held@example.test` }) }));
            record('A verified payment is not charged again on retry', String(paidRetry.company._id) === String(held.company._id)
                && (((_p = paidRetry.resume) === null || _p === void 0 ? void 0 : _p.code) === 'ACCOUNT_EXISTS' || ((_q = paidRetry.resume) === null || _q === void 0 ? void 0 : _q.code) === 'PAYMENT_ALREADY_VERIFIED')
                && !paidRetry.paymentSession
                && (yield Subscription.countDocuments({ companyId: held.company._id })) === 1
                && (yield BillingPayment.countDocuments({ companyId: held.company._id, status: 'paid' })) === 1);
            const abandoned = yield service.start(registrationInput(stamp, 'abandoned', `${stamp}-abandoned`, 'paid'));
            createdCompanyIds.push(abandoned.company._id);
            const abandonedEmail = String(abandoned.user.email);
            yield Company.collection.updateOne({ _id: abandoned.company._id }, { $set: { createdAt: old, updatedAt: old } });
            yield User.collection.updateOne({ _id: abandoned.user._id }, { $set: { createdAt: old, updatedAt: old } });
            yield PaymentSession.collection.updateOne({ _id: abandoned.paymentSession._id }, { $set: { createdAt: old, updatedAt: old } });
            yield OnboardingSession.collection.updateOne({ _id: abandoned.onboardingSession._id }, { $set: { createdAt: old, updatedAt: old } });
            const released = yield releaseAbandonedRegistration(abandoned.company._id);
            const archivedEmailAfterFirst = (_r = (yield User.findById(abandoned.user._id))) === null || _r === void 0 ? void 0 : _r.email;
            const releasedAgain = yield releaseAbandonedRegistration(abandoned.company._id);
            const archivedUser = yield User.findById(abandoned.user._id);
            const archivedCompany = yield Company.findById(abandoned.company._id);
            const archivedSession = yield PaymentSession.findById(abandoned.paymentSession._id);
            const fresh = yield service.start(Object.assign(Object.assign({}, registrationInput(stamp, 'again', `${stamp}-again`, 'paid')), { email: abandonedEmail, company: Object.assign(Object.assign({}, registrationInput(stamp, 'again', `${stamp}-again`, 'paid').company), { email: abandonedEmail }) }));
            createdCompanyIds.push(fresh.company._id);
            record('Expired eligible registrations can be safely archived', released === 'released'
                && (archivedCompany === null || archivedCompany === void 0 ? void 0 : archivedCompany.onboardingStatus) === 'EXPIRED'
                && (archivedCompany === null || archivedCompany === void 0 ? void 0 : archivedCompany.tenantStatus) === 'archived'
                && (archivedUser === null || archivedUser === void 0 ? void 0 : archivedUser.isArchived) === true
                && (archivedUser === null || archivedUser === void 0 ? void 0 : archivedUser.isActive) === false
                && Boolean(archivedSession));
            record('Expired registrations release the email address', (archivedUser === null || archivedUser === void 0 ? void 0 : archivedUser.email) !== abandonedEmail
                && !String((archivedUser === null || archivedUser === void 0 ? void 0 : archivedUser.password) || '').includes('Register1pay')
                && (archivedCompany === null || archivedCompany === void 0 ? void 0 : archivedCompany.email) !== abandonedEmail);
            record('The same email can register again after a safe release', String(fresh.company._id) !== String(abandoned.company._id)
                && fresh.user.email === abandonedEmail
                && fresh.company.onboardingStatus === 'PENDING_PAYMENT'
                && (yield User.countDocuments({ email: abandonedEmail })) === 1);
            record('Cleanup is idempotent', releasedAgain === 'released' && (archivedUser === null || archivedUser === void 0 ? void 0 : archivedUser.email) === archivedEmailAfterFirst);
            yield Company.collection.updateOne({ _id: first.company._id }, { $set: { createdAt: old, updatedAt: old } });
            yield User.collection.updateOne({ _id: first.user._id }, { $set: { createdAt: old, updatedAt: old } });
            const trialRelease = yield releaseAbandonedRegistration(first.company._id);
            const trialStill = yield Company.findById(first.company._id);
            const trialUser = yield User.findById(first.user._id);
            const trialSub = yield Subscription.findById(first.subscription._id);
            record('An active trial cannot be archived by abandoned-registration cleanup', trialRelease === 'skipped' && (trialStill === null || trialStill === void 0 ? void 0 : trialStill.onboardingStatus) === 'ACTIVE' && (trialStill === null || trialStill === void 0 ? void 0 : trialStill.tenantStatus) === 'active' && (trialUser === null || trialUser === void 0 ? void 0 : trialUser.email) === first.user.email);
            record('An active user cannot be archived by abandoned-registration cleanup', (trialUser === null || trialUser === void 0 ? void 0 : trialUser.isArchived) !== true && (trialUser === null || trialUser === void 0 ? void 0 : trialUser.isActive) === true && (trialUser === null || trialUser === void 0 ? void 0 : trialUser.email) === first.user.email);
            record('Trial start and end dates do not change when registration is retried', new Date((trialSub === null || trialSub === void 0 ? void 0 : trialSub.trialEndDate) || 0).getTime() === trialEndBefore
                && new Date((trialSub === null || trialSub === void 0 ? void 0 : trialSub.trialStartDate) || 0).getTime() === trialStartBefore);
            const paidRelease = yield releaseAbandonedRegistration(held.company._id);
            const heldStill = yield Company.findById(held.company._id);
            record('Verified paid accounts are never removed by cleanup', paidRelease === 'skipped'
                && (heldStill === null || heldStill === void 0 ? void 0 : heldStill.subscriptionStatus) === 'active'
                && (heldStill === null || heldStill === void 0 ? void 0 : heldStill.onboardingStatus) !== 'EXPIRED'
                && (heldStill === null || heldStill === void 0 ? void 0 : heldStill.email) === held.company.email);
            record('Company isolation remains enforced', (trialStill === null || trialStill === void 0 ? void 0 : trialStill.email) === first.company.email
                && (heldStill === null || heldStill === void 0 ? void 0 : heldStill.email) === held.company.email
                && String(trialStill === null || trialStill === void 0 ? void 0 : trialStill._id) !== String(heldStill === null || heldStill === void 0 ? void 0 : heldStill._id));
            let duplicateActiveBlocked = false;
            try {
                const duplicateUser = yield User.create({
                    email: first.user.email,
                    password: 'Register1pay',
                    firstName: 'Dup',
                    lastName: 'User',
                    role: 'admin',
                    companyId: first.company._id
                });
                yield User.deleteOne({ _id: duplicateUser._id });
            }
            catch (error) {
                duplicateActiveBlocked = (error === null || error === void 0 ? void 0 : error.code) === 11000;
            }
            const emailIndexes = yield User.collection.indexes();
            const uniqueEmailIndex = emailIndexes.some((index) => { var _a; return index.unique && ((_a = index.key) === null || _a === void 0 ? void 0 : _a.email) === 1; });
            record('Duplicate active email addresses remain impossible', uniqueEmailIndex && duplicateActiveBlocked);
            const crypto = require('crypto');
            const recovery = yield service.start(registrationInput(stamp, 'recover', `${stamp}-recover`));
            createdCompanyIds.push(recovery.company._id);
            const recoveryToken = `recover-${stamp}`;
            const recoveryUser = yield User.findById(recovery.user._id);
            recoveryUser.resetPasswordToken = crypto.createHash('sha256').update(recoveryToken).digest('hex');
            recoveryUser.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
            yield recoveryUser.save();
            const { resetPassword } = yield Promise.resolve().then(() => __importStar(require('../controllers/authController')));
            yield new Promise((resolve, reject) => {
                const req = { body: { token: recoveryToken, email: recovery.user.email, password: 'Recover2pay' } };
                const res = { json: () => resolve() };
                resetPassword(req, res, (error) => error ? reject(error) : resolve());
            });
            const recoveredLogin = yield AuthService.getInstance().login(String(recovery.user.email), 'Recover2pay');
            record('Existing authentication and password recovery continue to work', Boolean(recoveredLogin.token));
            const rentalPaymentsAfter = yield mongoose_1.default.connection.collection('payments').countDocuments();
            record('Existing rental payment records are unchanged', rentalPaymentsBefore === rentalPaymentsAfter);
            const indexResult = yield ensurePaymentSessionProviderRefIndex();
            const refs = yield PaymentSession.distinct('providerRef', { companyId: { $in: createdCompanyIds }, providerRef: { $ne: null } });
            record('Registration payment references for this run are unique', new Set(refs).size === refs.length);
            record('Payment session reference index is created only when existing rows allow it', indexResult.duplicateGroups === 0 ? indexResult.created || indexResult.alreadyPresent : indexResult.created === false);
        }
        finally {
            process.env.PAYNOW_INTEGRATION_KEY = previousKey;
            process.env.PAYNOW_MODE = previousMode;
            if (createdCompanyIds.length) {
                yield WebhookEventReceipt.deleteMany({ provider: 'paynow', createdAt: { $gte: startedAt } });
                yield BillingPayment.deleteMany({ companyId: { $in: createdCompanyIds } });
                yield PaymentSession.deleteMany({ companyId: { $in: createdCompanyIds } });
                yield Subscription.deleteMany({ companyId: { $in: createdCompanyIds } });
                yield OnboardingSession.deleteMany({ companyId: { $in: createdCompanyIds } });
                yield User.deleteMany({ companyId: { $in: createdCompanyIds } });
                yield Company.deleteMany({ _id: { $in: createdCompanyIds } });
                yield User.deleteMany({ email: { $regex: `^${stamp}-` } });
            }
            yield new Promise((resolve) => server.close(() => resolve()));
            yield closeDatabase();
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        runStaticChecks();
        yield runDatabaseChecks();
        const failed = checks.filter((check) => !check.ok);
        console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
        if (failed.length) {
            console.log(failed.map((check) => check.name).join('\n'));
            process.exit(1);
        }
        process.exit(0);
    });
}
main().catch((error) => {
    console.error((error === null || error === void 0 ? void 0 : error.message) || error);
    process.exit(1);
});
