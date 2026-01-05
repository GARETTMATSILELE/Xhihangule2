import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Button,
  Stack,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import systemAdminService from '../../services/systemAdminService';

interface CompanySubRow {
  companyId: string;
  name: string;
  email: string;
  plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  subscriptionStatus: string;
  subscriptionEndDate?: string;
  subscription?: {
    plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
    cycle: 'monthly' | 'yearly';
    status: string;
    currentPeriodEnd?: string;
    nextPaymentAt?: string;
  } | null;
}

const SubscriptionManagementPage: React.FC = () => {
  const [rows, setRows] = useState<CompanySubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [cycleByCompany, setCycleByCompany] = useState<Record<string, 'monthly' | 'yearly'>>({});

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await systemAdminService.listCompanySubscriptions();
      const data = Array.isArray(resp?.data) ? resp.data : [];
      setRows(data);
      // initialize cycle selectors from current subscription cycle if present
      const init: Record<string, 'monthly' | 'yearly'> = {};
      data.forEach((r: CompanySubRow) => {
        const cyc = r.subscription?.cycle || 'monthly';
        init[r.companyId] = cyc;
      });
      setCycleByCompany(init);
    } catch (e: any) {
      setError(e?.message || 'Failed to load company subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRenew = async (companyId: string) => {
    setRenewingId(companyId);
    setError(null);
    setMessage(null);
    try {
      const cycle = cycleByCompany[companyId] || 'monthly';
      await systemAdminService.manualRenewSubscription({ companyId, cycle });
      setMessage('Subscription renewed');
      await fetchData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to renew subscription');
    } finally {
      setRenewingId(null);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#051F20', fontWeight: 700 }}>Subscription Management</Typography>
        <Typography variant="body2" color="text.secondary">
          View all companies and manage manual renewals (for cash-payment subscribers).
        </Typography>
      </Box>
      {message && <Alert sx={{ mb: 2 }} severity="success">{message}</Alert>}
      {error && <Alert sx={{ mb: 2 }} severity="error">{error}</Alert>}
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Company</TableCell>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Plan</TableCell>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Cycle</TableCell>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Ends</TableCell>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Next Payment</TableCell>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const end = r.subscription?.currentPeriodEnd || r.subscriptionEndDate;
                const next = r.subscription?.nextPaymentAt;
                return (
                  <TableRow key={r.companyId}>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography fontWeight={700} sx={{ color: '#051F20' }}>{r.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{r.email}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{r.subscription?.plan || r.plan || '-'}</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{r.subscription?.status || r.subscriptionStatus || '-'}</TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel id={`cycle-${r.companyId}`}>Cycle</InputLabel>
                        <Select
                          labelId={`cycle-${r.companyId}`}
                          label="Cycle"
                          value={cycleByCompany[r.companyId] || r.subscription?.cycle || 'monthly'}
                          onChange={(e) => setCycleByCompany((prev) => ({ ...prev, [r.companyId]: e.target.value as any }))}
                        >
                          <MenuItem value="monthly">Monthly</MenuItem>
                          <MenuItem value="yearly">Yearly</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>{end ? new Date(end).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{next ? new Date(next).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="contained"
                        onClick={() => onRenew(r.companyId)}
                        disabled={renewingId === r.companyId}
                      >
                        {renewingId === r.companyId ? 'Renewing…' : 'Renew now'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
};

export default SubscriptionManagementPage;















