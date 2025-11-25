import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
  Button,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  SwapHoriz as SwapHorizIcon,
} from '@mui/icons-material';
import { getDashboardPath } from '../../utils/registrationUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import notificationService from '../../services/notificationService';
import { io as socketClient, Socket } from 'socket.io-client';
import api from '../../api/axios';
import { getAccessToken } from '../../contexts/AuthContext';

// Header can optionally offset for a sidebar via the sidebarWidth prop

// Notification context
export interface Notification {
  id: string;
  title: string;
  message: string;
  link?: string;
  read?: boolean;
  createdAt?: Date;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Notification) => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('notify:sound') !== 'off'; } catch { return true; }
  });
  const [desktopEnabled, setDesktopEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('notify:desktop') === 'on'; } catch { return false; }
  });
  const chimeRef = React.useRef<HTMLAudioElement | null>(null);
  if (!chimeRef.current) {
    const a = new Audio('/sounds/notify.mp3');
    a.preload = 'auto';
    a.volume = 0.6;
    chimeRef.current = a;
  }

  useEffect(() => {
    (async () => {
      try {
        const list = await notificationService.list();
        const mapped: Notification[] = (list || []).map((n: any) => ({
          id: String(n._id),
          title: n.title,
          message: n.message,
          link: n.link,
          read: !!n.read,
          createdAt: n.createdAt ? new Date(n.createdAt) : undefined
        }));
        setNotifications(mapped);
      } catch {
        // ignore fetch errors silently for header
      }
    })();
  }, []);

  // Socket.IO subscription for real-time notifications
  useEffect(() => {
    const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
    const token = getAccessToken && getAccessToken();
    if (!base || !token) return;
    try {
      const s = socketClient(base, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
      });
      s.on('connect_error', () => {/* no-op */});
      s.on('newNotification', (n: any) => {
        const notif: Notification = {
          id: String(n._id || n.id || Date.now()),
          title: n.title,
          message: n.message,
          link: n.link,
          read: false,
          createdAt: n.createdAt ? new Date(n.createdAt) : new Date()
        };
        setNotifications(prev => [notif, ...prev]);
        // Play sound
        if (soundEnabled && chimeRef.current) {
          chimeRef.current.currentTime = 0;
          chimeRef.current.play().catch(() => {});
        }
        // Desktop notification
        if (desktopEnabled && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const dn = new Notification(notif.title, { body: notif.message, icon: '/icon-192.png' });
            dn.onclick = () => { if (notif.link) window.open(notif.link, '_blank'); };
          } catch {}
        }
      });
      setSocket(s);
      return () => { try { s.close(); } catch {} };
    } catch {
      // ignore socket init errors
    }
  }, [soundEnabled, desktopEnabled]);

  const addNotification = (notification: Notification) => {
    setNotifications(prev => [notification, ...prev]);
  };

  const markAllRead = async () => {
    try { await notificationService.markAllRead(); } catch {}
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
};

interface HeaderProps {
  sidebarWidth?: number;
}

