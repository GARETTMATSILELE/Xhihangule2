import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Box,
  Typography,
  Divider,
  CircularProgress,
  Avatar,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Payment as PaymentIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const drawerWidth = 240;

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, loading, company } = useAuth();

  const isActive = (path: string) => {
    // Check if the current path matches exactly or starts with the menu path
    // This handles both exact matches and nested routes
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const menuItems = useMemo(() => {
    if (!user) return [];

    const items = [
      {
        text: 'Dashboard',
        icon: <DashboardIcon />,
        path: '/dashboard',
      },
      {
        text: 'Properties',
        icon: <BusinessIcon />,
        path: '/properties',
      },
      {
        text: 'Tenants',
        icon: <PeopleIcon />,
        path: '/tenants',
      },
      {
        text: 'Payments',
        icon: <PaymentIcon />,
        path: '/payments',
      },
    ];

    if (user.role === 'admin') {
      items.push({
        text: 'Settings',
        icon: <SettingsIcon />,
        path: '/settings',
      });
    }

    return items;
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            mt: 8,
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      </Drawer>
    );
  }

  if (!user) {
    return null;
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
          mt: 8,
        },
      }}
    >
      <Box sx={{ overflow: 'auto' }}>
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

        <List>
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={isActive(item.path)}
                onClick={() => navigate(item.path)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.12)',
                    },
                  },
                }}
              >
                <ListItemIcon 
                  sx={{
                    color: isActive(item.path) ? 'primary.main' : 'inherit',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text}
                  primaryTypographyProps={{
                    fontWeight: isActive(item.path) ? 600 : 400,
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider />
        <List>
          <ListItem disablePadding>
            <ListItemButton onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon />
              </ListItemIcon>
              <ListItemText primary="Logout" />
            </ListItemButton>
          </ListItem>
        </List>
      </Box>
    </Drawer>
  );
}; 