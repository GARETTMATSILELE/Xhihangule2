import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Chip,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { Lease } from '../../types/lease';
import { Payment } from '../../types/payment';

interface LeaseDetailProps {
  lease: Lease;
  onEdit: () => void;
  onTerminate: () => void;
}

const LeaseDetail: React.FC<LeaseDetailProps> = ({
  lease,
  onEdit,
  onTerminate,
}) => {
  const isActive = lease.status === 'active';
  const tenantFullName = lease.tenant ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : 'N/A';

  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h4">Lease Details</Typography>
            <Box>
              <Button
                variant="contained"
                color="primary"
                onClick={onEdit}
                disabled={lease.status !== 'active'}
              >
                Edit Lease
              </Button>
              <Button 
                variant="contained" 
                color="error"
                onClick={onTerminate}
                disabled={!isActive}
              >
                Terminate Lease
              </Button>
            </Box>
          </Box>
          <Chip 
            label={lease.status}
            color={isActive ? 'success' : 'default'}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Property Information</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">Property Details</Typography>
                <Typography>{lease.property?.name}</Typography>
                <Typography variant="body2" color="textSecondary">{lease.property?.address}</Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Tenant Information</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">Tenant</Typography>
                <Typography>{lease.tenant?.firstName} {lease.tenant?.lastName}</Typography>
                <Typography variant="body2" color="textSecondary">{lease.tenant?.email}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">Contact</Typography>
                <Typography>{lease.tenant?.phone || 'N/A'}</Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Lease Terms</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Rent Amount</Typography>
                <Typography>${lease.rentAmount}/month</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Security Deposit</Typography>
                <Typography>${lease.depositAmount}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">Utilities Included</Typography>
                <Typography>No</Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Payment History</Typography>
            <List>
              {lease.payments?.map((payment: Payment, index: number) => (
                <React.Fragment key={payment._id}>
                  <ListItem>
                    <ListItemText
                      primary={`$${payment.amount || 0} - ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'No date'}`}
                      secondary={`Method: ${payment.paymentMethod || 'Unknown'}`}
                    />
                  </ListItem>
                  {index < (lease.payments?.length ?? 0) - 1 && <Divider />}
                </React.Fragment>
              ))}
              {(!lease.payments || lease.payments.length === 0) && (
                <ListItem>
                  <ListItemText primary="No payment history" />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default LeaseDetail; 