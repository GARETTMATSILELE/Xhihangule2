import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Box, Toolbar, Tabs, Tab } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Header } from '../../components/Layout/Header';
const DashboardOverview = lazy(() => import('./DashboardOverview'));
const AccountantPaymentsPage = lazy(() => import('./AccountantPaymentsPage'));
const SalesPaymentsPage = lazy(() => import('./SalesPaymentsPage'));
const RevenuePage = lazy(() => import('./RevenuePage'));
const LedgerDrilldownPage = lazy(() => import('./LedgerDrilldownPage'));
const VATManagementPage = lazy(() => import('./VATManagementPage'));
const LevyPaymentsPage = lazy(() => import('./LevyPaymentsPage'));
const WrittenInvoicesPage = lazy(() => import('./WrittenInvoicesPage'));
const PropertyAccountsPage = lazy(() => import('./PropertyAccountsPage'));
const PropertyAccountDetailPage = lazy(() => import('./PropertyAccountDetailPage'));
const AgentAccountsPage = lazy(() => import('./AgentAccountsPage'));
const AgentAccountDetailPage = lazy(() => import('./AgentAccountDetailPage'));
const CommissionsPage = lazy(() => import('./CommissionsPage'));
const ReportsPage = lazy(() => import('./ReportsPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const DatabaseSyncDashboard = lazy(() => import('../../components/admin/DatabaseSyncDashboard'));
const TasksPage = lazy(() => import('./TasksPage'));
const PropertyDepositLedgerPage = lazy(() => import('./PropertyDepositLedgerPage'));
import { Routes, Route } from 'react-router-dom';

const AccountantDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

  // Support path-scoped sessions
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    if (sessionId) {
      (window as any).__API_BASE__ = `${window.location.origin}/api/s/${sessionId}`;
    }
  }, []);

  // Add CSS classes to body and html to prevent white space
  useEffect(() => {
    document.body.classList.add('accountant-dashboard-active');
    document.documentElement.classList.add('accountant-dashboard-active');
    
    return () => {
      document.body.classList.remove('accountant-dashboard-active');
      document.documentElement.classList.remove('accountant-dashboard-active');
    };
  }, []);

  // Determine active tab based on current location
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/settings')) {
      setActiveTab(13);
    } else if (path.includes('/tasks')) {
      setActiveTab(12);
    } else if (path.includes('/data-sync')) {
      setActiveTab(11);
    } else if (path.includes('/reports')) {
      setActiveTab(10);
    } else if (path.includes('/commissions')) {
      setActiveTab(9);
    } else if (path.includes('/agent-accounts')) {
      setActiveTab(8);
    } else if (path.includes('/property-accounts')) {
      setActiveTab(7);
    } else if (path.includes('/written-invoices')) {
      setActiveTab(6);
    } else if (path.includes('/levies')) {
      setActiveTab(5);
    } else if (path.includes('/revenue')) {
      setActiveTab(3);
    } else if (path.includes('/ledger')) {
      setActiveTab(4);
    } else if (path.includes('/sales')) {
      setActiveTab(2);
    } else if (path.includes('/payments')) {
      setActiveTab(1);
    } else {
      setActiveTab(0);
    }
  }, [location.pathname]);

  const menuItems: { label: string; path: string }[] = [
    { label: 'Dashboard', path: '/accountant-dashboard' },
    { label: 'Payments', path: '/accountant-dashboard/payments' },
    { label: 'Sales', path: '/accountant-dashboard/sales' },
    { label: 'Revenue', path: '/accountant-dashboard/revenue' },
    { label: 'Ledger', path: '/accountant-dashboard/ledger' },
    { label: 'Levies', path: '/accountant-dashboard/levies' },
    { label: 'Invoices', path: '/accountant-dashboard/written-invoices' },
    { label: 'Property Accounts', path: '/accountant-dashboard/property-accounts' },
    { label: 'Agent Accounts', path: '/accountant-dashboard/agent-accounts' },
    { label: 'Commissions', path: '/accountant-dashboard/commissions' },
    { label: 'Reports', path: '/accountant-dashboard/reports' },
    { label: 'Data Sync', path: '/accountant-dashboard/data-sync' },
    { label: 'Tasks', path: '/accountant-dashboard/tasks' },
    { label: 'Settings', path: '/accountant-dashboard/settings' },
  ];

  // Prefetch tab chunks on hover to speed next navigation
  const prefetchByIndex: Record<number, () => void> = {
    0: () => import('./DashboardOverview'),
    1: () => import('./AccountantPaymentsPage'),
    2: () => import('./SalesPaymentsPage'),
    3: () => import('./RevenuePage'),
    4: () => import('./LedgerDrilldownPage'),
    5: () => import('./LevyPaymentsPage'),
    6: () => import('./WrittenInvoicesPage'),
    7: () => import('./PropertyAccountsPage'),
    8: () => import('./AgentAccountsPage'),
    9: () => import('./CommissionsPage'),
    10: () => import('./ReportsPage'),
    11: () => import('../../components/admin/DatabaseSyncDashboard'),
    12: () => import('./TasksPage'),
    13: () => import('./SettingsPage')
  };

  return (
    <Box sx={{ display: 'flex', width: '100%' }}>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: '100%',
          marginLeft: 0,
          '& *': {
            marginLeft: 0,
            paddingLeft: 0,
          }
        }}
      >
        <Header />
        <Box
          sx={{
            p: 3,
            width: '100%',
            mt: 8,
            '& *': {
              marginLeft: 0,
              paddingLeft: 0,
            }
          }}
        >
          <Tabs
            value={activeTab}
            onChange={(_, idx) => {
              setActiveTab(idx);
              const item = menuItems[idx];
              if (item) navigate(item.path);
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mb: 2 }}
          >
            {menuItems.map((item, idx) => (
              <Tab key={item.path} label={item.label} onMouseEnter={() => prefetchByIndex[idx]?.()} />
            ))}
          </Tabs>
          <Toolbar />
          <Suspense fallback={<Box sx={{ p: 2 }}>Loading…</Box>}>
            <Routes>
              <Route path="" element={<DashboardOverview />} />
              <Route path="payments" element={<AccountantPaymentsPage />} />
              <Route path="sales" element={<SalesPaymentsPage />} />
              <Route path="revenue" element={<RevenuePage />} />
              <Route path="ledger" element={<LedgerDrilldownPage />} />
              <Route path="vat" element={<VATManagementPage />} />
              <Route path="levies" element={<LevyPaymentsPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="property-accounts" element={<PropertyAccountsPage />} />
              <Route path="property-accounts/:propertyId" element={<PropertyAccountDetailPage />} />
              <Route path="property-accounts/:propertyId/deposits" element={<PropertyDepositLedgerPage />} />
              <Route path="agent-accounts" element={<AgentAccountsPage />} />
              <Route path="agent-accounts/:agentId" element={<AgentAccountDetailPage />} />
              <Route path="commissions" element={<CommissionsPage />} />
              <Route path="written-invoices" element={<WrittenInvoicesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="data-sync" element={<DatabaseSyncDashboard />} />
            </Routes>
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
};

export default AccountantDashboard; 