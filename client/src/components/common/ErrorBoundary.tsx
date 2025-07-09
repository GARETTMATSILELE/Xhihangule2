import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper, Container } from '@mui/material';
import { Alert, AlertTitle } from '@mui/material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              <AlertTitle>Something went wrong</AlertTitle>
              An unexpected error occurred while loading this component.
            </Alert>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Error Details
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {this.state.error?.message}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button 
                variant="contained" 
                onClick={this.handleReset}
                color="primary"
              >
                Try Again
              </Button>
              <Button 
                variant="outlined" 
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </Box>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 