import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface Property {
  _id: string;
  name: string;
  address: string;
  type: string;
  status: string;
  rent: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  description: string;
  images: string[];
  amenities: string[];
  occupancyRate: number;
  totalRentCollected: number;
  currentArrears: number;
  nextLeaseExpiry: string;
}

interface MaintenanceRequest {
  _id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  estimatedCost: number;
  createdAt: string;
}

const PropertyDetails: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [propertyRes, maintenanceRes] = await Promise.all([
          api.get(`/owners/properties/${propertyId}`),
          api.get(`/maintenance/property/${propertyId}`)
        ]);
        setProperty(propertyRes.data);
        setMaintenanceRequests(maintenanceRes.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Error fetching property details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [propertyId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!property) {
    return (
      <Container>
        <Alert severity="error">Property not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h4" component="h1">
              {property.name}
            </Typography>
            <Button variant="outlined" onClick={() => navigate('/owner/dashboard')}>
              Back to Dashboard
            </Button>
          </Box>
        </Grid>

        {error && (
          <Grid item xs={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        )}

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Property Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Address</Typography>
                <Typography variant="body1">{property.address}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Type</Typography>
                <Typography variant="body1">{property.type}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Status</Typography>
                <Chip
                  label={property.status}
                  color={property.status === 'available' ? 'success' : 'warning'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Rent</Typography>
                <Typography variant="body1">${property.rent}/month</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Bedrooms</Typography>
                <Typography variant="body1">{property.bedrooms}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1">Bathrooms</Typography>
                <Typography variant="body1">{property.bathrooms}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1">Description</Typography>
                <Typography variant="body1">{property.description}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1">Amenities</Typography>
                <Box sx={{ mt: 1 }}>
                  {property.amenities.map((amenity, index) => (
                    <Chip
                      key={index}
                      label={amenity}
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Financial Overview
            </Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary="Occupancy Rate"
                  secondary={`${property.occupancyRate}%`}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Total Rent Collected"
                  secondary={`$${property.totalRentCollected}`}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Current Arrears"
                  secondary={`$${property.currentArrears}`}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Next Lease Expiry"
                  secondary={new Date(property.nextLeaseExpiry).toLocaleDateString()}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Maintenance History
            </Typography>
            <List>
              {maintenanceRequests.map((request) => (
                <React.Fragment key={request._id}>
                  <ListItem>
                    <ListItemText
                      primary={request.title}
                      secondary={
                        <>
                          <Typography component="span" variant="body2" color="text.primary">
                            {request.description}
                          </Typography>
                          <br />
                          Priority: {request.priority} | Status: {request.status} | 
                          Estimated Cost: ${request.estimatedCost}
                        </>
                      }
                    />
                    <Button
                      size="small"
                      onClick={() => navigate(`/owner/maintenance/${request._id}`)}
                    >
                      View Details
                    </Button>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default PropertyDetails; 