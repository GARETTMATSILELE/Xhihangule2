import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem as MuiMenuItem,
  Alert,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Lease, LeaseStatus } from '../../types/lease';
import { SelectChangeEvent } from '@mui/material/Select';
import { Property } from '../../types/property';
import { Tenant } from '../../types/tenant';

interface LeaseListProps {
  leases: Lease[];
  properties: Property[];
  tenants: Tenant[];
  onEdit: (lease: Lease) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: LeaseStatus) => void;
  isAuthenticated: boolean;
}

export const LeaseList: React.FC<LeaseListProps> = ({
  leases,
  properties,
  tenants,
  onEdit,
  onDelete,
  onStatusChange,
  isAuthenticated,
}) => {
  const [filteredLeases, setFilteredLeases] = useState<Lease[]>(leases);
  const [filters, setFilters] = useState({
    status: 'all',
    property: 'all',
    search: '',
  });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Array.isArray(properties) || !Array.isArray(tenants)) {
      setError('Invalid data format received');
      return;
    }

    try {
      let result = [...leases];
      
      if (filters.status !== 'all') {
        result = result.filter(lease => lease.status === filters.status);
      }
      
      if (filters.property !== 'all') {
        result = result.filter(lease => lease.propertyId === filters.property);
      }
      
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        result = result.filter(lease => {
          const tenant = tenants.find(t => t._id === lease.tenantId);
          const property = properties.find(p => p._id === lease.propertyId);
          return (
            (tenant?.firstName?.toLowerCase() || '').includes(searchLower) ||
            (tenant?.lastName?.toLowerCase() || '').includes(searchLower) ||
            (property?.name?.toLowerCase() || '').includes(searchLower)
          );
        });
      }
      
      setFilteredLeases(result);
      setError(null);
    } catch (err) {
      console.error('Error filtering leases:', err);
      setError('Error filtering leases. Please try again.');
    }
  }, [leases, filters, properties, tenants]);

  const handleFilterChange = (field: keyof typeof filters) => (event: SelectChangeEvent) => {
    setFilters(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!Array.isArray(properties) || !Array.isArray(tenants)) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Invalid data format received. Please refresh the page.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status}
              label="Status"
              onChange={handleFilterChange('status')}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="expired">Expired</MenuItem>
              <MenuItem value="terminated">Terminated</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Property</InputLabel>
            <Select
              value={filters.property}
              label="Property"
              onChange={handleFilterChange('property')}
            >
              <MenuItem value="all">All</MenuItem>
              {properties.map(property => (
                <MenuItem key={property._id} value={property._id}>{property.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Search</InputLabel>
            <Select
              value={filters.search}
              label="Search"
              onChange={handleFilterChange('search')}
            >
              <MenuItem value="">All</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {filteredLeases.map(lease => (
        <Card key={lease._id} sx={{ mb: 2 }}>
          <CardContent>
            <Grid container alignItems="center" spacing={2}>
              <Grid item xs>
                <Typography variant="h6">
                  {properties.find(p => p._id === lease.propertyId)?.name || 'Unknown Property'}
                </Typography>
                <Typography color="textSecondary">
                  Tenant: {tenants.find(t => t._id === lease.tenantId)?.firstName || 'Unknown'} {tenants.find(t => t._id === lease.tenantId)?.lastName || ''}
                </Typography>
                <Typography color="textSecondary">
                  Status: <Chip 
                    label={lease.status} 
                    color={lease.status === 'active' ? 'success' : 'default'} 
                    size="small" 
                  />
                </Typography>
              </Grid>
              <Grid item>
                <IconButton
                  onClick={(event) => {
                    setAnchorEl(event.currentTarget);
                    setSelectedLease(lease);
                  }}
                >
                  <MoreVertIcon />
                </IconButton>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      ))}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => {
          setAnchorEl(null);
          setSelectedLease(null);
        }}
      >
        <MuiMenuItem onClick={() => {
          if (selectedLease) {
            onEdit(selectedLease);
            setAnchorEl(null);
          }
        }}>
          Edit
        </MuiMenuItem>
        <MuiMenuItem onClick={() => {
          if (selectedLease) {
            onDelete(selectedLease._id);
            setAnchorEl(null);
          }
        }}>
          Delete
        </MuiMenuItem>
        <MuiMenuItem onClick={() => {
          if (selectedLease) {
            onStatusChange(selectedLease._id, selectedLease.status === 'active' ? 'expired' : 'active');
            setAnchorEl(null);
          }
        }}>
          {selectedLease?.status === 'active' ? 'Mark as Expired' : 'Mark as Active'}
        </MuiMenuItem>
      </Menu>
    </Box>
  ); 
} 