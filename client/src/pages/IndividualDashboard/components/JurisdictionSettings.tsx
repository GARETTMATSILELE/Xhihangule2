import React, { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { isDemoMode, notifyDemoBlocked } from '../../../demo/demoMode';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { INDIVIDUAL_THEME } from '../theme';
import { TAX_DISCLAIMER, type OwnerTaxProfile } from '../tax/types';
import { TaxProfileForm } from './TaxProfileForm';

const COUNTRIES = [
  { value: 'ZW', label: 'Zimbabwe' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'GLOBAL', label: 'Other country' }
];

const TAXES: Record<string, Array<{ id: string; label: string }>> = {
  ZW: [
    { id: 'NORMAL_INCOME_TAX', label: 'Normal income tax' },
    { id: 'PRESUMPTIVE_RENTAL', label: 'Presumptive rental income tax' },
    { id: 'VAT', label: 'VAT' }
  ],
  ZA: [
    { id: 'PERSONAL_INCOME_TAX', label: 'Personal income tax' },
    { id: 'PROVISIONAL_TAX', label: 'Provisional tax' },
    { id: 'VAT', label: 'VAT' },
    { id: 'TURNOVER_TAX', label: 'Turnover tax, if you qualify' }
  ],
  GLOBAL: [
    { id: 'PERSONAL_INCOME_TAX', label: 'Income tax' },
    { id: 'RENTAL_INCOME_TAX', label: 'Rental tax' },
    { id: 'VAT', label: 'VAT / GST' },
    { id: 'OTHER', label: 'Other configured taxes' }
  ]
};

export function JurisdictionSettings() {
  const [profile, setProfile] = useState<OwnerTaxProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    individualWorkspaceService.getTaxProfile()
      .then((data) => {
        const enabled = data.enabledTaxes?.length ? data.enabledTaxes : [
          ...(data.vatRegistered ? ['VAT'] : []),
          ...(data.rentalTaxRegime === 'PRESUMPTIVE_RENTAL' ? ['PRESUMPTIVE_RENTAL'] : []),
          ...(data.rentalTaxRegime === 'SELF_ASSESSMENT' || (data.incomeTaxRegistered && data.rentalTaxRegime !== 'PRESUMPTIVE_RENTAL') ? ['NORMAL_INCOME_TAX'] : [])
        ];
        setProfile({ ...data, enabledTaxes: enabled });
      })
      .catch((err) => setError(err?.message || 'Unable to load tax settings'));
  }, []);

  if (!profile) return <Typography color="text.secondary">{error || 'Loading tax settings…'}</Typography>;
  const jurisdiction = profile.taxJurisdiction || 'ZW';
  const options = TAXES[jurisdiction] || TAXES.GLOBAL;
  const enabled = new Set(profile.enabledTaxes || []);

  const update = (patch: Partial<OwnerTaxProfile>) => {
    setSaved(false);
    setProfile({ ...profile, ...patch });
  };

  const save = async () => {
    if (isDemoMode()) {
      notifyDemoBlocked();
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const next = await individualWorkspaceService.updateTaxProfile({
        countryOfResidence: profile.countryOfResidence,
        taxResidencyCountry: profile.taxResidencyCountry,
        taxResidence: profile.taxResidencyCountry,
        taxJurisdiction: profile.taxJurisdiction,
        preferredCurrency: profile.preferredCurrency,
        enabledTaxes: profile.enabledTaxes,
        saProfile: profile.saProfile,
        globalTaxes: profile.globalTaxes,
        rentalTaxRegime: profile.taxJurisdiction === 'ZW' && enabled.has('PRESUMPTIVE_RENTAL')
          ? 'PRESUMPTIVE_RENTAL'
          : profile.taxJurisdiction === 'ZW' && enabled.has('NORMAL_INCOME_TAX')
            ? 'SELF_ASSESSMENT'
            : profile.rentalTaxRegime,
        vatRegistered: enabled.has('VAT')
      });
      setProfile(next);
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to save tax settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info">{profile.disclaimer || TAX_DISCLAIMER} Changing country settings does not rewrite tax already stored on past transactions.</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">Tax settings saved. Historical tax snapshots were left as they were.</Alert>}
      {profile.taxResidencyCountry && profile.taxResidencyCountry !== 'ZW' && profile.taxJurisdiction === 'ZW' && (
        <Alert severity="warning">Tax residency and the Zimbabwe tax profile are different. Cross-border tax is flagged for review and is not calculated automatically.</Alert>
      )}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField select fullWidth label="Country of residence" value={profile.countryOfResidence || ''} onChange={(e) => update({ countryOfResidence: e.target.value })}>
            <MenuItem value="">Not set</MenuItem>
            {COUNTRIES.map((row) => <MenuItem key={row.value} value={row.value}>{row.label}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField select fullWidth label="Tax residency" value={profile.taxResidencyCountry || ''} onChange={(e) => update({ taxResidencyCountry: e.target.value })}>
            <MenuItem value="">Not set</MenuItem>
            {COUNTRIES.map((row) => <MenuItem key={row.value} value={row.value}>{row.label}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField select fullWidth label="Tax profile" value={jurisdiction} onChange={(e) => update({ taxJurisdiction: e.target.value as OwnerTaxProfile['taxJurisdiction'], enabledTaxes: [] })}>
            {COUNTRIES.map((row) => <MenuItem key={row.value} value={row.value}>{row.label}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField select fullWidth label="Preferred currency" value={profile.preferredCurrency || 'USD'} onChange={(e) => update({ preferredCurrency: e.target.value })}>
            {['USD', 'ZAR', 'EUR', 'GBP', 'ZWG'].map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
          </TextField>
        </Grid>
      </Grid>
      <Typography variant="body2" color="text.secondary">Property location is set on each property. It is kept separate from where you live and where you are tax resident.</Typography>
      <Typography fontWeight={700}>Taxes to include</Typography>
      {options.map((tax) => (
        <FormControlLabel
          key={tax.id}
          control={<Checkbox checked={enabled.has(tax.id)} onChange={(e) => {
            const next = new Set(enabled);
            if (e.target.checked) next.add(tax.id); else next.delete(tax.id);
            update({ enabledTaxes: Array.from(next) });
          }} />}
          label={tax.label}
        />
      ))}
      {jurisdiction === 'ZA' && (
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField select fullWidth label="Age" value={profile.saProfile?.ageCategory || ''} onChange={(e) => update({ saProfile: { ...profile.saProfile, ageCategory: e.target.value } })}>
              <MenuItem value="">Not set</MenuItem>
              <MenuItem value="UNDER_65">Under 65</MenuItem>
              <MenuItem value="AGE_65">65 to 74</MenuItem>
              <MenuItem value="AGE_75">75 or older</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth type="number" label="Other annual taxable income (optional)" value={profile.saProfile?.otherAnnualTaxableIncome ?? ''} onChange={(e) => update({ saProfile: { ...profile.saProfile, otherAnnualTaxableIncome: e.target.value === '' ? null : Number(e.target.value) } })} />
          </Grid>
        </Grid>
      )}
      {jurisdiction === 'GLOBAL' && (
        <Stack spacing={2}>
          <Alert severity="warning">Taxes you add for another country are marked User configured. Mantis has not verified those rates and does not invent one.</Alert>
          {(profile.globalTaxes || []).map((tax, index) => (
            <Grid container spacing={2} key={index}>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Tax name" value={tax.name || ''} onChange={(e) => {
                  const globalTaxes = [...(profile.globalTaxes || [])];
                  globalTaxes[index] = { ...tax, name: e.target.value, enabled: true, verified: false };
                  update({ globalTaxes });
                }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField select fullWidth label="Category" value={tax.category || 'OTHER'} onChange={(e) => {
                  const globalTaxes = [...(profile.globalTaxes || [])];
                  globalTaxes[index] = { ...tax, category: e.target.value };
                  update({ globalTaxes });
                }}>
                  {['PERSONAL_INCOME_TAX', 'RENTAL_INCOME_TAX', 'PRESUMPTIVE_RENTAL_TAX', 'PROPERTY_TAX', 'VAT', 'GST', 'SALES_TAX', 'WITHHOLDING_TAX', 'OTHER'].map((item) => <MenuItem key={item} value={item}>{item.replace(/_/g, ' ')}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField fullWidth type="number" label="Rate %" value={tax.rate ?? ''} onChange={(e) => {
                  const globalTaxes = [...(profile.globalTaxes || [])];
                  globalTaxes[index] = { ...tax, rate: e.target.value === '' ? null : Number(e.target.value) };
                  update({ globalTaxes });
                }} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField select fullWidth label="Method" value={tax.method || 'PERCENT_OF_NET'} onChange={(e) => {
                  const globalTaxes = [...(profile.globalTaxes || [])];
                  globalTaxes[index] = { ...tax, method: e.target.value };
                  update({ globalTaxes });
                }}>
                  <MenuItem value="PERCENT_OF_GROSS">Gross income</MenuItem>
                  <MenuItem value="PERCENT_OF_NET">Net profit</MenuItem>
                  <MenuItem value="FIXED">Fixed amount</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          ))}
          <Button onClick={() => update({ globalTaxes: [...(profile.globalTaxes || []), { name: '', category: 'RENTAL_INCOME_TAX', rate: null, method: 'PERCENT_OF_NET', enabled: true }] })}>Add a tax</Button>
        </Stack>
      )}
      <Button variant="contained" disabled={saving} onClick={save} sx={{ bgcolor: INDIVIDUAL_THEME.primary, alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : 'Save tax settings'}
      </Button>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography>Advanced tax settings</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TaxProfileForm />
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}

export default JurisdictionSettings;
