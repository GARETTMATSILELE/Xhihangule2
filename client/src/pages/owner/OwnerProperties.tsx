import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Property } from '../../types/property';
import { usePropertyService } from '../../services/propertyService';

const OwnerProperties: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const propertyService = usePropertyService();

  const loadProperties = async () => {
    try {
      setLoading(true);
      setError(null);
      const properties = await propertyService.getProperties();
      setProperties(properties);
    } catch (err) {
      setError('Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const handleEdit = (propertyId: string) => {
    // TODO: Implement edit functionality
    console.log('Edit property:', propertyId);
  };

  const handleDelete = async (propertyId: string) => {
    try {
      await propertyService.deleteProperty(propertyId);
      await loadProperties(); // Reload the properties after deletion
    } catch (err) {
      setError('Failed to delete property');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">My Properties</Typography>
        <Button variant="contained" color="primary">
          Add New Property
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.map((property) => (
              <TableRow key={property._id}>
                <TableCell>{property.name}</TableCell>
                <TableCell>{property.address}</TableCell>
                <TableCell>{property.type}</TableCell>
                <TableCell>{property.status}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleEdit(property._id)}>
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
    </Box>
  );
};

export default OwnerProperties; 