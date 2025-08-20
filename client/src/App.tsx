import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CompanyProvider } from './contexts/CompanyContext';
import { PropertyProvider } from './contexts/PropertyContext';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout/Layout';
const LandingPage = lazy(() => import('./pages/LandingPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Login = lazy(() => import('./components/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const AdminSignup = lazy(() => import('./pages/AdminSignup'));
const UserManagement = lazy(() => import('./pages/UserManagement/UserManagement').then(m => ({ default: m.UserManagement })));
const MaintenancePageWrapper = lazy(() => import('./components/maintenance/MaintenancePageWrapper'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const LeasesPage = lazy(() => import('./pages/LeasesPage'));
import { Box, CircularProgress } from '@mui/material';
import ErrorBoundary from './components/ErrorBoundary';
const OwnerDashboard = lazy(() => import('./components/owner/OwnerDashboard'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const AccountantDashboard = lazy(() => import('./pages/AccountantDashboard'));
const AccountantPaymentsPage = lazy(() => import('./pages/AccountantDashboard/AccountantPaymentsPage'));
const CommissionsPage = lazy(() => import('./pages/AccountantDashboard/CommissionsPage'));
const SettingsPage = lazy(() => import('./pages/AccountantDashboard/SettingsPage'));
const ReportsPage = lazy(() => import('./pages/AccountantDashboard/ReportsPage'));
import ProtectedRoute from './components/ProtectedRoute';
const TestAuth = lazy(() => import('./pages/TestAuth'));
const PropertyAccountsPage = lazy(() => import('./pages/AccountantDashboard/PropertyAccountsPage'));
const PropertyAccountDetailPage = lazy(() => import('./pages/AccountantDashboard/PropertyAccountDetailPage'));
const AgentAccountsPage = lazy(() => import('./pages/AccountantDashboard/AgentAccountsPage'));
const AgentAccountDetailPage = lazy(() => import('./pages/AccountantDashboard/AgentAccountDetailPage'));
const WrittenInvoicesPage = lazy(() => import('./pages/AccountantDashboard/WrittenInvoicesPage'));
const LevyPaymentsPage = lazy(() => import('./pages/AccountantDashboard/LevyPaymentsPage'));
const TasksPage = lazy(() => import('./pages/AccountantDashboard/TasksPage'));
import { NotificationProvider } from './components/Layout/Header';
const DatabaseSyncDashboard = lazy(() => import('./components/admin/DatabaseSyncDashboard'));

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
        <NotificationProvider>
          <AuthProvider>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}><CircularProgress /></Box>}>
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
              <Route path="/accountant-dashboard/*" element={
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
                <Route path="property-accounts/:propertyId" element={<PropertyAccountDetailPage />} />
                <Route path="agent-accounts" element={<AgentAccountsPage />} />
                <Route path="agent-accounts/:agentId" element={<AgentAccountDetailPage />} />
                <Route path="commissions" element={<CommissionsPage />} />
                <Route path="written-invoices" element={<WrittenInvoicesPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="levies" element={<LevyPaymentsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="data-sync" element={<DatabaseSyncDashboard />} />
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
            </Suspense>
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
