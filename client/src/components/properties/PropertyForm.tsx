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
  Switch,
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
      commission: individualMode ? 0 : 15,
      vatOnCommission: false,
      vatCommissionTreatment: 'exclusive'
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
  const [advancedTaxOpen, setAdvancedTaxOpen] = useState(false);

  // Add effect to update commission default when rentalType or property.type changes
  React.useEffect(() => {
    if (individualMode) return;
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
  }, [property.rentalType, property.type, individualMode]);

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
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="h6" gutterBottom>Financial Settings</Typography>
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
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="h6" gutterBottom>VAT on Commission</Typography>
            </Grid>
            {!(company as any)?.taxProfile?.vatRegistered && (
              <Grid item xs={12}>
                <Alert severity="warning">VAT NOT ACTIVE. This property checkbox cannot activate VAT until company VAT registration is configured.</Alert>
              </Grid>
            )}
            {(company as any)?.taxProfile?.vatRegistered && (company as any)?.taxProfile?.vatRegistrationEffectiveDate && (
              <Grid item xs={12}>
                <Alert severity="info">
                  VAT ACTIVE FROM {String((company as any).taxProfile.vatRegistrationEffectiveDate).slice(0, 10)}.
                  {property.vatOnCommission && new Date() < new Date((company as any).taxProfile.vatRegistrationEffectiveDate) ? (
                    <> Company VAT registration is not active on this transaction date.</>
                  ) : null}
                </Alert>
              </Grid>
            )}
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(property.vatOnCommission)}
                    onChange={e => {
                      const checked = e.target.checked;
                      const effective = (company as any)?.taxProfile?.vatRegistrationEffectiveDate;
                      if (checked && (company as any)?.taxProfile?.vatRegistered && effective && new Date() < new Date(effective)) {
                        setError('Company VAT registration is not active on this transaction date.');
                      }
                      setProperty(prev => ({
                        ...prev,
                        vatOnCommission: checked,
                        vatCommissionTreatment: checked ? (prev.vatCommissionTreatment || 'exclusive') : undefined
                      }));
                    }}
                  />
                }
                label={property.vatOnCommission ? 'VAT on Commission: ON' : 'VAT on Commission: OFF'}
              />
            </Grid>
            {property.vatOnCommission && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>VAT Treatment</InputLabel>
                  <Select
                    label="VAT Treatment"
                    value={property.vatCommissionTreatment || 'exclusive'}
                    onChange={e => setProperty(prev => ({
                      ...prev,
                      vatCommissionTreatment: e.target.value as 'inclusive' | 'exclusive'
                    }))}
                  >
                    <MenuItem value="exclusive">Exclusive — VAT is added on top of commission</MenuItem>
                    <MenuItem value="inclusive">Inclusive — commission already includes VAT</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                The national VAT percentage is centrally managed by Mantis and is applied from the payment date. It cannot be edited on the property.
              </Typography>
              {property.vatOnCommission && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  {property.vatCommissionTreatment === 'inclusive'
                    ? 'Inclusive: the owner deduction stays at the commission amount; VAT is extracted from it.'
                    : 'Exclusive: VAT is added on top of commission and deducted from the owner.'}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                VAT is charged only if the company is VAT registered on the payment date and the supply is taxable. This flag alone does not create VAT.
              </Typography>
            </Grid>
          </>
        )}

        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
          <Button
            type="button"
            variant="outlined"
            onClick={() => setAdvancedTaxOpen((open) => !open)}
            aria-expanded={advancedTaxOpen}
            sx={{ textTransform: 'none' }}
          >
            Advanced tax settings
          </Button>
        </Grid>
        {advancedTaxOpen && (
          <>
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>Property tax classification</Typography>
          {individualMode && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Commercial rental is not automatically VAT-exempt. If the treatment is uncertain, leave Accountant review. This is a working-paper classification, not a ZIMRA filing.
            </Alert>
          )}
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Use class</InputLabel>
            <Select
              label="Use class"
              value={property.propertyUseClass || (property.type === 'commercial' ? 'COMMERCIAL' : 'RESIDENTIAL_DWELLING')}
              onChange={(e) => setProperty(prev => ({
                ...prev,
                propertyUseClass: e.target.value as PropertyFormData['propertyUseClass']
              }))}
            >
              <MenuItem value="RESIDENTIAL_DWELLING">Residential dwelling rental</MenuItem>
              <MenuItem value="COMMERCIAL">Commercial rental</MenuItem>
              <MenuItem value="MIXED_USE">Mixed-use</MenuItem>
              <MenuItem value="SHORT_TERM_ACCOMMODATION">Short-term accommodation</MenuItem>
              {!individualMode && <MenuItem value="SALE">Property sale</MenuItem>}
              {!individualMode && <MenuItem value="OTHER_SERVICE">Other service</MenuItem>}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Rental / supply VAT treatment</InputLabel>
            <Select
              label="Rental / supply VAT treatment"
              value={property.vatSupplyTreatment || 'ACCOUNTANT_REVIEW'}
              onChange={(e) => setProperty(prev => ({
                ...prev,
                vatSupplyTreatment: e.target.value as PropertyFormData['vatSupplyTreatment']
              }))}
            >
              <MenuItem value="EXEMPT">Exempt</MenuItem>
              <MenuItem value="STANDARD_TAXABLE">Standard taxable</MenuItem>
              <MenuItem value="ZERO_RATED">Zero-rated</MenuItem>
              <MenuItem value="OUT_OF_SCOPE">Out of scope</MenuItem>
              <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="VAT treatment effective from"
            value={property.vatEffectiveFrom ? String(property.vatEffectiveFrom).slice(0, 10) : ''}
            onChange={(e) => setProperty(prev => ({ ...prev, vatEffectiveFrom: e.target.value || undefined }))}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="VAT treatment effective to"
            value={property.vatEffectiveTo ? String(property.vatEffectiveTo).slice(0, 10) : ''}
            onChange={(e) => setProperty(prev => ({ ...prev, vatEffectiveTo: e.target.value || undefined }))}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Rental tax treatment</InputLabel>
            <Select
              label="Rental tax treatment"
              value={property.rentalTaxTreatment || 'ACCOUNTANT_REVIEW'}
              onChange={(e) => setProperty(prev => ({
                ...prev,
                rentalTaxTreatment: e.target.value as PropertyFormData['rentalTaxTreatment']
              }))}
            >
              <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
              <MenuItem value="SELF_ASSESSMENT">Self-assessment</MenuItem>
              <MenuItem value="PRESUMPTIVE_RENTAL">Presumptive rental income tax</MenuItem>
              <MenuItem value="EXEMPT">Exempt</MenuItem>
              <MenuItem value="NOT_APPLICABLE">Not applicable</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="Rental tax treatment effective from"
            value={property.rentalTaxEffectiveFrom ? String(property.rentalTaxEffectiveFrom).slice(0, 10) : ''}
            onChange={(e) => setProperty(prev => ({ ...prev, rentalTaxEffectiveFrom: e.target.value || undefined }))}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="number"
            label="Ownership %"
            value={property.ownershipPercentage ?? 100}
            onChange={(e) => setProperty(prev => ({ ...prev, ownershipPercentage: e.target.value === '' ? undefined : Number(e.target.value) }))}
            inputProps={{ min: 0, max: 100, step: 0.01 }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="number"
            label={individualMode ? 'Acquisition cost' : 'Acquisition cost (CGT)'}
            value={property.acquisitionCost ?? ''}
            onChange={(e) => setProperty(prev => ({ ...prev, acquisitionCost: e.target.value === '' ? undefined : Number(e.target.value) }))}
            helperText={individualMode ? 'Record keeping only. Depreciation is not calculated automatically.' : 'Required for Capital Gains Tax. Missing cost queues accountant review; CGT is not estimated from sale price.'}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="date"
            label="Acquisition date"
            value={property.acquisitionDate ? String(property.acquisitionDate).slice(0, 10) : ''}
            onChange={(e) => setProperty(prev => ({ ...prev, acquisitionDate: e.target.value || undefined }))}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            type="number"
            label="Improvement costs"
            value={property.improvementCosts ?? ''}
            onChange={(e) => setProperty(prev => ({ ...prev, improvementCosts: e.target.value === '' ? undefined : Number(e.target.value) }))}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Property tax notes"
            value={property.taxNotes || ''}
            onChange={(e) => setProperty(prev => ({ ...prev, taxNotes: e.target.value }))}
          />
        </Grid>

        {!individualMode && (
          <>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Sale VAT treatment</InputLabel>
                <Select
                  label="Sale VAT treatment"
                  value={property.saleVatTreatment || 'ACCOUNTANT_REVIEW'}
                  onChange={(e) => setProperty(prev => ({
                    ...prev,
                    saleVatTreatment: e.target.value as PropertyFormData['saleVatTreatment']
                  }))}
                >
                  <MenuItem value="EXEMPT">Exempt</MenuItem>
                  <MenuItem value="STANDARD_TAXABLE">Standard taxable</MenuItem>
                  <MenuItem value="ZERO_RATED">Zero-rated</MenuItem>
                  <MenuItem value="OUT_OF_SCOPE">Out of scope</MenuItem>
                  <MenuItem value="ACCOUNTANT_REVIEW">Accountant review</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="number"
                label="Qualifying expenses"
                value={property.qualifyingExpenses ?? ''}
                onChange={(e) => setProperty(prev => ({ ...prev, qualifyingExpenses: e.target.value === '' ? undefined : Number(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="number"
                label="Selling costs"
                value={property.sellingCosts ?? ''}
                onChange={(e) => setProperty(prev => ({ ...prev, sellingCosts: e.target.value === '' ? undefined : Number(e.target.value) }))}
              />
            </Grid>
          </>
        )}
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