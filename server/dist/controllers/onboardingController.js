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
const onboardingService = onboardingService_1.OnboardingService.getInstance();
const authService = authService_1.AuthService.getInstance();
const isOnboardingV2Enabled = () => String(process.env.SAAS_ONBOARDING_V2 || '').toLowerCase() === 'true';
function setAuthCookies(res, token, refreshToken) {
    const prod = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: prod,
        sameSite: prod ? 'strict' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.cookie('accessToken', token, {
        httpOnly: true,
        secure: prod,
        sameSite: prod ? 'strict' : 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
    });
    res.cookie('refreshCsrf', crypto_1.default.randomBytes(32).toString('hex'), {
        httpOnly: false,
        secure: prod,
        sameSite: prod ? 'strict' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}
const startOnboarding = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        if (!isOnboardingV2Enabled()) {
            throw new errorHandler_1.AppError('New SaaS onboarding is not enabled', 404, 'ONBOARDING_DISABLED');
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
                tenantStatus: result.company.tenantStatus,
                onboardingStatus: result.company.onboardingStatus
            } : null,
            subscription: result.subscription ? {
                _id: result.subscription._id,
                plan: result.subscription.plan,
                cycle: result.subscription.cycle,
                status: result.subscription.status
            } : null,
            paymentSession: result.paymentSession ? {
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
            token
        });
    }
    catch (error) {
        next(error);
    }
});
exports.startOnboarding = startOnboarding;
