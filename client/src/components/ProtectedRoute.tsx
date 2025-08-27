import { ReactNode } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';

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
    if (!requiredRoles.includes(user.role)) {
      console.log('ProtectedRoute: User role not authorized', { userRole: user.role, requiredRoles });
      // Redirect to appropriate dashboard if user doesn't have required role
      const dashboardPath = `/${user.role}-dashboard`;
      return <Typography color="error">You do not have access to this page.</Typography>;
    }
  }

  // If admin is authenticated but has no companyId, route to company setup (except if already there)
  if (user.role === 'admin' && isAuthenticated && !user.companyId && !location.pathname.startsWith('/admin/company-setup')) {
    return <Navigate to="/admin/company-setup" replace />;
  }

  console.log('ProtectedRoute: Access granted');
  return <>{children}</>;
};

export default ProtectedRoute; 