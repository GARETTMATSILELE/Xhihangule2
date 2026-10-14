import React, { useEffect, useState } from 'react';
import { Alert, Box, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import api from '../../api/axios';

const AccountantWorkQueuePage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/accountants/letting/work-queue')
      .then((res) => setRows(res.data?.data?.maintenancePaymentRequests || []))
      .catch((err) => setError(err?.response?.data?.message || 'The work queue could not be loaded'))
      .finally(() => setLoading(false));
  }, []);
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>Accounting work queue</Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>These maintenance requests are waiting for the canonical payment process. Creating a request does not post accounting.</Typography>
      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && rows.length === 0 && <Typography>No maintenance payment requests are waiting.</Typography>}
      {rows.map((row) => (
        <Card key={row._id} sx={{ mb: 1 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 700 }}>{row.currency || ''} {row.amount}</Typography>
            <Typography variant="body2">{row.reason}</Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

export default AccountantWorkQueuePage;
