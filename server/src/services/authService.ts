import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { PropertyOwner, IPropertyOwner } from '../models/PropertyOwner';
import { UserRole, JwtPayload } from '../types/auth';
import { AppError } from '../middleware/errorHandler';
import { isDatabaseAvailable, connectDatabase } from '../config/database';
import { JWT_CONFIG } from '../config/jwt';

// Token expiry times
const ACCESS_TOKEN_EXPIRY = JWT_CONFIG.ACCESS_TOKEN_EXPIRY;
const REFRESH_TOKEN_EXPIRY = JWT_CONFIG.REFRESH_TOKEN_EXPIRY;

export interface JwtUser extends JwtPayload {
  email?: string;
}

type AccessTokenClaims = {
  userId: string;
  role: UserRole;
  roles?: UserRole[];
  companyId?: string;
  type?: string;
  iat?: number;
  exp?: number;
};

export class AuthService {
  private static instance: AuthService;
  private isInitialized = false;

  private constructor() {}

  private static readonly DB_VERIFY_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS || 120000);
  private readonly userVerificationCache = new Map<string, { expiresAt: number; user: JwtUser }>();

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Be resilient during startup/transient reconnects: attempt a quick lazy connect + short retries
    if (!isDatabaseAvailable()) {
      try { await connectDatabase(); } catch {}
      for (let i = 0; i < 3 && !isDatabaseAvailable(); i++) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!isDatabaseAvailable()) {
      // Return an operational error so the API surfaces 503 instead of 500
      throw new AppError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE');
    }

    this.isInitialized = true;
  }

  private decodeAccessToken(token: string): AccessTokenClaims {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET, {
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE
    }) as AccessTokenClaims;

    if (!decoded?.userId || !decoded?.role) {
      throw new Error('Invalid access token payload');
    }
    if (decoded.type && decoded.type !== 'access') {
      throw new Error('Invalid access token type');
    }

    return decoded;
  }

  /**
   * Fast token verification path for request middleware.
   * This validates token integrity/expiry and extracts claims without requiring a DB round-trip.
   */
  public verifyAccessTokenClaims(token: string): JwtPayload {
    const decoded = this.decodeAccessToken(token);
    return {
      userId: decoded.userId,
      role: decoded.role,
      roles: decoded.roles,
      companyId: decoded.companyId
    };
  }

  public async getUserById(userId: string) {
    await this.initialize();
    
    // First try to find in PropertyOwner collection
    let propertyOwner = await PropertyOwner.findById(userId).maxTimeMS(5000);
    if (propertyOwner) {
      return { user: propertyOwner, type: 'propertyOwner' as const };
    }
    
    // If not found, try User collection
    let user = await User.findById(userId).maxTimeMS(5000);
    if (user) {
      return { user, type: 'user' as const };
    }
    
    return null;
  }

  public async login(email: string, password: string): Promise<{ user: JwtUser; token: string; refreshToken: string }> {
    await this.initialize();
    // Check only the User collection
    let user = await User.findOne({ email }).maxTimeMS(5000);
    if (!user) {
      throw new AppError('Invalid credentials', 401, 'AUTH_ERROR');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new AppError('Account is inactive', 403, 'ACCOUNT_INACTIVE');
    }

    // Verify password for User
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppError('Invalid credentials', 401, 'AUTH_ERROR');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = this.generateAccessToken(user, 'user');
    const refreshToken = this.generateRefreshToken(user, 'user');

    return {
      user: {
        userId: user._id.toString(),
        email: user.email,
        role: user.role as UserRole,
        roles: Array.isArray((user as any).roles) && (user as any).roles!.length > 0 ? (user as any).roles : undefined,
        companyId: user.companyId ? user.companyId.toString() : undefined
      },
      token,
      refreshToken
    };
  }

  public async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_CONFIG.REFRESH_SECRET, {
        issuer: JWT_CONFIG.ISSUER,
        audience: JWT_CONFIG.AUDIENCE
      }) as { userId: string; type?: string; iat?: number };

      if (!decoded?.userId) {
        throw new Error('Invalid refresh token payload');
      }
      if (decoded.type && decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token type');
      }

      await this.initialize();
      
      const userResult = await this.getUserById(decoded.userId);
      if (!userResult) {
        throw new Error('User not found');
      }

      const { user, type } = userResult;

      // Check if user is still active (only for User model)
      if (type === 'user' && !(user as IUser).isActive) {
        throw new Error('Account is inactive');
      }

      // Invalidate refresh token if password changed after token was issued
      try {
        const iatSec = typeof decoded.iat === 'number' ? decoded.iat : undefined;
        const pwdChangedAt: Date | undefined = (user as any).passwordChangedAt;
        if (iatSec && pwdChangedAt && pwdChangedAt.getTime() > iatSec * 1000) {
          throw new Error('Refresh token invalid due to password change');
        }
      } catch (cmpErr) {
        throw cmpErr;
      }

      const newToken = this.generateAccessToken(user, type);
      const newRefreshToken = this.generateRefreshToken(user, type);

      return {
        token: newToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw new Error('Token refresh failed');
    }
  }

  public async verifyToken(token: string): Promise<JwtUser> {
    await this.initialize();

    try {
      const decoded = this.decodeAccessToken(token);
      const cacheKey = `${decoded.userId}:${decoded.iat ?? 'na'}`;
      const now = Date.now();
      const cached = this.userVerificationCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.user;
      }
      
      const userResult = await this.getUserById(decoded.userId);
      if (!userResult) {
        throw new Error('User not found');
      }

      const { user, type } = userResult;

      // Invalidate access token if password changed after token was issued
      try {
        const iatSec = typeof decoded.iat === 'number' ? decoded.iat : undefined;
        const pwdChangedAt: Date | undefined = (user as any).passwordChangedAt;
        if (iatSec && pwdChangedAt && pwdChangedAt.getTime() > iatSec * 1000) {
          throw new Error('Access token invalid due to password change');
        }
      } catch (cmpErr) {
        throw cmpErr;
      }

      // Check if user is still active (only for User model)
      if (type === 'user' && !(user as IUser).isActive) {
        throw new Error('Account is inactive');
      }

      const result = {
        userId: user._id.toString(),
        email: user.email,
        role: type === 'user' ? (user as IUser).role as UserRole : 'owner',
        roles: type === 'user' ? ((Array.isArray((user as any).roles) && (user as any).roles!.length > 0) ? (user as any).roles : undefined) : undefined,
        companyId: (user as any).companyId ? (user as any).companyId.toString() : undefined
      };

      this.userVerificationCache.set(cacheKey, {
        user: result,
        expiresAt: now + AuthService.DB_VERIFY_CACHE_TTL_MS
      });

      return result;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      }
      throw new Error('Token verification failed');
    }
  }

  private generateAccessToken(user: any, userType: 'user' | 'propertyOwner'): string {
    const payload = {
      userId: user._id.toString(),
      role: userType === 'user' ? user.role : 'owner',
      roles: userType === 'user' ? ((Array.isArray(user.roles) && user.roles.length > 0) ? user.roles : undefined) : undefined,
      companyId: (user as any).companyId ? (user as any).companyId.toString() : undefined,
      type: 'access'
    };
    const options: SignOptions = {
      expiresIn: ACCESS_TOKEN_EXPIRY as any,
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE
    };
    return jwt.sign(payload, JWT_CONFIG.SECRET, options);
  }

  private generateRefreshToken(user: any, userType: 'user' | 'propertyOwner'): string {
    const payload = {
      userId: user._id.toString(),
      type: 'refresh'
    };
    const options: SignOptions = {
      expiresIn: REFRESH_TOKEN_EXPIRY as any,
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE
    };
    return jwt.sign(payload, JWT_CONFIG.REFRESH_SECRET, options);
  }

  // Utility method to decode token without verification (for debugging)
  public decodeToken(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }
} 