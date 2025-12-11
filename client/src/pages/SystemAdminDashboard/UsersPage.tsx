import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Typography, Table, TableBody, TableCell, TableHead, TableRow, TextField, Stack, Alert, CircularProgress } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';

const UsersPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<any[]>([]);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const ad = await systemAdminService.listSystemAdmins().catch(() => ({ data: [] }));
      setAdmins(Array.isArray((ad as any)?.data) ? (ad as any).data : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const addAdmin = async () => {
    setMessage(null); setError(null);
    try {
      await systemAdminService.addSystemAdmin({ email: promoteEmail.trim() });
      setPromoteEmail('');
      setMessage('User promoted to system_admin');
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to promote user');
    }
  };

  const removeAdmin = async (id: string) => {
    setMessage(null); setError(null);
    try {
      await systemAdminService.removeSystemAdmin(id);
      setMessage('system_admin role removed');
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to remove role');
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#051F20', fontWeight: 700 }}>User Management</Typography>
        <Typography variant="body2" color="text.secondary">
          Promote or remove System Admin users
        </Typography>
      </Box>
      {message && <Alert sx={{ mb: 2 }} severity="success">{message}</Alert>}
      {error && <Alert sx={{ mb: 2 }} severity="error">{error}</Alert>}
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField size="small" placeholder="email to promote" value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)} />
            <Button variant="contained" onClick={addAdmin} disabled={!promoteEmail.trim()}>Promote</Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Email</TableCell>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ color: '#051F20', fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(admins || []).map((u: any) => (
                <TableRow key={String(u._id)}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{`${u.firstName || ''} ${u.lastName || ''}`.trim()}</TableCell>
                  <TableCell><Button size="small" color="error" onClick={() => removeAdmin(String(u._id))}>Remove role</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
};

export default UsersPage;


