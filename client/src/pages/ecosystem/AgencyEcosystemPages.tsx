import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ecosystemService from '../../services/ecosystemService';
import { INDIVIDUAL_THEME } from '../IndividualDashboard/theme';

function useLoad<T>(fn: () => Promise<any>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const reload = () => {
    setLoading(true);
    fnRef.current().then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.message || 'Unable to load')).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);
  return { data, error, loading, reload };
}

const card = { borderRadius: 3, mb: 2 };

export const AgentViewingsPage: React.FC = () => {
  const { data, loading, error, reload } = useLoad<any[]>(() => ecosystemService.agencyViewings());
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Stack>
      <Typography variant="h5" sx={{ mb: 2 }}>Viewing requests</Typography>
      {(data || []).length === 0 && <Alert severity="info">No viewing requests.</Alert>}
      {(data || []).map((v) => (
        <Card key={v._id} sx={card}><CardContent>
          <Stack direction="row" justifyContent="space-between">
            <Typography>{new Date(v.requestedDate).toLocaleString()}</Typography>
            <Chip label={v.status} size="small" />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {['UNDER_REVIEW','CONFIRMED','RESCHEDULED','DECLINED','COMPLETED'].map((s) => (
              <Button key={s} size="small" onClick={async () => { await ecosystemService.updateViewing(v._id, { status: s }); reload(); }}>{s}</Button>
            ))}
          </Stack>
        </CardContent></Card>
      ))}
    </Stack>
  );
};

export const AgentApplicationsPage: React.FC = () => {
  const { data, loading, error, reload } = useLoad<any[]>(() => ecosystemService.agencyApplications());
  const [actionError, setActionError] = useState('');
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  const move = async (id: string, status: string) => {
    setActionError('');
    try {
      await ecosystemService.updateApplication(id, { status });
      reload();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'That application status was not accepted');
    }
  };
  return (
    <Stack>
      <Typography variant="h5" sx={{ mb: 2 }}>Tenant applications</Typography>
      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
      {(data || []).length === 0 && <Alert severity="info">No applications.</Alert>}
      {(data || []).map((a) => (
        <Card key={a._id} sx={card}><CardContent>
          <Typography>{a.snapshot?.fullName || 'Applicant'} · {a.status} · submitted {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : 'draft'}</Typography>
          <Typography variant="body2">
            {a.snapshot?.employer || a.snapshot?.employmentStatus || 'Employment not recorded'}
            {a.snapshot?.occupants ? ` · occupancy ${a.snapshot.occupants}` : ''}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {['UNDER_REVIEW','SHORTLISTED','SENT_TO_OWNER','MORE_INFORMATION_REQUIRED','DECLINED','WITHDRAWN','LEASE_PREPARATION'].map((s) => (
              <Button key={s} size="small" onClick={() => move(a._id, s)}>{s.replace(/_/g, ' ')}</Button>
            ))}
          </Stack>
        </CardContent></Card>
      ))}
    </Stack>
  );
};

