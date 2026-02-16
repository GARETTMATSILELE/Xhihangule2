import React from 'react';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { usePropertyService } from '../../services/propertyService';
import { usePropertyOwnerService } from '../../services/propertyOwnerService';
import valuationsService from '../../services/valuationsService';
import { buyerService } from '../../services/buyerService';
import { useCompany } from '../../contexts/CompanyContext';
import { useProperties } from '../../contexts/PropertyContext';
import type { PropertyStatus } from '../../types/property';

const cls = (...s: any[]) => s.filter(Boolean).join(' ');

const Card = ({ className = '', children }: any) => (
  <div className={cls('rounded-2xl shadow-sm border border-slate-200 bg-white', className)}>{children}</div>
);
const CardHeader = ({ className = '', children }: any) => (
  <div className={cls('p-4 border-b bg-gradient-to-b from-gray-50 to-white rounded-t-2xl', className)}>{children}</div>
);
const CardTitle = ({ children, className = '' }: any) => (
  <h3 className={cls('text-lg font-semibold', className)}>{children}</h3>
);
const CardContent = ({ className = '', children }: any) => (
  <div className={cls('p-4', className)}>{children}</div>
);
const Input = (props: any) => (
  <input {...props} className={cls('w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring', props.className)} />
);
const Textarea = (props: any) => (
  <textarea {...props} className={cls('w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring', props.className)} />
);

