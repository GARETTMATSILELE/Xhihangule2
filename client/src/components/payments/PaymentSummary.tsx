import React from 'react';
import { Grid, Card, CardContent, Typography } from '@mui/material';
import { PaymentSummary as PaymentSummaryType } from '../../types/payment';

interface PaymentSummaryProps {
  summary: PaymentSummaryType;
}

const PaymentSummary: React.FC<PaymentSummaryProps> = ({ summary }) => {
  return (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Income
            </Typography>
            <Typography variant="h5">
              ${summary.totalIncome.toFixed(2)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Payments
            </Typography>
            <Typography variant="h5">
              {summary.totalPayments}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Overdue Payments
            </Typography>
            <Typography variant="h5">
              {summary.overduePayments}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Pending Amount
            </Typography>
            <Typography variant="h5">
              ${summary.pendingAmount.toFixed(2)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default PaymentSummary; 