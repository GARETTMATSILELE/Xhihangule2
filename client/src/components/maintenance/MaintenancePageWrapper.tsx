import React, { useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { AdminSidebar } from '../Layout/AdminSidebar';
import { AgentSidebar } from '../Layout/AgentSidebar';
import { Header } from '../Layout/Header';
import { Maintenance } from '../../pages/Maintenance/Maintenance';

interface MaintenancePageWrapperProps {
  userRole?: string;
}

const MaintenancePageWrapper: React.FC<MaintenancePageWrapperProps> = ({ userRole }) => {
  const { user, company, loading: authLoading, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState(userRole === 'agent' ? 6 : 5); // 6 for agent, 5 for admin

  // Debug logging
  console.log('MaintenancePageWrapper - Authentication State:', {
    userRole,
    user: user ? { id: user._id, email: user.email, role: user.role, companyId: user.companyId } : null,
    company: company ? { id: company._id, name: company.name } : null,
    authLoading,
    isAuthenticated
  });

  // Determine which sidebar to use
  const role = userRole || user?.role;
  const SidebarComponent = role === 'agent' ? AgentSidebar : AdminSidebar;

  // Show loading if authentication is still loading
  if (authLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Loading authentication...
        </Typography>
      </Box>
    );
  }

  // Show error if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography variant="h6" color="error">
          Authentication required. Please log in to access maintenance requests.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <SidebarComponent activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ p: 3, mt: 8 }}>
          <Maintenance 
            user={user}
            company={company || undefined}
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default MaintenancePageWrapper; 