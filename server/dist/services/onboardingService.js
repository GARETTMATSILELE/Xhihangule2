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
exports.OnboardingService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const errorHandler_1 = require("../middleware/errorHandler");
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Subscription_1 = require("../models/Subscription");
const OnboardingSession_1 = require("../models/OnboardingSession");
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const plan_1 = require("../types/plan");
const normalization_1 = require("../utils/normalization");
function deriveIdempotencyKey(input) {
    var _a;
    if (input.idempotencyKey)
        return input.idempotencyKey;
    const material = `${(0, normalization_1.normalizeEmail)(input.email)}:${input.plan}:${input.billingCycle || 'monthly'}:${((_a = input.company) === null || _a === void 0 ? void 0 : _a.name) || ''}`;
    return crypto_1.default.createHash('sha256').update(material).digest('hex');
}
function splitName(name) {
    const [firstNameRaw, ...lastParts] = String(name || '').trim().split(/\s+/);
    const firstName = firstNameRaw || 'User';
    const lastName = lastParts.join(' ') || firstNameRaw || 'Admin';
    return { firstName, lastName };
}
class OnboardingService {
    static getInstance() {
        if (!OnboardingService.instance) {
            OnboardingService.instance = new OnboardingService();
        }
        return OnboardingService.instance;
    }
    start(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const idempotencyKey = deriveIdempotencyKey(input);
            const existingSession = yield OnboardingSession_1.OnboardingSession.findOne({ idempotencyKey });
            if (existingSession) {
                return this.hydrate(existingSession._id.toString(), true);
            }
            const email = (0, normalization_1.normalizeEmail)(input.email);
            const billingCycle = input.billingCycle || 'monthly';
            const companyType = (0, normalization_1.normalizeCompanyType)((_a = input.company) === null || _a === void 0 ? void 0 : _a.companyType);
            const planConfig = plan_1.PLAN_CONFIG[input.plan];
            const workspaceType = (0, normalization_1.normalizeWorkspaceType)((_b = input.company) === null || _b === void 0 ? void 0 : _b.workspaceType, planConfig.workspaceType);
            const normalizedCompanyEmail = (0, normalization_1.normalizeEmail)(((_c = input.company) === null || _c === void 0 ? void 0 : _c.email) || input.email);
            const normalizedRegistrationNumber = (0, normalization_1.normalizeLegalIdentifier)((_d = input.company) === null || _d === void 0 ? void 0 : _d.registrationNumber);
            const normalizedTinNumber = (0, normalization_1.normalizeLegalIdentifier)((_e = input.company) === null || _e === void 0 ? void 0 : _e.tinNumber);
            if (!email || !input.password || !input.name) {
                throw new errorHandler_1.AppError('Email, password and name are required', 400, 'VALIDATION_ERROR');
            }
            if (companyType === 'REGISTERED_BUSINESS' && (!normalizedRegistrationNumber || !normalizedTinNumber)) {
                throw new errorHandler_1.AppError('Registration number and TIN number are required for registered businesses', 400, 'VALIDATION_ERROR');
            }
            const duplicateUser = yield User_1.User.findOne({ normalizedEmail: email });
            if (duplicateUser) {
                throw new errorHandler_1.AppError('Email already registered', 400, 'DUPLICATE_EMAIL');
            }
            const duplicateCompanyClauses = [{ normalizedEmail: normalizedCompanyEmail }];
            if (normalizedRegistrationNumber)
                duplicateCompanyClauses.push({ normalizedRegistrationNumber });
            if (normalizedTinNumber)
                duplicateCompanyClauses.push({ normalizedTinNumber });
            const duplicateCompany = yield Company_1.Company.findOne({ $or: duplicateCompanyClauses });
            if (duplicateCompany) {
                throw new errorHandler_1.AppError('Company already exists', 400, 'DUPLICATE_COMPANY');
            }
            const { firstName, lastName } = splitName(input.name);
            const pricing = planConfig.pricingUSD;
            const amount = pricing ? (billingCycle === 'yearly' ? pricing.yearly : pricing.monthly) : 0;
            const onboardingSession = yield OnboardingSession_1.OnboardingSession.create({
                idempotencyKey,
                status: 'PENDING_SETUP',
                plan: input.plan,
                billingCycle,
                companyType,
                workspaceType,
                currentStep: 'CREATE_USER',
                retryCount: 0
            });
            try {
                const user = yield User_1.User.create({
                    email,
                    normalizedEmail: email,
                    password: input.password,
                    firstName,
                    lastName,
                    role: 'admin',
                    isActive: true
                });
                onboardingSession.userId = user._id;
                onboardingSession.currentStep = 'CREATE_COMPANY';
                yield onboardingSession.save();
                const company = yield Company_1.Company.create({
                    name: input.company.name,
                    email: normalizedCompanyEmail,
                    normalizedEmail: normalizedCompanyEmail,
                    address: input.company.address || (companyType === 'INDIVIDUAL_LANDLORD' ? 'N/A' : undefined),
                    phone: input.company.phone || (companyType === 'INDIVIDUAL_LANDLORD' ? 'N/A' : undefined),
                    website: input.company.website,
                    registrationNumber: input.company.registrationNumber,
                    normalizedRegistrationNumber,
                    tinNumber: input.company.tinNumber,
                    normalizedTinNumber,
                    vatNumber: input.company.vatNumber,
                    companyType,
                    workspaceType,
                    tenantStatus: 'pending',
                    onboardingStatus: 'PENDING_PAYMENT',
                    onboardingCompleted: false,
                    ownerId: user._id,
                    plan: input.plan,
                    propertyLimit: planConfig.propertyLimit,
                    featureFlags: planConfig.featureFlags,
                    isActive: false,
                    subscriptionStatus: 'inactive',
                    onboardingSessionId: onboardingSession._id
                });
                user.companyId = company._id;
                yield user.save();
                const subscription = yield Subscription_1.Subscription.create({
                    companyId: company._id,
                    userId: user._id,
                    onboardingSessionId: onboardingSession._id,
                    plan: input.plan,
                    cycle: billingCycle,
                    status: 'past_due'
                });
                const paymentSession = yield PaymentSession_1.PaymentSession.create({
                    companyId: company._id,
                    userId: user._id,
                    subscriptionId: subscription._id,
                    onboardingSessionId: onboardingSession._id,
                    idempotencyKey: `${idempotencyKey}:payment`,
                    provider: 'paynow',
                    plan: input.plan,
                    billingCycle,
                    amount,
                    currency: 'USD',
                    status: 'pending',
                    metadata: { source: 'onboarding_v2' }
                });
                const billingPayment = yield BillingPayment_1.BillingPayment.create({
                    companyId: company._id,
                    userId: user._id,
                    subscriptionId: subscription._id,
                    onboardingSessionId: onboardingSession._id,
                    paymentSessionId: paymentSession._id,
                    plan: input.plan,
                    cycle: billingCycle,
                    amount,
                    currency: 'USD',
                    method: 'card',
                    provider: 'paynow',
                    providerRef: paymentSession._id.toString(),
                    idempotencyKey: `${idempotencyKey}:billing`,
                    status: 'pending'
                });
                paymentSession.billingPaymentId = billingPayment._id;
                yield paymentSession.save();
                onboardingSession.companyId = company._id;
                onboardingSession.subscriptionId = subscription._id;
                onboardingSession.paymentSessionId = paymentSession._id;
                onboardingSession.status = 'PENDING_PAYMENT';
                onboardingSession.currentStep = 'PENDING_PAYMENT';
                yield onboardingSession.save();
                return { onboardingSession, user, company, subscription, paymentSession, billingPayment, alreadyProcessed: false };
            }
            catch (error) {
                onboardingSession.status = 'FAILED_SETUP';
                onboardingSession.currentStep = 'FAILED_SETUP';
                onboardingSession.retryCount += 1;
                onboardingSession.lastError = (error === null || error === void 0 ? void 0 : error.message) || String(error);
                yield onboardingSession.save();
                throw error;
            }
        });
    }
    hydrate(onboardingSessionId, alreadyProcessed) {
        return __awaiter(this, void 0, void 0, function* () {
            const onboardingSession = yield OnboardingSession_1.OnboardingSession.findById(onboardingSessionId);
            if (!onboardingSession)
                throw new errorHandler_1.AppError('Onboarding session not found', 404, 'ONBOARDING_NOT_FOUND');
            const [user, company, subscription, paymentSession] = yield Promise.all([
                onboardingSession.userId ? User_1.User.findById(onboardingSession.userId) : null,
                onboardingSession.companyId ? Company_1.Company.findById(onboardingSession.companyId) : null,
                onboardingSession.subscriptionId ? Subscription_1.Subscription.findById(onboardingSession.subscriptionId) : null,
                onboardingSession.paymentSessionId ? PaymentSession_1.PaymentSession.findById(onboardingSession.paymentSessionId) : null
            ]);
            return { onboardingSession, user, company, subscription, paymentSession, alreadyProcessed };
        });
    }
}
exports.OnboardingService = OnboardingService;
exports.default = OnboardingService;
