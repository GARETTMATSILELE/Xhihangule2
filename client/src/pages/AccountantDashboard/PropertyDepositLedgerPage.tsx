import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Box, Typography, Card, CardContent, CircularProgress, Alert, Table, TableHead, TableRow, TableCell, TableBody, Paper, TableContainer, Breadcrumbs, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import paymentService from '../../services/paymentService';
import { propertyAccountService } from '../../services/propertyAccountService';

const PropertyDepositLedgerPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<string>('bank_transfer');
  const [notes, setNotes] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!propertyId) return;
      setLoading(true);
      setError(null);
      try {
        const { entries, balance } = await paymentService.getPropertyDepositLedger(propertyId);
        setEntries(entries);
        setBalance(balance);
      } catch (e: any) {
        setError(e.message || 'Failed to load deposit ledger');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [propertyId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">{error}</Alert>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link to={`/accountant-dashboard/property-accounts/${propertyId}`}>Property Account</Link>
        <Typography color="text.primary">Deposit Ledger</Typography>
      </Breadcrumbs>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6">Current Deposit Held</Typography>
          <Typography variant="h4" color="primary" sx={{ mt: 1 }}>
            {propertyAccountService.formatCurrency(balance)}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={() => setPayoutOpen(true)} disabled={balance <= 0}>Create Payout</Button>
          </Box>
        </CardContent>
      </Card>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Reference</TableCell>
              <TableCell>Recipient</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell>Balance</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e, idx) => (
              <TableRow key={idx}>
                <TableCell>{new Date(e.depositDate).toLocaleDateString()}</TableCell>
                <TableCell>{e.type === 'payout' ? 'Payout' : 'Payment'}</TableCell>
                <TableCell>{propertyAccountService.formatCurrency(e.depositAmount)}</TableCell>
                <TableCell>{e.referenceNumber || '-'}</TableCell>
                <TableCell>{e.recipientName || '-'}</TableCell>
                <TableCell>{e.notes || '-'}</TableCell>
                <TableCell>{propertyAccountService.formatCurrency(e.runningBalance || 0)}</TableCell>
                <TableCell>
                  {e.type === 'payout' && (
                    <Button size="small" onClick={() => {
                      // Print acknowledgement for this payout
                      const propertyAddress = (window as any).__CURRENT_PROPERTY_ADDRESS__ || '';
                      const ownerName = (window as any).__CURRENT_OWNER_NAME__ || '';
                      const tenantName = (window as any).__CURRENT_TENANT_NAME__ || '';
                      const printWindow = window.open('', '_blank');
                      if (!printWindow) return;
                      const html = `
                        <!doctype html>
                        <html>
                        <head>
                          <meta charset=\"utf-8\" />
                          <title>Deposit Payout Acknowledgement</title>
                          <style>
                            body { font-family: Arial, sans-serif; margin: 40px; }
                            .header { text-align: center; margin-bottom: 20px; }
                            .row { display: flex; justify-content: space-between; margin: 8px 0; }
                            .label { font-weight: bold; min-width: 140px; }
                            .sig { margin-top: 60px; }
                            .sig-line { border-top: 1px solid #000; width: 260px; }
                            .sig-label { font-size: 12px; color: #666; }
                          </style>
                        </head>
                        <body>
                          <div class='header'>
                            <h2>Deposit Payout Acknowledgement</h2>
                          </div>
                          <div class='row'><div class='label'>Date:</div><div>${new Date(e.depositDate).toLocaleDateString()}</div></div>
                          <div class='row'><div class='label'>Reference:</div><div>${e.referenceNumber || '-'}</div></div>
                          <div class='row'><div class='label'>Recipient:</div><div>${e.recipientName || '-'}</div></div>
                          <div class='row'><div class='label'>Amount:</div><div>${propertyAccountService.formatCurrency(e.depositAmount)}</div></div>
                          <div class='row'><div class='label'>Property Address:</div><div>${propertyAddress || '-'}</div></div>
                          <div class='row'><div class='label'>Owner Name:</div><div>${ownerName || '-'}</div></div>
                          <div class='row'><div class='label'>Tenant Name:</div><div>${tenantName || '-'}</div></div>
                          ${e.notes ? `<div class='row'><div class='label'>Notes:</div><div>${e.notes}</div></div>` : ''}
                          <div class='sig'>
                            <div class='sig-line'></div>
                            <div class='sig-label'>Recipient Signature</div>
                          </div>
                          <p style='margin-top:30px; font-size:12px; color:#666;'>Generated on ${new Date().toLocaleString()}</p>
                        </body>
                        </html>
                      `;
                      printWindow.document.write(html);
                      printWindow.document.close();
                    }}>Print</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={payoutOpen} onClose={() => setPayoutOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Deposit Payout</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <TextField
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              fullWidth
              required
              helperText={`Available: ${propertyAccountService.formatCurrency(balance)}`}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Pay To (Recipient Name)"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              fullWidth
              required
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Payment Method</InputLabel>
              <Select value={method} label="Payment Method" onChange={(e) => setMethod(String(e.target.value))}>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="mobile_money">Mobile Money</MenuItem>
                <MenuItem value="credit_card">Credit Card</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={3}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayoutOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={submitting || amount <= 0 || amount > balance || !recipientName}
            onClick={async () => {
              if (!propertyId) return;
              try {
                setSubmitting(true);
                await paymentService.createPropertyDepositPayout(propertyId, { amount, paymentMethod: method, notes, recipientName });
                const { entries, balance } = await paymentService.getPropertyDepositLedger(propertyId);
                setEntries(entries);
                setBalance(balance);
                setPayoutOpen(false);
                setAmount(0);
                setNotes('');
                setRecipientName('');
              } catch (e: any) {
                setError(e.message || 'Failed to create payout');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? 'Submitting...' : 'Create Payout'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PropertyDepositLedgerPage;


