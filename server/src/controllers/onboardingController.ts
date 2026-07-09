import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { OnboardingService } from '../services/onboardingService';
import { AuthService } from '../services/authService';
import { recordAuditEvent } from '../services/auditService';

const onboardingService = OnboardingService.getInstance();
const authService = AuthService.getInstance();

const isOnboardingV2Enabled = () => String(process.env.SAAS_ONBOARDING_V2 || '').toLowerCase() === 'true';

function setAuthCookies(res: Response, token: string, refreshToken: string) {
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
  res.cookie('refreshCsrf', crypto.randomBytes(32).toString('hex'), {
    httpOnly: false,
    secure: prod,
    sameSite: prod ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export const startOnboarding = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isOnboardingV2Enabled()) {
      throw new AppError('New SaaS onboarding is not enabled', 404, 'ONBOARDING_DISABLED');
    }

    const idempotencyKey = req.get('idempotency-key') || req.body?.idempotencyKey;
    const result = await onboardingService.start({
      ...req.body,
      idempotencyKey
    });

    const userId = result.user?._id?.toString?.();
    let token: string | undefined;
    if (userId) {
      const session = await authService.createSessionForUserId(userId);
      token = session.token;
      setAuthCookies(res, session.token, session.refreshToken);
    }

    await recordAuditEvent({
      req,
      userId,
      companyId: result.company?._id?.toString?.(),
      action: 'onboarding.start',
      entityType: 'OnboardingSession',
      entityId: result.onboardingSession._id?.toString?.(),
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
        tenantStatus: (result.company as any).tenantStatus,
        onboardingStatus: (result.company as any).onboardingStatus
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
  } catch (error) {
    next(error);
  }
};
