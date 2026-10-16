import React, { useEffect, useState } from 'react';
import { Box, Divider, List, ListItem, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { ResponsiveSidebarFrame, useResponsiveSidebar } from '../../../components/Layout/responsiveSidebar';
import { drawerWidth, getNavSections } from '../constants';
import { getWorkspaceBasePath } from '../../../demo/demoMode';
import { INDIVIDUAL_THEME } from '../theme';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = getWorkspaceBasePath(location.pathname);
  const sections = getNavSections(base);
  const demo = base === '/demo';
  const sidebar = useResponsiveSidebar(drawerWidth);
  const [chromeOffset, setChromeOffset] = useState(0);

  useEffect(() => {
    if (!demo) return undefined;
    const measure = () => {
      const banner = document.querySelector('.demo-banner');
      const brand = document.querySelector('.demo-brandbar');
      const height = (banner?.getBoundingClientRect().height || 0) + (brand?.getBoundingClientRect().height || 0);
      setChromeOffset(Math.round(height));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [demo]);

  const isActive = (path: string) => {
    if (path === base) return location.pathname === path || location.pathname === `${path}/`;
    return location.pathname.startsWith(path);
  };

  return (
    <ResponsiveSidebarFrame
      state={sidebar}
      expandedWidth={drawerWidth}
      topOffset={chromeOffset}
      paperSx={{
        backgroundColor: INDIVIDUAL_THEME.sidebarBg,
        color: INDIVIDUAL_THEME.sidebarText,
        borderRight: 'none'
      }}
    >
      {(collapsed) => (
        <>
          {!collapsed && (
            <Box sx={{ px: 3, pb: 2 }}>
              <Typography variant="overline" sx={{ color: INDIVIDUAL_THEME.sidebarMuted, letterSpacing: 2 }}>MANTIS</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{demo ? 'Sample Portfolio' : 'Property Owner'}</Typography>
              <Typography variant="caption" sx={{ color: INDIVIDUAL_THEME.sidebarMuted }}>{demo ? 'Demo workspace' : 'Individual Workspace'}</Typography>
            </Box>
          )}
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />
          <Box sx={{ py: 1.5, overflowY: 'auto' }}>
            {sections.map((section, idx) => (
              <Box key={idx} sx={{ mb: 1 }}>
                {!collapsed && section.title && (
                  <Typography variant="overline" sx={{ px: 2.5, color: INDIVIDUAL_THEME.sidebarMuted, fontSize: '0.65rem', letterSpacing: 1.2 }}>
                    {section.title}
                  </Typography>
                )}
                <List sx={{ px: collapsed ? 0.5 : 1.5 }}>
                  {section.items.map((item) => {
                    const row = (
                      <ListItem
                        button
                        aria-label={item.text}
                        selected={isActive(item.path)}
                        onClick={() => { navigate(item.path); sidebar.closeOverlay(); }}
                        sx={{
                          borderRadius: 2,
                          mb: 0.25,
                          py: 0.75,
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          '&.Mui-selected': {
                            backgroundColor: INDIVIDUAL_THEME.sidebarActive,
                            '&:hover': { backgroundColor: INDIVIDUAL_THEME.sidebarActive }
                          },
                          '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' }
                        }}
                      >
                        <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>{item.icon}</ListItemIcon>
                        {!collapsed && <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.9rem' }} />}
                      </ListItem>
                    );
                    return collapsed
                      ? <Tooltip key={item.path} title={item.text} placement="right">{row}</Tooltip>
                      : <React.Fragment key={item.path}>{row}</React.Fragment>;
                  })}
                </List>
              </Box>
            ))}
          </Box>
        </>
      )}
    </ResponsiveSidebarFrame>
  );
}

export default Sidebar;
