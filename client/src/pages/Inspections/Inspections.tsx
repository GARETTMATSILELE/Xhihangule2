import React, { useEffect, useState } from 'react';
import { Typography, Box, Button, Card, CardContent, Grid, Chip, TextField, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Stack, Divider, LinearProgress } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { useNotification } from '../../components/Layout/Header';
import { inspectionService, InspectionRecord } from '../../services/inspectionService';
import {
  fetchWorkspaceLeases,
  fetchWorkspaceProperties,
  fetchWorkspaceTenants,
  shouldUseAgentDataRoutes
} from '../../utils/workspaceDataSources';

type PropertyLite = { _id: string; name?: string; address?: string; ownerId?: any; propertyOwnerId?: any };
type TenantLite = { _id: string; firstName?: string; lastName?: string; email?: string; phone?: string };
type LeaseLite = { _id: string; propertyId: any; tenantId: any; startDate: string; endDate: string; status: string };

const inspectionStatusLabels: Record<string, string> = {
  scheduled: 'Scheduled',
  upcoming: 'Upcoming',
  due_today: 'Due Today',
  overdue: 'Overdue',
  completed: 'Completed',
  missed: 'Missed',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
};

const inspectionTypeLabels: Record<string, string> = {
  move_in: 'Move-In',
  routine: 'Routine',
  follow_up: 'Follow-Up',
  move_out: 'Move-Out',
  emergency: 'Emergency',
};

type ReportDraft = {
  conditionSummary?: string;
  issuesFound?: string;
  actionsRequired?: string;
  inspectorName?: string;
  inspectedAt?: Dayjs | null;
  conditionScore?: number;
  conditionRating?: InspectionRecord['conditionRating'];
  followUpRequired?: boolean;
};

