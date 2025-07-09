import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface Property {
  id: string;
  name: string;
  type: 'residential' | 'commercial';
  status: 'vacant' | 'tenanted';
  address: string;
  units: number;
}

interface PropertiesOverviewModalProps {
  open: boolean;
  onClose: () => void;
}

const COLORS = ['#5E72E4', '#11CDEF', '#2DCE89', '#FB6340'];

export const PropertiesOverviewModal: React.FC<PropertiesOverviewModalProps> = ({
  open,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Sample data - replace with actual data from your API
  const properties: Property[] = [
    { id: '1', name: 'Sunset Apartments', type: 'residential', status: 'tenanted', address: '123 Main St', units: 12 },
    { id: '2', name: 'Business Center', type: 'commercial', status: 'vacant', address: '456 Market St', units: 8 },
    // Add more sample properties...
  ];

  // Calculate statistics
  const totalProperties = properties.length;
  const vacantProperties = properties.filter(p => p.status === 'vacant').length;
  const tenantedProperties = properties.filter(p => p.status === 'tenanted').length;
  const residentialProperties = properties.filter(p => p.type === 'residential').length;
  const commercialProperties = properties.filter(p => p.type === 'commercial').length;

  // Prepare data for charts
  const occupancyData = [
    { name: 'Vacant', value: vacantProperties },
    { name: 'Tenanted', value: tenantedProperties },
  ];

  const propertyTypeData = [
    { name: 'Residential', value: residentialProperties },
    { name: 'Commercial', value: commercialProperties },
  ];

  // Filter properties based on search query
  const filteredProperties = properties.filter(property =>
    property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    property.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '80vh',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Properties Overview
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Search properties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 3 }}
          />

          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Occupancy Status
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={occupancyData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {occupancyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Property Types
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={propertyTypeData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" fill="#5E72E4" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Typography variant="h6" sx={{ mb: 2 }}>
            All Properties
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell>Units</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredProperties.map((property) => (
                  <TableRow key={property.id}>
                    <TableCell>{property.name}</TableCell>
                    <TableCell>{property.type}</TableCell>
                    <TableCell>{property.status}</TableCell>
                    <TableCell>{property.address}</TableCell>
                    <TableCell>{property.units}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </DialogContent>
    </Dialog>
  );
}; 