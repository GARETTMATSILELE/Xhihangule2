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
import accountantService, { TaxLedgersResponse, TaxType } from '../../services/accountantService';
import { buildUnifiedTaxAccounts, UnifiedTaxAccount } from './mergeTaxLedgers';

type TaxAccountsPageProps = {
  position?: any | null;
  onLedgerChange?: () => void;
};

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
  CGT: 'Capital Gains Tax',
  CGWT: 'Capital Gains Withholding Tax'
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

const TaxAccountsPage: React.FC<TaxAccountsPageProps> = ({ position, onLedgerChange }) => {
  const [taxLedgers, setTaxLedgers] = useState<TaxLedgersResponse>({ VAT: [], VAT_ON_COMMISSION: [], CGT: [], CGWT: [] });
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
      setTaxLedgers(response || { VAT: [], VAT_ON_COMMISSION: [], CGT: [], CGWT: [] });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load tax ledgers');
      setTaxLedgers({ VAT: [], VAT_ON_COMMISSION: [], CGT: [], CGWT: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLedgers();
  }, []);

  const accounts = useMemo(() => buildUnifiedTaxAccounts({
    canonicalAccounts: position?.accounts || [],
    trustLedgers: taxLedgers,
    discrepancies: position?.discrepancies || [],
    hasCanonicalPosition: Boolean(position)
  }), [position, taxLedgers]);

  const toggleExpanded = (rowKey: string) => {
    setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  const openPayoutDialog = (
    row: { propertyId: string; propertyName: string; propertyAddress: string; trustOutstanding: number },
    taxType: TaxType
  ) => {
    const outstanding = Number(Math.max(0, row.trustOutstanding).toFixed(2));
    setDialog({
      open: true,
      propertyId: row.propertyId,
      taxType,
      propertyLabel: row.propertyAddress || row.propertyName || 'Property',
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
      onLedgerChange?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record payout');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTaxSection = (account: UnifiedTaxAccount) => (
    <Card sx={{ mb: 3 }} data-tax-account={account.canonicalType}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {account.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Canonical figures come from posted obligations and posted ZIMRA allocations. Trust-book figures come from historical TaxRecord debits and TaxPayout credits. The trust balance is not added to canonical outstanding.
            </Typography>
          </Box>
          <Chip size="small" label={account.status.replace(/_/g, ' ')} color={account.status === 'RECONCILED' ? 'success' : 'warning'} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Chip size="small" variant="outlined" label={`Canonical recognised ${formatMoney(account.recognised)}`} />
          <Chip size="small" variant="outlined" label={`Canonical paid ${formatMoney(account.paid)}`} />
          <Chip size="small" variant="outlined" label={`Canonical outstanding ${formatMoney(account.outstanding)}`} color="primary" />
          <Chip size="small" variant="outlined" label={`Reversed ${formatMoney(account.reversed)}`} />
          <Chip size="small" label={`Trust debit ${formatMoney(account.trustDebit)}`} color="warning" />
          <Chip size="small" label={`Trust credit ${formatMoney(account.trustCredit)}`} color="success" />
          <Chip size="small" label={`Trust outstanding ${formatMoney(account.trustOutstanding)}`} />
        </Box>

        {account.properties.length === 0 && (
          <Typography color="text.secondary">No property records for this tax account.</Typography>
        )}

        {account.properties.map((row) => {
          const rowKey = `${account.canonicalType}:${row.propertyId}`;
          const isExpanded = Boolean(expandedRows[rowKey]);
          const legacyType = account.legacyType;
          const isVatSection = legacyType === 'VAT';
          const latestPayoutEntry = [...row.trustEntries]
            .reverse()
            .find((entry) => entry.sourceType === 'payout' && entry.payoutId);
          const canUploadReceipt = isVatSection && Boolean(latestPayoutEntry?.payoutId);
          return (
            <Card key={rowKey} variant="outlined" sx={{ mb: 1.5 }} data-property-id={row.propertyId}>
              <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {row.propertyName || 'Property'}
                    </Typography>
                    <Button
                      variant="text"
                      sx={{ p: 0, minWidth: 0, textTransform: 'none', justifyContent: 'flex-start' }}
                      onClick={() => toggleExpanded(rowKey)}
                    >
                      {row.propertyAddress || 'Expand property detail'}
                    </Button>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Chip size="small" variant="outlined" label={`Canonical ${formatMoney(row.outstanding)}`} />
                    <Chip size="small" label={`Trust ${formatMoney(row.trustOutstanding)}`} color={row.trustOutstanding > 0 ? 'warning' : 'success'} />
                    <Chip size="small" label={row.status.replace(/_/g, ' ')} />
                    <IconButton onClick={() => toggleExpanded(rowKey)} size="small" aria-label={`Expand ${row.propertyName}`}>
                      {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                </Box>
              </CardContent>

              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                <CardContent sx={{ pt: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>Canonical tax position</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Recognised {formatMoney(row.recognised)} · Paid {formatMoney(row.paid)} · Reversed {formatMoney(row.reversed)} · Outstanding {formatMoney(row.outstanding)}
                  </Typography>
                  {row.lines.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No canonical obligation for this property.</Typography>
                  ) : (
                    <Table size="small" sx={{ mb: 2 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Source</TableCell>
                          <TableCell>Tax period</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Recognised</TableCell>
                          <TableCell align="right">Paid</TableCell>
                          <TableCell align="right">Outstanding</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {row.lines.map((line) => (
                          <TableRow key={line.obligationId}>
                            <TableCell>{line.paymentId || line.obligationId}</TableCell>
                            <TableCell>{line.taxPeriod}</TableCell>
                            <TableCell>{line.status}</TableCell>
                            <TableCell align="right">{formatMoney(line.recognised)}</TableCell>
                            <TableCell align="right">{formatMoney(line.paid)}</TableCell>
                            <TableCell align="right">{formatMoney(line.outstanding)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 1, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Historical trust tax ledger</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Debits are TaxRecord entries. Credits are trust-book TaxPayout entries. A trust payout is not a posted ZIMRA remittance.
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      {isVatSection && row.trustEntries.length > 0 && (
                        <>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                              void accountantService.openTaxPropertyReport(row.propertyId, 'VAT').catch((err: any) => {
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
                      {legacyType && (
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => openPayoutDialog(row, legacyType)}
                          disabled={!row.canRecordPayout}
                        >
                          Record Payout
                        </Button>
                      )}
                    </Box>
                  </Box>
                  {row.trustEntries.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      No historical trust ledger for this property. Record Payout stays unavailable because the existing settlement requires a trust-book balance.
                    </Typography>
                  ) : (
                    <Table size="small" sx={{ mb: 2 }}>
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
                        {row.trustEntries.map((entry) => (
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
                  )}

                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Reconciliation</Typography>
                  {row.discrepancies.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {row.status === 'RECONCILED'
                        ? 'Canonical outstanding and the historical trust-book outstanding agree for this property.'
                        : row.status.replace(/_/g, ' ')}
                    </Typography>
                  ) : (
                    row.discrepancies.map((item) => (
                      <Typography key={`${item.kind}-${item.detail}`} variant="body2" color="text.secondary">
                        {item.kind}: {item.detail}
                      </Typography>
                    ))
                  )}
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
          Property ledgers
        </Typography>
        <Typography color="text.secondary">
          Each tax account is shown once. Canonical outstanding is the posted obligation position. Trust outstanding is the historical TaxRecord and TaxPayout book. Recording a payout updates the trust book only.
        </Typography>
      </Box>

      {loading && <Typography>Loading tax ledgers...</Typography>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && Array.isArray(position?.gl) && position.gl.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>General ledger control accounts</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Chart balances are stored as debit minus credit. A tax liability that is still owed is a negative stored balance. The comparison uses the credit-normal amount and does not change the chart.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Account</TableCell>
                  <TableCell align="right">Stored balance</TableCell>
                  <TableCell align="right">Credit-normal liability</TableCell>
                  <TableCell align="right">Canonical outstanding</TableCell>
                  <TableCell align="right">Difference</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {position.gl.map((row: any) => (
                  <TableRow key={row.code}>
                    <TableCell>{row.code} {row.name}</TableCell>
                    <TableCell align="right">{formatMoney(row.storedBalance)}</TableCell>
                    <TableCell align="right">{formatMoney(row.creditNormalBalance)}</TableCell>
                    <TableCell align="right">{formatMoney(row.canonicalOutstanding)}</TableCell>
                    <TableCell align="right">{formatMoney(row.difference)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {Number(position.unallocatedPayments || 0) > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Unallocated posted ZIMRA payments: {formatMoney(position.unallocatedPayments)}. This amount is not applied to a property liability.
              </Typography>
            )}
            {(position.discrepancies || []).filter((item: any) => String(item.kind).startsWith('GL_')).map((item: any) => (
              <Typography key={`${item.kind}-${item.taxType}`} variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {item.kind}: {item.detail}
              </Typography>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Grid container spacing={2}>
          {accounts.map((account) => (
            <Grid item xs={12} key={account.canonicalType}>
              {renderTaxSection(account)}
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={dialog.open} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Record {taxLabelByType[dialog.taxType]} payout</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Property: {dialog.propertyLabel}. This records a trust-book TaxPayout. It does not reduce canonical outstanding tax and it does not post a ZIMRA remittance.
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

