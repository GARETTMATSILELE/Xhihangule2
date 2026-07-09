import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Button,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  Settings as SettingsIcon,
  Build as BuildIcon,
  Engineering as EngineeringIcon,
  Assignment as AssignmentIcon,
  CalendarToday as CalendarIcon,
  Folder as FolderIcon,
  Receipt as ReceiptIcon,
  Person as PersonIcon,
  Timeline as TimelineIcon,
  HelpOutline as HelpOutlineIcon,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const drawerWidth = 280;

interface AgentSidebarProps {
  activeTab: number;
  onTabChange: (index: number) => void;
}

export const AgentSidebar: React.FC<AgentSidebarProps> = ({ activeTab, onTabChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = useAuth();

  const menuItems = [
    { 
      text: 'Dashboard', 
      icon: <DashboardIcon />, 
      path: '/agent-dashboard' 
    },
    {
      text: 'Workflow',
      icon: <TimelineIcon />,
      path: '/agent-dashboard/workflow'
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
      text: 'Maintenance Vendors', 
      icon: <EngineeringIcon />, 
      path: '/agent-dashboard/maintenance-vendors' 
    },
    { 
      text: 'Reports', 
      icon: <BarChartIcon />, 
      path: '/agent-dashboard/inspections' 
    },
    { 
      text: 'Leads', 
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
          background: 'radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 34%), linear-gradient(180deg, #0f172a 0%, #111827 48%, #0b1120 100%)',
          color: '#FFFFFF',
          borderRight: 'none',
          position: 'fixed',
          height: '100vh',
          boxShadow: '18px 0 50px rgba(15, 23, 42, 0.18)',
        },
      }}
    >
      <Box sx={{ overflow: 'auto', px: 2.25, py: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {company && (
          <>
            <Box sx={{ px: 1.5, mb: 2, mt: 1 }}>
              {/* Company Logo */}
              {company.logo && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                  <Avatar
                    src={`data:image/png;base64,${company.logo}`}
                    sx={{ 
                      width: 178, 
                      height: 86,
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
                      bgcolor: 'rgba(255,255,255,0.06)',
                    }}
                    variant="rounded"
                  />
                </Box>
              )}
              
              <Typography variant="caption" sx={{ color: 'rgba(226, 232, 240, 0.55)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800 }}>
                Workspace
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, mt: 0.5, letterSpacing: '-0.02em' }}>
                {company.name}
              </Typography>
            </Box>
            <Divider sx={{ mb: 2, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
          </>
        )}

        {/* User details removed; name will be shown in header */}

        <List sx={{ flex: 1 }}>
          {menuItems.map((item, index) => (
            (() => {
              const isSelected = item.path === '/agent-dashboard'
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path);
              return (
            <ListItem
              button
              key={item.text}
              onClick={() => handleNavigation(item.path, index)}
              selected={isSelected || activeTab === index}
              sx={{
                borderRadius: 3,
                mb: 0.75,
                px: 1.5,
                py: 1.05,
                color: isSelected || activeTab === index ? '#ffffff' : 'rgba(226, 232, 240, 0.72)',
                transition: 'background-color 180ms ease, transform 180ms ease, color 180ms ease, box-shadow 180ms ease',
                '&.Mui-selected': {
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.88), rgba(14,165,233,0.58))',
                  boxShadow: '0 12px 30px rgba(37, 99, 235, 0.28)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, rgba(37,99,235,0.96), rgba(14,165,233,0.66))',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  transform: 'translateX(3px)',
                  color: '#ffffff',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 38 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text} 
                primaryTypographyProps={{
                  fontWeight: isSelected || activeTab === index ? 800 : 500,
                  fontSize: 14,
                }}
              />
            </ListItem>
              );
            })()
          ))}
        </List>
        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: 4,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045))',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <HelpOutlineIcon sx={{ color: '#93c5fd', mb: 1 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Need help?
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(226, 232, 240, 0.68)', display: 'block', my: 1 }}>
            Get support with rental operations and workflow setup.
          </Typography>
          <Button size="small" variant="contained" fullWidth sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 800, boxShadow: 'none' }}>
            Support
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}; 