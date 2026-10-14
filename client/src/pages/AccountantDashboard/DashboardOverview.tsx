import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  TrendingUp as TrendingUpIcon,
  Receipt as ReceiptIcon,
  PendingActions as PendingActionsIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import paymentRequestService, { PaymentRequest } from '../../services/paymentRequestService';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import paymentService from '../../services/paymentService';
import companyAccountService from '../../services/companyAccountService';
import { apiService } from '../../api';
import { Payment } from '../../types/payment';
import accountingService, {
  AccountingIntegritySummary,
  DashboardOutstandingBreakdown,
  DashboardSummary,
  OutstandingPropertyBreakdown,
  TaxComplianceDashboard
} from '../../services/accountingService';

type DashboardPeriod = 'month' | 'quarter' | 'year';

function getDashboardPeriodRange(period: DashboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  if (period === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    };
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return {
      start: new Date(now.getFullYear(), q * 3, 1),
      end: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999)
    };
  }
  return {
    start: new Date(now.getFullYear(), 0, 1),
    end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
  };
}

const DashboardOverview: React.FC = () => {
  const { user } = useAuth();
  const { company } = useCompany();
  const navigate = useNavigate();
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true); // core loading for above-the-fold
  const [deferredLoading, setDeferredLoading] = useState(true); // deferred data below-the-fold
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const refreshInFlightRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedCoreRef = useRef(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [outstandingBreakdown, setOutstandingBreakdown] = useState<DashboardOutstandingBreakdown | null>(null);
  const [integritySummary, setIntegritySummary] = useState<AccountingIntegritySummary | null>(null);
  const [taxCompliance, setTaxCompliance] = useState<TaxComplianceDashboard | null>(null);
  const [companySummary, setCompanySummary] = useState<{ runningBalance: number; totalIncome: number; totalExpenses: number } | null>(null);
  const [companyTransactions, setCompanyTransactions] = useState<any[]>([]);
  const [showOutstandingRentals, setShowOutstandingRentals] = useState(false);
  const [showOutstandingLevies, setShowOutstandingLevies] = useState(false);
  const [showPassThroughBalances, setShowPassThroughBalances] = useState(false);
  // Show welcome message only on first visit per session (per browser tab)
  const [showWelcome] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem('seenAccountantDashboardWelcome');
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      if (!sessionStorage.getItem('seenAccountantDashboardWelcome')) {
        sessionStorage.setItem('seenAccountantDashboardWelcome', '1');
      }
    } catch {}
  }, []);

  const loadCore = useCallback(async () => {
    const isFirstLoad = !hasLoadedCoreRef.current;
    try {
      if (isFirstLoad) setLoading(true);
      const { start, end } = getDashboardPeriodRange(period);
      const [prRes, paymentsData, summary, acctSummary, outstanding, integrity, taxDash] = await Promise.all([
        paymentRequestService.getPaymentRequests(),
        paymentService.getPayments({ startDate: start, endDate: end }),
        (async () => { try { return await companyAccountService.getSummary(); } catch { return null; } })(),
        (async () => { try { return await accountingService.getDashboardSummary(); } catch { return null; } })(),
        accountingService.getDashboardOutstanding(),
        (async () => { try { return await accountingService.getAccountingIntegritySummary(); } catch { return null; } })(),
        (async () => { try { return await accountingService.getTaxComplianceDashboard(); } catch { return null; } })()
      ]);
      setPaymentRequests(prRes.data || []);
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
      if (summary) setCompanySummary(summary);
      if (acctSummary) setDashboardSummary(acctSummary);
      setOutstandingBreakdown(outstanding);
      if (integrity) setIntegritySummary(integrity);
      if (taxDash) setTaxCompliance(taxDash);
      hasLoadedCoreRef.current = true;
    } catch (err: any) {
      console.error('Error loading core dashboard data:', err);
      setError('Failed to load dashboard');
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  }, [period]);

  const loadDeferred = useCallback(async () => {
    try {
      setDeferredLoading(true);
      try {
        const inv = await apiService.getInvoices();
        setInvoices(Array.isArray(inv) ? inv : (inv?.data || []));
      } catch {
        setInvoices([]);
      }
      try {
        const tx = await companyAccountService.getTransactions();
        setCompanyTransactions(
          Array.isArray((tx as any)?.transactions)
            ? (tx as any).transactions
            : (Array.isArray(tx as any) ? (tx as any) : [])
        );
      } catch {}
    } catch (err: any) {
      console.error('Error loading deferred dashboard data:', err);
    } finally {
      setDeferredLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      await Promise.all([loadCore(), loadDeferred()]);
    } finally {
      refreshInFlightRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void refreshDashboard();
      }
    }
  }, [loadCore, loadDeferred]);

  const scheduleDashboardRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshDashboard();
    }, 400);
  }, [refreshDashboard]);

  useEffect(() => {
    hasLoadedCoreRef.current = false;
  }, [user?.companyId]);

  useEffect(() => {
    void loadCore();
  }, [user?.companyId, loadCore]);

  useEffect(() => {
    void loadDeferred();
  }, [user?.companyId, loadDeferred]);

  useEffect(() => {
    const onPaymentsChanged = () => {
      scheduleDashboardRefresh();
    };
    window.addEventListener('payments:changed', onPaymentsChanged as EventListener);
    return () => {
      window.removeEventListener('payments:changed', onPaymentsChanged as EventListener);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleDashboardRefresh]);

  const pendingRequests = paymentRequests.filter(req => req.status === 'pending');
  const urgentRequests = pendingRequests.filter(req => 
    new Date(req.dueDate) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // Due within 2 days
  );

  const periodFilteredPayments = useMemo(() => {
    const { start, end } = getDashboardPeriodRange(period);
    return payments.filter(p => {
      const t = new Date(p.paymentDate).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
  }, [payments, period]);

  const [periodStart, periodEnd] = useMemo(() => {
    const range = getDashboardPeriodRange(period);
    return [range.start, range.end] as const;
  }, [period]);

  const periodInvoices = useMemo(() => {
    return (Array.isArray(invoices) ? invoices : []).filter((inv: any) => {
      const d = new Date(inv.dueDate || inv.createdAt);
      return d >= periodStart && d <= periodEnd;
    });
  }, [invoices, periodStart, periodEnd]);

  const invoicesTotal = useMemo(() => {
    return periodInvoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);
  }, [periodInvoices]);

  // Sum expenses from company accounts transactions within selected period; fallback to summary if no tx available
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

  // Match RevenuePage computation: revenue equals company share (agencyShare) not gross receipts
  const rentalRevenue = useMemo(() => periodFilteredPayments
    .filter(p => p.paymentType === 'rental')
    .reduce((s, p) => s + (p.commissionDetails?.agencyShare || 0), 0), [periodFilteredPayments]);
  const salesRevenue = useMemo(() => periodFilteredPayments
    .filter(p => p.paymentType === 'sale')
    .reduce((s, p) => s + (p.commissionDetails?.agencyShare || 0), 0), [periodFilteredPayments]);
  const totalRevenue = useMemo(() => rentalRevenue + salesRevenue, [rentalRevenue, salesRevenue]);
  const passThroughRows = useMemo(() => {
    const byType = outstandingBreakdown?.passThroughByType || dashboardSummary?.passThroughByType || {};
    return Object.entries(byType).map(([type, row]) => ({
      type,
      label: row.label || type,
      collected: Number(row.collected || 0),
      paid: Number(row.paid || 0),
      outstanding: Number(row.outstanding || 0)
    })).sort((a, b) => b.outstanding - a.outstanding);
  }, [outstandingBreakdown, dashboardSummary]);

  const renderOutstandingProperties = (
    items: OutstandingPropertyBreakdown[],
    emptyMessage: string
  ) => {
    if (!items.length) {
      return <Typography color="text.secondary">{emptyMessage}</Typography>;
    }

    return (
      <Grid container spacing={2}>
        {items.map((row) => (
          <Grid item xs={12} key={row.propertyId}>
            <Card>
              <CardContent>
                <Grid container alignItems="flex-start" spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {row.propertyName}
                    </Typography>
                    <Typography color="text.secondary">{row.propertyAddress}</Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                      <Chip label={`Total owed months: ${row.totalOwedMonths}`} size="small" color="warning" />
                      <Chip label={`Owed: $${Number(row.totalAmount || 0).toLocaleString()}`} size="small" color="error" />
                    </Box>
                    {row.tenants.map((tenant, idx) => (
                      <Box key={tenant.tenantId || idx} sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                          {tenant.tenantName}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {tenant.labels.map((label, labelIdx) => (
                            <Chip key={labelIdx} label={label} size="small" color="warning" />
                          ))}
                        </Box>
                      </Box>
                    ))}
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  };

  const stats = [
    { title: 'Rental Revenue + Company Account', value: rentalRevenue, icon: <PaymentIcon />, color: 'success.main', path: '/accountant-dashboard/revenue' },
    { title: 'Total Revenue', value: totalRevenue, icon: <TrendingUpIcon />, color: 'secondary.main', path: '/accountant-dashboard/revenue' },
    { title: 'Invoices', value: (dashboardSummary?.invoices ?? invoicesTotal), icon: <ReceiptIcon />, color: 'info.main', path: '/accountant-dashboard/written-invoices' },
    { title: 'Sales + Sales Payments', value: salesRevenue, icon: <TrendingUpIcon />, color: 'primary.main', path: '/accountant-dashboard/sales' },
    { title: 'Expenses', value: (dashboardSummary?.expenses ?? expensesForPeriod), icon: <UrgentIcon />, color: 'error.main', path: '/accountant-dashboard/revenue' },
    { title: 'Outstanding rentals', value: outstandingBreakdown?.outstandingRentals ?? 0, icon: <PaymentIcon />, color: 'error.main', path: '' },
    { title: 'Outstanding levies', value: outstandingBreakdown?.outstandingLevies ?? 0, icon: <PendingActionsIcon />, color: 'warning.main', path: '' },
    { title: 'Pass-Through Balances', value: outstandingBreakdown?.passThroughOutstanding ?? dashboardSummary?.passThroughOutstanding ?? 0, icon: <PendingActionsIcon />, color: 'secondary.main', path: '' },
    { title: 'Bank Revenue', value: periodFilteredPayments.filter(p => p.paymentMethod === 'bank_transfer').reduce((s, p) => s + (p.commissionDetails?.agencyShare || 0), 0), icon: <PaymentIcon />, color: 'success.main', path: '/accountant-dashboard/revenue' }
  ];

  // Render dashboard immediately; cards show "Loading…" until their data is ready (no full-page block)
  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" component="h1" sx={{ mb: 3, fontWeight: 600 }}>
        {showWelcome && user?.firstName ? `Welcome back, ${user.firstName}!` : 'Dashboard'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {taxCompliance && (
        <Alert
          severity={Number(taxCompliance.vatOutstanding || 0) > 0 || Number(taxCompliance.cgwtOutstanding || 0) > 0 || Number(taxCompliance.openReviews || 0) > 0 ? 'warning' : 'info'}
          sx={{ mb: 3, cursor: 'pointer' }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/accountant-dashboard/tax')}>
              Tax
            </Button>
          }
          onClick={() => navigate('/accountant-dashboard/tax')}
        >
          Tax Compliance — VAT outstanding {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(taxCompliance.vatOutstanding || 0))};
          {' '}Capital Gains Withholding Tax outstanding {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(taxCompliance.cgwtOutstanding || 0))};
          {' '}{Number(taxCompliance.openReviews || 0)} review item(s). PAYE and corporate tax are not calculated here.
        </Alert>
      )}
      {integritySummary && (
        <Alert
          severity={Number(integritySummary.exceptions || 0) > 0 || Number(integritySummary.incomplete || 0) > 0 ? 'warning' : 'success'}
          sx={{ mb: 3, cursor: 'pointer' }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/accountant-dashboard/accounting-integrity')}>
              Accounting Integrity
            </Button>
          }
          onClick={() => navigate('/accountant-dashboard/accounting-integrity')}
        >
          {Number(integritySummary.exceptions || 0) > 0 || Number(integritySummary.incomplete || 0) > 0
            ? `${Number(integritySummary.exceptions || integritySummary.incomplete || 0)} accounting inconsistencies require attention`
            : 'Accounting is fully reconciled'}
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
        {stats.map((stat, index) => {
          const isCoreDataCard = [
            'Rental Revenue + Company Account',
            'Total Revenue',
            'Sales + Sales Payments',
            'Bank Revenue',
            'Outstanding rentals',
            'Outstanding levies',
            'Pass-Through Balances'
          ].includes(stat.title);
          const isDeferredDataCard = [
            'Expenses',
            'Invoices'
          ].includes(stat.title);
          const hasPrecomputedSummaryValue = (
            (stat.title === 'Expenses' && typeof dashboardSummary?.expenses === 'number') ||
            (stat.title === 'Invoices' && typeof dashboardSummary?.invoices === 'number')
          );
          const isCardLoading =
            (loading && isCoreDataCard) || (deferredLoading && isDeferredDataCard && !hasPrecomputedSummaryValue);

          return (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card 
                elevation={2} 
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': { elevation: 4 }
                }}
                onClick={() => {
                  if (stat.title === 'Outstanding rentals') { setShowOutstandingRentals(true); setShowOutstandingLevies(false); setShowPassThroughBalances(false); return; }
                  if (stat.title === 'Outstanding levies') { setShowOutstandingLevies(true); setShowOutstandingRentals(false); setShowPassThroughBalances(false); return; }
                  if (stat.title === 'Pass-Through Balances') { setShowPassThroughBalances(true); setShowOutstandingRentals(false); setShowOutstandingLevies(false); return; }
                  if (stat.path) navigate(stat.path);
                }}
              >
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="h4" component="div" sx={{ color: stat.color, fontWeight: 'bold' }}>
                        {isCardLoading
                          ? 'Loading…'
                          : (typeof stat.value === 'number'
                              ? `$${Number(stat.value).toLocaleString()}`
                              : stat.value)}
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
          );
        })}
      </Grid>

      {/* Outstanding Details */}
      {(showOutstandingLevies || showOutstandingRentals || showPassThroughBalances) && (
        <Box>
          {showPassThroughBalances ? (
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">Pass-Through Balances</Typography>
                <Button size="small" onClick={() => setShowPassThroughBalances(false)}>Hide</Button>
              </Box>
              <Grid container spacing={2}>
                {(passThroughRows.length ? passThroughRows : [{
                  type: 'empty',
                  label: 'No pass-through balances',
                  collected: 0,
                  paid: 0,
                  outstanding: 0
                }]).map((row) => (
                  <Grid item xs={12} md={4} key={row.type}>
                    <Card>
                      <CardContent>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{row.label}</Typography>
                        <Typography color="text.secondary">Collected: ${Number(row.collected || 0).toLocaleString()}</Typography>
                        <Typography color="text.secondary">Paid: ${Number(row.paid || 0).toLocaleString()}</Typography>
                        <Chip
                          label={`Outstanding: $${Number(row.outstanding || 0).toLocaleString()}`}
                          color={Number(row.outstanding || 0) > 0 ? 'warning' : 'success'}
                          size="small"
                          sx={{ mt: 1 }}
                        />
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ) : showOutstandingLevies ? (
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">Properties Without Levy Payments</Typography>
                <Button size="small" onClick={() => setShowOutstandingLevies(false)}>Hide</Button>
              </Box>
              {renderOutstandingProperties(
                outstandingBreakdown?.levies || [],
                'All levy-paying properties have payments recorded for the lease periods.'
              )}
            </Box>
          ) : (
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">Properties With Unpaid Rentals</Typography>
                <Button size="small" onClick={() => setShowOutstandingRentals(false)}>Hide</Button>
              </Box>
              {renderOutstandingProperties(
                outstandingBreakdown?.rentals || [],
                'All properties have a rental payment recorded for the lease periods.'
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Recent Tasks */}
      <Grid container spacing={3} sx={{ mt: 4 }}>
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
            
            {loading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={24} />
              </Box>
            ) : pendingRequests.length === 0 ? (
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
                      primaryTypographyProps={{ component: 'span' }}
                      secondary={
                        <Box>
                          <Typography variant="body2" component="span">
                            {request.reason}
                          </Typography>
                          <Typography variant="caption" component="span" color="text.secondary" sx={{ display: 'block' }}>
                            Due: {format(new Date(request.dueDate), 'MMM dd, yyyy')} • {request.currency} {request.amount.toLocaleString()}
                          </Typography>
                        </Box>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
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