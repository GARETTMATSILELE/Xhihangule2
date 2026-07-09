import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Checkbox, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';
import { ErrorState, LoadingState, PageHeader, formatMoney } from './common';

const featureLabels: Array<[string, string]> = [
  ['maintenance', 'Maintenance'],
  ['reports', 'Reports'],
  ['accounting', 'Accounting'],
  ['ownersPortal', 'Owners Portal'],
  ['whatsappIntegration', 'WhatsApp Integration'],
  ['apiAccess', 'API Access']
];

const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await systemAdminService.listPlans();
      setPlans(Array.isArray(resp?.data) ? resp.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const updatePlan = (index: number, updater: (plan: any) => any) => {
    setPlans((prev) => prev.map((p, i) => i === index ? updater({ ...p }) : p));
  };

  const save = async (plan: any) => {
    await systemAdminService.savePlan(plan);
    await load();
  };

  if (loading) return <LoadingState />;

  return (
    <Box>
      <PageHeader title="Plans" subtitle="Manage database-driven subscription plans, limits, prices, and feature flags." />
      <ErrorState error={error} />
      <Grid container spacing={2}>
        {plans.map((plan, index) => (
          <Grid item xs={12} md={4} key={plan.code}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb', height: '100%' }}>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{plan.code}</Typography>
                  <TextField size="small" label="Plan Name" value={plan.name || ''} onChange={(e) => updatePlan(index, (p) => ({ ...p, name: e.target.value }))} />
                  <TextField size="small" label="Description" value={plan.description || ''} onChange={(e) => updatePlan(index, (p) => ({ ...p, description: e.target.value }))} />
                  <Stack direction="row" spacing={1}>
                    <TextField size="small" label="Monthly Price" type="number" value={plan.monthlyPrice || 0} onChange={(e) => updatePlan(index, (p) => ({ ...p, monthlyPrice: Number(e.target.value) }))} />
                    <TextField size="small" label="Annual Price" type="number" value={plan.annualPrice || 0} onChange={(e) => updatePlan(index, (p) => ({ ...p, annualPrice: Number(e.target.value) }))} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">{formatMoney(plan.monthlyPrice)} / month</Typography>
                  <Grid container spacing={1}>
                    {[
                      ['maxUsers', 'Max Users'],
                      ['maxProperties', 'Max Properties'],
                      ['maxTenants', 'Max Tenants'],
                      ['maxLeases', 'Max Leases'],
                      ['maxStorage', 'Max Storage MB']
                    ].map(([key, label]) => (
                      <Grid item xs={6} key={key}>
                        <TextField size="small" fullWidth label={label} type="number" value={plan.limits?.[key] ?? ''} onChange={(e) => updatePlan(index, (p) => ({ ...p, limits: { ...(p.limits || {}), [key]: e.target.value === '' ? null : Number(e.target.value) } }))} />
                      </Grid>
                    ))}
                  </Grid>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Feature Flags</Typography>
                  {featureLabels.map(([key, label]) => (
                    <Stack key={key} direction="row" alignItems="center" spacing={1}>
                      <Checkbox checked={Boolean(plan.featureFlags?.[key])} onChange={(e) => updatePlan(index, (p) => ({ ...p, featureFlags: { ...(p.featureFlags || {}), [key]: e.target.checked } }))} />
                      <Typography variant="body2">{label}</Typography>
                    </Stack>
                  ))}
                  <TextField select size="small" label="Active" value={plan.isActive === false ? 'no' : 'yes'} onChange={(e) => updatePlan(index, (p) => ({ ...p, isActive: e.target.value === 'yes' }))}>
                    <MenuItem value="yes">Active</MenuItem>
                    <MenuItem value="no">Inactive</MenuItem>
                  </TextField>
                  <Button variant="contained" onClick={() => save(plan)}>Save Plan</Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default PlansPage;
