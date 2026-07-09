import React from 'react';
import { Box } from '@mui/material';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { INDIVIDUAL_THEME } from '../theme';

export function BarChartPanel({ data, bars, xKey = 'month' }: { data: any[]; bars: Array<[string, string]>; xKey?: string }) {
  return (
    <Box sx={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {bars.map(([key, color]) => <Bar key={key} dataKey={key} fill={color} radius={[4, 4, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

export function LineChartPanel({ data, lines }: { data: any[]; lines: Array<[string, string]> }) {
  return (
    <Box sx={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {lines.map(([key, color]) => <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export const CHART_COLORS = {
  income: INDIVIDUAL_THEME.success,
  expenses: INDIVIDUAL_THEME.danger,
  profit: INDIVIDUAL_THEME.primary,
  occupancy: INDIVIDUAL_THEME.primaryLight,
  collection: INDIVIDUAL_THEME.warning
};
