import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Alert,
  CircularProgress,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import systemAdminService from '../../services/systemAdminService';

type Plan = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
type Cycle = 'monthly' | 'yearly';

interface CompanyRow {
  companyId: string;
  name: string;
  email: string;
}

const CashSubscriptionsPage: React.FC = () => {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [plan, setPlan] = useState<Plan>('INDIVIDUAL');
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [amountOverride, setAmountOverride] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [created, setCreated] = useState<any | null>(null);

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState<boolean>(false);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    setError(null);
    try {
      const resp = await systemAdminService.listCompanySubscriptions();
      const rows: CompanyRow[] = (Array.isArray(resp?.data) ? resp.data : []).map((r: any) => ({
        companyId: r.companyId,
        name: r.name,
        email: r.email
      }));
      setCompanies(rows);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load companies');
    } finally {
      setLoadingCompanies(false);
    }
  };

  const loadLists = async () => {
    setLoadingLists(true);
    setError(null);
    try {
      const [vRes, pRes] = await Promise.all([
        systemAdminService.listCashVouchers(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
        systemAdminService.listSubscriptionBillingPayments(selectedCompanyId ? { companyId: selectedCompanyId } : {})
      ]);
      setVouchers(Array.isArray(vRes?.data) ? vRes.data : []);
      setPayments(Array.isArray(pRes?.data) ? pRes.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load vouchers/payments');
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    loadLists();
  }, [selectedCompanyId]);

  const onCreate = async () => {
    setCreating(true);
    setError(null);
    setCreated(null);
    try {
      const payload: any = { companyId: selectedCompanyId, plan, cycle };
      if (amountOverride && !isNaN(Number(amountOverride))) {
        payload.amount = Number(amountOverride);
      }
      const resp = await systemAdminService.createCashVoucher(payload);
      const data = resp?.data || resp;
      setCreated(data);
      await loadLists();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create cash voucher');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#051F20', fontWeight: 700 }}>Cash Subscriptions</Typography>
        <Typography variant="body2" color="text.secondary">
          Generate subscription cash codes, view receipts, and track payments and expiry.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ mb: 3, boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel id="company">Company</InputLabel>
                <Select
                  labelId="company"
                  label="Company"
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(String(e.target.value))}
                  disabled={loadingCompanies}
                >
                  {companies.map((c) => (
                    <MenuItem key={c.companyId} value={c.companyId}>
                      {c.name} ({c.email})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2.5}>
              <FormControl fullWidth size="small">
                <InputLabel id="plan">Plan</InputLabel>
                <Select
                  labelId="plan"
                  label="Plan"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as Plan)}
                >
                  <MenuItem value="INDIVIDUAL">INDIVIDUAL</MenuItem>
                  <MenuItem value="SME">SME</MenuItem>
                  <MenuItem value="ENTERPRISE">ENTERPRISE</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2.5}>
              <FormControl fullWidth size="small">
                <InputLabel id="cycle">Cycle</InputLabel>
                <Select
                  labelId="cycle"
                  label="Cycle"
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value as Cycle)}
                >
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="yearly">Yearly</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Amount (USD) override"
                size="small"
                value={amountOverride}
                onChange={(e) => setAmountOverride(e.target.value)}
                placeholder="optional"
              />
            </Grid>
            <Grid item xs={12} md={1}>
              <Button
                variant="contained"
                onClick={onCreate}
                disabled={creating || !selectedCompanyId}
                fullWidth
              >
                {creating ? 'Generating…' : 'Generate'}
              </Button>
            </Grid>
          </Grid>
          {created && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Code: <strong>{created.code}</strong> • PIN: <strong>{created.pin}</strong> • Receipt: <strong>{created.receiptNumber}</strong>
              <IconButton
                size="small"
                sx={{ ml: 1 }}
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(`Code: ${created.code}  PIN: ${created.pin}`);
                  } catch {}
                }}
              >
                <ContentCopyIcon fontSize="inherit" />
              </IconButton>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={12}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#051F20' }}>Recent Vouchers</Typography>
                <Button size="small" onClick={loadLists} disabled={loadingLists}>
                  {loadingLists ? 'Refreshing…' : 'Refresh'}
                </Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>PIN</TableCell>
                    <TableCell>Plan</TableCell>
                    <TableCell>Cycle</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Issued For</TableCell>
                    <TableCell>Redeemed By</TableCell>
                    <TableCell>Redeemed At</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vouchers.map((v) => (
                    <TableRow key={v._id}>
                      <TableCell>{v.code}</TableCell>
                      <TableCell>{v?.metadata?.pin || '-'}</TableCell>
                      <TableCell>{v.plan}</TableCell>
                      <TableCell>{v.cycle}</TableCell>
                      <TableCell>{v.amount}</TableCell>
                      <TableCell>{v?.metadata?.intendedCompanyId || '-'}</TableCell>
                      <TableCell>{v?.redeemedBy || '-'}</TableCell>
                      <TableCell>{v?.redeemedAt ? new Date(v.redeemedAt).toLocaleString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={12}>
          <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#051F20' }}>Subscription Payments</Typography>
                <Button size="small" onClick={loadLists} disabled={loadingLists}>
                  {loadingLists ? 'Refreshing…' : 'Refresh'}
                </Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Created</TableCell>
                    <TableCell>Company</TableCell>
                    <TableCell>Plan</TableCell>
                    <TableCell>Cycle</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Method</TableCell>
                    <TableCell>Provider</TableCell>
                    <TableCell>Ref/Code</TableCell>
                    <TableCell>Receipt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell>{p?.createdAt ? new Date(p.createdAt).toLocaleString() : '-'}</TableCell>
                      <TableCell>{p.companyId}</TableCell>
                      <TableCell>{p.plan}</TableCell>
                      <TableCell>{p.cycle}</TableCell>
                      <TableCell>{p.amount} {p.currency}</TableCell>
                      <TableCell>{p.method}</TableCell>
                      <TableCell>{p.provider}</TableCell>
                      <TableCell>{p.providerRef || '-'}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={async () => {
                            try {
                              const resp = await systemAdminService.getSubscriptionPaymentReceipt(p._id);
                              const data = resp?.data || resp;
                              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const w = window.open();
                              if (w) {
                                w.document.write('<pre>' + JSON.stringify(data, null, 2) + '</pre>');
                              } else {
                                window.open(url, '_blank');
                              }
                            } catch {}
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CashSubscriptionsPage;

