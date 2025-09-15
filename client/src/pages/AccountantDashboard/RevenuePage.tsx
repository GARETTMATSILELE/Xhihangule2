import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import paymentService from '../../services/paymentService';
import companyAccountService, { CompanyAccountSummary } from '../../services/companyAccountService';
import { Payment } from '../../types/payment';

type Period = 'month' | 'quarter' | 'year' | 'all';

const RevenuePage: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [companySummary, setCompanySummary] = useState<CompanyAccountSummary | null>(null);
  const [companyTransactions, setCompanyTransactions] = useState<any[]>([]);
  const [addExpenseOpen, setAddExpenseOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState<{
    amount: string;
    date: string;
    payee: string;
    category: string;
    reference: string;
    description: string;
    paymentMethod: string;
  }>({
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    payee: '',
    category: '',
    reference: '',
    description: '',
    paymentMethod: 'bank_transfer'
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [paymentsData, summary, tx] = await Promise.all([
          paymentService.getPayments(),
          companyAccountService.getSummary().catch(() => null),
          companyAccountService.getTransactions().catch(() => null)
        ]);

        setPayments(Array.isArray(paymentsData) ? paymentsData : []);
        setCompanySummary(summary);
        setCompanyTransactions(Array.isArray((tx as any)?.transactions) ? (tx as any).transactions : (Array.isArray(tx) ? tx : []));
      } catch (err) {
        setPayments([]);
        setCompanySummary(null);
        setCompanyTransactions([]);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (period === 'all') return payments;
    const now = new Date();
    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return payments.filter(p => new Date(p.paymentDate) >= start && new Date(p.paymentDate) <= end);
    }
    if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
      return payments.filter(p => new Date(p.paymentDate) >= start && new Date(p.paymentDate) <= end);
    }
    // year
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return payments.filter(p => new Date(p.paymentDate) >= start && new Date(p.paymentDate) <= end);
  }, [payments, period]);

  // Period window
  const [periodStart, periodEnd] = useMemo(() => {
    const now = new Date();
    if (period === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)] as const;
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      return [new Date(now.getFullYear(), q * 3, 1), new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999)] as const;
    }
    if (period === 'year') return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)] as const;
    return [new Date(0), new Date()] as const;
  }, [period]);

  // Commission revenues (company share)
  const rentalsCommissionRevenue = useMemo(() => filtered
    .filter(p => p.paymentType === 'rental')
    .reduce((sum, p) => sum + (p.commissionDetails?.agencyShare || 0), 0), [filtered]);
  const salesCommissionRevenue = useMemo(() => filtered
    .filter(p => p.paymentType === 'sale')
    .reduce((sum, p) => sum + (p.commissionDetails?.agencyShare || 0), 0), [filtered]);
  const totalCommissionRevenue = rentalsCommissionRevenue + salesCommissionRevenue;

  // Company expenses from company accounts transactions within period
  const expensesForPeriod = useMemo(() => {
    const txs = Array.isArray(companyTransactions) ? companyTransactions : [];
    if (txs.length === 0 && companySummary && typeof companySummary.totalExpenses === 'number') {
      return companySummary.totalExpenses;
    }
    const total = txs
      .filter((t: any) => {
        const d = new Date(t.date || t.postedAt || t.createdAt || t.updatedAt || Date.now());
        return d >= periodStart && d <= periodEnd;
      })
      .reduce((sum: number, t: any) => {
        const amount = (typeof t.amount === 'number')
          ? t.amount
          : (typeof t.debit === 'number' || typeof t.credit === 'number')
            ? ((t.debit || 0) - (t.credit || 0))
            : 0;
        const isExpense = amount < 0 || t.type === 'expense' || t.category === 'expense' || t.direction === 'debit';
        const expenseAmt = isExpense ? Math.abs(amount || t.amount || t.debit || 0) : 0;
        return sum + expenseAmt;
      }, 0);
    return total;
  }, [companyTransactions, companySummary, periodStart, periodEnd]);

  // Build lists
  const commissionList = useMemo(() => {
    return filtered.map(p => {
      const agencyShare = p.commissionDetails?.agencyShare || 0;
      return {
        id: p._id,
        date: new Date(p.paymentDate),
        label: p.paymentType === 'sale' ? 'Sales Commission' : 'Rental Commission',
        subtitle: `Ref: ${p.referenceNumber}`,
        amount: agencyShare
      };
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filtered]);

  const expenseList = useMemo(() => {
    const txs = Array.isArray(companyTransactions) ? companyTransactions : [];
    const list = txs
      .filter((t: any) => {
        const d = new Date(t.date || t.postedAt || t.createdAt || t.updatedAt || Date.now());
        return d >= periodStart && d <= periodEnd;
      })
      .map((t: any) => {
        const amount = (typeof t.amount === 'number')
          ? t.amount
          : (typeof t.debit === 'number' || typeof t.credit === 'number')
            ? ((t.debit || 0) - (t.credit || 0))
            : 0;
        const isExpense = amount < 0 || t.type === 'expense' || t.category === 'expense' || t.direction === 'debit';
        const expenseAmt = isExpense ? Math.abs(amount || t.amount || t.debit || 0) : 0;
        const date = new Date(t.date || t.postedAt || t.createdAt || Date.now());
        return {
          id: t._id || t.id || `${date.getTime()}-${expenseAmt}`,
          date,
          label: t.payee || t.counterparty || t.vendor || t.description || t.memo || 'Expense',
          subtitle: t.reference || t.category || t.note || '',
          amount: expenseAmt
        };
      })
      .filter(item => item.amount > 0)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    return list;
  }, [companyTransactions, periodStart, periodEnd]);

  const cards = [
    { title: 'Net Revenue', value: totalCommissionRevenue - expensesForPeriod, color: (totalCommissionRevenue - expensesForPeriod) >= 0 ? 'success.main' : 'error.main' },
    { title: 'Total Revenue', value: totalCommissionRevenue, color: 'primary.main' },
    { title: 'Rentals Revenue', value: rentalsCommissionRevenue, color: 'success.main' },
    { title: 'Sales Revenue', value: salesCommissionRevenue, color: 'info.main' },
    { title: 'Total Expenses', value: expensesForPeriod, color: 'error.main' }
  ];

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Revenue Overview
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Period</InputLabel>
            <Select value={period} label="Period" onChange={(e) => setPeriod(e.target.value as Period)}>
              <MenuItem value="month">This Month</MenuItem>
              <MenuItem value="quarter">This Quarter</MenuItem>
              <MenuItem value="year">This Year</MenuItem>
              <MenuItem value="all">All Time</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" onClick={() => setAddExpenseOpen(true)}>Add Expense</Button>
        </Box>
      </Box>

      <Grid container spacing={2}>
        {cards.map((c) => (
          <Grid item xs={12} sm={6} md={4} key={c.title}>
            <Card sx={{ cursor: 'pointer', bgcolor: c.color, color: '#fff' }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>{c.title}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {`$${Number(c.value || 0).toLocaleString()}`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Commissions / Revenue</Typography>
            <List>
              {commissionList.length === 0 ? (
                <ListItem>
                  <ListItemText primary="No commission records in selected period" />
                </ListItem>
              ) : (
                commissionList.map((item, idx) => (
                  <React.Fragment key={item.id}>
                    <ListItem>
                      <ListItemText
                        primary={`${item.label} - $${item.amount.toLocaleString()}`}
                        secondary={`${item.date.toLocaleDateString()} • ${item.subtitle}`}
                      />
                    </ListItem>
                    {idx < commissionList.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                ))
              )}
            </List>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Company Expenses</Typography>
            <List>
              {expenseList.length === 0 ? (
                <ListItem>
                  <ListItemText primary="No expense records in selected period" />
                </ListItem>
              ) : (
                expenseList.map((item, idx) => (
                  <React.Fragment key={item.id}>
                    <ListItem>
                      <ListItemText
                        primary={`${item.label} - $${item.amount.toLocaleString()}`}
                        secondary={`${item.date.toLocaleDateString()} • ${item.subtitle}`}
                      />
                    </ListItem>
                    {idx < expenseList.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                ))
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>

      {/* Add Expense Dialog */}
      <Dialog open={addExpenseOpen} onClose={() => !submitting && setAddExpenseOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Company Expense</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Amount"
            type="number"
            value={expenseForm.amount}
            onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
            fullWidth
            inputProps={{ min: 0, step: '0.01' }}
          />
          <TextField
            label="Date"
            type="date"
            value={expenseForm.date}
            onChange={(e) => setExpenseForm(prev => ({ ...prev, date: e.target.value }))}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Payee"
            value={expenseForm.payee}
            onChange={(e) => setExpenseForm(prev => ({ ...prev, payee: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Category"
            value={expenseForm.category}
            onChange={(e) => setExpenseForm(prev => ({ ...prev, category: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Reference"
            value={expenseForm.reference}
            onChange={(e) => setExpenseForm(prev => ({ ...prev, reference: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Description"
            value={expenseForm.description}
            onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
            fullWidth
            multiline
            minRows={2}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Payment Method</InputLabel>
            <Select
              value={expenseForm.paymentMethod}
              label="Payment Method"
              onChange={(e) => setExpenseForm(prev => ({ ...prev, paymentMethod: e.target.value as string }))}
            >
              <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="credit_card">Credit Card</MenuItem>
              <MenuItem value="mobile_money">Mobile Money</MenuItem>
            </Select>
          </FormControl>
          {submitError && (
            <Typography color="error" variant="body2">{submitError}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddExpenseOpen(false)} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            disabled={submitting || !expenseForm.amount}
            onClick={async () => {
              try {
                setSubmitting(true);
                setSubmitError(null);
                const payload = {
                  amount: Number(expenseForm.amount),
                  date: new Date(expenseForm.date).toISOString(),
                  payee: expenseForm.payee || undefined,
                  category: expenseForm.category || undefined,
                  reference: expenseForm.reference || undefined,
                  description: expenseForm.description || undefined,
                  paymentMethod: expenseForm.paymentMethod || undefined
                };
                await companyAccountService.createExpense(payload);
                // Refresh transactions and summary
                const [summary, tx] = await Promise.all([
                  companyAccountService.getSummary().catch(() => null),
                  companyAccountService.getTransactions().catch(() => null)
                ]);
                setCompanySummary(summary);
                setCompanyTransactions(Array.isArray((tx as any)?.transactions) ? (tx as any).transactions : (Array.isArray(tx) ? tx : []));
                setAddExpenseOpen(false);
                setExpenseForm({
                  amount: '',
                  date: new Date().toISOString().slice(0, 10),
                  payee: '',
                  category: '',
                  reference: '',
                  description: '',
                  paymentMethod: 'bank_transfer'
                });
              } catch (err: any) {
                setSubmitError(err?.response?.data?.message || err?.message || 'Failed to create expense');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? 'Saving...' : 'Save Expense'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RevenuePage;


