import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import systemAdminService, { BillingCycle, SystemPlan } from '../../services/systemAdminService';
import { EmptyState, ErrorState, LoadingState, PageHeader, exportRowsToCsv, formatDateTime, formatMoney } from './common';

const methods = ['Cash', 'EcoCash', 'ZIPIT', 'Bank Transfer', 'Innbucks', 'Mukuru'];
const plans: SystemPlan[] = ['INDIVIDUAL', 'SME', 'ENTERPRISE'];
const cycles: BillingCycle[] = ['monthly', 'yearly'];

const CashPaymentsPage: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ plan: 'INDIVIDUAL', billingCycle: 'monthly', method: 'Cash', currency: 'USD' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [companiesResp, paymentsResp] = await Promise.all([
        systemAdminService.listCompanies({ limit: 200 }),
        systemAdminService.listCashPayments({ limit: 200 })
      ]);
      setCompanies(Array.isArray(companiesResp?.data) ? companiesResp.data : []);
      setRows(Array.isArray(paymentsResp?.data) ? paymentsResp.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load cash payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      setError(null);
      await systemAdminService.createCashPayment({ ...form, amount: Number(form.amount || 0) });
      setMessage('Cash payment submitted for review.');
      setForm({ plan: 'INDIVIDUAL', billingCycle: 'monthly', method: 'Cash', currency: 'USD' });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create cash payment');
    }
  };

  const review = async (id: string, action: 'approve' | 'reject' | 'request-info') => {
    try {
      setError(null);
      if (action === 'approve') await systemAdminService.approveCashPayment(id, 'Approved by system admin');
      if (action === 'reject') await systemAdminService.rejectCashPayment(id, 'Rejected by system admin');
      if (action === 'request-info') await systemAdminService.requestCashPaymentInfo(id, 'Please provide more payment details.');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to review cash payment');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <Box>
      <PageHeader title="Cash Payments" subtitle="Review manual subscription payments from Cash, EcoCash, ZIPIT, Bank Transfer, Innbucks, and Mukuru." />
      <ErrorState error={error} />
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      <Card sx={{ mb: 3, boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Submit Manual Payment</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField select fullWidth size="small" label="Company" value={form.companyId || ''} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                {companies.map((c) => <MenuItem key={c.companyId} value={c.companyId}>{c.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} md={2}><TextField select fullWidth size="small" label="Plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>{plans.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField></Grid>
            <Grid item xs={6} md={2}><TextField select fullWidth size="small" label="Cycle" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>{cycles.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid>
            <Grid item xs={6} md={2}><TextField select fullWidth size="small" label="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{methods.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}</TextField></Grid>
            <Grid item xs={6} md={1.5}><TextField fullWidth size="small" label="Amount" type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Grid>
            <Grid item xs={12} md={1.5}><Button fullWidth variant="contained" onClick={submit} disabled={!form.companyId || !form.amount}>Create</Button></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Reference Number" value={form.referenceNumber || ''} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Proof of Payment URL/Ref" value={form.proofOfPayment || ''} onChange={(e) => setForm({ ...form, proofOfPayment: e.target.value })} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Notes" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Payment Queue</Typography>
            <Button onClick={() => exportRowsToCsv('cash-payments.csv', rows)}>Export CSV</Button>
          </Stack>
          {!rows.length ? <EmptyState /> : (
            <Table size="small">
              <TableHead><TableRow>{['Submitted', 'Company', 'Method', 'Reference', 'Plan', 'Amount', 'Status', 'Actions'].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell>{formatDateTime(row.submittedAt || row.createdAt)}</TableCell>
                    <TableCell>{row.companyId?.name || row.companyId}</TableCell>
                    <TableCell>{row.method}</TableCell>
                    <TableCell>{row.referenceNumber || '-'}</TableCell>
                    <TableCell>{row.plan} / {row.billingCycle}</TableCell>
                    <TableCell>{formatMoney(row.amount, row.currency)}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" color="success" onClick={() => review(row._id, 'approve')} disabled={row.status === 'Approved'}>Approve</Button>
                        <Button size="small" color="warning" onClick={() => review(row._id, 'request-info')}>More Info</Button>
                        <Button size="small" color="error" onClick={() => review(row._id, 'reject')}>Reject</Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default CashPaymentsPage;
