import React from 'react';
import { Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { CheckCircle, Cancel } from '@mui/icons-material';
import { INDIVIDUAL_THEME } from '../theme';
import { HealthScoreBadge } from './shared';
import { greetingName, timeGreeting } from '../utils/formatters';

type Check = { ok: boolean; label: string };

export function OwnerBrief({ firstName, lastName, portfolioScore, checks }: {
  firstName?: string;
  lastName?: string;
  portfolioScore: number;
  checks: Check[];
}) {
  return (
    <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 3, background: `linear-gradient(135deg, ${INDIVIDUAL_THEME.primary} 0%, ${INDIVIDUAL_THEME.primaryDark} 100%)`, color: '#fff' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={8}>
            <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: 1.5 }}>Owner Brief</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, mb: 2 }}>
              {timeGreeting()}, {greetingName(firstName, lastName)}
            </Typography>
            <Stack spacing={1}>
              {checks.map((check) => (
                <Stack key={check.label} direction="row" spacing={1} alignItems="center">
                  {check.ok
                    ? <CheckCircle sx={{ fontSize: 18, color: '#86efac' }} />
                    : <Cancel sx={{ fontSize: 18, color: '#fca5a5' }} />}
                  <Typography variant="body2">{check.label}</Typography>
                </Stack>
              ))}
            </Stack>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 3, p: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ opacity: 0.85, mb: 1 }}>Portfolio Health Score</Typography>
              <Box sx={{ '& .MuiTypography-root': { color: '#fff !important' } }}>
                <HealthScoreBadge score={portfolioScore} size="large" />
              </Box>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
