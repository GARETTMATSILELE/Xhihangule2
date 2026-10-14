import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Grid, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { PageShell, StatCard } from '../components/shared';
import { INDIVIDUAL_THEME } from '../theme';
import { money } from '../utils/formatters';

function display(value: number | null | undefined) {
  return value == null ? 'not calculated' : money(value);
}

export function VatCentrePage() {
  const [tab, setTab] = useState(0);
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [overview, setOverview] = useState<any>(null);
  const [paper, setPaper] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [review, setReview] = useState<any[]>([]);
  const [recon, setRecon] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      individualWorkspaceService.getVatOverview(periodKey).catch((err) => { setError(err?.message || 'Unable to load VAT overview'); return null; }),
      individualWorkspaceService.getVatWorkingPaper(periodKey).catch(() => null),
      individualWorkspaceService.getVatTransactions({ periodKey }).catch(() => []),
      individualWorkspaceService.getVatReview().catch(() => []),
      individualWorkspaceService.getVatReconciliation(periodKey).catch(() => null)
    ]).then(([nextOverview, nextPaper, nextTx, nextReview, nextRecon]) => {
      setOverview(nextOverview);
      setPaper(nextPaper);
      setTransactions(Array.isArray(nextTx) ? nextTx : []);
      setReview(Array.isArray(nextReview) ? nextReview : []);
      setRecon(nextRecon);
    });
  };

  useEffect(() => { load(); }, [periodKey]);

  return (
    <PageShell title="VAT" subtitle="VAT working paper for preparation support. Mantis does not file ZIMRA returns.">
      <Alert severity="info" sx={{ mb: 2 }}>
        Totals come from individual VAT records linked to Phase D snapshots. Income tax and presumptive rental tax are not calculated here.
      </Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField label="Period (YYYY-MM)" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} />
        <Button onClick={load} sx={{ color: INDIVIDUAL_THEME.primary }}>Refresh</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getVatWorkingPaperUrl('csv', periodKey), '_blank')}>CSV</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getVatWorkingPaperUrl('xlsx', periodKey), '_blank')}>XLSX</Button>
        <Button onClick={() => window.open(individualWorkspaceService.getVatWorkingPaperUrl('pdf', periodKey), '_blank')}>PDF</Button>
      </Stack>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Overview" />
        <Tab label="Transactions" />
        <Tab label="Working paper" />
        <Tab label="Review" />
        <Tab label="Reconciliation" />
      </Tabs>
      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}><StatCard title="VAT status" value={String(overview?.vatRegistered || '—')} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Output VAT" value={display(overview?.outputVat)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Input VAT" value={display(overview?.inputVat)} /></Grid>
          <Grid item xs={12} sm={6} md={3}><StatCard title="Net VAT position" value={display(overview?.netVatPosition)} /></Grid>
          <Grid item xs={12}><Typography color="text.secondary">{overview?.reviewItems || 0} review items</Typography></Grid>
        </Grid>
      )}
      {tab === 1 && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Stack spacing={1}>
              {transactions.map((row) => (
                <Box key={row.id} sx={{ py: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}`, cursor: 'pointer' }} onClick={() => setSelected(row)}>
                  <Typography fontWeight={600}>{row.direction} · {row.treatment} · {row.calculationStatus}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.taxPeriodKey} · net {money(Number(row.netAmount || 0))} · VAT {row.vatAmount == null ? 'not calculated' : money(Number(row.vatAmount))} · {row.taxRuleCode || 'no rule'}
                  </Typography>
                </Box>
              ))}
              {!transactions.length && <Typography color="text.secondary">No VAT records for this period.</Typography>}
            </Stack>
          </CardContent>
        </Card>
      )}
      {tab === 2 && paper && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography variant="h6">VAT working paper · {paper.taxPeriod}</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>{paper.disclaimer}</Typography>
            <Typography>Output VAT: {display(paper.outputVat)}</Typography>
            <Typography>Input VAT: {display(paper.inputVat)}</Typography>
            <Typography fontWeight={700}>Net VAT position: {display(paper.netVatPosition)}</Typography>
            <Button sx={{ mt: 2 }} onClick={() => setTab(1)}>Drill into transactions</Button>
          </CardContent>
        </Card>
      )}
      {tab === 3 && (
        <Stack spacing={1}>
          {review.map((item) => (
            <Alert key={item.id} severity="warning">
              {item.sourceType} {item.sourceId}: {(item.reasons || []).join(', ') || item.calculationStatus}
            </Alert>
          ))}
          {!review.length && <Typography color="text.secondary">No VAT review items.</Typography>}
        </Stack>
      )}
      {tab === 4 && recon && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography>Detection only — no automatic repair.</Typography>
            <Typography>Working paper output {display(recon.workingPaper?.outputVat)} vs records {display(recon.recordTotals?.outputVat)}</Typography>
            <Typography>Working paper input {display(recon.workingPaper?.inputVat)} vs records {display(recon.recordTotals?.inputVat)}</Typography>
            {(recon.findings || []).map((finding: any, index: number) => (
              <Alert key={`${finding.issueType}-${index}`} severity="warning" sx={{ mt: 1 }}>
                {finding.issueType}: {finding.reason}
              </Alert>
            ))}
            {!(recon.findings || []).length && <Alert severity="success" sx={{ mt: 1 }}>VAT records match the working paper totals.</Alert>}
          </CardContent>
        </Card>
      )}
      {selected && (
        <Alert severity="info" sx={{ mt: 2 }} onClose={() => setSelected(null)}>
          {selected.sourceType} {selected.sourceId}: {selected.direction} {selected.treatment}. Gross {selected.grossAmount ?? '—'}, net {selected.netAmount ?? '—'}, rate {selected.vatRate ?? '—'}%, VAT {selected.vatAmount ?? 'not calculated'}. Rule {selected.taxRuleCode || '—'} v{selected.taxRuleVersion ?? '—'}.
        </Alert>
      )}
    </PageShell>
  );
}

export default VatCentrePage;
