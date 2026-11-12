import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Link,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import accountingService, { TaxComplianceDashboard } from '../../services/accountingService';
import TaxAccountsPage from './TaxAccountsPage';

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0));

const currentPeriod = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const CHART_COLORS = ['#1565c0', '#00897b', '#6d4c41', '#5e35b1', '#546e7a'];

const CATEGORY_FILTERS = [
  { key: 'VAT_ON_COMMISSION', label: 'VAT on Agency Commission' },
  { key: 'CGT', label: 'Capital Gains Tax (CGT)' },
  { key: 'CGWT', label: 'Capital Gains Withholding Tax (CGWT)' },
  { key: 'OTHER_WITHHOLDING', label: 'Other Withholding Taxes' },
  { key: 'OTHER', label: 'Other Tax Obligations' }
];

const STATUS_FILTERS = ['Paid', 'Partly paid', 'Outstanding', 'Reversed', 'Review'];

const fundsText = (funds?: { status?: string; amount?: number | null }) => {
  if (!funds || funds.status !== 'RECONCILED' || funds.amount == null) return 'Not reconciled';
  return money(funds.amount);
};

const categoryKeyForType = (taxType: string) => {
  if (taxType === 'VAT_ON_COMMISSION') return 'VAT_ON_COMMISSION';
  if (taxType === 'CAPITAL_GAINS_TAX') return 'CGT';
  if (taxType === 'CAPITAL_GAINS_WITHHOLDING_TAX') return 'CGWT';
  if (taxType === 'VAT_WITHHOLDING') return 'OTHER_WITHHOLDING';
  return 'OTHER';
};

const summaryFromAccounts = (position: any) => {
  if (position?.dashboard || !Array.isArray(position?.accounts)) return null;
  const categories = CATEGORY_FILTERS.map((category) => ({
    key: category.key,
    label: category.label,
    recognised: 0,
    paid: 0,
    outstanding: 0,
    fundsHeld: { status: 'NOT_RECONCILED', amount: null }
  }));
  const byKey = new Map(categories.map((category) => [category.key, category]));
  for (const account of position.accounts) {
    const category = byKey.get(categoryKeyForType(String(account.taxType || '')));
    if (!category) continue;
    category.recognised += Number(account.recognised || 0);
    category.paid += Number(account.paid || 0);
    category.outstanding += Number(account.outstanding || 0);
  }
  const total = categories.reduce((sum, category) => ({
    recognised: sum.recognised + category.recognised,
    paid: sum.paid + category.paid,
    outstanding: sum.outstanding + category.outstanding
  }), { recognised: 0, paid: 0, outstanding: 0 });
  return {
    ...total,
    unallocatedPayments: Number(position.unallocatedPayments || 0),
    fundsHeld: { status: 'NOT_RECONCILED', amount: null },
    categories,
    total: { ...total, fundsHeld: { status: 'NOT_RECONCILED', amount: null } },
    chart: categories.filter((category) => category.recognised > 0).map((category) => ({
      key: category.key,
      label: category.label,
      recognised: category.recognised
    })),
    compliance: { indicator: 'ATTENTION_REQUIRED', label: 'Attention Required' }
  };
};

const statusColor = (status: string): 'success' | 'warning' | 'default' | 'error' => {
  if (status === 'Paid' || status === 'PAID' || status === 'RECONCILED' || status === 'POSTED') return 'success';
  if (status === 'Reversed' || status === 'REVERSED' || status === 'DRAFT') return 'default';
  if (status === 'Review' || status === 'ACCOUNTANT_REVIEW') return 'error';
  return 'warning';
};

