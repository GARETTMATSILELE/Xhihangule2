import React, { useState } from 'react';
import { Box, Typography, Button, Grid, Paper, CircularProgress, Alert } from '@mui/material';
import { useMaintenance } from '../../hooks/maintenance';
import { MaintenanceRequestForm } from './MaintenanceRequestForm';
import { MaintenanceCalendar } from './MaintenanceCalendar';
import { User } from '../../types/auth';
import paymentRequestService from '../../services/paymentRequestService';

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
  const { requests, loading, error, updateRequest, fetchRequests } = useMaintenance(user);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submittingRequestId, setSubmittingRequestId] = useState<string | null>(null);

  const handleSendPaymentRequestToAccountant = async (request: any) => {
    if (!request?._id) return;
    setActionError(null);
    setActionSuccess(null);

    const amount = Number(request.estimatedCost || 0);
    if (!amount || amount <= 0) {
      setActionError('Please set an estimated cost before sending payment request to accountant.');
      return;
    }

    try {
      setSubmittingRequestId(request._id);
      const requesterFirstName = user?.firstName?.trim() || 'Maintenance';
      const requesterLastName = user?.lastName?.trim() || 'Vendor';
      await paymentRequestService.createPaymentRequest({
        propertyId: typeof request.propertyId === 'string' ? request.propertyId : request.propertyId?._id,
        amount,
        currency: 'USD',
        reason: `Maintenance: ${request.title || request.description || 'Property maintenance request'}`,
        notes: `Generated from maintenance request ${request._id}`,
        payTo: {
          name: requesterFirstName,
          surname: requesterLastName
        }
      });
      await fetchRequests();
      setActionSuccess('Payment request sent to accountant successfully.');
    } catch (e) {
      console.error('Error sending payment request to accountant', e);
      setActionError('Failed to send payment request to accountant.');
    } finally {
      setSubmittingRequestId(null);
    }
  };

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
    <Box sx={{ width: '100%' }}>
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {actionSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionSuccess(null)}>
          {actionSuccess}
        </Alert>
      )}
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

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2, width: '100%' }}>
            {requests.length === 0 ? (
              <Typography>No maintenance requests found.</Typography>
            ) : (
              <Grid container spacing={2}>
                {requests.map((request) => (
                  <Grid item xs={12} key={request._id}>
                    <Box sx={{ p: 2, border: '1px solid #eee', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Box sx={{ minWidth: 220 }}>
                        <Typography variant="h6" sx={{ mb: 0.5 }}>{request.title}</Typography>
                        <Typography color="text.secondary">{request.description}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Typography variant="body2">Status:</Typography>
                        <Typography
                          component="span"
                          sx={{
                            fontWeight: 700,
                            color: ['approved', 'pending_completion'].includes(String(request.status)) ? 'success.main' : 'text.primary'
                          }}
                        >
                          {['approved', 'pending_completion'].includes(String(request.status))
                            ? 'Approved by Owner'
                            : request.status}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Typography variant="body2">Priority:</Typography>
                        <strong>{request.priority}</strong>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {(request.status === 'pending' || request.status === 'rejected') && (
                          <Button variant="outlined" size="small" onClick={async () => {
                            try {
                              await updateRequest(request._id!, { status: 'pending_approval' as any });
                              await fetchRequests();
                            } catch (e) {
                              console.error('Error sending for owner approval', e);
                            }
                          }}>Send to Owner</Button>
                        )}
                        {(request.status === 'approved' || request.status === 'pending_completion') && (
                          <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            disabled={submittingRequestId === request._id}
                            onClick={() => handleSendPaymentRequestToAccountant(request)}
                          >
                            {submittingRequestId === request._id ? 'Sending...' : 'Send Payment Request'}
                          </Button>
                        )}
                        {request.status === 'in_progress' && (
                          <Button variant="contained" color="success" size="small" onClick={async () => {
                            try {
                              await updateRequest(request._id!, { status: 'completed' });
                            } catch (e) {
                              console.error('Error completing', e);
                            }
                          }}>Mark Completed</Button>
                        )}
                        {request.status === 'completed' && (
                          <Typography variant="body2" color="success.main">Completed</Typography>
                        )}
                      </Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            )}
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