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
  Checkbox,
  FormControlLabel,
  Divider,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faUpload } from '@fortawesome/free-solid-svg-icons';
import { Property, PropertyFormData } from '../../types/property';
import { useAuth } from '../../contexts/AuthContext';
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
import './PropertyForm.css';

interface PropertyFormProps {
  onSubmit: (property: PropertyFormData) => void;
  initialData?: Partial<Property>;
  onClose: () => void;
  individualMode?: boolean;
  submitting?: boolean;
}

const rentalTypes = [
  { value: 'management', label: 'Management' },
  { value: 'introduction', label: 'Introduction' }
];

const recoveryMethods = ['Owner Paid', 'Tenant Recoverable', 'Included in Rent'];

const PropertyForm: React.FC<PropertyFormProps> = ({ onSubmit, initialData, onClose, individualMode = false, submitting = false }) => {
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
      propertyCategory: 'Residential',
      propertySubtype: 'Apartment',
      propertySpecifications: {},
      propertyOperationalStatus: 'Vacant',
      propertyUse: 'Rental',
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
      const merged = {
        ...initialFormData,
        ...restInitialData,
      };
      return {
        ...merged,
        propertyCategory: derivePropertyCategory({
          propertyCategory: (merged as any).propertyCategory,
          propertyType: (merged as any).type,
        }),
        propertySubtype: derivePropertySubtype({
          propertySubtype: (merged as any).propertySubtype,
          propertyType: (merged as any).type,
          propertyCategory: (merged as any).propertyCategory,
        }),
      };
    }

    return {
      ...initialFormData,
      propertyCategory: derivePropertyCategory({ propertyType: initialFormData.type }),
      propertySubtype: derivePropertySubtype({ propertyType: initialFormData.type }),
    };
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
      type: property.type || getLegacyTypeForCategory(effectiveCategory, effectiveSubtype),
      propertyCategory: effectiveCategory,
      propertySubtype: (property as any).propertySubtype || effectiveSubtype,
      propertySpecifications: (property as any).propertySpecifications || {},
      propertyOperationalStatus: (property as any).propertyOperationalStatus || 'Vacant',
      propertyUse: (property as any).propertyUse || 'Rental',
      description: property.description || 'N/A',
      status: property.status || 'available',
      rent: property.rent || 0,
      bedrooms: property.bedrooms || 0,
      bathrooms: property.bathrooms || 0,
      area: property.area || 0,
      images: property.images || [],
      amenities: property.amenities || [],
      rentalType: individualMode ? 'management' : property.rentalType,
      commission: individualMode ? 0 : property.commission
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProperty((prev: PropertyFormData) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCategoryChange = (e: SelectChangeEvent<PropertyCategory>) => {
    const value = e.target.value as PropertyCategory;
    setProperty((prev: PropertyFormData) => {
      const allowed = getSubtypesForCategory(value);
      const nextSubtype = allowed.includes(String((prev as any).propertySubtype))
        ? String((prev as any).propertySubtype)
        : derivePropertySubtype({
            propertySubtype: (prev as any).propertySubtype,
            propertyType: (prev as any).type,
            propertyCategory: value,
          });
      return {
        ...prev,
        type: getLegacyTypeForCategory(value, nextSubtype),
        propertyCategory: value,
        propertySubtype: nextSubtype,
      };
    });
  };

  const handleSubtypeChange = (e: SelectChangeEvent<string>) => {
    const value = e.target.value as string;
    setProperty((prev: PropertyFormData) => {
      const category = derivePropertyCategory({
        propertyCategory: (prev as any).propertyCategory,
        propertyType: (prev as any).type,
      });
      return {
        ...prev,
        type: getLegacyTypeForCategory(category, value),
        propertySubtype: value,
      };
    });
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProperty((prev: PropertyFormData) => ({
      ...prev,
      [name]: Number(value)
    }));
  };

  const effectiveCategory = derivePropertyCategory({
    propertyCategory: (property as any).propertyCategory,
    propertyType: (property as any).type,
  });
  const effectiveSubtype = derivePropertySubtype({
    propertySubtype: (property as any).propertySubtype,
    propertyType: (property as any).type,
    propertyCategory: effectiveCategory,
  });
  const subtypeOptions = getSubtypesForCategory(effectiveCategory);
  const propertySpecifications = ((property as any).propertySpecifications || {}) as Record<string, any>;
  const specificationFields = getSpecificationFields(effectiveCategory, effectiveSubtype);
  const categoryAmenities = AMENITIES_BY_CATEGORY[effectiveCategory] || [];

  const updateSpecification = (key: string, value: unknown) => {
    setProperty(prev => {
      const rootUpdates: Partial<PropertyFormData> = {};
      if (key === 'bedrooms' && typeof value === 'number') rootUpdates.bedrooms = value;
      if (key === 'bathrooms' && typeof value === 'number') rootUpdates.bathrooms = value;
      if (key === 'floorArea' && typeof value === 'number') rootUpdates.area = value;

      return {
        ...prev,
        ...rootUpdates,
        propertySpecifications: {
          ...(((prev as any).propertySpecifications || {}) as Record<string, unknown>),
          [key]: value,
        },
      };
    });
  };

  const applyTemplate = (templateName: string) => {
    const template = PROPERTY_TEMPLATES.find(t => t.name === templateName);
    if (!template) return;

    setProperty(prev => ({
      ...prev,
      type: template.type,
      propertyCategory: template.category,
      propertySubtype: template.subtype,
      propertySpecifications: {
        ...(((prev as any).propertySpecifications || {}) as Record<string, unknown>),
        ...template.specifications,
      },
      amenities: Array.from(new Set([...(prev.amenities || []), ...template.amenities])),
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
      {!individualMode && user && (
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
      {individualMode && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Add a rental property to your portfolio. You can link tenants, leases, and rent collection after saving.
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
            <InputLabel>Category</InputLabel>
            <Select
              name="propertyCategory"
              value={(property.propertyCategory as any) || effectiveCategory}
              label="Category"
              onChange={handleCategoryChange}
            >
              {PROPERTY_CATEGORIES.map(category => (
                <MenuItem key={category} value={category}>{category}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth required>
            <InputLabel>Subtype</InputLabel>
            <Select
              name="propertySubtype"
              value={(property.propertySubtype as any) || effectiveSubtype}
              label="Subtype"
              onChange={handleSubtypeChange}
            >
              {subtypeOptions.map(st => (
                <MenuItem key={st} value={st}>{st}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>Templates</Typography>
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
            required
            fullWidth
            name="address"
            label="Address"
            value={property.address}
            onChange={handleChange}
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
          <Divider sx={{ my: 1 }} />
          <Typography variant="h6" gutterBottom>Specifications</Typography>
        </Grid>
        {specificationFields.map(field => (
          <Grid item xs={12} sm={field.type === 'boolean' ? 6 : 4} key={field.key}>
            {field.type === 'boolean' ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={Boolean(propertySpecifications[field.key])}
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
                value={propertySpecifications[field.key] ?? ''}
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
        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(propertySpecifications.levyApplicable)}
                onChange={e => updateSpecification('levyApplicable', e.target.checked)}
              />
            }
            label="Levy Applicable"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(propertySpecifications.municipalFeesApplicable)}
                onChange={e => updateSpecification('municipalFeesApplicable', e.target.checked)}
              />
            }
            label="Municipal Fees Applicable"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Water Meter Number"
            value={propertySpecifications.waterMeterNumber ?? ''}
            onChange={e => updateSpecification('waterMeterNumber', e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Electricity Meter Number"
            value={propertySpecifications.electricityMeterNumber ?? ''}
            onChange={e => updateSpecification('electricityMeterNumber', e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(propertySpecifications.hasSolar)}
                onChange={e => updateSpecification('hasSolar', e.target.checked)}
              />
            }
            label="Solar Installed"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(propertySpecifications.hasGenerator || propertySpecifications.generator)}
                onChange={e => {
                  updateSpecification('hasGenerator', e.target.checked);
                  updateSpecification('generator', e.target.checked);
                }}
              />
            }
            label="Generator Installed"
          />
        </Grid>

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
          <Typography variant="h6" gutterBottom>Rental Settings</Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            required
            fullWidth
            type="number"
            name="rent"
            label="Expected Rent"
            value={property.rent}
            onChange={handleNumberChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="number"
            label="Deposit Amount"
            value={propertySpecifications.depositAmount ?? propertySpecifications.securityDeposit ?? ''}
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
            value={propertySpecifications.inspectionFrequency ?? 'Annual'}
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
            value={propertySpecifications.levyRecoveryMethod ?? 'Owner Paid'}
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
            value={propertySpecifications.municipalRecoveryMethod ?? 'Owner Paid'}
            onChange={e => updateSpecification('municipalRecoveryMethod', e.target.value)}
          >
            {recoveryMethods.map(option => (
              <MenuItem key={option} value={option}>{option}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Operational Status</InputLabel>
            <Select
              name="propertyOperationalStatus"
              label="Operational Status"
              value={(property as any).propertyOperationalStatus || 'Vacant'}
              onChange={e => setProperty(prev => ({ ...prev, propertyOperationalStatus: e.target.value as any }))}
            >
              {PROPERTY_OPERATIONAL_STATUSES.map(status => (
                <MenuItem key={status} value={status}>{status}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Property Use</InputLabel>
            <Select
              name="propertyUse"
              label="Property Use"
              value={(property as any).propertyUse || 'Rental'}
              onChange={e => setProperty(prev => ({ ...prev, propertyUse: e.target.value as any }))}
            >
              {PROPERTY_USES.map(use => (
                <MenuItem key={use} value={use}>{use}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl component="fieldset" fullWidth>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Levy/Municipal Fees</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant={property.levyOrMunicipalType === 'levy' ? 'contained' : 'outlined'}
                onClick={() => setProperty(prev => ({ ...prev, levyOrMunicipalType: 'levy' }))}
              >
                Levy
              </Button>
              <Button
                variant={property.levyOrMunicipalType === 'municipal' ? 'contained' : 'outlined'}
                onClick={() => setProperty(prev => ({ ...prev, levyOrMunicipalType: 'municipal' }))}
              >
                Municipal Fees
              </Button>
              <TextField
                type="number"
                label={property.levyOrMunicipalType === 'levy' ? 'Levy Amount' : 'Municipal Fees Amount'}
                value={property.levyOrMunicipalAmount || ''}
                onChange={e => setProperty(prev => ({ ...prev, levyOrMunicipalAmount: Number(e.target.value) }))}
                fullWidth
                disabled={!property.levyOrMunicipalType}
                sx={{ ml: 2, minWidth: 120 }}
              />
            </Box>
          </FormControl>
        </Grid>

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
          <Typography variant="h6" gutterBottom>Amenities</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {categoryAmenities.map((amenity) => (
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

        {!individualMode && (
          <>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Rental Type</InputLabel>
                <Select
                  name="rentalType"
                  value={property.rentalType || 'management'}
                  label="Rental Type"
                  onChange={e => {
                    const value = e.target.value as 'management' | 'introduction';
                    setProperty(prev => ({ ...prev, rentalType: value, commission: undefined }));
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
          </>
        )}

        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Button
              variant="outlined"
              color="secondary"
              onClick={onClose}
              sx={{ flex: 1 }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              sx={{ flex: 1 }}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : initialData ? 'Update Property' : 'Add Property'}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PropertyForm; 