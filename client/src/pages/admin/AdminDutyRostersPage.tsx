import React, { useCallback, useEffect, useState } from 'react';
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
import agencyOperationsService from '../../services/agencyOperationsService';
import { DUTY_TYPE_LABELS, DutyRosterShift, DutyType } from '../../types/agencyOperations';
import paymentService from '../../services/paymentService';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';

const localizer = momentLocalizer(moment);

const AdminDutyRostersPage: React.FC = () => {
  const { user } = useAuth();
  const { company } = useCompany();
  const [shifts, setShifts] = useState<DutyRosterShift[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [dutyTypes, setDutyTypes] = useState<DutyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genForm, setGenForm] = useState({ from: '', to: '', coverageArea: '' });
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyId = String(user?.companyId || (company as any)?._id || '');
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const [s, a, types] = await Promise.all([
        agencyOperationsService.listDutyShifts({ from: now.toISOString(), to: in30.toISOString() }),
        paymentService.getAgentsPublic(companyId, 'agent').catch(() => []),
        agencyOperationsService.getDutyTypes(),
      ]);
      setShifts(s);
      setAgents(Array.isArray(a) ? a : []);
      setDutyTypes(types);
    } catch (e: any) {
      setError(e?.message || 'Failed to load duty rosters');
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, company]);

  useEffect(() => { load(); }, [load]);

  const calendarEvents = shifts.map((s) => {
    const agent = typeof s.agentId === 'object' ? s.agentId : null;
    const name = agent ? `${agent.firstName || ''} ${agent.lastName || ''}`.trim() : 'Agent';
    return {
      id: s._id,
      title: `${DUTY_TYPE_LABELS[s.dutyType] || s.dutyType} · ${name}`,
      start: new Date(s.shiftDate),
      end: new Date(new Date(s.shiftDate).getTime() + 8 * 60 * 60 * 1000),
      resource: s,
    };
  });

  const handleGenerate = async () => {
    if (!genForm.from || !genForm.to) return;
    setGenerating(true);
    try {
      await agencyOperationsService.generateDutyRoster({
        from: genForm.from,
        to: genForm.to,
        coverageArea: genForm.coverageArea || undefined,
      });
      setGenerateOpen(false);
      load();
    } catch (e: any) {
      setError(e?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const exportCsv = () => {
    const rows = [['Agent', 'Duty Type', 'Date', 'Coverage', 'Status']];
    shifts.forEach((s) => {
      const agent = typeof s.agentId === 'object' ? s.agentId : null;
      const name = agent ? `${agent.firstName || ''} ${agent.lastName || ''}`.trim() : String(s.agentId);
      rows.push([name, s.dutyType, new Date(s.shiftDate).toLocaleDateString(), s.coverageArea || '', s.status]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'duty-roster.csv';
    a.click();
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Duty Rosters</Typography>
          <Typography variant="body2" color="text.secondary">Auto-roster generation, calendar, and shift management</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={exportCsv}>Export Excel</Button>
          <Button variant="contained" onClick={() => setGenerateOpen(true)}>Auto-Generate</Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Calendar" />
        <Tab label="Timeline" />
        <Tab label="Agent View" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ height: 560 }}>
          <Calendar localizer={localizer} events={calendarEvents} defaultView={Views.MONTH} views={[Views.DAY, Views.WEEK, Views.MONTH]} style={{ height: '100%' }} />
        </Box>
      )}

      {tab === 1 && (
        <Stack spacing={1}>
          {shifts.map((s) => {
            const agent = typeof s.agentId === 'object' ? s.agentId : null;
            const name = agent ? `${agent.firstName || ''} ${agent.lastName || ''}`.trim() : 'Agent';
            return (
              <Box key={s._id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, display: 'flex', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{DUTY_TYPE_LABELS[s.dutyType]}</Typography>
                  <Typography variant="body2" color="text.secondary">{name} · {new Date(s.shiftDate).toLocaleDateString()}</Typography>
                </Box>
                <Chip size="small" label={s.status} />
              </Box>
            );
          })}
        </Stack>
      )}

      {tab === 2 && (
        <Grid container spacing={2}>
          {agents.map((a) => {
            const id = String(a._id);
            const agentShifts = shifts.filter((s) => String(typeof s.agentId === 'object' ? s.agentId._id : s.agentId) === id);
            return (
              <Grid item xs={12} md={6} key={id}>
                <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{a.firstName} {a.lastName}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{agentShifts.length} upcoming shifts</Typography>
                  {agentShifts.map((s) => (
                    <Chip key={s._id} size="small" sx={{ mr: 0.5, mb: 0.5 }} label={`${DUTY_TYPE_LABELS[s.dutyType]} ${new Date(s.shiftDate).toLocaleDateString()}`} />
                  ))}
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}

      <Dialog open={generateOpen} onClose={() => setGenerateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Auto-Roster Generator</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField type="date" label="From" InputLabelProps={{ shrink: true }} value={genForm.from} onChange={(e) => setGenForm((f) => ({ ...f, from: e.target.value }))} fullWidth />
            <TextField type="date" label="To" InputLabelProps={{ shrink: true }} value={genForm.to} onChange={(e) => setGenForm((f) => ({ ...f, to: e.target.value }))} fullWidth />
            <TextField label="Coverage Area" value={genForm.coverageArea} onChange={(e) => setGenForm((f) => ({ ...f, coverageArea: e.target.value }))} fullWidth />
            <Typography variant="caption" color="text.secondary">
              Balances workload, respects leave and availability, avoids consecutive weekend assignments.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleGenerate} disabled={generating}>{generating ? 'Generating…' : 'Generate'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminDutyRostersPage;
