import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import { isDemoMode, notifyDemoBlocked } from '../../../demo/demoMode';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { INDIVIDUAL_THEME } from '../theme';
import { TAX_DISCLAIMER, type OwnerTaxProfile, type TaxpayerType } from '../tax/types';
import { TaxPeriodsPanel } from './TaxPeriodsPanel';

const emptyProfile = (): OwnerTaxProfile => ({
  companyId: '',
  taxpayerType: 'INDIVIDUAL',
  legalName: '',
  tradingName: '',
  nationalIdOrCompanyRegistrationReference: '',
  tin: '',
  vatRegistered: false,
  vatNumber: '',
  vatRegistrationDate: null,
  vatRegistrationCancelledAt: null,
  vatCategory: '',
  incomeTaxRegistered: false,
  incomeTaxRegistrationDate: null,
  rentalTaxRegime: 'ACCOUNTANT_REVIEW',
  rentalTaxRegistrationDate: null,
  taxResidence: 'ZW',
  taxYearStartMonth: 1,
  accountantName: '',
  accountantContact: '',
  taxNotes: '',
  rentalTaxRegimeInferredFromWorkspace: false
});

export function TaxProfileForm() {
  const [profile, setProfile] = useState<OwnerTaxProfile>(emptyProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    individualWorkspaceService.getTaxProfile()
      .then((data: OwnerTaxProfile) => { if (!cancelled) setProfile({ ...emptyProfile(), ...data }); })
      .catch((err: { message?: string }) => { if (!cancelled) setError(err?.message || 'Unable to load tax profile'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const update = (patch: Partial<OwnerTaxProfile>) => {
    setSaved(false);
    setProfile((prev: OwnerTaxProfile) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    if (isDemoMode()) {
      notifyDemoBlocked();
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const next = await individualWorkspaceService.updateTaxProfile(profile);
      setProfile({ ...emptyProfile(), ...next });
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to save tax profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography color="text.secondary">Loading tax profile…</Typography>;

  return (
    <Stack spacing={2} sx={{ maxWidth: 760 }}>
      <Alert severity="info">{profile.disclaimer || TAX_DISCLAIMER}</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">Tax profile saved. Historical transactions were not changed.</Alert>}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            fullWidth
            label="Taxpayer type"
            value={profile.taxpayerType}
            onChange={(e) => update({ taxpayerType: e.target.value as TaxpayerType })}
          >
            <MenuItem value="INDIVIDUAL">Individual</MenuItem>
            <MenuItem value="COMPANY">Company</MenuItem>
            <MenuItem value="TRUST">Trust</MenuItem>
            <MenuItem value="OTHER">Other</MenuItem>
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            fullWidth
            label="Rental tax regime"
            value={profile.rentalTaxRegime}
            onChange={(e) => update({ rentalTaxRegime: e.target.value as OwnerTaxProfile['rentalTaxRegime'] })}
            helperText="Do not guess. Leave Accountant review unless registration/history is known."
          >
            <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
            <MenuItem value="SELF_ASSESSMENT">Self-assessment</MenuItem>
            <MenuItem value="PRESUMPTIVE_RENTAL">Presumptive rental income tax</MenuItem>
            <MenuItem value="EXEMPT">Exempt</MenuItem>
            <MenuItem value="NOT_APPLICABLE">Not applicable</MenuItem>
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="Legal name" value={profile.legalName} onChange={(e) => update({ legalName: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="Trading name" value={profile.tradingName} onChange={(e) => update({ tradingName: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="TIN" value={profile.tin} onChange={(e) => update({ tin: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="National ID / company registration"
            value={profile.nationalIdOrCompanyRegistrationReference}
            onChange={(e) => update({ nationalIdOrCompanyRegistrationReference: e.target.value })}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControlLabel
            control={<Switch checked={profile.vatRegistered} onChange={(e) => update({ vatRegistered: e.target.checked })} />}
            label="VAT registered"
          />
        </Grid>
        <Grid item xs={12}>
          <Alert severity="info">
            Rental tax regime: {profile.rentalTaxRegime.replace(/_/g, ' ')}. Presumptive rental tax is calculated only when this is Presumptive rental. Self-assessment uses the ordinary income-tax working paper. Open Finance → Rental Tax or Finance → Income Tax.
          </Alert>
        </Grid>
        <Grid item xs={12}>
          <Alert severity="info">
            Ordinary income tax is a working-paper calculation from accounting profit and tax classifications. It is not PAYE and not a ZIMRA assessment. Income-tax registration: {profile.incomeTaxRegistered ? 'Registered' : 'Not registered'}.
          </Alert>
        </Grid>
        <Grid item xs={12}>
          <Alert severity="info">
            VAT status: {profile.vatRegistered ? 'Registered' : 'Not registered'}.
            Registration is taken from this landlord tax profile, not from the property use class.
          </Alert>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="VAT number" value={profile.vatNumber} onChange={(e) => update({ vatNumber: e.target.value })} disabled={!profile.vatRegistered} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="VAT registration date"
            value={profile.vatRegistrationDate || ''}
            onChange={(e) => update({ vatRegistrationDate: e.target.value || null })}
            InputLabelProps={{ shrink: true }}
            disabled={!profile.vatRegistered}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="VAT deregistration date"
            value={profile.vatRegistrationCancelledAt || ''}
            onChange={(e) => update({ vatRegistrationCancelledAt: e.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="VAT category" value={profile.vatCategory} onChange={(e) => update({ vatCategory: e.target.value })} disabled={!profile.vatRegistered} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="Rental tax registration date"
            value={profile.rentalTaxRegistrationDate || ''}
            onChange={(e) => update({ rentalTaxRegistrationDate: e.target.value || null })}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControlLabel
            control={<Switch checked={profile.incomeTaxRegistered} onChange={(e) => update({ incomeTaxRegistered: e.target.checked })} />}
            label="Income tax registered"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="Income tax registration date"
            value={profile.incomeTaxRegistrationDate || ''}
            onChange={(e) => update({ incomeTaxRegistrationDate: e.target.value || null })}
            InputLabelProps={{ shrink: true }}
            disabled={!profile.incomeTaxRegistered}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            fullWidth
            label="Tax year start month"
            value={profile.taxYearStartMonth}
            onChange={(e) => update({ taxYearStartMonth: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <MenuItem key={i + 1} value={i + 1}>{new Date(2026, i, 1).toLocaleString('en', { month: 'long' })}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="Accountant name" value={profile.accountantName} onChange={(e) => update({ accountantName: e.target.value })} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField fullWidth label="Accountant contact" value={profile.accountantContact} onChange={(e) => update({ accountantContact: e.target.value })} />
        </Grid>
        <Grid item xs={12}>
          <TextField fullWidth multiline minRows={3} label="Tax notes" value={profile.taxNotes} onChange={(e) => update({ taxNotes: e.target.value })} />
        </Grid>
      </Grid>
      <Button
        variant="contained"
        onClick={handleSave}
        disabled={saving}
        sx={{ bgcolor: INDIVIDUAL_THEME.primary, alignSelf: 'flex-start' }}
      >
        {saving ? 'Saving…' : 'Save tax profile'}
      </Button>
      <TaxPeriodsPanel />
    </Stack>
  );
}

export default TaxProfileForm;
