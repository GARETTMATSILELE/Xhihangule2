import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Build, TrendingDown } from '@mui/icons-material';
import { isDemoMode, notifyDemoBlocked } from '../../../demo/demoMode';
import { apiService } from '../../../api';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { BarChartPanel, CHART_COLORS, LineChartPanel } from '../components/Charts';
import { CenteredLoader, PageShell, StatCard } from '../components/shared';
import { INDIVIDUAL_THEME } from '../theme';
import { money } from '../utils/formatters';

export function MaintenancePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const response = await apiService.getMaintenanceRequests();
    const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
    setItems(list);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const stats = useMemo(() => {
    const open = items.filter((i) => ['open', 'pending', 'submitted', 'approved', 'in_progress'].includes(String(i.status || '').toLowerCase()));
    const inProgress = items.filter((i) => String(i.status || '').toLowerCase() === 'in_progress');
    const completed = items.filter((i) => ['closed', 'completed'].includes(String(i.status || '').toLowerCase()));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const costMonth = completed.filter((i) => i.paymentDate && new Date(i.paymentDate) >= monthStart).reduce((s, i) => s + Number(i.paidAmount || i.estimatedCost || 0), 0);
    const costYtd = completed.filter((i) => i.paymentDate && new Date(i.paymentDate) >= yearStart).reduce((s, i) => s + Number(i.paidAmount || i.estimatedCost || 0), 0);
    return { open: open.length, inProgress: inProgress.length, completed: completed.length, costMonth, costYtd };
  }, [items]);

  if (loading) return <CenteredLoader />;

  return (
    <PageShell title="Maintenance" subtitle="Track requests, approvals, contractors, and costs.">
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}><StatCard title="Open Requests" value={String(stats.open)} icon={<Build />} accent={INDIVIDUAL_THEME.warning} /></Grid>
        <Grid item xs={6} md={3}><StatCard title="In Progress" value={String(stats.inProgress)} icon={<Build />} /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Completed" value={String(stats.completed)} icon={<Build />} accent={INDIVIDUAL_THEME.success} /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Cost This Month" value={money(stats.costMonth)} icon={<TrendingDown />} /></Grid>
        <Grid item xs={12} md={3}><StatCard title="Cost YTD" value={money(stats.costYtd)} icon={<TrendingDown />} /></Grid>
      </Grid>

      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
        <CardContent>
          <Stack spacing={1.5}>
            {items.map((item) => (
              <Box key={item._id} sx={{ p: 2, border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
                  <Box>
                    <Typography fontWeight={700}>{item.title || 'Maintenance request'}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.propertyId?.name || 'Property'} | {item.priority || 'Normal'} priority | {item.category || 'General'}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Chip size="small" label={item.status} />
                      {item.contractorName && <Chip size="small" variant="outlined" label={item.contractorName} />}
                      {(item.paidAmount || item.estimatedCost) && <Chip size="small" label={money(item.paidAmount || item.estimatedCost)} />}
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={async () => {
                      if (isDemoMode()) { notifyDemoBlocked(); return; }
                      await individualWorkspaceService.approveMaintenance(item._id); await reload();
                    }}>Approve</Button>
                    <Button size="small" variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary }} onClick={async () => {
                      if (isDemoMode()) { notifyDemoBlocked(); return; }
                      await individualWorkspaceService.recordMaintenanceExpense(item._id, { amount: item.paidAmount || item.estimatedCost || item.requestedAmount || 0 });
                      await reload();
                    }}>Convert To Expense</Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
            {!items.length && <Alert severity="info">No maintenance requests yet. Create one from your property workflow.</Alert>}
          </Stack>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function AccountingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({ propertyId: '', amount: 0, date: new Date().toISOString().slice(0, 10), rentalDepositId: '', notes: '' });
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    individualWorkspaceService.getAccounting()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CenteredLoader />;
  if (!data) return <Alert severity="error">Accounting unavailable</Alert>;

  const cashflow = (data.charts.incomeTrend || []).map((row: any) => ({
    month: row.month,
    income: row.amount,
    expenses: data.charts.expenseTrend?.find((e: any) => e.month === row.month)?.amount || 0,
    cashflow: row.amount - (data.charts.expenseTrend?.find((e: any) => e.month === row.month)?.amount || 0)
  }));

  const expenseBreakdown = (data.charts.expenseTrend || []).slice(-6);
  const recentTx = (data.recentActivity || []).slice(0, 8);

  return (
    <PageShell title="Accounting" subtitle={`Landlord accounting — ${data.period?.label || data.overview?.periodLabel || 'selected period'}.`}>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="outlined" onClick={() => setApplyOpen(true)}>Apply deposit to rent</Button>
      </Stack>
      {applyError && <Alert severity="error" sx={{ mb: 2 }}>{applyError}</Alert>}
      <Grid container spacing={2}>
        <Grid item xs={6} md={4} lg={2}><StatCard title={`Income — ${data.period?.label || 'period'}`} value={money(data.overview.incomeThisMonth)} /></Grid>
        <Grid item xs={6} md={4} lg={2}><StatCard title={`Expenses — ${data.period?.label || 'period'}`} value={money(data.overview.expensesThisMonth)} /></Grid>
        <Grid item xs={6} md={4} lg={2}><StatCard title="Period result" value={money(data.overview.netProfit)} /></Grid>
        <Grid item xs={6} md={4} lg={2}><StatCard title="Year to date" value={money(data.overview.yearToDateProfit || 0)} /></Grid>
        <Grid item xs={6} md={4} lg={2}><StatCard title="Outstanding Rent" value={money(data.overview.outstandingRent)} /></Grid>
        <Grid item xs={6} md={4} lg={2}><StatCard title="Cash Balance" value={money(data.summary?.netMonthlyCashflow || 0)} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
            <CardContent><Typography variant="h6" gutterBottom>Cashflow Trend</Typography>
              <LineChartPanel data={cashflow} lines={[['income', CHART_COLORS.income], ['expenses', CHART_COLORS.expenses], ['cashflow', CHART_COLORS.profit]]} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, height: '100%' }}>
            <CardContent><Typography variant="h6" gutterBottom>Income Breakdown</Typography>
              <BarChartPanel data={data.charts.incomeTrend?.slice(-6) || []} bars={[['amount', CHART_COLORS.income]]} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
            <CardContent><Typography variant="h6" gutterBottom>Expense Breakdown</Typography>
              <BarChartPanel data={expenseBreakdown} bars={[['amount', CHART_COLORS.expenses]]} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
            <CardContent><Typography variant="h6" gutterBottom>Property Profitability</Typography>
              <BarChartPanel data={data.charts.propertyProfitability || []} xKey="propertyName" bars={[['netProfit', CHART_COLORS.profit]]} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Recent Transactions</Typography>
          <Stack spacing={1}>
            {recentTx.map((tx: any, i: number) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">{tx.description}</Typography>
                <Typography variant="body2" fontWeight={600}>{tx.amount ? money(tx.amount) : ''}</Typography>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
      <Dialog open={applyOpen} onClose={() => setApplyOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Apply deposit to rent</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">Creates a new rental-income transaction. The original deposit receipt is not changed.</Alert>
            <TextField label="Property ID" value={applyForm.propertyId} onChange={(e) => setApplyForm({ ...applyForm, propertyId: e.target.value })} required />
            <TextField label="Amount" type="number" value={applyForm.amount} onChange={(e) => setApplyForm({ ...applyForm, amount: Number(e.target.value) })} required />
            <TextField label="Date" type="date" value={applyForm.date} onChange={(e) => setApplyForm({ ...applyForm, date: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="Original deposit ID" value={applyForm.rentalDepositId} onChange={(e) => setApplyForm({ ...applyForm, rentalDepositId: e.target.value })} required helperText="Required. The original deposit receipt is not changed." />
            <TextField label="Notes" value={applyForm.notes} onChange={(e) => setApplyForm({ ...applyForm, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApplyOpen(false)}>Cancel</Button>
          <Button onClick={async () => {
            try {
              setApplyError(null);
              if (isDemoMode()) { notifyDemoBlocked(); return; }
              if (!applyForm.rentalDepositId.trim()) {
                setApplyError('rentalDepositId is required to apply a deposit to rent');
                return;
              }
              await individualWorkspaceService.applyDepositToRent({
                propertyId: applyForm.propertyId,
                amount: applyForm.amount,
                date: applyForm.date,
                rentalDepositId: applyForm.rentalDepositId,
                notes: applyForm.notes
              });
              setApplyOpen(false);
            } catch (err: any) {
              setApplyError(err?.message || 'Unable to apply deposit');
            }
          }}>Post application</Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}

export default MaintenancePage;
