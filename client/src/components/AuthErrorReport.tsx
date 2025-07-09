import React from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert
} from '@mui/material';

export interface AuthErrorReportProps {
  error: string;
  onRetry?: () => void;
  onLogin?: () => void;
  open?: boolean;
  onClose?: () => void;
}

export const AuthErrorReport: React.FC<AuthErrorReportProps> = ({
  error,
  onRetry,
  onLogin,
  open = true,
  onClose
}) => {
  const content = (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
      <Box sx={{ mt: 2 }}>
        {onRetry && (
          <Button
            variant="contained"
            color="primary"
            onClick={onRetry}
            sx={{ mr: 1 }}
          >
            Retry
          </Button>
        )}
        {onLogin && (
          <Button
            variant="outlined"
            color="primary"
            onClick={onLogin}
          >
            Go to Login
          </Button>
        )}
      </Box>
    </Box>
  );

  if (onClose) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Authentication Error</DialogTitle>
        <DialogContent>
          {content}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return content;
}; 