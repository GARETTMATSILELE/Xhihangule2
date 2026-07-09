import React from 'react';
import { Box, Typography } from '@mui/material';
import InspectionComplianceCenter from '../Inspections/InspectionComplianceCenter';

const AdminInspectionsPage: React.FC = () => (
  <Box>
    <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>Inspections Centre</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      Move-in, routine, quarterly, and move-out inspections with compliance tracking.
    </Typography>
    <InspectionComplianceCenter />
  </Box>
);

export default AdminInspectionsPage;
