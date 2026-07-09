import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography
} from '@mui/material';
import api from '../../../api/axios';
import AdminLeasesPage from '../../AdminLeasesPage';
import { PageShell } from '../components/shared';
import { INDIVIDUAL_THEME, leaseCountdownColor } from '../theme';
import { daysUntil } from '../utils/formatters';

function LeaseCountdownPanel() {
  const [leases, setLeases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/leases')
      .then((r) => setLeases(Array.isArray(r.data) ? r.data : r.data?.data || r.data?.leases || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const active = leases.filter((l) => ['active', 'expiring_soon'].includes(String(l.status || '').toLowerCase()));

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {active.slice(0, 6).map((lease) => {
        const days = daysUntil(lease.endDate);
        if (days === null) return null;
        const color = leaseCountdownColor(days);
        return (
          <Grid item xs={12} sm={6} md={4} key={lease._id}>
            <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography fontWeight={600}>{lease.propertyId?.name || 'Property'}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {lease.tenantId?.firstName ? `${lease.tenantId.firstName} ${lease.tenantId.lastName || ''}` : 'Tenant'}
                    </Typography>
                  </Box>
                  <Chip
                    label={days < 0 ? 'Expired' : `${days} days left`}
                    color={color}
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Expires: {new Date(lease.endDate).toLocaleDateString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        );
      })}
      {!active.length && <Grid item xs={12}><Alert severity="info">No active leases. Create a lease to track renewals.</Alert></Grid>}
    </Grid>
  );
}

export function IndividualLeasesPage() {
  return (
    <PageShell title="Leases" subtitle="Track lease countdowns and manage renewals, extensions, and terminations.">
      <LeaseCountdownPanel />
      <Box sx={{ '& .MuiButton-contained': { bgcolor: INDIVIDUAL_THEME.primary } }}>
        <AdminLeasesPage />
      </Box>
    </PageShell>
  );
}

export default IndividualLeasesPage;
