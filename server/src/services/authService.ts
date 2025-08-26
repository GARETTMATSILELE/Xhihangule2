import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { PropertyOwner, IPropertyOwner } from '../models/PropertyOwner';
import { UserRole, JwtPayload } from '../types/auth';
import { AppError } from '../middleware/errorHandler';
import { isDatabaseAvailable } from '../config/database';
import { JWT_CONFIG } from '../config/jwt';

// Token expiry times
const ACCESS_TOKEN_EXPIRY = JWT_CONFIG.ACCESS_TOKEN_EXPIRY;
const REFRESH_TOKEN_EXPIRY = JWT_CONFIG.REFRESH_TOKEN_EXPIRY;

export interface JwtUser extends JwtPayload {
  email: string;
}

export class AuthService {
  private static instance: AuthService;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    const isAvailable = await isDatabaseAvailable();
    if (!isAvailable) {
      // Return an operational error so the API surfaces 503 instead of 500
      throw new AppError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
    
    this.isInitialized = true;
  }

  public async getUserById(userId: string) {
    await this.initialize();
    
    // First try to find in PropertyOwner collection
    let propertyOwner = await PropertyOwner.findById(userId);
    if (propertyOwner) {
      return { user: propertyOwner, type: 'propertyOwner' as const };
    }
    
    // If not found, try User collection
    let user = await User.findById(userId);
    if (user) {
      return { user, type: 'user' as const };
    }
    
    return null;
  }

  public async login(email: string, password: string): Promise<{ user: JwtUser; token: string; refreshToken: string }> {
    await this.initialize();
    // Check only the User collection
    let user = await User.findOne({ email });
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
        companyId: user.companyId ? user.companyId.toString() : undefined
      },
      token,
      refreshToken
    };
  }

  public async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    await this.initialize();

    try {
      console.log('AuthService: Starting token refresh');
      
      const decoded = jwt.verify(refreshToken, JWT_CONFIG.REFRESH_SECRET) as { userId: string; type?: string };
      console.log('AuthService: Token decoded successfully, userId:', decoded.userId);
      
      const userResult = await this.getUserById(decoded.userId);
      if (!userResult) {
        console.log('AuthService: User not found for userId:', decoded.userId);
        throw new Error('User not found');
      }

      const { user, type } = userResult;
      console.log('AuthService: User found:', { userId: user._id, role: type === 'user' ? (user as IUser).role : 'owner' });

      // Check if user is still active (only for User model)
      if (type === 'user' && !(user as IUser).isActive) {
        console.log('AuthService: User is inactive');
        throw new Error('Account is inactive');
      }

      const newToken = this.generateAccessToken(user, type);
      const newRefreshToken = this.generateRefreshToken(user, type);

      console.log('AuthService: New tokens generated successfully');

      return {
        token: newToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      console.error('AuthService: Token refresh failed:', error);
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
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET) as { userId: string; type?: string };
      console.log('AuthService: Token decoded:', decoded);
      
      const userResult = await this.getUserById(decoded.userId);
      if (!userResult) {
        throw new Error('User not found');
      }

      const { user, type } = userResult;

      console.log('AuthService: User found in database:', {
        userId: user._id,
        role: type === 'user' ? (user as IUser).role : 'owner',
        companyId: (user as any).companyId ? (user as any).companyId.toString() : undefined
      });

      // Check if user is still active (only for User model)
      if (type === 'user' && !(user as IUser).isActive) {
        throw new Error('Account is inactive');
      }

      const result = {
        userId: user._id.toString(),
        email: user.email,
        role: type === 'user' ? (user as IUser).role as UserRole : 'owner',
        companyId: (user as any).companyId ? (user as any).companyId.toString() : undefined
      };

      console.log('AuthService: Returning user data:', result);

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