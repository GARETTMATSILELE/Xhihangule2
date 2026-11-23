import React from 'react';
import { Box, Typography } from '@mui/material';
import { BuildOutlined, CallMade, CallReceived, DescriptionOutlined } from '@mui/icons-material';
import { DashCard } from './card';
import { ActivityTone, activityDate, activityView, dashboardMoney } from './presentDashboard';

const TONE = {
  positive: { bg: '#E7F6EE', color: '#1F9D57' },
  negative: { bg: '#FDECEC', color: '#E36B64' },
  neutral: { bg: '#F3F5F4', color: '#5C6B66' }
};

function ActivityIcon({ tone, type }: { tone: ActivityTone; type: string }) {
  const palette = TONE[tone];
  const key = type.toLowerCase();
  const icon = key.includes('maintenance')
    ? <BuildOutlined sx={{ fontSize: 18 }} />
    : key.includes('lease')
      ? <DescriptionOutlined sx={{ fontSize: 18 }} />
      : tone === 'negative'
        ? <CallMade sx={{ fontSize: 18 }} />
        : <CallReceived sx={{ fontSize: 18 }} />;
  return (
    <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: palette.bg, color: palette.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </Box>
  );
}

export function RecentActivityList({ items }: {
  items: Array<{ type: string; date?: string; description?: string; amount?: number; propertyName?: string; currency?: string }>;
}) {
  return (
    <DashCard title="Recent activity">
      <Box>
        {items.map((item, index) => {
          const view = activityView(item.type);
          const propertyName = item.propertyName && item.description?.includes(item.propertyName) ? '' : item.propertyName;
          const detail = [item.description, propertyName].filter((part, partIndex, all) => part && all.indexOf(part) === partIndex).join(' · ');
          const showAmount = Number(item.amount || 0) !== 0;
          return (
            <Box
              key={`${item.type}-${item.date}-${index}`}
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'stretch', sm: 'center' },
                gap: 1.5,
                py: 1.5,
                minHeight: 64
              }}
            >
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minWidth: 0, flex: 1 }}>
                <ActivityIcon tone={view.tone} type={item.type} />
                <Typography sx={{ minWidth: 0, fontSize: 15, color: '#1B2420' }}>
                  <Box component="span" sx={{ fontWeight: 650 }}>{view.title}</Box>
                  {detail ? <Box component="span" sx={{ color: '#8A938E' }}>{` · ${detail}`}</Box> : null}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pl: { xs: 6.5, sm: 0 }, flexShrink: 0 }}>
                {showAmount ? (
                  <Typography sx={{ fontWeight: 700, color: view.tone === 'negative' ? '#E36B64' : '#1F9D57', fontSize: 15 }}>
                    {dashboardMoney(Math.abs(Number(item.amount || 0)), item.currency || 'USD')}
                  </Typography>
                ) : <Box />}
                <Typography sx={{ color: '#8A938E', fontSize: 13, minWidth: 56, textAlign: 'right' }}>{activityDate(item.date)}</Typography>
              </Box>
            </Box>
          );
        })}
        {!items.length && <Typography sx={{ color: '#8A938E', py: 2 }}>No recent activity</Typography>}
      </Box>
    </DashCard>
  );
}
