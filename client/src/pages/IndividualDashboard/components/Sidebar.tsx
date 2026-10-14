import React from 'react';
import { Box, Divider, Drawer, List, ListItem, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { drawerWidth, getNavSections } from '../constants';
import { getWorkspaceBasePath } from '../../../demo/demoMode';
import { INDIVIDUAL_THEME } from '../theme';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = getWorkspaceBasePath(location.pathname);
  const sections = getNavSections(base);
  const demo = base === '/demo';

  const isActive = (path: string) => {
    if (path === base) return location.pathname === path || location.pathname === `${path}/`;
    return location.pathname.startsWith(path);
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
          backgroundColor: INDIVIDUAL_THEME.sidebarBg,
          color: INDIVIDUAL_THEME.sidebarText,
          borderRight: 'none'
        }
      }}
    >
      <Box sx={{ p: 3, pb: 2 }}>
        <Typography variant="overline" sx={{ color: INDIVIDUAL_THEME.sidebarMuted, letterSpacing: 2 }}>MANTIS</Typography>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{demo ? 'Sample Portfolio' : 'Property Owner'}</Typography>
        <Typography variant="caption" sx={{ color: INDIVIDUAL_THEME.sidebarMuted }}>{demo ? 'Demo workspace' : 'Individual Workspace'}</Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />
      <Box sx={{ py: 1.5, overflowY: 'auto' }}>
        {sections.map((section, idx) => (
          <Box key={idx} sx={{ mb: 1 }}>
            {section.title && (
              <Typography variant="overline" sx={{ px: 2.5, color: INDIVIDUAL_THEME.sidebarMuted, fontSize: '0.65rem', letterSpacing: 1.2 }}>
                {section.title}
              </Typography>
            )}
            <List sx={{ px: 1.5 }}>
              {section.items.map((item) => (
                <ListItem
                  button
                  key={item.path}
                  selected={isActive(item.path)}
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.25,
                    py: 0.75,
                    '&.Mui-selected': {
                      backgroundColor: INDIVIDUAL_THEME.sidebarActive,
                      '&:hover': { backgroundColor: INDIVIDUAL_THEME.sidebarActive }
                    },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' }
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.9rem' }} />
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      </Box>
    </Drawer>
  );
}

export default Sidebar;
