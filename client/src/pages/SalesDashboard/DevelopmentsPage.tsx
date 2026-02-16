import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  MenuItem,
  Divider,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TablePagination,
  Collapse,
  Autocomplete
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Add as AddIcon, Delete as DeleteIcon, Print as PrintIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { buyerService } from '../../services/buyerService';
import { developmentService } from '../../services/developmentService';
import api from '../../api/axios';
import { developmentUnitService } from '../../services/developmentUnitService';
import paymentService from '../../services/paymentService';
import { Payment } from '../../types/payment';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../components/Layout/Header';

type DevelopmentType = 'stands' | 'apartments' | 'houses' | 'semidetached' | 'townhouses';

type UnitStatus = 'available' | 'under_offer' | 'sold';

// Payments removed; units and buyers come from backend

interface UnitVariation {
  id: string;
  label: string; // e.g. "3 bed / 2 bath" or "500 sqm"
  count: number;
  price?: number; // per unit (apartments/houses) or per sqm when stands
  sizeSqm?: number; // for stands (per-unit size)
  pricePerSqm?: number; // for stands
  // residential variation details (non-stands)
  beds?: number;
  baths?: number;
  landSizeSqm?: number;
  buildingSizeSqm?: number;
  // amenities
  amenitySolar?: boolean;
  amenityBorehole?: boolean;
  amenityWaterTank?: boolean;
  amenityPool?: 'none' | 'individual' | 'communal';
  // custom unit naming
  customUnitNames?: string; // comma/newline separated input
}

interface DevelopmentUnit {
  id: string;
  variationId: string;
  label: string; // derived from variation
  status: UnitStatus;
  buyerName?: string;
  buyerHidden?: boolean; // set by API when sold by another agent (confidentiality)
  externalSale?: boolean; // sold outside system
  unitNumber?: number; // sequential number within its variation
  collaborators?: string[];
  price?: number;
}

interface Development {
  id: string;
  name: string;
  type: DevelopmentType;
  description?: string;
  collaborators?: string[];
  createdBy?: string;
  isUnitCollaborator?: boolean;
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerCompanyName?: string;
  ownerEmail?: string;
  ownerIdNumber?: string;
  ownerPhone?: string;
  variations: UnitVariation[];
  units: DevelopmentUnit[];
  createdAt: string;
  commissionPercent?: number;
  commissionPreaPercent?: number;
  commissionAgencyPercentRemaining?: number;
  commissionAgentPercentRemaining?: number;
  collabOwnerAgentPercent?: number;
  collabCollaboratorAgentPercent?: number;
}

const uid = () => Math.random().toString(36).slice(2, 9);

// Load data from backend only

const csvEscape = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;

