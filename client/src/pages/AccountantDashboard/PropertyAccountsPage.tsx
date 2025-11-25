import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Grid, CircularProgress, Box, Button, TextField, Chip, Alert } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { propertyAccountService, PropertyAccount } from '../../services/propertyAccountService';

const PropertyAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<PropertyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await propertyAccountService.getCompanyPropertyAccounts();
      setAccounts(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.error('Error fetching property accounts:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load property accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(acc => {
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
  }, [accounts, searchQuery]);

  const handleAccountClick = (acc: PropertyAccount) => {
    const isSale = acc.ledgerType === 'sale';
    navigate(`/accountant-dashboard/property-accounts/${acc.propertyId}${isSale ? '?ledger=sale' : ''}`);
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px"><CircularProgress /></Box>;
  }
  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="outlined" onClick={loadAccounts}>Retry</Button>
      </Box>
    );
  }

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
        />
      </Box>
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
                  await loadAccounts();
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
      </Grid>
    </Box>
  );
  };
  
  export default PropertyAccountsPage; 