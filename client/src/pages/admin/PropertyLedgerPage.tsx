import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Table, TableBody, TableCell, TableHead, TableRow, CircularProgress, Alert } from '@mui/material';
import api from '../../api/axios';
import { useCompany } from '../../contexts/CompanyContext';

interface LedgerEntry {
  _id: string;
  type: 'payment' | 'payout' | 'expense' | string;
  amount: number;
  date?: string;
  notes?: string;
  referenceNumber?: string;
}

const PropertyLedgerPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { company } = useCompany();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<{ totalPaid: number; totalPayout: number; held: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        if (!propertyId) return;
        const [ledgerRes, summaryRes] = await Promise.all([
          api.get(`/accountants/property-accounts/${propertyId}/deposits`),
          api.get(`/accountants/property-accounts/${propertyId}/deposits/summary`)
        ]);
        const data = Array.isArray(ledgerRes.data?.data?.entries) ? ledgerRes.data.data.entries : Array.isArray(ledgerRes.data?.entries) ? ledgerRes.data.entries : [];
        setEntries(data);
        const s = summaryRes.data?.data || summaryRes.data || null;
        setSummary(s);
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load ledger');
      } finally {
        setLoading(false);
      }
    };
    if (company?.plan === 'INDIVIDUAL') run();
    else setLoading(false);
  }, [propertyId, company?.plan]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (company?.plan !== 'INDIVIDUAL') {
    return <Alert severity="info">Property ledgers are available on the Individual plan only.</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Property Deposit Ledger</Typography>
          {summary && (
            <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
              <Typography variant="body2">Total Paid: ${Number(summary.totalPaid || 0).toLocaleString()}</Typography>
              <Typography variant="body2">Total Payouts: ${Number(summary.totalPayout || 0).toLocaleString()}</Typography>
              <Typography variant="body2">Held: ${Number(summary.held || 0).toLocaleString()}</Typography>
            </Box>
          )}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e._id}>
                  <TableCell>{e.date ? new Date(e.date).toLocaleDateString() : ''}</TableCell>
                  <TableCell>{e.type}</TableCell>
                  <TableCell>{e.referenceNumber || ''}</TableCell>
                  <TableCell align="right">${Number(e.amount || 0).toLocaleString()}</TableCell>
                  <TableCell>{e.notes || ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PropertyLedgerPage;

































