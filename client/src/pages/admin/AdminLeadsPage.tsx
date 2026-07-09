import React from 'react';
import { Box, Typography } from '@mui/material';
import AgentLeadsPage from '../agent/AgentLeadsPage';

const AdminLeadsPage: React.FC = () => (
  <Box>
    <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>Lead Management</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      Company-wide lead pipeline, assignment rules, and conversion tracking.
    </Typography>
    <AgentLeadsPage />
  </Box>
);

export default AdminLeadsPage;
