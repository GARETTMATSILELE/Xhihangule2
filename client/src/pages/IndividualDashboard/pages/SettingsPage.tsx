import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useAuth } from '../../../contexts/AuthContext';
import { useFeature } from '../../../contexts/FeatureFlags';
import { PageShell } from '../components/shared';
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

function NotificationsTab() {
  const events = ['Rent Paid', 'Rent Overdue', 'Lease Expiring', 'Inspection Due', 'Maintenance Completed', 'Municipal Bill Due', 'Expense Added', 'Tenant Added'];
  return (
    <Stack spacing={1}>
      {events.map((e) => (
        <Box key={e} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <Typography>{e}</Typography>
          <Typography variant="body2" color="text.secondary">Enabled</Typography>
        </Box>
      ))}
    </Stack>
  );
}

function BillingTab() {
  return <Alert severity="info">Manage your Mantis subscription and billing from the checkout portal.</Alert>;
}

function PreferencesTab() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 480 }}>
      <TextField select label="Currency" value="USD" fullWidth SelectProps={{ native: true }}>
        <option value="USD">USD</option>
      </TextField>
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
  const tabs = ['Profile', 'Security', 'Notifications', 'Billing', 'Preferences'];
  if (apiAccess) tabs.push('API');
  if (multiUser) tabs.push('Users');

  return (
    <PageShell title="Settings" subtitle="Profile, security, notifications, and preferences — agency settings hidden for individual owners.">
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
          {tabs[tab] === 'API' && <Alert severity="warning">API access is enabled for your plan.</Alert>}
          {tabs[tab] === 'Users' && <Alert severity="warning">Multi-user management is enabled for your plan.</Alert>}
        </CardContent>
      </Card>
    </PageShell>
  );
}

export default IndividualSettingsPage;
