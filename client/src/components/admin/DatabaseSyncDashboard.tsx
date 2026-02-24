import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Schedule,
  CheckCircle,
  Error,
  Warning,
  ExpandMore,
  Add,
  Edit,
  Delete,
  PlayArrow as PlayIcon,
  Pause
} from '@mui/icons-material';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

interface SyncStatus {
  realTime: {
    isRunning: boolean;
    lastSync: Date;
  };
  scheduled: {
    isRunning: boolean;
    totalSchedules: number;
    enabledSchedules: number;
    nextRun?: Date;
  };
  stats: {
    totalSynced: number;
    successCount: number;
    errorCount: number;
    lastSyncTime: Date;
    syncDuration: number;
    errors: Array<{ documentId: string; error: string; timestamp: Date }>;
  };
  timestamp: Date;
}

interface SyncSchedule {
  name: string;
  cronExpression: string;
  description: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  averageDuration: number;
}

interface SyncHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  realTime: {
    isRunning: boolean;
    lastSync: Date;
  };
  scheduled: {
    isRunning: boolean;
    totalSchedules: number;
    enabledSchedules: number;
    nextRun?: Date;
  };
  dataConsistency: {
    isConsistent: boolean;
    issueCount: number;
  };
  // Optional diagnostic hint (e.g., 'timeout') when computing health
  consistencyCheck?: string;
}

interface ConsistencyResult {
  isConsistent: boolean;
  inconsistencies: Array<{ type: string; description: string; count: number }>;
}

interface TrustBackfillResult {
  migrationName: string;
  dryRun: boolean;
  accountsCreated: number;
  transactionsCreated: number;
  skippedExisting: number;
  errors: Array<{ propertyId?: string; paymentId?: string; error: string }>;
  processedProperties: number;
  duration: number;
}

