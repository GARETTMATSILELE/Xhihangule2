import React, { useEffect, useState } from 'react';
import { Alert, Box, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import api from '../../api/axios';

function money(value: unknown, currency?: string | null) {
  if (value === null || value === undefined) return '—';
  return currency ? `${currency} ${value}` : String(value);
}

export const RentCollectionPage: React.FC<{ apiBase?: string }> = ({ apiBase = '/agents' }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`${apiBase}/letting/rent-board`)
      .then((res) => setRows(res.data?.data || []))
      .catch((err) => setError(err?.response?.data?.message || 'The rent board could not be loaded'))
      .finally(() => setLoading(false));
  }, [apiBase]);
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>Rent collection</Typography>
      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && rows.length === 0 && <Typography>No active leases are on this month's rent board.</Typography>}
      {rows.map((row) => (
        <Card key={row.leaseId} sx={{ mb: 1 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 700 }}>
              {row.mixedCurrency ? 'Currencies differ' : String(row.status || '').replace(/_/g, ' ')}
            </Typography>
            <Typography variant="body2">{row.propertyName || 'Property'} · {row.tenantName || 'Tenant'}</Typography>
            <Typography variant="body2">
              Rent {money(row.rent, row.currency)} · Received {money(row.received, row.currency)} · Outstanding {money(row.outstanding, row.currency)}
            </Typography>
            {row.mixedCurrency && <Typography variant="body2">Amounts in different currencies are not combined.</Typography>}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

export const AgencySearchPage: React.FC = () => {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const search = (value: string) => {
    setQ(value);
    if (value.trim().length < 2) { setRows([]); setError(''); return; }
    api.get('/agents/letting/search', { params: { q: value } })
      .then((res) => { setRows(res.data?.data || []); setError(''); })
      .catch((err) => setError(err?.response?.data?.message || 'Search could not be completed'));
  };
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>Search</Typography>
      <input value={q} onChange={(e) => search(e.target.value)} placeholder="Property name" style={{ padding: 8, width: 320 }} />
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {!error && q.trim().length >= 2 && rows.length === 0 && <Typography sx={{ mt: 2 }}>No matching records in this portfolio.</Typography>}
      {rows.map((row) => <Typography key={String(row.id)} sx={{ mt: 1 }}>{row.type}: {row.label}</Typography>)}
    </Box>
  );
};

const PORTFOLIO_LABELS: Record<string, string> = {
  properties: 'Properties',
  propertiesAwaitingAssessment: 'Awaiting assessment',
  assessmentsAwaitingOwner: 'Assessments awaiting the landlord',
  mandatesAwaitingSignature: 'Mandates awaiting signature',
  listingsAwaitingCompletion: 'Listing references not yet active',
  applicationsAwaitingReview: 'Applications awaiting review',
  shortlistsAwaitingOwner: 'Shortlists awaiting the landlord',
  leasesAwaitingSignature: 'Leases awaiting a signature',
  rentRequiringCollection: 'Rent due, overdue, or partial',
  maintenancePaymentsAwaitingAccounting: 'Maintenance requests awaiting accounting',
  leviesAwaitingReceipt: 'Levies without a receipt number',
};

export const SeniorPortfolioPage: React.FC<{ apiBase?: string }> = ({ apiBase = '/agents' }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`${apiBase}/letting/portfolio`)
      .then((res) => setData(res.data?.data))
      .catch((err) => setError(err?.response?.data?.message || 'Portfolio oversight is not available for this login'))
      .finally(() => setLoading(false));
  }, [apiBase]);
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>Portfolio oversight</Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>These counts come from the server for the portfolio this login is allowed to see.</Typography>
      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="warning">{error}</Alert>}
      {data && Object.entries(PORTFOLIO_LABELS).map(([key, label]) => (
        <Typography key={key}>{label}: {data[key] ?? 0}</Typography>
      ))}
    </Box>
  );
};
