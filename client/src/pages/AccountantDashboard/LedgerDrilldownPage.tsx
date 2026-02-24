import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import accountingService, { BankReconciliationRow, LedgerRow, VatStatusPoint } from '../../services/accountingService';

const LedgerDrilldownPage: React.FC = () => {
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [bankRows, setBankRows] = useState<BankReconciliationRow[]>([]);
  const [vatRows, setVatRows] = useState<VatStatusPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, Array<{ journalEntryId: string; reference: string; transactionDate: string; amount: number; score: number; reasons: string[] }>>>({});
  const [loadingSuggestionsFor, setLoadingSuggestionsFor] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    accountCode: '',
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    matched: 'all' as 'all' | 'matched' | 'unmatched',
    filingPeriod: '',
    status: 'all' as 'all' | 'pending' | 'submitted'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [ledger, bank, vat] = await Promise.all([
        accountingService.getLedger({
          accountCode: filters.accountCode || undefined,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          limit: 300
        }),
        accountingService.getBankReconciliation({
          matched: filters.matched === 'all' ? undefined : filters.matched === 'matched',
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          limit: 300
        }),
        accountingService.getVatStatus()
      ]);
      setLedgerRows(ledger);
      setBankRows(bank);
      setVatRows(vat);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredVatRows = useMemo(() => {
    return vatRows.filter((row) => {
      if (filters.filingPeriod && row.filingPeriod !== filters.filingPeriod) return false;
      if (filters.status !== 'all' && row.status !== filters.status) return false;
      return true;
    });
  }, [vatRows, filters.filingPeriod, filters.status]);

  const downloadVatCsv = async () => {
    const blob = (await accountingService.exportVatReport({
      filingPeriod: filters.filingPeriod || undefined,
      status: filters.status === 'all' ? undefined : filters.status,
      format: 'csv'
    })) as Blob;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vat-report-${filters.filingPeriod || 'all-periods'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const uniquePeriods = Array.from(new Set(vatRows.map((row) => row.filingPeriod))).sort().reverse();

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 600 }}>
        Ledger Drilldown
      </Typography>

      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Filters</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="Account Code"
            value={filters.accountCode}
            onChange={(e) => setFilters((prev) => ({ ...prev, accountCode: e.target.value }))}
            placeholder="e.g. 4001"
          />
          <TextField
            size="small"
            label="Start Date"
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            label="End Date"
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Bank Match Status</InputLabel>
            <Select
              value={filters.matched}
              label="Bank Match Status"
              onChange={(e) => setFilters((prev) => ({ ...prev, matched: e.target.value as any }))}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="matched">Matched</MenuItem>
              <MenuItem value="unmatched">Unmatched</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>VAT Period</InputLabel>
            <Select
              value={filters.filingPeriod}
              label="VAT Period"
              onChange={(e) => setFilters((prev) => ({ ...prev, filingPeriod: e.target.value }))}
            >
              <MenuItem value="">All Periods</MenuItem>
              {uniquePeriods.map((period) => (
                <MenuItem key={period} value={period}>{period}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>VAT Status</InputLabel>
            <Select
              value={filters.status}
              label="VAT Status"
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as any }))}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="submitted">Submitted</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" onClick={loadData} disabled={loading}>
            {loading ? 'Loading...' : 'Apply'}
          </Button>
          <Button variant="outlined" onClick={downloadVatCsv}>
            Export VAT CSV
          </Button>
        </Box>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Ledger Transactions</Typography>
            <List>
              {ledgerRows.length === 0 ? (
                <ListItem><ListItemText primary="No ledger transactions found" /></ListItem>
              ) : ledgerRows.map((row, idx) => (
                <React.Fragment key={row._id}>
                  <ListItem>
                    <ListItemText
                      primary={`${row.accountCode} ${row.accountName} • ${row.reference}`}
                      secondary={`${new Date(row.transactionDate || row.createdAt).toLocaleDateString()} • DR ${Number(row.debit || 0).toLocaleString()} / CR ${Number(row.credit || 0).toLocaleString()} • Balance ${Number(row.runningBalanceSnapshot || 0).toLocaleString()}`}
                    />
                  </ListItem>
                  {idx < ledgerRows.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Bank Reconciliation</Typography>
            <List>
              {bankRows.length === 0 ? (
                <ListItem><ListItemText primary="No bank transactions found" /></ListItem>
              ) : bankRows.map((row, idx) => (
                <React.Fragment key={row._id}>
                  <ListItem>
                    <ListItemText
                      primary={`${Number(row.amount || 0).toLocaleString()} • ${row.reference}`}
                      secondary={`${new Date(row.transactionDate).toLocaleDateString()} • ${(row as any)?.bankAccountId?.name || 'Bank Account'} • ${row.matched ? 'Matched' : 'Unmatched'}`}
                    />
                  </ListItem>
                  <Box sx={{ px: 2, pb: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {!row.matched ? (
                      <>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={loadingSuggestionsFor === row._id}
                          onClick={async () => {
                            try {
                              setLoadingSuggestionsFor(row._id);
                              const result = await accountingService.getBankTransactionSuggestions(row._id);
                              setSuggestions((prev) => ({ ...prev, [row._id]: result as any }));
                            } finally {
                              setLoadingSuggestionsFor(null);
                            }
                          }}
                        >
                          {loadingSuggestionsFor === row._id ? 'Scoring...' : 'Auto-Suggest Match'}
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={async () => {
                            await accountingService.reconcileBankTransaction(row._id, { matched: true });
                            await loadData();
                          }}
                        >
                          Mark Matched
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={async () => {
                          await accountingService.reconcileBankTransaction(row._id, { matched: false });
                          await loadData();
                        }}
                      >
                        Unmatch
                      </Button>
                    )}
                  </Box>
                  {!row.matched && (suggestions[row._id] || []).length > 0 && (
                    <Box sx={{ px: 2, pb: 1 }}>
                      <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Top Suggestions</Typography>
                      <List dense>
                        {suggestions[row._id].map((s, sIdx) => (
                          <React.Fragment key={`${row._id}-${s.journalEntryId}-${sIdx}`}>
                            <ListItem
                              secondaryAction={
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={async () => {
                                    await accountingService.reconcileBankTransaction(row._id, {
                                      matched: true,
                                      matchedTransactionId: s.journalEntryId
                                    });
                                    await loadData();
                                  }}
                                >
                                  Match
                                </Button>
                              }
                            >
                              <ListItemText
                                primary={`${s.reference} • ${Number(s.amount || 0).toLocaleString()} • score ${s.score}`}
                                secondary={`${new Date(s.transactionDate).toLocaleDateString()} • ${s.reasons.join(', ')}`}
                              />
                            </ListItem>
                          </React.Fragment>
                        ))}
                      </List>
                    </Box>
                  )}
                  {idx < bankRows.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>VAT Filing Status</Typography>
            <List>
              {filteredVatRows.length === 0 ? (
                <ListItem><ListItemText primary="No VAT records found" /></ListItem>
              ) : filteredVatRows.map((row, idx) => (
                <React.Fragment key={`${row.filingPeriod}-${row.status}-${idx}`}>
                  <ListItem>
                    <ListItemText
                      primary={`${row.filingPeriod} • ${row.status}`}
                      secondary={`Collected: ${Number(row.vatCollected || 0).toLocaleString()} • Paid: ${Number(row.vatPaid || 0).toLocaleString()} • Payable: ${Number(row.vatPayable || 0).toLocaleString()}`}
                    />
                  </ListItem>
                  {idx < filteredVatRows.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default LedgerDrilldownPage;
