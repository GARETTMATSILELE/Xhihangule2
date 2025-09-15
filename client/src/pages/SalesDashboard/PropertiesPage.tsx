import React from 'react';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { usePropertyService } from '../../services/propertyService';

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

export default function PropertiesPage() {
  const propertyService = usePropertyService();
  const [properties, setProperties] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>('');
  const [editing, setEditing] = React.useState<any | null>(null);
  const [form, setForm] = React.useState<any>({ name: '', address: '', type: 'house', price: '', bedrooms: '', bathrooms: '', description: '' });
  const [createForm, setCreateForm] = React.useState<any>({ name: '', address: '', type: 'house', price: '', bedrooms: '', bathrooms: '', description: '' });

  const load = React.useCallback(async () => {
    try { setLoading(true); setError(null); const list = await propertyService.getProperties(); setProperties(Array.isArray(list)?list:[]); }
    catch (e:any) { setError(e?.message || 'Failed to load properties'); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = (items: any[], fields: string[]) => items.filter(it => {
    if (!query) return true;
    const hay = fields.map(f => String(it[f] ?? "")).join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const startEdit = (p: any) => { setEditing(p); setForm({ name: p.name||'', address: p.address||'', type: p.type||'house', price: p.price||'', bedrooms: p.bedrooms||'', bathrooms: p.bathrooms||'', description: p.description||'' }); };
  const saveEdit = async () => { if (!editing?._id) return; try { setLoading(true); await propertyService.updateProperty(editing._id, { ...form, price: Number(form.price||0), bedrooms: Number(form.bedrooms||0), bathrooms: Number(form.bathrooms||0) }); setEditing(null); await load(); } catch(e:any){ setError(e?.message||'Failed to update'); } finally { setLoading(false);} };
  const createProperty = async () => { if (!createForm.name?.trim() || !createForm.address?.trim()) { setError('Name and address are required'); return; } try { setLoading(true); setError(null); await propertyService.createPropertySales({ ...createForm, price: Number(createForm.price||0), bedrooms: Number(createForm.bedrooms||0), bathrooms: Number(createForm.bathrooms||0) }); setCreateForm({ name: '', address: '', type: 'house', price: '', bedrooms: '', bathrooms: '', description: '' }); await load(); } catch(e:any){ setError(e?.message||'Failed to create'); } finally { setLoading(false);} };
  const deleteProperty = async (id: string) => { if (!id) return; if (!window.confirm('Delete this property?')) return; try { setLoading(true); await propertyService.deleteProperty(id); await load(); } catch(e:any){ setError(e?.message||'Failed to delete'); } finally { setLoading(false);} };

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
            <CardHeader><CardTitle>Properties</CardTitle></CardHeader>
            <CardContent>
              {error && <div className="text-sm text-rose-600 mb-2">{error}</div>}
              {/* Create */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input placeholder="Name" value={createForm.name} onChange={(e:any)=>setCreateForm((f:any)=>({...f, name: e.target.value}))} />
                <Input placeholder="Address" value={createForm.address} onChange={(e:any)=>setCreateForm((f:any)=>({...f, address: e.target.value}))} />
                <select className="px-3 py-2 rounded-xl border" value={createForm.type} onChange={(e)=>setCreateForm((f:any)=>({...f, type: e.target.value}))}>
                  <option value="house">House</option>
                  <option value="apartment">Apartment</option>
                  <option value="townhouse">Townhouse</option>
                </select>
                <Input placeholder="Price" value={createForm.price} onChange={(e:any)=>setCreateForm((f:any)=>({...f, price: e.target.value}))} />
                <Input placeholder="Bedrooms" value={createForm.bedrooms} onChange={(e:any)=>setCreateForm((f:any)=>({...f, bedrooms: e.target.value}))} />
                <Input placeholder="Bathrooms" value={createForm.bathrooms} onChange={(e:any)=>setCreateForm((f:any)=>({...f, bathrooms: e.target.value}))} />
                <Input placeholder="Description" value={createForm.description} onChange={(e:any)=>setCreateForm((f:any)=>({...f, description: e.target.value}))} />
                <div><button className="px-3 py-2 rounded-xl border bg-slate-900 text-white" onClick={createProperty} disabled={loading}>Create Property</button></div>
              </div>

              {loading ? (
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

          {editing && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Edit Property</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input placeholder="Name" value={form.name} onChange={(e:any)=>setForm((f:any)=>({...f, name: e.target.value}))} />
                  <Input placeholder="Address" value={form.address} onChange={(e:any)=>setForm((f:any)=>({...f, address: e.target.value}))} />
                  <select className="px-3 py-2 rounded-xl border" value={form.type} onChange={(e)=>setForm((f:any)=>({...f, type: e.target.value}))}>
                    <option value="house">House</option>
                    <option value="apartment">Apartment</option>
                    <option value="townhouse">Townhouse</option>
                  </select>
                  <Input placeholder="Price" value={form.price} onChange={(e:any)=>setForm((f:any)=>({...f, price: e.target.value}))} />
                  <Input placeholder="Bedrooms" value={form.bedrooms} onChange={(e:any)=>setForm((f:any)=>({...f, bedrooms: e.target.value}))} />
                  <Input placeholder="Bathrooms" value={form.bathrooms} onChange={(e:any)=>setForm((f:any)=>({...f, bathrooms: e.target.value}))} />
                  <Input placeholder="Description" value={form.description} onChange={(e:any)=>setForm((f:any)=>({...f, description: e.target.value}))} />
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


