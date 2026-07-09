import React from 'react';
import { Box, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { INDIVIDUAL_THEME, healthScoreColor, healthScoreLabel } from '../theme';

export function CenteredLoader() {
  return (
    <Box sx={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress sx={{ color: INDIVIDUAL_THEME.primary }} />
    </Box>
  );
}

export function StatCard({ title, value, subtitle, icon, accent }: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, height: '100%' }}>
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          {icon && (
            <Box sx={{ color: accent || INDIVIDUAL_THEME.primary, mt: 0.5 }}>{icon}</Box>
          )}
          <Box sx={{ flex: 1 }}>
            <Typography color="text.secondary" variant="body2">{title}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>{value}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function HealthScoreBadge({ score, size = 'medium' }: { score: number; size?: 'small' | 'medium' | 'large' }) {
  const color = healthScoreColor(score);
  const fontSize = size === 'large' ? '2.5rem' : size === 'small' ? '0.875rem' : '1.5rem';
  return (
    <Box sx={{ textAlign: size === 'small' ? 'left' : 'center' }}>
      <Typography sx={{ fontWeight: 800, color, fontSize, lineHeight: 1 }}>{score}%</Typography>
      {size !== 'small' && (
        <Typography variant="caption" sx={{ color: INDIVIDUAL_THEME.neutral }}>
          {healthScoreLabel(score)}
        </Typography>
      )}
    </Box>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>{title}</Typography>
        {subtitle && <Typography color="text.secondary" variant="body2">{subtitle}</Typography>}
      </Box>
      {action}
    </Box>
  );
}

export function PageShell({ title, subtitle, action, children }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={3}>
      <SectionHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </Stack>
  );
}
