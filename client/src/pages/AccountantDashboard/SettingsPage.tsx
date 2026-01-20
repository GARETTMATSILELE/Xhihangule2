import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
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

const TabPanel = memo((props: TabPanelProps) => {
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
});

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
    vatPercentOnCommission: 0.155,
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

  const [fiscalHealth, setFiscalHealth] = useState<any>(null);
  const [checkingFiscal, setCheckingFiscal] = useState<boolean>(false);

  const checkFiscalConnection = useCallback(async () => {
    if (!company?._id) return;
    try {
      setCheckingFiscal(true);
      const res = await apiService.getFiscalHealth(company._id);
      setFiscalHealth(res.data);
    } catch (e: any) {
      setFiscalHealth({ status: 'error', message: e?.response?.data?.message || e?.message || 'Failed to check' });
    } finally {
      setCheckingFiscal(false);
    }
  }, [company?._id]);

  // Debounced nested updates to reduce INP and rerenders
  const pendingPatchRef = useRef<any>({});
  const debounceTimerRef = useRef<any>(null);

  const deepMerge = useCallback((target: any, source: any): any => {
    if (typeof source !== 'object' || source === null) return target;
    const output: any = Array.isArray(target) ? [...target] : { ...target };
    for (const key of Object.keys(source)) {
      const sourceVal = source[key];
      const targetVal = (output as any)[key];
      if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
        (output as any)[key] = deepMerge(targetVal && typeof targetVal === 'object' ? targetVal : {}, sourceVal);
      } else {
        (output as any)[key] = sourceVal;
      }
    }
    return output;
  }, []);

  const buildNestedPatch = (path: string, value: any) => {
    const parts = path.split('.');
    const root: any = {};
    let cur = root;
    parts.forEach((p, idx) => {
      if (idx === parts.length - 1) {
        cur[p] = value;
      } else {
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
    });
    return root;
  };

  const scheduleSettingsPatch = useCallback((patch: any) => {
    pendingPatchRef.current = deepMerge(pendingPatchRef.current, patch);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      const toApply = pendingPatchRef.current;
      pendingPatchRef.current = {};
      setSettings(prev => deepMerge(prev, toApply));
    }, 200);
  }, [deepMerge]);

  // Update settings when company data is loaded
  useEffect(() => {
    if (company) {
      setSettings(prev => ({
        ...prev,
        companyName: company.name || '',
        plan: (company as any).plan || 'ENTERPRISE',
        registrationNumber: company.registrationNumber || '',
        tinNumber: company.tinNumber || '',
        vatNumber: company.vatNumber || '',
        companyAddress: company.address || '',
        companyPhone: company.phone || '',
        companyEmail: company.email || '',
        companyWebsite: company.website || '',
        bankAccounts: company.bankAccounts || [],
        fiscalConfig: (company as any).fiscalConfig || {},
        // Commission defaults
        preaPercentOfTotal: company.commissionConfig?.preaPercentOfTotal ?? 0.03,
        agentPercentOfRemaining: company.commissionConfig?.agentPercentOfRemaining ?? 0.6,
        agencyPercentOfRemaining: company.commissionConfig?.agencyPercentOfRemaining ?? 0.4,
        vatPercentOnCommission: (company as any).commissionConfig?.vatPercentOnCommission ?? 0.155,
        // Receivables cutover and opening balances (do not default if not set)
        receivablesCutoverYear: (company as any)?.receivablesCutover?.year ?? undefined,
        receivablesCutoverMonth: (company as any)?.receivablesCutover?.month ?? undefined,
        rentReceivableOpeningBalance: Number((company as any)?.rentReceivableOpeningBalance || 0),
        levyReceivableOpeningBalance: Number((company as any)?.levyReceivableOpeningBalance || 0),
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

  useEffect(() => {
    if (activeTab === 7 && company?._id) {
      checkFiscalConnection();
    }
  }, [activeTab, company?._id, checkFiscalConnection]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = event.target as HTMLInputElement & { name: string };
    const finalValue = type === 'checkbox' ? checked : value;
    const patch = name.includes('.') ? buildNestedPatch(name, finalValue) : { [name]: finalValue } as any;
    scheduleSettingsPatch(patch);
  };

  const handleSelectChange = (event: SelectChangeEvent) => {
    const { name, value } = event.target as HTMLInputElement & { name: string };
    const patch = name.includes('.') ? buildNestedPatch(name, value) : { [name]: value } as any;
    scheduleSettingsPatch(patch);
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
      
      const cutoverYearVal = Number((settings as any).receivablesCutoverYear);
      const cutoverMonthVal = Number((settings as any).receivablesCutoverMonth);
      const includeCutover = Number.isFinite(cutoverYearVal) && cutoverYearVal > 0 && Number.isFinite(cutoverMonthVal) && cutoverMonthVal >= 1 && cutoverMonthVal <= 12;

      const companyUpdateData: any = {
        name: settings.companyName,
        plan: (settings as any).plan,
        cycle: (settings as any).cycle,
        registrationNumber: settings.registrationNumber,
        tinNumber: settings.tinNumber,
        vatNumber: settings.vatNumber,
        address: settings.companyAddress,
        phone: settings.companyPhone,
        email: settings.companyEmail,
        website: settings.companyWebsite,
        bankAccounts: settings.bankAccounts,
        fiscalConfig: (settings as any).fiscalConfig,
        rentReceivableOpeningBalance: Number((settings as any).rentReceivableOpeningBalance || 0),
        levyReceivableOpeningBalance: Number((settings as any).levyReceivableOpeningBalance || 0),
      };

      if (includeCutover) {
        companyUpdateData.receivablesCutover = { year: cutoverYearVal, month: cutoverMonthVal };
      }

      // Update plan/cycle at subscription level and company details
      await apiService.changeSubscriptionPlan({ plan: (settings as any).plan, cycle: (settings as any).cycle });
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
        const cutoverYearVal2 = Number((settings as any).receivablesCutoverYear);
        const cutoverMonthVal2 = Number((settings as any).receivablesCutoverMonth);
        const includeCutover2 = Number.isFinite(cutoverYearVal2) && cutoverYearVal2 > 0 && Number.isFinite(cutoverMonthVal2) && cutoverMonthVal2 >= 1 && cutoverMonthVal2 <= 12;

        const companyUpdateData: any = {
          name: settings.companyName,
          registrationNumber: settings.registrationNumber,
          tinNumber: settings.tinNumber,
          vatNumber: settings.vatNumber,
          address: settings.companyAddress,
          phone: settings.companyPhone,
          email: settings.companyEmail,
          website: settings.companyWebsite,
          bankAccounts: settings.bankAccounts,
          fiscalConfig: (settings as any).fiscalConfig,
          commissionConfig: {
            preaPercentOfTotal: Number(settings.preaPercentOfTotal),
            agentPercentOfRemaining: Number(settings.agentPercentOfRemaining),
            agencyPercentOfRemaining: Number(settings.agencyPercentOfRemaining),
            vatPercentOnCommission: Number((settings as any).vatPercentOnCommission)
          },
          rentReceivableOpeningBalance: Number((settings as any).rentReceivableOpeningBalance || 0),
          levyReceivableOpeningBalance: Number((settings as any).levyReceivableOpeningBalance || 0),
        };

        if (includeCutover2) {
          companyUpdateData.receivablesCutover = { year: cutoverYearVal2, month: cutoverMonthVal2 };
        }

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
      <Typography variant="h4" gutterBottom sx={{ minHeight: 40 }}>
        Settings
      </Typography>

      <Box sx={{ minHeight: 56, mb: 2 }}>
        {message ? (
          <Alert 
            severity={message.type}
            onClose={() => setMessage(null)}
          >
            {message.text}
          </Alert>
        ) : null}
      </Box>

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
          <Tab label="Fiscalization" />
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
              <FormControl fullWidth margin="normal">
                <InputLabel>Plan</InputLabel>
                <Select
                  name="plan"
                  value={(settings as any).plan || 'ENTERPRISE'}
                  onChange={handleSelectChange}
                  label="Plan"
                >
                  <MenuItem value="INDIVIDUAL">Individual (up to 10 properties)</MenuItem>
                  <MenuItem value="SME">SME (up to 25 properties)</MenuItem>
                  <MenuItem value="ENTERPRISE">Enterprise (unlimited)</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth margin="normal">
                <InputLabel>Billing Cycle</InputLabel>
                <Select
                  name="cycle"
                  value={(settings as any).cycle || 'monthly'}
                  onChange={handleSelectChange}
                  label="Billing Cycle"
                >
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="yearly">Yearly</MenuItem>
                </Select>
              </FormControl>
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
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" gutterBottom>
                Receivables Cutover & Opening Balances
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Cutover Month</InputLabel>
                    <Select
                      name="receivablesCutoverMonth"
                      value={(settings as any).receivablesCutoverMonth ?? ''}
                      onChange={handleSelectChange}
                      label="Cutover Month"
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {[
                        'January','February','March','April','May','June','July','August','September','October','November','December'
                      ].map((m, idx) => (
                        <MenuItem key={m} value={idx + 1}>{m}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Cutover Year"
                    name="receivablesCutoverYear"
                    value={(settings as any).receivablesCutoverYear ?? ''}
                    onChange={handleInputChange}
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Rental Receivables Opening Balance"
                    name="rentReceivableOpeningBalance"
                    value={(settings as any).rentReceivableOpeningBalance || 0}
                    onChange={handleInputChange}
                    margin="normal"
                    inputProps={{ step: 0.01, min: 0 }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Levy Receivables Opening Balance"
                    name="levyReceivableOpeningBalance"
                    value={(settings as any).levyReceivableOpeningBalance || 0}
                    onChange={handleInputChange}
                    margin="normal"
                    inputProps={{ step: 0.01, min: 0 }}
                  />
                </Grid>
              </Grid>
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
          <TextField
            fullWidth
            type="number"
            label="VAT on commission (0-1)"
            name="vatPercentOnCommission"
            value={(settings as any).vatPercentOnCommission}
            onChange={handleInputChange}
            margin="normal"
            inputProps={{ step: 0.01, min: 0, max: 1 }}
            helperText="Applied to total commission for sales owner payout"
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

        {/* Fiscalization Settings */}
        <TabPanel value={activeTab} index={7}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Fiscalization (ZIMRA/Agent)
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Configure fiscalization provider or agent details to enable fiscal tax invoices.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean((settings as any)?.fiscalConfig?.enabled)}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setSettings(prev => ({
                        ...prev,
                        fiscalConfig: {
                          ...(prev as any).fiscalConfig,
                          enabled
                        }
                      }));
                    }}
                    name="fiscalEnabled"
                  />
                }
                label="Enable Fiscalization"
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Button variant="outlined" size="small" onClick={checkFiscalConnection} disabled={checkingFiscal || !company?._id}>
                  {checkingFiscal ? 'Testing...' : 'Test Connection'}
                </Button>
              </Box>
              <Box sx={{ mt: 2 }}>
                {fiscalHealth && fiscalHealth.status !== 'error' && (
                  <Alert severity={!((settings as any)?.fiscalConfig?.enabled) ? 'warning' : (fiscalHealth.connected ? 'success' : (fiscalHealth.reason ? 'warning' : 'error'))}>
                    {!(settings as any)?.fiscalConfig?.enabled && 'Fiscalization is disabled.'}
                    {(settings as any)?.fiscalConfig?.enabled && (
                      <>
                        {fiscalHealth.connected ? 'Connected to fiscal agent.' : 'Not connected to fiscal agent.'}
                        {fiscalHealth.details?.fdmsBaseUrl ? ` Agent: ${fiscalHealth.details.fdmsBaseUrl}` : ''}
                        {fiscalHealth.details?.deviceSerial ? ` Device: ${fiscalHealth.details.deviceSerial}` : ''}
                        {fiscalHealth.details?.error ? ` (${fiscalHealth.details.error})` : ''}
                      </>
                    )}
                  </Alert>
                )}
                {fiscalHealth && fiscalHealth.status === 'error' && (
                  <Alert severity="error">{fiscalHealth.message || 'Failed to check fiscal health'}</Alert>
                )}
              </Box>
              <TextField
                fullWidth
                label="Provider/Integrator Name"
                value={(settings as any).fiscalConfig?.providerName || ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fiscalConfig: { ...(prev as any).fiscalConfig, providerName: e.target.value }
                }))}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Agent Name (optional)"
                value={(settings as any).fiscalConfig?.agentName || ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fiscalConfig: { ...(prev as any).fiscalConfig, agentName: e.target.value }
                }))}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Fiscal Device Serial/ID"
                value={(settings as any).fiscalConfig?.deviceSerial || ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fiscalConfig: { ...(prev as any).fiscalConfig, deviceSerial: e.target.value }
                }))}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="FDMS/Agent Base URL"
                placeholder="https://api.example-agent.co.zw"
                value={(settings as any).fiscalConfig?.fdmsBaseUrl || ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fiscalConfig: { ...(prev as any).fiscalConfig, fdmsBaseUrl: e.target.value }
                }))}
                margin="normal"
              />
              <TextField
                fullWidth
                label="API Key"
                value={(settings as any).fiscalConfig?.apiKey || ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fiscalConfig: { ...(prev as any).fiscalConfig, apiKey: e.target.value }
                }))}
                margin="normal"
              />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="API Username"
                    value={(settings as any).fiscalConfig?.apiUsername || ''}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      fiscalConfig: { ...(prev as any).fiscalConfig, apiUsername: e.target.value }
                    }))}
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="API Password"
                    type="password"
                    value={(settings as any).fiscalConfig?.apiPassword || ''}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      fiscalConfig: { ...(prev as any).fiscalConfig, apiPassword: e.target.value }
                    }))}
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info">
                These details are provided by your fiscalization agent/integrator. Enabling fiscalization will require network access to the agent gateway when generating invoices.
              </Alert>
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