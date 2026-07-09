import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AssignmentTurnedIn,
  CameraAlt,
  CalendarMonth,
  Close,
  Download,
  EventRepeat,
  ExpandMore,
  FactCheck,
  HomeWork,
  MoreVert,
  NotificationsNone,
  PlayArrow,
  PlaylistAddCheck,
  PublishedWithChanges,
  Save,
  Search,
  ShieldOutlined,
  TaskAlt,
  WarningAmber,
} from '@mui/icons-material';
import dayjs, { Dayjs } from 'dayjs';
import {
  fetchWorkspaceLeases,
  fetchWorkspaceProperties,
  fetchWorkspaceTenants,
  shouldUseAgentDataRoutes
} from '../../utils/workspaceDataSources';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { useLocation } from 'react-router-dom';
import { useNotification } from '../../components/Layout/Header';
import { InspectionRecord, InspectionStatus, InspectionType, inspectionService } from '../../services/inspectionService';

type PropertyLite = { _id: string; name?: string; address?: string; images?: string[] };
type TenantLite = { _id: string; firstName?: string; lastName?: string; phone?: string; email?: string; propertyId?: any };
type LeaseLite = { _id: string; propertyId: any; tenantId: any; startDate: string; endDate: string; status: string };
type CalendarMode = 'month' | 'week' | 'agenda';
type InspectionChecklistItem = NonNullable<InspectionRecord['checklist']>[number];

const statusLabel: Record<string, string> = {
  scheduled: 'Scheduled',
  upcoming: 'Upcoming',
  due_today: 'Due Today',
  overdue: 'Overdue',
  completed: 'Completed',
  missed: 'Missed',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  in_progress: 'In Progress',
  draft: 'Draft',
  reviewed: 'Reviewed',
  follow_up_required: 'Follow-Up Required',
};

const typeLabel: Record<string, string> = {
  move_in: 'Move-In',
  routine: 'Routine',
  follow_up: 'Follow-Up',
  move_out: 'Move-Out',
  emergency: 'Emergency',
};

