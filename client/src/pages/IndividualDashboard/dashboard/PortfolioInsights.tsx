import React from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { BuildOutlined, DescriptionOutlined, ReceiptLongOutlined } from '@mui/icons-material';
import { DashCard } from './card';
import { dashboardMoney } from './presentDashboard';

const GREEN = '#1F9D57';
const CORAL = '#E36B64';

function Ring({ rate }: { rate: number }) {
  const visual = Math.max(0, Math.min(100, rate));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (visual / 100) * circumference;
  return (
    <svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label={`Rent collection ${rate}%`}>
      <circle cx="74" cy="74" r={radius} fill="none" stroke="#E7F6EE" strokeWidth="12" />
      <circle
        cx="74"
        cy="74"
        r={radius}
        fill="none"
        stroke={GREEN}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform="rotate(-90 74 74)"
      />
      <text x="74" y="80" textAnchor="middle" fontSize="22" fontWeight="700" fill={GREEN}>{`${rate}%`}</text>
    </svg>
  );
}

export function PortfolioInsights({
  collectionRate,
  collectionNote,
  showCollectionRate,
  occupancyPercent,
  occupancyCaption,
  healthLabel,
  rentOverdue,
  rentOverdueReliable,
  billsLabel,
  billsWarn,
  maintenanceOpen
}: {
  collectionRate: number;
  collectionNote: string;
  showCollectionRate: boolean;
  occupancyPercent: number;
  occupancyCaption: string;
  healthLabel: string;
  rentOverdue: number;
  rentOverdueReliable: boolean;
  billsLabel: string;
  billsWarn: boolean;
  maintenanceOpen: number;
}) {
  const healthTone = healthLabel === 'Critical'
    ? { bg: '#FDECEC', color: CORAL }
    : healthLabel === 'Needs Attention'
      ? { bg: '#FFF4E5', color: '#C2610C' }
      : { bg: '#E7F6EE', color: '#157A45' };
  return (
    <Box sx={{
      display: 'grid',
      gap: 2.5,
      gridTemplateColumns: 'minmax(0, 1fr)',
      '@media (min-width:768px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
      '@media (min-width:1280px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }
    }}>
      <DashCard title="Rent collection">
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
          {showCollectionRate ? <Ring rate={collectionRate} /> : null}
          <Box sx={{ minWidth: 0 }}>
            {showCollectionRate ? (
              <Typography sx={{ fontSize: { xs: 36, sm: 40 }, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: '#1B2420' }}>{collectionRate}%</Typography>
            ) : null}
            <Typography sx={{ mt: 1, color: '#8A938E', fontSize: 14, maxWidth: 220 }}>{collectionNote}</Typography>
          </Box>
        </Stack>
      </DashCard>
      <DashCard title="Portfolio occupancy">
        <Typography sx={{ fontSize: { xs: 36, sm: 42 }, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: '#1B2420' }}>{occupancyPercent}%</Typography>
        <Typography sx={{ mt: 1, mb: 2, color: '#8A938E', fontSize: 14 }}>{occupancyCaption}</Typography>
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, occupancyPercent))}
          aria-label="Portfolio occupancy"
          sx={{ height: 10, borderRadius: 99, bgcolor: '#E7F6EE', '& .MuiLinearProgress-bar': { bgcolor: GREEN, borderRadius: 99 } }}
        />
      </DashCard>
      <Box sx={{ height: '100%', '@media (min-width:768px) and (max-width:1279px)': { gridColumn: '1 / -1' } }}>
        <DashCard
          title="Portfolio health"
          aside={(
            <Box sx={{ px: 1.25, py: 0.4, borderRadius: '999px', bgcolor: healthTone.bg, color: healthTone.color, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: healthTone.color }} />
              {healthLabel}
            </Box>
          )}
        >
          <HealthRow icon={<ReceiptLongOutlined />} label="Rent overdue" value={rentOverdueReliable ? dashboardMoney(rentOverdue) : 'Separate currencies'} warn={rentOverdueReliable && rentOverdue > 0} />
          <HealthRow icon={<DescriptionOutlined />} label="Bills outstanding" value={billsLabel} warn={billsWarn} />
          <HealthRow icon={<BuildOutlined />} label="Open maintenance" value={String(maintenanceOpen)} warn={maintenanceOpen > 0} />
        </DashCard>
      </Box>
    </Box>
  );
}

function HealthRow({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn: boolean }) {
  const color = warn ? CORAL : GREEN;
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1.15 }}>
      <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: warn ? '#FDECEC' : '#E7F6EE', color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </Box>
      <Typography sx={{ flex: 1, color: '#1B2420', fontSize: 14 }}>{label}</Typography>
      <Typography sx={{ fontWeight: 700, color: warn ? CORAL : '#1B2420', fontSize: 14 }}>{value}</Typography>
    </Stack>
  );
}
