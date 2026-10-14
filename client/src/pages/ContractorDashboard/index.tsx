import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Engineering, Work, RequestQuote, Assignment, Star, Person, Folder } from '@mui/icons-material';
import { Route, Routes } from 'react-router-dom';
import { PortalShell } from '../ecosystem/PortalShell';
import ecosystemService from '../../services/ecosystemService';
import { INDIVIDUAL_THEME } from '../IndividualDashboard/theme';

const items = [
  { text: 'Overview', path: '/contractor-dashboard', icon: <Engineering /> },
  { text: 'Invitations', path: '/contractor-dashboard/jobs', icon: <Work /> },
  { text: 'My Quotes', path: '/contractor-dashboard/quotes', icon: <RequestQuote /> },
  { text: 'Active Jobs', path: '/contractor-dashboard/active-jobs', icon: <Assignment /> },
  { text: 'Completed Jobs', path: '/contractor-dashboard/completed-jobs', icon: <Assignment /> },
  { text: 'Ratings', path: '/contractor-dashboard/ratings', icon: <Star /> },
  { text: 'Profile', path: '/contractor-dashboard/profile', icon: <Person /> },
  { text: 'Documents', path: '/contractor-dashboard/documents', icon: <Folder /> },
];

function useLoad<T>(fn: () => Promise<any>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    fnRef.current().then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.message || 'Unable to load')).finally(() => setLoading(false));
  }, []);
  return { data, error, loading };
}

const card = { borderRadius: 3, boxShadow: '0 10px 30px rgba(8,71,52,0.08)' };

const Overview = () => {
  const jobs = useLoad<any[]>(() => ecosystemService.contractorJobs());
  const invites = useLoad<any[]>(() => ecosystemService.contractorInvitations());
  if (jobs.loading) return <CircularProgress />;
  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ color: INDIVIDUAL_THEME.primary, fontWeight: 700 }}>Contractor overview</Typography>
      <Typography>Invitations: {invites.data?.length || 0} · Jobs: {jobs.data?.length || 0}</Typography>
    </Stack>
  );
};

const Invitations = () => {
  const loaded = useLoad<any[]>(() => ecosystemService.contractorInvitations());
  const [items, setItems] = useState<any[] | null>(null);
  const [quote, setQuote] = useState({ description: '', amount: '', duration: '' });
  const [actionError, setActionError] = useState('');
  useEffect(() => { if (loaded.data) setItems(loaded.data); }, [loaded.data]);
  if (loaded.loading) return <CircularProgress aria-label="Loading invitations" />;
  if (loaded.error) return <Alert severity="error">{loaded.error}</Alert>;
  const decline = async (inv: any) => {
    if (!inv.jobId) {
      setActionError('This request cannot be declined from the portal yet.');
      return;
    }
    try {
      setActionError('');
      await ecosystemService.updateJob(inv.jobId, { status: 'CANCELLED' });
      setItems((current) => (current || []).map((item) => item._id === inv._id ? { ...item, status: 'WITHDRAWN', jobStatus: 'CANCELLED' } : item));
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'The request could not be declined.');
    }
  };
  return (
    <Stack spacing={2}>
      {actionError && <Alert severity="error">{actionError}</Alert>}
      {(items || []).length === 0 && <Alert severity="info">No invitations yet.</Alert>}
      {(items || []).map((inv: any) => {
        const open = !['WITHDRAWN', 'SUBMITTED'].includes(inv.status) && inv.jobStatus !== 'CANCELLED';
        const photos = (inv.photos || []).filter((photo: any) => String(photo.mimeType || photo.fileUrl || '').includes('image') || String(photo.fileUrl || '').startsWith('data:image'));
        return (
          <Card key={inv._id} sx={card}><CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography fontWeight={700}>{inv.scopeSnapshot?.title || 'Job request'}</Typography>
              <Chip size="small" label={inv.jobStatus || inv.status} />
            </Stack>
            {inv.scopeSnapshot?.propertyName && <Typography variant="body2">{inv.scopeSnapshot.propertyName}</Typography>}
            {inv.scopeSnapshot?.propertyLocation && <Typography variant="body2" color="text.secondary">{inv.scopeSnapshot.propertyLocation}</Typography>}
            <Typography variant="body2" sx={{ mt: 1 }}>{inv.scopeSnapshot?.description}</Typography>
            {photos.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                {photos.map((photo: any, index: number) => (
                  <Box key={`${inv._id}-photo-${index}`} component="img" src={photo.fileUrl} alt={photo.fileName || 'Job photograph'} sx={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 1 }} />
                ))}
              </Stack>
            )}
            {open && (
              <>
                <TextField sx={{ mt: 1 }} fullWidth label="Quote description" value={quote.description} onChange={(e) => setQuote({ ...quote, description: e.target.value })} />
                <TextField fullWidth label="Amount" value={quote.amount} onChange={(e) => setQuote({ ...quote, amount: e.target.value })} />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button sx={{ bgcolor: INDIVIDUAL_THEME.primary, color: '#fff', minHeight: 44 }} onClick={() => ecosystemService.submitQuote(inv.requestId, {
                    description: quote.description,
                    estimatedDuration: quote.duration,
                    lineItems: [{ description: quote.description || 'Works', quantity: 1, unitCost: Number(quote.amount || 0) }],
                  }).then(() => setItems((current) => (current || []).map((item) => item._id === inv._id ? { ...item, status: 'SUBMITTED', jobStatus: 'QUOTE_SUBMITTED' } : item))).catch((err) => setActionError(err?.response?.data?.message || 'The quote could not be submitted.'))}>Accept and quote</Button>
                  <Button color="inherit" sx={{ minHeight: 44 }} onClick={() => decline(inv)}>Decline</Button>
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Accepting submits a quote. It does not authorise work until the owner approves and the agent authorises the job.</Typography>
              </>
            )}
          </CardContent></Card>
        );
      })}
    </Stack>
  );
};

