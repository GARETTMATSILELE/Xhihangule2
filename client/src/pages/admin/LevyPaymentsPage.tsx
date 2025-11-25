import React, { useEffect, useState, useMemo } from 'react';
import paymentService from '../../services/paymentService';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Box, 
  Typography, 
  CircularProgress, 
  Alert, 
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  InputAdornment,
  Dialog,
  DialogContent
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { 
  Search as SearchIcon, 
  FilterList as FilterIcon,
  Clear as ClearIcon,
  Print as PrintIcon,
  Download as DownloadIcon 
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import PaymentReceipt from '../../components/payments/PaymentReceipt';

const LevyPaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Get unique values for filters
  const uniqueStatuses = useMemo(() => {
    const statuses = Array.from(new Set(rows.map(row => row.status))).filter(Boolean);
    return statuses;
  }, [rows]);

  const uniquePaymentMethods = useMemo(() => {
    const methods = Array.from(new Set(rows.map(row => row.paymentMethod))).filter(Boolean);
    return methods;
  }, [rows]);

  // Filtered data
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const searchableFields = [
        row.propertyId?.name || '',
        row.referenceNumber || '',
        row.notes || '',
        row.processedBy?.firstName || '',
        row.processedBy?.lastName || '',
        row.processedBy?.email || '',
        row.amount?.toString() || '',
        row.currency || '',
        row.paymentMethod || '',
        row.status || ''
      ].join(' ').toLowerCase();

      if (searchTerm && !searchableFields.includes(searchLower)) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }

      // Payment method filter
      if (paymentMethodFilter !== 'all' && row.paymentMethod !== paymentMethodFilter) {
        return false;
      }

      // Date range filter
      if (startDate && new Date(row.paymentDate) < startDate) {
        return false;
      }
      if (endDate && new Date(row.paymentDate) > endDate) {
        return false;
      }

      return true;
    });
  }, [rows, searchTerm, statusFilter, paymentMethodFilter, startDate, endDate]);

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPaymentMethodFilter('all');
    setStartDate(null);
    setEndDate(null);
  };

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

  const handlePrint = async (id: string) => {
    try {
      const receipt = await paymentService.getPaymentReceipt(id, user?.companyId);
      setSelectedReceipt(receipt);
      setPrintOpen(true);
    } catch (err) {
      console.error('Failed to fetch receipt', err);
      alert('Failed to fetch receipt');
    }
  };

  const handleDownload = async (id: string, reference?: string) => {
    try {
      const blob = await paymentService.downloadReceipt(id, user?.companyId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${reference || id}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download receipt', err);
      alert('Failed to download receipt');
    }
  };

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
      width: 220,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
          <Typography variant="body2" sx={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 180 }}>
            {params.row.referenceNumber || '-'}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 100,
      renderCell: (params) => {
        const status = params.row.status;
        const color = status === 'completed' ? 'success' : status === 'pending' ? 'warning' : 'error';
        return (
          <Chip
            label={status?.charAt(0).toUpperCase() + status?.slice(1) || 'Unknown'}
            color={color as any}
            size="small"
            variant="outlined"
          />
        );
      }
    },
    { 
      field: 'currency', 
      headerName: 'Currency', 
      width: 100 
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Print Receipt">
            <IconButton
              color="primary"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handlePrint(params.row._id);
              }}
            >
              <PrintIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download HTML Receipt">
            <IconButton
              color="secondary"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(params.row._id, params.row.referenceNumber);
              }}
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )
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

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ 
        width: '100%', 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        p: 2,
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <Box sx={{ mb: 2, flexShrink: 0 }}>
          <Typography variant="h4" gutterBottom>Levy Payments</Typography>
          <Typography variant="body2" color="text.secondary">
            {filteredRows.length} of {rows.length} payments
          </Typography>
        </Box>

        {/* Search and Filters */}
        <Card sx={{ mb: 2, flexShrink: 0 }}>
          <CardContent sx={{ pb: '16px !important' }}>
            <Grid container spacing={2} alignItems="center">
              {/* Search */}
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  placeholder="Search payments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: searchTerm && (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSearchTerm('')}>
                          <ClearIcon />
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
              </Grid>

              {/* Filter Toggle */}
              <Grid item xs={12} md={6} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Tooltip title="Toggle Filters">
                  <IconButton 
                    onClick={() => setShowFilters(!showFilters)}
                    color={showFilters ? 'primary' : 'default'}
                  >
                    <FilterIcon />
                  </IconButton>
                </Tooltip>
                {(searchTerm || statusFilter !== 'all' || paymentMethodFilter !== 'all' || startDate || endDate) && (
                  <Tooltip title="Clear All Filters">
                    <IconButton onClick={clearFilters} color="error">
                      <ClearIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Grid>

              {/* Filter Options */}
              {showFilters && (
                <Grid item xs={12}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Status</InputLabel>
                        <Select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          label="Status"
                        >
                          <MenuItem value="all">All Statuses</MenuItem>
                          {uniqueStatuses.map(status => (
                            <MenuItem key={status} value={status}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Payment Method</InputLabel>
                        <Select
                          value={paymentMethodFilter}
                          onChange={(e) => setPaymentMethodFilter(e.target.value)}
                          label="Payment Method"
                        >
                          <MenuItem value="all">All Methods</MenuItem>
                          {uniquePaymentMethods.map(method => (
                            <MenuItem key={method} value={method}>
                              {method.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <DatePicker
                        label="Start Date"
                        value={startDate}
                        onChange={setStartDate}
                        slotProps={{ textField: { size: 'small', fullWidth: true } }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <DatePicker
                        label="End Date"
                        value={endDate}
                        onChange={setEndDate}
                        slotProps={{ textField: { size: 'small', fullWidth: true } }}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>

        {/* Data Grid */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress />
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}
          {!loading && !error && (
            <Paper sx={{ height: '100%', width: '100%' }}>
              <DataGrid
                rows={filteredRows}
                columns={columns}
                pagination
                initialState={{
                  pagination: { paginationModel: { pageSize: 15, page: 0 } }
                }}
                pageSizeOptions={[10, 15, 25, 50]}
                disableRowSelectionOnClick
                sx={{
                  '& .MuiDataGrid-cell': {
                    borderBottom: '1px solid #e0e0e0',
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    backgroundColor: '#f5f5f5',
                    borderBottom: '2px solid #e0e0e0',
                  }
                }}
              />
            </Paper>
          )}
        </Box>

        {/* Print Dialog */}
        <Dialog 
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogContent>
            {selectedReceipt && (
              <PaymentReceipt
                receipt={selectedReceipt}
                onClose={() => setPrintOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default LevyPaymentsPage; 