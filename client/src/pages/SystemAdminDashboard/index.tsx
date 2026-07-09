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
import CompaniesPage from './CompaniesPage';
import CompanyProfilePage from './CompanyProfilePage';
import CashPaymentsPage from './CashPaymentsPage';
import InvoicesPage from './InvoicesPage';
import VouchersPage from './VouchersPage';
import PlansPage from './PlansPage';
import AuditLogsPage from './AuditLogsPage';
import SupportTicketsPage from './SupportTicketsPage';
import RevenueAnalyticsPage from './RevenueAnalyticsPage';

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
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="companies/:id" element={<CompanyProfilePage />} />
          <Route path="cash-payments" element={<CashPaymentsPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="vouchers" element={<VouchersPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="support-tickets" element={<SupportTicketsPage />} />
          <Route path="revenue" element={<RevenueAnalyticsPage />} />
          <Route path="*" element={<Navigate to="/system-admin" replace />} />
        </Route>
      </Routes>
    </ProtectedRoute>
  );
};

export default SystemAdminDashboard;

