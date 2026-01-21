import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  Search as SearchIcon,
  Message as MessageIcon,
  Warning as WarningIcon,
  AccessTime as AccessTimeIcon,
  FilterList as FilterListIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import { AdminSidebar } from '../components/Layout/AdminSidebar';
import { Header } from '../components/Layout/Header';
import { Properties } from './Properties/Properties';
import { Tenants } from './Tenants/Tenants';
import { LeaseList } from './leases/LeaseList';
import PaymentsPage from './PaymentsPage';
import paymentService from '../services/paymentService';
import { useLeaseService } from '../services/leaseService';
import { useTenantService } from '../services/tenantService';
import { Property } from '../types/property';
import { Maintenance } from './Maintenance/Maintenance';
import { UserManagement } from '../pages/UserManagement/UserManagement';
import { TooltipProps } from 'recharts';
import CommunicationsPage from './Communications/CommunicationsPage';
import AdminPropertyOwnersPage from './admin/AdminPropertyOwnersPage';
import { Files } from './Files/Files';
import { useAdminDashboardService } from '../services/adminDashboardService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import PropertyAccountsPage from './admin/PropertyAccountsPage';
import PropertyLedgerPage from './admin/PropertyLedgerPage';
// Removed MaintenancePageWrapper to avoid nested sidebars and doubled spacing
import { AdminSettings } from './Settings/AdminSettings';
import ReportsPage from './admin/ReportsPage';
import ApprovalsPage from './admin/ApprovalsPage';
import AdminLeasesPage from './AdminLeasesPage';
import LevyPaymentsPage from './admin/LevyPaymentsPage';
import DatabaseSyncDashboard from '../components/admin/DatabaseSyncDashboard';
import { Link } from 'react-router-dom';
import { agentAccountService } from '../services/agentAccountService';
import api from '../api/axios';
import AgentDetailPage from './admin/AgentDetailPage';

// Theme colors
const lightTheme = {
  background: '#FFFFFF',
  cardBackground: '#FFFFFF',
  text: '#1A1F36',
  textSecondary: '#697386',
  border: '#E5E7EB',
  chartColors: ['#38BDF8', '#9333EA', '#10B981', '#F59E0B', '#EF4444', '#6366F1'],
  gradient: {
    start: '#38BDF8',
    end: '#9333EA',
  },
};

const darkTheme = {
  background: '#151728',
  cardBackground: '#1E1F2F',
  text: '#E5E7EB',
  textSecondary: '#9CA3AF',
  border: '#2D3748',
  chartColors: ['#38BDF8', '#9333EA', '#10B981', '#F59E0B', '#EF4444', '#6366F1'],
  gradient: {
    start: '#38BDF8',
    end: '#9333EA',
  },
};

const StatCard = ({ title, value, icon, color, onClick, theme }: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  color: string;
  onClick?: () => void;
  theme: typeof lightTheme;
}) => (
  <Card 
    sx={{ 
      cursor: onClick ? 'pointer' : 'default',
      backgroundColor: theme.cardBackground,
      border: `1px solid ${theme.border}`,
      boxShadow: 'none',
      '&:hover': onClick ? {
        transform: 'translateY(-2px)',
        transition: 'transform 0.2s ease-in-out',
      } : {},
    }} 
    onClick={onClick}
  >
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
        <Typography variant="h6" color={theme.textSecondary}>
          {title}
        </Typography>
      </Box>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 600, color: theme.text }}>
        {value}
      </Typography>
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

