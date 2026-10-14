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
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../middleware/errorHandler");
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Subscription_1 = require("../models/Subscription");
const OnboardingSession_1 = require("../models/OnboardingSession");
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const plan_1 = require("../types/plan");
const normalization_1 = require("../utils/normalization");
const registrationPaymentPolicy_1 = require("./registrationPaymentPolicy");
const systemPlanService_1 = require("./systemPlanService");
const abandonedRegistrationService_1 = require("./abandonedRegistrationService");
const billingActivationService_1 = require("./billingActivationService");
const auditService_1 = require("./auditService");
function deriveIdempotencyKey(input) {
    var _a;
    if (input.idempotencyKey)
        return input.idempotencyKey;
    const material = `${(0, normalization_1.normalizeEmail)(input.email)}:${input.registrationMode || 'trial'}:${input.plan || ''}:${input.billingCycle || 'monthly'}:${((_a = input.company) === null || _a === void 0 ? void 0 : _a.name) || ''}`;
    return crypto_1.default.createHash('sha256').update(material).digest('hex');
}
function splitName(name) {
    const [firstNameRaw, ...lastParts] = String(name || '').trim().split(/\s+/);
    const firstName = firstNameRaw || 'User';
    const lastName = lastParts.join(' ') || firstNameRaw || 'Admin';
    return { firstName, lastName };
}
function compensate(ids) {
    return __awaiter(this, void 0, void 0, function* () {
        if (ids.billingPaymentId) {
            yield BillingPayment_1.BillingPayment.deleteOne({ _id: ids.billingPaymentId, status: { $in: ['pending', 'failed', 'cancelled'] } });
        }
        if (ids.paymentSessionId) {
            yield PaymentSession_1.PaymentSession.deleteOne({ _id: ids.paymentSessionId, status: { $nin: ['paid', 'reconciled'] } });
        }
        if (ids.subscriptionId) {
            yield Subscription_1.Subscription.deleteOne({ _id: ids.subscriptionId, status: { $in: ['past_due', 'trial'] } });
        }
        if (ids.companyId) {
            yield Company_1.Company.deleteOne({
                _id: ids.companyId,
                onboardingStatus: { $in: ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP', 'INITIALIZING_WORKSPACE'] },
                onboardingCompleted: { $ne: true }
            });
        }
        if (ids.userId) {
            const user = yield User_1.User.findById(ids.userId).select('companyId role');
            const companyGone = !ids.companyId || !(yield Company_1.Company.exists({ _id: ids.companyId }));
            if (user && user.role !== 'system_admin' && (companyGone || !user.companyId)) {
                yield User_1.User.deleteOne({ _id: ids.userId });
            }
        }
        if (ids.onboardingSessionId) {
            yield OnboardingSession_1.OnboardingSession.deleteOne({
                _id: ids.onboardingSessionId,
                status: { $in: ['PENDING_SETUP', 'FAILED_SETUP', 'PENDING_PAYMENT', 'INITIALIZING_WORKSPACE'] }
            });
        }
    });
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
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
            const idempotencyKey = deriveIdempotencyKey(input);
            const email = (0, normalization_1.normalizeEmail)(input.email);
            const companyType = (0, normalization_1.normalizeCompanyType)((_a = input.company) === null || _a === void 0 ? void 0 : _a.companyType);
            const offer = (0, registrationPaymentPolicy_1.resolvePublicRegistration)({
                plan: input.plan,
                registrationMode: input.registrationMode,
                billingCycle: input.billingCycle
            });
            if (!offer.ok) {
                throw new errorHandler_1.AppError(offer.message, offer.status, offer.code);
            }
            const plan = offer.plan;
            const billingCycle = offer.billingCycle;
            const paymentHold = offer.paymentRequired;
            const planConfig = plan_1.PLAN_CONFIG[plan];
            const workspaceType = planConfig.workspaceType;
            const normalizedCompanyEmail = (0, normalization_1.normalizeEmail)(((_b = input.company) === null || _b === void 0 ? void 0 : _b.email) || input.email);
            const normalizedRegistrationNumber = (0, normalization_1.normalizeLegalIdentifier)((_c = input.company) === null || _c === void 0 ? void 0 : _c.registrationNumber);
            const normalizedTinNumber = (0, normalization_1.normalizeLegalIdentifier)((_d = input.company) === null || _d === void 0 ? void 0 : _d.tinNumber);
            const amount = paymentHold ? yield (0, systemPlanService_1.chargeForPlan)(plan, billingCycle) : null;
            if (!email || !input.password || !String(input.name || '').trim()) {
                throw new errorHandler_1.AppError('Email, password and name are required', 400, 'VALIDATION_ERROR');
            }
            if (!(0, registrationPaymentPolicy_1.isRegistrationEmail)(email)) {
                throw new errorHandler_1.AppError('Email is invalid', 400, 'VALIDATION_ERROR');
            }
            const passwordError = (0, registrationPaymentPolicy_1.registrationPasswordError)(input.password);
            if (passwordError)
                throw new errorHandler_1.AppError(passwordError, 400, 'VALIDATION_ERROR');
            if (!String(((_e = input.company) === null || _e === void 0 ? void 0 : _e.name) || '').trim()) {
                throw new errorHandler_1.AppError('Company name is required', 400, 'VALIDATION_ERROR');
            }
            if (!String(((_f = input.company) === null || _f === void 0 ? void 0 : _f.country) || '').trim()) {
                throw new errorHandler_1.AppError('Country is required', 400, 'VALIDATION_ERROR');
            }
            if (companyType === 'REGISTERED_BUSINESS' && (!normalizedRegistrationNumber || !normalizedTinNumber)) {
                throw new errorHandler_1.AppError('Registration number and TIN number are required for registered businesses', 400, 'VALIDATION_ERROR');
            }
            if (paymentHold && amount == null) {
                throw new errorHandler_1.AppError('This plan does not have a configured price for the selected billing frequency', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
            }
            const duplicateUser = yield User_1.User.findOne({ $or: [{ normalizedEmail: email }, { email }] });
            if (duplicateUser) {
                const resumed = yield this.recoverDuplicate(duplicateUser, input.password, { plan, billingCycle });
                if (resumed)
                    return resumed;
            }
            const existingSession = yield OnboardingSession_1.OnboardingSession.findOne({ idempotencyKey });
            if (existingSession && existingSession.status !== 'FAILED_SETUP' && existingSession.status !== 'EXPIRED') {
                if (existingSession.userId) {
                    const sessionUser = yield User_1.User.findById(existingSession.userId);
                    const sameEmail = sessionUser && (0, normalization_1.normalizeEmail)(sessionUser.email) === email;
                    const passwordOk = sessionUser ? yield sessionUser.comparePassword(input.password) : false;
                    if (!sessionUser || sessionUser.isArchived || !sameEmail || !passwordOk) {
                        throw new errorHandler_1.AppError(abandonedRegistrationService_1.SIGN_IN_REQUIRED_MESSAGE, 400, 'REGISTRATION_SIGN_IN_REQUIRED');
                    }
                }
                return this.hydrate(existingSession._id.toString(), true);
            }
            if ((existingSession === null || existingSession === void 0 ? void 0 : existingSession.status) === 'FAILED_SETUP') {
                yield compensate({
                    userId: existingSession.userId,
                    companyId: existingSession.companyId,
                    subscriptionId: existingSession.subscriptionId,
                    paymentSessionId: existingSession.paymentSessionId,
                    onboardingSessionId: existingSession._id
                });
            }
            if ((existingSession === null || existingSession === void 0 ? void 0 : existingSession.status) === 'EXPIRED' && existingSession.idempotencyKey === idempotencyKey) {
                existingSession.idempotencyKey = `archived:${existingSession._id.toString()}`;
                yield existingSession.save();
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
            const ids = {};
            const run = (session) => __awaiter(this, void 0, void 0, function* () {
                const saveOpts = session ? { session } : undefined;
                const onboardingSession = yield OnboardingSession_1.OnboardingSession.create([{
                        idempotencyKey,
                        status: 'PENDING_SETUP',
                        plan,
                        billingCycle,
                        companyType,
                        workspaceType,
                        currentStep: 'CREATE_USER',
                        retryCount: existingSession ? existingSession.retryCount + 1 : 0
                    }], saveOpts);
                ids.onboardingSessionId = onboardingSession[0]._id;
                const { firstName, lastName } = splitName(input.name);
                const user = yield User_1.User.create([{
                        email,
                        normalizedEmail: email,
                        password: input.password,
                        firstName,
                        lastName,
                        role: 'admin',
                        roles: ['admin'],
                        isActive: true
                    }], saveOpts);
                ids.userId = user[0]._id;
                const trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + 14);
                const company = yield Company_1.Company.create([Object.assign(Object.assign(Object.assign(Object.assign({ name: String(input.company.name).trim(), email: normalizedCompanyEmail, normalizedEmail: normalizedCompanyEmail, address: input.company.address || (companyType === 'INDIVIDUAL_LANDLORD' ? 'N/A' : undefined), phone: input.company.phone || (companyType === 'INDIVIDUAL_LANDLORD' ? 'N/A' : undefined), website: input.company.website }, (normalizedRegistrationNumber ? { registrationNumber: normalizedRegistrationNumber, normalizedRegistrationNumber } : {})), (normalizedTinNumber ? { tinNumber: normalizedTinNumber, normalizedTinNumber } : {})), (String(input.company.vatNumber || '').trim() ? { vatNumber: String(input.company.vatNumber).trim() } : {})), { country: input.company.country ? String(input.company.country).trim().slice(0, 80) : undefined, companyType,
                        workspaceType, tenantStatus: paymentHold ? 'pending' : 'active', onboardingStatus: paymentHold ? 'PENDING_PAYMENT' : 'INITIALIZING_WORKSPACE', onboardingCompleted: false, ownerId: user[0]._id, plan, propertyLimit: planConfig.propertyLimit, featureFlags: planConfig.featureFlags, isActive: !paymentHold, subscriptionStatus: paymentHold ? 'inactive' : 'trial', subscriptionEndDate: paymentHold ? undefined : trialEnd, onboardingSessionId: onboardingSession[0]._id })], saveOpts);
                ids.companyId = company[0]._id;
                user[0].companyId = company[0]._id;
                yield user[0].save(saveOpts);
                const subscription = yield Subscription_1.Subscription.create([{
                        companyId: company[0]._id,
                        userId: user[0]._id,
                        onboardingSessionId: onboardingSession[0]._id,
                        plan,
                        cycle: billingCycle,
                        status: paymentHold ? 'past_due' : 'trial',
                        trialStartDate: paymentHold ? undefined : new Date(),
                        trialEndDate: paymentHold ? undefined : trialEnd,
                        trialDurationDays: 14,
                        currentPeriodStart: paymentHold ? undefined : new Date(),
                        currentPeriodEnd: paymentHold ? undefined : trialEnd
                    }], saveOpts);
                ids.subscriptionId = subscription[0]._id;
                let paymentSession = null;
                let billingPayment = null;
                if (paymentHold) {
                    const createdSession = yield PaymentSession_1.PaymentSession.create([{
                            companyId: company[0]._id,
                            userId: user[0]._id,
                            subscriptionId: subscription[0]._id,
                            onboardingSessionId: onboardingSession[0]._id,
                            idempotencyKey: `${idempotencyKey}:payment`,
                            provider: 'paynow',
                            providerRef: `SUBS-${company[0]._id.toString()}`,
                            plan,
                            billingCycle,
                            amount,
                            currency: 'USD',
                            status: 'pending',
                            metadata: { source: 'company_registration' }
                        }], saveOpts);
                    paymentSession = createdSession[0];
                    ids.paymentSessionId = paymentSession._id;
                    const createdBilling = yield BillingPayment_1.BillingPayment.create([{
                            companyId: company[0]._id,
                            userId: user[0]._id,
                            subscriptionId: subscription[0]._id,
                            onboardingSessionId: onboardingSession[0]._id,
                            paymentSessionId: paymentSession._id,
                            plan,
                            cycle: billingCycle,
                            amount,
                            currency: 'USD',
                            method: 'card',
                            provider: 'paynow',
                            providerRef: `SUBS-${company[0]._id.toString()}`,
                            idempotencyKey: `${idempotencyKey}:billing`,
                            status: 'pending'
                        }], saveOpts);
                    billingPayment = createdBilling[0];
                    ids.billingPaymentId = billingPayment._id;
                    paymentSession.billingPaymentId = billingPayment._id;
                    yield paymentSession.save(saveOpts);
                }
                else {
                    company[0].onboardingStatus = 'ACTIVE';
                    company[0].onboardingCompleted = true;
                    yield company[0].save(saveOpts);
                }
                onboardingSession[0].userId = user[0]._id;
                onboardingSession[0].companyId = company[0]._id;
                onboardingSession[0].subscriptionId = subscription[0]._id;
                onboardingSession[0].paymentSessionId = paymentSession === null || paymentSession === void 0 ? void 0 : paymentSession._id;
                onboardingSession[0].status = paymentHold ? 'PENDING_PAYMENT' : 'ACTIVE';
                onboardingSession[0].currentStep = paymentHold ? 'PENDING_PAYMENT' : 'DASHBOARD';
                if (!paymentHold)
                    onboardingSession[0].completedAt = new Date();
                yield onboardingSession[0].save(saveOpts);
                return {
                    onboardingSession: onboardingSession[0],
                    user: user[0],
                    company: company[0],
                    subscription: subscription[0],
                    paymentSession,
                    billingPayment,
                    alreadyProcessed: false
                };
            });
            const session = yield mongoose_1.default.startSession();
            try {
                let result;
                try {
                    yield session.withTransaction(() => __awaiter(this, void 0, void 0, function* () {
                        result = yield run(session);
                    }));
                }
                catch (txError) {
                    const message = String((txError === null || txError === void 0 ? void 0 : txError.message) || '');
                    const unsupported = /transaction numbers are only allowed|transactions are not supported|transaction is not supported/i.test(message);
                    if (!unsupported)
                        throw txError;
                    yield compensate(ids);
                    Object.keys(ids).forEach((key) => { delete ids[key]; });
                    result = yield run(undefined);
                }
                if (result && !result.alreadyProcessed) {
                    yield (0, auditService_1.recordAuditEvent)({
                        userId: (_j = (_h = (_g = result.user) === null || _g === void 0 ? void 0 : _g._id) === null || _h === void 0 ? void 0 : _h.toString) === null || _j === void 0 ? void 0 : _j.call(_h),
                        companyId: (_m = (_l = (_k = result.company) === null || _k === void 0 ? void 0 : _k._id) === null || _l === void 0 ? void 0 : _l.toString) === null || _m === void 0 ? void 0 : _m.call(_l),
                        action: 'registration.initiated',
                        entityType: 'Company',
                        entityId: (_q = (_p = (_o = result.company) === null || _o === void 0 ? void 0 : _o._id) === null || _p === void 0 ? void 0 : _p.toString) === null || _q === void 0 ? void 0 : _q.call(_p),
                        metadata: { plan: (_r = result.company) === null || _r === void 0 ? void 0 : _r.plan, paymentRequired: Boolean(result.paymentSession) }
                    });
                }
                return result;
            }
            catch (error) {
                yield compensate(ids);
                if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                    const dup = String((error === null || error === void 0 ? void 0 : error.message) || '');
                    if (dup.toLowerCase().includes('email'))
                        throw new errorHandler_1.AppError('Email already registered', 400, 'DUPLICATE_EMAIL');
                    if (dup.includes('tinNumber') || dup.includes('registrationNumber'))
                        throw new errorHandler_1.AppError('Company already exists', 400, 'DUPLICATE_COMPANY');
                    const raced = yield OnboardingSession_1.OnboardingSession.findOne({ idempotencyKey });
                    if (raced && raced.status !== 'FAILED_SETUP')
                        return this.hydrate(raced._id.toString(), true);
                    throw new errorHandler_1.AppError('Duplicate registration', 409, 'DUPLICATE_KEY');
                }
                if (error instanceof errorHandler_1.AppError)
                    throw error;
                if ((error === null || error === void 0 ? void 0 : error.name) === 'ValidationError') {
                    throw new errorHandler_1.AppError('Registration details are not valid', 400, 'VALIDATION_ERROR');
                }
                throw new errorHandler_1.AppError('Registration could not be completed', 500, 'REGISTRATION_FAILED');
            }
            finally {
                session.endSession();
            }
        });
    }
    recoverDuplicate(user, password, offer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (user.role === 'system_admin' || (user.roles || []).includes('system_admin') || !user.companyId) {
                throw new errorHandler_1.AppError(abandonedRegistrationService_1.SIGN_IN_REQUIRED_MESSAGE, 400, 'REGISTRATION_SIGN_IN_REQUIRED');
            }
            const outcome = yield (0, abandonedRegistrationService_1.releaseAbandonedRegistration)(user.companyId);
            if (outcome === 'released')
                return null;
            const passwordOk = user.isActive !== false && !user.isArchived && (yield user.comparePassword(password));
            if (!passwordOk) {
                throw new errorHandler_1.AppError(abandonedRegistrationService_1.SIGN_IN_REQUIRED_MESSAGE, 400, 'REGISTRATION_SIGN_IN_REQUIRED');
            }
            const company = yield Company_1.Company.findById(user.companyId);
            if (!company) {
                throw new errorHandler_1.AppError(abandonedRegistrationService_1.SIGN_IN_REQUIRED_MESSAGE, 400, 'REGISTRATION_SIGN_IN_REQUIRED');
            }
            return this.buildResume(user, company, offer);
        });
    }
    buildResume(user, company, offer) {
        return __awaiter(this, void 0, void 0, function* () {
            const [subscription, sessions, onboardingSession] = yield Promise.all([
                Subscription_1.Subscription.findOne({ companyId: company._id }).sort({ createdAt: -1 }),
                PaymentSession_1.PaymentSession.find({ companyId: company._id }).sort({ createdAt: -1 }),
                OnboardingSession_1.OnboardingSession.findOne({ companyId: company._id }).sort({ createdAt: -1 })
            ]);
            const subscriptionStatus = String((subscription === null || subscription === void 0 ? void 0 : subscription.status) || '').toLowerCase();
            const companySubscription = String(company.subscriptionStatus || '').toLowerCase();
            const onboardingStatus = String(company.onboardingStatus || '');
            const pack = (nextStep, code, message, paymentSession) => __awaiter(this, void 0, void 0, function* () {
                yield (0, auditService_1.recordAuditEvent)({
                    userId: String(user._id),
                    companyId: String(company._id),
                    action: 'registration.resumed',
                    entityType: 'Company',
                    entityId: String(company._id),
                    metadata: { code }
                });
                return {
                    onboardingSession,
                    user,
                    company,
                    subscription,
                    paymentSession,
                    billingPayment: null,
                    alreadyProcessed: true,
                    resume: { nextStep, code, message }
                };
            });
            if (subscriptionStatus === 'trial' || (companySubscription === 'trial' && onboardingStatus === 'ACTIVE')) {
                return pack('dashboard', 'TRIAL_ACTIVE', 'This email already has an active trial. Sign in to continue. The trial is not restarted.', null);
            }
            if (subscriptionStatus === 'active' || companySubscription === 'active' || (onboardingStatus === 'ACTIVE' && company.tenantStatus === 'active')) {
                return pack('dashboard', 'ACCOUNT_EXISTS', 'This email already has an account. Sign in to continue.', null);
            }
            if (onboardingStatus === 'PAYMENT_RECEIVED' || onboardingStatus === 'INITIALIZING_WORKSPACE') {
                return pack('dashboard', 'PAYMENT_ALREADY_VERIFIED', 'Payment for this registration is already confirmed. Sign in to continue.', null);
            }
            const paidSession = sessions.find((session) => session.status === 'paid' || session.status === 'reconciled');
            if (paidSession) {
                if (paidSession.status === 'paid') {
                    yield (0, billingActivationService_1.activateSubscriptionFromPayment)({ paymentSessionId: String(paidSession._id), paidAt: paidSession.paidAt || new Date() });
                }
                const refreshed = yield Company_1.Company.findById(company._id);
                return pack('dashboard', 'PAYMENT_ALREADY_VERIFIED', 'Payment for this registration is already confirmed. Sign in to continue.', null)
                    .then((result) => (Object.assign(Object.assign({}, result), { company: refreshed || company })));
            }
            const openSession = sessions.find((session) => session.status === 'pending' || session.status === 'provider_created');
            if (openSession && (openSession.status === 'provider_created' || openSession.pollUrl)) {
                return pack('payment', 'PAYMENT_IN_PROGRESS', 'This payment is still being checked. Do not start another payment until it is confirmed.', openSession);
            }
            let paymentSession = openSession || sessions.find((session) => ['failed', 'cancelled', 'expired'].includes(session.status)) || null;
            if (paymentSession && paymentSession.status === 'pending' && !paymentSession.pollUrl && (paymentSession.plan !== offer.plan || paymentSession.billingCycle !== offer.billingCycle)) {
                const nextAmount = yield (0, systemPlanService_1.chargeForPlan)(offer.plan, offer.billingCycle);
                if (nextAmount != null) {
                    paymentSession.plan = offer.plan;
                    paymentSession.billingCycle = offer.billingCycle;
                    paymentSession.amount = nextAmount;
                    yield paymentSession.save();
                    if (subscription && !['trial', 'active'].includes(subscriptionStatus)) {
                        subscription.plan = offer.plan;
                        subscription.cycle = offer.billingCycle;
                        yield subscription.save();
                    }
                    company.plan = offer.plan;
                    yield company.save();
                }
            }
            if (!paymentSession && subscription) {
                const amount = yield (0, systemPlanService_1.chargeForPlan)(company.plan, subscription.cycle);
                if (amount == null) {
                    throw new errorHandler_1.AppError('This plan does not have a configured price for the selected billing frequency', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
                }
                paymentSession = yield PaymentSession_1.PaymentSession.create({
                    companyId: company._id,
                    userId: user._id,
                    subscriptionId: subscription._id,
                    onboardingSessionId: onboardingSession === null || onboardingSession === void 0 ? void 0 : onboardingSession._id,
                    idempotencyKey: `resume:${company._id.toString()}:${Date.now()}`,
                    provider: 'paynow',
                    providerRef: `SUBS-${company._id.toString()}`,
                    plan: company.plan,
                    billingCycle: subscription.cycle,
                    amount,
                    currency: 'USD',
                    status: 'pending',
                    metadata: { source: 'registration_resume' }
                });
            }
            const retrying = paymentSession && ['failed', 'cancelled', 'expired'].includes(paymentSession.status);
            return pack('payment', retrying ? 'CHECKOUT_RETRY' : 'PENDING_REGISTRATION', retrying
                ? 'No successful payment has been confirmed. You can retry checkout. This registration is still saved.'
                : 'Registration is not complete yet. Continue to checkout. You can return later with the same email address and password.', paymentSession);
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
