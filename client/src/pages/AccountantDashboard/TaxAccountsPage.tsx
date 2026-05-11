import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import accountantService, { TaxLedgersResponse, TaxPropertyLedger, TaxType } from '../../services/accountantService';

type PayoutDialogState = {
  open: boolean;
  propertyId: string;
  taxType: TaxType;
  propertyLabel: string;
  amount: string;
  payoutDate: string;
  reference: string;
  notes: string;
};

const taxLabelByType: Record<TaxType, string> = {
  VAT: 'VAT',
  VAT_ON_COMMISSION: 'VAT on Commission',
  CGT: 'CGT'
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

const formatDate = (value: string | Date) => new Date(value).toLocaleDateString();

const defaultDialogState: PayoutDialogState = {
  open: false,
  propertyId: '',
  taxType: 'VAT',
  propertyLabel: '',
  amount: '',
  payoutDate: new Date().toISOString().slice(0, 10),
  reference: '',
  notes: ''
};

const TaxAccountsPage: React.FC = () => {
  const [taxLedgers, setTaxLedgers] = useState<TaxLedgersResponse>({ VAT: [], VAT_ON_COMMISSION: [], CGT: [] });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<PayoutDialogState>(defaultDialogState);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadingReceiptFor, setUploadingReceiptFor] = useState<string | null>(null);
  const [receiptTargetPayoutId, setReceiptTargetPayoutId] = useState<string | null>(null);
  const receiptTargetPayoutIdRef = useRef<string | null>(null);

  const loadLedgers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await accountantService.getTaxLedgers();
      setTaxLedgers(response || { VAT: [], VAT_ON_COMMISSION: [], CGT: [] });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load tax ledgers');
      setTaxLedgers({ VAT: [], VAT_ON_COMMISSION: [], CGT: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLedgers();
  }, []);

  const totals = useMemo(() => {
    const calc = (items: TaxPropertyLedger[]) => {
      const debit = items.reduce((sum, item) => sum + Number(item.totalDebit || 0), 0);
      const credit = items.reduce((sum, item) => sum + Number(item.totalCredit || 0), 0);
      return {
        debit: Number(debit.toFixed(2)),
        credit: Number(credit.toFixed(2)),
        outstanding: Number((debit - credit).toFixed(2))
      };
    };

    return {
      VAT: calc(taxLedgers.VAT),
      VAT_ON_COMMISSION: calc(taxLedgers.VAT_ON_COMMISSION),
      CGT: calc(taxLedgers.CGT)
    };
  }, [taxLedgers]);

  const toggleExpanded = (rowKey: string) => {
    setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  const openPayoutDialog = (ledger: TaxPropertyLedger, taxType: TaxType) => {
    const outstanding = Number(Math.max(0, ledger.closingBalance).toFixed(2));
    setDialog({
      open: true,
      propertyId: ledger.propertyId,
      taxType,
      propertyLabel: ledger.propertyAddress || ledger.propertyName || 'Property',
      amount: outstanding > 0 ? String(outstanding) : '',
      payoutDate: new Date().toISOString().slice(0, 10),
      reference: '',
      notes: ''
    });
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialog(defaultDialogState);
  };

  const submitPayout = async () => {
    const amount = Number(dialog.amount || 0);
    if (!dialog.propertyId || !dialog.taxType || amount <= 0) {
      setError('Enter a valid payout amount.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await accountantService.createTaxPayout({
        propertyId: dialog.propertyId,
        taxType: dialog.taxType,
        amount,
        payoutDate: dialog.payoutDate,
        reference: dialog.reference || undefined,
        notes: dialog.notes || undefined
      });
      closeDialog();
      await loadLedgers();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record payout');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTaxSection = (taxType: TaxType, items: TaxPropertyLedger[]) => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {taxLabelByType[taxType]} Account
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Chip size="small" label={`Dr ${formatMoney(totals[taxType].debit)}`} color="warning" />
            <Chip size="small" label={`Cr ${formatMoney(totals[taxType].credit)}`} color="success" />
            <Chip size="small" label={`Outstanding ${formatMoney(totals[taxType].outstanding)}`} color="default" />
          </Box>
        </Box>

        {items.length === 0 && <Typography color="text.secondary">No {taxLabelByType[taxType]} records found.</Typography>}

        {items.map((ledger) => {
          const rowKey = `${taxType}:${ledger.propertyId}`;
          const isExpanded = Boolean(expandedRows[rowKey]);
          const hasOutstanding = Number(ledger.closingBalance || 0) > 0;
          const latestPayoutEntry = [...(ledger.entries || [])]
            .reverse()
            .find((entry) => entry.sourceType === 'payout' && entry.payoutId);
          const isVatSection = taxType === 'VAT';
          const isPaidOut = Number(ledger.totalCredit || 0) > 0 && Number(ledger.closingBalance || 0) <= 0.005;
          const canUploadReceipt = isVatSection && Boolean(latestPayoutEntry?.payoutId);
          return (
            <Card key={rowKey} variant="outlined" sx={{ mb: 1.5 }}>
              <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {ledger.propertyName || 'Property'}
                    </Typography>
                    <Button
                      variant="text"
                      sx={{ p: 0, minWidth: 0, textTransform: 'none', justifyContent: 'flex-start' }}
                      onClick={() => toggleExpanded(rowKey)}
                    >
                      {ledger.propertyAddress || 'Property address'}
                    </Button>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Chip size="small" label={`Outstanding ${formatMoney(ledger.closingBalance)}`} color={hasOutstanding ? 'warning' : 'success'} />
                    {isVatSection && (
                      <Chip
                        size="small"
                        color={isPaidOut ? 'success' : 'warning'}
                        label={isPaidOut ? 'Tax Paid Out' : 'Not Fully Paid'}
                      />
                    )}
                    <IconButton onClick={() => toggleExpanded(rowKey)} size="small">
                      {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                </Box>
              </CardContent>

              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                <CardContent sx={{ pt: 0 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Opening debit comes from tax records. Credits are payouts to ZIMRA.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      {isVatSection && (
                        <>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                              void accountantService.openTaxPropertyReport(ledger.propertyId, 'VAT').catch((err: any) => {
                                setError(err?.response?.data?.message || err?.message || 'Failed to open VAT report');
                              });
                            }}
                          >
                            Print Report
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={!canUploadReceipt || uploadingReceiptFor === latestPayoutEntry?.payoutId}
                            onClick={() => {
                              if (!latestPayoutEntry?.payoutId) return;
                              receiptTargetPayoutIdRef.current = latestPayoutEntry.payoutId;
                              setReceiptTargetPayoutId(latestPayoutEntry.payoutId);
                              const input = document.getElementById('tax-receipt-upload-input') as HTMLInputElement | null;
                              input?.click();
                            }}
                          >
                            {uploadingReceiptFor === latestPayoutEntry?.payoutId
                              ? 'Uploading...'
                              : (latestPayoutEntry?.receiptUploadedAt ? 'Replace Receipt' : 'Upload Receipt')}
                          </Button>
                          {latestPayoutEntry?.payoutId && latestPayoutEntry.receiptUploadedAt && (
                            <Button
                              variant="text"
                              size="small"
                              onClick={() => {
                                void accountantService.openTaxPayoutReceipt(latestPayoutEntry.payoutId as string).catch((err: any) => {
                                  setError(err?.response?.data?.message || err?.message || 'Failed to open receipt');
                                });
                              }}
                            >
                              View Receipt
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => openPayoutDialog(ledger, taxType)}
                        disabled={!hasOutstanding}
                      >
                        Record Payout
                      </Button>
                    </Box>
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="right">Dr</TableCell>
                        <TableCell align="right">Cr</TableCell>
                        <TableCell align="right">Balance</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {ledger.entries.map((entry) => (
                        <TableRow key={entry.entryId}>
                          <TableCell>{formatDate(entry.date)}</TableCell>
                          <TableCell>
                            {entry.description}
                            {entry.reference ? ` (${entry.reference})` : ''}
                          </TableCell>
                          <TableCell align="right">{entry.debit > 0 ? formatMoney(entry.debit) : '-'}</TableCell>
                          <TableCell align="right">{entry.credit > 0 ? formatMoney(entry.credit) : '-'}</TableCell>
                          <TableCell align="right">{formatMoney(entry.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Collapse>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Tax
        </Typography>
        <Typography color="text.secondary">
          Property-level ledgers for VAT, VAT on Commission, and CGT with debit opening balances and payout credits.
        </Typography>
      </Box>

      {loading && <Typography>Loading tax ledgers...</Typography>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            {renderTaxSection('VAT', taxLedgers.VAT)}
          </Grid>
          <Grid item xs={12}>
            {renderTaxSection('VAT_ON_COMMISSION', taxLedgers.VAT_ON_COMMISSION)}
          </Grid>
          <Grid item xs={12}>
            {renderTaxSection('CGT', taxLedgers.CGT)}
          </Grid>
        </Grid>
      )}

      <Dialog open={dialog.open} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Record {taxLabelByType[dialog.taxType]} payout</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Property: {dialog.propertyLabel}
          </Typography>
          <TextField
            label="Amount"
            type="number"
            value={dialog.amount}
            onChange={(e) => setDialog((prev) => ({ ...prev, amount: e.target.value }))}
            inputProps={{ min: 0, step: '0.01' }}
            fullWidth
          />
          <TextField
            label="Payout Date"
            type="date"
            value={dialog.payoutDate}
            onChange={(e) => setDialog((prev) => ({ ...prev, payoutDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="Reference"
            value={dialog.reference}
            onChange={(e) => setDialog((prev) => ({ ...prev, reference: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Notes"
            value={dialog.notes}
            onChange={(e) => setDialog((prev) => ({ ...prev, notes: e.target.value }))}
            multiline
            minRows={2}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={submitting}>Cancel</Button>
          <Button onClick={submitPayout} variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Payout'}
          </Button>
        </DialogActions>
      </Dialog>
      <input
        id="tax-receipt-upload-input"
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const targetPayoutId = receiptTargetPayoutIdRef.current || receiptTargetPayoutId;
          if (!file || !targetPayoutId) return;
          try {
            setError(null);
            setUploadingReceiptFor(targetPayoutId);
            await accountantService.uploadTaxPayoutReceipt(targetPayoutId, file);
            await loadLedgers();
          } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || 'Failed to upload receipt');
          } finally {
            setUploadingReceiptFor(null);
            setReceiptTargetPayoutId(null);
            receiptTargetPayoutIdRef.current = null;
            e.target.value = '';
          }
        }}
      />
    </Box>
  );
};

export default TaxAccountsPage;

