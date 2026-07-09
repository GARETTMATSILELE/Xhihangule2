import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Chip, Grid, Typography } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';
import { ErrorState, LoadingState, PageHeader } from './common';

const colorFor = (status?: string) => status === 'ok' ? 'success' : status === 'degraded' ? 'warning' : 'error';

const StatusCard: React.FC<{ title: string; items: Record<string, any> }> = ({ title, items }) => (
  <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb', height: '100%' }}>
    <CardContent>
      <Typography variant="h6" sx={{ mb: 2, color: '#051F20', fontWeight: 700 }}>{title}</Typography>
      {Object.entries(items || {}).map(([name, value]) => {
        const status = typeof value === 'object' ? value.status : value;
        return (
          <Box key={name} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
            <Typography sx={{ textTransform: 'capitalize' }}>{name.replace(/([A-Z])/g, ' $1')}</Typography>
            <Chip size="small" color={colorFor(status) as any} label={status || 'unknown'} />
          </Box>
        );
      })}
    </CardContent>
  </Card>
);

const StatusPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const st = await systemAdminService.getStatus();
        setStatus(st);
      } catch (e: any) {
        setError(e?.message || 'Failed to load system status');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) return <LoadingState />;

  return (
    <Box>
      <PageHeader title="Status" subtitle="Application, services, performance, uptime, and deployment health." />
      <ErrorState error={error} />
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}><StatusCard title="Application Status" items={status?.application || { frontend: 'ok', backend: status?.status || 'unknown', database: 'unknown' }} /></Grid>
        <Grid item xs={12} md={6}><StatusCard title="Service Status" items={status?.services || { email: 'unknown', storage: 'unknown', payment: 'unknown', backup: 'unknown' }} /></Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, color: '#051F20', fontWeight: 700 }}>Performance</Typography>
              <Typography variant="body2">Memory Usage: {Math.round((status?.performance?.memoryUsage?.heapUsed || 0) / 1024 / 1024)} MB</Typography>
              <Typography variant="body2">CPU Usage: {JSON.stringify(status?.performance?.cpuUsage || {})}</Typography>
              <Typography variant="body2">Database Connections: {status?.performance?.databaseConnections ?? '-'}</Typography>
              <Typography variant="body2">Average Response Time: {status?.performance?.averageResponseTimeMs ?? 'N/A'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, color: '#051F20', fontWeight: 700 }}>Uptime</Typography>
              <Typography variant="body2">System Uptime: {Math.round((status?.uptime?.systemUptimeSeconds || 0) / 3600)} hours</Typography>
              <Typography variant="body2">Process Uptime: {Math.round((status?.uptime?.processUptimeSeconds || 0) / 3600)} hours</Typography>
              <Typography variant="body2">Last Deployment: {status?.uptime?.lastDeployment || 'N/A'}</Typography>
              <Typography variant="body2">Version: {status?.uptime?.version || status?.version || '-'}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default StatusPage;


