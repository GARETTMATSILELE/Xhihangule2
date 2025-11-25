import express from 'express';
import { AuthService } from '../services/authService';
import { auth } from '../middleware/auth';
import { IUser } from '../models/User';

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const router = express.Router();
const authService = AuthService.getInstance();

// Get current user route
router.get('/me', auth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }
    
    const userResult = await authService.getUserById(req.user.userId);
    if (!userResult) {
      return res.status(404).json({ 
        status: 'error',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const { user, type } = userResult;

    // Build avatar URL if present (only for app users, not property owners)
    const avatarUrl = (type === 'user' && (user as any)?.avatar)
      ? `data:${(user as any).avatarMimeType || 'image/png'};base64,${(user as any).avatar}`
      : undefined;

    // Return the structure the client expects (include avatarUrl when present)
    res.json({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: type === 'user' ? (user as IUser).role : 'owner',
        companyId: user.companyId,
        isActive: type === 'user' ? (user as IUser).isActive : true,
        lastLogin: type === 'user' ? (user as IUser).lastLogin : undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        ...(avatarUrl ? { avatarUrl } : {})
      }
    });
  } catch (error) {
    console.error('Error in /me endpoint:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Error fetching user data',
      code: 'SERVER_ERROR'
    });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AuthError('Email and password are required');
    }
    
    const result = await authService.login(email, password);
    
    // Fetch the full user data from database to get proper structure
    const userResult = await authService.getUserById(result.user.userId);
    if (!userResult) {
      throw new AuthError('User not found after login');
    }
    
    const { user: fullUser, type } = userResult;
    
    // Fetch company data if user has a companyId
    let company = null;
    if (fullUser.companyId) {
      try {
        const Company = require('../models/Company').default;
        company = await Company.findById(fullUser.companyId);
      } catch (error) {
        console.error('Error fetching company:', error);
        // Continue without company data
      }
    }
    
    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' ? { domain: '.xhihangule.com' } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Build avatar URL if present
    const avatarUrl = (fullUser as any)?.avatar
      ? `data:${(fullUser as any).avatarMimeType || 'image/png'};base64,${(fullUser as any).avatar}`
      : undefined;

    // Return the structure the client expects: { user, company, token, refreshToken } (include avatarUrl)
    res.json({
      user: {
        _id: fullUser._id,
        email: fullUser.email,
        firstName: fullUser.firstName,
        lastName: fullUser.lastName,
        role: type === 'user' ? (fullUser as IUser).role : 'owner',
        companyId: fullUser.companyId?.toString(),
        isActive: type === 'user' ? (fullUser as IUser).isActive : true,
        lastLogin: type === 'user' ? (fullUser as IUser).lastLogin : undefined,
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt,
        ...(avatarUrl ? { avatarUrl } : {})
      },
      company: company,
      token: result.token,
      refreshToken: result.refreshToken
    });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(401).json({ 
        status: 'error',
        message: error.message,
        code: 'AUTH_ERROR'
      });
    } else {
      res.status(500).json({ 
        status: 'error',
        message: 'Internal server error',
        code: 'SERVER_ERROR'
      });
    }
  }
});

// Logout route
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', {
    path: '/',
    ...(process.env.NODE_ENV === 'production' ? { domain: '.xhihangule.com' } : {})
  });
  res.json({ 
    status: 'success',
    message: 'Logged out successfully' 
  });
});

// Refresh token route
router.post('/refresh-token', async (req, res) => {
  try {
    console.log('Refresh token request received');
    
    // Get refresh token from request body or cookies
    const { refreshToken } = req.body;
    const cookieRefreshToken = req.cookies?.refreshToken;
    
    const tokenToUse = refreshToken || cookieRefreshToken;
    
    console.log('Refresh token check:', {
      hasBodyToken: !!refreshToken,
      hasCookieToken: !!cookieRefreshToken,
      hasTokenToUse: !!tokenToUse
    });
    
    if (!tokenToUse) {
      throw new AuthError('Refresh token is required');
    }
    
    console.log('Calling auth service refresh token');
    const result = await authService.refreshToken(tokenToUse);
    
    console.log('Refresh token successful:', {
      hasNewToken: !!result.token,
      hasNewRefreshToken: !!result.refreshToken
    });
    
    // Set new refresh token as HttpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' ? { domain: '.xhihangule.com' } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.json({
      status: 'success',
      token: result.token,
      refreshToken: result.refreshToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    if (error instanceof AuthError) {
      res.status(401).json({ 
        status: 'error',
        message: error.message,
        code: 'REFRESH_ERROR'
      });
    } else {
      res.status(500).json({ 
        status: 'error',
        message: 'Internal server error',
        code: 'SERVER_ERROR'
      });
    }
  }
});

// Verify token route
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      throw new AuthError('Token is required');
    }
    
    const user = await authService.verifyToken(token);
    res.json({ 
      status: 'success',
      user 
    });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(401).json({ 
        status: 'error',
        message: error.message,
        code: 'VERIFY_ERROR'
      });
    } else {
      res.status(500).json({ 
        status: 'error',
        message: 'Internal server error',
        code: 'SERVER_ERROR'
      });
    }
  }
});

export default router; 