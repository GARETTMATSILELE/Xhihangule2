import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, CircularProgress, Button, Stack,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import maintenanceManagementService from '../../services/maintenanceManagementService';
import { statusLabel } from '../../types/maintenanceManagement';
import { PropertyMaintenanceHistoryItem } from '../../types/maintenanceManagement';

interface PropertyMaintenanceHistoryProps {
  propertyId: string;
}

export const PropertyMaintenanceHistory: React.FC<PropertyMaintenanceHistoryProps> = ({ propertyId }) => {
  const [history, setHistory] = useState<PropertyMaintenanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!propertyId) return;
    maintenanceManagementService.getPropertyHistory(propertyId)
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [propertyId]);

  if (loading) return <CircularProgress size={24} />;

  if (!history.length) {
    return (
      <Box>
        <Typography color="text.secondary" sx={{ mb: 2 }}>No maintenance history for this property yet.</Typography>
        <Button variant="outlined" onClick={() => navigate('/agent-dashboard/maintenance')}>Open Maintenance</Button>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>Maintenance History</Typography>
        <Button size="small" onClick={() => navigate('/agent-dashboard/maintenance')}>New Request</Button>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Issue</TableCell>
            <TableCell>Cost</TableCell>
            <TableCell>Contractor</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {history.map((row) => (
            <TableRow key={row._id}>
              <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
              <TableCell>{row.issue}{row.workOrderNumber ? ` (${row.workOrderNumber})` : ''}</TableCell>
              <TableCell>${Number(row.cost || 0).toLocaleString()}</TableCell>
              <TableCell>{row.contractor || '—'}</TableCell>
              <TableCell><Chip size="small" label={statusLabel(row.status)} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

export default PropertyMaintenanceHistory;
