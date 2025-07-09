import React, { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
  Avatar,
  Menu,
  MenuItem,
  Tooltip
} from '@mui/material';
import {
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  Payment as PaymentIcon,
  Assessment as AssessmentIcon,
  AccountCircle as AccountCircleIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  Dashboard as DashboardIcon,
  Receipt as ReceiptIcon,
  AttachMoney as DollarSignIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const drawerWidth = 240;

const AccountantDashboard: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout, company } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleProfileClick = () => {
    handleMenuClose();
    navigate('/accountant-dashboard/profile');
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/accountant-dashboard' },
    { text: 'Payments', icon: <ReceiptIcon />, path: '/accountant-dashboard/payments' },
    { text: 'Commissions', icon: <DollarSignIcon />, path: '/accountant-dashboard/commissions' },
    { text: 'Reports', icon: <AssessmentIcon />, path: '/accountant-dashboard/reports' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/accountant-dashboard/settings' }
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: 'white',
          color: 'text.primary',
          boxShadow: 1
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {user ? `${user.firstName} ${user.lastName}` : 'Dashboard'}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body1" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user ? `${user.firstName} ${user.lastName}` : 'User'}
            </Typography>
            <Tooltip title="Account settings">
              <IconButton
                onClick={handleMenuOpen}
                size="small"
                sx={{ ml: 2 }}
                aria-controls={Boolean(anchorEl) ? 'account-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={Boolean(anchorEl) ? 'true' : undefined}
              >
                <Avatar sx={{ width: 32, height: 32, bgcolor: theme.palette.primary.main }}>
                  {user?.firstName?.charAt(0) || 'U'}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={anchorEl}
              id="account-menu"
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              onClick={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem onClick={handleProfileClick}>
                <ListItemIcon>
                  <PersonIcon fontSize="small" />
                </ListItemIcon>
                Profile
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
        variant={isMobile ? 'temporary' : 'persistent'}
        anchor="left"
        open={open}
        onClose={handleDrawerToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', padding: 1 }}>
          <IconButton onClick={handleDrawerToggle}>
            <ChevronLeftIcon />
          </IconButton>
        </Box>
        <Divider />
        
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
            <ListItem 
              button 
              key={item.text}
              onClick={() => {
                navigate(item.path);
                if (isMobile) {
                  setOpen(false);
                }
              }}
              selected={location.pathname === item.path}
            >
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${open ? drawerWidth : 0}px)` },
          ml: { sm: `${open ? drawerWidth : 0}px` },
          mt: '64px'
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};

export default AccountantDashboard; 