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
  FormGroup
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Print as PrintIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { buyerService } from '../../services/buyerService';
import { developmentService } from '../../services/developmentService';
import { developmentUnitService } from '../../services/developmentUnitService';

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
  const [variations, setVariations] = useState<UnitVariation[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    const loadDevs = async () => {
      try {
        const items = await developmentService.list();
        const mapped: Development[] = (items || []).map((d: any) => ({
          id: d._id,
          name: d.name,
          type: d.type,
          description: d.description,
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
        }))
      });

      // Map server response to local Development shape
      const mapped: Development = {
        id: created._id || created.id,
        name: created.name,
        type: created.type,
        description: created.description,
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
      // Store ID number in prefs temporarily until backend supports idNumber
      const created = await buyerService.create({
        name: buyerName.trim(),
        phone: buyerPhone.trim() || undefined,
        email: buyerEmail.trim() || undefined,
        idNumber: buyerIdNumber.trim() || undefined
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

  const printUnit = (dev: Development, unit: DevelopmentUnit) => {
    const variation = dev.variations.find(v => v.id === unit.variationId);
    const total = computeUnitPrice(dev, unit, variation);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${dev.name} - ${unit.label}</title></head><body>` +
      `<h2>${dev.name} • ${dev.type.toUpperCase()}</h2>` +
      `<h3>Unit: ${unit.label}</h3>` +
      `<p>Status: ${unit.status}</p>` +
      `<p>Buyer: ${unit.buyerName || '-'}</p>` +
      `<p>Total Price: ${total.toLocaleString()}</p>` +
      `</body></html>`);
    w.document.close();
    w.print();
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
                  onClick={() => setExpanded(prev => ({ ...prev, [dev.id]: !prev[dev.id] }))}
                  sx={{ cursor: 'pointer' }}
                  role="button"
                  aria-expanded={isOpen}
                >
                  <Box>
                    <Typography variant="h6">{dev.name} • {dev.type.toUpperCase()}</Typography>
                    {dev.description && <Typography variant="body2" color="text.secondary">{dev.description}</Typography>}
                  </Box>
                  {isOpen && (
                    <Box display="flex" gap={1}>
                      <Button size="small" startIcon={<FileDownloadIcon />} onClick={(e) => { e.stopPropagation(); exportUnitsCsv(dev); }}>Export CSV</Button>
                      <Button size="small" startIcon={<DeleteIcon />} color="error" onClick={(e) => { e.stopPropagation(); removeDevelopment(dev.id); }}>Delete</Button>
                    </Box>
                  )}
                </Box>

                {isOpen && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                      <Chip label={`Available: ${statusCounts['available'] || 0}`} />
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
                        {dev.units.map(u => {
                          const variation = dev.variations.find(v => v.id === u.variationId);
                          const total = computeUnitPrice(dev, u, variation);
                          return (
                            <TableRow key={u.id}>
                              <TableCell>{
                                typeof u.unitNumber === 'number'
                                  ? u.unitNumber
                                  : (dev.units.filter(x => x.variationId === u.variationId).findIndex(x => x.id === u.id) + 1)
                              }</TableCell>
                              <TableCell>{variation?.label}</TableCell>
                              <TableCell>
                                <TextField select size="small" value={u.status} onChange={(e) => updateUnit(dev.id, u.id, { status: e.target.value as UnitStatus })}>
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
                                <Button size="small" startIcon={<AddIcon />} onClick={() => openAddBuyer(dev.id, u.id)}>Add Buyer</Button>
                                <IconButton size="small" onClick={() => printUnit(dev, u)} title="Print">
                                  <PrintIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

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
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={2} label="Description" value={description} onChange={(e)=>setDescription(e.target.value)} />
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
                <Grid item xs={12} sm={4}><TextField fullWidth size="small" label={type==='stands'? 'Size label (e.g. 500 sqm)' : 'Variation label (e.g. 3 bed / 2 bath)'} value={v.label} onChange={(e)=>updateVariation(v.id, { label: e.target.value })} /></Grid>
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


