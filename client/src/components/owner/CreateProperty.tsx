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
  IconButton,
  Checkbox,
  FormControlLabel,
  Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  derivePropertyCategory,
  derivePropertySubtype,
  AMENITIES_BY_CATEGORY,
  PROPERTY_CATEGORIES,
  PROPERTY_OPERATIONAL_STATUSES,
  PROPERTY_TEMPLATES,
  PROPERTY_USES,
  getLegacyTypeForCategory,
  getSpecificationFields,
  getSubtypesForCategory,
  type PropertyCategory,
} from '../../utils/propertyClassification';

const rentalTypes = [
  { value: 'management', label: 'Management' },
  { value: 'introduction', label: 'Introduction' }
];
const recoveryMethods = ['Owner Paid', 'Tenant Recoverable', 'Included in Rent'];

const CreateProperty: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: '',
    propertyCategory: 'Residential' as PropertyCategory,
    propertySubtype: 'Apartment',
    propertySpecifications: {} as Record<string, any>,
    propertyOperationalStatus: 'Vacant',
    propertyUse: 'Rental',
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
    setFormData(prev => {
      const next: any = { ...prev, [name]: value };
      if (name === 'type') {
        const cat = derivePropertyCategory({ propertyType: value });
        const allowed = getSubtypesForCategory(cat);
        const subtype = allowed.includes(String(next.propertySubtype))
          ? String(next.propertySubtype)
          : derivePropertySubtype({ propertySubtype: next.propertySubtype, propertyType: value, propertyCategory: cat });
        next.propertyCategory = cat;
        next.propertySubtype = subtype;
      }
      return next;
    });
  };

  const effectiveCategory = derivePropertyCategory({
    propertyCategory: formData.propertyCategory,
    propertyType: formData.type || 'apartment',
  });
  const effectiveSubtype = derivePropertySubtype({
    propertySubtype: formData.propertySubtype,
    propertyType: formData.type || 'apartment',
    propertyCategory: effectiveCategory,
  });
  const specificationFields = getSpecificationFields(effectiveCategory, effectiveSubtype);
  const categoryAmenities = AMENITIES_BY_CATEGORY[effectiveCategory] || [];

  const handleCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value as PropertyCategory;
    const subtype = derivePropertySubtype({
      propertySubtype: formData.propertySubtype,
      propertyType: formData.type || 'apartment',
      propertyCategory: value,
    });
    setFormData(prev => ({
      ...prev,
      type: getLegacyTypeForCategory(value, subtype),
      propertyCategory: value,
      propertySubtype: subtype,
    }));
  };

  const handleSubtypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({
      ...prev,
      type: getLegacyTypeForCategory(effectiveCategory, value),
      propertySubtype: value,
    }));
  };

  const updateSpecification = (key: string, value: unknown) => {
    setFormData(prev => {
      const next: any = {
        ...prev,
        propertySpecifications: {
          ...(prev.propertySpecifications || {}),
          [key]: value,
        },
      };
      if (key === 'bedrooms') next.bedrooms = String(value ?? '');
      if (key === 'bathrooms') next.bathrooms = String(value ?? '');
      if (key === 'floorArea') next.area = String(value ?? '');
      return next;
    });
  };

  const applyTemplate = (templateName: string) => {
    const template = PROPERTY_TEMPLATES.find(t => t.name === templateName);
    if (!template) return;

    setFormData(prev => ({
      ...prev,
      type: template.type,
      propertyCategory: template.category,
      propertySubtype: template.subtype,
      propertySpecifications: {
        ...(prev.propertySpecifications || {}),
        ...template.specifications,
      },
      selectedAmenities: Array.from(new Set([...(prev.selectedAmenities || []), ...template.amenities])),
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
      const effectiveCategory = derivePropertyCategory({
        propertyCategory: (formData as any).propertyCategory,
        propertyType: (formData as any).type || 'apartment',
      });
      const effectiveSubtype = derivePropertySubtype({
        propertySubtype: (formData as any).propertySubtype,
        propertyType: (formData as any).type || 'apartment',
        propertyCategory: effectiveCategory,
      });

      const propertyData = {
        name: formData.name,
        address: formData.address,
        type: formData.type || getLegacyTypeForCategory(effectiveCategory, effectiveSubtype), // Preserve legacy type contract
        propertyCategory: effectiveCategory,
        propertySubtype: effectiveSubtype,
        propertySpecifications: formData.propertySpecifications || {},
        propertyOperationalStatus: formData.propertyOperationalStatus || 'Vacant',
        propertyUse: formData.propertyUse || 'Rental',
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
                label="Category"
                name="propertyCategory"
                value={effectiveCategory}
                onChange={handleCategoryChange}
              >
                {PROPERTY_CATEGORIES.map(category => (
                  <MenuItem key={category} value={category}>{category}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Subtype"
                name="propertySubtype"
                value={effectiveSubtype}
                onChange={handleSubtypeChange}
              >
                {getSubtypesForCategory(effectiveCategory).map(st => (
                  <MenuItem key={st} value={st}>{st}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>Templates</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {PROPERTY_TEMPLATES.map(template => (
                  <Chip
                    key={template.name}
                    label={template.name}
                    onClick={() => applyTemplate(template.name)}
                    variant="outlined"
                    clickable
                  />
                ))}
              </Box>
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
              <Divider sx={{ my: 1 }} />
              <Typography variant="h6" gutterBottom>Specifications</Typography>
            </Grid>
            {specificationFields.map(field => (
              <Grid item xs={12} sm={field.type === 'boolean' ? 6 : 4} key={field.key}>
                {field.type === 'boolean' ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(formData.propertySpecifications[field.key])}
                        onChange={e => updateSpecification(field.key, e.target.checked)}
                      />
                    }
                    label={field.label}
                  />
                ) : (
                  <TextField
                    fullWidth
                    type={field.type === 'number' ? 'number' : 'text'}
                    label={field.label}
                    value={formData.propertySpecifications[field.key] ?? ''}
                    onChange={e => updateSpecification(
                      field.key,
                      field.type === 'number' ? Number(e.target.value || 0) : e.target.value
                    )}
                  />
                )}
              </Grid>
            ))}

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="h6" gutterBottom>Utilities</Typography>
            </Grid>
            {[
              ['levyApplicable', 'Levy Applicable'],
              ['municipalFeesApplicable', 'Municipal Fees Applicable'],
              ['hasSolar', 'Solar Installed'],
              ['hasGenerator', 'Generator Installed'],
            ].map(([key, label]) => (
              <Grid item xs={12} sm={6} key={key}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={Boolean(formData.propertySpecifications[key])}
                      onChange={e => updateSpecification(key, e.target.checked)}
                    />
                  }
                  label={label}
                />
              </Grid>
            ))}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Water Meter Number"
                value={formData.propertySpecifications.waterMeterNumber ?? ''}
                onChange={e => updateSpecification('waterMeterNumber', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Electricity Meter Number"
                value={formData.propertySpecifications.electricityMeterNumber ?? ''}
                onChange={e => updateSpecification('electricityMeterNumber', e.target.value)}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="h6" gutterBottom>Rental Settings</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Expected Rent"
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
                fullWidth
                type="number"
                label="Deposit Amount"
                value={formData.propertySpecifications.depositAmount ?? formData.propertySpecifications.securityDeposit ?? ''}
                onChange={e => {
                  const value = Number(e.target.value || 0);
                  updateSpecification('depositAmount', value);
                  updateSpecification('securityDeposit', value);
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Inspection Frequency"
                value={formData.propertySpecifications.inspectionFrequency ?? 'Annual'}
                onChange={e => updateSpecification('inspectionFrequency', e.target.value)}
              >
                {['Monthly', 'Quarterly', 'Biannual', 'Annual'].map(option => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Levy Recovery Method"
                value={formData.propertySpecifications.levyRecoveryMethod ?? 'Owner Paid'}
                onChange={e => updateSpecification('levyRecoveryMethod', e.target.value)}
              >
                {recoveryMethods.map(option => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Municipal Recovery Method"
                value={formData.propertySpecifications.municipalRecoveryMethod ?? 'Owner Paid'}
                onChange={e => updateSpecification('municipalRecoveryMethod', e.target.value)}
              >
                {recoveryMethods.map(option => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
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
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Operational Status"
                value={formData.propertyOperationalStatus}
                onChange={e => setFormData(prev => ({ ...prev, propertyOperationalStatus: e.target.value }))}
              >
                {PROPERTY_OPERATIONAL_STATUSES.map(status => (
                  <MenuItem key={status} value={status}>{status}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Property Use"
                value={formData.propertyUse}
                onChange={e => setFormData(prev => ({ ...prev, propertyUse: e.target.value }))}
              >
                {PROPERTY_USES.map(use => (
                  <MenuItem key={use} value={use}>{use}</MenuItem>
                ))}
              </TextField>
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
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>
                Amenities
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {categoryAmenities.map((amenity) => (
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