const statusColors: Record<string, { bg: string; fg: string; border: string; chip: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' }> = {
  overdue: { bg: '#fff1f2', fg: '#be123c', border: '#fecdd3', chip: 'error' },
  due_today: { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa', chip: 'warning' },
  upcoming: { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe', chip: 'info' },
  move_out: { bg: '#f5f3ff', fg: '#6d28d9', border: '#ddd6fe', chip: 'secondary' },
  follow_up: { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa', chip: 'warning' },
  completed: { bg: '#ecfdf5', fg: '#047857', border: '#bbf7d0', chip: 'success' },
  scheduled: { bg: '#f8fafc', fg: '#475569', border: '#e2e8f0', chip: 'default' },
  rescheduled: { bg: '#fffbeb', fg: '#b45309', border: '#fde68a', chip: 'warning' },
  missed: { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca', chip: 'error' },
  cancelled: { bg: '#f1f5f9', fg: '#64748b', border: '#cbd5e1', chip: 'default' },
  in_progress: { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe', chip: 'primary' },
  draft: { bg: '#fffbeb', fg: '#b45309', border: '#fde68a', chip: 'warning' },
  reviewed: { bg: '#ecfdf5', fg: '#047857', border: '#bbf7d0', chip: 'success' },
  follow_up_required: { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa', chip: 'warning' },
};

const itemStatusOptions = [
  { value: 'ok', label: 'OK', color: '#047857', bg: '#ecfdf5' },
  { value: 'attention_required', label: 'Attention Required', color: '#c2410c', bg: '#fff7ed' },
  { value: 'damaged', label: 'Damaged', color: '#be123c', bg: '#fff1f2' },
  { value: 'missing', label: 'Missing', color: '#7c2d12', bg: '#ffedd5' },
  { value: 'not_working', label: 'Not Working', color: '#b91c1c', bg: '#fef2f2' },
  { value: 'repaired', label: 'Repaired', color: '#1d4ed8', bg: '#eff6ff' },
  { value: 'na', label: 'N/A', color: '#64748b', bg: '#f1f5f9' },
];

const issueStatuses = new Set(['attention_required', 'damaged', 'missing', 'not_working', 'fail']);

const standardRoomItems = [
  'Floor',
  'Ceiling',
  'Walls',
  'Window panes',
  'Window sliders',
  'Peg stays',
  'Handles',
  'Burglar bars',
  'Door',
  'Door keys',
  'Pelmet or curtain rails',
  'Air vents',
  'Light fittings',
];

const separateToiletItems = [
  ...standardRoomItems,
  'Toilet seat and cover',
  'Toilet pan',
  'Tissue holder',
  'Cistern',
  'Sockets',
  'Wash hand basin',
  'Taps',
];

const bathroomItems = [
  ...separateToiletItems,
  'Shower',
  'Tub or jacuzzi',
];

const roomTemplateOptions: Array<{ type: string; label: string; items: string[] }> = [
  { type: 'bedroom', label: 'Bedroom', items: standardRoomItems },
  { type: 'ensuite_bedroom', label: 'Ensuite Bedroom', items: [...standardRoomItems, ...bathroomItems] },
  { type: 'main_ensuite', label: 'Main Ensuite', items: bathroomItems },
  { type: 'kitchen', label: 'Kitchen', items: [...standardRoomItems, 'Wall tiles', 'Sinks', 'Stoppers', 'Cupboards', 'Cooker', 'Sockets'] },
  { type: 'dining', label: 'Dining Room', items: standardRoomItems },
  { type: 'lounge', label: 'Lounge', items: standardRoomItems },
  { type: 'scullery', label: 'Scullery', items: [...standardRoomItems, 'Wall tiles', 'Sinks', 'Stoppers', 'Cupboards', 'Sockets'] },
  { type: 'pantry', label: 'Pantry', items: standardRoomItems },
  { type: 'entrance', label: 'Entrance', items: [...standardRoomItems, 'Sockets'] },
  { type: 'passage', label: 'Passage', items: [...standardRoomItems, 'Linen cupboards', 'Sockets'] },
  { type: 'separate_toilet', label: 'Separate Toilet', items: separateToiletItems },
  { type: 'bathroom', label: 'Bathroom', items: bathroomItems },
  { type: 'garage', label: 'Garage', items: [...standardRoomItems, 'Garage door', 'Garage motor', 'Shelving', 'Sockets'] },
  { type: 'verandah', label: 'Verandah', items: standardRoomItems },
  { type: 'yard', label: 'Yard', items: ['Durawall', 'Gutters', 'Swimming pool', 'Driveway', 'Roof', 'Gate', 'Gate motor', 'Security lighting', 'Pavement'] },
  { type: 'staff_bedroom', label: 'Staff Quarter Bedroom', items: standardRoomItems },
  { type: 'staff_kitchen', label: 'Staff Quarter Kitchen', items: [...standardRoomItems, 'Wall tiles', 'Sinks', 'Stoppers', 'Cupboards', 'Cooker', 'Sockets'] },
  { type: 'staff_bathroom', label: 'Staff Quarter Bathroom', items: bathroomItems },
  { type: 'boardroom', label: 'Boardroom', items: standardRoomItems },
  { type: 'custom', label: 'Custom Room', items: standardRoomItems },
];

const pageSx = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%)',
  p: { xs: 2, md: 3 },
};

const glassCardSx = {
  borderRadius: '20px',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: 'rgba(255, 255, 255, 0.92)',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.06)',
  transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.09)',
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
};

const getId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return String(value._id || value.$oid || value.id || '');
  return '';
};

const getInspectionStatus = (inspection: InspectionRecord): string => inspection.effectiveStatus || inspection.status || 'scheduled';

const getInspectionType = (inspection: InspectionRecord): string => inspection.type || 'routine';

const getInitials = (value: string) => value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'IN';

const formatDate = (value?: string) => value ? dayjs(value).format('DD MMM YYYY') : 'N/A';

const buildMonthDays = (anchor: Dayjs) => {
  const start = anchor.startOf('month').startOf('week');
  return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'));
};

const dateOnly = (value?: string) => value ? dayjs(value).format('YYYY-MM-DD') : '';

export const InspectionComplianceCenter: React.FC = () => {
  const { user } = useAuth();
  const { company } = useCompany();
  const location = useLocation();
  const useAgentRoutes = shouldUseAgentDataRoutes(location.pathname, {
    workspaceType: company?.workspaceType,
    plan: company?.plan,
    role: user?.role
  });
  const { notifications } = useNotification();
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [tenants, setTenants] = useState<TenantLite[]>([]);
  const [leases, setLeases] = useState<LeaseLite[]>([]);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [operations, setOperations] = useState<any>(null);
  const [complianceMetrics, setComplianceMetrics] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [drawerInspection, setDrawerInspection] = useState<InspectionRecord | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [calendarAnchor, setCalendarAnchor] = useState(dayjs());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [tenantNotes, setTenantNotes] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuInspection, setMenuInspection] = useState<InspectionRecord | null>(null);
  const [executionOpen, setExecutionOpen] = useState(false);
  const [executionInspection, setExecutionInspection] = useState<InspectionRecord | null>(null);
  const [executionChecklist, setExecutionChecklist] = useState<InspectionRecord['checklist']>([]);
  const [executionNotes, setExecutionNotes] = useState('');
  const [executionSaveState, setExecutionSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [activeRoom, setActiveRoom] = useState('');
  const [completeReviewOpen, setCompleteReviewOpen] = useState(false);
  const [newRoomType, setNewRoomType] = useState('bedroom');
  const [newRoomLabel, setNewRoomLabel] = useState('');
  const [customItemName, setCustomItemName] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [propertyRows, tenantRows, leaseRows, inspectionRows, ops, compliance, templateRows] = await Promise.all([
        fetchWorkspaceProperties(useAgentRoutes),
        fetchWorkspaceTenants(useAgentRoutes),
        fetchWorkspaceLeases(useAgentRoutes),
        inspectionService.getInspections(),
        inspectionService.getOperations().catch(() => null),
        inspectionService.getComplianceMetrics().catch(() => null),
        inspectionService.getTemplates().catch(() => []),
      ]);
      setProperties(propertyRows);
      setTenants(tenantRows);
      setLeases(leaseRows);
      setInspections(inspectionRows);
      setOperations(ops);
      setComplianceMetrics(compliance);
      setTemplates(templateRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?._id]);

  const propertyById = useMemo(() => new Map(properties.map((property) => [getId(property._id), property])), [properties]);
  const tenantById = useMemo(() => new Map(tenants.map((tenant) => [getId(tenant._id), tenant])), [tenants]);
  const leaseById = useMemo(() => new Map(leases.map((lease) => [getId(lease._id), lease])), [leases]);

  const enrichedInspections = useMemo(() => inspections.map((inspection) => {
    const propertyId = getId((inspection as any).propertyId) || getId((inspection as any).property?._id);
    const tenantId = getId((inspection as any).tenantId);
    const leaseId = getId((inspection as any).leaseId);
    return {
      ...inspection,
      propertyRecord: propertyById.get(propertyId) || (inspection as any).property || (inspection as any).propertyId,
      tenantRecord: tenantById.get(tenantId) || (inspection as any).tenantId,
      leaseRecord: leaseById.get(leaseId) || (inspection as any).leaseId,
    };
  }), [inspections, propertyById, tenantById, leaseById]);

  const metrics = useMemo(() => {
    const total = enrichedInspections.length || 1;
    const overdue = enrichedInspections.filter((inspection) => getInspectionStatus(inspection) === 'overdue').length;
    const upcoming = enrichedInspections.filter((inspection) => ['upcoming', 'due_today', 'scheduled'].includes(getInspectionStatus(inspection))).length;
    const completed = enrichedInspections.filter((inspection) => getInspectionStatus(inspection) === 'completed').length;
    const moveOut = enrichedInspections.filter((inspection) => getInspectionType(inspection) === 'move_out' && getInspectionStatus(inspection) !== 'completed').length;
    const compliantPercent = Math.round((completed / total) * 100);
    const upcomingPercent = Math.round((upcoming / total) * 100);
    const overduePercent = Math.round((overdue / total) * 100);
    return {
      overdue,
      upcoming,
      completed,
      moveOut,
      compliantPercent: complianceMetrics?.compliancePercent ?? compliantPercent,
      upcomingPercent: complianceMetrics?.upcomingPercent ?? upcomingPercent,
      overduePercent: complianceMetrics?.overduePercent ?? overduePercent,
      activeProperties: properties.length,
    };
  }, [complianceMetrics, enrichedInspections, properties.length]);

  const filteredInspections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedInspections.filter((inspection: any) => {
      const property = inspection.propertyRecord || {};
      const tenant = inspection.tenantRecord || {};
      const status = getInspectionStatus(inspection);
      const type = getInspectionType(inspection);
      const propertyId = getId(inspection.propertyId) || getId(property._id);
      const scheduled = inspection.scheduledDate ? dayjs(inspection.scheduledDate) : null;
      const matchesSearch = !q || [
        property.name,
        property.address,
        tenant.firstName,
        tenant.lastName,
        tenant.phone,
        inspection.notes,
        inspection.report?.issuesFound,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesType = typeFilter === 'all' || type === typeFilter;
      const matchesProperty = propertyFilter === 'all' || propertyId === propertyFilter;
      const matchesStart = !dateStart || !scheduled || scheduled.isAfter(dayjs(dateStart).subtract(1, 'day'));
      const matchesEnd = !dateEnd || !scheduled || scheduled.isBefore(dayjs(dateEnd).add(1, 'day'));
      return matchesSearch && matchesStatus && matchesType && matchesProperty && matchesStart && matchesEnd;
    });
  }, [enrichedInspections, search, statusFilter, typeFilter, propertyFilter, dateStart, dateEnd]);

  const calendarInspections = useMemo(() => {
    if (calendarMode === 'agenda') return filteredInspections.slice().sort((a, b) => dayjs(a.scheduledDate).valueOf() - dayjs(b.scheduledDate).valueOf());
    const start = calendarMode === 'week' ? calendarAnchor.startOf('week') : calendarAnchor.startOf('month').startOf('week');
    const end = calendarMode === 'week' ? calendarAnchor.endOf('week') : calendarAnchor.endOf('month').endOf('week');
    return filteredInspections.filter((inspection) => {
      const scheduled = dayjs(inspection.scheduledDate);
      return scheduled.isAfter(start.subtract(1, 'day')) && scheduled.isBefore(end.add(1, 'day'));
    });
  }, [calendarAnchor, calendarMode, filteredInspections]);

  const queueSections = [
    { key: 'overdue', title: 'Overdue', items: operations?.overdue || filteredInspections.filter((inspection) => getInspectionStatus(inspection) === 'overdue') },
    { key: 'week', title: 'Due This Week', items: operations?.dueThisWeek || [] },
    { key: 'follow', title: 'Follow-Up Required', items: operations?.awaitingFollowUp || filteredInspections.filter((inspection) => inspection.followUpRequired) },
    { key: 'move', title: 'Move-Out Pending', items: operations?.pendingMoveOut || filteredInspections.filter((inspection) => getInspectionType(inspection) === 'move_out') },
  ];

  const executionRooms = useMemo(() => {
    const grouped = (executionChecklist || []).reduce((acc: Record<string, Array<{ item: InspectionChecklistItem; idx: number }>>, item, idx) => {
      const room = item.room || item.category || 'Inspection';
      acc[room] = acc[room] || [];
      acc[room].push({ item, idx });
      return acc;
    }, {});
    return Object.entries(grouped);
  }, [executionChecklist]);

  const executionStats = useMemo(() => {
    const total = executionChecklist?.length || 0;
    const done = (executionChecklist || []).filter((item) => item.status && item.status !== 'pending').length;
    const issueCount = (executionChecklist || []).filter((item) => issueStatuses.has(String(item.status))).length;
    const photos = (executionChecklist || []).reduce((sum, item) => sum + (item.photos?.length || 0), 0);
    const progress = total ? Math.round((done / total) * 100) : 0;
    const score = Math.max(0, 100 - issueCount * 8);
    return { total, done, issueCount, photos, progress, score };
  }, [executionChecklist]);

  useEffect(() => {
    if (!executionOpen || !executionInspection) return;
    const timer = setTimeout(async () => {
      try {
        setExecutionSaveState('saving');
        const updated = await inspectionService.autosaveExecution(executionInspection._id, {
          checklist: executionChecklist,
          notes: executionNotes,
          quickDraft: true,
          startedAt: executionInspection.startedAt || new Date().toISOString(),
        });
        setExecutionInspection(updated);
        setExecutionSaveState('saved');
      } catch (error) {
        console.error('Inspection autosave failed', error);
        setExecutionSaveState('idle');
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [executionChecklist, executionNotes, executionOpen]);

  const handleGenerate = async () => {
    const result = await inspectionService.generateFromLeases({ frequency: 'quarterly', includeMoveIn: true, includeMoveOut: true });
    setActionMessage(`${result.createdCount} lease-driven inspections generated.`);
    await loadData();
  };

  const handleSyncReminders = async () => {
    const result = await inspectionService.dispatchReminders();
    setActionMessage(`${result.sentCount} reminder${result.sentCount === 1 ? '' : 's'} synced.`);
  };

  const handleExport = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Inspection Compliance Report</title></head><body>
        <h1>Inspection Compliance Report</h1>
        <p>Compliance: ${metrics.compliantPercent}% | Overdue: ${metrics.overdue} | Upcoming: ${metrics.upcoming}</p>
        <table border="1" cellspacing="0" cellpadding="6">
          <thead><tr><th>Property</th><th>Type</th><th>Due Date</th><th>Status</th><th>Agent</th></tr></thead>
          <tbody>
            ${filteredInspections.map((inspection: any) => `
              <tr>
                <td>${inspection.propertyRecord?.name || inspection.propertyRecord?.address || 'Property'}</td>
                <td>${typeLabel[getInspectionType(inspection)]}</td>
                <td>${formatDate(inspection.scheduledDate)}</td>
                <td>${statusLabel[getInspectionStatus(inspection)]}</td>
                <td>${user?.firstName || ''} ${user?.lastName || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const startExecution = async (inspection: InspectionRecord) => {
    const started = await inspectionService.startExecution(inspection._id);
    setExecutionInspection(started);
    setExecutionChecklist(started.checklist || []);
    setExecutionNotes(started.notes || '');
    const firstRoom = (started.checklist || [])[0]?.room || (started.checklist || [])[0]?.category || 'Inspection';
    setActiveRoom(firstRoom);
    setExecutionOpen(true);
    setDrawerInspection(null);
  };

  const updateExecutionItem = (itemId: string | undefined, index: number, patch: any) => {
    setExecutionChecklist((prev = []) => prev.map((item, itemIndex) => {
      const matches = itemId ? item._id === itemId : itemIndex === index;
      return matches ? { ...item, ...patch } : item;
    }));
  };

  const addExecutionRoom = () => {
    const template = roomTemplateOptions.find((room) => room.type === newRoomType) || roomTemplateOptions[0];
    const existingOfType = executionRooms.filter(([room]) => room.toLowerCase().startsWith(template.label.toLowerCase())).length;
    const roomLabel = newRoomLabel.trim() || (['Bedroom', 'Ensuite Bedroom', 'Staff Quarter Bedroom'].includes(template.label)
      ? `${template.label} ${existingOfType + 1}`
      : template.label);
    const uniqueItems = Array.from(new Set(template.items));
    const items = uniqueItems.map((item) => ({
      room: roomLabel,
      category: roomLabel,
      item,
      status: 'pending' as const,
      notes: '',
      severity: 'low' as const,
      photos: [],
    }));
    setExecutionChecklist((prev = []) => [...prev, ...items]);
    setActiveRoom(roomLabel);
    setNewRoomLabel('');
  };

  const renameExecutionRoom = (oldRoom: string, nextRoom: string) => {
    const label = nextRoom.trim();
    if (!label || label === oldRoom) return;
    setExecutionChecklist((prev = []) => prev.map((item) => ((item.room || item.category) === oldRoom ? { ...item, room: label, category: label } : item)));
    setActiveRoom(label);
  };

  const addCustomItemToActiveRoom = () => {
    const itemName = customItemName.trim();
    if (!itemName || !activeRoom) return;
    setExecutionChecklist((prev = []) => [
      ...prev,
      {
        room: activeRoom,
        category: activeRoom,
        item: itemName,
        status: 'pending' as const,
        notes: '',
        severity: 'low' as const,
        photos: [],
      }
    ]);
    setCustomItemName('');
  };

  const uploadExecutionPhoto = async (itemId: string | undefined, index: number, file?: File) => {
    if (!executionInspection || !file) return;
    const updated = await inspectionService.uploadItemPhoto(executionInspection._id, itemId || String(index), file);
    setExecutionInspection(updated);
    setExecutionChecklist(updated.checklist || []);
  };

  const saveExecutionDraft = async () => {
    if (!executionInspection) return;
    setExecutionSaveState('saving');
    const updated = await inspectionService.autosaveExecution(executionInspection._id, {
      checklist: executionChecklist,
      notes: executionNotes,
      quickDraft: true,
    });
    setExecutionInspection(updated);
    setExecutionSaveState('saved');
    await loadData();
  };

  const completeExecution = async () => {
    if (!executionInspection) return;
    const updated = await inspectionService.completeExecution(executionInspection._id, {
      checklist: executionChecklist,
      notes: executionNotes,
      report: {
        conditionSummary: `${executionStats.score}% condition score from digital inspection execution.`,
        issuesFound: `${executionStats.issueCount} issue${executionStats.issueCount === 1 ? '' : 's'} flagged.`,
        actionsRequired: executionStats.issueCount > 0 ? 'Review flagged items and create maintenance requests where required.' : 'No immediate actions required.',
        inspectorName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        inspectedAt: new Date().toISOString(),
      }
    });
    setExecutionInspection(updated);
    setExecutionOpen(false);
    setCompleteReviewOpen(false);
    setActionMessage('Inspection completed and report generated.');
    await loadData();
  };

  const openPrintableReport = async (inspection: InspectionRecord) => {
    const html = await inspectionService.getReportHtml(inspection._id);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const openReschedule = (inspection: InspectionRecord) => {
    setDrawerInspection(inspection);
    setRescheduleDate(dateOnly(inspection.scheduledDate) || dayjs().format('YYYY-MM-DD'));
    setRescheduleTime(inspection.scheduledTime || '09:00');
    setRescheduleReason('');
    setTenantNotes('');
    setRescheduleOpen(true);
  };

  const saveReschedule = async () => {
    if (!drawerInspection || !rescheduleReason.trim()) return;
    const updated = await inspectionService.reschedule(drawerInspection._id, {
      scheduledDate: rescheduleDate,
      scheduledTime: rescheduleTime,
      reason: rescheduleReason,
      tenantConfirmationNotes: tenantNotes,
    });
    setDrawerInspection(updated);
    setRescheduleOpen(false);
    await loadData();
  };

  const createFollowUp = async (inspection: InspectionRecord) => {
    const followUp = await inspectionService.createFollowUp(inspection._id, {
      scheduledDate: dayjs().add(30, 'day').toISOString(),
      scheduledTime: '09:00',
      notes: 'Follow-up created from operations center.',
    });
    setDrawerInspection(followUp);
    await loadData();
  };

  const escalateMaintenance = async (inspection: InspectionRecord) => {
    await inspectionService.escalateToMaintenance(inspection._id);
    setActionMessage('Maintenance request created from inspection.');
    await loadData();
  };

  const renderComplianceRing = (size = 116) => {
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (metrics.compliantPercent / 100) * circumference;
    return (
      <Box sx={{ width: size, height: size, position: 'relative', display: 'grid', placeItems: 'center' }}>
        <svg width={size} height={size} viewBox="0 0 116 116">
          <circle cx="58" cy="58" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="58"
            cy="58"
            r={radius}
            fill="none"
            stroke="#2563eb"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 58 58)"
          />
        </svg>
        <Box sx={{ position: 'absolute', textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 900, color: '#0f172a' }}>{metrics.compliantPercent}%</Typography>
          <Typography variant="caption" color="text.secondary">Compliant</Typography>
        </Box>
      </Box>
    );
  };

  const renderEventPill = (inspection: any) => {
    const status = getInspectionStatus(inspection);
    const type = getInspectionType(inspection);
    const tone = statusColors[type === 'move_out' ? 'move_out' : type === 'follow_up' ? 'follow_up' : status] || statusColors.scheduled;
    return (
      <Box
        onClick={(event) => {
          event.stopPropagation();
          setDrawerInspection(inspection);
        }}
        sx={{
          px: 1,
          py: 0.65,
          borderRadius: '10px',
          bgcolor: tone.bg,
          color: tone.fg,
          border: `1px solid ${tone.border}`,
          fontSize: 12,
          fontWeight: 800,
          cursor: 'pointer',
          mb: 0.75,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'transform 160ms ease',
          '&:hover': { transform: 'translateX(2px)' },
        }}
      >
        {(inspection.propertyRecord?.name || inspection.propertyRecord?.address || 'Property')} · {typeLabel[type]}
      </Box>
    );
  };

  const calendarDays = buildMonthDays(calendarAnchor);
  const weekDays = Array.from({ length: 7 }, (_, index) => calendarAnchor.startOf('week').add(index, 'day'));

  return (
    <Box sx={pageSx}>
      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 999 }} />}
      <Card sx={{ ...glassCardSx, mb: 2.5 }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Box>
              <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1 }}>
                <Box sx={{ width: 42, height: 42, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: '#eff6ff', color: '#2563eb' }}>
                  <ShieldOutlined />
                </Box>
                <Chip label="Operational workspace" size="small" sx={{ bgcolor: '#eff6ff', color: '#1d4ed8', fontWeight: 800 }} />
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.04em', color: '#0f172a' }}>
                Inspection Compliance Engine
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 820 }}>
                Lease-linked recurring inspections, move-in/move-out baselines, compliance queues, reports, and maintenance escalation.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.4} alignItems="center" flexWrap="wrap" useFlexGap>
              {renderComplianceRing(106)}
              {[
                ['Active Properties', metrics.activeProperties],
                ['Upcoming', metrics.upcoming],
                ['Overdue', metrics.overdue],
                ['Move-Out Pending', metrics.moveOut],
              ].map(([label, value]) => (
                <Box key={String(label)} sx={{ minWidth: 118, p: 1.5, borderRadius: '16px', bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{label}</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 900 }}>{value}</Typography>
                </Box>
              ))}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderRadius: '18px', bgcolor: '#fff', border: '1px solid #e2e8f0' }}>
                <Avatar sx={{ bgcolor: '#2563eb', width: 38, height: 38 }}>{getInitials(`${user?.firstName || ''} ${user?.lastName || ''}`)}</Avatar>
                <Box sx={{ minWidth: 110 }}>
                  <Typography variant="body2" sx={{ fontWeight: 900 }}>{user?.firstName || 'Current'} {user?.lastName || 'User'}</Typography>
                  <Typography variant="caption" color="text.secondary">{user?.role || 'Agent'}</Typography>
                </Box>
                <Badge badgeContent={notifications.filter((notification) => !notification.read).length} color="error">
                  <NotificationsNone fontSize="small" />
                </Badge>
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {actionMessage && (
        <Card sx={{ ...glassCardSx, mb: 2, borderColor: '#bfdbfe' }}>
          <CardContent sx={{ py: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography sx={{ color: '#1d4ed8', fontWeight: 800 }}>{actionMessage}</Typography>
              <IconButton size="small" onClick={() => setActionMessage('')}><Close fontSize="small" /></IconButton>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <Button variant="contained" startIcon={<EventRepeat />} onClick={handleGenerate} sx={{ borderRadius: '14px', px: 2.2, py: 1.2, boxShadow: '0 12px 30px rgba(37,99,235,0.22)', textTransform: 'none', fontWeight: 900 }}>
          Generate From Active Leases
        </Button>
        <Button variant="outlined" startIcon={<NotificationsNone />} onClick={handleSyncReminders} sx={{ borderRadius: '14px', px: 2.2, py: 1.2, textTransform: 'none', fontWeight: 900, bgcolor: '#fff' }}>
          Sync Due Reminders
        </Button>
        <Button variant="outlined" startIcon={<Download />} onClick={handleExport} sx={{ borderRadius: '14px', px: 2.2, py: 1.2, textTransform: 'none', fontWeight: 900, bgcolor: '#fff' }}>
          Export Report
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[
          ['Due This Week', operations?.dueThisWeek?.length || 0, 'upcoming'],
          ['Overdue', operations?.overdue?.length || 0, 'overdue'],
          ['Rescheduled', operations?.rescheduled?.length || 0, 'rescheduled'],
          ['Move-Out Pending', operations?.pendingMoveOut?.length || 0, 'move_out'],
          ['Awaiting Follow-Up', operations?.awaitingFollowUp?.length || 0, 'follow_up'],
          ['Recently Completed', operations?.recentlyCompleted?.length || 0, 'completed'],
        ].map(([label, count, toneKey]) => {
          const tone = statusColors[String(toneKey)] || statusColors.scheduled;
          return (
            <Grid item xs={12} sm={6} lg={2} key={String(label)}>
              <Card sx={{ ...glassCardSx, bgcolor: tone.bg, borderColor: tone.border }}>
                <CardContent>
                  <Typography variant="caption" sx={{ color: tone.fg, fontWeight: 900 }}>{label}</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 950, color: '#0f172a', mt: 0.5 }}>{count}</Typography>
                  <Chip label="Queue" size="small" sx={{ mt: 1, bgcolor: '#fff', color: tone.fg, fontWeight: 800 }} />
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8.2}>
          <Card sx={glassCardSx}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 900 }}>Inspection Calendar</Typography>
                  <Typography variant="body2" color="text.secondary">Calendar-driven lease compliance operations</Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button size="small" onClick={() => setCalendarAnchor(calendarAnchor.subtract(1, calendarMode === 'week' ? 'week' : 'month'))}>Prev</Button>
                  <Chip label={calendarAnchor.format(calendarMode === 'week' ? 'DD MMM YYYY' : 'MMMM YYYY')} sx={{ fontWeight: 900 }} />
                  <Button size="small" onClick={() => setCalendarAnchor(calendarAnchor.add(1, calendarMode === 'week' ? 'week' : 'month'))}>Next</Button>
                  <Tabs value={calendarMode} onChange={(_, value) => setCalendarMode(value)} sx={{ minHeight: 38 }}>
                    <Tab value="month" label="Month" sx={{ minHeight: 38, textTransform: 'none', fontWeight: 900 }} />
                    <Tab value="week" label="Week" sx={{ minHeight: 38, textTransform: 'none', fontWeight: 900 }} />
                    <Tab value="agenda" label="Agenda" sx={{ minHeight: 38, textTransform: 'none', fontWeight: 900 }} />
                  </Tabs>
                </Stack>
              </Stack>

              {calendarMode !== 'agenda' ? (
                <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '18px', overflow: 'hidden', bgcolor: '#fff' }}>
                  <Grid container columns={7} sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <Grid item xs={1} key={day} sx={{ p: 1.3, textAlign: 'center' }}>
                        <Typography variant="caption" sx={{ fontWeight: 900, color: '#64748b' }}>{day}</Typography>
                      </Grid>
                    ))}
                  </Grid>
                  <Grid container columns={7}>
                    {(calendarMode === 'week' ? weekDays : calendarDays).map((day) => {
                      const dayEvents = calendarInspections.filter((inspection) => dateOnly(inspection.scheduledDate) === day.format('YYYY-MM-DD')).slice(0, 3);
                      return (
                        <Grid item xs={1} key={day.toISOString()} sx={{ minHeight: calendarMode === 'week' ? 220 : 132, p: 1, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', bgcolor: day.month() === calendarAnchor.month() || calendarMode === 'week' ? '#fff' : '#f8fafc' }}>
                          <Typography variant="caption" sx={{ fontWeight: 900, color: day.isSame(dayjs(), 'day') ? '#2563eb' : '#475569' }}>{day.date()}</Typography>
                          <Box sx={{ mt: 1 }}>{dayEvents.map((inspection) => <React.Fragment key={inspection._id}>{renderEventPill(inspection)}</React.Fragment>)}</Box>
                          {calendarInspections.filter((inspection) => dateOnly(inspection.scheduledDate) === day.format('YYYY-MM-DD')).length > 3 && (
                            <Typography variant="caption" color="text.secondary">+ more</Typography>
                          )}
                        </Grid>
                      );
                    })}
                  </Grid>
                </Box>
              ) : (
                <Stack spacing={1.2}>
                  {calendarInspections.map((inspection: any) => (
                    <Card key={`agenda-${inspection._id}`} variant="outlined" sx={{ borderRadius: '16px', cursor: 'pointer' }} onClick={() => setDrawerInspection(inspection)}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography sx={{ fontWeight: 900 }}>{inspection.propertyRecord?.name || inspection.propertyRecord?.address || 'Property'}</Typography>
                            <Typography variant="body2" color="text.secondary">{typeLabel[getInspectionType(inspection)]} · {formatDate(inspection.scheduledDate)}</Typography>
                          </Box>
                          <Chip label={statusLabel[getInspectionStatus(inspection)]} color={(statusColors[getInspectionStatus(inspection)] || statusColors.scheduled).chip} />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={3.8}>
          <Stack spacing={2.5}>
            <Card sx={glassCardSx}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 900, mb: 1.5 }}>Operational Queue</Typography>
                <Stack spacing={2}>
                  {queueSections.map((section) => (
                    <Box key={section.key}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>{section.title}</Typography>
                        <Chip label={section.items.length} size="small" />
                      </Stack>
                      <Stack spacing={1}>
                        {section.items.slice(0, 3).map((item: any) => {
                          const record = enrichedInspections.find((inspection) => inspection._id === item._id) || item;
                          const status = getInspectionStatus(record);
                          const tone = statusColors[status] || statusColors.scheduled;
                          return (
                            <Box key={`${section.key}-${record._id}`} onClick={() => setDrawerInspection(record)} sx={{ p: 1.2, borderRadius: '14px', bgcolor: tone.bg, border: `1px solid ${tone.border}`, cursor: 'pointer' }}>
                              <Typography variant="body2" sx={{ fontWeight: 900 }}>{record.propertyRecord?.name || record.property?.name || record.propertyId?.name || 'Property'}</Typography>
                              <Typography variant="caption" sx={{ color: tone.fg }}>{typeLabel[getInspectionType(record)]} · {formatDate(record.scheduledDate)}</Typography>
                            </Box>
                          );
                        })}
                        {!section.items.length && <Typography variant="caption" color="text.secondary">No items.</Typography>}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={glassCardSx}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 900, mb: 1.5 }}>Quick Actions</Typography>
                <Grid container spacing={1.2}>
                  {[
                    [<CalendarMonth />, 'Schedule Inspection'],
                    [<HomeWork />, 'Move-In Inspection'],
                    [<PublishedWithChanges />, 'Move-Out Inspection'],
                    [<PlaylistAddCheck />, 'Create Follow-Up'],
                    [<FactCheck />, `${templates.length || 4} Templates`],
                    [<AssignmentTurnedIn />, 'Calendar View'],
                  ].map(([icon, label]) => (
                    <Grid item xs={6} key={String(label)}>
                      <Box sx={{ p: 1.5, borderRadius: '16px', bgcolor: '#f8fafc', border: '1px solid #e2e8f0', minHeight: 92, cursor: 'pointer', transition: 'all 160ms ease', '&:hover': { bgcolor: '#eff6ff', transform: 'translateY(-2px)' } }}>
                        <Box sx={{ color: '#2563eb', mb: 1 }}>{icon}</Box>
                        <Typography variant="caption" sx={{ fontWeight: 900 }}>{label}</Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>

            <Card sx={glassCardSx}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 900 }}>Compliance Overview</Typography>
                    <Typography variant="body2" color="text.secondary">Portfolio health by inspection status</Typography>
                  </Box>
                  {renderComplianceRing(96)}
                </Stack>
                <Stack spacing={1.1} sx={{ mt: 2 }}>
                  <LinearProgress variant="determinate" value={metrics.compliantPercent} sx={{ height: 8, borderRadius: 999 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption">Compliant {metrics.compliantPercent}%</Typography>
                    <Typography variant="caption">Overdue {metrics.overduePercent}%</Typography>
                    <Typography variant="caption">Upcoming {metrics.upcomingPercent}%</Typography>
                  </Stack>
                  <Button size="small" variant="outlined" onClick={handleExport} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>View compliance report</Button>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Card sx={{ ...glassCardSx, mt: 2.5 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ mb: 2 }}>
            <TextField
              placeholder="Search inspections, properties, tenants, notes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              size="small"
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '14px', bgcolor: '#f8fafc' } }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Status</InputLabel><Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{['all', ...Object.keys(statusLabel)].map((value) => <MenuItem key={value} value={value}>{value === 'all' ? 'All Statuses' : statusLabel[value]}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Type</InputLabel><Select label="Type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>{['all', ...Object.keys(typeLabel)].map((value) => <MenuItem key={value} value={value}>{value === 'all' ? 'All Types' : typeLabel[value]}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 190 }}><InputLabel>Property</InputLabel><Select label="Property" value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}><MenuItem value="all">All Properties</MenuItem>{properties.map((property) => <MenuItem key={property._id} value={getId(property._id)}>{property.name || property.address}</MenuItem>)}</Select></FormControl>
            <TextField size="small" label="Start" type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" label="End" type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} InputLabelProps={{ shrink: true }} />
            <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Agent</InputLabel><Select label="Agent" value="current"><MenuItem value="current">{user?.firstName || 'Current'} {user?.lastName || 'Agent'}</MenuItem></Select></FormControl>
          </Stack>

          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { color: '#64748b', fontSize: 12, fontWeight: 900, borderBottom: '1px solid #e2e8f0' } }}>
                  <TableCell>Property</TableCell>
                  <TableCell>Tenant</TableCell>
                  <TableCell>Lease</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Due Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredInspections.map((inspection: any) => {
                  const property = inspection.propertyRecord || {};
                  const tenant = inspection.tenantRecord || {};
                  const lease = inspection.leaseRecord || {};
                  const status = getInspectionStatus(inspection);
                  const tone = statusColors[status] || statusColors.scheduled;
                  const propertyName = property.name || property.address || 'Property';
                  return (
                    <TableRow key={inspection._id} hover sx={{ '& td': { borderBottom: '1px solid #f1f5f9', py: 1.4 } }}>
                      <TableCell>
                        <Stack direction="row" spacing={1.2} alignItems="center">
                          <Avatar variant="rounded" src={Array.isArray(property.images) ? property.images[0] : undefined} sx={{ width: 42, height: 42, borderRadius: '12px', bgcolor: '#dbeafe', color: '#1d4ed8', fontWeight: 900 }}>{getInitials(propertyName)}</Avatar>
                          <Box><Typography variant="body2" sx={{ fontWeight: 900 }}>{propertyName}</Typography><Typography variant="caption" color="text.secondary">{property.address || 'Address not set'}</Typography></Box>
                        </Stack>
                      </TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontWeight: 800 }}>{`${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'No tenant'}</Typography><Typography variant="caption" color="text.secondary">{tenant.phone || tenant.email || 'No contact'}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{lease.startDate ? `${formatDate(lease.startDate)} - ${formatDate(lease.endDate)}` : 'Legacy / no lease'}</Typography></TableCell>
                      <TableCell><Chip label={typeLabel[getInspectionType(inspection)]} size="small" sx={{ fontWeight: 800 }} /></TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontWeight: 800 }}>{formatDate(inspection.scheduledDate)}</Typography><Typography variant="caption" color="text.secondary">{inspection.scheduledTime || 'Time TBD'}</Typography></TableCell>
                      <TableCell><Chip label={statusLabel[status] || status} size="small" color={tone.chip} sx={{ fontWeight: 900 }} /></TableCell>
                      <TableCell><Stack direction="row" spacing={1} alignItems="center"><Avatar sx={{ width: 30, height: 30, bgcolor: '#2563eb', fontSize: 12 }}>{getInitials(`${user?.firstName || ''} ${user?.lastName || ''}`)}</Avatar><Typography variant="body2">{user?.firstName || 'Agent'}</Typography></Stack></TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={() => startExecution(inspection)} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900, mr: 0.5 }}>Start</Button>
                        <Button size="small" variant="outlined" onClick={() => setDrawerInspection(inspection)} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900, mr: 0.5 }}>Open</Button>
                        <IconButton size="small" onClick={(event) => { setMenuAnchor(event.currentTarget); setMenuInspection(inspection); }}><MoreVert fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      <Drawer anchor="right" open={Boolean(drawerInspection)} onClose={() => setDrawerInspection(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 0, bgcolor: '#f8fafc' } }}>
        {drawerInspection && (() => {
          const inspection: any = drawerInspection;
          const property = (inspection as any).propertyRecord || (inspection as any).property || {};
          const tenant = (inspection as any).tenantRecord || {};
          const lease = (inspection as any).leaseRecord || {};
          const status = getInspectionStatus(inspection);
          const tone = statusColors[status] || statusColors.scheduled;
          return (
            <Box>
              <Box sx={{ p: 3, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Chip label={statusLabel[status]} size="small" color={tone.chip} sx={{ fontWeight: 900, mb: 1 }} />
                    <Typography variant="h5" sx={{ fontWeight: 950 }}>{property.name || property.address || 'Inspection Detail'}</Typography>
                    <Typography color="text.secondary">{typeLabel[getInspectionType(inspection)]} · {formatDate(inspection.scheduledDate)} · {inspection.scheduledTime || 'Time TBD'}</Typography>
                  </Box>
                  <IconButton onClick={() => setDrawerInspection(null)}><Close /></IconButton>
                </Stack>
              </Box>
              <Stack spacing={2} sx={{ p: 2.5 }}>
                <Card sx={glassCardSx}><CardContent><Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>Inspection Summary</Typography><Typography variant="body2" color="text.secondary">{inspection.notes || inspection.report?.conditionSummary || 'No summary recorded yet.'}</Typography><Divider sx={{ my: 2 }} /><Grid container spacing={1.5}><Grid item xs={6}><Typography variant="caption" color="text.secondary">Tenant</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{`${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'N/A'}</Typography></Grid><Grid item xs={6}><Typography variant="caption" color="text.secondary">Lease</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{lease.startDate ? `${formatDate(lease.startDate)} - ${formatDate(lease.endDate)}` : 'Legacy'}</Typography></Grid></Grid></CardContent></Card>
                <Card sx={glassCardSx}><CardContent><Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>Checklist</Typography><Stack spacing={1}>{(inspection.checklist || []).slice(0, 8).map((item: any, index: number) => <Stack key={`${item.category}-${item.item}-${index}`} direction="row" spacing={1} alignItems="center"><TaskAlt fontSize="small" color={item.status === 'pass' ? 'success' : item.status === 'fail' ? 'error' : 'disabled'} /><Box><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.item}</Typography><Typography variant="caption" color="text.secondary">{item.category} · {item.status}</Typography></Box></Stack>)}{!(inspection.checklist || []).length && <Typography variant="body2" color="text.secondary">Checklist not started.</Typography>}</Stack></CardContent></Card>
                <Card sx={glassCardSx}><CardContent><Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>Photos & Notes</Typography><Typography variant="body2" color="text.secondary">{inspection.report?.issuesFound || 'No findings recorded.'}</Typography><Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>{(inspection.attachments || []).map((file: any) => <Chip key={file._id || file.fileName} label={file.fileName} size="small" />)}</Stack></CardContent></Card>
                <Card sx={glassCardSx}><CardContent><Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>Inspection History</Typography><Stack spacing={1.2}>{[{ label: 'Inspection scheduled', date: inspection.createdAt }, ...(inspection.rescheduleHistory || []).map((item: any) => ({ label: `Rescheduled: ${item.reason}`, date: item.rescheduledAt })), ...(inspection.completedAt ? [{ label: 'Inspection completed', date: inspection.completedAt }] : []), ...((inspection.maintenanceRequestIds || []).length ? [{ label: 'Maintenance request created', date: inspection.updatedAt }] : [])].map((item: any, index: number) => <Stack key={`${item.label}-${index}`} direction="row" spacing={1.2}><Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#2563eb', mt: 0.7 }} /><Box><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.label}</Typography><Typography variant="caption" color="text.secondary">{formatDate(item.date)}</Typography></Box></Stack>)}</Stack></CardContent></Card>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button variant="contained" startIcon={<PlayArrow />} onClick={() => startExecution(drawerInspection)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Start Inspection</Button>
                  <Button variant="contained" onClick={() => openReschedule(drawerInspection)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Reschedule</Button>
                  <Button variant="outlined" onClick={() => createFollowUp(drawerInspection)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Create Follow-Up</Button>
                  <Button variant="outlined" color="warning" onClick={() => escalateMaintenance(drawerInspection)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Create Maintenance Request</Button>
                  <Button variant="outlined" onClick={() => openPrintableReport(drawerInspection)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Print Report</Button>
                </Stack>
              </Stack>
            </Box>
          );
        })()}
      </Drawer>

      <Dialog fullScreen open={executionOpen} onClose={() => setExecutionOpen(false)}>
        <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'rgba(255,255,255,0.96)', borderBottom: '1px solid #e2e8f0', px: { xs: 2, md: 3 }, py: 1.6 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={executionInspection ? typeLabel[getInspectionType(executionInspection)] : 'Inspection'} size="small" sx={{ fontWeight: 900 }} />
                  <Chip label={executionSaveState === 'saving' ? 'Autosaving...' : executionSaveState === 'saved' ? 'Saved' : 'Ready'} size="small" color={executionSaveState === 'saving' ? 'warning' : 'success'} />
                </Stack>
                <Typography variant="h5" sx={{ fontWeight: 950, mt: 0.75 }}>
                  {(executionInspection as any)?.propertyId?.name || (executionInspection as any)?.propertyId?.address || (executionInspection as any)?.property?.name || 'Inspection Execution'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Tenant: {`${(executionInspection as any)?.tenantId?.firstName || ''} ${(executionInspection as any)?.tenantId?.lastName || ''}`.trim() || 'N/A'} · Progress {executionStats.progress}% · Score {executionStats.score}%
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="outlined" startIcon={<Save />} onClick={saveExecutionDraft} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Save Draft</Button>
                <Button variant="contained" onClick={() => setCompleteReviewOpen(true)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Review & Complete</Button>
                <IconButton onClick={() => setExecutionOpen(false)}><Close /></IconButton>
              </Stack>
            </Stack>
            <LinearProgress variant="determinate" value={executionStats.progress} sx={{ mt: 1.5, height: 8, borderRadius: 999 }} />
          </Box>

          <Grid container spacing={2} sx={{ p: { xs: 1.5, md: 2.5 }, pb: { xs: 11, md: 2.5 } }}>
            <Grid item xs={12} md={2.5}>
              <Card sx={glassCardSx}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>Rooms</Typography>
                  <Stack spacing={1}>
                    {executionRooms.map(([room, items]) => {
                      const complete = items.filter(({ item }) => item.status && item.status !== 'pending').length;
                      const isActive = activeRoom === room;
                      return (
                        <Box key={room} onClick={() => setActiveRoom(room)} sx={{ p: 1.2, borderRadius: '14px', cursor: 'pointer', bgcolor: isActive ? '#eff6ff' : '#fff', border: `1px solid ${isActive ? '#bfdbfe' : '#e2e8f0'}` }}>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" sx={{ fontWeight: 900 }}>{room}</Typography>
                            <Chip label={`${complete}/${items.length}`} size="small" />
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1 }}>Add Room</Typography>
                  <Stack spacing={1}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Room type</InputLabel>
                      <Select label="Room type" value={newRoomType} onChange={(event) => setNewRoomType(event.target.value)}>
                        {roomTemplateOptions.map((room) => <MenuItem key={room.type} value={room.type}>{room.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      label="Room label"
                      placeholder="Bedroom 1, Staff Quarter Bedroom 2..."
                      value={newRoomLabel}
                      onChange={(event) => setNewRoomLabel(event.target.value)}
                    />
                    <Button variant="outlined" onClick={addExecutionRoom} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Add room</Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6.2}>
              <Stack spacing={1.5}>
                {executionRooms
                  .filter(([room]) => !activeRoom || room === activeRoom)
                  .map(([room, items]) => (
                    <Accordion key={room} defaultExpanded sx={{ borderRadius: '18px !important', boxShadow: '0 12px 30px rgba(15,23,42,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Box>
                          <Typography sx={{ fontWeight: 950 }}>{room}</Typography>
                          <Typography variant="caption" color="text.secondary">{items.length} checklist items</Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Stack spacing={1.5}>
                          <TextField
                            size="small"
                            label="Room label"
                            defaultValue={room}
                            onBlur={(event) => renameExecutionRoom(room, event.target.value)}
                            sx={{ maxWidth: 360, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: '#f8fafc' } }}
                          />
                          {items.map(({ item, idx }, itemIndex) => {
                            const globalIndex = idx;
                            const issue = issueStatuses.has(String(item.status));
                            return (
                              <Card key={item._id || `${room}-${item.item}-${itemIndex}`} variant="outlined" sx={{ borderRadius: '16px', borderColor: issue ? '#fed7aa' : '#e2e8f0', bgcolor: issue ? '#fff7ed' : '#fff' }}>
                                <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
                                  <Stack spacing={1.4}>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                                      <Box>
                                        <Typography sx={{ fontWeight: 900 }}>{item.item}</Typography>
                                        <Typography variant="caption" color="text.secondary">{item.category}</Typography>
                                      </Box>
                                      {issue && <Chip label="Issue" size="small" color="warning" sx={{ fontWeight: 900, alignSelf: 'flex-start' }} />}
                                    </Stack>
                                    <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                                      {itemStatusOptions.map((option) => (
                                        <Button
                                          key={option.value}
                                          size="small"
                                          onClick={() => updateExecutionItem(item._id, globalIndex, { status: option.value, severity: issueStatuses.has(option.value) ? 'medium' : 'low' })}
                                          sx={{
                                            minHeight: 38,
                                            borderRadius: '999px',
                                            px: 1.6,
                                            bgcolor: item.status === option.value ? option.bg : '#f8fafc',
                                            color: item.status === option.value ? option.color : '#475569',
                                            border: `1px solid ${item.status === option.value ? option.color : '#e2e8f0'}`,
                                            textTransform: 'none',
                                            fontWeight: 900,
                                          }}
                                        >
                                          {option.label}
                                        </Button>
                                      ))}
                                    </Stack>
                                    <TextField
                                      fullWidth
                                      multiline
                                      minRows={2}
                                      placeholder="Optional notes, issues, meter readings, or observations..."
                                      value={item.notes || ''}
                                      onChange={(event) => updateExecutionItem(item._id, globalIndex, { notes: event.target.value })}
                                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px', bgcolor: '#f8fafc' } }}
                                    />
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                      <Button component="label" size="small" startIcon={<CameraAlt />} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                                        Add Photo
                                        <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => uploadExecutionPhoto(item._id, globalIndex, event.target.files?.[0])} />
                                      </Button>
                                      {(item.photos || []).map((photo, photoIndex) => (
                                        <Chip key={`${photo.fileName}-${photoIndex}`} label={photo.fileName} size="small" />
                                      ))}
                                    </Stack>
                                  </Stack>
                                </CardContent>
                              </Card>
                            );
                          })}
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Add other item"
                              placeholder="Add custom fitting, fixture, or condition item..."
                              value={customItemName}
                              onChange={(event) => setCustomItemName(event.target.value)}
                              onKeyDown={(event) => { if (event.key === 'Enter') addCustomItemToActiveRoom(); }}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: '#f8fafc' } }}
                            />
                            <Button variant="outlined" onClick={addCustomItemToActiveRoom} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900, minWidth: 120 }}>Add item</Button>
                          </Stack>
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  ))}
              </Stack>
            </Grid>

            <Grid item xs={12} md={3.3}>
              <Stack spacing={2}>
                <Card sx={glassCardSx}><CardContent><Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Issue Summary</Typography><Typography variant="h4" sx={{ fontWeight: 950, color: executionStats.issueCount ? '#c2410c' : '#047857' }}>{executionStats.issueCount}</Typography><Typography variant="body2" color="text.secondary">Flagged items requiring review</Typography></CardContent></Card>
                <Card sx={glassCardSx}><CardContent><Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Photo Evidence</Typography><Typography variant="h4" sx={{ fontWeight: 950 }}>{executionStats.photos}</Typography><Typography variant="body2" color="text.secondary">Photos attached to checklist items</Typography></CardContent></Card>
                <Card sx={glassCardSx}><CardContent><Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1 }}>Quick Notes</Typography><TextField fullWidth multiline minRows={5} value={executionNotes} onChange={(event) => setExecutionNotes(event.target.value)} placeholder="General inspection notes..." sx={{ '& .MuiOutlinedInput-root': { borderRadius: '14px', bgcolor: '#f8fafc' } }} /></CardContent></Card>
              </Stack>
            </Grid>
          </Grid>

          <Box sx={{ display: { xs: 'block', md: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: '#fff', borderTop: '1px solid #e2e8f0', p: 1.2, zIndex: 20 }}>
            <Stack direction="row" spacing={1}>
              <Button fullWidth variant="outlined" onClick={saveExecutionDraft} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Save Draft</Button>
              <Button fullWidth variant="contained" onClick={() => setCompleteReviewOpen(true)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Complete</Button>
            </Stack>
          </Box>
        </Box>
      </Dialog>

      <Dialog open={completeReviewOpen} onClose={() => setCompleteReviewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 950 }}>Complete Inspection?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography>Review before completing this inspection.</Typography>
            <Chip label={`${executionStats.done}/${executionStats.total} items completed`} />
            <Chip label={`${executionStats.issueCount} issues found`} color={executionStats.issueCount ? 'warning' : 'success'} />
            <Chip label={`${executionStats.photos} photos uploaded`} />
            <Chip label={`${executionStats.score}% condition score`} color={executionStats.score >= 75 ? 'success' : 'warning'} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteReviewOpen(false)}>Keep Editing</Button>
          <Button variant="contained" onClick={completeExecution}>Complete Inspection</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>Reschedule Inspection</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="New inspection date" type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="New time" type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="Reschedule reason" multiline minRows={3} value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} />
            <TextField label="Tenant confirmation notes" multiline minRows={2} value={tenantNotes} onChange={(event) => setTenantNotes(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRescheduleOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveReschedule} disabled={!rescheduleReason.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { if (menuInspection) startExecution(menuInspection); setMenuAnchor(null); }}>Start inspection</MenuItem>
        <MenuItem onClick={() => { if (menuInspection) setDrawerInspection(menuInspection); setMenuAnchor(null); }}>Open detail</MenuItem>
        <MenuItem onClick={() => { if (menuInspection) openReschedule(menuInspection); setMenuAnchor(null); }}>Reschedule</MenuItem>
        <MenuItem onClick={() => { if (menuInspection) createFollowUp(menuInspection); setMenuAnchor(null); }}>Create follow-up</MenuItem>
        <MenuItem onClick={() => { if (menuInspection) escalateMaintenance(menuInspection); setMenuAnchor(null); }}>Create maintenance request</MenuItem>
      </Menu>
    </Box>
  );
};

export default InspectionComplianceCenter;

