import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Drawer,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import {
  AddTask,
  CalendarMonth,
  Email,
  PersonAdd,
  Phone,
  Send,
  WhatsApp
} from '@mui/icons-material';
import { leadCommunicationService } from '../../services/leadCommunicationService';
import { agentService } from '../../services/agentService';
import { leadService, CreateLeadInput, LeadDTO, LeadPipelineStage } from '../../services/leadService';
import api from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { viewingService, ViewingDTO } from '../../services/viewingService';

const PIPELINE_STAGES: Array<{ key: LeadPipelineStage; label: string; color: string }> = [
  { key: 'NEW', label: 'New Leads', color: '#2563eb' },
  { key: 'CONTACTED', label: 'Contacted', color: '#0891b2' },
  { key: 'VIEWING_SCHEDULED', label: 'Viewing Scheduled', color: '#7c3aed' },
  { key: 'VIEWED', label: 'Viewed', color: '#4f46e5' },
  { key: 'APPLICATION_RECEIVED', label: 'Applications', color: '#d97706' },
  { key: 'APPROVED', label: 'Approved', color: '#16a34a' },
  { key: 'LEASE_PENDING', label: 'Lease Pending', color: '#059669' },
  { key: 'CONVERTED', label: 'Converted', color: '#15803d' },
  { key: 'LOST', label: 'Lost', color: '#64748b' }
];

const SOURCE_LABELS = ['WhatsApp', 'PropertyBook', 'Referral', 'Facebook', 'Website', 'Walk-In', 'Email'];
const TASK_STORAGE_KEY = 'agent-tasks';

const normalizeStage = (lead: Partial<LeadDTO>): LeadPipelineStage => lead.pipelineStage || 'NEW';

const addDaysIso = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const formatDate = (value?: string | Date) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString();
};

const getPropertyRent = (property: any) => Number(property?.rent || property?.price || 0);

const getLeadBudgetMax = (lead: Partial<LeadDTO>) => {
  if (lead.budgetMax != null) return Number(lead.budgetMax);
  if (lead.budgetMin != null) return Number(lead.budgetMin);
  return undefined;
};

