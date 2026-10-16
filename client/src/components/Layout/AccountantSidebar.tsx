import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Box,
  Avatar,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import { ResponsiveSidebarFrame, useResponsiveSidebar } from './responsiveSidebar';
import {
  Dashboard as DashboardIcon,
  Receipt as ReceiptIcon,
  AttachMoney as DollarSignIcon,
  Assessment as AssessmentIcon,
  Description as DescriptionIcon,
  FactCheck as IntegrityIcon,
  Settings as SettingsIcon,
  AccountBalance as AccountBalanceIcon,
  RequestQuote as TaxIcon,
  ListAlt as LedgerIcon,
  Assignment as TaskIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';

const drawerWidth = 280;

interface AccountantSidebarProps {
  activeTab: number;
  onTabChange: (index: number) => void;
}

const isSidebarItemSelected = (currentPath: string, itemPath: string) => {
  const current = currentPath.replace(/\/+$/, '') || '/';
  const target = itemPath.replace(/\/+$/, '') || '/';
  if (target === '/accountant-dashboard') {
    return current === '/accountant-dashboard';
  }
  return current === target || current.startsWith(`${target}/`);
};

export const AccountantSidebar: React.FC<AccountantSidebarProps> = ({ onTabChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading: authLoading, user } = useAuth();
  const { company } = useCompany();
  const sidebar = useResponsiveSidebar(drawerWidth);
  const userRoles = ((user as any)?.roles as string[] | undefined) || (user?.role ? [user.role] : []);
  const canManageSync = userRoles.includes('admin');

  const menuItems = [
    { group: 'Overview', text: 'Dashboard', icon: <DashboardIcon />, path: '/accountant-dashboard' },
    { group: 'Daily finance', text: 'Payments', icon: <ReceiptIcon />, path: '/accountant-dashboard/payments' },
    { group: 'Daily finance', text: 'Sales Payments', icon: <ReceiptIcon />, path: '/accountant-dashboard/sales' },
    { group: 'Daily finance', text: 'Property Accounts', icon: <AccountBalanceIcon />, path: '/accountant-dashboard/property-accounts' },
    { group: 'Daily finance', text: 'Agent Accounts', icon: <AccountBalanceIcon />, path: '/accountant-dashboard/agent-accounts' },
    { group: 'Daily finance', text: 'Levies', icon: <ReceiptIcon />, path: '/accountant-dashboard/levies' },
    { group: 'Daily finance', text: 'Owner Collections', icon: <ReceiptIcon />, path: '/accountant-dashboard/owner-collections' },
    { group: 'Daily finance', text: 'Work queue', icon: <TaskIcon />, path: '/accountant-dashboard/work-queue' },
    { group: 'Daily finance', text: 'Rent collection', icon: <ReceiptIcon />, path: '/accountant-dashboard/rent-collection' },
    { group: 'Revenue', text: 'Revenue', icon: <DollarSignIcon />, path: '/accountant-dashboard/revenue' },
    { group: 'Revenue', text: 'Commissions', icon: <DollarSignIcon />, path: '/accountant-dashboard/commissions' },
    { group: 'Revenue', text: 'Written Invoices', icon: <ReceiptIcon />, path: '/accountant-dashboard/written-invoices' },
    { group: 'Reporting', text: 'Financial Reports', icon: <AssessmentIcon />, path: '/accountant-dashboard/reports' },
    { group: 'Reporting', text: 'Ledger', icon: <LedgerIcon />, path: '/accountant-dashboard/ledger' },
    { group: 'Tax', text: 'Tax', icon: <TaxIcon />, path: '/accountant-dashboard/tax' },
    { group: 'Trust', text: 'Trust Account Reports', icon: <DescriptionIcon />, path: '/accountant-dashboard/trust-account-reports' },
    { group: 'Control', text: 'Accounting Integrity', icon: <IntegrityIcon />, path: '/accountant-dashboard/accounting-integrity' },
    { group: 'Control', text: 'Financial Controls', icon: <AccountBalanceIcon />, path: '/accountant-dashboard/financial-controls' },
    { group: 'Control', text: 'Accounting Tasks', icon: <TaskIcon />, path: '/accountant-dashboard/tasks' },
    { group: 'Admin', text: 'Data Sync', icon: <SyncIcon />, path: '/accountant-dashboard/data-sync' },
    { group: 'Admin', text: 'Settings', icon: <SettingsIcon />, path: '/accountant-dashboard/settings' },
  ].map((item, index) => ({ ...item, index }))
    .filter((item) => item.path !== '/accountant-dashboard/data-sync' || canManageSync);

  const handleNavigation = (path: string, index: number) => {
    onTabChange(index);
    navigate(path);
    sidebar.closeOverlay();
  };

  const paperSx = {
    backgroundColor: '#1E1E2F',
    color: '#FFFFFF',
    borderRight: 'none',
  };

  if (authLoading) {
    return (
      <ResponsiveSidebarFrame state={sidebar} paperSx={paperSx} topOffset={64}>
        {() => (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        )}
      </ResponsiveSidebarFrame>
    );
  }

  return (
    <ResponsiveSidebarFrame state={sidebar} paperSx={paperSx} topOffset={64} expandedWidth={drawerWidth}>
      {(collapsed) => (
      <Box sx={{ px: collapsed ? 0.5 : 2, pb: 2 }}>
        {!collapsed && company?.logo && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 2 }}>
            <Avatar
              src={`data:image/png;base64,${company.logo}`}
              sx={{
                width: 200,
                height: 100,
                border: '0.1px solid rgba(255, 255, 255, 0.2)'
              }}
              imgProps={{ decoding: 'async', loading: 'lazy' }}
              variant="rounded"
            />
          </Box>
        )}

        <List>
          {menuItems.map((item, index) => {
            const showGroup = !collapsed && (index === 0 || menuItems[index - 1].group !== item.group);
            const selected = isSidebarItemSelected(location.pathname, item.path);
            const row = (
            <ListItem
              button
              aria-label={item.text}
              onClick={() => handleNavigation(item.path, item.index)}
              selected={selected}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 1 : 2,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(94, 114, 228, 0.1)',
                  '&:hover': {
                    backgroundColor: 'rgba(94, 114, 228, 0.2)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              <ListItemIcon sx={{ color: selected ? 'primary.main' : 'inherit', minWidth: collapsed ? 0 : 56, justifyContent: 'center' }}>
                {item.icon}
              </ListItemIcon>
              {!collapsed && (
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{
                  fontWeight: selected ? 600 : 400,
                }}
              />
              )}
            </ListItem>
            );
            return (
            <React.Fragment key={item.text}>
            {showGroup && (
              <ListSubheader sx={{ bgcolor: 'transparent', color: 'rgba(255,255,255,0.45)', lineHeight: '28px', fontSize: 11, letterSpacing: '0.08em', fontWeight: 800 }}>
                {item.group.toUpperCase()}
              </ListSubheader>
            )}
            {collapsed ? <Tooltip title={item.text} placement="right">{row}</Tooltip> : row}
            </React.Fragment>
            );
          })}
        </List>
      </Box>
      )}
    </ResponsiveSidebarFrame>
  );
}; 