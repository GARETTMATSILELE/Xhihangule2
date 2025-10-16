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
import { useCompany } from '../../contexts/CompanyContext';
import paymentRequestService, { PaymentRequest } from '../../services/paymentRequestService';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import paymentService from '../../services/paymentService';
import { usePropertyService } from '../../services/propertyService';
import { useTenantService } from '../../services/tenantService';
import { useLeaseService } from '../../services/leaseService';
import companyAccountService from '../../services/companyAccountService';
import { apiService } from '../../api';
import { Payment } from '../../types/payment';

const DashboardOverview: React.FC = () => {
  const { user } = useAuth();
  const { company } = useCompany();
  const navigate = useNavigate();
  const propertyService = usePropertyService();
  const tenantService = useTenantService();
  const leaseService = useLeaseService();
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expensesTotal, setExpensesTotal] = useState<number>(0);
  const [companySummary, setCompanySummary] = useState<{ runningBalance: number; totalIncome: number; totalExpenses: number } | null>(null);
  const [companyTransactions, setCompanyTransactions] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [levyPayments, setLevyPayments] = useState<any[]>([]);
  const [showOutstandingRentals, setShowOutstandingRentals] = useState(false);
  const [showOutstandingLevies, setShowOutstandingLevies] = useState(false);

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
        const props = await propertyService.getPublicProperties();
        setProperties(Array.isArray(props) ? props : []);
      } catch {
        setProperties([]);
      }
      try {
        const tpub = await tenantService.getAllPublic();
        const tlist = Array.isArray(tpub?.tenants) ? tpub.tenants : [];
        setTenants(tlist);
      } catch {
        setTenants([]);
      }
      try {
        const l = await leaseService.getAllPublic();
        setLeases(Array.isArray(l) ? l : []);
      } catch {
        setLeases([]);
      }
      try {
        if (user?.companyId) {
          const levy = await paymentService.getLevyPayments(user.companyId);
          setLevyPayments(Array.isArray(levy) ? levy : []);
        } else {
          setLevyPayments([]);
        }
      } catch {
        setLevyPayments([]);
      }
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
  // Filter out sale/sales properties for rental context
  const rentalProperties = useMemo(() => (properties || []).filter((p: any) => {
    const rt = (p?.rentalType || '').toString().toLowerCase();
    return rt !== 'sale' && rt !== 'sales';
  }), [properties]);
  const propertyById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of rentalProperties) {
      const id = (p && (p._id || p.id)) ? String(p._id || p.id) : '';
      if (id) m[id] = p;
    }
    return m;
  }, [rentalProperties]);
  const tenantById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const t of tenants || []) {
      const id = (t && (t._id || t.id)) ? String(t._id || t.id) : '';
      if (id) m[id] = t;
    }
    return m;
  }, [tenants]);

  // Computed totals similar to AgentDashboard
  const computedOutstandingLevies = useMemo(() => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const cutY = (company as any)?.receivablesCutover?.year;
      const cutM = (company as any)?.receivablesCutover?.month;
      const cutoverDate = (cutY && cutM) ? new Date(Number(cutY), Number(cutM) - 1, 1) : null;
      const ymKey = (y: number, m: number) => `${y}-${m}`;
      const paidByProperty: Record<string, Set<string>> = {};
      const pushPaid = (propId: string, y: number, m: number) => {
        const key = ymKey(y, m);
        if (!paidByProperty[propId]) paidByProperty[propId] = new Set();
        paidByProperty[propId].add(key);
      };
      for (const p of levyPayments || []) {
        const status = (p?.status || '').toString().toLowerCase();
        const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
        if (!isCompleted) continue;
        const pid = String(p?.propertyId?._id || p?.propertyId || p?.property?._id || p?.property?.id || '');
        if (!pid) continue;
        const monthsPaid: number = Number((p as any).advanceMonthsPaid || 1);
        const sy = Number((p as any)?.advancePeriodStart?.year);
        const sm = Number((p as any)?.advancePeriodStart?.month);
        const ey = Number((p as any)?.advancePeriodEnd?.year);
        const em = Number((p as any)?.advancePeriodEnd?.month);
        if (monthsPaid > 1 && sy && sm && ey && em) {
          let y = sy; let m = sm;
          while (y < ey || (y === ey && m <= em)) { pushPaid(pid, y, m); m += 1; if (m > 12) { m = 1; y += 1; } }
        } else {
          const m = (p as any).rentalPeriodMonth || (p as any).levyPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
          const y = (p as any).rentalPeriodYear || (p as any).levyPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
          if (y && m) pushPaid(pid, Number(y), Number(m));
        }
      }
      let total = 0;
      const iterateMonths = (start: Date, end: Date, cb: (y: number, m: number) => void, hardCapMonths: number = 240) => {
        let y = start.getFullYear();
        let m = start.getMonth() + 1;
        let count = 0;
        while ((y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1)) && count < hardCapMonths) {
          cb(y, m); m += 1; if (m > 12) { m = 1; y += 1; } count += 1;
        }
      };
      for (const prop of rentalProperties || []) {
        if (prop?.levyOrMunicipalType !== 'levy') continue;
        const pid = String(prop?._id || prop?.id || '');
        if (!pid) continue;
        const monthlyLevy = Number(prop?.levyOrMunicipalAmount) || 0;
        if (!monthlyLevy) continue;
        const paidKeys = paidByProperty[pid] || new Set<string>();
        const missing = new Set<string>();
        const leasesForProperty = (leases || []).filter((l: any) => String(l?.propertyId?._id || l?.propertyId) === pid);
        for (const l of leasesForProperty) {
          const start = l?.startDate ? new Date(l.startDate) : null;
          const end = l?.endDate ? new Date(l.endDate) : new Date(currentYear, currentMonth - 1, 1);
          if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
          let ns = new Date(start.getFullYear(), start.getMonth(), 1);
          if (cutoverDate && ns.getTime() < cutoverDate.getTime()) ns = cutoverDate;
          const ne = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
          if (ns.getTime() > ne.getTime()) continue;
          iterateMonths(ns, ne, (y, m) => {
            const key = ymKey(y, m);
            if (!paidKeys.has(key)) missing.add(key);
          });
        }
        total += missing.size * monthlyLevy;
      }
      const opening = Number(((company as any)?.levyReceivableOpeningBalance || 0));
      return total + opening;
    } catch { return 0; }
  }, [rentalProperties, leases, levyPayments, company]);

  const computedOutstandingRentals = useMemo(() => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const cutY = (company as any)?.receivablesCutover?.year;
      const cutM = (company as any)?.receivablesCutover?.month;
      const cutoverDate = (cutY && cutM) ? new Date(Number(cutY), Number(cutM) - 1, 1) : null;
      const ymKey = (y: number, m: number) => `${y}-${m}`;
      const paidByProperty: Record<string, Set<string>> = {};
      const pushPaid = (propId: string, y: number, m: number) => {
        const key = ymKey(y, m);
        if (!paidByProperty[propId]) paidByProperty[propId] = new Set();
        paidByProperty[propId].add(key);
      };
      for (const p of payments || []) {
        const t = String((p as any)?.paymentType || '').toLowerCase();
        if (t === 'levy' || t === 'municipal' || t === 'sale') continue;
        const status = (p?.status || '').toString().toLowerCase();
        const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
        if (!isCompleted) continue;
        const anyP: any = p as any;
        const pid = String(anyP?.propertyId ?? anyP?.property?._id ?? anyP?.property?.id ?? '');
        if (!pid) continue;
        const monthsPaid: number = Number((p as any).advanceMonthsPaid || 1);
        const sy = Number((p as any)?.advancePeriodStart?.year);
        const sm = Number((p as any)?.advancePeriodStart?.month);
        const ey = Number((p as any)?.advancePeriodEnd?.year);
        const em = Number((p as any)?.advancePeriodEnd?.month);
        if (monthsPaid > 1 && sy && sm && ey && em) {
          let y = sy; let m = sm;
          while (y < ey || (y === ey && m <= em)) { pushPaid(pid, y, m); m += 1; if (m > 12) { m = 1; y += 1; } }
        } else {
          const m = (p as any).rentalPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
          const y = (p as any).rentalPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
          if (y && m) pushPaid(pid, Number(y), Number(m));
        }
      }
      let total = 0;
      const iterateMonths = (start: Date, end: Date, cb: (y: number, m: number) => void, hardCapMonths: number = 240) => {
        let y = start.getFullYear();
        let m = start.getMonth() + 1;
        let count = 0;
        while ((y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1)) && count < hardCapMonths) {
          cb(y, m); m += 1; if (m > 12) { m = 1; y += 1; } count += 1;
        }
      };
      for (const prop of rentalProperties || []) {
        const pid = String(prop?._id || prop?.id || '');
        if (!pid) continue;
        const monthlyRent = Number(prop?.rent) || 0;
        if (!monthlyRent) continue;
        const paidKeys = paidByProperty[pid] || new Set<string>();
        const missing = new Set<string>();
        const leasesForProperty = (leases || []).filter((l: any) => String(l?.propertyId?._id || l?.propertyId) === pid);
        for (const l of leasesForProperty) {
          const start = l?.startDate ? new Date(l.startDate) : null;
          const end = l?.endDate ? new Date(l.endDate) : new Date(currentYear, currentMonth - 1, 1);
          if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
          let ns = new Date(start.getFullYear(), start.getMonth(), 1);
          if (cutoverDate && ns.getTime() < cutoverDate.getTime()) ns = cutoverDate;
          const ne = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
          if (ns.getTime() > ne.getTime()) continue;
          iterateMonths(ns, ne, (y, m) => {
            const key = ymKey(y, m);
            if (!paidKeys.has(key)) missing.add(key);
          });
        }
        total += missing.size * monthlyRent;
      }
      const opening = Number(((company as any)?.rentReceivableOpeningBalance || 0));
      return total + opening;
    } catch { return 0; }
  }, [rentalProperties, leases, payments, company]);

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
    .filter(p => p.paymentType === 'sale')
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
    { title: 'Outstanding rentals', value: computedOutstandingRentals, icon: <PaymentIcon />, color: 'error.main', path: '' },
    { title: 'Total Receipts', value: periodFilteredPayments.reduce((s, p) => s + p.amount, 0), icon: <TrendingUpIcon />, color: 'secondary.main', path: '/accountant-dashboard/revenue' },
    { title: 'Outstanding levies', value: computedOutstandingLevies, icon: <PendingActionsIcon />, color: 'warning.main', path: '' },
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
              onClick={() => {
                if (stat.title === 'Outstanding rentals') { setShowOutstandingRentals(true); setShowOutstandingLevies(false); return; }
                if (stat.title === 'Outstanding levies') { setShowOutstandingLevies(true); setShowOutstandingRentals(false); return; }
                if (stat.path) navigate(stat.path);
              }}
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

      {/* Outstanding Details */}
      {(showOutstandingLevies || showOutstandingRentals) && (
        <Box>
          {showOutstandingLevies ? (
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">Properties Without Levy Payments</Typography>
                <Button size="small" onClick={() => setShowOutstandingLevies(false)}>Hide</Button>
              </Box>
              {(() => {
                const now = new Date();
                const currentMonth = now.getMonth() + 1;
                const currentYear = now.getFullYear();
                const ymKey = (y: number, m: number) => `${y}-${m}`;
                const paidByProperty: Record<string, Set<string>> = {};
                const pushPaid = (propId: string, y: number, m: number) => {
                  const key = ymKey(y, m);
                  if (!paidByProperty[propId]) paidByProperty[propId] = new Set();
                  paidByProperty[propId].add(key);
                };
                for (const p of levyPayments || []) {
                  const status = (p?.status || '').toString().toLowerCase();
                  const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
                  if (!isCompleted) continue;
                  const pid = String(p?.propertyId?._id || p?.propertyId || p?.property?._id || p?.property?.id || '');
                  if (!pid) continue;
                  const monthsPaid: number = Number((p as any).advanceMonthsPaid || 1);
                  const sy = Number((p as any)?.advancePeriodStart?.year);
                  const sm = Number((p as any)?.advancePeriodStart?.month);
                  const ey = Number((p as any)?.advancePeriodEnd?.year);
                  const em = Number((p as any)?.advancePeriodEnd?.month);
                  if (monthsPaid > 1 && sy && sm && ey && em) {
                    let y = sy; let m = sm;
                    while (y < ey || (y === ey && m <= em)) { pushPaid(pid, y, m); m += 1; if (m > 12) { m = 1; y += 1; } }
                  } else {
                    const m = (p as any).rentalPeriodMonth || (p as any).levyPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
                    const y = (p as any).rentalPeriodYear || (p as any).levyPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
                    if (y && m) pushPaid(pid, Number(y), Number(m));
                  }
                }
                const iterateMonths = (start: Date, end: Date, cb: (y: number, m: number, label: string) => void, hardCapMonths: number = 240) => {
                  let y = start.getFullYear();
                  let m = start.getMonth() + 1;
                  let count = 0;
                  while ((y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1)) && count < hardCapMonths) {
                    const label = new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
                    cb(y, m, label);
                    m += 1; if (m > 12) { m = 1; y += 1; }
                    count += 1;
                  }
                };
                const items = (rentalProperties || [])
                  .filter((prop: any) => prop?.levyOrMunicipalType === 'levy')
                  .map((prop: any) => {
                    const pid = String(prop?._id || prop?.id || '');
                    const paidKeys = paidByProperty[pid] || new Set<string>();
                    const leasesForProperty = (leases || []).filter((l: any) => String(l?.propertyId?._id || l?.propertyId) === pid);
                    const perTenantMissing: Array<{ tenantId: string; tenantName: string; labels: string[] }> = [];
                    let propertyTotalMissing = 0;
                    let propertyTotalAmount = 0;
                    const monthlyLevy = Number(prop?.levyOrMunicipalAmount) || 0;
                    for (const l of leasesForProperty) {
                      const start = l?.startDate ? new Date(l.startDate) : null;
                      const end = l?.endDate ? new Date(l.endDate) : now;
                      if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
                      const normEnd = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
                      let ns2 = new Date(start.getFullYear(), start.getMonth(), 1);
                      const cutY = (company as any)?.receivablesCutover?.year;
                      const cutM = (company as any)?.receivablesCutover?.month;
                      const cutoverDate = (cutY && cutM) ? new Date(Number(cutY), Number(cutM) - 1, 1) : null;
                      if (cutoverDate && ns2.getTime() < cutoverDate.getTime()) ns2 = cutoverDate;
                      const labels: string[] = [];
                      iterateMonths(ns2, new Date(normEnd.getFullYear(), normEnd.getMonth(), 1), (y, m, label) => {
                        if (!paidKeys.has(ymKey(y, m))) labels.push(label);
                      });
                      if (labels.length > 0) {
                        const tid = String(l?.tenantId?._id || l?.tenantId || '');
                        const t = tenantById[tid];
                        const tName = t ? (`${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || t.fullName || 'Unknown Tenant') : 'Unknown Tenant';
                        perTenantMissing.push({ tenantId: tid, tenantName: tName, labels });
                        propertyTotalMissing += labels.length;
                        propertyTotalAmount += labels.length * monthlyLevy;
                      }
                    }
                    return { prop, pid, perTenantMissing, propertyTotalMissing, propertyTotalAmount };
                  })
                  .filter((row: any) => (row.perTenantMissing || []).length > 0)
                  .sort((a: any, b: any) => (b.propertyTotalMissing || 0) - (a.propertyTotalMissing || 0));
                if (!items.length) {
                  return <Typography color="text.secondary">All levy-paying properties have payments recorded for the lease periods.</Typography>;
                }
                return (
                  <Grid container spacing={2}>
                    {items.map((row: any) => {
                      const prop = row.prop;
                      const perTenantMissing = row.perTenantMissing as Array<{ tenantId: string; tenantName: string; labels: string[] }>;
                      return (
                        <Grid item xs={12} key={row.pid}>
                          <Card>
                            <CardContent>
                              <Grid container alignItems="flex-start" spacing={2}>
                                <Grid item xs={12} md={6}>
                                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{prop.name || 'Unnamed Property'}</Typography>
                                  <Typography color="text.secondary">{prop.address || ''}</Typography>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                                    <Chip label={`Total owed months: ${row.propertyTotalMissing}`} size="small" color="warning" />
                                    <Chip label={`Owed: $${Number(row.propertyTotalAmount || 0).toLocaleString()}`} size="small" color="error" />
                                  </Box>
                                  {perTenantMissing.map((pt, idx) => (
                                    <Box key={pt.tenantId || idx} sx={{ mb: 1 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{pt.tenantName}</Typography>
                                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        {pt.labels.map((label: string, i: number) => (
                                          <Chip key={i} label={label} size="small" color="warning" />
                                        ))}
                                      </Box>
                                    </Box>
                                  ))}
                                </Grid>
                              </Grid>
                            </CardContent>
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>
                );
              })()}
            </Box>
          ) : (
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">Properties With Unpaid Rentals</Typography>
                <Button size="small" onClick={() => setShowOutstandingRentals(false)}>Hide</Button>
              </Box>
              {(() => {
                const now = new Date();
                const currentMonth = now.getMonth() + 1;
                const currentYear = now.getFullYear();
                const ymKey = (y: number, m: number) => `${y}-${m}`;
                const paidByProperty: Record<string, Set<string>> = {};
                const pushPaid = (propId: string, y: number, m: number) => {
                  const key = ymKey(y, m);
                  if (!paidByProperty[propId]) paidByProperty[propId] = new Set();
                  paidByProperty[propId].add(key);
                };
                for (const p of payments || []) {
                  const t = String((p as any)?.paymentType || '').toLowerCase();
                  if (t === 'levy' || t === 'municipal' || t === 'sale') continue;
                  const status = (p?.status || '').toString().toLowerCase();
                  const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
                  if (!isCompleted) continue;
                  const anyP: any = p as any;
                  const pid = String(anyP?.propertyId ?? anyP?.property?._id ?? anyP?.property?.id ?? '');
                  if (!pid) continue;
                  const monthsPaid: number = Number((p as any).advanceMonthsPaid || 1);
                  const sy = Number((p as any)?.advancePeriodStart?.year);
                  const sm = Number((p as any)?.advancePeriodStart?.month);
                  const ey = Number((p as any)?.advancePeriodEnd?.year);
                  const em = Number((p as any)?.advancePeriodEnd?.month);
                  if (monthsPaid > 1 && sy && sm && ey && em) {
                    let y = sy; let m = sm;
                    while (y < ey || (y === ey && m <= em)) { pushPaid(pid, y, m); m += 1; if (m > 12) { m = 1; y += 1; } }
                  } else {
                    const m = (p as any).rentalPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
                    const y = (p as any).rentalPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
                    if (y && m) pushPaid(pid, Number(y), Number(m));
                  }
                }
                const iterateMonths = (start: Date, end: Date, cb: (y: number, m: number, label: string) => void, hardCapMonths: number = 240) => {
                  let y = start.getFullYear();
                  let m = start.getMonth() + 1;
                  let count = 0;
                  while ((y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1)) && count < hardCapMonths) {
                    const label = new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
                    cb(y, m, label);
                    m += 1; if (m > 12) { m = 1; y += 1; }
                    count += 1;
                  }
                };
                const items = (rentalProperties || [])
                  .map((prop: any) => {
                    const pid = String(prop?._id || prop?.id || '');
                    const paidKeys = paidByProperty[pid] || new Set<string>();
                    const leasesForProperty = (leases || []).filter((l: any) => String(l?.propertyId?._id || l?.propertyId) === pid);
                    const perTenantMissing: Array<{ tenantId: string; tenantName: string; labels: string[] }> = [];
                    const missingSet = new Set<string>();
                    const missingLabels: string[] = [];
                    for (const l of leasesForProperty) {
                      const start = l?.startDate ? new Date(l.startDate) : null;
                      const end = l?.endDate ? new Date(l.endDate) : new Date(currentYear, currentMonth - 1, 1);
                      if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
                      let ns = new Date(start.getFullYear(), start.getMonth(), 1);
                      const cutY2 = (company as any)?.receivablesCutover?.year;
                      const cutM2 = (company as any)?.receivablesCutover?.month;
                      const cutoverDate2 = (cutY2 && cutM2) ? new Date(Number(cutY2), Number(cutM2) - 1, 1) : null;
                      if (cutoverDate2 && ns.getTime() < cutoverDate2.getTime()) ns = cutoverDate2;
                      const ne = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
                      const labels: string[] = [];
                      iterateMonths(ns, ne, (y, m, label) => {
                        const key = ymKey(y, m);
                        if (!paidKeys.has(key)) {
                          labels.push(label);
                          if (!missingSet.has(key)) { missingSet.add(key); missingLabels.push(label); }
                        }
                      });
                      if (labels.length > 0) {
                        const tid = String(l?.tenantId?._id || l?.tenantId || '');
                        const t = tenantById[tid];
                        const tName = t ? (`${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || t.fullName || 'Unknown Tenant') : 'Unknown Tenant';
                        perTenantMissing.push({ tenantId: tid, tenantName: tName, labels });
                      }
                    }
                    const missed = missingSet.size;
                    const monthlyRent = Number(prop?.rent) || 0;
                    const propertyTotalAmount = missed * monthlyRent;
                    return { prop, pid, missed, missingLabels, perTenantMissing, propertyTotalAmount };
                  })
                  .filter((row: any) => (row.missed || 0) > 0)
                  .sort((a: any, b: any) => (b.missed || 0) - (a.missed || 0));
                if (!items.length) {
                  return <Typography color="text.secondary">All properties have a rental payment recorded for the lease periods.</Typography>;
                }
                return (
                  <Grid container spacing={2}>
                    {items.map((row: any) => {
                      const prop = row.prop;
                      const perTenantMissing = row.perTenantMissing as Array<{ tenantId: string; tenantName: string; labels: string[] }>;
                      return (
                        <Grid item xs={12} key={row.pid}>
                          <Card>
                            <CardContent>
                              <Grid container alignItems="flex-start" spacing={2}>
                                <Grid item xs={12} md={6}>
                                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{prop.name || 'Unnamed Property'}</Typography>
                                  <Typography color="text.secondary">{prop.address || ''}</Typography>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                                    <Chip label={`Total owed months: ${row.missed}`} size="small" color="warning" />
                                    <Chip label={`Owed: $${Number(row.propertyTotalAmount || 0).toLocaleString()}`} size="small" color="error" />
                                  </Box>
                                  {perTenantMissing.map((pt, idx) => (
                                    <Box key={pt.tenantId || idx} sx={{ mb: 1 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{pt.tenantName}</Typography>
                                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        {pt.labels.map((label: string, i: number) => (
                                          <Chip key={i} label={label} size="small" color="warning" />
                                        ))}
                                      </Box>
                                    </Box>
                                  ))}
                                </Grid>
                              </Grid>
                            </CardContent>
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>
                );
              })()}
            </Box>
          )}
        </Box>
      )}

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