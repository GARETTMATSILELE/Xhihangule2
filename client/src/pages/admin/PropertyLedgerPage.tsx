import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import api from '../../api/axios';
import { useCompany } from '../../contexts/CompanyContext';
import { propertyAccountService } from '../../services/propertyAccountService';

interface LedgerEntry {
  _id: string;
  type: 'payment' | 'payout' | 'expense' | 'income' | 'owner_payout' | string;
  amount: number;
  date?: string;
  notes?: string;
  referenceNumber?: string;
  status?: string;
  runningBalance?: number;
  description?: string;
}

interface AccountMeta {
  ownerId?: string;
  ownerName?: string;
  ledgerType?: 'rental' | 'sale' | string;
  runningBalance?: number;
  totalIncome?: number;
  totalExpenses?: number;
  totalOwnerPayouts?: number;
}

const PropertyLedgerPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { company } = useCompany();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<{ totalPaid: number; totalPayout: number; held: number } | null>(null);
  const [accountMeta, setAccountMeta] = useState<AccountMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'owner_payout' | 'expense' | 'payment' | 'payout'>('all');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [expenseData, setExpenseData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'general',
    notes: ''
  });
  const [payoutData, setPayoutData] = useState({
    amount: 0,
    paymentMethod: 'bank_transfer',
    recipientName: '',
    notes: ''
  });

  const refreshLedger = async () => {
    if (!propertyId) return;
    const [txRes, summaryRes] = await Promise.all([
      api.get(`/accountants/property-accounts/${propertyId}/transactions`, {
        params: {
          includePayouts: 1,
          ...(accountMeta?.ledgerType ? { ledger: accountMeta.ledgerType } : {})
        }
      }).catch(async () => api.get(`/accountants/property-accounts/${propertyId}/deposits`)),
      api.get(`/accountants/property-accounts/${propertyId}/deposits/summary`).catch(() => null)
    ]);

    const txData = Array.isArray((txRes as any)?.data?.data)
      ? (txRes as any).data.data
      : Array.isArray((txRes as any)?.data?.data?.entries)
        ? (txRes as any).data.data.entries
        : Array.isArray((txRes as any)?.data?.entries)
          ? (txRes as any).data.entries
          : [];
    setEntries(txData);

    const s = (summaryRes as any)?.data?.data || (summaryRes as any)?.data || null;
    setSummary(s);
  };

  const refreshAccountMeta = async () => {
    if (!propertyId) return;
    try {
      const account = await propertyAccountService.getPropertyAccount(
        propertyId,
        (accountMeta?.ledgerType as 'rental' | 'sale' | undefined)
      );
      setAccountMeta(account as any);
    } catch {
      setAccountMeta(null);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        if (!propertyId) return;
        await Promise.all([refreshLedger(), refreshAccountMeta()]);
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load ledger');
      } finally {
        setLoading(false);
      }
    };
    if (company?.plan === 'INDIVIDUAL') run();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, company?.plan]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0)),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const byType = typeFilter === 'all'
      ? sortedEntries
      : sortedEntries.filter((entry) => String(entry.type || '').toLowerCase() === typeFilter);

    if (!q) return byType;

    return byType.filter((entry) => {
      const haystack = [
        entry.type,
        entry.referenceNumber,
        entry.notes,
        entry.description,
        entry.status,
        entry.amount
      ].map((v) => String(v ?? '').toLowerCase()).join(' ');
      return haystack.includes(q);
    });
  }, [sortedEntries, typeFilter, searchQuery]);

  const getTypeChipColor = (type: string) => {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'payment' || normalized === 'income') return 'success';
    if (normalized === 'payout' || normalized === 'owner_payout') return 'warning';
    if (normalized === 'expense') return 'error';
    return 'default';
  };

  const handleAddExpense = async () => {
    if (!propertyId) return;
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      await propertyAccountService.addExpense(
        propertyId,
        {
          amount: Number(expenseData.amount),
          date: new Date(expenseData.date),
          description: expenseData.description,
          category: expenseData.category,
          notes: expenseData.notes
        },
        (accountMeta?.ledgerType as 'rental' | 'sale' | undefined)
      );
      await Promise.all([refreshLedger(), refreshAccountMeta()]);
      setExpenseOpen(false);
      setExpenseData({
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        description: '',
        category: 'general',
        notes: ''
      });
      setSuccess('Expense added successfully.');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePayout = async () => {
    if (!propertyId) return;
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      await propertyAccountService.createOwnerPayout(
        propertyId,
        {
          amount: Number(payoutData.amount),
          paymentMethod: payoutData.paymentMethod as 'bank_transfer' | 'cash' | 'mobile_money' | 'check',
          recipientId: String(accountMeta?.ownerId || ''),
          recipientName: payoutData.recipientName || String(accountMeta?.ownerName || ''),
          autoComplete: true,
          notes: payoutData.notes
        },
        (accountMeta?.ledgerType as 'rental' | 'sale' | undefined)
      );
      await Promise.all([refreshLedger(), refreshAccountMeta()]);
      setPayoutOpen(false);
      setPayoutData({
        amount: 0,
        paymentMethod: 'bank_transfer',
        recipientName: String(accountMeta?.ownerName || ''),
        notes: ''
      });
      setSuccess('Owner payout created successfully.');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create payout');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (company?.plan !== 'INDIVIDUAL') {
    return <Alert severity="info">Property ledgers are available on the Individual plan only.</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Property Ledger</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Ledger entries for property `{propertyId}`
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Current Balance</Typography>
              <Typography variant="h5" color="primary.main">
                ${Number(accountMeta?.runningBalance || 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Total Income</Typography>
              <Typography variant="h5" color="success.main">
                ${Number(accountMeta?.totalIncome || 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Total Expenses</Typography>
              <Typography variant="h5" color="error.main">
                ${Number(accountMeta?.totalExpenses || 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Total Payouts</Typography>
              <Typography variant="h5" color="warning.main">
                ${Number(accountMeta?.totalOwnerPayouts || summary?.totalPayout || 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={() => setExpenseOpen(true)}>
          Add Expense
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => {
            setPayoutData((prev) => ({ ...prev, recipientName: prev.recipientName || String(accountMeta?.ownerName || '') }));
            setPayoutOpen(true);
          }}
          disabled={Number(accountMeta?.runningBalance || 0) <= 0}
        >
          Pay Owner
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Search reference, notes, amount"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ minWidth: 300, flex: 1 }}
        />
        <TextField
          size="small"
          select
          label="Type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | 'income' | 'owner_payout' | 'expense' | 'payment' | 'payout')}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="income">Income</MenuItem>
          <MenuItem value="owner_payout">Owner Payouts</MenuItem>
          <MenuItem value="payment">Payments</MenuItem>
          <MenuItem value="payout">Payouts</MenuItem>
          <MenuItem value="expense">Expenses</MenuItem>
        </TextField>
      </Box>

      <Card>
        <CardContent>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Notes / Description</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry._id}>
                    <TableCell>{entry.date ? new Date(entry.date).toLocaleDateString() : ''}</TableCell>
                    <TableCell>
                      <Chip size="small" label={String(entry.type || 'other')} color={getTypeChipColor(entry.type)} />
                    </TableCell>
                    <TableCell>{entry.referenceNumber || '-'}</TableCell>
                    <TableCell>{entry.notes || entry.description || '-'}</TableCell>
                    <TableCell>{entry.status ? <Chip size="small" variant="outlined" label={entry.status} /> : '-'}</TableCell>
                    <TableCell align="right">${Number(entry.amount || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {filteredEntries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary">No ledger entries match your current filters.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={expenseOpen} onClose={() => setExpenseOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Expense</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount"
                type="number"
                value={expenseData.amount}
                onChange={(e) => setExpenseData((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date"
                type="date"
                value={expenseData.date}
                onChange={(e) => setExpenseData((prev) => ({ ...prev, date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={expenseData.description}
                onChange={(e) => setExpenseData((prev) => ({ ...prev, description: e.target.value }))}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Category"
                value={expenseData.category}
                onChange={(e) => setExpenseData((prev) => ({ ...prev, category: e.target.value }))}
                fullWidth
              >
                <MenuItem value="general">General</MenuItem>
                <MenuItem value="repair">Repair</MenuItem>
                <MenuItem value="maintenance">Maintenance</MenuItem>
                <MenuItem value="utilities">Utilities</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={expenseData.notes}
                onChange={(e) => setExpenseData((prev) => ({ ...prev, notes: e.target.value }))}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpenseOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddExpense} disabled={submitting}>
            {submitting ? 'Saving...' : 'Add Expense'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={payoutOpen} onClose={() => setPayoutOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Pay Owner</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount"
                type="number"
                value={payoutData.amount}
                onChange={(e) => setPayoutData((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                fullWidth
                helperText={`Available balance: $${Number(accountMeta?.runningBalance || 0).toLocaleString()}`}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Payment Method"
                value={payoutData.paymentMethod}
                onChange={(e) => setPayoutData((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                fullWidth
              >
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="mobile_money">Mobile Money</MenuItem>
                <MenuItem value="check">Check</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Recipient Name"
                value={payoutData.recipientName}
                onChange={(e) => setPayoutData((prev) => ({ ...prev, recipientName: e.target.value }))}
                fullWidth
                helperText={accountMeta?.ownerName ? `Owner on account: ${accountMeta.ownerName}` : ''}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={payoutData.notes}
                onChange={(e) => setPayoutData((prev) => ({ ...prev, notes: e.target.value }))}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayoutOpen(false)}>Cancel</Button>
          <Button variant="contained" color="secondary" onClick={handleCreatePayout} disabled={submitting}>
            {submitting ? 'Saving...' : 'Create Payout'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PropertyLedgerPage;


































