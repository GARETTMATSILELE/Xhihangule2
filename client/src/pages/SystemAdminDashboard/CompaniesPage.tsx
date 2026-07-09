import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import systemAdminService from '../../services/systemAdminService';
import { EmptyState, ErrorState, LoadingState, PageHeader, exportRowsToCsv, formatDate } from './common';

const CompaniesPage: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await systemAdminService.listCompanies({ search, limit: 100 });
      setRows(Array.isArray(resp?.data) ? resp.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, action: 'suspend' | 'activate') => {
    try {
      if (action === 'suspend') await systemAdminService.suspendCompany(id, 'Suspended from system admin');
      else await systemAdminService.activateCompany(id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update company');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <Box>
      <PageHeader title="Companies" subtitle="Manage SaaS tenant companies, usage, subscriptions, and lifecycle status." />
      <ErrorState error={error} />
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField size="small" label="Search companies" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="contained" onClick={load}>Search</Button>
            <Button variant="outlined" onClick={() => exportRowsToCsv('system-admin-companies.csv', rows)}>Export CSV</Button>
          </Stack>
          {!rows.length ? <EmptyState /> : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Company Name', 'Email', 'Plan', 'Status', 'Properties', 'Users', 'Last Login', 'Created Date', 'Actions'].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.companyId}>
                    <TableCell><Typography fontWeight={700}>{row.name}</Typography></TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.plan || '-'}</TableCell>
                    <TableCell>{row.status || row.subscriptionStatus || '-'}</TableCell>
                    <TableCell>{row.properties}</TableCell>
                    <TableCell>{row.users}</TableCell>
                    <TableCell>{formatDate(row.lastLogin)}</TableCell>
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Button size="small" onClick={() => navigate(`/system-admin/companies/${row.companyId}`)}>View</Button>
                        <Button size="small" onClick={() => navigate(`/system-admin/companies/${row.companyId}?edit=1`)}>Edit</Button>
                        <Button size="small" color="warning" onClick={() => updateStatus(row.companyId, 'suspend')}>Suspend</Button>
                        <Button size="small" color="success" onClick={() => updateStatus(row.companyId, 'activate')}>Activate</Button>
                        <Button size="small" onClick={() => navigate(`/system-admin/subscriptions?companyId=${row.companyId}`)}>View Subscription</Button>
                        <Button size="small" onClick={() => navigate(`/system-admin/companies/${row.companyId}#usage`)}>View Usage</Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default CompaniesPage;
