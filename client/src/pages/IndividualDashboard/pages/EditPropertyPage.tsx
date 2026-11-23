import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Add, ArrowBack, Delete } from '@mui/icons-material';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { isDemoMode, notifyDemoBlocked, workspacePath } from '../../../demo/demoMode';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { CenteredLoader, PageShell } from '../components/shared';
import usePortfolioContext from '../hooks/usePortfolioContext';
import { INDIVIDUAL_THEME } from '../theme';

type Charge = {
  chargeId?: string;
  description: string;
  category: string;
  amount: string;
  currency: string;
  frequency: string;
  effectiveFrom: string;
  active: boolean;
};

type Editor = {
  name: string;
  address: string;
  city: string;
  country: string;
  type: string;
  description: string;
  status: string;
  rent: string;
  rentFrequency: string;
  rentDueDay: string;
  paymentTerms: string;
  rentEffectiveFrom: string;
  currency: string;
  bedrooms: string;
  bathrooms: string;
  parkingSpaces: string;
  area: string;
  amenities: string;
  charges: Charge[];
  hasFinancialHistory: boolean;
  pendingRent: number | null;
  pendingRentEffectiveFrom: string;
};

const TYPES = [
  ['apartment', 'Apartment'],
  ['house', 'House'],
  ['commercial', 'Commercial'],
  ['land', 'Land']
];
const STATUSES = [
  ['available', 'Available'],
  ['rented', 'Rented'],
  ['maintenance', 'Under maintenance'],
  ['under_offer', 'Under offer'],
  ['sold', 'Sold']
];
const FREQUENCIES = [
  ['monthly', 'Monthly'],
  ['weekly', 'Weekly'],
  ['quarterly', 'Quarterly'],
  ['annually', 'Annually']
];
const CHARGE_CATEGORIES = ['Levy', 'Municipal', 'Utilities', 'Insurance', 'Other'];

function emptyCharge(currency: string): Charge {
  return { description: '', category: 'Levy', amount: '', currency, frequency: 'monthly', effectiveFrom: new Date().toISOString().slice(0, 10), active: true };
}

function fromApi(data: any): Editor {
  return {
    name: data?.name || '',
    address: data?.address || '',
    city: data?.city || '',
    country: data?.country || '',
    type: data?.type || 'apartment',
    description: data?.description || '',
    status: data?.status || 'available',
    rent: data?.rent == null ? '' : String(data.rent),
    rentFrequency: data?.rentFrequency || 'monthly',
    rentDueDay: data?.rentDueDay == null || data.rentDueDay === '' ? '' : String(data.rentDueDay),
    paymentTerms: data?.paymentTerms || '',
    rentEffectiveFrom: data?.rentEffectiveFrom || '',
    currency: data?.currency || 'USD',
    bedrooms: String(data?.bedrooms ?? 0),
    bathrooms: String(data?.bathrooms ?? 0),
    parkingSpaces: String(data?.parkingSpaces ?? 0),
    area: String(data?.area ?? 0),
    amenities: Array.isArray(data?.amenities) ? data.amenities.join(', ') : '',
    charges: Array.isArray(data?.charges) && data.charges.length
      ? data.charges.map((charge: any) => ({
        chargeId: charge.chargeId,
        description: charge.description || '',
        category: charge.category || 'Other',
        amount: String(charge.amount ?? ''),
        currency: charge.currency || data?.currency || 'USD',
        frequency: charge.frequency || 'monthly',
        effectiveFrom: charge.effectiveFrom || '',
        active: charge.active !== false
      }))
      : [],
    hasFinancialHistory: Boolean(data?.hasFinancialHistory),
    pendingRent: data?.pendingRent ?? null,
    pendingRentEffectiveFrom: data?.pendingRentEffectiveFrom || ''
  };
}

function errorMessage(error: any) {
  return error?.response?.data?.message || error?.message || 'The property could not be saved. Your changes are still on this page.';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, p: { xs: 2, md: 2.5 } }}>
      <Typography sx={{ fontWeight: 700, mb: 2 }}>{title}</Typography>
      {children}
    </Box>
  );
}

