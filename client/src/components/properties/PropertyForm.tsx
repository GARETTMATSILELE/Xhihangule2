import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Typography,
  SelectChangeEvent,
  Chip,
  IconButton,
  Alert,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faUpload } from '@fortawesome/free-solid-svg-icons';
import { Property, PropertyType, PropertyFormData } from '../../types/property';
import { useAuth } from '../../contexts/AuthContext';
import './PropertyForm.css';

interface PropertyFormProps {
  onSubmit: (property: PropertyFormData) => void;
  initialData?: Partial<Property>;
  onClose: () => void;
}

const propertyTypes: PropertyType[] = ['apartment', 'house', 'commercial'];
const commonAmenities = ['Parking', 'Pool', 'Gym', 'Security', 'Balcony', 'Garden', 'Air Conditioning'];
const rentalTypes = [
  { value: 'management', label: 'Management' },
  { value: 'introduction', label: 'Introduction' }
];

const PropertyForm: React.FC<PropertyFormProps> = ({ onSubmit, initialData, onClose }) => {
  const { user, company } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const [property, setProperty] = useState<PropertyFormData>(() => {
    if (!user?.companyId) {
      setError('Company ID not found. Please ensure you are associated with a company.');
      return {} as PropertyFormData;
    }

    const initialFormData: PropertyFormData = {
      companyId: user.companyId,
      name: '',
      type: 'apartment',
      address: '',
      rent: 0,
      bedrooms: 1,
      bathrooms: 1,
      area: 0,
      amenities: [],
      images: [],
      description: '',
      ownerId: user._id,
      occupancyRate: 0,
      totalRentCollected: 0,
      currentArrears: 0,
      nextLeaseExpiry: new Date(),
      status: 'available',
      occupiedUnits: 0,
      rentalType: 'management',
      commission: 15
    };

    if (initialData) {
      // Ensure we don't include omitted fields from Property
      const { _id, createdAt, updatedAt, ...restInitialData } = initialData;
      return {
        ...initialFormData,
        ...restInitialData,
      };
    }

    return initialFormData;
  });

  const [customAmenity, setCustomAmenity] = useState('');

  // Add effect to update commission default when rentalType or property.type changes
  React.useEffect(() => {
    let defaultCommission = 15;
    if (property.rentalType === 'management') {
      if (property.type === 'commercial') defaultCommission = 10;
      else defaultCommission = 15;
    } else if (property.rentalType === 'introduction') {
      defaultCommission = 100;
    }
    setProperty(prev => ({ ...prev, commission: prev.commission !== undefined && prev.commission !== null && prev.commission !== 0 ? prev.commission : defaultCommission }));
    // Only set if not already set by user
    // eslint-disable-next-line
  }, [property.rentalType, property.type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user?._id) {
      setError('User not logged in');
      return;
    }

    if (!user?.companyId) {
      setError('Company ID not found. Please ensure you are associated with a company.');
      return;
    }

    if (!['admin', 'owner', 'agent'].includes(user?.role || '')) {
      setError('Access denied. Admin, Owner, or Agent role required to create properties.');
      return;
    }

    // Validate required fields
    if (!property.name || !property.address) {
      setError('Name and address are required fields');
      return;
    }

    // Log user and company details for debugging
    console.log('PropertyForm: Submitting property with user details:', {
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      userRole: user.role,
      companyId: user.companyId,
      companyName: company?.name
    });

    onSubmit({
      ...property,
      ownerId: user._id,
      companyId: user.companyId,
      type: property.type || 'apartment',
      description: property.description || 'N/A',
      status: property.status || 'available',
      rent: property.rent || 0,
      bedrooms: property.bedrooms || 0,
      bathrooms: property.bathrooms || 0,
      area: property.area || 0,
      images: property.images || [],
      amenities: property.amenities || []
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProperty((prev: PropertyFormData) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSelectChange = (e: SelectChangeEvent<PropertyType>) => {
    const { name, value } = e.target;
    setProperty((prev: PropertyFormData) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProperty((prev: PropertyFormData) => ({
      ...prev,
      [name]: Number(value)
    }));
  };

  const handleAmenityToggle = (amenity: string) => {
    setProperty((prev: PropertyFormData) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a: string) => a !== amenity)
        : [...prev.amenities, amenity]
    }));
  };

  const handleAddCustomAmenity = () => {
    if (customAmenity && !property.amenities.includes(customAmenity)) {
      setProperty((prev: PropertyFormData) => ({
        ...prev,
        amenities: [...prev.amenities, customAmenity]
      }));
      setCustomAmenity('');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // TODO: Implement actual image upload
      const imageUrls = Array.from(files).map(file => URL.createObjectURL(file));
      setProperty((prev: PropertyFormData) => ({
        ...prev,
        images: [...prev.images, ...imageUrls]
      }));
    }
  };

  const handleRemoveImage = (index: number) => {
    setProperty((prev: PropertyFormData) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* User and Company Information */}
      {user && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Creating property as:</strong><br />
          <strong>User:</strong> {user.firstName} {user.lastName} ({user.email})<br />
          <strong>Role:</strong> {user.role}<br />
          <strong>Company ID:</strong> {user.companyId}
          {company && (
            <><br /><strong>Company:</strong> {company.name}</>
          )}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Typography variant="h6">Property Details</Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            required
            fullWidth
            name="name"
            label="Property Name"
            value={property.name}
            onChange={handleChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth required>
            <InputLabel>Property Type</InputLabel>
            <Select
              name="type"
              value={property.type}
              label="Property Type"
              onChange={handleSelectChange}
            >
              {propertyTypes.map(type => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <TextField
            required
            fullWidth
            name="address"
            label="Address"
            value={property.address}
            onChange={handleChange}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            required
            fullWidth
            type="number"
            name="bedrooms"
            label="Number of Bedrooms"
            value={property.bedrooms}
            onChange={handleNumberChange}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            required
            fullWidth
            type="number"
            name="bathrooms"
            label="Number of Bathrooms"
            value={property.bathrooms}
            onChange={handleNumberChange}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            required
            fullWidth
            type="number"
            name="area"
            label="Area (sq ft)"
            value={property.area}
            onChange={handleNumberChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            required
            fullWidth
            type="number"
            name="rent"
            label="Monthly Rent"
            value={property.rent}
            onChange={handleNumberChange}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={4}
            name="description"
            label="Description"
            value={property.description}
            onChange={handleChange}
          />
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>Amenities</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {commonAmenities.map((amenity) => (
              <Chip
                key={amenity}
                label={amenity}
                onClick={() => handleAmenityToggle(amenity)}
                color={property.amenities.includes(amenity) ? 'primary' : 'default'}
              />
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              label="Custom Amenity"
              value={customAmenity}
              onChange={(e) => setCustomAmenity(e.target.value)}
            />
            <Button
              variant="outlined"
              onClick={handleAddCustomAmenity}
              disabled={!customAmenity}
            >
              Add
            </Button>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>Images</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            {property.images.map((image, index) => (
              <Box key={index} sx={{ position: 'relative' }}>
                <img
                  src={image}
                  alt={`Property ${index + 1}`}
                  style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 4 }}
                />
                <IconButton
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    bgcolor: 'background.paper',
                    '&:hover': { bgcolor: 'background.paper' }
                  }}
                  onClick={() => handleRemoveImage(index)}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </IconButton>
              </Box>
            ))}
          </Box>
          <Button
            variant="outlined"
            component="label"
            startIcon={<FontAwesomeIcon icon={faUpload} />}
          >
            Upload Images
            <input
              type="file"
              hidden
              multiple
              accept="image/*"
              onChange={handleImageUpload}
            />
          </Button>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth required>
            <InputLabel>Rental Type</InputLabel>
            <Select
              name="rentalType"
              value={property.rentalType || 'management'}
              label="Rental Type"
              onChange={e => {
                const value = e.target.value as 'management' | 'introduction';
                setProperty(prev => ({ ...prev, rentalType: value, commission: undefined })); // Reset commission to trigger default
              }}
            >
              {rentalTypes.map(rt => (
                <MenuItem key={rt.value} value={rt.value}>{rt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            required
            fullWidth
            type="number"
            name="commission"
            label="Commission (%)"
            value={property.commission ?? ''}
            onChange={e => setProperty(prev => ({ ...prev, commission: Number(e.target.value) }))}
            inputProps={{ min: 0, max: 100, step: 0.1 }}
            helperText={
              property.rentalType === 'management'
                ? (property.type === 'commercial' ? 'Default: 10% for commercial' : 'Default: 15% for residential')
                : 'Default: 100% for introduction'
            }
          />
        </Grid>

        <Grid item xs={12}>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
          >
            {initialData ? 'Update Property' : 'Add Property'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PropertyForm; 