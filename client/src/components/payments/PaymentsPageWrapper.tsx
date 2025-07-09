import React, { useState } from 'react';
import { Box } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { AdminSidebar } from '../Layout/AdminSidebar';
import { AgentSidebar } from '../Layout/AgentSidebar';
import { Header } from '../Layout/Header';
import PaymentsPage from '../../pages/PaymentsPage';

interface PaymentsPageWrapperProps {
  userRole?: string;
}

const PaymentsPageWrapper: React.FC<PaymentsPageWrapperProps> = ({ userRole }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(userRole === 'agent' ? 4 : 4); // 4 is payments tab index

  // Determine which sidebar to use
  const role = userRole || user?.role;
  const SidebarComponent = role === 'agent' ? AgentSidebar : AdminSidebar;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <SidebarComponent activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ p: 3, mt: 8 }}>
          <PaymentsPage />
        </Box>
      </Box>
    </Box>
  );
};

export default PaymentsPageWrapper; 