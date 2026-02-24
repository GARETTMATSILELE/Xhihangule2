import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';
import { User } from '../types/auth';
import { AxiosError } from 'axios';
import { getDashboardPath } from '../utils/registrationUtils';

function getSafeNextPathFromUrlSearch(search: string): string | null {
  try {
    const next = new URLSearchParams(search || '').get('next');
    if (!next) return null;
    const decoded = String(next);
    // Prevent open redirects: only allow internal absolute paths.
    if (!decoded.startsWith('/')) return null;
    if (decoded.startsWith('//')) return null;
    if (decoded.includes('://')) return null;
    return decoded;
  } catch {
    return null;
  }
}

function pickRoleForPath(nextPath: string, roles: string[]): string | null {
  const has = (r: string) => roles.includes(r);
  if (nextPath.startsWith('/accountant-dashboard')) {
    if (has('accountant')) return 'accountant';
    if (has('principal')) return 'principal';
    if (has('prea')) return 'prea';
    return null;
  }
  if (nextPath.startsWith('/admin-dashboard')) {
    if (has('admin')) return 'admin';
    if (has('principal')) return 'principal';
    if (has('prea')) return 'prea';
    return null;
  }
  if (nextPath.startsWith('/sales-dashboard')) return has('sales') ? 'sales' : null;
  if (nextPath.startsWith('/agent-dashboard')) return has('agent') ? 'agent' : null;
  if (nextPath.startsWith('/owner-dashboard')) return has('owner') ? 'owner' : null;
  if (nextPath.startsWith('/system-admin')) return has('system_admin') ? 'system_admin' : null;
  return null;
}

interface Company {
  _id: string;
  name: string;
  ownerId: string;
  logo?: string;
}

interface CreateCompany {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationNumber?: string;
  tinNumber?: string;
}

