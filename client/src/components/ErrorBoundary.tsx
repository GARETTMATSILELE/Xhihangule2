import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // Auto-recover from chunk load errors by forcing a hard reload once
    const isChunkLoadError = /ChunkLoadError|Loading chunk \d+ failed|failed to fetch dynamically imported module/i.test(error.message || '');
    if (isChunkLoadError) {
      const alreadyReloaded = sessionStorage.getItem('reloadedAfterChunkError');
      if (!alreadyReloaded) {
        try {
          sessionStorage.setItem('reloadedAfterChunkError', 'true');
        } catch {}
        window.location.reload();
      } else {
        // Give up after one reload attempt
        try {
          sessionStorage.removeItem('reloadedAfterChunkError');
        } catch {}
      }
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            p: 3,
            textAlign: 'center'
          }}
        >
          <Typography variant="h4" gutterBottom>
            Oops! Something went wrong
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 