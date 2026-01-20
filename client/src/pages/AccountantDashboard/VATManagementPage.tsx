import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Divider,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import vatService, { VatPropertyGroup } from '../../services/vatService';

type Period = 'month_range' | 'year';

const VATManagementPage: React.FC = () => {
  const [period, setPeriod] = useState<Period>('month_range');
  const [startMonth, setStartMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [endMonth, setEndMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const [loading, setLoading] = useState<boolean>(false);
  const [groups, setGroups] = useState<VatPropertyGroup[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [payoutDialog, setPayoutDialog] = useState<{ open: boolean; propertyId?: string; recipientName: string; payoutMethod: string; notes: string }>(
    { open: false, recipientName: '', payoutMethod: 'bank_transfer', notes: '' }
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [periodStart, periodEnd] = useMemo(() => {
    if (period === 'month_range') {
      if (!startMonth || !endMonth) return [new Date(0), new Date()] as const;
      const [sy, sm] = startMonth.split('-').map(Number);
      const [ey, em] = endMonth.split('-').map(Number);
      const start = new Date(Math.min(new Date(sy, (sm || 1) - 1, 1).getTime(), new Date(ey, (em || 1) - 1, 1).getTime()));
      const end = new Date(Math.max(
        new Date(ey, (em || 1), 0, 23, 59, 59, 999).getTime(),
        new Date(sy, (sm || 1), 0, 23, 59, 59, 999).getTime()
      ));
      return [start, end] as const;
    }
    return [new Date(selectedYear, 0, 1), new Date(selectedYear, 11, 31, 23, 59, 59, 999)] as const;
  }, [period, startMonth, endMonth, selectedYear]);

  const load = async () => {
    try {
      setLoading(true);
      const data = await vatService.getTransactions(periodStart, periodEnd);
      setGroups(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setGroups([]);
      setError(e?.response?.data?.message || e?.message || 'Failed to load VAT transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart.getTime(), periodEnd.getTime()]);

  const toggleExpand = (propertyId: string) => {
    setExpanded(prev => ({ ...prev, [propertyId]: !prev[propertyId] }));
  };

  const totalVatAll = useMemo(() => groups.reduce((s, g) => s + Number(g.totalVat || 0), 0), [groups]);

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          VAT Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Period</InputLabel>
            <Select value={period} label="Period" onChange={(e) => setPeriod(e.target.value as Period)}>
              <MenuItem value="month_range">Month to Month</MenuItem>
              <MenuItem value="year">Year</MenuItem>
            </Select>
          </FormControl>
          {period === 'month_range' ? (
            <>
              <TextField
                size="small"
                label="Start Month"
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                size="small"
                label="End Month"
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </>
          ) : (
            <TextField
              size="small"
              label="Year"
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value) || new Date().getFullYear())}
              inputProps={{ min: 1970, max: 9999 }}
            />
          )}
        </Box>
      </Box>

      <Card sx={{ mb: 2, bgcolor: 'warning.main', color: '#1a1a1a' }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ opacity: 0.9, fontWeight: 600 }}>Total VAT for Period</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {`$${Number(totalVatAll || 0).toLocaleString()}`}
          </Typography>
        </CardContent>
      </Card>

      {error && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography color="error" variant="body2">{error}</Typography>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        {groups.map((g) => {
          const isOpen = !!expanded[g.property._id];
          const lastPayout = (g.payouts || [])[0];
          return (
            <Grid item xs={12} key={g.property._id}>
              <Card>
                <CardContent sx={{ pb: 1 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {g.property.name || 'Property'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {g.property.address}
                      </Typography>
                      {g.property.ownerName && (
                        <Typography variant="caption" color="text.secondary">
                          Owner: {g.property.ownerName}
                        </Typography>
                      )}
                    </Box>
                    <Box display="flex" alignItems="center" gap={2} sx={{ flexShrink: 0 }}>
                      <Box textAlign="right">
                        <Typography variant="caption" color="text.secondary">VAT Total</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>${Number(g.totalVat || 0).toLocaleString()}</Typography>
                      </Box>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={() => setPayoutDialog({ open: true, propertyId: g.property._id, recipientName: '', payoutMethod: 'bank_transfer', notes: '' })}
                      >
                        Payout
                      </Button>
                      {lastPayout && (
                        <Button variant="outlined" onClick={() => vatService.openPayoutAck(lastPayout._id)}>Print Ack</Button>
                      )}
                      <IconButton title="Print Property Summary" onClick={() => vatService.openPropertySummary(g.property._id, periodStart, periodEnd)}>
                        <PrintIcon />
                      </IconButton>
                      <IconButton onClick={() => toggleExpand(g.property._id)} title={isOpen ? 'Hide transactions' : 'Show transactions'}>
                        {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <CardContent sx={{ pt: 0 }}>
                    <List dense>
                      {g.transactions.length === 0 ? (
                        <ListItem>
                          <ListItemText primary="No VAT transactions in period" />
                        </ListItem>
                      ) : (
                        g.transactions.map((t, idx) => (
                          <React.Fragment key={t.paymentId}>
                            <ListItem>
                              <ListItemText
                                primary={`$${Number(t.vatAmount || 0).toLocaleString()}`}
                                secondary={`${new Date(t.paymentDate).toLocaleDateString()} • Ref: ${t.referenceNumber || '-'}`}
                              />
                            </ListItem>
                            {idx < g.transactions.length - 1 && <Divider component="li" />}
                          </React.Fragment>
                        ))
                      )}
                    </List>
                  </CardContent>
                </Collapse>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog
        open={payoutDialog.open}
        onClose={() => !submitting && setPayoutDialog({ open: false, recipientName: '', payoutMethod: 'bank_transfer', notes: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create VAT Payout</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Recipient Name"
            value={payoutDialog.recipientName}
            onChange={(e) => setPayoutDialog(prev => ({ ...prev, recipientName: e.target.value }))}
            fullWidth
          />
          <FormControl fullWidth size="small">
            <InputLabel>Payment Method</InputLabel>
            <Select
              value={payoutDialog.payoutMethod}
              label="Payment Method"
              onChange={(e) => setPayoutDialog(prev => ({ ...prev, payoutMethod: e.target.value as string }))}
            >
              <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="mobile_money">Mobile Money</MenuItem>
              <MenuItem value="cheque">Cheque</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Notes"
            value={payoutDialog.notes}
            onChange={(e) => setPayoutDialog(prev => ({ ...prev, notes: e.target.value }))}
            fullWidth
            multiline
            minRows={2}
          />
          {error && <Typography color="error" variant="body2">{error}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayoutDialog({ open: false, recipientName: '', payoutMethod: 'bank_transfer', notes: '' })} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                if (!payoutDialog.propertyId) return;
                setSubmitting(true);
                setError(null);
                await vatService.createPayout({
                  propertyId: payoutDialog.propertyId,
                  start: periodStart,
                  end: periodEnd,
                  recipientName: payoutDialog.recipientName,
                  payoutMethod: payoutDialog.payoutMethod,
                  notes: payoutDialog.notes
                });
                setPayoutDialog({ open: false, recipientName: '', payoutMethod: 'bank_transfer', notes: '' });
                await load();
              } catch (e: any) {
                setError(e?.response?.data?.message || e?.message || 'Failed to create payout');
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting}
          >
            {submitting ? 'Creating…' : 'Create Payout'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VATManagementPage;

