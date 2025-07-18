import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
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

  // Show error if not authenticated
  if (!isAuthenticated || !user) {
    console.log('ProtectedRoute: Not authenticated, showing error');
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="100vh">
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Authentication required. Please log in.'}
        </Alert>
        {/* Optionally, you can add a login button here */}
        {/* <Button variant="contained" href="/login">Go to Login</Button> */}
      </Box>
    );
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

  console.log('ProtectedRoute: Access granted');
  return <>{children}</>;
};

export default ProtectedRoute; 