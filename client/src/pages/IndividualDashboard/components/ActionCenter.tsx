import React from 'react';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { INDIVIDUAL_THEME } from '../theme';
import { ActionItem } from '../utils/actionCenter';
import { workspacePath } from '../../../demo/demoMode';
import { SectionHeader } from './shared';

const priorityColors: Record<string, string> = {
  critical: INDIVIDUAL_THEME.danger,
  warning: INDIVIDUAL_THEME.warning,
  success: INDIVIDUAL_THEME.success,
  info: INDIVIDUAL_THEME.neutral
};

export function ActionCenter({ items }: { items: ActionItem[] }) {
  const navigate = useNavigate();
  return (
    <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
      <CardContent>
        <SectionHeader title="Action Center" subtitle="Items that need your attention today" />
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {items.length === 0 && (
            <Typography color="text.secondary">No urgent actions — your portfolio is in good shape.</Typography>
          )}
          {items.map((item) => (
            <Box
              key={item.id}
              onClick={() => navigate(workspacePath(item.link))}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                borderRadius: 2,
                border: `1px solid ${INDIVIDUAL_THEME.border}`,
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { borderColor: priorityColors[item.priority], bgcolor: '#fafafa' }
              }}
            >
              <Typography sx={{ fontSize: '1.25rem' }}>{item.icon}</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{item.title}</Typography>
                <Typography variant="body2" color="text.secondary">{item.description}</Typography>
              </Box>
              <Chip size="small" label={item.priority} sx={{ bgcolor: priorityColors[item.priority], color: '#fff', textTransform: 'capitalize' }} />
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
