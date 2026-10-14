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
exports.startOnboarding = void 0;
const crypto_1 = __importDefault(require("crypto"));
const errorHandler_1 = require("../middleware/errorHandler");
const onboardingService_1 = require("../services/onboardingService");
const authService_1 = require("../services/authService");
const auditService_1 = require("../services/auditService");
const publicSignupCompany_1 = require("../utils/publicSignupCompany");
const onboardingService = onboardingService_1.OnboardingService.getInstance();
const authService = authService_1.AuthService.getInstance();
function cookieDomain() {
    const explicit = (process.env.COOKIE_DOMAIN || '').trim();
    if (explicit)
        return explicit;
    const fromUrl = (process.env.CLIENT_URL || process.env.APP_BASE_URL || '').trim();
    if (!fromUrl)
        return undefined;
    try {
        const hostname = new URL(fromUrl).hostname;
        return hostname.startsWith('www.') ? `.${hostname.slice(4)}` : `.${hostname}`;
    }
    catch (_a) {
        return undefined;
    }
}
function setAuthCookies(res, token, refreshToken) {
    const prod = process.env.NODE_ENV === 'production';
    const domain = cookieDomain();
    const scoped = prod && domain ? { domain } : {};
    res.cookie('refreshToken', refreshToken, Object.assign(Object.assign({ httpOnly: true, secure: prod, sameSite: prod ? 'strict' : 'lax', path: '/' }, scoped), { maxAge: 7 * 24 * 60 * 60 * 1000 }));
    res.cookie('accessToken', token, Object.assign(Object.assign({ httpOnly: true, secure: prod, sameSite: prod ? 'strict' : 'lax', path: '/' }, scoped), { maxAge: 24 * 60 * 60 * 1000 }));
    res.cookie('refreshCsrf', crypto_1.default.randomBytes(32).toString('hex'), Object.assign(Object.assign({ httpOnly: false, secure: prod, sameSite: prod ? 'strict' : 'lax', path: '/' }, scoped), { maxAge: 7 * 24 * 60 * 60 * 1000 }));
}
const startOnboarding = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    try {
        if (!(0, publicSignupCompany_1.isPublicSignupAllowed)(process.env)) {
            throw new errorHandler_1.AppError('Public signup is disabled', 403, 'SIGNUP_DISABLED');
        }
        const idempotencyKey = req.get('idempotency-key') || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.idempotencyKey);
        const result = yield onboardingService.start(Object.assign(Object.assign({}, req.body), { idempotencyKey }));
        const userId = (_d = (_c = (_b = result.user) === null || _b === void 0 ? void 0 : _b._id) === null || _c === void 0 ? void 0 : _c.toString) === null || _d === void 0 ? void 0 : _d.call(_c);
        let token;
        if (userId) {
            const session = yield authService.createSessionForUserId(userId);
            token = session.token;
            setAuthCookies(res, session.token, session.refreshToken);
        }
        yield (0, auditService_1.recordAuditEvent)({
            req,
            userId,
            companyId: (_g = (_f = (_e = result.company) === null || _e === void 0 ? void 0 : _e._id) === null || _f === void 0 ? void 0 : _f.toString) === null || _g === void 0 ? void 0 : _g.call(_f),
            action: 'onboarding.start',
            entityType: 'OnboardingSession',
            entityId: (_j = (_h = result.onboardingSession._id) === null || _h === void 0 ? void 0 : _h.toString) === null || _j === void 0 ? void 0 : _j.call(_h),
            metadata: { plan: result.onboardingSession.plan, alreadyProcessed: result.alreadyProcessed }
        });
        const resume = result.resume;
        const nextStep = (resume === null || resume === void 0 ? void 0 : resume.nextStep) || (((_k = result.company) === null || _k === void 0 ? void 0 : _k.onboardingStatus) === 'PENDING_PAYMENT' ? 'payment' : 'dashboard');
        res.status(result.alreadyProcessed ? 200 : 201).json({
            onboardingSession: {
                _id: result.onboardingSession._id,
                status: result.onboardingSession.status,
                currentStep: result.onboardingSession.currentStep
            },
            user: result.user ? {
                _id: result.user._id,
                email: result.user.email,
                role: result.user.role,
                companyId: result.user.companyId
            } : null,
            company: result.company ? {
                _id: result.company._id,
                name: result.company.name,
                plan: result.company.plan,
                workspaceType: result.company.workspaceType,
                tenantStatus: result.company.tenantStatus,
                onboardingStatus: result.company.onboardingStatus,
                onboardingCompleted: result.company.onboardingCompleted
            } : null,
            subscription: result.subscription ? {
                _id: result.subscription._id,
                plan: result.subscription.plan,
                cycle: result.subscription.cycle,
                status: result.subscription.status,
                trialStartDate: result.subscription.trialStartDate,
                trialEndDate: result.subscription.trialEndDate
            } : null,
            paymentSession: nextStep === 'payment' && result.paymentSession ? {
                _id: result.paymentSession._id,
                provider: result.paymentSession.provider,
                providerRef: result.paymentSession.providerRef,
                plan: result.paymentSession.plan,
                billingCycle: result.paymentSession.billingCycle,
                amount: result.paymentSession.amount,
                currency: result.paymentSession.currency,
                status: result.paymentSession.status,
                metadata: {
                    companyId: result.paymentSession.companyId,
                    userId: result.paymentSession.userId,
                    plan: result.paymentSession.plan,
                    billingCycle: result.paymentSession.billingCycle,
                    onboardingSessionId: result.paymentSession.onboardingSessionId
                }
            } : null,
            registration: {
                status: ((_l = result.company) === null || _l === void 0 ? void 0 : _l.onboardingStatus) || result.onboardingSession.status,
                nextStep,
                paymentRequired: nextStep === 'payment',
                code: resume === null || resume === void 0 ? void 0 : resume.code,
                message: resume === null || resume === void 0 ? void 0 : resume.message
            },
            token
        });
    }
    catch (error) {
        next(error);
    }
});
exports.startOnboarding = startOnboarding;