export const AgentQuotesPage: React.FC = () => {
  const maint = useLoad<any[]>(() => ecosystemService.agencyMaintenance());
  const contractors = useLoad<any[]>(() => ecosystemService.agencyContractors());
  const [selected, setSelected] = useState<string>('');
  const [quotes, setQuotes] = useState<any[]>([]);
  const loadQuotes = async (id: string) => {
    setSelected(id);
    const r = await ecosystemService.agencyQuotes(id);
    setQuotes(r.data || []);
  };
  if (maint.loading) return <CircularProgress />;
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Maintenance quotes</Typography>
      {(maint.data || []).length === 0 && <Alert severity="info">No ecosystem maintenance requests.</Alert>}
      {(maint.data || []).map((m) => (
        <Card key={m._id} sx={card}><CardContent>
          <Typography>{m.title} · {m.ecosystemWorkflow?.status || m.status}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            <Button size="small" onClick={() => ecosystemService.reviewMaintenance(m._id)}>Review</Button>
            <Button size="small" onClick={() => loadQuotes(m._id)}>Quotes</Button>
            <Button size="small" onClick={() => ecosystemService.sendToOwner(m._id)}>Send to owner</Button>
            <Button size="small" onClick={() => ecosystemService.authorise(m._id)}>Authorise work</Button>
          </Stack>
          {selected === m._id && (
            <Stack sx={{ mt: 2 }} spacing={1}>
              <TextField select label="Send job offer" helperText="Registered contractors from every company" defaultValue="" onChange={(e) => ecosystemService.inviteContractors(m._id, [e.target.value])}>
                {(contractors.data || []).map((c: any) => <MenuItem key={c._id} value={c._id}>{c.companyName} ({c.trade})</MenuItem>)}
              </TextField>
              {quotes.map((q) => (
                <Stack key={q._id} direction="row" justifyContent="space-between">
                  <Typography>{q.contractorId?.companyName} · ${q.amount} · {q.duration || 'n/a'} · rating {q.rating || '—'}</Typography>
                  <Button size="small" onClick={() => ecosystemService.selectQuote(m._id, q._id, 'Selected by agent')}>Select</Button>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent></Card>
      ))}
    </Stack>
  );
};

export const OwnerQuotesPage: React.FC = () => {
  const { data, loading, error, reload } = useLoad<any[]>(() => ecosystemService.ownerMaintenance());
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Stack>
      <Typography variant="h5" sx={{ mb: 2, color: INDIVIDUAL_THEME.primary }}>Maintenance awaiting approval</Typography>
      {(data || []).map((m) => (
        <Card key={m._id} sx={card}><CardContent>
          <Typography>{m.title}</Typography>
          <Typography variant="body2">{m.description}</Typography>
          <Chip sx={{ mt: 1 }} label={m.ecosystemWorkflow?.status || m.status} />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button onClick={async () => { await ecosystemService.ownerDecision(m._id, { decision: 'APPROVE' }); reload(); }}>Approve</Button>
            <Button color="warning" onClick={async () => { await ecosystemService.ownerDecision(m._id, { decision: 'DECLINE' }); reload(); }}>Decline</Button>
            <Button onClick={async () => { await ecosystemService.ownerDecision(m._id, { decision: 'REQUEST_CHANGES' }); reload(); }}>Request changes</Button>
          </Stack>
        </CardContent></Card>
      ))}
    </Stack>
  );
};

export const AgentBroadcastPage: React.FC = () => {
  const [form, setForm] = useState({ title: '', message: '', priority: 'NORMAL', scope: 'ALL_AGENCY_TENANTS' });
  const [status, setStatus] = useState('');
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Broadcast</Typography>
      {status && <Alert severity="success">{status}</Alert>}
      <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <TextField label="Message" multiline minRows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      <TextField select label="Scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
        <MenuItem value="ALL_AGENCY_TENANTS">All agency tenants</MenuItem>
        <MenuItem value="PROPERTY">Single property</MenuItem>
        <MenuItem value="PORTFOLIO">Portfolio</MenuItem>
        <MenuItem value="TENANT">Single tenant</MenuItem>
      </TextField>
      <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, minHeight: 44 }} onClick={async () => {
        const r = await ecosystemService.broadcast(form);
        setStatus(`Sent to ${r.data?.recipients || 0} recipient(s)`);
      }}>Send</Button>
    </Stack>
  );
};

export const AgencyEcosystemSettingsPage: React.FC = () => {
  const [flags, setFlags] = useState<any>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => {
    ecosystemService.getSettings().then((r) => setFlags(r.data || {})).catch((e) => setError(e?.response?.data?.message || 'Unable to load flags'));
  }, []);
  const keys = [
    'tenantPortalEnabled', 'contractorPortalEnabled', 'propertyMarketplaceEnabled',
    'maintenanceQuotesEnabled', 'onlinePaymentsEnabled', 'multichannelNotificationsEnabled',
    'tenantReferencesEnabled', 'contractorRatingsEnabled',
  ];
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Ecosystem flags</Typography>
      <Alert severity="info">Keep quote workflow and online payments off until this company is ready. Flags are enforced on the server.</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{saved}</Alert>}
      {keys.map((key) => (
        <TextField key={key} select label={key} value={String(Boolean(flags[key]))} onChange={(e) => setFlags({ ...flags, [key]: e.target.value === 'true' })}>
          <MenuItem value="false">Off</MenuItem>
          <MenuItem value="true">On</MenuItem>
        </TextField>
      ))}
      <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, minHeight: 44 }} onClick={async () => {
        setSaved('');
        await ecosystemService.saveSettings(flags);
        setSaved('Saved. Existing PMS behaviour is unchanged when flags stay off.');
      }}>Save flags</Button>
    </Stack>
  );
};
