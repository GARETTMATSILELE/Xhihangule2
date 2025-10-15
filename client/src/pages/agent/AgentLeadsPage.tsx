import React from 'react';
import { Box, Card, CardContent, Typography, Grid, TextField, MenuItem, Button } from '@mui/material';
import { leadService, CreateLeadInput } from '../../services/leadService';
import api from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { viewingService } from '../../services/viewingService';

const AgentLeadsPage: React.FC = () => {
  const { user } = useAuth();
  const [leads, setLeads] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [properties, setProperties] = React.useState<any[]>([]);

  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    source: '',
    interest: '',
    propertyId: '',
    notes: '',
  });

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await leadService.list();
      setLeads(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    (async () => {
      try {
        // Load only this agent's properties and filter to available
        const res = await api.get('/agents/properties');
        const props = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        const available = props.filter((p: any) => (p?.status || '').toLowerCase() === 'available');
        setProperties(available);
      } catch {
        setProperties([]);
      }
    })();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  const saveLead = async () => {
    if (!form.name?.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const payload: CreateLeadInput = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        source: form.source || undefined,
        interest: form.propertyId ? (properties.find((p:any)=> String(p._id)===String(form.propertyId))?.name || form.interest) : (form.interest || undefined),
        notes: form.notes || undefined,
      };
      await leadService.create(payload);
      setForm({ name: '', email: '', phone: '', source: '', interest: '', propertyId: '', notes: '' });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save lead');
    } finally {
      setLoading(false);
    }
  };

  const scheduleViewing = async (lead: any) => {
    try {
      // Prefill using lead info; only name and phone mandated at UX level
      const selectedPropertyId = form.propertyId || properties[0]?._id;
      if (!selectedPropertyId) {
        setError('Select a property before scheduling a viewing');
        return;
      }
      const when = new Date(Date.now() + 3600_000).toISOString();
      await viewingService.create({ propertyId: String(selectedPropertyId), when, notes: lead.notes || '' });

      // Also reflect on local schedule page (existing local-storage based tasks)
      try {
        const tasksStr = localStorage.getItem('agent-tasks');
        const tasks = tasksStr ? JSON.parse(tasksStr) : [];
        tasks.push({
          id: Math.random().toString(36).slice(2),
          type: 'viewing',
          title: `Viewing: ${lead.name}`,
          date: new Date(when).toISOString().slice(0,10),
          time: new Date(when).toISOString().slice(11,16),
          clientName: lead.name,
          clientPhone: lead.phone,
          address: properties.find((p:any)=> String(p._id)===String(selectedPropertyId))?.address || '',
          notes: lead.notes || ''
        });
        localStorage.setItem('agent-tasks', JSON.stringify(tasks));
      } catch {}
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to schedule viewing');
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 600 }}>Leads</Typography>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Client Name" name="name" value={form.name} onChange={handleChange} fullWidth required />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Email" name="email" value={form.email} onChange={handleChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Phone" name="phone" value={form.phone} onChange={handleChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Lead Source" name="source" value={form.source} onChange={handleChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField select label="Property Interested" name="propertyId" value={form.propertyId} onChange={handleChange} fullWidth>
                <MenuItem value="">-- Select property --</MenuItem>
                {properties.map((p:any)=> (
                  <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Notes" name="notes" value={form.notes} onChange={handleChange} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button variant="contained" onClick={saveLead} disabled={loading}>Save Lead</Button>
                <Button variant="outlined" onClick={() => scheduleViewing({ name: form.name, phone: form.phone, notes: form.notes })} disabled={!form.name}>Schedule Viewing</Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>My Leads</Typography>
          {loading ? (
            <Typography color="text.secondary">Loading…</Typography>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2">Name</th>
                    <th className="py-2">Source</th>
                    <th className="py-2">Interest</th>
                    <th className="py-2">Phone</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Notes</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead._id} className="border-t">
                      <td className="py-2 font-medium">{lead.name}</td>
                      <td className="py-2">{lead.source}</td>
                      <td className="py-2">{lead.interest}</td>
                      <td className="py-2">{lead.phone}</td>
                      <td className="py-2">{lead.email}</td>
                      <td className="py-2 max-w-[320px]">
                        <span className="block whitespace-pre-wrap break-words text-slate-700">{lead.notes}</span>
                      </td>
                      <td className="py-2 flex gap-2">
                        <Button size="small" onClick={() => scheduleViewing(lead)}>Schedule Viewing</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default AgentLeadsPage;


