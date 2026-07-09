import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Grid, Stack, TextField, Button, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import systemAdminService from '../../services/systemAdminService';
import { ErrorState, LoadingState, MetricGrid, PageHeader, formatDate, formatMoney } from './common';

const Field: React.FC<{ label: string; value: any }> = ({ label, value }) => (
  <Stack spacing={0.25}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography sx={{ color: '#051F20' }}>{value || '-'}</Typography>
  </Stack>
);

const CompanyProfilePage: React.FC = () => {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const resp = await systemAdminService.getCompanyProfile(id);
      setData(resp?.data || resp);
      setForm(resp?.data?.companyDetails || {});
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load company profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await systemAdminService.updateCompanyProfile(id, { ...form, name: form.companyName });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save company');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;
  const company = data?.companyDetails || {};
  const subscription = data?.subscription || {};
  const usage = data?.usage || {};
  const financials = data?.financials || {};
  const activity = data?.activity || {};

  return (
    <Box>
      <PageHeader title={company.companyName || 'Company Profile'} subtitle="Company details, subscription, usage, financials, and activity." />
      <ErrorState error={error} />
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Company Details</Typography>
              <Grid container spacing={2}>
                {[
                  ['Company Name', 'companyName'],
                  ['Trading Name', 'tradingName'],
                  ['Registration Number', 'registrationNumber'],
                  ['Address', 'address'],
                  ['Phone', 'phone'],
                  ['Email', 'email'],
                  ['Country', 'country'],
                  ['Default Currency', 'defaultCurrency']
                ].map(([label, key]) => (
                  <Grid item xs={12} sm={6} key={key}>
                    <TextField fullWidth size="small" label={label} value={form[key] || ''} onChange={(e) => setForm((prev: any) => ({ ...prev, [key]: e.target.value }))} />
                  </Grid>
                ))}
              </Grid>
              <Button sx={{ mt: 2 }} variant="contained" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb', height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Subscription</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}><Field label="Plan" value={subscription.plan} /></Grid>
                <Grid item xs={6}><Field label="Billing Cycle" value={subscription.billingCycle} /></Grid>
                <Grid item xs={6}><Field label="Status" value={subscription.status} /></Grid>
                <Grid item xs={6}><Field label="Start Date" value={formatDate(subscription.startDate)} /></Grid>
                <Grid item xs={6}><Field label="Renewal Date" value={formatDate(subscription.renewalDate)} /></Grid>
                <Grid item xs={6}><Field label="Expiry Date" value={formatDate(subscription.expiryDate)} /></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box id="usage" sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Usage</Typography>
        <MetricGrid items={[
          { label: 'Property Count', value: usage.propertyCount || 0 },
          { label: 'Tenant Count', value: usage.tenantCount || 0 },
          { label: 'Lease Count', value: usage.leaseCount || 0 },
          { label: 'User Count', value: usage.userCount || 0 },
          { label: 'Storage Used', value: `${Math.round((usage.storageUsed || 0) / 1024 / 1024)} MB` }
        ]} />
      </Box>

      <Typography variant="h6" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>Financials</Typography>
      <MetricGrid items={[
        { label: 'Lifetime Revenue', value: formatMoney(financials.lifetimeRevenue) },
        { label: 'Outstanding Balance', value: formatMoney(financials.outstandingBalance) },
        { label: 'Cash Payments', value: formatMoney(financials.cashPayments) },
        { label: 'Online Payments', value: formatMoney(financials.onlinePayments) }
      ]} />

      <Typography variant="h6" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>Activity</Typography>
      <MetricGrid items={[
        { label: 'Last Login', value: formatDate(activity.lastLogin) },
        { label: 'Last Property Added', value: formatDate(activity.lastPropertyAdded) },
        { label: 'Last Tenant Added', value: formatDate(activity.lastTenantAdded) },
        { label: 'Last Lease Created', value: formatDate(activity.lastLeaseCreated) }
      ]} />
    </Box>
  );
};

export default CompanyProfilePage;
