import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { AppError } from '../middleware/errorHandler';
import { SignUpData, UserRole } from '../types/auth';
import { AuthService } from '../services/authService';
import { sendMail, getEnvByBrand } from '../services/emailService';
import { SubscriptionService } from '../services/subscriptionService';

const authService = AuthService.getInstance();
const subscriptionService = SubscriptionService.getInstance();

// Compute cookie domain for production based on env. Prefer explicit COOKIE_DOMAIN.
// Falls back to deriving from CLIENT_URL or APP_BASE_URL. Returns value suitable for cookie 'domain'.
function getCookieDomain(): string | undefined {
  const explicit = (process.env.COOKIE_DOMAIN || '').trim();
  if (explicit) return explicit;
  const fromUrl = (process.env.CLIENT_URL || process.env.APP_BASE_URL || '').trim();
  if (!fromUrl) return undefined;
  try {
    const hostname = new URL(fromUrl).hostname;
    // Use leading dot for cross-subdomain
    return hostname.startsWith('www.') ? `.${hostname.slice(4)}` : `.${hostname}`;
  } catch {
    return undefined;
  }
}

// Signup with company details
export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, company, plan: inputPlan } = req.body;
    console.log('Signup attempt with data:', { email, name, hasCompany: !!company });

    if (!email || !password || !name) {
      throw new AppError('Email, password and name are required', 400, 'VALIDATION_ERROR');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('Signup failed - Email already registered:', email);
      throw new AppError('Email already registered', 400);
    }

    // Determine role: ALWAYS create admin accounts on signup
    const assignedRole: UserRole = 'admin';

    // Create user and (optionally) company atomically in a transaction
    const session = await mongoose.startSession();
    let createdUser: any = null;
    let companyData: any = null;
    let companyId: any = undefined;

    try {
      await session.withTransaction(async () => {
        // Create user
        console.log('Creating new user...');
        const [firstNameRaw, ...lastParts] = String(name).trim().split(/\s+/);
        const firstName = firstNameRaw || 'User';
        const lastName = lastParts.join(' ') || firstNameRaw || 'Admin';

        const newUser = new User({
          email,
          password,
          firstName,
          lastName,
          role: assignedRole,
          isActive: true
        });
        await newUser.save({ session });
        createdUser = newUser;
        console.log('User created successfully:', { id: createdUser._id, email: createdUser.email });

        // Create company if provided OR auto-create for INDIVIDUAL plan
        const isIndividualPlan = (inputPlan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(inputPlan)) ? inputPlan === 'INDIVIDUAL' : false;
        if (company || isIndividualPlan) {
          const requiredCompanyFields = ['name', 'address', 'phone', 'email', 'registrationNumber', 'tinNumber'] as const;
          const baseName = `${firstName} ${lastName}`.trim();
          const nowSuffix = `${Date.now()}`.slice(-6);
          const autoCompany: any = company || {
            name: baseName || 'Individual Owner',
            description: 'Auto-created individual plan company',
            email: email,
            address: 'N/A',
            phone: '0000000000',
            website: undefined,
            registrationNumber: `REG-${nowSuffix}`,
            tinNumber: `TIN-${nowSuffix}`,
            vatNumber: undefined
          };
          const missing = requiredCompanyFields.filter((f) => !autoCompany[f]);
          if (missing.length > 0) {
            throw new AppError(`Missing company fields: ${missing.join(', ')}`, 400, 'VALIDATION_ERROR');
          }
          console.log('Creating new company...');
          const { PLAN_CONFIG } = await import('../types/plan');
          const plan = (inputPlan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(inputPlan)) ? inputPlan : 'ENTERPRISE';
          const cfg = PLAN_CONFIG[plan as 'INDIVIDUAL' | 'SME' | 'ENTERPRISE'];
          const companyDoc = new Company({
            ...autoCompany,
            ownerId: createdUser._id,
            plan,
            propertyLimit: cfg.propertyLimit,
            featureFlags: cfg.featureFlags
          });
          const newCompany = await companyDoc.save({ session });
          companyId = newCompany._id;
          companyData = newCompany;
          console.log('Company created successfully:', { id: newCompany._id, name: newCompany.name });

          // Update user with company ID
          console.log('Updating user with company ID...');
          createdUser.companyId = companyId;
          await createdUser.save({ session });
          console.log('User updated with company ID');

          // Create trial subscription for the new company
          console.log('Creating trial subscription...');
          await subscriptionService.createTrialSubscription(
            companyId.toString(), 
            plan as any, 
            14 // 14-day trial
          );
          console.log('Trial subscription created successfully');
        }
      });
    } catch (txError: any) {
      const msg = String(txError?.message || '');
      const isTxnUnsupported = msg.includes('Transaction numbers are only allowed on a replica set member or mongos');

      if (isTxnUnsupported) {
        console.warn('MongoDB transactions unsupported. Falling back to non-transactional flow with compensation.');
        try {
          // Create user without session
          console.log('Creating new user (fallback)...');
          const [firstNameRaw, ...lastParts] = String(name).trim().split(/\s+/);
          const firstName = firstNameRaw || 'User';
          const lastName = lastParts.join(' ') || firstNameRaw || 'Admin';

          createdUser = await User.create({
            email,
            password,
            firstName,
            lastName,
            role: assignedRole,
            isActive: true
          });
          console.log('User created successfully (fallback):', { id: createdUser._id, email: createdUser.email });

          // Fallback path: create company if provided OR auto-create for INDIVIDUAL plan
          if (company || ((inputPlan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(inputPlan)) ? inputPlan === 'INDIVIDUAL' : false)) {
            try {
              console.log('Creating new company (fallback)...');
              const { PLAN_CONFIG } = await import('../types/plan');
              const plan = (inputPlan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(inputPlan)) ? inputPlan : 'ENTERPRISE';
              const cfg = PLAN_CONFIG[plan as 'INDIVIDUAL' | 'SME' | 'ENTERPRISE'];
              const [firstNameRaw, ...lastParts2] = String(name).trim().split(/\s+/);
              const firstName2 = firstNameRaw || 'User';
              const lastName2 = lastParts2.join(' ') || firstNameRaw || 'Admin';
              const baseName2 = `${firstName2} ${lastName2}`.trim();
              const nowSuffix2 = `${Date.now()}`.slice(-6);
              const autoCompany2: any = company || {
                name: baseName2 || 'Individual Owner',
                description: 'Auto-created individual plan company',
                email: email,
                address: 'N/A',
                phone: '0000000000',
                website: undefined,
                registrationNumber: `REG-${nowSuffix2}`,
                tinNumber: `TIN-${nowSuffix2}`,
                vatNumber: undefined
              };
              const newCompany = await Company.create({
                ...autoCompany2,
                ownerId: createdUser._id,
                plan,
                propertyLimit: cfg.propertyLimit,
                featureFlags: cfg.featureFlags
              });
              companyId = newCompany._id;
              companyData = newCompany;
              console.log('Company created successfully (fallback):', { id: newCompany._id, name: newCompany.name });

              // Update user with companyId
              createdUser.companyId = companyId;
              await createdUser.save();
              console.log('User updated with company ID (fallback)');

              // Create trial subscription for the new company (fallback)
              console.log('Creating trial subscription (fallback)...');
              await subscriptionService.createTrialSubscription(
                companyId.toString(), 
                plan as any, 
                14 // 14-day trial
              );
              console.log('Trial subscription created successfully (fallback)');
            } catch (fallbackCompanyError: any) {
              if (fallbackCompanyError?.code === 11000) {
                const dupMsg = String(fallbackCompanyError?.message || 'Duplicate key error');
                if (dupMsg.includes('tinNumber') || dupMsg.includes('taxNumber')) {
                  return next(new AppError('Company tax number already exists', 400, 'DUPLICATE_COMPANY_TIN'));
                }
                return next(new AppError('Duplicate key error', 400, 'DUPLICATE_KEY'));
              }
              // Do not rollback user creation if optional company creation fails
              console.warn('Optional company creation failed; proceeding with user only');
            }
          }
        } catch (fallbackUserError: any) {
          if (fallbackUserError?.code === 11000) {
            const dupMsg = String(fallbackUserError?.message || 'Duplicate key error');
            if (dupMsg.includes('email_1') || dupMsg.toLowerCase().includes('email')) {
              return next(new AppError('Email already registered', 400, 'DUPLICATE_EMAIL'));
            }
            return next(new AppError('Duplicate key error', 400, 'DUPLICATE_KEY'));
          }
          return next(fallbackUserError);
        }
      } else if (txError?.code === 11000) {
        if (msg.includes('email_1') || msg.toLowerCase().includes('email')) {
          return next(new AppError('Email already registered', 400, 'DUPLICATE_EMAIL'));
        }
        if (msg.includes('tinNumber') || msg.includes('taxNumber')) {
          return next(new AppError('Company tax number already exists', 400, 'DUPLICATE_COMPANY_TIN'));
        }
        return next(new AppError('Duplicate key error', 400, 'DUPLICATE_KEY'));
      } else {
        return next(txError);
      }
    } finally {
      session.endSession();
    }

    // Generate tokens using auth service (after successful transaction)
    const { token, refreshToken } = await authService.login(email, password);

    // Verify the user was saved
    const savedUser = await User.findById(createdUser._id);
    console.log('Verified saved user:', {
      id: savedUser?._id,
      email: savedUser?.email,
      companyId: savedUser?.companyId
    });

    // Set refresh token as HttpOnly cookie
    const cookieDomain = getCookieDomain();
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    // Set a non-HttpOnly CSRF token cookie for refresh protection
    const signupCsrf = crypto.randomBytes(32).toString('hex');
    res.cookie('refreshCsrf', signupCsrf, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      user: {
        _id: savedUser!._id,
        email: savedUser!.email,
        name: `${savedUser!.firstName} ${savedUser!.lastName}`,
        role: savedUser!.role,
        roles: (Array.isArray((savedUser as any).roles) && (savedUser as any).roles!.length > 0) ? (savedUser as any).roles : undefined,
        companyId: savedUser!.companyId
      },
      company: companyData,
      token
    });
  } catch (error: any) {
    console.error('Signup error:', {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      details: error?.details,
      stack: error?.stack
    });
    // Normalize Mongoose validation and duplicate errors
    if (error?.name === 'ValidationError') {
      return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', Object.values(error.errors || {}).map((e: any) => e.message)));
    }
    if (error?.code === 11000) {
      const message: string = String(error?.message || 'Duplicate key error');
      if (message.includes('email_1') || message.toLowerCase().includes('email')) {
        return next(new AppError('Email already registered', 400, 'DUPLICATE_EMAIL'));
      }
      if (message.includes('tinNumber') || message.includes('taxNumber')) {
        return next(new AppError('Company tax number already exists', 400, 'DUPLICATE_COMPANY_TIN'));
      }
      return next(new AppError('Duplicate key error', 400, 'DUPLICATE_KEY'));
    }
    next(error);
  }
};

