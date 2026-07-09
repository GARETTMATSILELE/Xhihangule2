import React, { useMemo } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography
} from '@mui/material';
import { AttachMoney, Notifications as NotificationsIcon } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { INDIVIDUAL_THEME } from '../theme';
import { ActionItem } from '../utils/actionCenter';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  link: string;
  priority: 'critical' | 'warning' | 'success' | 'info';
};

const priorityDot: Record<string, string> = {
  critical: INDIVIDUAL_THEME.danger,
  warning: INDIVIDUAL_THEME.warning,
  success: INDIVIDUAL_THEME.success,
  info: INDIVIDUAL_THEME.neutral
};

export function TopBar({ companyName, actionItems }: { companyName?: string; actionItems: ActionItem[] }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const notifications: NotificationItem[] = useMemo(
    () => actionItems.slice(0, 8).map((a) => ({
      id: a.id,
      title: a.title,
      message: a.description,
      link: a.link,
      priority: a.priority
    })),
    [actionItems]
  );

  return (
    <Box sx={{
      height: 64,
      px: 3,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: INDIVIDUAL_THEME.surface,
      borderBottom: `1px solid ${INDIVIDUAL_THEME.border}`
    }}>
      <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>{companyName || 'My Portfolio'}</Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          variant="contained"
          size="small"
          startIcon={<AttachMoney />}
          component={RouterLink}
          to="/individual-dashboard/rent-collection?record=1"
          sx={{
            bgcolor: INDIVIDUAL_THEME.primary,
            '&:hover': { bgcolor: INDIVIDUAL_THEME.primaryDark },
            display: { xs: 'none', sm: 'inline-flex' }
          }}
        >
          Record Rent
        </Button>
        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="Notifications">
          <Badge badgeContent={notifications.length} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
          </Box>
          {notifications.length === 0 && <MenuItem disabled>No notifications</MenuItem>}
          {notifications.map((n) => (
            <MenuItem
              key={n.id}
              onClick={() => { setAnchorEl(null); navigate(n.link); }}
              sx={{ maxWidth: 320, whiteSpace: 'normal' }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: priorityDot[n.priority], mr: 1.5, flexShrink: 0 }} />
              <Box>
                <Typography variant="body2" fontWeight={600}>{n.title}</Typography>
                <Typography variant="caption" color="text.secondary">{n.message}</Typography>
              </Box>
            </MenuItem>
          ))}
        </Menu>
        <Chip label="Individual Owner" size="small" sx={{ bgcolor: `${INDIVIDUAL_THEME.primary}15`, color: INDIVIDUAL_THEME.primary, fontWeight: 600 }} />
        <Button variant="text" size="small" onClick={logout} sx={{ color: INDIVIDUAL_THEME.neutral }}>Log Out</Button>
      </Stack>
    </Box>
  );
}

export default TopBar;
