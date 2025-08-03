import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  Settings as SettingsIcon,
  Build as BuildIcon,
  Message as MessageIcon,
  Assignment as AssignmentIcon,
  CalendarToday as CalendarIcon,
  Folder as FolderIcon,
  Receipt as ReceiptIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const drawerWidth = 280;

interface AgentSidebarProps {
  activeTab: number;
  onTabChange: (index: number) => void;
}

export const AgentSidebar: React.FC<AgentSidebarProps> = ({ activeTab, onTabChange }) => {
  const navigate = useNavigate();
  const { user, company } = useAuth();

  const menuItems = [
    { 
      text: 'Dashboard', 
      icon: <DashboardIcon />, 
      path: '/agent-dashboard' 
    },
    { 
      text: 'My Properties', 
      icon: <BusinessIcon />, 
      path: '/agent-dashboard/properties' 
    },
    { 
      text: 'My Tenants', 
      icon: <PeopleIcon />, 
      path: '/agent-dashboard/tenants' 
    },
    { 
      text: 'Leases', 
      icon: <DescriptionIcon />, 
      path: '/agent-dashboard/leases' 
    },
    { 
      text: 'Property Owners', 
      icon: <PersonIcon />, 
      path: '/agent-dashboard/property-owners' 
    },
    { 
      text: 'Payments', 
      icon: <PaymentIcon />, 
      path: '/agent-dashboard/payments' 
    },
    {
      text: 'Levies',
      icon: <ReceiptIcon />,
      path: '/agent-dashboard/levies'
    },
    { 
      text: 'Files', 
      icon: <FolderIcon />, 
      path: '/agent-dashboard/files' 
    },
    { 
      text: 'Maintenance', 
      icon: <BuildIcon />, 
      path: '/agent-dashboard/maintenance' 
    },
    { 
      text: 'Communications', 
      icon: <MessageIcon />, 
      path: '/agent-dashboard/communications' 
    },
    { 
      text: 'Tasks', 
      icon: <AssignmentIcon />, 
      path: '/agent-dashboard/tasks' 
    },
    { 
      text: 'Schedule', 
      icon: <CalendarIcon />, 
      path: '/agent-dashboard/schedule' 
    },
    { 
      text: 'Settings', 
      icon: <SettingsIcon />, 
      path: '/agent-dashboard/settings' 
    },
  ];

  const handleNavigation = (path: string, index: number) => {
    onTabChange(index);
    navigate(path);
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: '#1E1E2F',
          color: '#FFFFFF',
          borderRight: 'none',
          position: 'fixed',
          height: '100vh',
        },
      }}
    >
      <Box sx={{ overflow: 'auto', px: 2 }}>
        {company && (
          <>
            <Box sx={{ px: 2, mb: 2, mt: 2 }}>
              {/* Company Logo */}
              {company.logo && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                  <Avatar
                    src={`data:image/png;base64,${company.logo}`}
                    sx={{ 
                      width: 200, 
                      height: 100,
                      border: '0.1px solid rgba(255, 255, 255, 0.2)'
                    }}
                    variant="rounded"
                  />
                </Box>
              )}
              
              <Typography variant="subtitle2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                Company
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {company.name}
              </Typography>
            </Box>
            <Divider sx={{ mb: 2, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
          </>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, px: 2 }}>
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: 'primary.main',
              mr: 2,
            }}
          >
            {user?.firstName?.charAt(0) || 'A'}
          </Avatar>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {user ? `${user.firstName} ${user.lastName}` : 'Agent User'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              {user?.email || 'agent@example.com'}
            </Typography>
          </Box>
        </Box>

        <List>
          {menuItems.map((item, index) => (
            <ListItem
              button
              key={item.text}
              onClick={() => handleNavigation(item.path, index)}
              selected={activeTab === index}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(94, 114, 228, 0.1)',
                  '&:hover': {
                    backgroundColor: 'rgba(94, 114, 228, 0.2)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              <ListItemIcon sx={{ color: activeTab === index ? 'primary.main' : 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text} 
                primaryTypographyProps={{
                  fontWeight: activeTab === index ? 600 : 400,
                }}
              />
            </ListItem>
          ))}
        </List>
      </Box>
    </Drawer>
  );
}; 