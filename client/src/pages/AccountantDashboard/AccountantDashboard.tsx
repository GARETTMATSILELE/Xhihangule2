import React, { useState, useEffect } from 'react';
import { Box, Toolbar } from '@mui/material';
import { useLocation } from 'react-router-dom';
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
import { Routes, Route } from 'react-router-dom';

const AccountantDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  // Add CSS classes to body and html to prevent white space
  useEffect(() => {
    document.body.classList.add('accountant-dashboard-active');
    document.documentElement.classList.add('accountant-dashboard-active');
    
    return () => {
      document.body.classList.remove('accountant-dashboard-active');
      document.documentElement.classList.remove('accountant-dashboard-active');
    };
  }, []);

  return (
    <Box 
      className="accountant-dashboard-no-sidebar"
      sx={{ 
        width: '100%',
        margin: 0,
        padding: 0,
        '& *': {
          marginLeft: 0,
          paddingLeft: 0,
        },
        '& body, & html': {
          margin: 0,
          padding: 0,
          marginLeft: 0,
          paddingLeft: 0,
        },
        '& .MuiBox-root': {
          marginLeft: 0,
          paddingLeft: 0,
        },
        '& .MuiContainer-root': {
          marginLeft: 0,
          paddingLeft: 0,
          maxWidth: '100% !important',
        },
        '& .MuiGrid-root': {
          marginLeft: 0,
          paddingLeft: 0,
        },
        '& .MuiContainer-maxWidthLg': {
          marginLeft: 0,
          paddingLeft: 0,
          maxWidth: '100% !important',
        },
        '&.accountant-dashboard-no-sidebar': {
          marginLeft: 0,
          paddingLeft: 0,
        },
        '& .accountant-dashboard-no-sidebar *': {
          marginLeft: 0,
          paddingLeft: 0,
        }
      }}
    >
      <Box
        sx={{
          '& .MuiAppBar-root': {
            width: '100% !important',
            marginLeft: '0 !important',
            left: '0 !important',
          },
          '& .MuiToolbar-root': {
            marginLeft: 0,
            paddingLeft: 0,
          }
        }}
      >
        <Header />
      </Box>
      <Box
        component="main"
        sx={{
          p: 3,
          width: '100%',
          mt: 8,
          marginLeft: 0,
          paddingLeft: 0,
          '& *': {
            marginLeft: 0,
            paddingLeft: 0,
          }
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
          <Route path="agent-accounts" element={<AgentAccountsPage />} />
          <Route path="agent-accounts/:agentId" element={<AgentAccountDetailPage />} />
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