import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Button, Grid, Paper, CircularProgress, Alert, Chip, Stack,
  TextField, MenuItem, Card, CardContent, Drawer, Divider, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, LinearProgress, Tooltip,
} from '@mui/material';
import {
  Build as BuildIcon, PendingActions as PendingIcon, Payment as PaymentIcon,
  Engineering as EngineeringIcon, CheckCircle as CheckIcon, Timer as TimerIcon,
  Close as CloseIcon, PhotoCamera as PhotoIcon, Assignment as WorkOrderIcon,
  PersonSearch as ContractorIcon, Verified as VerifiedIcon, Download as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { useMaintenance } from '../../hooks/maintenance';
import { MaintenanceRequestForm } from './MaintenanceRequestForm';
import { User } from '../../types/auth';
import paymentRequestService from '../../services/paymentRequestService';
import maintenanceManagementService from '../../services/maintenanceManagementService';
import {
  MaintenanceDashboardData,
  MaintenanceRequestExtended,
  STATUS_COLORS,
  MaintenanceContractor,
  MaintenanceActivityItem,
  MaintenancePhoto,
  MaintenanceQuote,
  MaintenanceWorkOrder,
} from '../../types/maintenanceManagement';
import { statusLabel, normalizeStatus, isOwnerApproved } from '../../types/maintenanceManagement';
import { apiService } from '../../api';

interface CompanyInfo { _id: string; name: string; }

interface MaintenanceWorkspaceProps {
  user?: User;
  company?: CompanyInfo;
  isAuthenticated: boolean;
  authLoading: boolean;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b'];

const softCardSx = {
  borderRadius: 3,
  border: '1px solid rgba(15, 23, 42, 0.07)',
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
  height: '100%',
};

const KpiCard = ({ title, value, icon, color, loading }: {
  title: string; value: string | number; icon: React.ReactNode; color: string; loading?: boolean;
}) => (
  <Card sx={softCardSx}>
    <CardContent sx={{ p: 2.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>{title}</Typography>
          {loading ? <CircularProgress size={22} sx={{ mt: 1 }} /> : (
            <Typography variant="h4" fontWeight={800} sx={{ mt: 0.5, letterSpacing: '-0.03em' }}>{value}</Typography>
          )}
        </Box>
        <Box sx={{ bgcolor: `${color}18`, color, p: 1, borderRadius: 2 }}>{icon}</Box>
      </Stack>
    </CardContent>
  </Card>
);

function getPropertyName(propertyId: any): string {
  if (!propertyId) return 'Unknown property';
  if (typeof propertyId === 'string') return propertyId;
  return propertyId.name || 'Property';
}

function getContractorName(contractorId: any): string {
  if (!contractorId) return '—';
  if (typeof contractorId === 'string') return contractorId;
  return contractorId.companyName || '—';
}

export const MaintenanceWorkspace: React.FC<MaintenanceWorkspaceProps> = ({ user }) => {
  const { requests, loading, error, updateRequest, fetchRequests } = useMaintenance(user);
  const [dashboard, setDashboard] = useState<MaintenanceDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MaintenanceRequestExtended | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timeline, setTimeline] = useState<MaintenanceActivityItem[]>([]);
  const [photos, setPhotos] = useState<MaintenancePhoto[]>([]);
  const [quotes, setQuotes] = useState<MaintenanceQuote[]>([]);
  const [workOrder, setWorkOrder] = useState<MaintenanceWorkOrder | null>(null);
  const [contractors, setContractors] = useState<MaintenanceContractor[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteDesc, setQuoteDesc] = useState('');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyOutcome, setVerifyOutcome] = useState<'Tenant Confirmed' | 'Tenant Rejected' | 'Unable To Reach'>('Tenant Confirmed');
  const [verifyComments, setVerifyComments] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: '', priority: '', propertyId: '', contractorId: '', dateFrom: '', dateTo: '',
  });

  const loadDashboard = useCallback(async () => {
    try {
      setDashboardLoading(true);
      const data = await maintenanceManagementService.getDashboard();
      setDashboard(data);
    } catch (e) {
      console.error('Dashboard load failed', e);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const propertyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) {
      const pid = typeof r.propertyId === 'object' ? (r.propertyId as any)?._id : r.propertyId;
      if (pid) map.set(String(pid), getPropertyName(r.propertyId));
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (!r._id) return false;
      const ns = normalizeStatus(r.status);
      if (filters.status && ns !== filters.status && r.status !== filters.status) return false;
      if (filters.priority && r.priority !== filters.priority) return false;
      const pid = typeof r.propertyId === 'object' ? (r.propertyId as any)?._id : r.propertyId;
      if (filters.propertyId && String(pid) !== filters.propertyId) return false;
      const cid = typeof r.contractorId === 'object' ? (r.contractorId as any)?._id : r.contractorId;
      if (filters.contractorId && String(cid) !== filters.contractorId) return false;
      const created = r.createdAt ? new Date(r.createdAt) : null;
      if (filters.dateFrom && created && created < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && created) {
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        if (created > end) return false;
      }
      return true;
    });
  }, [requests, filters]);

  const openDetail = async (request: MaintenanceRequestExtended) => {
    setSelected(request);
    setDetailLoading(true);
    try {
      const [bundle, contractorList] = await Promise.all([
        maintenanceManagementService.getDetailBundle(request._id),
        maintenanceManagementService.getContractors({ active: true }),
      ]);
      setSelected(bundle.request);
      setTimeline(bundle.timeline || []);
      setPhotos(bundle.photos || []);
      setQuotes(bundle.quotes || []);
      setWorkOrder(bundle.workOrder || null);
      setContractors(contractorList);
    } catch (e) {
      console.error('Detail load failed', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!selected) return;
    await openDetail(selected);
    await fetchRequests();
    await loadDashboard();
  };

  const handleSendToOwner = async (request: MaintenanceRequestExtended) => {
    try {
      setSubmittingId(request._id);
      await updateRequest(request._id, { status: 'awaiting_approval' as any });
      await fetchRequests();
      setActionSuccess('Sent to owner for approval.');
    } catch {
      setActionError('Failed to send to owner.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handlePaymentRequest = async (request: MaintenanceRequestExtended) => {
    const amount = Number(request.estimatedCost || 0);
    if (!amount) {
      setActionError('Set an estimated cost before requesting payment.');
      return;
    }
    try {
      setSubmittingId(request._id);
      const pr = await paymentRequestService.createPaymentRequest({
        propertyId: typeof request.propertyId === 'string' ? request.propertyId : (request.propertyId as any)?._id,
        amount,
        currency: 'USD',
        reason: `Maintenance: ${request.title}`,
        notes: `Generated from maintenance request ${request._id}`,
        maintenanceRequestId: request._id,
        payTo: { name: user?.firstName || 'Maintenance', surname: user?.lastName || 'Vendor' },
      });
      await updateRequest(request._id, { status: 'awaiting_payment' as any });
      if (pr?._id) {
        await apiService.updateMaintenanceRequest(request._id, {
          paymentRequestId: pr._id,
        } as any);
      }
      await fetchRequests();
      setActionSuccess('Payment request sent to accountant.');
    } catch {
      setActionError('Failed to send payment request.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleGenerateWorkOrder = async () => {
    if (!selected) return;
    try {
      setSubmittingId(selected._id);
      await maintenanceManagementService.createWorkOrder(selected._id, { targetCompletionDate: targetDate || undefined });
      await refreshDetail();
      setActionSuccess('Work order generated.');
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'Failed to generate work order.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleAssignContractor = async () => {
    if (!selected || !selectedContractor) return;
    try {
      setSubmittingId(selected._id);
      await maintenanceManagementService.assignContractor({
        maintenanceRequestId: selected._id,
        contractorId: selectedContractor,
        targetCompletionDate: targetDate || undefined,
        workOrderId: workOrder?._id,
      });
      setAssignOpen(false);
      await refreshDetail();
      setActionSuccess('Contractor assigned.');
    } catch {
      setActionError('Failed to assign contractor.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handlePhotoUpload = async (type: 'BEFORE' | 'AFTER', file: File) => {
    if (!selected) return;
    const formData = new FormData();
    formData.append('files', file);
    const uploadRes = await apiService.uploadFiles(formData);
    const uploaded = uploadRes.data[0];
    await maintenanceManagementService.uploadPhoto(selected._id, {
      type,
      fileUrl: uploaded.url,
      fileName: uploaded.name,
      mimeType: uploaded.type,
    });
    await refreshDetail();
  };

  const handleAddQuote = async () => {
    if (!selected) return;
    await maintenanceManagementService.addQuotation(selected._id, {
      amount: Number(quoteAmount),
      description: quoteDesc,
    });
    setQuoteOpen(false);
    setQuoteAmount('');
    setQuoteDesc('');
    await refreshDetail();
  };

  const handleVerification = async () => {
    if (!selected) return;
    await maintenanceManagementService.recordVerification(selected._id, {
      outcome: verifyOutcome,
      comments: verifyComments,
    });
    setVerifyOpen(false);
    await refreshDetail();
  };

  const handleScheduleFollowUp = async () => {
    if (!selected) return;
    try {
      setSubmittingId(selected._id);
      await maintenanceManagementService.scheduleFollowUpInspection(selected._id, {
        notes: `Follow-up for completed maintenance: ${selected.title}`,
      });
      await refreshDetail();
      setActionSuccess('Follow-up inspection scheduled.');
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'Failed to schedule follow-up inspection.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleWorkOrderStatus = async (status: string) => {
    if (!selected || !workOrder) return;
    try {
      setSubmittingId(selected._id);
      await maintenanceManagementService.updateWorkOrderStatus(selected._id, workOrder._id, status);
      await refreshDetail();
    } catch {
      setActionError('Failed to update work order status.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading && !requests.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  const kpis = dashboard?.kpis;

  return (
    <Box sx={{ width: '100%' }}>
      {actionError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>{actionError}</Alert>}
      {actionSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionSuccess(null)}>{actionSuccess}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Maintenance Management</Typography>
          <Typography color="text.secondary">Operational workspace for property repairs and vendor coordination</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<RefreshIcon />} onClick={() => { fetchRequests(); loadDashboard(); }}>Refresh</Button>
          <Button variant="contained" onClick={() => setShowForm(true)}>New Request</Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: 'Open Requests', value: kpis?.openRequests ?? '—', icon: <BuildIcon />, color: '#3b82f6' },
          { title: 'Awaiting Approval', value: kpis?.awaitingApproval ?? '—', icon: <PendingIcon />, color: '#f59e0b' },
          { title: 'Awaiting Payment', value: kpis?.awaitingPayment ?? '—', icon: <PaymentIcon />, color: '#ef4444' },
          { title: 'In Progress', value: kpis?.inProgress ?? '—', icon: <EngineeringIcon />, color: '#8b5cf6' },
          { title: 'Completed This Month', value: kpis?.completedThisMonth ?? '—', icon: <CheckIcon />, color: '#10b981' },
          { title: 'Avg Resolution (days)', value: kpis?.averageResolutionDays ?? '—', icon: <TimerIcon />, color: '#06b6d4' },
        ].map((k) => (
          <Grid item xs={6} md={4} lg={2} key={k.title}>
            <KpiCard {...k} loading={dashboardLoading} />
          </Grid>
        ))}
      </Grid>

      {dashboard && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6} lg={3}>
            <Paper sx={{ p: 2, ...softCardSx }}>
              <Typography variant="subtitle2" gutterBottom>Requests by Status</Typography>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={dashboard.charts.requestsByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={60}
                    label={(e) => statusLabel(e.status)}>
                    {dashboard.charts.requestsByStatus.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v, _n, p: any) => [v, statusLabel(p.payload.status)]} />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <Paper sx={{ p: 2, ...softCardSx }}>
              <Typography variant="subtitle2" gutterBottom>Requests by Category</Typography>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dashboard.charts.requestsByCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <Paper sx={{ p: 2, ...softCardSx }}>
              <Typography variant="subtitle2" gutterBottom>Monthly Maintenance Spend</Typography>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={dashboard.charts.monthlyMaintenanceSpend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `$${v}`} />
                  <RechartsTooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Spend']} />
                  <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <Paper sx={{ p: 2, ...softCardSx }}>
              <Typography variant="subtitle2" gutterBottom>Top Properties by Cost</Typography>
              <Stack spacing={1} sx={{ maxHeight: 180, overflow: 'auto' }}>
                {dashboard.charts.topPropertiesByCost.slice(0, 5).map((p) => (
                  <Stack key={p.propertyId} direction="row" justifyContent="space-between">
                    <Typography variant="body2" noWrap sx={{ maxWidth: '60%' }}>{p.propertyName}</Typography>
                    <Typography variant="body2" fontWeight={700}>${p.cost.toLocaleString()}</Typography>
                  </Stack>
                ))}
                {!dashboard.charts.topPropertiesByCost.length && (
                  <Typography variant="body2" color="text.secondary">No spend data yet</Typography>
                )}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Filters</Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth size="small" label="Status" value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <MenuItem value="">All</MenuItem>
              {['draft', 'awaiting_approval', 'approved', 'awaiting_payment', 'funded', 'assigned', 'in_progress', 'completed', 'verified', 'closed', 'rejected'].map((s) => (
                <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth size="small" label="Priority" value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
              <MenuItem value="">All</MenuItem>
              {['low', 'medium', 'high'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField select fullWidth size="small" label="Property" value={filters.propertyId}
              onChange={(e) => setFilters((f) => ({ ...f, propertyId: e.target.value }))}>
              <MenuItem value="">All</MenuItem>
              {propertyOptions.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField type="date" fullWidth size="small" label="From" InputLabelProps={{ shrink: true }}
              value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField type="date" fullWidth size="small" label="To" InputLabelProps={{ shrink: true }}
              value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          </Grid>
        </Grid>
      </Paper>

      <Stack spacing={2}>
        {filteredRequests.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No maintenance requests match your filters.</Typography>
          </Paper>
        ) : filteredRequests.map((request) => {
          const ns = normalizeStatus(request.status);
          const lastActivity = request.lastActivityAt || request.updatedAt || request.createdAt || '';
          return (
            <Paper key={request._id} sx={{ p: 2, cursor: 'pointer', '&:hover': { borderColor: 'primary.light' } }}
              onClick={() => openDetail(request)}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={3}>
                  <Typography variant="subtitle1" fontWeight={700}>{request.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{getPropertyName(request.propertyId)}</Typography>
                </Grid>
                <Grid item xs={6} md={1}>
                  <Chip size="small" label={request.priority} color={request.priority === 'high' ? 'error' : 'default'} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <Chip size="small" label={statusLabel(request.status)} color={STATUS_COLORS[ns] || 'default'} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <Typography variant="body2" color="text.secondary">Contractor</Typography>
                  <Typography variant="body2">{getContractorName(request.contractorId)}</Typography>
                </Grid>
                <Grid item xs={6} md={1}>
                  <Typography variant="body2" color="text.secondary">Cost</Typography>
                  <Typography variant="body2" fontWeight={600}>${Number(request.paidAmount || request.estimatedCost || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={12} md={2}>
                  <Typography variant="caption" color="text.secondary">
                    Last activity: {new Date(lastActivity).toLocaleString()}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={1} onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {['draft', 'pending'].includes(ns) && (
                      <Button size="small" variant="outlined" disabled={submittingId === request._id}
                        onClick={() => handleSendToOwner(request)}>Owner</Button>
                    )}
                    {isOwnerApproved(request.status) && !['funded', 'assigned', 'in_progress', 'completed', 'verified', 'closed'].includes(ns) && (
                      <Button size="small" variant="contained" disabled={submittingId === request._id}
                        onClick={() => handlePaymentRequest(request)}>Pay</Button>
                    )}
                  </Stack>
                </Grid>
              </Grid>
            </Paper>
          );
        })}
      </Stack>

      <Drawer anchor="right" open={!!selected} onClose={() => setSelected(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 520 } } }}>
        {selected && (
          <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>{selected.title}</Typography>
              <IconButton onClick={() => setSelected(null)}><CloseIcon /></IconButton>
            </Stack>
            {detailLoading && <LinearProgress sx={{ mb: 2 }} />}
            <Chip label={statusLabel(selected.status)} color={STATUS_COLORS[normalizeStatus(selected.status)] || 'default'} sx={{ mb: 1 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{selected.description}</Typography>

            <Grid container spacing={1} sx={{ mb: 2 }}>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Property</Typography><Typography variant="body2">{getPropertyName(selected.propertyId)}</Typography></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Priority</Typography><Typography variant="body2">{selected.priority}</Typography></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Requested</Typography><Typography variant="body2">${Number(selected.requestedAmount || selected.estimatedCost || 0).toLocaleString()}</Typography></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Paid</Typography><Typography variant="body2">${Number(selected.paidAmount || 0).toLocaleString()}</Typography></Grid>
              {workOrder && (
                <Grid item xs={12}><Typography variant="caption" color="text.secondary">Work Order</Typography><Typography variant="body2" fontWeight={700}>{workOrder.workOrderNumber}</Typography></Grid>
              )}
            </Grid>

            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              {!workOrder && isOwnerApproved(selected.status) && (
                <Button size="small" startIcon={<WorkOrderIcon />} variant="contained" onClick={handleGenerateWorkOrder}>Generate Work Order</Button>
              )}
              <Button size="small" startIcon={<ContractorIcon />} variant="outlined" onClick={() => setAssignOpen(true)}>Assign Contractor</Button>
              <Button size="small" startIcon={<PhotoIcon />} component="label">
                Problem Photo
                <input hidden type="file" accept="image/*,.pdf" onChange={(e) => e.target.files?.[0] && handlePhotoUpload('BEFORE', e.target.files[0])} />
              </Button>
              <Button size="small" startIcon={<PhotoIcon />} component="label">
                Completion Photo
                <input hidden type="file" accept="image/*,.pdf" onChange={(e) => e.target.files?.[0] && handlePhotoUpload('AFTER', e.target.files[0])} />
              </Button>
              <Button size="small" onClick={() => setQuoteOpen(true)}>Add Quote</Button>
              {normalizeStatus(selected.status) === 'completed' && (
                <Button size="small" startIcon={<VerifiedIcon />} onClick={() => setVerifyOpen(true)}>Verify</Button>
              )}
              {['completed', 'verified', 'closed'].includes(normalizeStatus(selected.status)) && !selected.followUpInspectionId && (
                <Button size="small" onClick={handleScheduleFollowUp}>Schedule Follow-Up Inspection</Button>
              )}
              {workOrder && workOrder.status === 'Assigned' && (
                <Button size="small" onClick={() => handleWorkOrderStatus('In Progress')}>Start Work</Button>
              )}
              {workOrder && workOrder.status === 'In Progress' && (
                <Button size="small" onClick={() => handleWorkOrderStatus('Completed')}>Complete Work</Button>
              )}
              {['verified', 'completed'].includes(normalizeStatus(selected.status)) && (
                <Button size="small" onClick={async () => { await maintenanceManagementService.closeRequest(selected._id); await refreshDetail(); }}>Close</Button>
              )}
              <Tooltip title="Download maintenance report">
                <IconButton size="small" component="a" href={maintenanceManagementService.getDocumentUrl(selected._id, 'maintenance-report')} target="_blank">
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>Activity Timeline</Typography>
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {timeline.map((item) => (
                <Box key={item._id} sx={{ pl: 1.5, borderLeft: '2px solid', borderColor: 'divider' }}>
                  <Typography variant="body2" fontWeight={600}>{item.action}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.description}</Typography>
                  <Typography variant="caption" display="block" color="text.secondary">{new Date(item.createdAt).toLocaleString()}</Typography>
                </Box>
              ))}
              {!timeline.length && <Typography variant="body2" color="text.secondary">No activity yet</Typography>}
            </Stack>

            <Typography variant="subtitle2" gutterBottom>Problem Photos</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              {photos.filter((p) => p.type === 'BEFORE').map((p) => (
                <Box key={p._id} component="img" src={p.fileUrl} alt={p.fileName}
                  sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, cursor: 'pointer' }}
                  onClick={() => setPreviewUrl(p.fileUrl)} />
              ))}
            </Stack>

            <Typography variant="subtitle2" gutterBottom>Completion Photos</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              {photos.filter((p) => p.type === 'AFTER').map((p) => (
                <Box key={p._id} component="img" src={p.fileUrl} alt={p.fileName}
                  sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, cursor: 'pointer' }}
                  onClick={() => setPreviewUrl(p.fileUrl)} />
              ))}
            </Stack>

            {quotes.length > 0 && (
              <>
                <Typography variant="subtitle2" gutterBottom>Quotations</Typography>
                {quotes.map((q) => (
                  <Paper key={q._id} variant="outlined" sx={{ p: 1, mb: 1 }}>
                    <Typography variant="body2" fontWeight={600}>${q.amount.toLocaleString()} — {q.description}</Typography>
                  </Paper>
                ))}
              </>
            )}
          </Box>
        )}
      </Drawer>

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Contractor</DialogTitle>
        <DialogContent>
          <TextField select fullWidth label="Contractor" sx={{ mt: 1, mb: 2 }} value={selectedContractor}
            onChange={(e) => setSelectedContractor(e.target.value)}>
            {contractors.map((c) => <MenuItem key={c._id} value={c._id}>{c.companyName} ({c.trade})</MenuItem>)}
          </TextField>
          <TextField type="date" fullWidth label="Expected Completion" InputLabelProps={{ shrink: true }}
            value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssignContractor}>Assign</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={quoteOpen} onClose={() => setQuoteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Quotation</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Amount" type="number" sx={{ mt: 1, mb: 2 }} value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} />
          <TextField fullWidth multiline rows={3} label="Description" value={quoteDesc} onChange={(e) => setQuoteDesc(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuoteOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddQuote}>Save Quote</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={verifyOpen} onClose={() => setVerifyOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tenant Verification</DialogTitle>
        <DialogContent>
          <TextField select fullWidth label="Outcome" sx={{ mt: 1, mb: 2 }} value={verifyOutcome}
            onChange={(e) => setVerifyOutcome(e.target.value as any)}>
            {['Tenant Confirmed', 'Tenant Rejected', 'Unable To Reach'].map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </TextField>
          <TextField fullWidth multiline rows={3} label="Comments" value={verifyComments} onChange={(e) => setVerifyComments(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVerifyOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleVerification}>Record</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!previewUrl} onClose={() => setPreviewUrl(null)} maxWidth="md">
        {previewUrl && <Box component="img" src={previewUrl} alt="Preview" sx={{ maxWidth: '100%', maxHeight: '80vh' }} />}
      </Dialog>

      <MaintenanceRequestForm open={showForm} onClose={() => { setShowForm(false); fetchRequests(); loadDashboard(); }} />
    </Box>
  );
};

export default MaintenanceWorkspace;
