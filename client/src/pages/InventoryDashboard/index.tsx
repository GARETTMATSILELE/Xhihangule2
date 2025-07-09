import React from 'react';
import { Box, Typography } from '@mui/material';

const InventoryDashboard: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Inventory Dashboard
      </Typography>
      {/* Add your inventory dashboard content here */}
    </Box>
  );
};

export default InventoryDashboard; 