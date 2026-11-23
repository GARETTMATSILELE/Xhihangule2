import React from 'react';
import { Box } from '@mui/material';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DashCard, EmptyChart } from './card';
import { PeriodBar, axisMoney, barsHaveActivity, dashboardMoney } from './presentDashboard';

const INCOME = '#1F9D57';
const EXPENSE = '#F08B84';

export function IncomeExpensesChart({ bars, currency, periodLabel }: { bars: PeriodBar[]; currency: string; periodLabel: string }) {
  const active = barsHaveActivity(bars);
  return (
    <DashCard title="Income & expenses" aside={periodLabel}>
      {active ? (
        <Box sx={{ height: { xs: 240, md: 300 }, minWidth: 0 }} role="img" aria-label="Income and expenses">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} barGap={10} barCategoryGap="42%" margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#EEF2EF" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8A938E' }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 12, fill: '#8A938E' }} axisLine={false} tickLine={false} width={64} tickFormatter={(value) => axisMoney(Number(value), currency)} />
              <Tooltip
                cursor={{ fill: 'rgba(8,71,52,0.04)' }}
                formatter={(value, name) => [dashboardMoney(Number(value || 0), currency), name === 'income' ? 'Income' : 'Expenses']}
              />
              <Legend iconType="square" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
              <Bar dataKey="income" name="Income" fill={INCOME} radius={[8, 8, 0, 0]} maxBarSize={52}>
                <LabelList dataKey="income" position="top" formatter={(value: number) => dashboardMoney(Number(value), currency)} style={{ fill: '#1B2420', fontSize: 12, fontWeight: 700 }} />
              </Bar>
              <Bar dataKey="expenses" name="Expenses" fill={EXPENSE} radius={[8, 8, 0, 0]} maxBarSize={52}>
                <LabelList dataKey="expenses" position="top" formatter={(value: number) => dashboardMoney(Number(value), currency)} style={{ fill: '#1B2420', fontSize: 12, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      ) : (
        <EmptyChart message="No income or expenses in this period." />
      )}
    </DashCard>
  );
}
