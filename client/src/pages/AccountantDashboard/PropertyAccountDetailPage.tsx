import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  CircularProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Payment as PaymentIcon,
  History as HistoryIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Pending as PendingIcon
} from '@mui/icons-material';
import { usePropertyService } from '../../services/propertyService';
import { propertyAccountService, PropertyAccount, Transaction, OwnerPayout, ExpenseData, PayoutData } from '../../services/propertyAccountService';
import { useAuth } from '../../contexts/AuthContext';
import { usePropertyOwnerService, PropertyOwner } from '../../services/propertyOwnerService';

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
      id={`property-account-tabpanel-${index}`}
      aria-labelledby={`property-account-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PropertyAccountDetailPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { user } = useAuth();
  const { getProperties } = usePropertyService();
  const { getAllPublic: getAllPropertyOwners } = usePropertyOwnerService();
  
  // State
  const [property, setProperty] = useState<any>(null);
  const [account, setAccount] = useState<PropertyAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});
  
  // Dialog states
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [expenseData, setExpenseData] = useState<ExpenseData>({
    amount: 0,
    date: new Date(),
    description: '',
    category: 'general',
    notes: ''
  });
  const [payoutData, setPayoutData] = useState<PayoutData>({
    amount: 0,
    paymentMethod: 'bank_transfer',
    recipientId: '',
    recipientName: '',
    notes: ''
  });
  
  // Form states
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!propertyId) return;
      
      setLoading(true);
      setError(null);
      try {
        // Fetch property details, property account, and property owners in parallel
        const [props, accountData, propertyOwners] = await Promise.all([
          getProperties(),
          propertyAccountService.getPropertyAccount(propertyId),
          getAllPropertyOwners().catch(err => {
            console.error('Error fetching property owners:', err);
            return [];
          })
        ]);
        
        const found = props.find((p: any) => p._id === propertyId);
        setProperty(found || null);
        setAccount(accountData);
        
        // Map propertyId to owner name using owner.properties array (same as PropertyAccountsPage)
        const ownerMap: Record<string, string> = {};
        console.log('Property owners fetched:', propertyOwners.length);
        
        propertyOwners.forEach((owner: PropertyOwner) => {
          console.log(`Owner ${owner._id}: ${owner.firstName} ${owner.lastName}`);
          console.log('Owner properties:', owner.properties);
          
          // Check if owner has properties array
          if (owner.properties && Array.isArray(owner.properties)) {
            owner.properties.forEach((propertyId: any) => {
              // Handle both string and ObjectId formats
              const propId = typeof propertyId === 'object' && propertyId.$oid ? propertyId.$oid : propertyId;
              console.log(`Checking property ${propId} for owner ${owner.firstName} ${owner.lastName}`);
              ownerMap[propId] = `${owner.firstName} ${owner.lastName}`;
              console.log(`Mapped property ${propId} to owner ${owner.firstName} ${owner.lastName}`);
            });
          }
        });
        console.log('Final owner map:', ownerMap);
        setOwnerMap(ownerMap);
        
      } catch (err: any) {
        setError(err.message || 'Failed to fetch property account data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [propertyId]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleAddExpense = async () => {
    if (!propertyId) return;
    
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    
    try {
      const updatedAccount = await propertyAccountService.addExpense(propertyId, expenseData);
      setAccount(updatedAccount);
      setExpenseDialogOpen(false);
      setExpenseData({
        amount: 0,
        date: new Date(),
        description: '',
        category: 'general',
        notes: ''
      });
      setSuccess('Expense added successfully!');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePayout = async () => {
    if (!propertyId) return;
    
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    
    try {
      const result = await propertyAccountService.createOwnerPayout(propertyId, payoutData);
      setAccount(result.account);
      setPayoutDialogOpen(false);
      setPayoutData({
        amount: 0,
        paymentMethod: 'bank_transfer',
        recipientId: '',
        recipientName: '',
        notes: ''
      });
      setSuccess('Owner payout created successfully!');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create payout');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPayoutDialog = () => {
    // Pre-populate recipient information from account
    setPayoutData({
      ...payoutData,
      recipientId: account?.ownerId || '',
      recipientName: ownerMap[propertyId!] || account?.ownerName || ''
    });
    setPayoutDialogOpen(true);
  };

  const handleUpdatePayoutStatus = async (payoutId: string, status: 'completed' | 'failed' | 'cancelled') => {
    if (!propertyId) return;
    
    try {
      const updatedAccount = await propertyAccountService.updatePayoutStatus(propertyId, payoutId, status);
      setAccount(updatedAccount);
      setSuccess(`Payout status updated to ${status}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to update payout status');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'pending':
        return <PendingIcon color="warning" />;
      case 'failed':
        return <CancelIcon color="error" />;
      case 'cancelled':
        return <CancelIcon color="disabled" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !property) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'Property not found'}</Alert>
      </Box>
    );
  }

  if (!account) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          No account data available for this property. The account will be created automatically when the first payment is recorded.
        </Alert>
      </Box>
    );
  }

  const { transactions, finalBalance } = propertyAccountService.calculateRunningBalance(account.transactions);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={600} gutterBottom>
          {property.name}
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          {property.address}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Owner: {ownerMap[propertyId!] || account.ownerName || 'Unknown'}
        </Typography>
        {account.ownerId && (
          <Typography variant="body2" color="text.secondary">
            Owner ID: {account.ownerId}
          </Typography>
        )}
      </Box>

      {/* Success/Error Messages */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <AccountBalanceIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Current Balance</Typography>
              </Box>
              <Typography variant="h4" color="primary" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(account.runningBalance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Income</Typography>
              </Box>
              <Typography variant="h4" color="success.main" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(account.totalIncome)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <TrendingDownIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Expenses</Typography>
              </Box>
              <Typography variant="h4" color="error.main" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(account.totalExpenses)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <PaymentIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Payouts</Typography>
              </Box>
              <Typography variant="h4" color="info.main" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(account.totalOwnerPayouts)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Owner Information Card */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Property Owner Information
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Name:</strong> {ownerMap[propertyId!] || account.ownerName || 'Unknown'}
              </Typography>
              {account.ownerId && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Owner ID:</strong> {account.ownerId}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                <strong>Property:</strong> {property.name}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setExpenseDialogOpen(true)}
          sx={{ mr: 2 }}
        >
          Add Expense
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<PaymentIcon />}
          onClick={handleOpenPayoutDialog}
          disabled={account.runningBalance <= 0}
        >
          Pay Owner
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Transactions" />
          <Tab label="Owner Payouts" />
          <Tab label="Summary" />
        </Tabs>
      </Box>

      {/* Transactions Tab */}
      <TabPanel value={tabValue} index={0}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Balance</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((transaction, index) => (
                <TableRow key={index}>
                  <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      label={propertyAccountService.getTransactionTypeLabel(transaction.type)}
                      color={transaction.type === 'income' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{transaction.description}</TableCell>
                  <TableCell>
                    <Typography
                      color={transaction.type === 'income' ? 'success.main' : 'error.main'}
                    >
                      {transaction.type === 'income' ? '+' : '-'}
                      {propertyAccountService.formatCurrency(transaction.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>{propertyAccountService.formatCurrency(transaction.runningBalance || 0)}</TableCell>
                  <TableCell>
                    <Chip
                      label={transaction.status}
                      color={transaction.status === 'completed' ? 'success' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Owner Payouts Tab */}
      <TabPanel value={tabValue} index={1}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Recipient</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {account.ownerPayouts.map((payout) => (
                <TableRow key={payout._id}>
                  <TableCell>{new Date(payout.date).toLocaleDateString()}</TableCell>
                  <TableCell>{payout.referenceNumber}</TableCell>
                  <TableCell>{payout.recipientName}</TableCell>
                  <TableCell>{propertyAccountService.formatCurrency(payout.amount)}</TableCell>
                  <TableCell>{propertyAccountService.getPaymentMethodLabel(payout.paymentMethod)}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      {getStatusIcon(payout.status)}
                      <Typography sx={{ ml: 1 }}>{payout.status}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {payout.status === 'pending' && (
                      <Box>
                        <Tooltip title="Mark as Completed">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => handleUpdatePayoutStatus(payout._id!, 'completed')}
                          >
                            <CheckCircleIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Mark as Failed">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleUpdatePayoutStatus(payout._id!, 'failed')}
                          >
                            <CancelIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Summary Tab */}
      <TabPanel value={tabValue} index={2}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Account Summary</Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Last Income: {account.lastIncomeDate ? new Date(account.lastIncomeDate).toLocaleDateString() : 'Never'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Expense: {account.lastExpenseDate ? new Date(account.lastExpenseDate).toLocaleDateString() : 'Never'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Payout: {account.lastPayoutDate ? new Date(account.lastPayoutDate).toLocaleDateString() : 'Never'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Quick Actions</Typography>
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    fullWidth
                    sx={{ mb: 1 }}
                    onClick={() => setExpenseDialogOpen(true)}
                  >
                    Add Expense
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    sx={{ mb: 1 }}
                    onClick={handleOpenPayoutDialog}
                    disabled={account.runningBalance <= 0}
                  >
                    Pay Owner
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Add Expense Dialog */}
      <Dialog open={expenseDialogOpen} onClose={() => setExpenseDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Expense</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount"
                type="number"
                value={expenseData.amount}
                onChange={(e) => setExpenseData({ ...expenseData, amount: Number(e.target.value) })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date"
                type="date"
                value={expenseData.date.toISOString().split('T')[0]}
                onChange={(e) => setExpenseData({ ...expenseData, date: new Date(e.target.value) })}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={expenseData.description}
                onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={expenseData.category}
                  onChange={(e) => setExpenseData({ ...expenseData, category: e.target.value })}
                  label="Category"
                >
                  <MenuItem value="general">General</MenuItem>
                  <MenuItem value="repair">Repair</MenuItem>
                  <MenuItem value="maintenance">Maintenance</MenuItem>
                  <MenuItem value="utilities">Utilities</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={expenseData.notes}
                onChange={(e) => setExpenseData({ ...expenseData, notes: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddExpense} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Add Expense'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Payout Dialog */}
      <Dialog open={payoutDialogOpen} onClose={() => setPayoutDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Pay Property Owner</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount"
                type="number"
                value={payoutData.amount}
                onChange={(e) => setPayoutData({ ...payoutData, amount: Number(e.target.value) })}
                fullWidth
                required
                helperText={`Available balance: ${propertyAccountService.formatCurrency(account.runningBalance)}`}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Payment Method</InputLabel>
                <Select
                  value={payoutData.paymentMethod}
                  onChange={(e) => setPayoutData({ ...payoutData, paymentMethod: e.target.value as any })}
                  label="Payment Method"
                >
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="mobile_money">Mobile Money</MenuItem>
                  <MenuItem value="check">Check</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Recipient Name"
                value={payoutData.recipientName}
                onChange={(e) => setPayoutData({ ...payoutData, recipientName: e.target.value })}
                fullWidth
                required
                helperText="Pre-populated with property owner name"
                InputProps={{
                  readOnly: false,
                  style: { backgroundColor: payoutData.recipientName === (propertyId ? ownerMap[propertyId] || account?.ownerName : account?.ownerName) ? '#f5f5f5' : 'white' }
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={payoutData.notes}
                onChange={(e) => setPayoutData({ ...payoutData, notes: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayoutDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreatePayout} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Create Payout'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PropertyAccountDetailPage; 