export function EditPropertyPage() {
  const { propertyId = '' } = useParams();
  const navigate = useNavigate();
  const { refreshAll } = usePortfolioContext();
  const [form, setForm] = useState<Editor | null>(null);
  const [saved, setSaved] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmCurrency, setConfirmCurrency] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    individualWorkspaceService.getPropertyEditor(propertyId)
      .then((data) => {
        const next = fromApi(data);
        setForm(next);
        setSaved(next);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [propertyId]);

  const changes = useMemo(() => {
    if (!form || !saved) return [];
    const rows: string[] = [];
    const compare = (label: string, next: string, previous: string) => {
      if (next !== previous) rows.push(`${label}: ${previous || '—'} → ${next || '—'}`);
    };
    compare('Name', form.name, saved.name);
    compare('Address', form.address, saved.address);
    compare('City', form.city, saved.city);
    compare('Country', form.country, saved.country);
    compare('Type', form.type, saved.type);
    compare('Status', form.status, saved.status);
    compare('Description', form.description, saved.description);
    compare('Rent', form.rent, saved.rent);
    compare('Rent frequency', form.rentFrequency, saved.rentFrequency);
    compare('Rent due day', form.rentDueDay, saved.rentDueDay);
    compare('Rental terms', form.paymentTerms, saved.paymentTerms);
    compare('Rent effective date', form.rentEffectiveFrom, saved.rentEffectiveFrom);
    compare('Currency', form.currency, saved.currency);
    compare('Bedrooms', form.bedrooms, saved.bedrooms);
    compare('Bathrooms', form.bathrooms, saved.bathrooms);
    compare('Parking', form.parkingSpaces, saved.parkingSpaces);
    compare('Floor area', form.area, saved.area);
    compare('Features', form.amenities, saved.amenities);
    if (JSON.stringify(form.charges) !== JSON.stringify(saved.charges)) rows.push('Recurring charges were updated. Recorded bills stay as they are.');
    return rows;
  }, [form, saved]);

  const rentChanged = Boolean(saved && form && (form.rent !== saved.rent || form.rentFrequency !== saved.rentFrequency || form.rentDueDay !== saved.rentDueDay || form.paymentTerms !== saved.paymentTerms));

  const save = async () => {
    if (!form) return;
    if (isDemoMode()) {
      notifyDemoBlocked();
      setError('Demo mode — this action is disabled. Your entries are still on this page.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await individualWorkspaceService.updatePropertyEditor(propertyId, {
        name: form.name,
        address: form.address,
        city: form.city,
        country: form.country,
        type: form.type,
        description: form.description,
        status: form.status,
        rent: Number(form.rent || 0),
        rentFrequency: form.rentFrequency,
        rentDueDay: form.rentDueDay === '' ? null : Number(form.rentDueDay),
        paymentTerms: form.paymentTerms,
        rentEffectiveFrom: form.rentEffectiveFrom || undefined,
        currency: form.currency,
        confirmCurrencyChange: confirmCurrency,
        bedrooms: Number(form.bedrooms || 0),
        bathrooms: Number(form.bathrooms || 0),
        parkingSpaces: Number(form.parkingSpaces || 0),
        area: Number(form.area || 0),
        amenities: form.amenities,
        charges: form.charges.map((charge) => ({
          chargeId: charge.chargeId,
          description: charge.description,
          category: charge.category,
          amount: Number(charge.amount || 0),
          currency: charge.currency || form.currency,
          frequency: charge.frequency,
          effectiveFrom: charge.effectiveFrom || undefined,
          active: charge.active
        }))
      });
      const notes = [result?.message, result?.rentNote, result?.chargeNote, result?.currencyNote].filter(Boolean).join(' ');
      setSuccess(notes || 'Property updated.');
      setReviewing(false);
      if (result?.property) {
        const next = fromApi(result.property);
        setForm(next);
        setSaved(next);
      }
      await refreshAll();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'CURRENCY_CONFIRMATION_REQUIRED') setConfirmCurrency(false);
      setError(errorMessage(err));
      setReviewing(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CenteredLoader />;
  if (!form) {
    return (
      <PageShell title="Edit property" subtitle="Update this property without changing its financial history.">
        <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error || 'This property could not be opened.'}</Alert>
      </PageShell>
    );
  }

  const set = (patch: Partial<Editor>) => setForm({ ...form, ...patch });

  return (
    <PageShell title="Edit property" subtitle="Changes apply from the dates you choose. Recorded payments, bills, tenants and leases stay as they are.">
      <Stack spacing={2.5}>
        <Button className="no-print" startIcon={<ArrowBack />} component={RouterLink} to={workspacePath(`/individual-dashboard/properties/${propertyId}`)} sx={{ alignSelf: 'flex-start' }}>
          Back to property
        </Button>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        {form.pendingRent != null && form.pendingRentEffectiveFrom && (
          <Alert severity="info">A rental amount of {form.pendingRent} is scheduled from {form.pendingRentEffectiveFrom}. The current rent stays in place until that date.</Alert>
        )}
        {form.hasFinancialHistory && form.currency !== saved?.currency && (
          <Alert severity="warning">
            Existing payments and ledger entries will keep their original currency.
            <FormControlLabel
              sx={{ display: 'block', mt: 1 }}
              control={<Checkbox checked={confirmCurrency} onChange={(event) => setConfirmCurrency(event.target.checked)} />}
              label="I understand the currency change does not rewrite existing transactions."
            />
          </Alert>
        )}

        <Section title="Property details">
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}><TextField label="Property name" value={form.name} onChange={(event) => set({ name: event.target.value })} fullWidth required /></Grid>
            <Grid item xs={12} md={6}><TextField label="City" value={form.city} onChange={(event) => set({ city: event.target.value })} fullWidth /></Grid>
            <Grid item xs={12}><TextField label="Address" value={form.address} onChange={(event) => set({ address: event.target.value })} fullWidth required /></Grid>
            <Grid item xs={12} md={4}><TextField label="Country" value={form.country} onChange={(event) => set({ country: event.target.value })} fullWidth /></Grid>
            <Grid item xs={12} md={4}>
              <TextField select label="Property type" value={form.type} onChange={(event) => set({ type: event.target.value })} fullWidth>
                {TYPES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select label="Status" value={form.status} onChange={(event) => set({ status: event.target.value })} fullWidth>
                {STATUSES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}><TextField label="Description" value={form.description} onChange={(event) => set({ description: event.target.value })} fullWidth multiline minRows={3} /></Grid>
          </Grid>
        </Section>

        <Section title="Rental information">
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}><TextField label="Rental amount" type="number" value={form.rent} onChange={(event) => set({ rent: event.target.value })} fullWidth /></Grid>
            <Grid item xs={12} md={4}><TextField label="Currency" value={form.currency} onChange={(event) => set({ currency: event.target.value.toUpperCase() })} fullWidth helperText="USD or ZiG" /></Grid>
            <Grid item xs={12} md={4}>
              <TextField select label="Frequency" value={form.rentFrequency} onChange={(event) => set({ rentFrequency: event.target.value })} fullWidth>
                {FREQUENCIES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}><TextField label="Payment due day" type="number" value={form.rentDueDay} onChange={(event) => set({ rentDueDay: event.target.value })} fullWidth helperText="Day 1 to 28" /></Grid>
            <Grid item xs={12} md={4}><TextField label="Effective date" type="date" value={form.rentEffectiveFrom} onChange={(event) => set({ rentEffectiveFrom: event.target.value })} fullWidth InputLabelProps={{ shrink: true }} required={rentChanged} helperText="Required when the rental amount or terms change" /></Grid>
            <Grid item xs={12}><TextField label="Rental terms" value={form.paymentTerms} onChange={(event) => set({ paymentTerms: event.target.value })} fullWidth multiline minRows={2} /></Grid>
          </Grid>
        </Section>

        <Section title="Property charges">
          <Typography sx={{ color: '#5c6b73', mb: 2 }}>These settings tell Bills & Levies what should be charged in future. Saving them does not create a bill and does not change bills already recorded.</Typography>
          <Stack spacing={1.5}>
            {form.charges.map((charge, index) => (
              <Grid container spacing={1.5} key={charge.chargeId || index} alignItems="center">
                <Grid item xs={12} md={3}><TextField label="Description" value={charge.description} onChange={(event) => {
                  const charges = [...form.charges];
                  charges[index] = { ...charge, description: event.target.value };
                  set({ charges });
                }} fullWidth /></Grid>
                <Grid item xs={6} md={2}>
                  <TextField select label="Category" value={charge.category} onChange={(event) => {
                    const charges = [...form.charges];
                    charges[index] = { ...charge, category: event.target.value };
                    set({ charges });
                  }} fullWidth>
                    {CHARGE_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}><TextField label="Amount" type="number" value={charge.amount} onChange={(event) => {
                  const charges = [...form.charges];
                  charges[index] = { ...charge, amount: event.target.value };
                  set({ charges });
                }} fullWidth /></Grid>
                <Grid item xs={6} md={1}><TextField label="Currency" value={charge.currency} onChange={(event) => {
                  const charges = [...form.charges];
                  charges[index] = { ...charge, currency: event.target.value.toUpperCase() };
                  set({ charges });
                }} fullWidth /></Grid>
                <Grid item xs={6} md={2}>
                  <TextField select label="Frequency" value={charge.frequency} onChange={(event) => {
                    const charges = [...form.charges];
                    charges[index] = { ...charge, frequency: event.target.value };
                    set({ charges });
                  }} fullWidth>
                    {FREQUENCIES.filter(([value]) => value !== 'weekly').map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={2}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <TextField label="Effective" type="date" value={charge.effectiveFrom} onChange={(event) => {
                      const charges = [...form.charges];
                      charges[index] = { ...charge, effectiveFrom: event.target.value };
                      set({ charges });
                    }} fullWidth InputLabelProps={{ shrink: true }} />
                    <IconButton aria-label="Remove charge" onClick={() => set({ charges: form.charges.filter((_, item) => item !== index) })}><Delete /></IconButton>
                  </Stack>
                </Grid>
              </Grid>
            ))}
            <Button startIcon={<Add />} onClick={() => set({ charges: [...form.charges, emptyCharge(form.currency)] })} sx={{ alignSelf: 'flex-start' }}>Add charge</Button>
          </Stack>
        </Section>

        <Section title="Property features">
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}><TextField label="Bedrooms" type="number" value={form.bedrooms} onChange={(event) => set({ bedrooms: event.target.value })} fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="Bathrooms" type="number" value={form.bathrooms} onChange={(event) => set({ bathrooms: event.target.value })} fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="Parking spaces" type="number" value={form.parkingSpaces} onChange={(event) => set({ parkingSpaces: event.target.value })} fullWidth /></Grid>
            <Grid item xs={6} md={3}><TextField label="Floor area" type="number" value={form.area} onChange={(event) => set({ area: event.target.value })} fullWidth /></Grid>
            <Grid item xs={12}><TextField label="Features" value={form.amenities} onChange={(event) => set({ amenities: event.target.value })} fullWidth helperText="Separate features with commas" /></Grid>
          </Grid>
        </Section>

        <Section title="Financial settings">
          <Typography sx={{ color: '#5c6b73' }}>
            Currency is the setting used for new rent and charges. VAT treatment and rental tax treatment stay on the property Tax tab, so this page does not recalculate tax.
            Agency commission settings are not part of an individual owner property.
          </Typography>
          <Button sx={{ mt: 1.5 }} component={RouterLink} to={workspacePath(`/individual-dashboard/properties/${propertyId}`)}>Open tax settings on the property</Button>
        </Section>

        <Section title="Documents">
          <Typography sx={{ color: '#5c6b73', mb: 1.5 }}>Property documents stay in the existing files area.</Typography>
          <Button variant="outlined" component={RouterLink} to={workspacePath(`/individual-dashboard/files?propertyId=${propertyId}`)}>Manage property documents</Button>
        </Section>

        {reviewing && (
          <Alert severity="info">
            <Typography fontWeight={700}>Review changes</Typography>
            {changes.length ? changes.map((line) => <Typography key={line}>{line}</Typography>) : <Typography>No changes to save.</Typography>}
          </Alert>
        )}

        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" onClick={() => navigate(workspacePath(`/individual-dashboard/properties/${propertyId}`))} disabled={saving}>Cancel</Button>
          {!reviewing && <Button variant="contained" disabled={saving || !changes.length} onClick={() => setReviewing(true)} sx={{ bgcolor: INDIVIDUAL_THEME.primary }}>Review changes</Button>}
          {reviewing && <Button variant="contained" disabled={saving || !changes.length} onClick={save} sx={{ bgcolor: INDIVIDUAL_THEME.primary }}>{saving ? 'Saving…' : 'Save property'}</Button>}
        </Stack>
      </Stack>
    </PageShell>
  );
}

export default EditPropertyPage;
