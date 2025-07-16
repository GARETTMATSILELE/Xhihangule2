import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Alert,
  Chip,
  IconButton
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

const propertyTypes = [
  'apartment',
  'house',
  'commercial'
];

const amenities = [
  'Parking',
  'Pool',
  'Gym',
  'Security',
  'Elevator',
  'Air Conditioning',
  'Heating',
  'Washer/Dryer',
  'Dishwasher',
  'Balcony',
  'Garden',
  'Pet Friendly'
];

const rentalTypes = [
  { value: 'management', label: 'Management' },
  { value: 'introduction', label: 'Introduction' }
];

const CreateProperty: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: '',
    rent: '',
    bedrooms: '',
    bathrooms: '',
    area: '',
    description: '',
    images: [''],
    selectedAmenities: [] as string[],
    rentalType: 'management',
    commission: 15
  });
  const [error, setError] = useState('');

  // Add effect to update commission default when rentalType or type changes
  React.useEffect(() => {
    let defaultCommission = 15;
    if (formData.rentalType === 'management') {
      if (formData.type === 'commercial') defaultCommission = 10;
      else defaultCommission = 15;
    } else if (formData.rentalType === 'introduction') {
      defaultCommission = 100;
    }
    setFormData(prev => ({ ...prev, commission: prev.commission !== undefined && prev.commission !== null && prev.commission !== 0 ? prev.commission : defaultCommission }));
    // Only set if not already set by user
    // eslint-disable-next-line
  }, [formData.rentalType, formData.type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (index: number, value: string) => {
    const newImages = [...formData.images];
    newImages[index] = value;
    setFormData(prev => ({
      ...prev,
      images: newImages
    }));
  };

  const addImageField = () => {
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, '']
    }));
  };

  const removeImageField = (index: number) => {
    const newImages = formData.images.filter((_, i) => i !== index);
    setFormData(prev => ({
      ...prev,
      images: newImages
    }));
  };

  const handleAmenityToggle = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      selectedAmenities: prev.selectedAmenities.includes(amenity)
        ? prev.selectedAmenities.filter(a => a !== amenity)
        : [...prev.selectedAmenities, amenity]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be logged in to create a property');
      return;
    }

    if (!['admin', 'owner'].includes(user?.role || '')) {
      setError('Access denied. Admin or Owner role required to create properties.');
      return;
    }

    // Only validate name and address
    if (!formData.name || !formData.address) {
      setError('Property name and address are required');
      return;
    }

    try {
      const propertyData = {
        name: formData.name,
        address: formData.address,
        type: formData.type || 'apartment', // Set default type
        rent: formData.rent ? Number(formData.rent) : 0,
        bedrooms: formData.bedrooms ? Number(formData.bedrooms) : 0,
        bathrooms: formData.bathrooms ? Number(formData.bathrooms) : 0,
        area: formData.area ? Number(formData.area) : 0,
        description: formData.description || 'N/A', // Set default description
        images: formData.images.filter(img => img.trim() !== ''),
        amenities: formData.selectedAmenities,
        status: 'available',
        ownerId: user._id, // Ensure ownerId is set from the current user
        rentalType: formData.rentalType,
        commission: formData.commission
      };

      console.log('Current user:', user);
      console.log('Form data:', formData);
      console.log('Sending property data:', JSON.stringify(propertyData, null, 2));
      
      const response = await apiService.createProperty(propertyData);
      console.log('Server response:', response);
      
      navigate('/owner/dashboard');
    } catch (err: any) {
      console.error('Error creating property:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        headers: err.response?.headers,
        request: {
          url: err.config?.url,
          method: err.config?.method,
          data: err.config?.data,
          headers: err.config?.headers
        }
      });
      setError(err.response?.data?.message || err.response?.data?.details || 'Error creating property');
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Add New Property
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Property Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Address"
                name="address"
                value={formData.address}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Property Type"
                name="type"
                value={formData.type}
                onChange={handleChange}
              >
                {propertyTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Rental Type"
                name="rentalType"
                value={formData.rentalType}
                onChange={handleChange}
              >
                {rentalTypes.map(rt => (
                  <MenuItem key={rt.value} value={rt.value}>{rt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Monthly Rent"
                name="rent"
                type="number"
                value={formData.rent}
                onChange={handleChange}
                InputProps={{
                  startAdornment: '$'
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                type="number"
                name="commission"
                label="Commission (%)"
                value={formData.commission ?? ''}
                onChange={handleChange}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
                helperText={
                  formData.rentalType === 'management'
                    ? (formData.type === 'commercial' ? 'Default: 10% for commercial' : 'Default: 15% for residential')
                    : 'Default: 100% for introduction'
                }
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Bedrooms"
                name="bedrooms"
                type="number"
                value={formData.bedrooms}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Bathrooms"
                name="bathrooms"
                type="number"
                value={formData.bathrooms}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Area (sq ft)"
                name="area"
                type="number"
                value={formData.area}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Property Images
              </Typography>
              {formData.images.map((image, index) => (
                <Box key={index} sx={{ display: 'flex', mb: 1 }}>
                  <TextField
                    fullWidth
                    label={`Image URL ${index + 1}`}
                    value={image}
                    onChange={(e) => handleImageChange(index, e.target.value)}
                  />
                  <IconButton
                    onClick={() => removeImageField(index)}
                    disabled={formData.images.length === 1}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={addImageField}
                sx={{ mt: 1 }}
              >
                Add Image
              </Button>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Amenities
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {amenities.map((amenity) => (
                  <Chip
                    key={amenity}
                    label={amenity}
                    onClick={() => handleAmenityToggle(amenity)}
                    color={formData.selectedAmenities.includes(amenity) ? 'primary' : 'default'}
                    clickable
                  />
                ))}
              </Box>
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/owner/dashboard')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!formData.name || !formData.address}
                >
                  Create Property
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  );
};

export default CreateProperty; 