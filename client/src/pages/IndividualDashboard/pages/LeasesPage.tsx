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
import { getId } from '../../../utils/leaseLifecycle';

function unwrapList(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.leases)) return raw.leases;
  if (Array.isArray(raw?.properties)) return raw.properties;
  if (Array.isArray(raw?.tenants)) return raw.tenants;
  if (Array.isArray(raw?.data?.tenants)) return raw.data.tenants;
  return [];
}

function propertyLabel(property: any, lease: any): string {
  const populated = typeof lease?.propertyId === 'object' ? lease.propertyId : null;
  return (
    property?.address ||
    populated?.address ||
    property?.name ||
    populated?.name ||
    'Property'
  );
}

function tenantLabel(tenant: any, lease: any): { name: string; detail?: string } {
  const populated = typeof lease?.tenantId === 'object' ? lease.tenantId : null;
  const source = tenant || populated;
  const name = [source?.firstName, source?.lastName].filter(Boolean).join(' ').trim();
  return {
    name: name || 'Tenant',
    detail: source?.email || source?.phone || undefined
  };
}

function LeaseCountdownPanel() {
  const [leases, setLeases] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/leases').then((r) => unwrapList(r.data)),
      api.get('/properties').then((r) => unwrapList(r.data)),
      api.get('/tenants', { params: { page: 1, limit: 10000 } }).then((r) => unwrapList(r.data))
    ])
      .then(([leaseRows, propertyRows, tenantRows]) => {
        setLeases(leaseRows);
        setProperties(propertyRows);
        setTenants(tenantRows);
      })
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
        const property = properties.find((item) => getId(item._id) === getId(lease.propertyId));
        const tenant = tenants.find((item) => getId(item._id) === getId(lease.tenantId));
        const tenantInfo = tenantLabel(tenant, lease);
        return (
          <Grid item xs={12} sm={6} md={4} key={lease._id}>
            <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography fontWeight={600}>{propertyLabel(property, lease)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {tenantInfo.name}
                    </Typography>
                    {tenantInfo.detail && tenantInfo.name !== 'Tenant' && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {tenantInfo.detail}
                      </Typography>
                    )}
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