const calculatePropertyMatch = (lead: Partial<LeadDTO>, property: any) => {
  let score = 0;
  const reasons: string[] = [];
  const rent = getPropertyRent(property);
  const budgetMax = getLeadBudgetMax(lead);
  const budgetMin = lead.budgetMin != null ? Number(lead.budgetMin) : undefined;

  if (rent > 0 && (budgetMax || budgetMin)) {
    const aboveMin = budgetMin == null || rent >= budgetMin;
    const belowMax = budgetMax == null || rent <= budgetMax;
    if (aboveMin && belowMax) {
      score += 40;
      reasons.push('Budget match');
    } else if (budgetMax && rent <= budgetMax * 1.1) {
      score += 20;
      reasons.push('Close to budget');
    }
  }

  if (lead.minBedrooms != null && Number(property?.bedrooms || 0) >= Number(lead.minBedrooms)) {
    score += 20;
    reasons.push('Bedroom match');
  }

  const leadAreas = Array.isArray(lead.preferredSuburbs) ? lead.preferredSuburbs : [];
  const areaHaystack = `${property?.address || ''} ${property?.name || ''}`.toLowerCase();
  const areaHit = leadAreas.find((area) => areaHaystack.includes(String(area).toLowerCase()));
  if (areaHit || (lead.interest && areaHaystack.includes(String(lead.interest).toLowerCase()))) {
    score += 25;
    reasons.push('Area or property interest match');
  }

  if (lead.propertyType && property?.type && String(lead.propertyType).toLowerCase() === String(property.type).toLowerCase()) {
    score += 15;
    reasons.push('Property type match');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
};

const calculateLeadScore = (lead: LeadDTO, properties: any[], viewings: ViewingDTO[]) => {
  const bestMatch = properties.reduce((best, property) => {
    const match = calculatePropertyMatch(lead, property).score;
    return Math.max(best, match);
  }, 0);
  const leadViewings = viewings.filter((viewing) => String(viewing.leadId || '') === String(lead._id));
  const hasAttended = leadViewings.some((viewing) => ['Done', 'Completed'].includes(viewing.status));
  const hasNoShow = leadViewings.some((viewing) => ['No-show', 'No Show'].includes(viewing.status));
  const hasApplication = normalizeStage(lead) === 'APPLICATION_RECEIVED' || normalizeStage(lead) === 'APPROVED' || normalizeStage(lead) === 'LEASE_PENDING' || normalizeStage(lead) === 'CONVERTED';
  const recentActivity = lead.lastContactDate || lead.updatedAt || lead.createdAt;
  const daysSinceActivity = recentActivity ? (Date.now() - new Date(recentActivity).getTime()) / 86400000 : 99;

  let score = 0;
  score += Math.round(bestMatch * 0.4);
  score += lead.lastContactDate ? 15 : 0;
  score += hasAttended ? 20 : hasNoShow ? -10 : 0;
  score += hasApplication ? 20 : 0;
  score += daysSinceActivity <= 3 ? 15 : daysSinceActivity <= 7 ? 8 : 0;

  return Math.max(0, Math.min(100, Math.round(lead.leadScore ?? score)));
};

const getScoreCategory = (score: number) => {
  if (score >= 80) return { label: 'Hot', color: 'error' as const };
  if (score >= 60) return { label: 'Warm', color: 'warning' as const };
  return { label: 'Cold', color: 'default' as const };
};

const readAgentTasks = () => {
  try {
    const raw = localStorage.getItem(TASK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeAgentTasks = (tasks: any[]) => {
  localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
};

const upsertAgentTask = (task: any) => {
  const tasks = readAgentTasks();
  if (tasks.some((existing: any) => existing.id === task.id)) return;
  writeAgentTasks([...tasks, task]);
};

const createLocalFollowUpTasks = (lead: LeadDTO) => {
  const base = {
    clientName: lead.name,
    clientPhone: lead.phone,
    address: lead.interest || '',
    notes: lead.notes || '',
    notified: false
  };

  [
    { id: `lead-follow-up-${lead._id}-1`, title: `Follow-Up Lead: ${lead.name}`, type: 'follow_up', due: lead.nextFollowUpDate || addDaysIso(1) },
    { id: `lead-call-${lead._id}-3`, title: `Call Lead: ${lead.name}`, type: 'call', due: addDaysIso(3) },
    { id: `lead-viewing-${lead._id}-7`, title: `Schedule Viewing: ${lead.name}`, type: 'viewing', due: addDaysIso(7) },
    { id: `lead-options-${lead._id}-2`, title: `Send Property Options: ${lead.name}`, type: 'property_options', due: addDaysIso(2) },
    { id: `lead-application-${lead._id}-5`, title: `Application Reminder: ${lead.name}`, type: 'application_reminder', due: addDaysIso(5) }
  ].forEach((item) => {
    const due = new Date(item.due);
    upsertAgentTask({
      ...base,
      id: item.id,
      leadId: lead._id,
      type: item.type,
      title: item.title,
      date: due.toISOString().slice(0, 10),
      time: due.toISOString().slice(11, 16)
    });
  });
};

const AgentLeadsPage: React.FC = () => {
  const { user } = useAuth();
  const [leads, setLeads] = React.useState<LeadDTO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [properties, setProperties] = React.useState<any[]>([]);
  const [viewings, setViewings] = React.useState<ViewingDTO[]>([]);
  const [selectedLead, setSelectedLead] = React.useState<LeadDTO | null>(null);
  const [search, setSearch] = React.useState('');
  const [calendarView, setCalendarView] = React.useState<'month' | 'week' | 'agenda'>('agenda');
  const [quickActionMessage, setQuickActionMessage] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    source: '',
    interest: '',
    propertyId: '',
    budgetMin: '',
    budgetMax: '',
    preferredSuburbs: '',
    propertyType: '',
    minBedrooms: '',
    notes: '',
  });

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [list, viewingList] = await Promise.all([
        leadService.list(),
        viewingService.list().catch(() => [])
      ]);
      const normalizedLeads = (Array.isArray(list) ? list : []).map((lead: LeadDTO) => ({
        ...lead,
        pipelineStage: normalizeStage(lead)
      }));
      setLeads(normalizedLeads);
      setViewings(Array.isArray(viewingList) ? viewingList : []);
      normalizedLeads.forEach(createLocalFollowUpTasks);
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
        const available = props.filter((p: any) => ['available', 'under_offer'].includes((p?.status || '').toLowerCase()));
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
      const selectedProperty = properties.find((p:any)=> String(p._id)===String(form.propertyId));
      const payload: CreateLeadInput = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        source: form.source || undefined,
        interest: form.propertyId ? (selectedProperty?.name || form.interest) : (form.interest || undefined),
        pipelineStage: 'NEW',
        nextFollowUpDate: addDaysIso(1),
        followUpStatus: 'pending',
        interestedPropertyIds: form.propertyId ? [form.propertyId] : undefined,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        preferredSuburbs: form.preferredSuburbs || undefined,
        propertyType: form.propertyType || undefined,
        minBedrooms: form.minBedrooms ? Number(form.minBedrooms) : undefined,
        notes: form.notes || undefined,
      };
      const created = await leadService.create(payload);
      createLocalFollowUpTasks(created);
      setForm({ name: '', email: '', phone: '', source: '', interest: '', propertyId: '', budgetMin: '', budgetMax: '', preferredSuburbs: '', propertyType: '', minBedrooms: '', notes: '' });
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
      const selectedPropertyId = form.propertyId || lead.interestedPropertyIds?.[0] || properties[0]?._id;
      if (!selectedPropertyId) {
        setError('Select a property before scheduling a viewing');
        return;
      }
      const when = new Date(Date.now() + 3600_000).toISOString();
      await viewingService.create({ propertyId: String(selectedPropertyId), leadId: lead._id, when, status: 'Scheduled', notes: lead.notes || '' });
      if (lead._id) {
        await leadService.update(lead._id, {
          pipelineStage: 'VIEWING_SCHEDULED',
          activityNote: `Viewing scheduled for ${new Date(when).toLocaleString()}`
        });
      }

      // Also reflect on local schedule page (existing local-storage based tasks)
      try {
        const tasksStr = localStorage.getItem('agent-tasks');
        const tasks = tasksStr ? JSON.parse(tasksStr) : [];
        tasks.push({
          id: Math.random().toString(36).slice(2),
          type: 'viewing',
          title: `Viewing: ${lead.name}`,
          leadId: lead._id,
          date: new Date(when).toISOString().slice(0,10),
          time: new Date(when).toISOString().slice(11,16),
          clientName: lead.name,
          clientPhone: lead.phone,
          address: properties.find((p:any)=> String(p._id)===String(selectedPropertyId))?.address || '',
          notes: lead.notes || ''
        });
        localStorage.setItem('agent-tasks', JSON.stringify(tasks));
      } catch {}
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to schedule viewing');
    }
  };

  const filteredLeads = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return leads;
    return leads.filter((lead) => [lead.name, lead.email, lead.phone, lead.source, lead.interest, lead.notes].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [leads, search]);

  const leadsByStage = React.useMemo(() => {
    return PIPELINE_STAGES.reduce<Record<LeadPipelineStage, LeadDTO[]>>((acc, stage) => {
      acc[stage.key] = filteredLeads.filter((lead) => normalizeStage(lead) === stage.key);
      return acc;
    }, {} as Record<LeadPipelineStage, LeadDTO[]>);
  }, [filteredLeads]);

  const analytics = React.useMemo(() => {
    const scored = leads.map((lead) => ({ lead, score: calculateLeadScore(lead, properties, viewings) }));
    const converted = leads.filter((lead) => normalizeStage(lead) === 'CONVERTED');
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return {
      total: leads.length,
      hot: scored.filter((item) => item.score >= 80).length,
      scheduledViewings: viewings.filter((viewing) => viewing.status === 'Scheduled').length,
      conversionRate: leads.length ? Math.round((converted.length / leads.length) * 100) : 0,
      applicationsPending: leads.filter((lead) => normalizeStage(lead) === 'APPLICATION_RECEIVED').length,
      convertedThisMonth: converted.filter((lead) => lead.convertedAt && new Date(lead.convertedAt) >= monthStart).length
    };
  }, [leads, properties, viewings]);

  const attention = React.useMemo(() => {
    const now = Date.now();
    const overdueFollowUps = leads.filter((lead) => lead.nextFollowUpDate && new Date(lead.nextFollowUpDate).getTime() < now && normalizeStage(lead) !== 'CONVERTED' && normalizeStage(lead) !== 'LOST');
    const uncontacted = leads.filter((lead) => normalizeStage(lead) === 'NEW' && !lead.lastContactDate);
    const missedViewings = viewings.filter((viewing) => ['No-show', 'No Show'].includes(viewing.status));
    return { overdueFollowUps, uncontacted, missedViewings };
  }, [leads, viewings]);

  const sourceCounts = React.useMemo(() => {
    return SOURCE_LABELS.map((label) => ({
      label,
      count: leads.filter((lead) => String(lead.source || '').toLowerCase() === label.toLowerCase()).length
    }));
  }, [leads]);

  const selectedLeadViewings = React.useMemo(() => {
    if (!selectedLead) return [];
    return viewings.filter((viewing) => String(viewing.leadId || '') === String(selectedLead._id));
  }, [selectedLead, viewings]);

  const selectedRecommendedProperties = React.useMemo(() => {
    if (!selectedLead) return [];
    return properties
      .map((property) => {
        const match = calculatePropertyMatch(selectedLead, property);
        return { property, ...match };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [selectedLead, properties]);

  const handleDrop = async (stage: LeadPipelineStage, event: React.DragEvent) => {
    event.preventDefault();
    const leadId = event.dataTransfer.getData('text/plain');
    const lead = leads.find((item) => item._id === leadId);
    if (!lead || normalizeStage(lead) === stage) return;
    setLeads((prev) => prev.map((item) => item._id === leadId ? { ...item, pipelineStage: stage } : item));
    try {
      await leadService.update(leadId, { pipelineStage: stage });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update lead status');
      await load();
    }
  };

  const addFollowUp = async (lead: LeadDTO, days = 1) => {
    const due = addDaysIso(days);
    const nextTasks = [
      ...(lead.followUpTasks || []),
      {
        type: 'follow_up_lead',
        title: 'Follow-Up Lead',
        dueDate: due,
        status: 'pending' as const,
        notes: 'Created from lead detail'
      }
    ];
    await leadService.update(lead._id, { nextFollowUpDate: due, followUpStatus: 'pending', followUpTasks: nextTasks });
    createLocalFollowUpTasks({ ...lead, nextFollowUpDate: due });
    await load();
  };

  const markContacted = async (lead: LeadDTO) => {
    await leadService.update(lead._id, {
      pipelineStage: 'CONTACTED',
      lastContactDate: new Date().toISOString(),
      activityNote: 'Lead contacted from CRM pipeline'
    });
    await load();
  };

  const sendCommunicationHook = async (kind: 'whatsapp' | 'email', lead: LeadDTO) => {
    const message = `Hi ${lead.name}, we have property options that may fit your requirements.`;
    try {
      if (kind === 'whatsapp') {
        await leadCommunicationService.sendWhatsApp({ leadId: lead._id, leadName: lead.name, phone: lead.phone, message });
      } else {
        await leadCommunicationService.sendEmail({ leadId: lead._id, leadName: lead.name, email: lead.email, subject: 'Property options', message });
      }
      setQuickActionMessage(`${kind === 'whatsapp' ? 'WhatsApp' : 'Email'} sent`);
    } catch {
      setQuickActionMessage(`${kind === 'whatsapp' ? 'WhatsApp' : 'Email'} provider is not configured yet`);
    }
  };

  const convertLead = async (lead: LeadDTO) => {
    const selectedPropertyId = lead.interestedPropertyIds?.[0] || properties.find((property) => String(property.name || '') === String(lead.interest || ''))?._id;
    if (!selectedPropertyId) {
      setError('Select or match a property before converting this lead');
      return;
    }
    const [firstName, ...rest] = lead.name.trim().split(/\s+/);
    const lastName = rest.join(' ') || 'Tenant';
    try {
      setLoading(true);
      const tenant = await agentService.createTenant({
        firstName: firstName || lead.name,
        lastName,
        email: lead.email || '',
        phone: lead.phone || '',
        status: 'Pending',
        propertyId: selectedPropertyId,
        ownerId: (user as any)?._id,
        companyId: (user as any)?.companyId || ''
      });

      const property = properties.find((item) => String(item._id) === String(selectedPropertyId));
      const startDate = new Date();
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      let leaseId: string | undefined;
      if (property && getPropertyRent(property) > 0) {
        try {
          const lease = await agentService.createLease({
            propertyId: selectedPropertyId,
            tenantId: tenant?._id || tenant?.data?._id,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            rentAmount: getPropertyRent(property),
            depositAmount: getPropertyRent(property),
            status: 'draft',
            monthlyRent: getPropertyRent(property),
            securityDeposit: getPropertyRent(property),
            petDeposit: 0,
            isPetAllowed: false,
            maxOccupants: Math.max(1, Number(property?.bedrooms || 1) * 2),
            isUtilitiesIncluded: false,
            utilitiesDetails: '',
            rentDueDay: 1,
            lateFee: 0,
            gracePeriod: 5
          } as any);
          leaseId = lease?._id || lease?.data?._id;
        } catch {
          leaseId = undefined;
        }
      }

      await leadService.update(lead._id, {
        pipelineStage: 'CONVERTED',
        convertedTenantId: tenant?._id || tenant?.data?._id,
        convertedLeaseId: leaseId,
        convertedAt: new Date().toISOString(),
        archivedAt: new Date().toISOString(),
        activityNote: leaseId ? 'Lead converted to tenant and draft lease' : 'Lead converted to tenant'
      } as any);
      await load();
      setSelectedLead(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to convert lead');
    } finally {
      setLoading(false);
    }
  };

  const renderLeadCard = (lead: LeadDTO) => {
    const score = calculateLeadScore(lead, properties, viewings);
    const category = getScoreCategory(score);
    const propertyName = lead.interest || properties.find((property) => lead.interestedPropertyIds?.includes(String(property._id)))?.name || 'No property selected';
    return (
      <Paper
        key={lead._id}
        draggable
        onDragStart={(event) => event.dataTransfer.setData('text/plain', lead._id)}
        onClick={() => setSelectedLead(lead)}
        sx={{
          p: 1.5,
          mb: 1.25,
          borderRadius: 3,
          border: '1px solid #e2e8f0',
          cursor: 'grab',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
          '&:hover': { borderColor: '#93c5fd', transform: 'translateY(-1px)' }
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box>
            <Typography fontWeight={800}>{lead.name}</Typography>
            <Typography variant="caption" color="text.secondary">{propertyName}</Typography>
          </Box>
          <Chip size="small" label={category.label} color={category.color} />
        </Stack>
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary"><Phone fontSize="inherit" /> {lead.phone || 'No phone'}</Typography>
          <Typography variant="caption" color="text.secondary"><Email fontSize="inherit" /> {lead.email || 'No email'}</Typography>
          <Typography variant="caption" color="text.secondary">Source: {lead.source || 'Unknown'}</Typography>
          <Typography variant="caption" color="text.secondary">Created: {formatDate(lead.createdAt)}</Typography>
        </Stack>
        <Box sx={{ mt: 1 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" fontWeight={700}>Lead Score</Typography>
            <Typography variant="caption" fontWeight={800}>{score}/100</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={score} sx={{ height: 7, borderRadius: 999, mt: 0.5 }} />
        </Box>
      </Paper>
    );
  };

  const selectedLeadScore = selectedLead ? calculateLeadScore(selectedLead, properties, viewings) : 0;
  const selectedCategory = getScoreCategory(selectedLeadScore);

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Leads CRM Pipeline</Typography>
          <Typography color="text.secondary">Capture, track, match, follow up, schedule viewings, and convert rental leads.</Typography>
        </Box>
        <TextField
          label="Search leads"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          size="small"
          sx={{ minWidth: { md: 320 } }}
        />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {quickActionMessage && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setQuickActionMessage(null)}>{quickActionMessage}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 800 }}>Capture Lead</Typography>
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
                  <MenuItem key={p._id} value={p._id}>{p.name} {p.rent ? `- ${p.rent}` : ''}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField label="Budget Min" name="budgetMin" type="number" value={form.budgetMin} onChange={handleChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField label="Budget Max" name="budgetMax" type="number" value={form.budgetMax} onChange={handleChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField label="Area Requested" name="preferredSuburbs" value={form.preferredSuburbs} onChange={handleChange} fullWidth helperText="Comma separated" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField label="Property Type" name="propertyType" value={form.propertyType} onChange={handleChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField label="Bedrooms Needed" name="minBedrooms" type="number" value={form.minBedrooms} onChange={handleChange} fullWidth />
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

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          ['Total Leads', analytics.total],
          ['Hot Leads', analytics.hot],
          ['Scheduled Viewings', analytics.scheduledViewings],
          ['Conversion Rate', `${analytics.conversionRate}%`],
          ['Applications Pending', analytics.applicationsPending],
          ['Converted This Month', analytics.convertedThisMonth]
        ].map(([label, value]) => (
          <Grid item xs={12} sm={6} md={2} key={label}>
            <Card sx={{ height: '100%', borderRadius: 3 }}>
              <CardContent>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h5" fontWeight={900}>{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={800}>Leads Requiring Attention</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
                <Chip label={`${attention.overdueFollowUps.length} Overdue Follow-Ups`} color={attention.overdueFollowUps.length ? 'error' : 'default'} />
                <Chip label={`${attention.uncontacted.length} Uncontacted Leads`} color={attention.uncontacted.length ? 'warning' : 'default'} />
                <Chip label={`${attention.missedViewings.length} Missed Viewings`} color={attention.missedViewings.length ? 'error' : 'default'} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={800}>Lead Sources</Typography>
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                {sourceCounts.map((source) => (
                  <Box key={source.label}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption">{source.label}</Typography>
                      <Typography variant="caption" fontWeight={800}>{source.count}</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={analytics.total ? (source.count / analytics.total) * 100 : 0} sx={{ height: 8, borderRadius: 999 }} />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={800}>Conversion Funnel</Typography>
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                {[
                  ['New Leads', leadsByStage.NEW?.length || 0],
                  ['Contacted', leadsByStage.CONTACTED?.length || 0],
                  ['Viewed', leadsByStage.VIEWED?.length || 0],
                  ['Applied', leadsByStage.APPLICATION_RECEIVED?.length || 0],
                  ['Approved', leadsByStage.APPROVED?.length || 0],
                  ['Converted', leadsByStage.CONVERTED?.length || 0]
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption">{label}</Typography>
                      <Typography variant="caption" fontWeight={800}>{value}</Typography>
                    </Stack>
                    <LinearProgress color="success" variant="determinate" value={analytics.total ? (Number(value) / analytics.total) * 100 : 0} sx={{ height: 8, borderRadius: 999 }} />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ borderRadius: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 800 }}>Rental CRM Pipeline</Typography>
          {loading ? (
            <Typography color="text.secondary">Loading...</Typography>
          ) : (
            <Grid container spacing={2}>
              {PIPELINE_STAGES.map((stage) => (
                <Grid item xs={12} sm={6} md={4} xl={3} key={stage.key}>
                  <Box
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(stage.key, event)}
                    sx={{
                      height: '100%',
                      minHeight: 360,
                      p: 1.5,
                      borderRadius: 4,
                      bgcolor: '#f8fafc',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                      <Typography fontWeight={900} sx={{ lineHeight: 1.2 }}>{stage.label}</Typography>
                      <Chip size="small" label={leadsByStage[stage.key]?.length || 0} sx={{ bgcolor: stage.color, color: '#fff', fontWeight: 800 }} />
                    </Stack>
                    {(leadsByStage[stage.key] || []).map(renderLeadCard)}
                  </Box>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      <Drawer anchor="right" open={Boolean(selectedLead)} onClose={() => setSelectedLead(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 560 }, p: 3 } }}>
        {selectedLead && (
          <Stack spacing={3}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                <Box>
                  <Typography variant="h5" fontWeight={900}>{selectedLead.name}</Typography>
                  <Typography color="text.secondary">{selectedLead.source || 'Unknown source'} lead</Typography>
                </Box>
                <Chip label={`${selectedCategory.label} ${selectedLeadScore}/100`} color={selectedCategory.color} />
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
                <Chip label={PIPELINE_STAGES.find((stage) => stage.key === normalizeStage(selectedLead))?.label || 'New Leads'} />
                <Chip label={`Follow-up: ${formatDate(selectedLead.nextFollowUpDate)}`} />
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle1" fontWeight={900}>Contact Information</Typography>
              <Typography>{selectedLead.phone || 'No phone'}</Typography>
              <Typography>{selectedLead.email || 'No email'}</Typography>
              <Typography color="text.secondary">Assigned Agent: {(user as any)?.firstName || (user as any)?.email || 'Current agent'}</Typography>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={900}>Quick Actions</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                <Button size="small" variant="contained" startIcon={<Phone />} onClick={() => markContacted(selectedLead)}>Call Lead</Button>
                <Button size="small" variant="outlined" startIcon={<CalendarMonth />} onClick={() => scheduleViewing(selectedLead)}>Schedule Viewing</Button>
                <Button size="small" variant="outlined" startIcon={<Send />} onClick={() => setQuickActionMessage('Property matches ready to send once a communication provider is configured')}>Send Matching Properties</Button>
                <Button size="small" variant="outlined" startIcon={<AddTask />} onClick={() => addFollowUp(selectedLead)}>Add Follow-Up</Button>
                <Button size="small" variant="outlined" onClick={() => leadService.update(selectedLead._id, { pipelineStage: 'APPLICATION_RECEIVED' }).then(load)}>Create Application</Button>
                <Button size="small" variant="contained" color="success" startIcon={<PersonAdd />} onClick={() => convertLead(selectedLead)}>Convert To Tenant</Button>
                <Button size="small" variant="outlined" startIcon={<WhatsApp />} onClick={() => sendCommunicationHook('whatsapp', selectedLead)}>Send WhatsApp</Button>
                <Button size="small" variant="outlined" startIcon={<Email />} onClick={() => sendCommunicationHook('email', selectedLead)}>Send Email</Button>
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={900}>Interested Properties</Typography>
              <Typography color="text.secondary">{selectedLead.interest || 'No named property'}</Typography>
              <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                {selectedRecommendedProperties.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No recommended properties yet. Add budget, bedrooms, area, or property type to improve matching.</Typography>
                ) : selectedRecommendedProperties.map(({ property, score, reasons }) => (
                  <Paper key={property._id} sx={{ p: 1.5, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Typography fontWeight={800}>{property.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{property.address}</Typography>
                        <Typography variant="caption" display="block">Rent: {getPropertyRent(property) || 'N/A'} | Bedrooms: {property.bedrooms || 'N/A'} | Area: {property.area || 'N/A'}</Typography>
                      </Box>
                      <Chip label={`${score}%`} color={score >= 80 ? 'success' : score >= 60 ? 'warning' : 'default'} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{reasons.join(', ') || 'Partial match'}</Typography>
                  </Paper>
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={900}>Viewing History</Typography>
              <Tabs value={calendarView} onChange={(_, value) => setCalendarView(value)} sx={{ minHeight: 36 }}>
                <Tab value="month" label="Month" />
                <Tab value="week" label="Week" />
                <Tab value="agenda" label="Agenda" />
              </Tabs>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {selectedLeadViewings.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No viewings scheduled yet.</Typography>
                ) : selectedLeadViewings.map((viewing) => {
                  const property = properties.find((item) => String(item._id) === String(viewing.propertyId));
                  return (
                    <Paper key={viewing._id} sx={{ p: 1.5, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography fontWeight={800}>{property?.name || 'Property viewing'}</Typography>
                        <Chip size="small" label={viewing.status} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{new Date(viewing.when).toLocaleString()} | {viewing.outcome || 'Outcome pending'}</Typography>
                      {viewing.notes && <Typography variant="body2" sx={{ mt: 0.5 }}>{viewing.notes}</Typography>}
                    </Paper>
                  );
                })}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={900}>Lead Notes</Typography>
              <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{selectedLead.notes || 'No notes yet.'}</Typography>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={900}>Follow-Up Tasks</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {(selectedLead.followUpTasks || []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No follow-up tasks stored on this lead.</Typography>
                ) : (selectedLead.followUpTasks || []).map((task, index) => (
                  <Paper key={`${task.title}-${index}`} sx={{ p: 1.25, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography fontWeight={800}>{task.title}</Typography>
                      <Chip size="small" label={task.status || 'pending'} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">Due: {formatDate(task.dueDate)}</Typography>
                    {task.notes && <Typography variant="body2">{task.notes}</Typography>}
                  </Paper>
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={900}>Activity Timeline</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {(selectedLead.activityTimeline || []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No activity yet.</Typography>
                ) : [...(selectedLead.activityTimeline || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((activity, index) => (
                  <Box key={`${activity.type}-${index}`} sx={{ borderLeft: '3px solid #2563eb', pl: 1.5 }}>
                    <Typography fontWeight={800}>{activity.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(activity.createdAt)}</Typography>
                    {activity.notes && <Typography variant="body2">{activity.notes}</Typography>}
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </Drawer>
    </Box>
  );
};

export default AgentLeadsPage;


