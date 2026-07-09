import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import systemAdminService from '../../services/systemAdminService';
import { ErrorState, LoadingState, MetricGrid, PageHeader, formatMoney } from './common';

const RevenueAnalyticsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await systemAdminService.getRevenueAnalytics();
        setData(resp?.data || resp);
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load revenue analytics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingState />;
  const metrics = data?.metrics || {};
  const charts = data?.charts || {};

  const chartCard = (title: string, chart: React.ReactNode) => (
    <Grid item xs={12} md={6}>
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{title}</Typography>
          <Box sx={{ height: 280 }}>{chart}</Box>
        </CardContent>
      </Card>
    </Grid>
  );

  return (
    <Box>
      <PageHeader title="Revenue Analytics" subtitle="MRR, ARR, cash, online, outstanding revenue, and forecasts." />
      <ErrorState error={error} />
      <MetricGrid items={[
        { label: 'MRR', value: formatMoney(metrics.mrr) },
        { label: 'ARR', value: formatMoney(metrics.arr) },
        { label: 'Cash Revenue', value: formatMoney(metrics.cashRevenue) },
        { label: 'Online Revenue', value: formatMoney(metrics.onlineRevenue) },
        { label: 'Outstanding Revenue', value: formatMoney(metrics.outstandingRevenue) }
      ]} />
      <Grid container spacing={2} sx={{ mt: 1 }}>
        {chartCard('Revenue By Month', <ResponsiveContainer><LineChart data={charts.revenueByMonth || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Line dataKey="revenue" stroke="#235347" strokeWidth={2} /></LineChart></ResponsiveContainer>)}
        {chartCard('Revenue By Plan', <ResponsiveContainer><BarChart data={charts.revenueByPlan || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="plan" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#235347" /></BarChart></ResponsiveContainer>)}
        {chartCard('Revenue By Company', <ResponsiveContainer><BarChart data={charts.revenueByCompany || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="company" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="#8EB69B" /></BarChart></ResponsiveContainer>)}
        {chartCard('Revenue Forecast', <ResponsiveContainer><LineChart data={charts.revenueForecast || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Line dataKey="revenue" stroke="#163832" strokeWidth={2} /></LineChart></ResponsiveContainer>)}
      </Grid>
    </Box>
  );
};

export default RevenueAnalyticsPage;
