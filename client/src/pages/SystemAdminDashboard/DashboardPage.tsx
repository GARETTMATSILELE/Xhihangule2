import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Grid, List, ListItem, ListItemText, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import systemAdminService from '../../services/systemAdminService';
import { ErrorState, LoadingState, MetricGrid, PageHeader, formatMoney } from './common';

const COLORS = ['#235347', '#8EB69B', '#163832', '#DAF1DE', '#0B2B26'];

const DashboardPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const resp = await systemAdminService.getDashboard();
        setData(resp?.data || resp);
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingState />;
  const kpis = data?.kpis || {};
  const charts = data?.charts || {};

  return (
    <Box>
      <PageHeader title="System Admin Dashboard" subtitle="Enterprise SaaS control center for companies, revenue, usage, subscriptions, and support." />
      <ErrorState error={error} />

      <Typography variant="h6" sx={{ mb: 1, color: '#051F20', fontWeight: 700 }}>Companies</Typography>
      <MetricGrid items={[
        { label: 'Total Companies', value: kpis.companies?.total || 0 },
        { label: 'Active Companies', value: kpis.companies?.active || 0 },
        { label: 'Trial Companies', value: kpis.companies?.trial || 0 },
        { label: 'Suspended Companies', value: kpis.companies?.suspended || 0 }
      ]} />

      <Typography variant="h6" sx={{ mt: 3, mb: 1, color: '#051F20', fontWeight: 700 }}>Revenue</Typography>
      <MetricGrid items={[
        { label: 'Monthly Recurring Revenue', value: formatMoney(kpis.revenue?.monthlyRecurringRevenue) },
        { label: 'Expected Revenue', value: formatMoney(kpis.revenue?.expectedRevenue) },
        { label: 'Cash Revenue This Month', value: formatMoney(kpis.revenue?.cashRevenueThisMonth) },
        { label: 'Online Revenue This Month', value: formatMoney(kpis.revenue?.onlineRevenueThisMonth) }
      ]} />

      <Typography variant="h6" sx={{ mt: 3, mb: 1, color: '#051F20', fontWeight: 700 }}>Usage</Typography>
      <MetricGrid items={[
        { label: 'Total Properties', value: kpis.usage?.totalProperties || 0 },
        { label: 'Total Tenants', value: kpis.usage?.totalTenants || 0 },
        { label: 'Total Leases', value: kpis.usage?.totalLeases || 0 },
        { label: 'Total Maintenance Requests', value: kpis.usage?.totalMaintenanceRequests || 0 }
      ]} />

      <Typography variant="h6" sx={{ mt: 3, mb: 1, color: '#051F20', fontWeight: 700 }}>Subscriptions</Typography>
      <MetricGrid items={[
        { label: 'Expiring in 7 Days', value: kpis.subscriptions?.expiringIn7Days || 0 },
        { label: 'Expiring in 30 Days', value: kpis.subscriptions?.expiringIn30Days || 0 },
        { label: 'Overdue', value: kpis.subscriptions?.overdue || 0 },
        { label: 'Trial Ending Soon', value: kpis.subscriptions?.trialEndingSoon || 0 }
      ]} />

      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Monthly Revenue Trend</Typography>
              <Box sx={{ height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={charts.monthlyRevenueTrend || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="revenue" stroke="#235347" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>New Companies per Month</Typography>
              <Box sx={{ height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={charts.newCompaniesPerMonth || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="companies" fill="#235347" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Plan Distribution</Typography>
              <Box sx={{ height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={charts.planDistribution || []} dataKey="value" nameKey="name" outerRadius={90} label>
                      {(charts.planDistribution || []).map((_: any, index: number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Subscription Status Distribution</Typography>
              <Box sx={{ height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={charts.subscriptionStatusDistribution || []} dataKey="value" nameKey="name" outerRadius={90} label>
                      {(charts.subscriptionStatusDistribution || []).map((_: any, index: number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {[
          ['New Company Registrations', data?.recentActivity?.newCompanyRegistrations || []],
          ['New Subscription Activations', data?.recentActivity?.newSubscriptionActivations || []],
          ['Cash Payments Approved', data?.recentActivity?.cashPaymentsApproved || []],
          ['Support Tickets Created', data?.recentActivity?.supportTicketsCreated || []]
        ].map(([title, rows]: any) => (
          <Grid item xs={12} md={6} key={title}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
                <List dense>
                  {rows.length ? rows.map((row: any) => (
                    <ListItem key={row._id || row.companyId || row.subject}>
                      <ListItemText primary={row.name || row.subject || row.plan || row.companyId} secondary={row.email || row.status || row.createdAt} />
                    </ListItem>
                  )) : <ListItem><ListItemText primary="No recent activity" /></ListItem>}
                </List>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default DashboardPage;


