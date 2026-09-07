import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  FormControlLabel,
  Switch,
  Typography,
  Paper,
  SelectChangeEvent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Property } from '../../types/property';
import { Tenant } from '../../types/tenant';
import { LeaseFormData } from '../../types/lease';

function getId(id: unknown): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object') {
    const obj = id as { $oid?: string; _id?: unknown };
    if (obj.$oid) return String(obj.$oid);
    if (obj._id) return getId(obj._id);
  }
  return String(id);
}

function getPropertyRent(property?: Property | null): number {
  if (!property) return 0;
  const specs = ((property as any).propertySpecifications || {}) as Record<string, unknown>;
  const rent = Number(
    (property as any).rent ??
    (property as any).monthlyRent ??
    specs.monthlyRent ??
    specs.expectedRent ??
    0
  );
  return Number.isFinite(rent) && rent > 0 ? rent : 0;
}

function tenantLinkedPropertyIds(tenant?: Tenant): string[] {
  if (!tenant) return [];
  const single = getId((tenant as any).propertyId);
  const multi = Array.isArray((tenant as any).propertyIds)
    ? ((tenant as any).propertyIds as unknown[]).map(getId)
    : [];
  return [single, ...multi].filter(Boolean);
}

function findTenantsForProperty(tenants: Tenant[], propertyId: string): Tenant[] {
  const id = getId(propertyId);
  if (!id) return [];
  return tenants.filter((tenant) => tenantLinkedPropertyIds(tenant).includes(id));
}

function preferredTenant(linkedTenants: Tenant[]): Tenant | undefined {
  return linkedTenants.find((tenant) => tenant.status === 'Active') || linkedTenants[0];
}

function rentDefaults(property?: Property | null) {
  const rent = getPropertyRent(property);
  return {
    monthlyRent: rent,
    rentAmount: rent,
    // Deposit defaults to one month's rent and remains independently editable afterwards.
    securityDeposit: rent,
    depositAmount: rent,
  };
}

const emptyFormData: LeaseFormData = {
  propertyId: '',
  tenantId: '',
  startDate: '',
  endDate: '',
  rentAmount: 0,
  depositAmount: 0,
  status: 'active',
  monthlyRent: 0,
  securityDeposit: 0,
  petDeposit: 0,
  isPetAllowed: false,
  maxOccupants: 1,
  isUtilitiesIncluded: false,
  utilitiesDetails: '',
  rentDueDay: 1,
  lateFee: 0,
  gracePeriod: 0,
};

interface LeaseFormProps {
  open: boolean;
  properties: Property[];
  tenants: Tenant[];
  initialData?: LeaseFormData;
  onSubmit: (data: LeaseFormData) => void;
  onCancel: () => void;
}

