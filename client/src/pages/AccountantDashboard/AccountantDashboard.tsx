import React, { useState, useEffect } from 'react';
import { Box, Toolbar, Tabs, Tab } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Header } from '../../components/Layout/Header';
import LevyPaymentsPage from './LevyPaymentsPage';
import TasksPage from './TasksPage';
import DashboardOverview from './DashboardOverview';
import AccountantPaymentsPage from './AccountantPaymentsPage';
import PropertyAccountsPage from './PropertyAccountsPage';
import PropertyAccountDetailPage from './PropertyAccountDetailPage';
import AgentAccountsPage from './AgentAccountsPage';
import AgentAccountDetailPage from './AgentAccountDetailPage';
import CommissionsPage from './CommissionsPage';
import WrittenInvoicesPage from './WrittenInvoicesPage';
import SettingsPage from './SettingsPage';
import ReportsPage from './ReportsPage';
import DatabaseSyncDashboard from '../../components/admin/DatabaseSyncDashboard';
import { Routes, Route } from 'react-router-dom';

const AccountantDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

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
    if (path.includes('/data-sync')) {
      setActiveTab(8); // Data Sync tab index
    } else if (path.includes('/reports')) {
      setActiveTab(7); // Reports tab index
    } else if (path.includes('/commissions')) {
      setActiveTab(6); // Commissions tab index
    } else if (path.includes('/agent-accounts')) {
      setActiveTab(5); // Agent Accounts tab index
    } else if (path.includes('/property-accounts')) {
      setActiveTab(4); // Property Accounts tab index
    } else if (path.includes('/written-invoices')) {
      setActiveTab(3); // Invoices tab index
    } else if (path.includes('/levies')) {
      setActiveTab(2); // Levies tab index
    } else if (path.includes('/payments')) {
      setActiveTab(1); // Payments tab index
    } else if (path.includes('/tasks')) {
      setActiveTab(9); // Tasks tab index
    } else if (path.includes('/settings')) {
      setActiveTab(10); // Settings tab index
    } else {
      setActiveTab(0); // Dashboard tab index
    }
  }, [location.pathname]);

  const menuItems: { label: string; path: string }[] = [
    { label: 'Dashboard', path: '/accountant-dashboard' },
    { label: 'Payments', path: '/accountant-dashboard/payments' },
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
            {menuItems.map((item) => (
              <Tab key={item.path} label={item.label} />
            ))}
          </Tabs>
          <Toolbar />
          <Routes>
            <Route path="" element={<DashboardOverview />} />
            <Route path="payments" element={<AccountantPaymentsPage />} />
            <Route path="levies" element={<LevyPaymentsPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="property-accounts" element={<PropertyAccountsPage />} />
            <Route path="property-accounts/:propertyId" element={<PropertyAccountDetailPage />} />
            <Route path="agent-accounts" element={<AgentAccountsPage />} />
            <Route path="agent-accounts/:agentId" element={<AgentAccountDetailPage />} />
            <Route path="commissions" element={<CommissionsPage />} />
            <Route path="written-invoices" element={<WrittenInvoicesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="data-sync" element={<DatabaseSyncDashboard />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
};

export default AccountantDashboard; 