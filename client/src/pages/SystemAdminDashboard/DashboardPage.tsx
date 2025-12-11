import React from 'react';
import { Box, Typography, Card, CardContent, Grid } from '@mui/material';

const DashboardPage: React.FC = () => {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#051F20', fontWeight: 700 }}>Dashboard</Typography>
        <Typography variant="body2" color="text.secondary">
          Overview of system-wide controls and health
        </Typography>
      </Box>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1, color: '#051F20', fontWeight: 700 }}>Quick Links</Typography>
              <Typography variant="body2" color="text.secondary">
                Use the sidebar to access Status, Backups & Maintenance, and User Management.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;


