import React, { useState } from 'react';
import { Box } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { AdminSidebar } from '../Layout/AdminSidebar';
import { AgentSidebar } from '../Layout/AgentSidebar';
import { Header } from '../Layout/Header';
import { AdminSettings } from '../../pages/Settings/AdminSettings';
import { AgentSettings } from '../../pages/Settings/AgentSettings';

interface SettingsPageWrapperProps {
  userRole?: string;
}

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ userRole }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(userRole === 'agent' ? 10 : 11); // 10 for agent, 11 for admin

  // Determine which sidebar and settings component to use
  const role = userRole || user?.role;
  const SidebarComponent = role === 'agent' ? AgentSidebar : AdminSidebar;
  const SettingsComponent = role === 'agent' ? AgentSettings : AdminSettings;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <SidebarComponent activeTab={activeTab} onTabChange={setActiveTab} />
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ p: 3, mt: 8 }}>
          <SettingsComponent />
        </Box>
      </Box>
    </Box>
  );
};

export default SettingsPageWrapper; 