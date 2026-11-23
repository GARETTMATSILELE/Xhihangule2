import React, { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { CalendarMonthOutlined, ExpandMore, Menu as MenuIcon, NotificationsNone, PersonOutline } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { isDemoMode, workspacePath } from '../../../demo/demoMode';
import { useChrome } from '../components/chrome';
import { PERIOD_OPTIONS } from '../reports/filters';
import { selectedPeriodLabel } from './presentDashboard';
import { timeGreeting } from '../utils/formatters';
import { ActionItem } from '../utils/actionCenter';
import { INDIVIDUAL_THEME } from '../theme';

const PERIODS = new Set<string>(PERIOD_OPTIONS.map((option) => option.value));

function pillSx(extra?: object) {
  return {
    minHeight: 44,
    px: 1.5,
    borderRadius: '999px',
    border: `1px solid ${INDIVIDUAL_THEME.border}`,
    bgcolor: '#fff',
    color: '#1B2420',
    textTransform: 'none',
    fontWeight: 600,
    fontSize: 14,
    boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    '&:hover': { bgcolor: '#F8F9F7' },
    ...extra
  };
}

export function DashboardHeader({ periodLabel, actionItems }: { periodLabel?: string; actionItems: ActionItem[] }) {
  const { openNav } = useChrome();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const demo = isDemoMode();
  const [params, setParams] = useSearchParams();
  const period = PERIODS.has(params.get('period') || '') ? String(params.get('period')) : 'this_month';
  const [periodAnchor, setPeriodAnchor] = useState<null | HTMLElement>(null);
  const [noteAnchor, setNoteAnchor] = useState<null | HTMLElement>(null);
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);
  const start = params.get('start') || '';
  const end = params.get('end') || '';
  const buttonLabel = selectedPeriodLabel(period, periodLabel);

  const writePeriod = (nextPeriod: string, patch?: { start?: string; end?: string }) => {
    const next = new URLSearchParams(params);
    next.set('period', nextPeriod);
    if (nextPeriod !== 'custom') {
      next.delete('start');
      next.delete('end');
    } else {
      if (patch && 'start' in patch) {
        if (patch.start) next.set('start', patch.start);
        else next.delete('start');
      }
      if (patch && 'end' in patch) {
        if (patch.end) next.set('end', patch.end);
        else next.delete('end');
      }
    }
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ mb: { xs: 2.5, md: 3 } }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
          <IconButton
            aria-label="Open navigation"
            onClick={openNav}
            sx={{ width: 44, height: 44, mt: 0.25, display: 'inline-flex', '@media (min-width:1024px)': { display: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, '@media (min-width:1024px)': { display: 'none' } }}>
              <LeafMark />
              <Typography sx={{ fontWeight: 800, letterSpacing: '0.14em', fontSize: 13, color: INDIVIDUAL_THEME.sidebarBg }}>MANTIS</Typography>
            </Stack>
            <Typography sx={{ fontSize: { xs: 28, sm: 32 }, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#1B2420' }}>
              {timeGreeting()}
            </Typography>
            <Typography sx={{ color: '#8A938E', fontSize: 15, mt: 0.5 }}>Here&apos;s your portfolio at a glance.</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
          <Button
            aria-label="Reporting period"
            startIcon={<CalendarMonthOutlined sx={{ fontSize: 18 }} />}
            endIcon={<ExpandMore sx={{ fontSize: 18 }} />}
            onClick={(event) => setPeriodAnchor(event.currentTarget)}
            sx={pillSx({})}
          >
            {buttonLabel}
          </Button>
          <IconButton aria-label="Notifications" onClick={(event) => setNoteAnchor(event.currentTarget)} sx={pillSx({ width: 44, minWidth: 44, px: 0 })}>
            <Badge color="error" variant="dot" invisible={actionItems.length === 0} overlap="circular">
              <NotificationsNone sx={{ color: '#1B2420' }} />
            </Badge>
          </IconButton>
          <Button
            aria-label="Account menu"
            startIcon={<PersonOutline />}
            endIcon={<ExpandMore />}
            onClick={(event) => setAccountAnchor(event.currentTarget)}
            sx={pillSx({})}
          >
            Individual Owner
          </Button>
        </Stack>
      </Stack>
      {period === 'custom' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
          <TextField
            label="Start"
            type="date"
            size="small"
            value={start}
            onChange={(event) => writePeriod('custom', { start: event.target.value, end })}
            InputLabelProps={{ shrink: true }}
            sx={{ bgcolor: '#fff', borderRadius: 2 }}
          />
          <TextField
            label="End"
            type="date"
            size="small"
            value={end}
            onChange={(event) => writePeriod('custom', { start, end: event.target.value })}
            InputLabelProps={{ shrink: true }}
            sx={{ bgcolor: '#fff', borderRadius: 2 }}
          />
        </Stack>
      )}
      <Menu anchorEl={periodAnchor} open={Boolean(periodAnchor)} onClose={() => setPeriodAnchor(null)}>
        {PERIOD_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={option.value === period}
            onClick={() => {
              writePeriod(option.value);
              setPeriodAnchor(null);
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={noteAnchor} open={Boolean(noteAnchor)} onClose={() => setNoteAnchor(null)} PaperProps={{ sx: { width: { xs: 'min(360px, calc(100vw - 32px))', sm: 360 }, maxWidth: 'calc(100vw - 32px)' } }}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Notifications</Typography>
        </Box>
        {actionItems.length === 0 && <MenuItem disabled>No notifications</MenuItem>}
        {actionItems.slice(0, 8).map((item) => (
          <MenuItem key={item.id} onClick={() => { setNoteAnchor(null); navigate(workspacePath(item.link)); }} sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1.25 }}>
            <Box>
              <Typography sx={{ fontWeight: 650, fontSize: 14 }}>{item.title}</Typography>
              <Typography sx={{ color: '#8A938E', fontSize: 12 }}>{item.description}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)}>
        <MenuItem onClick={() => { setAccountAnchor(null); navigate(workspacePath('/individual-dashboard/settings')); }}>Settings</MenuItem>
        <MenuItem onClick={() => { setAccountAnchor(null); if (demo) navigate('/'); else logout(); }}>{demo ? 'Exit sample workspace' : 'Log out'}</MenuItem>
      </Menu>
    </Box>
  );
}

function LeafMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M7 24c2.4-6.2 5.1-11.4 10-16.8 4.9 5.4 7.6 10.6 10 16.8" fill="none" stroke="#00452F" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="17" cy="24.5" r="2.2" fill="#00452F" />
    </svg>
  );
}
