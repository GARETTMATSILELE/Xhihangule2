import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { OnboardingService } from '../services/onboardingService';
import { AuthService } from '../services/authService';
import { recordAuditEvent } from '../services/auditService';
import { isPublicSignupAllowed } from '../utils/publicSignupCompany';

const onboardingService = OnboardingService.getInstance();
const authService = AuthService.getInstance();

function cookieDomain(): string | undefined {
  const explicit = (process.env.COOKIE_DOMAIN || '').trim();
  if (explicit) return explicit;
  const fromUrl = (process.env.CLIENT_URL || process.env.APP_BASE_URL || '').trim();
  if (!fromUrl) return undefined;
  try {
    const hostname = new URL(fromUrl).hostname;
    return hostname.startsWith('www.') ? `.${hostname.slice(4)}` : `.${hostname}`;
  } catch {
    return undefined;
  }
}

function setAuthCookies(res: Response, token: string, refreshToken: string) {
  const prod = process.env.NODE_ENV === 'production';
  const domain = cookieDomain();
  const scoped = prod && domain ? { domain } : {};
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'strict' : 'lax',
    path: '/',
    ...scoped,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'strict' : 'lax',
    path: '/',
    ...scoped,
    maxAge: 24 * 60 * 60 * 1000
  });
  res.cookie('refreshCsrf', crypto.randomBytes(32).toString('hex'), {
    httpOnly: false,
    secure: prod,
    sameSite: prod ? 'strict' : 'lax',
    path: '/',
    ...scoped,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export const startOnboarding = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isPublicSignupAllowed(process.env)) {
      throw new AppError('Public signup is disabled', 403, 'SIGNUP_DISABLED');
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

    const resume = (result as { resume?: { nextStep?: 'payment' | 'dashboard'; code?: string; message?: string } }).resume;
    const nextStep = resume?.nextStep || ((result.company as any)?.onboardingStatus === 'PENDING_PAYMENT' ? 'payment' : 'dashboard');

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
        plan: (result.company as any).plan,
        workspaceType: (result.company as any).workspaceType,
        tenantStatus: (result.company as any).tenantStatus,
        onboardingStatus: (result.company as any).onboardingStatus,
        onboardingCompleted: (result.company as any).onboardingCompleted
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
        status: (result.company as any)?.onboardingStatus || result.onboardingSession.status,
        nextStep,
        paymentRequired: nextStep === 'payment',
        code: resume?.code,
        message: resume?.message
      },
      token
    });
  } catch (error) {
    next(error);
  }
};
