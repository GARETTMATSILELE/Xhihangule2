# Authentication System Refactor

## Overview

This document outlines the complete refactor of the authentication system to resolve token validation issues and implement best practices for JWT-based authentication.

## Problems Solved

### 1. **Inconsistent Token Generation**
- **Before**: Multiple token generation methods with different expiry times
- **After**: Unified token service with consistent 15-minute access tokens and 7-day refresh tokens

### 2. **Token Storage Security**
- **Before**: Tokens stored in localStorage (vulnerable to XSS)
- **After**: Access tokens in memory, refresh tokens in HttpOnly cookies

### 3. **Complex State Management**
- **Before**: Over-engineered AuthContext with multiple refresh attempts
- **After**: Simple, linear authentication flow with clear error handling

### 4. **Clock Drift Issues**
- **Before**: No handling of server-client time synchronization
- **After**: Proper token expiry validation with clear error messages

## Architecture Changes

### Frontend (React)

#### **AuthContext.tsx**
```typescript
// Simplified authentication context
interface AuthContextType {
  user: User | null;
  company: Company | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, name: string, company?: CreateCompany) => Promise<void>;
  clearError: () => void;
}
```

**Key Features:**
- In-memory token storage for security
- Automatic token validation on mount
- Simple login/logout flow
- Clear error handling

#### **Axios Configuration**
```typescript
// Clean token handling with refresh logic
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

// Request interceptor adds Authorization header
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor handles 401 errors with refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Attempt token refresh
      // Retry original request
      // Clear tokens on failure
    }
    return Promise.reject(error);
  }
);
```

### Backend (Node.js/Express)

#### **AuthService.ts**
```typescript
export class AuthService {
  // Unified token generation
  private generateAccessToken(user: any): string {
    return jwt.sign({
      userId: user._id.toString(),
      role: user.role,
      companyId: user.companyId?.toString(),
      type: 'access'
    }, JWT_SECRET, { 
      expiresIn: '15m',
      issuer: 'property-management-app',
      audience: 'property-management-users'
    });
  }

  private generateRefreshToken(user: any): string {
    return jwt.sign({
      userId: user._id.toString(),
      type: 'refresh'
    }, JWT_REFRESH_SECRET, { 
      expiresIn: '7d',
      issuer: 'property-management-app',
      audience: 'property-management-users'
    });
  }
}
```

#### **Auth Middleware**
```typescript
// Simplified middleware using auth service
export const auth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
    if (!token) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userData = await authService.verifyToken(token);
    req.user = {
      userId: userData.userId,
      role: userData.role,
      companyId: userData.companyId
    };
    next();
  } catch (error) {
    // Handle specific JWT errors
  }
};
```

## Token Flow

### 1. **Login Flow**
```
User Login → AuthService.login() → Generate Access + Refresh Tokens → 
Set Refresh Token Cookie → Return Access Token → Store in Memory
```

### 2. **API Request Flow**
```
Request → Add Authorization Header → Server Validates → 
If 401 → Attempt Refresh → Retry Request → If Refresh Fails → Logout
```

### 3. **Token Refresh Flow**
```
401 Error → Check Refresh Token → Call /auth/refresh-token → 
Generate New Tokens → Update Memory/Cookies → Retry Original Request
```

## Environment Variables

Create a `.env` file in the server directory:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production

# Database
MONGODB_URI=mongodb://localhost:27017/property-management
AUTH_DB_URI=mongodb://localhost:27017/auth-db

# Server
PORT=5000
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:3000
```

## Security Features

### 1. **Token Security**
- Access tokens: 15-minute expiry (short-lived for security)
- Refresh tokens: 7-day expiry (convenient for users)
- Access tokens stored in memory (not localStorage)
- Refresh tokens in HttpOnly cookies (XSS protection)

### 2. **Error Handling**
- Specific error codes for different failure scenarios
- Clear error messages for debugging
- Graceful degradation on token failures

### 3. **User Validation**
- Check user exists and is active
- Validate user permissions
- Handle account deactivation

## Usage Examples

### Frontend Usage

```typescript
import { useAuth } from '../contexts/AuthContext';

const LoginComponent = () => {
  const { login, loading, error } = useAuth();

  const handleLogin = async (email: string, password: string) => {
    try {
      await login(email, password);
      // User will be automatically redirected to dashboard
    } catch (error) {
      // Handle login error
    }
  };
};
```

### Backend Route Protection

```typescript
import { auth, authorize } from '../middleware/auth';

// Basic authentication
router.get('/protected', auth, (req, res) => {
  // req.user is available
});

// Role-based authorization
router.get('/admin', auth, authorize(['admin', 'owner']), (req, res) => {
  // Only admins and owners can access
});
```

## Migration Guide

### 1. **Update Environment Variables**
- Add JWT_SECRET and JWT_REFRESH_SECRET
- Ensure proper CORS configuration

### 2. **Frontend Changes**
- Replace old AuthContext with new implementation
- Update axios configuration
- Remove localStorage token handling

### 3. **Backend Changes**
- Update auth middleware imports
- Ensure all routes use new auth service
- Update error handling

### 4. **Testing**
- Test login/logout flow
- Test token refresh
- Test protected routes
- Test error scenarios

## Benefits

1. **Security**: Reduced attack surface with proper token storage
2. **Reliability**: Consistent token handling across the application
3. **Maintainability**: Simplified codebase with clear separation of concerns
4. **User Experience**: Seamless authentication with automatic token refresh
5. **Debugging**: Clear error messages and logging for troubleshooting

## Troubleshooting

### Common Issues

1. **"Token expired" errors**
   - Check server clock synchronization
   - Verify JWT_SECRET is consistent
   - Check token expiry configuration

2. **"Invalid token" errors**
   - Verify Authorization header format: `Bearer <token>`
   - Check JWT_SECRET matches between token generation and verification
   - Ensure token is not malformed

3. **Refresh token failures**
   - Check JWT_REFRESH_SECRET configuration
   - Verify HttpOnly cookie settings
   - Check CORS configuration for cookie handling

### Debug Tools

- Use browser dev tools to inspect cookies
- Check network tab for API requests
- Review server logs for authentication errors
- Use the TokenDebugger component for frontend debugging 