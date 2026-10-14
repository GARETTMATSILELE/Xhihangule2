import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { isDemoMode, notifyDemoBlocked } from '../../../demo/demoMode';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { INDIVIDUAL_THEME } from '../theme';
import { TAX_DISCLAIMER, type PropertyTaxProfile, type RentalTaxRegime } from '../tax/types';

type Props = { propertyId: string };

export function PropertyTaxProfileForm({ propertyId }: Props) {
  const [profile, setProfile] = useState<PropertyTaxProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    individualWorkspaceService.getPropertyTaxProfile(propertyId)
      .then((data: PropertyTaxProfile) => { if (!cancelled) setProfile(data); })
      .catch((err: { message?: string }) => { if (!cancelled) setError(err?.message || 'Unable to load property tax profile'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId]);

  const update = (patch: Partial<PropertyTaxProfile>) => {
    setSaved(false);
    setProfile((prev: PropertyTaxProfile | null) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!profile) return;
    if (isDemoMode()) {
      notifyDemoBlocked();
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const next = await individualWorkspaceService.updatePropertyTaxProfile(propertyId, profile);
      setProfile(next);
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to save property tax profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography color="text.secondary">Loading property tax profile…</Typography>;
  if (!profile) return <Alert severity="error">{error || 'Property tax profile not found'}</Alert>;

  return (
    <Stack spacing={2}>
      <Alert severity="info">{profile.disclaimer || TAX_DISCLAIMER}</Alert>
      {profile.reviewRequired && (
        <Alert severity="warning">
          Review required: {(profile.reviewReasons || []).join(', ') || 'classification incomplete'}.
          Missing classification is not treated as VAT = 0.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">Property tax profile saved. Historical amounts were not rewritten.</Alert>}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            fullWidth
            label="Use class"
            value={profile.propertyUseClass || ''}
            onChange={(e) => update({ propertyUseClass: e.target.value || null })}
          >
            <MenuItem value="">Not classified</MenuItem>
            <MenuItem value="RESIDENTIAL_DWELLING">Residential dwelling</MenuItem>
            <MenuItem value="COMMERCIAL">Commercial</MenuItem>
            <MenuItem value="MIXED_USE">Mixed-use</MenuItem>
            <MenuItem value="SHORT_TERM_ACCOMMODATION">Short-term accommodation</MenuItem>
            <MenuItem value="OTHER_SERVICE">Other</MenuItem>
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            fullWidth
            label="VAT supply treatment"
            value={profile.vatSupplyTreatment || 'ACCOUNTANT_REVIEW'}
            onChange={(e) => update({ vatSupplyTreatment: e.target.value })}
          >
            <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
            <MenuItem value="EXEMPT">Exempt</MenuItem>
            <MenuItem value="STANDARD_TAXABLE">Standard taxable</MenuItem>
            <MenuItem value="ZERO_RATED">Zero-rated</MenuItem>
            <MenuItem value="OUT_OF_SCOPE">Out of scope</MenuItem>
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="VAT effective from"
            value={profile.vatEffectiveFrom || ''}
            onChange={(e) => update({ vatEffectiveFrom: e.target.value || null })}
            InputLabelProps={{ shrink: true }}
            helperText="Required when changing VAT treatment. Historical transactions keep their snapshot."
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="VAT effective to"
            value={profile.vatEffectiveTo || ''}
            onChange={(e) => update({ vatEffectiveTo: e.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            fullWidth
            label="Rental tax treatment"
            value={profile.rentalTaxTreatment || 'ACCOUNTANT_REVIEW'}
            onChange={(e) => update({ rentalTaxTreatment: e.target.value as RentalTaxRegime })}
          >
            <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
            <MenuItem value="SELF_ASSESSMENT">Self-assessment</MenuItem>
            <MenuItem value="PRESUMPTIVE_RENTAL">Presumptive rental</MenuItem>
            <MenuItem value="EXEMPT">Exempt</MenuItem>
            <MenuItem value="NOT_APPLICABLE">Not applicable</MenuItem>
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="Rental tax effective from"
            value={profile.rentalTaxEffectiveFrom || ''}
            onChange={(e) => update({ rentalTaxEffectiveFrom: e.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="number"
            label="Ownership %"
            value={profile.ownershipPercentage ?? 100}
            onChange={(e) => update({ ownershipPercentage: Number(e.target.value) })}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="Acquisition date"
            value={profile.acquisitionDate || ''}
            onChange={(e) => update({ acquisitionDate: e.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="number"
            label="Acquisition cost"
            value={profile.acquisitionCost ?? ''}
            onChange={(e) => update({ acquisitionCost: e.target.value === '' ? null : Number(e.target.value) })}
            helperText="No automatic capital allowances are calculated from this figure."
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="number"
            label="Improvement cost"
            value={profile.improvementCost ?? ''}
            onChange={(e) => update({ improvementCost: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Tax notes"
            value={profile.taxNotes || ''}
            onChange={(e) => update({ taxNotes: e.target.value })}
          />
        </Grid>
      </Grid>
      <Button
        variant="contained"
        onClick={handleSave}
        disabled={saving}
        sx={{ bgcolor: INDIVIDUAL_THEME.primary, alignSelf: 'flex-start' }}
      >
        {saving ? 'Saving…' : 'Save property tax profile'}
      </Button>
    </Stack>
  );
}

export default PropertyTaxProfileForm;
