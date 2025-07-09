import { Request, Response, NextFunction } from 'express';
import { JwtPayload, IPropertyOwner, UserRole } from '../types/auth';
import { AppError } from './errorHandler';
import { AuthService } from '../services/authService';

const authService = AuthService.getInstance();

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
    // Get token from Authorization header or cookie
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    console.log('Auth middleware check:', {
      hasAuthHeader: !!req.headers.authorization,
      hasCookie: !!req.cookies?.token,
      hasToken: !!token,
      url: req.url
    });

    if (!token) {
      console.log('No token found in request');
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Verify token using auth service
    console.log('Verifying token...');
    const userData = await authService.verifyToken(token);
    
    console.log('Token verification successful:', {
      userId: userData.userId,
      role: userData.role,
      companyId: userData.companyId
    });
    
    req.user = {
      userId: userData.userId,
      role: userData.role,
      companyId: userData.companyId
    };

    console.log('User object set in request:', {
      userId: req.user.userId,
      role: req.user.role,
      companyId: req.user.companyId
    });

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
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
    // Get token from Authorization header or cookie
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Verify token using auth service
    const userData = await authService.verifyToken(token);
    
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
      companyId: userData.companyId
    };

    next();
  } catch (error) {
    console.error('PropertyOwner auth middleware error:', error);
    
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
    // Get token from Authorization header or cookie
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Verify token using auth service
    const userData = await authService.verifyToken(token);
    
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
      companyId: userData.companyId
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
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

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return res.status(403).json({
        status: 'error',
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
}; 