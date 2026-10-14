import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Button, Paper, Grid, TextField, MenuItem, Stack, Chip,
  CircularProgress, Alert, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, Avatar,
} from '@mui/material';
import maintenanceManagementService from '../../services/maintenanceManagementService';
import ecosystemService from '../../services/ecosystemService';
import api from '../../api/axios';
import { apiService } from '../../api';
import { MaintenanceContractor } from '../../types/maintenanceManagement';
import { Property } from '../../types/property';

const TRADES = [
  'Plumber', 'Electrician', 'Builder', 'Painter', 'Pool Technician',
  'Landscaper', 'Carpenter', 'General Contractor', 'Other',
];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function avatarSrc(contractor: MaintenanceContractor) {
  const raw = contractor.profileImage;
  if (!raw) return undefined;
  if (raw.startsWith('data:') || raw.startsWith('http')) return raw;
  return `data:${contractor.profileImageType || 'image/png'};base64,${raw}`;
}

function locationLabel(contractor: MaintenanceContractor) {
  const areas = (contractor.serviceAreas || []).filter(Boolean);
  if (areas.length) return areas.join(', ');
  return contractor.address || '';
}

export const MaintenanceVendorsPage: React.FC = () => {
  const [contractors, setContractors] = useState<MaintenanceContractor[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<MaintenanceContractor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesError, setPropertiesError] = useState('');
  const [jobForm, setJobForm] = useState({ propertyId: '', description: '' });
  const [photos, setPhotos] = useState<File[]>([]);
  const [jobError, setJobError] = useState('');
  const [jobSuccess, setJobSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState('');
  const [form, setForm] = useState({
    companyName: '', contactPerson: '', phone: '', email: '', trade: 'General Contractor', address: '', notes: '',
  });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [list, perf] = await Promise.all([
        maintenanceManagementService.getContractors(),
        maintenanceManagementService.getContractorPerformance(),
      ]);
      setContractors(Array.isArray(list) ? list : []);
      setPerformance(Array.isArray(perf) ? perf : []);
    } catch {
      setError('Failed to load contractors. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => {
    const values = new Set<string>();
    contractors.forEach((contractor) => {
      if (contractor.trade) values.add(contractor.trade);
      (contractor.skills || []).forEach((skill) => skill && values.add(skill));
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [contractors]);

  const visible = useMemo(() => {
    if (!category) return contractors;
    const wanted = category.toLowerCase();
    return contractors.filter((contractor) =>
      contractor.trade?.toLowerCase() === wanted ||
      (contractor.skills || []).some((skill) => skill.toLowerCase() === wanted)
    );
  }, [category, contractors]);

  const perfMap = new Map(performance.map((p) => [String(p.contractor?._id || p.contractor), p]));

  const handleCreate = async () => {
    await maintenanceManagementService.createContractor(form);
    setDialogOpen(false);
    setForm({ companyName: '', contactPerson: '', phone: '', email: '', trade: 'General Contractor', address: '', notes: '' });
    await load();
  };

  const openJobRequest = async (contractor: MaintenanceContractor) => {
    setSelected(contractor);
    setJobOpen(true);
    setJobError('');
    setJobSuccess('');
    setPhotos([]);
    setCreatedRequestId('');
    setJobForm({ propertyId: '', description: '' });
    try {
      setPropertiesError('');
      const response = await api.get('/agents/properties');
      const rows = Array.isArray(response.data)
        ? response.data
        : (Array.isArray(response.data?.data) ? response.data.data : []);
      setProperties(rows);
    } catch {
      setProperties([]);
      setPropertiesError('Your authorised properties could not be loaded.');
    }
  };

  const handlePhotos = (files: FileList | null) => {
    if (!files) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    Array.from(files).forEach((file) => {
      if (!PHOTO_TYPES.includes(file.type)) {
        rejected.push(`${file.name} is not a supported image`);
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        rejected.push(`${file.name} is larger than 5MB`);
        return;
      }
      accepted.push(file);
    });
    setPhotos(accepted);
    setJobError(rejected.join(' '));
  };

  const handleSendJob = async () => {
    if (!selected) return;
    if (!jobForm.propertyId || !jobForm.description.trim()) {
      setJobError('Choose a property and describe the work.');
      return;
    }
    let requestId = createdRequestId;
    try {
      setSubmitting(true);
      setJobError('');
      setJobSuccess('');
      if (!requestId) {
        const uploaded = [];
        for (const file of photos) {
          const formData = new FormData();
          formData.append('files', file);
          const uploadRes = await apiService.uploadFiles(formData);
          const fileMeta = uploadRes.data?.[0];
          if (!fileMeta?.url) throw new Error('The photograph could not be stored.');
          uploaded.push(fileMeta);
        }
        const created = await apiService.createMaintenanceRequest({
          propertyId: jobForm.propertyId,
          title: `${selected.trade} request`,
          description: jobForm.description.trim(),
          priority: 'medium',
          category: selected.trade,
          attachments: uploaded.map((file) => ({ name: file.name, url: file.url, type: file.type, size: file.size })),
        });
        requestId = created.data?._id;
        if (!requestId) throw new Error('The job request was not saved.');
        setCreatedRequestId(requestId);
        for (const file of uploaded) {
          await maintenanceManagementService.uploadPhoto(requestId, {
            type: 'BEFORE',
            fileUrl: file.url,
            fileName: file.name,
            mimeType: file.type,
          });
        }
      }
      await ecosystemService.reviewMaintenance(requestId);
      const invited = await ecosystemService.inviteContractors(requestId, [selected._id]);
      const warnings = invited.data?.notificationWarnings || [];
      setJobSuccess(warnings.length
        ? `The job request was saved. ${warnings.join(' ')}`
        : 'The job request was sent. The contractor can review it in the portal. Owner approval is still required before work can start.');
    } catch (err: any) {
      const apiMessage = err?.response?.data?.message || err?.message;
      setJobError(requestId
        ? `${apiMessage || 'The contractor could not be invited.'} The maintenance request was saved. Send it again after the workspace is ready; that will not create a duplicate.`
        : (apiMessage || 'The job request could not be sent.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Contractors</Typography>
          <Typography color="text.secondary">Registered contractors and your company&apos;s service providers.</Typography>
        </Box>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>Add contractor</Button>
      </Stack>

      <TextField
        select
        label="Service category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        sx={{ mb: 2, minWidth: 260 }}
        disabled={loading || !categories.length}
      >
        <MenuItem value="">All categories</MenuItem>
        {categories.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
      </TextField>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress aria-label="Loading contractors" /></Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {performance.filter((p) => {
              if (!category) return true;
              const trade = String(p.contractor?.trade || '').toLowerCase();
              return trade === category.toLowerCase();
            }).slice(0, 4).map((p) => (
              <Grid item xs={12} sm={6} md={3} key={p.contractor?._id || p.contractor?.companyName}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700}>{p.contractor?.companyName}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.contractor?.trade}</Typography>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Typography variant="body2">Jobs completed: {p.jobsCompleted}</Typography>
                    <Typography variant="body2">Avg completion: {p.averageCompletionDays} days</Typography>
                    <Typography variant="body2">Total value: ${Number(p.totalValueOfJobs || 0).toLocaleString()}</Typography>
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
                  <TableCell>Contractor</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Jobs</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Alert severity="info">
                        {contractors.length === 0
                          ? 'No contractors are registered yet.'
                          : `No contractors match ${category}.`}
                      </Alert>
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((contractor) => {
                  const perf = perfMap.get(contractor._id);
                  return (
                    <TableRow key={contractor._id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(contractor)}>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar src={avatarSrc(contractor)} alt={contractor.companyName}>{contractor.companyName?.slice(0, 1)}</Avatar>
                          <Box>
                            <Typography fontWeight={700}>{contractor.companyName}</Typography>
                            <Typography variant="caption" color="text.secondary">{contractor.contactPerson}</Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          <Chip size="small" label={contractor.trade} />
                          {(contractor.skills || []).slice(0, 2).map((skill) => <Chip key={skill} size="small" variant="outlined" label={skill} />)}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {contractor.phone}<br />
                        <Typography variant="caption">{contractor.email}</Typography>
                      </TableCell>
                      <TableCell>{locationLabel(contractor) || 'Not recorded'}</TableCell>
                      <TableCell>
                        <Chip size="small" label={contractor.active === false ? 'Inactive' : (contractor.availability || contractor.verificationStatus || 'Active')} color={contractor.active === false ? 'default' : 'success'} />
                      </TableCell>
                      <TableCell>{perf?.jobsCompleted ?? 0} done / {perf?.openJobs ?? 0} open</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <Dialog open={!!selected && !jobOpen} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{selected?.companyName}</DialogTitle>
        <DialogContent>
          {selected && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar src={avatarSrc(selected)} alt={selected.companyName} sx={{ width: 64, height: 64 }}>{selected.companyName?.slice(0, 1)}</Avatar>
                <Box>
                  <Typography>{selected.contactPerson}</Typography>
                  <Typography variant="body2" color="text.secondary">{selected.trade}</Typography>
                </Box>
              </Stack>
              <Typography variant="body2">Phone: {selected.phone || 'Not recorded'}</Typography>
              <Typography variant="body2">Email: {selected.email || 'Not recorded'}</Typography>
              <Typography variant="body2">Location: {locationLabel(selected) || 'Not recorded'}</Typography>
              <Typography variant="body2">Availability: {selected.availability || 'Not recorded'}</Typography>
              {selected.description && <Typography variant="body2">{selected.description}</Typography>}
              {(selected.skills || []).length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {selected.skills?.map((skill) => <Chip key={skill} size="small" label={skill} />)}
                </Stack>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Close</Button>
          <Button variant="contained" onClick={() => selected && openJobRequest(selected)}>Request job</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={jobOpen} onClose={() => { if (!submitting) { setJobOpen(false); setSelected(null); } }} maxWidth="sm" fullWidth>
        <DialogTitle>Request job from {selected?.companyName}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">Sending this request does not authorise the contractor to start work. Owner approval and agent authorisation still apply.</Alert>
            {propertiesError && <Alert severity="error">{propertiesError}</Alert>}
            {jobError && <Alert severity="error">{jobError}</Alert>}
            {jobSuccess && <Alert severity="success">{jobSuccess}</Alert>}
            <TextField
              select
              fullWidth
              label="Property"
              value={jobForm.propertyId}
              onChange={(e) => setJobForm((current) => ({ ...current, propertyId: e.target.value }))}
            >
              {properties.map((property) => (
                <MenuItem key={property._id} value={property._id}>{property.name} — {property.address}</MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Work required"
              value={jobForm.description}
              onChange={(e) => setJobForm((current) => ({ ...current, description: e.target.value }))}
            />
            <Button variant="outlined" component="label">
              Attach photographs
              <input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => handlePhotos(e.target.files)} />
            </Button>
            {photos.map((file) => <Typography key={file.name} variant="caption">{file.name}</Typography>)}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setJobOpen(false); setSelected(null); }} disabled={submitting}>Close</Button>
          <Button variant="contained" onClick={handleSendJob} disabled={submitting || !!jobSuccess}>
            {submitting ? 'Sending…' : 'Send request'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add contractor</DialogTitle>
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
