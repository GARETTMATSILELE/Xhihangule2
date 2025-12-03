import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Grid, CircularProgress, Box, Button, TextField, Chip, Alert, InputAdornment } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { propertyAccountService, PropertyAccount } from '../../services/propertyAccountService';

const PropertyAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<PropertyAccount[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const loadFirstPage = async (q: string) => {
    try {
      setLoading(true);
      setError(null);
      const { items, hasMore, nextPage } = await propertyAccountService.getCompanyPropertyAccountsPaged({ page: 1, limit: 24, search: q });
      setAccounts(items);
      setHasMore(Boolean(hasMore));
      setPage(nextPage || 2);
    } catch (err: any) {
      console.error('Error fetching property accounts:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load property accounts');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    try {
      setLoading(true);
      setError(null);
      const { items, hasMore, nextPage } = await propertyAccountService.getCompanyPropertyAccountsPaged({ page, limit: 24, search: debouncedSearch });
      setAccounts(prev => [...prev, ...items]);
      setHasMore(Boolean(hasMore));
      setPage(nextPage || (page + 1));
    } catch (err: any) {
      console.error('Error loading more property accounts:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load property accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    loadFirstPage(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const uniqueAccounts = useMemo(() => {
    const seen = new Set<string>();
    return accounts.filter(acc => {
      const idPart = acc.propertyId || acc._id;
      if (!idPart) return true;
      const key = `${String(idPart)}:${String(acc.ledgerType || '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return uniqueAccounts;
    return uniqueAccounts.filter(acc => {
      const hay = [
        acc.propertyName,
        acc.propertyAddress,
        acc.ownerName,
        acc.ledgerType,
        acc._id,
        acc.propertyId
      ].map(v => String(v ?? '')?.toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [uniqueAccounts, searchQuery]);

  const handleAccountClick = (acc: PropertyAccount) => {
    const isSale = acc.ledgerType === 'sale';
    navigate(`/accountant-dashboard/property-accounts/${acc.propertyId}${isSale ? '?ledger=sale' : ''}`);
  };

  const visibleAccounts = filteredAccounts;

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>Property Accounts</Typography>
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Search properties, owners, addresses"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {loading ? <CircularProgress size={18} /> : null}
              </InputAdornment>
            )
          }}
        />
      </Box>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>
          <Button size="small" variant="outlined" onClick={() => loadFirstPage(debouncedSearch)}>Retry</Button>
        </Box>
      )}
      <Grid container spacing={3}>
        {visibleAccounts.length === 0 && (
          <Grid item xs={12}>
            <Alert severity="info" sx={{ mb: 2 }}>
              No property accounts found. If you recently recorded payments, try syncing accounts.
            </Alert>
            <Button
              variant="contained"
              onClick={async () => {
                try {
                  setLoading(true);
                  await propertyAccountService.syncPropertyAccounts();
                  await loadFirstPage(debouncedSearch);
                } finally {
                  setLoading(false);
                }
              }}
            >
              Sync Accounts
            </Button>
          </Grid>
        )}
        {visibleAccounts.map((acc) => (
          <Grid item xs={12} md={6} lg={4} key={acc._id}>
            <Card sx={{ cursor: 'pointer' }} onClick={() => handleAccountClick(acc)}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">{acc.propertyName || acc.propertyId}</Typography>
                  <Chip
                    label={acc.ledgerType === 'sale' ? 'Sale Ledger' : 'Rental Ledger'}
                    color={acc.ledgerType === 'sale' ? 'secondary' : 'primary'}
                    size="small"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">{acc.propertyAddress || ''}</Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  <Chip label={`Balance: ${propertyAccountService.formatCurrency(acc.runningBalance)}`} size="small" />
                  <Chip label={`Income: ${propertyAccountService.formatCurrency(acc.totalIncome)}`} size="small" color="success" variant="outlined" />
                  <Chip label={`Expenses: ${propertyAccountService.formatCurrency(acc.totalExpenses)}`} size="small" color="error" variant="outlined" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
        {hasMore && (
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" disabled={loading} onClick={loadMore}>
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          </Grid>
        )}
      </Grid>
    </Box>
  );
  };
  
  export default PropertyAccountsPage; 