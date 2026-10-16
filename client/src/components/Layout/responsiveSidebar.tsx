import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Drawer, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';

export const SIDEBAR_COLLAPSED_WIDTH = 72;
export const SIDEBAR_EXPANDED_WIDTH = 280;

export interface ResponsiveSidebarState {
  isCompact: boolean;
  collapsed: boolean;
  railWidth: number;
  mobileOverlay: boolean;
  toggle: () => void;
  closeOverlay: () => void;
  prefersReducedMotion: boolean;
}

export function useResponsiveSidebar(expandedWidth = SIDEBAR_EXPANDED_WIDTH): ResponsiveSidebarState {
  const theme = useTheme();
  const location = useLocation();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOverlay, setMobileOverlay] = useState(false);

  useEffect(() => {
    setMobileOverlay(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isCompact) setMobileOverlay(false);
  }, [isCompact]);

  const collapsed = isCompact || desktopCollapsed;

  return {
    isCompact,
    collapsed,
    railWidth: collapsed ? SIDEBAR_COLLAPSED_WIDTH : expandedWidth,
    mobileOverlay,
    toggle: () => {
      if (isCompact) setMobileOverlay((open) => !open);
      else setDesktopCollapsed((value) => !value);
    },
    closeOverlay: () => setMobileOverlay(false),
    prefersReducedMotion,
  };
}

interface ResponsiveSidebarFrameProps {
  state: ResponsiveSidebarState;
  children: (collapsed: boolean) => React.ReactNode;
  paperSx?: SxProps<Theme>;
  topOffset?: number;
  expandedWidth?: number;
  hideOnPrint?: boolean;
}

export const ResponsiveSidebarFrame: React.FC<ResponsiveSidebarFrameProps> = ({
  state,
  children,
  paperSx,
  topOffset = 0,
  expandedWidth = SIDEBAR_EXPANDED_WIDTH,
  hideOnPrint = false,
}) => {
  const theme = useTheme();
  const transition = state.prefersReducedMotion
    ? 'none'
    : theme.transitions.create('width', { duration: 200 });
  const expanded = state.isCompact ? state.mobileOverlay : !state.collapsed;
  const paper = {
    boxSizing: 'border-box',
    overflowX: 'hidden',
    top: topOffset,
    height: topOffset ? `calc(100vh - ${topOffset}px)` : '100vh',
    transition,
    ...((paperSx || {}) as object),
  };

  const renderToggle = (panelExpanded: boolean, centered: boolean) => (
    <Tooltip title={panelExpanded ? 'Collapse navigation' : 'Expand navigation'} placement="right">
      <IconButton
        onClick={state.toggle}
        aria-label={panelExpanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-expanded={panelExpanded}
        sx={{ color: 'inherit', m: 0.5, alignSelf: centered ? 'center' : 'flex-start' }}
      >
        {panelExpanded ? <MenuOpenIcon /> : <MenuIcon />}
      </IconButton>
    </Tooltip>
  );

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          width: state.railWidth,
          flexShrink: 0,
          transition,
          ...(hideOnPrint ? { '@media print': { display: 'none' } } : {}),
          '& .MuiDrawer-paper': {
            ...paper,
            width: state.railWidth,
            position: 'fixed',
          },
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
          {renderToggle(expanded, state.collapsed)}
          {children(state.collapsed)}
        </div>
      </Drawer>
      {state.isCompact && (
        <Drawer
          variant="temporary"
          open={state.mobileOverlay}
          onClose={state.closeOverlay}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              ...paper,
              width: expandedWidth,
              position: 'fixed',
            },
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
            {renderToggle(state.mobileOverlay, false)}
            {children(false)}
          </div>
        </Drawer>
      )}
    </>
  );
};
