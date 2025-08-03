import React, { useEffect, useState } from 'react';
import paymentService from '../../services/paymentService';
import { useAuth } from '../../contexts/AuthContext';
import { Box, Typography, CircularProgress, Alert, Paper } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const columns: GridColDef[] = [
  { 
    field: 'paymentDate', 
    headerName: 'Date', 
    width: 120, 
    valueGetter: (params) => new Date(params.row.paymentDate).toLocaleDateString() 
  },
  { 
    field: 'propertyId', 
    headerName: 'Property', 
    width: 200, 
    valueGetter: (params) => {
      if (params.row.propertyId && typeof params.row.propertyId === 'object') {
        return params.row.propertyId.name || 'Unknown Property';
      }
      return 'Unknown Property';
    }
  },
  { 
    field: 'amount', 
    headerName: 'Amount', 
    width: 120,
    valueGetter: (params) => {
      const currency = params.row.currency || 'USD';
      return `${currency} ${params.row.amount?.toLocaleString() || 0}`;
    }
  },
  { 
    field: 'paymentMethod', 
    headerName: 'Method', 
    width: 130,
    valueGetter: (params) => {
      const method = params.row.paymentMethod;
      return method?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Unknown';
    }
  },
  { 
    field: 'referenceNumber', 
    headerName: 'Reference', 
    width: 140 
  },
  { 
    field: 'status', 
    headerName: 'Status', 
    width: 100,
    renderCell: (params) => {
      const status = params.row.status;
      const color = status === 'completed' ? 'success' : status === 'pending' ? 'warning' : 'error';
      return (
        <Box sx={{ 
          px: 1, 
          py: 0.5, 
          borderRadius: 1, 
          backgroundColor: `${color}.light`, 
          color: `${color}.dark`,
          fontSize: '0.75rem',
          fontWeight: 'medium'
        }}>
          {status?.charAt(0).toUpperCase() + status?.slice(1) || 'Unknown'}
        </Box>
      );
    }
  },
  { 
    field: 'currency', 
    headerName: 'Currency', 
    width: 100 
  },
  { 
    field: 'processedBy', 
    headerName: 'Processed By', 
    width: 180,
    valueGetter: (params) => {
      if (params.row.processedBy && typeof params.row.processedBy === 'object') {
        const user = params.row.processedBy;
        return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User';
      }
      return 'Unknown User';
    }
  },
  { 
    field: 'notes', 
    headerName: 'Notes', 
    width: 200,
    valueGetter: (params) => params.row.notes || '-'
  },
];

const LevyPaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.companyId) {
      setError('Company ID is required');
      setLoading(false);
      return;
    }

    paymentService.getLevyPayments(user.companyId)
      .then((data) => {
        setRows(data.map((row: any, idx: number) => ({ id: row._id || idx, ...row })));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch levy payments');
        setLoading(false);
      });
  }, [user?.companyId]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Levy Payments</Typography>
      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && (
        <Paper sx={{ height: 500, width: '100%', mt: 2 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            pagination
            initialState={{
              pagination: { paginationModel: { pageSize: 10, page: 0 } }
            }}
            pageSizeOptions={[10, 25, 50]}
          />
        </Paper>
      )}
    </Box>
  );
};

export default LevyPaymentsPage; 