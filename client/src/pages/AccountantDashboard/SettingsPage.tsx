import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Divider,
  Alert,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  SelectChangeEvent
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
};

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [settings, setSettings] = useState({
    // Account Settings
    name: '',
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
      paymentAlerts: true,
      overdueRent: true
    },
    // Company Settings
    companyName: '',
    registrationNumber: '',
    taxId: '',
    bankAccount: '',
    // Finance Settings
    defaultCurrency: 'USD',
    taxRate: 0,
    invoiceFormat: 'INV-{year}-{number}',
    receiptFormat: 'REC-{year}-{number}',
    // Reporting Settings
    defaultReportPeriod: 'monthly',
    autoGenerateReports: false,
    reportFormat: 'PDF',
    // Document Settings
    documentStorageLimit: 1000,
    watermarkEnabled: false,
    // Billing Settings
    defaultInvoiceTerms: 'net30',
    invoiceReminderDays: [7, 3, 1],
    // Bank Settings
    bankAccounts: [],
    importFormat: 'CSV'
  });

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked } = event.target;
    setSettings(prev => ({
      ...prev,
      [name]: event.target.type === 'checkbox' ? checked : value
    }));
  };

  const handleSelectChange = (event: SelectChangeEvent) => {
    const { name, value } = event.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    try {
      // TODO: Implement save functionality
      console.log('Saving settings:', settings);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="settings tabs"
        >
          <Tab label="Account" />
          <Tab label="Company" />
          <Tab label="Finance" />
          <Tab label="Reporting" />
          <Tab label="Documents" />
          <Tab label="Billing" />
          <Tab label="Bank" />
        </Tabs>

        {/* Account Settings */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Profile Information
              </Typography>
              <TextField
                fullWidth
                label="Name"
                name="name"
                value={settings.name}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={settings.email}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Phone"
                name="phone"
                value={settings.phone}
                onChange={handleInputChange}
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Security
              </Typography>
              <TextField
                fullWidth
                label="Current Password"
                name="currentPassword"
                type={showPassword ? 'text' : 'password'}
                value={settings.currentPassword}
                onChange={handleInputChange}
                margin="normal"
                InputProps={{
                  endAdornment: (
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="New Password"
                name="newPassword"
                type={showPassword ? 'text' : 'password'}
                value={settings.newPassword}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Confirm New Password"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={settings.confirmPassword}
                onChange={handleInputChange}
                margin="normal"
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Two-Factor Authentication
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.twoFactorEnabled}
                    onChange={handleInputChange}
                    name="twoFactorEnabled"
                  />
                }
                label="Enable Two-Factor Authentication"
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Notification Preferences
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notifications.email}
                        onChange={handleInputChange}
                        name="notifications.email"
                      />
                    }
                    label="Email Notifications"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notifications.sms}
                        onChange={handleInputChange}
                        name="notifications.sms"
                      />
                    }
                    label="SMS Notifications"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notifications.push}
                        onChange={handleInputChange}
                        name="notifications.push"
                      />
                    }
                    label="Push Notifications"
                  />
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Company Settings */}
        <TabPanel value={activeTab} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Company Information
              </Typography>
              <TextField
                fullWidth
                label="Company Name"
                name="companyName"
                value={settings.companyName}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Registration Number"
                name="registrationNumber"
                value={settings.registrationNumber}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Tax ID"
                name="taxId"
                value={settings.taxId}
                onChange={handleInputChange}
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Bank Details
              </Typography>
              <TextField
                fullWidth
                label="Bank Account"
                name="bankAccount"
                value={settings.bankAccount}
                onChange={handleInputChange}
                margin="normal"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Finance Settings */}
        <TabPanel value={activeTab} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Currency & Tax
              </Typography>
              <FormControl fullWidth margin="normal">
                <InputLabel>Default Currency</InputLabel>
                <Select
                  name="defaultCurrency"
                  value={settings.defaultCurrency}
                  onChange={handleSelectChange}
                  label="Default Currency"
                >
                  <MenuItem value="USD">USD</MenuItem>
                  <MenuItem value="EUR">EUR</MenuItem>
                  <MenuItem value="GBP">GBP</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Default Tax Rate (%)"
                name="taxRate"
                type="number"
                value={settings.taxRate}
                onChange={handleInputChange}
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Numbering Formats
              </Typography>
              <TextField
                fullWidth
                label="Invoice Format"
                name="invoiceFormat"
                value={settings.invoiceFormat}
                onChange={handleInputChange}
                margin="normal"
                helperText="Use {year} and {number} as placeholders"
              />
              <TextField
                fullWidth
                label="Receipt Format"
                name="receiptFormat"
                value={settings.receiptFormat}
                onChange={handleInputChange}
                margin="normal"
                helperText="Use {year} and {number} as placeholders"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Reporting Settings */}
        <TabPanel value={activeTab} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Report Configuration
              </Typography>
              <FormControl fullWidth margin="normal">
                <InputLabel>Default Report Period</InputLabel>
                <Select
                  name="defaultReportPeriod"
                  value={settings.defaultReportPeriod}
                  onChange={handleSelectChange}
                  label="Default Report Period"
                >
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="quarterly">Quarterly</MenuItem>
                  <MenuItem value="yearly">Yearly</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoGenerateReports}
                    onChange={handleInputChange}
                    name="autoGenerateReports"
                  />
                }
                label="Auto-Generate Reports"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Report Format
              </Typography>
              <FormControl fullWidth margin="normal">
                <InputLabel>Default Format</InputLabel>
                <Select
                  name="reportFormat"
                  value={settings.reportFormat}
                  onChange={handleSelectChange}
                  label="Default Format"
                >
                  <MenuItem value="PDF">PDF</MenuItem>
                  <MenuItem value="Excel">Excel</MenuItem>
                  <MenuItem value="CSV">CSV</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Document Settings */}
        <TabPanel value={activeTab} index={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Storage & Formatting
              </Typography>
              <TextField
                fullWidth
                label="Document Storage Limit (MB)"
                name="documentStorageLimit"
                type="number"
                value={settings.documentStorageLimit}
                onChange={handleInputChange}
                margin="normal"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.watermarkEnabled}
                    onChange={handleInputChange}
                    name="watermarkEnabled"
                  />
                }
                label="Enable Watermark on Documents"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Billing Settings */}
        <TabPanel value={activeTab} index={5}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Invoice Settings
              </Typography>
              <FormControl fullWidth margin="normal">
                <InputLabel>Default Invoice Terms</InputLabel>
                <Select
                  name="defaultInvoiceTerms"
                  value={settings.defaultInvoiceTerms}
                  onChange={handleSelectChange}
                  label="Default Invoice Terms"
                >
                  <MenuItem value="net15">Net 15</MenuItem>
                  <MenuItem value="net30">Net 30</MenuItem>
                  <MenuItem value="net60">Net 60</MenuItem>
                  <MenuItem value="dueOnReceipt">Due on Receipt</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Bank Settings */}
        <TabPanel value={activeTab} index={6}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Bank Integration
              </Typography>
              <FormControl fullWidth margin="normal">
                <InputLabel>Import Format</InputLabel>
                <Select
                  name="importFormat"
                  value={settings.importFormat}
                  onChange={handleSelectChange}
                  label="Import Format"
                >
                  <MenuItem value="CSV">CSV</MenuItem>
                  <MenuItem value="OFX">OFX</MenuItem>
                  <MenuItem value="QIF">QIF</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveIcon />}
          onClick={handleSave}
        >
          Save Changes
        </Button>
      </Box>
    </Box>
  );
};

export default SettingsPage; 