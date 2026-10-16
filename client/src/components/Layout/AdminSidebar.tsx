import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Avatar,
  CircularProgress,
  Divider,
  Badge,
  Collapse,
  Tooltip,
} from '@mui/material';
import { ResponsiveSidebarFrame, useResponsiveSidebar } from './responsiveSidebar';
import {
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  Settings as SettingsIcon,
  Build as BuildIcon,
  Message as MessageIcon,
  Group as GroupIcon,
  Assessment as AssessmentIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  Sync as SyncIcon,
  Notifications as NotificationsIcon,
  Engineering as EngineeringIcon,
  Visibility as VisibilityIcon,
  CalendarMonth as CalendarIcon,
  HomeWork as HomeWorkIcon,
  Campaign as CampaignIcon,
  Apartment as ApartmentIcon,
  ExpandLess,
  ExpandMore,
  Folder as FolderIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import paymentRequestService from '../../services/paymentRequestService';

const drawerWidth = 280;

interface NavItem {
  text: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface AdminSidebarProps {
  activeTab: number;
  onTabChange: (index: number) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeTab, onTabChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { company } = useCompany();
  const sidebar = useResponsiveSidebar(drawerWidth);
  const [pendingApprovalsCount, setPendingApprovalsCount] = React.useState(0);
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    Portfolio: true,
    Occupancy: true,
    Operations: true,
    'Financial Oversight': true,
    CRM: true,
    People: true,
    Administration: true,
  });

  const roles: string[] =
    Array.isArray((user as any)?.roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : [user?.role].filter(Boolean) as string[];
  const isPrincipalOrPrea = roles.some((r) => ['principal', 'prea'].includes(r));

  const sections: NavSection[] = React.useMemo(() => {
    const base: NavSection[] = [
      {
        title: 'Portfolio',
        items: [
          { text: 'Properties', icon: <BusinessIcon />, path: '/admin-dashboard/properties' },
          { text: 'Developments', icon: <ApartmentIcon />, path: '/admin-dashboard/developments' },
          { text: 'Property Owners', icon: <AccountBalanceIcon />, path: '/admin-dashboard/property-owners' },
        ],
      },
      {
        title: 'Occupancy',
        items: [
          { text: 'Tenants', icon: <PeopleIcon />, path: '/admin-dashboard/tenants' },
          { text: 'Leases', icon: <DescriptionIcon />, path: '/admin-dashboard/leases' },
        ],
      },
      {
        title: 'Operations',
        items: [
          { text: 'Maintenance', icon: <BuildIcon />, path: '/admin-dashboard/maintenance' },
          { text: 'Inspections', icon: <HomeWorkIcon />, path: '/admin-dashboard/inspections' },
          { text: 'Viewings', icon: <VisibilityIcon />, path: '/admin-dashboard/viewings' },
          { text: 'Duty Rosters', icon: <CalendarIcon />, path: '/admin-dashboard/duty-rosters' },
          { text: 'Quote Workflow', icon: <BuildIcon />, path: '/admin-dashboard/quote-workflow' },
          { text: 'Applications', icon: <PeopleIcon />, path: '/admin-dashboard/rental-applications' },
          { text: 'Broadcasts', icon: <CampaignIcon />, path: '/admin-dashboard/broadcasts' },
          { text: 'Ecosystem', icon: <SettingsIcon />, path: '/admin-dashboard/ecosystem' },
        ],
      },
      {
        title: 'Financial Oversight',
        items: [
          { text: 'Rent Collection', icon: <PaymentIcon />, path: '/admin-dashboard/payments' },
          { text: 'Levies', icon: <ReceiptIcon />, path: '/admin-dashboard/levies' },
          { text: 'Municipal Bills', icon: <ReceiptIcon />, path: '/admin-dashboard/municipal-bills' },
        ],
      },
      {
        title: 'CRM',
        items: [
          { text: 'Leads', icon: <CampaignIcon />, path: '/admin-dashboard/leads' },
          { text: 'Communications', icon: <MessageIcon />, path: '/admin-dashboard/communications' },
        ],
      },
      {
        title: 'People',
        items: [
          { text: 'Agents', icon: <GroupIcon />, path: '/admin-dashboard/agents' },
          { text: 'Contractors', icon: <EngineeringIcon />, path: '/admin-dashboard/contractors' },
          { text: 'User Management', icon: <GroupIcon />, path: '/admin-dashboard/users' },
        ],
      },
      {
        title: 'Administration',
        items: [
          { text: 'Files', icon: <FolderIcon />, path: '/admin-dashboard/files' },
          {
            text: 'Notifications',
            icon: <NotificationsIcon />,
            path: '/admin-dashboard/notifications',
            badge: pendingApprovalsCount,
          },
          { text: 'Database Sync', icon: <SyncIcon />, path: '/admin-dashboard/sync' },
          { text: 'Charge Types', icon: <ReceiptIcon />, path: '/admin-dashboard/charge-types' },
          { text: 'Settings', icon: <SettingsIcon />, path: '/admin-dashboard/settings' },
        ],
      },
    ];

    if (company?.plan === 'INDIVIDUAL') {
      const fin = base.find((s) => s.title === 'Financial Oversight');
      fin?.items.splice(1, 0, {
        text: 'Property Accounts',
        icon: <AccountBalanceIcon />,
        path: '/admin-dashboard/property-accounts',
      });
    }

    if (isPrincipalOrPrea) {
      const admin = base.find((s) => s.title === 'Administration');
      const notif = admin?.items.find((i) => i.text === 'Notifications');
      if (notif) notif.path = '/admin-dashboard/approvals';
    }

    return base;
  }, [company?.plan, isPrincipalOrPrea, pendingApprovalsCount]);

  const flatItems = React.useMemo(() => {
    const items: NavItem[] = [{ text: 'Dashboard', icon: <DashboardIcon />, path: '/admin-dashboard' }];
    sections.forEach((s) => items.push(...s.items));
    items.push({ text: 'Reports', icon: <AssessmentIcon />, path: '/admin-dashboard/reports' });
    if (company?.plan === 'INDIVIDUAL') {
      // property accounts already in section
    }
    return items;
  }, [sections, company?.plan]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await paymentRequestService.getPaymentRequests({ page: 1, limit: 200 } as any);
        const list = Array.isArray(resp?.data) ? resp.data : [];
        const pending = list.filter((r: any) => (r?.approval?.status || 'pending') === 'pending');
        const salesOnly = pending.filter((r: any) => {
          const reason = String(r?.reason || '');
          return Boolean((r as any).reportHtml) || /disbursement|sale|commission/i.test(reason);
        });
        if (!cancelled) setPendingApprovalsCount(salesOnly.length);
      } catch {
        if (!cancelled) setPendingApprovalsCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const getActiveIndex = () => {
    const path = location.pathname;
    const idx = flatItems.findIndex((item) => {
      if (item.path === '/admin-dashboard') return path === '/admin-dashboard' || path === '/admin-dashboard/';
      return path.startsWith(item.path);
    });
    return idx >= 0 ? idx : 0;
  };

  React.useEffect(() => {
    onTabChange(getActiveIndex());
  }, [location.pathname]);

  const handleNavigation = (path: string, index: number) => {
    onTabChange(index);
    navigate(path);
    sidebar.closeOverlay();
  };

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const paperSx = {
    backgroundColor: '#1E1E2F',
    color: '#FFFFFF',
    borderRight: 'none',
  };

  if (authLoading) {
    return (
      <ResponsiveSidebarFrame state={sidebar} paperSx={paperSx} expandedWidth={drawerWidth}>
        {() => (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        )}
      </ResponsiveSidebarFrame>
    );
  }

  let itemIndex = 0;

  return (
    <ResponsiveSidebarFrame state={sidebar} paperSx={paperSx} expandedWidth={drawerWidth}>
      {(collapsed) => {
      itemIndex = 0;
      return (
      <Box sx={{ px: collapsed ? 0.5 : 2, pb: 2 }}>
        {!collapsed && company && user && (
          <>
            <Box sx={{ px: 1, mb: 2, mt: 2 }}>
              {company.logo && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                  <Avatar
                    src={`data:image/png;base64,${company.logo}`}
                    sx={{ width: 180, height: 90, border: '0.1px solid rgba(255, 255, 255, 0.2)' }}
                    variant="rounded"
                  />
                </Box>
              )}
              <Typography variant="subtitle2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>Company</Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>{company.name}</Typography>
            </Box>
            <Divider sx={{ mb: 2, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
          </>
        )}

        <List disablePadding>
          <Tooltip title={collapsed ? 'Dashboard' : ''} placement="right" disableHoverListener={!collapsed}>
          <ListItem
            button
            aria-label="Dashboard"
            onClick={() => handleNavigation('/admin-dashboard', 0)}
            selected={activeTab === 0}
            sx={{
              borderRadius: 2,
              mb: 1,
              '&.Mui-selected': { backgroundColor: 'rgba(94, 114, 228, 0.15)' },
              '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
            }}
          >
            <ListItemIcon sx={{ color: activeTab === 0 ? 'primary.main' : 'inherit', minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
              <DashboardIcon />
            </ListItemIcon>
            {!collapsed && <ListItemText primary="Dashboard" primaryTypographyProps={{ fontWeight: activeTab === 0 ? 600 : 400 }} />}
          </ListItem>
          </Tooltip>

          {sections.map((section) => {
            const sectionOpen = collapsed || openSections[section.title] !== false;
            return (
              <React.Fragment key={section.title}>
                {!collapsed && (
                <ListItem button onClick={() => toggleSection(section.title)} sx={{ py: 0.5, mt: 0.5 }}>
                  <ListItemText
                    primary={section.title}
                    primaryTypographyProps={{ variant: 'caption', sx: { color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: 1 } }}
                  />
                  {sectionOpen ? <ExpandLess sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }} /> : <ExpandMore sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }} />}
                </ListItem>
                )}
                <Collapse in={sectionOpen}>
                  {section.items.map((item) => {
                    itemIndex += 1;
                    const idx = itemIndex;
                    const selected = activeTab === idx;
                    return (
                      <Tooltip key={item.path} title={collapsed ? item.text : ''} placement="right" disableHoverListener={!collapsed}>
                      <ListItem
                        button
                        aria-label={item.text}
                        onClick={() => handleNavigation(item.path, idx)}
                        selected={selected}
                        sx={{
                          borderRadius: 2,
                          mb: 0.25,
                          pl: collapsed ? 1 : 2,
                          justifyContent: collapsed ? 'center' : 'flex-start',
                          '&.Mui-selected': { backgroundColor: 'rgba(94, 114, 228, 0.12)' },
                          '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.06)' },
                        }}
                      >
                        <ListItemIcon sx={{ color: selected ? 'primary.main' : 'inherit', minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
                          {item.icon}
                        </ListItemIcon>
                        {!collapsed && (
                        <ListItemText
                          primary={
                            item.badge && item.badge > 0 ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {item.text}
                                <Badge color="error" badgeContent={item.badge} />
                              </Box>
                            ) : item.text
                          }
                          primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: selected ? 600 : 400 }}
                        />
                        )}
                        {collapsed && item.badge && item.badge > 0 ? <Badge color="error" variant="dot" /> : null}
                      </ListItem>
                      </Tooltip>
                    );
                  })}
                </Collapse>
              </React.Fragment>
            );
          })}

          {(() => {
            itemIndex += 1;
            const idx = itemIndex;
            const selected = activeTab === idx;
            return (
              <Tooltip title={collapsed ? 'Reports' : ''} placement="right" disableHoverListener={!collapsed}>
              <ListItem
                button
                aria-label="Reports"
                onClick={() => handleNavigation('/admin-dashboard/reports', idx)}
                selected={selected}
                sx={{ borderRadius: 2, mt: 1, justifyContent: collapsed ? 'center' : 'flex-start', '&.Mui-selected': { backgroundColor: 'rgba(94, 114, 228, 0.12)' } }}
              >
                <ListItemIcon sx={{ color: selected ? 'primary.main' : 'inherit', minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
                  <AssessmentIcon />
                </ListItemIcon>
                {!collapsed && <ListItemText primary="Reports" primaryTypographyProps={{ fontWeight: selected ? 600 : 400 }} />}
              </ListItem>
              </Tooltip>
            );
          })()}
        </List>
      </Box>
      );
      }}
    </ResponsiveSidebarFrame>
  );
};