export const Header: React.FC<HeaderProps> = ({ sidebarWidth = 280 }) => {
  const { user, logout, stopImpersonation, isImpersonating, setActiveRole } = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const { notifications, markAllRead } = useNotification();
  const [notifAnchorEl, setNotifAnchorEl] = React.useState<null | HTMLElement>(null);
  const effectiveSidebarWidth = (typeof document !== 'undefined' && (document.body.classList.contains('accountant-dashboard-active') || document.documentElement.classList.contains('accountant-dashboard-active')))
    ? 0
    : sidebarWidth;
  const isAdminDashboard = location.pathname.startsWith('/admin-dashboard');
  const isAgentDashboard = location.pathname.startsWith('/agent-dashboard');
  const userDisplayName =
    (user && ((user as any).firstName || (user as any).lastName))
      ? `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim()
      : ((user as any)?.name || (user as any)?.email || 'User');

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleStopImpersonation = async () => {
    try {
      await stopImpersonation();
    } catch (error) {
      console.error('Stop impersonation failed:', error);
    }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  const handleNotifOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotifAnchorEl(event.currentTarget);
    markAllRead();
  };
  const handleNotifClose = () => setNotifAnchorEl(null);

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        width: `calc(100% - ${effectiveSidebarWidth}px)`,
        ml: `${effectiveSidebarWidth}px`,
        backgroundColor: '#FFFFFF',
        color: '#1E1E2F',
        boxShadow: '0 0 2rem 0 rgba(136, 152, 170, .15)',
      }}
    >
      <Toolbar>
        <Box sx={{ flexGrow: 1 }} />
        {(isAdminDashboard || isAgentDashboard) && user && (
          <Typography variant="body1" sx={{ mr: 2, color: '#1E1E2F' }}>
            {userDisplayName}
          </Typography>
        )}
        <IconButton
          size="large"
          aria-label="show notifications"
          color="inherit"
          sx={{ mr: 2 }}
          onClick={handleNotifOpen}
        >
          <NotificationsIcon />
          {notifications.some(n => !n.read) && (
            <Box sx={{ position: 'absolute', top: 10, right: 10, width: 10, height: 10, bgcolor: 'red', borderRadius: '50%' }} />
          )}
        </IconButton>
        <Menu
          anchorEl={notifAnchorEl}
          open={Boolean(notifAnchorEl)}
          onClose={handleNotifClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { minWidth: 320 } }}
        >
          <Box sx={{ p: 2, pb: 0 }}>
            <Typography variant="subtitle1" fontWeight={600}>Notifications</Typography>
          </Box>
          {notifications.length === 0 ? (
            <MenuItem disabled>No notifications</MenuItem>
          ) : (
            notifications.slice(0, 5).map(n => (
              <MenuItem key={n.id} onClick={async () => { try { await notificationService.markRead(n.id); } catch {}; handleNotifClose(); if (n.link) navigate(n.link); }} selected={!n.read}>
                <Box>
                  <Typography fontWeight={n.read ? 400 : 600}>{n.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{n.message}</Typography>
                  {n.createdAt && <Typography variant="caption" color="text.secondary">{n.createdAt.toLocaleString()}</Typography>}
                </Box>
              </MenuItem>
            ))
          )}
        </Menu>
        {user ? (
          <>
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleMenu}
              color="inherit"
            >
              <Avatar
                src={(user as any)?.avatarUrl || undefined}
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: 'primary.main',
                  fontSize: '0.875rem',
                }}
              >
                {user?.firstName?.charAt(0) || 'U'}
              </Avatar>
            </IconButton>
            <Menu
              id="menu-appbar"
              anchorEl={anchorEl}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              keepMounted
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              open={Boolean(anchorEl)}
              onClose={handleClose}
            >
              <MenuItem onClick={() => { handleClose(); navigate('/profile'); }}>
                <ListItemIcon>
                  <PersonIcon fontSize="small" />
                </ListItemIcon>
                Profile
              </MenuItem>
              {/* Role switcher - list dashboards available to this user */}
              {(() => {
                const roles = Array.isArray((user as any)?.roles) && (user as any).roles.length > 0 ? (user as any).roles : [user?.role].filter(Boolean);
                const labels: Record<string, string> = {
                  admin: 'Admin Dashboard',
                  agent: 'Agent Dashboard',
                  owner: 'Owner Dashboard',
                  accountant: 'Accountant Dashboard',
                  sales: 'Sales Dashboard',
                  principal: 'Admin Dashboard',
                  prea: 'Admin Dashboard'
                };
                if (!roles || roles.length === 0) return null;
                return (
                  <>
                    <Divider />
                    {roles.map((r: string) => (
                      <MenuItem key={r} onClick={() => { handleClose(); try { setActiveRole && setActiveRole(r as any); } catch {}; navigate(getDashboardPath(r as any)); }}>
                        <ListItemIcon>
                          <SwapHorizIcon fontSize="small" />
                        </ListItemIcon>
                        {labels[r] || r}
                      </MenuItem>
                    ))}
                  </>
                );
              })()}
              {isImpersonating && (
                <MenuItem onClick={() => { handleClose(); handleStopImpersonation(); }}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  Stop Impersonating
                </MenuItem>
              )}
              <MenuItem onClick={() => { handleClose(); navigate('/accountant-dashboard/settings'); }}>
                <ListItemIcon>
                  <SettingsIcon fontSize="small" />
                </ListItemIcon>
                Settings
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </>
        ) : (
          <Button
            variant="outlined"
            color="primary"
            onClick={handleLogin}
            sx={{ ml: 2 }}
          >
            Login
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
};