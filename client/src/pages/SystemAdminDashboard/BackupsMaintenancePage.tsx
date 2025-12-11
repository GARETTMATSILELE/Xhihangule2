import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Stack,
  Alert
} from '@mui/material';
import systemAdminService from '../../services/systemAdminService';

const BackupsMaintenancePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [backupRunning, setBackupRunning] = useState(false);
  const [reconcileRunning, setReconcileRunning] = useState(false);
  const [ledgerRunning, setLedgerRunning] = useState(false);
  const [backups, setBackups] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await systemAdminService.listBackups().catch(() => ({ data: [] }));
      setBackups(Array.isArray((resp as any)?.data) ? (resp as any).data : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const runBackup = async () => {
    setBackupRunning(true);
    setMessage(null);
    setError(null);
    try {
      await systemAdminService.runBackup();
      setMessage('Backup completed');
      await fetchBackups();
    } catch (e: any) {
      setError(e?.message || 'Backup failed');
    } finally {
      setBackupRunning(false);
    }
  };

  const runReconcile = async () => {
    setReconcileRunning(true);
    setMessage(null);
    setError(null);
    try {
      await systemAdminService.reconcile(true);
      setMessage('Reconcile (dry-run) completed');
    } catch (e: any) {
      setError(e?.message || 'Reconcile failed');
    } finally {
      setReconcileRunning(false);
    }
  };

  const runLedger = async () => {
    setLedgerRunning(true);
    setMessage(null);
    setError(null);
    try {
      await systemAdminService.ledgerMaintenance({ dryRun: true });
      setMessage('Ledger maintenance (dry-run) completed');
    } catch (e: any) {
      setError(e?.message || 'Ledger maintenance failed');
    } finally {
      setLedgerRunning(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#051F20', fontWeight: 700 }}>Backups & Maintenance</Typography>
        <Typography variant="body2" color="text.secondary">
          Manage backups and run safe maintenance tasks
        </Typography>
      </Box>
      {message && <Alert sx={{ mb: 2 }} severity="success">{message}</Alert>}
      {error && <Alert sx={{ mb: 2 }} severity="error">{error}</Alert>}
      <Stack spacing={2}>
        <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ color: '#051F20', fontWeight: 700 }}>Backups</Typography>
              <Button variant="contained" onClick={runBackup} disabled={backupRunning}>
                {backupRunning ? 'Running...' : 'Run Backup'}
              </Button>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(backups || []).map((b: any) => (
                  <TableRow key={String(b._id)}>
                    <TableCell>{new Date(b.createdAt || b.startedAt).toLocaleString()}</TableCell>
                    <TableCell>{b.provider}</TableCell>
                    <TableCell>{typeof b.sizeBytes === 'number' ? `${Math.round(b.sizeBytes/1024/1024)} MB` : '-'}</TableCell>
                    <TableCell>{b.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ color: '#051F20', fontWeight: 700 }}>Maintenance</Typography>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={runReconcile} disabled={reconcileRunning}>
                  {reconcileRunning ? 'Running...' : 'Reconcile (dry-run)'}
                </Button>
                <Button variant="outlined" onClick={runLedger} disabled={ledgerRunning}>
                  {ledgerRunning ? 'Running...' : 'Ledger (dry-run)'}
                </Button>
              </Stack>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Run dry-run operations first. Apply mode can be added later.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default BackupsMaintenancePage;


