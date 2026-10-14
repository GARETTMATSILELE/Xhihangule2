import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
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
import { Link as RouterLink } from 'react-router-dom';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { PageShell, StatCard } from '../components/shared';
import { INDIVIDUAL_THEME } from '../theme';
import { money } from '../utils/formatters';
import { getWorkspaceBasePath } from '../../../demo/demoMode';

const DISCLAIMER =
  'This tax pack is a record-keeping and tax-preparation working paper based on information recorded in Mantis and the tax rules configured for the relevant period. It is not a ZIMRA assessment, filing confirmation, tax clearance certificate, or legal/tax opinion. Taxpayers should obtain professional advice where required.';

function display(value: number | null | undefined) {
  return value == null ? 'not calculated' : money(value);
}

function statusChip(status?: string) {
  const value = status || 'NOT_STARTED';
  const color =
    value === 'REVIEW_REQUIRED' ? 'warning' :
    value === 'FINALIZED' || value === 'READY_FOR_TAX_PREPARATION' || value === 'READY_FOR_ACCOUNTANT' ? 'success' :
    value === 'IN_PROGRESS' ? 'info' : 'default';
  return <Chip size="small" label={value.replace(/_/g, ' ')} color={color as any} />;
}

export function TaxComplianceCentrePage() {
  const base = getWorkspaceBasePath();
  const [tab, setTab] = useState(0);
  const [taxYear, setTaxYear] = useState(new Date().getUTCFullYear());
  const [years, setYears] = useState<number[]>([taxYear]);
  const [overview, setOverview] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [recon, setRecon] = useState<any>(null);
  const [pack, setPack] = useState<any>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [drill, setDrill] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiveOpen, setWaiveOpen] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState({ documentId: '', sourceId: '', sourceType: 'Payment', taxType: 'INCOME_TAX', documentType: 'INVOICE', description: '' });

  const load = () => {
    setError(null);
    Promise.all([
      individualWorkspaceService.getTaxCompliance(taxYear).catch((err) => { setError(err?.message || 'Unable to load tax compliance'); return null; }),
      individualWorkspaceService.getTaxComplianceReadiness(taxYear).catch(() => null),
      individualWorkspaceService.getTaxComplianceReviews(taxYear).catch(() => []),
      individualWorkspaceService.getTaxComplianceEvidence(taxYear).catch(() => []),
      individualWorkspaceService.getTaxComplianceReconciliation(taxYear).catch(() => null),
      individualWorkspaceService.getTaxCompliancePack(taxYear).catch(() => null),
      individualWorkspaceService.getTaxComplianceChecklist(taxYear).catch(() => null)
    ]).then(([nextOverview, nextReadiness, nextReviews, nextEvidence, nextRecon, nextPack, nextChecklist]: any[]) => {
      setOverview(nextOverview);
      setReadiness(nextReadiness || nextOverview?.readiness);
      setReviews(Array.isArray(nextReviews) ? nextReviews : []);
      setEvidence(Array.isArray(nextEvidence) ? nextEvidence : []);
      setRecon(nextRecon);
      setPack(nextPack);
      setChecklist(nextChecklist);
      if (Array.isArray(nextOverview?.years) && nextOverview.years.length) setYears(nextOverview.years);
    });
  };

  useEffect(() => { load(); }, [taxYear]);

  const blockers = readiness?.blockers || [];
  const warnings = readiness?.warnings || [];
  const information = readiness?.information || [];

  return (
    <PageShell title="Tax Compliance" subtitle="Annual tax-preparation workspace. Figures are working-paper status, not a ZIMRA assessment.">
      <Alert severity="info" sx={{ mb: 2 }}>{DISCLAIMER}</Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
        <TextField select label="Tax year" value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} sx={{ minWidth: 140 }}>
          {years.map((year) => <MenuItem key={year} value={year}>{year}</MenuItem>)}
        </TextField>
        {statusChip(readiness?.status || overview?.status)}
        <Button onClick={load} sx={{ color: INDIVIDUAL_THEME.primary }}>Refresh</Button>
        <Button variant="contained" onClick={async () => { await individualWorkspaceService.generateTaxPack(taxYear); setTab(5); load(); }}>Prepare for accountant</Button>
      </Stack>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Overview" />
        <Tab label="Tax Years" />
        <Tab label="Review" />
        <Tab label="Evidence" />
        <Tab label="Reconciliation" />
        <Tab label="Annual Pack" />
        <Tab label="Payments" />
        <Tab label="Exports" />
      </Tabs>

      {tab === 0 && overview && (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}><StatCard title="Tax preparation status" value={(readiness?.status || overview.status || 'NOT STARTED').replace(/_/g, ' ')} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="Rental income" value={money(overview.accounting?.rentalIncome || 0)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="Expenses" value={money(overview.accounting?.expenses || 0)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="Net accounting profit" value={money(overview.accounting?.netAccountingProfit || 0)} /></Grid>
          </Grid>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
            <CardContent>
              <Typography fontWeight={700} sx={{ mb: 1 }}>VAT</Typography>
              <Typography>Output VAT {display(overview.vat?.outputVat)}</Typography>
              <Typography>Input VAT {display(overview.vat?.inputVat)}</Typography>
              <Typography>VAT review items {overview.vat?.reviewItems || 0} · VAT periods incomplete {overview.vat?.periodsIncomplete || 0}</Typography>
              <Typography variant="caption" color="text.secondary">VAT ≠ presumptive rental tax ≠ ordinary income tax</Typography>
            </CardContent>
          </Card>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
            <CardContent>
              <Typography fontWeight={700} sx={{ mb: 1 }}>Presumptive rental tax</Typography>
              <Typography>Calculated rental tax {display(overview.rentalTax?.calculatedRentalTax)}</Typography>
              <Typography>Payments recorded {money(overview.rentalTax?.paymentsRecorded || 0)}</Typography>
              <Typography>Review items {overview.rentalTax?.reviewItems || 0}</Typography>
            </CardContent>
          </Card>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
            <CardContent>
              <Typography fontWeight={700} sx={{ mb: 1 }}>Ordinary income tax</Typography>
              <Typography>Taxable income {display(overview.incomeTax?.taxableIncome)}</Typography>
              <Typography>Calculated income tax {display(overview.incomeTax?.calculatedIncomeTax)}</Typography>
              <Typography>Payments recorded {money(overview.incomeTax?.paymentsRecorded || 0)}</Typography>
              <Typography>Review items {overview.incomeTax?.reviewItems || 0}</Typography>
            </CardContent>
          </Card>
          <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
            <CardContent>
              <Typography fontWeight={700} sx={{ mb: 1 }}>Compliance</Typography>
              <Typography>Unclassified transactions {overview.compliance?.unclassifiedTransactions || 0}</Typography>
              <Typography>Missing documents {overview.compliance?.missingDocuments || 0}</Typography>
              <Typography>Open reviews {overview.compliance?.openReviews || 0}</Typography>
              <Typography>Closed periods {overview.compliance?.closedPeriods || 0}</Typography>
              <Typography>Incomplete calculations {overview.compliance?.incompleteCalculations || 0}</Typography>
            </CardContent>
          </Card>
          <Stack spacing={1}>
            {blockers.map((item: any, index: number) => (
              <Alert key={`b-${index}`} severity="warning">Blocker · {item.description}</Alert>
            ))}
            {warnings.map((item: any, index: number) => (
              <Alert key={`w-${index}`} severity="info">Warning · {item.description}</Alert>
            ))}
            {information.map((item: any, index: number) => (
              <Typography key={`i-${index}`} variant="body2" color="text.secondary">Information · {item.description}</Typography>
            ))}
          </Stack>
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          {(checklist?.items || []).map((item: any) => (
            <Card key={item.key} elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                <Typography>{item.done ? '✓' : '○'} {item.label}</Typography>
                <Button size="small" component={RouterLink} to={`${base}${item.href}`}>Open</Button>
              </CardContent>
            </Card>
          ))}
          {!checklist?.items?.length && <Typography color="text.secondary">Year-end completeness will appear once this tax year is loaded.</Typography>}
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={1}>
          {reviews.map((item) => (
            <Card key={item.id} elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Typography fontWeight={600}>{item.issueType} · {item.severity} · {item.status}</Typography>
                <Typography variant="body2">{item.description}</Typography>
                <Typography variant="caption">{item.taxType} · {item.taxPeriod || taxYear} · {item.sourceType} {item.sourceId}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  {item.status === 'OPEN' && (
                    <Button size="small" onClick={async () => { await individualWorkspaceService.startTaxComplianceReview(item.id); load(); }}>Start review</Button>
                  )}
                  {(item.status === 'OPEN' || item.status === 'IN_REVIEW') && (
                    <Button size="small" onClick={async () => { await individualWorkspaceService.resolveTaxComplianceReview(item.id, { decision: 'RESOLVED', comment: 'Reviewed in compliance centre' }); load(); }}>Resolve</Button>
                  )}
                  {(item.status === 'OPEN' || item.status === 'IN_REVIEW') && (
                    <Button size="small" onClick={() => { setWaiveOpen(item.id); setWaiveReason(''); }}>Waive</Button>
                  )}
                  <Button size="small" onClick={async () => {
                    const result = await individualWorkspaceService.getTaxComplianceDrill(taxYear, item.sourceType === 'Payment' ? 'Payment' : 'entry', item.sourceId);
                    setDrill(result);
                    setTab(5);
                  }}>Open source</Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
          {!reviews.length && <Typography color="text.secondary">No compliance review items for this tax year.</Typography>}
        </Stack>
      )}

      {tab === 3 && (
        <Stack spacing={2}>
          <Button variant="outlined" onClick={() => setEvidenceOpen(true)}>Link existing document</Button>
          {evidence.map((item) => (
            <Card key={item.id} elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Typography fontWeight={600}>{item.documentType} · {item.documentStatus}</Typography>
                <Typography variant="body2">{item.description || 'No description'} · review {item.reviewStatus}</Typography>
                <Typography variant="caption">{item.taxType} · {item.sourceType} {item.sourceId}</Typography>
                {item.reviewStatus !== 'ACCEPTED' && (
                  <Button size="small" onClick={async () => { await individualWorkspaceService.reviewTaxEvidence(item.id, 'ACCEPTED'); load(); }}>Accept</Button>
                )}
              </CardContent>
            </Card>
          ))}
          {!evidence.length && <Typography color="text.secondary">No evidence linked for this tax year. Upload files in Files, then link them here. A document is not reviewed merely because it was uploaded.</Typography>}
        </Stack>
      )}

      {tab === 4 && recon && (
        <Grid container spacing={2}>
          {[recon.vat, recon.rentalTax, recon.incomeTax].map((row: any) => (
            <Grid item xs={12} md={4} key={row.label}>
              <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
                <CardContent>
                  <Typography fontWeight={700}>{row.label}</Typography>
                  <Typography>Calculated {display(row.calculated)}</Typography>
                  <Typography>Recorded payments {row.paymentStatus === 'NOT_RECORDED' || row.recordedPayments == null ? 'not recorded' : money(row.recordedPayments)}</Typography>
                  <Typography>Unreconciled recorded amount {row.paymentStatus === 'NOT_RECORDED' ? 'not recorded' : display(row.unreconciled)}</Typography>
                  <Typography variant="caption">{row.status}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
          <Grid item xs={12}>
            <Typography color="text.secondary">There is no combined total tax payable and no ZIMRA balance. These are separate projections.</Typography>
          </Grid>
        </Grid>
      )}

      {tab === 5 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button onClick={async () => { await individualWorkspaceService.generateTaxPack(taxYear); load(); }}>Generate pack</Button>
            <Button variant="contained" onClick={async () => { await individualWorkspaceService.finalizeTaxPack(taxYear); load(); }}>Finalise pack</Button>
          </Stack>
          {pack ? (
            <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Typography variant="h6">Mantis Individual Landlord Tax Preparation Pack</Typography>
                <Typography>Tax Year: {pack.taxYear} · version {pack.version} · {pack.status}</Typography>
                <Typography variant="body2" sx={{ my: 1 }}>{pack.disclaimer}</Typography>
                <Typography>Taxpayer {overview?.taxpayer?.name || '—'} · TIN {overview?.taxpayer?.tin || '—'}</Typography>
                <Typography>VAT projection {display(pack.vatSummary?.netVatPosition ?? overview?.vat?.netVatPosition)}</Typography>
                <Typography>Presumptive rental tax projection {display(pack.rentalTaxSummary?.calculatedRentalTax ?? overview?.rentalTax?.calculatedRentalTax)}</Typography>
                <Typography>Ordinary income-tax projection {display(pack.incomeTaxSummary?.calculatedIncomeTax ?? overview?.incomeTax?.calculatedIncomeTax)}</Typography>
                {pack.supersedesPackId && <Typography variant="caption">Supersedes previous pack {pack.supersedesPackId}</Typography>}
              </CardContent>
            </Card>
          ) : (
            <Typography color="text.secondary">No pack generated yet. Prepare for accountant creates a working-paper snapshot without claiming the accountant has received it.</Typography>
          )}
          {(overview?.properties || []).map((property: any) => (
            <Card key={property.propertyId} elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Typography fontWeight={700}>{property.name}</Typography>
                <Typography variant="body2">{property.address || '—'} · use {property.useClass || '—'} · ownership {property.ownershipPercentage}%</Typography>
                <Typography>Gross rental income {money(property.grossRentalIncome || 0)} · expenses {money(property.expenses || 0)} · accounting profit {money(property.accountingProfit || 0)}</Typography>
                <Typography>Tax treatment {property.taxTreatment} · review {property.reviewStatus}</Typography>
                {property.ownershipPercentage !== 100 && (
                  <Alert severity="info" sx={{ mt: 1 }}>Property total and owner share are shown separately. Tax is not scaled automatically. Ownership allocation is review required.</Alert>
                )}
              </CardContent>
            </Card>
          ))}
          {drill && (
            <Alert severity="info" onClose={() => setDrill(null)}>
              Snapshot {drill.snapshot?.taxCalculationStatus || '—'} · VAT lines {(drill.vat || []).length} · rental-tax lines {(drill.rentalTax || []).length} · income-tax lines {(drill.incomeTax || []).length} · evidence {(drill.evidence || []).length}
            </Alert>
          )}
        </Stack>
      )}

      {tab === 6 && (
        <Stack spacing={1}>
          {(overview?.payments || []).map((row: any) => (
            <Card key={row.id} elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
              <CardContent>
                <Typography fontWeight={600}>{row.taxType} · {money(row.amount)} {row.currency}</Typography>
                <Typography variant="body2">{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '—'} · {row.taxPeriodKey} · {row.reference || 'no reference'}</Typography>
                <Chip size="small" label="Recorded by landlord" />
              </CardContent>
            </Card>
          ))}
          {!(overview?.payments || []).length && <Typography color="text.secondary">No landlord-recorded tax payments for this year. This is not a ZIMRA confirmed balance.</Typography>}
        </Stack>
      )}

      {tab === 7 && (
        <Stack spacing={2}>
          <Typography>Export the annual tax pack. XLSX is a genuine multi-sheet workbook, not a renamed CSV.</Typography>
          <Button onClick={() => window.open(individualWorkspaceService.getTaxPackExportUrl(taxYear, 'csv'), '_blank')}>Download CSV</Button>
          <Button onClick={() => window.open(individualWorkspaceService.getTaxPackExportUrl(taxYear, 'xlsx'), '_blank')}>Download XLSX</Button>
          <Button onClick={() => window.open(individualWorkspaceService.getTaxPackExportUrl(taxYear, 'pdf'), '_blank')}>Download PDF</Button>
        </Stack>
      )}

      <Dialog open={Boolean(waiveOpen)} onClose={() => setWaiveOpen(null)} fullWidth maxWidth="sm">
        <DialogTitle>Waive review</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ my: 1 }}>A waiver requires a reason and is audited. It does not change the source transaction.</Alert>
          <TextField fullWidth label="Reason" required value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWaiveOpen(null)}>Cancel</Button>
          <Button disabled={!waiveReason.trim()} onClick={async () => {
            if (!waiveOpen) return;
            await individualWorkspaceService.waiveTaxComplianceReview(waiveOpen, waiveReason);
            setWaiveOpen(null);
            load();
          }}>Waive</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={evidenceOpen} onClose={() => setEvidenceOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Link existing document</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">This references a file already stored in Mantis. It does not copy the file or classify the tax treatment.</Alert>
            <TextField label="Document id" value={evidenceForm.documentId} onChange={(e) => setEvidenceForm({ ...evidenceForm, documentId: e.target.value })} />
            <TextField label="Source id" value={evidenceForm.sourceId} onChange={(e) => setEvidenceForm({ ...evidenceForm, sourceId: e.target.value })} />
            <TextField label="Source type" value={evidenceForm.sourceType} onChange={(e) => setEvidenceForm({ ...evidenceForm, sourceType: e.target.value })} />
            <TextField select label="Document type" value={evidenceForm.documentType} onChange={(e) => setEvidenceForm({ ...evidenceForm, documentType: e.target.value })}>
              {['RENTAL_RECEIPT','TENANCY_AGREEMENT','INVOICE','SUPPLIER_INVOICE','MAINTENANCE_INVOICE','RATES_STATEMENT','BANK_EVIDENCE','TAX_PAYMENT_PROOF','VAT_DOCUMENT','CONTRACTOR_QUOTE','CAPITAL_EXPENDITURE_DOCUMENT','OTHER_INCOME_EVIDENCE','OTHER'].map((type) => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </TextField>
            <TextField label="Description" value={evidenceForm.description} onChange={(e) => setEvidenceForm({ ...evidenceForm, description: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEvidenceOpen(false)}>Cancel</Button>
          <Button onClick={async () => {
            await individualWorkspaceService.attachTaxEvidence(taxYear, evidenceForm);
            setEvidenceOpen(false);
            load();
          }}>Link</Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}

export default TaxComplianceCentrePage;
