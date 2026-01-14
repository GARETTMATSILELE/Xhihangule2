import { ReactNode } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';
import { getDashboardPath } from '../utils/registrationUtils';
import { Helmet } from 'react-helmet-async';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: string[];
}

const ProtectedRoute = ({ children, requiredRoles }: ProtectedRouteProps) => {
  const location = useLocation();
  const { user, loading, isAuthenticated, error } = useAuth();

  console.log('ProtectedRoute check:', {
    pathname: location.pathname,
    loading,
    isAuthenticated,
    hasUser: !!user,
    userRole: user?.role,
    userRoles: (user as any)?.roles,
    requiredRoles,
    error
  });

  // Show loading spinner while checking authentication
  if (loading) {
    console.log('ProtectedRoute: Showing loading spinner');
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        gap={2}
      >
        <CircularProgress size={40} />
        <Typography variant="body1" color="text.secondary">
          Checking authentication...
        </Typography>
      </Box>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    console.log('ProtectedRoute: Not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // Check role-based access if required roles are specified
  if (requiredRoles && requiredRoles.length > 0) {
    const roles: string[] = Array.isArray((user as any).roles) && (user as any).roles.length > 0 ? (user as any).roles : [user.role];
    if (!requiredRoles.some(r => roles.includes(r))) {
      console.log('ProtectedRoute: User role not authorized', { userRole: user.role, requiredRoles });
      // Redirect unauthorized users to role chooser if they have other roles
      const hasAnyRole = roles.length > 0;
      if (hasAnyRole) return <Navigate to="/choose-dashboard" replace />;
      const fallback = getDashboardPath(user.role as any);
      return <Navigate to={fallback} replace />;
    }
  }

  // If admin is authenticated but has no companyId, route to company setup (except if already there)
  const roles = Array.isArray((user as any).roles) && (user as any).roles.length > 0 ? (user as any).roles : [user.role];
  if (roles.includes('admin') && isAuthenticated && !user.companyId && !location.pathname.startsWith('/admin/company-setup')) {
    return <Navigate to="/admin/company-setup" replace />;
  }

  console.log('ProtectedRoute: Access granted');
  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      {children}
    </>
  );
};

export default ProtectedRoute; 