const TaxCompliancePage: React.FC = () => {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<TaxComplianceDashboard | null>(null);
  const [obligations, setObligations] = useState<any[]>([]);
  const [vatReturns, setVatReturns] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [taxPosition, setTaxPosition] = useState<any>(null);
  const [cutoff, setCutoff] = useState('');
  const [taxPeriod, setTaxPeriod] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [migration, setMigration] = useState<any>(null);
  const [integrity, setIntegrity] = useState<any>(null);
  const [filingPeriod, setFilingPeriod] = useState(currentPeriod());
  const [busy, setBusy] = useState(false);
  const [inspected, setInspected] = useState<any>(null);
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [zimraRef, setZimraRef] = useState('');
  const [payRef, setPayRef] = useState('');
  const [bankCode, setBankCode] = useState('1001');
  const [allocId, setAllocId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');
  const [allocations, setAllocations] = useState<Array<{ taxObligationId: string; amount: number; label: string }>>([]);
  const [unallocatedAmount, setUnallocatedAmount] = useState('');
  const [unallocatedReason, setUnallocatedReason] = useState('');
  const [resolution, setResolution] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const settled = await Promise.allSettled([
      accountingService.getTaxComplianceDashboard(),
      accountingService.getTaxObligations(),
      accountingService.listVatReturns(),
      accountingService.listTaxPayments(),
      accountingService.listTaxReviews(),
      accountingService.getTaxPosition(cutoff || undefined, taxPeriod || undefined)
    ]);
    const failed = settled
      .map((result, index) => {
        if (result.status !== 'rejected') return null;
        const err: any = result.reason;
        const urls = ['tax-compliance', 'tax-obligations', 'vat-returns', 'tax-payments', 'tax-reviews', 'tax-position'];
        return `${urls[index]}: ${err?.response?.data?.message || err?.message || 'request failed'}`;
      })
      .filter(Boolean) as string[];
    if (settled[0].status === 'fulfilled') setDashboard(settled[0].value);
    if (settled[1].status === 'fulfilled') setObligations(settled[1].value);
    if (settled[2].status === 'fulfilled') setVatReturns(settled[2].value);
    if (settled[3].status === 'fulfilled') setPayments(settled[3].value);
    if (settled[4].status === 'fulfilled') setReviews(settled[4].value);
    if (settled[5].status === 'fulfilled') setTaxPosition(settled[5].value);
    if (failed.length) setError(failed.join(' · '));
    setLoading(false);
  }, [cutoff, taxPeriod]);

  useEffect(() => {
    void load();
  }, [load]);

  const propertyDirectory = useMemo(() => {
    const directory = new Map<string, { name: string; address: string }>();
    for (const account of taxPosition?.accounts || []) {
      for (const property of account.properties || []) {
        const id = String(property?.propertyId || '');
        if (!id || id === 'UNALLOCATED') continue;
        const current = directory.get(id) || { name: '', address: '' };
        const name = String(property.propertyName || '').trim();
        const address = String(property.propertyAddress || '').trim();
        directory.set(id, {
          name: current.name || (name && name !== id ? name : ''),
          address: current.address || address
        });
      }
    }
    return directory;
  }, [taxPosition]);

  const propertyFor = (row: any) => {
    const linked = row?.propertyId ? propertyDirectory.get(String(row.propertyId)) : undefined;
    const label = String(row?.propertyLabel || row?.propertyName || linked?.name || '').trim();
    const address = String(row?.propertyAddress || linked?.address || '').trim();
    const usableLabel = label && label !== String(row?.propertyId || '') ? label : '';
    const shownLabel = usableLabel || address;
    const available = Boolean(row?.propertyId && row.propertyId !== 'UNALLOCATED' && (row?.propertyAvailable || shownLabel));
    return {
      available,
      id: available ? String(row.propertyId) : '',
      label: shownLabel,
      address: address && address !== shownLabel ? address : ''
    };
  };

  const summary = taxPosition?.dashboard || summaryFromAccounts(taxPosition);
  const compliance = summary?.compliance || { indicator: 'ATTENTION_REQUIRED', label: 'Attention Required' };
  const complianceColor = compliance.indicator === 'COMPLIANT'
    ? 'success'
    : compliance.indicator === 'RECONCILIATION_REQUIRED'
      ? 'error'
      : 'warning';

  const outstandingObligations = useMemo(
    () => obligations.filter((row) => Number(row.outstanding || 0) > 0.005 && row.status !== 'REVERSED'),
    [obligations]
  );

  const periodOptions = useMemo(() => {
    const periods = new Set<string>();
    obligations.forEach((row) => {
      if (row.taxPeriod) periods.add(String(row.taxPeriod));
    });
    return Array.from(periods).sort().reverse();
  }, [obligations]);

  const propertyOptions = useMemo(() => {
    const options = new Map<string, string>();
    obligations.forEach((row) => {
      const property = propertyFor(row);
      const id = property.available ? property.id : 'unavailable';
      const label = property.available
        ? `${property.label}${property.address ? ` — ${property.address}` : ''}`
        : 'Property information unavailable';
      options.set(id, label);
    });
    return Array.from(options.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [obligations, propertyDirectory]);

  const visibleObligations = useMemo(() => {
    const cutoffTime = cutoff ? new Date(`${cutoff}T23:59:59.999Z`).getTime() : null;
    const query = search.trim().toLowerCase();
    return obligations.filter((row) => {
      if (cutoffTime && row.transactionDate) {
        const time = new Date(row.transactionDate).getTime();
        if (!Number.isNaN(time) && time > cutoffTime) return false;
      }
      if (taxPeriod && String(row.taxPeriod || '') !== taxPeriod) return false;
      const property = propertyFor(row);
      if (propertyFilter) {
        const id = property.available ? property.id : 'unavailable';
        if (id !== propertyFilter) return false;
      }
      if (categoryFilter && row.categoryKey !== categoryFilter) return false;
      if (statusFilter && row.paymentStatus !== statusFilter) return false;
      if (query) {
        const haystack = [
          property.label,
          property.address,
          row.propertyLabel,
          row.propertyName,
          row.propertyAddress,
          row.sourcePaymentReference,
          row.paymentReference,
          row.zimraReference
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [obligations, cutoff, taxPeriod, propertyFilter, categoryFilter, statusFilter, search, propertyDirectory]);

  const addAllocation = () => {
    const amount = Number(allocAmount);
    if (!allocId || !(amount > 0)) return;
    const row = obligations.find((o) => String(o._id) === allocId);
    setAllocations((prev) => [
      ...prev,
      {
        taxObligationId: allocId,
        amount,
        label: `${row?.label || row?.taxType || allocId} · ${row?.taxPeriod || ''}`
      }
    ]);
    setAllocId('');
    setAllocAmount('');
  };

  const allocatedTotal = round2(allocations.reduce((s, a) => s + a.amount, 0));

  const submitPayment = async () => {
    const amount = Number(payAmount);
    if (!(amount > 0) || allocations.length === 0) {
      setError('Enter a payment amount and at least one allocation.');
      return;
    }
    if (Math.abs(allocatedTotal + Number(unallocatedAmount || 0) - amount) > 0.005) {
      setError(`Allocations (${allocatedTotal.toFixed(2)}) plus unallocated (${Number(unallocatedAmount || 0).toFixed(2)}) must equal the payment (${amount.toFixed(2)}).`);
      return;
    }
    if (Number(unallocatedAmount || 0) > 0 && !unallocatedReason.trim()) {
      setError('An unallocated amount requires an explicit reason.');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await accountingService.postZimraPayment({
        amount,
        paymentDate: payDate,
        bankAccountCode: bankCode,
        zimraReference: zimraRef || undefined,
        paymentReference: payRef || undefined,
        allocations: allocations.map((a) => ({ taxObligationId: a.taxObligationId, amount: a.amount })),
        unallocatedAmount: Number(unallocatedAmount || 0) || undefined,
        unallocatedReason: unallocatedReason || undefined
      });
      setPayOpen(false);
      setAllocations([]);
      setPayAmount('');
      setZimraRef('');
      setPayRef('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record ZIMRA payment');
    } finally {
      setBusy(false);
    }
  };

  const prepareReturn = async () => {
    try {
      setBusy(true);
      await accountingService.prepareVatReturn(filingPeriod);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to prepare VAT return');
    } finally {
      setBusy(false);
    }
  };

  const markSubmitted = async (period: string) => {
    const ref = window.prompt('ZIMRA return reference (manual — this app does not file with ZIMRA)');
    if (!ref) return;
    try {
      setBusy(true);
      await accountingService.patchVatReturn(period, { status: 'SUBMITTED', zimraReturnReference: ref });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update VAT return');
    } finally {
      setBusy(false);
    }
  };

  const loadMigration = async () => {
    try {
      setBusy(true);
      const report = await accountingService.getTaxMigrationReport();
      setMigration(report);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to build historical review');
    } finally {
      setBusy(false);
    }
  };

  const runIntegrity = async () => {
    try {
      setBusy(true);
      const report = await accountingService.runTaxIntegrity();
      setIntegrity(report);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to run tax integrity (detection only)');
    } finally {
      setBusy(false);
    }
  };

  const resolveReview = async (id: string) => {
    if (!resolution.trim()) {
      setError('Enter a resolution note.');
      return;
    }
    try {
      setBusy(true);
      await accountingService.resolveTaxReview(id, { resolution, status: 'ACKNOWLEDGED' });
      setResolution('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to resolve review');
    } finally {
      setBusy(false);
    }
  };

  const uploadReceipt = async (paymentId: string, file?: File) => {
    if (!file) return;
    try {
      setBusy(true);
      await accountingService.uploadTaxPaymentReceipt(paymentId, file);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to upload receipt');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !dashboard && !taxPosition) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const trust = dashboard?.trust;
  const categories = dashboard?.categories;

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" sx={{ mb: 0.5, fontWeight: 700 }}>Tax</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tax recognised, tax paid to ZIMRA, tax still outstanding, and tax funds held. This application does not file returns with ZIMRA. A receipt upload is not a payment.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Box>
          <Typography variant="overline" color="text.secondary">Compliance</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip label={compliance.label} color={complianceColor} />
            <Typography variant="body2" color="text.secondary">
              {compliance.indicator === 'COMPLIANT'
                ? 'No outstanding critical controls.'
                : 'Open the detailed review before treating this period as clear.'}
            </Typography>
          </Box>
        </Box>
        <Button variant="outlined" onClick={() => setTab('review')}>View detailed review</Button>
      </Paper>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab value="dashboard" label="Dashboard" />
        <Tab value="vat" label="VAT return" />
        <Tab value="payments" label="ZIMRA payments" />
        <Tab value="review" label={`Review (${reviews.length})`} />
        <Tab value="historical" label="Historical review" />
        <Tab value="ledgers" label="Property ledgers" />
      </Tabs>

      {tab === 'dashboard' && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ height: '100%', borderTop: 3, borderColor: 'primary.main' }}>
                <CardContent>
                  <Typography variant="overline">Total Tax Recognised</Typography>
                  <Typography variant="h5">{summary ? money(summary.recognised) : '—'}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Active tax obligations in this reporting view. Reversed obligations are excluded.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ height: '100%', borderTop: 3, borderColor: 'success.main' }}>
                <CardContent>
                  <Typography variant="overline">Tax Paid to ZIMRA</Typography>
                  <Typography variant="h5" color="success.main">{summary ? money(summary.paid) : '—'}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Confirmed allocations only. Receipts and unallocated payments are excluded.
                    {summary ? ` Unallocated ${money(summary.unallocatedPayments)}.` : ''}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ height: '100%', borderTop: 3, borderColor: Number(summary?.outstanding || 0) > 0 ? 'warning.main' : 'success.main' }}>
                <CardContent>
                  <Typography variant="overline">Tax Outstanding</Typography>
                  <Typography variant="h5" color={Number(summary?.outstanding || 0) > 0 ? 'warning.main' : 'success.main'}>
                    {summary ? money(summary.outstanding) : '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Unpaid balance on active obligations. Fully reversed obligations are excluded.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ height: '100%', borderTop: 3, borderColor: summary?.fundsHeld?.status === 'RECONCILED' ? 'success.main' : 'warning.main' }}>
                <CardContent>
                  <Typography variant="overline">Tax Funds Held</Typography>
                  <Typography variant="h5" color={summary?.fundsHeld?.status === 'RECONCILED' ? 'success.main' : 'warning.main'}>
                    {summary ? fundsText(summary.fundsHeld) : 'Not reconciled'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Reconciled trust tax book only. Recognised tax is not treated as cash held.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} lg={8}>
              <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, height: '100%' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Tax breakdown</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Capital Gains Withholding Tax is kept separate from Capital Gains Tax. Output VAT and other taxes stay in their own rows.
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tax category</TableCell>
                        <TableCell align="right">Recognised</TableCell>
                        <TableCell align="right">Paid</TableCell>
                        <TableCell align="right">Outstanding</TableCell>
                        <TableCell align="right">Tax funds held</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(summary?.categories || []).map((row: any) => (
                        <TableRow key={row.key}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{row.label}</Typography>
                            {row.key === 'CGT' && Number(row.recognised || 0) === 0 && Number(row.outstanding || 0) === 0 && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                No live Capital Gains Tax obligation
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">{money(row.recognised)}</TableCell>
                          <TableCell align="right">{money(row.paid)}</TableCell>
                          <TableCell align="right">{money(row.outstanding)}</TableCell>
                          <TableCell align="right">{fundsText(row.fundsHeld)}</TableCell>
                        </TableRow>
                      ))}
                      {summary?.total && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{money(summary.total.recognised)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{money(summary.total.paid)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{money(summary.total.outstanding)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{fundsText(summary.total.fundsHeld)}</TableCell>
                        </TableRow>
                      )}
                      {!summary && (
                        <TableRow>
                          <TableCell colSpan={5}>Tax summary is unavailable. No figure was estimated.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} lg={4}>
              <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, height: '100%' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Recognised tax</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Distribution of recognised obligations by category.
                </Typography>
                {summary?.chart?.length ? (
                  <Box sx={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={summary.chart} dataKey="recognised" nameKey="label" innerRadius={62} outerRadius={92} paddingAngle={2}>
                          {summary.chart.map((entry: any, index: number) => (
                            <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => money(Number(value || 0))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
                    No tax has been recognised for this reporting view.
                  </Typography>
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {(summary?.chart || []).map((entry: any, index: number) => (
                    <Box key={entry.key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="caption">{entry.label}</Typography>
                      <Typography variant="caption" sx={{ color: CHART_COLORS[index % CHART_COLORS.length], fontWeight: 700 }}>
                        {money(entry.recognised)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Tax obligations</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Filters only change this list. They do not change accounting entries. Summary cards follow the reporting cutoff and tax period.
            </Typography>
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <TextField select fullWidth size="small" label="Property" value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}>
                  <MenuItem value="">All properties</MenuItem>
                  {propertyOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <TextField select fullWidth size="small" label="Tax category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <MenuItem value="">All categories</MenuItem>
                  {CATEGORY_FILTERS.map((option) => (
                    <MenuItem key={option.key} value={option.key}>{option.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <TextField select fullWidth size="small" label="Tax period" value={taxPeriod} onChange={(event) => setTaxPeriod(event.target.value)}>
                  <MenuItem value="">All periods</MenuItem>
                  {periodOptions.map((period) => (
                    <MenuItem key={period} value={period}>{period}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <TextField select fullWidth size="small" label="Payment status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <MenuItem value="">All statuses</MenuItem>
                  {STATUS_FILTERS.map((status) => (
                    <MenuItem key={status} value={status}>{status}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Reporting cutoff"
                  type="date"
                  value={cutoff}
                  onChange={(event) => setCutoff(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  helperText="Read only"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Property, address or reference"
                />
              </Grid>
            </Grid>
            {(cutoff || taxPeriod || propertyFilter || categoryFilter || statusFilter || search) && (
              <Button
                size="small"
                sx={{ mb: 1 }}
                onClick={() => {
                  setCutoff('');
                  setTaxPeriod('');
                  setPropertyFilter('');
                  setCategoryFilter('');
                  setStatusFilter('');
                  setSearch('');
                }}
              >
                Clear filters
              </Button>
            )}
            <Alert severity="info" sx={{ mb: 1 }}>
              Reversed obligations remain in this list for audit. Their outstanding balance is zero and they are not added to tax outstanding.
            </Alert>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Property</TableCell>
                    <TableCell>Tax Type</TableCell>
                    <TableCell>Tax Period</TableCell>
                    <TableCell align="right">Tax Amount</TableCell>
                    <TableCell align="right">Amount Paid</TableCell>
                    <TableCell align="right">Outstanding Balance</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleObligations.map((row) => {
                    const property = propertyFor(row);
                    return (
                    <TableRow key={row._id} hover>
                      <TableCell sx={{ minWidth: 180 }}>
                        {property.available ? (
                          <Link
                            component={RouterLink}
                            to={`/accountant-dashboard/property-accounts/${property.id}`}
                            underline="hover"
                            sx={{ fontWeight: 700, display: 'block' }}
                          >
                            {property.label}
                          </Link>
                        ) : (
                          <Typography variant="body2" fontWeight={700}>Property information unavailable</Typography>
                        )}
                        {property.address && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {property.address}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{row.label || row.taxType}</TableCell>
                      <TableCell>{row.taxPeriod || '—'}</TableCell>
                      <TableCell align="right">{money(row.taxAmount)}</TableCell>
                      <TableCell align="right">{money(row.amountPaid || 0)}</TableCell>
                      <TableCell align="right">{money(row.outstanding || 0)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={row.paymentStatus || row.status} color={statusColor(row.paymentStatus || row.status)} />
                      </TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => setInspected(row)}>Inspect</Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {visibleObligations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        {obligations.length === 0
                          ? 'NO LIVE VAT OBLIGATIONS — no tax obligations match this view. Nothing was invented.'
                          : 'No tax obligations match these filters.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {tab === 'vat' && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="Filing period"
              type="month"
              value={filingPeriod}
              onChange={(e) => setFilingPeriod(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button variant="contained" onClick={prepareReturn} disabled={busy}>Prepare working paper</Button>
          </Box>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Preparing a working paper does not submit it to ZIMRA. Record the ZIMRA reference after the accountant files it externally.
            The working paper must show taxable supplies, exempt supplies, zero-rated supplies, output VAT, input VAT, VAT on commission, VAT on taxable property sales, VAT adjustments, VAT withholding credits, and net VAT payable. Receipt uploaded is not tax paid.
          </Alert>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Period</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Taxable</TableCell>
                  <TableCell align="right">Exempt</TableCell>
                  <TableCell align="right">Zero-rated</TableCell>
                  <TableCell align="right">VAT on commission</TableCell>
                  <TableCell align="right">VAT on sales</TableCell>
                  <TableCell align="right">Output VAT</TableCell>
                  <TableCell align="right">GL 2101</TableCell>
                  <TableCell align="right">Difference</TableCell>
                  <TableCell align="right">Input VAT</TableCell>
                  <TableCell align="right">Credits</TableCell>
                  <TableCell align="right">Net payable</TableCell>
                  <TableCell>ZIMRA ref</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {vatReturns.map((row) => (
                  <TableRow key={row._id || row.filingPeriod}>
                    <TableCell>{row.filingPeriod}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell align="right">{money(row.taxableSupplies)}</TableCell>
                    <TableCell align="right">{money(row.exemptSupplies)}</TableCell>
                    <TableCell align="right">{money(row.zeroRatedSupplies)}</TableCell>
                    <TableCell align="right">{money(row.vatOnCommission)}</TableCell>
                    <TableCell align="right">{money(row.vatOnSales)}</TableCell>
                    <TableCell align="right">{money(row.outputVat)}</TableCell>
                    <TableCell align="right">{money(row.glOutputVat || 0)}</TableCell>
                    <TableCell align="right">
                      {money(row.reconciliationDifference || 0)}
                      {row.reconciliationStatus === 'RECONCILIATION_REQUIRED' ? ' · RECONCILIATION REQUIRED' : ''}
                    </TableCell>
                    <TableCell align="right">{money(row.inputVat)}</TableCell>
                    <TableCell align="right">{money(row.vatWithholdingCredits)}</TableCell>
                    <TableCell align="right">{money(row.netVatPayable)}</TableCell>
                    <TableCell>{row.zimraReturnReference || '—'}</TableCell>
                    <TableCell>
                      {row.status === 'PREPARED' || row.status === 'REVIEWED' ? (
                        <Button size="small" onClick={() => markSubmitted(row.filingPeriod)}>Mark submitted</Button>
                      ) : null}
                      {row.status === 'PAID' ? (
                        <Button size="small" onClick={async () => {
                          const note = row.reconciliationStatus === 'RECONCILIATION_REQUIRED'
                            ? window.prompt('Document the timing difference before marking RECONCILED')
                            : 'Matched';
                          if (row.reconciliationStatus === 'RECONCILIATION_REQUIRED' && !note) return;
                          try {
                            setBusy(true);
                            await accountingService.patchVatReturn(row.filingPeriod, { status: 'RECONCILED', notes: note || undefined });
                            await load();
                          } catch (err: any) {
                            setError(err?.response?.data?.message || err?.message || 'Failed to mark reconciled');
                          } finally {
                            setBusy(false);
                          }
                        }}>Mark reconciled</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {vatReturns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={15}>NO LIVE VAT OBLIGATIONS — no VAT return working paper exists. None was invented.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {tab === 'payments' && (
        <Box>
          <Button variant="contained" sx={{ mb: 2 }} onClick={() => setPayOpen(true)}>Record ZIMRA payment</Button>
          <Alert severity="info" sx={{ mb: 2 }}>
            Amount paid is the bank payment. Only the allocated amount settles a tax obligation. Uploading a receipt does not mark tax as paid, and an unallocated amount is not treated as paid tax.
          </Alert>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Payment date</TableCell>
                  <TableCell>ZIMRA reference</TableCell>
                  <TableCell>Payment reference</TableCell>
                  <TableCell>Tax category</TableCell>
                  <TableCell align="right">Amount paid</TableCell>
                  <TableCell align="right">Allocated amount</TableCell>
                  <TableCell align="right">Unallocated amount</TableCell>
                  <TableCell>Receipt / documentation</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((row) => {
                  const open = openPaymentId === String(row._id);
                  const categoriesLabel = (row.categories || []).join(', ') || '—';
                  return (
                    <React.Fragment key={row._id}>
                      <TableRow hover>
                        <TableCell>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>{row.zimraReference || '—'}</TableCell>
                        <TableCell>{row.paymentReference || '—'}</TableCell>
                        <TableCell>{categoriesLabel}</TableCell>
                        <TableCell align="right">{money(row.amount)}</TableCell>
                        <TableCell align="right">{money(row.allocatedAmount || 0)}</TableCell>
                        <TableCell align="right">{money(row.unallocatedAmount || 0)}</TableCell>
                        <TableCell>
                          <Typography variant="body2">{row.receiptFileName ? 'Receipt on file' : 'No receipt'}</Typography>
                          <Button size="small" component="label" disabled={busy}>
                            Attach receipt
                            <input hidden type="file" onChange={(e) => uploadReceipt(row._id, e.target.files?.[0])} />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={row.status || 'POSTED'} color={statusColor(row.status || 'POSTED')} />
                          {Number(row.unallocatedAmount || 0) > 0.005 && (
                            <Chip size="small" label="Unallocated" color="warning" sx={{ ml: 0.5 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => setOpenPaymentId(open ? null : String(row._id))}>
                            {open ? 'Hide' : 'View settled tax'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow>
                          <TableCell colSpan={10} sx={{ bgcolor: 'action.hover' }}>
                            {(row.settledObligations || []).length === 0 && (
                              <Typography variant="body2">No tax obligation has been settled by this payment.</Typography>
                            )}
                            {(row.settledObligations || []).map((item: any) => (
                              <Typography key={`${item.taxObligationId}-${item.amount}`} variant="body2">
                                {item.propertyLabel || 'Property information unavailable'}
                                {item.propertyAddress ? ` · ${item.propertyAddress}` : ''} · {item.label || item.taxType} · {item.taxPeriod || '—'} · {money(item.amount)}
                              </Typography>
                            ))}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10}>No ZIMRA payments have been recorded.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {tab === 'review' && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Detailed review</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Detailed control result: {dashboard?.complianceLabel || 'Attention required'}. Controls passed only when every listed control is clear. These warnings are not closed from the overview.
          </Typography>

          {taxPosition?.newPeriod && (
            <Alert severity={taxPosition.newPeriod.status === 'RECONCILED' ? 'success' : 'warning'} sx={{ mb: 2 }}>
              New-period tax path: {String(taxPosition.newPeriod.status || '').replace(/_/g, ' ')}.
              {' '}Go-live {taxPosition.newPeriod.goLive ? new Date(taxPosition.newPeriod.goLive).toLocaleString() : 'not demonstrated'}.
              {' '}Eligible sources {taxPosition.newPeriod.eligibleSources}. Obligations {taxPosition.newPeriod.createdObligations} of {taxPosition.newPeriod.expectedObligations}.
              {' '}Active outstanding {money(taxPosition.newPeriod.activeOutstanding)}. Account 2101 for those sources {money(taxPosition.newPeriod.newGlCreditNormal)}.
              {' '}Legacy taxable sources are listed separately and are not added to this outstanding amount.
            </Alert>
          )}
          {taxPosition && (
            <Alert severity={taxPosition.status === 'RECONCILED' ? 'success' : 'warning'} sx={{ mb: 2 }}>
              Reconciliation: {String(taxPosition.status || '').replace(/_/g, ' ')}.
              {' '}Reporting cutoff: {taxPosition.asOf ? new Date(taxPosition.asOf).toLocaleString() : 'latest posted records'}.
              {' '}Unallocated tax payments: {money(taxPosition.unallocatedPayments || 0)}.
              {' '}Dashboard totals and property ledgers use the same posted obligations. Historical trust tax books stay separate and are not adjusted.
            </Alert>
          )}

          {dashboard?.vatRateReview && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography fontWeight={700}>VAT RATE REVIEW REQUIRED</Typography>
              <Typography variant="body2">{dashboard.vatRateReview.message}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>Settings → Tax Rates</Typography>
            </Alert>
          )}

          {categories && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>Tax control warnings</Typography>
              <Typography variant="body2">VAT · {categories.VAT.periodsRequireReview} periods require review · {categories.VAT.periodsUnpaid} period unpaid</Typography>
              <Typography variant="body2">Capital Gains Tax · {categories.CGT.historicalCalculationsRequireReview} historical calculations require review</Typography>
              <Typography variant="body2">Capital Gains Withholding Tax · {categories.CGWT.missingApplicability} sale missing applicability decision</Typography>
              <Typography variant="body2">TRUST · {categories.TRUST.reconciliationDifferences} reconciliation differences · scope {categories.TRUST.scope}</Typography>
              <Typography variant="body2">FISCALISATION · {categories.FISCALISATION.invoicesNotFiscalised} invoices not fiscalised</Typography>
              <Typography variant="body2">Historical Data · {categories.HISTORICAL_DATA.openReviews} open reviews</Typography>
            </Paper>
          )}

          {trust && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>Trust vs client ledgers</Typography>
              <Chip size="small" label={`TRUST RECONCILIATION SCOPE ${trust.scope || 'PARTIAL'}`} sx={{ mb: 1, mr: 1 }} />
              <Chip
                size="small"
                color={trust.status === 'RECONCILIATION_EXCEPTION' ? 'error' : 'default'}
                label={trust.status === 'RECONCILIATION_EXCEPTION' ? 'RECONCILIATION EXCEPTION' : 'BALANCED WITHIN SCOPE'}
                sx={{ mb: 1 }}
              />
              <Alert severity="warning" sx={{ mb: 1 }}>
                This is PARTIAL. BALANCED WITHIN SCOPE is not a full trust-account reconciliation.
              </Alert>
              <Typography variant="body2">Trust bank (1003): {money(trust.trustBank)}</Typography>
              <Typography variant="body2">Client liabilities (in-scope GL): {money(trust.clientLedgers)}</Typography>
              <Typography variant="body2">Difference: {money(trust.difference)}</Typography>
              {trust.note && <Typography variant="caption" display="block" sx={{ mt: 1 }}>{trust.note}</Typography>}
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Included</Typography>
              <Typography variant="body2">Owner rental funds (2103)</Typography>
              <Typography variant="body2">Seller proceeds (2104)</Typography>
              <Typography variant="body2">Tax withheld (2105)</Typography>
              <Typography variant="body2">Tenant deposits (2106)</Typography>
              <Typography variant="body2">Levies (2107)</Typography>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Excluded</Typography>
              <Typography variant="body2">Buyer deposits held only in sales subledgers</Typography>
              <Typography variant="body2">Maintenance funds</Typography>
              <Typography variant="body2">Unallocated receipts</Typography>
              <Typography variant="body2">Other refundable balances</Typography>
              <Typography variant="body2">Per-owner historical rental subledgers</Typography>
              <Typography variant="body2">External lawyer/escrow/developer custody</Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={runIntegrity} disabled={busy}>
                Run tax integrity (detection only)
              </Button>
              {integrity && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Integrity run {integrity.generatedAt}: {(integrity.findings || []).length} finding(s). Detection only — no amounts repaired.
                </Alert>
              )}
            </Paper>
          )}

          {dashboard?.companyAccountVsGl && (
            <Alert severity="info" sx={{ mb: 2 }}>{dashboard.companyAccountVsGl}</Alert>
          )}
          {dashboard && (
            <Alert severity="info" sx={{ mb: 2 }}>
              PAYE: {dashboard.paye.note} Corporate income tax: {dashboard.corporateTax.note}
            </Alert>
          )}

          <TextField
            fullWidth
            sx={{ mb: 2 }}
            label="Resolution note"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          {reviews.map((row) => (
            <Paper key={row._id} variant="outlined" sx={{ p: 2, mb: 1 }}>
              <Typography fontWeight={600}>{row.title}</Typography>
              <Typography variant="body2" color="text.secondary">{row.kind} · {row.status} · {row.severity || 'MEDIUM'}</Typography>
              {row.detail && <Typography variant="body2" sx={{ mt: 1 }}>{row.detail}</Typography>}
              {row.currentAmount != null && <Typography variant="caption" display="block">Current amount: {money(row.currentAmount)} · {row.expectedBasis || ''}</Typography>}
              <Button size="small" sx={{ mt: 1 }} onClick={() => resolveReview(row._id)} disabled={busy}>Acknowledge</Button>
            </Paper>
          ))}
          {reviews.length === 0 && <Typography color="text.secondary">No open tax reviews.</Typography>}
        </Box>
      )}

      {tab === 'historical' && (
        <Box>
          <Button variant="contained" onClick={loadMigration} disabled={busy} sx={{ mb: 2 }}>
            Generate historical tax review
          </Button>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This report does not recalculate or rewrite historical VAT, CGT, commission, journals, or balances.
          </Alert>
          {migration && (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>{migration.note}</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Reference</TableCell>
                      <TableCell>Issue</TableCell>
                      <TableCell>Detail</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(migration.issues || []).map((issue: any, idx: number) => (
                      <TableRow key={`${issue.reference}-${idx}`}>
                        <TableCell>{issue.reference}</TableCell>
                        <TableCell>{issue.kind}</TableCell>
                        <TableCell>{issue.detail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      )}

      {tab === 'ledgers' && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Property ledgers use the same posted obligations as the dashboard.
            {cutoff ? ` Reporting cutoff ${cutoff} is a read-only view.` : ' No reporting cutoff is applied.'}
          </Typography>
          <TaxAccountsPage position={taxPosition} onLedgerChange={() => { void load(); }} />
        </Box>
      )}

      <Dialog open={Boolean(inspected)} onClose={() => setInspected(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Tax obligation</DialogTitle>
        <DialogContent>
          {inspected && (() => {
            const property = propertyFor(inspected);
            return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
              <Typography variant="body2">
                Property: {property.available ? property.label : 'Property information unavailable'}
              </Typography>
              {property.address && <Typography variant="body2">{property.address}</Typography>}
              <Typography variant="body2">Tax type: {inspected.label || inspected.taxType}</Typography>
              <Typography variant="body2">Tax period: {inspected.taxPeriod || '—'}</Typography>
              <Typography variant="body2">Tax amount: {money(inspected.taxAmount)}</Typography>
              <Typography variant="body2">Amount paid: {money(inspected.amountPaid || 0)}</Typography>
              <Typography variant="body2">Outstanding balance: {money(inspected.outstanding || 0)}</Typography>
              <Typography variant="body2">Status: {inspected.paymentStatus || inspected.status}</Typography>
              <Typography variant="body2">Basis: {inspected.calculationBasis || '—'}</Typography>
              <Typography variant="body2">
                Source payment: {inspected.sourcePaymentReference || inspected.paymentReference || (inspected.paymentId ? String(inspected.paymentId) : 'Source payment information unavailable')}
              </Typography>
              {inspected.zimraReference && <Typography variant="body2">ZIMRA reference: {inspected.zimraReference}</Typography>}
              <Typography variant="caption" color="text.secondary">
                This view does not create a journal, change the payment, or repair the obligation.
              </Typography>
              {property.available && (
                <Button component={RouterLink} to={`/accountant-dashboard/property-accounts/${property.id}`} size="small">
                  Open property
                </Button>
              )}
            </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInspected(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={payOpen} onClose={() => !busy && setPayOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Record ZIMRA payment</DialogTitle>
        <DialogContent>
          <TextField fullWidth margin="normal" type="number" label="Amount" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          <TextField fullWidth margin="normal" type="date" label="Payment date" value={payDate} onChange={(e) => setPayDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField fullWidth margin="normal" select label="Bank account" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
            <MenuItem value="1001">1001 Company Bank (VAT remittance)</MenuItem>
            <MenuItem value="1003">1003 Client Trust Bank (withholding remittance)</MenuItem>
          </TextField>
          <TextField fullWidth margin="normal" label="ZIMRA reference" value={zimraRef} onChange={(e) => setZimraRef(e.target.value)} />
          <TextField fullWidth margin="normal" label="Payment reference" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>Allocations</Typography>
          {allocations.map((a, i) => (
            <Typography key={`${a.taxObligationId}-${i}`} variant="body2">
              {a.label}: {money(a.amount)}
            </Typography>
          ))}
          <Typography variant="caption" display="block">Allocated {money(allocatedTotal)}</Typography>
          <TextField fullWidth margin="normal" type="number" label="Unallocated amount" value={unallocatedAmount} onChange={(e) => setUnallocatedAmount(e.target.value)} helperText="Required if the bank amount exceeds tax allocations" />
          {Number(unallocatedAmount || 0) > 0 && (
            <TextField fullWidth margin="normal" label="Unallocated reason" value={unallocatedReason} onChange={(e) => setUnallocatedReason(e.target.value)} />
          )}
          <TextField
            fullWidth
            margin="normal"
            select
            label="Obligation"
            value={allocId}
            onChange={(e) => setAllocId(e.target.value)}
          >
            {outstandingObligations.map((row) => (
              <MenuItem key={row._id} value={row._id}>
                {row.label || row.taxType} {row.taxPeriod} outstanding {money(row.outstanding)}
              </MenuItem>
            ))}
          </TextField>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField type="number" label="Allocate" value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)} />
            <Button onClick={addAllocation}>Add</Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={submitPayment} disabled={busy}>Post payment</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

function round2(n: number): number {
  return Number(Number(n || 0).toFixed(2));
}

export default TaxCompliancePage;
