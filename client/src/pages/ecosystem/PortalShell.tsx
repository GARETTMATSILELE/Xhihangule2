import React from 'react';
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { ResponsiveSidebarFrame, useResponsiveSidebar } from '../../components/Layout/responsiveSidebar';
import { INDIVIDUAL_THEME } from '../IndividualDashboard/theme';

const drawerWidth = 260;

export const PortalShell: React.FC<{
  title: string;
  items: Array<{ text: string; path: string; icon: React.ReactNode }>;
  children: React.ReactNode;
}> = ({ title, items, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebar = useResponsiveSidebar(drawerWidth);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: INDIVIDUAL_THEME.background }}>
      <ResponsiveSidebarFrame
        state={sidebar}
        expandedWidth={drawerWidth}
        paperSx={{ bgcolor: INDIVIDUAL_THEME.sidebarBg, color: '#fff', border: 'none' }}
      >
        {(collapsed) => (
          <Box sx={{ color: '#fff', display: 'flex', flexDirection: 'column', flex: 1 }}>
            {!collapsed && (
              <Box sx={{ px: 2.5, pb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
                <Typography variant="caption" sx={{ color: INDIVIDUAL_THEME.sidebarMuted }}>Mantis Property</Typography>
              </Box>
            )}
            <List sx={{ px: collapsed ? 0.5 : 1, flex: 1 }}>
              {items.map((item) => {
                const active = location.pathname === item.path || (item.path !== items[0].path && location.pathname.startsWith(item.path));
                const button = (
                  <ListItemButton
                    aria-label={item.text}
                    onClick={() => { navigate(item.path); sidebar.closeOverlay(); }}
                    sx={{
                      borderRadius: 2,
                      mb: 0.5,
                      minHeight: 48,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      bgcolor: active ? INDIVIDUAL_THEME.sidebarActive : 'transparent',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    }}
                  >
                    <ListItemIcon sx={{ color: '#fff', minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>{item.icon}</ListItemIcon>
                    {!collapsed && <ListItemText primary={item.text} />}
                  </ListItemButton>
                );
                return collapsed
                  ? <Tooltip key={item.path} title={item.text} placement="right">{button}</Tooltip>
                  : <React.Fragment key={item.path}>{button}</React.Fragment>;
              })}
            </List>
          </Box>
        )}
      </ResponsiveSidebarFrame>
      <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 3 }, width: '100%' }}>
        {children}
      </Box>
    </Box>
  );
};
