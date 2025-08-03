import React, { useState, useEffect } from 'react';
import { Box, Toolbar } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AccountantSidebar } from '../../components/Layout/AccountantSidebar';
import LevyPaymentsPage from './LevyPaymentsPage';
import TasksPage from './TasksPage';
import DashboardOverview from './DashboardOverview';
import AccountantPaymentsPage from './AccountantPaymentsPage';
import PropertyAccountsPage from './PropertyAccountsPage';
import PropertyAccountDetailPage from './PropertyAccountDetailPage';
import CommissionsPage from './CommissionsPage';
import WrittenInvoicesPage from './WrittenInvoicesPage';
import SettingsPage from './SettingsPage';
import ReportsPage from './ReportsPage';
import { Routes, Route } from 'react-router-dom';

const AccountantDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(0);

  console.log('AccountantDashboard rendering - pathname:', location.pathname, 'user:', user);

  // Update activeTab based on current location
  useEffect(() => {
    const path = location.pathname;
    console.log('AccountantDashboard useEffect - path:', path);
    if (path === '/accountant-dashboard') {
      setActiveTab(0); // Dashboard
    } else if (path === '/accountant-dashboard/payments') {
      setActiveTab(1); // Payments
    } else if (path === '/accountant-dashboard/levies') {
      setActiveTab(2); // Levies
    } else if (path === '/accountant-dashboard/written-invoices') {
      setActiveTab(3); // Invoices
    } else if (path === '/accountant-dashboard/property-accounts') {
      setActiveTab(4); // Property Accounts
    } else if (path === '/accountant-dashboard/commissions') {
      setActiveTab(5); // Commissions
    } else if (path === '/accountant-dashboard/reports') {
      setActiveTab(6); // Reports
    } else if (path === '/accountant-dashboard/tasks') {
      setActiveTab(7); // Tasks
    } else if (path === '/accountant-dashboard/settings') {
      setActiveTab(8); // Settings
    }
    console.log('AccountantDashboard activeTab set to:', activeTab);
  }, [location.pathname]);

  return (
    <Box sx={{ display: 'flex' }}>
      <AccountantSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - 280px)` },
          mt: 8,
        }}
      >
        <Toolbar />
        <Routes>
          <Route path="" element={<DashboardOverview />} />
          <Route path="payments" element={<AccountantPaymentsPage />} />
          <Route path="levies" element={<LevyPaymentsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="property-accounts" element={<PropertyAccountsPage />} />
          <Route path="property-accounts/:propertyId" element={<PropertyAccountDetailPage />} />
          <Route path="commissions" element={<CommissionsPage />} />
          <Route path="written-invoices" element={<WrittenInvoicesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Routes>
      </Box>
    </Box>
  );
};

export default AccountantDashboard; 