import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Button, Grid, Card, CardContent, Stack, Chip, Tabs, Tab, CircularProgress,
  Alert, IconButton, Divider, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, FormControlLabel, Switch, Collapse, useMediaQuery, useTheme,
} from '@mui/material';
import {
  ArrowBack as BackIcon, Edit as EditIcon, HomeWork as PropertyIcon,
  UploadFile as UploadIcon, Description as StatementIcon, Build as MaintenanceIcon,
  Download as DownloadIcon, ExpandMore as ExpandIcon, ExpandLess as CollapseIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import ownerManagementService from '../../services/ownerManagementService';
import { useAgentPropertyOwnerService } from '../../services/agentPropertyOwnerService';
import { SearchablePropertySelector } from '../../components/owners/SearchablePropertySelector';
import {
  OWNER_DOCUMENT_TYPES, OwnerReportType, OwnerPortfolioProperty,
} from '../../types/ownerManagement';
import api from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import reportingService from '../../reporting/reportingService';

type OwnerDocumentType = (typeof OWNER_DOCUMENT_TYPES)[number];

const softCardSx = {
  borderRadius: 3,
  border: '1px solid rgba(15, 23, 42, 0.07)',
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
  height: '100%',
};

const KpiCard = ({ title, value }: { title: string; value: string }) => (
  <Card sx={softCardSx}>
    <CardContent sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary" fontWeight={600}>{title}</Typography>
      <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>{value}</Typography>
    </CardContent>
  </Card>
);

const fmtMoney = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const statusColor = (s: string) => {
  if (s === 'Occupied') return 'success';
  if (s === 'Vacant') return 'default';
  if (s === 'Lease Expiring') return 'warning';
  return 'error';
};

const OwnerPortfolioHub: React.FC = () => {
  const { ownerId } = useParams<{ ownerId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { impersonate } = useAuth();
  const ownerService = useAgentPropertyOwnerService();

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [financials, setFinancials] = useState<any>(null);
  const [maintenance, setMaintenance] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [extras, setExtras] = useState<any>(null);
  const [properties, setProperties] = useState<{ _id: string; name: string; address: string }[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [expandedProp, setExpandedProp] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', nationalId: '', passportNumber: '',
    taxNumber: '', address: '', propertyIds: [] as string[],
    bankName: '', branchName: '', accountName: '', accountNumber: '', swiftCode: '',
    emailStatements: true, smsNotifications: true, maintenanceAlerts: true,
    monthlyReports: true, leaseExpiryAlerts: true,
  });
  const [docForm, setDocForm] = useState<{ documentType: OwnerDocumentType; file: File | null }>({
    documentType: OWNER_DOCUMENT_TYPES[0], file: null,
  });
  const [historyForm, setHistoryForm] = useState({ propertyId: '', startDate: '', endDate: '', ownershipPercentage: 100, notes: '' });
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      setLoading(true);
      setError(null);
      const [p, f, m, d, h, e, propsRes] = await Promise.all([
        ownerManagementService.getPortfolio(ownerId),
        ownerManagementService.getFinancials(ownerId),
        ownerManagementService.getMaintenance(ownerId),
        ownerManagementService.getDocuments(ownerId),
        ownerManagementService.getHistory(ownerId),
        ownerManagementService.getProfileExtras(ownerId),
        api.get('/agents/properties'),
      ]);
      setPortfolio(p);
      setFinancials(f);
      setMaintenance(m);
      setDocuments(d);
      setHistory(h);
      setExtras(e);
      setProperties(propsRes.data || []);
      const owner = p.owner as any;
      setForm((prev) => ({
        ...prev,
        firstName: owner.firstName || '',
        lastName: owner.lastName || '',
        email: owner.email || '',
        phone: owner.phone || '',
        nationalId: owner.nationalId || '',
        passportNumber: owner.passportNumber || '',
        taxNumber: owner.taxNumber || '',
        address: owner.address || '',
        propertyIds: (owner.properties || []).map((x: any) => String(x._id || x)),
        bankName: e.banking?.bankName || '',
        branchName: e.banking?.branchName || '',
        accountName: e.banking?.accountName || '',
        accountNumber: e.banking?.accountNumber || '',
        swiftCode: e.banking?.swiftCode || '',
        emailStatements: e.preferences?.emailStatements ?? true,
        smsNotifications: e.preferences?.smsNotifications ?? true,
        maintenanceAlerts: e.preferences?.maintenanceAlerts ?? true,
        monthlyReports: e.preferences?.monthlyReports ?? true,
        leaseExpiryAlerts: e.preferences?.leaseExpiryAlerts ?? true,
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to load owner hub');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const downloadReport = async (type: OwnerReportType) => {
    if (!ownerId) return;
    const blob = await ownerManagementService.downloadReport(ownerId, type);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${ownerId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadEnterpriseOwnerStatement = async (propertyId: string) => {
    try {
      setError(null);
      const blob = await reportingService.downloadOwnerStatement(propertyId, 'pdf', { includeAllTransactions: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `owner-statement-${propertyId}-all-transactions.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Unable to download enterprise owner statement.');
    }
  };

  const saveProfile = async () => {
    if (!ownerId) return;
    await ownerManagementService.patchProfile(ownerId, {
      firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone,
      nationalId: form.nationalId, passportNumber: form.passportNumber, taxNumber: form.taxNumber, address: form.address,
    });
    await ownerManagementService.saveBanking(ownerId, {
      bankName: form.bankName, branchName: form.branchName, accountName: form.accountName,
      accountNumber: form.accountNumber, swiftCode: form.swiftCode,
    });
    await ownerManagementService.savePreferences(ownerId, {
      emailStatements: form.emailStatements, smsNotifications: form.smsNotifications,
      maintenanceAlerts: form.maintenanceAlerts, monthlyReports: form.monthlyReports,
      leaseExpiryAlerts: form.leaseExpiryAlerts,
    });
    await ownerService.update(ownerId, {
      firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone,
      propertyIds: form.propertyIds,
    });
    setEditOpen(false);
    load();
  };

  const uploadDocument = async () => {
    if (!ownerId || !docForm.file) return;
    const fd = new FormData();
    fd.append('file', docForm.file);
    const uploadRes = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    const payload = Array.isArray(uploadRes.data) ? uploadRes.data[0] : uploadRes.data;
    const fileUrl = payload?.url || payload?.fileUrl;
    if (!fileUrl) throw new Error('Upload did not return file URL');
    await ownerManagementService.uploadDocument({
      ownerId,
      documentType: docForm.documentType,
      fileName: docForm.file.name,
      fileUrl,
      mimeType: docForm.file.type,
      fileSize: docForm.file.size,
    });
    setDocOpen(false);
    setDocForm({ documentType: OWNER_DOCUMENT_TYPES[0], file: null });
    load();
  };

  const addHistory = async () => {
    if (!ownerId) return;
    await ownerManagementService.addOwnershipHistory({ ownerId, ...historyForm });
    setHistoryOpen(false);
    load();
  };

  const occupancyRate = portfolio?.header
    ? Math.round((portfolio.header.occupiedUnits / Math.max(1, portfolio.header.totalProperties)) * 100)
    : 0;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !portfolio) {
    return <Alert severity="error">{error || 'Owner not found'}</Alert>;
  }

  const header = portfolio.header;

  const renderPortfolioCard = (prop: OwnerPortfolioProperty, collapsible: boolean) => {
    const open = !collapsible || expandedProp === prop._id;
    return (
      <Card key={prop._id} sx={{ ...softCardSx, mb: 2 }}>
        <CardContent>
          {collapsible && (
            <Stack direction="row" justifyContent="space-between" alignItems="center" onClick={() => setExpandedProp(open ? null : prop._id)} sx={{ cursor: 'pointer' }}>
              <Typography fontWeight={700}>{prop.propertyName}</Typography>
              <IconButton size="small">{open ? <CollapseIcon /> : <ExpandIcon />}</IconButton>
            </Stack>
          )}
          <Collapse in={open}>
            <Stack spacing={1} sx={{ mt: collapsible ? 1 : 0 }}>
              {!collapsible && <Typography fontWeight={700}>{prop.propertyName}</Typography>}
              <Typography variant="body2" color="text.secondary">Tenant: {prop.tenantName || '—'}</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip size="small" label={prop.occupancyStatus} color={statusColor(prop.occupancyStatus) as any} />
                <Chip size="small" label={`Lease: ${prop.leaseStatus}`} variant="outlined" />
              </Stack>
              <Typography variant="body2">
                Rent: {fmtMoney(prop.monthlyRent)} · Tenant arrears: {fmtMoney(prop.outstandingBalance)}
              </Typography>
              {typeof prop.trustBalance === 'number' && (
                <Typography variant="body2" color="text.secondary">
                  Trust balance (ledger): {fmtMoney(prop.trustBalance)}
                </Typography>
              )}
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ pt: 1 }}>
                <Button size="small" variant="outlined" onClick={() => navigate(`/agent-dashboard/properties/${prop._id}`)}>Open Property</Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => window.open(`/accountant-dashboard/property-accounts/${prop._id}`, '_blank')}
                >
                  Property Account
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<StatementIcon />}
                  onClick={() => downloadEnterpriseOwnerStatement(prop._id)}
                >
                  Enterprise Statement
                </Button>
                {prop.leaseId && (
                  <Button size="small" variant="outlined" onClick={() => navigate('/agent-dashboard/leases')}>View Lease</Button>
                )}
                {prop.tenantId && (
                  <Button size="small" variant="outlined" onClick={() => navigate('/agent-dashboard/tenants')}>Open Tenant</Button>
                )}
              </Stack>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Button startIcon={<BackIcon />} onClick={() => navigate('/agent-dashboard/property-owners')} sx={{ mb: 2 }}>
        Back to Owners
      </Button>

      <Card sx={{ ...softCardSx, mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="h4" fontWeight={800}>{header.ownerName}</Typography>
              <Typography color="text.secondary">{header.email} · {header.phone}</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                <Chip label={`${header.totalProperties} Properties`} />
                <Chip label={`${header.occupiedUnits} Occupied`} color="success" variant="outlined" />
                <Chip label={`${header.vacantUnits} Vacant`} variant="outlined" />
              </Stack>
            </Box>
            <Stack direction="row" flexWrap="wrap" gap={1} alignItems="flex-start">
              <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditOpen(true)}>Edit Owner</Button>
              <Button variant="outlined" startIcon={<PropertyIcon />} onClick={() => setAssignOpen(true)}>Add Property</Button>
              <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setDocOpen(true)}>Upload Documents</Button>
              <Button variant="outlined" startIcon={<StatementIcon />} onClick={() => downloadReport('owner-statement')}>View Statements</Button>
              <Button variant="text" onClick={() => impersonate(ownerId!)}>Owner Portal</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: 'Monthly Revenue', value: fmtMoney(financials?.summary?.monthlyRevenue) },
          { title: 'Rent Collected (Ledger)', value: fmtMoney(financials?.summary?.rentCollected) },
          { title: 'Tenant Arrears', value: fmtMoney(financials?.summary?.outstandingRent) },
          { title: 'Trust Balance', value: fmtMoney(financials?.summary?.trustBalance) },
          { title: 'Owner Payouts', value: fmtMoney(financials?.summary?.ownerPayouts) },
          { title: 'Pending Maintenance', value: String(maintenance?.summary?.open ?? 0) },
        ].map((k) => (
          <Grid item xs={6} sm={4} md={2} key={k.title}>
            <KpiCard title={k.title} value={k.value} />
          </Grid>
        ))}
      </Grid>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant={isMobile ? 'scrollable' : 'standard'}
        scrollButtons={isMobile ? 'auto' : false}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Portfolio" />
        <Tab label="Financial Overview" />
        <Tab label="Maintenance" />
        <Tab label="Documents" />
        <Tab label="History" />
        <Tab label="Reports" />
      </Tabs>

      {tab === 0 && (
        <Box>
          {(portfolio.portfolio || []).map((p: OwnerPortfolioProperty) =>
            renderPortfolioCard(p, isMobile)
          )}
        </Box>
      )}

      {tab === 1 && financials && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Financial figures use the same property account ledger as the accountant dashboard (rent collected, payouts, trust balance).
            Tenant arrears reflect amounts still owed on each property.
          </Alert>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              ['Rent Collected (Ledger)', financials.summary.rentCollected],
              ['Tenant Arrears', financials.summary.outstandingRent],
              ['Trust Balance', financials.summary.trustBalance ?? 0],
              ['Owner Payouts', financials.summary.ownerPayouts],
              ['Ledger Expenses', financials.summary.commissionEarned],
              ['Net (Income − Expenses − Payouts)', financials.summary.netRevenue],
            ].map(([t, v]) => (
              <Grid item xs={12} sm={6} md={4} key={String(t)}>
                <KpiCard title={String(t)} value={fmtMoney(Number(v))} />
              </Grid>
            ))}
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card sx={softCardSx}><CardContent>
                <Typography fontWeight={700} gutterBottom>Monthly Rent Collection</Typography>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={financials.charts.monthlyRentCollection}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <RechartsTooltip />
                    <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={softCardSx}><CardContent>
                <Typography fontWeight={700} gutterBottom>Owner Revenue Trend</Typography>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={financials.charts.ownerRevenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent></Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {tab === 2 && maintenance && (
        <Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label={`Open: ${maintenance.summary.open}`} />
            <Chip label={`Awaiting Approval: ${maintenance.summary.awaitingApproval}`} color="warning" />
            <Chip label={`In Progress: ${maintenance.summary.inProgress}`} color="info" />
            <Chip label={`Completed: ${maintenance.summary.completed}`} color="success" />
          </Stack>
          {maintenance.requests.map((r: any) => (
            <Card key={r._id} sx={{ ...softCardSx, mb: 1.5 }}>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                  <Box>
                    <Typography fontWeight={700}>{r.issue}</Typography>
                    <Typography variant="body2" color="text.secondary">{r.propertyName} · {fmtMoney(r.cost)} · {new Date(r.createdAt).toLocaleDateString()}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ mt: { xs: 1, sm: 0 } }}>
                    <Chip label={r.status} size="small" icon={<MaintenanceIcon />} />
                    <Button size="small" onClick={() => navigate('/agent-dashboard/maintenance')}>View</Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {tab === 3 && (
        <Box>
          <Button startIcon={<UploadIcon />} variant="contained" sx={{ mb: 2 }} onClick={() => setDocOpen(true)}>Upload Document</Button>
          {documents.map((doc: any) => (
            <Card key={doc._id} sx={{ ...softCardSx, mb: 1 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography fontWeight={600}>{doc.fileName}</Typography>
                    <Typography variant="body2" color="text.secondary">{doc.documentType} · v{doc.version}</Typography>
                  </Box>
                  <Button size="small" href={doc.fileUrl} target="_blank" rel="noopener">Preview</Button>
                  <Button size="small" startIcon={<DownloadIcon />} href={doc.fileUrl} download>Download</Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {tab === 4 && (
        <Box>
          <Button variant="outlined" sx={{ mb: 2 }} onClick={() => setHistoryOpen(true)}>Add Ownership Record</Button>
          {history.map((h: any) => (
            <Card key={h._id} sx={{ ...softCardSx, mb: 1 }}>
              <CardContent>
                <Typography fontWeight={700}>{h.propertyId?.name || 'Property'}</Typography>
                <Typography variant="body2">
                  {new Date(h.startDate).getFullYear()} – {h.endDate ? new Date(h.endDate).getFullYear() : 'Present'}
                  {' · '}{h.ownershipPercentage}%
                </Typography>
                {h.notes && <Typography variant="body2" color="text.secondary">{h.notes}</Typography>}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {tab === 5 && (
        <Stack spacing={1} maxWidth={400}>
          {(portfolio.portfolio || []).map((p: OwnerPortfolioProperty) => (
            <Button key={`enterprise-${p._id}`} variant="contained" startIcon={<StatementIcon />} onClick={() => downloadEnterpriseOwnerStatement(p._id)}>
              Enterprise Owner Statement - {p.propertyName}
            </Button>
          ))}
          <Divider />
          {(['portfolio-report', 'outstanding-rent', 'maintenance-summary', 'ownership-history'] as OwnerReportType[]).map((t) => (
            <Button key={t} variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadReport(t)}>
              {t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Button>
          ))}
        </Stack>
      )}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Owner Profile</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 1 }}>Personal Information</Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {(['firstName', 'lastName', 'email', 'phone', 'nationalId', 'passportNumber', 'taxNumber', 'address'] as const).map((f) => (
              <Grid item xs={12} sm={6} key={f}>
                <TextField fullWidth label={f.replace(/([A-Z])/g, ' $1')} name={f} value={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
              </Grid>
            ))}
          </Grid>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2">Banking (optional)</Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {(['bankName', 'branchName', 'accountName', 'accountNumber', 'swiftCode'] as const).map((f) => (
              <Grid item xs={12} sm={6} key={f}>
                <TextField fullWidth label={f.replace(/([A-Z])/g, ' $1')} value={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
              </Grid>
            ))}
          </Grid>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2">Communication Preferences</Typography>
          {(['emailStatements', 'smsNotifications', 'maintenanceAlerts', 'monthlyReports', 'leaseExpiryAlerts'] as const).map((f) => (
            <FormControlLabel key={f} control={<Switch checked={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.checked })} />} label={f.replace(/([A-Z])/g, ' $1')} />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveProfile}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Properties</DialogTitle>
        <DialogContent>
          <SearchablePropertySelector
            properties={properties}
            selectedIds={form.propertyIds}
            onChange={(ids) => setForm({ ...form, propertyIds: ids })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={async () => { await ownerService.update(ownerId!, { propertyIds: form.propertyIds }); setAssignOpen(false); load(); }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={docOpen} onClose={() => setDocOpen(false)}>
        <DialogTitle>Upload Document</DialogTitle>
        <DialogContent>
          <TextField select fullWidth label="Type" value={docForm.documentType} onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value as OwnerDocumentType })} sx={{ mt: 1, mb: 2 }}>
            {OWNER_DOCUMENT_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <Button variant="outlined" component="label">
            Choose file (PDF, DOCX, JPG, PNG, WEBP)
            <input type="file" hidden accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onChange={(e) => setDocForm({ ...docForm, file: e.target.files?.[0] || null })} />
          </Button>
          {docForm.file && <Typography variant="body2" sx={{ mt: 1 }}>{docForm.file.name}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDocOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={uploadDocument} disabled={!docForm.file}>Upload</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)}>
        <DialogTitle>Add Ownership History</DialogTitle>
        <DialogContent>
          <TextField select fullWidth label="Property" value={historyForm.propertyId} onChange={(e) => setHistoryForm({ ...historyForm, propertyId: e.target.value })} sx={{ mt: 1 }}>
            {portfolio.portfolio.map((p: any) => <MenuItem key={p._id} value={p._id}>{p.propertyName}</MenuItem>)}
          </TextField>
          <TextField fullWidth type="date" label="Start" InputLabelProps={{ shrink: true }} value={historyForm.startDate} onChange={(e) => setHistoryForm({ ...historyForm, startDate: e.target.value })} sx={{ mt: 2 }} />
          <TextField fullWidth type="date" label="End (optional)" InputLabelProps={{ shrink: true }} value={historyForm.endDate} onChange={(e) => setHistoryForm({ ...historyForm, endDate: e.target.value })} sx={{ mt: 2 }} />
          <TextField fullWidth type="number" label="Ownership %" value={historyForm.ownershipPercentage} onChange={(e) => setHistoryForm({ ...historyForm, ownershipPercentage: Number(e.target.value) })} sx={{ mt: 2 }} />
          <TextField fullWidth multiline label="Notes" value={historyForm.notes} onChange={(e) => setHistoryForm({ ...historyForm, notes: e.target.value })} sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={addHistory}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OwnerPortfolioHub;
