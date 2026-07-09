import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import agencyOperationsService from '../../services/agencyOperationsService';
import { MunicipalBillsOverview } from '../../types/agencyOperations';
import { KpiCard, SectionCard } from '../../components/admin/dashboard/OperationsPrimitives';
import { Receipt, WarningAmber, AccountBalance } from '@mui/icons-material';

const AdminMunicipalBillsPage: React.FC = () => {
  const [data, setData] = useState<MunicipalBillsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await agencyOperationsService.getMunicipalBillsOverview();
      setData(result);
    } catch (e: any) {
      setError(e?.message || 'Failed to load municipal bills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 6 }} />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return null;

  const { summary, properties } = data;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Municipal Bills Management</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        City rates, water, refuse, electricity, levies, CID charges, and insurance tracking
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="Total Outstanding" value={`$${summary.totalOutstanding.toLocaleString()}`} icon={<Receipt />} color="#EF4444" severity="critical" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="Properties in Arrears" value={summary.propertiesInArrears} icon={<WarningAmber />} color="#F59E0B" severity="warning" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="Due This Month" value={summary.billsDueThisMonth} icon={<AccountBalance />} color="#3B82F6" severity="info" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="Overdue Accounts" value={summary.overdueAccounts} icon={<WarningAmber />} color="#EF4444" severity="critical" />
        </Grid>
      </Grid>

      <SectionCard title="Property Municipal Accounts">
        {properties.length === 0 ? (
          <Typography color="text.secondary">No properties configured for municipal billing.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Property</TableCell>
                <TableCell align="right">Current Balance</TableCell>
                <TableCell align="right">Outstanding</TableCell>
                <TableCell>Due Date</TableCell>
                <TableCell>Last Payment</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {properties.map((p) => (
                <TableRow key={p.propertyId}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.propertyName}</Typography>
                    <Typography variant="caption" color="text.secondary">{p.address}</Typography>
                  </TableCell>
                  <TableCell align="right">${p.currentBalance.toLocaleString()}</TableCell>
                  <TableCell align="right">${p.outstandingBalance.toLocaleString()}</TableCell>
                  <TableCell>{new Date(p.dueDate).toLocaleDateString()}</TableCell>
                  <TableCell>{p.lastPayment ? new Date(p.lastPayment).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={p.status} color={p.status === 'overdue' ? 'error' : p.status === 'due' ? 'warning' : 'success'} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </Box>
  );
};

export default AdminMunicipalBillsPage;
