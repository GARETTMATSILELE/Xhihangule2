import React from 'react';
import { Typography, Box } from '@mui/material';

export const Communications: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Communications
      </Typography>
      <Typography color="text.secondary">
        This page is reserved for communications features.
      </Typography>
    </Box>
  );
};