// Role-based login
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    // Use auth service for login
    const { user: userData, token, refreshToken } = await authService.login(email, password);

    // Get full user data from database
    const fullUser = await User.findById(userData.userId).maxTimeMS(5000);
    if (!fullUser) {
      throw new AppError('User not found after login', 404);
    }

    // Get company details if user has a company
    let company = null;
    if (userData.companyId) {
      company = await Company.findById(userData.companyId).maxTimeMS(5000);
      console.log('Found company:', {
        id: company?._id,
        name: company?.name,
        ownerId: company?.ownerId
      });
    } else {
      console.log('No company found for user');
    }

    console.log('Login successful:', {
      userId: userData.userId,
      role: userData.role,
      companyId: userData.companyId,
      hasCompany: !!company
    });

    // Set refresh token as HttpOnly cookie
    console.log('Setting refresh token cookie:', {
      hasRefreshToken: !!refreshToken,
      refreshTokenLength: refreshToken?.length,
      environment: process.env.NODE_ENV
    });
    
    const cookieDomain = getCookieDomain();
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Also set a non-HttpOnly CSRF token cookie for refresh endpoint
    const loginCsrf = crypto.randomBytes(32).toString('hex');
    res.cookie('refreshCsrf', loginCsrf, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    console.log('Refresh token cookie set successfully');

    res.json({
      user: {
        _id: fullUser._id,
        email: fullUser.email,
        firstName: fullUser.firstName,
        lastName: fullUser.lastName,
        role: fullUser.role,
        roles: (Array.isArray((fullUser as any).roles) && (fullUser as any).roles!.length > 0) ? (fullUser as any).roles : undefined,
        companyId: fullUser.companyId?.toString(),
        isActive: fullUser.isActive,
        lastLogin: fullUser.lastLogin,
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt
      },
      company: company ? {
        _id: company._id,
        name: company.name,
        address: company.address,
        phone: company.phone,
        email: company.email,
        website: company.website,
        registrationNumber: company.registrationNumber,
        tinNumber: company.tinNumber,
        vatNumber: company.vatNumber,
        ownerId: company.ownerId,
        description: company.description,
        logo: company.logo,
        isActive: company.isActive,
        subscriptionStatus: company.subscriptionStatus,
        subscriptionEndDate: company.subscriptionEndDate,
        bankAccounts: company.bankAccounts,
        commissionConfig: company.commissionConfig,
        plan: (company as any).plan,
        propertyLimit: (company as any).propertyLimit,
        featureFlags: (company as any).featureFlags,
        createdAt: (company as any).createdAt,
        updatedAt: (company as any).updatedAt
      } : null,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    // Normalize known auth errors to 401 with message
    const message = (error as any)?.message || 'Authentication failed';
    if (message === 'Invalid credentials' || message === 'Account is inactive') {
      return res.status(message === 'Invalid credentials' ? 401 : 403).json({
        status: 'error',
        message,
        code: message === 'Invalid credentials' ? 'AUTH_ERROR' : 'ACCOUNT_INACTIVE'
      });
    }
    next(error);
  }
};

// Request password reset: create token, store hash+expiry, email link
export const requestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      throw new AppError('Email is required', 400, 'VALIDATION_ERROR');
    }

  const user = await User.findOne({ email: String(email).toLowerCase() });
  // Return 404 when email is not found (explicit behavior as requested)
  if (!user) {
    return res.status(404).json({ message: 'Email not found' });
  }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordToken = tokenHash as any;
    user.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes
    await user.save();

    // Always use the MANTIS base URL for password reset links
    const baseUrl =
      getEnvByBrand('APP_BASE_URL', 'MANTIS') ||
      process.env.APP_BASE_URL_MANTIS ||
      process.env.APP_BASE_URL ||
      'https://www.mantisafrica.com';
    const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    await sendMail({
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <p>You requested a password reset.</p>
        <p>Click the link below to reset your password. This link expires in 15 minutes.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
      text: `Reset your password: ${resetUrl}`
    });

  return res.json({ message: 'A password reset link has been sent to your email' });
  } catch (error) {
    next(error);
  }
};

