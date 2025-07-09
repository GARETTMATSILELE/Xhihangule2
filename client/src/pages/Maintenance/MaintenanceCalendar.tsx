import React from 'react';
import { Box } from '@mui/material';
import { useMaintenance } from '../../hooks/maintenance';

export const MaintenanceCalendar: React.FC = () => {
  const { requests } = useMaintenance();

  return (
    <Box>
      {/* Calendar implementation will go here */}
    </Box>
  );
}; 