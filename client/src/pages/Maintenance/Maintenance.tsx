import React, { useState } from 'react';
import { Box, Typography, Button, Grid, Paper, CircularProgress, Alert } from '@mui/material';
import { useMaintenance } from '../../hooks/maintenance';
import { MaintenanceRequestForm } from './MaintenanceRequestForm';
import { MaintenanceCalendar } from './MaintenanceCalendar';
import { User } from '../../types/auth';

// Define a flexible company interface that matches auth context
interface CompanyInfo {
  _id: string;
  name: string;
  ownerId?: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationNumber?: string;
  tinNumber?: string;
  description?: string;
  isActive?: boolean;
  subscriptionStatus?: 'active' | 'inactive' | 'trial';
  subscriptionEndDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MaintenanceProps {
  user?: User;
  company?: CompanyInfo;
  isAuthenticated: boolean;
  authLoading: boolean;
}

export const Maintenance: React.FC<MaintenanceProps> = ({ 
  user, 
  company, 
  isAuthenticated, 
  authLoading 
}) => {
  const { requests, loading, error } = useMaintenance(user);
  const [showForm, setShowForm] = useState(false);

  // Show loading if maintenance data is loading
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Loading maintenance requests...
        </Typography>
      </Box>
    );
  }

  // Show error if there's an error fetching maintenance data
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Error: {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* User and Company Info Header */}
      <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #e0e0e0' }}>
        <Typography variant="h6" gutterBottom>
          Maintenance Dashboard
        </Typography>
        {user && (
          <>
            <Typography variant="body2" color="text.secondary">
              User: {user.firstName} {user.lastName} ({user.email})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Role: {user.role}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              User Company ID: {user.companyId}
            </Typography>
          </>
        )}
        {company && (
          <>
            <Typography variant="body2" color="text.secondary">
              Company: {company.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Company ID: {company._id}
            </Typography>
          </>
        )}
        <Typography variant="body2" color="text.secondary">
          Authentication Status: {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
            <Typography variant="h4">Maintenance Requests</Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setShowForm(true)}
            >
              New Request
            </Button>
          </Box>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            {requests.length === 0 ? (
              <Typography>No maintenance requests found.</Typography>
            ) : (
              requests.map((request) => (
                <Box key={request._id} sx={{ mb: 2, p: 2, border: '1px solid #eee' }}>
                  <Typography variant="h6">{request.title}</Typography>
                  <Typography>Status: {request.status}</Typography>
                  <Typography>Priority: {request.priority}</Typography>
                  <Typography>Description: {request.description}</Typography>
                </Box>
              ))
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <MaintenanceCalendar />
          </Paper>
        </Grid>
      </Grid>

      <MaintenanceRequestForm
        open={showForm}
        onClose={() => setShowForm(false)}
      />
    </Box>
  );
}; 