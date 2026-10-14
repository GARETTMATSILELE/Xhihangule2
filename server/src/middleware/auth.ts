import { Request, Response, NextFunction } from 'express';
import { JwtPayload, IPropertyOwner, UserRole } from '../types/auth';
import { AuthService } from '../services/authService';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Subscription } from '../models/Subscription';
import { companyAwaitingRegistrationPayment, isRegistrationPaymentExemptPath } from '../services/registrationPaymentPolicy';

const authService = AuthService.getInstance();
const COMPANY_CONTEXT_CACHE_TTL_MS = Number(process.env.COMPANY_CONTEXT_CACHE_TTL_MS || 60000);

type CompanyContext = {
  userId: string;
  companyId?: string;
  role: UserRole;
  roles?: UserRole[];
  tenantStatus?: string;
  onboardingStatus?: string;
  subscriptionStatus?: string;
  subscriptionId?: string;
  subscriptionOverride?: {
    enabled?: boolean;
    expiresAt?: Date;
  };
  legacyTokenCompanyId?: string;
};

const companyContextCache = new Map<string, { expiresAt: number; context: CompanyContext }>();

const getRequestToken = (req: Request): string | undefined => {
  const headerToken = req.headers.authorization?.split(' ')[1];
  const cookieToken = req.cookies?.accessToken as string | undefined;
  return headerToken || cookieToken;
};

export interface AuthRequest extends Request {
  user?: JwtPayload;
  owner?: IPropertyOwner;
  companyContext?: CompanyContext;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      owner?: IPropertyOwner;
      companyContext?: CompanyContext;
    }
  }
}

export async function resolveCompanyContext(userData: JwtPayload): Promise<CompanyContext> {
  const cacheKey = `${userData.userId}:${userData.companyId || 'legacy-none'}`;
  const now = Date.now();
  const cached = companyContextCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.context;
  }

  const base: CompanyContext = {
    userId: userData.userId,
    role: userData.role,
    roles: (userData as any).roles,
    companyId: userData.companyId,
    legacyTokenCompanyId: userData.companyId
  };

  try {
    const user = await User.findById(userData.userId)
      .select('_id role roles companyId isActive sessionVersion')
      .maxTimeMS(5000)
      .lean();

    if (!user) return base;
    if ((user as any).isActive === false) return base;

    const companyId = (user as any).companyId ? String((user as any).companyId) : userData.companyId;
    const context: CompanyContext = {
      ...base,
      role: ((user as any).role || userData.role) as UserRole,
      roles: Array.isArray((user as any).roles) && (user as any).roles.length > 0 ? (user as any).roles : base.roles,
      companyId
    };

    if (companyId) {
      const [company, subscription] = await Promise.all([
        Company.findById(companyId)
          .select('_id tenantStatus onboardingStatus subscriptionStatus isActive subscriptionOverride')
          .maxTimeMS(5000)
          .lean(),
        Subscription.findOne({ companyId })
          .select('_id status currentPeriodEnd trialEndDate gracePeriodEnd adminOverride')
          .sort({ updatedAt: -1 })
          .maxTimeMS(5000)
          .lean()
      ]);

      if (company) {
        context.tenantStatus = String((company as any).tenantStatus || (((company as any).isActive === false) ? 'suspended' : 'active'));
        context.onboardingStatus = String((company as any).onboardingStatus || 'ACTIVE');
        context.subscriptionStatus = String((company as any).subscriptionStatus || (subscription as any)?.status || 'trial');
        context.subscriptionOverride = (company as any).subscriptionOverride;
      }
      if (subscription) {
        context.subscriptionId = String((subscription as any)._id);
        context.subscriptionStatus = String((subscription as any).status || context.subscriptionStatus || 'trial');
        context.subscriptionOverride = (subscription as any).adminOverride || context.subscriptionOverride;
      }
    }

    companyContextCache.set(cacheKey, { expiresAt: now + COMPANY_CONTEXT_CACHE_TTL_MS, context });
    return context;
  } catch {
    // Legacy-safe fallback: do not break existing tokens during transient DB outages.
    return base;
  }
}

function attachUser(req: AuthRequest, userData: JwtPayload, context: CompanyContext) {
  req.user = {
    userId: userData.userId,
    role: context.role || userData.role,
    roles: context.roles || (userData as any).roles,
    companyId: context.companyId || userData.companyId
  } as any;
  req.companyContext = context;
}