const propertyColors = {
  Available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Under Offer": "bg-amber-50 text-amber-700 border-amber-200",
  Sold: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function PropertiesPage() {
  const propertyService = usePropertyService();
  const propertyOwnerService = usePropertyOwnerService();
  const { company } = useCompany();
  const { properties, loading: propertiesLoading, error: propertiesError, refreshProperties } = useProperties();
  const [owners, setOwners] = React.useState<any[]>([]);
  const [buyers, setBuyers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>('');
  const [editing, setEditing] = React.useState<any | null>(null);
  const [form, setForm] = React.useState<any>({
    title: '',
    address: '',
    type: 'house',
    price: '',
    bedrooms: 3,
    bathrooms: 2,
    status: 'Available',
    ownerId: '',
    buyerId: '',
    notes: '',
    builtArea: '',
    landArea: '',
    saleType: 'cash',
    commission: 5,
    commissionPreaPercent: 3,
    commissionAgencyPercentRemaining: 50,
    commissionAgentPercentRemaining: 50,
    images: [],
  });
  const [createForm, setCreateForm] = React.useState<any>({ name: '', address: '', type: 'house', price: '', bedrooms: '', bathrooms: '', description: '', landArea: '', pricePerSqm: '', propertyOwnerId: '' });
  const [showCreateModal, setShowCreateModal] = React.useState<boolean>(false);
  const [valuations, setValuations] = React.useState<any[]>([]);
  const [pickedValuationId, setPickedValuationId] = React.useState<string>('');
  const ownersLoadedForCompanyRef = React.useRef<string | null>(null);

  const loadOwners = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const ownerRes = await propertyOwnerService.getAll();
      setOwners(Array.isArray(ownerRes?.owners) ? ownerRes.owners : (Array.isArray(ownerRes) ? ownerRes : []));
    } catch (e: any) {
      setOwners([]);
      setError(e?.message || 'Failed to load owners');
    } finally {
      setLoading(false);
    }
  }, [propertyOwnerService]);

  React.useEffect(() => {
    // Prevent repeated owner reloads from render-time service identity changes.
    const key = company?._id || '__no_company__';
    if (ownersLoadedForCompanyRef.current === key) return;
    ownersLoadedForCompanyRef.current = key;
    loadOwners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?._id]);

  // Load buyers list for picker
  React.useEffect(() => {
    let cancelled = false;
    const loadBuyers = async () => {
      try {
        const res = await buyerService.list().catch(() => []);
        const list = Array.isArray(res) ? res : Array.isArray((res as any)?.data) ? (res as any).data : [];
        if (!cancelled) setBuyers(list);
      } catch {
        if (!cancelled) setBuyers([]);
      }
    };
    loadBuyers();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const loadVals = async () => {
      try {
        if (!editing || !company?._id) return;
        const vals = await valuationsService.listByCompany(company._id);
        if (!cancelled) setValuations(Array.isArray(vals) ? vals : []);
      } catch {}
    };
    loadVals();
    return () => { cancelled = true; };
  }, [editing, company?._id]);

  const filtered = (items: any[], fields: string[]) => items.filter(it => {
    if (!query) return true;
    const hay = fields.map(f => String(it[f] ?? "")).join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const startEdit = (p: any) => {
    setEditing(p);
    setPickedValuationId('');
    const fallbackBuyer = (buyers || []).find((b: any) => String(b?.propertyId || '') === String(p?._id || ''));
    setForm({
      title: p.name || '',
      address: p.address || '',
      type: p.type || 'house',
      price: p.price ?? '',
      bedrooms: p.bedrooms ?? 3,
      bathrooms: p.bathrooms ?? 2,
      status: (p.status === 'under_offer' ? 'Under Offer' : (p.status === 'sold' ? 'Sold' : 'Available')),
      ownerId: (p as any).propertyOwnerId || '',
      buyerId: (p as any).buyerId || (fallbackBuyer?._id || ''),
      notes: p.description || '',
      builtArea: p.builtArea || '',
      landArea: p.landArea || '',
      saleType: p.saleType || 'cash',
      commission: p.commission ?? 5,
      commissionPreaPercent: p.commissionPreaPercent ?? 3,
      commissionAgencyPercentRemaining: p.commissionAgencyPercentRemaining ?? 50,
      commissionAgentPercentRemaining: p.commissionAgentPercentRemaining ?? 50,
      images: Array.isArray((p as any)?.images) ? (p as any).images : [],
    });
  };
  const saveEdit = async () => {
    if (!editing?._id) return;
    try {
      setLoading(true);
      const payload: any = {
        name: form.title,
        address: form.address,
        price: Number(form.price || 0),
        bedrooms: Number(form.bedrooms || 0),
        bathrooms: Number(form.bathrooms || 0),
        description: form.notes || '',
        status: String(form.status || 'Available').toLowerCase().replace(' ', '_'),
        builtArea: Number(form.builtArea || 0),
        landArea: Number(form.landArea || 0),
        saleType: form.saleType || 'cash',
        commission: Number(form.commission || 0),
        commissionPreaPercent: Number(form.commissionPreaPercent || 3),
        commissionAgencyPercentRemaining: Number(form.commissionAgencyPercentRemaining || 50),
        commissionAgentPercentRemaining: Number(form.commissionAgentPercentRemaining || 50),
        images: Array.isArray(form.images) ? (form.images as any[]).filter((u: any)=> String(u||'').trim() !== '') : [],
      };
      if (form.ownerId) payload.propertyOwnerId = form.ownerId;
      // buyerId: allow clearing by sending null
      payload.buyerId = form.buyerId ? form.buyerId : null;
      await propertyService.updateProperty(editing._id, payload);
      setEditing(null);
      await refreshProperties();
      await loadOwners();
    } catch(e:any){ setError(e?.message||'Failed to update'); } finally { setLoading(false);} };
  const createProperty = async () => {
    if (!createForm.name?.trim() || !createForm.address?.trim()) { setError('Name and address are required'); return; }
    try {
      setLoading(true); setError(null);
      const isLand = createForm.type === 'land';
      const computedPrice = isLand ? Number(createForm.landArea||0) * Number(createForm.pricePerSqm||0) : Number(createForm.price||0);
      await propertyService.createPropertySales({
        ...createForm,
        price: computedPrice,
        landArea: isLand ? Number(createForm.landArea||0) : Number(createForm.landArea||0),
        bedrooms: isLand ? 0 : Number(createForm.bedrooms||0),
        bathrooms: isLand ? 0 : Number(createForm.bathrooms||0),
        propertyOwnerId: createForm.propertyOwnerId || undefined
      });
      setCreateForm({ name: '', address: '', type: 'house', price: '', bedrooms: '', bathrooms: '', description: '', landArea: '', pricePerSqm: '', propertyOwnerId: '' });
      await refreshProperties();
      await loadOwners();
      setShowCreateModal(false);
    } catch(e:any){ setError(e?.message||'Failed to create'); } finally { setLoading(false);} };
  const deleteProperty = async (id: string) => { if (!id) return; if (!window.confirm('Delete this property?')) return; try { setLoading(true); await propertyService.deleteProperty(id); await refreshProperties(); } catch(e:any){ setError(e?.message||'Failed to delete'); } finally { setLoading(false);} };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
        <div className="flex-1 max-w-6xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Properties</h1>
            <div className="w-full max-w-sm"><Input placeholder="Search properties" value={query} onChange={(e:any)=>setQuery(e.target.value)} /></div>
          </div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Properties</CardTitle>
                <a className="px-3 py-2 rounded-xl border bg-slate-900 text-white hover:bg-slate-800" href="/sales-dashboard?add=property">+ Property</a>
              </div>
            </CardHeader>
            <CardContent>
              {error && <div className="text-sm text-rose-600 mb-2">{error}</div>}
              {propertiesError && <div className="text-sm text-rose-600 mb-2">{propertiesError}</div>}
              {/* Create handled by main Sales Dashboard modal */}

              {(loading || propertiesLoading) ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-600">
                        <th className="py-2">Name</th>
                        <th className="py-2">Address</th>
                        <th className="py-2">Type</th>
                        <th className="py-2">Price</th>
                        <th className="py-2">Beds/Baths</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered(properties, ['name','address','type','description']).map(p => (
                        <tr key={p._id} className="border-t">
                          <td className="py-2 font-medium">{p.name}</td>
                          <td className="py-2">{p.address}</td>
                          <td className="py-2">{p.type}</td>
                          <td className="py-2">{p.price || p.rent || 0}</td>
                          <td className="py-2">{p.bedrooms || 0} / {p.bathrooms || 0}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <span className={cls('border px-2 py-0.5 rounded-full text-xs', 
                                (p.status === 'sold') ? propertyColors['Sold'] : (p.status === 'under_offer') ? propertyColors['Under Offer'] : propertyColors['Available']
                              )}>
                                {(p.status === 'sold') ? 'Sold' : (p.status === 'under_offer') ? 'Under Offer' : 'Available'}
                              </span>
                              <select
                                className="px-2 py-1 rounded border text-xs"
                                value={(p.status === 'sold') ? 'Sold' : (p.status === 'under_offer') ? 'Under Offer' : 'Available'}
                                onChange={async (e:any) => {
                                  const next = String(e.target.value || 'Available');
                                  const statusPayload = next.toLowerCase().replace(' ', '_') as PropertyStatus;
                                  try {
                                    await propertyService.updateProperty(p._id, { status: statusPayload });
                                    await refreshProperties();
                                  } catch (err:any) {
                                    alert(err?.message || 'Failed to update status');
                                  }
                                }}
                              >
                                {Object.keys(propertyColors).map((s:any) => <option key={s}>{s}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="py-2 flex gap-3">
                            <button className="text-xs underline" onClick={()=>startEdit(p)}>Edit</button>
                            <button className="text-xs underline text-rose-700" onClick={()=>deleteProperty(p._id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Creation handled via main Sales Dashboard modal using ?add=property */}

          {editing && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Edit Property</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm">Title</label>
                    <Input required placeholder="e.g., 3-bed House in Avondale" value={form.title} onChange={(e:any)=>setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm">Property Type</label>
                    <select className="w-full px-3 py-2 rounded-xl border" value={form.type} onChange={(e:any)=>setForm({ ...form, type: e.target.value })}>
                      <option value="house">House</option>
                      <option value="apartment">Apartment</option>
                      <option value="commercial">Commercial</option>
                      <option value="land">Land</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm">Address</label>
                    <Input required value={form.address} onChange={(e:any)=>setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm">Pick from Valuations (optional)</label>
                    <select className="w-full px-3 py-2 rounded-xl border" value={pickedValuationId} onChange={(e:any)=>{
                      const valId = e.target.value;
                      setPickedValuationId(valId);
                      const v = (valuations || []).find((x: any) => x._id === valId);
                      if (!v) return;
                      setForm((prev:any) => ({
                        ...prev,
                        title: typeof v.propertyAddress === 'string' ? v.propertyAddress : (prev.title || ''),
                        address: typeof v.propertyAddress === 'string' ? v.propertyAddress : (prev.address || ''),
                        price: (v.estimatedValue != null && !isNaN(Number(v.estimatedValue))) ? String(v.estimatedValue) : String(prev.price || ''),
                        bedrooms: (v.bedrooms != null && !isNaN(Number(v.bedrooms))) ? Number(v.bedrooms) : prev.bedrooms,
                        bathrooms: (v.bathrooms != null && !isNaN(Number(v.bathrooms))) ? Number(v.bathrooms) : prev.bathrooms,
                        landArea: (v.landSize != null && !isNaN(Number(v.landSize))) ? String(v.landSize) : String(prev.landArea || ''),
                      }));
                    }}>
                      <option value="">-- Select valuation by address --</option>
                      {(valuations || []).map((v: any) => (
                        <option key={v._id} value={v._id}>{v.propertyAddress}{v.city ? `, ${v.city}` : ''}{v.suburb ? ` (${v.suburb})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm">Owner</label>
                    <select className="w-full px-3 py-2 rounded-xl border" value={form.ownerId} onChange={(e:any)=>setForm({ ...form, ownerId: e.target.value })}>
                      <option value="">-- Select Owner (optional) --</option>
                      {owners.map((o:any)=> (
                        <option key={o._id} value={o._id}>{(`${o.firstName || ''} ${o.lastName || ''}`).trim() || o.name || o.email}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm">Buyer</label>
                    <select className="w-full px-3 py-2 rounded-xl border" value={form.buyerId} onChange={(e:any)=>setForm({ ...form, buyerId: e.target.value })}>
                      <option value="">-- Select Buyer (optional) --</option>
                      {buyers.map((b:any)=> (
                        <option key={b._id} value={b._id}>
                          {b.name}{b.email ? ` (${b.email})` : ''}{b.phone ? ` • ${b.phone}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm">Price</label>
                    <Input type="number" value={form.price} onChange={(e:any)=>setForm({ ...form, price: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm">Bedrooms</label>
                    <Input type="number" value={form.bedrooms} onChange={(e:any)=>setForm({ ...form, bedrooms: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-sm">Bathrooms</label>
                    <Input type="number" value={form.bathrooms} onChange={(e:any)=>setForm({ ...form, bathrooms: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-sm">Built Area (sqm)</label>
                    <Input type="number" value={form.builtArea} onChange={(e:any)=>setForm({ ...form, builtArea: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm">Land Area (sqm)</label>
                    <Input type="number" value={form.landArea} onChange={(e:any)=>setForm({ ...form, landArea: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm">Status</label>
                    <select className="w-full px-3 py-2 rounded-xl border" value={form.status} onChange={(e:any)=>setForm({ ...form, status: e.target.value })}>
                      {Object.keys(propertyColors).map((s:any) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm">Images</label>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e:any) => {
                          const files: FileList | null = e.target.files;
                          if (!files || files.length === 0) return;
                          const fileArray = Array.from(files);
                          let remaining = fileArray.length;
                          const newImages: string[] = [];
                          fileArray.forEach((file) => {
                            const reader = new FileReader();
                            reader.onload = () => {
                              const result = reader.result as string;
                              if (result) newImages.push(result);
                              remaining -= 1;
                              if (remaining === 0) {
                                setForm((prev:any) => ({ ...prev, images: [ ...(Array.isArray(prev.images) ? prev.images : []), ...newImages ] }));
                              }
                            };
                            reader.readAsDataURL(file);
                          });
                        }}
                      />
                      {Array.isArray(form.images) && form.images.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {(form.images as any[]).map((src: any, idx: number) => (
                            <div key={idx} className="relative border rounded-lg overflow-hidden">
                              <img src={src} alt={`Property ${idx+1}`} className="w-full h-28 object-cover" />
                              <button type="button" className="absolute top-1 right-1 text-xs px-2 py-1 rounded bg-white/80 border" onClick={()=>{
                                const next = (form.images as any[]).filter((_: any, i: number)=> i !== idx);
                                setForm({ ...form, images: next });
                              }}>Remove</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm">Sale Type</label>
                    <select className="w-full px-3 py-2 rounded-xl border" value={form.saleType} onChange={(e:any)=>setForm({ ...form, saleType: e.target.value })}>
                      <option value="cash">Cash</option>
                      <option value="installment">Installment</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm">Notes</label>
                    <Textarea rows={3} value={form.notes} onChange={(e:any)=>setForm({ ...form, notes: e.target.value })} />
                  </div>
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-sm">Commission %</label>
                      <Input type="number" value={form.commission} onChange={(e:any)=>setForm({ ...form, commission: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="text-sm">PREA % of Commission</label>
                      <Input type="number" value={form.commissionPreaPercent} onChange={(e:any)=>setForm({ ...form, commissionPreaPercent: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="text-sm">Agency % of Remaining</label>
                      <Input type="number" value={form.commissionAgencyPercentRemaining} onChange={(e:any)=>setForm({ ...form, commissionAgencyPercentRemaining: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="text-sm">Agent % of Remaining</label>
                      <Input type="number" value={form.commissionAgentPercentRemaining} onChange={(e:any)=>setForm({ ...form, commissionAgentPercentRemaining: Number(e.target.value) })} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-2 rounded-xl border bg-slate-900 text-white" onClick={saveEdit} disabled={loading}>Save</button>
                  <button className="px-3 py-2 rounded-xl border" onClick={()=>setEditing(null)}>Cancel</button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}


