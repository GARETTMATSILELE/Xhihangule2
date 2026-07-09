import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { viewingService, ViewingDTO, CreateViewingInput } from '../../services/viewingService';
import { leadService, LeadDTO } from '../../services/leadService';
import api from '../../api/axios';

const localizer = momentLocalizer(moment);

const STATUS_OPTIONS = ['Scheduled', 'Completed', 'Rescheduled', 'Cancelled', 'No Show'] as const;
const OUTCOME_OPTIONS = ['Interested', 'Not Interested', 'Need Follow-Up', 'Applied'] as const;

const AdminViewingsPage: React.FC = () => {
  const [viewings, setViewings] = useState<ViewingDTO[]>([]);
  const [leads, setLeads] = useState<LeadDTO[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<CreateViewingInput>>({ status: 'Scheduled' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, l, p] = await Promise.all([
        viewingService.list(),
        leadService.list(),
        api.get('/properties').then((r) => (Array.isArray(r.data) ? r.data : r.data?.data || [])),
      ]);
      setViewings(Array.isArray(v) ? v : []);
      setLeads(Array.isArray(l) ? l : []);
      setProperties(Array.isArray(p) ? p : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load viewings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const calendarEvents = useMemo(
    () =>
      viewings.map((v) => ({
        id: v._id,
        title: `Viewing · ${properties.find((p) => String(p._id) === String(v.propertyId))?.name || 'Property'}`,
        start: new Date(v.when),
        end: new Date(new Date(v.when).getTime() + 60 * 60 * 1000),
        resource: v,
      })),
    [viewings, properties]
  );

  const handleSave = async () => {
    if (!form.propertyId || !form.when) return;
    await viewingService.create(form as CreateViewingInput);
    setDialogOpen(false);
    setForm({ status: 'Scheduled' });
    load();
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Viewings Management</Typography>
          <Typography variant="body2" color="text.secondary">Schedule, conduct, and track property viewings</Typography>
        </Box>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>Schedule Viewing</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Calendar" />
        <Tab label="List" />
        <Tab label="By Agent" />
        <Tab label="By Property" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ height: 600 }}>
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            defaultView={Views.WEEK}
            views={[Views.DAY, Views.WEEK, Views.MONTH]}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
          />
        </Box>
      )}

      {tab === 1 && (
        <Stack spacing={1}>
          {viewings.length === 0 ? (
            <Typography color="text.secondary">No viewings scheduled.</Typography>
          ) : (
            viewings.map((v) => (
              <Box key={v._id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {properties.find((p) => String(p._id) === String(v.propertyId))?.name || v.propertyId}
                  </Typography>
                  <Chip size="small" label={v.status} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {new Date(v.when).toLocaleString()} {v.outcome ? `· ${v.outcome}` : ''}
                </Typography>
                {v.notes && <Typography variant="caption">{v.notes}</Typography>}
              </Box>
            ))
          )}
        </Stack>
      )}

      {tab >= 2 && (
        <Typography color="text.secondary">
          Grouped {tab === 2 ? 'agent' : 'property'} views — select a record from the list or calendar for details.
        </Typography>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule Viewing</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Property</InputLabel>
                <Select
                  label="Property"
                  value={form.propertyId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}
                >
                  {properties.map((p) => (
                    <MenuItem key={p._id} value={p._id}>{p.name || p.address}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Prospect (Lead)</InputLabel>
                <Select
                  label="Prospect (Lead)"
                  value={form.leadId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value }))}
                >
                  {leads.map((l) => (
                    <MenuItem key={l._id} value={l._id}>{l.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="datetime-local"
                label="Date & Time"
                InputLabelProps={{ shrink: true }}
                value={form.when ? form.when.slice(0, 16) : ''}
                onChange={(e) => setForm((f) => ({ ...f, when: new Date(e.target.value).toISOString() }))}
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select label="Status" value={form.status || 'Scheduled'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}>
                  {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Outcome</InputLabel>
                <Select label="Outcome" value={form.outcome || ''} onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value as any }))}>
                  <MenuItem value="">—</MenuItem>
                  {OUTCOME_OPTIONS.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline rows={2} label="Notes" value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminViewingsPage;
