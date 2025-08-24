import React, { useState, useEffect } from 'react';
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
  SelectChangeEvent,
  CircularProgress
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useCompany } from '../../contexts/CompanyContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../api';

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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  
  // Get company data from context
  const { company, loading: companyLoading, refreshCompany } = useCompany();
  const { user } = useAuth();
  
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
    tinNumber: '',
    vatNumber: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
    bankAccounts: [] as Array<{
      accountNumber: string;
      accountName: string;
      accountType: 'USD NOSTRO' | 'ZiG';
      bankName: string;
      branchName: string;
      branchCode: string;
    }>,
    // Finance Settings
    defaultCurrency: 'USD',
    taxRate: 0,
    invoiceFormat: 'INV-{year}-{number}',
    receiptFormat: 'REC-{year}-{number}',
    // Commission Settings
    preaPercentOfTotal: 0.03,
    agentPercentOfRemaining: 0.6,
    agencyPercentOfRemaining: 0.4,
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
    importFormat: 'CSV'
  });

  // Update settings when company data is loaded
  useEffect(() => {
    if (company) {
      setSettings(prev => ({
        ...prev,
        companyName: company.name || '',
        registrationNumber: company.registrationNumber || '',
        tinNumber: company.tinNumber || '',
        vatNumber: company.vatNumber || '',
        companyAddress: company.address || '',
        companyPhone: company.phone || '',
        companyEmail: company.email || '',
        companyWebsite: company.website || '',
        bankAccounts: company.bankAccounts || [],
        // Commission defaults
        preaPercentOfTotal: company.commissionConfig?.preaPercentOfTotal ?? 0.03,
        agentPercentOfRemaining: company.commissionConfig?.agentPercentOfRemaining ?? 0.6,
        agencyPercentOfRemaining: company.commissionConfig?.agencyPercentOfRemaining ?? 0.4,
      }));
    }
  }, [company]);

  // Update user data when user is loaded
  useEffect(() => {
    if (user) {
      setSettings(prev => ({
        ...prev,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email || '',
        phone: user.phone || '',
        twoFactorEnabled: user.twoFactorEnabled || false,
      }));
    }
  }, [user]);

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

  const handleBankAccountChange = (index: number, field: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((account, i) => 
        i === index ? { ...account, [field]: value } : account
      )
    }));
  };

  const addBankAccount = () => {
    if (settings.bankAccounts.length >= 2) {
      setMessage({
        type: 'error',
        text: 'Maximum of 2 bank accounts allowed.',
      });
      return;
    }
    
    setSettings(prev => ({
      ...prev,
      bankAccounts: [...prev.bankAccounts, {
        accountNumber: '',
        accountName: '',
        accountType: 'USD NOSTRO',
        bankName: '',
        branchName: '',
        branchCode: ''
      }]
    }));
  };

  const removeBankAccount = (index: number) => {
    setSettings(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts.filter((_, i) => i !== index)
    }));
  };

  const handleCompanyUpdate = async () => {
    if (!company?._id) {
      setMessage({
        type: 'error',
        text: 'Company information not found.',
      });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      
      const companyUpdateData = {
        name: settings.companyName,
        registrationNumber: settings.registrationNumber,
        tinNumber: settings.tinNumber,
        vatNumber: settings.vatNumber,
        address: settings.companyAddress,
        phone: settings.companyPhone,
        email: settings.companyEmail,
        website: settings.companyWebsite,
        bankAccounts: settings.bankAccounts,
      };

      await apiService.updateCompany(companyUpdateData);
      await refreshCompany(); // Refresh company data
      
      setMessage({
        type: 'success',
        text: 'Company information updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating company:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Error updating company information. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setMessage(null);
      
      // Save company data including bank accounts
      if (company?._id) {
        const companyUpdateData = {
          name: settings.companyName,
          registrationNumber: settings.registrationNumber,
          tinNumber: settings.tinNumber,
          vatNumber: settings.vatNumber,
          address: settings.companyAddress,
          phone: settings.companyPhone,
          email: settings.companyEmail,
          website: settings.companyWebsite,
          bankAccounts: settings.bankAccounts,
          commissionConfig: {
            preaPercentOfTotal: Number(settings.preaPercentOfTotal),
            agentPercentOfRemaining: Number(settings.agentPercentOfRemaining),
            agencyPercentOfRemaining: Number(settings.agencyPercentOfRemaining)
          },
        };

        await apiService.updateCompany(companyUpdateData);
        await refreshCompany(); // Refresh company data
      }
      
      setMessage({
        type: 'success',
        text: 'Settings saved successfully',
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Error saving settings. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (companyLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      {message && (
        <Alert 
          severity={message.type} 
          sx={{ mb: 2 }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

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
                disabled
                helperText="Contact administrator to update profile information"
              />
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={settings.email}
                onChange={handleInputChange}
                margin="normal"
                disabled
                helperText="Contact administrator to update email"
              />
              <TextField
                fullWidth
                label="Phone"
                name="phone"
                value={settings.phone}
                onChange={handleInputChange}
                margin="normal"
                disabled
                helperText="Contact administrator to update phone"
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
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Company Information
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Update your company details. These changes will be reflected across the system.
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Company Name"
                name="companyName"
                value={settings.companyName}
                onChange={handleInputChange}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Registration Number"
                name="registrationNumber"
                value={settings.registrationNumber}
                onChange={handleInputChange}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Tax Number (TIN)"
                name="tinNumber"
                value={settings.tinNumber}
                onChange={handleInputChange}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="VAT Number"
                name="vatNumber"
                value={settings.vatNumber}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Company Email"
                name="companyEmail"
                type="email"
                value={settings.companyEmail}
                onChange={handleInputChange}
                margin="normal"
                required
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Company Address"
                name="companyAddress"
                value={settings.companyAddress}
                onChange={handleInputChange}
                margin="normal"
                multiline
                rows={3}
                required
              />
              <TextField
                fullWidth
                label="Company Phone"
                name="companyPhone"
                value={settings.companyPhone}
                onChange={handleInputChange}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Company Website"
                name="companyWebsite"
                value={settings.companyWebsite}
                onChange={handleInputChange}
                margin="normal"
                placeholder="https://www.example.com"
              />
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                  onClick={handleCompanyUpdate}
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Company Information'}
                </Button>
              </Box>
            </Grid>

            {/* Bank Account Management */}
            <Grid item xs={12}>
              <Divider sx={{ my: 3 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Bank Accounts
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={addBankAccount}
                  disabled={settings.bankAccounts.length >= 2}
                >
                  Add Bank Account
                </Button>
              </Box>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Manage your company's bank accounts. You can add up to 2 bank accounts.
              </Typography>

              {settings.bankAccounts.map((account, index) => (
                <Card key={index} sx={{ mb: 2 }}>
                  <CardHeader
                    title={`Bank Account ${index + 1}`}
                    action={
                      <IconButton
                        onClick={() => removeBankAccount(index)}
                        color="error"
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    }
                  />
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Account Number"
                          value={account.accountNumber}
                          onChange={(e) => handleBankAccountChange(index, 'accountNumber', e.target.value)}
                          margin="normal"
                          required
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Account Name"
                          value={account.accountName}
                          onChange={(e) => handleBankAccountChange(index, 'accountName', e.target.value)}
                          margin="normal"
                          required
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControl fullWidth margin="normal">
                          <InputLabel>Account Type</InputLabel>
                          <Select
                            value={account.accountType}
                            onChange={(e) => handleBankAccountChange(index, 'accountType', e.target.value)}
                            label="Account Type"
                          >
                            <MenuItem value="USD NOSTRO">USD NOSTRO</MenuItem>
                            <MenuItem value="ZiG">ZiG</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Bank Name"
                          value={account.bankName}
                          onChange={(e) => handleBankAccountChange(index, 'bankName', e.target.value)}
                          margin="normal"
                          required
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Branch Name"
                          value={account.branchName}
                          onChange={(e) => handleBankAccountChange(index, 'branchName', e.target.value)}
                          margin="normal"
                          required
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Branch Code"
                          value={account.branchCode}
                          onChange={(e) => handleBankAccountChange(index, 'branchCode', e.target.value)}
                          margin="normal"
                          required
                        />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              ))}

              {settings.bankAccounts.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="textSecondary">
                    No bank accounts added yet. Click "Add Bank Account" to add your first bank account.
                  </Typography>
                </Box>
              )}
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
                Commission Splits
              </Typography>
              <TextField
                fullWidth
                type="number"
                label="PREA % of total commission (0-1)"
                name="preaPercentOfTotal"
                value={settings.preaPercentOfTotal}
                onChange={handleInputChange}
                margin="normal"
                inputProps={{ step: 0.01, min: 0, max: 1 }}
                helperText="Set to 0 for no PREA share"
              />
              <TextField
                fullWidth
                type="number"
                label="Agent % of remaining (0-1)"
                name="agentPercentOfRemaining"
                value={settings.agentPercentOfRemaining}
                onChange={handleInputChange}
                margin="normal"
                inputProps={{ step: 0.01, min: 0, max: 1 }}
              />
              <TextField
                fullWidth
                type="number"
                label="Agency % of remaining (0-1)"
                name="agencyPercentOfRemaining"
                value={settings.agencyPercentOfRemaining}
                onChange={handleInputChange}
                margin="normal"
                inputProps={{ step: 0.01, min: 0, max: 1 }}
                helperText="Agent + Agency of remaining must equal 1.0"
              />
            </Grid>
          </Grid>
          <Alert severity="info" sx={{ mt: 2 }}>
            Commission is computed as: Commission = amount * property.commission%. PREA share is taken off the top, then remaining is split between Agent and Agency. PREA can be 0.
          </Alert>
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
          startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>
    </Box>
  );
};

export default SettingsPage; 