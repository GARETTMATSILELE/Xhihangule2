import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Box, Button, CssBaseline, Drawer, Toolbar, Typography, Stack, AppBar, IconButton, Menu, MenuItem, Avatar, ListItemIcon } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const drawerWidth = 240;

const systemAdminTheme = createTheme({
  palette: {
    primary: { main: '#235347' }
  }
});

const NavButton: React.FC<{ to: string; label: string }> = ({ to, label }) => {
  return (
    <NavLink
      to={to}
      style={{ textDecoration: 'none' }}
      className={({ isActive }) => (isActive ? 'active' : undefined)}
      end={to === '/system-admin'}
    >
      {({ isActive }) => (
        <Button
          fullWidth
          variant="text"
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontWeight: 700,
            color: '#DAF1DE',
            borderRadius: 1,
            px: 1.25,
            '&:hover': { bgcolor: 'rgba(218,241,222,0.10)' },
            ...(isActive ? { bgcolor: 'rgba(218,241,222,0.16)' } : {})
          }}
        >
          {label}
        </Button>
      )}
    </NavLink>
  );
};

const SystemAdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const { user, company, logout } = useAuth() as any;
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const userDisplayName =
    (user && ((user as any).firstName || (user as any).lastName))
      ? `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim()
      : ((user as any)?.name || (user as any)?.email || 'User');

  const openMenu = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const closeMenu = () => setAnchorEl(null);
  const goSettings = () => { closeMenu(); navigate('/settings'); };
  const doLogout = async () => { closeMenu(); try { await logout(); } finally { navigate('/login'); } };

  return (
    <ThemeProvider theme={systemAdminTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <AppBar
          position="fixed"
          color="primary"
          enableColorOnDark
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            width: '100%',
            ml: 0,
            bgcolor: '#235347',
            color: '#DAF1DE'
          }}
        >
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700, color: '#DAF1DE' }}>
              {company?.name || 'System Admin'}
            </Typography>
            <Typography variant="body1" sx={{ mr: 1, color: '#DAF1DE' }}>{userDisplayName}</Typography>
            <IconButton color="inherit" onClick={openMenu} size="small">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.25)', color: '#DAF1DE' }}>
                {user?.firstName?.charAt(0) || 'U'}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={closeMenu}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={goSettings}>
                <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                Settings
              </MenuItem>
              <MenuItem onClick={doLogout}>
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              borderRight: 'none',
              bgcolor: '#235347',
              color: '#DAF1DE',
              top: { xs: 56, sm: 64 },
              height: { xs: 'calc(100% - 56px)', sm: 'calc(100% - 64px)' }
            }
          }}
          open
        >
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700, color: '#DAF1DE' }}>
              System Admin
            </Typography>
            <Stack spacing={0.5}>
              <NavButton to="/system-admin" label="Dashboard" />
              <NavButton to="/system-admin/status" label="Status" />
              <NavButton to="/system-admin/backups-maintenance" label="Backups & Maintenance" />
              <NavButton to="/system-admin/users" label="User Management" />
              <NavButton to="/system-admin/subscriptions" label="Subscription management" />
            </Stack>
          </Box>
        </Drawer>
        <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: '#F0EDE5' }}>
          <Toolbar />
          <Outlet />
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default SystemAdminLayout;


