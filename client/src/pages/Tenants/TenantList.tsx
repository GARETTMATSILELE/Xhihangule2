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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import api from '../../api/axios';
import { Tenant, TenantFormData } from '../../types/tenant';
import { Property } from '../../types/property';
import { useAuth } from '../../contexts/AuthContext';
import { useTenantService } from '../../services/tenantService';
import { usePropertyService } from '../../services/propertyService';

export const TenantList: React.FC = () => {
  const { user } = useAuth();
  const tenantService = useTenantService();
  const propertyService = usePropertyService();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<TenantFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    status: 'Active',
    propertyId: '',
    idNumber: '',
    emergencyContact: '',
    companyId: user?.companyId || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTenants();
    fetchProperties();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const response = await tenantService.getAllPublic();
      setTenants(response.tenants);
    } catch (error) {
      console.error('Error fetching tenants:', error);
      setError('Failed to fetch tenants');
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    try {
      const response = await propertyService.getPublicProperties();
      setProperties(response);
    } catch (error) {
      console.error('Error fetching properties:', error);
      setError('Failed to fetch properties');
    }
  };

  const handleOpen = (tenant?: Tenant) => {
    if (tenant) {
      setEditingTenant(tenant);
      setFormData({
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        email: tenant.email,
        phone: tenant.phone,
        status: tenant.status,
        propertyId: tenant.propertyId || '',
        idNumber: tenant.idNumber || '',
        emergencyContact: tenant.emergencyContact || '',
        companyId: tenant.companyId,
      });
    } else {
      setEditingTenant(null);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        status: 'Active',
        propertyId: '',
        idNumber: '',
        emergencyContact: '',
        companyId: user?.companyId || '',
      });
    }
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingTenant(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTenant) {
        await api.put(`/tenants/${editingTenant._id}`, formData);
      } else {
        // Include the user's ID as ownerId when creating new tenants
        const tenantDataWithOwnerId = {
          ...formData,
          ownerId: user?._id // Add the logged-in user's ID as ownerId
        };
        await api.post('/tenants', tenantDataWithOwnerId);
      }
      handleClose();
      fetchTenants();
    } catch (error) {
      console.error('Error saving tenant:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this tenant?')) {
      try {
        await api.delete(`/tenants/${id}`);
        fetchTenants();
      } catch (error) {
        console.error('Error deleting tenant:', error);
      }
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Tenants</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpen()}
        >
          Add Tenant
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Property</TableCell>
              <TableCell>ID Number</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant._id}>
                <TableCell>{`${tenant.firstName} ${tenant.lastName}`}</TableCell>
                <TableCell>{tenant.email}</TableCell>
                <TableCell>{tenant.phone}</TableCell>
                <TableCell>{tenant.status}</TableCell>
                <TableCell>
                  {properties.find((p) => p._id === tenant.propertyId)?.name}
                </TableCell>
                <TableCell>{tenant.idNumber}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleOpen(tenant)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(tenant._id)}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={isFormOpen} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingTenant ? 'Edit Tenant' : 'Add Tenant'}
        </DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="First Name"
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Last Name"
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Phone"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              margin="normal"
              required
            />
            <TextField
              fullWidth
              select
              label="Status"
              value={formData.status}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value as 'Active' | 'Inactive',
                })
              }
              margin="normal"
              required
            >
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </TextField>
            <TextField
              fullWidth
              select
              label="Property"
              value={formData.propertyId}
              onChange={(e) =>
                setFormData({ ...formData, propertyId: e.target.value })
              }
              margin="normal"
            >
              {properties.map((property) => (
                <MenuItem key={property._id} value={property._id}>
                  {property.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              label="ID Number"
              value={formData.idNumber}
              onChange={(e) =>
                setFormData({ ...formData, idNumber: e.target.value })
              }
              margin="normal"
            />
            <TextField
              fullWidth
              label="Emergency Contact"
              value={formData.emergencyContact}
              onChange={(e) =>
                setFormData({ ...formData, emergencyContact: e.target.value })
              }
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingTenant ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}; 