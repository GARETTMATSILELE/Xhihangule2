import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  ReceiptLong as ReceiptLongIcon,
} from '@mui/icons-material';
import { AgentSidebar } from '../components/Layout/AgentSidebar';
import { Header } from '../components/Layout/Header';
import { Properties } from './Properties/Properties';
import { Tenants } from './Tenants/Tenants';
import AgentLeasesPage from './agent/AgentLeasesPage';
import AgentPropertyOwnersPage from './agent/AgentPropertyOwnersPage';
import PaymentsPage from './PaymentsPage';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { Files } from './Files/Files';
import { Maintenance } from './Maintenance/Maintenance';
import { Inspections } from './Inspections/Inspections';
import { Settings } from './Settings/Settings';
import { AgentSettings } from './Settings/AgentSettings';
// Removed MaintenancePageWrapper to avoid double sidebar/layout
import LevyPaymentsPage from './agent/LevyPaymentsPage';
import { SchedulePage } from './agent';
import paymentService from '../services/paymentService';
import AgentLeadsPage from './agent/AgentLeadsPage';
import PropertyDetailsPage from './agent/PropertyDetailsPage';
import { User } from '../types/auth';

const StatCard = ({ title, value, icon, color, loading, onClick }: { title: string; value: string; icon: React.ReactNode; color: string; loading?: boolean; onClick?: () => void }) => (
  <Card onClick={onClick} sx={{ cursor: onClick ? 'pointer' : 'default' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box
          sx={{
            backgroundColor: `${color}15`,
            borderRadius: 2,
            p: 1,
            mr: 2,
            color: color,
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" color="text.secondary">
          {title}
        </Typography>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
          {value}
        </Typography>
      )}
      <LinearProgress
        variant="determinate"
        value={70}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: `${color}15`,
          '& .MuiLinearProgress-bar': {
            backgroundColor: color,
          },
        }}
      />
    </CardContent>
  </Card>
);

// Helper to normalize possible id shapes (string, {$oid}, {_id}, or embedded doc)
function getId(id: any): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object') {
    // Direct {$oid}
    if (id.$oid) return id.$oid;
    // MongoDB doc reference with _id possibly as string or {$oid}
    if (id._id) {
      if (typeof id._id === 'string') return id._id;
      if (typeof id._id === 'object' && id._id.$oid) return id._id.$oid;
    }
    // Common alternative key
    if (id.id) {
      if (typeof id.id === 'string') return id.id;
      if (typeof id.id === 'object' && id.id.$oid) return id.id.$oid;
    }
  }
  return '';
}

