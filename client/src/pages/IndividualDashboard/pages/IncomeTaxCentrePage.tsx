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
  MenuItem,
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

const DISCLAIMER =
  'Income-tax figures shown here are working-paper calculations based on the information and tax classifications recorded in Mantis. They are not a ZIMRA assessment or confirmation of tax payable.';

function display(value: number | null | undefined) {
  return value == null ? 'not calculated' : money(value);
}

export function IncomeTaxCentrePage() {
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
  const [adjOpen, setAdjOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: 0, paymentDate: new Date().toISOString().slice(0, 10), paymentReference: '', zimraReference: '', notes: '' });
  const [adjForm, setAdjForm] = useState({ amount: 0, adjustmentType: 'DEDUCTION', reason: '', explanation: '', currency: 'USD' });

  const load = () => {
    setError(null);
    Promise.all([
      individualWorkspaceService.getIncomeTaxOverview(periodKey).catch((err) => { setError(err?.message || 'Unable to load income tax'); return null; }),
      individualWorkspaceService.getIncomeTaxWorkingPaper(periodKey).catch(() => null),
      individualWorkspaceService.getIncomeTaxTransactions({ periodKey }).catch(() => []),
      individualWorkspaceService.getIncomeTaxReview().catch(() => []),
      individualWorkspaceService.getIncomeTaxReconciliation(periodKey).catch(() => null),
      individualWorkspaceService.getIncomeTaxAnnual(Number(periodKey.slice(0, 4))).catch(() => null)
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
    <PageShell title="Income Tax" subtitle="Ordinary income-tax working paper for trade and investment income. Calculated amounts are not a ZIMRA assessment.">
      <Alert severity="info" sx={{ mb: 2 }}>{DISCLAIMER}</Alert>
      {(review.length > 0 || (paper?.reviewItems || []).length > 0) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Some transactions require tax review before the working paper can be treated as complete.
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
        <TextField label="Period (YYYY-MM)" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} />
        <Button onClick={load} sx={{ color: INDIVIDUAL_THEME.primary }}>Refresh</Button>
        <Button onClick={async () => { await individualWorkspaceService.calculateIncomeTax(periodKey); load(); }}>Calculate</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getIncomeTaxWorkingPaperUrl('csv', periodKey), '_blank')}>CSV</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getIncomeTaxWorkingPaperUrl('xlsx', periodKey), '_blank')}>XLSX</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getIncomeTaxWorkingPaperUrl('pdf', periodKey), '_blank')}>PDF</Button>
        <Button variant="outlined" onClick={() => setAdjOpen(true)}>Add adjustment</Button>
        <Button variant="outlined" onClick={() => setPayOpen(true)}>Record tax payment</Button>
      </Stack>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Overview" />
        <Tab label="Working paper" />
        <Tab label="Transactions" />
        <Tab label="Adjustments" />
        <Tab label="Review" />
        <Tab label="Reconciliation" />
        <Tab label="Annual" />
        <Tab label="Exports" />
      </Tabs>
      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Tax year / period" value={String(overview?.currentPeriod || periodKey)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Accounting profit" value={display(overview?.accountingProfit)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Taxable income" value={display(overview?.taxableIncome)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Calculated income tax" value={display(overview?.calculatedIncomeTax)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Tax payment recorded" value={money(overview?.taxPayments || 0)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Unreconciled amount" value={display(overview?.unreconciledAmount)} /></Grid>
          <Grid item xs={12}><Typography color="text.secondary">{overview?.transactions || 0} transactions · {Array.isArray(overview?.reviewItems) ? overview.reviewItems.length : (overview?.reviewItems || 0)} review items · {overview?.calculationStatus || '—'}</Typography></Grid>
        </Grid>
      )}
      {tab === 1 && paper && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography variant="h6">INCOME TAX WORKING PAPER · {paper.taxPeriod}</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>{paper.disclaimer}</Typography>
            <Box sx={{ cursor: 'pointer' }} onClick={() => setTab(2)}><Typography>Income {display(paper.accountingIncome)}</Typography></Box>
            <Box sx={{ cursor: 'pointer' }} onClick={() => setTab(2)}><Typography>Expenses ({display(paper.accountingExpenses)})</Typography></Box>
            <Typography fontWeight={700}>Accounting profit {display(paper.accountingProfit)}</Typography>
            <Box sx={{ cursor: 'pointer' }} onClick={() => setTab(3)}><Typography>Add-backs {display(paper.addBacks)}</Typography></Box>
            <Typography>Deductions ({display(paper.deductions)})</Typography>
            <Typography>Exempt income ({display(paper.exemptIncome)})</Typography>
            <Typography>Capital adjustments {display(paper.capitalAdjustments)}</Typography>
            <Typography>Other adjustments {display(paper.otherTaxAdjustments)}</Typography>
            <Typography fontWeight={700}>Taxable income {display(paper.taxableIncome)}</Typography>
            <Typography>Applicable rule {paper.taxRuleCode || '—'} {paper.applicableRate == null ? '' : `${paper.applicableRate}%`} · {paper.sourceReference || ''}</Typography>
            <Typography fontWeight={700}>Calculated income tax {display(paper.calculatedIncomeTax)}</Typography>
            <Typography>Tax payments recorded ({money(paper.taxPayments || 0)})</Typography>
            <Typography fontWeight={700}>Unreconciled amount {display(paper.unreconciledAmount)}</Typography>
          </CardContent>
        </Card>
      )}
      {tab === 2 && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Stack spacing={1}>
              {transactions.map((row) => (
                <Box key={row.id} sx={{ py: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}`, cursor: 'pointer' }} onClick={() => setSelected(row)}>
                  <Typography fontWeight={600}>{row.classification} · {row.calculationStatus}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.taxPeriodKey} · {row.propertyName || row.propertyId || '—'} · income {row.accountingIncome == null ? '—' : money(Number(row.accountingIncome))} · expense {row.accountingExpenses == null ? '—' : money(Number(row.accountingExpenses))} · docs {row.supportingDocumentStatus || '—'} · {row.taxRuleCode || 'no rule'}
                  </Typography>
                </Box>
              ))}
              {!transactions.length && <Typography color="text.secondary">No income-tax line records for this period. Historical rows remain not yet tax-classified until a new write creates a snapshot.</Typography>}
            </Stack>
          </CardContent>
        </Card>
      )}
      {tab === 3 && paper && (
        <Stack spacing={1}>
          {(paper.adjustments || []).map((row: any) => (
            <Card key={row.id} elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Typography fontWeight={600}>{row.adjustmentType} · {money(row.amount)} {row.currency}</Typography>
                <Typography variant="body2">{row.reason}</Typography>
                <Typography variant="caption">{row.status} · {row.reviewStatus}</Typography>
                {row.status === 'PENDING' && (
                  <Button size="small" onClick={async () => { await individualWorkspaceService.approveIncomeTaxAdjustment(row.id); load(); }}>Approve</Button>
                )}
              </CardContent>
            </Card>
          ))}
          {!(paper.adjustments || []).length && <Typography color="text.secondary">No manual working-paper adjustments for this period.</Typography>}
        </Stack>
      )}
      {tab === 4 && (
        <Stack spacing={1}>
          {review.map((item) => (
            <Alert key={item.id} severity="warning">
              {item.sourceType} {item.sourceId}: {(item.reasons || []).join(', ') || item.calculationStatus}
            </Alert>
          ))}
          {!review.length && <Typography color="text.secondary">No income-tax review items.</Typography>}
        </Stack>
      )}
      {tab === 5 && recon && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography>Detection only — no automatic repair. Each line drills into transactions.</Typography>
            {(recon.lines || []).map((line: any) => (
              <Box key={line.key} sx={{ py: 0.5, cursor: 'pointer' }} onClick={() => setTab(line.key === 'taxPayments' ? 0 : 2)}>
                <Typography>{line.label}: {line.amount == null ? '—' : typeof line.amount === 'number' ? money(line.amount) : String(line.amount)}</Typography>
              </Box>
            ))}
            {(recon.findings || []).map((finding: any, index: number) => (
              <Alert key={`${finding.issueType}-${index}`} severity="warning" sx={{ mt: 1 }}>
                {finding.issueType}: {finding.reason}
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}
      {tab === 6 && annual && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography variant="h6">Annual income-tax foundation · {annual.year || periodKey.slice(0, 4)}</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>Foundation only — not a ZIMRA return and not a filing capability.</Typography>
            <Typography>Annual accounting profit {display(annual.accountingProfit)}</Typography>
            <Typography>Annual taxable income {display(annual.taxableIncome)}</Typography>
            <Typography>Annual calculated income tax {display(annual.calculatedIncomeTax)}</Typography>
            <Typography>Tax payments recorded {money(annual.taxPayments || 0)}</Typography>
            <Typography>Unreconciled amount {display(annual.unreconciledAmount)}</Typography>
            <Typography>Review items {annual.reviewItems || 0} · supporting documents {annual.supportingDocumentCompleteness}</Typography>
          </CardContent>
        </Card>
      )}
      {tab === 7 && (
        <Stack spacing={2}>
          <Typography>Export the working paper. XLSX is a genuine workbook, not a renamed CSV.</Typography>
          <Button onClick={() => window.open(individualWorkspaceService.getIncomeTaxWorkingPaperUrl('csv', periodKey), '_blank')}>Download CSV</Button>
          <Button onClick={() => window.open(individualWorkspaceService.getIncomeTaxWorkingPaperUrl('xlsx', periodKey), '_blank')}>Download XLSX</Button>
          <Button onClick={() => window.open(individualWorkspaceService.getIncomeTaxWorkingPaperUrl('pdf', periodKey), '_blank')}>Download PDF</Button>
        </Stack>
      )}
      {selected && (
        <Alert severity="info" sx={{ mt: 2 }} onClose={() => setSelected(null)}>
          Date/period {selected.taxPeriodKey}. Property {selected.propertyName || selected.propertyId || '—'}. Source {selected.sourceType} {selected.sourceId}. Classification {selected.classification}. Accounting income {selected.accountingIncome == null ? '—' : money(Number(selected.accountingIncome))}. Accounting expense {selected.accountingExpenses == null ? '—' : money(Number(selected.accountingExpenses))}. Deductible {selected.deductions == null ? '—' : money(Number(selected.deductions))}. Add-back {selected.addBacks == null ? '—' : money(Number(selected.addBacks))}. Rule {selected.sourceReference || selected.taxRuleCode || '—'}. Review {selected.reviewStatus}. Documents {selected.supportingDocumentStatus}. Calculated tax is held on the period working paper, not this line.
        </Alert>
      )}
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record income tax payment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">This is a landlord-recorded payment. It is not proof that ZIMRA assessed or accepted the amount.</Alert>
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
            await individualWorkspaceService.recordIncomeTaxPayment({ ...payForm, taxPeriodKey: periodKey });
            setPayOpen(false);
            load();
          }}>Save</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={adjOpen} onClose={() => setAdjOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Manual working-paper adjustment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">This cannot overwrite calculated taxable income. It is added to the working paper after approval.</Alert>
            <TextField select label="Category" value={adjForm.adjustmentType} onChange={(e) => setAdjForm({ ...adjForm, adjustmentType: e.target.value })}>
              <MenuItem value="ADD_BACK">Add-back</MenuItem>
              <MenuItem value="DEDUCTION">Allowable deduction</MenuItem>
              <MenuItem value="EXEMPT_INCOME">Exempt income</MenuItem>
              <MenuItem value="CAPITAL_ADJUSTMENT">Capital adjustment</MenuItem>
              <MenuItem value="NON_DEDUCTIBLE_EXPENSE">Non-deductible expense</MenuItem>
              <MenuItem value="PRIVATE_EXPENSE">Private expense</MenuItem>
              <MenuItem value="ACCOUNTING_DEPRECIATION_ADD_BACK">Accounting depreciation add-back</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </TextField>
            <TextField label="Amount" type="number" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: Number(e.target.value) })} />
            <TextField label="Currency" value={adjForm.currency} onChange={(e) => setAdjForm({ ...adjForm, currency: e.target.value })} />
            <TextField label="Reason" required value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} />
            <TextField label="Supporting explanation" value={adjForm.explanation} onChange={(e) => setAdjForm({ ...adjForm, explanation: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjOpen(false)}>Cancel</Button>
          <Button onClick={async () => {
            await individualWorkspaceService.createIncomeTaxAdjustment({ ...adjForm, taxPeriodKey: periodKey });
            setAdjOpen(false);
            load();
          }}>Save for review</Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}

export default IncomeTaxCentrePage;