export const Inspections: React.FC = () => {
  const { user } = useAuth();
  const { company } = useCompany();
  const location = useLocation();
  const useAgentRoutes = shouldUseAgentDataRoutes(location.pathname, {
    workspaceType: company?.workspaceType,
    plan: company?.plan,
    role: user?.role
  });
  const { addNotification } = useNotification();
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [tenantsByProperty, setTenantsByProperty] = useState<Record<string, TenantLite[]>>({});
  const [leases, setLeases] = useState<LeaseLite[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [operations, setOperations] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [selectedLeaseId, setSelectedLeaseId] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<Dayjs | null>(dayjs());
  const [scheduledTime, setScheduledTime] = useState<string>('09:00');
  const [inspectionType, setInspectionType] = useState<string>('routine');
  const [frequency, setFrequency] = useState<string>('quarterly');
  const [customIntervalDays, setCustomIntervalDays] = useState<number>(90);
  const [notes, setNotes] = useState<string>('');
  const [rescheduleOpen, setRescheduleOpen] = useState<boolean>(false);
  const [rescheduleInspectionId, setRescheduleInspectionId] = useState<string>('');
  const [rescheduleReason, setRescheduleReason] = useState<string>('');
  const [tenantConfirmationNotes, setTenantConfirmationNotes] = useState<string>('');
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [reportDraft, setReportDraft] = useState<ReportDraft>({ inspectedAt: dayjs(), conditionScore: 80, conditionRating: 'good' });
  const [reportInspectionId, setReportInspectionId] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [expandedProps, setExpandedProps] = useState<Record<string, boolean>>({});

  // Normalize possible id shapes (string, {$oid}, {_id}, embedded doc)
  const getId = (id: any): string => {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (typeof id === 'object') {
      if (id.$oid) return id.$oid;
      if (id._id) {
        if (typeof id._id === 'string') return id._id;
        if (id._id && typeof id._id === 'object' && id._id.$oid) return id._id.$oid;
      }
      if (id.id) {
        if (typeof id.id === 'string') return id.id;
        if (id.id && typeof id.id === 'object' && id.id.$oid) return id.id.$oid;
      }
    }
    return '';
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setActionError('');
      const [props, tenantsRaw, leaseRows, insp, ops] = await Promise.all([
        fetchWorkspaceProperties(useAgentRoutes),
        fetchWorkspaceTenants(useAgentRoutes),
        fetchWorkspaceLeases(useAgentRoutes),
        inspectionService.getInspections(),
        inspectionService.getOperations().catch(() => null)
      ]);
      setProperties(props);
      setLeases(leaseRows);

      const byProp: Record<string, TenantLite[]> = {};
      tenantsRaw.forEach((t) => {
        const pid = getId(t.propertyId) || t.property || t.property_id;
        if (!pid) return;
        if (!byProp[pid]) byProp[pid] = [];
        byProp[pid].push({ _id: t._id, firstName: t.firstName, lastName: t.lastName, email: t.email, phone: t.phone });
      });
      setTenantsByProperty(byProp);
      setInspections(insp);
      setOperations(ops);
    } catch (error) {
      console.error('Error loading inspections', error);
      setActionError('Failed to load inspection operations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?._id]);

  // Generate reminders for upcoming quarterly inspections (within next 30 days)
  useEffect(() => {
    const now = dayjs();
    const in30 = now.add(30, 'day');
    inspections
      .filter(i => i.nextInspectionDate && dayjs(i.nextInspectionDate).isAfter(now) && dayjs(i.nextInspectionDate).isBefore(in30))
      .forEach(i => {
        addNotification({
          id: `inspection-${i._id}-${i.nextInspectionDate}`,
          title: 'Upcoming Inspection',
          message: `${i.property?.address || i.property?.name || 'Property'}: next inspection on ${dayjs(i.nextInspectionDate).format('YYYY-MM-DD')}`,
          link: '/agent-dashboard/inspections',
          read: false,
          createdAt: new Date()
        });
      });
  }, [inspections, addNotification]);

  const openSchedule = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    const tenants = tenantsByProperty[propertyId] || [];
    setSelectedTenantId(tenants[0]?._id || '');
    const propertyLease = leases.find((lease) => getId(lease.propertyId) === getId(propertyId) && ['active', 'expiring_soon', 'pending_approval'].includes(lease.status));
    setSelectedLeaseId(propertyLease?._id || '');
    setScheduledDate(dayjs());
    setScheduledTime('09:00');
    setInspectionType('routine');
    setFrequency('quarterly');
    setNotes('');
    setDialogOpen(true);
  };

  const handleSchedule = async () => {
    if (!selectedPropertyId || !scheduledDate) return;
    await inspectionService.createInspection({
      propertyId: selectedPropertyId,
      tenantId: selectedTenantId || undefined,
      leaseId: selectedLeaseId || undefined,
      scheduledDate: scheduledDate.toDate(),
      scheduledTime,
      frequency: frequency as any,
      customIntervalDays: frequency === 'custom' ? customIntervalDays : undefined,
      type: inspectionType as any,
      notes
    });
    await loadData();
    setDialogOpen(false);
  };

  const generateLeaseSchedules = async () => {
    try {
      setActionError('');
      setActionMessage('');
      const result = await inspectionService.generateFromLeases({ frequency: 'quarterly', includeMoveIn: true, includeMoveOut: true });
      setActionMessage(`${result.createdCount} lease-driven inspection${result.createdCount === 1 ? '' : 's'} generated.`);
      await loadData();
    } catch (error) {
      console.error('Error generating lease inspections', error);
      setActionError('Failed to generate lease-driven inspection schedules.');
    }
  };

  const syncInspectionReminders = async () => {
    try {
      setActionError('');
      const result = await inspectionService.dispatchReminders();
      setActionMessage(`${result.sentCount} inspection reminder${result.sentCount === 1 ? '' : 's'} sent to notifications.`);
      await loadData();
    } catch (error) {
      console.error('Error syncing inspection reminders', error);
      setActionError('Failed to sync inspection reminders.');
    }
  };

  const openReschedule = (inspectionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = inspections.find(i => i._id === inspectionId);
    setRescheduleInspectionId(inspectionId);
    setScheduledDate(target?.scheduledDate ? dayjs(target.scheduledDate) : dayjs());
    setScheduledTime(target?.scheduledTime || '09:00');
    setRescheduleReason('');
    setTenantConfirmationNotes('');
    setRescheduleOpen(true);
  };

  const saveReschedule = async () => {
    if (!rescheduleInspectionId || !scheduledDate || !rescheduleReason.trim()) return;
    await inspectionService.reschedule(rescheduleInspectionId, {
      scheduledDate: scheduledDate.toISOString(),
      scheduledTime,
      reason: rescheduleReason,
      tenantConfirmationNotes
    });
    await loadData();
    setRescheduleOpen(false);
  };

  const createFollowUp = async (inspectionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await inspectionService.createFollowUp(inspectionId, {
      scheduledDate: dayjs().add(30, 'day').toISOString(),
      scheduledTime: '09:00',
      notes: 'Follow-up inspection created from inspection findings.'
    });
    await loadData();
  };

  const escalateMaintenance = async (inspectionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await inspectionService.escalateToMaintenance(inspectionId);
    setActionMessage('Maintenance request created from inspection findings.');
    await loadData();
  };

  const openReport = (inspectionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReportInspectionId(inspectionId);
    const target = inspections.find(i => i._id === inspectionId);
    setReportDraft({
      conditionSummary: target?.report?.conditionSummary || '',
      issuesFound: target?.report?.issuesFound || '',
      actionsRequired: target?.report?.actionsRequired || '',
      inspectorName: target?.report?.inspectorName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
      inspectedAt: target?.report?.inspectedAt ? dayjs(target.report.inspectedAt) : dayjs(),
      conditionScore: target?.conditionScore ?? 80,
      conditionRating: (target?.conditionRating || 'good') as InspectionRecord['conditionRating'],
      followUpRequired: Boolean(target?.followUpRequired)
    });
    setReportOpen(true);
  };

  const saveReport = async () => {
    if (!reportInspectionId) return;
    try {
      setActionError('');
      const inspectedAt = reportDraft.inspectedAt || dayjs();
      const updated = await inspectionService.updateReport(reportInspectionId, {
        conditionSummary: reportDraft.conditionSummary,
        issuesFound: reportDraft.issuesFound,
        actionsRequired: reportDraft.actionsRequired,
        inspectorName: reportDraft.inspectorName,
        inspectedAt: inspectedAt.toISOString(),
        conditionScore: reportDraft.conditionScore,
        conditionRating: reportDraft.conditionRating,
        followUpRequired: reportDraft.followUpRequired
      });
      await loadData();
      setReportOpen(false);
      setActionMessage(
        `Inspection completed on ${dayjs(updated.completedAt || inspectedAt).format('DD MMM YYYY')}.`
      );
    } catch (error) {
      console.error('Error saving inspection report', error);
      setActionError('Failed to save inspection report.');
    }
  };

  const reportInspection = inspections.find((i) => i._id === reportInspectionId);
  const isCalendarReportable = (inspection: any) => {
    const status = inspection.effectiveStatus || inspection.status || 'scheduled';
    return status === 'overdue' || status === 'due_today';
  };

  const uploadAttachment = async (inspectionId: string, file: File) => {
    try {
      setUploading(true);
      const updated = await inspectionService.uploadAttachment(inspectionId, file);
      setInspections(prev => prev.map(i => i._id === updated._id ? updated : i));
    } finally {
      setUploading(false);
    }
  };

  const printReport = (inspectionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const i = inspections.find(x => x._id === inspectionId);
    if (!i) return;
    // Simple browser print for now; can upgrade to jsPDF on request
    const win = window.open('', '_blank');
    if (!win) return;
    const tenantLine = i.tenantId ? `Tenant: ${i.tenantId}` : '';
    win.document.write(`
      <html><head><title>Inspection Report</title></head><body>
      <h1>Inspection Report</h1>
      <p><strong>Property:</strong> ${i.property?.name || ''} - ${i.property?.address || ''}</p>
      <p><strong>Scheduled:</strong> ${new Date(i.scheduledDate).toLocaleDateString()}</p>
      <p><strong>Inspected:</strong> ${i.report?.inspectedAt ? new Date(i.report.inspectedAt).toLocaleDateString() : ''}</p>
      <p>${tenantLine}</p>
      <h3>Summary</h3>
      <p>${(i.report?.conditionSummary || '').replace(/\n/g, '<br/>')}</p>
      <h3>Issues Found</h3>
      <p>${(i.report?.issuesFound || '').replace(/\n/g, '<br/>')}</p>
      <h3>Actions Required</h3>
      <p>${(i.report?.actionsRequired || '').replace(/\n/g, '<br/>')}</p>
      <p><strong>Inspector:</strong> ${i.report?.inspectorName || ''}</p>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const printPropertyReports = (propertyId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const pId = getId(propertyId);
    const propInspections = inspections.filter(i => getId(i.propertyId) === pId);
    const win = window.open('', '_blank');
    if (!win) return;
    const property = properties.find(p => getId(p._id) === pId);
    const title = `Inspection Reports - ${property?.name || ''}`;
    const address = property?.address || '';
    const sections = propInspections.map((i) => {
      const attachments = (i.attachments || []) as any[];
      return `
        <section style="page-break-inside: avoid; margin-bottom: 16px;">
          <h3 style="margin: 6px 0;">Inspection on ${i.scheduledDate ? new Date(i.scheduledDate).toLocaleDateString() : 'N/A'}</h3>
          ${i.nextInspectionDate ? `<p><strong>Next:</strong> ${new Date(i.nextInspectionDate).toLocaleDateString()}</p>` : ''}
          <p><strong>Inspector:</strong> ${i.report?.inspectorName || '-'}</p>
          ${i.report?.inspectedAt ? `<p><strong>Inspected:</strong> ${new Date(i.report.inspectedAt).toLocaleDateString()}</p>` : ''}
          ${i.report?.conditionSummary ? `<h4>Condition Summary</h4><p>${String(i.report.conditionSummary).replace(/\n/g, '<br/>')}</p>` : ''}
          ${i.report?.issuesFound ? `<h4>Issues Found</h4><p>${String(i.report.issuesFound).replace(/\n/g, '<br/>')}</p>` : ''}
          ${i.report?.actionsRequired ? `<h4>Actions Required</h4><p>${String(i.report.actionsRequired).replace(/\n/g, '<br/>')}</p>` : ''}
          ${attachments.length ? `<h4>Attachments</h4><ul>${attachments.map(a => `<li>${a.fileName} (${a.fileType})</li>`).join('')}</ul>` : ''}
        </section>
      `;
    }).join('');
    win.document.write(`
      <html><head><title>${title}</title></head><body>
      <h1>${title}</h1>
      <p><strong>Property:</strong> ${property?.name || ''} - ${address}</p>
      ${sections || '<p>No inspections found.</p>'}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Inspection Compliance Engine
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Lease-linked recurring inspections, move-in/move-out baselines, compliance queues, reports, and maintenance escalation.
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {actionError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>{actionError}</Alert>}
      {actionMessage && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionMessage('')}>{actionMessage}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 3 }}>
        <Button variant="contained" onClick={generateLeaseSchedules}>Generate From Active Leases</Button>
        <Button variant="outlined" onClick={syncInspectionReminders}>Sync Due Reminders</Button>
        <Button variant="outlined" onClick={loadData}>Refresh Queue</Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          ['Due This Week', operations?.dueThisWeek?.length || 0, 'info'],
          ['Overdue', operations?.overdue?.length || 0, 'error'],
          ['Rescheduled', operations?.rescheduled?.length || 0, 'warning'],
          ['Move-Out Pending', operations?.pendingMoveOut?.length || 0, 'secondary'],
          ['Awaiting Follow-Up', operations?.awaitingFollowUp?.length || 0, 'warning'],
          ['Recently Completed', operations?.recentlyCompleted?.length || 0, 'success'],
        ].map(([label, count, color]) => (
          <Grid item xs={12} sm={6} md={2} key={String(label)}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">{label}</Typography>
                <Typography variant="h5">{count}</Typography>
                <Chip label="Operational queue" size="small" color={color as any} sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Inspection Calendar</Typography>
          <Grid container spacing={1}>
            {inspections
              .slice()
              .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
              .slice(0, 12)
              .map((inspection) => {
                const status = inspection.effectiveStatus || inspection.status || 'scheduled';
                const clickable = isCalendarReportable(inspection);
                const completedAt = inspection.completedAt || inspection.report?.inspectedAt;
                return (
                  <Grid item xs={12} md={4} key={`calendar-${inspection._id}`}>
                    <Card
                      variant="outlined"
                      onClick={() => clickable && openReport(inspection._id)}
                      sx={{
                        cursor: clickable ? 'pointer' : 'default',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                        ...(clickable ? {
                          '&:hover': {
                            borderColor: 'error.main',
                            boxShadow: 2
                          }
                        } : {})
                      }}
                    >
                      <CardContent>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                          <Typography sx={{ fontWeight: 600 }}>
                            {status === 'completed' && completedAt
                              ? dayjs(completedAt).format('DD MMM YYYY')
                              : inspection.scheduledDate
                                ? dayjs(inspection.scheduledDate).format('DD MMM YYYY')
                                : 'No date'}
                          </Typography>
                          <Chip label={inspectionStatusLabels[status] || status} size="small" color={status === 'overdue' ? 'error' : status === 'completed' ? 'success' : status === 'due_today' ? 'warning' : 'default'} />
                        </Stack>
                        <Typography color="text.secondary">{inspection.property?.name || inspection.property?.address || 'Property'}</Typography>
                        <Typography variant="body2">{inspectionTypeLabels[inspection.type || 'routine']}</Typography>
                        {status === 'completed' && completedAt && (
                          <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                            Completed {dayjs(completedAt).format('DD MMM YYYY')}
                          </Typography>
                        )}
                        {clickable && (
                          <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
                            Click to complete inspection report
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            {!inspections.length && (
              <Grid item xs={12}>
                <Typography color="text.secondary">No inspections scheduled yet.</Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {properties.map((p) => {
          const pId = getId(p._id);
          const propInspections = inspections.filter(i => getId(i.propertyId) === pId);
          const next = propInspections
            .map(i => i.nextInspectionDate ? dayjs(i.nextInspectionDate) : (i.scheduledDate ? dayjs(i.scheduledDate) : null))
            .filter(Boolean)
            .sort((a: any, b: any) => (a!.valueOf() - b!.valueOf()))[0] as Dayjs | undefined;

          const tenants = tenantsByProperty[p._id] || [];
          const mainTenant = tenants[0];
          const activeLease = leases.find((lease) => getId(lease.propertyId) === pId && ['active', 'expiring_soon', 'pending_approval'].includes(lease.status));

          return (
            <Grid item xs={12} key={p._id}>
              <Card onClick={() => setExpandedProps(prev => ({ ...prev, [pId]: !prev[pId] }))} sx={{ cursor: 'pointer' }}>
                <CardContent>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={5}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{p.name || 'Property'}</Typography>
                      <Typography color="text.secondary">{p.address || ''}</Typography>
                      {p.propertyOwnerId && (
                        <Typography color="text.secondary">Owner: {typeof p.propertyOwnerId === 'object' ? `${p.propertyOwnerId.firstName || ''} ${p.propertyOwnerId.lastName || ''}`.trim() : ''}</Typography>
                      )}
                      {mainTenant && (
                        <Typography color="text.secondary">
                          Tenant: {(mainTenant.firstName || '') + ' ' + (mainTenant.lastName || '')}
                        </Typography>
                      )}
                      {activeLease && (
                        <Typography color="text.secondary">
                          Lease: {dayjs(activeLease.startDate).format('YYYY-MM-DD')} - {dayjs(activeLease.endDate).format('YYYY-MM-DD')}
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography color="text.secondary">Next Inspection</Typography>
                      <Typography>{next ? next.format('YYYY-MM-DD') : 'Not scheduled'}</Typography>
                      {next && (
                        <Chip label="Lease-linked compliance" size="small" sx={{ mt: 1 }} />
                      )}
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                        <Button variant="contained" onClick={(e) => { e.stopPropagation(); openSchedule(p._id); }}>Schedule</Button>
                        {propInspections[0] && (
                          <Button variant="outlined" onClick={(e) => openReport(propInspections[0]._id, e)}>Report</Button>
                        )}
                        <Button variant="outlined" onClick={(e) => printPropertyReports(p._id as any, e)} disabled={propInspections.length === 0}>Print</Button>
                      </Box>
                    </Grid>
                  </Grid>

                  {expandedProps[pId] && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Scheduled Inspections</Typography>
                      {propInspections.length === 0 ? (
                        <Typography color="text.secondary">No inspections scheduled.</Typography>
                      ) : (
                        <Grid container spacing={2}>
                          {propInspections
                            .sort((a: any, b: any) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
                            .map((i: any) => (
                              <Grid item xs={12} key={i._id}>
                                <Card variant="outlined" onClick={(e)=>e.stopPropagation()}>
                                  <CardContent>
                                    <Grid container spacing={2}>
                                      <Grid item xs={12} md={4}>
                                        <Typography color="text.secondary">Scheduled</Typography>
                                        <Typography>{i.scheduledDate ? new Date(i.scheduledDate).toLocaleDateString() : 'N/A'}</Typography>
                                        {i.nextInspectionDate && (
                                          <Typography color="text.secondary">Next: {new Date(i.nextInspectionDate).toLocaleDateString()}</Typography>
                                        )}
                                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                                          <Chip size="small" label={inspectionTypeLabels[i.type || 'routine']} />
                                          <Chip
                                            size="small"
                                            label={inspectionStatusLabels[i.effectiveStatus || i.status || 'scheduled']}
                                            color={(i.effectiveStatus || i.status) === 'overdue' ? 'error' : (i.effectiveStatus || i.status) === 'completed' ? 'success' : 'default'}
                                          />
                                        </Stack>
                                        {i.originalScheduledDate && i.status === 'rescheduled' && (
                                          <Typography variant="caption" color="text.secondary">
                                            Original: {new Date(i.originalScheduledDate).toLocaleDateString()}
                                          </Typography>
                                        )}
                                      </Grid>
                                      <Grid item xs={12} md={5}>
                                        <Typography color="text.secondary">Inspector</Typography>
                                        <Typography>{i.report?.inspectorName || '-'}</Typography>
                                        {i.conditionScore !== undefined && (
                                          <Typography color="text.secondary">Condition score: {i.conditionScore}/100 ({String(i.conditionRating || '').replace('_', ' ')})</Typography>
                                        )}
                                      </Grid>
                                      <Grid item xs={12} md={3}>
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' }, flexWrap: 'wrap' }}>
                                          <Button size="small" variant="outlined" onClick={(e)=>openReport(i._id, e)}>Edit Report</Button>
                                          <Button size="small" variant="outlined" onClick={(e)=>openReschedule(i._id, e)}>Reschedule</Button>
                                          <Button size="small" variant="outlined" onClick={(e)=>createFollowUp(i._id, e)}>Follow-Up</Button>
                                          <Button size="small" variant="outlined" color="warning" onClick={(e)=>escalateMaintenance(i._id, e)}>Maintenance</Button>
                                          <Button size="small" variant="outlined" onClick={(e)=>printReport(i._id, e)}>Print</Button>
                                        </Box>
                                      </Grid>
                                    </Grid>
                                  </CardContent>
                                </Card>
                              </Grid>
                            ))}
                        </Grid>
                      )}

                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>Documents</Typography>
                      {(() => {
                        const files = propInspections.flatMap((i: any) => (i.attachments || []).map((a: any) => ({ ...a, _inspectionId: i._id })));
                        if (files.length === 0) return <Typography color="text.secondary">No documents uploaded.</Typography>;
                        return (
                          <Grid container spacing={2}>
                            {files.map((f: any, idx: number) => (
                              <Grid item xs={12} md={6} key={`${f._inspectionId}-${idx}`}>
                                <Card variant="outlined" onClick={(e)=>e.stopPropagation()}>
                                  <CardContent>
                                    <Typography sx={{ fontWeight: 600 }}>{f.fileName}</Typography>
                                    <Typography color="text.secondary" sx={{ mb: 1 }}>{f.fileType}</Typography>
                                    <Button size="small" href={`data:${f.fileType};base64,${f.fileUrl}`} target="_blank" rel="noopener noreferrer">View</Button>
                                    <Button size="small" sx={{ ml: 1 }} href={`data:${f.fileType};base64,${f.fileUrl}`} download={f.fileName}>Download</Button>
                                  </CardContent>
                                </Card>
                              </Grid>
                            ))}
                          </Grid>
                        );
                      })()}

                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>Reports</Typography>
                      {(() => {
                        const reports = propInspections.filter((i: any) => i.report && (i.report.conditionSummary || i.report.issuesFound || i.report.actionsRequired || i.report.inspectorName));
                        if (reports.length === 0) return <Typography color="text.secondary">No reports yet.</Typography>;
                        return (
                          <Grid container spacing={2}>
                            {reports.map((i: any) => (
                              <Grid item xs={12} key={`rep-${i._id}`}>
                                <Card variant="outlined" onClick={(e)=>e.stopPropagation()}>
                                  <CardContent>
                                    <Typography sx={{ fontWeight: 600, mb: 1 }}>Report ({i.report?.inspectorName || 'Unknown'})</Typography>
                                    <Typography color="text.secondary">Inspected: {i.report?.inspectedAt ? new Date(i.report.inspectedAt).toLocaleDateString() : '-'}</Typography>
                                    {i.report?.conditionSummary && (
                                      <Box sx={{ mt: 1 }}>
                                        <Typography sx={{ fontWeight: 600 }}>Condition Summary</Typography>
                                        <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{i.report.conditionSummary}</Typography>
                                      </Box>
                                    )}
                                    {i.report?.issuesFound && (
                                      <Box sx={{ mt: 1 }}>
                                        <Typography sx={{ fontWeight: 600 }}>Issues Found</Typography>
                                        <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{i.report.issuesFound}</Typography>
                                      </Box>
                                    )}
                                    {i.report?.actionsRequired && (
                                      <Box sx={{ mt: 1 }}>
                                        <Typography sx={{ fontWeight: 600 }}>Actions Required</Typography>
                                        <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{i.report.actionsRequired}</Typography>
                                      </Box>
                                    )}
                                  </CardContent>
                                </Card>
                              </Grid>
                            ))}
                          </Grid>
                        );
                      })()}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule Inspection</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            label="Lease / Occupancy period"
            value={selectedLeaseId}
            onChange={(e) => setSelectedLeaseId(e.target.value)}
            sx={{ mt: 2 }}
            helperText="Optional for legacy/manual inspections. Required for lease-driven compliance history."
          >
            <MenuItem value="">Legacy property-only inspection</MenuItem>
            {leases.filter((lease) => getId(lease.propertyId) === getId(selectedPropertyId)).map((lease) => (
              <MenuItem key={lease._id} value={lease._id}>
                {dayjs(lease.startDate).format('YYYY-MM-DD')} - {dayjs(lease.endDate).format('YYYY-MM-DD')} ({lease.status})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            fullWidth
            label="Tenant (optional)"
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            sx={{ mt: 2 }}
          >
            <MenuItem value="">None</MenuItem>
            {(tenantsByProperty[selectedPropertyId] || []).map(t => (
              <MenuItem key={t._id} value={t._id}>{(t.firstName || '') + ' ' + (t.lastName || '')}</MenuItem>
            ))}
          </TextField>

          <Box sx={{ mt: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker label="Inspection date" value={scheduledDate} onChange={setScheduledDate as any} />
            </LocalizationProvider>
          </Box>

          <TextField
            fullWidth
            label="Inspection time"
            type="time"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
          />

          <TextField
            select
            fullWidth
            label="Inspection type"
            value={inspectionType}
            onChange={(e) => setInspectionType(e.target.value)}
            sx={{ mt: 2 }}
          >
            {Object.entries(inspectionTypeLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </TextField>

          <TextField
            select
            fullWidth
            label="Recurrence"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            sx={{ mt: 2 }}
          >
            <MenuItem value="monthly">Monthly</MenuItem>
            <MenuItem value="quarterly">Quarterly</MenuItem>
            <MenuItem value="biannual">Biannual</MenuItem>
            <MenuItem value="annual">Annual</MenuItem>
            <MenuItem value="custom">Custom interval</MenuItem>
            <MenuItem value="ad_hoc">One-off</MenuItem>
          </TextField>

          {frequency === 'custom' && (
            <TextField
              fullWidth
              label="Custom interval days"
              type="number"
              value={customIntervalDays}
              onChange={(e) => setCustomIntervalDays(Number(e.target.value || 90))}
              sx={{ mt: 2 }}
            />
          )}

          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSchedule}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reschedule Inspection</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker label="New inspection date" value={scheduledDate} onChange={setScheduledDate as any} />
            </LocalizationProvider>
          </Box>
          <TextField
            fullWidth
            label="New time"
            type="time"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Reschedule reason"
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
            sx={{ mt: 2 }}
            required
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Tenant confirmation notes"
            value={tenantConfirmationNotes}
            onChange={(e) => setTenantConfirmationNotes(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRescheduleOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveReschedule} disabled={!rescheduleReason.trim()}>Save Reschedule</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Inspection Report
          {reportInspection && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {reportInspection.property?.name || reportInspection.property?.address || 'Property'} · {inspectionTypeLabels[reportInspection.type || 'routine']}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {reportInspection && (reportInspection.effectiveStatus || reportInspection.status) === 'overdue' && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              This inspection is overdue. Save the report to mark it completed.
            </Alert>
          )}
          <TextField fullWidth label="Inspector Name" value={reportDraft.inspectorName || ''} onChange={(e) => setReportDraft(r=>({...r, inspectorName: e.target.value}))} sx={{ mt: 2 }} />
          <Box sx={{ mt: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker label="Inspected At" value={reportDraft.inspectedAt} onChange={(d)=>setReportDraft(r=>({...r, inspectedAt: d}))} />
            </LocalizationProvider>
          </Box>
          <TextField fullWidth multiline minRows={3} label="Condition Summary" value={reportDraft.conditionSummary || ''} onChange={(e)=>setReportDraft(r=>({...r, conditionSummary: e.target.value}))} sx={{ mt: 2 }} />
          <TextField fullWidth multiline minRows={3} label="Issues Found" value={reportDraft.issuesFound || ''} onChange={(e)=>setReportDraft(r=>({...r, issuesFound: e.target.value}))} sx={{ mt: 2 }} />
          <TextField fullWidth multiline minRows={3} label="Actions Required" value={reportDraft.actionsRequired || ''} onChange={(e)=>setReportDraft(r=>({...r, actionsRequired: e.target.value}))} sx={{ mt: 2 }} />
          <TextField fullWidth type="number" label="Condition Score" value={reportDraft.conditionScore || 0} onChange={(e)=>setReportDraft(r=>({...r, conditionScore: Number(e.target.value)}))} sx={{ mt: 2 }} inputProps={{ min: 0, max: 100 }} />
          <TextField select fullWidth label="Condition Rating" value={reportDraft.conditionRating || 'good'} onChange={(e)=>setReportDraft(r=>({...r, conditionRating: e.target.value as InspectionRecord['conditionRating']}))} sx={{ mt: 2 }}>
            <MenuItem value="excellent">Excellent</MenuItem>
            <MenuItem value="good">Good</MenuItem>
            <MenuItem value="needs_attention">Needs Attention</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
          </TextField>
          <TextField select fullWidth label="Follow-up required" value={reportDraft.followUpRequired ? 'yes' : 'no'} onChange={(e)=>setReportDraft(r=>({...r, followUpRequired: e.target.value === 'yes'}))} sx={{ mt: 2 }}>
            <MenuItem value="no">No</MenuItem>
            <MenuItem value="yes">Yes</MenuItem>
          </TextField>

          <Box sx={{ mt: 2 }}>
            <Button component="label" variant="outlined" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Attachment'}
              <input type="file" hidden onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file && reportInspectionId) {
                  await uploadAttachment(reportInspectionId, file);
                }
              }} />
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveReport}>Save & Mark Completed</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};



