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
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import accountingService, {
  AccountingIntegrityRow,
  AccountingIntegritySummary
} from '../../services/accountingService';

const COMPONENT_OPTIONS = [
  { value: '', label: 'All components' },
  { value: 'ownerIncome', label: 'Property Account' },
  { value: 'agentCommission', label: 'Agent Commission' },
  { value: 'companyCommission', label: 'Company Commission' },
  { value: 'journal', label: 'Journal' },
  { value: 'vat', label: 'VAT' },
  { value: 'deposit', label: 'Deposit' }
];

const COMPONENT_LABELS: Record<string, string> = {
  ownerIncome: 'Property Income',
  agentCommission: 'Agent Commission',
  companyCommission: 'Company Commission',
  journal: 'Journal',
  vat: 'VAT',
  deposit: 'Deposit'
};

function moneyText(value: unknown, currency = ''): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && Number.isNaN(Number(value))) return value;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  const formatted = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

function statusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'VALID' || status === 'complete') return 'success';
  if (status === 'MISSING' || status === 'incomplete') return 'warning';
  if (status === 'MISMATCHED' || status === 'ORPHANED') return 'error';
  return 'default';
}

const AccountingIntegrityPage: React.FC = () => {
  const [summary, setSummary] = useState<AccountingIntegritySummary | null>(null);
  const [rows, setRows] = useState<AccountingIntegrityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const [component, setComponent] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [currency, setCurrency] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<AccountingIntegrityRow | null>(null);
  const [recon, setRecon] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairResult, setRepairResult] = useState<any>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [trace, setTrace] = useState<any>(null);
  const [trustRows, setTrustRows] = useState<any[]>([]);

  const loadSummary = useCallback(async () => {
    const data = await accountingService.getAccountingIntegritySummary();
    setSummary(data);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await accountingService.listAccountingIntegrityInconsistencies({
        status,
        component: component || undefined,
        paymentReference: paymentReference || undefined,
        currency: currency || undefined,
        propertyId: propertyId || undefined,
        agentId: agentId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page: page + 1,
        limit: pageSize
      });
      setRows(result.items || []);
      setTotal(Number(result.total || 0));
    } catch (err: any) {
      setError(err?.message || 'Failed to load accounting integrity');
    } finally {
      setLoading(false);
    }
  }, [status, component, paymentReference, currency, propertyId, agentId, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    void loadSummary();
    accountingService.listTrustVisibility().then((data) => setTrustRows(data.rows || [])).catch(() => setTrustRows([]));
  }, [loadSummary]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const openDetail = async (row: AccountingIntegrityRow) => {
    setSelected(row);
    setRecon(null);
    setTrace(null);
    setRepairResult(null);
    setRetryMessage(null);
    setReason('');
    setConfirmRepair(false);
    if (!row.paymentId) return;
    setDetailLoading(true);
    try {
      const [data, money] = await Promise.all([
        accountingService.getPaymentAccountingReconciliation(row.paymentId),
        accountingService.getPaymentFinancialTrace(row.paymentId).catch(() => null)
      ]);
      setRecon(data);
      setTrace(money);
    } catch (err: any) {
      setError(err?.message || 'Failed to reconcile payment');
    } finally {
      setDetailLoading(false);
    }
  };

  const runRepair = async (dryRun: boolean) => {
    if (!selected?.paymentId) return;
    if (!dryRun && (!confirmRepair || !reason.trim())) return;
    setRepairBusy(true);
    try {
      const result = await accountingService.repairPaymentAccounting(selected.paymentId, {
        dryRun,
        confirm: !dryRun,
        reason: reason.trim()
      });
      setRepairResult(result);
      if (result?.recon) setRecon(result.recon);
      await Promise.all([loadSummary(), loadRows()]);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Repair failed');
    } finally {
      setRepairBusy(false);
    }
  };

  const issueCount = Number(summary?.exceptions || 0);
  const healthy = summary && issueCount === 0 && Number(summary.incomplete || 0) === 0;

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'date',
      headerName: 'Date',
      width: 120,
      valueFormatter: (params) => params.value ? new Date(params.value).toLocaleDateString() : ''
    },
    { field: 'paymentReference', headerName: 'Payment Reference', flex: 1, minWidth: 150 },
    { field: 'amount', headerName: 'Amount', width: 110, valueGetter: (params) => moneyText(params.row.amount, params.row.currency) },
    { field: 'missingRecord', headerName: 'Missing record', flex: 1, minWidth: 160 },
    { field: 'property', headerName: 'Property', flex: 1, minWidth: 140 },
    { field: 'tenant', headerName: 'Tenant', width: 140 },
    { field: 'currency', headerName: 'Currency', width: 90 },
    { field: 'component', headerName: 'Component', width: 150, valueGetter: (params) => COMPONENT_LABELS[params.value] || params.value },
    { field: 'expected', headerName: 'Expected', width: 120, valueGetter: (params) => moneyText(params.row.expected, params.row.currency) },
    { field: 'actual', headerName: 'Actual', width: 140, valueGetter: (params) => moneyText(params.row.actual, params.row.currency) },
    { field: 'difference', headerName: 'Difference', width: 120, valueGetter: (params) => moneyText(params.row.difference, params.row.currency) },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (params) => <Chip size="small" label={params.value} color={statusColor(String(params.value))} />
    },
    {
      field: 'action',
      headerName: 'Action',
      width: 140,
      sortable: false,
      renderCell: (params) => (
        <Button size="small" onClick={() => void openDetail(params.row)}>
          {params.row.canRepair ? 'Review / Repair' : 'View'}
        </Button>
      )
    }
  ], []);

  const cards = [
    { label: 'Checked', value: summary?.totalChecked ?? '—', color: 'text.primary' },
    { label: 'Complete', value: summary?.complete ?? '—', color: 'success.main' },
    { label: 'Incomplete', value: summary?.incomplete ?? '—', color: 'warning.main' },
    { label: 'Mismatched', value: summary?.mismatched ?? '—', color: 'error.main' },
    { label: 'Orphaned', value: summary?.orphaned ?? '—', color: 'error.main' },
    { label: 'Exceptions', value: summary?.exceptions ?? '—', color: 'secondary.main' }
  ];

  const componentRows = recon
    ? (['ownerIncome', 'agentCommission', 'companyCommission', 'journal', 'vat', 'deposit'] as const).map((key) => ({
        key,
        label: COMPONENT_LABELS[key],
        expected: recon.expected?.amounts?.[key],
        actual: recon.actual?.amounts?.[key],
        status: recon.componentStatus?.[key] || (recon.missing?.includes(key) ? 'MISSING' : 'VALID'),
        required: Boolean(recon.expected?.[key])
      })).filter((row) => row.required || row.status === 'MISSING' || row.status === 'MISMATCHED')
    : [];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>Accounting Integrity</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Company-wide check of whether accounting projections agree with Payments, the single source of truth.
      </Typography>

      {healthy && (
        <Alert severity="success" sx={{ mb: 2 }}>Accounting is fully reconciled</Alert>
      )}
      {!healthy && summary && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {issueCount} accounting inconsistenc{issueCount === 1 ? 'y' : 'ies'} require attention
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {cards.map((card) => (
          <Grid item xs={12} sm={6} md={2} key={card.label}>
            <Card
              elevation={2}
              sx={{ cursor: 'pointer' }}
              onClick={() => {
                const next = card.label === 'Incomplete' ? 'incomplete' : card.label === 'Mismatched' ? 'mismatched' : card.label === 'Orphaned' ? 'orphaned' : 'all';
                setPage(0);
                setStatus(next);
              }}
            >
              <CardContent>
                <Typography variant="h5" sx={{ color: card.color, fontWeight: 700 }}>{card.value}</Typography>
                <Typography variant="body2" color="text.secondary">{card.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={status} label="Status" onChange={(e) => { setPage(0); setStatus(e.target.value); }}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="incomplete">Incomplete</MenuItem>
                <MenuItem value="mismatched">Mismatched</MenuItem>
                <MenuItem value="orphaned">Orphaned</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Component</InputLabel>
              <Select value={component} label="Component" onChange={(e) => { setPage(0); setComponent(e.target.value); }}>
                {COMPONENT_OPTIONS.map((opt) => <MenuItem key={opt.value || 'all'} value={opt.value}>{opt.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField size="small" fullWidth label="Payment reference" value={paymentReference} onChange={(e) => { setPage(0); setPaymentReference(e.target.value); }} />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField size="small" fullWidth label="Currency" value={currency} onChange={(e) => { setPage(0); setCurrency(e.target.value); }} />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField size="small" fullWidth label="Property ID" value={propertyId} onChange={(e) => { setPage(0); setPropertyId(e.target.value); }} />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField size="small" fullWidth label="Agent ID" value={agentId} onChange={(e) => { setPage(0); setAgentId(e.target.value); }} />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField size="small" fullWidth type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => { setPage(0); setDateFrom(e.target.value); }} />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField size="small" fullWidth type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => { setPage(0); setDateTo(e.target.value); }} />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>Trust visibility</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Sale receipts belong in buyer trust. A rental-domain row here is historical evidence, not a new buyer-trust receipt. Nothing in this list is rewritten.
        </Typography>
        {trustRows.length === 0 ? (
          <Typography variant="body2">No trust transactions for this company.</Typography>
        ) : trustRows.slice(0, 8).map((row) => (
          <Typography key={row.id} variant="body2">
            {row.date ? new Date(row.date).toLocaleDateString() : '—'} · {row.type} · received {moneyText(row.credit)} · paid out {moneyText(row.debit)} · {row.saleTrust ? 'Sale' : row.historicalRentalTrust ? 'Historical rental record' : 'Unclassified'}
          </Typography>
        ))}
      </Paper>

      <Paper sx={{ height: 560 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={loading}
          rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          onRowClick={(params) => void openDetail(params.row)}
        />
      </Paper>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth>
        <DialogTitle>Payment reconciliation</DialogTitle>
        <DialogContent dividers>
          {detailLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>}
          {selected && !detailLoading && (
            <>
              <Typography variant="h6" sx={{ mb: 1 }}>{selected.paymentReference || selected.paymentId || 'Orphaned accounting record'}</Typography>
              {selected.recommendedReview && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Company {selected.companyId || 'unknown'}. Amount {moneyText(selected.amount, selected.currency)}. Missing record: {selected.missingRecord || 'see component'}. {selected.recommendedReview}
                </Alert>
              )}
              {trace?.allocation && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: trace.allocation.reviewRequired ? '#fff7ed' : '#edf7f1', borderRadius: 1 }}>
                  <Typography sx={{ fontWeight: 700, mb: 0.5 }}>How the owner amount is calculated</Typography>
                  <Typography variant="body2">Amount received: {moneyText(trace.allocation.grossAmount, selected.currency)}</Typography>
                  <Typography variant="body2">Less commission: {moneyText(trace.allocation.commissionAmount, selected.currency)}</Typography>
                  <Typography variant="body2">Less levy: {moneyText(trace.allocation.levyAmount, selected.currency)}</Typography>
                  <Typography variant="body2">Less VAT on commission: {moneyText(trace.allocation.vatOnCommission, selected.currency)}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Net owner amount: {moneyText(trace.allocation.netOwnerAmount, selected.currency)}</Typography>
                  {trace.allocation.reviewRequired && (
                    <Typography variant="body2" color="error">Review required. Recorded {moneyText(trace.allocation.recordedOwnerAmount, selected.currency)}. Nothing was changed.</Typography>
                  )}
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Owner income: {trace.posting?.ownerIncome}. Company commission: {trace.posting?.companyCommission}. Journal: {trace.posting?.journal}. Trust: {trace.posting?.trust}. Tax: {trace.posting?.tax}.
                  </Typography>
                  <Typography variant="body2">{trace.retry?.effect}</Typography>
                </Box>
              )}
              {recon && (
                <>
                  <Typography variant="body2">Payment amount: {moneyText(recon.expected?.amounts?.journal, selected.currency)}</Typography>
                  <Typography variant="body2">Deposit: {moneyText(recon.expected?.amounts?.deposit, selected.currency)}</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Accounting complete: {recon.accountingComplete ? 'YES' : 'NO'}
                  </Typography>
                  {componentRows.map((row) => (
                    <Box key={row.key} sx={{ mb: 1.5, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{row.label}</Typography>
                      <Typography variant="body2">Expected: {moneyText(row.expected, selected.currency)}</Typography>
                      <Typography variant="body2">Actual: {row.status === 'MISSING' ? 'MISSING' : moneyText(row.actual, selected.currency)}</Typography>
                      <Chip size="small" sx={{ mt: 0.5 }} label={row.status} color={statusColor(row.status)} />
                    </Box>
                  ))}
                </>
              )}
              {selected.status === 'ORPHANED' && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  Expected = Source Payment missing. Actual = Accounting record exists. Orphans are flagged, not deleted.
                </Alert>
              )}
              {recon?.mismatched?.length > 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Manual accounting review required. Mismatched projections are not auto-corrected.
                </Alert>
              )}
              {repairResult && (
                <Alert severity={repairResult.accountingComplete ? 'success' : 'info'} sx={{ mt: 1 }}>
                  {repairResult.dryRun ? 'Dry run complete. ' : 'Repair finished. '}
                  Accounting complete: {repairResult.accountingComplete ? 'YES' : 'NO'}
                  {repairResult.requiresManualReview?.length ? '. Manual accounting review required.' : ''}
                </Alert>
              )}
              {selected.canRetry && selected.operationId && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  This retries the existing ledger event. It does not create a new financial operation and it does not change historical amounts.
                </Alert>
              )}
              {retryMessage && <Alert severity="info" sx={{ mt: 1 }}>{retryMessage}</Alert>}
              {selected.canRepair && (
                <TextField
                  sx={{ mt: 2 }}
                  fullWidth
                  required
                  label="Reason"
                  placeholder="Commission posting failed during original payment creation."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  multiline
                  minRows={2}
                />
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Close</Button>
          {selected?.canRetry && selected.operationId && (
            <Button
              variant="contained"
              disabled={retryBusy}
              onClick={() => {
                const operationId = selected.operationId;
                if (!operationId) return;
                setRetryBusy(true);
                setRetryMessage(null);
                void accountingService.retryLedgerEvent(operationId)
                  .then(() => {
                    setRetryMessage('The existing ledger event completed.');
                    void loadRows();
                    void loadSummary();
                  })
                  .catch((err: any) => setRetryMessage(err?.response?.data?.message || err?.message || 'Retry failed'))
                  .finally(() => setRetryBusy(false));
              }}
            >
              Retry existing operation
            </Button>
          )}
          {selected?.canRepair && (
            <>
              <Button disabled={repairBusy || !reason.trim()} onClick={() => void runRepair(true)}>Dry run</Button>
              <Button
                variant="contained"
                disabled={repairBusy || !reason.trim() || !confirmRepair}
                onClick={() => void runRepair(false)}
              >
                Repair
              </Button>
              <Chip
                size="small"
                color={confirmRepair ? 'warning' : 'default'}
                label={confirmRepair ? 'Confirm: YES' : 'Click to confirm'}
                onClick={() => setConfirmRepair((value) => !value)}
              />
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AccountingIntegrityPage;
