import { Request, Response, NextFunction } from 'express';
import { JwtPayload, IPropertyOwner, UserRole } from '../types/auth';
import { AuthService } from '../services/authService';

const authService = AuthService.getInstance();

const getRequestToken = (req: Request): string | undefined => {
  const headerToken = req.headers.authorization?.split(' ')[1];
  const cookieToken = req.cookies?.accessToken as string | undefined;
  return headerToken || cookieToken;
};

export interface AuthRequest extends Request {
  user?: JwtPayload;
  owner?: IPropertyOwner;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      owner?: IPropertyOwner;
    }
  }
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

    // Use claim-only verification to avoid DB dependency on every request.
    const userData = authService.verifyAccessTokenClaims(token);
    
    req.user = {
      userId: userData.userId,
      role: userData.role,
      roles: (userData as any).roles,
      companyId: userData.companyId
    } as any;

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

    // Claim-only verification avoids turning transient DB outages into blanket auth failures.
    const userData = authService.verifyAccessTokenClaims(token);
    
    // Ensure this is a PropertyOwner
    if (userData.role !== 'owner') {
      return res.status(403).json({
        status: 'error',
        message: 'Property owner access required',
        code: 'OWNER_ACCESS_REQUIRED'
      });
    }

    // For PropertyOwners, ensure they have a companyId
    if (!userData.companyId) {
      return res.status(403).json({
        status: 'error',
        message: 'Property owner must be associated with a company',
        code: 'NO_COMPANY'
      });
    }
    
    req.user = {
      userId: userData.userId,
      role: userData.role,
      roles: (userData as any).roles,
      companyId: userData.companyId
    } as any;

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

    // Claim-only verification avoids turning transient DB outages into blanket auth failures.
    const userData = authService.verifyAccessTokenClaims(token);
    
    if (!userData.companyId) {
      return res.status(403).json({
        status: 'error',
        message: 'User is not associated with any company',
        code: 'NO_COMPANY'
      });
    }

    req.user = {
      userId: userData.userId,
      role: userData.role,
      roles: (userData as any).roles,
      companyId: userData.companyId
    } as any;

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