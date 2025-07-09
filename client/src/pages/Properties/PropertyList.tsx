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
import { Property, PropertyFormData } from '../../types/property';

export const PropertyList: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [open, setOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [formData, setFormData] = useState<PropertyFormData>({
    _id: '',
    name: '',
    address: '',
    type: 'apartment',
    rent: 0,
    bedrooms: 1,
    bathrooms: 1,
    area: 0,
    description: '',
    images: [],
    amenities: [],
    companyId: '',
    ownerId: '',
    occupancyRate: 0,
    totalRentCollected: 0,
    currentArrears: 0,
    nextLeaseExpiry: new Date(),
    status: 'available',
    occupiedUnits: 0
  });

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      const response = await api.get('/properties');
      setProperties(response.data);
    } catch (error) {
      console.error('Error fetching properties:', error);
    }
  };

  const handleOpen = (property?: Property) => {
    if (property) {
      setEditingProperty(property);
      setFormData({
        _id: property._id,
        name: property.name,
        address: property.address,
        type: property.type,
        rent: property.rent,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        area: property.area,
        description: property.description,
        images: property.images,
        amenities: property.amenities,
        companyId: property.companyId,
        ownerId: property.ownerId,
        occupancyRate: property.occupancyRate,
        totalRentCollected: property.totalRentCollected,
        currentArrears: property.currentArrears,
        nextLeaseExpiry: property.nextLeaseExpiry,
        status: property.status,
        occupiedUnits: 0
      });
    } else {
      setEditingProperty(null);
      setFormData({
        _id: '',
        name: '',
        address: '',
        type: 'apartment',
        rent: 0,
        bedrooms: 1,
        bathrooms: 1,
        area: 0,
        description: '',
        images: [],
        amenities: [],
        companyId: '',
        ownerId: '',
        occupancyRate: 0,
        totalRentCollected: 0,
        currentArrears: 0,
        nextLeaseExpiry: new Date(),
        status: 'available',
        occupiedUnits: 0
      });
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditingProperty(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProperty) {
        await api.put(`/properties/${editingProperty._id}`, formData);
      } else {
        await api.post('/properties', formData);
      }
      handleClose();
      fetchProperties();
    } catch (error) {
      console.error('Error saving property:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this property?')) {
      try {
        await api.delete(`/properties/${id}`);
        fetchProperties();
      } catch (error) {
        console.error('Error deleting property:', error);
      }
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Properties</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpen()}
        >
          Add Property
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Rent</TableCell>
              <TableCell>Bedrooms</TableCell>
              <TableCell>Bathrooms</TableCell>
              <TableCell>Area</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.map((property) => (
              <TableRow key={property._id}>
                <TableCell>{property.name}</TableCell>
                <TableCell>{property.address}</TableCell>
                <TableCell>{property.type}</TableCell>
                <TableCell>${property.rent}</TableCell>
                <TableCell>{property.bedrooms}</TableCell>
                <TableCell>{property.bathrooms}</TableCell>
                <TableCell>{property.area} sq ft</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleOpen(property)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(property._id)}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingProperty ? 'Edit Property' : 'Add Property'}
        </DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Address"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              margin="normal"
              required
            />
            <TextField
              fullWidth
              select
              label="Type"
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as 'apartment' | 'house' | 'commercial',
                })
              }
              margin="normal"
              required
            >
              <MenuItem value="apartment">Apartment</MenuItem>
              <MenuItem value="house">House</MenuItem>
              <MenuItem value="commercial">Commercial</MenuItem>
            </TextField>
            <TextField
              fullWidth
              type="number"
              label="Rent"
              value={formData.rent}
              onChange={(e) =>
                setFormData({ ...formData, rent: parseFloat(e.target.value) })
              }
              margin="normal"
              required
              inputProps={{ min: 0 }}
            />
            <TextField
              fullWidth
              type="number"
              label="Bedrooms"
              value={formData.bedrooms}
              onChange={(e) =>
                setFormData({ ...formData, bedrooms: parseInt(e.target.value) })
              }
              margin="normal"
              required
              inputProps={{ min: 0 }}
            />
            <TextField
              fullWidth
              type="number"
              label="Bathrooms"
              value={formData.bathrooms}
              onChange={(e) =>
                setFormData({ ...formData, bathrooms: parseInt(e.target.value) })
              }
              margin="normal"
              required
              inputProps={{ min: 0 }}
            />
            <TextField
              fullWidth
              type="number"
              label="Area (sq ft)"
              value={formData.area}
              onChange={(e) =>
                setFormData({ ...formData, area: parseFloat(e.target.value) })
              }
              margin="normal"
              required
              inputProps={{ min: 0 }}
            />
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingProperty ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}; 