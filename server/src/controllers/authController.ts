import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { AppError } from '../middleware/errorHandler';
import { SignUpData, UserRole } from '../types/auth';
import { AuthService } from '../services/authService';

const authService = AuthService.getInstance();

// Signup with company details
export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, company } = req.body;
    console.log('Signup attempt with data:', { email, name, hasCompany: !!company });

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('Signup failed - Email already registered:', email);
      throw new AppError('Email already registered', 400);
    }

    // Create user
    console.log('Creating new user...');
    const user = await User.create({
      email,
      password,
      firstName: name.split(' ')[0],
      lastName: name.split(' ').slice(1).join(' '),
      role: 'admin',
      isActive: true
    });
    console.log('User created successfully:', { id: user._id, email: user.email });

    // Create company if provided
    let companyId;
    let companyData = null;
    if (company) {
      console.log('Creating new company...');
      const newCompany = await Company.create({
        ...company,
        ownerId: user._id
      });
      companyId = newCompany._id;
      companyData = newCompany;
      console.log('Company created successfully:', { id: newCompany._id, name: newCompany.name });

      // Update user with company ID
      console.log('Updating user with company ID...');
      user.companyId = companyId;
      await user.save();
      console.log('User updated with company ID');
    }

    // Generate tokens using auth service
    const { token, refreshToken } = await authService.login(email, password);

    // Verify the user was saved
    const savedUser = await User.findById(user._id);
    console.log('Verified saved user:', {
      id: savedUser?._id,
      email: savedUser?.email,
      companyId: savedUser?.companyId
    });

    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      user: {
        _id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        companyId
      },
      company: companyData,
      token,
      refreshToken
    });
  } catch (error) {
    console.error('Signup error:', error);
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
    const fullUser = await User.findById(userData.userId);
    if (!fullUser) {
      throw new AppError('User not found after login', 404);
    }

    // Get company details if user has a company
    let company = null;
    if (userData.companyId) {
      company = await Company.findById(userData.companyId);
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
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log('Refresh token cookie set successfully');

    res.json({
      user: {
        _id: fullUser._id,
        email: fullUser.email,
        firstName: fullUser.firstName,
        lastName: fullUser.lastName,
        role: fullUser.role,
        companyId: fullUser.companyId?.toString(),
        isActive: fullUser.isActive,
        lastLogin: fullUser.lastLogin,
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt
      },
      company,
      token,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

// Logout
export const logout = (req: Request, res: Response) => {
  // Clear refresh token cookie
  res.clearCookie('refreshToken');
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
        companyId: user.companyId,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
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

    console.log('Refresh token found, attempting to refresh...');
    
    // Use auth service to refresh token
    const { token: newAccessToken, refreshToken: newRefreshToken } = await authService.refreshToken(refreshToken);

    console.log('Token refresh successful');

    // Set new refresh token as HttpOnly cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    next(error);
  }
}; 