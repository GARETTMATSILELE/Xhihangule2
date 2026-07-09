import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  Business as BusinessIcon,
  People as PeopleIcon,
  HomeWork as HomeWorkIcon,
  Payment as PaymentIcon,
  Build as BuildIcon,
  Description as DescriptionIcon,
  Person as PersonIcon,
  TrendingUp as TrendingUpIcon,
  WarningAmber as WarningIcon,
  Event as EventIcon,
  Visibility as VisibilityIcon,
  Assignment as AssignmentIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import agencyOperationsService from '../../services/agencyOperationsService';
import { ExecutiveDashboardData } from '../../types/agencyOperations';
import { KpiCard, SectionCard, severityChipColor } from '../../components/admin/dashboard/OperationsPrimitives';
import { useCompany } from '../../contexts/CompanyContext';

const formatCurrency = (n: number) => `$${Number(n || 0).toLocaleString()}`;

const ExecutiveOperationsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useCompany();
  const [data, setData] = useState<ExecutiveDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await agencyOperationsService.getExecutiveDashboard({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(result);
    } catch (e: any) {
      setError(e?.message || 'Failed to load operations dashboard');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    if (!data) return [];
    const h = data.businessHealth;
    return [
      { title: 'Total Properties', value: h.totalProperties, icon: <BusinessIcon />, link: '/admin-dashboard/properties', severity: 'info' as const },
      { title: 'Occupied Properties', value: h.occupiedProperties, icon: <HomeWorkIcon />, link: '/admin-dashboard/properties', severity: 'healthy' as const, trend: h.trends.occupancyRate },
      { title: 'Vacant Properties', value: h.vacantProperties, icon: <WarningIcon />, link: '/admin-dashboard/vacancies', severity: h.vacantProperties > 0 ? 'warning' as const : 'healthy' as const, trend: h.trends.vacantProperties },
      { title: 'Occupancy Rate', value: `${h.occupancyRate}%`, icon: <TrendingUpIcon />, link: '/admin-dashboard/reports', severity: h.occupancyRate >= 90 ? 'healthy' as const : h.occupancyRate >= 75 ? 'warning' as const : 'critical' as const },
      { title: 'Under Management', value: h.propertiesUnderManagement, icon: <BusinessIcon />, link: '/admin-dashboard/properties', severity: 'neutral' as const },
      { title: 'Total Monthly Rent', value: formatCurrency(h.totalMonthlyRent), icon: <PaymentIcon />, link: '/admin-dashboard/payments', severity: 'info' as const },
      { title: 'Outstanding Rent', value: formatCurrency(h.outstandingRent), icon: <PaymentIcon />, link: '/admin-dashboard/payments', severity: h.outstandingRent > 0 ? 'critical' as const : 'healthy' as const, trend: h.trends.outstandingRent },
      { title: 'Outstanding Municipal', value: formatCurrency(h.outstandingMunicipalBills), icon: <PaymentIcon />, link: '/admin-dashboard/municipal-bills', severity: h.outstandingMunicipalBills > 0 ? 'warning' as const : 'healthy' as const },
      { title: 'Outstanding Levies', value: formatCurrency(h.outstandingLevies), icon: <PaymentIcon />, link: '/admin-dashboard/levies', severity: h.outstandingLevies > 0 ? 'warning' as const : 'healthy' as const },
      { title: 'Open Maintenance', value: h.openMaintenanceRequests, icon: <BuildIcon />, link: '/admin-dashboard/maintenance', severity: h.openMaintenanceRequests > 5 ? 'warning' as const : 'neutral' as const },
      { title: 'Lease Renewals (30d)', value: h.upcomingLeaseRenewals, icon: <DescriptionIcon />, link: '/admin-dashboard/leases', severity: h.upcomingLeaseRenewals > 0 ? 'warning' as const : 'healthy' as const },
      { title: 'Active Agents', value: h.activeAgents, icon: <PersonIcon />, link: '/admin-dashboard/agents', severity: 'info' as const },
    ];
  }, [data]);

  if (loading && !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !data) {
    return <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error}</Alert>;
  }

  if (!data) return null;

  const { alerts, agentPerformance, vacancies, leaseExpiries, maintenanceOverview, inspectionSchedule, leadPipeline, rosterSummary } = data;

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ md: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              Executive Operations Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Agency administration command centre for {company?.name || 'your portfolio'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Button variant="outlined" onClick={load} disabled={loading}>Refresh</Button>
          </Stack>
        </Stack>
        {loading && <LinearProgress sx={{ mt: 2 }} />}
      </Box>

      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Business Health Summary
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {kpis.map((kpi) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={kpi.title}>
            <KpiCard
              title={kpi.title}
              value={kpi.value}
              icon={kpi.icon}
              color="#5E72E4"
              trend={kpi.trend as any}
              severity={kpi.severity}
              onClick={() => navigate(kpi.link)}
            />
          </Grid>
        ))}
      </Grid>

      <SectionCard title="Action Centre" subtitle="Critical operational alerts requiring attention">
        {alerts.length === 0 ? (
          <Chip label="All systems healthy" color="success" icon={<AssignmentIcon />} />
        ) : (
          <Stack spacing={1}>
            {alerts.map((alert) => (
              <Box
                key={alert.id}
                onClick={() => navigate(alert.link)}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{alert.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{alert.description}</Typography>
                </Box>
                <Chip size="small" label={alert.severity} color={severityChipColor(alert.severity)} />
              </Box>
            ))}
          </Stack>
        )}
      </SectionCard>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <SectionCard
            title="Agent Performance Centre"
            subtitle="Leaderboard and highlights"
            action={
              <Button size="small" onClick={() => navigate('/admin-dashboard/agents')}>View all agents</Button>
            }
          >
            <Grid container spacing={1} sx={{ mb: 2 }}>
              {Object.entries(agentPerformance.highlights).map(([key, agent]) => agent && (
                <Grid item xs={6} sm={4} key={key}>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary">{key.replace(/([A-Z])/g, ' $1')}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{agent.agentName}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">Properties</TableCell>
                  <TableCell align="right">Viewings</TableCell>
                  <TableCell align="right">Leases</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agentPerformance.leaderboard.slice(0, 8).map((row) => (
                  <TableRow key={row.agentId} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin-dashboard/agents/${row.agentId}`)}>
                    <TableCell>{row.agentName}</TableCell>
                    <TableCell align="right">{row.propertiesManaged}</TableCell>
                    <TableCell align="right">{row.viewingsConducted}</TableCell>
                    <TableCell align="right">{row.leasesSigned}</TableCell>
                    <TableCell align="right">{formatCurrency(row.revenueGenerated)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </Grid>

        <Grid item xs={12} lg={5}>
          <SectionCard title="Vacancy Tracker" subtitle="Aging vacancies and revenue impact" action={<Button size="small" onClick={() => navigate('/admin-dashboard/vacancies')}>Open centre</Button>}>
            {vacancies.length === 0 ? (
              <Typography color="text.secondary">No vacant properties.</Typography>
            ) : (
              <Stack spacing={1}>
                {vacancies.slice(0, 6).map((v) => (
                  <Box key={v.propertyId} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{v.propertyName}</Typography>
                      <Chip size="small" label={`${v.daysVacant}d vacant`} color={v.agingLevel === 'red' ? 'error' : v.agingLevel === 'amber' ? 'warning' : 'success'} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">Est. loss: {formatCurrency(v.expectedRevenueLoss)} · {v.viewingCount} viewings</Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <SectionCard title="Lease Expiry Tracker">
            {leaseExpiries.length === 0 ? (
              <Typography color="text.secondary">No leases expiring in the next 90 days.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Property</TableCell>
                    <TableCell>Days</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leaseExpiries.map((l) => (
                    <TableRow key={l.leaseId} hover sx={{ cursor: 'pointer' }} onClick={() => navigate('/admin-dashboard/leases')}>
                      <TableCell>{l.propertyName}</TableCell>
                      <TableCell>{l.daysUntil}</TableCell>
                      <TableCell><Chip size="small" label={l.severity} color={severityChipColor(l.severity)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard title="Maintenance Overview" action={<Button size="small" onClick={() => navigate('/admin-dashboard/maintenance')}>Open workspace</Button>}>
            <Stack direction="row" spacing={2}>
              <Box sx={{ flex: 1, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Typography variant="h4" color="warning.main">{maintenanceOverview.open}</Typography>
                <Typography variant="body2" color="text.secondary">Open requests</Typography>
              </Box>
              <Box sx={{ flex: 1, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Typography variant="h4" color="error.main">{maintenanceOverview.overdue}</Typography>
                <Typography variant="body2" color="text.secondary">Overdue jobs</Typography>
              </Box>
            </Stack>
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <SectionCard title="Inspection Schedule" action={<Button size="small" onClick={() => navigate('/admin-dashboard/inspections')}>Inspections centre</Button>}>
            {inspectionSchedule.length === 0 ? (
              <Typography color="text.secondary">No upcoming inspections.</Typography>
            ) : (
              inspectionSchedule.map((i: any) => (
                <Box key={i._id} sx={{ mb: 1, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{String(i.type || 'routine').replace(/_/g, ' ')}</Typography>
                  <Typography variant="caption" color="text.secondary">{new Date(i.scheduledDate).toLocaleDateString()}</Typography>
                </Box>
              ))
            )}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={4}>
          <SectionCard title="Lead Pipeline" action={<Button size="small" onClick={() => navigate('/admin-dashboard/leads')}>CRM</Button>}>
            <Typography variant="h4" sx={{ mb: 1 }}>{leadPipeline.conversionRate}%</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Conversion rate · {leadPipeline.total} active leads</Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {leadPipeline.byStage.filter((s) => s.count > 0).map((s) => (
                <Chip key={s.stage} size="small" label={`${s.stage.replace(/_/g, ' ')}: ${s.count}`} />
              ))}
            </Stack>
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={4}>
          <SectionCard title="Duty Roster Summary" action={<Button size="small" onClick={() => navigate('/admin-dashboard/duty-rosters')}>Manage rosters</Button>}>
            {rosterSummary.length === 0 ? (
              <Typography color="text.secondary">No shifts scheduled this week.</Typography>
            ) : (
              rosterSummary.map((s) => (
                <Box key={s.id} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CalendarIcon fontSize="small" color="action" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.agentName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {String(s.dutyType).replace(/_/g, ' ')} · {new Date(s.shiftDate).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
              ))
            )}
          </SectionCard>
        </Grid>
      </Grid>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'right' }}>
        Last updated: {new Date(data.lastUpdated).toLocaleString()}
      </Typography>
    </Box>
  );
};

export default ExecutiveOperationsDashboard;
