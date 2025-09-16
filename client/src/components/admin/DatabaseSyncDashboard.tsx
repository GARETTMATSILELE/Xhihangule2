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
}

const DatabaseSyncDashboard: React.FC = () => {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncSchedules, setSyncSchedules] = useState<SyncSchedule[]>([]);
  const [syncHealth, setSyncHealth] = useState<SyncHealth | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadSyncData();
    const interval = setInterval(loadSyncData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

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

  const loadSyncData = async () => {
    try {
      setLoading(true);
      const [statusRes, schedulesRes, healthRes] = await Promise.all([
        api.get('/sync/status'),
        api.get('/sync/schedules'),
        api.get('/sync/health')
      ]);

      setSyncStatus(statusRes.data.data);
      setSyncSchedules(schedulesRes.data.data);
      setSyncHealth(healthRes.data.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load sync data');
    } finally {
      setLoading(false);
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
      await api.post('/sync/full');
      await loadSyncData();
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

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  if (loading) {
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
      {syncHealth && (
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
      )}

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
                onClick={loadSyncData}
                disabled={loading}
              >
                Refresh
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

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
                {syncSchedules.map((schedule) => (
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
                ))}
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
     </Box>
   );
 };

export default DatabaseSyncDashboard;
