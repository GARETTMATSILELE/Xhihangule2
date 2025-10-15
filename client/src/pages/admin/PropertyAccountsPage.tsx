import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Alert, Button } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import api from '../../api/axios';
import { useNavigate } from 'react-router-dom';

interface AccountRow {
  _id: string;
  propertyId: string;
  propertyName?: string;
  ownerId?: string;
  balance?: number;
}

const PropertyAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const { company } = useCompany();
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        // Company-scoped property accounts list
        const res = await api.get('/accountants/property-accounts');
        const data = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
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
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Property Accounts</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Property</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r._id} hover>
                  <TableCell>{r.propertyName || r.propertyId}</TableCell>
                  <TableCell align="right">${Number(r.balance || 0).toLocaleString()}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => navigate(`/admin-dashboard/property-accounts/${r.propertyId}/ledger`)}>View Ledger</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PropertyAccountsPage;