interface AuthContextType {
  user: User | null;
  company: Company | null;
  isAuthenticated: boolean;
  isImpersonating?: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  signup: (
    email: string,
    password: string,
    name: string,
    company?: CreateCompany,
    plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE',
    options?: { skipNavigate?: boolean }
  ) => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
  impersonate: (userId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  activeRole?: User['role'];
  setActiveRole: (role: User['role']) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// In-memory token storage (more secure than localStorage)
let accessToken: string | null = null;
let refreshToken: string | null = null;

// Token management functions
const setTokens = (newAccessToken: string | null, newRefreshToken: string | null) => {
  accessToken = newAccessToken;
  refreshToken = newRefreshToken;
  
  if (newAccessToken) {
    api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

const getAccessToken = () => accessToken;
const getRefreshToken = () => refreshToken;

const isTransientNetworkError = (err: unknown) =>
  err instanceof AxiosError && (!err.response || err.code === 'ECONNABORTED');

// Utility function to clear all tokens and notify app to route to login
const clearAllTokens = () => {
  setTokens(null, null);
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('token');
  try { localStorage.setItem('auth:event', `logout:${Date.now()}`); } catch {}
  
  // Clear any cookies that might exist
  document.cookie.split(";").forEach(function(c) { 
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
  });
  
  // Dispatch a central auth error instead of forcing a full reload
  window.dispatchEvent(new CustomEvent('authError', { 
    detail: 'Session expired. Please log in again.'
  }));
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [activeRole, setActiveRoleState] = useState<User['role'] | undefined>(undefined);

  const clearError = () => setError(null);

  // Initialize authentication on mount
  useEffect(() => {
    // Only initialize once
    if (hasInitialized) {
      return;
    }

    const initializeAuth = async () => {
      try {
        // If we're on the login page, do not attempt automatic sign-in or token refresh
        if (window.location.pathname === '/login') {
          setLoading(false);
          setHasInitialized(true);
          return;
        }

        // Check if we have tokens in localStorage (for persistence across page reloads)
        const storedAccessToken = localStorage.getItem('accessToken');
        const storedRefreshToken = null; // refresh handled via HttpOnly cookie; do not rely on storage
        const storedUser = localStorage.getItem('user');
        const storedImpersonating = localStorage.getItem('impersonating') === 'true';
        
        if (storedAccessToken) {
          setTokens(storedAccessToken, null);
          setIsImpersonating(storedImpersonating);
          if (storedUser) {
            try {
              const parsedUser = JSON.parse(storedUser);
              setUser(parsedUser);
              setIsAuthenticated(true);
            } catch {}
          }
          
          try {
            // Validate the token by fetching user data (fail fast, don't block UI long)
            const response = await api.get('/auth/me');
            const userData = response.data.user;
            
            // Store user data in localStorage for other services to access
            localStorage.setItem('user', JSON.stringify(userData));
            
            setUser(userData);
            setIsAuthenticated(true);
            // Do not auto-restore active role for multi-role users; force explicit choice per session
            try {
              const roles: any[] = Array.isArray(userData.roles) && userData.roles.length > 0 ? userData.roles : [userData.role];
              if (roles.length === 1) setActiveRoleState(roles[0]);
            } catch {}
            if (storedImpersonating) {
              // When impersonating, do not auto-redirect away; keep current path
              console.log('Resuming impersonation session');
            }
            
            // Fetch company data if available
            if (userData.companyId) {
              try {
                const companyResponse = await api.get('/companies/current');
                setCompany(companyResponse.data.data);
              } catch (error) {
                console.warn('Could not fetch company data:', error);
              }
            }
          } catch (authError) {
            console.warn('Token validation failed, trying to refresh token:', authError);
            
            // Try to refresh the token (short timeout as well)
            try {
              const refreshResponse = await api.post('/auth/refresh-token', {});
              
              const { token: newAccessToken } = refreshResponse.data;
              
              if (newAccessToken) {
                // Update tokens
                setTokens(newAccessToken, null);
                localStorage.setItem('accessToken', newAccessToken);
                
                // Try to get user data again
                const userResponse = await api.get('/auth/me');
                const userData = userResponse.data.user;
                
                // Store user data in localStorage for other services to access
                localStorage.setItem('user', JSON.stringify(userData));
                
                setUser(userData);
                setIsAuthenticated(true);
                
                // Fetch company data if available
                if (userData.companyId) {
                  try {
                    const companyResponse = await api.get('/companies/current');
                    setCompany(companyResponse.data.data);
                  } catch (error) {
                    console.warn('Could not fetch company data:', error);
                  }
                }
              } else {
                throw new Error('No new access token received');
              }
            } catch (refreshError) {
              if (isTransientNetworkError(refreshError)) {
                console.warn('Token refresh deferred due to temporary network/backend outage');
                setError('Temporary connection issue. Retrying automatically...');
                return;
              }
              console.warn('Token refresh failed, clearing all tokens and redirecting to login:', refreshError);
              
              // Clear all tokens and redirect to login
              setTokens(null, null);
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
              setUser(null);
              setCompany(null);
              setIsAuthenticated(false);
              
              // Don't redirect on payments page - allow it to work without authentication
              if (window.location.pathname.includes('/payments')) {
                console.log('Auth initialization failed on payments page - not redirecting');
                return;
              }
              
              // Redirect to login
              if (window.location.pathname !== '/login') {
                navigate('/login');
              }
            }
          }
        }
      } catch (error) {
        console.error('Authentication initialization failed:', error);
        // Clear tokens on any critical error
        setTokens(null, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        setUser(null);
        setCompany(null);
        setIsAuthenticated(false);
        
        // Don't redirect on payments page - allow it to work without authentication
        if (window.location.pathname.includes('/payments')) {
          console.log('Auth initialization failed on payments page - not redirecting');
          return;
        }
        
        // If we're not already on the login page, redirect there
        if (window.location.pathname !== '/login') {
          navigate('/login');
        }
      } finally {
        setLoading(false);
        setHasInitialized(true);
      }
    };

    initializeAuth();

    // Listen for auth errors from axios interceptor
    const handleAuthError = (event: CustomEvent) => {
      console.log('Auth error received:', event.detail);
      setError(event.detail);
      setUser(null);
      setCompany(null);
      setIsAuthenticated(false);
      setTokens(null, null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      setLoading(false);
      navigate('/login');
    };

    window.addEventListener('authError', handleAuthError as EventListener);

    return () => {
      window.removeEventListener('authError', handleAuthError as EventListener);
    };
  }, [navigate, hasInitialized]);

  // Cross-tab auth sync (login/logout) via storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== 'auth:event' || !e.newValue) return;
      const [type] = e.newValue.split(':');
      if (type === 'logout') {
        setUser(null);
        setCompany(null);
        setIsAuthenticated(false);
        setTokens(null, null);
        try {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
        } catch {}
        if (window.location.pathname !== '/login') {
          navigate('/login');
        }
      } else if (type === 'login') {
        // Pick up new session without a full reload
        api.get('/auth/me')
          .then((resp) => {
            const userData = resp.data.user;
            try { localStorage.setItem('user', JSON.stringify(userData)); } catch {}
            setUser(userData);
            setIsAuthenticated(true);
          })
          .catch(() => {
            // if it fails, direct to login
            if (window.location.pathname !== '/login') navigate('/login');
          });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [navigate]);

  const login = async (email: string, password: string): Promise<User> => {
    try {
      setError(null);
      setLoading(true);
      
      console.log('Starting login process for:', email);
      
      const response = await api.post('/auth/login', { email, password });
      const { user: userData, company: companyData, token } = response.data;
      
      console.log('Login response received:', { 
        hasUser: !!userData, 
        hasToken: !!token, 
        hasRefreshToken: false,
        userRole: userData?.role 
      });
      
      if (!token) {
        throw new Error('No access token received');
      }

      // Store token in memory and localStorage
      setTokens(token, null);
      localStorage.setItem('accessToken', token);
      
      // Store user data in localStorage for other services to access
      localStorage.setItem('user', JSON.stringify(userData));
      
      console.log('Tokens stored successfully');
      
      // Set user data
      setUser(userData);
      setCompany(companyData);
      setIsAuthenticated(true);
      try { localStorage.setItem('auth:event', `login:${Date.now()}`); } catch {}
      // Decide next route
      try {
        const roles: any[] = Array.isArray((userData as any).roles) && (userData as any).roles.length > 0 ? (userData as any).roles : [userData.role];
        const nextPath = getSafeNextPathFromUrlSearch(window.location.search);
        const roleForNext = nextPath ? pickRoleForPath(nextPath, roles.map(String)) : null;

        if (nextPath && roleForNext) {
          setActiveRoleState(roleForNext as any);
          setLoading(false);
          navigate(nextPath);
          return userData;
        }

        if (roles.length > 1) {
          // Multi-role users must choose a dashboard every login
          setActiveRoleState(undefined);
          setLoading(false);
          navigate('/choose-dashboard');
          return userData;
        }
        // Single role
        setActiveRoleState(roles[0]);
        if (nextPath) {
          setLoading(false);
          navigate(nextPath);
          return userData;
        } else {
          const dashboardPath = getDashboardPath(roles[0] as any);
          console.log('Navigating to dashboard:', dashboardPath);
          navigate(dashboardPath);
        }
      } catch {}
      
      console.log('User state updated:', { 
        isAuthenticated: true, 
        userRole: userData.role,
        userId: userData._id 
      });
      
      setLoading(false);

      // Navigation handled above

      return userData;
    } catch (error) {
      console.error('Login failed:', error);
      let message = 'Login failed';
      if (error instanceof AxiosError) {
        const isTimeout = error.code === 'ECONNABORTED';
        const noResponse = !error.response;
        if (isTimeout || noResponse) {
          try {
            // Friendly status while we auto-retry once
            setError('Warming up the service… retrying now');
            // Quick readiness ping (non-blocking for user)
            try {
              await api.get('/health/ready');
            } catch {}
            // Small backoff before one retry
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const retryResp = await api.post('/auth/login', { email, password });
            const { user: userData, company: companyData, token } = retryResp.data;
            if (!token) throw new Error('No access token received');
            setTokens(token, null);
            localStorage.setItem('accessToken', token);
            localStorage.setItem('user', JSON.stringify(userData));
            setUser(userData);
            setCompany(companyData);
            setIsAuthenticated(true);
            setLoading(false);
            // Honor deep-link redirects when present
            try {
              const roles: any[] = Array.isArray((userData as any).roles) && (userData as any).roles.length > 0 ? (userData as any).roles : [userData.role];
              const nextPath = getSafeNextPathFromUrlSearch(window.location.search);
              const roleForNext = nextPath ? pickRoleForPath(nextPath, roles.map(String)) : null;
              if (nextPath && roleForNext) {
                setActiveRoleState(roleForNext as any);
                navigate(nextPath);
                return userData as any;
              }
              if (nextPath) {
                navigate(nextPath);
                return userData as any;
              }
            } catch {}
            const dashboardPath = getDashboardPath(userData.role);
            navigate(dashboardPath);
            return userData as any; // early return on successful retry
          } catch (retryErr: any) {
            // Final user-friendly message after retry failure
            if (retryErr instanceof AxiosError && (retryErr.code === 'ECONNABORTED' || !retryErr.response)) {
              message = 'The service is waking up. Please wait a moment and try again.';
            } else {
              message = retryErr?.response?.data?.message || 'Login failed. Please try again.';
            }
          }
        } else {
          message = (error.response as any)?.data?.message || 'Login failed';
        }
      }
      setError(message);
      setLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint to invalidate tokens on server
      try {
        await api.post('/auth/logout');
      } catch (error: any) {
        // Treat 404 as already logged out
        if (error?.response?.status !== 404) {
          console.error('Logout request failed:', error);
        }
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      // Clear all auth data
      setUser(null);
      setCompany(null);
      setIsAuthenticated(false);
      setTokens(null, null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('impersonating');
      try { localStorage.removeItem('activeRole'); } catch {}
      setIsImpersonating(false);
      setLoading(false);
      try { localStorage.setItem('auth:event', `logout:${Date.now()}`); } catch {}
      navigate('/login');
    }
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    company?: CreateCompany,
    plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE',
    options?: { skipNavigate?: boolean }
  ) => {
    try {
      setError(null);
      setLoading(true);
      
      // Send company only if provided; signup no longer requires company
      const payload: any = { email, password, name };
      if (company && Object.keys(company).length > 0) {
        payload.company = company;
      }
      if (plan) {
        payload.plan = plan;
      }
      // If this is the admin signup flow, mark it so the server assigns admin role
      if (window.location.pathname.includes('/admin-signup')) {
        payload.adminSignup = true;
      }
      const response = await api.post('/auth/signup', payload);
      const { user: userData, company: companyData, token } = response.data;
      
      if (!token) {
        throw new Error('No access token received');
      }

      // Store token
      setTokens(token, null);
      localStorage.setItem('accessToken', token);
      
      // Store user data in localStorage for other services to access
      localStorage.setItem('user', JSON.stringify(userData));
      
      setUser(userData);
      setCompany(companyData);
      setIsAuthenticated(true);

      // After signup, route admins without a company to setup; otherwise go to role dashboard
      if (!options?.skipNavigate) {
        const isAdmin = userData.role === 'admin';
        if (isAdmin && !userData.companyId) {
          navigate('/admin/company-setup');
        } else {
          const path = getDashboardPath(userData.role);
          navigate(path);
        }
      }
    } catch (err: any) {
      const message = err.response?.data?.message || 'Signup failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/me');
      const userData = response.data.user;
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  };

  const impersonate = async (userId: string) => {
    try {
      setLoading(true);
      const response = await api.post('/auth/impersonate', { userId });
      const { token: newAccessToken, refreshToken: newRefreshToken, user: impersonatedUser } = response.data;
      if (!newAccessToken) {
        throw new Error('No access token received for impersonation');
      }
      setTokens(newAccessToken, null);
      localStorage.setItem('accessToken', newAccessToken);
      localStorage.setItem('user', JSON.stringify(impersonatedUser));
      localStorage.setItem('impersonating', 'true');
      setUser(impersonatedUser);
      setIsAuthenticated(true);
      setIsImpersonating(true);
    } catch (err) {
      console.error('Impersonation failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const stopImpersonation = async () => {
    try {
      setLoading(true);
      const response = await api.post('/auth/impersonate/stop');
      const { token: newAccessToken, refreshToken: newRefreshToken, user: originalUser } = response.data || {};
      if (!newAccessToken) {
        // Fallback: try refresh-token to restore original
        try {
          const refreshResponse = await api.post('/auth/refresh-token');
          const { token } = refreshResponse.data;
          setTokens(token, null);
          localStorage.setItem('accessToken', token);
        } catch (e) {
          console.warn('Failed to refresh token after stop impersonation');
        }
      } else {
        setTokens(newAccessToken, null);
        localStorage.setItem('accessToken', newAccessToken);
      }
      // Reload /auth/me to get current user
      await refreshUser();
      localStorage.removeItem('impersonating');
      setIsImpersonating(false);
    } catch (err) {
      console.error('Stop impersonation failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user,
      company,
      isAuthenticated,
      isImpersonating,
      loading,
      error,
      login,
      logout,
      signup,
      clearError,
      refreshUser,
      impersonate,
      stopImpersonation,
      activeRole,
      setActiveRole: (role) => {
        setActiveRoleState(role);
        try { localStorage.setItem('activeRole', role as any); } catch {}
        const path = getDashboardPath(role as any);
        if (window.location.pathname !== path) {
          try { (window as any).history.pushState({}, '', path); } catch {}
        }
      }
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Export token management functions for axios interceptor
export { getAccessToken, getRefreshToken, setTokens };

// Export the clearAllTokens function for manual use
export { clearAllTokens }; 