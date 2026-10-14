import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, TextField, Typography } from '@mui/material';
import api from '../../api/axios';

export const AgencyPropertyWorkflow: React.FC<{ propertyId: string }> = ({ propertyId }) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recommendedRent, setRecommendedRent] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [platform, setPlatform] = useState('');
  const [listingUrl, setListingUrl] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/agents/letting/properties/${propertyId}/workspace`)
      .then((res) => {
        setData(res.data?.data);
        setError('');
      })
      .catch((err) => setError(err?.response?.data?.message || 'The property workflow could not be loaded'))
      .finally(() => setLoading(false));
  }, [propertyId]);
  useEffect(() => { load(); }, [load]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The workflow action was not saved');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <CircularProgress size={24} sx={{ mb: 2 }} />;
  if (!data && error) return <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>;
  if (!data) return null;

  const assessmentLabel = data.assessment?.status === 'OWNER_REJECTED' ? 'changes requested' : (data.assessment?.status || 'not started');

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Agency workflow</Typography>
        <Typography sx={{ my: 1 }}>Next action: {data.nextAction}</Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Chip label={`Assessment ${assessmentLabel}`} />
          <Chip label={`Mandate ${data.mandate?.status || 'not started'}`} />
          <Chip label={`Listings ${data.listings?.length || 0}`} />
          <Chip label={`Applications ${data.applications?.length || 0}`} />
          <Chip label={`Viewings ${data.viewings?.length || 0}`} />
        </Box>
        {!data.assessment && (
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField size="small" label="Recommended rent" value={recommendedRent} onChange={(e) => setRecommendedRent(e.target.value)} />
            <Button variant="contained" disabled={!recommendedRent || busy} onClick={() => run(async () => {
              await api.post('/agents/letting/assessments', { propertyId, recommendedRent: Number(recommendedRent), condition: 'Recorded by agent' });
              setRecommendedRent('');
            })}>Record assessment</Button>
          </Box>
        )}
        {data.assessment?.status === 'ASSESSMENT_DRAFT' && (
          <Button variant="contained" disabled={busy} sx={{ mr: 1 }} onClick={() => {
            if (!window.confirm('Submit this assessment to the landlord?')) return;
            run(() => api.post(`/agents/letting/assessments/${data.assessment._id}/status`, { status: 'ASSESSMENT_SUBMITTED' }));
          }}>Submit for owner review</Button>
        )}
        {data.assessment?.status === 'OWNER_APPROVED' && data.mandate?.status !== 'SIGNED' && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 1 }}>
            <TextField size="small" label="Signed mandate document URL" value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} sx={{ minWidth: 280 }} />
            <Button variant="contained" disabled={!documentUrl || busy} onClick={() => {
              if (!window.confirm('Record this document as the signed mandate? This does not verify an electronic signature.')) return;
              run(async () => {
                const created = data.mandate?._id
                  ? { data: { data: data.mandate } }
                  : await api.post('/agents/letting/mandates', { propertyId, documentUrl });
                const mandateId = created.data?.data?._id;
                if (data.mandate?.status !== 'SENT' && data.mandate?.status !== 'SIGNED') {
                  await api.post(`/agents/letting/mandates/${mandateId}/status`, { status: 'SENT', documentUrl });
                }
                await api.post(`/agents/letting/mandates/${mandateId}/status`, { status: 'SIGNED', documentUrl });
                setDocumentUrl('');
              });
            }}>Record signed mandate</Button>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 1 }}>
          <TextField size="small" label="Advertising platform" value={platform} onChange={(e) => setPlatform(e.target.value)} />
          <TextField size="small" label="Listing URL or reference" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} />
          <Button variant="outlined" disabled={!platform || busy} onClick={() => run(async () => {
            await api.post('/agents/letting/listings', { propertyId, platform, url: listingUrl, status: 'PRE_LISTING' });
            setPlatform('');
            setListingUrl('');
          })}>Record external listing</Button>
        </Box>
        {(data.listings || []).map((listing: any) => (
          <Typography key={listing._id} variant="body2">
            {listing.platform}: {listing.status} {listing.url || listing.reference || ''}
            {listing.status !== 'REMOVED' && (
              <Button size="small" disabled={busy} onClick={() => run(() => api.post(`/agents/letting/listings/${listing._id}/status`, { status: 'REMOVED' }))}>Mark inactive</Button>
            )}
          </Typography>
        ))}
        {(data.applications || []).slice(0, 8).map((application: any) => (
          <Typography key={application._id} variant="body2">
            Application {application.snapshot?.fullName || application.snapshot?.name || 'applicant'} · {application.status}
          </Typography>
        ))}
        <Typography variant="body2" sx={{ mt: 1 }}>
          Owner amounts stay on the property statement. This panel does not calculate a second owner balance.
        </Typography>
      </CardContent>
    </Card>
  );
};
