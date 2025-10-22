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
  TablePagination
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Print as PrintIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { buyerService } from '../../services/buyerService';
import { developmentService } from '../../services/developmentService';
import api from '../../api/axios';
import { developmentUnitService } from '../../services/developmentUnitService';
import paymentService from '../../services/paymentService';
import { Payment } from '../../types/payment';

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
}

interface DevelopmentUnit {
  id: string;
  variationId: string;
  label: string; // derived from variation
  status: UnitStatus;
  buyerName?: string;
  externalSale?: boolean; // sold outside system
  unitNumber?: number; // sequential number within its variation
}

interface Development {
  id: string;
  name: string;
  type: DevelopmentType;
  description?: string;
  collaborators?: string[];
  // Owner details (optional)
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerCompanyName?: string;
  ownerEmail?: string;
  ownerIdNumber?: string;
  ownerPhone?: string;
  variations: UnitVariation[];
  units: DevelopmentUnit[];
  createdAt: string;
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
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<DevelopmentType>('stands');
  const [description, setDescription] = useState('');
  const [devAddress, setDevAddress] = useState('');
  const [variations, setVariations] = useState<UnitVariation[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
  const [preaPercentOfCommission, setPreaPercentOfCommission] = useState<number>(3);
  const [agencyPercent, setAgencyPercent] = useState<number>(50);
  const [agentPercent, setAgentPercent] = useState<number>(50);

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
    };
    loadDevs();
  }, []);

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

  const addVariation = () => setVariations(prev => [...prev, { id: uid(), label: '', count: 1 }]);
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
        variations: validVariations.map(v => ({
          id: v.id,
          label: v.label,
          count: v.count,
          price: type === 'stands' ? Math.max(0, (v.sizeSqm || 0) * (v.pricePerSqm || 0)) : (v.price || 0),
          size: type === 'stands' ? (v.sizeSqm || 0) : undefined
        })),
        commissionPercent,
        commissionPreaPercent: preaPercentOfCommission,
        commissionAgencyPercentRemaining: agencyPercent,
        commissionAgentPercentRemaining: agentPercent
      });

      // Map server response to local Development shape
      const mapped: Development = {
        id: created._id || created.id,
        name: created.name,
        type: created.type,
        description: created.description,
        collaborators: Array.isArray(created.collaborators) ? created.collaborators.map((x: any)=> String(x)) : [],
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
    } catch (e) {
      // Optionally surface error via snackbar/toast
    } finally {
      setCreating(false);
    }
  };

  const updateDevelopment = (id: string, patch: Partial<Development>) => {
    setDevelopments(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const removeDevelopment = (id: string) => {
    setDevelopments(prev => prev.filter(d => d.id !== id));
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
    setBuyerName('');
    setBuyerPhone('');
    setBuyerIdNumber('');
    setBuyerEmail('');
    setShowAddBuyer(true);
  };

  const submitAddBuyer = async () => {
    if (!buyerName.trim()) return;
    try {
      setBuyerSaving(true);
      const created = await buyerService.create({
        name: buyerName.trim(),
        phone: buyerPhone.trim() || undefined,
        email: buyerEmail.trim() || undefined,
        idNumber: buyerIdNumber.trim() || undefined,
        developmentId: buyerDevId,
        developmentUnitId: buyerUnitId
      });
      const displayName = created?.name || buyerName.trim();
      updateUnit(buyerDevId, buyerUnitId, { buyerName: displayName });
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
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setShowCreate(true)}>Add Development</Button>
      </Box>

      <Grid container spacing={2}>
        {developments.map((dev) => {
          const statusCounts = dev.units.reduce((acc, u) => { acc[u.status] = (acc[u.status] || 0) + 1; return acc; }, {} as Record<UnitStatus, number>);
          const isOpen = !!expanded[dev.id];
          return (
            <Grid item xs={12} key={dev.id}>
              <Paper variant="outlined" sx={{ p: 2 }}>
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
                          buyerName: u.buyerName,
                          unitNumber: typeof u.unitNumber === 'number' ? u.unitNumber : undefined
                        }));
                        updateDevelopment(dev.id, { units: mappedUnits });
                        // For each unit, load its buyers filtered by development and unit
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
                            buyerName: buyersByUnit[String(unit.id)] || unit.buyerName,
                            unitNumber: typeof unit.unitNumber === 'number' ? unit.unitNumber : undefined
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
                    <Typography variant="h6">{dev.name} • {dev.type.toUpperCase()}</Typography>
                    {dev.description && <Typography variant="body2" color="text.secondary">{dev.description}</Typography>}
                    <Typography variant="caption" color="text.secondary">Collaborators: {dev.collaborators?.length || 0}</Typography>
                  </Box>
                  {isOpen && (
                    <Box display="flex" gap={1}>
                      <Button size="small" startIcon={<FileDownloadIcon />} onClick={(e) => { e.stopPropagation(); exportUnitsCsv(dev); }}>Export CSV</Button>
                      <Button size="small" onClick={(e)=>{ e.stopPropagation(); setShowCollab({ open: true, devId: dev.id }); }}>Collaborators</Button>
                      <Button size="small" startIcon={<DeleteIcon />} color="error" onClick={(e) => { e.stopPropagation(); removeDevelopment(dev.id); }}>Delete</Button>
                    </Box>
                  )}
                </Box>

                {isOpen && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    {/* Variations list */}
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Variations</Typography>
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        {dev.variations.map(v => (
                          <Chip key={v.id} label={`${v.label} • ${v.count} units${typeof v.price === 'number' ? ` • ${v.price.toLocaleString()}` : ''}${dev.type==='stands' && typeof v.sizeSqm === 'number' ? ` • ${v.sizeSqm} sqm` : ''}`} />
                        ))}
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
                          <TableCell>Variation</TableCell>
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
                        })().map(u => {
                          const variation = dev.variations.find(v => v.id === u.variationId);
                          const total = computeUnitPrice(dev, u, variation);
                          return (
                            <React.Fragment key={u.id}>
                            <TableRow
                              hover
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
                                typeof u.unitNumber === 'number'
                                  ? u.unitNumber
                                  : (dev.units.filter(x => x.variationId === u.variationId).findIndex(x => x.id === u.id) + 1)
                              }</TableCell>
                              <TableCell>{variation?.label}</TableCell>
                              <TableCell>
                                <TextField select size="small" value={u.status} onChange={async (e) => {
                                  const next = e.target.value as UnitStatus;
                                  updateUnit(dev.id, u.id, { status: next });
                                  try {
                                    await developmentUnitService.updateStatus(u.id, { to: next });
                                  } catch {}
                                }}>
                                  <MenuItem value="available">Available</MenuItem>
                                  <MenuItem value="under_offer">Under Offer</MenuItem>
                                  <MenuItem value="sold">Sold</MenuItem>
                                </TextField>
                              </TableCell>
                              <TableCell>
                                {u.buyerName && u.buyerName.trim().length > 0 ? (
                                  <Chip label={u.buyerName} size="small" />
                                ) : (
                                  <Typography variant="body2" color="text.secondary">No buyer</Typography>
                                )}
                              </TableCell>
                              <TableCell align="right">{total.toLocaleString()}</TableCell>
                              
                              <TableCell>
                                <Button size="small" startIcon={<AddIcon />} onClick={(e) => { e.stopPropagation(); openAddBuyer(dev.id, u.id); }}>Add Buyer</Button>
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
                                      const totalSale = parsedTotals.length > 0 ? parsedTotals[0] : undefined;
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
        {/* Commission section (applies across all variations/units) */}
        <Box sx={{ mb: 2 }}>
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
                <Grid item xs={6} sm={2}><TextField fullWidth size="small" type="number" label="Units" inputProps={{ min: 1 }} value={v.count} onChange={(e)=>updateVariation(v.id, { count: Math.max(1, Number(e.target.value)||1) })} /></Grid>
                {type === 'stands' ? (
                  <>
                    <Grid item xs={6} sm={2}><TextField fullWidth size="small" type="number" label="Size (sqm)" value={v.sizeSqm || ''} onChange={(e)=>updateVariation(v.id, { sizeSqm: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={6} sm={2}><TextField fullWidth size="small" type="number" label="Price / sqm" value={v.pricePerSqm || ''} onChange={(e)=>updateVariation(v.id, { pricePerSqm: Number(e.target.value)||0 })} /></Grid>
                    <Grid item xs={6} sm={2}><TextField fullWidth size="small" label="Example Total" value={((v.sizeSqm||0)*(v.pricePerSqm||0)).toLocaleString()} InputProps={{ readOnly: true }} /></Grid>
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

      {/* Add Buyer Dialog */}
      <Dialog open={showAddBuyer} onClose={() => setShowAddBuyer(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Buyer</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0 }}>
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
    </Box>
        </div>
      </div>
    </div>
  );
};

export default SalesDevelopmentsPage;


