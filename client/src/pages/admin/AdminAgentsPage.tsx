import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import paymentService from '../../services/paymentService';
import agencyOperationsService from '../../services/agencyOperationsService';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { AgentPerformanceRow } from '../../types/agencyOperations';

const AdminAgentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company } = useCompany();
  const [agents, setAgents] = useState<any[]>([]);
  const [performance, setPerformance] = useState<AgentPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const companyId = String(user?.companyId || (company as any)?._id || '');
      const [rentals, sales, dash] = await Promise.all([
        paymentService.getAgentsPublic(companyId, 'agent'),
        paymentService.getAgentsPublic(companyId, 'sales'),
        agencyOperationsService.getExecutiveDashboard(),
      ]);
      setAgents([...(Array.isArray(rentals) ? rentals : []), ...(Array.isArray(sales) ? sales : [])]);
      setPerformance(dash.agentPerformance.leaderboard);
    } catch (e: any) {
      setError(e?.message || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, company]);

  useEffect(() => { load(); }, [load]);

  const filtered = agents.filter((a) => {
    const name = `${a.firstName || ''} ${a.lastName || ''} ${a.email || ''}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 6 }} />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Agents</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage rental and sales agents, performance, and assignments
      </Typography>

      <TextField size="small" placeholder="Search agents…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 3, minWidth: 280 }} />

      {filtered.length === 0 ? (
        <Alert severity="info">No agents found. Invite agents via User Management.</Alert>
      ) : (
        <Grid container spacing={2}>
          {filtered.map((a) => {
            const id = String(a._id);
            const perf = performance.find((p) => p.agentId === id);
            const fullName = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email;
            return (
              <Grid item xs={12} md={6} lg={4} key={id}>
                <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <CardActionArea onClick={() => navigate(`/admin-dashboard/agents/${id}`)}>
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{fullName}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{a.role || 'agent'} · {a.email}</Typography>
                      {perf && (
                        <Stack direction="row" spacing={2} flexWrap="wrap">
                          <Typography variant="caption">{perf.propertiesManaged} properties</Typography>
                          <Typography variant="caption">{perf.viewingsConducted} viewings</Typography>
                          <Typography variant="caption">{perf.leasesSigned} leases</Typography>
                        </Stack>
                      )}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default AdminAgentsPage;
