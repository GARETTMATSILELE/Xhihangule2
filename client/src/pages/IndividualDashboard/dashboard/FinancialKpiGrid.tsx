import React from 'react';
import { Box, Typography } from '@mui/material';
import { AccountBalanceWalletOutlined, HomeOutlined, PaymentsOutlined, TrendingDown } from '@mui/icons-material';
import { MoneyRow, TrendDirection, dashboardMoney } from './presentDashboard';
import { dashCardSx } from './card';

const INCOME = '#1F9D57';
const EXPENSE = '#E36B64';

function TrendMark({ direction, color }: { direction: TrendDirection; color: string }) {
  const start = direction === 'down' ? 6 : direction === 'up' ? 16 : 11;
  const end = direction === 'down' ? 16 : direction === 'up' ? 6 : 11;
  return (
    <svg width="56" height="22" viewBox="0 0 56 22" aria-hidden="true">
      <path d={`M2 ${start} C 14 ${start}, 18 ${end}, 28 ${(start + end) / 2} S 42 ${end}, 54 ${end}`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Figure({ rows }: { rows: MoneyRow[] }) {
  return (
    <Box>
      {rows.map((row) => (
        <Typography key={`${row.currency}-${row.amount}`} sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: '#1B2420', lineHeight: 1.15, '@media (min-width:1280px)': { fontSize: 26 } }}>
          {dashboardMoney(row.amount, row.currency)}
        </Typography>
      ))}
    </Box>
  );
}

function KpiCard({
  label,
  icon,
  iconBg,
  iconColor,
  rows,
  trend,
  trendColor,
  subtitle
}: {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  rows?: MoneyRow[];
  trend?: TrendDirection | null;
  trendColor?: string;
  subtitle?: string;
  value?: string;
}) {
  const [headline, caption] = (subtitle || '').split('\n');
  return (
    <Box sx={{ ...dashCardSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ width: 44, height: 44, borderRadius: '14px', bgcolor: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ color: '#6E7872', fontSize: 14, fontWeight: 500, lineHeight: 1.2 }}>{label}</Typography>
        {rows ? <Figure rows={rows} /> : null}
        {headline ? <Typography sx={{ color: '#1B2420', fontSize: { xs: 24, sm: 28 }, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 }}>{headline}</Typography> : null}
        {caption ? <Typography sx={{ color: '#8A938E', fontSize: 13, mt: 0.25 }}>{caption}</Typography> : null}
      </Box>
      {trend && trendColor ? <TrendMark direction={trend} color={trendColor} /> : null}
    </Box>
  );
}

export function FinancialKpiGrid({
  income,
  expenses,
  net,
  incomeTrend,
  expenseTrend,
  netTrend,
  occupancyPercent,
  occupancyCaption
}: {
  income: MoneyRow[];
  expenses: MoneyRow[];
  net: MoneyRow[];
  incomeTrend: TrendDirection | null;
  expenseTrend: TrendDirection | null;
  netTrend: TrendDirection | null;
  occupancyPercent: number;
  occupancyCaption: string;
}) {
  return (
    <Box sx={{
      display: 'grid',
      gap: 2.5,
      gridTemplateColumns: 'minmax(0, 1fr)',
      '@media (min-width:480px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
      '@media (min-width:1280px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }
    }}>
      <KpiCard label="Monthly income" icon={<PaymentsOutlined />} iconBg="#E7F6EE" iconColor={INCOME} rows={income} trend={incomeTrend} trendColor={incomeTrend === 'down' ? EXPENSE : INCOME} />
      <KpiCard label="Expenses" icon={<TrendingDown />} iconBg="#FDECEC" iconColor={EXPENSE} rows={expenses} trend={expenseTrend} trendColor={expenseTrend === 'down' ? INCOME : EXPENSE} />
      <KpiCard label="Net operating income" icon={<AccountBalanceWalletOutlined />} iconBg="#E7F6EE" iconColor={INCOME} rows={net} trend={netTrend} trendColor={netTrend === 'down' ? EXPENSE : INCOME} />
      <KpiCard label="Occupancy" icon={<HomeOutlined />} iconBg="#E7F6EE" iconColor={INCOME} subtitle={`${occupancyPercent}%\n${occupancyCaption}`} />
    </Box>
  );
}
