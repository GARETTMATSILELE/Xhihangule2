import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import accountingService from '../../services/accountingService';

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0));

const FinancialControlsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [trial, setTrial] = useState<any>(null);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, tb, ex, per] = await Promise.all([
        accountingService.getFinancialControls(),
        accountingService.getTrialBalance(),
        accountingService.listFinancialExceptions(),
        accountingService.listAccountingPeriods()
      ]);
      setDashboard(dash);
      setTrial(tb);
      setExceptions(ex);
      setPeriods(per);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load financial controls');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runIntegrity = async () => {
    try {
      setBusy(true);
      await accountingService.runFinancialIntegrity();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Integrity run failed');
    } finally {
      setBusy(false);
    }
  };

  const closePeriod = async (id: string, status: 'SOFT_CLOSED' | 'CLOSED') => {
    if (!reason.trim()) {
      setError('A reason is required to close a period.');
      return;
    }
    try {
      setBusy(true);
      await accountingService.closeAccountingPeriod(id, { reason, status });
      setReason('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to close period');
    } finally {
      setBusy(false);
    }
  };

  const reopenPeriod = async (id: string) => {
    if (!reason.trim()) {
      setError('A reason is required to reopen a period.');
      return;
    }
    try {
      setBusy(true);
      await accountingService.reopenAccountingPeriod(id, { reason });
      setReason('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to reopen period');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !dashboard) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const overall = dashboard?.overall || 'REQUIRES ATTENTION';
  const counts = dashboard?.counts || {};
  const trust = dashboard?.trust || trial?.trust;
  const checklist = dashboard?.checklist || [];

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>Financial Controls</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Audit-readiness layer on the Phase 7 posting pipeline. Detection only — this page does not rewrite historical amounts.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="overline">Financial Controls Status</Typography>
              <Chip label={overall} color={overall === 'PASS' ? 'success' : overall === 'BLOCKED' ? 'error' : 'warning'} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="overline">Trial balance</Typography>
              <Typography>Debits {money(dashboard?.trialBalance?.totalDebits || trial?.totalDebits || 0)}</Typography>
              <Typography>Credits {money(dashboard?.trialBalance?.totalCredits || trial?.totalCredits || 0)}</Typography>
              <Typography>Difference {money(dashboard?.trialBalance?.difference || trial?.difference || 0)}</Typography>
              <Chip size="small" label={dashboard?.trialBalance?.status || trial?.status || 'REQUIRES_REVIEW'} sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {trust && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">Trust reconciliation</Typography>
          <Chip size="small" label={`SCOPE ${trust.scope || 'PARTIAL'}`} sx={{ mr: 1, mb: 1 }} />
          <Chip
            size="small"
            label={trust.status === 'RECONCILIATION_EXCEPTION' ? 'RECONCILIATION EXCEPTION' : 'BALANCED WITHIN SCOPE'}
            sx={{ mb: 1 }}
          />
          <Alert severity="warning" sx={{ mb: 1 }}>
            PARTIAL. BALANCED WITHIN SCOPE is not a full trust-account reconciliation.
          </Alert>
          <Typography variant="body2">Difference: {money(trust.difference || 0)}</Typography>
          {(trust.categories || []).map((row: any) => (
            <Typography key={row.category} variant="body2">
              {row.controlScope || (row.inScope ? 'IN_SCOPE' : 'NOT_IMPLEMENTED')} · {row.category} {row.gl ? `(${row.gl})` : ''}
            </Typography>
          ))}
        </Paper>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Control counts</Typography>
        <Grid container spacing={1}>
          {[
            ['open financial exceptions', counts.openFinancialExceptions, '/accountant-dashboard/financial-controls'],
            ['unreconciled bank items', counts.unreconciledBankItems, '/accountant-dashboard/ledger'],
            ['trust exceptions', counts.trustExceptions, '/accountant-dashboard/tax'],
            ['duplicate payment reviews', counts.duplicatePaymentReviews, '/accountant-dashboard/financial-controls'],
            ['negative balance reviews', counts.negativeBalanceReviews, '/accountant-dashboard/financial-controls'],
            ['trial balance differences', counts.trialBalanceDifferences, '/accountant-dashboard/financial-controls'],
            ['pending approvals', counts.pendingApprovals, '/accountant-dashboard/financial-controls'],
            ['open tax reviews', counts.openTaxReviews, '/accountant-dashboard/tax'],
            ['closed periods', counts.closedPeriods, '/accountant-dashboard/financial-controls']
          ].map(([label, value, path]) => (
            <Grid item xs={12} sm={6} md={4} key={String(label)}>
              <Button fullWidth variant="outlined" onClick={() => navigate(String(path))}>
                {String(label)}: {Number(value || 0)}
              </Button>
            </Grid>
          ))}
        </Grid>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Month-end control checklist</Typography>
        <Typography variant="caption" display="block" sx={{ mb: 1 }}>
          Items only show PASS when the underlying condition passes. Reports and period close are never auto-completed.
        </Typography>
        {checklist.map((row: any) => (
          <Typography key={row.id} variant="body2">
            [{row.pass ? 'PASS' : ' '}] {row.label} — {row.detail}
          </Typography>
        ))}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Accounting periods</Typography>
        <TextField
          fullWidth
          sx={{ my: 1 }}
          label="Close / reopen reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {periods.map((row) => (
              <TableRow key={row._id}>
                <TableCell>{row.periodStart ? new Date(row.periodStart).toISOString().slice(0, 10) : '—'}</TableCell>
                <TableCell>{row.periodEnd ? new Date(row.periodEnd).toISOString().slice(0, 10) : '—'}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>
                  {row.status === 'OPEN' && (
                    <>
                      <Button size="small" disabled={busy} onClick={() => closePeriod(row._id, 'SOFT_CLOSED')}>Soft close</Button>
                      <Button size="small" disabled={busy} onClick={() => closePeriod(row._id, 'CLOSED')}>Close</Button>
                    </>
                  )}
                  {row.status !== 'OPEN' && (
                    <Button size="small" disabled={busy} onClick={() => reopenPeriod(row._id)}>Reopen</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6">Financial exceptions</Typography>
          <Button variant="contained" onClick={runIntegrity} disabled={busy}>Run financial integrity (detection only)</Button>
        </Box>
        {exceptions.map((row) => (
          <Paper key={row._id} sx={{ p: 1.5, mb: 1 }}>
            <Typography fontWeight={600}>{row.type}</Typography>
            <Typography variant="body2">{row.status} · {row.severity}</Typography>
            <Typography variant="body2">{row.description}</Typography>
          </Paper>
        ))}
        {exceptions.length === 0 && <Typography color="text.secondary">No control exceptions loaded. Run integrity to detect.</Typography>}
      </Paper>

      <Alert severity="info">
        {dashboard?.revenueControl?.note} CompanyAccount.agencyShare versus GL 4001 remains a controlled difference. Historical values are not rewritten.
      </Alert>
    </Box>
  );
};

export default FinancialControlsPage;
