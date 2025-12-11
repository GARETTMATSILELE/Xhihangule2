import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, CircularProgress, Typography, Alert } from '@mui/material';
import systemAdminService from '../../services/systemAdminService';

const StatusPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const st = await systemAdminService.getStatus();
        setStatus(st);
      } catch (e: any) {
        setError(e?.message || 'Failed to load system status');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#051F20', fontWeight: 700 }}>Status</Typography>
        <Typography variant="body2" color="text.secondary">
          Current system status and meta information
        </Typography>
      </Box>
      {error && <Alert sx={{ mb: 2 }} severity="error">{error}</Alert>}
      <Card sx={{ boxShadow: 'none', border: '1px solid #e5e7eb' }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1, color: '#051F20', fontWeight: 700 }}>Environment</Typography>
          <Typography variant="body2">Status: {status?.status || 'unknown'}</Typography>
          <Typography variant="body2">Time: {status?.time}</Typography>
          {status?.version && <Typography variant="body2">Version: {status.version}</Typography>}
        </CardContent>
      </Card>
    </Box>
  );
};

export default StatusPage;


