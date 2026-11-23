import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DashCard, EmptyChart } from './card';
import { CashPoint, axisMoney, dashboardMoney } from './presentDashboard';

const INCOME = '#1F9D57';

export function CashFlowChart({ points, currency, periodLabel, emptyMessage }: {
  points: CashPoint[];
  currency: string;
  periodLabel: string;
  emptyMessage?: string;
}) {
  return (
    <DashCard title="Cash flow" aside={periodLabel}>
      {points.length >= 2 ? (
        <BoxChart points={points} currency={currency} />
      ) : (
        <EmptyChart message={emptyMessage || 'Not enough history to chart cash flow yet.'} />
      )}
    </DashCard>
  );
}

function BoxChart({ points, currency }: { points: CashPoint[]; currency: string }) {
  const last = points.length - 1;
  return (
    <div style={{ height: 300, minWidth: 0 }} role="img" aria-label="Cash flow">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INCOME} stopOpacity={0.28} />
              <stop offset="100%" stopColor={INCOME} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#EEF2EF" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8A938E' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 12, fill: '#8A938E' }} axisLine={false} tickLine={false} width={64} tickFormatter={(value) => axisMoney(Number(value), currency)} />
          <Tooltip formatter={(value) => [dashboardMoney(Number(value || 0), currency), 'Cash flow']} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={INCOME}
            strokeWidth={2.5}
            fill="url(#cashFill)"
            dot={(props) => {
              const { cx, cy, index } = props;
              if (cx == null || cy == null) return <g key={index} />;
              const highlighted = index === last;
              const label = dashboardMoney(Number(points[last]?.value || 0), currency).replace(/\.00$/, '');
              return (
                <g key={index}>
                  <circle cx={cx} cy={cy} r={highlighted ? 5 : 3.5} fill={INCOME} stroke="#fff" strokeWidth={highlighted ? 2 : 0} />
                  {highlighted ? (
                    <g>
                      <rect x={cx - Math.max(34, label.length * 3.6)} y={cy - 28} width={Math.max(68, label.length * 7.2)} height="20" rx="10" fill={INCOME} />
                      <text x={cx} y={cy - 14} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">
                        {label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
