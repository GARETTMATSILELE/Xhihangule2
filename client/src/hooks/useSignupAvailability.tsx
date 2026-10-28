import { useEffect, useState } from 'react';
import { Alert, Box, Container, Link, Paper, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { apiService } from '../api';

export type SignupAvailabilityState = 'loading' | 'open' | 'closed' | 'database' | 'unavailable';

export function useSignupAvailability() {
  const [state, setState] = useState<SignupAvailabilityState>('loading');
  const [allowlistRestricted, setAllowlistRestricted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiService.getSignupAvailability()
      .then((response) => {
        if (cancelled) return;
        setAllowlistRestricted(Boolean(response.data?.allowlistRestricted));
        setState(response.data?.signupEnabled ? 'open' : 'closed');
      })
      .catch((error) => {
        if (cancelled) return;
        const code = error?.response?.data?.code;
        setState(code === 'DB_NOT_READY' ? 'database' : 'unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, allowlistRestricted };
}

export function SignupAvailabilityNotice({ state }: { state: Exclude<SignupAvailabilityState, 'open'> }) {
  const message = state === 'loading'
    ? 'Checking whether registration is open.'
    : state === 'closed'
      ? 'Public signup is disabled.'
      : state === 'database'
        ? 'Registration is unavailable because the database is not ready.'
        : 'Registration is unavailable because the server could not confirm that signup is open.';
  return (
    <Container component="main" maxWidth="xs">
      <Box sx={{ marginTop: 8 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            Set Up Your Property Management Workspace
          </Typography>
          <Alert severity={state === 'loading' ? 'info' : 'warning'} sx={{ mb: 2 }}>
            {message}
          </Alert>
          <Typography variant="body2" align="center">
            <Link component={RouterLink} to="/login">Sign in</Link>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}
