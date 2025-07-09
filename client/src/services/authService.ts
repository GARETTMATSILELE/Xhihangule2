import { useAuth } from '../contexts/AuthContext';

/**
 * Unified Authentication Service
 * 
 * This service provides centralized access to authentication data for all services.
 * It ensures that all services have access to the same authentication state and user details.
 * 
 * Usage:
 * const authService = useAuthService();
 * const { user, company, isAuthenticated, loading } = authService;
 */

export const useAuthService = () => {
  const authContext = useAuth();
  
  // Validate that we have the required authentication data
  const validateAuth = () => {
    if (!authContext) {
      throw new Error('Authentication context not available');
    }
    
    return authContext;
  };

  // Get current authentication state
  const getAuthState = () => {
    const auth = validateAuth();
    return {
      user: auth.user,
      company: auth.company,
      isAuthenticated: auth.isAuthenticated,
      loading: auth.loading,
      error: auth.error
    };
  };

  // Check if user is authenticated and has required role
  const hasRole = (requiredRoles: string[]) => {
    const auth = validateAuth();
    if (!auth.isAuthenticated || !auth.user) {
      return false;
    }
    return requiredRoles.includes(auth.user.role);
  };

  // Check if user is admin
  const isAdmin = () => {
    return hasRole(['admin']);
  };

  // Check if user is owner
  const isOwner = () => {
    return hasRole(['owner']);
  };

  // Check if user is agent
  const isAgent = () => {
    return hasRole(['agent']);
  };

  // Check if user is accountant
  const isAccountant = () => {
    return hasRole(['accountant']);
  };

  // Get user's company ID
  const getCompanyId = () => {
    const auth = validateAuth();
    if (!auth.isAuthenticated || !auth.user) {
      return null;
    }
    return auth.user.companyId || auth.company?._id || null;
  };

  // Validate that user has company access (for non-admin users)
  const validateCompanyAccess = () => {
    const auth = validateAuth();
    
    if (!auth.isAuthenticated || !auth.user) {
      throw new Error('Authentication required. Please log in to access this feature.');
    }
    
    // Admin users can access all companies
    if (auth.user.role === 'admin') {
      return true;
    }
    
    // Non-admin users must have a company
    if (!auth.user.companyId && !auth.company?._id) {
      throw new Error('Company access required. Please ensure your company information is loaded.');
    }
    
    return true;
  };

  // Get authentication headers for API requests
  const getAuthHeaders = () => {
    const auth = validateAuth();
    if (!auth.isAuthenticated) {
      throw new Error('Authentication required');
    }
    
    return {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      'Content-Type': 'application/json'
    };
  };

  // Check if authentication is ready (not loading and user data available)
  const isAuthReady = () => {
    const auth = validateAuth();
    return !auth.loading && auth.isAuthenticated && !!auth.user;
  };

  return {
    // Direct access to auth context
    ...authContext,
    
    // Helper methods
    getAuthState,
    hasRole,
    isAdmin,
    isOwner,
    isAgent,
    isAccountant,
    getCompanyId,
    validateCompanyAccess,
    getAuthHeaders,
    isAuthReady,
    
    // Utility methods for services
    validateAuth,
    
    // Authentication status checks
    isAuthenticated: authContext.isAuthenticated,
    loading: authContext.loading,
    user: authContext.user,
    company: authContext.company,
    error: authContext.error
  };
};

// Export a hook for components that need authentication data
export const useAuthentication = useAuthService;

// Export types for services
export interface AuthServiceData {
  user: any;
  company: any;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  hasRole: (roles: string[]) => boolean;
  isAdmin: () => boolean;
  isOwner: () => boolean;
  isAgent: () => boolean;
  isAccountant: () => boolean;
  getCompanyId: () => string | null;
  validateCompanyAccess: () => boolean;
  getAuthHeaders: () => Record<string, string>;
  isAuthReady: () => boolean;
} 