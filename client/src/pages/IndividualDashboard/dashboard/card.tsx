import React from 'react';
import { Box, Typography } from '@mui/material';
import { DASHBOARD_FONT } from '../dashboard/presentDashboard';
import { INDIVIDUAL_THEME } from '../theme';

export const dashboardFontSx = { fontFamily: DASHBOARD_FONT, color: '#1B2420' };

export const dashCardSx = {
  bgcolor: '#FFFFFF',
  border: `1px solid ${INDIVIDUAL_THEME.border}`,
  borderRadius: '18px',
  boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px rgba(16, 24, 40, 0.045)',
  p: { xs: 2, sm: 2.5 },
  minWidth: 0,
  height: '100%',
  boxSizing: 'border-box'
} as const;

export function DashCard({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box sx={dashCardSx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em', color: '#1B2420' }}>{title}</Typography>
        {typeof aside === 'string' ? <Typography sx={{ color: '#8A938E', fontSize: 13, whiteSpace: 'nowrap' }}>{aside}</Typography> : aside}
      </Box>
      {children}
    </Box>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <Box sx={{ height: { xs: 220, md: 280 }, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Typography sx={{ color: '#8A938E', textAlign: 'center', fontSize: 14 }}>{message}</Typography>
    </Box>
  );
}
