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
  LinearProgress,
  Stack,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  RestoreFromTrash as RestoreFromTrashIcon,
} from '@mui/icons-material';
import { Property, PropertyFormData } from '../../types/property';
import PropertyForm from './PropertyForm';
import { WorkflowStatusChip } from '../rentalWorkflow';
import { getWorkflowId, PropertyWorkflowState } from '../../utils/rentalWorkflow';

interface PropertyListProps {
  properties: Property[];
  onPropertyClick: (property: Property) => void;
  onDeleteProperty: (propertyId: string) => void;
  onAddProperty: () => void;
  // Optional, for admin dashboard customizations
  isAdminRoute?: boolean;
  agentNamesById?: Record<string, string>;
  isDeletedView?: boolean;
  workflowStatesByProperty?: Record<string, PropertyWorkflowState>;
}

const PropertyList: React.FC<PropertyListProps> = ({
  properties,
  onPropertyClick,
  onDeleteProperty,
  onAddProperty,
  isAdminRoute,
  agentNamesById,
  isDeletedView = false,
  workflowStatesByProperty = {},
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
        <Typography variant="h4">{isDeletedView ? 'Deleted Properties' : 'Properties'}</Typography>
        {!isDeletedView && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onAddProperty}
          >
            Add Property
          </Button>
        )}
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{isAdminRoute ? 'Agent' : 'Name'}</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>{isAgentRoute ? 'Rent' : 'Amount'}</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Setup</TableCell>
              <TableCell>Bedrooms</TableCell>
              <TableCell>Bathrooms</TableCell>
              <TableCell>Area</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.map((property) => {
              const workflowState = workflowStatesByProperty[getWorkflowId(property._id)];
              return (
              <TableRow
                key={property._id}
                onClick={() => !isDeletedView && !isAgentRoute && property.status === 'available' && handleEditClick(property)}
                sx={{ 
                  cursor: !isDeletedView && !isAgentRoute && property.status === 'available' ? 'pointer' : 'default',
                  '&:hover': {
                    backgroundColor: !isDeletedView && !isAgentRoute && property.status === 'available' ? 'action.hover' : 'inherit'
                  }
                }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {isAgentRoute ? (
                    <Link to={`/agent-dashboard/properties/${property._id}`} style={{ textDecoration: 'none' }}>
                      {property.name}
                    </Link>
                  ) : isAdminRoute ? (
                    <Box>
                      <Typography variant="subtitle2">
                        {(agentNamesById && agentNamesById[String((property as any).__ownerIdStr || '')]) || 'Unassigned'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {property.name}
                      </Typography>
                    </Box>
                  ) : property.name}
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
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {workflowState ? (
                    <Box sx={{ minWidth: 170 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                        <WorkflowStatusChip status={workflowState.status} />
                        <Typography variant="caption" color="text.secondary">
                          {workflowState.completion}%
                        </Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={workflowState.completion} sx={{ height: 6, borderRadius: 3 }} />
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                        {workflowState.quickActions.slice(0, 3).map((action) => (
                          <Button
                            key={`${property._id}-${action.label}`}
                            size="small"
                            variant={action.intent === 'primary' ? 'contained' : 'outlined'}
                            component={Link}
                            to={action.path}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </Stack>
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary">Not tracked</Typography>
                  )}
                </TableCell>
                <TableCell>{property.bedrooms}</TableCell>
                <TableCell>{property.bathrooms}</TableCell>
                <TableCell>{property.area} sq ft</TableCell>
                <TableCell>
                  {!isDeletedView && (
                    <>
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
                    </>
                  )}
                  {isDeletedView && (
                    <IconButton onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProperty(property._id);
                    }}>
                      <RestoreFromTrashIcon />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
              );
            })}
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