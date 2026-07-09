import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';
import { EmptyState, ErrorState, LoadingState, PageHeader, exportRowsToCsv, formatDate, formatMoney } from './common';

const InvoicesPage: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ plan: 'INDIVIDUAL', billingCycle: 'monthly', currency: 'USD', status: 'Issued' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [companiesResp, invoicesResp] = await Promise.all([
        systemAdminService.listCompanies({ limit: 200 }),
        systemAdminService.listInvoices({ limit: 200 })
      ]);
      setCompanies(Array.isArray(companiesResp?.data) ? companiesResp.data : []);
      setRows(Array.isArray(invoicesResp?.data) ? invoicesResp.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    try {
      await systemAdminService.generateInvoice({ ...form, amount: form.amount ? Number(form.amount) : undefined });
      setForm({ plan: 'INDIVIDUAL', billingCycle: 'monthly', currency: 'USD', status: 'Issued' });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to generate invoice');
    }
  };

  const mark = async (id: string, status: string) => {
    await systemAdminService.updateInvoice(id, { status, paidAt: status === 'Paid' ? new Date().toISOString() : undefined });
    await load();
  };

  if (loading) return <LoadingState />;

  return (
    <Box>
      <PageHeader title="Invoices" subtitle="Generate, download, email, and track SaaS platform invoices." />
      <ErrorState error={error} />
      <Card sx={{ mb: 3, boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Generate Invoice</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}><TextField select fullWidth size="small" label="Company" value={form.companyId || ''} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>{companies.map((c) => <MenuItem key={c.companyId} value={c.companyId}>{c.name}</MenuItem>)}</TextField></Grid>
            <Grid item xs={6} md={2}><TextField select fullWidth size="small" label="Plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>{['INDIVIDUAL', 'SME', 'ENTERPRISE'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField></Grid>
            <Grid item xs={6} md={2}><TextField select fullWidth size="small" label="Cycle" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>{['monthly', 'yearly'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField></Grid>
            <Grid item xs={6} md={1.5}><TextField fullWidth size="small" label="Amount" type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Grid>
            <Grid item xs={6} md={2}><TextField fullWidth size="small" type="date" label="Due Date" InputLabelProps={{ shrink: true }} value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Grid>
            <Grid item xs={12} md={1.5}><Button fullWidth variant="contained" onClick={generate} disabled={!form.companyId}>Generate</Button></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Invoices</Typography>
            <Button onClick={() => exportRowsToCsv('platform-invoices.csv', rows)}>Export CSV</Button>
          </Stack>
          {!rows.length ? <EmptyState /> : (
            <Table size="small">
              <TableHead><TableRow>{['Invoice Number', 'Company', 'Plan', 'Amount', 'Issue Date', 'Due Date', 'Status', 'Actions'].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>{rows.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{row.invoiceNumber}</TableCell>
                  <TableCell>{row.companyId?.name || row.companyId}</TableCell>
                  <TableCell>{row.plan}</TableCell>
                  <TableCell>{formatMoney(row.amount, row.currency)}</TableCell>
                  <TableCell>{formatDate(row.issueDate)}</TableCell>
                  <TableCell>{formatDate(row.dueDate)}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button size="small" onClick={() => systemAdminService.downloadInvoicePdf(row._id, row.invoiceNumber)}>PDF</Button>
                      <Button size="small" onClick={() => systemAdminService.emailInvoice(row._id)}>Email</Button>
                      <Button size="small" color="success" onClick={() => mark(row._id, 'Paid')}>Paid</Button>
                      <Button size="small" color="warning" onClick={() => mark(row._id, 'Overdue')}>Overdue</Button>
                      <Button size="small" color="error" onClick={() => mark(row._id, 'Cancelled')}>Cancel</Button>
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

export default InvoicesPage;
