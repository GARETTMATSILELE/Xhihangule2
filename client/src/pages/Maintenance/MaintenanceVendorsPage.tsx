import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Paper, Grid, TextField, MenuItem, Stack, Chip,
  CircularProgress, Alert, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import maintenanceManagementService from '../../services/maintenanceManagementService';
import { MaintenanceContractor } from '../../types/maintenanceManagement';

const TRADES = [
  'Plumber', 'Electrician', 'Builder', 'Painter', 'Pool Technician',
  'Landscaper', 'Carpenter', 'General Contractor', 'Other',
];

export const MaintenanceVendorsPage: React.FC = () => {
  const [contractors, setContractors] = useState<MaintenanceContractor[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    companyName: '', contactPerson: '', phone: '', email: '', trade: 'General Contractor', address: '', notes: '',
  });

  const load = async () => {
    try {
      setLoading(true);
      const [list, perf] = await Promise.all([
        maintenanceManagementService.getContractors(),
        maintenanceManagementService.getContractorPerformance(),
      ]);
      setContractors(list);
      setPerformance(perf);
    } catch {
      setError('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    await maintenanceManagementService.createContractor(form);
    setDialogOpen(false);
    setForm({ companyName: '', contactPerson: '', phone: '', email: '', trade: 'General Contractor', address: '', notes: '' });
    await load();
  };

  const perfMap = new Map(performance.map((p) => [String(p.contractor._id), p]));

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Maintenance Vendors</Typography>
          <Typography color="text.secondary">Contractor directory and performance tracking</Typography>
        </Box>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>Add Vendor</Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {performance.slice(0, 4).map((p) => (
          <Grid item xs={12} sm={6} md={3} key={p.contractor._id}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={700}>{p.contractor.companyName}</Typography>
              <Typography variant="caption" color="text.secondary">{p.contractor.trade}</Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <Typography variant="body2">Jobs completed: {p.jobsCompleted}</Typography>
                <Typography variant="body2">Avg completion: {p.averageCompletionDays} days</Typography>
                <Typography variant="body2">Total value: ${p.totalValueOfJobs.toLocaleString()}</Typography>
                <Typography variant="body2">Open jobs: {p.openJobs}</Typography>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Company</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Trade</TableCell>
              <TableCell>Rating</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Jobs</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contractors.map((c) => {
              const perf = perfMap.get(c._id);
              return (
                <TableRow key={c._id}>
                  <TableCell>{c.companyName}</TableCell>
                  <TableCell>{c.contactPerson}<br /><Typography variant="caption">{c.phone}</Typography></TableCell>
                  <TableCell>{c.trade}</TableCell>
                  <TableCell>{c.rating}/5</TableCell>
                  <TableCell><Chip size="small" label={c.active ? 'Active' : 'Inactive'} color={c.active ? 'success' : 'default'} /></TableCell>
                  <TableCell>{perf?.jobsCompleted ?? 0} done / {perf?.openJobs ?? 0} open</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Maintenance Vendor</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {[
              { key: 'companyName', label: 'Company Name' },
              { key: 'contactPerson', label: 'Contact Person' },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
              { key: 'address', label: 'Address' },
            ].map(({ key, label }) => (
              <Grid item xs={12} sm={6} key={key}>
                <TextField fullWidth label={label} value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </Grid>
            ))}
            <Grid item xs={12} sm={6}>
              <TextField select fullWidth label="Trade" value={form.trade}
                onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))}>
                {TRADES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline rows={2} label="Notes" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MaintenanceVendorsPage;
