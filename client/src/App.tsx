import React, { Suspense, lazy } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { CompanyProvider } from './contexts/CompanyContext';
import { PropertyProvider } from './contexts/PropertyContext';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { NotificationProvider } from './components/Layout/Header';
import Canonical from './components/SEO/Canonical';
// Eagerly load API module to avoid lazy chunk timeouts for shared api chunk
import './api';
import { lazyWithRetry } from './lib/lazyWithRetry';
import ChooseDashboard from './pages/ChooseDashboard';
import { salesOwnerTheme } from './themes/salesOwnerTheme';

const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const SystemAdminDashboard = lazyWithRetry(() => import('./pages/SystemAdminDashboard'));
// Ensure correct case to match actual folder name on disk (windows is case-insensitive)
const CompanySetup = lazyWithRetry(() => import('./pages/admin/CompanySetup'));
const Login = lazyWithRetry(() => import('./components/Login'));
const Signup = lazyWithRetry(() => import('./pages/Signup'));
const ForgotPassword = lazyWithRetry(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'));
const AdminSignup = lazyWithRetry(() => import('./pages/AdminSignup'));
const UserManagement = lazyWithRetry(() => import('./pages/UserManagement/UserManagement').then(m => ({ default: m.UserManagement })));
const MaintenancePageWrapper = lazyWithRetry(() => import('./components/maintenance/MaintenancePageWrapper'));
const PaymentsPage = lazyWithRetry(() => import('./pages/PaymentsPage'));
const LeasesPage = lazyWithRetry(() => import('./pages/LeasesPage'));
const OwnerDashboard = lazyWithRetry(() => import('./components/owner/OwnerDashboard'));
const AgentDashboard = lazyWithRetry(() => import('./pages/AgentDashboard'));
const AccountantDashboard = lazyWithRetry(() => import('./pages/AccountantDashboard'));
const SalesDashboard = lazyWithRetry(() => import('./pages/SalesDashboard'));
const BillingSetup = lazyWithRetry(() => import('./pages/Billing/BillingSetup'));
const PaypalCheckout = lazyWithRetry(() => import('./pages/Checkout/PaypalCheckout'));
const SalesLeadsPage = lazyWithRetry(() => import('./pages/SalesDashboard/LeadsPage'));
const SalesViewingsPage = lazyWithRetry(() => import('./pages/SalesDashboard/ViewingsPage'));
const SalesBuyersPage = lazyWithRetry(() => import('./pages/SalesDashboard/BuyersPage'));
const SalesOwnersPage = lazyWithRetry(() => import('./pages/SalesDashboard/OwnersPage'));
const SalesPropertiesPage = lazyWithRetry(() => import('./pages/SalesDashboard/PropertiesPage'));
const SalesValuationsPageLazy = lazyWithRetry(() => import('./pages/SalesDashboard/ValuationsPage'));
const SalesDealsPage = lazyWithRetry(() => import('./pages/SalesDashboard/DealsPage'));
const SalesDevelopmentsPage = lazyWithRetry(() => import('./pages/SalesDashboard/DevelopmentsPage'));
const SalesNotificationsPage = lazyWithRetry(() => import('./pages/SalesDashboard/NotificationsPage'));
const SalesFilesPage = lazyWithRetry(() => import('./pages/SalesDashboard/FilesPage'));
const SalesSettingsPage = lazyWithRetry(() => import('./pages/SalesDashboard/SettingsPage'));
const Settings = lazyWithRetry(() => import('./pages/Settings/Settings').then(m => ({ default: m.Settings })));
const DashboardOverview = lazyWithRetry(() => import('./pages/AccountantDashboard/DashboardOverview'));
const AccountantPaymentsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/AccountantPaymentsPage'));
const SalesPaymentsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/SalesPaymentsPage'));
const RevenuePage = lazyWithRetry(() => import('./pages/AccountantDashboard/RevenuePage'));
const LedgerDrilldownPage = lazyWithRetry(() => import('./pages/AccountantDashboard/LedgerDrilldownPage'));
const CommissionsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/CommissionsPage'));
const SettingsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/SettingsPage'));
const ReportsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/ReportsPage'));
const TestAuth = lazyWithRetry(() => import('./pages/TestAuth'));
const PropertyAccountsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/PropertyAccountsPage'));
const PropertyAccountDetailPage = lazyWithRetry(() => import('./pages/AccountantDashboard/PropertyAccountDetailPage'));
const PropertyDepositLedgerPage = lazyWithRetry(() => import('./pages/AccountantDashboard/PropertyDepositLedgerPage'));
const AgentAccountsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/AgentAccountsPage'));
const AgentAccountDetailPage = lazyWithRetry(() => import('./pages/AccountantDashboard/AgentAccountDetailPage'));
const WrittenInvoicesPage = lazyWithRetry(() => import('./pages/AccountantDashboard/WrittenInvoicesPage'));
const LevyPaymentsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/LevyPaymentsPage'));
const VATManagementPage = lazyWithRetry(() => import('./pages/AccountantDashboard/VATManagementPage'));
const TasksPage = lazyWithRetry(() => import('./pages/AccountantDashboard/TasksPage'));
const DatabaseSyncDashboard = lazyWithRetry(() => import('./components/admin/DatabaseSyncDashboard'));
const TrustAccountReportsPage = lazyWithRetry(() => import('./pages/AccountantDashboard/TrustAccountReportsPage'));
const TrustAccountPropertyReportPage = lazyWithRetry(() => import('./pages/AccountantDashboard/TrustAccountPropertyReportPage'));

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

const SalesProvidersLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute requiredRoles={['sales']}>
      <PropertyProvider>
        <CompanyProvider>
          <ThemeProvider theme={salesOwnerTheme}>
            <CssBaseline />
            {children ?? <Outlet />}
          </ThemeProvider>
        </CompanyProvider>
      </PropertyProvider>
    </ProtectedRoute>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <NotificationProvider>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}><CircularProgress /></Box>}>
              <Canonical />
              <Routes>
              {/* Public Routes - No PropertyProvider or CompanyProvider */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/admin-signup" element={<AdminSignup />} />
              <Route path="/billing/setup" element={<BillingSetup />} />
              <Route path="/billing/upgrade" element={<BillingSetup />} />
              <Route path="/checkout/paypal" element={<PaypalCheckout />} />
              <Route path="/checkout" element={<PaypalCheckout />} />
              {/* System Admin (Global) */}
              <Route path="/system-admin/*" element={<SystemAdminDashboard />} />
              {/* Admin Dashboard Routes - Protected with authentication */}
              <Route path="/admin-dashboard/*" element={
                <PropertyProvider>
                  <CompanyProvider>
                    <ProtectedRoute requiredRoles={['admin','principal','prea']}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  </CompanyProvider>
                </PropertyProvider>
              } />
              <Route path="/admin/company-setup" element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <CompanyProvider>
                    <CompanySetup />
                  </CompanyProvider>
                </ProtectedRoute>
              } />
              <Route path="/owner-dashboard/*" element={
                <ProtectedRoute requiredRoles={['owner']}>
                  <PropertyProvider>
                    <CompanyProvider>
                      <ThemeProvider theme={salesOwnerTheme}>
                        <CssBaseline />
                        <OwnerDashboard />
                      </ThemeProvider>
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
              {/* Sales Dashboard Routes - single persistent provider tree */}
              <Route path="/sales-dashboard" element={<SalesProvidersLayout />}>
                <Route index element={<SalesDashboard />} />
                <Route path="settings" element={<SalesSettingsPage />} />
                <Route path="files" element={<SalesFilesPage />} />
                <Route path="files/:propertyId" element={<SalesFilesPage />} />
                <Route path="notifications" element={<SalesNotificationsPage />} />
                <Route path="leads" element={<SalesLeadsPage />} />
                <Route path="viewings" element={<SalesViewingsPage />} />
                <Route path="buyers" element={<SalesBuyersPage />} />
                <Route path="owners" element={<SalesOwnersPage />} />
                <Route path="properties" element={<SalesPropertiesPage />} />
                <Route path="deals" element={<SalesDealsPage />} />
                <Route path="valuations" element={<SalesValuationsPageLazy />} />
                <Route path="developments" element={<SalesDevelopmentsPage />} />
              </Route>
              <Route path="/choose-dashboard" element={<ChooseDashboard />} />
              <Route path="/accountant-dashboard/*" element={
                <ProtectedRoute requiredRoles={['accountant','principal','prea']}>
                  <PropertyProvider>
                    <CompanyProvider>
                      <AccountantDashboard />
                    </CompanyProvider>
                  </PropertyProvider>
                </ProtectedRoute>
              }>
                <Route index element={<DashboardOverview />} />
                <Route path="payments" element={<AccountantPaymentsPage />} />
                <Route path="sales" element={<SalesPaymentsPage />} />
                <Route path="revenue" element={<RevenuePage />} />
                <Route path="ledger" element={<LedgerDrilldownPage />} />
                <Route path="vat" element={<VATManagementPage />} />
                <Route path="property-accounts" element={<PropertyAccountsPage />} />
                <Route path="property-accounts/:propertyId" element={<PropertyAccountDetailPage />} />
                <Route path="property-accounts/:propertyId/deposits" element={<PropertyDepositLedgerPage />} />
                <Route path="agent-accounts" element={<AgentAccountsPage />} />
                <Route path="agent-accounts/:agentId" element={<AgentAccountDetailPage />} />
                <Route path="commissions" element={<CommissionsPage />} />
                <Route path="written-invoices" element={<WrittenInvoicesPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="levies" element={<LevyPaymentsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="trust-account-reports" element={<TrustAccountReportsPage />} />
                <Route path="trust-account-reports/:propertyId" element={<TrustAccountPropertyReportPage />} />
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
              <Route path="/settings" element={
                <ProtectedRoute>
                  <PropertyProvider>
                    <CompanyProvider>
                      <Settings />
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
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