const DatabaseSyncDashboard: React.FC = () => {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncSchedules, setSyncSchedules] = useState<SyncSchedule[]>([]);
  const [syncHealth, setSyncHealth] = useState<SyncHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<SyncSchedule | null>(null);
  const [editScheduleDialog, setEditScheduleDialog] = useState(false);
  const [addScheduleDialog, setAddScheduleDialog] = useState(false);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    open: boolean;
    scheduleName: string;
  }>({ open: false, scheduleName: '' });
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    cronExpression: '',
    description: '',
    enabled: true
  });
  const [consistency, setConsistency] = useState<ConsistencyResult | null>(null);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [consistencyDialogOpen, setConsistencyDialogOpen] = useState(false);
  const [failures, setFailures] = useState<any[]>([]);
  const [failuresLoading, setFailuresLoading] = useState(false);
  const [failuresError, setFailuresError] = useState<string | null>(null);
  const [retryingFailureId, setRetryingFailureId] = useState<string | null>(null);
  const [backfillDialogOpen, setBackfillDialogOpen] = useState(false);
  const [backfillDryRun, setBackfillDryRun] = useState(true);
  const [backfillLimit, setBackfillLimit] = useState<number>(50);
  const [backfillResult, setBackfillResult] = useState<TrustBackfillResult | null>(null);
  const [backfillState, setBackfillState] = useState<any>(null);

  useEffect(() => {
    loadSyncData();
    const interval = setInterval(() => loadSyncData(true), 60000); // Background refresh every 60 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadBackfillState = async () => {
      try {
        if (!user || user.role !== 'admin') return;
        const res = await api.get('/admin/backfill-trust-accounts/state');
        setBackfillState((res as any)?.data?.data || null);
      } catch {
        setBackfillState(null);
      }
    };
    loadBackfillState();
  }, [user]);

  // Auto-start real-time sync when an authenticated admin/accountant visits the page
  useEffect(() => {
    const tryStartRealtime = async () => {
      try {
        // Only attempt for admin/accountant roles
        if (!user || !['admin', 'accountant'].includes(user.role)) return;

        // Check current status first to avoid redundant starts
        const statusRes = await api.get('/sync/status');
        const isRunning = Boolean(statusRes?.data?.data?.realTime?.isRunning);
        if (!isRunning) {
          await api.post('/sync/real-time/start');
          await loadSyncData();
        }
      } catch (e) {
        // Non-fatal: surface in UI error banner
        setError((e as any)?.message || 'Failed to auto-start real-time sync');
      }
    };
    tryStartRealtime();
    // Run this when user changes (e.g., impersonation) or on first mount
  }, [user?.role]);

  const loadSyncData = async (background: boolean = false) => {
    try {
      if (!background) setLoading(true);

      // Fast path: load status first
      const statusRes = await api.get('/sync/status');
      setSyncStatus(statusRes.data.data);
      setError(null);
      if (!background) setLoading(false);

      // Then load schedules and health without blocking initial paint
      setSchedulesLoading(true);
      setHealthLoading(true);
      try {
        setFailuresLoading(true);
        const [schedulesRes, healthRes, failuresRes] = await Promise.all([
          api.get('/sync/schedules'),
          api.get('/sync/health'),
          api.get('/sync/failures')
        ]);
        setSyncSchedules(schedulesRes.data.data);
        setSyncHealth(healthRes.data.data);
        setFailures(failuresRes.data.data || []);
        setFailuresError(null);
      } catch (e: any) {
        setError((e as any)?.message || 'Some sync data failed to load');
        setFailuresError((e as any)?.message || 'Failed to load failures');
      } finally {
        setSchedulesLoading(false);
        setHealthLoading(false);
        setFailuresLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sync data');
      if (!background) setLoading(false);
    }
  };

  const handleRealTimeSync = async (action: 'start' | 'stop') => {
    try {
      setActionLoading(`realTime_${action}`);
      await api.post(`/sync/real-time/${action}`);
      await loadSyncData();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} real-time sync`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFullSync = async () => {
    try {
      setActionLoading('fullSync');
      const prevLastSync = syncStatus?.stats?.lastSyncTime ? new Date(syncStatus.stats.lastSyncTime).getTime() : 0;
      const res = await api.post('/sync/full');
      // Begin polling status until full sync finishes or timeout
      const startedJobId = (res as any)?.data?.job?.id;
      const start = Date.now();
      const timeoutMs = 10 * 60 * 1000; // 10 minutes max
      const pollIntervalMs = 3000;
      const shouldStop = (statusData: any) => {
        const full = statusData?.fullSync;
        const stats = statusData?.stats;
        const inProgress = !!full?.inProgress;
        const completedAt = full?.completedAt ? new Date(full.completedAt).getTime() : 0;
        const lastSyncTime = stats?.lastSyncTime ? new Date(stats.lastSyncTime).getTime() : 0;
        const duration = Number(stats?.syncDuration || 0);
        // Stop when no longer in progress and either lastSync advanced or completedAt is set or duration > 0
        return (!inProgress) && ((lastSyncTime && lastSyncTime > prevLastSync) || !!completedAt || duration > 0);
      };
      // Immediate refresh
      await loadSyncData();
      // Poll loop
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - start > timeoutMs) break;
        await new Promise(r => setTimeout(r, pollIntervalMs));
        try {
          const statusRes = await api.get('/sync/status');
          const data = (statusRes as any)?.data?.data;
          if (data) {
            setSyncStatus(data);
            if (shouldStop(data)) break;
          }
        } catch {
          // ignore transient polling errors
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to perform full sync');
    } finally {
      setActionLoading(null);
    }
  };

  const handleScheduleAction = async (scheduleName: string, action: 'enable' | 'disable') => {
    try {
      setActionLoading(`schedule_${action}_${scheduleName}`);
      await api.post(`/sync/schedules/${scheduleName}/${action}`);
      await loadSyncData();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} schedule`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddSchedule = async () => {
    try {
      setActionLoading('addSchedule');
      await api.post('/sync/schedules', newSchedule);
      setAddScheduleDialog(false);
      setNewSchedule({ name: '', cronExpression: '', description: '', enabled: true });
      await loadSyncData();
    } catch (err: any) {
      setError(err.message || 'Failed to add schedule');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSchedule = async () => {
    if (!selectedSchedule) return;
    
    try {
      setActionLoading('editSchedule');
      await api.put(`/sync/schedules/${selectedSchedule.name}`, selectedSchedule);
      setEditScheduleDialog(false);
      setSelectedSchedule(null);
      await loadSyncData();
    } catch (err: any) {
      setError(err.message || 'Failed to update schedule');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSchedule = async (scheduleName: string) => {
    setDeleteConfirmDialog({ open: true, scheduleName });
  };

  const confirmDeleteSchedule = async () => {
    if (!deleteConfirmDialog.scheduleName) return;
    
    try {
      setActionLoading(`delete_${deleteConfirmDialog.scheduleName}`);
      await api.delete(`/sync/schedules/${deleteConfirmDialog.scheduleName}`);
      await loadSyncData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete schedule');
    } finally {
      setActionLoading(null);
    }
    setDeleteConfirmDialog({ open: false, scheduleName: '' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'success';
      case 'degraded': return 'warning';
      case 'unhealthy': return 'error';
      default: return 'default';
    }
  };

  const runConsistencyCheck = async () => {
    try {
      setConsistencyLoading(true);
      setConsistencyError(null);
      // Use a bounded lookback to avoid long-running checks in production
      const res = await api.get('/sync/consistency', { params: { lookbackDays: 14 } });
      setConsistency((res as any)?.data?.data || null);
      setConsistencyDialogOpen(true);
    } catch (e: any) {
      setConsistencyError(e?.message || 'Failed to run consistency check');
      setConsistency(null);
      setConsistencyDialogOpen(true);
    } finally {
      setConsistencyLoading(false);
    }
  };

  const handleRetryFailure = async (id: string) => {
    try {
      setRetryingFailureId(id);
      await api.post('/sync/failures/retry', { id });
      // refresh failures list
      const failuresRes = await api.get('/sync/failures');
      setFailures(failuresRes.data.data || []);
    } catch (e: any) {
      setFailuresError(e?.message || 'Failed to retry');
    } finally {
      setRetryingFailureId(null);
    }
  };

  const extractPaymentIdFromDescription = (desc: string): string | null => {
    try {
      const m = desc.match(/Payment\s+([a-f0-9]{24})/i);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  };

  const handleReconcilePayment = async (paymentId: string) => {
    try {
      setActionLoading(`reconcile_${paymentId}`);
      await api.post(`/sync/reconcile/payment/${paymentId}`);
      // Re-run consistency to reflect changes
      await runConsistencyCheck();
      // Also refresh status cards
      await loadSyncData(true);
    } catch (e: any) {
      setConsistencyError(e?.message || 'Failed to reconcile payment posting');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunTrustBackfill = async () => {
    try {
      setActionLoading('trustBackfill');
      setError(null);
      const payload = { dryRun: backfillDryRun, limit: Math.min(50, Math.max(1, Number(backfillLimit || 50))) };
      const res = await api.post('/admin/backfill-trust-accounts', payload);
      setBackfillResult((res as any)?.data?.data || null);
      setBackfillDialogOpen(false);
      const stateRes = await api.get('/admin/backfill-trust-accounts/state');
      setBackfillState((stateRes as any)?.data?.data || null);
    } catch (err: any) {
      setError(err.message || 'Failed to run trust account backfill');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  if (loading && !syncStatus && !syncHealth && (syncSchedules || []).length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Database Synchronization Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Health Status */}
      {syncHealth ? (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">System Health</Typography>
              <Chip
                label={syncHealth.status.toUpperCase()}
                color={getStatusColor(syncHealth.status) as any}
                icon={syncHealth.status === 'healthy' ? <CheckCircle /> : <Warning />}
              />
            </Box>
            {(syncHealth.status === 'degraded' || syncHealth.status === 'unhealthy') && (
              <Box sx={{ mt: 2 }}>
                <Alert severity={syncHealth.status === 'unhealthy' ? 'error' : 'warning'}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Why {syncHealth.status}:
                    </Typography>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {!syncHealth.realTime.isRunning && <li>Real-time sync is stopped</li>}
                      {syncHealth.scheduled.enabledSchedules === 0 && <li>No sync schedules are enabled</li>}
                      {(syncHealth.dataConsistency.issueCount || 0) > 0 && (
                        <li>{syncHealth.dataConsistency.issueCount} data consistency issue(s) detected</li>
                      )}
                      {syncHealth.consistencyCheck === 'timeout' && (
                        <li>Consistency check timed out; run a detailed check for specifics</li>
                      )}
                    </ul>
                  </Box>
                </Alert>
              </Box>
            )}
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                onClick={runConsistencyCheck}
                disabled={consistencyLoading}
                startIcon={consistencyLoading ? <CircularProgress size={16} /> : <Error />}
              >
                {consistencyLoading ? 'Checking…' : 'Check consistency'}
              </Button>
            </Box>
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">
                  Real-time Sync
                </Typography>
                <Typography variant="h6">
                  {syncHealth.realTime.isRunning ? 'Running' : 'Stopped'}
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">
                  Scheduled Sync
                </Typography>
                <Typography variant="h6">
                  {syncHealth.scheduled.enabledSchedules}/{syncHealth.scheduled.totalSchedules} Active
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">
                  Data Consistency
                </Typography>
                <Typography variant="h6">
                  {syncHealth.dataConsistency.issueCount} Issues
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      ) : healthLoading ? (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">System Health</Typography>
              <CircularProgress size={20} />
            </Box>
          </CardContent>
        </Card>
      ) : null}

      {/* Control Panel */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Control Panel
          </Typography>
          <Grid container spacing={2}>
            <Grid item>
              <Button
                variant="contained"
                color="primary"
                startIcon={<PlayArrow />}
                onClick={() => handleRealTimeSync('start')}
                disabled={syncStatus?.realTime.isRunning || actionLoading === 'realTime_start'}
              >
                {actionLoading === 'realTime_start' ? <CircularProgress size={20} /> : 'Start Real-time Sync'}
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<Stop />}
                onClick={() => handleRealTimeSync('stop')}
                disabled={!syncStatus?.realTime.isRunning || actionLoading === 'realTime_stop'}
              >
                {actionLoading === 'realTime_stop' ? <CircularProgress size={20} /> : 'Stop Real-time Sync'}
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={handleFullSync}
                disabled={actionLoading === 'fullSync'}
              >
                {actionLoading === 'fullSync' ? <CircularProgress size={20} /> : 'Full Sync Now'}
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={() => loadSyncData(false)}
                disabled={loading}
              >
                Refresh
              </Button>
            </Grid>
            {user?.role === 'admin' && (
              <Grid item>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<Schedule />}
                  onClick={() => setBackfillDialogOpen(true)}
                  disabled={actionLoading === 'trustBackfill'}
                >
                  {actionLoading === 'trustBackfill' ? <CircularProgress size={20} /> : 'Backfill Trust Accounts'}
                </Button>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {backfillState && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Trust Backfill Status
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Migration: {backfillState?.migrationName || 'trust_backfill_v1'} | Status: {String(backfillState?.status || 'idle').toUpperCase()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Processed: {Number(backfillState?.processedCount || 0)} | Last Processed ID: {backfillState?.lastProcessedId || 'N/A'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {backfillResult && (
        <Alert severity={backfillResult.errors.length ? 'warning' : 'success'} sx={{ mb: 3 }}>
          Trust backfill {backfillResult.dryRun ? 'dry-run' : 'run'} completed. Accounts: {backfillResult.accountsCreated}, Transactions: {backfillResult.transactionsCreated}, Skipped: {backfillResult.skippedExisting}, Errors: {backfillResult.errors.length}, Duration: {Math.round(backfillResult.duration / 1000)}s.
        </Alert>
      )}

      {/* Sync Statistics */}
      {syncStatus && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Synchronization Statistics
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="primary">
                    {syncStatus.stats.totalSynced}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Synced
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="success.main">
                    {syncStatus.stats.successCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Successful
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="error.main">
                    {syncStatus.stats.errorCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Errors
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="info.main">
                    {formatDuration(syncStatus.stats.syncDuration)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Duration
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Last Sync: {formatDate(syncStatus.stats.lastSyncTime)}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Sync Schedules */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Synchronization Schedules</Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setAddScheduleDialog(true)}
            >
              Add Schedule
            </Button>
          </Box>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Cron Expression</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Run</TableCell>
                  <TableCell>Next Run</TableCell>
                  <TableCell>Run Count</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {schedulesLoading && syncSchedules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Box display="flex" justifyContent="center"><CircularProgress size={20} /></Box>
                    </TableCell>
                  </TableRow>
                ) : (
                syncSchedules.map((schedule) => (
                  <TableRow key={schedule.name}>
                    <TableCell>{schedule.name}</TableCell>
                    <TableCell>{schedule.description}</TableCell>
                    <TableCell>
                      <Chip label={schedule.cronExpression} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={schedule.enabled ? 'Active' : 'Inactive'}
                        color={schedule.enabled ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {schedule.lastRun ? formatDate(schedule.lastRun) : 'Never'}
                    </TableCell>
                    <TableCell>
                      {schedule.nextRun ? formatDate(schedule.nextRun) : 'N/A'}
                    </TableCell>
                    <TableCell>{schedule.runCount}</TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Tooltip title={schedule.enabled ? 'Disable' : 'Enable'}>
                          <IconButton
                            size="small"
                            onClick={() => handleScheduleAction(schedule.name, schedule.enabled ? 'disable' : 'enable')}
                            disabled={actionLoading === `schedule_${schedule.enabled ? 'disable' : 'enable'}_${schedule.name}`}
                          >
                            {schedule.enabled ? <Pause /> : <PlayIcon />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedSchedule(schedule);
                              setEditScheduleDialog(true);
                            }}
                          >
                            <Edit />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteSchedule(schedule.name)}
                            disabled={actionLoading === `delete_${schedule.name}`}
                          >
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Sync Failures */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Sync Failures</Typography>
            <Button variant="text" onClick={async () => {
              try {
                setFailuresLoading(true);
                const failuresRes = await api.get('/sync/failures');
                setFailures(failuresRes.data.data || []);
                setFailuresError(null);
              } catch (e: any) {
                setFailuresError(e?.message || 'Failed to refresh failures');
              } finally {
                setFailuresLoading(false);
              }
            }}>
              Refresh
            </Button>
          </Box>
          {failuresError && <Alert severity="error" sx={{ mb: 2 }}>{failuresError}</Alert>}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Document</TableCell>
                  <TableCell>Error</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Attempts</TableCell>
                  <TableCell>Next Attempt</TableCell>
                  <TableCell>Last Error</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {failuresLoading && failures.length === 0 ? (
                  <TableRow><TableCell colSpan={8}><Box display="flex" justifyContent="center"><CircularProgress size={20} /></Box></TableCell></TableRow>
                ) : (failures || []).map((f: any) => (
                  <TableRow key={String(f._id)}>
                    <TableCell>{f.type}</TableCell>
                    <TableCell>{f.documentId}</TableCell>
                    <TableCell>{f.errorMessage}</TableCell>
                    <TableCell>{f.status}</TableCell>
                    <TableCell>{f.attemptCount}</TableCell>
                    <TableCell>{f.nextAttemptAt ? formatDate(f.nextAttemptAt) : '—'}</TableCell>
                    <TableCell>{f.lastErrorAt ? formatDate(f.lastErrorAt) : '—'}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleRetryFailure(String(f._id))}
                        disabled={retryingFailureId === String(f._id)}
                      >
                        {retryingFailureId === String(f._id) ? <CircularProgress size={16} /> : 'Retry'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(failures || []).length === 0 && !failuresLoading && (
                  <TableRow><TableCell colSpan={8}><Typography variant="body2" color="text.secondary">No failures found.</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Error Log */}
      {syncStatus && syncStatus.stats.errors.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Errors
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Document ID</TableCell>
                    <TableCell>Error</TableCell>
                    <TableCell>Timestamp</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {syncStatus.stats.errors.slice(0, 10).map((error, index) => (
                    <TableRow key={index}>
                      <TableCell>{error.documentId}</TableCell>
                      <TableCell>{error.error}</TableCell>
                      <TableCell>{formatDate(error.timestamp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Add Schedule Dialog */}
      <Dialog open={addScheduleDialog} onClose={() => setAddScheduleDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Synchronization Schedule</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Schedule Name"
              value={newSchedule.name}
              onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Cron Expression"
              value={newSchedule.cronExpression}
              onChange={(e) => setNewSchedule({ ...newSchedule, cronExpression: e.target.value })}
              placeholder="0 2 * * *"
              helperText="Format: minute hour day month dayOfWeek"
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Description"
              value={newSchedule.description}
              onChange={(e) => setNewSchedule({ ...newSchedule, description: e.target.value })}
              multiline
              rows={3}
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={newSchedule.enabled}
                  onChange={(e) => setNewSchedule({ ...newSchedule, enabled: e.target.checked })}
                />
              }
              label="Enable immediately"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddScheduleDialog(false)}>Cancel</Button>
          <Button
            onClick={handleAddSchedule}
            variant="contained"
            disabled={!newSchedule.name || !newSchedule.cronExpression || !newSchedule.description}
          >
            Add Schedule
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Schedule Dialog */}
      <Dialog open={editScheduleDialog} onClose={() => setEditScheduleDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Synchronization Schedule</DialogTitle>
        <DialogContent>
          {selectedSchedule && (
            <Box sx={{ pt: 2 }}>
              <TextField
                fullWidth
                label="Schedule Name"
                value={selectedSchedule.name}
                disabled
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Cron Expression"
                value={selectedSchedule.cronExpression}
                onChange={(e) => setSelectedSchedule({ ...selectedSchedule, cronExpression: e.target.value })}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Description"
                value={selectedSchedule.description}
                onChange={(e) => setSelectedSchedule({ ...selectedSchedule, description: e.target.value })}
                multiline
                rows={3}
                sx={{ mb: 2 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={selectedSchedule.enabled}
                    onChange={(e) => setSelectedSchedule({ ...selectedSchedule, enabled: e.target.checked })}
                  />
                }
                label="Enabled"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditScheduleDialog(false)}>Cancel</Button>
          <Button
            onClick={handleEditSchedule}
            variant="contained"
            disabled={!selectedSchedule?.cronExpression || !selectedSchedule?.description}
          >
            Update Schedule
          </Button>
                 </DialogActions>
       </Dialog>

      {/* Consistency Details Dialog */}
      <Dialog
        open={consistencyDialogOpen}
        onClose={() => setConsistencyDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Data Consistency Details</DialogTitle>
        <DialogContent dividers>
          {consistencyLoading && (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="120px">
              <CircularProgress />
            </Box>
          )}
          {!consistencyLoading && consistencyError && (
            <Alert severity="error">{consistencyError}</Alert>
          )}
          {!consistencyLoading && !consistencyError && consistency && (
            <Box>
              {consistency.isConsistent ? (
                <Alert severity="success">No inconsistencies detected.</Alert>
              ) : (
                <>
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    {consistency.inconsistencies.length} inconsistency item(s) found.
                  </Alert>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Type</TableCell>
                          <TableCell>Description (example)</TableCell>
                          <TableCell align="right">Count</TableCell>
                          <TableCell align="right">Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {consistency.inconsistencies.slice(0, 50).map((inc, idx) => {
                          const paymentId = (inc.type === 'missing_property_ledger_income' || inc.type === 'missing_company_commission')
                            ? extractPaymentIdFromDescription(inc.description)
                            : null;
                          const canReconcile = Boolean(paymentId);
                          const loadingKey = `reconcile_${paymentId}`;
                          return (
                            <TableRow key={`${inc.type}-${idx}`}>
                              <TableCell>{inc.type}</TableCell>
                              <TableCell>{inc.description}</TableCell>
                              <TableCell align="right">{inc.count}</TableCell>
                              <TableCell align="right">
                                {canReconcile ? (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleReconcilePayment(paymentId as string)}
                                    disabled={actionLoading === loadingKey}
                                  >
                                    {actionLoading === loadingKey ? <CircularProgress size={16} /> : 'Reconcile'}
                                  </Button>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">—</Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {consistency.inconsistencies.length > 50 && (
                    <Typography variant="caption" color="text.secondary">
                      Showing first 50 items…
                    </Typography>
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConsistencyDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

       {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmDialog.open} onClose={() => setDeleteConfirmDialog({ open: false, scheduleName: '' })}>
         <DialogTitle>Confirm Delete</DialogTitle>
         <DialogContent>
           <Typography>
             Are you sure you want to delete schedule '{deleteConfirmDialog.scheduleName}'?
           </Typography>
         </DialogContent>
         <DialogActions>
          <Button onClick={() => setDeleteConfirmDialog({ open: false, scheduleName: '' })}>
             Cancel
           </Button>
           <Button 
             onClick={confirmDeleteSchedule} 
             color="error" 
             variant="contained"
             disabled={actionLoading === `delete_${deleteConfirmDialog.scheduleName}`}
           >
             {actionLoading === `delete_${deleteConfirmDialog.scheduleName}` ? <CircularProgress size={20} /> : 'Delete'}
           </Button>
         </DialogActions>
       </Dialog>

      <Dialog open={backfillDialogOpen} onClose={() => setBackfillDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Backfill Trust Accounts</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This operation scans historical property sales/payments and creates missing trust accounts and ledger entries safely.
            </Alert>
            <FormControlLabel
              control={<Switch checked={backfillDryRun} onChange={(e) => setBackfillDryRun(e.target.checked)} />}
              label="Dry run (simulate only, no writes)"
            />
            <TextField
              label="Batch limit (max 50)"
              type="number"
              fullWidth
              value={backfillLimit}
              onChange={(e) => setBackfillLimit(Number(e.target.value || 50))}
              inputProps={{ min: 1, max: 50 }}
              sx={{ mt: 2 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBackfillDialogOpen(false)} disabled={actionLoading === 'trustBackfill'}>
            Cancel
          </Button>
          <Button onClick={handleRunTrustBackfill} variant="contained" color="warning" disabled={actionLoading === 'trustBackfill'}>
            {actionLoading === 'trustBackfill' ? <CircularProgress size={20} /> : backfillDryRun ? 'Run Dry Run' : 'Run Backfill'}
          </Button>
        </DialogActions>
      </Dialog>
     </Box>
   );
 };

export default DatabaseSyncDashboard;
