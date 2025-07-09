import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

const Unauthorized: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      textAlign="center"
      p={3}
    >
      <LockOutlinedIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
      <Typography variant="h4" component="h1" gutterBottom>
        Access Denied
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        You don't have permission to access this page.
      </Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={() => navigate('/dashboard')}
        sx={{ mt: 2 }}
      >
        Return to Dashboard
      </Button>
    </Box>
  );
};

export default Unauthorized; 