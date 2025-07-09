import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  Divider,
} from '@mui/material';
import { Payment } from '../../types/payment';

interface PaymentDetailProps {
  payment: Payment;
  onEdit: () => void;
  onDownloadReceipt: () => void;
}

const PaymentDetail: React.FC<PaymentDetailProps> = ({
  payment,
  onEdit,
  onDownloadReceipt,
}) => {
  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h4">Payment Details</Typography>
            <Box>
              <Button variant="outlined" onClick={onEdit} sx={{ mr: 1 }}>
                Edit
              </Button>
              {payment.receiptUrl && (
                <Button 
                  variant="contained" 
                  color="primary"
                  onClick={onDownloadReceipt}
                >
                  Download Receipt
                </Button>
              )}
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Payment Information</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Amount</Typography>
                <Typography variant="h5">${payment.amount || 0}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Payment Method</Typography>
                <Typography>{(payment.paymentMethod || 'Unknown').replace('_', ' ').toUpperCase()}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Payment Date</Typography>
                <Typography>{payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'No date'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Receipt</Typography>
                <Typography>{payment.receiptUrl ? 'Available' : 'Not Available'}</Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Notes</Typography>
            <Typography>{payment.notes || 'No notes available'}</Typography>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Related Information</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Tenant ID</Typography>
                <Typography>{payment.tenantId}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Property ID</Typography>
                <Typography>{payment.propertyId}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="textSecondary">Created At</Typography>
                <Typography>{new Date(payment.createdAt).toLocaleString()}</Typography>
              </Grid>
              {payment.updatedAt && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="textSecondary">Last Updated</Typography>
                  <Typography>{new Date(payment.updatedAt).toLocaleString()}</Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PaymentDetail; 