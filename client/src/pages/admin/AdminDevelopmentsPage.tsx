import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import api from '../../api/axios';

const AdminDevelopmentsPage: React.FC = () => {
  const [developments, setDevelopments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/developments');
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setDevelopments(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load developments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 6 }} />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Developments</Typography>
          <Typography variant="body2" color="text.secondary">Multi-unit developments and project portfolios</Typography>
        </Box>
      </Stack>

      {developments.length === 0 ? (
        <Alert severity="info">No developments yet. Developments are managed through the sales workspace.</Alert>
      ) : (
        <Grid container spacing={2}>
          {developments.map((d) => (
            <Grid item xs={12} md={6} key={d._id}>
              <Box sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{d.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{d.location || d.address || ''}</Typography>
                <Stack direction="row" spacing={1}>
                  <Chip size="small" label={`${d.totalUnits || d.unitsCount || 0} units`} />
                  {d.status && <Chip size="small" label={d.status} variant="outlined" />}
                </Stack>
              </Box>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default AdminDevelopmentsPage;
