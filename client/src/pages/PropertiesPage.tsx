import React, { useState, useEffect } from 'react';
import { Box, Dialog } from '@mui/material';
import PropertyList from '../components/properties/PropertyList';
import PropertyForm from '../components/properties/PropertyForm';
import PropertyDetail from '../components/properties/PropertyDetail';
import { apiService } from '../api';
import { Property, PropertyFormData } from '../types/property';

const PropertiesPage: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    try {
      const response = await apiService.getProperties();
      const properties = Array.isArray(response.data) ? response.data : response.data.properties;
      setProperties(properties);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddProperty = () => {
    setSelectedProperty(null);
    setShowForm(true);
  };

  const handleEditProperty = (property: Property) => {
    setSelectedProperty(property);
    setShowForm(true);
  };

  const handlePropertyClick = (property: Property) => {
    setSelectedProperty(property);
    setShowDetail(true);
  };

  const handleFormSubmit = async (propertyData: PropertyFormData) => {
    try {
      if (selectedProperty) {
        const response = await apiService.updateProperty(selectedProperty._id, {
          ...propertyData,
          status: propertyData.status || selectedProperty.status
        });
        setProperties(properties.map(p => p._id === selectedProperty._id ? response.data : p));
      } else {
        const { _id, ...createData } = propertyData;
        const response = await apiService.createProperty({
          ...createData,
          status: 'available',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        setProperties([...properties, response.data]);
      }
      setShowForm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProperty = async (propertyId: string) => {
    try {
      await apiService.deleteProperty(propertyId);
      setProperties(properties.filter(p => p._id !== propertyId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateProperty = async (propertyData: PropertyFormData) => {
    try {
      const { _id, ...createData } = propertyData;
      await apiService.createProperty({
        ...createData,
        status: 'available',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      loadProperties();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProperty = async (propertyData: PropertyFormData) => {
    try {
      await apiService.updateProperty(propertyData._id!, {
        ...propertyData,
        status: propertyData.status || 'available'
      });
      loadProperties();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box>
      <PropertyList
        properties={properties}
        onPropertyClick={handlePropertyClick}
        onAddProperty={handleAddProperty}
        onDeleteProperty={handleDeleteProperty}
      />

      <Dialog 
        open={showForm} 
        onClose={() => setShowForm(false)}
        maxWidth="md"
        fullWidth
      >
        <Box sx={{ p: 3 }}>
          <PropertyForm
            initialData={selectedProperty || undefined}
            onSubmit={handleFormSubmit}
            onClose={() => setSelectedProperty(null)}
          />
        </Box>
      </Dialog>

      <Dialog
        open={showDetail}
        onClose={() => setShowDetail(false)}
        maxWidth="lg"
        fullWidth
      >
        {selectedProperty && (
          <PropertyDetail
            property={selectedProperty}
            onEdit={() => {
              setShowDetail(false);
              handleEditProperty(selectedProperty);
            }}
            onAssignTenant={() => {
              // TODO: Implement tenant assignment flow
            }}
          />
        )}
      </Dialog>
    </Box>
  );
};

export default PropertiesPage; 