interface PropertyStats {
  totalProperties: number;
  vacantProperties: number;
  tenantedProperties: number;
  maintenanceProperties: number;
  residentialProperties: number;
  commercialProperties: number;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    if (sessionId) {
      (window as any).__API_BASE__ = `${window.location.origin}/api/s/${sessionId}`;
    }
  }, []);
  const location = useLocation();
  const { getAdminDashboardProperties } = useAdminDashboardService();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { company } = useCompany();
  const maintenanceCompany = company ? ({ _id: (company as any)._id as string, name: company.name } as any) : undefined;
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const leaseService = useLeaseService();
  const tenantService = useTenantService();
  const [tenants, setTenants] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [levyPayments, setLevyPayments] = useState<any[]>([]);
  const [showOutstandingRentals, setShowOutstandingRentals] = useState(false);
  const [showOutstandingLevies, setShowOutstandingLevies] = useState(false);
  const [propertyListFilter, setPropertyListFilter] = useState<null | 'total' | 'vacant' | 'tenanted' | 'maintenance'>(null);
  const [rentalAgents, setRentalAgents] = useState<any[]>([]);
  const [salesAgents, setSalesAgents] = useState<any[]>([]);
  const [agentStats, setAgentStats] = useState<Record<string, { propertyCount: number; totalCommission: number; monthCommission: number }>>({});

  // Normalize possible id shapes (string, {$oid}, {_id}, embedded doc)
  function getId(id: any): string {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (typeof id === 'object') {
      if ((id as any).$oid) return String((id as any).$oid);
      if ((id as any)._id) {
        const v = (id as any)._id;
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && (v as any).$oid) return String((v as any).$oid);
      }
      if ((id as any).id) {
        const v = (id as any).id;
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && (v as any).$oid) return String((v as any).$oid);
      }
      try {
        const s = typeof (id as any).toString === 'function' ? (id as any).toString() : '';
        if (typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s)) return s;
      } catch {}
    }
    return '';
  }

  // Update active tab based on current route
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/admin/users')) {
      setActiveTab(8);
    } else if (path.includes('/admin/maintenance')) {
      setActiveTab(6);
    } else if (path.includes('/admin/properties')) {
      setActiveTab(1);
    } else if (path.includes('/admin/property-owners')) {
      setActiveTab(2);
    } else if (path.includes('/admin/tenants')) {
      setActiveTab(3);
    } else if (path.includes('/admin/leases')) {
      setActiveTab(4);
    } else if (path.includes('/admin/payments')) {
      setActiveTab(5);
    } else if (path.includes('/admin/communications')) {
      setActiveTab(7);
    } else if (path.includes('/admin/files')) {
      setActiveTab(9);
    } else if (path.includes('/admin/reports')) {
      setActiveTab(10);
    } else if (path.includes('/admin/settings')) {
      setActiveTab(11);
    } else {
      setActiveTab(0);
    }
  }, [location.pathname]);

  // Memoize the fetch function to prevent infinite loops
  const fetchProperties = useCallback(async () => {
    setPropertiesLoading(true);
    setPropertiesError(null);
    try {
      // If no company, skip fetch and prompt setup
      if (isAuthenticated && (!user?.companyId && !company)) {
        setProperties([]);
        setPropertiesError('Please set up your company to view dashboard data.');
        return;
      }
      const data = await getAdminDashboardProperties();
      setProperties(data);
    } catch (err: any) {
      setPropertiesError(err.message || 'Failed to fetch properties');
    } finally {
      setPropertiesLoading(false);
    }
  }, [isAuthenticated, user?.companyId, company]);

  // Fetch properties for admin dashboard (no auth) - only run once on mount
  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Load company-wide tenants, leases, payments, and levy payments (skip on agent detail routes)
  useEffect(() => {
    if ((location.pathname || '').includes('/admin-dashboard/agents/')) {
      return;
    }
    (async () => {
      try {
        const [tpub, lpub, pays, levy] = await Promise.all([
          tenantService.getAllPublic().catch(() => ({ tenants: [] })),
          leaseService.getAllPublic(user?.companyId as any).catch(() => []),
          paymentService.getPayments().catch(() => []),
          user?.companyId ? paymentService.getLevyPayments(user.companyId).catch(() => []) : Promise.resolve([])
        ]);
        setTenants(Array.isArray((tpub as any)?.tenants) ? (tpub as any).tenants : []);
        setLeases(Array.isArray(lpub) ? lpub : []);
        setPayments(Array.isArray(pays) ? pays : []);
        setLevyPayments(Array.isArray(levy) ? levy : []);
      } catch {
        setTenants([]); setLeases([]); setPayments([]); setLevyPayments([]);
      }
    })();
  }, [user?.companyId, location.pathname]);

  // Load agents and compute summary stats (prefer public API; skip on agent detail routes)
  useEffect(() => {
    let cancelled = false;
    if ((location.pathname || '').includes('/admin-dashboard/agents/')) {
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const companyId = String(user?.companyId || (company as any)?._id || '');
        const [rentals, sales] = await Promise.all([
          paymentService.getAgentsPublic(companyId, 'agent').catch(() => []),
          paymentService.getAgentsPublic(companyId, 'sales').catch(() => []),
        ]);
        if (cancelled) return;
        setRentalAgents(Array.isArray(rentals) ? rentals : []);
        setSalesAgents(Array.isArray(sales) ? sales : []);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const computePropertyCount = (agentId: string, isSales: boolean) => {
          const agentIdStr = String(agentId);
          const list = (properties || []).filter((p: any) => {
            const owner = (p as any)?.ownerId;
            const ownerId = String((owner && (owner as any)._id) || owner || '');
            if (!ownerId || ownerId !== agentIdStr) return false;
            const rt = (p?.rentalType || '').toString().toLowerCase();
            return isSales ? (rt === 'sale' || rt === 'sales') : (rt !== 'sale' && rt !== 'sales');
          });
          return list.length;
        };

        const allAgents: Array<{ id: string; isSales: boolean }> = [
          ...((Array.isArray(rentals) ? rentals : []) as any[]).map((a: any) => ({ id: String(a?._id || a?.id || ''), isSales: false })),
          ...((Array.isArray(sales) ? sales : []) as any[]).map((a: any) => ({ id: String(a?._id || a?.id || ''), isSales: true })),
        ].filter(a => a.id);

        const statsPairs = await Promise.all(allAgents.map(async (a) => {
          const propertyCount = computePropertyCount(a.id, a.isSales);
          let totalCommission = 0;
          try {
            // Use commission summary endpoint for all-time total (authorized for admin/principal/prea)
            const totalResp = await api.get(`/users/${a.id}/commission`);
            totalCommission = Number((totalResp as any)?.data?.totalAgentCommission ?? (totalResp as any)?.data?.data?.totalAgentCommission ?? 0);
          } catch {}
          let monthCommission = 0;
          try {
            const resp = await api.get(`/users/${a.id}/commission`, { params: { startDate: startOfMonth.toISOString(), endDate: endOfMonth.toISOString() } });
            monthCommission = Number((resp as any)?.data?.totalAgentCommission ?? (resp as any)?.data?.data?.totalAgentCommission ?? 0);
          } catch {}
          return [a.id, { propertyCount, totalCommission, monthCommission }] as const;
        }));
        if (cancelled) return;
        setAgentStats(Object.fromEntries(statsPairs));
      } catch {
        if (!cancelled) {
          setRentalAgents([]); setSalesAgents([]); setAgentStats({});
        }
      }
    })();
    return () => { cancelled = true; };
  }, [properties]);

  // Filter out sale/sales properties and restrict to current user's company
  const rentalProperties = useMemo(() => {
    const currentCompanyId = getId((company as any)?._id) || getId((user as any)?.companyId);
    return (properties || []).filter((p: any) => {
      const rt = (p?.rentalType || '').toString().toLowerCase();
      if (rt === 'sale' || rt === 'sales') return false;
      const pidCompany = getId((p as any).companyId);
      return currentCompanyId ? (pidCompany === currentCompanyId) : true;
    });
  }, [properties, user?.companyId, company]);

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
        const anyP: any = p as any;
        const pid = getId(anyP?.propertyId) || getId(anyP?.property);
        if (!pid) continue;
        const monthsPaid: number = Number(anyP?.advanceMonthsPaid || 1);
        const sy = Number(anyP?.advancePeriodStart?.year);
        const sm = Number(anyP?.advancePeriodStart?.month);
        const ey = Number(anyP?.advancePeriodEnd?.year);
        const em = Number(anyP?.advancePeriodEnd?.month);
        if (monthsPaid > 1 && sy && sm && ey && em) {
          let y = sy; let m = sm;
          while (y < ey || (y === ey && m <= em)) { pushPaid(pid, y, m); m += 1; if (m > 12) { m = 1; y += 1; } }
        } else {
          const m = anyP?.rentalPeriodMonth || anyP?.levyPeriodMonth || (anyP?.paymentDate ? (new Date(anyP.paymentDate).getMonth() + 1) : undefined);
          const y = anyP?.rentalPeriodYear || anyP?.levyPeriodYear || (anyP?.paymentDate ? (new Date(anyP.paymentDate).getFullYear()) : undefined);
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
        if ((prop as any)?.levyOrMunicipalType !== 'levy') continue;
        const pid = getId((prop as any)._id) || getId((prop as any).id);
        if (!pid) continue;
        const monthlyLevy = Number((prop as any)?.levyOrMunicipalAmount) || 0;
        if (!monthlyLevy) continue;
        const paidKeys = paidByProperty[pid] || new Set<string>();
        const missing = new Set<string>();
        const leasesForProperty = (leases || [])
          .filter((l: any) => (getId((l as any).propertyId) || '') === pid)
          .filter((l: any) => String((l?.status || '')).toLowerCase() === 'active');
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
      // Align with accountant dashboard: do not include opening balances
      return total;
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
        const pid = getId(anyP?.propertyId) || getId(anyP?.property);
        if (!pid) continue;
        const monthsPaid: number = Number(anyP?.advanceMonthsPaid || 1);
        const sy = Number(anyP?.advancePeriodStart?.year);
        const sm = Number(anyP?.advancePeriodStart?.month);
        const ey = Number(anyP?.advancePeriodEnd?.year);
        const em = Number(anyP?.advancePeriodEnd?.month);
        if (monthsPaid > 1 && sy && sm && ey && em) {
          let y = sy; let m = sm;
          while (y < ey || (y === ey && m <= em)) { pushPaid(pid, y, m); m += 1; if (m > 12) { m = 1; y += 1; } }
        } else {
          const m = anyP?.rentalPeriodMonth || (anyP?.paymentDate ? (new Date(anyP.paymentDate).getMonth() + 1) : undefined);
          const y = anyP?.rentalPeriodYear || (anyP?.paymentDate ? (new Date(anyP.paymentDate).getFullYear()) : undefined);
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
        const pid = getId((prop as any)._id) || getId((prop as any).id);
        if (!pid) continue;
        const monthlyRent = Number((prop as any)?.rent) || 0;
        if (!monthlyRent) continue;
        const paidKeys = paidByProperty[pid] || new Set<string>();
        const missing = new Set<string>();
        const leasesForProperty = (leases || [])
          .filter((l: any) => (getId((l as any).propertyId) || '') === pid)
          .filter((l: any) => String((l?.status || '')).toLowerCase() === 'active');
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
      // Align with accountant dashboard: do not include opening balances
      return total;
    } catch { return 0; }
  }, [rentalProperties, leases, payments, company]);

  // If no company, show a setup prompt at the top of the dashboard
  const showCompanySetup = isAuthenticated && (!user?.companyId && !company);

  // Calculate statistics from real data
  const propertyStats: PropertyStats = {
    totalProperties: properties?.length || 0,
    vacantProperties: properties?.filter(p => p.status === 'available').length || 0,
    tenantedProperties: properties?.filter(p => p.status === 'rented').length || 0,
    maintenanceProperties: properties?.filter(p => p.status === 'maintenance').length || 0,
    residentialProperties: properties?.filter(p => p.type === 'apartment' || p.type === 'house').length || 0,
    commercialProperties: properties?.filter(p => p.type === 'commercial').length || 0
  };

  // Calculate chart data from real properties
  const occupancyData = [
    { name: 'Available', value: properties?.filter(p => p.status === 'available').length || 0 },
    { name: 'Rented', value: properties?.filter(p => p.status === 'rented').length || 0 },
    { name: 'Maintenance', value: properties?.filter(p => p.status === 'maintenance').length || 0 }
  ];

  const propertyTypesData = [
    { name: 'Residential', value: properties?.filter(p => p.type === 'apartment' || p.type === 'house').length || 0 },
    { name: 'Commercial', value: properties?.filter(p => p.type === 'commercial').length || 0 }
  ];

  const chartData = {
    occupancy: occupancyData,
    propertyTypes: propertyTypesData,
    monthlyTrend: [] // Empty array since revenue tracking is disabled
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  const chartStyles = {
    card: {
      backgroundColor: theme.cardBackground,
      border: `1px solid ${theme.border}`,
      boxShadow: 'none',
      borderRadius: 2,
    },
    text: {
      color: theme.text,
    },
    textSecondary: {
      color: theme.textSecondary,
    },
    grid: {
      stroke: theme.border,
    },
    tooltip: {
      backgroundColor: theme.cardBackground,
      border: `1px solid ${theme.border}`,
      color: theme.text,
    },
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <Box sx={chartStyles.tooltip} p={2}>
          <Typography variant="body2" sx={chartStyles.text}>
            {label}
          </Typography>
          {payload.map((entry: any, index: number) => (
            <Typography key={index} variant="body2" sx={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </Typography>
          ))}
        </Box>
      );
    }
    return null;
  };

  // Handle navigation to respective routes (no auth required)
  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const DashboardContent: React.FC = () => {
    if (propertiesLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <CircularProgress />
        </Box>
      );
    }

    if (propertiesError) {
      return (
        <Box p={3}>
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => navigate('/admin/company-setup')}>Set up company</Button>}>
            {propertiesError}
          </Alert>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            Property Statistics
          </Typography>
          <Typography variant="subtitle1" color="textSecondary">
            Overview of all properties in the system
          </Typography>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Total Properties"
              value={propertyStats.totalProperties.toString()}
              icon={<BusinessIcon />}
              color="#1976d2"
              theme={theme}
              onClick={() => {
                setPropertyListFilter('total');
              }}
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Vacant Properties"
              value={propertyStats.vacantProperties.toString()}
              icon={<BusinessIcon />}
              color="#dc004e"
              theme={theme}
              onClick={() => {
                setPropertyListFilter('vacant');
              }}
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Tenanted Properties"
              value={propertyStats.tenantedProperties.toString()}
              icon={<PeopleIcon />}
              color="#4caf50"
              theme={theme}
              onClick={() => {
                setPropertyListFilter('tenanted');
              }}
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Maintenance Properties"
              value={propertyStats.maintenanceProperties.toString()}
              icon={<WarningIcon />}
              color="#ff9800"
              theme={theme}
              onClick={() => {
                setPropertyListFilter('maintenance');
              }}
            />
          </Grid>
        </Grid>

        {/* Outstanding cards for admin (company-wide) */}
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Outstanding rentals"
              value={`$${Number(computedOutstandingRentals || 0).toLocaleString()}`}
              icon={<PaymentIcon />}
              color="#dc004e"
              theme={theme}
              onClick={() => { setShowOutstandingRentals(true); setShowOutstandingLevies(false); }}
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <StatCard
              title="Outstanding levies"
              value={`$${Number(computedOutstandingLevies || 0).toLocaleString()}`}
              icon={<PaymentIcon />}
              color="#ff9800"
              theme={theme}
              onClick={() => { setShowOutstandingLevies(true); setShowOutstandingRentals(false); }}
            />
          </Grid>
        </Grid>

        {/* Click-through lists for property cards */}
        {propertyListFilter && (
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">
                {propertyListFilter === 'total' && 'All Properties'}
                {propertyListFilter === 'vacant' && 'Vacant Properties'}
                {propertyListFilter === 'tenanted' && 'Tenanted Properties'}
                {propertyListFilter === 'maintenance' && 'Maintenance Properties'}
              </Typography>
              <Button size="small" onClick={() => setPropertyListFilter(null)}>Hide</Button>
            </Box>
            {(() => {
              const list = (properties || []).filter((p) => {
                if (propertyListFilter === 'total') return true;
                if (propertyListFilter === 'vacant') return p.status === 'available';
                if (propertyListFilter === 'tenanted') return p.status === 'rented';
                if (propertyListFilter === 'maintenance') return p.status === 'maintenance';
                return false;
              });
              if (!list.length) {
                return (
                  <Typography color="textSecondary">No properties found for this category.</Typography>
                );
              }
              return (
                <Grid container spacing={2}>
                  {list.map((p: any) => (
                    <Grid item xs={12} key={String(p._id || p.id)}>
                      <Card>
                        <CardContent>
                          <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                            <Grid item xs={12} md={8}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{p.name || 'Unnamed Property'}</Typography>
                              <Typography color="textSecondary">{p.address || ''}</Typography>
                            </Grid>
                            <Grid item xs={12} md={4}>
                              <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                                <Chip label={p.status || 'unknown'} size="small" color={p.status === 'rented' ? 'success' : p.status === 'available' ? 'default' : p.status === 'maintenance' ? 'warning' : 'default'} />
                                {typeof p.rent === 'number' && p.rent > 0 && (
                                  <Chip label={`$${Number(p.rent).toLocaleString()}/mo`} size="small" />
                                )}
                              </Box>
                            </Grid>
                          </Grid>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              );
            })()}
          </Box>
        )}

        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={chartStyles.card}>
              <Box sx={{ p: 2 }}>
                <Typography variant="h6" sx={chartStyles.text}>
                  Property Occupancy
                </Typography>
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.occupancy}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {chartData.occupancy.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={theme.chartColors[index % theme.chartColors.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={chartStyles.card}>
              <Box sx={{ p: 2 }}>
                <Typography variant="h6" sx={chartStyles.text}>
                  Property Types
                </Typography>
                <Box sx={{ height: 300, mt: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.propertyTypes}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {chartData.propertyTypes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={theme.chartColors[index % theme.chartColors.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {(showOutstandingLevies || showOutstandingRentals) && (
          <Box sx={{ mt: 3 }}>
            {showOutstandingLevies ? (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">Properties Without Levy Payments</Typography>
                  <Button size="small" onClick={() => setShowOutstandingLevies(false)}>Hide</Button>
                </Box>
                {(() => {
                  const now = new Date();
                  const currentMonth = now.getMonth() + 1;
                  const currentYear = now.getFullYear();
                  const ymKey = (y: number, m: number) => `${y}-${m}`;
                  const cutY = (company as any)?.receivablesCutover?.year;
                  const cutM = (company as any)?.receivablesCutover?.month;
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
                    const anyP: any = p as any;
                    const pid = getId(anyP?.propertyId) || getId(anyP?.property);
                    if (!pid) continue;
                    const monthsPaid: number = Number(anyP?.advanceMonthsPaid || 1);
                    const sy = Number(anyP?.advancePeriodStart?.year);
                    const sm = Number(anyP?.advancePeriodStart?.month);
                    const ey = Number(anyP?.advancePeriodEnd?.year);
                    const em = Number(anyP?.advancePeriodEnd?.month);
                    if (monthsPaid > 1 && sy && sm && ey && em) {
                      let y = sy; let m = sm;
                      while (y < ey || (y === ey && m <= em)) { pushPaid(pid, y, m); m += 1; if (m > 12) { m = 1; y += 1; } }
                    } else {
                      const m = anyP?.rentalPeriodMonth || anyP?.levyPeriodMonth || (anyP?.paymentDate ? (new Date(anyP.paymentDate).getMonth() + 1) : undefined);
                      const y = anyP?.rentalPeriodYear || anyP?.levyPeriodYear || (anyP?.paymentDate ? (new Date(anyP.paymentDate).getFullYear()) : undefined);
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
                    .filter((prop: any) => (prop as any)?.levyOrMunicipalType === 'levy')
                    .map((prop: any) => {
                      const pid = getId((prop as any)._id) || getId((prop as any).id);
                      const paidKeys = paidByProperty[pid] || new Set<string>();
                      const leasesForProperty = (leases || [])
                        .filter((l: any) => (getId((l as any).propertyId) || '') === pid)
                        .filter((l: any) => String((l?.status || '')).toLowerCase() === 'active');
                      const perTenantMissing: Array<{ tenantId: string; tenantName: string; labels: string[] }> = [];
                      let propertyTotalMissing = 0;
                      let propertyTotalAmount = 0;
                      const monthlyLevy = Number((prop as any)?.levyOrMunicipalAmount) || 0;
                      for (const l of leasesForProperty) {
                        const start = l?.startDate ? new Date(l.startDate) : null;
                        const end = l?.endDate ? new Date(l.endDate) : now;
                        if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
                        const normEnd = new Date(Math.min(end.getTime(), new Date(currentYear, currentMonth - 1, 1).getTime()));
                        const labels: string[] = [];
                        let ns = new Date(start.getFullYear(), start.getMonth(), 1);
                        if (cutoverDate && ns.getTime() < cutoverDate.getTime()) ns = cutoverDate;
                        const ne = new Date(normEnd.getFullYear(), normEnd.getMonth(), 1);
                        iterateMonths(ns, ne, (y, m, label) => {
                          if (!paidKeys.has(ymKey(y, m))) labels.push(label);
                        });
                        if (labels.length > 0) {
                          const tid = getId((l as any).tenantId);
                          const t = (tenants || []).find((tt: any) => (getId((tt as any)._id) || getId((tt as any).id)) === tid);
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
                    return <Typography color="textSecondary">All levy-paying properties have payments recorded for the lease periods.</Typography>;
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
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{(prop as any).name || 'Unnamed Property'}</Typography>
                                    <Typography color="textSecondary">{(prop as any).address || ''}</Typography>
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
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">Properties With Unpaid Rentals</Typography>
                  <Button size="small" onClick={() => setShowOutstandingRentals(false)}>Hide</Button>
                </Box>
                {(() => {
                  const now = new Date();
                  const currentMonth = now.getMonth() + 1;
                  const currentYear = now.getFullYear();
                  const ymKey = (y: number, m: number) => `${y}-${m}`;
                  const cutY = (company as any)?.receivablesCutover?.year;
                  const cutM = (company as any)?.receivablesCutover?.month;
                  const cutoverDate = (cutY && cutM) ? new Date(Number(cutY), Number(cutM) - 1, 1) : null;
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
                    const pid = getId(anyP?.propertyId) || getId(anyP?.property);
                    if (!pid) continue;
                    const monthsPaid: number = Number(anyP?.advanceMonthsPaid || 1);
                    const sy = Number(anyP?.advancePeriodStart?.year);
                    const sm = Number(anyP?.advancePeriodStart?.month);
                    const ey = Number(anyP?.advancePeriodEnd?.year);
                    const em = Number(anyP?.advancePeriodEnd?.month);
                    if (monthsPaid > 1 && sy && sm && ey && em) {
                      let y = sy; let m = sm;
                      while (y < ey || (y === ey && m <= em)) { pushPaid(pid, y, m); m += 1; if (m > 12) { m = 1; y += 1; } }
                    } else {
                      const m = anyP?.rentalPeriodMonth || (anyP?.paymentDate ? (new Date(anyP.paymentDate).getMonth() + 1) : undefined);
                      const y = anyP?.rentalPeriodYear || (anyP?.paymentDate ? (new Date(anyP.paymentDate).getFullYear()) : undefined);
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
                      const pid = getId((prop as any)._id) || getId((prop as any).id);
                      const paidKeys = paidByProperty[pid] || new Set<string>();
                      const leasesForProperty = (leases || [])
                        .filter((l: any) => (getId((l as any).propertyId) || '') === pid)
                        .filter((l: any) => String((l?.status || '')).toLowerCase() === 'active');
                      const perTenantMissing: Array<{ tenantId: string; tenantName: string; labels: string[] }> = [];
                      const missingSet = new Set<string>();
                      const missingLabels: string[] = [];
                      for (const l of leasesForProperty) {
                        const start = l?.startDate ? new Date(l.startDate) : null;
                        const end = l?.endDate ? new Date(l.endDate) : new Date(currentYear, currentMonth - 1, 1);
                        if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
                        let ns = new Date(start.getFullYear(), start.getMonth(), 1);
                        if (cutoverDate && ns.getTime() < cutoverDate.getTime()) ns = cutoverDate;
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
                          const tid = getId((l as any).tenantId);
                          const t = (tenants || []).find((tt: any) => (getId((tt as any)._id) || getId((tt as any).id)) === tid);
                          const tName = t ? (`${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || t.fullName || 'Unknown Tenant') : 'Unknown Tenant';
                          perTenantMissing.push({ tenantId: tid, tenantName: tName, labels });
                        }
                      }
                      const missed = missingSet.size;
                      const monthlyRent = Number((prop as any)?.rent) || 0;
                      const propertyTotalAmount = missed * monthlyRent;
                      return { prop, pid, missed, missingLabels, perTenantMissing, propertyTotalAmount };
                    })
                    .filter((row: any) => (row.missed || 0) > 0)
                    .sort((a: any, b: any) => (b.missed || 0) - (a.missed || 0));
                  if (!items.length) {
                    return <Typography color="textSecondary">All properties have a rental payment recorded for the lease periods.</Typography>;
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
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{(prop as any).name || 'Unnamed Property'}</Typography>
                                    <Typography color="textSecondary">{(prop as any).address || ''}</Typography>
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

        {/* Agents section replacing Note */}
        <Grid container spacing={3} sx={{ mt: 4 }}>
          <Grid item xs={12} md={6}>
            <Box sx={{ p: 2, backgroundColor: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom sx={chartStyles.text}>Rental Agents</Typography>
              <Grid container spacing={2}>
                {(rentalAgents || []).map((a: any) => {
                  const id = String(a?._id || a?.id || '');
                  const st = agentStats[id] || { propertyCount: 0, totalCommission: 0, monthCommission: 0 };
                  const fullName = `${a?.firstName || ''} ${a?.lastName || ''}`.trim() || (a?.email || 'Unnamed');
                  return (
                    <Grid item xs={12} key={id}>
                      <Card sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin-dashboard/agents/${id}`)}>
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            <Box>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{fullName}</Typography>
                              <Typography variant="body2" color="textSecondary">Properties added: {st.propertyCount}</Typography>
                            </Box>
                            <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                              <Typography variant="body2" color="textSecondary">Total commission</Typography>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>${Number(st.totalCommission || 0).toLocaleString()}</Typography>
                              <Typography variant="body2" color="textSecondary">This month: ${Number(st.monthCommission || 0).toLocaleString()}</Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
                {(!rentalAgents || rentalAgents.length === 0) && (
                  <Grid item xs={12}><Typography variant="body2" color="textSecondary">No rental agents found.</Typography></Grid>
                )}
              </Grid>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box sx={{ p: 2, backgroundColor: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom sx={chartStyles.text}>Sales Agents</Typography>
              <Grid container spacing={2}>
                {(salesAgents || []).map((a: any) => {
                  const id = String(a?._id || a?.id || '');
                  const st = agentStats[id] || { propertyCount: 0, totalCommission: 0, monthCommission: 0 };
                  const fullName = `${a?.firstName || ''} ${a?.lastName || ''}`.trim() || (a?.email || 'Unnamed');
                  return (
                    <Grid item xs={12} key={id}>
                      <Card sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin-dashboard/agents/${id}`)}>
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            <Box>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{fullName}</Typography>
                              <Typography variant="body2" color="textSecondary">Properties added: {st.propertyCount}</Typography>
                            </Box>
                            <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                              <Typography variant="body2" color="textSecondary">Total commission</Typography>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>${Number(st.totalCommission || 0).toLocaleString()}</Typography>
                              <Typography variant="body2" color="textSecondary">This month: ${Number(st.monthCommission || 0).toLocaleString()}</Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
                {(!salesAgents || salesAgents.length === 0) && (
                  <Grid item xs={12}><Typography variant="body2" color="textSecondary">No sales agents found.</Typography></Grid>
                )}
              </Grid>
            </Box>
          </Grid>
        </Grid>
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ mt: 8, p: 3 }}>
          <Routes>
            <Route path="/" element={<DashboardContent />} />
            <Route
              path="/users"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <UserManagement embedded />
                </Box>
              }
            />
            <Route
              path="/maintenance"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <Maintenance
                    user={user || undefined}
                    company={maintenanceCompany as any}
                    isAuthenticated={!!isAuthenticated}
                    authLoading={authLoading}
                  />
                </Box>
              }
            />
            <Route path="/properties" element={<Properties />} />
            <Route path="/property-owners" element={<AdminPropertyOwnersPage />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/leases" element={<AdminLeasesPage />} />
            <Route
              path="/payments"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <PaymentsPage />
                </Box>
              }
            />
            <Route path="/levies" element={<LevyPaymentsPage />} />
            <Route path="/communications" element={<CommunicationsPage />} />
            <Route path="/files" element={<Files />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/sync" element={<DatabaseSyncDashboard />} />
            <Route path="/settings" element={<AdminSettings />} />
            <Route path="/agents/:agentId" element={<AgentDetailPage />} />
            {company?.plan === 'INDIVIDUAL' && (
              <>
                <Route
                  path="/property-accounts"
                  element={
                    <Box sx={{ ml: -3, p: 0 }}>
                      <PropertyAccountsPage />
                    </Box>
                  }
                />
                <Route
                  path="/property-accounts/:propertyId/ledger"
                  element={
                    <Box sx={{ ml: -3, p: 0 }}>
                      <PropertyLedgerPage />
                    </Box>
                  }
                />
              </>
            )}
          </Routes>
        </Box>
      </Box>
    </Box>
  );
};

export default AdminDashboard;
