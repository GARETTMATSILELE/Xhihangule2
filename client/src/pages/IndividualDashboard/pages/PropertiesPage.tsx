import React, { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton
} from '@mui/material';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import PropertyForm from '../../../components/properties/PropertyForm';
import { useAuth } from '../../../contexts/AuthContext';
import { useCompany } from '../../../contexts/CompanyContext';
import { usePropertyLimit } from '../../../contexts/FeatureFlags';
import { useAdminDashboardService } from '../../../services/adminDashboardService';
import { Property, PropertyFormData } from '../../../types/property';
import IndividualPropertyCreationSuccess from '../components/IndividualPropertyCreationSuccess';
import PropertyCard from '../components/PropertyCard';
import { CenteredLoader, PageShell } from '../components/shared';
import usePortfolioContext from '../hooks/usePortfolioContext';
import { INDIVIDUAL_THEME } from '../theme';

export function PropertiesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company } = useCompany();
  const { enrichedProperties, loading, error, refreshAll } = usePortfolioContext();
  const { addProperty } = useAdminDashboardService();
  const propertyLimit = usePropertyLimit();

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastCreatedProperty, setLastCreatedProperty] = useState<Property | null>(null);

  const propertiesCount = enrichedProperties.length;
  const limitReached = propertyLimit != null && propertiesCount >= propertyLimit;

  const handleAddProperty = async (propertyData: PropertyFormData) => {
    if (!user?._id) {
      setFormError('You must be logged in to add a property.');
      return;
    }
    if (limitReached) {
      setFormError(`Your plan allows up to ${propertyLimit} properties.`);
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      const created = await addProperty(propertyData, user, company);
      setLastCreatedProperty(created);
      setShowForm(false);
      await refreshAll();
      window.dispatchEvent(new CustomEvent('rental-workflow:changed', { detail: { entity: 'property' } }));
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create property.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <CenteredLoader />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <PageShell
      title="Properties"
      subtitle="Your portfolio at a glance — income, occupancy, and health scores."
      action={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setFormError(null);
            setShowForm(true);
          }}
          disabled={limitReached}
          sx={{ bgcolor: INDIVIDUAL_THEME.primary, '&:hover': { bgcolor: INDIVIDUAL_THEME.primaryDark } }}
        >
          Add Property
        </Button>
      }
    >
      {limitReached && (
        <Alert severity="warning">
          You have reached your plan limit of {propertyLimit} properties.
        </Alert>
      )}

      {lastCreatedProperty && (
        <IndividualPropertyCreationSuccess
          property={lastCreatedProperty}
          onNavigate={(path) => navigate(path)}
          onDismiss={() => setLastCreatedProperty(null)}
        />
      )}

      <Grid container spacing={2}>
        {enrichedProperties.map((property) => (
          <Grid item xs={12} md={6} lg={4} key={property.propertyId}>
            <PropertyCard
              property={property}
              onView={() => navigate(`/individual-dashboard/properties/${property.propertyId}`)}
            />
          </Grid>
        ))}
        {!enrichedProperties.length && !lastCreatedProperty && (
          <Grid item xs={12}>
            <Alert severity="info">
              Add your first property to start tracking rent, expenses, and portfolio performance.
            </Alert>
          </Grid>
        )}
      </Grid>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        fullWidth
        maxWidth="md"
        scroll="paper"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          Add Property
          <IconButton onClick={() => !submitting && setShowForm(false)} disabled={submitting} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <PropertyForm
            onSubmit={handleAddProperty}
            onClose={() => !submitting && setShowForm(false)}
            individualMode
            submitting={submitting}
          />
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export default PropertiesPage;
