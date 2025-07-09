import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import {
  Business as BusinessIcon,
  Home as HomeIcon,
  People as PeopleIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { getDashboardPath, UserRole } from '../../utils/registrationUtils';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleDashboardAccess = (role: UserRole) => {
    navigate(getDashboardPath(role));
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        <Box sx={{ py: 8 }}>
          <Typography variant="h2" component="h1" gutterBottom align="center">
            Property Management System
          </Typography>
          <Typography variant="h5" component="h2" gutterBottom align="center" color="text.secondary">
            Streamline your property management operations
          </Typography>

          <Grid container spacing={4} sx={{ mt: 4 }}>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <BusinessIcon sx={{ fontSize: 40, mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Admin Dashboard
                  </Typography>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => handleDashboardAccess('admin')}
                  >
                    Access
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <HomeIcon sx={{ fontSize: 40, mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Owner Dashboard
                  </Typography>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => handleDashboardAccess('owner')}
                  >
                    Access
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <PeopleIcon sx={{ fontSize: 40, mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Agent Dashboard
                  </Typography>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => handleDashboardAccess('agent')}
                  >
                    Access
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <AssessmentIcon sx={{ fontSize: 40, mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Accountant Dashboard
                  </Typography>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => handleDashboardAccess('accountant')}
                  >
                    Access
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage; 