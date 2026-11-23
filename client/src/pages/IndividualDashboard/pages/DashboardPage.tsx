import React, { useMemo } from 'react';
import { Alert, Box, Stack } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import usePortfolioContext from '../hooks/usePortfolioContext';
import { healthScoreLabel } from '../theme';
import { CenteredLoader } from '../components/shared';
import { dashboardFontSx } from '../dashboard/card';
import { CashFlowChart } from '../dashboard/CashFlowChart';
import { DashboardHeader } from '../dashboard/DashboardHeader';
import { FinancialKpiGrid } from '../dashboard/FinancialKpiGrid';
import { IncomeExpensesChart } from '../dashboard/IncomeExpensesChart';
import { PortfolioInsights } from '../dashboard/PortfolioInsights';
import { RecentActivityList } from '../dashboard/RecentActivityList';
import {
  cashflowSeries,
  collectionNote,
  currenciesAreSplit,
  dashboardMoney,
  expectedRentTotal,
  expenseRows,
  incomeExpenseBars,
  incomeRows,
  netRows,
  reportingCurrency,
  selectedPeriodLabel,
  trendDirection
} from '../dashboard/presentDashboard';

export function DashboardPage() {
  const {
    data,
    loading,
    error,
    portfolioScore,
    occupancyCounts,
    actionItems,
    outstandingBillsTotal,
    maintenanceOpen,
    bills
  } = usePortfolioContext();
  const [params] = useSearchParams();
  const periodLabel = selectedPeriodLabel(params.get('period'), data?.period?.label);

  const model = useMemo(() => {
    if (!data) return null;
    const split = currenciesAreSplit(data);
    const currency = reportingCurrency(data);
    const total = data.summary.totalProperties || 0;
    const occupied = occupancyCounts.occupied;
    const occupancyPercent = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const occupancyCaption = `${occupied} of ${total} properties occupied`;
    const expected = expectedRentTotal(data);
    const reliable = data.outstandingRentReliable !== false;
    const billCurrencies = new Map<string, number>();
    bills.forEach((bill) => {
      const status = String(bill.obligationStatus || bill.status || 'completed').toLowerCase();
      const outstanding = bill.obligationStatus ? bill.obligationStatus === 'UNSETTLED' : status !== 'paid' && status !== 'completed';
      if (!outstanding) return;
      const code = String(bill.currency || currency);
      billCurrencies.set(code, (billCurrencies.get(code) || 0) + Number(bill.amount || 0));
    });
    const billParts = Array.from(billCurrencies.entries());
    const billsLabel = billParts.length > 1
      ? billParts.map(([code, amount]) => `${code} ${amount.toFixed(2)}`).join(' · ')
      : undefined;
    return {
      split,
      currency,
      occupancyPercent,
      occupancyCaption,
      collection: data.summary.rentCollectionRate,
      note: collectionNote(data.summary.rentCollectionRate, expected, reliable),
      showRate: reliable,
      bars: incomeExpenseBars(data, periodLabel),
      cash: cashflowSeries(data),
      incomeTrend: trendDirection(data.summary.monthlyIncome, data.comparison?.monthlyIncome, !split),
      expenseTrend: trendDirection(data.summary.monthlyExpenses, data.comparison?.monthlyExpenses, !split),
      netTrend: trendDirection(data.summary.netProfit, data.comparison?.netProfit, !split),
      billsLabel,
      billsWarn: (billParts.length ? billParts.some(([, amount]) => amount > 0) : outstandingBillsTotal > 0)
    };
  }, [bills, data, occupancyCounts.occupied, outstandingBillsTotal, periodLabel]);

  if (loading && !data) return <CenteredLoader />;
  if (!data || !model) {
    return (
      <Box sx={dashboardFontSx}>
        <DashboardHeader periodLabel={periodLabel} actionItems={actionItems} />
        <Alert severity={error ? 'error' : 'info'}>{error || 'Choose a start and end date to load this period.'}</Alert>
      </Box>
    );
  }

  const propertyName = new Map((data.properties || []).map((property) => [property.propertyId, property.propertyName]));

  return (
    <Box sx={dashboardFontSx}>
      <DashboardHeader periodLabel={periodLabel} actionItems={actionItems} />
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {data.currencyNotice ? <Alert severity="info" sx={{ mb: 2 }}>{data.currencyNotice}</Alert> : null}
      <Stack spacing={2.5}>
        <FinancialKpiGrid
          income={incomeRows(data)}
          expenses={expenseRows(data)}
          net={netRows(data)}
          incomeTrend={model.incomeTrend}
          expenseTrend={model.expenseTrend}
          netTrend={model.netTrend}
          occupancyPercent={model.occupancyPercent}
          occupancyCaption={model.occupancyCaption}
        />
        <Box sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: 'minmax(0, 1fr)',
          '@media (min-width:1024px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
        }}>
          <IncomeExpensesChart bars={model.bars} currency={model.currency} periodLabel={periodLabel} />
          <CashFlowChart
            points={model.cash.points}
            currency={model.cash.currency}
            periodLabel={periodLabel}
            emptyMessage={model.cash.unavailableReason}
          />
        </Box>
        <PortfolioInsights
          collectionRate={model.collection}
          collectionNote={model.note}
          showCollectionRate={model.showRate}
          occupancyPercent={model.occupancyPercent}
          occupancyCaption={model.occupancyCaption}
          healthLabel={healthScoreLabel(portfolioScore)}
          rentOverdue={data.summary.outstandingRent}
          rentOverdueReliable={data.outstandingRentReliable !== false}
          billsLabel={model.billsLabel || dashboardMoney(outstandingBillsTotal, model.currency)}
          billsWarn={model.billsWarn}
          maintenanceOpen={maintenanceOpen}
        />
        <RecentActivityList
          items={(data.recentActivity || []).slice(0, 8).map((item) => ({
            type: item.type,
            date: item.date,
            description: item.description,
            amount: item.amount,
            currency: model.currency,
            propertyName: item.propertyId ? propertyName.get(item.propertyId) : undefined
          }))}
        />
      </Stack>
    </Box>
  );
}

export default DashboardPage;
