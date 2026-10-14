import React from 'react';
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router-dom';
import { INDIVIDUAL_THEME } from '../IndividualDashboard/theme';

const drawerWidth = 260;

export const PortalShell: React.FC<{
  title: string;
  items: Array<{ text: string; path: string; icon: React.ReactNode }>;
  children: React.ReactNode;
}> = ({ title, items, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = React.useState(!mobile);

  React.useEffect(() => {
    setOpen(!mobile);
  }, [mobile]);

  const drawer = (
    <Box sx={{ height: '100%', bgcolor: INDIVIDUAL_THEME.sidebarBg, color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography variant="caption" sx={{ color: INDIVIDUAL_THEME.sidebarMuted }}>Mantis Property</Typography>
      </Box>
      <List sx={{ px: 1, flex: 1 }}>
        {items.map((item) => {
          const active = location.pathname === item.path || (item.path !== items[0].path && location.pathname.startsWith(item.path));
          return (
            <ListItemButton
              key={item.path}
              aria-label={item.text}
              onClick={() => { navigate(item.path); if (mobile) setOpen(false); }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                minHeight: 48,
                bgcolor: active ? INDIVIDUAL_THEME.sidebarActive : 'transparent',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              <ListItemIcon sx={{ color: '#fff', minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: INDIVIDUAL_THEME.background }}>
      <Drawer
        variant={mobile ? 'temporary' : 'permanent'}
        open={open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: drawerWidth,
          '& .MuiDrawer-paper': { width: drawerWidth, border: 'none' },
        }}
      >
        {drawer}
      </Drawer>
      <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, width: '100%' }}>
        {mobile && (
          <Box
            component="button"
            aria-label="Open navigation menu"
            onClick={() => setOpen(true)}
            sx={{
              mb: 2,
              px: 2,
              py: 1.25,
              borderRadius: 2,
              border: 'none',
              bgcolor: INDIVIDUAL_THEME.primary,
              color: '#fff',
              fontWeight: 600,
              minHeight: 44,
            }}
          >
            Menu
          </Box>
        )}
        {children}
      </Box>
    </Box>
  );
};
