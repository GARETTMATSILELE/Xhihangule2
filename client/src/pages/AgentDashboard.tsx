import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
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
  Stack,
  Avatar,
  IconButton,
  Tooltip,
  Badge,
  Menu,
  ListItemIcon,
} from '@mui/material';
import {
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  Add as AddIcon,
  UploadFile as UploadFileIcon,
  Build as BuildIcon,
  NotificationsNone as NotificationsNoneIcon,
  CalendarToday as CalendarTodayIcon,
  LightbulbOutlined as LightbulbIcon,
  ArrowForward as ArrowForwardIcon,
  HomeWork as HomeWorkIcon,
  PersonAdd as PersonAddIcon,
  Person as PersonIcon,
  SwapHoriz as SwapHorizIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  ReceiptLong as ReceiptLongIcon,
} from '@mui/icons-material';
import { AgentSidebar } from '../components/Layout/AgentSidebar';
import { useNotification } from '../components/Layout/Header';
import { Properties } from './Properties/Properties';
import { Tenants } from './Tenants/Tenants';
import AgentLeasesPage from './agent/AgentLeasesPage';
import AgentPropertyOwnersPage from './agent/AgentPropertyOwnersPage';
import OwnerPortfolioHub from './agent/OwnerPortfolioHub';
import PaymentsPage from './PaymentsPage';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { Files } from './Files/Files';
import { Maintenance } from './Maintenance/Maintenance';
import { MaintenanceVendorsPage } from './Maintenance/MaintenanceVendorsPage';
import { InspectionComplianceCenter as Inspections } from './Inspections/InspectionComplianceCenter';
import { AgentSettings } from './Settings/AgentSettings';
// Removed MaintenancePageWrapper to avoid double sidebar/layout
import LevyPaymentsPage from './agent/LevyPaymentsPage';
import { SchedulePage } from './agent';
import paymentService from '../services/paymentService';
import AgentLeadsPage from './agent/AgentLeadsPage';
import PropertyDetailsPage from './agent/PropertyDetailsPage';
import PropertyDetailsReportPage from './agent/PropertyDetailsReportPage';
import { User } from '../types/auth';
import { RentalWorkflowCenter, WorkflowStatusChip } from '../components/rentalWorkflow';
import { buildPortfolioWorkflowSummary } from '../utils/rentalWorkflow';
import notificationService from '../services/notificationService';
import { getDashboardPath } from '../utils/registrationUtils';

const softCardSx = {
  borderRadius: 5,
  border: '1px solid rgba(15, 23, 42, 0.07)',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.06)',
  background: 'rgba(255, 255, 255, 0.92)',
  transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
  '&:hover': {
    transform: 'translateY(-3px)',
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.09)',
    borderColor: 'rgba(59, 130, 246, 0.20)',
  },
};

const StatCard = ({
  title,
  value,
  icon,
  color,
  loading,
  onClick,
  subtitle,
  progress = 70,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
  onClick?: () => void;
  subtitle?: string;
  progress?: number;
}) => (
  <Card onClick={onClick} sx={{ ...softCardSx, cursor: onClick ? 'pointer' : 'default', height: '100%' }}>
    <CardContent sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
            {title}
          </Typography>
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.04em', color: '#101828' }}>
              {value}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            backgroundColor: `${color}15`,
            borderRadius: 3,
            p: 1.25,
            color: color,
          }}
        >
          {icon}
        </Box>
      </Box>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {subtitle}
        </Typography>
      )}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 5,
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

function getOutstandingRangeForLease(
  lease: any,
  property: any,
  currentMonthStart: Date,
  cutoverDate: Date | null
): { start: Date; end: Date } | null {
  const start = lease?.startDate ? new Date(lease.startDate) : null;
  const end = lease?.endDate ? new Date(lease.endDate) : currentMonthStart;
  if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) return null;

  const leaseStartMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const leaseEndMonth = new Date(Math.min(end.getTime(), currentMonthStart.getTime()));
  if (leaseStartMonth.getTime() > leaseEndMonth.getTime()) return null;

  const rentalType = String(property?.rentalType || '').toLowerCase();
  if (rentalType === 'introduction') {
    // Introduction rentals are one-time only, based on the first lease month.
    if (cutoverDate && leaseStartMonth.getTime() < cutoverDate.getTime()) return null;
    return { start: leaseStartMonth, end: leaseStartMonth };
  }

  let normalizedStart = leaseStartMonth;
  if (cutoverDate && normalizedStart.getTime() < cutoverDate.getTime()) normalizedStart = cutoverDate;
  if (normalizedStart.getTime() > leaseEndMonth.getTime()) return null;
  return { start: normalizedStart, end: leaseEndMonth };
}

const AgentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const shouldLoadDashboardData =
    location.pathname === '/agent-dashboard' ||
    location.pathname === '/agent-dashboard/' ||
    location.pathname === '/agent-dashboard/workflow';
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
  const [inspections, setInspections] = useState<any[]>([]);
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
  const { notifications, markAllRead } = useNotification();
  const [notifAnchorEl, setNotifAnchorEl] = useState<null | HTMLElement>(null);
  const [workspaceAnchorEl, setWorkspaceAnchorEl] = useState<null | HTMLElement>(null);
  const kpiDetailRef = useRef<HTMLDivElement | null>(null);
  const authControls = useAuth() as any;
  const { logout, stopImpersonation, isImpersonating, setActiveRole } = authControls;

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
          inspectionsResponse,
        ] = await Promise.all([
          api.get('/agents/properties'),
          api.get('/agents/tenants'),
          api.get('/agents/leases'),
          api.get('/agents/commission'),
          api.get('/agents/payments').catch(() => ({ data: [] })),
          api.get('/agents/levy-payments').catch(() => ({ data: [] })),
          api.get('/inspections').catch(() => ({ data: [] })),
        ]);

        const properties = propertiesResponse.data;
        const tenants = tenantsResponse.data;
        const leases = leasesResponse.data;
        const commission = commissionResponse.data;
        const paymentsData = Array.isArray(paymentsResponse?.data) ? paymentsResponse.data : [];
        const levyPaysData = Array.isArray(levyPaymentsResponse?.data) ? levyPaymentsResponse.data : [];
        const inspectionsData = Array.isArray(inspectionsResponse?.data) ? inspectionsResponse.data : [];

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
        setInspections(inspectionsData);

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

    if (user && user.role === 'agent' && shouldLoadDashboardData) {
      fetchDashboardData();
    } else if (user && user.role === 'agent') {
      setLoading(false);
    } else if (user && user.role !== 'agent') {
      setError('Access denied. Agent role required.');
      setLoading(false);
    }
    // Listen for operational changes so workflow progress stays current across nested routes.
    const refreshWorkflowData = () => {
      if (shouldLoadDashboardData) fetchDashboardData();
    };
    const onPaymentsChanged = () => {
      refreshWorkflowData();
      // Also refresh commission series so Monthly Commission reflects new payments
      fetchCommissionPaymentsForYear(selectedYear);
    };
    window.addEventListener('rental-workflow:changed', refreshWorkflowData as EventListener);
    window.addEventListener('payments:changed', onPaymentsChanged as EventListener);
    return () => {
      window.removeEventListener('rental-workflow:changed', refreshWorkflowData as EventListener);
      window.removeEventListener('payments:changed', onPaymentsChanged as EventListener);
    };
  }, [user, selectedYear, shouldLoadDashboardData]);

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
  const workflowSummary = React.useMemo(
    () => buildPortfolioWorkflowSummary({ properties, tenants, leases, payments, inspections }, '/agent-dashboard'),
    [properties, tenants, leases, payments, inspections]
  );
  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);
  const agentFirstName = user?.firstName || (user as any)?.name?.split(' ')[0] || 'there';
  const agentDisplayName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || (user as any)?.name || user?.email || 'Agent';
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;
  const activeOccupancyCount = workflowSummary.states.filter((state) => state.status === 'Active Occupancy').length;
  const completedPayments = payments.filter((payment: any) => {
    const status = String(payment?.status || '').toLowerCase();
    const type = String(payment?.paymentType || '').toLowerCase();
    return ['completed', 'paid', 'success'].includes(status) && type !== 'levy' && type !== 'municipal' && type !== 'sale';
  });
  const rentalIncome = completedPayments.reduce((sum: number, payment: any) => sum + (Number(payment?.amount) || 0), 0);
  const leaseReminderItems = leases
    .map((lease: any) => {
      const end = lease?.endDate ? new Date(lease.endDate) : null;
      if (!end || Number.isNaN(end.getTime())) return null;
      const days = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (days < 0 || days > 60) return null;
      const property = resolvePropertyById(lease.propertyId);
      return {
        title: 'Lease expiring',
        date: end,
        detail: `${property?.name || 'Property'} expires in ${days} day${days === 1 ? '' : 's'}`,
      };
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ title: string; date: Date; detail: string }>;
  const quickActions = [
    { label: 'Add Tenant', icon: <PersonAddIcon />, path: '/agent-dashboard/tenants', color: '#2563eb' },
    { label: 'Create Lease', icon: <DescriptionIcon />, path: '/agent-dashboard/leases', color: '#16a34a' },
    { label: 'Assign Owner', icon: <PeopleIcon />, path: '/agent-dashboard/property-owners', color: '#f97316' },
    { label: 'Record Payment', icon: <PaymentIcon />, path: '/agent-dashboard/payments', color: '#7c3aed' },
    { label: 'Upload Documents', icon: <UploadFileIcon />, path: '/agent-dashboard/files', color: '#0891b2' },
    { label: 'Create Maintenance', icon: <BuildIcon />, path: '/agent-dashboard/maintenance', color: '#dc2626' },
  ];
  const queueItems = workflowSummary.states
    .filter((state) => state.status !== 'Active Occupancy' || state.completion < 100)
    .sort((a, b) => a.completion - b.completion)
    .slice(0, 4);
  const outstandingRentalRows = React.useMemo(() => {
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

    for (const payment of payments || []) {
      const paymentType = (payment?.paymentType || payment?.type || '').toString().toLowerCase();
      if (paymentType === 'levy' || paymentType === 'municipal') continue;
      const status = (payment?.status || '').toString().toLowerCase();
      const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
      if (!isCompleted) continue;

      const propertyId =
        getId(payment.propertyId) ||
        getId(payment.property) ||
        getId(payment?.property?._id) ||
        getId(payment?.property?.id);
      if (!propertyId) continue;

      const monthsPaid = Number((payment as any).advanceMonthsPaid || 1);
      const startYear = Number((payment as any)?.advancePeriodStart?.year);
      const startMonth = Number((payment as any)?.advancePeriodStart?.month);
      const endYear = Number((payment as any)?.advancePeriodEnd?.year);
      const endMonth = Number((payment as any)?.advancePeriodEnd?.month);

      if (monthsPaid > 1 && startYear && startMonth && endYear && endMonth) {
        let y = startYear;
        let m = startMonth;
        while (y < endYear || (y === endYear && m <= endMonth)) {
          pushPaid(propertyId, y, m);
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
        }
      } else {
        const month = (payment as any).rentalPeriodMonth || (payment.paymentDate ? (new Date(payment.paymentDate).getMonth() + 1) : undefined);
        const year = (payment as any).rentalPeriodYear || (payment.paymentDate ? (new Date(payment.paymentDate).getFullYear()) : undefined);
        if (year && month) pushPaid(propertyId, Number(year), Number(month));
      }
    }

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
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
        count += 1;
      }
    };

    return (properties || [])
      .map((property: any) => {
        const propertyId = getId(property._id) || getId(property.id);
        if (!propertyId) return null;

        const paidKeys = paidByProperty[propertyId] || new Set<string>();
        const propertyLeases = (leases || []).filter((lease: any) => (getId(lease.propertyId) || '') === propertyId);
        const cutoverYear = (companyCtx as any)?.receivablesCutover?.year;
        const cutoverMonth = (companyCtx as any)?.receivablesCutover?.month;
        const cutoverDate = (cutoverYear && cutoverMonth) ? new Date(Number(cutoverYear), Number(cutoverMonth) - 1, 1) : null;
        const perTenantMissing: Array<{ tenantId: string; tenantName: string; labels: string[] }> = [];
        const missingSet = new Set<string>();
        const missingLabels: string[] = [];

        for (const lease of propertyLeases) {
          const range = getOutstandingRangeForLease(
            lease,
            property,
            new Date(currentYear, currentMonth - 1, 1),
            cutoverDate
          );
          if (!range) continue;

          const labels: string[] = [];
          iterateMonths(range.start, range.end, (year, month, label) => {
            const key = ymKey(year, month);
            if (!paidKeys.has(key)) {
              labels.push(label);
              if (!missingSet.has(key)) {
                missingSet.add(key);
                missingLabels.push(label);
              }
            }
          });

          if (labels.length > 0) {
            const tenantId = getId(lease.tenantId) || '';
            const tenant = resolveTenantById(tenantId);
            const tenantName = tenant
              ? (`${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || tenant.name || tenant.fullName || 'Unknown Tenant')
              : 'Unknown Tenant';
            perTenantMissing.push({ tenantId, tenantName, labels });
          }
        }

        const missed = missingSet.size;
        const monthlyRent = Number(property?.rent) || 0;
        const propertyTotalAmount = missed * monthlyRent;
        return { prop: property, pid: propertyId, missed, missingLabels, perTenantMissing, propertyTotalAmount };
      })
      .filter(Boolean)
      .filter((row: any) => (row.missed || 0) > 0)
      .sort((a: any, b: any) => b.missed - a.missed);
  }, [properties, leases, payments, tenantById, companyCtx]);
  const displayedOutstandingRentals = outstandingRentalRows.reduce((sum: number, row: any) => sum + Number(row.propertyTotalAmount || 0), 0);
  const outstandingLevyRows = React.useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const ymKey = (y: number, m: number) => `${y}-${m}`;
    const cutoverYear = (companyCtx as any)?.receivablesCutover?.year;
    const cutoverMonth = (companyCtx as any)?.receivablesCutover?.month;
    const cutoverDate = (cutoverYear && cutoverMonth) ? new Date(Number(cutoverYear), Number(cutoverMonth) - 1, 1) : null;
    const paidByProperty: Record<string, Set<string>> = {};
    const pushPaid = (propertyId: string, y: number, m: number) => {
      const key = ymKey(y, m);
      if (!paidByProperty[propertyId]) paidByProperty[propertyId] = new Set();
      paidByProperty[propertyId].add(key);
    };

    for (const payment of levyPayments || []) {
      const status = (payment?.status || '').toString().toLowerCase();
      const isCompleted = status === 'completed' || status === 'success' || status === 'paid';
      if (!isCompleted) continue;

      const propertyId =
        getId(payment.propertyId) ||
        getId(payment.property) ||
        getId(payment?.property?._id) ||
        getId(payment?.property?.id);
      if (!propertyId) continue;

      const monthsPaid = Number((payment as any).advanceMonthsPaid || 1);
      const startYear = Number((payment as any)?.advancePeriodStart?.year);
      const startMonth = Number((payment as any)?.advancePeriodStart?.month);
      const endYear = Number((payment as any)?.advancePeriodEnd?.year);
      const endMonth = Number((payment as any)?.advancePeriodEnd?.month);

      if (monthsPaid > 1 && startYear && startMonth && endYear && endMonth) {
        let y = startYear;
        let m = startMonth;
        while (y < endYear || (y === endYear && m <= endMonth)) {
          pushPaid(propertyId, y, m);
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
        }
      } else {
        const month =
          (payment as any).rentalPeriodMonth ||
          (payment as any).levyPeriodMonth ||
          (payment.paymentDate ? (new Date(payment.paymentDate).getMonth() + 1) : undefined);
        const year =
          (payment as any).rentalPeriodYear ||
          (payment as any).levyPeriodYear ||
          (payment.paymentDate ? (new Date(payment.paymentDate).getFullYear()) : undefined);
        if (year && month) pushPaid(propertyId, Number(year), Number(month));
      }
    }

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
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
        count += 1;
      }
    };

    return (properties || [])
      .filter((property: any) => property?.levyOrMunicipalType === 'levy')
      .map((property: any) => {
        const propertyId = getId(property._id) || getId(property.id);
        if (!propertyId) return null;

        const paidKeys = paidByProperty[propertyId] || new Set<string>();
        const propertyLeases = (leases || []).filter((lease: any) => (getId(lease.propertyId) || '') === propertyId);
        const perTenantMissing: Array<{ tenantId: string; tenantName: string; labels: string[] }> = [];
        let propertyTotalMissing = 0;
        let propertyTotalAmount = 0;
        const monthlyLevy = Number(property?.levyOrMunicipalAmount) || 0;

        for (const lease of propertyLeases) {
          const range = getOutstandingRangeForLease(
            lease,
            property,
            new Date(currentYear, currentMonth - 1, 1),
            cutoverDate
          );
          if (!range) continue;

          const labels: string[] = [];
          iterateMonths(
            range.start,
            new Date(range.end.getFullYear(), range.end.getMonth(), 1),
            (y, m, label) => {
              if (!paidKeys.has(ymKey(y, m))) labels.push(label);
            }
          );

          if (labels.length > 0) {
            const tenantId = getId(lease.tenantId) || '';
            const tenant = resolveTenantById(tenantId);
            const tenantName = tenant
              ? (`${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || tenant.name || tenant.fullName || 'Unknown Tenant')
              : 'Unknown Tenant';
            perTenantMissing.push({ tenantId, tenantName, labels });
            propertyTotalMissing += labels.length;
            propertyTotalAmount += labels.length * monthlyLevy;
          }
        }

        return { prop: property, pid: propertyId, perTenantMissing, propertyTotalMissing, propertyTotalAmount };
      })
      .filter(Boolean)
      .filter((row: any) => (row.perTenantMissing || []).length > 0)
      .sort((a: any, b: any) => (b.propertyTotalMissing || 0) - (a.propertyTotalMissing || 0));
  }, [properties, leases, levyPayments, tenantById, companyCtx]);
  const displayedOutstandingLevies = outstandingLevyRows.reduce((sum: number, row: any) => sum + Number(row.propertyTotalAmount || 0), 0);
  const pendingRentalPaymentCount = payments.filter((payment: any) => {
    const status = String(payment?.status || '').toLowerCase();
    const type = String(payment?.paymentType || payment?.type || '').toLowerCase();
    return !['completed', 'success', 'paid'].includes(status) && type !== 'levy' && type !== 'municipal' && type !== 'sale';
  }).length;
  const pendingLevyPaymentCount = levyPayments.filter((payment: any) => {
    const status = String(payment?.status || '').toLowerCase();
    return !['completed', 'success', 'paid'].includes(status);
  }).length;
  const outstandingRentalProgress = rentalIncome > 0
    ? Math.min(100, Math.round((displayedOutstandingRentals / Math.max(rentalIncome + displayedOutstandingRentals, 1)) * 100))
    : (displayedOutstandingRentals > 0 ? 75 : 8);
  const outstandingLevyProgress = displayedOutstandingLevies > 0 ? Math.min(100, 35 + pendingLevyPaymentCount * 10) : 8;
  const availableRoles = Array.isArray((user as any)?.roles) && (user as any).roles.length > 0
    ? (user as any).roles
    : [user?.role].filter(Boolean);
  const dashboardLabels: Record<string, string> = {
    admin: 'Admin Dashboard',
    agent: 'Agent Dashboard',
    owner: 'Owner Dashboard',
    accountant: 'Accountant Dashboard',
    sales: 'Sales Dashboard',
    principal: 'Admin Dashboard',
    prea: 'Admin Dashboard',
  };
  const handleNotifOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotifAnchorEl(event.currentTarget);
    markAllRead();
  };
  const handleNotifClose = () => setNotifAnchorEl(null);
  const handleWorkspaceMenuOpen = (event: React.MouseEvent<HTMLElement>) => setWorkspaceAnchorEl(event.currentTarget);
  const handleWorkspaceMenuClose = () => setWorkspaceAnchorEl(null);
  const handleLogout = async () => {
    handleWorkspaceMenuClose();
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };
  const handleStopImpersonation = async () => {
    handleWorkspaceMenuClose();
    try {
      await stopImpersonation();
    } catch (error) {
      console.error('Stop impersonation failed:', error);
    }
  };
  const resetDashboardDrilldown = () => {
    setShowLeaseInsights(false);
    setShowCommissionDetails(false);
    setShowActiveTenants(false);
    setShowPropertiesList(false);
    setShowOutstandingRentals(false);
    setShowOutstandingLevies(false);
  };
  const revealKpiDetail = () => {
    window.setTimeout(() => {
      kpiDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f6f8fb', overflowX: 'hidden', '@media print': { display: 'block', bgcolor: '#fff', minHeight: 'auto', overflow: 'visible' } }}>
      <AgentSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1, minWidth: 0, overflowX: 'hidden', '@media print': { overflow: 'visible', width: '100%' } }}>
        <Box sx={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', px: { xs: 2, md: 4, xl: 6 }, py: { xs: 3, md: 5 }, '@media print': { px: 0, py: 0 } }}>
          <Routes>
            <Route index element={
              <>
                {error && (
                  <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                  </Alert>
                )}
                <Stack spacing={4.5}>
                  <Card
                    sx={{
                      ...softCardSx,
                      overflow: 'hidden',
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(239,246,255,0.94))',
                    }}
                  >
                    <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={3}>
                        <Box>
                          <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 800, letterSpacing: '0.12em' }}>
                            Rental operations workspace
                          </Typography>
                          <Typography variant="h3" sx={{ mt: 1, fontWeight: 850, letterSpacing: '-0.05em', color: '#0f172a' }}>
                            {greeting}, {agentFirstName}
                          </Typography>
                          <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
                            Here's what's happening in your portfolio today.
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ width: { xs: '100%', md: 'auto' } }}>
                          <Box sx={{ minWidth: { xs: 0, sm: 260 }, flex: { xs: 1, md: 'unset' } }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: '#334155' }}>
                                Portfolio readiness
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 800, color: '#2563eb' }}>
                                {workflowSummary.completionAverage}%
                              </Typography>
                            </Stack>
                            <LinearProgress
                              variant="determinate"
                              value={workflowSummary.completionAverage}
                              sx={{ height: 7, borderRadius: 99, bgcolor: 'rgba(37,99,235,0.10)', '& .MuiLinearProgress-bar': { borderRadius: 99, bgcolor: '#2563eb' } }}
                            />
                            <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/agent-dashboard/workflow')} sx={{ mt: 1, px: 0, textTransform: 'none', fontWeight: 700 }}>
                              View details
                            </Button>
                          </Box>
                          <Tooltip title={unreadNotifications ? `${unreadNotifications} unread notification${unreadNotifications === 1 ? '' : 's'}` : 'No unread notifications'}>
                            <IconButton onClick={handleNotifOpen} sx={{ bgcolor: 'white', boxShadow: '0 10px 25px rgba(15,23,42,0.08)' }}>
                              <Badge badgeContent={unreadNotifications} color="error">
                                <NotificationsNoneIcon />
                              </Badge>
                            </IconButton>
                          </Tooltip>
                          <Stack
                            direction="row"
                            spacing={1.25}
                            alignItems="center"
                            onClick={handleWorkspaceMenuOpen}
                            sx={{
                              bgcolor: 'rgba(255,255,255,0.78)',
                              border: '1px solid rgba(15,23,42,0.06)',
                              borderRadius: 99,
                              py: 0.75,
                              pl: 0.75,
                              pr: 1.5,
                              cursor: 'pointer',
                              transition: 'box-shadow 180ms ease, transform 180ms ease',
                              '&:hover': {
                                transform: 'translateY(-1px)',
                                boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
                              },
                            }}
                          >
                            <Avatar sx={{ width: 38, height: 38, bgcolor: '#2563eb', fontWeight: 800 }}>
                              {(agentFirstName || 'A').charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                              <Typography variant="body2" sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                                {agentDisplayName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Agent workspace
                              </Typography>
                            </Box>
                          </Stack>
                          <Menu
                            anchorEl={notifAnchorEl}
                            open={Boolean(notifAnchorEl)}
                            onClose={handleNotifClose}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            PaperProps={{ sx: { minWidth: 340, borderRadius: 4, mt: 1, boxShadow: '0 24px 70px rgba(15,23,42,0.18)' } }}
                          >
                            <Box sx={{ p: 2, pb: 1 }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Notifications</Typography>
                              <Typography variant="caption" color="text.secondary">Recent operational updates</Typography>
                            </Box>
                            <Divider />
                            {notifications.length === 0 ? (
                              <MenuItem disabled>No notifications</MenuItem>
                            ) : (
                              notifications.slice(0, 6).map((notification) => (
                                <MenuItem
                                  key={notification.id}
                                  selected={!notification.read}
                                  onClick={async () => {
                                    try { await notificationService.markRead(notification.id); } catch {}
                                    handleNotifClose();
                                    if (notification.link) navigate(notification.link);
                                  }}
                                  sx={{ alignItems: 'flex-start', py: 1.5, whiteSpace: 'normal' }}
                                >
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: notification.read ? 600 : 800 }}>
                                      {notification.title}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {notification.message}
                                    </Typography>
                                    {notification.createdAt && (
                                      <Typography variant="caption" color="text.secondary">
                                        {notification.createdAt.toLocaleString()}
                                      </Typography>
                                    )}
                                  </Box>
                                </MenuItem>
                              ))
                            )}
                          </Menu>
                          <Menu
                            anchorEl={workspaceAnchorEl}
                            open={Boolean(workspaceAnchorEl)}
                            onClose={handleWorkspaceMenuClose}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            PaperProps={{ sx: { minWidth: 260, borderRadius: 4, mt: 1, boxShadow: '0 24px 70px rgba(15,23,42,0.18)' } }}
                          >
                            <Box sx={{ p: 2 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{agentDisplayName}</Typography>
                              <Typography variant="caption" color="text.secondary">{user?.email || 'Agent workspace'}</Typography>
                            </Box>
                            <Divider />
                            <MenuItem onClick={() => { handleWorkspaceMenuClose(); navigate('/profile'); }}>
                              <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
                              Profile
                            </MenuItem>
                            {availableRoles.length > 0 && (
                              <>
                                <Divider />
                                {availableRoles.map((role: string) => (
                                  <MenuItem
                                    key={role}
                                    onClick={() => {
                                      handleWorkspaceMenuClose();
                                      try { setActiveRole && setActiveRole(role as any); } catch {}
                                      navigate(getDashboardPath(role as any));
                                    }}
                                  >
                                    <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
                                    {dashboardLabels[role] || role}
                                  </MenuItem>
                                ))}
                              </>
                            )}
                            {isImpersonating && (
                              <MenuItem onClick={handleStopImpersonation}>
                                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                                Stop Impersonating
                              </MenuItem>
                            )}
                            <Divider />
                            <MenuItem onClick={() => { handleWorkspaceMenuClose(); navigate('/agent-dashboard/settings'); }}>
                              <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                              Settings
                            </MenuItem>
                            <MenuItem onClick={handleLogout}>
                              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                              Logout
                            </MenuItem>
                          </Menu>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card sx={{ ...softCardSx, borderRadius: 6 }}>
                    <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
                        <Box>
                          <Typography variant="h5" sx={{ fontWeight: 850, letterSpacing: '-0.03em' }}>
                            Needs Attention
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            The most important operational gaps across your rentals.
                          </Typography>
                        </Box>
                        <Button variant="outlined" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/agent-dashboard/workflow')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}>
                          Review workflow
                        </Button>
                      </Stack>
                      <Grid container spacing={2}>
                        {(workflowSummary.alerts.length ? workflowSummary.alerts.slice(0, 4) : [{ key: 'healthy', title: 'Portfolio healthy', description: 'All core rental workflows are currently healthy.', count: 0, severity: 'success' as const, path: '/agent-dashboard/workflow' }]).map((alert) => (
                          <Grid item xs={12} md={6} key={alert.key}>
                            <Box
                              sx={{
                                p: 2.5,
                                borderRadius: 4,
                                bgcolor: alert.severity === 'error' ? '#fff1f2' : alert.severity === 'warning' ? '#fff7ed' : alert.severity === 'success' ? '#f0fdf4' : '#eff6ff',
                                display: 'flex',
                                gap: 2,
                                alignItems: 'center',
                                transition: 'transform 180ms ease, background-color 180ms ease',
                                '&:hover': { transform: 'translateY(-2px)' },
                              }}
                            >
                              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.85)', color: alert.severity === 'error' ? '#e11d48' : alert.severity === 'warning' ? '#f97316' : alert.severity === 'success' ? '#16a34a' : '#2563eb' }}>
                                <HomeWorkIcon />
                              </Avatar>
                              <Box sx={{ flex: 1 }}>
                                <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>
                                  {alert.count > 0 ? `${alert.count} ${alert.title.toLowerCase()}` : alert.title}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {alert.description}
                                </Typography>
                              </Box>
                              <Button size="small" variant="contained" onClick={() => navigate(alert.path)} sx={{ borderRadius: 99, textTransform: 'none', boxShadow: 'none' }}>
                                Review
                              </Button>
                            </Box>
                          </Grid>
                        ))}
                      </Grid>
                    </CardContent>
                  </Card>

                  <Grid container spacing={2.5}>
                    {quickActions.map((action) => (
                      <Grid item xs={6} md={4} lg={2} key={action.label}>
                        <Card onClick={() => navigate(action.path)} sx={{ ...softCardSx, cursor: 'pointer', height: '100%' }}>
                          <CardContent sx={{ p: 2.5 }}>
                            <Avatar sx={{ bgcolor: `${action.color}14`, color: action.color, mb: 2 }}>
                              {action.icon}
                            </Avatar>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#0f172a' }}>
                              {action.label}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>

                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: '-0.03em' }}>
                          Portfolio Metrics
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Operational KPIs at a glance. Select a card to open drill-downs.
                        </Typography>
                      </Box>
                    </Stack>
                    <Grid container spacing={2.5}>
                      <Grid item xs={12} sm={6} lg={4} xl={2}>
                        <StatCard
                          title="My Properties"
                          value={dashboardData.totalProperties.toString()}
                          subtitle={`${workflowSummary.vacantCount} vacant • ${activeOccupancyCount} occupied`}
                          icon={<BusinessIcon />}
                          color="#2563eb"
                          loading={loading}
                          progress={dashboardData.totalProperties ? Math.min(100, (activeOccupancyCount / dashboardData.totalProperties) * 100) : 0}
                          onClick={() => {
                            resetDashboardDrilldown();
                            setShowPropertiesList(true);
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} lg={4} xl={2}>
                        <StatCard
                          title="Active Tenants"
                          value={dashboardData.activeTenants.toString()}
                          subtitle={`${workflowSummary.vacantCount} vacant propert${workflowSummary.vacantCount === 1 ? 'y' : 'ies'} awaiting placement`}
                          icon={<PeopleIcon />}
                          color="#0891b2"
                          loading={loading}
                          progress={dashboardData.totalProperties ? Math.min(100, (dashboardData.activeTenants / dashboardData.totalProperties) * 100) : 0}
                          onClick={() => {
                            resetDashboardDrilldown();
                            setShowActiveTenants(true);
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} lg={4} xl={2}>
                        <StatCard
                          title="Active Leases"
                          value={dashboardData.activeLeases.toString()}
                          subtitle={`${workflowSummary.expiringLeaseCount} expiring within 60 days`}
                          icon={<DescriptionIcon />}
                          color="#16a34a"
                          loading={loading}
                          progress={dashboardData.totalProperties ? Math.min(100, (dashboardData.activeLeases / dashboardData.totalProperties) * 100) : 0}
                          onClick={() => {
                            resetDashboardDrilldown();
                            setShowLeaseInsights(true);
                            setSelectedLeaseCategory('all');
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} lg={4} xl={2}>
                        <StatCard
                          title="Monthly Commission"
                          value={`$${((filteredMonthlyAgentShare != null ? filteredMonthlyAgentShare : dashboardData.monthlyCommission) || 0).toLocaleString()}`}
                          subtitle="Click to view paid commissions"
                          icon={<PaymentIcon />}
                          color="#f97316"
                          loading={loading}
                          onClick={() => {
                            resetDashboardDrilldown();
                            setShowCommissionDetails(true);
                            loadCommissionPayments();
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} lg={4} xl={2}>
                        <StatCard
                          title="Outstanding Rentals"
                          value={`$${Number(displayedOutstandingRentals || 0).toLocaleString()}`}
                          subtitle={`${pendingRentalPaymentCount} pending rental payment${pendingRentalPaymentCount === 1 ? '' : 's'} • click for detail`}
                          icon={<PaymentIcon />}
                          color="#e11d48"
                          loading={loading}
                          progress={outstandingRentalProgress}
                          onClick={() => {
                            resetDashboardDrilldown();
                            setShowOutstandingRentals(true);
                            revealKpiDetail();
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} lg={4} xl={2}>
                        <StatCard
                          title="Outstanding Levies"
                          value={`$${Number(displayedOutstandingLevies || 0).toLocaleString()}`}
                          subtitle={`${pendingLevyPaymentCount} pending levy payment${pendingLevyPaymentCount === 1 ? '' : 's'} • click for detail`}
                          icon={<ReceiptLongIcon />}
                          color="#f59e0b"
                          loading={loading}
                          progress={outstandingLevyProgress}
                          onClick={() => {
                            resetDashboardDrilldown();
                            setShowOutstandingLevies(true);
                            revealKpiDetail();
                          }}
                        />
                      </Grid>
                    </Grid>
                    {showCommissionDetails && (
                      <Card sx={{ ...softCardSx, mt: 2.5 }}>
                        <CardContent sx={{ p: 3 }}>
                          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>Paid Commissions</Typography>
                              <Typography variant="body2" color="text.secondary">
                                Agent share payments for the selected period.
                              </Typography>
                            </Box>
                            <Button size="small" onClick={() => setShowCommissionDetails(false)} sx={{ textTransform: 'none', fontWeight: 800 }}>
                              Hide
                            </Button>
                          </Stack>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                            <FormControl size="small" sx={{ minWidth: 180 }}>
                              <InputLabel id="commission-month-inline-label">Month</InputLabel>
                              <Select
                                labelId="commission-month-inline-label"
                                value={selectedMonth}
                                label="Month"
                                onChange={(event) => setSelectedMonth(Number(event.target.value))}
                              >
                                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((month, index) => (
                                  <MenuItem key={month} value={index + 1}>{month}</MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                              <InputLabel id="commission-year-inline-label">Year</InputLabel>
                              <Select
                                labelId="commission-year-inline-label"
                                value={selectedYear}
                                label="Year"
                                onChange={async (event) => {
                                  const year = Number(event.target.value);
                                  setSelectedYear(year);
                                  await fetchCommissionPaymentsForYear(year);
                                }}
                              >
                                {Array.from({ length: 8 }).map((_, index) => {
                                  const year = new Date().getFullYear() - 5 + index;
                                  return <MenuItem key={year} value={year}>{year}</MenuItem>;
                                })}
                              </Select>
                            </FormControl>
                          </Stack>
                          {commissionLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                              <CircularProgress />
                            </Box>
                          ) : commissionError ? (
                            <Alert severity="error">{commissionError}</Alert>
                          ) : (
                            (() => {
                              const filteredPayments = expandedCommissionPayments.filter((payment: any) => {
                                const rentMonth = payment.rentalPeriodMonth || (payment.paymentDate ? (new Date(payment.paymentDate).getMonth() + 1) : undefined);
                                const rentYear = payment.rentalPeriodYear || (payment.paymentDate ? (new Date(payment.paymentDate).getFullYear()) : undefined);
                                return rentMonth === selectedMonth && rentYear === selectedYear;
                              });
                              const totalAgentShare = filteredPayments.reduce((sum: number, payment: any) => sum + (payment._distributedAgentShare || payment.commissionDetails?.agentShare || 0), 0);
                              return (
                                <Stack spacing={1.5}>
                                  <Chip
                                    label={`Total paid commission: $${totalAgentShare.toLocaleString()}`}
                                    color="success"
                                    sx={{ alignSelf: 'flex-start', borderRadius: 99, fontWeight: 800 }}
                                  />
                                  {!filteredPayments.length ? (
                                    <Typography color="text.secondary">No paid commission records found for the selected period.</Typography>
                                  ) : (
                                    filteredPayments.slice(0, 6).map((payment: any) => {
                                      const propertyId = getId(payment.propertyId) || getId(payment.property) || getId(payment?.property?._id) || getId(payment?.property?.id);
                                      const tenantId = getId(payment.tenantId) || getId(payment.tenant) || getId(payment?.tenant?._id) || getId(payment?.tenant?.id);
                                      const propertyObj = resolvePropertyById(propertyId);
                                      const tenantObj = resolveTenantById(tenantId);
                                      const propertyName = propertyObj?.name || payment?.property?.name || payment?.propertyName || 'Unknown Property';
                                      const tenantName = tenantObj
                                        ? `${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim() || 'Unknown Tenant'
                                        : `${payment?.tenant?.firstName || ''} ${payment?.tenant?.lastName || ''}`.trim() || payment?.tenantName || 'Unknown Tenant';
                                      const paymentDate = payment.paymentDate ? new Date(payment.paymentDate) : null;
                                      const agentShare = payment._distributedAgentShare || payment.commissionDetails?.agentShare || 0;
                                      return (
                                        <Box key={`${payment._id}-${payment.rentalPeriodMonth || ''}-${payment.rentalPeriodYear || ''}`} sx={{ p: 2, borderRadius: 4, bgcolor: '#f8fafc', display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                                          <Box>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{propertyName}</Typography>
                                            <Typography variant="body2" color="text.secondary">Tenant: {tenantName}</Typography>
                                          </Box>
                                          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>${Number(agentShare || 0).toLocaleString()}</Typography>
                                            <Typography variant="caption" color="text.secondary">{paymentDate ? paymentDate.toLocaleDateString() : 'No payment date'}</Typography>
                                          </Box>
                                        </Box>
                                      );
                                    })
                                  )}
                                </Stack>
                              );
                            })()
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </Box>

                  <Grid container spacing={3}>
                    <Grid item xs={12} lg={5}>
                      <Card sx={softCardSx}>
                        <CardContent sx={{ p: 3 }}>
                          <Typography variant="h6" sx={{ fontWeight: 850, mb: 0.5 }}>
                            Operational Queue
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Recommended next steps by property.
                          </Typography>
                          <Stack spacing={1.5}>
                            {queueItems.length ? queueItems.map((state) => (
                              <Box key={state.propertyId} sx={{ display: 'flex', gap: 2, p: 1.5, borderRadius: 4, bgcolor: '#f8fafc', alignItems: 'center' }}>
                                <Avatar variant="rounded" sx={{ width: 58, height: 58, borderRadius: 3, bgcolor: '#e0f2fe', color: '#0369a1' }}>
                                  <BusinessIcon />
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography sx={{ fontWeight: 800 }} noWrap>{state.property.name || 'Unnamed property'}</Typography>
                                  <Typography variant="body2" color="text.secondary" noWrap>{state.property.address}</Typography>
                                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                                    Next step: {state.missingSteps[0]?.missingLabel || 'Review property'}
                                  </Typography>
                                </Box>
                                <Stack spacing={1} alignItems="flex-end">
                                  <WorkflowStatusChip status={state.status} />
                                  <Button size="small" onClick={() => navigate(`/agent-dashboard/properties/${state.propertyId}`)} sx={{ textTransform: 'none', fontWeight: 700 }}>
                                    Open Hub
                                  </Button>
                                </Stack>
                              </Box>
                            )) : (
                              <Typography variant="body2" color="text.secondary">No open workflow items right now.</Typography>
                            )}
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} lg={4}>
                      <Card sx={softCardSx}>
                        <CardContent sx={{ p: 3 }}>
                          <Typography variant="h6" sx={{ fontWeight: 850, mb: 2 }}>
                            Recent Activity
                          </Typography>
                          <Stack spacing={2}>
                            {workflowSummary.activity.slice(0, 5).map((item) => (
                              <Stack direction="row" spacing={1.5} key={item.id}>
                                <Avatar sx={{ width: 34, height: 34, bgcolor: '#eef2ff', color: '#4f46e5' }}>
                                  <AddIcon fontSize="small" />
                                </Avatar>
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.label}</Typography>
                                  <Typography variant="caption" color="text.secondary">{item.description}{item.date ? ` • ${item.date.toLocaleDateString()}` : ''}</Typography>
                                </Box>
                              </Stack>
                            ))}
                            {!workflowSummary.activity.length && <Typography variant="body2" color="text.secondary">Activity appears here as rental operations move forward.</Typography>}
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} lg={3}>
                      <Stack spacing={3}>
                        <Card sx={softCardSx}>
                          <CardContent sx={{ p: 3 }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                              <CalendarTodayIcon color="primary" />
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>Calendar & Reminders</Typography>
                            </Stack>
                            <Stack spacing={1.25}>
                              {leaseReminderItems.length ? leaseReminderItems.map((item) => (
                                <Box key={`${item.title}-${item.detail}`} sx={{ p: 1.5, borderRadius: 3, bgcolor: '#fff7ed' }}>
                                  <Typography variant="caption" sx={{ color: '#f97316', fontWeight: 800 }}>{item.date.toLocaleDateString()}</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.title}</Typography>
                                  <Typography variant="caption" color="text.secondary">{item.detail}</Typography>
                                </Box>
                              )) : <Typography variant="body2" color="text.secondary">No urgent reminders for the next 60 days.</Typography>}
                            </Stack>
                          </CardContent>
                        </Card>
                        <Card sx={softCardSx}>
                          <CardContent sx={{ p: 3 }}>
                            <Typography variant="h6" sx={{ fontWeight: 850, mb: 2 }}>Portfolio Snapshot</Typography>
                            {[
                              ['Rental income', `$${rentalIncome.toLocaleString()}`],
                              ['Outstanding rentals', `$${Number(displayedOutstandingRentals || 0).toLocaleString()}`],
                              ['Outstanding levies', `$${Number(displayedOutstandingLevies || 0).toLocaleString()}`],
                              ['Net income', `$${Math.max(0, rentalIncome - Number(displayedOutstandingRentals || 0)).toLocaleString()}`],
                            ].map(([label, value]) => (
                              <Stack direction="row" justifyContent="space-between" key={label} sx={{ py: 0.75 }}>
                                <Typography variant="body2" color="text.secondary">{label}</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800 }}>{value}</Typography>
                              </Stack>
                            ))}
                          </CardContent>
                        </Card>
                      </Stack>
                    </Grid>
                  </Grid>

                  <Card sx={{ ...softCardSx, background: 'linear-gradient(135deg, #eff6ff, #ffffff)' }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Avatar sx={{ bgcolor: '#dbeafe', color: '#2563eb' }}>
                            <LightbulbIcon />
                          </Avatar>
                          <Box>
                            <Typography sx={{ fontWeight: 850 }}>Complete property setups to improve portfolio readiness.</Typography>
                            <Typography variant="body2" color="text.secondary">Focus on missing owners, tenants, leases, and billing to keep operations calm and predictable.</Typography>
                          </Box>
                        </Stack>
                        <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/agent-dashboard/workflow')} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800, boxShadow: 'none' }}>
                          Open workflow
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Grid container spacing={3} ref={kpiDetailRef}>
                  <Grid item xs={12}>
                    <Card>
                      <CardContent>
                        {false && showCommissionDetails ? (
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
                                const items = outstandingLevyRows;
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
                                      const cutY2 = (companyCtx as any)?.receivablesCutover?.year;
                                      const cutM2 = (companyCtx as any)?.receivablesCutover?.month;
                                      const cutoverDate2 = (cutY2 && cutM2) ? new Date(Number(cutY2), Number(cutM2) - 1, 1) : null;
                                      const range = getOutstandingRangeForLease(
                                        l,
                                        prop,
                                        new Date(currentYear, currentMonth - 1, 1),
                                        cutoverDate2
                                      );
                                      if (!range) continue;
                                      const labels: string[] = [];
                                      iterateMonths(range.start, range.end, (y, m, label) => {
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
                              <RentalWorkflowCenter summary={workflowSummary} title="Operational Activity" />
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
                </Stack>
              </>
            } />
            <Route path="workflow" element={<RentalWorkflowCenter summary={workflowSummary} />} />
            <Route path="properties" element={<Properties />} />
            <Route path="properties/:propertyId" element={<PropertyDetailsPage />} />
            <Route path="tenants" element={<Tenants />} />
            <Route path="leases" element={<AgentLeasesPage />} />
            <Route path="property-owners" element={<AgentPropertyOwnersPage />} />
            <Route path="property-owners/:ownerId" element={<OwnerPortfolioHub />} />
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
            <Route
              path="maintenance-vendors"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <MaintenanceVendorsPage />
                </Box>
              }
            />
            <Route path="inspections" element={<Inspections />} />
            <Route path="property-details-report" element={<PropertyDetailsReportPage />} />
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
