import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { AttachMoney, TrendingDown, TrendingUp } from '@mui/icons-material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { workspacePath } from '../../../demo/demoMode';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { propertyHealthScore } from '../utils/healthScore';
import { BarChartPanel, CHART_COLORS } from '../components/Charts';
import { CenteredLoader, HealthScoreBadge, StatCard } from '../components/shared';
import { PropertyTaxProfileForm } from '../components/PropertyTaxProfileForm';
import { money, formatDate } from '../utils/formatters';
import { INDIVIDUAL_THEME } from '../theme';
import {
  getActiveLeaseForProperty,
  getLatestExpiredLeaseForProperty,
  getPropertyOccupancyDisplayStatus,
  occupancyChipProps
} from '../utils/propertyOccupancy';
import { getLeaseLifecycleStatus } from '../../../utils/leaseLifecycle';
import { leaseStatusLabels } from '../../../utils/leaseLifecycle';
import usePortfolioContext from '../hooks/usePortfolioContext';

const TABS = ['Overview', 'Transactions', 'Income', 'Expenses', 'Bills', 'Maintenance', 'Inspections', 'Files', 'Performance', 'Tax', 'Reports'];

export function PropertyDetailPage() {
  const { propertyId = '' } = useParams<{ propertyId: string }>();
  const { enrichedProperties, maintenance, leases } = usePortfolioContext();
  const [ledger, setLedger] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    individualWorkspaceService.getLedger(propertyId).then(setLedger).finally(() => setLoading(false));
  }, [propertyId]);

  const propertyMeta = enrichedProperties.find((p) => p.propertyId === propertyId);

  const propertyLeases = useMemo(
    () => leases.filter((lease) => String(lease?.propertyId?._id || lease?.propertyId || '') === propertyId),
    [leases, propertyId]
  );

  const displayLease = propertyMeta?.displayLease
    || getActiveLeaseForProperty(propertyLeases)
    || getLatestExpiredLeaseForProperty(propertyLeases);

  const occupancyStatus = propertyMeta?.occupancyDisplayStatus
    || getPropertyOccupancyDisplayStatus(propertyLeases);

  const occupancyChip = occupancyChipProps(occupancyStatus);
  const propertyMaintenance = maintenance.filter((m) => String(m.propertyId?._id || m.propertyId) === propertyId);

  const tenantName = displayLease?.tenantId?.firstName
    ? `${displayLease.tenantId.firstName} ${displayLease.tenantId.lastName || ''}`.trim()
    : displayLease?.tenantId?.name
      || displayLease?.tenantName
      || '—';

  const leasePeriod = displayLease?.startDate && displayLease?.endDate
    ? `${formatDate(displayLease.startDate)} – ${formatDate(displayLease.endDate)}`
    : displayLease?.startDate
      ? `From ${formatDate(displayLease.startDate)}`
      : displayLease?.endDate
        ? `Until ${formatDate(displayLease.endDate)}`
        : '—';

  const leaseStatusLabel = displayLease
    ? occupancyStatus === 'Statutory Tenant'
      ? 'Statutory Tenant'
      : leaseStatusLabels[getLeaseLifecycleStatus(displayLease)] || displayLease.status || '—'
    : 'No lease';

  const leaseEndDate = propertyMeta?.leaseEndDate || displayLease?.endDate;

  if (loading) return <CenteredLoader />;
  if (!ledger) return <Alert severity="error">Property not found</Alert>;

  const account = ledger.account || {};
  const property = ledger.property || {};
  const transactions = Array.isArray(account.transactions) ? account.transactions : [];
  const income = Number(account.totalIncome || 0);
  const expenses = Number(account.totalExpenses || 0);
  const runningBalance = Number(account.runningBalance || 0);
  const netProfit = income - expenses;
  const healthScore = propertyMeta?.healthScore ?? propertyHealthScore(propertyMeta || { propertyId, propertyName: property.name, occupancyStatus: 'Vacant', monthlyRent: 0, expectedRent: 0, collectedRent: 0, outstandingRent: 0, rentCollectionStatus: 'green', monthlyIncome: income, monthlyExpenses: expenses, netProfit, annualProfit: 0, runningBalance, occupancyPercent: 0, collectionPercent: 0, profitabilityPercent: 0, expenseRatio: 0, maintenanceDue: false });

  const filteredTx = transactions.filter((tx: any) => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (filterMonth) {
      const d = new Date(tx.date || tx.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key !== filterMonth) return false;
    }
    return true;
  });

  const billTx = transactions.filter((tx: any) => ['Municipal', 'Levies', 'Insurance', 'Utilities'].includes(String(tx.category)));
  const signedAmount = (tx: any) => {
    const amount = Number(tx.amount || 0);
    if (tx.type === 'income') return amount;
    if (tx.type === 'opening_balance') return tx.direction === 'debit' ? -amount : amount;
    return -amount;
  };

  const renderTransactionTable = (rows: any[]) => (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Description</TableCell>
            <TableCell>Reference</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell align="right">Running Balance</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((tx: any, index: number) => {
            const value = signedAmount(tx);
            return (
              <TableRow key={tx._id || index}>
                <TableCell>{tx.date ? new Date(tx.date).toLocaleDateString() : '-'}</TableCell>
                <TableCell>{String(tx.type || '').replace(/_/g, ' ')}</TableCell>
                <TableCell>{tx.description || tx.category || '-'}</TableCell>
                <TableCell>{tx.referenceNumber || '-'}</TableCell>
                <TableCell align="right" sx={{ color: value >= 0 ? 'success.main' : 'error.main', fontWeight: 700 }}>
                  {value >= 0 ? '+' : '-'}{money(Math.abs(value))}
                </TableCell>
                <TableCell align="right">{money(tx.runningBalance)}</TableCell>
              </TableRow>
            );
          })}
          {!rows.length && <TableRow><TableCell colSpan={6}><Typography color="text.secondary" align="center">No transactions</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const incomeTx = filteredTx.filter((tx: any) => tx.type === 'income');
  const expenseTx = filteredTx.filter((tx: any) => tx.type !== 'income' && tx.type !== 'opening_balance');

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>{property.name || account.propertyName}</Typography>
          <Typography color="text.secondary">{property.address || account.propertyAddress}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
            <HealthScoreBadge score={healthScore} size="medium" />
            <Chip size="small" label={occupancyStatus} color={occupancyChip.color} sx={occupancyChip.sx} />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => window.open(individualWorkspaceService.getReportUrl('property-performance', 'pdf'), '_blank')}>Export PDF</Button>
          <Button variant="contained" component={RouterLink} to={workspacePath(`/individual-dashboard/rent-collection?propertyId=${propertyId}`)} sx={{ bgcolor: INDIVIDUAL_THEME.primary }}>Record Rent</Button>
        </Stack>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={6} md={3}><StatCard title="Income" value={money(income)} icon={<TrendingUp />} /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Expenses" value={money(expenses)} icon={<TrendingDown />} /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Profit" value={money(netProfit)} icon={<AttachMoney />} /></Grid>
        <Grid item xs={6} md={3}><StatCard title="Running Balance" value={money(runningBalance)} icon={<AttachMoney />} /></Grid>
      </Grid>

      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="scrollable" scrollButtons="auto">
          {TABS.map((tab) => <Tab key={tab} label={tab} />)}
        </Tabs>
        <Divider />
        <CardContent>
          {tabValue === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Property Overview</Typography>
                <Stack spacing={1.5}>
                  {[
                    ['Property', property.name],
                    ['Occupancy Status', occupancyStatus],
                    ['Tenant', tenantName],
                    ['Lease Period', leasePeriod],
                    ['Lease Status', leaseStatusLabel],
                    ['Lease Expiry', leaseEndDate ? formatDate(leaseEndDate) : '—'],
                    ['Monthly Rent', money(property.rent || propertyMeta?.monthlyRent || 0)],
                    ['Outstanding Rent', money(propertyMeta?.outstandingRent || 0)],
                    ['Outstanding Bills', money(propertyMeta?.outstandingBills || 0)],
                    ['Maintenance', propertyMaintenance.length ? `${propertyMaintenance.length} request(s)` : 'None open']
                  ].map(([label, val]) => (
                    <Box key={String(label)} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography color="text.secondary">{label}</Typography>
                      <Typography fontWeight={600}>{val}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Performance</Typography>
                <BarChartPanel data={[{ label: 'Income', amount: income }, { label: 'Expenses', amount: expenses }, { label: 'Profit', amount: netProfit }]} xKey="label" bars={[['amount', CHART_COLORS.profit]]} />
              </Grid>
            </Grid>
          )}
          {tabValue === 1 && (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField select label="Month" size="small" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} sx={{ minWidth: 160 }}>
                  <MenuItem value="">All months</MenuItem>
                  {Array.from(new Set<string>(transactions.map((tx: any) => {
                    const d = new Date(tx.date || tx.createdAt);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  }))).map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </TextField>
                <TextField select label="Type" size="small" value={filterType} onChange={(e) => setFilterType(e.target.value)} sx={{ minWidth: 160 }}>
                  <MenuItem value="all">All types</MenuItem>
                  {['income', 'expense', 'maintenance', 'levy', 'deposit'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </TextField>
                <Button variant="outlined" onClick={() => window.open(individualWorkspaceService.getReportUrl('property-performance', 'excel'), '_blank')}>Export Excel</Button>
              </Stack>
              {renderTransactionTable(filteredTx)}
            </Stack>
          )}
          {tabValue === 2 && renderTransactionTable(incomeTx)}
          {tabValue === 3 && renderTransactionTable(expenseTx)}
          {tabValue === 4 && renderTransactionTable(billTx)}
          {tabValue === 5 && (
            <Stack spacing={1}>
              {propertyMaintenance.map((m) => (
                <Box key={m._id} sx={{ p: 2, border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
                  <Typography fontWeight={600}>{m.title || 'Maintenance'}</Typography>
                  <Typography variant="body2" color="text.secondary">{m.status} | {m.category || 'General'}</Typography>
                </Box>
              ))}
              {!propertyMaintenance.length && <Typography color="text.secondary">No maintenance records</Typography>}
            </Stack>
          )}
          {tabValue === 6 && (
            <Button component={RouterLink} to={workspacePath('/individual-dashboard/inspections')} variant="outlined">View Inspections Module</Button>
          )}
          {tabValue === 7 && (
            <Button component={RouterLink} to={workspacePath(`/individual-dashboard/files?propertyId=${propertyId}`)} variant="outlined">View Property Files</Button>
          )}
          {tabValue === 8 && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}><StatCard title="Health Score" value={`${healthScore}%`} icon={<AttachMoney />} /></Grid>
              <Grid item xs={12} md={4}><StatCard title="Collection" value={`${propertyMeta?.collectionPercent || 0}%`} icon={<AttachMoney />} /></Grid>
              <Grid item xs={12} md={4}><StatCard title="Expense Ratio" value={`${propertyMeta?.expenseRatio || 0}%`} icon={<TrendingDown />} /></Grid>
            </Grid>
          )}
          {tabValue === 9 && (
            <PropertyTaxProfileForm propertyId={propertyId} />
          )}
          {tabValue === 10 && (
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button variant="outlined" onClick={() => window.open(individualWorkspaceService.getReportUrl('property-performance', 'pdf'), '_blank')}>Property Performance PDF</Button>
              <Button variant="outlined" onClick={() => window.open(individualWorkspaceService.getReportUrl('rent-collection', 'csv'), '_blank')}>Rent Collection CSV</Button>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

export default PropertyDetailPage;
