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
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Payment as PaymentIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Pending as PendingIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import { agentAccountService, AgentAccount, Transaction, AgentPayout, PenaltyData, PayoutData } from '../../services/agentAccountService';
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
      id={`agent-account-tabpanel-${index}`}
      aria-labelledby={`agent-account-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const AgentAccountDetailPage: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const { user, company } = useAuth();
  
  // State
  const [account, setAccount] = useState<AgentAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  
  // Dialog states
  const [penaltyDialogOpen, setPenaltyDialogOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [penaltyData, setPenaltyData] = useState<PenaltyData>({
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
      if (!agentId) return;
      
      setLoading(true);
      setError(null);
      try {
        const accountData = await agentAccountService.getAgentAccount(agentId);
        setAccount(accountData);
        
      } catch (err: any) {
        setError(err.message || 'Failed to fetch agent account data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [agentId]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleAddPenalty = async () => {
    if (!agentId) return;
    
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    
    try {
      const updatedAccount = await agentAccountService.addPenalty(agentId, penaltyData);
      setAccount(updatedAccount);
      setPenaltyDialogOpen(false);
      setPenaltyData({
        amount: 0,
        date: new Date(),
        description: '',
        category: 'general',
        notes: ''
      });
      setSuccess('Penalty added successfully!');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to add penalty');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePayout = async () => {
    if (!agentId) return;
    
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    
    try {
      const result = await agentAccountService.createAgentPayout(agentId, payoutData);
      setAccount(result.account);
      setPayoutDialogOpen(false);
      setPayoutData({
        amount: 0,
        paymentMethod: 'bank_transfer',
        recipientId: '',
        recipientName: '',
        notes: ''
      });
      setSuccess('Agent payout created successfully!');
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
      recipientId: account?.agentId || '',
      recipientName: account?.agentName || ''
    });
    setPayoutDialogOpen(true);
  };

  const handleUpdatePayoutStatus = async (payoutId: string, status: 'completed' | 'failed' | 'cancelled') => {
    if (!agentId) return;
    
    try {
      const updatedAccount = await agentAccountService.updatePayoutStatus(agentId, payoutId, status);
      setAccount(updatedAccount);
      setSuccess(`Payout status updated to ${status}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to update payout status');
    }
  };

  const handlePrintPayoutAcknowledgement = (payout: AgentPayout) => {
    try {
      const companyName = (company as any)?.name || 'Company';
      const companyAddress = (company as any)?.address || '';
      const companyEmail = (company as any)?.email || '';
      const companyPhone = (company as any)?.phone || '';
      const logoRaw = (company as any)?.logo || '';
      const logoSrc = logoRaw ? (logoRaw.startsWith('data:') ? logoRaw : `data:image/png;base64,${logoRaw}`) : '';
      const agentName = account?.agentName || payout.recipientName || 'Agent';
      const amountFmt = agentAccountService.formatCurrency(payout.amount);
      const dateStr = new Date(payout.date).toLocaleDateString();
      const ref = payout.referenceNumber || payout._id || '';
      const methodLabel = agentAccountService.getPaymentMethodLabel(payout.paymentMethod);
      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Acknowledgment of Receipt</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
      .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
      .logo { height: 56px; object-fit: contain; }
      .brand { font-size: 20px; font-weight: 700; }
      .sub { color: #666; font-size: 12px; }
      .title { text-align: center; margin: 16px 0 24px; font-size: 18px; font-weight: 700; text-transform: uppercase; }
      .row { display: flex; justify-content: space-between; margin: 8px 0; }
      .label { color: #444; }
      .box { border: 1px solid #ccc; padding: 16px; border-radius: 6px; }
      .amount { font-size: 22px; font-weight: 700; color: #0a7; }
      .mt24 { margin-top: 24px; }
      .sign { margin-top: 48px; display: flex; gap: 48px; }
      .line { margin-top: 40px; border-top: 1px solid #333; width: 260px; padding-top: 6px; font-size: 12px; }
      @media print { .no-print { display: none; } body { margin: 0.6in; } }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="brand">${companyName}</div>
        <div class="sub">${companyAddress}</div>
        <div class="sub">${companyEmail}${companyPhone ? ' • ' + companyPhone : ''}</div>
      </div>
      ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="Logo" />` : ''}
    </div>
    <div class="title">Acknowledgment of Receipt</div>
    <div class="box">
      <div class="row"><div class="label">Received From</div><div>${companyName}</div></div>
      <div class="row"><div class="label">Received By (Agent)</div><div>${agentName}</div></div>
      <div class="row"><div class="label">Date</div><div>${dateStr}</div></div>
      <div class="row"><div class="label">Reference</div><div>${ref}</div></div>
      <div class="row"><div class="label">Payment Method</div><div>${methodLabel}</div></div>
      <div class="row"><div class="label">Amount</div><div class="amount">${amountFmt}</div></div>
      <div class="row mt24"><div class="label">Notes</div><div>${(payout.notes || '').toString()}</div></div>
    </div>
    <div class="sign">
      <div class="line">Agent Signature</div>
      <div class="line">Authorized By</div>
    </div>
    <div class="no-print" style="margin-top:24px;">
      <button onclick="window.print()" style="padding:8px 12px;">Print</button>
    </div>
  </body>
</html>`;
      const iframe = document.createElement('iframe') as HTMLIFrameElement;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const cleanup = () => setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500);
      const triggerPrint = () => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch {} cleanup(); };
      iframe.onload = triggerPrint;
      try {
        (iframe as any).srcdoc = html;
      } catch {
        const idoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!idoc) return;
        idoc.open(); idoc.write(html); idoc.close();
      }
    } catch (e) {
      console.error('Failed to open print window', e);
    }
  };

  const handleSyncCommissions = async () => {
    if (!agentId) return;
    
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    
    try {
      await agentAccountService.syncAgentCommissions(agentId);
      
      // Refresh the account data
      const updatedAccount = await agentAccountService.getAgentAccount(agentId);
      setAccount(updatedAccount);
      
      setSuccess('Commission transactions synced successfully!');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to sync commission transactions');
    } finally {
      setSubmitting(false);
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

  if (error || !account) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'Agent account not found'}</Alert>
      </Box>
    );
  }

  const { transactions, finalBalance } = agentAccountService.calculateRunningBalance(account.transactions);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={600} gutterBottom>
          {account.agentName}
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          {account.agentEmail}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Agent ID: {account.agentId}
        </Typography>
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
                {agentAccountService.formatCurrency(account.runningBalance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Commissions</Typography>
              </Box>
              <Typography variant="h4" color="success.main" sx={{ mt: 1 }}>
                {agentAccountService.formatCurrency(
                  account.commissionData?.reduce((sum, c) => sum + c.commissionDetails.agentShare, 0) || account.totalCommissions
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                From {account.commissionData?.length || 0} property payments
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <TrendingDownIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Payouts</Typography>
              </Box>
              <Typography variant="h4" color="error.main" sx={{ mt: 1 }}>
                {agentAccountService.formatCurrency(account.totalPayouts)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <PaymentIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Penalties</Typography>
              </Box>
              <Typography variant="h4" color="warning.main" sx={{ mt: 1 }}>
                {agentAccountService.formatCurrency(account.totalPenalties)}
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
          onClick={() => setPenaltyDialogOpen(true)}
          sx={{ mr: 2 }}
        >
          Add Penalty
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<PaymentIcon />}
          onClick={handleOpenPayoutDialog}
          disabled={account.runningBalance <= 0}
          sx={{ mr: 2 }}
        >
          Pay Agent
        </Button>
        <Button
          variant="outlined"
          startIcon={<TrendingUpIcon />}
          onClick={handleSyncCommissions}
          disabled={submitting}
        >
          Sync Commissions
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Transactions" />
          <Tab label="Agent Payouts" />
          <Tab label="Property Commissions" />
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
                      label={agentAccountService.getTransactionTypeLabel(transaction.type)}
                      color={transaction.type === 'commission' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{transaction.description}</TableCell>
                  <TableCell>
                    <Typography
                      color={transaction.type === 'commission' ? 'success.main' : 'error.main'}
                    >
                      {transaction.type === 'commission' ? '+' : '-'}
                      {agentAccountService.formatCurrency(transaction.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>{agentAccountService.formatCurrency(transaction.runningBalance || 0)}</TableCell>
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

      {/* Agent Payouts Tab */}
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
              {account.agentPayouts.map((payout) => (
                <TableRow key={payout._id}>
                  <TableCell>{new Date(payout.date).toLocaleDateString()}</TableCell>
                  <TableCell>{payout.referenceNumber}</TableCell>
                  <TableCell>{payout.recipientName}</TableCell>
                  <TableCell>{agentAccountService.formatCurrency(payout.amount)}</TableCell>
                  <TableCell>{agentAccountService.getPaymentMethodLabel(payout.paymentMethod)}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      {getStatusIcon(payout.status)}
                      <Typography sx={{ ml: 1 }}>{payout.status}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      {payout.status === 'pending' && (
                        <>
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
                        </>
                      )}
                      {payout.status === 'completed' && (
                        <Tooltip title="Print acknowledgment">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handlePrintPayoutAcknowledgement(payout)}
                          >
                            <PrintIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Property Commissions Tab */}
      <TabPanel value={tabValue} index={2}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Property</TableCell>
                <TableCell>Tenant</TableCell>
                <TableCell>Payment Type</TableCell>
                <TableCell>Total Amount</TableCell>
                <TableCell>Agent Share</TableCell>
                <TableCell>Reference</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {account.commissionData && account.commissionData.length > 0 ? (
                account.commissionData.map((commission) => {
                  const propertyName = (commission as any)?.propertyId?.propertyName || (commission as any)?.propertyId?.name || (commission as any)?.manualPropertyAddress || 'N/A';
                  const propertyAddress = (commission as any)?.propertyId?.address || '';
                  const tenantFirst = (commission as any)?.tenantId?.firstName;
                  const tenantLast = (commission as any)?.tenantId?.lastName;
                  const tenantName = (tenantFirst && tenantLast) ? `${tenantFirst} ${tenantLast}` : ((commission as any)?.manualTenantName || 'N/A');
                  return (
                    <TableRow key={commission._id}>
                      <TableCell>{new Date(commission.paymentDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">{propertyName}</Typography>
                        <Typography variant="caption" color="text.secondary">{propertyAddress}</Typography>
                      </TableCell>
                      <TableCell>{tenantName}</TableCell>
                      <TableCell>
                        <Chip
                          label={(commission as any).paymentType === 'rental' ? 'Rental' : 'Sale'}
                          color={(commission as any).paymentType === 'rental' ? 'secondary' : 'primary'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {agentAccountService.formatCurrency(commission.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="success.main" fontWeight="medium">
                          {agentAccountService.formatCurrency(commission.commissionDetails.agentShare)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{commission.referenceNumber}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No commission data found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        {/* Commission Summary */}
        {account.commissionData && account.commissionData.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Commission Summary</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="text.secondary">Total Properties</Typography>
                    <Typography variant="h6">
                      {new Set(account.commissionData.map((c: any) => c?.propertyId?._id || c?.manualPropertyAddress || c?._id)).size}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="text.secondary">Total Payments</Typography>
                    <Typography variant="h6">
                      {account.commissionData.length}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="text.secondary">Total Commission Earned</Typography>
                    <Typography variant="h6" color="success.main">
                      {agentAccountService.formatCurrency(
                        account.commissionData.reduce((sum, c) => sum + c.commissionDetails.agentShare, 0)
                      )}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="text.secondary">Average Commission</Typography>
                    <Typography variant="h6">
                      {agentAccountService.formatCurrency(
                        account.commissionData.reduce((sum, c) => sum + c.commissionDetails.agentShare, 0) / account.commissionData.length
                      )}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Box>
        )}
      </TabPanel>

      {/* Summary Tab */}
      <TabPanel value={tabValue} index={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Account Summary</Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Last Commission: {account.lastCommissionDate ? new Date(account.lastCommissionDate).toLocaleDateString() : 'Never'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Payout: {account.lastPayoutDate ? new Date(account.lastPayoutDate).toLocaleDateString() : 'Never'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Penalty: {account.lastPenaltyDate ? new Date(account.lastPenaltyDate).toLocaleDateString() : 'Never'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Add Penalty Dialog */}
      <Dialog open={penaltyDialogOpen} onClose={() => setPenaltyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Penalty</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount"
                type="number"
                value={penaltyData.amount}
                onChange={(e) => setPenaltyData({ ...penaltyData, amount: Number(e.target.value) })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date"
                type="date"
                value={penaltyData.date.toISOString().split('T')[0]}
                onChange={(e) => setPenaltyData({ ...penaltyData, date: new Date(e.target.value) })}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={penaltyData.description}
                onChange={(e) => setPenaltyData({ ...penaltyData, description: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={penaltyData.category}
                  onChange={(e) => setPenaltyData({ ...penaltyData, category: e.target.value })}
                  label="Category"
                >
                  <MenuItem value="general">General</MenuItem>
                  <MenuItem value="performance">Performance</MenuItem>
                  <MenuItem value="conduct">Conduct</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={penaltyData.notes}
                onChange={(e) => setPenaltyData({ ...penaltyData, notes: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPenaltyDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddPenalty} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Add Penalty'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Payout Dialog */}
      <Dialog open={payoutDialogOpen} onClose={() => setPayoutDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Pay Agent</DialogTitle>
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
                helperText={`Available balance: ${agentAccountService.formatCurrency(account.runningBalance)}`}
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
                helperText="Pre-populated with agent name"
                InputProps={{
                  readOnly: false,
                  style: { backgroundColor: payoutData.recipientName === account?.agentName ? '#f5f5f5' : 'white' }
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

export default AgentAccountDetailPage;