// Reset password using token
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, email, password } = req.body as { token?: string; email?: string; password?: string };
    if (!token || !email || !password) {
      throw new AppError('Token, email and new password are required', 400, 'VALIDATION_ERROR');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      email: String(email).toLowerCase(),
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() }
    });
    if (!user) {
      throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
    }

    user.password = password;
    (user as any).passwordChangedAt = new Date();
    user.resetPasswordToken = undefined as any;
    user.resetPasswordExpires = undefined as any;
    await user.save();

    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    next(error);
  }
};

// Logout
export const logout = (req: Request, res: Response) => {
  // Clear refresh token + CSRF cookies with correct options
  const prod = process.env.NODE_ENV === 'production';
  const d = getCookieDomain();
  const base: any = {
    path: '/',
    sameSite: prod ? 'strict' : 'lax',
    secure: prod,
    ...(prod && d ? { domain: d } : {})
  };
  try { res.clearCookie('refreshToken', { ...base, httpOnly: true }); } catch {}
  try { res.clearCookie('refreshCsrf', { ...base, httpOnly: false }); } catch {}
  res.json({ message: 'Logged out successfully' });
};

// Get current user
export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Get company details if user has a company
    let company = null;
    if (user.companyId) {
      company = await Company.findById(user.companyId);
      console.log('Current user company:', {
        id: company?._id,
        name: company?.name,
        ownerId: company?.ownerId
      });
    }

    console.log('Current user:', {
      id: user._id,
      role: user.role,
      companyId: user.companyId,
      hasCompany: !!company
    });

    res.json({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roles: (Array.isArray((user as any).roles) && (user as any).roles!.length > 0) ? (user as any).roles : undefined,
        companyId: user.companyId,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        // Provide avatar as a data URL if present
        ...(user as any).avatar ? {
          avatarUrl: `data:${(user as any).avatarMimeType || 'image/png'};base64,${(user as any).avatar}`
        } : {}
      },
      company
    });
  } catch (error) {
    next(error);
  }
};

// Refresh token
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Refresh token request received');
    
    // Get refresh token from cookie
    const refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken) {
      console.log('No refresh token found in cookies');
      throw new AppError('No refresh token available', 401);
    }

    // Double-submit cookie CSRF protection
    const csrfHeader = (req.headers['x-refresh-csrf'] as string) || req.get('x-refresh-csrf');
    const csrfCookie = req.cookies?.refreshCsrf as string | undefined;
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new AppError('CSRF token missing or invalid', 403, 'CSRF_MISMATCH');
    }

    console.log('Refresh token found, attempting to refresh...');
    
    // Use auth service to refresh token
    const { token: newAccessToken, refreshToken: newRefreshToken } = await authService.refreshToken(refreshToken);

    console.log('Token refresh successful');

    // Set new refresh token as HttpOnly cookie
    const cookieDomain = getCookieDomain();
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Rotate CSRF cookie
    const rotatedCsrf = crypto.randomBytes(32).toString('hex');
    res.cookie('refreshCsrf', rotatedCsrf, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' && cookieDomain ? { domain: cookieDomain } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      token: newAccessToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    next(error);
  }
}; 