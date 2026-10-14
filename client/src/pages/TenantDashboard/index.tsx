import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import {
  Home, Description, Payment, Receipt, Build, Assignment, Visibility, Folder, Message, Notifications, Person,
} from '@mui/icons-material';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { PortalShell } from '../ecosystem/PortalShell';
import ecosystemService from '../../services/ecosystemService';
import { INDIVIDUAL_THEME } from '../IndividualDashboard/theme';

const items = [
  { text: 'Overview', path: '/tenant-dashboard', icon: <Home /> },
  { text: 'My Properties', path: '/tenant-dashboard/properties', icon: <Home /> },
  { text: 'My Lease', path: '/tenant-dashboard/lease', icon: <Description /> },
  { text: 'Rent & Payments', path: '/tenant-dashboard/payments', icon: <Payment /> },
  { text: 'Receipts', path: '/tenant-dashboard/receipts', icon: <Receipt /> },
  { text: 'Maintenance', path: '/tenant-dashboard/maintenance', icon: <Build /> },
  { text: 'Applications', path: '/tenant-dashboard/applications', icon: <Assignment /> },
  { text: 'Viewings', path: '/tenant-dashboard/viewings', icon: <Visibility /> },
  { text: 'Documents', path: '/tenant-dashboard/documents', icon: <Folder /> },
  { text: 'Messages', path: '/tenant-dashboard/messages', icon: <Message /> },
  { text: 'Notifications', path: '/tenant-dashboard/notifications', icon: <Notifications /> },
  { text: 'My Profile', path: '/tenant-dashboard/profile', icon: <Person /> },
];

function useLoad<T>(fn: () => Promise<any>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let live = true;
    setLoading(true);
    fnRef.current().then((r) => { if (live) setData(r.data); }).catch((e) => { if (live) setError(e?.response?.data?.message || 'Unable to load'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, deps);
  return { data, error, loading, setData };
}

const card = { borderRadius: 3, boxShadow: '0 10px 30px rgba(8,71,52,0.08)' };

const Overview = () => {
  const { data, error, loading } = useLoad<any>(() => ecosystemService.overview());
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 700, color: INDIVIDUAL_THEME.primary }}>Welcome</Typography>
      <Grid container spacing={2}>
        {[
          ['Property', data?.lease?.propertyId?.name || 'No active lease'],
          ['Rent due', `$${Number(data?.rentDue || 0).toFixed(2)}`],
          ['Lease status', data?.lease?.status || '—'],
          ['Open maintenance', String(data?.openMaintenance?.length || 0)],
        ].map(([label, value]) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card sx={card}><CardContent>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h6">{value}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
};

const Properties = () => {
  const navigate = useNavigate();
  const { data, error, loading, setData } = useLoad<any>(() => ecosystemService.listings({ availability: 'available' }));
  const [q, setQ] = useState({ location: '', bedrooms: '', minRent: '', maxRent: '' });
  const search = async () => {
    const r = await ecosystemService.listings(q);
    setData(r.data);
  };
  if (loading) return <CircularProgress aria-label="Loading properties" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  const items = data?.items || [];
  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Public listings</Typography>
      <Typography color="text.secondary">Properties every company has published. Apply or request a viewing on any of them.</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField size="small" label="Location" value={q.location} onChange={(e) => setQ({ ...q, location: e.target.value })} />
        <TextField size="small" label="Bedrooms" value={q.bedrooms} onChange={(e) => setQ({ ...q, bedrooms: e.target.value })} />
        <TextField size="small" label="Min rent" value={q.minRent} onChange={(e) => setQ({ ...q, minRent: e.target.value })} />
        <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, minHeight: 44 }} onClick={search}>Search</Button>
      </Stack>
      {items.length === 0 && <Alert severity="info">No published listings match your search.</Alert>}
      <Grid container spacing={2}>
        {items.map((p: any) => (
          <Grid item xs={12} md={6} key={p._id}>
            <Card sx={card} onClick={() => navigate(`/tenant-dashboard/properties/${p._id}`)}>
              <CardContent>
                <Typography variant="h6">{p.name}</Typography>
                <Typography color="text.secondary">{p.address}</Typography>
                <Typography sx={{ mt: 1 }}>${p.rent} · {p.bedrooms} bed · {p.bathrooms} bath</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
};

const PropertyDetail = () => {
  const { id } = useParams();
  const { data, error, loading } = useLoad<any>(() => ecosystemService.listing(String(id)), [id]);
  const [msg, setMsg] = useState('');
  const [date, setDate] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionOk, setActionOk] = useState('');
  if (loading) return <CircularProgress aria-label="Loading listing" />;
  if (error) return <Alert severity="error">{error}</Alert>;
  const run = async (fn: () => Promise<any>, ok: string) => {
    setActionError('');
    setActionOk('');
    try {
      await fn();
      setActionOk(ok);
    } catch (e: any) {
      setActionError(e?.response?.data?.message || 'Request failed');
    }
  };
  return (
    <Stack spacing={2}>
      <Typography variant="h5">{data?.name}</Typography>
      <Typography>{data?.description}</Typography>
      <Typography>${data?.rent} rent · ${data?.deposit || 0} deposit</Typography>
      {actionError && <Alert severity="error">{actionError}</Alert>}
      {actionOk && <Alert severity="success">{actionOk}</Alert>}
      <TextField type="date" label="Preferred viewing date" InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} />
      <TextField label="Message to the agency" value={msg} onChange={(e) => setMsg(e.target.value)} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, minHeight: 44 }} onClick={() => run(() => ecosystemService.requestViewing({ propertyId: id, requestedDate: date || new Date().toISOString(), message: msg }), 'Viewing requested')}>Request viewing</Button>
        <Button variant="outlined" sx={{ minHeight: 44 }} onClick={() => run(() => ecosystemService.apply({ propertyId: id, submit: true }), 'Application submitted')}>Apply</Button>
      </Stack>
    </Stack>
  );
};

