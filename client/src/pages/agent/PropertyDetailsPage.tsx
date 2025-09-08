import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Button,
  IconButton,
  Divider,
  Link as MuiLink
} from '@mui/material';
import { usePropertyService } from '../../services/propertyService';
import paymentService from '../../services/paymentService';
import api from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';

const PropertyDetailsPage: React.FC = () => {
  const { propertyId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const isAgentRoute = location.pathname.includes('/agent-dashboard');
  const { getProperty } = usePropertyService();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [levyPayments, setLevyPayments] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expensesAccessMessage, setExpensesAccessMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [tab, setTab] = useState(0);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);

  // Filters
  const [paymentSearch, setPaymentSearch] = useState('');
  const [levySearch, setLevySearch] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!propertyId) return;
      try {
        setLoading(true);
        setError(null);
        const [p, tenantsResp, leasesResp] = await Promise.all([
          getProperty(propertyId),
          isAgentRoute ? api.get('/agents/tenants').then(r => r.data) : api.get('/tenants').then(r => r.data?.tenants || r.data || []),
          isAgentRoute ? api.get('/agents/leases').then(r => r.data) : api.get('/leases').then(r => r.data || [])
        ]);
        setProperty(p);

        // Resolve PROPERTY OWNER (not agent) by propertyId
        try {
          const ownerResp = await api.get(`/property-owners/by-property/${propertyId}`).then(r => r.data);
          if (ownerResp && (ownerResp.firstName || ownerResp.lastName)) {
            const full = `${ownerResp.firstName || ''} ${ownerResp.lastName || ''}`.trim();
            setOwnerName(full || null);
            setOwnerEmail(ownerResp.email || null);
          } else {
            setOwnerName(null);
            setOwnerEmail(null);
          }
        } catch {
          // Fall back to resolving via property.ownerId when available
          try {
            const rawOwnerId: any = (p as any)?.ownerId;
            let ownerIdStr = '';
            if (typeof rawOwnerId === 'string') {
              ownerIdStr = rawOwnerId;
            } else if (rawOwnerId && typeof rawOwnerId === 'object') {
              ownerIdStr = String(rawOwnerId._id || rawOwnerId.$oid || rawOwnerId.id || '');
            }
            if (ownerIdStr) {
              // Prefer public route to avoid company-scope auth failures
              try {
                const ownerPublic = await api.get(`/property-owners/public/${ownerIdStr}`, {
                  params: user?.companyId ? { companyId: user.companyId } : undefined
                }).then(r => r.data);
                const full = `${ownerPublic?.firstName || ''} ${ownerPublic?.lastName || ''}`.trim();
                setOwnerName(full || null);
                setOwnerEmail(ownerPublic?.email || null);
              } catch {
                setOwnerName(null);
                setOwnerEmail(null);
              }
            } else {
              setOwnerName(null);
              setOwnerEmail(null);
            }
          } catch {
            setOwnerName(null);
            setOwnerEmail(null);
          }
        }
        setTenants(Array.isArray(tenantsResp) ? tenantsResp : (tenantsResp?.tenants || []));
        setLeases(Array.isArray(leasesResp) ? leasesResp : []);

        // Payments (filter by propertyId on client; server also supports filter for some routes)
        const basePayments = user?.role === 'agent'
          ? await api.get('/agents/payments', { params: { propertyId } }).then(r => r.data)
          : await paymentService.getPayments({ propertyId } as any).catch(() => []);
        setPayments(Array.isArray(basePayments) ? basePayments : []);

        // Levy payments (agent route returns all for agent properties; filter client-side)
        const levy = user?.role === 'agent'
          ? await api.get('/agents/levy-payments').then(r => Array.isArray(r.data) ? r.data : [])
          : await paymentService.getLevyPayments(user?.companyId);
        setLevyPayments(Array.isArray(levy) ? levy.filter((lp: any) => String(lp.propertyId?._id || lp.propertyId) === String(propertyId)) : []);

        // Files scoped to agent/company; filter to property
        const filesResp = isAgentRoute ? await api.get('/agents/files').then(r => r.data) : await api.get('/files').then(r => r.data);
        const filesArray = Array.isArray(filesResp) ? filesResp : (filesResp?.data || []);
        setFiles(filesArray.filter((f: any) => String(f.propertyId?._id || f.propertyId) === String(propertyId)));

        // Expenses: only attempt accountant endpoint if user is accountant
        if (user?.role === 'accountant') {
          try {
            const transactionsResp = await api.get(`/accountants/property-accounts/${propertyId}/transactions`).then(r => r.data?.data || []);
            const exp = (Array.isArray(transactionsResp) ? transactionsResp : []).filter((t: any) => t.type === 'expense');
            setExpenses(exp);
            setExpensesAccessMessage(null);
          } catch {
            setExpenses([]);
            setExpensesAccessMessage('Unable to load expenses.');
          }
        } else {
          setExpenses([]);
          setExpensesAccessMessage('Expenses are available to accountants only.');
        }

        // Notes - placeholder in-memory for now unless a notes API exists
        setNotes([]);
      } catch (err: any) {
        setError(err?.message || 'Failed to load property');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [propertyId, isAgentRoute, user?.role, user?.companyId]);

  const activeTenant = useMemo(() => {
    if (!Array.isArray(tenants)) return null;
    const pid = String(propertyId);
    return tenants.find((t: any) => String(t.propertyId?._id || t.propertyId) === pid && (t.status === 'Active')) || null;
  }, [tenants, propertyId]);

  const currentLease = useMemo(() => {
    if (!Array.isArray(leases)) return null;
    const pid = String(propertyId);
    const now = new Date();
    const active = leases.find((l: any) => String(l.propertyId?._id || l.propertyId) === pid && l.status === 'active');
    if (active) return active;
    // fallback: latest lease for this property
    const relevant = leases.filter((l: any) => String(l.propertyId?._id || l.propertyId) === pid);
    return relevant.sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0] || null;
  }, [leases, propertyId]);

  const filteredPayments = useMemo(() => {
    if (!paymentSearch) return payments;
    const q = paymentSearch.toLowerCase();
    return payments.filter((p: any) =>
      [p.referenceNumber, p.notes, p.paymentMethod, p.status, p.currency]
        .filter(Boolean)
        .map((s: any) => String(s).toLowerCase())
        .some((s: string) => s.includes(q))
    );
  }, [payments, paymentSearch]);

  const filteredLevyPayments = useMemo(() => {
    if (!levySearch) return levyPayments;
    const q = levySearch.toLowerCase();
    return levyPayments.filter((p: any) =>
      [p.referenceNumber, p.notes, p.paymentMethod, p.status, p.currency]
        .filter(Boolean)
        .map((s: any) => String(s).toLowerCase())
        .some((s: string) => s.includes(q))
    );
  }, [levyPayments, levySearch]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!property) {
    return <Alert severity="warning">Property not found</Alert>;
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>{property.name}</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Property Information</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography color="text.secondary">Address</Typography>
                  <Typography>{property.address}</Typography>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Typography color="text.secondary">Rent</Typography>
                  <Typography>${Number(property.rent || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Typography color="text.secondary">Status</Typography>
                  <Chip label={property.status || 'unknown'} size="small" />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
          <Box sx={{ mt: 3 }}>
            <Card>
              <CardContent>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons allowScrollButtonsMobile>
                  <Tab label="Tenant" />
                  <Tab label="Lease" />
                  <Tab label="Rental Payments" />
                  <Tab label="Levy Payments" />
                  <Tab label="Files" />
                  <Tab label="Expenses" />
                  <Tab label="Notes" />
                </Tabs>
                <Divider sx={{ my: 2 }} />
                {tab === 0 && (
                  <Box>
                    {activeTenant ? (
                      <>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {(activeTenant.firstName || '') + ' ' + (activeTenant.lastName || '')}
                        </Typography>
                        <Typography color="text.secondary">{activeTenant.email || activeTenant.phone || ''}</Typography>
                      </>
                    ) : (
                      <Typography color="text.secondary">No active tenant.</Typography>
                    )}
                  </Box>
                )}
                {tab === 1 && (
                  <Box>
                    {currentLease ? (
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={4}>
                          <Typography color="text.secondary">Start</Typography>
                          <Typography>{currentLease.startDate ? new Date(currentLease.startDate).toLocaleDateString() : 'N/A'}</Typography>
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <Typography color="text.secondary">End</Typography>
                          <Typography>{currentLease.endDate ? new Date(currentLease.endDate).toLocaleDateString() : 'N/A'}</Typography>
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <Typography color="text.secondary">Status</Typography>
                          <Chip label={currentLease.status} size="small" />
                        </Grid>
                      </Grid>
                    ) : (
                      <Typography color="text.secondary">No lease details.</Typography>
                    )}
                  </Box>
                )}
                {tab === 2 && (
                  <Box>
                    <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
                      <TextField size="small" label="Search" value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} />
                    </Box>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Month</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Method</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Reference</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredPayments.map((p: any) => (
                          <TableRow key={p._id}>
                            <TableCell>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : 'N/A'}</TableCell>
                            <TableCell>
                              {(() => {
                                const month = Number(p.rentalPeriodMonth || (p.paymentDate ? (new Date(p.paymentDate).getMonth() + 1) : undefined));
                                const year = Number(p.rentalPeriodYear || (p.paymentDate ? (new Date(p.paymentDate).getFullYear()) : undefined));
                                if (!month || !year) return 'N/A';
                                try {
                                  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
                                } catch {
                                  return `${month}/${year}`;
                                }
                              })()}
                            </TableCell>
                            <TableCell>${Number(p.amount || 0).toLocaleString()}</TableCell>
                            <TableCell>{p.paymentMethod || 'N/A'}</TableCell>
                            <TableCell><Chip label={p.status || 'N/A'} size="small" /></TableCell>
                            <TableCell>{p.referenceNumber || '—'}</TableCell>
                          </TableRow>
                        ))}
                        {!filteredPayments.length && (
                          <TableRow><TableCell colSpan={5}><Typography color="text.secondary">No payments found.</Typography></TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                )}
                {tab === 3 && (
                  <Box>
                    <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
                      <TextField size="small" label="Search" value={levySearch} onChange={e => setLevySearch(e.target.value)} />
                    </Box>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Method</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Reference</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredLevyPayments.map((p: any) => (
                          <TableRow key={p._id}>
                            <TableCell>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : 'N/A'}</TableCell>
                            <TableCell>${Number(p.amount || 0).toLocaleString()}</TableCell>
                            <TableCell>{p.paymentMethod || 'N/A'}</TableCell>
                            <TableCell><Chip label={p.status || 'N/A'} size="small" /></TableCell>
                            <TableCell>{p.referenceNumber || '—'}</TableCell>
                          </TableRow>
                        ))}
                        {!filteredLevyPayments.length && (
                          <TableRow><TableCell colSpan={5}><Typography color="text.secondary">No levy payments found.</Typography></TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                )}
                {tab === 4 && (
                  <Box>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>File Name</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Uploaded</TableCell>
                          <TableCell>By</TableCell>
                          <TableCell>Download</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {files.map((f: any) => (
                          <TableRow key={f._id}>
                            <TableCell>{f.fileName}</TableCell>
                            <TableCell>{f.fileType || 'Other'}</TableCell>
                            <TableCell>{f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : 'N/A'}</TableCell>
                            <TableCell>{f.uploadedByName || 'Unknown'}</TableCell>
                            <TableCell>
                              {f.fileUrl ? (
                                <MuiLink href={f.fileUrl} target="_blank" rel="noopener">Download</MuiLink>
                              ) : (
                                'N/A'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {!files.length && (
                          <TableRow><TableCell colSpan={5}><Typography color="text.secondary">No files uploaded.</Typography></TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                )}
                {tab === 5 && (
                  <Box>
                    {expensesAccessMessage && (
                      <Alert severity={user?.role === 'accountant' ? 'warning' : 'info'} sx={{ mb: 2 }}>
                        {expensesAccessMessage}
                      </Alert>
                    )}
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Category</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {expenses.map((e: any) => (
                          <TableRow key={e._id}>
                            <TableCell>{e.date ? new Date(e.date).toLocaleDateString() : 'N/A'}</TableCell>
                            <TableCell>${Number(e.amount || 0).toLocaleString()}</TableCell>
                            <TableCell>{e.category || '—'}</TableCell>
                            <TableCell>{e.description || '—'}</TableCell>
                            <TableCell><Chip label={e.status || 'N/A'} size="small" /></TableCell>
                          </TableRow>
                        ))}
                        {!expenses.length && (
                          <TableRow><TableCell colSpan={5}><Typography color="text.secondary">No expenses recorded.</Typography></TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                )}
                {tab === 6 && (
                  <Box>
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <TextField fullWidth size="small" label="Add a note" id="note-input" />
                      <Button variant="contained" onClick={() => {
                        const input = document.getElementById('note-input') as HTMLInputElement | null;
                        const text = (input?.value || '').trim();
                        if (!text) return;
                        setNotes(prev => [text, ...prev]);
                        if (input) input.value = '';
                      }}>Add</Button>
                    </Box>
                    {notes.length === 0 ? (
                      <Typography color="text.secondary">No notes yet.</Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {notes.map((n, idx) => (
                          <Card key={idx}>
                            <CardContent>
                              <Typography>{n}</Typography>
                            </CardContent>
                          </Card>
                        ))}
                      </Box>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Owner</Typography>
              <Typography color="text.secondary">Property Owner</Typography>
              <Typography>{ownerName || 'Not linked'}</Typography>
              {ownerEmail && (
                <>
                  <Typography color="text.secondary" sx={{ mt: 1 }}>Email</Typography>
                  <Typography>{ownerEmail}</Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PropertyDetailsPage;


