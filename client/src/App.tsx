import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CompanyProvider } from './contexts/CompanyContext';
import { PropertyProvider } from './contexts/PropertyContext';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout/Layout';
import LandingPage from './pages/LandingPage';
import AdminDashboard from './pages/AdminDashboard';
import Login from './components/Login';
import Signup from './pages/Signup';
import AdminSignup from './pages/AdminSignup';
import { UserManagement } from './pages/UserManagement/UserManagement';
import MaintenancePageWrapper from './components/maintenance/MaintenancePageWrapper';
import PaymentsPage from './pages/PaymentsPage';
import LeasesPage from './pages/LeasesPage';
import { Box, CircularProgress } from '@mui/material';
import ErrorBoundary from './components/ErrorBoundary';
import OwnerDashboard from './components/owner/OwnerDashboard';
import AgentDashboard from './pages/AgentDashboard';
import AccountantDashboard from './pages/AccountantDashboard';
import AccountantPaymentsPage from './pages/AccountantDashboard/PaymentsPage';
import CommissionsPage from './pages/AccountantDashboard/CommissionsPage';
import SettingsPage from './pages/AccountantDashboard/SettingsPage';
import ReportsPage from './pages/AccountantDashboard/ReportsPage';
import ProtectedRoute from './components/ProtectedRoute';
import TestAuth from './pages/TestAuth';
import PropertyAccountsPage from './pages/AccountantDashboard/PropertyAccountsPage';
import PropertyAccountDetailPage from './pages/AccountantDashboard/PropertyAccountDetailPage';

// Create a theme instance with proper configuration
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
        },
      },
    },
  },
});

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <Routes>
            {/* Public Routes - No PropertyProvider or CompanyProvider */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/admin-signup" element={<AdminSignup />} />

            {/* Admin Dashboard Routes - Protected with authentication */}
            <Route path="/admin-dashboard/*" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <PropertyProvider>
                  <CompanyProvider>
                    <AdminDashboard />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            } />
            <Route path="/owner-dashboard/*" element={
              <ProtectedRoute requiredRoles={['owner']}>
                <PropertyProvider>
                  <CompanyProvider>
                    <OwnerDashboard />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            } />
            <Route path="/agent-dashboard/*" element={
              <ProtectedRoute requiredRoles={['agent']}>
                <PropertyProvider>
                  <CompanyProvider>
                    <AgentDashboard />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            } />
            <Route path="/accountant-dashboard" element={
              <ProtectedRoute requiredRoles={['accountant']}>
                <PropertyProvider>
                  <CompanyProvider>
                    <AccountantDashboard />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            }>
              <Route index element={<AccountantDashboard />} />
              <Route path="payments" element={<AccountantPaymentsPage />} />
              <Route path="property-accounts" element={<PropertyAccountsPage />} />
              <Route path="property-accounts/:propertyId" element={<ProtectedRoute requiredRoles={['accountant']}><PropertyAccountDetailPage /></ProtectedRoute>} />
              <Route path="commissions" element={<CommissionsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="reports" element={<ReportsPage />} />
            </Route>
            <Route path="/admin/users" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <PropertyProvider>
                  <CompanyProvider>
                    <UserManagement />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            } />
            <Route path="/admin/maintenance" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <PropertyProvider>
                  <CompanyProvider>
                    <MaintenancePageWrapper userRole="admin" />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            } />
            <Route path="/admin/payments" element={
              <ProtectedRoute requiredRoles={['admin']}>
                <PropertyProvider>
                  <CompanyProvider>
                    <PaymentsPage />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            } />
            <Route path="/leases" element={
              <ProtectedRoute>
                <PropertyProvider>
                  <CompanyProvider>
                    <LeasesPage />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            } />
            <Route path="/test-auth" element={
              <ProtectedRoute>
                <PropertyProvider>
                  <CompanyProvider>
                    <TestAuth />
                  </CompanyProvider>
                </PropertyProvider>
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