const LeasePage = () => {
  const { data, loading, error } = useLoad<any[]>(() => ecosystemService.leases());
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  const lease = (data || [])[0];
  if (!lease) return <Alert severity="info">No lease on file yet.</Alert>;
  return (
    <Card sx={card}><CardContent>
      <Typography variant="h6">{lease.propertyId?.name || 'Property'}</Typography>
      <Typography>Start {new Date(lease.startDate).toLocaleDateString()} · End {new Date(lease.endDate).toLocaleDateString()}</Typography>
      <Typography>Rent ${lease.rentAmount || lease.monthlyRent} · Deposit ${lease.depositAmount || lease.securityDeposit}</Typography>
      <Typography>Status {lease.status} · Billing {lease.billingStatus}</Typography>
    </CardContent></Card>
  );
};

const PaymentsPage = () => {
  const { data, loading, error } = useLoad<any[]>(() => ecosystemService.payments());
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Stack spacing={1}>
      <Typography variant="h5">Payment history</Typography>
      {(data || []).length === 0 && <Alert severity="info">No payments recorded yet. Cash and bank payments posted by your agency will appear here.</Alert>}
      {(data || []).map((p) => (
        <Card key={p._id} sx={card}><CardContent>
          <Typography>${p.amount} · {p.paymentMethod} · {new Date(p.paymentDate).toLocaleDateString()}</Typography>
          <Typography variant="caption">Receipt {p.referenceNumber}</Typography>
        </CardContent></Card>
      ))}
    </Stack>
  );
};

