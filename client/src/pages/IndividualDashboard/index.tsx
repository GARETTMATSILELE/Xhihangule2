import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useCompany } from '../../contexts/CompanyContext';
import { useAuth } from '../../contexts/AuthContext';
import { isIndividualWorkspace } from '../../contexts/FeatureFlags';
import api from '../../api/axios';
import { Tenants } from '../Tenants/Tenants';
import { Files } from '../Files/Files';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { CenteredLoader } from './components/shared';
import usePortfolioContext from './hooks/usePortfolioContext';
import { INDIVIDUAL_THEME } from './theme';
import DashboardPage from './pages/DashboardPage';
import PropertiesPage from './pages/PropertiesPage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import RentCollectionPage from './pages/RentCollectionPage';
import { ExpensesPage, BillsLeviesPage } from './pages/FinancePages';
import { MaintenancePage, AccountingPage } from './pages/OperationsPages';
import ReportsPage from './pages/ReportsPage';
import IndividualLeasesPage from './pages/LeasesPage';
import IndividualInspectionsPage from './pages/InspectionsPage';
import IndividualSettingsPage from './pages/SettingsPage';

function IndividualRoutes() {
  return (
    <Routes>
      <Route index element={<DashboardPage />} />
      <Route path="properties" element={<PropertiesPage />} />
      <Route path="properties/:propertyId" element={<PropertyDetailPage />} />
      <Route path="tenants" element={<Tenants />} />
      <Route path="leases" element={<IndividualLeasesPage />} />
      <Route path="inspections" element={<IndividualInspectionsPage />} />
      <Route path="maintenance" element={<MaintenancePage />} />
      <Route path="files" element={<Files />} />
      <Route path="rent-collection" element={<RentCollectionPage />} />
      <Route path="income" element={<Navigate to="/individual-dashboard/rent-collection" replace />} />
      <Route path="expenses" element={<ExpensesPage />} />
      <Route path="bills" element={<BillsLeviesPage />} />
      <Route path="accounting" element={<AccountingPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="settings" element={<IndividualSettingsPage />} />
    </Routes>
  );
}

function PortfolioShell({ company }: { company: any }) {
  const { actionItems } = usePortfolioContext();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: INDIVIDUAL_THEME.background }}>
      <Sidebar />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <TopBar companyName={company?.name} actionItems={actionItems} />
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          <IndividualRoutes />
        </Box>
      </Box>
    </Box>
  );
}

const IndividualDashboard: React.FC = () => {
  const { company: contextCompany, loading } = useCompany();
  const { company: authCompany } = useAuth();
  const [resolvedCompany, setResolvedCompany] = useState<any | null>(null);
  const [checkingCompany, setCheckingCompany] = useState(false);
  const [hasCheckedFallback, setHasCheckedFallback] = useState(false);

  const company = contextCompany || resolvedCompany || authCompany;
  const needsFallbackCheck = !loading && !contextCompany && !resolvedCompany && !authCompany && !hasCheckedFallback;
  const workspaceAllowed = useMemo(() => isIndividualWorkspace(company), [company]);

  useEffect(() => {
    if (!needsFallbackCheck) return;
    let cancelled = false;
    setCheckingCompany(true);
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
          setCheckingCompany(false);
        }
      });
    return () => { cancelled = true; };
  }, [authCompany, needsFallbackCheck]);

  if (loading || checkingCompany || needsFallbackCheck) return <CenteredLoader />;
  if (!workspaceAllowed) return <Navigate to="/admin-dashboard" replace />;

  return <PortfolioShell company={company} />;
};

export default IndividualDashboard;
