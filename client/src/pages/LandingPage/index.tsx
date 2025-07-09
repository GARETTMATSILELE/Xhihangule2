import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
} from '@mui/material';

const LandingPage: React.FC = () => {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: 8,
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h2" component="h1" gutterBottom>
                Welcome to Xhihangule
              </Typography>
              <Typography variant="h5" paragraph>
                Your all-in-one solution for business management
              </Typography>
              <Box sx={{ mt: 4 }}>
                <Button
                  component={RouterLink}
                  to="/admin-signup"
                  variant="contained"
                  color="secondary"
                  size="large"
                  sx={{ mr: 2 }}
                >
                  Get Started
                </Button>
                <Button
                  component={RouterLink}
                  to="/login"
                  variant="outlined"
                  color="inherit"
                  size="large"
                >
                  Login
                </Button>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              {/* Add hero image here */}
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h3" component="h2" align="center" gutterBottom>
          Features
        </Typography>
        <Grid container spacing={4} sx={{ mt: 4 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h5" component="h3" gutterBottom>
                  Business Management
                </Typography>
                <Typography>
                  Streamline your business operations with our comprehensive management tools.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h5" component="h3" gutterBottom>
                  Analytics
                </Typography>
                <Typography>
                  Get detailed insights into your business performance with advanced analytics.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h5" component="h3" gutterBottom>
                  Secure Platform
                </Typography>
                <Typography>
                  Your data is protected with enterprise-grade security measures.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>

      {/* CTA Section */}
      <Box sx={{ bgcolor: 'grey.100', py: 8 }}>
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" align="center" gutterBottom>
            Ready to Get Started?
          </Typography>
          <Typography variant="h6" align="center" paragraph>
            Join thousands of businesses already using Xhihangule
          </Typography>
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Button
              component={RouterLink}
              to="/admin-signup"
              variant="contained"
              color="primary"
              size="large"
              sx={{ mr: 2 }}
            >
              Sign Up Now
            </Button>
            <Button
              component={RouterLink}
              to="/login"
              variant="outlined"
              color="primary"
              size="large"
            >
              Login
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ bgcolor: 'background.paper', py: 6 }}>
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" align="center">
            © {new Date().getFullYear()} Xhihangule. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
};

export default LandingPage; 