// Basic auth middleware that doesn't require companyId
export const auth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = getRequestToken(req);

    if (!token) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Verify token claims first, then enrich with current DB company context.
    // If DB enrichment fails, legacy token claims still work.
    const userData = authService.verifyAccessTokenClaims(token);
    const context = await resolveCompanyContext(userData);
    attachUser(req, userData, context);

    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return res.status(401).json({
          status: 'error',
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (error.message.includes('Invalid')) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
    }
    
    return res.status(401).json({
      status: 'error',
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

// PropertyOwner-specific auth middleware
export const propertyOwnerAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = getRequestToken(req);

    if (!token) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Claim verification plus company-context enrichment; legacy claims still work
    // if enrichment is unavailable.
    const userData = authService.verifyAccessTokenClaims(token);
    const context = await resolveCompanyContext(userData);
    
    // Ensure this is a PropertyOwner
    if (userData.role !== 'owner') {
      return res.status(403).json({
        status: 'error',
        message: 'Property owner access required',
        code: 'OWNER_ACCESS_REQUIRED'
      });
    }

    // For PropertyOwners, ensure they have a companyId
    if (!context.companyId) {
      return res.status(403).json({
        status: 'error',
        message: 'Property owner must be associated with a company',
        code: 'NO_COMPANY'
      });
    }
    
    attachUser(req, userData, context);

    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return res.status(401).json({
          status: 'error',
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (error.message.includes('Invalid')) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
    }
    
    return res.status(401).json({
      status: 'error',
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

// Auth middleware that requires companyId
export const authWithCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = getRequestToken(req);

    if (!token) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Company context is read from the current user relation when available so
    // newly linked companies work before the user's next full login.
    const userData = authService.verifyAccessTokenClaims(token);
    const context = await resolveCompanyContext(userData);
    
    if (!context.companyId) {
      return res.status(403).json({
        status: 'error',
        message: 'User is not associated with any company',
        code: 'NO_COMPANY'
      });
    }

    attachUser(req, userData, context);

    // Do not use the 60-second company cache for suspension. A suspended company
    // must lose access on the next request, and reactivation must not wait for cache expiry.
    const freshCompany = await Company.findById(context.companyId).select('tenantStatus isActive onboardingStatus').lean();
    const tenantStatus = freshCompany
      ? String((freshCompany as any).tenantStatus || ((freshCompany as any).isActive === false ? 'suspended' : 'active'))
      : (context.tenantStatus || 'active');
    const onboardingStatus = String((freshCompany as any)?.onboardingStatus || context.onboardingStatus || 'ACTIVE');
    const url = String(req.originalUrl || req.url || '');
    const suspensionExempt = isRegistrationPaymentExemptPath(url);
    if (!suspensionExempt && companyAwaitingRegistrationPayment(onboardingStatus)) {
      return res.status(403).json({
        status: 'error',
        message: 'Complete registration payment before using the workspace',
        code: 'PAYMENT_REQUIRED'
      });
    }
    if (!suspensionExempt && tenantStatus !== 'active' && tenantStatus !== 'pending') {
      return res.status(403).json({
        status: 'error',
        message: 'Company workspace is not active',
        code: 'TENANT_INACTIVE'
      });
    }

    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return res.status(401).json({
          status: 'error',
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (error.message.includes('Invalid')) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
    }
    
    return res.status(401).json({
      status: 'error',
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

// Role-based authorization middleware
export const authorize = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRoles = ((req.user as any).roles as UserRole[] | undefined) || [req.user.role as UserRole];
    if (!allowedRoles.some(r => userRoles.includes(r as UserRole))) {
      return res.status(403).json({
        status: 'error',
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
}; 

export const requireRole = authorize;

export const requireCompanyContext = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.companyId) {
    return res.status(403).json({
      status: 'error',
      message: 'Company context required',
      code: 'NO_COMPANY'
    });
  }

  const tenantStatus = req.companyContext?.tenantStatus || 'active';
  if (tenantStatus !== 'active' && tenantStatus !== 'pending') {
    return res.status(403).json({
      status: 'error',
      message: 'Company workspace is not active',
      code: 'TENANT_INACTIVE'
    });
  }

  next();
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'TRIAL', 'ACTIVE']);
const READ_ONLY_SUBSCRIPTION_STATUSES = new Set(['past_due', 'expired', 'PAST_DUE', 'EXPIRED', 'inactive']);
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireActiveSubscription = (options?: { allowBillingAccess?: boolean }) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.companyId) {
      return res.status(403).json({
        status: 'error',
        message: 'Company context required',
        code: 'NO_COMPANY'
      });
    }

    const roles = ((req.user as any).roles as UserRole[] | undefined) || [req.user.role as UserRole];
    const isAdminLike = roles.some((role) => ['admin', 'principal', 'prea', 'system_admin'].includes(role));
    if (options?.allowBillingAccess && isAdminLike) {
      return next();
    }

    const tenantStatus = req.companyContext?.tenantStatus || 'active';
    const subscriptionStatus = req.companyContext?.subscriptionStatus || 'trial';
    const override = req.companyContext?.subscriptionOverride;
    if (override?.enabled && (!override.expiresAt || new Date(override.expiresAt) > new Date())) {
      return next();
    }
    if (tenantStatus !== 'suspended' && READ_ONLY_METHODS.has(req.method) && READ_ONLY_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
      return next();
    }
    if (tenantStatus === 'suspended' || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
      return res.status(402).json({
        status: 'error',
        message: READ_ONLY_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
          ? 'Subscription expired. Your account is in read-only mode.'
          : 'Active subscription required',
        code: 'SUBSCRIPTION_INACTIVE',
        readOnly: READ_ONLY_SUBSCRIPTION_STATUSES.has(subscriptionStatus),
        subscriptionStatus
      });
    }

    next();
  };
};

export function tenantScopeQuery(req: Request, extra: Record<string, any> = {}) {
  const companyId = (req as AuthRequest).user?.companyId;
  if (!companyId) {
    return { ...extra, companyId: '__missing_company_context__' };
  }
  return { ...extra, companyId };
}