import React, { useEffect, useState } from 'react';
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, useMediaQuery } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { getWorkspaceBasePath } from '../../../demo/demoMode';
import { useChrome } from './chrome';
import { drawerWidth, getNavSections } from '../constants';
import { INDIVIDUAL_THEME } from '../theme';

function LeafMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M7 24c2.4-6.2 5.1-11.4 10-16.8 4.9 5.4 7.6 10.6 10 16.8" fill="none" stroke="#D7F3E4" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="17" cy="24.5" r="2.2" fill="#D7F3E4" />
    </svg>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { navOpen, closeNav } = useChrome();
  const desktop = useMediaQuery('(min-width:1024px)', { noSsr: true });
  const base = getWorkspaceBasePath(location.pathname);
  const sections = getNavSections(base);
  const demo = base === '/demo';
  const [chromeOffset, setChromeOffset] = useState(0);

  useEffect(() => {
    closeNav();
  }, [location.pathname, closeNav]);

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
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const paperWidth = desktop ? drawerWidth : 'min(280px, 86vw)';

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', py: 2.5, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
      <Box sx={{ px: 2.5, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <LeafMark />
          <Typography sx={{ fontWeight: 800, letterSpacing: '0.14em', fontSize: 20, lineHeight: 1, color: '#fff' }}>MANTIS</Typography>
        </Box>
        <Typography sx={{ mt: 2.5, fontWeight: 700, fontSize: 16, color: '#fff' }}>Property Owner</Typography>
        <Typography sx={{ color: INDIVIDUAL_THEME.sidebarMuted, fontSize: 13, mt: 0.25 }}>Individual Workspace</Typography>
      </Box>
      <Box component="nav" aria-label="Individual workspace" sx={{ px: 1.5 }}>
        {sections.map((section) => (
          <Box key={section.title || 'primary'} sx={{ mb: 0.5 }}>
            {section.title ? (
              <Typography sx={{ px: 1.5, pt: 2, pb: 0.75, color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: '0.16em' }}>
                {section.title.toUpperCase()}
              </Typography>
            ) : null}
            <List sx={{ p: 0 }}>
              {section.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <ListItemButton
                    key={item.path}
                    selected={active}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => navigate(item.path)}
                    sx={{
                      borderRadius: '12px',
                      minHeight: 44,
                      mb: 0.35,
                      px: 1.5,
                      color: '#fff',
                      '&.Mui-selected': {
                        bgcolor: INDIVIDUAL_THEME.sidebarActive,
                        color: '#fff',
                        '&:hover': { bgcolor: INDIVIDUAL_THEME.sidebarActive }
                      },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }
                    }}
                  >
                    <ListItemIcon sx={{ color: 'inherit', minWidth: 34, '& .MuiSvgIcon-root': { fontSize: 20 } }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: 14.5, fontWeight: active ? 650 : 500 }} />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
    </Box>
  );

  return (
    <Drawer
      variant={desktop ? 'permanent' : 'temporary'}
      open={desktop || navOpen}
      onClose={closeNav}
      ModalProps={{ keepMounted: true }}
      sx={{
        width: desktop ? drawerWidth : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: paperWidth,
          boxSizing: 'border-box',
          bgcolor: INDIVIDUAL_THEME.sidebarBg,
          color: INDIVIDUAL_THEME.sidebarText,
          overflow: 'hidden',
          top: chromeOffset,
          height: chromeOffset ? `calc(100% - ${chromeOffset}px)` : '100%'
        }
      }}
    >
      {content}
    </Drawer>
  );
}

export default Sidebar;
