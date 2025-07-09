import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Chip,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import { Tenant } from '../../types/tenant';
import { Payment } from '../../types/payment';

interface TenantDetailProps {
  tenant: Tenant & { payments?: Payment[] };
  onClose: () => void;
}

export const TenantDetail: React.FC<TenantDetailProps> = ({
  tenant,
  onClose,
}) => {
  const fullName = `${tenant.firstName} ${tenant.lastName}`;
  const isActive = tenant.status === 'Active';

  return (
    <Box sx={{ p: 3 }}>
      <Card>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5">{fullName}</Typography>
                <Chip
                  label={tenant.status}
                  color={isActive ? 'success' : 'default'}
                />
              </Box>
            </Grid>
            <Grid item xs={12}>
              <Divider />
            </Grid>
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="textSecondary">Contact Information</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="textSecondary">Email</Typography>
                  <Typography>{tenant.email}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="textSecondary">Phone</Typography>
                  <Typography>{tenant.phone}</Typography>
                </Grid>
                {tenant.idNumber && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="textSecondary">ID Number</Typography>
                    <Typography>{tenant.idNumber}</Typography>
                  </Grid>
                )}
                {tenant.emergencyContact && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="textSecondary">Emergency Contact</Typography>
                    <Typography>{tenant.emergencyContact}</Typography>
                  </Grid>
                )}
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}; 