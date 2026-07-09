import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';
import { EmptyState, ErrorState, LoadingState, PageHeader, exportRowsToCsv, formatDateTime } from './common';

const AuditLogsPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await systemAdminService.listAuditLogs({ action, limit: 200 });
      setRows(Array.isArray(resp?.data) ? resp.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  if (loading) return <LoadingState />;
  return (
    <Box>
      <PageHeader title="Audit Logs" subtitle="Filter and review critical platform actions." />
      <ErrorState error={error} />
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField size="small" label="Action filter" value={action} onChange={(e) => setAction(e.target.value)} />
            <Button variant="contained" onClick={load}>Filter</Button>
            <Button variant="outlined" onClick={() => exportRowsToCsv('audit-logs.csv', rows)}>Export CSV</Button>
          </Stack>
          {!rows.length ? <EmptyState /> : (
            <Table size="small">
              <TableHead><TableRow>{['Timestamp', 'Action', 'User', 'Company', 'Target', 'Status', 'Details'].map((h) => <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>{rows.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>{row.userId?.email || row.userId || '-'}</TableCell>
                  <TableCell>{row.companyId?.name || row.companyId || '-'}</TableCell>
                  <TableCell>{row.entityType} {row.entityId || ''}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.metadata ? JSON.stringify(row.metadata) : '-'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default AuditLogsPage;
