import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Divider,
  IconButton,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useAdminDashboardService } from '../../services/adminDashboardService';
import { agentAccountService } from '../../services/agentAccountService';
import paymentService from '../../services/paymentService';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { useTenantService } from '../../services/tenantService';
import { useLeaseService } from '../../services/leaseService';
import { usePropertyOwnerService } from '../../services/propertyOwnerService';

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const AgentDetailPage: React.FC = () => {
  const { agentId = '' } = useParams();
  const navigate = useNavigate();
  const { getAdminDashboardProperties } = useAdminDashboardService();
  const { user } = useAuth();
  const { company } = useCompany();
  const tenantService = useTenantService();
  const leaseService = useLeaseService();
  const propertyOwnerService = usePropertyOwnerService();

  const [agent, setAgent] = React.useState<any | null>(null);
  const [properties, setProperties] = React.useState<any[]>([]);
  const [tenants, setTenants] = React.useState<any[]>([]);
  const [leases, setLeases] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [kpiTotalCommission, setKpiTotalCommission] = React.useState(0);
  const [kpiMonthCommission, setKpiMonthCommission] = React.useState(0);
  const [filterYear, setFilterYear] = React.useState<number>(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = React.useState<number>(new Date().getMonth());

  const [salesTotals, setSalesTotals] = React.useState<{ totalValue: number; totalAgentCommission: number }>({ totalValue: 0, totalAgentCommission: 0 });
  const [rentalTotals, setRentalTotals] = React.useState<{ totalCollected: number; totalAgentCommission: number }>({ totalCollected: 0, totalAgentCommission: 0 });
  const [ownerByPropertyId, setOwnerByPropertyId] = React.useState<Record<string, { name: string; email?: string; phone?: string }>>({});

  // Load base data
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        // Fetch agent lists and resolve single agent
        const [rentalAgents, salesAgents] = await Promise.all([
          paymentService.getAgentsPublic(String((user as any)?.companyId || (company as any)?._id || ''), 'agent').catch(() => []),
          paymentService.getAgentsPublic(String((user as any)?.companyId || (company as any)?._id || ''), 'sales').catch(() => []),
        ]);
        if (cancelled) return;
        const found = [...(Array.isArray(rentalAgents) ? rentalAgents : []), ...(Array.isArray(salesAgents) ? salesAgents : [])]
          .find((a: any) => String(a?._id || a?.id) === String(agentId));
        setAgent(found || null);

        // Get dashboard properties
        const props = await getAdminDashboardProperties();
        if (cancelled) return;
        setProperties(Array.isArray(props) ? props : []);

        // Tenants & leases (public)
        const [tpub, lpub] = await Promise.all([
          tenantService.getAllPublic().catch(() => ({ tenants: [] })),
          leaseService.getAllPublic().catch(() => []),
        ]);
        if (cancelled) return;
        setTenants(Array.isArray((tpub as any)?.tenants) ? (tpub as any).tenants : []);
        setLeases(Array.isArray(lpub) ? lpub : []);

        // Agent commissions total (all-time) via commission summary endpoint
        try {
          const totalResp = await (await import('../../api/axios')).default.get(`/users/${agentId}/commission`);
          if (!cancelled) setKpiTotalCommission(Number((totalResp as any)?.data?.totalAgentCommission ?? (totalResp as any)?.data?.data?.totalAgentCommission ?? 0));
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  // Month commission KPI
  const refreshMonthCommission = React.useCallback(async (y: number, mZeroBased: number) => {
    const start = new Date(y, mZeroBased, 1);
    const end = new Date(y, mZeroBased + 1, 0, 23, 59, 59, 999);
    try {
      const resp = await (await import('../../api/axios')).default.get(`/users/${agentId}/commission`, {
        params: { startDate: start.toISOString(), endDate: end.toISOString() }
      });
      setKpiMonthCommission(Number((resp as any)?.data?.totalAgentCommission ?? (resp as any)?.data?.data?.totalAgentCommission ?? 0));
    } catch {
      setKpiMonthCommission(0);
    }
  }, [agentId]);

  React.useEffect(() => {
    refreshMonthCommission(filterYear, filterMonth);
  }, [filterYear, filterMonth, refreshMonthCommission]);

  // Sales vs Rental totals (payments public)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const companyId = String((user as any)?.companyId || (company as any)?._id || '');
        const resp = await paymentService.getAllPublic(companyId, { agentId });
        if (cancelled) return;
        const list = Array.isArray(resp?.data) ? resp.data : [];
        let salesValue = 0, salesAgentComm = 0;
        let rentalCollected = 0, rentalAgentComm = 0;
        for (const p of list) {
          const t = String((p as any)?.paymentType || '').toLowerCase();
          const amt = Number((p as any)?.amount || 0);
          const agentShare = Number((p as any)?._distributedAgentShare ?? (p as any)?.commissionDetails?.agentShare ?? 0);
          if (t === 'sale') {
            salesValue += amt;
            salesAgentComm += agentShare;
          } else if (t !== 'levy' && t !== 'municipal') {
            rentalCollected += amt;
            rentalAgentComm += agentShare;
          }
        }
        setSalesTotals({ totalValue: salesValue, totalAgentCommission: salesAgentComm });
        setRentalTotals({ totalCollected: rentalCollected, totalAgentCommission: rentalAgentComm });
      } catch {
        if (!cancelled) {
          setSalesTotals({ totalValue: 0, totalAgentCommission: 0 });
          setRentalTotals({ totalCollected: 0, totalAgentCommission: 0 });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, user?.companyId, company]);

  const filteredProperties = React.useMemo(() => {
    const routeAgentId = String(agentId || '');
    if (!routeAgentId) return [];
    return (properties || []).filter((p: any) => {
      const owner = (p as any)?.ownerId;
      const ownerId = String((owner && (owner as any)._id) || owner || '');
      return ownerId && ownerId === routeAgentId;
    });
  }, [properties, agentId]);

  // Resolve owner details per propertyId:
  // - Rentals: cross-reference propertyowners by propertyId
  // - Sales: prefer sales owners via property.propertyOwnerId; fallback to propertyowners by propertyId
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tasks = (filteredProperties || []).map(async (p: any) => {
          const pid = String(p?._id || p?.id || '');
          if (!pid) return null;
          const rentalType = String(p?.rentalType || '').toLowerCase();
          // Try per rules
          if (rentalType === 'sale' || rentalType === 'sales') {
            // Sales owners collection first (via propertyOwnerId when present)
            const salesOwnerId = String((p as any)?.propertyOwnerId || '');
            if (salesOwnerId) {
              try {
                const so = await propertyOwnerService.getSalesById(salesOwnerId);
                if (so && (so.firstName || so.lastName || so.name)) {
                  const name = (`${so.firstName || ''} ${so.lastName || ''}`.trim()) || so.name || 'Unknown';
                  return [pid, { name, email: so.email, phone: (so as any).phone }] as const;
                }
              } catch {}
            }
            // Fallback to property-owners by propertyId
            try {
              const o = await propertyOwnerService.getByPropertyId(pid, String((user as any)?.companyId || (company as any)?._id || ''));
              if (o && (o.firstName || o.lastName || (o as any).name)) {
                const name = (`${o.firstName || ''} ${o.lastName || ''}`.trim()) || (o as any).name || 'Unknown';
                return [pid, { name, email: (o as any).email, phone: (o as any).phone }] as const;
              }
            } catch {}
            return null;
          } else {
            // Rentals: property owners by propertyId
            try {
              const o = await propertyOwnerService.getByPropertyId(pid, String((user as any)?.companyId || (company as any)?._id || ''));
              if (o && (o.firstName || o.lastName || (o as any).name)) {
                const name = (`${o.firstName || ''} ${o.lastName || ''}`.trim()) || (o as any).name || 'Unknown';
                return [pid, { name, email: (o as any).email, phone: (o as any).phone }] as const;
              }
            } catch {}
            return null;
          }
        });
        const results = await Promise.all(tasks);
        if (cancelled) return;
        const mapEntries = (results || []).filter(Boolean) as Array<readonly [string, { name: string; email?: string; phone?: string }]>;
        if (mapEntries.length) {
          setOwnerByPropertyId(prev => ({ ...prev, ...Object.fromEntries(mapEntries) }));
        }
      } catch {
        // ignore resolution errors
      }
    })();
    return () => { cancelled = true; };
  }, [filteredProperties, user?.companyId, company]);

  const getOwnerName = (prop: any) => {
    const owner = (prop as any)?.ownerId;
    if (!owner) return 'Unknown owner';
    const fn = (owner as any)?.firstName || '';
    const ln = (owner as any)?.lastName || '';
    const email = (owner as any)?.email || '';
    const name = `${fn} ${ln}`.trim();
    const pid = String((prop as any)?._id || (prop as any)?.id || '');
    const enriched = ownerByPropertyId[pid];
    if (enriched && enriched.name) {
      return enriched.email ? `${enriched.name} (${enriched.email})` : enriched.name;
    }
    return name || email || 'Unknown owner';
  };

  const getTenantOrBuyerDetails = (prop: any) => {
    const rt = (prop?.rentalType || '').toString().toLowerCase();
    const pid = String(prop?._id || prop?.id || '');
    if (rt === 'sale' || rt === 'sales') {
      // Buyer detail fallback via payments list isn't guaranteed; show status
      return 'Buyer: Available in sales records';
    }
    // Rental: try find active lease tenant
    const forProperty = (leases || []).filter((l: any) => String(l?.propertyId?._id || l?.propertyId) === pid);
    const latest = forProperty.sort((a: any, b: any) => (new Date(b?.startDate || 0).getTime()) - (new Date(a?.startDate || 0).getTime()))[0];
    if (!latest) return 'Tenant: Not assigned';
    const tid = String(latest?.tenantId?._id || latest?.tenantId || '');
    const t = (tenants || []).find((tt: any) => String(tt?._id || tt?.id) === tid);
    const name = t ? (`${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || t.fullName) : '';
    return `Tenant: ${name || 'Unknown'}`;
  };

  const money = (n: number) => `$${Number(n || 0).toLocaleString()}`;

  const propertyCount = filteredProperties.length;
  const agentName = agent ? (`${agent?.firstName || ''} ${agent?.lastName || ''}`.trim() || agent?.email || 'Agent') : 'Agent';

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <IconButton aria-label="Back" onClick={() => navigate('/admin-dashboard')} size="small" sx={{ mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{agentName}</Typography>
      </Box>

      <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Grid item>
          <FormControl size="small">
            <InputLabel id="month-label">Month</InputLabel>
            <Select
              labelId="month-label"
              id="month-select"
              name="month"
              label="Month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(Number(e.target.value))}
              sx={{ minWidth: 120 }}
            >
              {months.map((m, idx) => (
                <MenuItem key={m} value={idx}>{m}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item>
          <FormControl size="small">
            <InputLabel id="year-label">Year</InputLabel>
            <Select
              labelId="year-label"
              id="year-select"
              name="year"
              label="Year"
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              sx={{ minWidth: 120 }}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const y = new Date().getFullYear() - i;
                return <MenuItem key={y} value={y}>{y}</MenuItem>;
              })}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="textSecondary">Properties added</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{propertyCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="textSecondary">Total commission (all-time)</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{money(kpiTotalCommission)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="textSecondary">Current month commission</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{money(kpiMonthCommission)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Property List</Typography>
              <Grid container spacing={1}>
                {filteredProperties.map((p: any) => (
                  <Grid item xs={12} key={String(p?._id || p?.id)}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{p?.name || 'Property'}</Typography>
                        <Typography variant="body2" color="textSecondary">{p?.address || ''}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                          {typeof p?.price === 'number' && p.price > 0 && (
                            <Chip size="small" label={`Price: ${money(p.price)}`} />
                          )}
                          {typeof p?.rent === 'number' && p.rent > 0 && (
                            <Chip size="small" label={`Rent: ${money(p.rent)}/mo`} />
                          )}
                          <Chip size="small" label={`Status: ${(p?.status || 'unknown')}`} />
                          <Chip size="small" label={`Owner: ${getOwnerName(p)}`} />
                        </Box>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="body2">{getTenantOrBuyerDetails(p)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
                {filteredProperties.length === 0 && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="textSecondary">No properties found for this agent.</Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Commission & Payments</Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Sales</Typography>
                <Typography variant="body2">Total value sold: {money(salesTotals.totalValue)}</Typography>
                <Typography variant="body2">Agent commission (sum): {money(salesTotals.totalAgentCommission)}</Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Rentals</Typography>
                <Typography variant="body2">Total rental collected: {money(rentalTotals.totalCollected)}</Typography>
                <Typography variant="body2">Agent commission (sum): {money(rentalTotals.totalAgentCommission)}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AgentDetailPage;


