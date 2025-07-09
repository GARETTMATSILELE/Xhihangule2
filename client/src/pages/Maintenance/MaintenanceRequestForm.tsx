import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Typography,
  Paper,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { MaintenanceRequest, MaintenancePriority, MaintenanceCategory, MaintenanceStatus } from '../../types/maintenance';
import { apiService } from '../../api';
import { useMaintenance } from '../../hooks/maintenance';
import { usePropertyService } from '../../services/propertyService';
import { Property } from '../../types/property';

interface MaintenanceRequestFormProps {
  open: boolean;
  onClose: () => void;
}

export const MaintenanceRequestForm: React.FC<MaintenanceRequestFormProps> = ({
  open,
  onClose,
}) => {
  const { createRequest } = useMaintenance();
  const propertyService = usePropertyService();
  const [formData, setFormData] = useState<Partial<MaintenanceRequest>>({
    propertyId: {
      _id: '',
      name: '',
      address: ''
    },
    category: MaintenanceCategory.GENERAL,
    description: '',
    priority: MaintenancePriority.MEDIUM,
    status: MaintenanceStatus.PENDING,
    ownerApprovalStatus: 'pending',
    estimatedCost: 0,
    accessWindow: {
      start: new Date(),
      end: new Date()
    },
    createdByName: '',
    comments: [],
    auditLog: [],
    attachments: [],
    messages: []
  });

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProperties();
    }
  }, [open]);

  const fetchProperties = async () => {
    try {
      setLoadingProperties(true);
      const properties = await propertyService.getPublicProperties();
      setProperties(properties);
    } catch (err) {
      console.error('Error fetching properties:', err);
    } finally {
      setLoadingProperties(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePropertyChange = (propertyId: string) => {
    const selectedProperty = properties.find(p => p._id === propertyId);
    if (selectedProperty) {
      setFormData(prev => ({
        ...prev,
        propertyId: {
          _id: selectedProperty._id,
          name: selectedProperty.name,
          address: selectedProperty.address
        }
      }));
    }
  };

  const handleAccessWindowChange = (field: 'start' | 'end', value: Date) => {
    setFormData(prev => {
      const newAccessWindow = {
        ...prev.accessWindow,
        [field]: value
      } as { start: Date; end: Date };
      
      return {
        ...prev,
        accessWindow: newAccessWindow
      };
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    try {
      setLoading(true);
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const response = await apiService.uploadFiles(formData);
      setFormData(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...response.data]
      }));
    } catch (err) {
      console.error('Error uploading files:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments?.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRequest(formData);
      onClose();
    } catch (err) {
      console.error('Error creating maintenance request:', err);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>New Maintenance Request</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Property</InputLabel>
                  <Select
                    value={formData.propertyId?._id || ''}
                    label="Property"
                    onChange={(e) => handlePropertyChange(e.target.value)}
                    required
                    disabled={loadingProperties}
                  >
                    {properties.map((property) => (
                      <MenuItem key={property._id} value={property._id}>
                        {property.name} - {property.address}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={formData.category}
                    label="Category"
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value as MaintenanceCategory })
                    }
                  >
                    <MenuItem value={MaintenanceCategory.GENERAL}>General</MenuItem>
                    <MenuItem value={MaintenanceCategory.PLUMBING}>Plumbing</MenuItem>
                    <MenuItem value={MaintenanceCategory.ELECTRICAL}>Electrical</MenuItem>
                    <MenuItem value={MaintenanceCategory.HVAC}>HVAC</MenuItem>
                    <MenuItem value={MaintenanceCategory.APPLIANCE}>Appliance</MenuItem>
                    <MenuItem value={MaintenanceCategory.STRUCTURAL}>Structural</MenuItem>
                    <MenuItem value={MaintenanceCategory.LANDSCAPING}>Landscaping</MenuItem>
                    <MenuItem value={MaintenanceCategory.OTHER}>Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Priority</InputLabel>
                  <Select
                    value={formData.priority}
                    label="Priority"
                    onChange={(e) =>
                      setFormData({ ...formData, priority: e.target.value as MaintenancePriority })
                    }
                  >
                    <MenuItem value={MaintenancePriority.LOW}>Low</MenuItem>
                    <MenuItem value={MaintenancePriority.MEDIUM}>Medium</MenuItem>
                    <MenuItem value={MaintenancePriority.HIGH}>High</MenuItem>
                    <MenuItem value={MaintenancePriority.URGENT}>Urgent</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                  fullWidth
                  multiline
                  rows={4}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Estimated Cost"
                  type="number"
                  value={formData.estimatedCost}
                  onChange={(e) =>
                    setFormData({ ...formData, estimatedCost: parseFloat(e.target.value) || 0 })
                  }
                  fullWidth
                  InputProps={{
                    startAdornment: <span>$</span>,
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Created By"
                  value={formData.createdByName}
                  onChange={(e) =>
                    setFormData({ ...formData, createdByName: e.target.value })
                  }
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Access Window Start"
                  value={formData.accessWindow?.start}
                  onChange={(date) => date && handleAccessWindowChange('start', date)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                    },
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Access Window End"
                  value={formData.accessWindow?.end}
                  onChange={(date) => date && handleAccessWindowChange('end', date)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                    },
                  }}
                />
              </Grid>
            </Grid>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="primary" disabled={loading}>
            Submit
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}; 