const LeaseForm: React.FC<LeaseFormProps> = ({
  open,
  properties,
  tenants,
  initialData,
  onSubmit,
  onCancel,
}) => {
  const [formData, setFormData] = useState<LeaseFormData>(emptyFormData);

  useEffect(() => {
    if (!open) return;

    if (initialData) {
      const monthlyRent = Number(initialData.monthlyRent ?? initialData.rentAmount ?? 0) || 0;
      const securityDeposit = Number(initialData.securityDeposit ?? initialData.depositAmount ?? 0) || 0;
      setFormData({
        ...emptyFormData,
        ...initialData,
        propertyId: getId(initialData.propertyId),
        tenantId: getId(initialData.tenantId),
        startDate: initialData.startDate && !isNaN(new Date(initialData.startDate).getTime())
          ? initialData.startDate
          : '',
        endDate: initialData.endDate && !isNaN(new Date(initialData.endDate).getTime())
          ? initialData.endDate
          : '',
        monthlyRent,
        rentAmount: monthlyRent,
        securityDeposit,
        depositAmount: securityDeposit,
      });
      return;
    }

    setFormData(emptyFormData);
  }, [open, initialData]);

  const handlePropertyChange = (e: SelectChangeEvent) => {
    const propertyId = getId(e.target.value);
    const selectedProperty = properties.find((property) => getId(property._id) === propertyId);
    const linkedTenant = preferredTenant(findTenantsForProperty(tenants, propertyId));

    setFormData((prev) => ({
      ...prev,
      propertyId,
      tenantId: linkedTenant ? getId(linkedTenant._id) : '',
      ...rentDefaults(selectedProperty),
    }));
  };

  const handleTenantChange = (e: SelectChangeEvent) => {
    const tenantId = getId(e.target.value);
    const selectedTenant = tenants.find((tenant) => getId(tenant._id) === tenantId);
    const mappedPropertyId = tenantLinkedPropertyIds(selectedTenant)[0] || '';
    const selectedProperty = mappedPropertyId
      ? properties.find((property) => getId(property._id) === mappedPropertyId)
      : undefined;

    setFormData((prev) => ({
      ...prev,
      tenantId,
      propertyId: mappedPropertyId || prev.propertyId,
      ...(selectedProperty ? rentDefaults(selectedProperty) : {}),
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }> | SelectChangeEvent) => {
    const { name, value } = e.target;
    
    // Handle numeric fields properly
    const numericFields = ['monthlyRent', 'securityDeposit', 'petDeposit', 'maxOccupants', 'rentDueDay', 'lateFee', 'gracePeriod'];
    const processedValue = numericFields.includes(name as string) ? Number(value) : value;
    
    setFormData((prev) => {
      const updated = {
        ...prev,
        [name as string]: processedValue,
      };

      if (name === 'monthlyRent') {
        const nextRent = Number(processedValue) || 0;
        updated.rentAmount = nextRent;
        // Keep deposit aligned with rent until the user edits the deposit independently.
        if (prev.securityDeposit === prev.monthlyRent || prev.securityDeposit === prev.rentAmount) {
          updated.securityDeposit = nextRent;
          updated.depositAmount = nextRent;
        }
      }

      if (name === 'securityDeposit') {
        updated.depositAmount = Number(processedValue) || 0;
      }

      return updated;
    });
  };

  const handleSwitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        {initialData ? 'Edit Lease' : 'Create New Lease'}
      </DialogTitle>
      <DialogContent>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Box sx={{ pt: 2 }}>
            <form onSubmit={handleSubmit}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Property</InputLabel>
                    <Select
                      name="propertyId"
                      value={getId(formData.propertyId)}
                      onChange={handlePropertyChange}
                      required
                    >
                      {properties.map((property) => (
                        <MenuItem key={getId(property._id)} value={getId(property._id)}>
                          {property.address}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Tenant</InputLabel>
                    <Select
                      name="tenantId"
                      value={getId(formData.tenantId)}
                      onChange={handleTenantChange}
                      required
                    >
                      {tenants.map((tenant) => (
                        <MenuItem key={getId(tenant._id)} value={getId(tenant._id)}>
                          {tenant.firstName} {tenant.lastName}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <DatePicker
                    label="Start Date"
                    value={formData.startDate && !isNaN(new Date(formData.startDate).getTime()) 
                      ? new Date(formData.startDate) 
                      : null}
                    onChange={(date) => {
                      setFormData((prev) => ({
                        ...prev,
                        startDate: date ? date.toISOString() : '',
                      }));
                    }}
                    slotProps={{ textField: { fullWidth: true, required: true } }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <DatePicker
                    label="End Date"
                    value={formData.endDate && !isNaN(new Date(formData.endDate).getTime()) 
                      ? new Date(formData.endDate) 
                      : null}
                    onChange={(date) => {
                      setFormData((prev) => ({
                        ...prev,
                        endDate: date ? date.toISOString() : '',
                      }));
                    }}
                    slotProps={{ textField: { fullWidth: true, required: true } }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Monthly Rent"
                    name="monthlyRent"
                    type="number"
                    value={formData.monthlyRent}
                    onChange={handleChange}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Security Deposit"
                    name="securityDeposit"
                    type="number"
                    value={formData.securityDeposit}
                    onChange={handleChange}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Pet Deposit"
                    name="petDeposit"
                    type="number"
                    value={formData.petDeposit}
                    onChange={handleChange}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Maximum Occupants"
                    name="maxOccupants"
                    type="number"
                    value={formData.maxOccupants}
                    onChange={handleChange}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        name="isPetAllowed"
                        checked={formData.isPetAllowed}
                        onChange={handleSwitchChange}
                      />
                    }
                    label="Pets Allowed"
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        name="isUtilitiesIncluded"
                        checked={formData.isUtilitiesIncluded}
                        onChange={handleSwitchChange}
                      />
                    }
                    label="Utilities Included"
                  />
                </Grid>

                {formData.isUtilitiesIncluded && (
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Utilities Details"
                      name="utilitiesDetails"
                      value={formData.utilitiesDetails}
                      onChange={handleChange}
                      multiline
                      rows={2}
                    />
                  </Grid>
                )}

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Rent Due Day"
                    name="rentDueDay"
                    type="number"
                    value={formData.rentDueDay}
                    onChange={handleChange}
                    required
                    inputProps={{ min: 1, max: 31 }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Late Fee"
                    name="lateFee"
                    type="number"
                    value={formData.lateFee}
                    onChange={handleChange}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Grace Period (days)"
                    name="gracePeriod"
                    type="number"
                    value={formData.gracePeriod}
                    onChange={handleChange}
                    required
                  />
                </Grid>
              </Grid>
            </form>
          </Box>
        </LocalizationProvider>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary">
          {initialData ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LeaseForm; 