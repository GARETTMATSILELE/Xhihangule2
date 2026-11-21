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
 * Registration payment-provider selection.
 * Uses a disposable local database and a mocked Dodo client.
 * Does not call Dodo, Paynow, or production.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Plan_1 = require("../models/Plan");
const Subscription_1 = require("../models/Subscription");
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const onboardingService_1 = require("../services/onboardingService");
const providerAvailability_1 = require("../services/subscriptionPayments/providerAvailability");
const dodoClient_1 = require("../services/subscriptionPayments/dodoClient");
const subscriptionCheckoutService_1 = require("../services/subscriptionPayments/subscriptionCheckoutService");
const dodoWebhookService_1 = require("../services/subscriptionPayments/dodoWebhookService");
const TEST_DB = 'mongodb://127.0.0.1:27017/mantis_registration_provider_test';
const failures = [];
function check(condition, message) {
    if (!condition)
        failures.push(message);
    console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
}
function configure(extra = {}) {
    process.env.NODE_ENV = 'development';
    process.env.PAYNOW_ENABLED = 'true';
    process.env.PAYNOW_INTEGRATION_ID = 'registration-provider-test';
    process.env.PAYNOW_INTEGRATION_KEY = 'registration-provider-test';
    process.env.PAYNOW_MODE = 'test';
    process.env.PAYNOW_DISABLE_LOCAL_CONFIG = '1';
    process.env.DODO_PAYMENTS_ENABLED = 'true';
    process.env.DODO_PAYMENTS_MODE = 'test';
    process.env.DODO_PAYMENTS_API_KEY = 'dodo_test_key';
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = 'whsec_dGVzdC1zaWduaW5nLXNlY3JldA==';
    process.env.DODO_PAYMENTS_RETURN_URL = 'http://localhost:3000/billing/return';
    process.env.DODO_PAYMENTS_PRODUCT_INDIVIDUAL_MONTHLY = 'pdt_individual_monthly';
    process.env.DODO_PAYMENTS_PRODUCT_INDIVIDUAL_ANNUAL = 'pdt_individual_annual';
    process.env.DODO_PAYMENTS_PRODUCT_SME_MONTHLY = 'pdt_sme_monthly';
    process.env.DODO_PAYMENTS_PRODUCT_SME_ANNUAL = 'pdt_sme_annual';
    delete process.env.DODO_PAYMENTS_PRODUCT_MONTHLY;
    delete process.env.DODO_PAYMENTS_PRODUCT_QUARTERLY;
    delete process.env.DODO_PAYMENTS_PRODUCT_ANNUAL;
    delete process.env.DODO_PAYMENTS_PRODUCT_ENTERPRISE_MONTHLY;
    delete process.env.DODO_PAYMENTS_PRODUCT_ENTERPRISE_ANNUAL;
    delete process.env.ENTERPRISE_DIRECT_CHECKOUT;
    Object.entries(extra).forEach(([key, value]) => {
        if (value === undefined)
            delete process.env[key];
        else
            process.env[key] = value;
    });
}
function registrationInput(stamp, provider) {
    return {
        email: `${stamp}@example.test`,
        password: 'Register1pay',
        name: 'Registration Admin',
        plan: 'INDIVIDUAL',
        billingCycle: 'monthly',
        registrationMode: 'paid',
        provider,
        company: {
            name: `Registration ${stamp}`,
            email: `${stamp}@example.test`,
            address: '1 Test Close',
            phone: '0772000000',
            country: 'Zimbabwe',
            companyType: 'INDIVIDUAL_LANDLORD',
            workspaceType: 'individual'
        },
        idempotencyKey: stamp
    };
}
function fakeGateway(cents = 2000) {
    let created = 0;
    (0, dodoClient_1.setDodoGatewayForTests)({
        products: {
            retrieve: (id) => __awaiter(this, void 0, void 0, function* () {
                return ({
                    price: { type: 'recurring_price', currency: 'USD', price: cents, payment_frequency_interval: 'Month', payment_frequency_count: 1, product_id: id }
                });
            })
        },
        checkoutSessions: {
            create: () => __awaiter(this, void 0, void 0, function* () {
                created += 1;
                return { session_id: `cks_${created}`, checkout_url: `https://test.checkout.dodopayments.com/session/cks_${created}` };
            })
        },
        payments: { retrieve: () => __awaiter(this, void 0, void 0, function* () { return ({}); }) },
        webhooks: { unwrap: () => { throw new Error('not used'); } }
    });
    return { created: () => created };
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (/cosmos|azure|mantisafrica/i.test(TEST_DB) || mongoose_1.default.connection.readyState !== 0)
            process.exit(1);
        configure();
        const paynowOnly = { DODO_PAYMENTS_ENABLED: 'false' };
        check((0, providerAvailability_1.selectSubscriptionProvider)(undefined, Object.assign(Object.assign({}, process.env), paynowOnly)).provider === 'paynow', 'Paynow is selected when it is the only provider');
        check((0, providerAvailability_1.selectSubscriptionProvider)('dodo', Object.assign(Object.assign({}, process.env), { DODO_PAYMENTS_ENABLED: 'false' })).code === 'DODO_DISABLED', 'disabled Dodo is rejected');
        check((0, providerAvailability_1.selectSubscriptionProvider)('paynow', Object.assign(Object.assign({}, process.env), { DODO_PAYMENTS_ENABLED: 'false' })).provider === 'paynow', 'Paynow remains available when Dodo is disabled');
        configure({ DODO_PAYMENTS_API_KEY: '' });
        check((0, providerAvailability_1.selectSubscriptionProvider)('dodo').code === 'DODO_NOT_CONFIGURED', 'missing Dodo credentials leave Dodo unavailable');
        configure({ DODO_PAYMENTS_WEBHOOK_KEY: '' });
        check((0, providerAvailability_1.selectSubscriptionProvider)('dodo').code === 'DODO_NOT_CONFIGURED', 'a missing webhook secret leaves Dodo unavailable');
        configure({
            DODO_PAYMENTS_PRODUCT_INDIVIDUAL_MONTHLY: '',
            DODO_PAYMENTS_PRODUCT_INDIVIDUAL_ANNUAL: '',
            DODO_PAYMENTS_PRODUCT_SME_MONTHLY: '',
            DODO_PAYMENTS_PRODUCT_SME_ANNUAL: ''
        });
        check((0, providerAvailability_1.selectSubscriptionProvider)('dodo').code === 'DODO_NOT_CONFIGURED', 'missing product mappings leave Dodo unavailable');
        configure();
        check((0, providerAvailability_1.selectSubscriptionProvider)('card').code === 'PROVIDER_INVALID', 'an invalid provider is rejected');
        check((0, providerAvailability_1.selectSubscriptionProvider)(undefined).code === 'PROVIDER_REQUIRED', 'no provider is selected when both are available');
        check((0, providerAvailability_1.selectSubscriptionProvider)('paynow').provider === 'paynow', 'Paynow can be selected explicitly');
        check((0, providerAvailability_1.selectSubscriptionProvider)('dodo').provider === 'dodo', 'Dodo can be selected explicitly');
        yield mongoose_1.default.connect(TEST_DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
        if (mongoose_1.default.connection.name !== 'mantis_registration_provider_test')
            process.exit(1);
        yield mongoose_1.default.connection.dropDatabase();
        yield Plan_1.Plan.create([
            { code: 'INDIVIDUAL', name: 'Individual', monthlyPrice: 20, annualPrice: 240, currency: 'USD', isActive: true },
            { code: 'SME', name: 'SME', monthlyPrice: 300, annualPrice: 3600, currency: 'USD', isActive: true },
            { code: 'ENTERPRISE', name: 'Enterprise', monthlyPrice: 600, annualPrice: 7200, currency: 'USD', isActive: true }
        ]);
        const service = onboardingService_1.OnboardingService.getInstance();
        const stamp = `reg-${Date.now()}`;
        let missingProvider = '';
        try {
            yield service.start(registrationInput(`${stamp}-none`));
        }
        catch (error) {
            missingProvider = (error === null || error === void 0 ? void 0 : error.code) || '';
        }
        check(missingProvider === 'PROVIDER_REQUIRED' && !(yield Company_1.Company.findOne({ email: `${stamp}-none@example.test` })), 'registration without a provider does not create a company');
        const paynow = yield service.start(registrationInput(`${stamp}-paynow`, 'paynow'));
        check(paynow.paymentSession.provider === 'paynow' && paynow.paymentSession.amount === 20 && paynow.paymentSession.currency === 'USD', 'Paynow registration stores the server price');
        check((yield User_1.User.countDocuments({ companyId: paynow.company._id })) === 1 && (yield Company_1.Company.countDocuments({ _id: paynow.company._id })) === 1, 'Paynow registration creates one company and one user');
        const dodo = yield service.start(registrationInput(`${stamp}-dodo`, 'dodo'));
        const gateway = fakeGateway();
        check(dodo.paymentSession.provider === 'dodo' && dodo.company.onboardingStatus === 'PENDING_PAYMENT' && dodo.subscription.status === 'past_due', 'Dodo registration stays pending before payment');
        check(gateway.created() === 0, 'choosing Dodo during registration does not call the payment provider');
        const repeated = yield service.start(Object.assign(Object.assign({}, registrationInput(`${stamp}-dodo-repeat`, 'dodo')), { email: dodo.user.email, company: Object.assign(Object.assign({}, registrationInput(`${stamp}-dodo`, 'dodo').company), { email: dodo.user.email }) }));
        check(String(repeated.company._id) === String(dodo.company._id) && (yield Company_1.Company.countDocuments({ normalizedEmail: dodo.user.email })) === 1, 'resuming a Dodo registration does not create another company');
        const switched = yield service.start(Object.assign(Object.assign({}, registrationInput(`${stamp}-switch`, 'paynow')), { email: dodo.user.email, company: Object.assign(Object.assign({}, registrationInput(`${stamp}-dodo`, 'dodo').company), { email: dodo.user.email }) }));
        check(switched.paymentSession.provider === 'paynow' && String(switched.paymentSession._id) === String(dodo.paymentSession._id), 'an unsent registration can change provider without a second charge');
        yield PaymentSession_1.PaymentSession.updateOne({ _id: dodo.paymentSession._id }, { $set: { provider: 'dodo', status: 'provider_created', metadata: { dodoCheckoutUrl: 'https://test.checkout.dodopayments.com/session/open' } } });
        let blocked = '';
        try {
            yield service.start(Object.assign(Object.assign({}, registrationInput(`${stamp}-blocked`, 'paynow')), { email: dodo.user.email, company: Object.assign(Object.assign({}, registrationInput(`${stamp}-dodo`, 'dodo').company), { email: dodo.user.email }) }));
        }
        catch (error) {
            blocked = (error === null || error === void 0 ? void 0 : error.code) || '';
        }
        check(blocked === 'PAYMENT_ATTEMPT_PENDING' && (yield PaymentSession_1.PaymentSession.countDocuments({ companyId: dodo.company._id })) === 1, 'a started checkout blocks the other provider');
        const started = yield (0, subscriptionCheckoutService_1.startDodoSubscriptionCheckout)({
            user: { companyId: String(dodo.company._id), userId: String(dodo.user._id) },
            get: () => undefined
        }, { plan: 'INDIVIDUAL', cycle: 'monthly', openSession: yield PaymentSession_1.PaymentSession.findById(dodo.paymentSession._id) });
        check(started.status === 200 && gateway.created() === 1 && started.body.provider === 'dodo', 'Dodo registration checkout uses the hosted provider');
        const sessionId = String(started.body.paymentSessionId);
        const mismatch = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({
            type: 'payment.succeeded',
            data: { payment_id: 'pay_wrong', currency: 'USD', total_amount: 25000, metadata: { mantis_payment_session_id: sessionId } }
        }, 'msg_wrong_amount');
        check(mismatch.body.activated !== true && ((_a = (yield Company_1.Company.findById(dodo.company._id))) === null || _a === void 0 ? void 0 : _a.onboardingStatus) === 'PENDING_PAYMENT', 'a mismatched payment amount does not activate registration');
        const failed = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({
            type: 'payment.failed',
            data: { payment_id: 'pay_failed', metadata: { mantis_payment_session_id: sessionId } }
        }, 'msg_failed');
        check(failed.status === 200 && ((_b = (yield Company_1.Company.findById(dodo.company._id))) === null || _b === void 0 ? void 0 : _b.subscriptionStatus) !== 'active', 'a failed payment does not activate registration');
        yield PaymentSession_1.PaymentSession.updateOne({ _id: sessionId }, { $set: { status: 'provider_created' } });
        yield BillingPayment_1.BillingPayment.updateOne({ paymentSessionId: sessionId }, { $set: { status: 'pending' } });
        const paid = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({
            type: 'payment.succeeded',
            data: { payment_id: 'pay_reg', currency: 'USD', total_amount: 2000, metadata: { mantis_payment_session_id: sessionId }, customer: { customer_id: 'cus_reg' } }
        }, 'msg_paid');
        const duplicate = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)({
            type: 'payment.succeeded',
            data: { payment_id: 'pay_reg', currency: 'USD', total_amount: 2000, metadata: { mantis_payment_session_id: sessionId } }
        }, 'msg_paid');
        const company = yield Company_1.Company.findById(dodo.company._id);
        check(paid.body.activated === true && duplicate.body.status === 'duplicate' && (company === null || company === void 0 ? void 0 : company.subscriptionStatus) === 'active' && (yield Subscription_1.Subscription.countDocuments({ companyId: dodo.company._id })) === 1 && (yield User_1.User.countDocuments({ companyId: dodo.company._id })) === 1, 'a verified Dodo payment activates the same registration once');
        check((yield mongoose_1.default.connection.collection('payments').countDocuments()) === 0, 'registration checkout does not create rental payments');
        let enterprise = '';
        try {
            yield service.start(Object.assign(Object.assign({}, registrationInput(`${stamp}-enterprise`, 'paynow')), { plan: 'ENTERPRISE' }));
        }
        catch (error) {
            enterprise = (error === null || error === void 0 ? void 0 : error.code) || '';
        }
        check(enterprise === 'ENTERPRISE_SALES_ONLY', 'Enterprise registration stays sales-only');
        yield mongoose_1.default.disconnect();
        if (failures.length) {
            console.log(`${failures.length} failed`);
            process.exit(1);
        }
        console.log('Registration provider tests passed.');
        process.exit(0);
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error((error === null || error === void 0 ? void 0 : error.message) || error);
    yield mongoose_1.default.disconnect().catch(() => undefined);
    process.exit(1);
}));
