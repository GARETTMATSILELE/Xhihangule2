import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';
import { EmptyState, ErrorState, LoadingState, PageHeader, exportRowsToCsv, formatDateTime } from './common';

const VouchersPage: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ plan: 'INDIVIDUAL', cycle: 'monthly' });
  const [history, setHistory] = useState<any | null>(null);
  const [created, setCreated] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [companiesResp, vouchersResp] = await Promise.all([
        systemAdminService.listCompanies({ limit: 200 }),
        systemAdminService.listVouchers({ limit: 200 })
      ]);
      setCompanies(Array.isArray(companiesResp?.data) ? companiesResp.data : []);
      setRows(Array.isArray(vouchersResp?.data) ? vouchersResp.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load vouchers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    try {
      const resp = await systemAdminService.createCashVoucher({ ...form, amount: form.amount ? Number(form.amount) : undefined });
      setCreated(resp?.data || resp);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to generate voucher');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <Box>
      <PageHeader title="Vouchers" subtitle="Generate, revoke, extend, and audit cash subscription vouchers." />
      <ErrorState error={error} />
      {created && <Alert severity="success" sx={{ mb: 2 }}>Code: <strong>{created.code}</strong> PIN: <strong>{created.pin}</strong></Alert>}
      <Card sx={{ mb: 3, boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Generate Voucher</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select size="small" label="Company" value={form.companyId || ''} onChange={(e) => setForm({ ...form, companyId: e.target.value })} sx={{ minWidth: 260 }}>
              {companies.map((c) => <MenuItem key={c.companyId} value={c.companyId}>{c.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>{['INDIVIDUAL', 'SME', 'ENTERPRISE'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField>
            <TextField select size="small" label="Cycle" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}>{['monthly', 'yearly'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>
            <TextField size="small" label="Amount Override" type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <TextField size="small" type="date" label="Expiry Date" InputLabelProps={{ shrink: true }} value={form.validUntil || ''} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            <Button variant="contained" onClick={generate} disabled={!form.companyId}>Generate</Button>
          </Stack>
        </CardContent>
      </Card>
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Voucher Registry</Typography>
            <Button onClick={() => exportRowsToCsv('vouchers.csv', rows)}>Export CSV</Button>
          </Stack>
          {!rows.length ? <EmptyState /> : (
            <Table size="small">
              <TableHead><TableRow>{['Code', 'Status', 'Plan', 'Cycle', 'Amount', 'Expiry', 'Redeemed By', 'Redeemed At', 'Actions'].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>{rows.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{row.code}</TableCell>
                  <TableCell>{row.status || (row.redeemedAt ? 'Redeemed' : 'Unused')}</TableCell>
                  <TableCell>{row.plan}</TableCell>
                  <TableCell>{row.cycle}</TableCell>
                  <TableCell>{row.amount}</TableCell>
                  <TableCell>{formatDateTime(row.validUntil)}</TableCell>
                  <TableCell>{row.redeemedBy || '-'}</TableCell>
                  <TableCell>{formatDateTime(row.redeemedAt)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" color="error" onClick={async () => { await systemAdminService.revokeVoucher(row._id, 'Revoked by system admin'); await load(); }}>Revoke</Button>
                      <Button size="small" onClick={async () => { const date = window.prompt('New expiry date (YYYY-MM-DD)'); if (date) { await systemAdminService.extendVoucher(row._id, date); await load(); } }}>Extend</Button>
                      <Button size="small" onClick={async () => setHistory((await systemAdminService.getVoucherHistory(row._id))?.data)}>History</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(history)} onClose={() => setHistory(null)} maxWidth="md" fullWidth>
        <DialogTitle>Voucher History</DialogTitle>
        <DialogContent>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(history, null, 2)}</pre>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default VouchersPage;
