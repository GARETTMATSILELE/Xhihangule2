import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Alert,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import api from '../../api/axios';
import { Lease, LeaseStatus } from '../../types/lease';
import { Tenant } from '../../types/tenant';
import { Property } from '../../types/property';
import { useAuth } from '../../contexts/AuthContext';
import { useLeaseService } from '../../services/leaseService';
import { usePropertyService } from '../../services/propertyService';
import { useTenantService } from '../../services/tenantService';

interface LeaseListProps {
  leases?: Lease[];
  properties?: Property[];
  tenants?: Tenant[];
  onEdit?: (lease: Lease) => void;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: LeaseStatus) => void;
}

export const LeaseList: React.FC<LeaseListProps> = ({
  leases: propLeases,
  properties: propProperties,
  tenants: propTenants,
  onEdit: propOnEdit,
  onDelete: propOnDelete,
  onStatusChange: propOnStatusChange,
}) => {
  const { user } = useAuth();
  const leaseService = useLeaseService();
  const propertyService = usePropertyService();
  const tenantService = useTenantService();
  const [leases, setLeases] = useState<Lease[]>(propLeases || []);
  const [properties, setProperties] = useState<Property[]>(propProperties || []);
  const [tenants, setTenants] = useState<Tenant[]>(propTenants || []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!propLeases);

  useEffect(() => {
    if (!propLeases) {
      fetchData();
    }
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [leasesRes, propertiesRes, tenantsRes] = await Promise.all([
        leaseService.getAll(),
        propertyService.getProperties(),
        tenantService.getAll()
      ]);

      setLeases(leasesRes);
      setProperties(propertiesRes);
      setTenants(tenantsRes.tenants || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (lease: Lease) => {
    if (propOnEdit) {
      propOnEdit(lease);
    }
  };

  const handleDelete = (id: string) => {
    if (propOnDelete) {
      propOnDelete(id);
    }
  };

  const handleStatusChange = (id: string, status: LeaseStatus) => {
    if (propOnStatusChange) {
      propOnStatusChange(id, status);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Loading leases...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Property</TableCell>
              <TableCell>Tenant</TableCell>
              <TableCell>Start Date</TableCell>
              <TableCell>End Date</TableCell>
              <TableCell>Rent Amount</TableCell>
              <TableCell>Status</TableCell>
              {user && <TableCell>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {leases.map((lease) => (
              <TableRow key={lease._id}>
                <TableCell>
                  {properties.find(p => p._id === lease.propertyId)?.name || 'N/A'}
                </TableCell>
                <TableCell>
                  {tenants.find(t => t._id === lease.tenantId)?.firstName || 'N/A'}
                </TableCell>
                <TableCell>{new Date(lease.startDate).toLocaleDateString()}</TableCell>
                <TableCell>{new Date(lease.endDate).toLocaleDateString()}</TableCell>
                <TableCell>${lease.rentAmount}</TableCell>
                <TableCell>{lease.status}</TableCell>
                {user && (
                  <TableCell>
                    <IconButton onClick={() => handleEdit(lease)} size="small">
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDelete(lease._id)} size="small">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default LeaseList; 