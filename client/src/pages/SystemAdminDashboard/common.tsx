import React from 'react';
import { Alert, Box, Card, CardContent, CircularProgress, Grid, Stack, Typography } from '@mui/material';

export const PageHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="h4" sx={{ color: '#051F20', fontWeight: 700 }}>{title}</Typography>
    {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
  </Box>
);

export const LoadingState: React.FC = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
    <CircularProgress />
  </Box>
);

export const ErrorState: React.FC<{ error?: string | null }> = ({ error }) => (
  error ? <Alert sx={{ mb: 2 }} severity="error">{error}</Alert> : null
);

export const EmptyState: React.FC<{ label?: string }> = ({ label = 'No records found.' }) => (
  <Box sx={{ py: 4, textAlign: 'center' }}>
    <Typography color="text.secondary">{label}</Typography>
  </Box>
);

export const MetricCard: React.FC<{ label: string; value: React.ReactNode; helper?: string }> = ({ label, value, helper }) => (
  <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb', height: '100%' }}>
    <CardContent>
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h5" sx={{ color: '#051F20', fontWeight: 800 }}>{value}</Typography>
        {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
      </Stack>
    </CardContent>
  </Card>
);

export const MetricGrid: React.FC<{ items: Array<{ label: string; value: React.ReactNode; helper?: string }> }> = ({ items }) => (
  <Grid container spacing={2}>
    {items.map((item) => (
      <Grid item xs={12} sm={6} md={3} key={item.label}>
        <MetricCard {...item} />
      </Grid>
    ))}
  </Grid>
);

export const formatDate = (value?: string | Date | null) => value ? new Date(value).toLocaleDateString() : '-';
export const formatDateTime = (value?: string | Date | null) => value ? new Date(value).toLocaleString() : '-';
export const formatMoney = (value?: number, currency = 'USD') => `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function exportRowsToCsv(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
