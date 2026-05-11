import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Grid,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  Chip
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import api from '../../api/axios';
import { useNavigate } from 'react-router-dom';

interface AccountRow {
  _id: string;
  propertyId: string;
  ledgerType?: 'rental' | 'sale' | string;
  propertyName?: string;
  propertyAddress?: string;
  ownerId?: string;
  ownerName?: string;
  balance?: number;
  runningBalance?: number;
  totalIncome?: number;
  totalExpenses?: number;
}

const PropertyAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const { company } = useCompany();
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'rental' | 'sale'>('all');
  const navigate = useNavigate();

  const loadAccounts = async () => {
    const res = await api.get('/accountants/property-accounts');
    return Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
  };

  const handleSyncAccounts = async () => {
    try {
      setSyncing(true);
      setError(null);
      await api.post('/accountants/property-accounts/sync');
      const syncedData = await loadAccounts();
      setRows(syncedData);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to sync property accounts');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        // Company-scoped property accounts list
        let data = await loadAccounts();
        // If none found, try syncing accounts from payments and retry once
        if ((!data || data.length === 0)) {
          try {
            await api.post('/accountants/property-accounts/sync');
            data = await loadAccounts();
          } catch {}
        }
        setRows(data);
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load property accounts');
      } finally {
        setLoading(false);
      }
    };
    if (user?.companyId && company?.plan === 'INDIVIDUAL') run();
    else setLoading(false);
  }, [user?.companyId, company?.plan]);

  const normalizeLedgerType = (type?: string): 'rental' | 'sale' => (
    String(type || '').toLowerCase() === 'sale' ? 'sale' : 'rental'
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const ledgerFiltered = ledgerFilter === 'all'
      ? rows
      : rows.filter((row) => normalizeLedgerType(row.ledgerType) === ledgerFilter);

    if (!q) return ledgerFiltered;
    return ledgerFiltered.filter((row) => {
      const haystack = [
        row.propertyName,
        row.propertyAddress,
        row.ownerName,
        row.propertyId,
        row.ledgerType
      ].map((v) => String(v ?? '').toLowerCase()).join(' ');
      return haystack.includes(q);
    });
  }, [rows, searchQuery, ledgerFilter]);

  const rentals = useMemo(
    () => filteredRows.filter((row) => normalizeLedgerType(row.ledgerType) !== 'sale'),
    [filteredRows]
  );
  const sales = useMemo(
    () => filteredRows.filter((row) => normalizeLedgerType(row.ledgerType) === 'sale'),
    [filteredRows]
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (company?.plan !== 'INDIVIDUAL') {
    return <Alert severity="info">Property accounts are available on the Individual plan only.</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Property Accounts</Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Search properties, owners, addresses"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ minWidth: 320, flex: 1 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {loading ? <CircularProgress size={18} /> : null}
              </InputAdornment>
            )
          }}
        />
        <ToggleButtonGroup
          size="small"
          color="primary"
          exclusive
          value={ledgerFilter}
          onChange={(_, val) => {
            if (val) setLedgerFilter(val);
          }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="rental">Rentals</ToggleButton>
          <ToggleButton value="sale">Sales</ToggleButton>
        </ToggleButtonGroup>
        <Button variant="outlined" onClick={handleSyncAccounts} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Setup / Sync Accounts'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {rows.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No property accounts found. Click "Setup / Sync Accounts" to initialize accounts from existing properties and payments.
        </Alert>
      )}

      <Grid container spacing={3}>
        {ledgerFilter === 'all' && rentals.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="h6">Rentals</Typography>
          </Grid>
        )}
        {(ledgerFilter === 'rental' ? rentals : ledgerFilter === 'sale' ? sales : rentals).map((row) => (
          <Grid item xs={12} md={6} lg={4} key={row._id}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 1 }}>
                  <Typography variant="h6">{row.propertyName || row.propertyId}</Typography>
                  <Chip
                    size="small"
                    label={normalizeLedgerType(row.ledgerType) === 'sale' ? 'Sale Ledger' : 'Rental Ledger'}
                    color={normalizeLedgerType(row.ledgerType) === 'sale' ? 'secondary' : 'primary'}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">{row.propertyAddress || ''}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {row.ownerName ? `Owner: ${row.ownerName}` : ''}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                  <Chip label={`Balance: $${Number(row.runningBalance ?? row.balance ?? 0).toLocaleString()}`} size="small" />
                  <Chip label={`Income: $${Number(row.totalIncome ?? 0).toLocaleString()}`} size="small" color="success" variant="outlined" />
                  <Chip label={`Expenses: $${Number(row.totalExpenses ?? 0).toLocaleString()}`} size="small" color="error" variant="outlined" />
                </Box>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => navigate(`/admin-dashboard/property-accounts/${row.propertyId}/ledger`)}>
                    View Ledger
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}

        {ledgerFilter === 'all' && sales.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mt: 1 }}>Sales</Typography>
          </Grid>
        )}
        {(ledgerFilter === 'rental' ? [] : ledgerFilter === 'sale' ? sales : sales).map((row) => (
          <Grid item xs={12} md={6} lg={4} key={row._id}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 1 }}>
                  <Typography variant="h6">{row.propertyName || row.propertyId}</Typography>
                  <Chip
                    size="small"
                    label={normalizeLedgerType(row.ledgerType) === 'sale' ? 'Sale Ledger' : 'Rental Ledger'}
                    color={normalizeLedgerType(row.ledgerType) === 'sale' ? 'secondary' : 'primary'}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">{row.propertyAddress || ''}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {row.ownerName ? `Owner: ${row.ownerName}` : ''}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                  <Chip label={`Balance: $${Number(row.runningBalance ?? row.balance ?? 0).toLocaleString()}`} size="small" />
                  <Chip label={`Income: $${Number(row.totalIncome ?? 0).toLocaleString()}`} size="small" color="success" variant="outlined" />
                  <Chip label={`Expenses: $${Number(row.totalExpenses ?? 0).toLocaleString()}`} size="small" color="error" variant="outlined" />
                </Box>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => navigate(`/admin-dashboard/property-accounts/${row.propertyId}/ledger`)}>
                    View Ledger
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {!loading && filteredRows.length === 0 && rows.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No property accounts match your current filters.
        </Alert>
      )}
    </Box>
  );
};

export default PropertyAccountsPage;




















