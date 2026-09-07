import React from 'react';
import { Alert, Box, Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import {
  AttachMoney,
  Build,
  HomeWork,
  People,
  Receipt,
  TrendingDown,
  TrendingUp
} from '@mui/icons-material';
import { useAuth } from '../../../contexts/AuthContext';
import { ActionCenter } from '../components/ActionCenter';
import { BarChartPanel, CHART_COLORS, LineChartPanel } from '../components/Charts';
import { OwnerBrief } from '../components/OwnerBrief';
import { CenteredLoader, HealthScoreBadge, StatCard } from '../components/shared';
import usePortfolioContext from '../hooks/usePortfolioContext';
import { INDIVIDUAL_THEME } from '../theme';
import { money, percent } from '../utils/formatters';

export function DashboardPage() {
  const { user } = useAuth();
  const {
    data,
    loading,
    error,
    portfolioScore,
    enrichedProperties,
    actionItems,
    ownerBriefChecks,
    outstandingBillsTotal,
    maintenanceOpen,
    occupancyCounts,
    upcomingLeaseRenewals
  } = usePortfolioContext();

  if (loading) return <CenteredLoader />;
  if (error || !data) return <Alert severity="error">{error || 'Dashboard unavailable'}</Alert>;

  const incomeVsExpenses = data.charts.incomeTrend?.map((row: any) => ({
    month: row.month,
    income: row.amount,
    expenses: data.charts.expenseTrend?.find((e: any) => e.month === row.month)?.amount || 0,
    profit: row.amount - (data.charts.expenseTrend?.find((e: any) => e.month === row.month)?.amount || 0)
  })) || [];

  const cashflowTrend = incomeVsExpenses.map((r) => ({ month: r.month, cashflow: r.profit }));
  const occupancyData = data.charts.occupancyRate || [];
  const collectionData = data.charts.rentCollectionTrend || [];
  const topProperties = [...enrichedProperties].sort((a, b) => b.netProfit - a.netProfit).slice(0, 5);

  return (
    <Stack spacing={3}>
      <OwnerBrief
        firstName={user?.firstName}
        lastName={user?.lastName}
        portfolioScore={portfolioScore}
        checks={ownerBriefChecks}
      />

      <Grid container spacing={2}>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Total Properties" value={String(data.summary.totalProperties)} icon={<HomeWork />} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Occupied" value={String(occupancyCounts.occupied)} icon={<HomeWork />} accent={INDIVIDUAL_THEME.success} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Vacant" value={String(occupancyCounts.vacant)} icon={<HomeWork />} accent={INDIVIDUAL_THEME.warning} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Tenants" value={String(data.summary.totalTenants)} icon={<People />} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Income This Month" value={money(data.summary.monthlyIncome)} icon={<TrendingUp />} accent={INDIVIDUAL_THEME.success} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Expenses This Month" value={money(data.summary.monthlyExpenses)} icon={<TrendingDown />} accent={INDIVIDUAL_THEME.danger} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Net Profit" value={money(data.summary.netProfit)} icon={<AttachMoney />} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Outstanding Bills" value={money(outstandingBillsTotal)} icon={<Receipt />} accent={INDIVIDUAL_THEME.warning} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Lease Renewals" value={String(upcomingLeaseRenewals)} icon={<Receipt />} /></Grid>
        <Grid item xs={6} sm={4} md={3} lg={2}><StatCard title="Open Maintenance" value={String(maintenanceOpen)} icon={<Build />} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={7}><ActionCenter items={actionItems} /></Grid>
        <Grid item xs={12} lg={5}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Recent Activity</Typography>
              <Stack spacing={1.5}>
                {data.recentActivity.slice(0, 6).map((item, index) => (
                  <Box key={`${item.type}-${index}`} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, pb: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}` }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.description}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.type.replace(/_/g, ' ')}</Typography>
                    </Box>
                    {item.amount ? <Typography variant="body2" fontWeight={600}>{money(item.amount)}</Typography> : null}
                  </Box>
                ))}
                {!data.recentActivity.length && <Typography color="text.secondary">No recent activity</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>Portfolio Performance</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
            <CardContent><Typography variant="h6" gutterBottom>Monthly Income vs Expenses</Typography>
              <BarChartPanel data={incomeVsExpenses} bars={[['income', CHART_COLORS.income], ['expenses', CHART_COLORS.expenses]]} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
            <CardContent><Typography variant="h6" gutterBottom>Net Profit Trend</Typography>
              <BarChartPanel data={incomeVsExpenses} bars={[['profit', CHART_COLORS.profit]]} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
            <CardContent><Typography variant="h6" gutterBottom>Occupancy</Typography>
              <BarChartPanel data={occupancyData} xKey="propertyName" bars={[['occupancyPercent', CHART_COLORS.occupancy]]} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
            <CardContent><Typography variant="h6" gutterBottom>Rent Collection Rate</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, color: INDIVIDUAL_THEME.primary, mb: 1 }}>{percent(data.summary.rentCollectionRate)}</Typography>
              <BarChartPanel data={collectionData} xKey="propertyName" bars={[['collectionPercent', CHART_COLORS.collection]]} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
            <CardContent><Typography variant="h6" gutterBottom>Cashflow Trend</Typography>
              <LineChartPanel data={cashflowTrend} lines={[['cashflow', CHART_COLORS.profit]]} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Top Performing Properties</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Property</TableCell>
                  <TableCell align="right">Income</TableCell>
                  <TableCell align="right">Expenses</TableCell>
                  <TableCell align="right">Profit</TableCell>
                  <TableCell align="center">Health Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topProperties.map((p) => (
                  <TableRow key={p.propertyId}>
                    <TableCell>{p.propertyName}</TableCell>
                    <TableCell align="right">{money(p.monthlyIncome)}</TableCell>
                    <TableCell align="right">{money(p.monthlyExpenses)}</TableCell>
                    <TableCell align="right" sx={{ color: p.netProfit >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>{money(p.netProfit)}</TableCell>
                    <TableCell align="center"><HealthScoreBadge score={p.healthScore} size="small" /></TableCell>
                  </TableRow>
                ))}
                {!topProperties.length && (
                  <TableRow><TableCell colSpan={5}><Typography color="text.secondary" align="center">No properties yet</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default DashboardPage;
