import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Box, Chip, Typography } from '@mui/material';

const AuthStatus: React.FC = () => {
  const { user, company, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <Box p={2}>
        <Chip label="Loading..." color="warning" size="small" />
      </Box>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Box p={2}>
        <Chip label="Not Authenticated" color="error" size="small" />
      </Box>
    );
  }

  return (
    <Box p={2} display="flex" gap={1} alignItems="center">
      <Chip label={`${user.role}`} color="primary" size="small" />
      <Typography variant="body2" color="text.secondary">
        {user.email}
      </Typography>
      {company && (
        <Chip label={company.name} color="secondary" size="small" />
      )}
    </Box>
  );
};

export default AuthStatus; 