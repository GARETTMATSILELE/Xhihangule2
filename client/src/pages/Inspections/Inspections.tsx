import React, { useEffect, useState } from 'react';
import { Typography, Box, Button, Card, CardContent, Grid, Chip, TextField, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../components/Layout/Header';
import { inspectionService } from '../../services/inspectionService';
import api from '../../api/axios';

type PropertyLite = { _id: string; name?: string; address?: string; ownerId?: any; propertyOwnerId?: any };
type TenantLite = { _id: string; firstName?: string; lastName?: string; email?: string; phone?: string };

export const Inspections: React.FC = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [tenantsByProperty, setTenantsByProperty] = useState<Record<string, TenantLite[]>>({});
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<Dayjs | null>(dayjs());
  const [notes, setNotes] = useState<string>('');
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [reportDraft, setReportDraft] = useState<{ conditionSummary?: string; issuesFound?: string; actionsRequired?: string; inspectorName?: string; inspectedAt?: Dayjs | null }>({ inspectedAt: dayjs() });
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

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // Fetch agent-scoped properties and tenants
        const [propsRes, tenantsRes] = await Promise.all([
          api.get('/agents/properties'),
          api.get('/agents/tenants')
        ]);
        const props: PropertyLite[] = Array.isArray(propsRes.data) ? propsRes.data : (propsRes.data?.data || []);
        const tenantsRaw: any[] = Array.isArray(tenantsRes.data) ? tenantsRes.data : (tenantsRes.data?.data || []);
        setProperties(props);

        const byProp: Record<string, TenantLite[]> = {};
        tenantsRaw.forEach((t) => {
          const pid = (t.propertyId && (t.propertyId._id || t.propertyId)) || t.property || t.property_id;
          if (!pid) return;
          if (!byProp[pid]) byProp[pid] = [];
          byProp[pid].push({ _id: t._id, firstName: t.firstName, lastName: t.lastName, email: t.email, phone: t.phone });
        });
        setTenantsByProperty(byProp);

        const insp = await inspectionService.getInspections();
        setInspections(insp);
      } finally {
        setLoading(false);
      }
    };
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
    setScheduledDate(dayjs());
    setNotes('');
    setDialogOpen(true);
  };

  const handleSchedule = async () => {
    if (!selectedPropertyId || !scheduledDate) return;
    await inspectionService.createInspection({
      propertyId: selectedPropertyId,
      tenantId: selectedTenantId || undefined,
      scheduledDate: scheduledDate.toDate(),
      frequency: 'quarterly',
      notes
    });
    const insp = await inspectionService.getInspections();
    setInspections(insp);
    setDialogOpen(false);
  };

  const openReport = (inspectionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReportInspectionId(inspectionId);
    const target = inspections.find(i => i._id === inspectionId);
    setReportDraft({
      conditionSummary: target?.report?.conditionSummary || '',
      issuesFound: target?.report?.issuesFound || '',
      actionsRequired: target?.report?.actionsRequired || '',
      inspectorName: target?.report?.inspectorName || '',
      inspectedAt: target?.report?.inspectedAt ? dayjs(target.report.inspectedAt) : dayjs()
    });
    setReportOpen(true);
  };

  const saveReport = async () => {
    if (!reportInspectionId) return;
    const updated = await inspectionService.updateReport(reportInspectionId, {
      ...reportDraft,
      inspectedAt: reportDraft.inspectedAt ? reportDraft.inspectedAt.toISOString() : undefined
    });
    setInspections(prev => prev.map(i => i._id === updated._id ? updated : i));
    setReportOpen(false);
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
        Inspection Reports
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Plan and store quarterly property inspections, with reminders and flexible scheduling.</Typography>

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
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Typography color="text.secondary">Next Inspection</Typography>
                      <Typography>{next ? next.format('YYYY-MM-DD') : 'Not scheduled'}</Typography>
                      {next && (
                        <Chip label={`Quarterly`} size="small" sx={{ mt: 1 }} />
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
                                      </Grid>
                                      <Grid item xs={12} md={5}>
                                        <Typography color="text.secondary">Inspector</Typography>
                                        <Typography>{i.report?.inspectorName || '-'}</Typography>
                                      </Grid>
                                      <Grid item xs={12} md={3}>
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                                          <Button size="small" variant="outlined" onClick={(e)=>openReport(i._id, e)}>Edit Report</Button>
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

      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Inspection Report</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Inspector Name" value={reportDraft.inspectorName || ''} onChange={(e) => setReportDraft(r=>({...r, inspectorName: e.target.value}))} sx={{ mt: 2 }} />
          <Box sx={{ mt: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker label="Inspected At" value={reportDraft.inspectedAt} onChange={(d)=>setReportDraft(r=>({...r, inspectedAt: d}))} />
            </LocalizationProvider>
          </Box>
          <TextField fullWidth multiline minRows={3} label="Condition Summary" value={reportDraft.conditionSummary || ''} onChange={(e)=>setReportDraft(r=>({...r, conditionSummary: e.target.value}))} sx={{ mt: 2 }} />
          <TextField fullWidth multiline minRows={3} label="Issues Found" value={reportDraft.issuesFound || ''} onChange={(e)=>setReportDraft(r=>({...r, issuesFound: e.target.value}))} sx={{ mt: 2 }} />
          <TextField fullWidth multiline minRows={3} label="Actions Required" value={reportDraft.actionsRequired || ''} onChange={(e)=>setReportDraft(r=>({...r, actionsRequired: e.target.value}))} sx={{ mt: 2 }} />

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
          <Button variant="contained" onClick={saveReport}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};



