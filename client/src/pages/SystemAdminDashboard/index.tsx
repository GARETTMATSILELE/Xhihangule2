import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';
import SystemAdminLayout from './SystemAdminLayout';
import DashboardPage from './DashboardPage';
import StatusPage from './StatusPage';
import BackupsMaintenancePage from './BackupsMaintenancePage';
import UsersPage from './UsersPage';
import SubscriptionManagementPage from './SubscriptionManagementPage';
import CashSubscriptionsPage from './CashSubscriptionsPage';

const SystemAdminDashboard: React.FC = () => {
  return (
    <ProtectedRoute requiredRoles={['system_admin']}>
      <Routes>
        <Route element={<SystemAdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="backups-maintenance" element={<BackupsMaintenancePage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="subscriptions" element={<SubscriptionManagementPage />} />
          <Route path="cash-subscriptions" element={<CashSubscriptionsPage />} />
          <Route path="*" element={<Navigate to="/system-admin" replace />} />
        </Route>
      </Routes>
    </ProtectedRoute>
  );
};

export default SystemAdminDashboard;

