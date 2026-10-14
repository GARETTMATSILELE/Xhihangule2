import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { AdminSidebar } from '../components/Layout/AdminSidebar';
import { Header } from '../components/Layout/Header';
import { Properties } from './Properties/Properties';
import { Tenants } from './Tenants/Tenants';
import PaymentsPage from './PaymentsPage';
import { Maintenance } from './Maintenance/Maintenance';
import { MaintenanceVendorsPage } from './Maintenance/MaintenanceVendorsPage';
import { UserManagement } from '../pages/UserManagement/UserManagement';
import CommunicationsPage from './Communications/CommunicationsPage';
import AdminPropertyOwnersPage from './admin/AdminPropertyOwnersPage';
import { Files } from './Files/Files';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import PropertyAccountsPage from './admin/PropertyAccountsPage';
import PropertyLedgerPage from './admin/PropertyLedgerPage';
import { AdminSettings } from './Settings/AdminSettings';
import ReportsPage from './admin/ReportsPage';
import ApprovalsPage from './admin/ApprovalsPage';
import AdminLeasesPage from './AdminLeasesPage';
import LevyPaymentsPage from './admin/LevyPaymentsPage';
import DatabaseSyncDashboard from '../components/admin/DatabaseSyncDashboard';
import AgentDetailPage from './admin/AgentDetailPage';
import ExecutiveOperationsDashboard from './admin/ExecutiveOperationsDashboard';
import AdminLeadsPage from './admin/AdminLeadsPage';
import AdminViewingsPage from './admin/AdminViewingsPage';
import AdminInspectionsPage from './admin/AdminInspectionsPage';
import AdminDutyRostersPage from './admin/AdminDutyRostersPage';
import AdminVacanciesPage from './admin/AdminVacanciesPage';
import AdminMunicipalBillsPage from './admin/AdminMunicipalBillsPage';
import AdminAgentsPage from './admin/AdminAgentsPage';
import AdminDevelopmentsPage from './admin/AdminDevelopmentsPage';
import AdminNotificationsPage from './admin/AdminNotificationsPage';
import ChargeTypesPage from './admin/ChargeTypesPage';
import { AgentApplicationsPage, AgentQuotesPage, AgentBroadcastPage, AgencyEcosystemSettingsPage } from './ecosystem/AgencyEcosystemPages';

const AdminDashboard: React.FC = () => {
  const location = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { company } = useCompany();
  const maintenanceCompany = company ? ({ _id: (company as any)._id as string, name: company.name } as any) : undefined;
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    if (sessionId) {
      (window as any).__API_BASE__ = `${window.location.origin}/api/s/${sessionId}`;
    }
  }, []);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ mt: 8, p: 3 }}>
          <Routes>
            <Route path="/" element={<ExecutiveOperationsDashboard />} />
            <Route path="/properties" element={<Properties />} />
            <Route path="/developments" element={<AdminDevelopmentsPage />} />
            <Route path="/property-owners" element={<AdminPropertyOwnersPage />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/leases" element={<AdminLeasesPage />} />
            <Route
              path="/maintenance"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <Maintenance
                    user={user || undefined}
                    company={maintenanceCompany as any}
                    isAuthenticated={!!isAuthenticated}
                    authLoading={authLoading}
                  />
                </Box>
              }
            />
            <Route path="/inspections" element={<AdminInspectionsPage />} />
            <Route path="/viewings" element={<AdminViewingsPage />} />
            <Route path="/rental-applications" element={<AgentApplicationsPage />} />
            <Route path="/quote-workflow" element={<AgentQuotesPage />} />
            <Route path="/broadcasts" element={<AgentBroadcastPage />} />
            <Route path="/ecosystem" element={<AgencyEcosystemSettingsPage />} />
            <Route path="/duty-rosters" element={<AdminDutyRostersPage />} />
            <Route path="/vacancies" element={<AdminVacanciesPage />} />
            <Route
              path="/payments"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <PaymentsPage />
                </Box>
              }
            />
            <Route path="/levies" element={<LevyPaymentsPage />} />
            <Route path="/municipal-bills" element={<AdminMunicipalBillsPage />} />
            <Route path="/leads" element={<AdminLeadsPage />} />
            <Route path="/communications" element={<CommunicationsPage />} />
            <Route path="/agents" element={<AdminAgentsPage />} />
            <Route
              path="/contractors"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <MaintenanceVendorsPage />
                </Box>
              }
            />
            <Route
              path="/users"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <UserManagement embedded />
                </Box>
              }
            />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/notifications" element={<AdminNotificationsPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/sync" element={<DatabaseSyncDashboard />} />
            <Route path="/charge-types" element={<ChargeTypesPage />} />
            <Route path="/settings" element={<AdminSettings />} />
            <Route path="/files" element={<Files />} />
            <Route path="/agents/:agentId" element={<AgentDetailPage />} />
            <Route
              path="/maintenance-vendors"
              element={
                <Box sx={{ ml: -3, p: 0 }}>
                  <MaintenanceVendorsPage />
                </Box>
              }
            />
            {company?.plan === 'INDIVIDUAL' && (
              <>
                <Route
                  path="/property-accounts"
                  element={
                    <Box sx={{ ml: -3, p: 0 }}>
                      <PropertyAccountsPage />
                    </Box>
                  }
                />
                <Route
                  path="/property-accounts/:propertyId/ledger"
                  element={
                    <Box sx={{ ml: -3, p: 0 }}>
                      <PropertyLedgerPage />
                    </Box>
                  }
                />
              </>
            )}
          </Routes>
        </Box>
      </Box>
    </Box>
  );
};

export default AdminDashboard;
