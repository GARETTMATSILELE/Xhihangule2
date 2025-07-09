import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Language as LanguageIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import { apiService } from '../../api';
import { useAuth } from '../../contexts/AuthContext';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`agent-settings-tabpanel-${index}`}
      aria-labelledby={`agent-settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export const AgentSettings: React.FC = () => {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [tab, setTab] = useState(0);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false,
    notifications: {
      email: true,
      sms: false,
      push: true,
    },
    language: 'en',
    timezone: 'UTC',
  });

  useEffect(() => {
    if (user) {
      setFormData(prevData => ({
        ...prevData,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        twoFactorEnabled: user.twoFactorEnabled || false,
        notifications: user.notifications || {
          email: true,
          sms: false,
          push: true,
        },
        language: user.language || 'en',
        timezone: user.timezone || 'UTC',
      }));
    }
  }, [user]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?._id) {
      setMessage({
        type: 'error',
        text: 'You must be logged in to update your profile.',
      });
      return;
    }

    try {
      setLoading(true);
      await apiService.updateUser({
        ...formData,
        userId: user._id,
      });
      setMessage({
        type: 'success',
        text: 'Profile updated successfully',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({
        type: 'error',
        text: 'Error updating profile. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({
        type: 'error',
        text: 'New passwords do not match',
      });
      return;
    }

    try {
      await apiService.updateUserPassword(formData.currentPassword, formData.newPassword);
      setMessage({
        type: 'success',
        text: 'Password updated successfully',
      });
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error updating password',
      });
    }
  };

  const handleTwoFactorToggle = async () => {
    try {
      await apiService.updateTwoFactor(formData.twoFactorEnabled);
      setFormData({
        ...formData,
        twoFactorEnabled: !formData.twoFactorEnabled,
      });
      setMessage({
        type: 'success',
        text: `Two-factor authentication ${!formData.twoFactorEnabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error updating two-factor authentication',
      });
    }
  };

  if (authLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Please log in to access settings.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 8, p: 3 }}>
      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}
      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs
          value={tab}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab icon={<PersonIcon />} label="Profile" />
          <Tab icon={<SecurityIcon />} label="Security" />
          <Tab icon={<NotificationsIcon />} label="Notifications" />
          <Tab icon={<LanguageIcon />} label="Preferences" />
        </Tabs>

        <TabPanel value={tab} index={0}>
          <form onSubmit={handleProfileUpdate}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email"
                  value={formData.email}
                  disabled
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <Button 
                  type="submit" 
                  variant="contained" 
                  color="primary"
                  disabled={loading}
                >
                  {loading ? <CircularProgress size={24} /> : 'Update Profile'}
                </Button>
              </Grid>
            </Grid>
          </form>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <form onSubmit={handlePasswordChange}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Change Password
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Current Password"
                  type="password"
                  value={formData.currentPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, currentPassword: e.target.value })
                  }
                  required
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="New Password"
                  type="password"
                  value={formData.newPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, newPassword: e.target.value })
                  }
                  required
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Confirm New Password"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
                  required
                />
              </Grid>

              <Grid item xs={12}>
                <Button type="submit" variant="contained" color="primary">
                  Update Password
                </Button>
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Two-Factor Authentication
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.twoFactorEnabled}
                      onChange={handleTwoFactorToggle}
                    />
                  }
                  label="Enable Two-Factor Authentication"
                />
              </Grid>
            </Grid>
          </form>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Notification Preferences
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.notifications.email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        notifications: {
                          ...formData.notifications,
                          email: e.target.checked,
                        },
                      })
                    }
                  />
                }
                label="Email Notifications"
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.notifications.sms}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        notifications: {
                          ...formData.notifications,
                          sms: e.target.checked,
                        },
                      })
                    }
                  />
                }
                label="SMS Notifications"
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.notifications.push}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        notifications: {
                          ...formData.notifications,
                          push: e.target.checked,
                        },
                      })
                    }
                  />
                }
                label="Push Notifications"
              />
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tab} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Language & Time Zone
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Language</InputLabel>
                <Select
                  value={formData.language}
                  onChange={(e) =>
                    setFormData({ ...formData, language: e.target.value })
                  }
                >
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="es">Spanish</MenuItem>
                  <MenuItem value="fr">French</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Time Zone</InputLabel>
                <Select
                  value={formData.timezone}
                  onChange={(e) =>
                    setFormData({ ...formData, timezone: e.target.value })
                  }
                >
                  <MenuItem value="UTC">UTC</MenuItem>
                  <MenuItem value="EST">Eastern Time</MenuItem>
                  <MenuItem value="CST">Central Time</MenuItem>
                  <MenuItem value="PST">Pacific Time</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>
    </Box>
  );
}; 