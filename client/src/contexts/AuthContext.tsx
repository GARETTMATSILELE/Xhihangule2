import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';
import { User } from '../types/auth';
import { AxiosError } from 'axios';
import { getDashboardPath } from '../utils/registrationUtils';

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
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, name: string, company?: CreateCompany) => Promise<void>;
  clearError: () => void;
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

// Utility function to clear all tokens and force re-login
const clearAllTokens = () => {
  setTokens(null, null);
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('token'); // Remove old token if it exists
  localStorage.removeItem('refreshToken'); // Remove old refresh token if it exists
  
  // Clear any cookies that might exist
  document.cookie.split(";").forEach(function(c) { 
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
  });
  
  // Force redirect to login
  window.location.href = '/login';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const clearError = () => setError(null);

  // Initialize authentication on mount
  useEffect(() => {
    // Only initialize once
    if (hasInitialized) {
      return;
    }

    const initializeAuth = async () => {
      try {
        // Check if we have tokens in localStorage (for persistence across page reloads)
        const storedAccessToken = localStorage.getItem('accessToken');
        const storedRefreshToken = localStorage.getItem('refreshToken');
        
        if (storedAccessToken && storedRefreshToken) {
          setTokens(storedAccessToken, storedRefreshToken);
          
          try {
            // Validate the token by fetching user data
            const response = await api.get('/auth/me');
            const userData = response.data.user;
            
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
          } catch (authError) {
            console.warn('Token validation failed, trying to refresh token:', authError);
            
            // Try to refresh the token
            try {
              const refreshResponse = await api.post('/auth/refresh-token');
              
              const { token: newAccessToken, refreshToken: newRefreshToken } = refreshResponse.data;
              
              if (newAccessToken) {
                // Update tokens
                setTokens(newAccessToken, newRefreshToken);
                localStorage.setItem('accessToken', newAccessToken);
                if (newRefreshToken) {
                  localStorage.setItem('refreshToken', newRefreshToken);
                }
                
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

  const login = async (email: string, password: string): Promise<User> => {
    try {
      setError(null);
      setLoading(true);
      
      console.log('Starting login process for:', email);
      
      const response = await api.post('/auth/login', { email, password });
      const { user: userData, company: companyData, token, refreshToken: newRefreshToken } = response.data;
      
      console.log('Login response received:', { 
        hasUser: !!userData, 
        hasToken: !!token, 
        hasRefreshToken: !!newRefreshToken,
        userRole: userData?.role 
      });
      
      if (!token) {
        throw new Error('No access token received');
      }

      // Store tokens in memory and localStorage
      setTokens(token, newRefreshToken);
      localStorage.setItem('accessToken', token);
      if (newRefreshToken) {
        localStorage.setItem('refreshToken', newRefreshToken);
      }
      
      // Store user data in localStorage for other services to access
      localStorage.setItem('user', JSON.stringify(userData));
      
      console.log('Tokens stored successfully');
      
      // Set user data
      setUser(userData);
      setCompany(companyData);
      setIsAuthenticated(true);
      
      console.log('User state updated:', { 
        isAuthenticated: true, 
        userRole: userData.role,
        userId: userData._id 
      });
      
      setLoading(false);

      // Navigate to appropriate dashboard
      const dashboardPath = getDashboardPath(userData.role);
      console.log('Navigating to dashboard:', dashboardPath);
      navigate(dashboardPath);

      return userData;
    } catch (error) {
      console.error('Login failed:', error);
      const message = error instanceof AxiosError 
        ? error.response?.data?.message || 'Login failed'
        : 'Login failed';
      setError(message);
      setLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint to invalidate tokens on server
      await api.post('/auth/logout');
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
      setLoading(false);
      navigate('/login');
    }
  };

  const signup = async (email: string, password: string, name: string, company?: CreateCompany) => {
    try {
      setError(null);
      setLoading(true);
      
      // Send company only if provided; signup no longer requires company
      const payload: any = { email, password, name };
      if (company && Object.keys(company).length > 0) {
        payload.company = company;
      }
      // If this is the admin signup flow, mark it so the server assigns admin role
      if (window.location.pathname.includes('/admin-signup')) {
        payload.adminSignup = true;
      }
      const response = await api.post('/auth/signup', payload);
      const { user: userData, company: companyData, token, refreshToken: newRefreshToken } = response.data;
      
      if (!token) {
        throw new Error('No access token received');
      }

      // Store tokens
      setTokens(token, newRefreshToken);
      localStorage.setItem('accessToken', token);
      if (newRefreshToken) {
        localStorage.setItem('refreshToken', newRefreshToken);
      }
      
      // Store user data in localStorage for other services to access
      localStorage.setItem('user', JSON.stringify(userData));
      
      setUser(userData);
      setCompany(companyData);
      setIsAuthenticated(true);

      // After signup, route admins without a company to setup; otherwise go to role dashboard
      const isAdmin = userData.role === 'admin';
      if (isAdmin && !userData.companyId) {
        navigate('/admin/company-setup');
      } else {
        const path = getDashboardPath(userData.role);
        navigate(path);
      }
    } catch (err: any) {
      const message = err.response?.data?.message || 'Signup failed';
      setError(message);
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
      loading,
      error,
      login,
      logout,
      signup,
      clearError
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