const MaintenancePage = () => {
  const { data, loading, error } = useLoad<any[]>(() => ecosystemService.myMaintenance());
  const [form, setForm] = useState({ propertyId: '', title: '', description: '', category: 'OTHER', urgency: 'NORMAL' });
  const leases = useLoad<any[]>(() => ecosystemService.leases());
  if (loading) return <CircularProgress />;
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Report a problem</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField select label="Property" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
        {(leases.data || []).map((l: any) => (
          <MenuItem key={l._id} value={l.propertyId?._id || l.propertyId}>{l.propertyId?.name || 'Property'}</MenuItem>
        ))}
      </TextField>
      <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <TextField label="Description" multiline minRows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <TextField select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
        {['PLUMBING','ELECTRICAL','WATER','SECURITY','APPLIANCE','STRUCTURAL','GARDEN','CLEANING','OTHER'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
      </TextField>
      <TextField select label="Urgency" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
        {['LOW','NORMAL','URGENT','EMERGENCY'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
      </TextField>
      <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, minHeight: 48 }} onClick={() => ecosystemService.reportMaintenance(form)}>Submit</Button>
      {(data || []).length === 0 && <Alert severity="info">No maintenance requests yet.</Alert>}
      {(data || []).map((m) => (
        <Card key={m._id} sx={card}><CardContent>
          <Stack direction="row" justifyContent="space-between">
            <Typography>{m.title}</Typography>
            <Chip size="small" label={m.ecosystemWorkflow?.status || m.status} />
          </Stack>
          {m.ecosystemWorkflow?.status === 'COMPLETED' && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" onClick={() => ecosystemService.confirmMaintenance(m._id, { confirm: true })}>Confirm completed</Button>
              <Button size="small" color="warning" onClick={() => ecosystemService.confirmMaintenance(m._id, { confirm: false, comment: 'Problem remains' })}>Report problem</Button>
            </Stack>
          )}
        </CardContent></Card>
      ))}
    </Stack>
  );
};

const SimpleList = ({ loader, title, render }: any) => {
  const { data, loading, error } = useLoad<any>(loader);
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  const rows = Array.isArray(data) ? data : data?.items || data?.leases || [];
  return (
    <Stack spacing={1}>
      <Typography variant="h5">{title}</Typography>
      {rows.length === 0 && <Alert severity="info">Nothing to show yet.</Alert>}
      {rows.map((row: any, i: number) => <Card key={row._id || i} sx={card}><CardContent>{render(row)}</CardContent></Card>)}
    </Stack>
  );
};

const ProfilePage = () => {
  const { data, loading } = useLoad<any>(() => ecosystemService.profile());
  const [form, setForm] = useState<any>({});
  useEffect(() => { if (data?.profile) setForm(data.profile); }, [data]);
  if (loading) return <CircularProgress />;
  return (
    <Stack spacing={2}>
      <Typography variant="h5">My profile · {form.profileCompletionPercent || 0}% complete</Typography>
      {['fullName','phone','address','employer','emergencyContactName','emergencyContactPhone'].map((k) => (
        <TextField key={k} label={k} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      ))}
      <Button variant="contained" sx={{ bgcolor: INDIVIDUAL_THEME.primary, minHeight: 48 }} onClick={() => ecosystemService.updateProfile(form)}>Save</Button>
    </Stack>
  );
};

const TenantDashboard: React.FC = () => (
  <PortalShell title="Tenant" items={items}>
    <Routes>
      <Route index element={<Overview />} />
      <Route path="properties" element={<Properties />} />
      <Route path="properties/:id" element={<PropertyDetail />} />
      <Route path="lease" element={<LeasePage />} />
      <Route path="payments" element={<PaymentsPage />} />
      <Route path="receipts" element={<PaymentsPage />} />
      <Route path="maintenance" element={<MaintenancePage />} />
      <Route path="applications" element={<SimpleList loader={() => ecosystemService.myApplications()} title="Applications" render={(r: any) => <Typography>{r.status} · {r.notes || 'Application'}</Typography>} />} />
      <Route path="viewings" element={<SimpleList loader={() => ecosystemService.myViewings()} title="Viewings" render={(r: any) => <Typography>{r.status} · {new Date(r.requestedDate).toLocaleString()}</Typography>} />} />
      <Route path="documents" element={<SimpleList loader={() => ecosystemService.documents()} title="Documents" render={(r: any) => <Typography>{r.property?.name || 'Lease documents'}</Typography>} />} />
      <Route path="messages" element={<SimpleList loader={() => ecosystemService.broadcasts()} title="Messages" render={(r: any) => <Typography>{r.title}: {r.message}</Typography>} />} />
      <Route path="notifications" element={<SimpleList loader={() => ecosystemService.notifications()} title="Notifications" render={(r: any) => <Typography>{r.title}</Typography>} />} />
      <Route path="profile" element={<ProfilePage />} />
    </Routes>
  </PortalShell>
);

export default TenantDashboard;
