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
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Receipt as ReceiptIcon,
  AttachMoney as DollarSignIcon,
  Assessment as AssessmentIcon,
  Settings as SettingsIcon,
  AccountBalance as AccountBalanceIcon,
  Assignment as TaskIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';

const drawerWidth = 280;

interface AccountantSidebarProps {
  activeTab: number;
  onTabChange: (index: number) => void;
}

export const AccountantSidebar: React.FC<AccountantSidebarProps> = ({ activeTab, onTabChange }) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { company } = useCompany();

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/accountant-dashboard' },
    { text: 'Payments', icon: <ReceiptIcon />, path: '/accountant-dashboard/payments' },
    { text: 'Levies', icon: <ReceiptIcon />, path: '/accountant-dashboard/levies' },
    { text: 'Invoices', icon: <ReceiptIcon />, path: '/accountant-dashboard/written-invoices' },
    { text: 'Property Accounts', icon: <AccountBalanceIcon />, path: '/accountant-dashboard/property-accounts' },
    { text: 'Agent Accounts', icon: <AccountBalanceIcon />, path: '/accountant-dashboard/agent-accounts' },
    { text: 'Commissions', icon: <DollarSignIcon />, path: '/accountant-dashboard/commissions' },
    { text: 'Reports', icon: <AssessmentIcon />, path: '/accountant-dashboard/reports' },
    { text: 'Data Sync', icon: <SyncIcon />, path: '/accountant-dashboard/data-sync' },
    { text: 'Tasks', icon: <TaskIcon />, path: '/accountant-dashboard/tasks' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/accountant-dashboard/settings' }
  ];

  const handleNavigation = (path: string, index: number) => {
    onTabChange(index);
    navigate(path);
  };

  if (authLoading) {
    return (
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            position: 'fixed',
            top: '64px',
            height: 'calc(100vh - 64px)',
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      </Drawer>
    );
  }

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
          top: '64px',
          height: 'calc(100vh - 64px)',
        },
      }}
    >
      <Box sx={{ height: '100%', overflowY: 'auto', px: 2, pb: 2 }}>
        {company && user && (
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
              width: 40,
              height: 40,
              bgcolor: 'primary.main',
              color: 'white',
              fontSize: '1.2rem',
            }}
          >
            {user?.firstName?.charAt(0) || 'A'}
          </Avatar>
          <Box sx={{ ml: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {user ? `${user.firstName} ${user.lastName}` : 'Guest User'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }} display="block">
              {user?.email || 'guest@example.com'}
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