const Quotes = () => {
  const { data, loading, error } = useLoad<any[]>(() => ecosystemService.contractorQuotes());
  if (loading) return <CircularProgress aria-label="Loading quotes" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data?.length) return <Alert severity="info">You have not submitted any quotes yet.</Alert>;
  return (
    <Stack spacing={1}>
      {(data || []).map((q: any) => (
        <Card key={q._id} sx={card}><CardContent>
          <Stack direction="row" justifyContent="space-between">
            <Typography>${q.total ?? q.amount} · v{q.version || 1}</Typography>
            <Chip label={q.status} size="small" />
          </Stack>
          <Typography variant="body2">{q.description}</Typography>
        </CardContent></Card>
      ))}
    </Stack>
  );
};

const Ratings = () => {
  const { data, loading, error } = useLoad<any[]>(() => ecosystemService.contractorRatings());
  if (loading) return <CircularProgress aria-label="Loading ratings" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data?.length) return <Alert severity="info">No ratings yet.</Alert>;
  return (
    <Stack spacing={1}>
      {(data || []).map((r: any) => (
        <Card key={r._id} sx={card}><CardContent>
          <Typography>Overall {r.overall}/5 · Quality {r.quality} · Timeliness {r.timeliness}</Typography>
          {r.comment && <Typography variant="body2">{r.comment}</Typography>}
        </CardContent></Card>
      ))}
    </Stack>
  );
};

const Jobs = ({ status }: { status?: string }) => {
  const { data, loading, error } = useLoad<any[]>(() => ecosystemService.contractorJobs(status ? { status } : undefined));
  if (loading) return <CircularProgress aria-label="Loading jobs" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data?.length) return <Alert severity="info">No jobs in this list.</Alert>;
  return (
    <Stack spacing={1}>
      {(data || []).map((job: any) => (
        <Card key={job._id} sx={card}><CardContent>
          <Stack direction="row" justifyContent="space-between">
            <Typography>Job {String(job._id).slice(-6)}</Typography>
            <Chip label={job.status} size="small" />
          </Stack>
          {job.status === 'AUTHORISED' && <Button sx={{ mt: 1 }} onClick={() => ecosystemService.updateJob(job._id, { status: 'ACCEPTED' })}>Accept</Button>}
          {job.status === 'ACCEPTED' && <Button sx={{ mt: 1 }} onClick={() => ecosystemService.updateJob(job._id, { status: 'SCHEDULED', scheduledAt: new Date().toISOString() })}>Schedule</Button>}
          {['SCHEDULED', 'ACCEPTED'].includes(job.status) && <Button sx={{ mt: 1 }} onClick={() => ecosystemService.updateJob(job._id, { status: 'WORK_IN_PROGRESS' })}>Start work</Button>}
          {job.status === 'WORK_IN_PROGRESS' && <Button sx={{ mt: 1 }} onClick={() => ecosystemService.updateJob(job._id, { status: 'COMPLETED', completion: { notes: 'Completed', actualCompletionDate: new Date().toISOString() } })}>Mark completed</Button>}
        </CardContent></Card>
      ))}
    </Stack>
  );
};

const Profile = () => {
  const { data, loading } = useLoad<any>(() => ecosystemService.contractorMe());
  const [form, setForm] = useState<any>({});
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (loading) return <CircularProgress />;
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Contractor profile · {form.verificationStatus || 'UNVERIFIED'}</Typography>
      {['companyName','contactPerson','phone','email','trade','serviceAreas','availability','description'].map((k) => (
        <TextField key={k} label={k} value={Array.isArray(form[k]) ? form[k].join(', ') : (form[k] || '')} onChange={(e) => setForm({ ...form, [k]: k === 'serviceAreas' ? e.target.value.split(',').map((s) => s.trim()) : e.target.value })} />
      ))}
      <TextField select label="Trade" value={form.trade || 'General Contractor'} onChange={(e) => setForm({ ...form, trade: e.target.value })}>
        {['Plumber','Electrician','Builder','Painter','Pool Technician','Landscaper','Carpenter','General Contractor','Other'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
      </TextField>
      <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, minHeight: 48 }} onClick={() => ecosystemService.saveContractor(form)}>Save</Button>
    </Stack>
  );
};

const ContractorDashboard: React.FC = () => (
  <PortalShell title="Contractor" items={items}>
    <Routes>
      <Route index element={<Overview />} />
      <Route path="jobs" element={<Invitations />} />
      <Route path="quotes" element={<Quotes />} />
      <Route path="active-jobs" element={<Jobs status="WORK_IN_PROGRESS" />} />
      <Route path="completed-jobs" element={<Jobs status="COMPLETED" />} />
      <Route path="ratings" element={<Ratings />} />
      <Route path="profile" element={<Profile />} />
      <Route path="documents" element={<Alert severity="info">Upload certificates from your profile.</Alert>} />
      <Route path="messages" element={<Alert severity="info">Job messages appear with invitations.</Alert>} />
    </Routes>
  </PortalShell>
);

export default ContractorDashboard;
