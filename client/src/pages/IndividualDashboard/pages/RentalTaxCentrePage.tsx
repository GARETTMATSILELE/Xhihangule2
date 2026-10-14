import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { PageShell, StatCard } from '../components/shared';
import { INDIVIDUAL_THEME } from '../theme';
import { money } from '../utils/formatters';

function display(value: number | null | undefined) {
  return value == null ? 'not calculated' : money(value);
}

export function RentalTaxCentrePage() {
  const [tab, setTab] = useState(0);
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [overview, setOverview] = useState<any>(null);
  const [paper, setPaper] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [review, setReview] = useState<any[]>([]);
  const [recon, setRecon] = useState<any>(null);
  const [annual, setAnnual] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: 0, paymentDate: new Date().toISOString().slice(0, 10), paymentReference: '', zimraReference: '', notes: '' });

  const load = () => {
    setError(null);
    Promise.all([
      individualWorkspaceService.getRentalTaxOverview(periodKey).catch((err) => { setError(err?.message || 'Unable to load rental tax'); return null; }),
      individualWorkspaceService.getRentalTaxWorkingPaper(periodKey).catch(() => null),
      individualWorkspaceService.getRentalTaxTransactions({ periodKey }).catch(() => []),
      individualWorkspaceService.getRentalTaxReview().catch(() => []),
      individualWorkspaceService.getRentalTaxReconciliation(periodKey).catch(() => null),
      individualWorkspaceService.getRentalTaxAnnual(Number(periodKey.slice(0, 4))).catch(() => null)
    ]).then(([nextOverview, nextPaper, nextTx, nextReview, nextRecon, nextAnnual]) => {
      setOverview(nextOverview);
      setPaper(nextPaper);
      setTransactions(Array.isArray(nextTx) ? nextTx : []);
      setReview(Array.isArray(nextReview) ? nextReview : []);
      setRecon(nextRecon);
      setAnnual(nextAnnual);
    });
  };

  useEffect(() => { load(); }, [periodKey]);

  return (
    <PageShell title="Rental Tax" subtitle="Presumptive rental income tax working paper. Calculated amounts are not a confirmed ZIMRA liability.">
      <Alert severity="info" sx={{ mb: 2 }}>
        Calculated rental tax based on configured Zimbabwe tax rules. VAT is calculated separately. Income tax is not calculated here.
      </Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField label="Period (YYYY-MM)" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} />
        <Button onClick={load} sx={{ color: INDIVIDUAL_THEME.primary }}>Refresh</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getRentalTaxWorkingPaperUrl('csv', periodKey), '_blank')}>CSV</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getRentalTaxWorkingPaperUrl('xlsx', periodKey), '_blank')}>XLSX</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getRentalTaxWorkingPaperUrl('pdf', periodKey), '_blank')}>PDF</Button>
        <Button variant="outlined" onClick={() => setPayOpen(true)}>Record tax payment</Button>
      </Stack>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Overview" />
        <Tab label="Transactions" />
        <Tab label="Working paper" />
        <Tab label="Payments" />
        <Tab label="Review" />
        <Tab label="Reconciliation" />
        <Tab label="Annual" />
      </Tabs>
      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Rental tax regime" value={String(overview?.rentalTaxRegime || '—')} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Current period" value={String(overview?.currentPeriod || periodKey)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Calculated rental tax" value={display(overview?.calculatedRentalTax)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Tax payments" value={money(overview?.taxPayments || 0)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Calculated balance" value={display(overview?.calculatedBalance)} /></Grid>
          <Grid item xs={12}><Typography color="text.secondary">{overview?.transactions || 0} transactions · {overview?.reviewItems || 0} review items</Typography></Grid>
        </Grid>
      )}
      {tab === 1 && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Stack spacing={1}>
              {transactions.map((row) => (
                <Box key={row.id} sx={{ py: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}`, cursor: 'pointer' }} onClick={() => setSelected(row)}>
                  <Typography fontWeight={600}>{row.rentalTaxRegime} · {row.calculationStatus}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.taxPeriodKey} · base {row.taxableRentalBase == null ? '—' : money(Number(row.taxableRentalBase))} · calculated tax {row.taxAmount == null ? 'not calculated' : money(Number(row.taxAmount))} · {row.taxRuleCode || 'no rule'}
                  </Typography>
                </Box>
              ))}
              {!transactions.length && <Typography color="text.secondary">No rental-tax records for this period.</Typography>}
            </Stack>
          </CardContent>
        </Card>
      )}
      {tab === 2 && paper && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography variant="h6">PRESUMPTIVE RENTAL INCOME TAX · {paper.taxPeriod}</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>{paper.disclaimer}</Typography>
            <Typography>Tax regime: {paper.rentalTaxRegime}</Typography>
            <Typography>Gross rental receipts {display(paper.grossRentalReceipts)}</Typography>
            <Typography>Excluded amounts ({display(paper.excludedAmounts)})</Typography>
            <Typography fontWeight={700}>Rental tax base {display(paper.rentalTaxBase)}</Typography>
            <Typography>Applicable rate {paper.applicableRate == null ? '—' : `${paper.applicableRate}%`}</Typography>
            <Typography fontWeight={700}>Calculated rental tax {display(paper.calculatedRentalTax)}</Typography>
            <Typography>Tax payments ({money(paper.taxPayments || 0)})</Typography>
            <Typography fontWeight={700}>Calculated balance {display(paper.calculatedBalance)}</Typography>
            <Button sx={{ mt: 2 }} onClick={() => setTab(1)}>Drill into transactions</Button>
          </CardContent>
        </Card>
      )}
      {tab === 3 && paper && (
        <Stack spacing={1}>
          {(paper.payments || []).map((row: any) => (
            <Card key={row.id} elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Typography fontWeight={600}>{money(row.amount)} {row.currency}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {String(row.paymentDate || '').slice(0, 10)} · ref {row.paymentReference || '—'} · ZIMRA {row.zimraReference || 'not confirmed'}
                </Typography>
                <Typography variant="caption">Landlord-recorded payment. Not proof that ZIMRA accepted the amount.</Typography>
              </CardContent>
            </Card>
          ))}
          {!(paper.payments || []).length && <Typography color="text.secondary">No recorded tax payments for this period.</Typography>}
        </Stack>
      )}
      {tab === 4 && (
        <Stack spacing={1}>
          {review.map((item) => (
            <Alert key={item.id} severity="warning">
              {item.sourceType} {item.sourceId}: {(item.reasons || []).join(', ') || item.calculationStatus}
            </Alert>
          ))}
          {!review.length && <Typography color="text.secondary">No rental-tax review items.</Typography>}
        </Stack>
      )}
      {tab === 5 && recon && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography>Detection only — no automatic repair.</Typography>
            <Typography>Calculated tax {display(recon.workingPaper?.calculatedRentalTax)} vs records {display(recon.recordTotals?.calculatedRentalTax)}</Typography>
            <Typography>Payments {money(recon.workingPaper?.taxPayments || 0)} · calculated balance {display(recon.workingPaper?.calculatedBalance)}</Typography>
            {(recon.findings || []).map((finding: any, index: number) => (
              <Alert key={`${finding.issueType}-${index}`} severity="warning" sx={{ mt: 1 }}>
                {finding.issueType}: {finding.reason}
              </Alert>
            ))}
            {!(recon.findings || []).length && <Alert severity="success" sx={{ mt: 1 }}>Rental-tax records match the working paper totals.</Alert>}
          </CardContent>
        </Card>
      )}
      {tab === 6 && annual && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography variant="h6">Annual rental tax schedule · {annual.year}</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>Foundation only — not a full annual tax pack.</Typography>
            {(annual.properties || []).map((row: any) => (
              <Box key={row.propertyId} sx={{ py: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}` }}>
                <Typography fontWeight={600}>{row.propertyName}</Typography>
                <Typography variant="body2">Gross {display(row.grossRentalReceipts)} · base {display(row.rentalTaxBase)} · calculated tax {display(row.calculatedRentalTax)} · payments {money(row.taxPayments || 0)} · balance {display(row.balance)}</Typography>
              </Box>
            ))}
            {!(annual.properties || []).length && <Typography color="text.secondary">No annual rental-tax rows yet.</Typography>}
          </CardContent>
        </Card>
      )}
      {selected && (
        <Alert severity="info" sx={{ mt: 2 }} onClose={() => setSelected(null)}>
          Rental Tax. Regime: {selected.rentalTaxRegime}. Tax rule: {selected.sourceReference || selected.taxRuleCode || '—'}. Period: {selected.taxPeriodKey}. Tax base: {selected.taxableRentalBase == null ? '—' : money(Number(selected.taxableRentalBase))}. Rate: {selected.taxRate == null ? '—' : `${selected.taxRate}%`}. Calculated tax: {selected.taxAmount == null ? 'not calculated' : money(Number(selected.taxAmount))}. Status: {selected.calculationStatus}. Source: {selected.sourceType} {selected.sourceId}.
        </Alert>
      )}
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record rental tax payment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">This is a landlord-recorded payment. It does not confirm that ZIMRA accepted the amount.</Alert>
            <TextField label="Amount" type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} />
            <TextField label="Payment date" type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="Payment reference" value={payForm.paymentReference} onChange={(e) => setPayForm({ ...payForm, paymentReference: e.target.value })} />
            <TextField label="ZIMRA reference" value={payForm.zimraReference} onChange={(e) => setPayForm({ ...payForm, zimraReference: e.target.value })} />
            <TextField label="Notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)}>Cancel</Button>
          <Button onClick={async () => {
            await individualWorkspaceService.recordRentalTaxPayment({ ...payForm, taxPeriodKey: periodKey });
            setPayOpen(false);
            load();
          }}>Save</Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}

export default RentalTaxCentrePage;
