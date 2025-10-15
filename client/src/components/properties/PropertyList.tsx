import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { Property, PropertyFormData } from '../../types/property';
import PropertyForm from './PropertyForm';

interface PropertyListProps {
  properties: Property[];
  onPropertyClick: (property: Property) => void;
  onDeleteProperty: (propertyId: string) => void;
  onAddProperty: () => void;
}

const PropertyList: React.FC<PropertyListProps> = ({
  properties,
  onPropertyClick,
  onDeleteProperty,
  onAddProperty,
}) => {
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const location = useLocation();
  const isAgentRoute = location.pathname.includes('/agent-dashboard');

  const handleEditClick = (property: Property) => {
    setEditingProperty(property);
    setShowEditForm(true);
  };

  const handleEditSubmit = async (formData: PropertyFormData) => {
    try {
      // Call the parent's onPropertyClick with the updated data
      onPropertyClick({ ...editingProperty!, ...formData });
      setShowEditForm(false);
      setEditingProperty(null);
    } catch (error) {
      console.error('Error updating property:', error);
    }
  };

  const handleCloseEditForm = () => {
    setShowEditForm(false);
    setEditingProperty(null);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Properties</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onAddProperty}
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
              <TableCell>{isAgentRoute ? 'Rent' : 'Amount'}</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Bedrooms</TableCell>
              <TableCell>Bathrooms</TableCell>
              <TableCell>Area</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.map((property) => (
              <TableRow 
                key={property._id}
                onClick={() => property.status === 'available' && handleEditClick(property)}
                sx={{ 
                  cursor: property.status === 'available' ? 'pointer' : 'default',
                  '&:hover': {
                    backgroundColor: property.status === 'available' ? 'action.hover' : 'inherit'
                  }
                }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {isAgentRoute ? (
                    <Link to={`/agent-dashboard/properties/${property._id}`} style={{ textDecoration: 'none' }}>
                      {property.name}
                    </Link>
                  ) : (
                    property.name
                  )}
                </TableCell>
                <TableCell>{property.address}</TableCell>
                <TableCell>{property.type}</TableCell>
                <TableCell>
                  {isAgentRoute
                    ? `$${property.rent ?? 0}`
                    : `$${property.rentalType === 'sale' ? (property.price ?? 0) : (property.rent ?? 0)}`}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={property.status} 
                    color={property.status === 'available' ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>{property.bedrooms}</TableCell>
                <TableCell>{property.bathrooms}</TableCell>
                <TableCell>{property.area} sq ft</TableCell>
                <TableCell>
                  <IconButton onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(property);
                  }}>
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProperty(property._id);
                  }}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={showEditForm}
        onClose={handleCloseEditForm}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingProperty ? 'Edit Property' : 'Add Property'}
        </DialogTitle>
        <DialogContent>
          {editingProperty && (
            <PropertyForm
              initialData={editingProperty}
              onSubmit={handleEditSubmit}
              onClose={handleCloseEditForm}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default PropertyList; 