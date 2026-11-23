import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useAuth } from '../../../contexts/AuthContext';
import { useFeature } from '../../../contexts/FeatureFlags';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { PageShell } from '../components/shared';
import { JurisdictionSettings } from '../components/JurisdictionSettings';
import { INDIVIDUAL_THEME } from '../theme';

function ProfileTab() {
  const { user } = useAuth();
  return (
    <Stack spacing={2} sx={{ maxWidth: 480 }}>
      <TextField label="First Name" value={user?.firstName || ''} fullWidth disabled />
      <TextField label="Last Name" value={user?.lastName || ''} fullWidth disabled />
      <TextField label="Email" value={user?.email || ''} fullWidth disabled />
      <Alert severity="info">Update profile details from your account security settings.</Alert>
    </Stack>
  );
}

function SecurityTab() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 480 }}>
      <TextField label="Current Password" type="password" fullWidth />
      <TextField label="New Password" type="password" fullWidth />
      <TextField label="Confirm Password" type="password" fullWidth />
      <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, alignSelf: 'flex-start' }}>Update Password</Button>
    </Stack>
  );
}

const NOTIFICATION_EVENTS = [
  ['RENT_PAID', 'Rent Paid'],
  ['RENT_OVERDUE', 'Rent Overdue'],
  ['LEASE_EXPIRING', 'Lease Expiring'],
  ['INSPECTION_DUE', 'Inspection Due'],
  ['MAINTENANCE_COMPLETED', 'Maintenance Completed'],
  ['MUNICIPAL_BILL_DUE', 'Municipal Bill Due'],
  ['EXPENSE_ADDED', 'Expense Added'],
  ['TENANT_ADDED', 'Tenant Added']
] as const;

function NotificationsTab() {
  const [events, setEvents] = useState<Record<string, { email: boolean; inApp: boolean }>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    individualWorkspaceService.getNotificationPreferences()
      .then((data) => setEvents((data || {}) as Record<string, { email: boolean; inApp: boolean }>))
      .catch(() => undefined);
  }, []);

  const toggle = (key: string, channel: 'email' | 'inApp') => {
    setSaved(false);
    setEvents((prev) => ({
      ...prev,
      [key]: { email: prev[key]?.email !== false, inApp: prev[key]?.inApp !== false, [channel]: !(prev[key]?.[channel] !== false) }
    }));
  };

  return (
    <Stack spacing={1}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 1, pb: 1 }}>
        <Typography variant="caption" color="text.secondary">Event</Typography>
        <Typography variant="caption" color="text.secondary">Email</Typography>
        <Typography variant="caption" color="text.secondary">In-app</Typography>
      </Box>
      {NOTIFICATION_EVENTS.map(([key, label]) => (
        <Box key={key} sx={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', alignItems: 'center', borderBottom: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <Typography>{label}</Typography>
          <Switch checked={events[key]?.email !== false} onChange={() => toggle(key, 'email')} />
          <Switch checked={events[key]?.inApp !== false} onChange={() => toggle(key, 'inApp')} />
        </Box>
      ))}
      <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, alignSelf: 'flex-start' }} onClick={async () => {
        await individualWorkspaceService.saveNotificationPreferences(events);
        setSaved(true);
      }}>Save notifications</Button>
      {saved && <Alert severity="success">Notification preferences saved on your account.</Alert>}
    </Stack>
  );
}

function BillingTab() {
  return <Alert severity="info">Manage your Mantis subscription and billing from the checkout portal.</Alert>;
}

function PreferencesTab() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Alert severity="info">Set your preferred currency under Tax. Each property can also have its own operating currency. Recorded amounts stay in the currency they were entered in.</Alert>
      <TextField select label="Date Format" value="locale" fullWidth SelectProps={{ native: true }}>
        <option value="locale">System default</option>
      </TextField>
    </Stack>
  );
}

export function IndividualSettingsPage() {
  const apiAccess = useFeature('apiAccess');
  const multiUser = useFeature('multiUser');
  const [tab, setTab] = useState(0);
  const tabs = ['Profile', 'Security', 'Notifications', 'Billing', 'Preferences', 'Tax'];
  if (apiAccess) tabs.push('API');
  if (multiUser) tabs.push('Users');

  return (
    <PageShell title="Settings" subtitle="Profile, security, tax registration, and preferences — agency commission settings remain hidden.">
      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          {tabs.map((t) => <Tab key={t} label={t} />)}
        </Tabs>
        <CardContent>
          {tab === 0 && <ProfileTab />}
          {tab === 1 && <SecurityTab />}
          {tab === 2 && <NotificationsTab />}
          {tab === 3 && <BillingTab />}
          {tab === 4 && <PreferencesTab />}
          {tabs[tab] === 'Tax' && <JurisdictionSettings />}
          {tabs[tab] === 'API' && <Alert severity="warning">API access is enabled for your plan.</Alert>}
          {tabs[tab] === 'Users' && <Alert severity="warning">Multi-user management is enabled for your plan.</Alert>}
        </CardContent>
      </Card>
    </PageShell>
  );
}

export default IndividualSettingsPage;
