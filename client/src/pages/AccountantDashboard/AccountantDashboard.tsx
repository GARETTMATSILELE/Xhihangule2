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
import { useNavigate, useLocation, Outlet, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AccountantSidebar } from '../../components/Layout/AccountantSidebar';
import LevyPaymentsPage from './LevyPaymentsPage';

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
  const [activeTab, setActiveTab] = useState(0);

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
    { text: 'Written Invoices', icon: <ReceiptIcon />, path: '/accountant-dashboard/written-invoices' },
    { text: 'Commissions', icon: <DollarSignIcon />, path: '/accountant-dashboard/commissions' },
    { text: 'Reports', icon: <AssessmentIcon />, path: '/accountant-dashboard/reports' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/accountant-dashboard/settings' }
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      <AccountantSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - 280px)` },
          mt: 8,
        }}
      >
        <Toolbar />
        <Routes>
          <Route path="" element={<Outlet />} />
          <Route path="payments" element={<Outlet />} />
          <Route path="levies" element={<LevyPaymentsPage />} />
        </Routes>
        <Outlet />
      </Box>
    </Box>
  );
};

export default AccountantDashboard; 