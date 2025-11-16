import React from 'react';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { dealService } from '../../services/dealService';
import { useProperties } from '../../contexts/PropertyContext';
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

export default function DealsPage() {
  const { properties, refreshProperties } = useProperties();
  const propertyService = usePropertyService();
  const propsById = React.useMemo(() => Object.fromEntries((properties||[]).map((p:any)=>[p._id, p])), [properties]);
  const [deals, setDeals] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>('');
  const [editing, setEditing] = React.useState<any | null>(null);
  const [form, setForm] = React.useState<any>({ propertyId: '', buyerName: '', buyerEmail: '', buyerPhone: '', stage: 'Offer', offerPrice: '', closeDate: '', notes: '', won: false });
  const [createForm, setCreateForm] = React.useState<any>({ propertyId: '', buyerName: '', buyerEmail: '', buyerPhone: '', stage: 'Offer', offerPrice: '', closeDate: '', notes: '' });

  const load = React.useCallback(async () => {
    try { setLoading(true); setError(null); const list = await dealService.list(); setDeals(Array.isArray(list)?list:[]); }
    catch (e:any) { setError(e?.message || 'Failed to load deals'); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = (items: any[], fields: string[]) => items.filter(it => {
    if (!query) return true;
    const hay = fields.map(f => String(it[f] ?? "")).join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const startEdit = (d: any) => { setEditing(d); setForm({ propertyId: d.propertyId, buyerName: d.buyerName, buyerEmail: d.buyerEmail||'', buyerPhone: d.buyerPhone||'', stage: d.stage||'Offer', offerPrice: d.offerPrice||'', closeDate: d.closeDate||'', notes: d.notes||'', won: d.won||false }); };
  const saveEdit = async () => { if (!editing?._id) return; try { setLoading(true); await dealService.update(editing._id, { ...form, offerPrice: Number(form.offerPrice||0) }); setEditing(null); await load(); } catch(e:any){ setError(e?.message||'Failed to update'); } finally { setLoading(false);} };
  const createDeal = async () => { if (!createForm.propertyId || !createForm.buyerName?.trim()) { setError('Property and buyer name are required'); return; } try { setLoading(true); setError(null); await dealService.create({ ...createForm, offerPrice: Number(createForm.offerPrice||0) }); setCreateForm({ propertyId: '', buyerName: '', buyerEmail: '', buyerPhone: '', stage: 'Offer', offerPrice: '', closeDate: '', notes: '' }); await load(); } catch(e:any){ setError(e?.message||'Failed to create'); } finally { setLoading(false);} };
  const deleteDeal = async (id: string) => { if (!id) return; if (!window.confirm('Delete this deal?')) return; try { setLoading(true); await dealService.remove(id); await load(); } catch(e:any){ setError(e?.message||'Failed to delete'); } finally { setLoading(false);} };

  const markWon = async (deal: any) => {
    try {
      setLoading(true);
      setError(null);
      // 1) Update deal as won
      await dealService.update(deal._id, { won: true, stage: 'Won' });
      // 2) Update linked property status to sold
      if (deal.propertyId) {
        await propertyService.updateProperty(deal.propertyId, { status: 'sold' });
      }
      // 3) Refresh lists
      await load();
      try { await refreshProperties(); } catch {}
    } catch(e:any) {
      setError(e?.message || 'Failed to mark deal as won');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
        <div className="flex-1 max-w-6xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Deals</h1>
            <div className="w-full max-w-sm"><Input placeholder="Search deals" value={query} onChange={(e:any)=>setQuery(e.target.value)} /></div>
          </div>
          <Card>
            <CardHeader><CardTitle>Deals</CardTitle></CardHeader>
            <CardContent>
              {error && <div className="text-sm text-rose-600 mb-2">{error}</div>}
              {/* Create */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <select className="px-3 py-2 rounded-xl border" value={createForm.propertyId} onChange={(e)=>setCreateForm((f:any)=>({...f, propertyId: e.target.value}))}>
                  <option value="">Select Property</option>
                  {(properties||[]).map((p:any)=>(<option key={p._id} value={p._id}>{p.name}</option>))}
                </select>
                <Input placeholder="Buyer Name" value={createForm.buyerName} onChange={(e:any)=>setCreateForm((f:any)=>({...f, buyerName: e.target.value}))} />
                <Input placeholder="Buyer Email" value={createForm.buyerEmail} onChange={(e:any)=>setCreateForm((f:any)=>({...f, buyerEmail: e.target.value}))} />
                <Input placeholder="Buyer Phone" value={createForm.buyerPhone} onChange={(e:any)=>setCreateForm((f:any)=>({...f, buyerPhone: e.target.value}))} />
                <select className="px-3 py-2 rounded-xl border" value={createForm.stage} onChange={(e)=>setCreateForm((f:any)=>({...f, stage: e.target.value}))}>
                  {['Offer','Due Diligence','Contract','Closing'].map(s=>(<option key={s} value={s}>{s}</option>))}
                </select>
                <Input placeholder="Offer Price" value={createForm.offerPrice} onChange={(e:any)=>setCreateForm((f:any)=>({...f, offerPrice: e.target.value}))} />
                <Input placeholder="Close Date (YYYY-MM-DD)" value={createForm.closeDate} onChange={(e:any)=>setCreateForm((f:any)=>({...f, closeDate: e.target.value}))} />
                <Input placeholder="Notes" value={createForm.notes} onChange={(e:any)=>setCreateForm((f:any)=>({...f, notes: e.target.value}))} />
                <div><button className="px-3 py-2 rounded-xl border bg-slate-900 text-white" onClick={createDeal} disabled={loading}>Create Deal</button></div>
              </div>

              {loading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-600">
                        <th className="py-2">Property</th>
                        <th className="py-2">Buyer</th>
                        <th className="py-2">Stage</th>
                        <th className="py-2">Offer</th>
                        <th className="py-2">Close Date</th>
                        <th className="py-2">Won</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered(deals, ['buyerName','buyerEmail','buyerPhone','stage','notes']).map(d => (
                        <tr key={d._id} className="border-t">
                          <td className="py-2 font-medium">{propsById[d.propertyId]?.name || d.propertyId}</td>
                          <td className="py-2">{d.buyerName}</td>
                          <td className="py-2">{d.stage}</td>
                          <td className="py-2">{d.offerPrice}</td>
                          <td className="py-2">{d.closeDate || '—'}</td>
                          <td className="py-2">{d.won ? 'Yes' : 'No'}</td>
                          <td className="py-2 flex gap-3">
                            <button className="text-xs underline" onClick={()=>startEdit(d)}>Edit</button>
                            <button className="text-xs underline text-rose-700" onClick={()=>deleteDeal(d._id)}>Delete</button>
                            {!d.won && (
                              <button className="text-xs underline text-emerald-700" onClick={()=>markWon(d)}>Mark Won</button>
                            )}
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
              <CardHeader><CardTitle>Edit Deal</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select className="px-3 py-2 rounded-xl border" value={form.propertyId} onChange={(e)=>setForm((f:any)=>({...f, propertyId: e.target.value}))}>
                    {(properties||[]).map((p:any)=>(<option key={p._id} value={p._id}>{p.name}</option>))}
                  </select>
                  <Input placeholder="Buyer Name" value={form.buyerName} onChange={(e:any)=>setForm((f:any)=>({...f, buyerName: e.target.value}))} />
                  <Input placeholder="Buyer Email" value={form.buyerEmail} onChange={(e:any)=>setForm((f:any)=>({...f, buyerEmail: e.target.value}))} />
                  <Input placeholder="Buyer Phone" value={form.buyerPhone} onChange={(e:any)=>setForm((f:any)=>({...f, buyerPhone: e.target.value}))} />
                  <select className="px-3 py-2 rounded-xl border" value={form.stage} onChange={(e)=>setForm((f:any)=>({...f, stage: e.target.value}))}>
                    {['Offer','Due Diligence','Contract','Closing'].map(s=>(<option key={s} value={s}>{s}</option>))}
                  </select>
                  <Input placeholder="Offer Price" value={form.offerPrice} onChange={(e:any)=>setForm((f:any)=>({...f, offerPrice: e.target.value}))} />
                  <Input placeholder="Close Date (YYYY-MM-DD)" value={form.closeDate} onChange={(e:any)=>setForm((f:any)=>({...f, closeDate: e.target.value}))} />
                  <Input placeholder="Notes" value={form.notes} onChange={(e:any)=>setForm((f:any)=>({...f, notes: e.target.value}))} />
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



