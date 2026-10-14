import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { Delete, Edit } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import individualWorkspaceService, { IndividualEntryPayload } from '../../../services/individualWorkspaceService';
import { billSubsections, expenseCategories } from '../constants';
import { CenteredLoader, PageShell, StatCard } from '../components/shared';
import usePortfolioContext from '../hooks/usePortfolioContext';
import { INDIVIDUAL_THEME } from '../theme';
import { money } from '../utils/formatters';

function EntryDialog({ open, title, categories, properties, initial, onClose, onSave }: {
  open: boolean;
  title: string;
  categories: string[];
  properties: Array<{ propertyId: string; propertyName: string }>;
  initial?: any;
  onClose: () => void;
  onSave: (payload: IndividualEntryPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<IndividualEntryPayload>({
    propertyId: '', category: categories[0], description: '', amount: 0,
    date: new Date().toISOString().slice(0, 10), reference: '', receiptUrl: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        propertyId: initial?.propertyId || properties[0]?.propertyId || '',
        category: initial?.category || categories[0],
        description: initial?.description || '',
        amount: Number(initial?.amount || 0),
        date: initial?.date ? new Date(initial.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        reference: initial?.referenceNumber || initial?.reference || '',
        receiptUrl: Array.isArray(initial?.attachments) ? initial.attachments[0] || '' : ''
      });
    }
  }, [open, initial, categories, properties]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="Property" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} fullWidth required>
            {properties.map((p) => <MenuItem key={p.propertyId} value={p.propertyId}>{p.propertyName}</MenuItem>)}
          </TextField>
          <TextField select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} fullWidth>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth required />
          <TextField label="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} fullWidth required />
          <TextField label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
          <TextField select label="Tax treatment" value={form.vatMode || 'ACCOUNTANT_REVIEW'} onChange={(e) => setForm({ ...form, vatMode: e.target.value })} fullWidth>
            <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
            <MenuItem value="NO_VAT">No VAT / not applicable</MenuItem>
            <MenuItem value="VAT_INCLUSIVE">VAT inclusive</MenuItem>
            <MenuItem value="VAT_EXCLUSIVE">VAT exclusive</MenuItem>
            <MenuItem value="UNKNOWN">Unknown</MenuItem>
          </TextField>
          <TextField label="Supplier VAT number" value={form.supplierVatNumber || ''} onChange={(e) => setForm({ ...form, supplierVatNumber: e.target.value })} fullWidth />
          <TextField label="Invoice number" value={form.invoiceNumber || ''} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} fullWidth />
          <TextField select label="Input VAT eligibility" value={form.inputVatEligibility || 'REVIEW_REQUIRED'} onChange={(e) => setForm({ ...form, inputVatEligibility: e.target.value })} fullWidth>
            <MenuItem value="REVIEW_REQUIRED">Accountant review</MenuItem>
            <MenuItem value="RECOVERABLE">Recoverable</MenuItem>
            <MenuItem value="NON_RECOVERABLE">Non-recoverable</MenuItem>
            <MenuItem value="PARTIALLY_RECOVERABLE">Partially recoverable</MenuItem>
            <MenuItem value="NOT_APPLICABLE">Not applicable</MenuItem>
          </TextField>
          <Typography variant="caption" color="text.secondary">
            VAT is calculated on the server from the tax snapshot. Missing supplier invoice details stay as review — they are not shown as VAT = 0.
          </Typography>
          <TextField select label="Deductibility" value={form.deductibility || 'ACCOUNTANT_REVIEW'} onChange={(e) => setForm({ ...form, deductibility: e.target.value })} fullWidth>
            <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
            <MenuItem value="DEDUCTIBLE">Deductible</MenuItem>
            <MenuItem value="NON_DEDUCTIBLE">Non-deductible</MenuItem>
            <MenuItem value="PARTIALLY_DEDUCTIBLE">Partially deductible</MenuItem>
            <MenuItem value="CAPITAL">Capital</MenuItem>
            <MenuItem value="NOT_APPLICABLE">Not applicable</MenuItem>
          </TextField>
          <TextField select label="Capital / Revenue" value={form.capitalOrRevenue || 'REVENUE'} onChange={(e) => setForm({ ...form, capitalOrRevenue: e.target.value })} fullWidth>
            <MenuItem value="REVENUE">Revenue</MenuItem>
            <MenuItem value="CAPITAL">Capital</MenuItem>
            <MenuItem value="MIXED">Mixed</MenuItem>
            <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
          </TextField>
          <TextField label="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} fullWidth />
          <TextField label="Receipt URL" value={form.receiptUrl} onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saving || !form.propertyId || !form.amount} onClick={async () => { setSaving(true); try { await onSave(form); } finally { setSaving(false); } }} sx={{ bgcolor: INDIVIDUAL_THEME.primary }}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ExpensesPage() {
  const [searchParams] = useSearchParams();
  const prefillProperty = searchParams.get('propertyId') || '';
  const { enrichedProperties } = usePortfolioContext();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const rows = await individualWorkspaceService.getExpenses();
    const list = Array.isArray(rows) ? rows : [];
    setEntries(prefillProperty ? list.filter((e) => String(e.propertyId) === prefillProperty) : list);
    setLoading(false);
  }, [prefillProperty]);

  useEffect(() => { reload(); }, [reload]);

  const onSave = async (payload: IndividualEntryPayload) => {
    if (editing) await individualWorkspaceService.editExpense(editing.propertyId, editing._id, payload);
    else await individualWorkspaceService.addExpense(payload);
    setDialogOpen(false);
    setEditing(null);
    await reload();
  };

  if (loading) return <CenteredLoader />;

  return (
    <PageShell title="Expenses" subtitle="Track operating costs across your portfolio." action={
      <Button variant="contained" onClick={() => setDialogOpen(true)} sx={{ bgcolor: INDIVIDUAL_THEME.primary }}>Add Expense</Button>
    }>
      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
        <CardContent>
          <Stack spacing={1}>
            {entries.map((entry) => (
              <Box key={entry._id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}` }}>
                <Box>
                  <Typography fontWeight={600}>{entry.description || entry.category}</Typography>
                  <Typography variant="body2" color="text.secondary">{entry.propertyName} | {entry.category} | {new Date(entry.date).toLocaleDateString()}</Typography>
                  {(entry.taxPeriodKey || entry.taxCalculationStatus) && (
                    <Typography variant="caption" color="text.secondary">
                      Tax period {entry.taxPeriodKey || 'not opened'} · {String(entry.vatTreatment || entry.deductibility || 'Review')} · {String(entry.taxCalculationStatus || 'NOT_CALCULATED').replace(/_/g, ' ').toLowerCase()}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography fontWeight={700}>{money(entry.amount)}</Typography>
                  <IconButton size="small" onClick={() => { setEditing(entry); setDialogOpen(true); }}><Edit /></IconButton>
                  <IconButton size="small" onClick={async () => { await individualWorkspaceService.deleteExpense(entry.propertyId, entry._id); await reload(); }}><Delete /></IconButton>
                </Stack>
              </Box>
            ))}
            {!entries.length && <Typography color="text.secondary">No expenses recorded yet.</Typography>}
          </Stack>
        </CardContent>
      </Card>
      <EntryDialog open={dialogOpen} title={`${editing ? 'Edit' : 'Add'} Expense`} categories={expenseCategories} properties={enrichedProperties} initial={editing || (prefillProperty ? { propertyId: prefillProperty } : null)} onClose={() => { setDialogOpen(false); setEditing(null); }} onSave={onSave} />
    </PageShell>
  );
}

export function BillsLeviesPage() {
  const { bills, billsDueThisMonth, outstandingBillsTotal, enrichedProperties, refreshAll } = usePortfolioContext();
  const [tab, setTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const activeCategory = billSubsections[tab]?.key || 'Municipal';
  const filtered = bills.filter((b) => activeCategory === 'Other' ? !['Municipal', 'Levies', 'Insurance', 'Utilities'].includes(String(b.category)) : String(b.category) === activeCategory);

  const onSave = async (payload: IndividualEntryPayload) => {
    if (editing) await individualWorkspaceService.editExpense(editing.propertyId, editing._id, payload);
    else await individualWorkspaceService.addExpense({ ...payload, category: activeCategory === 'Other' ? payload.category : activeCategory });
    setDialogOpen(false);
    setEditing(null);
    await refreshAll();
  };

  return (
    <PageShell title="Bills & Levies" subtitle="Municipal bills, levies, insurance, and utilities — separate from general expenses." action={
      <Button variant="contained" onClick={() => setDialogOpen(true)} sx={{ bgcolor: INDIVIDUAL_THEME.primary }}>Add Bill</Button>
    }>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}><StatCard title="Bills Due This Month" value={String(billsDueThisMonth)} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatCard title="Outstanding Bills" value={money(outstandingBillsTotal)} /></Grid>
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {billSubsections.map((s) => <Tab key={s.key} label={s.label} />)}
      </Tabs>

      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, mt: 2 }}>
        <CardContent>
          <Stack spacing={1}>
            {filtered.map((bill) => (
              <Box key={bill._id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}` }}>
                <Box>
                  <Typography fontWeight={600}>{bill.description || bill.category}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {bill.propertyName} | Due: {new Date(bill.date).toLocaleDateString()} | Ref: {bill.referenceNumber || '—'}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography fontWeight={700}>{money(bill.amount)}</Typography>
                  <IconButton size="small" onClick={() => { setEditing(bill); setDialogOpen(true); }}><Edit /></IconButton>
                </Stack>
              </Box>
            ))}
            {!filtered.length && <Typography color="text.secondary">No {billSubsections[tab]?.label.toLowerCase()} recorded.</Typography>}
          </Stack>
        </CardContent>
      </Card>

      <EntryDialog
        open={dialogOpen}
        title={`${editing ? 'Edit' : 'Add'} ${billSubsections[tab]?.label}`}
        categories={[activeCategory === 'Other' ? 'Other' : activeCategory]}
        properties={enrichedProperties}
        initial={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSave={onSave}
      />
    </PageShell>
  );
}

export default ExpensesPage;
