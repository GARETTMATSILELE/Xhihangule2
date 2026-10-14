import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';
import { ErrorState, LoadingState, PageHeader } from './common';

type VatRule = {
  id: string;
  jurisdiction: string;
  rate: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: string;
  version: number;
  sourceReference: string;
  notes?: string | null;
};

const VatRatesPage: React.FC = () => {
  const [rows, setRows] = useState<VatRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState('ZW');
  const [rate, setRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [notes, setNotes] = useState('');

  const load = async (code = jurisdiction) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await systemAdminService.listVatRates(code);
      setRows(Array.isArray(resp?.data) ? resp.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load VAT rates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load('ZW'); }, []);

  const today = new Date();
  const current = rows.find((row) => {
    const from = new Date(row.effectiveFrom);
    const to = row.effectiveTo ? new Date(row.effectiveTo) : null;
    return row.status === 'ACTIVE' && from <= today && (!to || to >= today);
  });

  const save = async () => {
    setError(null);
    setMessage(null);
    try {
      await systemAdminService.createVatRate({
        jurisdiction,
        rate: Number(rate),
        effectiveFrom,
        sourceReference,
        notes
      });
      setMessage('VAT rate saved. Existing posted transactions were not changed.');
      setRate('');
      setNotes('');
      await load(jurisdiction);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save VAT rate');
    }
  };

  return (
    <Box>
      <PageHeader
        title="VAT rates"
        subtitle="Central standard VAT rates for Mantis. Companies cannot set their own national rate."
      />
      <ErrorState error={error} />
      {message && <Typography sx={{ mb: 2 }} color="success.main">{message}</Typography>}
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb', mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Currently effective</Typography>
          <Typography>
            {current
              ? `${current.jurisdiction} ${Number(current.rate)}% from ${new Date(current.effectiveFrom).toLocaleDateString()}`
              : 'No rate is effective today for this jurisdiction.'}
          </Typography>
          <Typography variant="body2" color="text.secondary">Rate source: Centrally managed by Mantis</Typography>
        </CardContent>
      </Card>
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb', mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Add a future or new effective rate</Typography>
          <Stack spacing={2}>
            <TextField select size="small" label="Jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
              <MenuItem value="ZW">Zimbabwe (ZW)</MenuItem>
            </TextField>
            <TextField size="small" label="Rate (%)" type="number" value={rate} onChange={(e) => setRate(e.target.value)} inputProps={{ min: 0, step: 0.1 }} />
            <TextField size="small" label="Effective from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" label="Source or legal reference" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} required />
            <TextField size="small" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
            <Button variant="contained" onClick={save} disabled={!rate || !effectiveFrom || !sourceReference}>Save rate</Button>
          </Stack>
        </CardContent>
      </Card>
      {loading ? <LoadingState /> : (
        <Stack spacing={1}>
          {rows.map((row) => (
            <Card key={`${row.version}-${row.effectiveFrom}`} sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
              <CardContent>
                <Typography sx={{ fontWeight: 700 }}>{row.jurisdiction} VAT {Number(row.rate)}% · version {row.version}</Typography>
                <Typography variant="body2">
                  {new Date(row.effectiveFrom).toLocaleDateString()}
                  {row.effectiveTo ? ` to ${new Date(row.effectiveTo).toLocaleDateString()}` : ' — open'}
                  {` · ${row.status}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">{row.sourceReference}</Typography>
                {row.notes && <Typography variant="body2" color="text.secondary">{row.notes}</Typography>}
              </CardContent>
            </Card>
          ))}
          {rows.length === 0 && <Typography color="text.secondary">No VAT rates are configured.</Typography>}
        </Stack>
      )}
    </Box>
  );
};

export default VatRatesPage;
