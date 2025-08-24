import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  CircularProgress,
  Alert,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { 
  Assignment as TaskIcon,
  Payment as PaymentIcon,
  Warning as UrgentIcon,
  CheckCircle as CompletedIcon,
  TrendingUp as TrendingUpIcon,
  Receipt as ReceiptIcon,
  PendingActions as PendingActionsIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import paymentRequestService, { PaymentRequest } from '../../services/paymentRequestService';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import paymentService from '../../services/paymentService';
import companyAccountService from '../../services/companyAccountService';
import { apiService } from '../../api';
import { Payment } from '../../types/payment';

const DashboardOverview: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expensesTotal, setExpensesTotal] = useState<number>(0);
  const [companySummary, setCompanySummary] = useState<{ runningBalance: number; totalIncome: number; totalExpenses: number } | null>(null);
  const [companyTransactions, setCompanyTransactions] = useState<any[]>([]);

  useEffect(() => {
    loadPaymentRequests();
    // Re-load when company context changes
  }, [user?.companyId]);

  const loadPaymentRequests = async () => {
    try {
      setLoading(true);
      const response = await paymentRequestService.getPaymentRequests();
      setPaymentRequests(response.data);
      const paymentsData = await paymentService.getPayments();
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
      try {
        const inv = await apiService.getInvoices();
        setInvoices(Array.isArray(inv) ? inv : (inv?.data || []));
      } catch {
        setInvoices([]);
      }
      try {
        // Company-level expenses: sum paid payment requests within current month
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const pr = await paymentRequestService.getPaymentRequests();
        const list = Array.isArray(pr?.data) ? pr.data : [];
        const total = list
          .filter(r => r.status === 'paid')
          .filter(r => {
            const d = new Date(r.processedDate || r.dueDate || r.requestDate);
            return d >= start && d <= end;
          })
          .reduce((s, r) => s + (r.amount || 0), 0);
        setExpensesTotal(total);
      } catch {
        // If summary fails, leave as null; UI defaults to zeros
      }

      // Load company account summary and transactions
      try {
        const summary = await companyAccountService.getSummary();
        setCompanySummary(summary);
      } catch {
        setCompanyTransactions([]);
      }
      try {
        const tx = await companyAccountService.getTransactions();
        setCompanyTransactions(Array.isArray((tx as any)?.transactions) ? (tx as any).transactions : []);
      } catch {}
    } catch (err: any) {
      console.error('Error loading payment requests:', err);
      setError('Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  };

  const pendingRequests = paymentRequests.filter(req => req.status === 'pending');
  const urgentRequests = pendingRequests.filter(req => 
    new Date(req.dueDate) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // Due within 2 days
  );

  const periodFilteredPayments = useMemo(() => {
    const now = new Date();
    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return payments.filter(p => new Date(p.paymentDate) >= start && new Date(p.paymentDate) <= end);
    } else if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
      return payments.filter(p => new Date(p.paymentDate) >= start && new Date(p.paymentDate) <= end);
    }
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return payments.filter(p => new Date(p.paymentDate) >= start && new Date(p.paymentDate) <= end);
  }, [payments, period]);

  const [periodStart, periodEnd] = useMemo(() => {
    const now = new Date();
    if (period === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)] as const;
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      return [new Date(now.getFullYear(), q * 3, 1), new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999)] as const;
    }
    return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)] as const;
  }, [period]);

  const periodInvoices = useMemo(() => {
    return (Array.isArray(invoices) ? invoices : []).filter((inv: any) => {
      const d = new Date(inv.dueDate || inv.createdAt);
      return d >= periodStart && d <= periodEnd;
    });
  }, [invoices, periodStart, periodEnd]);

  const receivablesRental = useMemo(() => {
    return periodInvoices
      .filter((i: any) => (i.type === 'rental') && (i.status === 'unpaid' || i.status === 'overdue'))
      .reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);
  }, [periodInvoices]);

  const receivablesSales = useMemo(() => {
    return periodInvoices
      .filter((i: any) => (i.type === 'sale') && (i.status === 'unpaid' || i.status === 'overdue'))
      .reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);
  }, [periodInvoices]);

  const invoicesTotal = useMemo(() => {
    return periodInvoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);
  }, [periodInvoices]);

  // Prefer companyaccounts totalExpenses; fall back to payment requests if unavailable
  const expensesForPeriod = useMemo(() => {
    if (companySummary && typeof companySummary.totalExpenses === 'number') {
      return companySummary.totalExpenses;
    }
    return expensesTotal;
  }, [companySummary, expensesTotal]);

  const daysInPeriod = useMemo(() => Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))), [periodStart, periodEnd]);
  // Match RevenuePage computation: revenue equals company share (agencyShare) not gross receipts
  const rentalRevenue = useMemo(() => periodFilteredPayments
    .filter(p => p.paymentType === 'rental')
    .reduce((s, p) => s + (p.commissionDetails?.agencyShare || 0), 0), [periodFilteredPayments]);
  const salesRevenue = useMemo(() => periodFilteredPayments
    .filter(p => p.paymentType === 'introduction')
    .reduce((s, p) => s + (p.commissionDetails?.agencyShare || 0), 0), [periodFilteredPayments]);
  const totalRevenue = useMemo(() => rentalRevenue + salesRevenue, [rentalRevenue, salesRevenue]);

  const totalSalesInPeriod = useMemo(() => periodFilteredPayments.reduce((s, p) => s + p.amount, 0), [periodFilteredPayments]);
  const avgDailySales = useMemo(() => totalSalesInPeriod / daysInPeriod, [totalSalesInPeriod, daysInPeriod]);
  const dso = useMemo(() => avgDailySales > 0 ? (receivablesRental + receivablesSales) / avgDailySales : 0, [avgDailySales, receivablesRental, receivablesSales]);

  const stats = [
    { title: 'Rental Revenue', value: rentalRevenue, icon: <PaymentIcon />, color: 'success.main', path: '/accountant-dashboard/revenue' },
    { title: 'Total Revenue', value: totalRevenue, icon: <TrendingUpIcon />, color: 'secondary.main', path: '/accountant-dashboard/revenue' },
    { title: 'Invoices', value: invoicesTotal, icon: <ReceiptIcon />, color: 'info.main', path: '/accountant-dashboard/written-invoices' },
    { title: 'Sales', value: salesRevenue, icon: <TrendingUpIcon />, color: 'primary.main', path: '/accountant-dashboard/sales' },
    { title: 'Expenses', value: expensesForPeriod, icon: <UrgentIcon />, color: 'error.main', path: '/accountant-dashboard/property-accounts' },
    { title: 'Receivables (Rental)', value: receivablesRental, icon: <PendingActionsIcon />, color: 'warning.main', path: '/accountant-dashboard/revenue' },
    { title: 'Receivables (Sales)', value: receivablesSales, icon: <PendingActionsIcon />, color: 'warning.main', path: '/accountant-dashboard/revenue' },
    { title: 'Total Receipts', value: periodFilteredPayments.reduce((s, p) => s + p.amount, 0), icon: <TrendingUpIcon />, color: 'secondary.main', path: '/accountant-dashboard/revenue' },
    { title: 'Day Sales Outstanding', value: dso, icon: <TrendingUpIcon />, color: 'text.primary', path: '/accountant-dashboard/revenue' },
    { title: 'Bank Revenue', value: periodFilteredPayments.filter(p => p.paymentMethod === 'bank_transfer').reduce((s, p) => s + (p.commissionDetails?.agencyShare || 0), 0), icon: <PaymentIcon />, color: 'success.main', path: '/accountant-dashboard/revenue' }
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" component="h1" sx={{ mb: 3, fontWeight: 600 }}>
        Welcome back, {user?.firstName}!
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Period</InputLabel>
          <Select value={period} label="Period" onChange={(e) => setPeriod(e.target.value as any)}>
            <MenuItem value="month">This Month</MenuItem>
            <MenuItem value="quarter">This Quarter</MenuItem>
            <MenuItem value="year">This Year</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card 
              elevation={2} 
              sx={{ 
                cursor: 'pointer',
                '&:hover': { elevation: 4 }
              }}
              onClick={() => navigate(stat.path)}
            >
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="h4" component="div" sx={{ color: stat.color, fontWeight: 'bold' }}>
                      {typeof stat.value === 'number' ? (stat.title === 'Day Sales Outstanding' ? Number(stat.value).toFixed(2) : `$${Number(stat.value).toLocaleString()}`) : stat.value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stat.title}
                    </Typography>
                  </Box>
                  <Box sx={{ color: stat.color }}>
                    {stat.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Recent Tasks */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" component="h2">
                Recent Payment Requests
              </Typography>
              <Button 
                size="small" 
                onClick={() => navigate('/accountant-dashboard/tasks')}
              >
                View All
              </Button>
            </Box>
            
            {pendingRequests.length === 0 ? (
              <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                No pending payment requests
              </Typography>
            ) : (
              <List>
                {pendingRequests.slice(0, 5).map((request) => (
                  <ListItem key={request._id} divider>
                    <ListItemIcon>
                      <PaymentIcon color="warning" />
                    </ListItemIcon>
                    <ListItemText
                      primary={`${request.payTo.name} ${request.payTo.surname}`}
                      secondary={
                        <Box>
                          <Typography variant="body2">
                            {request.reason}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Due: {format(new Date(request.dueDate), 'MMM dd, yyyy')} • {request.currency} {request.amount.toLocaleString()}
                          </Typography>
                        </Box>
                      }
                    />
                    <Chip
                      label={new Date(request.dueDate) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) ? 'Urgent' : 'Pending'}
                      color={new Date(request.dueDate) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) ? 'error' : 'warning'}
                      size="small"
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" component="h2">
                Quick Actions
              </Typography>
            </Box>
            
            <List>
              <ListItem 
                button 
                onClick={() => navigate('/accountant-dashboard/tasks')}
                sx={{ borderRadius: 1, mb: 1 }}
              >
                <ListItemIcon>
                  <TaskIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Review Payment Requests"
                  secondary="Process pending payment requests"
                />
              </ListItem>
              
              <ListItem 
                button 
                onClick={() => navigate('/accountant-dashboard/payments')}
                sx={{ borderRadius: 1, mb: 1 }}
              >
                <ListItemIcon>
                  <ReceiptIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="View All Payments"
                  secondary="Check payment history and records"
                />
              </ListItem>
              
              <ListItem 
                button 
                onClick={() => navigate('/accountant-dashboard/reports')}
                sx={{ borderRadius: 1, mb: 1 }}
              >
                <ListItemIcon>
                  <TrendingUpIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Generate Reports"
                  secondary="Create financial reports and analytics"
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardOverview; 