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
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  CircularProgress,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  SelectChangeEvent,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Language as LanguageIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Home as HomeIcon,
  Email as EmailIcon,
  CreditCard as CreditCardIcon,
  StorageOutlined as StorageOutlinedIcon,
  Assessment as AssessmentIcon,
  Api as ApiIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import { apiService } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';

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
      id={`admin-settings-tabpanel-${index}`}
      aria-labelledby={`admin-settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'agent' | 'accountant' | 'owner';
  password: string;
}

const ROLES = [
  {
    id: 'admin',
    name: 'admin',
    description: 'Administrator with full system access'
  },
  {
    id: 'agent',
    name: 'agent',
    description: 'Property agent with property management access'
  },
  {
    id: 'accountant',
    name: 'accountant',
    description: 'Accountant with financial management access'
  },
  {
    id: 'owner',
    name: 'owner',
    description: 'Property owner with owner-specific access'
  }
];

export const AdminSettings: React.FC = () => {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { company, loading: companyLoading, fetchCompany } = useCompany();
  const [tab, setTab] = useState(0);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
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
  const [companyData, setCompanyData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    registrationNumber: '',
    taxNumber: '',
  });
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [propertyDefaults, setPropertyDefaults] = useState({
    leaseTerms: {
      paymentFrequency: 'monthly',
      depositPolicy: '1 month',
      lateFeeRules: '5% after 5 days',
    },
    maintenanceRules: {
      autoApprovalLimit: 100,
      requireQuotes: true,
    },
    categories: [],
  });
  const [communicationSettings, setCommunicationSettings] = useState({
    emailTemplates: [],
    smsTemplates: [],
    autoReminders: {
      rentDue: true,
      leaseRenewal: true,
      maintenanceUpdates: true,
    },
  });
  const [billingInfo, setBillingInfo] = useState({
    plan: 'basic',
    usage: {
      properties: 0,
      users: 0,
      storage: 0,
    },
    paymentMethod: null,
  });
  const [fileSettings, setFileSettings] = useState({
    quota: 1000, // MB
    allowedTypes: ['pdf', 'doc', 'docx', 'jpg', 'png'],
    retentionRules: {
      documents: '7 years',
      images: '2 years',
    },
  });
  const [reportSettings, setReportSettings] = useState({
    scheduling: {
      ownerStatements: 'monthly',
      agentPerformance: 'quarterly',
    },
    exportFormats: ['pdf', 'excel', 'csv'],
    kpiPreferences: ['occupancy', 'revenue', 'maintenance'],
  });
  const [apiSettings, setApiSettings] = useState({
    keys: [],
    webhooks: [],
    integrations: {
      accounting: [],
      payment: [],
      communication: [],
    },
  });
  const [users, setUsers] = useState<any[]>([]);
  const [openUserDialog, setOpenUserDialog] = useState(false);
  const [userFormData, setUserFormData] = useState<UserFormData>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'agent',
    password: '',
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

  useEffect(() => {
    if (company) {
      setCompanyData({
        name: company.name || '',
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        website: company.website || '',
        registrationNumber: company.registrationNumber || '',
        taxNumber: company.taxNumber || '',
      });
    }
  }, [company]);

  useEffect(() => {
    if (user?.role === 'admin' && isAuthenticated) {
      fetchUsers();
    }
  }, [user, isAuthenticated]);

  const fetchUsers = async () => {
    try {
      const response = await apiService.getUsers();
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage({
        type: 'error',
        text: 'Failed to fetch users. Please ensure you are logged in.',
      });
    }
  };

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

  const handleCompanyUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?._id) {
      setMessage({
        type: 'error',
        text: 'Company information not found.',
      });
      return;
    }

    try {
      setLoading(true);
      await apiService.updateCompany(companyData);
      await fetchCompany(); // Refresh company data
      setMessage({
        type: 'success',
        text: 'Company information updated successfully',
      });
    } catch (error) {
      console.error('Error updating company:', error);
      setMessage({
        type: 'error',
        text: 'Error updating company information. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenUserDialog = () => {
    setUserFormData({
      firstName: '',
      lastName: '',
      email: '',
      role: 'agent',
      password: '',
    });
    setOpenUserDialog(true);
  };

  const handleCloseUserDialog = () => {
    setOpenUserDialog(false);
  };

  const handleUserInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setUserFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleUserRoleChange = (event: SelectChangeEvent) => {
    setUserFormData(prev => ({
      ...prev,
      role: event.target.value as UserFormData['role'],
    }));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const userData = {
        ...userFormData,
        companyId: company?._id
      };
      const response = await apiService.createUser(userData);
      setUsers(prevUsers => [...prevUsers, response.data]);
      setMessage({
        type: 'success',
        text: 'User created successfully',
      });
      handleCloseUserDialog();
    } catch (error) {
      console.error('Error creating user:', error);
      setMessage({
        type: 'error',
        text: 'Failed to create user. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async () => {
    if (!selectedLogo || !company?._id) {
      setMessage({ type: 'error', text: 'Please select a logo file' });
      return;
    }

    setLogoLoading(true);
    try {
      const formData = new FormData();
      formData.append('logo', selectedLogo);

      await apiService.uploadCompanyLogo(company._id, formData);
      
      setMessage({ type: 'success', text: 'Logo uploaded successfully' });
      setSelectedLogo(null);
      setLogoPreview(null);
      
      // Refresh company data to get the new logo
      await fetchCompany();
    } catch (error) {
      console.error('Error uploading logo:', error);
      setMessage({ 
        type: 'error', 
        text: 'Error uploading logo. Please try again.' 
      });
    } finally {
      setLogoLoading(false);
    }
  };

  const handleLogoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setMessage({ type: 'error', text: 'Please select an image file' });
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'File size must be less than 5MB' });
        return;
      }

      setSelectedLogo(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (authLoading || companyLoading) {
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
    <>
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
            <Tab icon={<BusinessIcon />} label="Company" />
            <Tab icon={<HomeIcon />} label="Properties" />
            <Tab icon={<PeopleIcon />} label="Users" />
            <Tab icon={<EmailIcon />} label="Communication" />
            <Tab icon={<CreditCardIcon />} label="Billing" />
            <Tab icon={<StorageOutlinedIcon />} label="Files" />
            <Tab icon={<AssessmentIcon />} label="Reports" />
            <Tab icon={<ApiIcon />} label="API" />
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

          <TabPanel value={tab} index={4}>
            <form onSubmit={handleCompanyUpdate}>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>
                    Company Information
                  </Typography>
                </Grid>

                {/* Company Logo Section */}
                <Grid item xs={12}>
                  <Box sx={{ mb: 3, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      Company Logo
                    </Typography>
                    
                    {/* Current Logo Display */}
                    {company?.logo && (
                      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2" color="textSecondary">
                          Current Logo:
                        </Typography>
                        <Avatar
                          src={`data:image/png;base64,${company.logo}`}
                          sx={{ width: 60, height: 60 }}
                          variant="rounded"
                        />
                      </Box>
                    )}

                    {/* Logo Upload */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <input
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="admin-logo-file-input"
                        type="file"
                        onChange={handleLogoSelect}
                      />
                      <label htmlFor="admin-logo-file-input">
                        <Button
                          variant="outlined"
                          component="span"
                          startIcon={<CloudUploadIcon />}
                          disabled={logoLoading}
                        >
                          Select Logo
                        </Button>
                      </label>
                      
                      {selectedLogo && (
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={handleLogoUpload}
                          disabled={logoLoading}
                          startIcon={logoLoading ? <CircularProgress size={20} /> : null}
                        >
                          {logoLoading ? 'Uploading...' : 'Upload Logo'}
                        </Button>
                      )}
                    </Box>

                    {/* Logo Preview */}
                    {logoPreview && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                          Preview:
                        </Typography>
                        <Avatar
                          src={logoPreview}
                          sx={{ width: 80, height: 80 }}
                          variant="rounded"
                        />
                      </Box>
                    )}

                    <Typography variant="caption" color="textSecondary">
                      Supported formats: JPG, PNG, GIF. Maximum size: 5MB.
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Company Name"
                    value={companyData.name}
                    onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                    required
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Registration Number"
                    value={companyData.registrationNumber}
                    onChange={(e) => setCompanyData({ ...companyData, registrationNumber: e.target.value })}
                    required
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Tax Number"
                    value={companyData.taxNumber}
                    onChange={(e) => setCompanyData({ ...companyData, taxNumber: e.target.value })}
                    required
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Company Email"
                    type="email"
                    value={companyData.email}
                    onChange={(e) => setCompanyData({ ...companyData, email: e.target.value })}
                    required
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Company Phone"
                    value={companyData.phone}
                    onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
                    required
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Website"
                    value={companyData.website}
                    onChange={(e) => setCompanyData({ ...companyData, website: e.target.value })}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Company Address"
                    multiline
                    rows={3}
                    value={companyData.address}
                    onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                    required
                  />
                </Grid>

                <Grid item xs={12}>
                  <Button 
                    type="submit" 
                    variant="contained" 
                    color="primary"
                    disabled={loading}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Update Company Information'}
                  </Button>
                </Grid>
              </Grid>
            </form>
          </TabPanel>

          <TabPanel value={tab} index={5}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Property Defaults
                  </Typography>
                  {user?.role === 'admin' && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      onClick={() => {/* Handle add property default */}}
                    >
                      Add New Property Default
                    </Button>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell key="name-header">Name</TableCell>
                        <TableCell key="value-header">Value</TableCell>
                        <TableCell key="actions-header">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[].map((defaultItem: any, index: number) => (
                        <TableRow key={`property-default-${index}`}>
                          <TableCell>{defaultItem.name}</TableCell>
                          <TableCell>{defaultItem.value}</TableCell>
                          <TableCell>
                            {user?.role === 'admin' && (
                              <>
                                <IconButton size="small" color="primary">
                                  <EditIcon />
                                </IconButton>
                                <IconButton size="small" color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={6}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    User Management
                  </Typography>
                  {user?.role === 'admin' && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      onClick={handleOpenUserDialog}
                    >
                      Add New User
                    </Button>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell key="name-header">Name</TableCell>
                        <TableCell key="email-header">Email</TableCell>
                        <TableCell key="role-header">Role</TableCell>
                        <TableCell key="status-header">Status</TableCell>
                        <TableCell key="actions-header">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.map((user, index) => (
                        <TableRow key={`user-${user._id || index}`}>
                          <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.role}</TableCell>
                          <TableCell>{user.isActive ? 'Active' : 'Inactive'}</TableCell>
                          <TableCell>
                            <IconButton size="small" color="primary">
                              <EditIcon />
                            </IconButton>
                            <IconButton size="small" color="error">
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={7}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Communication Settings
                  </Typography>
                  {user?.role === 'admin' && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      onClick={() => {/* Handle add communication setting */}}
                    >
                      Add New Communication Setting
                    </Button>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell key="name-header">Name</TableCell>
                        <TableCell key="value-header">Value</TableCell>
                        <TableCell key="actions-header">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[].map((setting: any, index: number) => (
                        <TableRow key={`communication-setting-${index}`}>
                          <TableCell>{setting.name}</TableCell>
                          <TableCell>{setting.value}</TableCell>
                          <TableCell>
                            {user?.role === 'admin' && (
                              <>
                                <IconButton size="small" color="primary">
                                  <EditIcon />
                                </IconButton>
                                <IconButton size="small" color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={8}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Billing & Subscription
                  </Typography>
                  {user?.role === 'admin' && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      onClick={() => {/* Handle add billing plan */}}
                    >
                      Add New Billing Plan
                    </Button>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell key="name-header">Name</TableCell>
                        <TableCell key="value-header">Value</TableCell>
                        <TableCell key="actions-header">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[].map((info: any, index: number) => (
                        <TableRow key={`billing-info-${index}`}>
                          <TableCell>{info.name}</TableCell>
                          <TableCell>{info.value}</TableCell>
                          <TableCell>
                            {user?.role === 'admin' && (
                              <>
                                <IconButton size="small" color="primary">
                                  <EditIcon />
                                </IconButton>
                                <IconButton size="small" color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={9}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    File Management
                  </Typography>
                  {user?.role === 'admin' && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      onClick={() => {/* Handle add file setting */}}
                    >
                      Add New File Setting
                    </Button>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell key="name-header">Name</TableCell>
                        <TableCell key="value-header">Value</TableCell>
                        <TableCell key="actions-header">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[].map((setting: any, index: number) => (
                        <TableRow key={`file-setting-${index}`}>
                          <TableCell>{setting.name}</TableCell>
                          <TableCell>{setting.value}</TableCell>
                          <TableCell>
                            {user?.role === 'admin' && (
                              <>
                                <IconButton size="small" color="primary">
                                  <EditIcon />
                                </IconButton>
                                <IconButton size="small" color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={10}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Reporting & Metrics
                  </Typography>
                  {user?.role === 'admin' && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      onClick={() => {/* Handle add report setting */}}
                    >
                      Add New Report Setting
                    </Button>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell key="name-header">Name</TableCell>
                        <TableCell key="value-header">Value</TableCell>
                        <TableCell key="actions-header">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[].map((setting: any, index: number) => (
                        <TableRow key={`report-setting-${index}`}>
                          <TableCell>{setting.name}</TableCell>
                          <TableCell>{setting.value}</TableCell>
                          <TableCell>
                            {user?.role === 'admin' && (
                              <>
                                <IconButton size="small" color="primary">
                                  <EditIcon />
                                </IconButton>
                                <IconButton size="small" color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={11}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    API & Integrations
                  </Typography>
                  {user?.role === 'admin' && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<AddIcon />}
                      onClick={() => {/* Handle add API setting */}}
                    >
                      Add New API Setting
                    </Button>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12}>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell key="name-header">Name</TableCell>
                        <TableCell key="value-header">Value</TableCell>
                        <TableCell key="actions-header">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[].map((setting: any, index: number) => (
                        <TableRow key={`api-setting-${index}`}>
                          <TableCell>{setting.name}</TableCell>
                          <TableCell>{setting.value}</TableCell>
                          <TableCell>
                            {user?.role === 'admin' && (
                              <>
                                <IconButton size="small" color="primary">
                                  <EditIcon />
                                </IconButton>
                                <IconButton size="small" color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>
        </Paper>
      </Box>
      {/* Add User Dialog */}
      <Dialog open={openUserDialog} onClose={handleCloseUserDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <form onSubmit={handleCreateUser}>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                name="firstName"
                label="First Name"
                value={userFormData.firstName}
                onChange={handleUserInputChange}
                required
                fullWidth
              />
              <TextField
                name="lastName"
                label="Last Name"
                value={userFormData.lastName}
                onChange={handleUserInputChange}
                required
                fullWidth
              />
              <TextField
                name="email"
                label="Email"
                type="email"
                value={userFormData.email}
                onChange={handleUserInputChange}
                required
                fullWidth
              />
              <TextField
                name="password"
                label="Password"
                type="password"
                value={userFormData.password}
                onChange={handleUserInputChange}
                required
                fullWidth
              />
              <FormControl fullWidth required>
                <InputLabel>Role</InputLabel>
                <Select
                  name="role"
                  value={userFormData.role}
                  onChange={handleUserRoleChange}
                  label="Role"
                >
                  {ROLES.map((role) => (
                    <MenuItem key={role.id} value={role.name}>
                      {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseUserDialog}>Cancel</Button>
            <Button 
              type="submit" 
              variant="contained" 
              color="primary"
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Create User'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}; 