const exportUnitsCsv = (dev: Development) => {
  const headers = ['Unit ID','Variation','Status','Buyer','Unit Number'];
  const rows = dev.units.map(u => {
    const variation = dev.variations.find(v => v.id === u.variationId);
    return [u.id, variation?.label || u.label, u.status, u.buyerName || '', (u.unitNumber ?? '')];
  });
  const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${dev.name}-units.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const computeUnitPrice = (dev: Development, unit: DevelopmentUnit, variation?: UnitVariation): number => {
  // If unit has its own price, prefer it
  const own = (unit as any).price;
  if (typeof own === 'number' && Number.isFinite(own)) return Math.max(0, Number(own));
  const v = variation || dev.variations.find(v => v.id === unit.variationId);
  if (!v) return 0;
  if (dev.type === 'stands') {
    const sqm = v.sizeSqm || 0;
    const per = v.pricePerSqm || 0;
    return Math.max(0, sqm * per);
  }
  return Math.max(0, v.price || 0);
};

const SalesDevelopmentsPage: React.FC = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showQuickCreateDialog, setShowQuickCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<DevelopmentType>('stands');
  const [description, setDescription] = useState('');
  const [devAddress, setDevAddress] = useState('');
  const [variations, setVariations] = useState<UnitVariation[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [loadingUnits, setLoadingUnits] = useState<Record<string, boolean>>({});
  // Owner fields
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerCompanyName, setOwnerCompanyName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerIdNumber, setOwnerIdNumber] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');

  // Add Buyer dialog state
  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [buyerDevId, setBuyerDevId] = useState<string>('');
  const [buyerUnitId, setBuyerUnitId] = useState<string>('');
  const [buyerName, setBuyerName] = useState<string>('');
  const [buyerPhone, setBuyerPhone] = useState<string>('');
  const [buyerIdNumber, setBuyerIdNumber] = useState<string>('');
  const [buyerEmail, setBuyerEmail] = useState<string>('');
  const [buyerSaving, setBuyerSaving] = useState<boolean>(false);
  const [buyerPickerId, setBuyerPickerId] = useState<string>('');
  const [buyerPickerOptions, setBuyerPickerOptions] = useState<any[]>([]);
  const [buyerPickerLoading, setBuyerPickerLoading] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [openUnit, setOpenUnit] = useState<Record<string, boolean>>({});
  const [unitPayments, setUnitPayments] = useState<Record<string, Payment[]>>({});
  const [unitPaymentsLoading, setUnitPaymentsLoading] = useState<Record<string, boolean>>({});
  // Pagination per development id
  const [pageByDev, setPageByDev] = useState<Record<string, number>>({});
  const [rowsPerPageByDev, setRowsPerPageByDev] = useState<Record<string, number>>({});
  // Commission config for development
  const [commissionPercent, setCommissionPercent] = useState<number>(5);
  const [salesUsers, setSalesUsers] = useState<any[]>([]);
  const [salesSearch, setSalesSearch] = useState('');
  // Collaborator management dialog
  const [showCollab, setShowCollab] = useState<{ open: boolean; devId: string | null }>({ open: false, devId: null });
  const [collabUserId, setCollabUserId] = useState<string>('');
  // Commission structure dialog (checklist "Set commission structure")
  const [showCommissionDialog, setShowCommissionDialog] = useState<{ open: boolean; devId: string | null }>({ open: false, devId: null });
  const [commissionDialogForm, setCommissionDialogForm] = useState({
    commissionPercent: 5,
    commissionPreaPercent: 3,
    commissionAgencyPercentRemaining: 50,
    commissionAgentPercentRemaining: 50,
    collabOwnerAgentPercent: 50,
    collabCollaboratorAgentPercent: 50
  });
  const [commissionDialogSaving, setCommissionDialogSaving] = useState(false);
  const [preaPercentOfCommission, setPreaPercentOfCommission] = useState<number>(3);
  const [agencyPercent, setAgencyPercent] = useState<number>(50);
  const [agentPercent, setAgentPercent] = useState<number>(50);
  // Collaborator agent split
  const [collabOwnerAgentPercent, setCollabOwnerAgentPercent] = useState<number>(50);
  const [collabCollaboratorAgentPercent, setCollabCollaboratorAgentPercent] = useState<number>(50);

  // Variation management dialogs (post-creation)
  const [showAddVar, setShowAddVar] = useState<{ open: boolean; devId: string | null }>({ open: false, devId: null });
  const [newVarLabel, setNewVarLabel] = useState('');
  const [newVarCount, setNewVarCount] = useState<number>(1);
  const [newVarSizeSqm, setNewVarSizeSqm] = useState<number>(0);
  const [newVarPricePerSqm, setNewVarPricePerSqm] = useState<number>(0);
  const [newVarPrice, setNewVarPrice] = useState<number>(0);
  const [newVarCustomNames, setNewVarCustomNames] = useState<string>('');
  const [savingVar, setSavingVar] = useState<boolean>(false);

  const [showEditVar, setShowEditVar] = useState<{ open: boolean; devId: string | null; variationId: string | null }>(
    { open: false, devId: null, variationId: null }
  );
  const [editVarLabel, setEditVarLabel] = useState<string>('');
  const [editVarSizeSqm, setEditVarSizeSqm] = useState<number>(0);
  const [editVarPrice, setEditVarPrice] = useState<number>(0);
  const [editVarAddUnits, setEditVarAddUnits] = useState<number>(0);
  const [savingEditVar, setSavingEditVar] = useState<boolean>(false);

  // Quick Create form (Phase 1 - agent-first, no commission/variations)
  const [quickName, setQuickName] = useState('');
  const [quickType, setQuickType] = useState<DevelopmentType>('stands');
  const [quickAddress, setQuickAddress] = useState('');
  const [quickOwnerName, setQuickOwnerName] = useState('');
  const [quickOwnerCompany, setQuickOwnerCompany] = useState('');
  const [quickDescription, setQuickDescription] = useState('');
  const [quickCreating, setQuickCreating] = useState(false);

  // Unit row highlight after status change (for micro-feedback)
  const [highlightUnitId, setHighlightUnitId] = useState<string | null>(null);
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);

  // Edit Unit dialog
  const [showEditUnit, setShowEditUnit] = useState<{ open: boolean; devId: string | null; unitId: string | null }>({ open: false, devId: null, unitId: null });
  const [editUnitCode, setEditUnitCode] = useState<string>('');
  const [editUnitPrice, setEditUnitPrice] = useState<string>('');
  const [editUnitBlock, setEditUnitBlock] = useState<string>('');
  const [editUnitFloor, setEditUnitFloor] = useState<string>('');
  const [editUnitStandSize, setEditUnitStandSize] = useState<string>('');
  const [savingUnit, setSavingUnit] = useState<boolean>(false);
  const [unitCollabUserId, setUnitCollabUserId] = useState<string>('');

  useEffect(() => {
    if (justCreatedId) {
      const el = document.getElementById('dev-card-just-created');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [justCreatedId]);

  useEffect(() => {
    const loadDevs = async () => {
      try {
        const items = await developmentService.list();
        const mapped: Development[] = (items || []).map((d: any) => ({
          id: d._id,
          name: d.name,
          type: d.type,
          description: d.description,
          collaborators: Array.isArray(d.collaborators) ? d.collaborators.map((x: any)=> String(x)) : [],
          createdBy: d.createdBy ? String(d.createdBy) : undefined,
          isUnitCollaborator: !!d.isUnitCollaborator,
          ownerFirstName: d.owner?.firstName,
          ownerLastName: d.owner?.lastName,
          ownerCompanyName: d.owner?.companyName,
          ownerEmail: d.owner?.email,
          ownerIdNumber: d.owner?.idNumber,
          ownerPhone: d.owner?.phone,
          variations: (d.variations || []).map((v: any) => ({ id: v.id, label: v.label, count: v.count, price: v.price, sizeSqm: d.type==='stands' ? v.size : undefined })),
          units: [],
          createdAt: d.createdAt,
          commissionPercent: d.commissionPercent,
          commissionPreaPercent: d.commissionPreaPercent,
          commissionAgencyPercentRemaining: d.commissionAgencyPercentRemaining,
          commissionAgentPercentRemaining: d.commissionAgentPercentRemaining,
          collabOwnerAgentPercent: d.collabOwnerAgentPercent,
          collabCollaboratorAgentPercent: d.collabCollaboratorAgentPercent,
        }));
        setDevelopments(mapped);
      } catch {}
    };
    loadDevs();
  }, []);

  // When commission dialog opens, prefill form from development
  useEffect(() => {
    if (showCommissionDialog.open && showCommissionDialog.devId) {
      const dev = developments.find(d => d.id === showCommissionDialog.devId);
      if (dev) {
        setCommissionDialogForm({
          commissionPercent: dev.commissionPercent ?? 5,
          commissionPreaPercent: dev.commissionPreaPercent ?? 3,
          commissionAgencyPercentRemaining: dev.commissionAgencyPercentRemaining ?? 50,
          commissionAgentPercentRemaining: dev.commissionAgentPercentRemaining ?? 50,
          collabOwnerAgentPercent: dev.collabOwnerAgentPercent ?? 50,
          collabCollaboratorAgentPercent: dev.collabCollaboratorAgentPercent ?? 50
        });
      }
    }
  }, [showCommissionDialog.open, showCommissionDialog.devId, developments]);

  // Lazy-load sales users only when Collaborators dialog is opened
  useEffect(() => {
    if (showCollab.open && salesUsers.length === 0) {
      (async () => {
        try {
          const res = await api.get('/users/agents', { params: { role: 'sales' } });
          const list = (res.data?.data || res.data || []) as any[];
          setSalesUsers(Array.isArray(list) ? list : []);
        } catch (e) { setSalesUsers([]); }
      })();
    }
  }, [showCollab.open, salesUsers.length]);

  const addVariation = () => setVariations(prev => [...prev, { id: uid(), label: '', count: 1, customUnitNames: '' }]);
  const removeVariation = (id: string) => setVariations(prev => prev.filter(v => v.id !== id));
  const updateVariation = (id: string, patch: Partial<UnitVariation>) => setVariations(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));

  const createDevelopment = async () => {
    if (!name.trim() || !type) return;
    // Basic validation: at least one variation with non-empty label and valid count
    const validVariations = variations.filter(v => v.label && v.label.trim().length > 0 && (v.count || 0) >= 1);
    if (validVariations.length === 0) return;

    try {
      setCreating(true);
      const created = await developmentService.create({
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        address: devAddress.trim() || undefined,
        owner: {
          firstName: ownerFirstName.trim() || undefined,
          lastName: ownerLastName.trim() || undefined,
          companyName: ownerCompanyName.trim() || undefined,
          email: ownerEmail.trim() || undefined,
          idNumber: ownerIdNumber.trim() || undefined,
          phone: ownerPhone.trim() || undefined
        },
        variations: validVariations.map(v => {
          const parsedNames = String(v.customUnitNames || '')
            .split(/\n|,/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
          const hasCustom = type === 'stands' && parsedNames.length > 0;
          return {
            id: v.id,
            label: v.label,
            count: hasCustom ? parsedNames.length : v.count,
            price: type === 'stands' ? Math.max(0, (v.sizeSqm || 0) * (v.pricePerSqm || 0)) : (v.price || 0),
            size: type === 'stands' ? (v.sizeSqm || 0) : undefined,
            unitCodes: hasCustom ? parsedNames : undefined
          } as any;
        }),
        commissionPercent,
        commissionPreaPercent: preaPercentOfCommission,
        commissionAgencyPercentRemaining: agencyPercent,
        commissionAgentPercentRemaining: agentPercent,
        collabOwnerAgentPercent,
        collabCollaboratorAgentPercent
      });

      // Map server response to local Development shape
      const mapped: Development = {
        id: created._id || created.id,
        name: created.name,
        type: created.type,
        description: created.description,
        collaborators: Array.isArray(created.collaborators) ? created.collaborators.map((x: any)=> String(x)) : [],
        createdBy: created.createdBy ? String(created.createdBy) : undefined,
        ownerFirstName: created.owner?.firstName,
        ownerLastName: created.owner?.lastName,
        ownerCompanyName: created.owner?.companyName,
        ownerEmail: created.owner?.email,
        ownerIdNumber: created.owner?.idNumber,
        ownerPhone: created.owner?.phone,
          variations: (created.variations || []).map((v: any) => ({
          id: v.id,
          label: v.label,
          count: v.count,
          price: v.price,
            sizeSqm: created.type === 'stands' ? v.size : undefined
        })),
        units: [],
        createdAt: created.createdAt || new Date().toISOString()
      };

      // Defer unit generation to backend and load on demand to avoid UI freezes
      mapped.units = [];

      setDevelopments(prev => [mapped, ...prev]);
      setShowCreate(false);
      setName('');
      setType('stands');
      setDescription('');
      setVariations([]);
      setOwnerFirstName('');
      setOwnerLastName('');
      setOwnerCompanyName('');
      setOwnerEmail('');
      setOwnerIdNumber('');
      setOwnerPhone('');
      setDevAddress('');
      setCommissionPercent(5);
      setPreaPercentOfCommission(3);
      setAgencyPercent(50);
      setAgentPercent(50);
      setCollabOwnerAgentPercent(50);
      setCollabCollaboratorAgentPercent(50);
    } catch (e) {
      // Optionally surface error via snackbar/toast
    } finally {
      setCreating(false);
    }
  };

  const createDevelopmentQuick = async () => {
    const nameTrim = quickName.trim();
    if (!nameTrim || !quickType) return;
    const primaryOwner = quickOwnerName.trim() || quickOwnerCompany.trim();
    if (!primaryOwner) return;
    try {
      setQuickCreating(true);
      const created = await developmentService.create({
        name: nameTrim,
        type: quickType,
        description: quickDescription.trim() || undefined,
        address: quickAddress.trim() || undefined,
        owner: quickOwnerCompany.trim()
          ? { companyName: quickOwnerCompany.trim() }
          : (() => {
              const parts = quickOwnerName.trim().split(/\s+/);
              const firstName = parts[0] || '';
              const lastName = parts.slice(1).join(' ') || '';
              return { firstName, lastName };
            })(),
        variations: [],
        commissionPercent: 5,
        commissionPreaPercent: 3,
        commissionAgencyPercentRemaining: 50,
        commissionAgentPercentRemaining: 50,
        collabOwnerAgentPercent: 50,
        collabCollaboratorAgentPercent: 50
      });
      const mapped: Development = {
        id: created._id || created.id,
        name: created.name,
        type: created.type,
        description: created.description,
        collaborators: Array.isArray(created.collaborators) ? created.collaborators.map((x: any) => String(x)) : [],
        createdBy: created.createdBy ? String(created.createdBy) : undefined,
        ownerFirstName: created.owner?.firstName,
        ownerLastName: created.owner?.lastName,
        ownerCompanyName: created.owner?.companyName,
        ownerEmail: created.owner?.email,
        ownerIdNumber: created.owner?.idNumber,
        ownerPhone: created.owner?.phone,
        variations: (created.variations || []).map((v: any) => ({
          id: v.id,
          label: v.label,
          count: v.count,
          price: v.price,
          sizeSqm: created.type === 'stands' ? v.size : undefined
        })),
        units: [],
        createdAt: created.createdAt || new Date().toISOString()
      };
      setDevelopments(prev => [mapped, ...prev]);
      setShowQuickCreateDialog(false);
      setQuickName('');
      setQuickType('stands');
      setQuickAddress('');
      setQuickOwnerName('');
      setQuickOwnerCompany('');
      setQuickDescription('');
      setExpanded(prev => ({ ...prev, [mapped.id]: true }));
      setJustCreatedId(mapped.id);
      setTimeout(() => setJustCreatedId(null), 2000);
      addNotification({
        id: uid(),
        title: 'Development created',
        message: '👉 Development created successfully 🎉',
        read: false,
        createdAt: new Date()
      });
    } catch (e: any) {
      const msg = (e?.response?.data?.message) || 'Failed to create development';
      addNotification({ id: uid(), title: 'Error', message: msg, read: false, createdAt: new Date() });
    } finally {
      setQuickCreating(false);
    }
  };

  const updateDevelopment = (id: string, patch: Partial<Development>) => {
    setDevelopments(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const removeDevelopmentLocal = (id: string) => {
    setDevelopments(prev => prev.filter(d => d.id !== id));
  };

  const handleDeleteDevelopment = async (id: string) => {
    // Allow admin or sales to delete
    if (!user || !['admin', 'sales'].includes(user.role)) {
      alert('Only admins or sales can delete developments.');
      return;
    }
    const confirmed = window.confirm('Delete this development and all its units? This cannot be undone.');
    if (!confirmed) return;
    try {
      await developmentService.delete(id);
      removeDevelopmentLocal(id);
    } catch (e: any) {
      const msg = (e?.response?.data?.message) || 'Failed to delete development';
      alert(msg);
      try {
        const items = await developmentService.list();
        const mapped: Development[] = (items || []).map((d: any) => ({
          id: d._id,
          name: d.name,
          type: d.type,
          description: d.description,
          collaborators: Array.isArray(d.collaborators) ? d.collaborators.map((x: any)=> String(x)) : [],
          ownerFirstName: d.owner?.firstName,
          ownerLastName: d.owner?.lastName,
          ownerCompanyName: d.owner?.companyName,
          ownerEmail: d.owner?.email,
          ownerIdNumber: d.owner?.idNumber,
          ownerPhone: d.owner?.phone,
          variations: (d.variations || []).map((v: any) => ({ id: v.id, label: v.label, count: v.count, price: v.price, sizeSqm: d.type==='stands' ? v.size : undefined })),
          units: [],
          createdAt: d.createdAt,
        }));
        setDevelopments(mapped);
      } catch {}
    }
  };

  const updateUnit = (devId: string, unitId: string, patch: Partial<DevelopmentUnit>) => {
    setDevelopments(prev => prev.map(d => {
      if (d.id !== devId) return d;
      return { ...d, units: d.units.map(u => u.id === unitId ? { ...u, ...patch } : u) };
    }));
  };

  const openAddBuyer = (devId: string, unitId: string) => {
    setBuyerDevId(devId);
    setBuyerUnitId(unitId);
    setBuyerPickerId('');
    setBuyerName('');
    setBuyerPhone('');
    setBuyerIdNumber('');
    setBuyerEmail('');
    setShowAddBuyer(true);
  };

  // Load all buyers belonging to this logged-in agent/user when the dialog opens
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!showAddBuyer) return;
      try {
        setBuyerPickerLoading(true);
        const list = await buyerService.list();
        if (!cancelled) setBuyerPickerOptions(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setBuyerPickerOptions([]);
      } finally {
        if (!cancelled) setBuyerPickerLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [showAddBuyer]);

  const submitAddBuyer = async () => {
    if (!buyerName.trim()) return;
    try {
      setBuyerSaving(true);
      if (buyerPickerId) {
        const picked = (buyerPickerOptions || []).find((b: any) => String(b?._id || b?.id || '') === String(buyerPickerId));
        const pickedName = (picked as any)?.name || buyerName.trim();
        // Update buyer record to link to this unit and also set the unit's buyerId/buyerName
        await buyerService.update(buyerPickerId, { developmentId: buyerDevId, developmentUnitId: buyerUnitId } as any).catch(() => undefined);
        await developmentUnitService.setBuyer(buyerUnitId, buyerPickerId).catch(() => undefined);
        updateUnit(buyerDevId, buyerUnitId, { buyerName: pickedName });
      } else {
        const created = await buyerService.create({
          name: buyerName.trim(),
          phone: buyerPhone.trim() || undefined,
          email: buyerEmail.trim() || undefined,
          idNumber: buyerIdNumber.trim() || undefined,
          developmentId: buyerDevId,
          developmentUnitId: buyerUnitId
        });
        const displayName = created?.name || buyerName.trim();
        const createdId = String((created as any)?._id || (created as any)?.id || '');
        if (createdId) {
          await developmentUnitService.setBuyer(buyerUnitId, createdId).catch(() => undefined);
        }
        updateUnit(buyerDevId, buyerUnitId, { buyerName: displayName });
      }
      setShowAddBuyer(false);
    } catch (e) {
      // no-op UI error handling for now; could add snackbar
    } finally {
      setBuyerSaving(false);
    }
  };

  const printUnit = async (dev: Development, unit: DevelopmentUnit) => {
    try {
      const variation = dev.variations.find(v => v.id === unit.variationId);
      const total = computeUnitPrice(dev, unit, variation);
      // Load payments for this unit
      let payments: any[] = [];
      try {
        const resp = await developmentUnitService.listPayments(dev.id, { unitId: unit.id });
        payments = Array.isArray((resp as any)?.items) ? (resp as any).items : (Array.isArray(resp) ? resp as any[] : []);
      } catch {}

      const buyer = unit.buyerName || '-';
      const owner = [dev.ownerFirstName || '', dev.ownerLastName || ''].join(' ').trim() || dev.ownerCompanyName || '-';
      const unitLabel = unit.label || (typeof unit.unitNumber === 'number' ? `Unit ${unit.unitNumber}` : 'Unit');
      const currencyGuess = (payments[0]?.currency) || 'USD';

      const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${dev.name} - ${unitLabel}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111; }
          h1 { font-size: 20px; margin: 0 0 6px; }
          h2 { font-size: 16px; margin: 12px 0 6px; }
          .muted { color: #666; }
          .row { display: flex; justify-content: space-between; gap: 16px; }
          .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
          th { background: #f8fafc; }
          .amount { text-align: right; font-variant-numeric: tabular-nums; }
          .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; }
          .title { font-size: 22px; font-weight: 700; }
          .sub { font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${dev.name}</div>
            <div class="sub">${(dev.description || '').toString()}</div>
          </div>
          <div class="sub">Printed: ${new Date().toLocaleString()}</div>
        </div>

        <div class="card">
          <h1>${unitLabel}</h1>
          <div class="row">
            <div><strong>Development:</strong> ${dev.name}</div>
            <div><strong>Type:</strong> ${dev.type.toUpperCase()}</div>
          </div>
          <div class="row">
            <div><strong>Owner:</strong> ${owner}</div>
            <div><strong>Buyer:</strong> ${buyer}</div>
          </div>
          <div class="row">
            <div><strong>Status:</strong> ${unit.status.replace('_',' ').toUpperCase()}</div>
            <div><strong>Total Unit Price:</strong> ${currencyGuess} ${total.toLocaleString()}</div>
          </div>
        </div>

        <div class="card">
          <h2>Payments</h2>
          ${payments.length === 0 ? `<div class="muted">No payments for this unit.</div>` : `
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th>Method</th>
                <th class="amount">Amount</th>
                <th>Currency</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(p => `
                <tr>
                  <td>${new Date(String(p.paymentDate)).toLocaleDateString()}</td>
                  <td>${p.referenceNumber || ''}</td>
                  <td>${p.buyerName || ''}</td>
                  <td>${p.sellerName || ''}</td>
                  <td>${(p.paymentMethod || '').toString().replace('_',' ')}</td>
                  <td class="amount">${(p.amount || 0).toLocaleString()}</td>
                  <td>${p.currency || 'USD'}</td>
                  <td>${p.notes || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          `}
        </div>
      </body>
      </html>`;

      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
        <div className="flex-1 max-w-5xl mx-auto">
    <Box sx={{ width: '100%' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h4">Developments</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => setShowCreate(true)}>Full setup</Button>
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setShowQuickCreateDialog(true)}>Add Development</Button>
        </Box>
      </Box>

      {/* Quick Create Development (Phase 1 - under 60 seconds, no commission) */}
      <Dialog open={showQuickCreateDialog} onClose={() => setShowQuickCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Quick Create Development</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <TextField fullWidth label="Development Name" value={quickName} onChange={(e) => setQuickName(e.target.value)} required />
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth label="Type" value={quickType} onChange={(e) => setQuickType(e.target.value as DevelopmentType)}>
                <MenuItem value="stands">Stands</MenuItem>
                <MenuItem value="apartments">Apartments</MenuItem>
                <MenuItem value="houses">Houses</MenuItem>
                <MenuItem value="semidetached">Semi-detached</MenuItem>
                <MenuItem value="townhouses">Townhouses</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Development Address" value={quickAddress} onChange={(e) => setQuickAddress(e.target.value)} required />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Primary Owner (name or company)</Typography>
              <TextField fullWidth label="Owner name (First Last)" value={quickOwnerName} onChange={(e) => setQuickOwnerName(e.target.value)} placeholder="e.g. John Smith" />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>— or —</Typography>
              <TextField fullWidth label="Company name" value={quickOwnerCompany} onChange={(e) => setQuickOwnerCompany(e.target.value)} placeholder="e.g. ABC Holdings" sx={{ mt: 1 }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={2} label="Short description (optional)" value={quickDescription} onChange={(e) => setQuickDescription(e.target.value)} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowQuickCreateDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={createDevelopmentQuick}
            disabled={quickCreating || !quickName.trim() || !quickType || (!quickOwnerName.trim() && !quickOwnerCompany.trim()) || !quickAddress.trim()}
          >
            {quickCreating ? 'Creating…' : 'Create Development'}
          </Button>
        </DialogActions>
      </Dialog>

      <Grid container spacing={2}>
        {developments.map((dev) => {
          const statusCounts = dev.units.reduce((acc, u) => { acc[u.status] = (acc[u.status] || 0) + 1; return acc; }, {} as Record<UnitStatus, number>);
          const isOpen = !!expanded[dev.id];
          return (
            <Grid item xs={12} key={dev.id} id={justCreatedId === dev.id ? 'dev-card-just-created' : undefined}>
              <Paper variant="outlined" sx={{ p: 2, ...(justCreatedId === dev.id ? { boxShadow: 2, borderColor: 'primary.main', borderWidth: 2 } : {}) }}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  onClick={async () => {
                    setExpanded(prev => {
                      const next = !prev[dev.id];
                      return { ...prev, [dev.id]: next };
                    });
                    // On opening, fetch units if not loaded yet
                    const isOpening = !expanded[dev.id];
                    if (isOpening && (dev.units || []).length === 0) {
                      try {
                        setLoadingUnits(prev => ({ ...prev, [dev.id]: true }));
                        const items = await developmentUnitService.list({ developmentId: dev.id, limit: 500 });
                        const mappedUnits = (items || []).map((u: any) => ({
                          id: String(u._id || u.id),
                          variationId: String(u.variationId),
                          label: String(u.unitCode || ''),
                          status: (u.status || 'available') as UnitStatus,
                          buyerName: u.buyerHidden ? undefined : u.buyerName,
                          buyerHidden: !!u.buyerHidden,
                          unitNumber: typeof u.unitNumber === 'number' ? u.unitNumber : undefined,
                          collaborators: Array.isArray(u.collaborators) ? u.collaborators.map((x:any)=>String(x)) : [],
                          price: typeof u.price === 'number' ? Number(u.price) : undefined
                        }));
                        updateDevelopment(dev.id, { units: mappedUnits });
                        // For each unit, load its buyers filtered by development and unit (don't attach if buyerHidden)
                        try {
                          const allBuyers = await buyerService.list({ developmentId: dev.id });
                          const buyersByUnit: Record<string, string> = {};
                          (allBuyers || []).forEach((b: any) => {
                            if (String(b.developmentId) === String(dev.id) && b.developmentUnitId) {
                              buyersByUnit[String(b.developmentUnitId)] = b.name;
                            }
                          });
                          const nextUnits: DevelopmentUnit[] = mappedUnits.map((unit: any) => ({
                            id: String(unit.id),
                            variationId: String(unit.variationId),
                            label: String(unit.label),
                            status: unit.status as UnitStatus,
                            buyerName: unit.buyerHidden ? undefined : (buyersByUnit[String(unit.id)] || unit.buyerName),
                            buyerHidden: unit.buyerHidden,
                            unitNumber: typeof unit.unitNumber === 'number' ? unit.unitNumber : undefined,
                            collaborators: Array.isArray(unit.collaborators) ? unit.collaborators.map((x:any)=>String(x)) : [],
                            price: typeof unit.price === 'number' ? Number(unit.price) : undefined
                          }));
                          updateDevelopment(dev.id, { units: nextUnits });
                        } catch {}
                      } finally {
                        setLoadingUnits(prev => ({ ...prev, [dev.id]: false }));
                      }
                    }
                  }}
                  sx={{ cursor: 'pointer' }}
                  role="button"
                  aria-expanded={isOpen}
                >
                  <Box>
                    <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                      <Typography variant="h6">{dev.name} • {dev.type.toUpperCase()}</Typography>
                      {(() => {
                        const uid = user?._id;
                        const isOwner = uid && dev.createdBy && String(dev.createdBy) === String(uid);
                        const isCollab = !isOwner && Array.isArray(dev.collaborators) && uid && dev.collaborators.some(c=> String(c)===String(uid));
                        if (isOwner) return <Chip size="small" color="primary" label="Owner" />;
                        if (isCollab) return <Chip size="small" label="Collaborator" />;
                        // Show Unit collaborator if not owner/collab but server flagged or units indicate collaboration
                        const isUnitCollab = !!(dev.isUnitCollaborator || (uid && (dev.units || []).some(u => Array.isArray(u.collaborators) && u.collaborators.some(id => String(id) === String(uid)))));
                        if (isUnitCollab) return <Chip size="small" label="Unit collaborator" />;
                        return null;
                      })()}
                    </Box>
                    {dev.description && <Typography variant="body2" color="text.secondary">{dev.description}</Typography>}
                    <Typography variant="caption" color="text.secondary">Collaborators: {dev.collaborators?.length || 0}</Typography>
                  </Box>
                  {isOpen && (
                    <Box display="flex" gap={1}>
                      <Button size="small" startIcon={<FileDownloadIcon />} onClick={(e) => { e.stopPropagation(); exportUnitsCsv(dev); }}>Export CSV</Button>
                      <Button size="small" onClick={(e)=>{ e.stopPropagation(); setShowCollab({ open: true, devId: dev.id }); }}>Collaborators</Button>
                      {(user?.role === 'admin' || user?.role === 'sales') && (
                        <Button size="small" startIcon={<DeleteIcon />} color="error" onClick={(e) => { e.stopPropagation(); handleDeleteDevelopment(dev.id); }}>Delete</Button>
                      )}
                    </Box>
                  )}
                </Box>

                {isOpen && (
                  <>
                    <Divider sx={{ my: 2 }} />

                    {/* Sales Snapshot */}
                    {(() => {
                      const total = dev.units.length;
                      const available = (dev.units || []).filter(u => u.status === 'available').length;
                      const underOffer = (dev.units || []).filter(u => u.status === 'under_offer').length;
                      const sold = (dev.units || []).filter(u => u.status === 'sold').length;
                      const reservedOrOffer = underOffer;
                      const sellThrough = total > 0 ? Math.round((sold / total) * 100) : 0;
                      const totalValueSold = (dev.units || [])
                        .filter(u => u.status === 'sold')
                        .reduce((sum, u) => sum + computeUnitPrice(dev, u, dev.variations.find(v => v.id === u.variationId)), 0);
                      return (
                        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Sales snapshot</Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={6} sm={3}><Typography variant="body2" color="text.secondary">Total units</Typography><Typography variant="h6">{total}</Typography></Grid>
                            <Grid item xs={6} sm={3}><Typography variant="body2" color="text.secondary">Available</Typography><Typography variant="h6" color="success.main">{available}</Typography></Grid>
                            <Grid item xs={6} sm={3}><Typography variant="body2" color="text.secondary">Reserved / Under offer</Typography><Typography variant="h6" color="warning.main">{reservedOrOffer}</Typography></Grid>
                            <Grid item xs={6} sm={3}><Typography variant="body2" color="text.secondary">Sold</Typography><Typography variant="h6" color="info.main">{sold}</Typography></Grid>
                            <Grid item xs={6} sm={3}><Typography variant="body2" color="text.secondary">Sell-through %</Typography><Typography variant="h6">{sellThrough}%</Typography></Grid>
                            <Grid item xs={6} sm={3}><Typography variant="body2" color="text.secondary">Total value sold</Typography><Typography variant="h6">{totalValueSold.toLocaleString()}</Typography></Grid>
                          </Grid>
                        </Paper>
                      );
                    })()}

                    {/* Setup Checklist (progress engine) */}
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Setup checklist</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                        <Chip size="small" color="success" label="✓ Development created" />
                        <Chip
                          size="small"
                          variant={dev.variations.some(v => v.label && v.label !== 'To be defined') ? 'filled' : 'outlined'}
                          color={dev.variations.some(v => v.label && v.label !== 'To be defined') ? 'success' : 'default'}
                          label={dev.variations.some(v => v.label && v.label !== 'To be defined') ? '✓ Add unit types' : '⬜ Add unit types'}
                          onClick={(e) => { e.stopPropagation(); setShowAddVar({ open: true, devId: dev.id }); setNewVarLabel(''); setNewVarCount(1); setNewVarSizeSqm(0); setNewVarPricePerSqm(0); setNewVarPrice(0); }}
                          sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                          size="small"
                          variant={(dev.units || []).length > 0 ? 'filled' : 'outlined'}
                          color={(dev.units || []).length > 0 ? 'success' : 'default'}
                          label={(dev.units || []).length > 0 ? `✓ Add units (${dev.units.length})` : '⬜ Add units'}
                          onClick={(e) => { e.stopPropagation(); setShowAddVar({ open: true, devId: dev.id }); }}
                          sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                          size="small"
                          variant={(dev.commissionPercent != null && dev.commissionPercent > 0) ? 'filled' : 'outlined'}
                          color={(dev.commissionPercent != null && dev.commissionPercent > 0) ? 'success' : 'default'}
                          label={(dev.commissionPercent != null && dev.commissionPercent > 0) ? '✓ Set commission structure' : '⬜ Set commission structure (advanced)'}
                          onClick={(e) => { e.stopPropagation(); setShowCommissionDialog({ open: true, devId: dev.id }); }}
                          sx={{ cursor: 'pointer' }}
                        />
                        <Chip
                          size="small"
                          variant={(dev.collaborators?.length ?? 0) > 0 ? 'filled' : 'outlined'}
                          color={(dev.collaborators?.length ?? 0) > 0 ? 'success' : 'default'}
                          label={(dev.collaborators?.length ?? 0) > 0 ? `✓ Add collaborators (${dev.collaborators?.length ?? 0})` : '⬜ Add collaborators'}
                          onClick={(e) => { e.stopPropagation(); setShowCollab({ open: true, devId: dev.id }); }}
                          sx={{ cursor: 'pointer' }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Commission &amp; collaborators: Advanced (can be updated later)</Typography>
                    </Box>

                    {/* Unit Types (renamed from Variations) */}
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Unit types</Typography>
                      <Box display="flex" flexWrap="wrap" gap={1} alignItems="center">
                        {dev.variations.map(v => {
                          const uid = user?._id;
                          const isOwner = uid && dev.createdBy && String(dev.createdBy) === String(uid);
                          const isDevCollab = !isOwner && Array.isArray(dev.collaborators) && uid && dev.collaborators.some(c=> String(c)===String(uid));
                          const limitedView = !(user?.role === 'admin' || user?.role === 'accountant') && !isOwner && !isDevCollab;
                          const visibleCount = (dev.units || []).filter(u => String(u.variationId) === String(v.id)).length;
                          const countToShow = limitedView ? visibleCount : (v.count || 0);
                          const unitLabel = dev.type === 'stands' && typeof v.sizeSqm === 'number' ? `${v.sizeSqm} sqm Stands` : v.label;
                          return (
                            <Box key={v.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Chip label={`${unitLabel} · ${countToShow} units`} />
                              <Button size="small" variant="outlined" onClick={(e)=>{ e.stopPropagation();
                                setShowEditVar({ open: true, devId: dev.id, variationId: v.id });
                                setEditVarLabel(v.label || '');
                                setEditVarSizeSqm(Number(v.sizeSqm || 0));
                                setEditVarPrice(Number(v.price || 0));
                                setEditVarAddUnits(0);
                              }}>Edit</Button>
                            </Box>
                          );
                        })}
                        <Button size="small" startIcon={<AddIcon />} onClick={(e)=>{ e.stopPropagation(); setShowAddVar({ open: true, devId: dev.id }); setNewVarLabel(''); setNewVarCount(1); setNewVarSizeSqm(0); setNewVarPricePerSqm(0); setNewVarPrice(0); }}>Add unit type</Button>
                      </Box>
                    </Box>
                    <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                      <Chip label={`Available: ${statusCounts['available'] || 0}`} />
                      {dev.variations.length > 1 && (() => {
                        const availableByVar: Record<string, number> = {};
                        (dev.units || []).forEach(u => {
                          if (u.status === 'available') {
                            availableByVar[u.variationId] = (availableByVar[u.variationId] || 0) + 1;
                          }
                        });
                        return dev.variations
                          .map(v => ({ id: v.id, label: v.label, count: availableByVar[v.id] || 0 }))
                          .filter(x => x.count > 0)
                          .map(x => (
                            <Chip key={`avail-${x.id}`} variant="outlined" label={`${x.label}: ${x.count}`} />
                          ));
                      })()}
                      <Chip color="warning" label={`Under Offer: ${statusCounts['under_offer'] || 0}`} />
                      <Chip color="success" label={`Sold: ${statusCounts['sold'] || 0}`} />
                    </Box>

                    {/* Units table */}
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Unit</TableCell>
                          <TableCell>Unit type</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Buyer</TableCell>
                          <TableCell align="right">Total</TableCell>
                          <TableCell>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(() => {
                          const page = pageByDev[dev.id] ?? 0;
                          const rowsPerPage = rowsPerPageByDev[dev.id] ?? 25;
                          const items = loadingUnits[dev.id] ? [] : dev.units;
                          const paged = items.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
                          return paged;
                        })().map((u, idx, arr) => {
                          const variation = dev.variations.find(v => v.id === u.variationId);
                          const total = computeUnitPrice(dev, u, variation);
                          const isNewVariation = idx === 0 || arr[idx - 1].variationId !== u.variationId;
                          const variationLabel = variation?.label || 'Variation';
                          return (
                            <React.Fragment key={u.id}>
                            {isNewVariation && (
                              <TableRow>
                                <TableCell colSpan={6} style={{ paddingTop: 12, paddingBottom: 8 }}>
                                  <Box sx={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 1, px: 1.25, py: 0.75 }}>
                                    <Typography variant="subtitle2" color="text.secondary">Unit type: {variationLabel}</Typography>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            )}
                            <TableRow
                              hover
                              sx={{ ...(highlightUnitId === u.id ? { bgcolor: 'primary.light' } : {}) }}
                              onClick={async () => {
                                setOpenUnit(prev => ({ ...prev, [u.id]: !prev[u.id] }));
                                const opening = !openUnit[u.id];
                                if (opening && !unitPayments[u.id]) {
                                  try {
                                    setUnitPaymentsLoading(prev => ({ ...prev, [u.id]: true }));
                                    const payments = await developmentUnitService.listPayments(dev.id, { unitId: u.id });
                                    setUnitPayments(prev => ({ ...prev, [u.id]: Array.isArray(payments?.items) ? payments.items : (Array.isArray(payments) ? payments : []) }));
                                  } catch {
                                    setUnitPayments(prev => ({ ...prev, [u.id]: [] }));
                                  } finally {
                                    setUnitPaymentsLoading(prev => ({ ...prev, [u.id]: false }));
                                  }
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <TableCell>{
                                (u.label && u.label.trim().length > 0)
                                  ? u.label
                                  : (typeof u.unitNumber === 'number'
                                      ? u.unitNumber
                                      : (dev.units.filter(x => x.variationId === u.variationId).findIndex(x => x.id === u.id) + 1))
                              }</TableCell>
                              <TableCell>{variation?.label}</TableCell>
                              <TableCell>
                                <TextField select size="small" value={u.status} onChange={async (e) => {
                                  const next = e.target.value as UnitStatus;
                                  const prevStatus = u.status;
                                  updateUnit(dev.id, u.id, { status: next });
                                  try {
                                    await developmentUnitService.updateStatus(u.id, { to: next });
                                    setHighlightUnitId(u.id);
                                    setTimeout(() => setHighlightUnitId(null), 1200);
                                    if (next === 'sold') {
                                      const unitLabel = (u.label && u.label.trim()) ? u.label : `Unit ${typeof u.unitNumber === 'number' ? u.unitNumber : ''}`;
                                      addNotification({ id: uid(), title: 'Unit sold', message: `${unitLabel} marked as sold 🎉`, read: false, createdAt: new Date() });
                                    }
                                  } catch {}
                                }}>
                                  <MenuItem value="available">Available</MenuItem>
                                  <MenuItem value="under_offer">Under Offer</MenuItem>
                                  <MenuItem value="sold">Sold</MenuItem>
                                </TextField>
                              </TableCell>
                              <TableCell>
                                {u.status === 'sold' ? (
                                  (u.buyerHidden || !(u.buyerName && u.buyerName.trim().length > 0)) ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <span style={{ opacity: 0.7 }}>🔒</span> Sold by collaborating agent
                                    </Typography>
                                  ) : (
                                    <Chip label={u.buyerName} size="small" />
                                  )
                                ) : (
                                  (u.buyerName && u.buyerName.trim().length > 0) ? (
                                    <Chip label={u.buyerName} size="small" />
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">—</Typography>
                                  )
                                )}
                              </TableCell>
                              <TableCell align="right">{total.toLocaleString()}</TableCell>
                              
                              <TableCell>
                                {u.status !== 'sold' && (
                                  <Button size="small" startIcon={<AddIcon />} onClick={(e) => { e.stopPropagation(); openAddBuyer(dev.id, u.id); }}>Add Buyer</Button>
                                )}
                                {u.status === 'sold' && (u.buyerHidden || !(u.buyerName && u.buyerName.trim())) && (
                                  <Typography variant="caption" color="text.secondary">Buyer details hidden (collaboration sale)</Typography>
                                )}
                                <Button size="small" sx={{ ml: 1 }} onClick={(e)=>{ e.stopPropagation();
                                  // Prefill edit dialog
                                  setShowEditUnit({ open: true, devId: dev.id, unitId: u.id });
                                  setEditUnitCode(u.label || '');
                                  const found = dev.units.find(x=>x.id===u.id);
                                  setEditUnitPrice('');
                                  setEditUnitBlock('');
                                  setEditUnitFloor('');
                                  setEditUnitStandSize('');
                                  // Lazy-load sales users if not loaded
                                  if (salesUsers.length === 0) {
                                    (async ()=>{
                                      try {
                                        const res = await api.get('/users/agents', { params: { role: 'sales' } });
                                        const list = (res.data?.data || res.data || []) as any[];
                                        setSalesUsers(Array.isArray(list) ? list : []);
                                      } catch {}
                                    })();
                                  }
                                }}>Edit</Button>
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); printUnit(dev, u); }} title="Print">
                                  <PrintIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                            {openUnit[u.id] && (
                              <TableRow key={`${u.id}-details`}>
                                <TableCell colSpan={6}>
                                  {unitPaymentsLoading[u.id] && (
                                    <Typography variant="body2" color="text.secondary">Loading payments…</Typography>
                                  )}
                                  {!unitPaymentsLoading[u.id] && (
                                    (() => {
                                      const list = unitPayments[u.id] || [];
                                      if (list.length === 0) {
                                        return <Typography variant="body2" color="text.secondary">No payments found for this unit.</Typography>;
                                      }
                                      const isInstallment = list.some((p: any) => (p as any).saleMode === 'installment');
                                      const parseTotal = (text: string) => {
                                        const m = String(text || '').match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
                                        if (m && m[1]) {
                                          const n = Number(m[1].replace(/,/g, ''));
                                          return Number.isFinite(n) ? n : null;
                                        }
                                        return null;
                                      };
                                      const parsedTotals = list.map(p => parseTotal((p as any).notes)).filter((n): n is number => n != null);
                                      let totalSale = parsedTotals.length > 0 ? parsedTotals[0] : undefined;
                                      // Fallback: use computed unit price when not available in payment notes
                                      if (totalSale == null || !(totalSale > 0)) {
                                        const unitTotal = Number(total);
                                        if (Number.isFinite(unitTotal) && unitTotal > 0) totalSale = unitTotal;
                                      }
                                      const currency = (list[0] as any).currency || 'USD';
                                      if (!isInstallment) {
                                        const amountPaid = list.reduce((s, p: any) => s + (p.amount || 0), 0);
                                        const ownerAmount = list.reduce((s, p: any) => s + (p.commissionDetails?.ownerAmount || 0), 0);
                                        const commissionAmount = list.reduce((s, p: any) => s + (p.commissionDetails?.totalCommission || 0), 0);
                                        return (
                                          <Box>
                                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Quick Sale Summary</Typography>
                                            <Grid container spacing={2}>
                                              <Grid item xs={12} md={3}><Typography variant="body2">Total Sale Price: {totalSale != null ? `${currency} ${totalSale.toLocaleString()}` : '—'}</Typography></Grid>
                                              <Grid item xs={12} md={3}><Typography variant="body2">Amount Paid: {`${currency} ${amountPaid.toLocaleString()}`}</Typography></Grid>
                                              <Grid item xs={12} md={3}><Typography variant="body2">To Owner: {`${currency} ${ownerAmount.toLocaleString()}`}</Typography></Grid>
                                              <Grid item xs={12} md={3}><Typography variant="body2">Commission: {`${currency} ${commissionAmount.toLocaleString()}`}</Typography></Grid>
                                            </Grid>
                                          </Box>
                                        );
                                      }
                                      const sorted = [...list].sort((a: any, b: any) => new Date(String(a.paymentDate)).getTime() - new Date(String(b.paymentDate)).getTime());
                                      let balance = Number(totalSale || 0);
                                      return (
                                        <Box>
                                          <Typography variant="subtitle2" sx={{ mb: 1 }}>Installment Payments</Typography>
                                          <Table size="small">
                                            <TableHead>
                                              <TableRow>
                                                <TableCell>Date</TableCell>
                                                <TableCell align="right">Amount</TableCell>
                                                <TableCell align="right">Owner Amount</TableCell>
                                                <TableCell align="right">Commission</TableCell>
                                                <TableCell align="right">Balance</TableCell>
                                              </TableRow>
                                            </TableHead>
                                            <TableBody>
                                              {sorted.map((p: any, idx: number) => {
                                                const amt = Number(p.amount || 0);
                                                const own = Number(p.commissionDetails?.ownerAmount || 0);
                                                const com = Number(p.commissionDetails?.totalCommission || 0);
                                                if (totalSale != null) balance = Math.max(0, (idx === 0 ? Number(totalSale) : balance) - amt);
                                                return (
                                                  <TableRow key={p._id || idx}>
                                                    <TableCell>{new Date(String(p.paymentDate)).toLocaleDateString()}</TableCell>
                                                    <TableCell align="right">{`${currency} ${amt.toLocaleString()}`}</TableCell>
                                                    <TableCell align="right">{`${currency} ${own.toLocaleString()}`}</TableCell>
                                                    <TableCell align="right">{`${currency} ${com.toLocaleString()}`}</TableCell>
                                                    <TableCell align="right">{totalSale != null ? `${currency} ${balance.toLocaleString()}` : '—'}</TableCell>
                                                  </TableRow>
                                                );
                                              })}
                                            </TableBody>
                                          </Table>
                                        </Box>
                                      );
                                    })()
                                  )}
                                </TableCell>
                            </TableRow>
                            )}
                            </React.Fragment>
                          );
                        })}
                        {loadingUnits[dev.id] && (
                          <TableRow>
                            <TableCell colSpan={6}>
                              <Typography variant="body2" color="text.secondary">Loading units…</Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>

                    <TablePagination
                      component="div"
                      count={dev.units.length}
                      page={pageByDev[dev.id] ?? 0}
                      onPageChange={(_, newPage) => setPageByDev(prev => ({ ...prev, [dev.id]: newPage }))}
                      rowsPerPage={rowsPerPageByDev[dev.id] ?? 25}
                      onRowsPerPageChange={(e) => {
                        const next = parseInt(e.target.value, 10);
                        setRowsPerPageByDev(prev => ({ ...prev, [dev.id]: next }));
                        setPageByDev(prev => ({ ...prev, [dev.id]: 0 }));
                      }}
                      rowsPerPageOptions={[10, 25, 50, 100]}
                    />

                    {/* Payments inline editor */}
                  {/* Removed payments editor; buyer is captured via Add Buyer dialog */}
                  </>
                )}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} maxWidth="md" fullWidth>
        <DialogTitle>New Development</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Name" value={name} onChange={(e)=>setName(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField select fullWidth label="Type" value={type} onChange={(e)=>setType(e.target.value as DevelopmentType)}>
                <MenuItem value="stands">Stands</MenuItem>
                <MenuItem value="apartments">Apartments</MenuItem>
                <MenuItem value="houses">Houses</MenuItem>
                <MenuItem value="semidetached">Semi-detached</MenuItem>
                <MenuItem value="townhouses">Townhouses</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth multiline minRows={2} label="Description" value={description} onChange={(e)=>setDescription(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Development Address" value={devAddress} onChange={(e)=>setDevAddress(e.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Owner Details</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Owner First Name" value={ownerFirstName} onChange={(e)=>setOwnerFirstName(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Owner Last Name" value={ownerLastName} onChange={(e)=>setOwnerLastName(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Company Name (optional)" value={ownerCompanyName} onChange={(e)=>setOwnerCompanyName(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Owner Email" type="email" value={ownerEmail} onChange={(e)=>setOwnerEmail(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Owner ID Number" value={ownerIdNumber} onChange={(e)=>setOwnerIdNumber(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Owner Phone" value={ownerPhone} onChange={(e)=>setOwnerPhone(e.target.value)} />
            </Grid>
          </Grid>
          <Divider sx={{ my: 2 }} />
        <Box sx={{ mb: 2 }}>
          <Button size="small" startIcon={<ExpandMoreIcon sx={{ transform: showAdvancedCreate ? 'rotate(180deg)' : 'none' }} />} onClick={() => setShowAdvancedCreate(!showAdvancedCreate)}>
            Advanced settings (commission &amp; collaborators — can be updated later)
          </Button>
          <Collapse in={showAdvancedCreate}>
        {/* Commission section (applies across all variations/units) */}
        <Box sx={{ mb: 2, mt: 1 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Commission</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                type="number"
                label="Commission %"
                value={commissionPercent}
                onChange={(e)=>setCommissionPercent(Math.max(0, Number(e.target.value)||0))}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
                helperText="Applies to total sale price"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                type="number"
                label="PREA % of Commission"
                value={preaPercentOfCommission}
                onChange={(e)=>setPreaPercentOfCommission(Math.max(0, Number(e.target.value)||0))}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                type="number"
                label="Agency % of Remaining"
                value={agencyPercent}
                onChange={(e)=>{
                  const v = Math.max(0, Math.min(100, Number(e.target.value)||0));
                  setAgencyPercent(v);
                  setAgentPercent(Number((100 - v).toFixed(2)));
                }}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                type="number"
                label="Agent % of Remaining"
                value={agentPercent}
                InputProps={{ readOnly: true }}
              />
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary">
            Commission structure applies to all variations and units in this development. PREA is taken off the top, then the remaining commission is split between agency and agent.
          </Typography>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Collaborator Agent Split</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Owner's % of Agent Share (when collaborator sells)"
                value={collabOwnerAgentPercent}
                onChange={(e)=>{
                  const v = Math.max(0, Math.min(100, Number(e.target.value)||0));
                  setCollabOwnerAgentPercent(v);
                  setCollabCollaboratorAgentPercent(Number((100 - v).toFixed(2)));
                }}
                inputProps={{ min: 0, max: 100, step: 1 }}
                helperText="Default 50%. The remainder goes to the collaborator."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Collaborator's % of Agent Share"
                value={collabCollaboratorAgentPercent}
                InputProps={{ readOnly: true }}
              />
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary">
            When a collaborator sells a unit, the development owner's share of the agent commission is applied here. Collaborators cannot add other collaborators.
          </Typography>
        </Box>
          </Collapse>
        </Box>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle1">Variations</Typography>
            <Button startIcon={<AddIcon />} onClick={addVariation}>Add Variation</Button>
          </Box>
          {variations.length === 0 && (
            <Typography variant="body2" color="text.secondary">Add variations like "3 bed / 2 bath" or "500 sqm".</Typography>
          )}
          {variations.map(v => (
            <Paper key={v.id} variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} sm={4}><TextField fullWidth size="small" label={(type==='stands')? 'Size label (e.g. 500 sqm)' : 'Variation label (e.g. 3 bed / 2 bath)'} value={v.label} onChange={(e)=>updateVariation(v.id, { label: e.target.value })} /></Grid>
                <Grid item xs={6} sm={2}><TextField fullWidth size="small" type="number" label="Units" inputProps={{ min: 1 }} value={v.count} onChange={(e)=>updateVariation(v.id, { count: Math.max(1, Number(e.target.value)||1) })} disabled={type==='stands' && !!(v.customUnitNames||'').trim()} /></Grid>
                {type === 'stands' ? (
                  <>
                    <Grid item xs={6} sm={2}><TextField fullWidth size="small" type="number" label="Size (sqm)" value={v.sizeSqm || ''} onChange={(e)=>updateVariation(v.id, { sizeSqm: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={6} sm={2}><TextField fullWidth size="small" type="number" label="Price / sqm" value={v.pricePerSqm || ''} onChange={(e)=>updateVariation(v.id, { pricePerSqm: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={6} sm={2}><TextField fullWidth size="small" label="Example Total" value={((v.sizeSqm||0)*(v.pricePerSqm||0)).toLocaleString()} InputProps={{ readOnly: true }} /></Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        minRows={2}
                        label="Custom unit names (comma or newline separated)"
                        value={v.customUnitNames || ''}
                        onChange={(e)=>{
                          const text = e.target.value;
                          const names = String(text||'').split(/\n|,/).map(s=>s.trim()).filter(Boolean);
                          updateVariation(v.id, { customUnitNames: text, count: names.length>0 ? names.length : (v.count||1) });
                        }}
                        helperText={(() => { const n = String(v.customUnitNames||'').split(/\n|,/).map(s=>s.trim()).filter(Boolean).length; return n>0 ? `Detected ${n} names — Units will be set to ${n}` : 'Optional'; })()}
                      />
                    </Grid>
                  </>
                ) : (
                  <>
                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Beds" value={v.beds ?? ''} onChange={(e)=>updateVariation(v.id, { beds: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Baths" value={v.baths ?? ''} onChange={(e)=>updateVariation(v.id, { baths: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Land size (sqm)" value={v.landSizeSqm ?? ''} onChange={(e)=>updateVariation(v.id, { landSizeSqm: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={6} sm={3}><TextField fullWidth size="small" type="number" label="Building size (sqm)" value={v.buildingSizeSqm ?? ''} onChange={(e)=>updateVariation(v.id, { buildingSizeSqm: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={12} sm={4}><TextField fullWidth size="small" type="number" label="Price per unit" value={v.price || ''} onChange={(e)=>updateVariation(v.id, { price: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={12} sm={8}>
                      <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Amenities</Typography>
                      <Grid container spacing={1} alignItems="center">
                        <Grid item>
                          <FormControlLabel control={<Checkbox checked={!!v.amenitySolar} onChange={(e)=>updateVariation(v.id, { amenitySolar: e.target.checked })} />} label="Solar" />
                        </Grid>
                        <Grid item>
                          <FormControlLabel control={<Checkbox checked={!!v.amenityBorehole} onChange={(e)=>updateVariation(v.id, { amenityBorehole: e.target.checked })} />} label="Borehole" />
                        </Grid>
                        <Grid item>
                          <FormControlLabel control={<Checkbox checked={!!v.amenityWaterTank} onChange={(e)=>updateVariation(v.id, { amenityWaterTank: e.target.checked })} />} label="Water tank" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField select fullWidth size="small" label="Swimming pool" value={v.amenityPool || 'none'} onChange={(e)=>updateVariation(v.id, { amenityPool: e.target.value as any })}>
                            <MenuItem value="none">None</MenuItem>
                            <MenuItem value="individual">Individual</MenuItem>
                            <MenuItem value="communal">Communal</MenuItem>
                          </TextField>
                        </Grid>
                      </Grid>
                    </Grid>
                  </>
                )}
                <Grid item xs={12} sm={2}>
                  <IconButton color="error" onClick={()=>removeVariation(v.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Grid>
              </Grid>
            </Paper>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setShowCreate(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={createDevelopment}
            disabled={
              creating ||
              !name.trim() ||
              variations.filter(v => v.label && v.label.trim().length > 0 && (v.count || 0) >= 1).length === 0
            }
          >{creating ? 'Creating…' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      {/* Add Unit Type Dialog */}
      <Dialog open={showAddVar.open} onClose={()=>setShowAddVar({ open:false, devId:null })} maxWidth="sm" fullWidth>
        <DialogTitle>Add unit type</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <TextField fullWidth label="Label" value={newVarLabel} onChange={(e)=>setNewVarLabel(e.target.value)} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth type="number" label="Units" inputProps={{ min:1 }} value={newVarCount} onChange={(e)=>setNewVarCount(Math.max(1, Number(e.target.value)||1))} />
            </Grid>
                        {(() => {
              const dev = developments.find(d => d.id === showAddVar.devId);
              if (dev?.type === 'stands') {
                return (
                  <>
                    <Grid item xs={6}>
                      <TextField fullWidth type="number" label="Size (sqm)" value={newVarSizeSqm || ''} onChange={(e)=>setNewVarSizeSqm(Number(e.target.value)||0)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth type="number" label="Price / sqm" value={newVarPricePerSqm || ''} onChange={(e)=>setNewVarPricePerSqm(Number(e.target.value)||0)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth label="Example Total" value={((newVarSizeSqm||0)*(newVarPricePerSqm||0)).toLocaleString()} InputProps={{ readOnly: true }} />
                    </Grid>
                                <Grid item xs={12}>
                                  <TextField
                                    fullWidth
                                    multiline
                                    minRows={2}
                                    label="Custom unit names (comma or newline separated)"
                                    value={newVarCustomNames}
                                    onChange={(e)=>setNewVarCustomNames(e.target.value)}
                                    helperText={(() => { const n = (newVarCustomNames||'').split(/\n|,/).map(s=>s.trim()).filter(Boolean).length; return n>0 ? `Detected ${n} names — Units will be set to ${n}` : 'Optional'; })()}
                                  />
                                </Grid>
                  </>
                );
              }
              return (
                <Grid item xs={12}>
                  <TextField fullWidth type="number" label="Price per unit" value={newVarPrice || ''} onChange={(e)=>setNewVarPrice(Number(e.target.value)||0)} />
                </Grid>
              );
            })()}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>{ setShowAddVar({ open:false, devId:null }); setNewVarCustomNames(''); }} disabled={savingVar}>Cancel</Button>
          <Button variant="contained" disabled={savingVar || !newVarLabel.trim() || !showAddVar.devId} onClick={async ()=>{
            if (!showAddVar.devId) return;
            try {
              setSavingVar(true);
              const dev = developments.find(d => d.id === showAddVar.devId)!;
              const parsedNames = String(newVarCustomNames || '')
                .split(/\n|,/)
                .map(s => s.trim())
                .filter(s => s.length > 0);
              const useCustom = dev.type === 'stands' && parsedNames.length > 0;
              const toSend = {
                id: uid(),
                label: newVarLabel.trim(),
                count: useCustom ? parsedNames.length : newVarCount,
                price: dev.type === 'stands' ? Math.max(0, (newVarSizeSqm||0) * (newVarPricePerSqm||0)) : (newVarPrice || 0),
                size: dev.type === 'stands' ? (newVarSizeSqm || 0) : undefined,
                unitCodes: useCustom ? parsedNames : undefined
              } as any;
              const updated = await developmentService.addVariations(showAddVar.devId, [toSend]);
              // Map updated development and replace in state
              const mapped = {
                id: updated._id || updated.id,
                name: updated.name,
                type: updated.type,
                description: updated.description,
                collaborators: Array.isArray(updated.collaborators) ? updated.collaborators.map((x: any)=> String(x)) : [],
                createdBy: updated.createdBy ? String(updated.createdBy) : undefined,
                isUnitCollaborator: (developments.find(d=>d.id=== (updated._id||updated.id)) as any)?.isUnitCollaborator || false,
                ownerFirstName: updated.owner?.firstName,
                ownerLastName: updated.owner?.lastName,
                ownerCompanyName: updated.owner?.companyName,
                ownerEmail: updated.owner?.email,
                ownerIdNumber: updated.owner?.idNumber,
                ownerPhone: updated.owner?.phone,
                variations: (updated.variations || []).map((v: any) => ({ id: v.id, label: v.label, count: v.count, price: v.price, sizeSqm: updated.type==='stands' ? v.size : undefined })),
                units: developments.find(d=>d.id=== (updated._id||updated.id))?.units || [],
                createdAt: updated.createdAt
              } as Development;
              setDevelopments(prev => prev.map(d => d.id === mapped.id ? mapped : d));
              setShowAddVar({ open:false, devId:null });
              setNewVarCustomNames('');
            } catch (e) {
            } finally {
              setSavingVar(false);
            }
          }}>{savingVar ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Unit Type Dialog */}
      <Dialog open={showEditVar.open} onClose={()=>setShowEditVar({ open:false, devId:null, variationId:null })} maxWidth="sm" fullWidth>
        <DialogTitle>Edit unit type</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <TextField fullWidth label="Label" value={editVarLabel} onChange={(e)=>setEditVarLabel(e.target.value)} />
            </Grid>
            {(() => {
              const dev = developments.find(d => d.id === showEditVar.devId);
              if (dev?.type === 'stands') {
                return (
                  <Grid item xs={12}>
                    <TextField fullWidth type="number" label="Size (sqm)" value={editVarSizeSqm || ''} onChange={(e)=>setEditVarSizeSqm(Number(e.target.value)||0)} />
                  </Grid>
                );
              }
              return (
                <Grid item xs={12}>
                  <TextField fullWidth type="number" label="Price per unit" value={editVarPrice || ''} onChange={(e)=>setEditVarPrice(Number(e.target.value)||0)} />
                </Grid>
              );
            })()}
            <Grid item xs={12}>
              <TextField fullWidth type="number" label="Add units (optional)" value={editVarAddUnits || 0} onChange={(e)=>setEditVarAddUnits(Math.max(0, Number(e.target.value)||0))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setShowEditVar({ open:false, devId:null, variationId:null })} disabled={savingEditVar}>Cancel</Button>
          <Button variant="contained" disabled={savingEditVar || !showEditVar.devId || !showEditVar.variationId} onClick={async ()=>{
            if (!showEditVar.devId || !showEditVar.variationId) return;
            try {
              setSavingEditVar(true);
              const dev = developments.find(d => d.id === showEditVar.devId)!;
              const body: any = { label: editVarLabel.trim() || undefined };
              if (dev.type === 'stands') body.size = editVarSizeSqm || 0; else body.price = editVarPrice || 0;
              if (editVarAddUnits > 0) body.addUnits = editVarAddUnits;
              const updated = await developmentService.updateVariation(showEditVar.devId, showEditVar.variationId, body);
              const mapped = {
                id: updated._id || updated.id,
                name: updated.name,
                type: updated.type,
                description: updated.description,
                collaborators: Array.isArray(updated.collaborators) ? updated.collaborators.map((x: any)=> String(x)) : [],
                createdBy: updated.createdBy ? String(updated.createdBy) : undefined,
                isUnitCollaborator: (developments.find(d=>d.id=== (updated._id||updated.id)) as any)?.isUnitCollaborator || false,
                ownerFirstName: updated.owner?.firstName,
                ownerLastName: updated.owner?.lastName,
                ownerCompanyName: updated.owner?.companyName,
                ownerEmail: updated.owner?.email,
                ownerIdNumber: updated.owner?.idNumber,
                ownerPhone: updated.owner?.phone,
                variations: (updated.variations || []).map((v: any) => ({ id: v.id, label: v.label, count: v.count, price: v.price, sizeSqm: updated.type==='stands' ? v.size : undefined })),
                units: developments.find(d=>d.id=== (updated._id||updated.id))?.units || [],
                createdAt: updated.createdAt
              } as Development;
              setDevelopments(prev => prev.map(d => d.id === mapped.id ? mapped : d));
              setShowEditVar({ open:false, devId:null, variationId:null });
            } catch (e) {
            } finally {
              setSavingEditVar(false);
            }
          }}>{savingEditVar ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      {/* Collaborators Dialog */}
      <Dialog open={showCollab.open} onClose={()=>setShowCollab({ open:false, devId: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Manage Collaborators</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Add another agent's user ID to share this development. They will see units and can add buyers.
          </Typography>
          <TextField fullWidth label="Search sales users" value={salesSearch} onChange={(e)=>setSalesSearch(e.target.value)} sx={{ mb: 2 }} />
          {showCollab.devId && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">Current collaborators:</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                {(developments.find(d=>d.id===showCollab.devId)?.collaborators || []).map(cid => {
                  const u = salesUsers.find(s=> String(s._id||s.id) === String(cid));
                  const label = u ? `${u.firstName||''} ${u.lastName||''}`.trim() || u.email : cid;
                  return <Chip key={cid} label={label} size="small" />;
                })}
                {((developments.find(d=>d.id===showCollab.devId)?.collaborators || []).length === 0) && (
                  <Typography variant="caption" color="text.secondary">None</Typography>
                )}
              </Box>
            </Box>
          )}
          <TextField select fullWidth label="Select Sales User" value={collabUserId} onChange={(e)=>setCollabUserId(e.target.value)}>
            <MenuItem value="">None</MenuItem>
            {salesUsers
              .filter(u => {
                const q = salesSearch.trim().toLowerCase();
                if (!q) return true;
                const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
                return name.includes(q) || String(u.email||'').toLowerCase().includes(q);
              })
              .map(u => (
                <MenuItem key={u._id || u.id} value={u._id || u.id}>
                  {`${u.firstName || ''} ${u.lastName || ''}`.trim()} — {u.email}
                </MenuItem>
              ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setShowCollab({ open:false, devId: null })}>Close</Button>
          <Button variant="contained" onClick={async ()=>{
            if (!showCollab.devId || !collabUserId.trim()) return;
            try {
              await developmentService.addCollaborator(showCollab.devId, collabUserId.trim());
              const items = await developmentService.list();
              setDevelopments((items || []).map((d:any)=>({
                id: d._id, name: d.name, type: d.type, description: d.description,
                collaborators: Array.isArray(d.collaborators)? d.collaborators.map((x:any)=>String(x)) : [],
                createdBy: d.createdBy ? String(d.createdBy) : undefined,
                isUnitCollaborator: !!d.isUnitCollaborator,
                ownerFirstName: d.owner?.firstName, ownerLastName: d.owner?.lastName, ownerCompanyName: d.owner?.companyName,
                ownerEmail: d.owner?.email, ownerIdNumber: d.owner?.idNumber, ownerPhone: d.owner?.phone,
                variations: (d.variations||[]).map((v:any)=>({ id:v.id, label:v.label, count:v.count, price:v.price, sizeSqm:d.type==='stands'?v.size:undefined })),
                units: [], createdAt: d.createdAt
              })));
              setCollabUserId('');
            } catch (e) {}
          }}>Add</Button>
          <Button variant="outlined" color="error" onClick={async ()=>{
            if (!showCollab.devId || !collabUserId.trim()) return;
            try {
              await developmentService.removeCollaborator(showCollab.devId, collabUserId.trim());
              const items = await developmentService.list();
              setDevelopments((items || []).map((d:any)=>({
                id: d._id, name: d.name, type: d.type, description: d.description,
                collaborators: Array.isArray(d.collaborators)? d.collaborators.map((x:any)=>String(x)) : [],
                createdBy: d.createdBy ? String(d.createdBy) : undefined,
                isUnitCollaborator: !!d.isUnitCollaborator,
                ownerFirstName: d.owner?.firstName, ownerLastName: d.owner?.lastName, ownerCompanyName: d.owner?.companyName,
                ownerEmail: d.owner?.email, ownerIdNumber: d.owner?.idNumber, ownerPhone: d.owner?.phone,
                variations: (d.variations||[]).map((v:any)=>({ id:v.id, label:v.label, count:v.count, price:v.price, sizeSqm:d.type==='stands'?v.size:undefined })),
                units: [], createdAt: d.createdAt
              })));
              setCollabUserId('');
            } catch (e) {}
          }}>Remove</Button>
        </DialogActions>
      </Dialog>

      {/* Set commission structure (advanced) */}
      <Dialog open={showCommissionDialog.open} onClose={() => setShowCommissionDialog({ open: false, devId: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Set commission structure</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Commission can be configured once sales begin. These apply to all units in this development.
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Commission %"
                value={commissionDialogForm.commissionPercent}
                onChange={(e) => setCommissionDialogForm(prev => ({ ...prev, commissionPercent: Math.max(0, Number(e.target.value) || 0) }))}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
                helperText="Applies to total sale price"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="PREA % of Commission"
                value={commissionDialogForm.commissionPreaPercent}
                onChange={(e) => setCommissionDialogForm(prev => ({ ...prev, commissionPreaPercent: Math.max(0, Number(e.target.value) || 0) }))}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Agency % of Remaining"
                value={commissionDialogForm.commissionAgencyPercentRemaining}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setCommissionDialogForm(prev => ({ ...prev, commissionAgencyPercentRemaining: v, commissionAgentPercentRemaining: Number((100 - v).toFixed(2)) }));
                }}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Agent % of Remaining"
                value={commissionDialogForm.commissionAgentPercentRemaining}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Collaborator agent split</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Owner's % of Agent Share (when collaborator sells)"
                value={commissionDialogForm.collabOwnerAgentPercent}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setCommissionDialogForm(prev => ({ ...prev, collabOwnerAgentPercent: v, collabCollaboratorAgentPercent: Number((100 - v).toFixed(2)) }));
                }}
                inputProps={{ min: 0, max: 100, step: 1 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Collaborator's % of Agent Share"
                value={commissionDialogForm.collabCollaboratorAgentPercent}
                InputProps={{ readOnly: true }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCommissionDialog({ open: false, devId: null })} disabled={commissionDialogSaving}>Cancel</Button>
          <Button
            variant="contained"
            disabled={commissionDialogSaving || !showCommissionDialog.devId}
            onClick={async () => {
              if (!showCommissionDialog.devId) return;
              try {
                setCommissionDialogSaving(true);
                const updated = await developmentService.update(showCommissionDialog.devId, {
                  commissionPercent: commissionDialogForm.commissionPercent,
                  commissionPreaPercent: commissionDialogForm.commissionPreaPercent,
                  commissionAgencyPercentRemaining: commissionDialogForm.commissionAgencyPercentRemaining,
                  commissionAgentPercentRemaining: commissionDialogForm.commissionAgentPercentRemaining,
                  collabOwnerAgentPercent: commissionDialogForm.collabOwnerAgentPercent,
                  collabCollaboratorAgentPercent: commissionDialogForm.collabCollaboratorAgentPercent
                });
                const u = updated as any;
                updateDevelopment(showCommissionDialog.devId, {
                  commissionPercent: u.commissionPercent,
                  commissionPreaPercent: u.commissionPreaPercent,
                  commissionAgencyPercentRemaining: u.commissionAgencyPercentRemaining,
                  commissionAgentPercentRemaining: u.commissionAgentPercentRemaining,
                  collabOwnerAgentPercent: u.collabOwnerAgentPercent,
                  collabCollaboratorAgentPercent: u.collabCollaboratorAgentPercent
                });
                setShowCommissionDialog({ open: false, devId: null });
                addNotification({ id: uid(), title: 'Commission updated', message: 'Commission structure saved for this development.', read: false, createdAt: new Date() });
              } catch (e: any) {
                addNotification({ id: uid(), title: 'Error', message: e?.response?.data?.message || 'Failed to save commission', read: false, createdAt: new Date() });
              } finally {
                setCommissionDialogSaving(false);
              }
            }}
          >
            {commissionDialogSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Buyer Dialog */}
      <Dialog open={showAddBuyer} onClose={() => setShowAddBuyer(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Buyer</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <Autocomplete
                options={buyerPickerOptions || []}
                loading={buyerPickerLoading}
                value={(buyerPickerOptions || []).find((b: any) => String(b?._id || b?.id || '') === String(buyerPickerId)) || null}
                onChange={(_, next: any | null) => {
                  const nextId = next ? String(next._id || next.id || '') : '';
                  setBuyerPickerId(nextId);
                  if (next) {
                    setBuyerName(String(next.name || ''));
                    setBuyerPhone(String(next.phone || ''));
                    setBuyerEmail(String(next.email || ''));
                    setBuyerIdNumber(String(next.idNumber || ''));
                  }
                }}
                getOptionLabel={(b: any) => {
                  const name = String(b?.name || '').trim();
                  const email = String(b?.email || '').trim();
                  const phone = String(b?.phone || '').trim();
                  return [name, email ? `(${email})` : '', phone ? `• ${phone}` : ''].filter(Boolean).join(' ');
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Pick existing buyer (optional)"
                    placeholder="Search your buyers…"
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Name" value={buyerName} onChange={(e)=>setBuyerName(e.target.value)} autoFocus />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Phone" value={buyerPhone} onChange={(e)=>setBuyerPhone(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Email" type="email" value={buyerEmail} onChange={(e)=>setBuyerEmail(e.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="ID Number" value={buyerIdNumber} onChange={(e)=>setBuyerIdNumber(e.target.value)} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setShowAddBuyer(false)} disabled={buyerSaving}>Cancel</Button>
          <Button variant="contained" onClick={submitAddBuyer} disabled={!buyerName.trim() || buyerSaving}>Save Buyer</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Unit Dialog */}
      <Dialog open={showEditUnit.open} onClose={()=> setShowEditUnit({ open:false, devId:null, unitId:null })} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Unit</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <TextField fullWidth label="Unit name/code" value={editUnitCode} onChange={(e)=>setEditUnitCode(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth type="number" label="Unit price (optional)" value={editUnitPrice} onChange={(e)=>setEditUnitPrice(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Block" value={editUnitBlock} onChange={(e)=>setEditUnitBlock(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Floor" value={editUnitFloor} onChange={(e)=>setEditUnitFloor(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth type="number" label="Stand size (sqm)" value={editUnitStandSize} onChange={(e)=>setEditUnitStandSize(e.target.value)} />
            </Grid>
          </Grid>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Unit Collaborators</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            {(() => {
              const dev = developments.find(d=>d.id===showEditUnit.devId);
              const unit = dev?.units.find(u=>u.id===showEditUnit.unitId);
              const ids = unit?.collaborators || [];
              if (!ids.length) return <Typography variant="caption" color="text.secondary">None</Typography>;
              return ids.map(cid => {
                const u = salesUsers.find(s=> String(s._id||s.id) === String(cid));
                const label = u ? `${u.firstName||''} ${u.lastName||''}`.trim() || u.email : cid;
                return <Chip key={cid} label={label} size="small" />;
              });
            })()}
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField select fullWidth label="Select Sales User" value={unitCollabUserId} onChange={(e)=>setUnitCollabUserId(e.target.value)}>
                <MenuItem value="">None</MenuItem>
                {salesUsers
                  .filter(u => {
                    const q = salesSearch.trim().toLowerCase();
                    if (!q) return true;
                    const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
                    return name.includes(q) || String(u.email||'').toLowerCase().includes(q);
                  })
                  .map(u => (
                    <MenuItem key={u._id || u.id} value={u._id || u.id}>
                      {`${u.firstName || ''} ${u.lastName || ''}`.trim()} — {u.email}
                    </MenuItem>
                  ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setShowEditUnit({ open:false, devId:null, unitId:null })} disabled={savingUnit}>Close</Button>
          {(user?.role === 'admin' || user?.role === 'accountant' || (showEditUnit.devId && developments.find(d=>d.id===showEditUnit.devId)?.createdBy === user?._id)) && (
          <Button variant="outlined" disabled={savingUnit || !showEditUnit.unitId || !unitCollabUserId.trim()} onClick={async ()=>{
            if (!showEditUnit.unitId) return;
            try {
              setSavingUnit(true);
              const updated = await developmentUnitService.addCollaborator(showEditUnit.unitId, unitCollabUserId.trim());
              // Update local state
              setDevelopments(prev => prev.map(d => {
                if (d.id !== showEditUnit.devId) return d;
                return { ...d, units: d.units.map(u => u.id === showEditUnit.unitId ? { ...u, collaborators: Array.isArray(updated?.collaborators) ? updated.collaborators.map((x:any)=>String(x)) : u.collaborators } : u) };
              }));
              setUnitCollabUserId('');
            } catch {}
            finally { setSavingUnit(false); }
          }}>Add Collaborator</Button>
          )}
          {(user?.role === 'admin' || user?.role === 'accountant' || (showEditUnit.devId && developments.find(d=>d.id===showEditUnit.devId)?.createdBy === user?._id)) && (
          <Button variant="outlined" color="error" disabled={savingUnit || !showEditUnit.unitId || !unitCollabUserId.trim()} onClick={async ()=>{
            if (!showEditUnit.unitId) return;
            try {
              setSavingUnit(true);
              const updated = await developmentUnitService.removeCollaborator(showEditUnit.unitId, unitCollabUserId.trim());
              setDevelopments(prev => prev.map(d => {
                if (d.id !== showEditUnit.devId) return d;
                return { ...d, units: d.units.map(u => u.id === showEditUnit.unitId ? { ...u, collaborators: Array.isArray(updated?.collaborators) ? updated.collaborators.map((x:any)=>String(x)) : u.collaborators } : u) };
              }));
              setUnitCollabUserId('');
            } catch {}
            finally { setSavingUnit(false); }
          }}>Remove Collaborator</Button>
          )}
          <Button variant="contained" disabled={savingUnit || !showEditUnit.unitId} onClick={async ()=>{
            if (!showEditUnit.unitId || !showEditUnit.devId) return;
            try {
              setSavingUnit(true);
              const body: any = {};
              body.unitCode = (editUnitCode || '').trim();
              if (editUnitPrice.trim().length>0) body.price = Number(editUnitPrice);
              body.meta = {} as any;
              if (editUnitBlock.trim()) body.meta.block = editUnitBlock.trim();
              if (editUnitFloor.trim()) body.meta.floor = editUnitFloor.trim();
              if (editUnitStandSize.trim()) body.meta.standSize = Number(editUnitStandSize);
              const updated = await developmentUnitService.updateDetails(showEditUnit.unitId, body);
              // Update local state
              setDevelopments(prev => prev.map(d => {
                if (d.id !== showEditUnit.devId) return d;
                return { ...d, units: d.units.map(u => u.id === showEditUnit.unitId ? { ...u, label: String(updated?.unitCode||''), price: typeof updated?.price==='number' ? Number(updated?.price) : u.price } : u) };
              }));
              setShowEditUnit({ open:false, devId:null, unitId:null });
            } catch {}
            finally { setSavingUnit(false); }
          }}>{savingUnit ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
        </div>
      </div>
    </div>
  );
};

export default SalesDevelopmentsPage;


