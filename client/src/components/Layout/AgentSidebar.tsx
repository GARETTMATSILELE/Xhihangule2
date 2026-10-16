import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Box,
  Typography,
  Avatar,
  Divider,
  Button,
  Tooltip,
} from '@mui/material';
import { ResponsiveSidebarFrame, useResponsiveSidebar } from './responsiveSidebar';
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
  const { company, user } = useAuth();
  const sidebar = useResponsiveSidebar(drawerWidth);
  const roleList = [user?.role, ...((user as any)?.roles || [])].filter(Boolean);
  const canOverseePortfolio = roleList.some((role) => ['admin', 'principal', 'prea', 'accountant'].includes(String(role)));

  const menuItems = [
    { group: 'Overview', text: 'Dashboard', icon: <DashboardIcon />, path: '/agent-dashboard' },
    { group: 'My work', text: 'Action Centre', icon: <TimelineIcon />, path: '/agent-dashboard/workflow' },
    { group: 'My work', text: 'Tasks', icon: <AssignmentIcon />, path: '/agent-dashboard/tasks' },
    { group: 'My work', text: 'Schedule', icon: <CalendarIcon />, path: '/agent-dashboard/schedule' },
    { group: 'Rentals', text: 'Properties', icon: <BusinessIcon />, path: '/agent-dashboard/properties' },
    { group: 'Rentals', text: 'Tenants', icon: <PeopleIcon />, path: '/agent-dashboard/tenants' },
    { group: 'Rentals', text: 'Leases', icon: <DescriptionIcon />, path: '/agent-dashboard/leases' },
    { group: 'Rentals', text: 'Viewings', icon: <AssignmentIcon />, path: '/agent-dashboard/viewings' },
    { group: 'Rentals', text: 'Applications', icon: <PeopleIcon />, path: '/agent-dashboard/applications' },
    { group: 'Owners', text: 'Owners', icon: <PersonIcon />, path: '/agent-dashboard/property-owners' },
    { group: 'Owners', text: 'Collections', icon: <PaymentIcon />, path: '/agent-dashboard/owner-collections' },
    { group: 'Operations', text: 'Maintenance', icon: <BuildIcon />, path: '/agent-dashboard/maintenance' },
    { group: 'Operations', text: 'Quotes', icon: <BuildIcon />, path: '/agent-dashboard/quotes' },
    { group: 'Operations', text: 'Contractors', icon: <EngineeringIcon />, path: '/agent-dashboard/contractors' },
    { group: 'Operations', text: 'Levies', icon: <ReceiptIcon />, path: '/agent-dashboard/levies' },
    { group: 'Operations', text: 'Inspections', icon: <AssignmentIcon />, path: '/agent-dashboard/inspections' },
    { group: 'Operations', text: 'Files', icon: <FolderIcon />, path: '/agent-dashboard/files' },
    { group: 'Finance', text: 'Payments', icon: <PaymentIcon />, path: '/agent-dashboard/payments' },
    { group: 'Finance', text: 'Rent collection', icon: <ReceiptIcon />, path: '/agent-dashboard/rent-collection' },
    { group: 'Overview', text: 'Search', icon: <AssignmentIcon />, path: '/agent-dashboard/search' },
    ...(canOverseePortfolio ? [{ group: 'Overview', text: 'Portfolio oversight', icon: <BarChartIcon />, path: '/agent-dashboard/portfolio' }] : []),
    { group: 'Reporting', text: 'Agent Reports', icon: <BarChartIcon />, path: '/agent-dashboard/property-details-report' },
    { group: 'Settings', text: 'Settings', icon: <SettingsIcon />, path: '/agent-dashboard/settings' },
  ];

  const handleNavigation = (path: string, index: number) => {
    onTabChange(index);
    navigate(path);
    sidebar.closeOverlay();
  };

  return (
    <ResponsiveSidebarFrame
      state={sidebar}
      expandedWidth={drawerWidth}
      hideOnPrint
      paperSx={{
        background: 'radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 34%), linear-gradient(180deg, #0f172a 0%, #111827 48%, #0b1120 100%)',
        color: '#FFFFFF',
        borderRight: 'none',
        boxShadow: '18px 0 50px rgba(15, 23, 42, 0.18)',
      }}
    >
      {(collapsed) => (
      <Box sx={{ overflow: 'auto', px: collapsed ? 0.5 : 2.25, py: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {!collapsed && company && (
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

        <List sx={{ flex: 1 }} subheader={<li />}>
          {menuItems.map((item, index) => (
            (() => {
              const isSelected = item.path === '/agent-dashboard'
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path);
              const showGroup = index === 0 || menuItems[index - 1].group !== item.group;
              return (
            <React.Fragment key={item.text}>
            {showGroup && !collapsed && (
              <ListSubheader sx={{ bgcolor: 'transparent', color: 'rgba(226,232,240,0.45)', lineHeight: '28px', fontSize: 11, letterSpacing: '0.08em', fontWeight: 800 }}>
                {item.group.toUpperCase()}
              </ListSubheader>
            )}
            <Tooltip title={collapsed ? item.text : ''} placement="right" disableHoverListener={!collapsed}>
            <ListItem
              button
              aria-label={item.text}
              onClick={() => handleNavigation(item.path, index)}
              selected={isSelected || activeTab === index}
              sx={{
                borderRadius: 3,
                mb: 0.75,
                px: collapsed ? 1 : 1.5,
                py: 1.05,
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: isSelected || activeTab === index ? '#ffffff' : 'rgba(226, 232, 240, 0.72)',
                transition: sidebar.prefersReducedMotion ? 'none' : 'background-color 180ms ease, transform 180ms ease, color 180ms ease, box-shadow 180ms ease',
                '&.Mui-selected': {
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.88), rgba(14,165,233,0.58))',
                  boxShadow: '0 12px 30px rgba(37, 99, 235, 0.28)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, rgba(37,99,235,0.96), rgba(14,165,233,0.66))',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  transform: collapsed ? 'none' : 'translateX(3px)',
                  color: '#ffffff',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 38, justifyContent: 'center' }}>
                {item.icon}
              </ListItemIcon>
              {!collapsed && (
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{
                  fontWeight: isSelected || activeTab === index ? 800 : 500,
                  fontSize: 14,
                }}
              />
              )}
            </ListItem>
            </Tooltip>
            </React.Fragment>
              );
            })()
          ))}
        </List>
        {!collapsed && <Box
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
        </Box>}
      </Box>
      )}
    </ResponsiveSidebarFrame>
  );
}; 