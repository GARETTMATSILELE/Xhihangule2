import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Chip,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { Property } from '../../types/property';

interface PropertyDetailProps {
  property: Property;
  onEdit: () => void;
  onAssignTenant: () => void;
}

const PropertyDetail: React.FC<PropertyDetailProps> = ({
  property,
  onEdit,
  onAssignTenant,
}) => {
  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h4">{property.name}</Typography>
            <Box>
              <Button variant="outlined" onClick={onEdit} sx={{ mr: 1 }}>
                Edit
              </Button>
              <Button 
                variant="contained" 
                color="primary"
                onClick={onAssignTenant}
                disabled={property.status !== 'available'}
              >
                Assign Tenant
              </Button>
            </Box>
          </Box>
          <Chip 
            label={property.status}
            color={
              property.status === 'available' ? 'success' :
              property.status === 'rented' ? 'primary' :
              'warning'
            }
          />
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Property Details</Typography>
            <Divider sx={{ mb: 2 }} />
            <List>
              <ListItem>
                <ListItemText 
                  primary="Type"
                  secondary={property.type}
                />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText 
                  primary="Address"
                  secondary={property.address}
                />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText 
                  primary="Bedrooms"
                  secondary={property.bedrooms}
                />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText 
                  primary="Bathrooms"
                  secondary={property.bathrooms}
                />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText 
                  primary="Area"
                  secondary={`${property.area} sq ft`}
                />
              </ListItem>
              <Divider component="li" />
              <ListItem>
                <ListItemText 
                  primary="Rent Amount"
                  secondary={`$${property.rent}/month`}
                />
              </ListItem>
            </List>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Description</Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography>{property.description}</Typography>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Amenities</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {property.amenities.map((amenity, index) => (
                <Chip key={index} label={amenity} />
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Images</Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={1}>
              {property.images.map((image, index) => (
                <Grid item xs={6} key={index}>
                  <img 
                    src={image} 
                    alt={`Property ${index + 1}`}
                    style={{ width: '100%', height: 'auto', borderRadius: 4 }}
                    loading="lazy"
                    decoding="async"
                  />
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PropertyDetail; 