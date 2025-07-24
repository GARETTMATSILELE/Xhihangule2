import React, { useEffect, useState } from 'react';
import paymentService from '../../services/paymentService';
import { Box, Typography, CircularProgress, Alert, Paper } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const columns: GridColDef[] = [
  { field: 'paymentDate', headerName: 'Date', width: 120, valueGetter: (params) => new Date(params.row.paymentDate).toLocaleDateString() },
  { field: 'propertyId', headerName: 'Property', width: 180 },
  { field: 'amount', headerName: 'Amount', width: 100 },
  { field: 'paymentMethod', headerName: 'Method', width: 120 },
  { field: 'referenceNumber', headerName: 'Reference', width: 140 },
  { field: 'status', headerName: 'Status', width: 100 },
  { field: 'currency', headerName: 'Currency', width: 100 },
  { field: 'processedBy', headerName: 'Processed By', width: 140 },
  { field: 'notes', headerName: 'Notes', width: 200 },
];

const LevyPaymentsPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    paymentService.getLevyPayments()
      .then((data) => {
        setRows(data.map((row: any, idx: number) => ({ id: row._id || idx, ...row })));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch levy payments');
        setLoading(false);
      });
  }, []);

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