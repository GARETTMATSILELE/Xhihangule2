import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  useTheme
} from '@mui/material';
import {
  Add as AddIcon,
  FilterList as FilterIcon,
  Sort as SortIcon
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams, GridRowParams } from '@mui/x-data-grid';
import { MaintenanceRequest, MaintenanceStatus, MaintenancePriority, MaintenanceCategory } from '../../types/maintenance';
import { apiService } from '../../api';

interface MaintenanceRequestsListProps {
  onRequestClick: (request: MaintenanceRequest) => void;
  onNewRequest: () => void;
}

const MaintenanceRequestsList: React.FC<MaintenanceRequestsListProps> = ({
  onRequestClick,
  onNewRequest
}) => {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterModel, setFilterModel] = useState({
    property: '',
    status: '',
    priority: '',
    category: ''
  });
  const theme = useTheme();

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await apiService.getMaintenanceRequests();
      setRequests(response.data);
    } catch (err) {
      setError('Failed to fetch maintenance requests');
      console.error('Error fetching maintenance requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: MaintenanceStatus) => {
    switch (status) {
      case MaintenanceStatus.PENDING:
        return theme.palette.warning.main;
      case MaintenanceStatus.APPROVED:
        return theme.palette.info.main;
      case MaintenanceStatus.IN_PROGRESS:
        return theme.palette.primary.main;
      case MaintenanceStatus.COMPLETED:
        return theme.palette.success.main;
      case MaintenanceStatus.REJECTED:
        return theme.palette.error.main;
      case MaintenanceStatus.CANCELLED:
        return theme.palette.grey[500];
      default:
        return theme.palette.text.primary;
    }
  };

  const getPriorityColor = (priority: MaintenancePriority) => {
    switch (priority) {
      case MaintenancePriority.URGENT:
        return theme.palette.error.main;
      case MaintenancePriority.HIGH:
        return theme.palette.warning.main;
      case MaintenancePriority.MEDIUM:
        return theme.palette.info.main;
      case MaintenancePriority.LOW:
        return theme.palette.success.main;
      default:
        return theme.palette.text.primary;
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'propertyName',
      headerName: 'Property',
      flex: 1,
      minWidth: 150,
      valueGetter: (params: any) => params.row.propertyId.name
    },
    {
      field: 'category',
      headerName: 'Category',
      flex: 1,
      minWidth: 120,
      valueGetter: (params: any) => params.row.category
    },
    {
      field: 'priority',
      headerName: 'Priority',
      flex: 1,
      minWidth: 100,
      renderCell: (params: GridRenderCellParams<MaintenanceRequest>) => (
        <Box
          sx={{
            backgroundColor: getPriorityColor(params.row.priority),
            color: 'white',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            textTransform: 'capitalize'
          }}
        >
          {params.row.priority}
        </Box>
      )
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 1,
      minWidth: 120,
      renderCell: (params: GridRenderCellParams<MaintenanceRequest>) => (
        <Box
          sx={{
            backgroundColor: getStatusColor(params.row.status),
            color: 'white',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            textTransform: 'capitalize'
          }}
        >
          {params.row.status}
        </Box>
      )
    },
    {
      field: 'createdByName',
      headerName: 'Created By',
      flex: 1,
      minWidth: 150
    },
    {
      field: 'createdAt',
      headerName: 'Created At',
      flex: 1,
      minWidth: 150,
      valueGetter: (params: any) =>
        new Date(params.row.createdAt).toLocaleDateString()
    },
    {
      field: 'estimatedCost',
      headerName: 'Estimated Cost',
      flex: 1,
      minWidth: 120,
      valueGetter: (params: any) =>
        `$${params.row.estimatedCost.toFixed(2)}`
    }
  ];

  const filteredRequests = requests.filter(request => {
    return (
      (!filterModel.property || request.propertyId.name.toLowerCase().includes(filterModel.property.toLowerCase())) &&
      (!filterModel.status || request.status === filterModel.status) &&
      (!filterModel.priority || request.priority === filterModel.priority) &&
      (!filterModel.category || request.category === filterModel.category)
    );
  });

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Maintenance Requests
        </Typography>
        <Tooltip title="New Request">
          <IconButton color="primary" onClick={onNewRequest}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="Filter by Property"
          size="small"
          value={filterModel.property}
          onChange={(e) => setFilterModel(prev => ({ ...prev, property: e.target.value }))}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterModel.status}
            label="Status"
            onChange={(e) => setFilterModel(prev => ({ ...prev, status: e.target.value }))}
          >
            <MenuItem value="">All</MenuItem>
            {Object.values(MaintenanceStatus).map((status) => (
              <MenuItem key={status} value={status}>
                {status}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Priority</InputLabel>
          <Select
            value={filterModel.priority}
            label="Priority"
            onChange={(e) => setFilterModel(prev => ({ ...prev, priority: e.target.value }))}
          >
            <MenuItem value="">All</MenuItem>
            {Object.values(MaintenancePriority).map((priority) => (
              <MenuItem key={priority} value={priority}>
                {priority}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={filterModel.category}
            label="Category"
            onChange={(e) => setFilterModel(prev => ({ ...prev, category: e.target.value }))}
          >
            <MenuItem value="">All</MenuItem>
            {Object.values(MaintenanceCategory).map((category) => (
              <MenuItem key={category} value={category}>
                {category}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <DataGrid
        rows={filteredRequests}
        columns={columns}
        initialState={{
          pagination: {
            paginationModel: { pageSize: 10, page: 0 }
          }
        }}
        pageSizeOptions={[10, 25, 50]}
        checkboxSelection
        disableRowSelectionOnClick
        loading={loading}
        onRowClick={(params: GridRowParams<MaintenanceRequest>) => onRequestClick(params.row)}
        sx={{
          '& .MuiDataGrid-cell:focus': {
            outline: 'none'
          }
        }}
      />
    </Paper>
  );
};

export default MaintenanceRequestsList; 