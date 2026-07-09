import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import agencyOperationsService from '../../services/agencyOperationsService';
import { VacancyRow } from '../../types/agencyOperations';
import { SectionCard } from '../../components/admin/dashboard/OperationsPrimitives';

const VacancyClock: React.FC<{ vacancy: VacancyRow }> = ({ vacancy }) => {
  const maxDays = 60;
  const pct = Math.min(100, (vacancy.daysVacant / maxDays) * 100);
  const color = vacancy.agingLevel === 'red' ? 'error' : vacancy.agingLevel === 'amber' ? 'warning' : 'success';

  const actions =
    vacancy.daysVacant >= 30
      ? ['Review pricing', 'Boost marketing', 'Schedule open day']
      : vacancy.daysVacant >= 15
        ? ['Increase viewings', 'Agent follow-up']
        : ['Monitor', 'Confirm listing active'];

  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{vacancy.propertyName}</Typography>
        <Chip size="small" color={color as any} label={`${vacancy.daysVacant} days`} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{vacancy.address}</Typography>
      <LinearProgress variant="determinate" value={pct} color={color as any} sx={{ mb: 2, height: 8, borderRadius: 4 }} />
      <Typography variant="body2" sx={{ mb: 1 }}>
        Est. lost revenue: <strong>${vacancy.expectedRevenueLoss.toLocaleString()}</strong>
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
        <Chip size="small" label={`${vacancy.viewingCount} viewings`} />
        <Chip size="small" label={`${vacancy.applicationsReceived} applications`} />
        <Chip size="small" label={vacancy.marketingStatus} variant="outlined" />
      </Stack>
      <Typography variant="caption" color="text.secondary">Recommended: {actions.join(' · ')}</Typography>
    </Box>
  );
};

const AdminVacanciesPage: React.FC = () => {
  const navigate = useNavigate();
  const [vacancies, setVacancies] = useState<VacancyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await agencyOperationsService.getExecutiveDashboard();
      setVacancies(data.vacancies);
    } catch (e: any) {
      setError(e?.message || 'Failed to load vacancies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalLoss = vacancies.reduce((s, v) => s + v.expectedRevenueLoss, 0);

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 6 }} />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Vacancy Management Centre</Typography>
          <Typography variant="body2" color="text.secondary">
            {vacancies.length} vacant · ${totalLoss.toLocaleString()} estimated revenue at risk
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => navigate('/admin-dashboard/viewings')}>Schedule viewings</Button>
      </Stack>

      <SectionCard title="Vacancy Aging Legend">
        <Stack direction="row" spacing={2}>
          <Chip label="0–14 days (Green)" color="success" size="small" />
          <Chip label="15–30 days (Amber)" color="warning" size="small" />
          <Chip label="30+ days (Red)" color="error" size="small" />
        </Stack>
      </SectionCard>

      {vacancies.length === 0 ? (
        <Alert severity="success">No vacant properties — portfolio fully occupied.</Alert>
      ) : (
        <Grid container spacing={2}>
          {vacancies.map((v) => (
            <Grid item xs={12} md={6} lg={4} key={v.propertyId}>
              <VacancyClock vacancy={v} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default AdminVacanciesPage;
