import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';
import { EmptyState, ErrorState, LoadingState, MetricGrid, PageHeader, exportRowsToCsv, formatDateTime } from './common';

const SupportTicketsPage: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ priority: 'Medium' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [companiesResp, ticketsResp] = await Promise.all([
        systemAdminService.listCompanies({ limit: 200 }),
        systemAdminService.listSupportTickets({ limit: 200 })
      ]);
      setCompanies(Array.isArray(companiesResp?.data) ? companiesResp.data : []);
      setRows(Array.isArray(ticketsResp?.data) ? ticketsResp.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const metrics = useMemo(() => {
    const open = rows.filter((r) => !['Resolved', 'Closed'].includes(r.status)).length;
    const critical = rows.filter((r) => r.priority === 'Critical' && !['Resolved', 'Closed'].includes(r.status)).length;
    const resolved = rows.filter((r) => r.resolvedAt);
    const avgMs = resolved.length ? resolved.reduce((sum, r) => sum + (new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()), 0) / resolved.length : 0;
    return { open, critical, avgHours: Math.round(avgMs / 1000 / 60 / 60) };
  }, [rows]);

  const create = async () => {
    try {
      await systemAdminService.createSupportTicket(form);
      setForm({ priority: 'Medium' });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create support ticket');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <Box>
      <PageHeader title="Support Desk" subtitle="Track company support tickets, priority, status, and resolution time." />
      <ErrorState error={error} />
      <MetricGrid items={[
        { label: 'Open Tickets', value: metrics.open },
        { label: 'Critical Tickets', value: metrics.critical },
        { label: 'Average Resolution Time', value: `${metrics.avgHours}h` }
      ]} />
      <Card sx={{ my: 3, boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Create Ticket</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}><TextField select fullWidth size="small" label="Company" value={form.companyId || ''} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>{companies.map((c) => <MenuItem key={c.companyId} value={c.companyId}>{c.name}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Subject" value={form.subject || ''} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Grid>
            <Grid item xs={12} md={2}><TextField select fullWidth size="small" label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{['Low', 'Medium', 'High', 'Critical'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Description" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Grid>
            <Grid item xs={12} md={1}><Button fullWidth variant="contained" onClick={create} disabled={!form.companyId || !form.subject || !form.description}>Create</Button></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Tickets</Typography>
            <Button onClick={() => exportRowsToCsv('support-tickets.csv', rows)}>Export CSV</Button>
          </Stack>
          {!rows.length ? <EmptyState /> : (
            <Table size="small">
              <TableHead><TableRow>{['Created', 'Company', 'Subject', 'Priority', 'Status', 'Actions'].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>{rows.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>{row.companyId?.name || row.companyId}</TableCell>
                  <TableCell>{row.subject}</TableCell>
                  <TableCell>{row.priority}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      {['In Progress', 'Waiting', 'Resolved', 'Closed'].map((status) => <Button key={status} size="small" onClick={async () => { await systemAdminService.updateSupportTicket(row._id, { status }); await load(); }}>{status}</Button>)}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SupportTicketsPage;
