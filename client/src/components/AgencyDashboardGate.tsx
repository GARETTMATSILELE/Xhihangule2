import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { isIndividualWorkspace } from '../contexts/FeatureFlags';

const AgencyDashboardGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { company: contextCompany, loading } = useCompany();
  const { company: authCompany } = useAuth();
  const [resolvedCompany, setResolvedCompany] = useState<any | null>(null);
  const [checking, setChecking] = useState(false);
  const [hasCheckedFallback, setHasCheckedFallback] = useState(false);

  const company = contextCompany || resolvedCompany || authCompany;
  const needsFallbackCheck = !loading && !contextCompany && !resolvedCompany && !authCompany && !hasCheckedFallback;

  useEffect(() => {
    if (!needsFallbackCheck) return;

    let cancelled = false;
    setChecking(true);
    api.get('/companies/current')
      .then((response) => {
        if (cancelled) return;
        const data = response.data?.status === 'success' ? response.data.data : response.data;
        setResolvedCompany(data || null);
      })
      .catch(() => {
        if (!cancelled) setResolvedCompany(authCompany || null);
      })
      .finally(() => {
        if (!cancelled) {
          setHasCheckedFallback(true);
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authCompany, needsFallbackCheck]);

  if (loading || checking || needsFallbackCheck) {
    return (
      <Box sx={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isIndividualWorkspace(company)) {
    return <Navigate to="/individual-dashboard" replace />;
  }

  return <>{children}</>;
};

export default AgencyDashboardGate;
