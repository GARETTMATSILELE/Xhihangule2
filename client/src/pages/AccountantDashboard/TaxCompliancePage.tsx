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
  MenuItem,
  Paper,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import accountingService, { TaxComplianceDashboard } from '../../services/accountingService';
import TaxAccountsPage from './TaxAccountsPage';

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0));

const currentPeriod = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const TaxCompliancePage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<TaxComplianceDashboard | null>(null);
  const [obligations, setObligations] = useState<any[]>([]);
  const [vatReturns, setVatReturns] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [migration, setMigration] = useState<any>(null);
  const [integrity, setIntegrity] = useState<any>(null);
  const [filingPeriod, setFilingPeriod] = useState(currentPeriod());
  const [busy, setBusy] = useState(false);

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
      accountingService.listTaxReviews()
    ]);
    const failed = settled
      .map((result, index) => {
        if (result.status !== 'rejected') return null;
        const err: any = result.reason;
        const urls = ['tax-compliance', 'tax-obligations', 'vat-returns', 'tax-payments', 'tax-reviews'];
        return `${urls[index]}: ${err?.response?.data?.message || err?.message || 'request failed'}`;
      })
      .filter(Boolean) as string[];
    if (settled[0].status === 'fulfilled') setDashboard(settled[0].value);
    if (settled[1].status === 'fulfilled') setObligations(settled[1].value);
    if (settled[2].status === 'fulfilled') setVatReturns(settled[2].value);
    if (settled[3].status === 'fulfilled') setPayments(settled[3].value);
    if (settled[4].status === 'fulfilled') setReviews(settled[4].value);
    if (failed.length) setError(failed.join(' · '));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const outstandingObligations = useMemo(
    () => obligations.filter((row) => Number(row.outstanding || 0) > 0.005 && row.status !== 'REVERSED'),
    [obligations]
  );

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

  if (loading && !dashboard) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const trust = dashboard?.trust;
  const categories = dashboard?.categories;
  const complianceLabel = dashboard?.allClear ? 'Controls passed' : (dashboard?.complianceLabel || 'Attention required');

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>Tax Compliance</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Server-calculated tax obligations. This application does not file returns with ZIMRA. A receipt upload is not a payment.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label="Dashboard" />
        <Tab label="Obligations" />
        <Tab label="VAT return" />
        <Tab label="ZIMRA payments" />
        <Tab label={`Review (${reviews.length})`} />
        <Tab label="Historical review" />
        <Tab label="Property ledgers" />
      </Tabs>

      {tab === 0 && dashboard && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">VAT Payable</Typography>
                <Typography variant="h5">{money(dashboard.vatPayable)}</Typography>
                {obligations.filter((row) => String(row.taxType || '').startsWith('VAT')).length === 0 && (
                  <Typography variant="caption" color="text.secondary" display="block">NO LIVE VAT OBLIGATIONS</Typography>
                )}
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">VAT Paid</Typography>
                <Typography variant="h5">{money(dashboard.vatPaid)}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">VAT Outstanding</Typography>
                <Typography variant="h5">{money(dashboard.vatOutstanding)}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">Controls</Typography>
                <Chip label={complianceLabel} color={dashboard?.allClear ? 'success' : 'warning'} />
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  A generic Compliant badge is not shown unless every control passes.
                </Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">Capital Gains Tax outstanding</Typography>
                <Typography variant="h5">{money(dashboard.cgtOutstanding || 0)}</Typography>
                {Number(dashboard.cgtOutstanding || 0) === 0 && (
                  <Typography variant="caption" color="text.secondary" display="block">No live Capital Gains Tax obligation</Typography>
                )}
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">Capital Gains Withholding Tax Withheld</Typography>
                <Typography variant="h5">{money(dashboard.cgwtWithheld)}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">Capital Gains Withholding Tax Remitted</Typography>
                <Typography variant="h5">{money(dashboard.cgwtRemitted)}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">Capital Gains Withholding Tax Outstanding</Typography>
                <Typography variant="h5">{money(dashboard.cgwtOutstanding)}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card><CardContent>
                <Typography variant="overline">Trust tax outstanding</Typography>
                <Typography variant="h5">{money(dashboard.trustTaxOutstanding)}</Typography>
              </CardContent></Card>
            </Grid>
          </Grid>

          {dashboard.vatRateReview && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography fontWeight={700}>VAT RATE REVIEW REQUIRED</Typography>
              <Typography variant="body2">{dashboard.vatRateReview.message}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>Settings → Tax Rates</Typography>
            </Alert>
          )}

          {categories && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>TAX COMPLIANCE</Typography>
              <Typography variant="body2">VAT · {categories.VAT.periodsRequireReview} periods require review · {categories.VAT.periodsUnpaid} period unpaid</Typography>
              <Typography variant="body2">Capital Gains Tax · {categories.CGT.historicalCalculationsRequireReview} historical calculations require review</Typography>
              <Typography variant="body2">Capital Gains Withholding Tax · {categories.CGWT.missingApplicability} sale missing applicability decision</Typography>
              <Typography variant="body2">TRUST · {categories.TRUST.reconciliationDifferences} reconciliation differences · scope {categories.TRUST.scope}</Typography>
              <Typography variant="body2">FISCALISATION · {categories.FISCALISATION.invoicesNotFiscalised} invoices not fiscalised</Typography>
              <Typography variant="body2">Historical Data · {categories.HISTORICAL_DATA.openReviews} open reviews</Typography>
            </Paper>
          )}

          {trust && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>Trust vs client ledgers</Typography>
              <Chip size="small" label={`TRUST RECONCILIATION SCOPE ${trust.scope || 'PARTIAL'}`} sx={{ mb: 1, mr: 1 }} />
              <Chip
                size="small"
                color={trust.status === 'RECONCILIATION_EXCEPTION' ? 'error' : 'default'}
                label={
                  trust.status === 'RECONCILIATION_EXCEPTION'
                    ? 'RECONCILIATION EXCEPTION'
                    : 'BALANCED WITHIN SCOPE'
                }
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

          {dashboard.companyAccountVsGl && (
            <Alert severity="info" sx={{ mb: 2 }}>{dashboard.companyAccountVsGl}</Alert>
          )}

          <Alert severity="info" sx={{ mb: 2 }}>
            PAYE: {dashboard.paye.note} Corporate income tax: {dashboard.corporateTax.note}
          </Alert>
        </>
      )}

      {tab === 1 && (
        <Paper sx={{ overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Period</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Tax</TableCell>
                <TableCell align="right">Outstanding</TableCell>
                <TableCell>Basis</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {obligations.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{row.label || row.taxType}</TableCell>
                  <TableCell>{row.taxPeriod}</TableCell>
                  <TableCell><Chip size="small" label={row.status} /></TableCell>
                  <TableCell align="right">{money(row.taxAmount)}</TableCell>
                  <TableCell align="right">{money(row.outstanding)}</TableCell>
                  <TableCell>{row.calculationBasis}</TableCell>
                </TableRow>
              ))}
              {obligations.length === 0 && (
                <TableRow><TableCell colSpan={6}>NO LIVE VAT OBLIGATIONS — no tax obligations have been created. This company configuration is shown as-is.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      {tab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
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
        </Box>
      )}

      {tab === 3 && (
        <Box>
          <Button variant="contained" sx={{ mb: 2 }} onClick={() => setPayOpen(true)}>Record ZIMRA payment</Button>
          <Alert severity="info" sx={{ mb: 2 }}>
            Payment posts Dr VAT Payable / withholding and Cr the selected bank. Uploading a receipt does not mark tax as paid.
          </Alert>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>ZIMRA ref</TableCell>
                <TableCell>Payment ref</TableCell>
                <TableCell>Receipt</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '—'}</TableCell>
                  <TableCell align="right">{money(row.amount)}</TableCell>
                  <TableCell>{row.zimraReference || '—'}</TableCell>
                  <TableCell>{row.paymentReference || '—'}</TableCell>
                  <TableCell>{row.receiptFileName ? 'Receipt uploaded' : 'No receipt'}</TableCell>
                  <TableCell>
                    <Button size="small" component="label" disabled={busy}>
                      Attach receipt
                      <input hidden type="file" onChange={(e) => uploadReceipt(row._id, e.target.files?.[0])} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {tab === 4 && (
        <Box>
          <TextField
            fullWidth
            sx={{ mb: 2 }}
            label="Resolution note"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          {reviews.map((row) => (
            <Paper key={row._id} sx={{ p: 2, mb: 1 }}>
              <Typography fontWeight={600}>{row.title}</Typography>
              <Typography variant="body2" color="text.secondary">{row.kind} · {row.status} · {row.severity || 'MEDIUM'}</Typography>
              {row.detail && <Typography variant="body2" sx={{ mt: 1 }}>{row.detail}</Typography>}
              {row.currentAmount != null && <Typography variant="caption" display="block">Current amount: {money(row.currentAmount)} · {row.expectedBasis || ''}</Typography>}
              <Button size="small" sx={{ mt: 1, mr: 1 }} onClick={() => resolveReview(row._id)} disabled={busy}>Acknowledge</Button>
            </Paper>
          ))}
          {reviews.length === 0 && <Typography color="text.secondary">No open tax reviews.</Typography>}
        </Box>
      )}

      {tab === 5 && (
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
            </>
          )}
        </Box>
      )}

      {tab === 6 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Property tax ledgers below are the existing trust tax books. New ZIMRA remittances that clear GL should be recorded on the ZIMRA payments tab, not as a ledger-only payout.
          </Alert>
          <TaxAccountsPage />
        </Box>
      )}

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