const AgentDashboard: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    if (sessionId) {
      (window as any).__API_BASE__ = `${window.location.origin}/api/s/${sessionId}`;
    }
  }, []);
  const [activeTab, setActiveTab] = useState(0);
  const { user, company, isAuthenticated, loading: authLoading } = useAuth();
  const { company: companyCtx } = useCompany();
  const maintenanceUser: User | undefined = user ?? undefined;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState({
    totalProperties: 0,
    activeTenants: 0,
    activeLeases: 0,
    monthlyCommission: 0,
  });
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [propertyById, setPropertyById] = useState<Record<string, any>>({});
  const [tenantById, setTenantById] = useState<Record<string, any>>({});
  const [tenantToActivePropertyId, setTenantToActivePropertyId] = useState<Record<string, string>>({});
  const [showLeaseInsights, setShowLeaseInsights] = useState(false);
  const [selectedLeaseCategory, setSelectedLeaseCategory] = useState<'all' | 'expired' | 'expiring' | 'aboutToExpire'>('all');
  const [showCommissionDetails, setShowCommissionDetails] = useState(false);
  const [commissionPayments, setCommissionPayments] = useState<any[]>([]);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [commissionError, setCommissionError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showActiveTenants, setShowActiveTenants] = useState(false);
  const [showPropertiesList, setShowPropertiesList] = useState(false);
  const [showOutstandingRentals, setShowOutstandingRentals] = useState(false);
  const [showOutstandingLevies, setShowOutstandingLevies] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [levyPayments, setLevyPayments] = useState<any[]>([]);
  const [outstandingRentals, setOutstandingRentals] = useState<number>(0);
  const [outstandingLevies, setOutstandingLevies] = useState<number>(0);

  // Computed total outstanding levies across all properties based on unpaid months in lease periods
  const computedOutstandingLevies = React.useMemo(() => {
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
        const propertyId = getId(p.propertyId) || getId(p.property) || getId(p?.property?._id) || getId(p?.property?.id);
        if (!propertyId) continue;
        const monthsPaid: number = Number((p as any).advanceMonthsPaid || 1);
        const startY = Number((p as any)?.advancePeriodStart?.year);
        const startM = Number((p as any)?.advancePeriodStart?.month);
        const endY = Number((p as any)?.advancePeriodEnd?.year);
        const endM = Number((p as any)?.advancePeriodEnd?.month);
        if (monthsPaid > 1 && startY && startM && endY && endM) {
          let y = startY;
          let m = startM;
          while (y < endY || (y === endY && m <= endM)) {
            pushPaid(propertyId, y, m);
            m += 1; if (m > 12) { m = 1; y += 1; }
          }
        } else {
          const m = (p as any).rentalPeriodMonth || (p as any).levyPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
          const y = (p as any).rentalPeriodYear || (p as any).levyPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
          if (y && m) pushPaid(propertyId, Number(y), Number(m));
        }
      }

      // Sum owed across properties of levy type only
      let total = 0;
      const iterateMonths = (
        start: Date,
        end: Date,
        cb: (y: number, m: number) => void,
        hardCapMonths: number = 240
      ) => {
        let y = start.getFullYear();
        let m = start.getMonth() + 1;
        let count = 0;
        while ((y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1)) && count < hardCapMonths) {
          cb(y, m);
          m += 1; if (m > 12) { m = 1; y += 1; }
          count += 1;
        }
      };

      for (const prop of properties || []) {
        if (prop?.levyOrMunicipalType !== 'levy') continue;
        const pid = getId(prop._id) || getId(prop.id);
        if (!pid) continue;
        const monthlyLevy = Number(prop?.levyOrMunicipalAmount) || 0;
        if (!monthlyLevy) continue;
        const paidKeys = paidByProperty[pid] || new Set<string>();

        // Union of missing months across leases
        const missingKeys = new Set<string>();
        const leasesForProperty = (leases || []).filter((l: any) => (getId(l.propertyId) || '') === pid);
        for (const l of leasesForProperty) {
          const start = l?.startDate ? new Date(l.startDate) : null;
          const end = l?.endDate ? new Date(l.endDate) : new Date(currentYear, currentMonth - 1, 1);
          if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
          let normStart = new Date(start.getFullYear(), start.getMonth(), 1);
          if (cutoverDate) {
            // Use the later of lease start and cutover
            if (normStart.getTime() < cutoverDate.getTime()) normStart = cutoverDate;
          }
          const normEnd = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
          if (normStart.getTime() > normEnd.getTime()) continue;
          iterateMonths(normStart, normEnd, (y, m) => {
            const key = ymKey(y, m);
            if (!paidKeys.has(key)) missingKeys.add(key);
          });
        }
        total += missingKeys.size * monthlyLevy;
      }
      const opening = Number((companyCtx as any)?.levyReceivableOpeningBalance || 0);
      return total + opening;
    } catch {
      return 0;
    }
  }, [properties, leases, levyPayments, companyCtx]);

  // Computed total outstanding rentals across all properties based on unpaid months in lease periods
  const computedOutstandingRentals = React.useMemo(() => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const cutY = (companyCtx as any)?.receivablesCutover?.year;
      const cutM = (companyCtx as any)?.receivablesCutover?.month;
      const cutoverDate = (cutY && cutM) ? new Date(Number(cutY), Number(cutM) - 1, 1) : null;
      const ymKey = (y: number, m: number) => `${y}-${m}`;
      const paidByProperty: Record<string, Set<string>> = {};
      const pushPaid = (propId: string, y: number, m: number) => {
        const key = ymKey(y, m);
        if (!paidByProperty[propId]) paidByProperty[propId] = new Set();
        paidByProperty[propId].add(key);
      };
      for (const p of payments || []) {
        const t = (p?.paymentType || p?.type || '').toString().toLowerCase();
        if (t === 'levy' || t === 'municipal') continue;
        const status = (p?.status || '').toString().toLowerCase();
        const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
        if (!isCompleted) continue;
        const propertyId = getId(p.propertyId) || getId(p.property) || getId(p?.property?._id) || getId(p?.property?.id);
        if (!propertyId) continue;
        const monthsPaid: number = Number((p as any).advanceMonthsPaid || 1);
        const startY = Number((p as any)?.advancePeriodStart?.year);
        const startM = Number((p as any)?.advancePeriodStart?.month);
        const endY = Number((p as any)?.advancePeriodEnd?.year);
        const endM = Number((p as any)?.advancePeriodEnd?.month);
        if (monthsPaid > 1 && startY && startM && endY && endM) {
          let y = startY;
          let m = startM;
          while (y < endY || (y === endY && m <= endM)) {
            pushPaid(propertyId, y, m);
            m += 1; if (m > 12) { m = 1; y += 1; }
          }
        } else {
          const m = (p as any).rentalPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
          const y = (p as any).rentalPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
          if (y && m) pushPaid(propertyId, Number(y), Number(m));
        }
      }

      let total = 0;
      const iterateMonths = (
        start: Date,
        end: Date,
        cb: (y: number, m: number) => void,
        hardCapMonths: number = 240
      ) => {
        let y = start.getFullYear();
        let m = start.getMonth() + 1;
        let count = 0;
        while ((y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1)) && count < hardCapMonths) {
          cb(y, m);
          m += 1; if (m > 12) { m = 1; y += 1; }
          count += 1;
        }
      };

      for (const prop of properties || []) {
        const pid = getId(prop._id) || getId(prop.id);
        if (!pid) continue;
        const monthlyRent = Number(prop?.rent) || 0;
        if (!monthlyRent) continue;
        const paidKeys = paidByProperty[pid] || new Set<string>();
        const missingKeys = new Set<string>();
        const leasesForProperty = (leases || []).filter((l: any) => (getId(l.propertyId) || '') === pid);
        for (const l of leasesForProperty) {
          const start = l?.startDate ? new Date(l.startDate) : null;
          const end = l?.endDate ? new Date(l.endDate) : new Date(currentYear, currentMonth - 1, 1);
          if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
          let normStart = new Date(start.getFullYear(), start.getMonth(), 1);
          if (cutoverDate) {
            if (normStart.getTime() < cutoverDate.getTime()) normStart = cutoverDate;
          }
          const normEnd = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
          if (normStart.getTime() > normEnd.getTime()) continue;
          iterateMonths(normStart, normEnd, (y, m) => {
            const key = ymKey(y, m);
            if (!paidKeys.has(key)) missingKeys.add(key);
          });
        }
        total += missingKeys.size * monthlyRent;
      }
      const opening = Number((companyCtx as any)?.rentReceivableOpeningBalance || 0);
      return total + opening;
    } catch {
      return 0;
    }
  }, [properties, leases, payments, companyCtx]);

  // Expand advance payments across covered months for per-month filtering
  const expandedCommissionPayments = React.useMemo(() => {
    const out: any[] = [];
    for (const p of commissionPayments || []) {
      const agentShareTotal = p?.commissionDetails?.agentShare || 0;
      const monthsPaid: number = Number(p?.advanceMonthsPaid || 1);
      if (monthsPaid > 1 && p?.advancePeriodStart && p?.advancePeriodEnd) {
        const perMonthShare = agentShareTotal / monthsPaid;
        let y = Number(p.advancePeriodStart.year);
        let m = Number(p.advancePeriodStart.month); // 1-12
        const endY = Number(p.advancePeriodEnd.year);
        const endM = Number(p.advancePeriodEnd.month);
        while (y < endY || (y === endY && m <= endM)) {
          out.push({ ...p, rentalPeriodYear: y, rentalPeriodMonth: m, _distributedAgentShare: perMonthShare });
          m += 1;
          if (m > 12) { m = 1; y += 1; }
        }
      } else {
        // Single month entry
        out.push({ ...p, _distributedAgentShare: agentShareTotal });
      }
    }
    return out;
  }, [commissionPayments]);

  const filteredMonthlyAgentShare = React.useMemo(() => {
    if (!expandedCommissionPayments || expandedCommissionPayments.length === 0) return null;
    const total = expandedCommissionPayments
      .filter((p: any) => {
        const rentMonth = p.rentalPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
        const rentYear = p.rentalPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
        return rentMonth === selectedMonth && rentYear === selectedYear;
      })
      .reduce((sum: number, p: any) => sum + (p._distributedAgentShare || p.commissionDetails?.agentShare || 0), 0);
    return total;
  }, [expandedCommissionPayments, selectedMonth, selectedYear]);

  const fetchCommissionPaymentsForYear = async (year: number) => {
    if (!user) return;
    try {
      setCommissionLoading(true);
      setCommissionError(null);
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      const filters: any = {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: 'completed',
        agentId: user._id,
      };
      const response = await paymentService.getAllPublic(user.companyId, filters);
      setCommissionPayments(response.data || []);
    } catch (err: any) {
      console.error('Error loading commission payments:', err);
      setCommissionError(err instanceof Error ? err.message : 'Failed to load commission payments');
    } finally {
      setCommissionLoading(false);
    }
  };

  const loadCommissionPayments = async () => {
    setSelectedMonth(new Date().getMonth() + 1);
    setSelectedYear(new Date().getFullYear());
    await fetchCommissionPaymentsForYear(new Date().getFullYear());
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch properties and related dashboard data
        const [
          propertiesResponse,
          tenantsResponse,
          leasesResponse,
          commissionResponse,
          paymentsResponse,
          levyPaymentsResponse,
        ] = await Promise.all([
          api.get('/agents/properties'),
          api.get('/agents/tenants'),
          api.get('/agents/leases'),
          api.get('/agents/commission'),
          api.get('/agents/payments').catch(() => ({ data: [] })),
          api.get('/agents/levy-payments').catch(() => ({ data: [] })),
        ]);

        const properties = propertiesResponse.data;
        const tenants = tenantsResponse.data;
        const leases = leasesResponse.data;
        const commission = commissionResponse.data;
        const paymentsData = Array.isArray(paymentsResponse?.data) ? paymentsResponse.data : [];
        const levyPaysData = Array.isArray(levyPaymentsResponse?.data) ? levyPaymentsResponse.data : [];

        // Exclude sale/sales properties from rental dashboard
        const rentalProperties = (properties || []).filter((p: any) => {
          const rt = (p?.rentalType || '').toString().toLowerCase();
          return rt !== 'sale' && rt !== 'sales';
        });
        const allowedPropertyIds = new Set<string>(
          rentalProperties
            .map((p: any) => getId(p._id) || getId(p.id))
            .filter((id: any) => !!id)
        );
        const activeLeasesFiltered = (leases || []).filter(
          (l: any) => (l?.status || '').toLowerCase() === 'active' && allowedPropertyIds.has(getId(l.propertyId))
        );
        const uniqueTenantIds = new Set<string>();
        activeLeasesFiltered.forEach((l: any) => {
          const tid = getId(l.tenantId);
          if (tid) uniqueTenantIds.add(tid);
        });

        setDashboardData({
          totalProperties: rentalProperties.length,
          activeTenants: uniqueTenantIds.size,
          activeLeases: activeLeasesFiltered.length,
          monthlyCommission: commission.monthlyCommission || 0,
        });
        setProperties(rentalProperties);
        setTenants(tenants);
        setLeases(leases);
        setPayments(paymentsData);
        setLevyPayments(levyPaysData);

        // Compute outstanding amounts for rentals and levies (non-completed statuses)
        const sumOutstanding = (arr: any[]) =>
          (arr || []).reduce((sum: number, p: any) => {
            const status = (p?.status || '').toString().toLowerCase();
            const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
            const amount = Number(p?.amount) || 0;
            return sum + (isCompleted ? 0 : amount);
          }, 0);
        const isNonLevyOrMunicipal = (p: any) => {
          const t = (p?.paymentType || p?.type || '').toString().toLowerCase();
          return t !== 'levy' && t !== 'municipal';
        };
        const getPaymentPropertyId = (p: any) =>
          getId(p?.propertyId) || getId(p?.property) || getId(p?.property?._id) || getId(p?.property?.id);
        setOutstandingRentals(
          sumOutstanding(
            paymentsData
              .filter(isNonLevyOrMunicipal)
              .filter((p: any) => allowedPropertyIds.has(getPaymentPropertyId(p) || ''))
          )
        );
        setOutstandingLevies(
          sumOutstanding(
            levyPaysData.filter((p: any) => allowedPropertyIds.has(getPaymentPropertyId(p) || ''))
          )
        );

        // Build fast lookup maps to avoid ID shape issues and O(n^2) lookups
        const propMap: Record<string, any> = {};
        rentalProperties.forEach((p: any) => {
          const key = getId(p._id) || getId(p.id);
          if (key) propMap[key] = p;
        });
        setPropertyById(propMap);

        const tenMap: Record<string, any> = {};
        tenants.forEach((t: any) => {
          const key = getId(t._id) || getId(t.id);
          if (key) tenMap[key] = t;
        });
        setTenantById(tenMap);

        // Map tenantId -> active lease's propertyId for reliable property lookup
        const tToProp: Record<string, string> = {};
        activeLeasesFiltered.forEach((l: any) => {
            const tKey = getId(l.tenantId);
            const pKey = getId(l.propertyId);
            if (tKey && pKey) tToProp[tKey] = pKey;
          });
        setTenantToActivePropertyId(tToProp);
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err.response?.data?.message || 'Failed to fetch dashboard data');
      } finally {
        setLoading(false);
      }
    };

    if (user && user.role === 'agent') {
      fetchDashboardData();
    } else if (user && user.role !== 'agent') {
      setError('Access denied. Agent role required.');
      setLoading(false);
    }
  }, [user]);

  // Helper resolvers
  const resolvePropertyForTenant = (tenant: any) => {
    // propertyId may be an id, an embedded object, or missing; fall back from active leases map
    const explicitPropId = getId(tenant?.propertyId) || getId(tenant?.property);
    const tenantKey = getId(tenant?._id) || getId(tenant?.id) || '';
    const fallbackPropId = tenantKey ? tenantToActivePropertyId[tenantKey] : '';
    const propId = explicitPropId || fallbackPropId || '';
    return propertyById[propId];
  };

  const resolvePropertyById = (propertyId: any) => propertyById[getId(propertyId)];
  const resolveTenantById = (tenantId: any) => tenantById[getId(tenantId)];

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AgentSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ p: 3, mt: 8 }}>
          <Routes>
            <Route index element={
              <>
                <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
                  Agent Dashboard
                </Typography>
                {error && (
                  <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                  </Alert>
                )}
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6} lg={3}>
                    <StatCard
                      title="My Properties"
                      value={dashboardData.totalProperties.toString()}
                      icon={<BusinessIcon />}
                      color="#5E72E4"
                      loading={loading}
                      onClick={() => {
                        setShowPropertiesList(true);
                        setShowLeaseInsights(false);
                        setShowCommissionDetails(false);
                        setShowActiveTenants(false);
                        setShowOutstandingRentals(false);
                        setShowOutstandingLevies(false);
                      }}
                    />
                    <Box sx={{ mt: 2 }}>
                      <StatCard
                        title="Outstanding rentals"
                        value={`$${(computedOutstandingRentals || outstandingRentals || 0).toLocaleString()}`}
                        icon={<PaymentIcon />}
                        color="#F5365C"
                        loading={loading}
                        onClick={() => {
                          setShowOutstandingRentals(true);
                          setShowOutstandingLevies(false);
                          setShowCommissionDetails(false);
                          setShowLeaseInsights(false);
                          setShowActiveTenants(false);
                          setShowPropertiesList(false);
                        }}
                      />
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <StatCard
                      title="Active Tenants"
                      value={dashboardData.activeTenants.toString()}
                      icon={<PeopleIcon />}
                      color="#11CDEF"
                      loading={loading}
                      onClick={() => {
                        setShowActiveTenants(true);
                        setShowLeaseInsights(false);
                        setShowCommissionDetails(false);
                        setShowPropertiesList(false);
                        setShowOutstandingRentals(false);
                        setShowOutstandingLevies(false);
                      }}
                    />
                    <Box sx={{ mt: 2 }}>
                      <StatCard
                        title="Outstanding levies"
                        value={`$${(computedOutstandingLevies || outstandingLevies || 0).toLocaleString()}`}
                        icon={<ReceiptLongIcon />}
                        color="#FFA534"
                        loading={loading}
                        onClick={() => {
                          setShowOutstandingLevies(true);
                          setShowOutstandingRentals(false);
                          setShowCommissionDetails(false);
                          setShowLeaseInsights(false);
                          setShowActiveTenants(false);
                          setShowPropertiesList(false);
                        }}
                      />
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <StatCard
                      title="Active Leases"
                      value={dashboardData.activeLeases.toString()}
                      icon={<DescriptionIcon />}
                      color="#2DCE89"
                      loading={loading}
                      onClick={() => {
                        setShowLeaseInsights(true);
                        setSelectedLeaseCategory('all');
                        setShowCommissionDetails(false);
                        setShowActiveTenants(false);
                        setShowPropertiesList(false);
                        setShowOutstandingRentals(false);
                        setShowOutstandingLevies(false);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <StatCard
                      title="Monthly Commission"
                      value={`$${(
                        (filteredMonthlyAgentShare != null
                          ? filteredMonthlyAgentShare
                          : dashboardData.monthlyCommission) || 0
                      ).toLocaleString()}`}
                      icon={<PaymentIcon />}
                      color="#FB6340"
                      loading={loading}
                      onClick={() => {
                        setShowCommissionDetails(true);
                        setShowLeaseInsights(false);
                        setShowActiveTenants(false);
                        setShowPropertiesList(false);
                        setShowOutstandingRentals(false);
                        setShowOutstandingLevies(false);
                        loadCommissionPayments();
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Card>
                      <CardContent>
                        {showCommissionDetails ? (
                          <>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                              <Typography variant="h6">Commission Payments</Typography>
                              <Button size="small" onClick={() => setShowCommissionDetails(false)}>Hide</Button>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                              <FormControl size="small" sx={{ minWidth: 160 }}>
                                <InputLabel id="commission-month-label">Month</InputLabel>
                                <Select
                                  labelId="commission-month-label"
                                  value={selectedMonth}
                                  label="Month"
                                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                >
                                  {[
                                    'January','February','March','April','May','June','July','August','September','October','November','December'
                                  ].map((m, idx) => (
                                    <MenuItem key={m} value={idx + 1}>{m}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                              <FormControl size="small" sx={{ minWidth: 120 }}>
                                <InputLabel id="commission-year-label">Year</InputLabel>
                                <Select
                                  labelId="commission-year-label"
                                  value={selectedYear}
                                  label="Year"
                                  onChange={async (e) => {
                                    const y = Number(e.target.value);
                                    setSelectedYear(y);
                                    await fetchCommissionPaymentsForYear(y);
                                  }}
                                >
                                  {Array.from({ length: 8 }).map((_, i) => {
                                    const year = new Date().getFullYear() - 5 + i;
                                    return <MenuItem key={year} value={year}>{year}</MenuItem>;
                                  })}
                                </Select>
                              </FormControl>
                            </Box>
                            {commissionLoading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                                <CircularProgress />
                              </Box>
                            ) : commissionError ? (
                              <Alert severity="error">{commissionError}</Alert>
                            ) : (
                              (() => {
                                const filteredPayments = expandedCommissionPayments.filter((p: any) => {
                                  const rentMonth = p.rentalPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
                                  const rentYear = p.rentalPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
                                  return rentMonth === selectedMonth && rentYear === selectedYear;
                                });
                                const summedAgentShare = filteredPayments.reduce((sum: number, p: any) => sum + (p._distributedAgentShare || p.commissionDetails?.agentShare || 0), 0);
                                return (
                                  <>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                      Total agent share for {new Date(selectedYear, selectedMonth - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}: ${summedAgentShare.toLocaleString()}
                                    </Typography>
                                    {filteredPayments.length === 0 ? (
                                      <Typography color="text.secondary">No commission payments found for the selected period.</Typography>
                                    ) : (
                                      <Box sx={{ maxHeight: 420, overflowY: 'auto', pr: 1 }}>
                                        <Grid container spacing={2}>
                                          {filteredPayments.map((pay: any) => {
                                            const propertyId =
                                              getId(pay.propertyId) ||
                                              getId(pay.property) ||
                                              getId(pay?.property?._id) ||
                                              getId(pay?.property?.id);
                                            const tenantId =
                                              getId(pay.tenantId) ||
                                              getId(pay.tenant) ||
                                              getId(pay?.tenant?._id) ||
                                              getId(pay?.tenant?.id);
                                            const propertyObj = resolvePropertyById(propertyId);
        
                                            const propertyName =
                                              propertyObj?.name ||
                                              pay?.property?.name ||
                                              pay?.property?.title ||
                                              pay?.propertyName ||
                                              'Unknown Property';
                                            const tenantObj = resolveTenantById(tenantId);
                                            const tenantName = tenantObj
                                              ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim() || tenantObj.name || tenantObj.fullName || 'Unknown Tenant'
                                              : (`${pay?.tenant?.firstName || ''} ${pay?.tenant?.lastName || ''}`.trim() || pay?.tenant?.name || pay?.tenant?.fullName || pay?.tenantName || 'Unknown Tenant');
                                            const paymentDate = pay.paymentDate ? new Date(pay.paymentDate) : null;
                                            const agentShare = pay._distributedAgentShare || pay.commissionDetails?.agentShare || 0;
                                            const totalCommission = pay.commissionDetails?.totalCommission || 0;
                                            return (
                                              <Grid item xs={12} key={pay._id}>
                                                <Card>
                                                  <CardContent>
                                                    <Grid container alignItems="center" spacing={2}>
                                                      <Grid item xs={12} md={5}>
                                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{propertyName}</Typography>
                                                        <Typography color="text.secondary">Tenant: {tenantName}</Typography>
                                                      </Grid>
                                                      <Grid item xs={12} md={4}>
                                                        <Typography color="text.secondary">Payment Date</Typography>
                                                        <Typography>{paymentDate ? paymentDate.toLocaleDateString() : 'N/A'}</Typography>
                                                      </Grid>
                                                      <Grid item xs={12} md={3}>
                                                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                          <Chip label={`Agent Share: $${agentShare.toLocaleString()}`} color="success" size="small" />
                                                          <Chip label={`Commission: $${totalCommission.toLocaleString()}`} color="warning" size="small" />
                                                        </Box>
                                                      </Grid>
                                                    </Grid>
                                                  </CardContent>
                                                </Card>
                                              </Grid>
                                            );
                                          })}
                                        </Grid>
                                      </Box>
                                    )}
                                  </>
                                );
                              })()
                            )}
                          </>
                        ) : showOutstandingLevies ? (
                          <>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                              <Typography variant="h6">Properties Without Levy Payments</Typography>
                              <Button size="small" onClick={() => setShowOutstandingLevies(false)}>Hide</Button>
                            </Box>
                            {loading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                                <CircularProgress />
                              </Box>
                            ) : (
                              (() => {
                                const now = new Date();
                                const currentMonth = now.getMonth() + 1; // 1-12
                                const currentYear = now.getFullYear();
                                const ymKey = (y: number, m: number) => `${y}-${m}`;
                                const cutY = (companyCtx as any)?.receivablesCutover?.year;
                                const cutM = (companyCtx as any)?.receivablesCutover?.month;
                                const cutoverDate = (cutY && cutM) ? new Date(Number(cutY), Number(cutM) - 1, 1) : null;
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
                                  const propertyId = getId(p.propertyId) || getId(p.property) || getId(p?.property?._id) || getId(p?.property?.id);
                                  if (!propertyId) continue;
                                  const monthsPaid: number = Number((p as any).advanceMonthsPaid || 1);
                                  const startY = Number((p as any)?.advancePeriodStart?.year);
                                  const startM = Number((p as any)?.advancePeriodStart?.month);
                                  const endY = Number((p as any)?.advancePeriodEnd?.year);
                                  const endM = Number((p as any)?.advancePeriodEnd?.month);
                                  if (monthsPaid > 1 && startY && startM && endY && endM) {
                                    let y = startY;
                                    let m = startM;
                                    while (y < endY || (y === endY && m <= endM)) {
                                      pushPaid(propertyId, y, m);
                                      m += 1; if (m > 12) { m = 1; y += 1; }
                                    }
                                  } else {
                                    const m = (p as any).rentalPeriodMonth || (p as any).levyPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
                                    const y = (p as any).rentalPeriodYear || (p as any).levyPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
                                    if (y && m) pushPaid(propertyId, Number(y), Number(m));
                                  }
                                }
                                // Helper: iterate months between two dates inclusive by month
                                const iterateMonths = (
                                  start: Date,
                                  end: Date,
                                  cb: (y: number, m: number, label: string) => void,
                                  hardCapMonths: number = 240
                                ) => {
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

                                // Build items per property; for each lease (tenant), list missing levy months within lease period
                                const items = (properties || [])
                                  .filter((prop: any) => prop?.levyOrMunicipalType === 'levy')
                                  .map((prop: any) => {
                                    const pid = getId(prop._id) || getId(prop.id);
                                    const paidKeys = paidByProperty[pid] || new Set<string>();
                                    // Collect leases for this property (use full lease history)
                                    const leasesForProperty = (leases || []).filter((l: any) => (getId(l.propertyId) || '') === pid);
                                    // For each lease, compute missing months attributed to the lease tenant
                                    const perTenantMissing: Array<{ tenantId: string; tenantName: string; labels: string[] } > = [];
                                    let propertyTotalMissing = 0;
                                    let propertyTotalAmount = 0;
                                    const monthlyLevy = Number(prop?.levyOrMunicipalAmount) || 0;
                                    for (const l of leasesForProperty) {
                                      const start = l?.startDate ? new Date(l.startDate) : null;
                                      // Missing end means ongoing; cap at current month
                                      const end = l?.endDate ? new Date(l.endDate) : now;
                                      if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
                                      // Normalize end to not exceed current month
                                      const normEnd = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
                                      let ns = new Date(start.getFullYear(), start.getMonth(), 1);
                                      if (cutoverDate && ns.getTime() < cutoverDate.getTime()) ns = cutoverDate;
                                      const labels: string[] = [];
                                      iterateMonths(ns, new Date(normEnd.getFullYear(), normEnd.getMonth(), 1), (y, m, label) => {
                                        if (!paidKeys.has(ymKey(y, m))) labels.push(label);
                                      });
                                      if (labels.length > 0) {
                                        const tid = getId(l.tenantId) || '';
                                        const t = resolveTenantById(tid);
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
                              })()
                            )}
                          </>
                        ) : showOutstandingRentals ? (
                          <>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                              <Typography variant="h6">Properties With Unpaid Rentals</Typography>
                              <Button size="small" onClick={() => setShowOutstandingRentals(false)}>Hide</Button>
                            </Box>
                            {loading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                                <CircularProgress />
                              </Box>
                            ) : (
                              (() => {
                                const now = new Date();
                                const currentMonth = now.getMonth() + 1; // 1-12
                                const currentYear = now.getFullYear();
                                const ymKey = (y: number, m: number) => `${y}-${m}`;
                                const decMonth = (y: number, m: number) => {
                                  m -= 1; if (m < 1) { m = 12; y -= 1; } return { y, m };
                                };
                                const paidByProperty: Record<string, Set<string>> = {};
                                const pushPaid = (propId: string, y: number, m: number) => {
                                  const key = ymKey(y, m);
                                  if (!paidByProperty[propId]) paidByProperty[propId] = new Set();
                                  paidByProperty[propId].add(key);
                                };
                                for (const p of payments || []) {
                                  const t = (p?.paymentType || p?.type || '').toString().toLowerCase();
                                  if (t === 'levy' || t === 'municipal') continue;
                                  const status = (p?.status || '').toString().toLowerCase();
                                  const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
                                  if (!isCompleted) continue;
                                  const propertyId = getId(p.propertyId) || getId(p.property) || getId(p?.property?._id) || getId(p?.property?.id);
                                  if (!propertyId) continue;
                                  const monthsPaid: number = Number((p as any).advanceMonthsPaid || 1);
                                  const startY = Number((p as any)?.advancePeriodStart?.year);
                                  const startM = Number((p as any)?.advancePeriodStart?.month);
                                  const endY = Number((p as any)?.advancePeriodEnd?.year);
                                  const endM = Number((p as any)?.advancePeriodEnd?.month);
                                  if (monthsPaid > 1 && startY && startM && endY && endM) {
                                    let y = startY;
                                    let m = startM;
                                    while (y < endY || (y === endY && m <= endM)) {
                                      pushPaid(propertyId, y, m);
                                      m += 1; if (m > 12) { m = 1; y += 1; }
                                    }
                                  } else {
                                    const m = (p as any).rentalPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined);
                                    const y = (p as any).rentalPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined);
                                    if (y && m) pushPaid(propertyId, Number(y), Number(m));
                                  }
                                }
                                const activeLeasesByProperty: Record<string, any[]> = {};
                                for (const l of leases || []) {
                                  if ((l?.status || '').toLowerCase() !== 'active') continue;
                                  const pid = getId(l.propertyId);
                                  if (!pid) continue;
                                  if (!activeLeasesByProperty[pid]) activeLeasesByProperty[pid] = [];
                                  activeLeasesByProperty[pid].push(l);
                                }
                                const tenantsForProperty = (pid: string) => {
                                  const ls = activeLeasesByProperty[pid] || [];
                                  const names: string[] = [];
                                  for (const l of ls) {
                                    const tid = getId(l.tenantId);
                                    const t = tenantById[tid];
                                    const nm = t ? `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || t.fullName : '';
                                    if (nm) names.push(nm);
                                  }
                                  return names;
                                };
                                const items = (properties || [])
                                  .map((prop: any) => {
                                    const pid = getId(prop._id) || getId(prop.id);
                                    if (!pid) return null;
                                    const paidKeys = paidByProperty[pid] || new Set<string>();
                                    // Attribute missing months by leases and compute amount
                                    const leasesForProperty = (leases || []).filter((l: any) => (getId(l.propertyId) || '') === pid);
                                    const iterateMonths = (
                                      start: Date,
                                      end: Date,
                                      cb: (y: number, m: number, label: string) => void,
                                      hardCapMonths: number = 240
                                    ) => {
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
                                    const perTenantMissing: Array<{ tenantId: string; tenantName: string; labels: string[] }> = [];
                                    const missingSet = new Set<string>();
                                    const missingLabels: string[] = [];
                                    for (const l of leasesForProperty) {
                                      const start = l?.startDate ? new Date(l.startDate) : null;
                                      const end = l?.endDate ? new Date(l.endDate) : new Date(currentYear, currentMonth - 1, 1);
                                      if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
                                      let normStart = new Date(start.getFullYear(), start.getMonth(), 1);
                                      const cutY2 = (company as any)?.receivablesCutover?.year;
                                      const cutM2 = (company as any)?.receivablesCutover?.month;
                                      const cutoverDate2 = (cutY2 && cutM2) ? new Date(Number(cutY2), Number(cutM2) - 1, 1) : null;
                                      if (cutoverDate2 && normStart.getTime() < cutoverDate2.getTime()) normStart = cutoverDate2;
                                      const normEnd = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
                                      const labels: string[] = [];
                                      iterateMonths(normStart, normEnd, (y, m, label) => {
                                        const key = ymKey(y, m);
                                        if (!paidKeys.has(key)) {
                                          labels.push(label);
                                          if (!missingSet.has(key)) {
                                            missingSet.add(key);
                                            missingLabels.push(label);
                                          }
                                        }
                                      });
                                      if (labels.length > 0) {
                                        const tid = getId(l.tenantId) || '';
                                        const t = resolveTenantById(tid);
                                        const tName = t ? (`${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || t.fullName || 'Unknown Tenant') : 'Unknown Tenant';
                                        perTenantMissing.push({ tenantId: tid, tenantName: tName, labels });
                                      }
                                    }
                                    const missed = missingSet.size;
                                    const monthlyRent = Number(prop?.rent) || 0;
                                    const propertyTotalAmount = missed * monthlyRent;
                                    return { prop, pid, missed, missingLabels, perTenantMissing, propertyTotalAmount };
                                  })
                                  .filter(Boolean)
                                  .filter((x: any) => (x.missed || 0) > 0)
                                  .sort((a: any, b: any) => b.missed - a.missed);
                                if (!items.length) {
                                  return <Typography color="text.secondary">All properties have a rental payment recorded for the current month.</Typography>;
                                }
                                return (
                                  <Grid container spacing={2}>
                                    {items.map((row: any) => {
                                      const prop = row.prop;
                                      const pid = row.pid;
                                      const perTenantMissing = row.perTenantMissing as Array<{ tenantId: string; tenantName: string; labels: string[] }>;
                                      return (
                                        <Grid item xs={12} key={pid}>
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
                              })()
                            )}
                          </>
                        ) : showLeaseInsights ? (
                          <>
                            <Typography variant="h6" sx={{ mb: 2 }}>
                              Leases Under My Portfolio
                            </Typography>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                              {(() => {
                                const now = new Date();
                                const msPerDay = 1000 * 60 * 60 * 24;
                                const categorize = (lease: any) => {
                                  const end = lease?.endDate ? new Date(lease.endDate) : null;
                                  if (!end || isNaN(end.getTime())) return 'other';
                                  const diffDays = Math.ceil((end.getTime() - now.getTime()) / msPerDay);
                                  if (diffDays < 0) return 'expired';
                                  if (diffDays <= 30) return 'expiring';
                                  if (diffDays <= 90) return 'aboutToExpire';
                                  return 'other';
                                };
                                const expiredCount = leases.filter((l: any) => categorize(l) === 'expired').length;
                                const expiringCount = leases.filter((l: any) => categorize(l) === 'expiring').length;
                                const aboutToExpireCount = leases.filter((l: any) => categorize(l) === 'aboutToExpire').length;
                                return (
                                  <>
                                    <Grid item xs={12} md={4}>
                                      <Card onClick={() => setSelectedLeaseCategory('expired')} sx={{ cursor: 'pointer' }}>
                                        <CardContent>
                                          <Typography variant="subtitle2" color="text.secondary">Expired Leases</Typography>
                                          <Typography variant="h4" sx={{ fontWeight: 600, color: '#F5365C' }}>{expiredCount}</Typography>
                                        </CardContent>
                                      </Card>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                      <Card onClick={() => setSelectedLeaseCategory('expiring')} sx={{ cursor: 'pointer' }}>
                                        <CardContent>
                                          <Typography variant="subtitle2" color="text.secondary">Expiring (≤ 1 month)</Typography>
                                          <Typography variant="h4" sx={{ fontWeight: 600, color: '#FB6340' }}>{expiringCount}</Typography>
                                        </CardContent>
                                      </Card>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                      <Card onClick={() => setSelectedLeaseCategory('aboutToExpire')} sx={{ cursor: 'pointer' }}>
                                        <CardContent>
                                          <Typography variant="subtitle2" color="text.secondary">About to Expire (≤ 3 months)</Typography>
                                          <Typography variant="h4" sx={{ fontWeight: 600, color: '#FFA534' }}>{aboutToExpireCount}</Typography>
                                        </CardContent>
                                      </Card>
                                    </Grid>
                                  </>
                                );
                              })()}
                            </Grid>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                {selectedLeaseCategory === 'all' ? 'All Leases' : selectedLeaseCategory === 'expired' ? 'Expired Leases' : selectedLeaseCategory === 'expiring' ? 'Leases Expiring Within 1 Month' : 'Leases Expiring Within 3 Months'}
                              </Typography>
                              <Button size="small" onClick={() => setSelectedLeaseCategory('all')}>Show All</Button>
                            </Box>
                            <Divider sx={{ mb: 2 }} />
                            {(() => {
                              const now = new Date();
                              const msPerDay = 1000 * 60 * 60 * 24;
                              const categorize = (lease: any) => {
                                const end = lease?.endDate ? new Date(lease.endDate) : null;
                                if (!end || isNaN(end.getTime())) return 'other';
                                const diffDays = Math.ceil((end.getTime() - now.getTime()) / msPerDay);
                                if (diffDays < 0) return 'expired';
                                if (diffDays <= 30) return 'expiring';
                                if (diffDays <= 90) return 'aboutToExpire';
                                return 'other';
                              };
                              const categoryOrder: Record<string, number> = { expired: 0, expiring: 1, aboutToExpire: 2, other: 3 };
                              const daysUntil = (lease: any) => {
                                const end = lease?.endDate ? new Date(lease.endDate) : null;
                                if (!end || isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
                                return Math.ceil((end.getTime() - now.getTime()) / msPerDay);
                              };
                              const filtered = leases.filter((l: any) =>
                                selectedLeaseCategory === 'all' ? true : categorize(l) === selectedLeaseCategory
                              );
                              const sorted = filtered.sort((a: any, b: any) => {
                                const ca = categorize(a);
                                const cb = categorize(b);
                                if (categoryOrder[ca] !== categoryOrder[cb]) return categoryOrder[ca] - categoryOrder[cb];
                                return daysUntil(a) - daysUntil(b);
                              });
                              if (!sorted.length) {
                                return (
                                  <Typography color="text.secondary">No leases to display.</Typography>
                                );
                              }
                              return (
                                <Grid container spacing={2}>
                                  {sorted.map((lease: any) => {
                                    const propertyId = getId(lease.propertyId);
                                    const tenantId = getId(lease.tenantId);
                                    const propertyObj = resolvePropertyById(propertyId);
                                    const propertyName = propertyObj?.name || lease?.property?.name || 'Unknown Property';
                                    const tenantObj = resolveTenantById(tenantId);
                                    const tenantName = tenantObj
                                      ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim() || 'Unknown Tenant'
                                      : `${lease?.tenant?.firstName || ''} ${lease?.tenant?.lastName || ''}`.trim() || 'Unknown Tenant';
                                    const end = lease?.endDate ? new Date(lease.endDate) : null;
                                    const category = categorize(lease);
                                    const chip = category === 'expired'
                                      ? { label: 'Expired', color: 'error' as const }
                                      : category === 'expiring'
                                      ? { label: 'Expiring ≤1 mo', color: 'warning' as const }
                                      : category === 'aboutToExpire'
                                      ? { label: 'aboutToExpire', color: 'default' as const }
                                      : { label: 'Active', color: 'success' as const };
                                    return (
                                      <Grid item xs={12} key={lease._id}>
                                        <Card>
                                          <CardContent>
                                            <Grid container alignItems="center" spacing={2}>
                                              <Grid item xs={12} md={5}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{propertyName}</Typography>
                                                <Typography color="text.secondary">Tenant: {tenantName}</Typography>
                                              </Grid>
                                              <Grid item xs={12} md={4}>
                                                <Typography color="text.secondary">End Date</Typography>
                                                <Typography>{end ? end.toLocaleDateString() : 'N/A'}</Typography>
                                              </Grid>
                                              <Grid item xs={12} md={3}>
                                                <Chip label={chip.label} color={chip.color} size="small" />
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
                          </>
                        ) : showActiveTenants ? (
                          <>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                              <Typography variant="h6">Active Tenants</Typography>
                              <Button size="small" onClick={() => setShowActiveTenants(false)}>Hide</Button>
                            </Box>
                            {loading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                                <CircularProgress />
                              </Box>
                            ) : (
                              (() => {
                                const activeTenants = tenants.filter((t: any) => t.status === 'Active');
                                if (!activeTenants.length) {
                                  return <Typography color="text.secondary">No active tenants found.</Typography>;
                                }
                                return (
                                  <Grid container spacing={2}>
                                    {activeTenants.map((tenant: any) => {
                                      const property = resolvePropertyForTenant(tenant);
                                      const propertyName = property?.name || tenant?.property?.name || 'Unknown Property';
                                      const propertyAddress = property?.address || tenant?.property?.address || tenant?.propertyAddress || '';
                                      const fullName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Unnamed Tenant';
                                      return (
                                        <Grid item xs={12} key={tenant._id}>
                                          <Card>
                                            <CardContent>
                                              <Grid container alignItems="center" spacing={2}>
                                                <Grid item xs={12} md={5}>
                                                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{fullName}</Typography>
                                                  <Typography color="text.secondary">{tenant.email || tenant.phone || ''}</Typography>
                                                </Grid>
                                                <Grid item xs={12} md={4}>
                                                  <Typography color="text.secondary">Property</Typography>
                                                  <Typography>{propertyName}</Typography>
                                                  <Typography color="text.secondary">{propertyAddress}</Typography>
                                                </Grid>
                                                <Grid item xs={12} md={3}>
                                                  <Chip label="Active" color="success" size="small" />
                                                </Grid>
                                              </Grid>
                                            </CardContent>
                                          </Card>
                                        </Grid>
                                      );
                                    })}
                                  </Grid>
                                );
                              })()
                            )}
                          </>
                        ) : showPropertiesList ? (
                          <>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                              <Typography variant="h6">My Properties</Typography>
                              <Button size="small" onClick={() => setShowPropertiesList(false)}>Hide</Button>
                            </Box>
                            {loading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                                <CircularProgress />
                              </Box>
                            ) : (
                              (() => {
                                if (!properties.length) {
                                  return <Typography color="text.secondary">No properties found.</Typography>;
                                }
                                return (
                                  <Grid container spacing={2}>
                                    {properties.map((property: any) => (
                                      <Grid item xs={12} key={getId(property._id)}>
                                        <Card>
                                          <CardContent>
                                            <Grid container alignItems="center" spacing={2}>
                                              <Grid item xs={12} md={8}>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{property.name || 'Unnamed Property'}</Typography>
                                                <Typography color="text.secondary">{property.address || ''}</Typography>
                                              </Grid>
                                              <Grid item xs={12} md={4}>
                                                <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                                                  {property.status && <Chip label={property.status} size="small" />}
                                                  {typeof property.rent === 'number' && <Chip label={`Rent $${property.rent.toLocaleString()}`} size="small" />}
                                                </Box>
                                              </Grid>
                                            </Grid>
                                          </CardContent>
                                        </Card>
                                      </Grid>
                                    ))}
                                  </Grid>
                                );
                              })()
                            )}
                          </>
                        ) : (
                          <>
                            <Typography variant="h6" sx={{ mb: 2 }}>
                              Recent Activity
                            </Typography>
                            {loading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                                <CircularProgress />
                              </Box>
                            ) : (
                              <Typography color="text.secondary">
                                No recent activity to display
                              </Typography>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </>
            } />
            <Route path="properties" element={<Properties />} />
            <Route path="properties/:propertyId" element={<PropertyDetailsPage />} />
            <Route path="tenants" element={<Tenants />} />
            <Route path="leases" element={<AgentLeasesPage />} />
            <Route path="property-owners" element={<AgentPropertyOwnersPage />} />
            <Route
              path="payments"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <PaymentsPage />
                </Box>
              }
            />
            <Route path="levies" element={<LevyPaymentsPage />} />
            <Route path="files" element={<Files />} />
            <Route
              path="maintenance"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <Maintenance
                    user={maintenanceUser}
                    company={company || undefined}
                    isAuthenticated={!!isAuthenticated}
                    authLoading={authLoading}
                  />
                </Box>
              }
            />
            <Route path="inspections" element={<Inspections />} />
            <Route path="tasks" element={<AgentLeadsPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="settings" element={<AgentSettings />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
};

export default AgentDashboard;
