import React from 'react';
import { Box, Card, CardActionArea, CardContent, Chip, Typography } from '@mui/material';
import {
  TrendingDown,
  TrendingFlat,
  TrendingUp,
} from '@mui/icons-material';

export type KpiTrend = 'up' | 'down' | 'flat';

export interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  trend?: KpiTrend;
  trendLabel?: string;
  onClick?: () => void;
  severity?: 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
}

const severityColors = {
  healthy: '#10B981',
  warning: '#F59E0B',
  critical: '#EF4444',
  info: '#3B82F6',
  neutral: '#64748B',
};

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  icon,
  color,
  trend,
  trendLabel,
  onClick,
  severity = 'neutral',
}) => {
  const accent = severity !== 'neutral' ? severityColors[severity] : color;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : TrendingFlat;

  const content = (
    <CardContent sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
        <Box
          sx={{
            backgroundColor: `${accent}14`,
            borderRadius: 2,
            p: 1,
            color: accent,
            display: 'flex',
          }}
        >
          {icon}
        </Box>
        {trend && (
          <Chip
            size="small"
            icon={<TrendIcon sx={{ fontSize: 16 }} />}
            label={trendLabel || trend}
            variant="outlined"
            sx={{ borderColor: `${accent}40`, color: accent }}
          />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
        {value}
      </Typography>
    </CardContent>
  );

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        height: '100%',
        transition: 'box-shadow 0.2s, transform 0.2s',
        '&:hover': onClick ? { boxShadow: 2, transform: 'translateY(-2px)' } : {},
      }}
    >
      {onClick ? <CardActionArea onClick={onClick}>{content}</CardActionArea> : content}
    </Card>
  );
};

export const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, action, children }) => (
  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
    <Box sx={{ px: 2.5, pt: 2.5, pb: subtitle ? 0 : 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>
        )}
      </Box>
      {action}
    </Box>
    <Box sx={{ p: 2.5, pt: 1.5 }}>{children}</Box>
  </Card>
);

export const severityChipColor = (severity: string): 'error' | 'warning' | 'success' | 'info' | 'default' => {
  if (severity === 'critical') return 'error';
  if (severity === 'attention' || severity === 'warning') return 'warning';
  if (severity === 'healthy') return 'success';
  if (severity === 'info') return 'info';
  return 'default';
};
