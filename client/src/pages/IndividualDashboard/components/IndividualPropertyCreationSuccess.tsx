import React from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { Property } from '../../../types/property';
import { INDIVIDUAL_THEME } from '../theme';

export function IndividualPropertyCreationSuccess({
  property,
  onNavigate,
  onDismiss
}: {
  property: Property;
  onNavigate: (path: string) => void;
  onDismiss: () => void;
}) {
  const propertyId = String(property._id || '');
  const primaryActions = [
    { label: 'Add Tenant', path: `/individual-dashboard/tenants?propertyId=${propertyId}` },
    { label: 'Create Lease', path: `/individual-dashboard/leases?propertyId=${propertyId}` },
    { label: 'Record Rent', path: `/individual-dashboard/rent-collection?propertyId=${propertyId}` }
  ];
  const secondaryActions = [
    { label: 'View Property', path: `/individual-dashboard/properties/${propertyId}` },
    { label: 'Upload Files', path: `/individual-dashboard/files?propertyId=${propertyId}` },
    { label: 'Back to Properties', path: '/individual-dashboard/properties' }
  ];

  return (
    <Alert severity="success" sx={{ mb: 3, alignItems: 'flex-start' }} onClose={onDismiss}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Property Added Successfully
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {property.name} is in your portfolio. Complete the landlord workflow below when you are ready.
      </Typography>
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
        Recommended Next Steps
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {primaryActions.map((action) => (
          <Button
            key={action.label}
            variant="contained"
            size="small"
            onClick={() => onNavigate(action.path)}
            sx={{ bgcolor: INDIVIDUAL_THEME.primary, '&:hover': { bgcolor: INDIVIDUAL_THEME.primaryDark } }}
          >
            {action.label}
          </Button>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
        {secondaryActions.map((action) => (
          <Button key={action.label} variant="outlined" size="small" color="inherit" onClick={() => onNavigate(action.path)}>
            {action.label}
          </Button>
        ))}
      </Stack>
    </Alert>
  );
}

export default IndividualPropertyCreationSuccess;
