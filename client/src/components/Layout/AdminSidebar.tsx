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
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  Settings as SettingsIcon,
  Build as BuildIcon,
  Message as MessageIcon,
  Group as GroupIcon,
  Assessment as AssessmentIcon,
  AccountBalance as AccountBalanceIcon,
  Folder as FolderIcon,
  Receipt as ReceiptIcon,
  Sync as SyncIcon,
  Notifications as NotificationsIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';

const drawerWidth = 280;

interface AdminSidebarProps {
  activeTab: number;
  onTabChange: (index: number) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeTab, onTabChange }) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { company } = useCompany();

  const baseItems = [
    { 
      text: 'Dashboard', 
      icon: <DashboardIcon />, 
      path: '/admin-dashboard' 
    },
    { 
      text: 'Properties', 
      icon: <BusinessIcon />, 
      path: '/admin-dashboard/properties' 
    },
    { 
      text: 'Property Owners', 
      icon: <AccountBalanceIcon />, 
      path: '/admin-dashboard/property-owners' 
    },
    { 
      text: 'Tenants', 
      icon: <PeopleIcon />, 
      path: '/admin-dashboard/tenants' 
    },
    { 
      text: 'Leases', 
      icon: <DescriptionIcon />, 
      path: '/admin-dashboard/leases' 
    },
    { 
      text: 'Payments', 
      icon: <PaymentIcon />, 
      path: '/admin-dashboard/payments' 
    },
    {
      text: 'Levies',
      icon: <ReceiptIcon />,
      path: '/admin-dashboard/levies'
    },
    { 
      text: 'Files', 
      icon: <FolderIcon />, 
      path: '/admin-dashboard/files' 
    },
    { 
      text: 'Maintenance', 
      icon: <BuildIcon />, 
      path: '/admin-dashboard/maintenance' 
    },
    { 
      text: 'Communications', 
      icon: <MessageIcon />, 
      path: '/admin-dashboard/communications' 
    },
    { 
      text: 'User Management', 
      icon: <GroupIcon />, 
      path: '/admin-dashboard/users' 
    },
    { 
      text: 'Reports', 
      icon: <AssessmentIcon />, 
      path: '/admin-dashboard/reports' 
    },
    { 
      text: 'Database Sync', 
      icon: <SyncIcon />, 
      path: '/admin-dashboard/sync' 
    },
    { 
      text: 'Settings', 
      icon: <SettingsIcon />, 
      path: '/admin-dashboard/settings' 
    },
  ];

  const menuItems = React.useMemo(() => {
    const items = [...baseItems];
    // Add Property Accounts menu only for INDIVIDUAL plan
    if (company?.plan === 'INDIVIDUAL') {
      items.splice(6, 0, {
        text: 'Property Accounts',
        icon: <AccountBalanceIcon />,
        path: '/admin-dashboard/property-accounts'
      });
    }
    // Add Notifications/Approvals for Principal/PREA
    const roles: string[] = (Array.isArray((user as any)?.roles) && (user as any).roles.length > 0) ? (user as any).roles : [user?.role].filter(Boolean) as string[];
    if (roles.some(r => ['principal', 'prea'].includes(r))) {
      items.splice(items.length - 2, 0, {
        text: 'Notifications',
        icon: <NotificationsIcon />,
        path: '/admin-dashboard/approvals'
      });
    }
    return items;
  }, [company?.plan, user?.role, (user as any)?.roles]);

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
            height: '100vh',
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
          height: '100vh',
        },
      }}
    >
      <Box sx={{ overflow: 'auto', px: 2 }}>
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
                    imgProps={{ decoding: 'async', loading: 'lazy' }}
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
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {user ? `${user.firstName} ${user.lastName}` : 'Guest User'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
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