import React, { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { isDemoMode, notifyDemoBlocked } from '../../../demo/demoMode';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { INDIVIDUAL_THEME } from '../theme';

export function TaxPeriodsPanel() {
  const [data, setData] = useState<{ periods: any[]; summaries: any[] }>({ periods: [], summaries: [] });
  const [review, setReview] = useState<any[]>([]);
  const [taxType, setTaxType] = useState('VAT');
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const load = () => {
    Promise.all([
      individualWorkspaceService.getTaxPeriods().catch(() => ({ periods: [], summaries: [] })),
      individualWorkspaceService.getTaxReview().catch(() => [])
    ]).then(([periods, queue]) => {
      const next = (periods || {}) as { periods?: any[]; summaries?: any[] };
      setData({ periods: Array.isArray(next.periods) ? next.periods : [], summaries: Array.isArray(next.summaries) ? next.summaries : [] });
      setReview(Array.isArray(queue) ? queue : []);
    });
  };

  useEffect(() => { load(); }, []);

  const openPeriod = async () => {
    if (isDemoMode()) {
      notifyDemoBlocked();
      return;
    }
    try {
      setError(null);
      await individualWorkspaceService.openTaxPeriod({ taxType, periodKey });
      load();
    } catch (err: any) {
      setError(err?.message || 'Unable to open tax period');
    }
  };

  return (
    <Stack spacing={2} sx={{ mt: 3 }}>
      <Typography variant="h6">Tax periods</Typography>
      <Alert severity="info">
        Periods classify transactions for later working papers. No VAT, presumptive tax, or income tax is calculated in this phase.
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField select label="Tax type" value={taxType} onChange={(e) => setTaxType(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="VAT">VAT</MenuItem>
          <MenuItem value="PRESUMPTIVE_RENTAL_INCOME_TAX">Presumptive rental income tax</MenuItem>
          <MenuItem value="INCOME_TAX">Income tax</MenuItem>
        </TextField>
        <TextField label="Period (YYYY-MM)" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} />
        <Button variant="outlined" onClick={openPeriod} sx={{ color: INDIVIDUAL_THEME.primary, borderColor: INDIVIDUAL_THEME.primary }}>Open period</Button>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tax type</TableCell>
            <TableCell>Period</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Transactions</TableCell>
            <TableCell>Review</TableCell>
            <TableCell>Not calculated</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(data.summaries || []).map((row: any, index: number) => (
            <TableRow key={`${row.taxType}-${row.periodKey}-${index}`}>
              <TableCell>{row.taxType}</TableCell>
              <TableCell>{row.periodKey}</TableCell>
              <TableCell>{row.status || (row.periodRequired ? 'PERIOD_REQUIRED' : 'Assigned')}</TableCell>
              <TableCell>{row.transactions}</TableCell>
              <TableCell>{row.requiresReview}</TableCell>
              <TableCell>{row.notCalculated}</TableCell>
            </TableRow>
          ))}
          {!(data.summaries || []).length && (
            <TableRow><TableCell colSpan={6}><Typography color="text.secondary">No tax-classified transactions yet.</Typography></TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      {(data.periods || []).length > 0 && (
        <Stack spacing={1}>
          <Typography variant="subtitle2">Opened periods</Typography>
          {(data.periods || []).map((period: any) => (
            <Button key={String(period._id)} size="small" onClick={async () => setDetail(await individualWorkspaceService.getTaxPeriodDetail(String(period._id)))}>
              {period.taxType} {period.periodKey} — {period.status}
            </Button>
          ))}
        </Stack>
      )}
      {detail && (
        <Alert severity="info">
          {detail.period?.taxType} {detail.period?.periodKey}: {detail.transactions?.length || 0} transactions, {detail.requiresReview || 0} require review, {detail.notCalculated || 0} not calculated. Tax payable is not computed.
        </Alert>
      )}
      <Typography variant="h6">Review queue</Typography>
      {(review || []).slice(0, 20).map((item: any) => (
        <Typography key={item.id} variant="body2">
          {item.sourceKind} {item.taxPeriodKey}: {(item.reviewReasons || []).join(', ') || item.taxCalculationStatus}
        </Typography>
      ))}
      {!(review || []).length && <Typography color="text.secondary">No review items.</Typography>}
    </Stack>
  );
}

export default TaxPeriodsPanel;
