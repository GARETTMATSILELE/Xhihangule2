import React from 'react';
import { Box, Button, Paper, Typography, Stack } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { getDashboardPath } from '../utils/registrationUtils';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin Dashboard',
  agent: 'Agent Dashboard',
  owner: 'Owner Dashboard',
  accountant: 'Accountant Dashboard',
  sales: 'Sales Dashboard'
};

const ChooseDashboard: React.FC = () => {
  const { user, setActiveRole } = useAuth();
  const roles: string[] = React.useMemo(() => {
    if (!user) return [];
    const list = Array.isArray((user as any).roles) && (user as any).roles.length > 0 ? (user as any).roles : [user.role];
    return list;
  }, [user]);

  if (!user) {
    return null;
  }

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '70vh', p: 2 }}>
      <Paper sx={{ p: 3, maxWidth: 520, width: '100%' }} elevation={1}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Choose a dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your account has access to multiple roles. Pick where you want to go.
        </Typography>
        <Stack spacing={1.5}>
          {roles.map((r) => (
            <Button
              key={r}
              variant="contained"
              size="large"
              onClick={() => {
                setActiveRole(r as any);
                const path = getDashboardPath(r as any);
                window.location.assign(path);
              }}
            >
              {ROLE_LABELS[r] || r}
            </Button>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

export default ChooseDashboard;
