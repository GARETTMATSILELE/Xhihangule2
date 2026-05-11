import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Badge,
  ListItemIcon,
  Divider
} from '@mui/material';
import { 
  Notifications as NotificationsIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { useCompany } from '../contexts/CompanyContext';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { AccountantSidebar } from '../components/Layout/AccountantSidebar';
import { useAuth } from '../contexts/AuthContext';
import DashboardOverview from './AccountantDashboard/DashboardOverview';

const DRAWER_WIDTH = 280;

const AccountantDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { company } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isUserMenuOpen = Boolean(menuAnchorEl);
  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => setMenuAnchorEl(event.currentTarget);
  const handleCloseUserMenu = () => setMenuAnchorEl(null);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/payments')) setActiveTab(1);
    else if (path.includes('/sales')) setActiveTab(2);
    else if (path.includes('/ledger')) setActiveTab(3);
    else if (path.includes('/levies')) setActiveTab(4);
    else if (path.includes('/written-invoices')) setActiveTab(5);
    else if (path.includes('/property-accounts')) setActiveTab(6);
    else if (path.includes('/agent-accounts')) setActiveTab(7);
    else if (path.includes('/commissions')) setActiveTab(8);
    else if (path.includes('/tax')) setActiveTab(9);
    else if (path.includes('/reports')) setActiveTab(10);
    else if (path.includes('/trust-account-reports')) setActiveTab(11);
    else if (path.includes('/data-sync')) setActiveTab(12);
    else if (path.includes('/tasks')) setActiveTab(13);
    else if (path.includes('/settings')) setActiveTab(14);
    else setActiveTab(0);
  }, [location.pathname]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Adapter for AccountantSidebar (expects (index: number) => void)
  const handleSidebarTabChange = (index: number) => {
    handleTabChange({} as React.SyntheticEvent, index);
  };

  const renderMainContent = () => {
    if (location.pathname === '/accountant-dashboard') {
      return <DashboardOverview />;
    }
    return <Outlet />;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top Banner */}
      <Box sx={{
        width: '100%',
        height: 64,
        bgcolor: '#1E1E2F',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        boxShadow: 1,
        position: 'fixed',
        zIndex: 1201,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {company?.name || 'Accountant Dashboard'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body1" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User' : ''}
          </Typography>
          <IconButton
            onClick={handleOpenUserMenu}
            size="small"
            sx={{ p: 0.5, color: 'inherit' }}
            aria-controls={isUserMenuOpen ? 'user-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={isUserMenuOpen ? 'true' : undefined}
          >
            <Badge color="error" variant="dot" overlap="circular" invisible>
              <Avatar
                src={
                  ((user as any)?.photoURL ||
                  (user as any)?.avatarUrl ||
                  (user as any)?.profileImageUrl ||
                  (user as any)?.profilePicture ||
                  '') as string
                }
                sx={{ width: 36, height: 36, bgcolor: '#5E72E4' }}
              >
                {((user?.firstName?.[0] || '') + (user?.lastName?.[0] || '')).toUpperCase() || (user?.email?.[0]?.toUpperCase() || 'U')}
              </Avatar>
            </Badge>
          </IconButton>
          <Menu
            anchorEl={menuAnchorEl}
            id="user-menu"
            open={isUserMenuOpen}
            onClose={handleCloseUserMenu}
            onClick={handleCloseUserMenu}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{
              sx: {
                mt: 1,
                minWidth: 220,
              }
            }}
          >
            <MenuItem onClick={() => { handleCloseUserMenu(); navigate('/accountant-dashboard/tasks'); }}>
              <ListItemIcon>
                <NotificationsIcon fontSize="small" />
              </ListItemIcon>
              Notifications
            </MenuItem>
            <MenuItem onClick={() => { handleCloseUserMenu(); navigate('/accountant-dashboard/settings'); }}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              Settings
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { handleCloseUserMenu(); logout(); }}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexGrow: 1, pt: 8 }}>
        {/* Sidebar fixed and visible across accountant routes */}
        <Box sx={{ display: { xs: 'none', sm: 'block' }, position: 'fixed', zIndex: 1200 }}>
          <AccountantSidebar
            activeTab={activeTab}
            onTabChange={handleSidebarTabChange}
          />
        </Box>
        {/* Main content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            pt: 3,
            pr: 3,
            pb: 3,
            pl: 0,
            width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
            ml: { sm: `${DRAWER_WIDTH}px` },
          }}
        >
          <Box sx={{ display: { sm: 'none' }, mb: 2 }}>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
            >
              <MenuIcon />
            </IconButton>
          </Box>
          {renderMainContent()}
        </Box>
      </Box>
    </Box>
  );
};

export default AccountantDashboard;
