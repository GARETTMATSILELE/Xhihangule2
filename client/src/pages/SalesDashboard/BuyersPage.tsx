import React from 'react';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { buyerService } from '../../services/buyerService';

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

export default function BuyersPage() {
  const [buyers, setBuyers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>('');
  const [editing, setEditing] = React.useState<any | null>(null);
  const [form, setForm] = React.useState<any>({ name: '', email: '', phone: '' });
  const [createForm, setCreateForm] = React.useState<any>({ name: '', email: '', phone: '' });

  const load = React.useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const list = await buyerService.list();
      setBuyers(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load buyers');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = (items: any[], fields: string[]) => items.filter(it => {
    if (!query) return true;
    const hay = fields.map(f => String(it[f] ?? "")).join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const startEdit = (b: any) => { setEditing(b); setForm({ name: b.name||'', email: b.email||'', phone: b.phone||'' }); };
  const saveEdit = async () => { if (!editing?._id) return; try { setLoading(true); await buyerService.update(editing._id, form); setEditing(null); await load(); } catch (e: any) { setError(e?.message||'Failed to update'); } finally { setLoading(false); } };
  const createBuyer = async () => { if (!createForm.name?.trim()) { setError('Name is required'); return; } try { setLoading(true); setError(null); await buyerService.create({ name: createForm.name, email: createForm.email, phone: createForm.phone }); setCreateForm({ name: '', email: '', phone: '' }); await load(); } catch (e:any) { setError(e?.message||'Failed to create'); } finally { setLoading(false); } };
  const deleteBuyer = async (id: string) => { if (!id) return; if (!window.confirm('Delete this buyer?')) return; try { setLoading(true); await buyerService.remove(id); await load(); } catch (e:any) { setError(e?.message||'Failed to delete'); } finally { setLoading(false); } };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
        <div className="flex-1 max-w-6xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Buyers</h1>
            <div className="w-full max-w-sm"><Input placeholder="Search buyers" value={query} onChange={(e:any)=>setQuery(e.target.value)} /></div>
          </div>
          <Card>
            <CardHeader><CardTitle>Buyers</CardTitle></CardHeader>
            <CardContent>
              {error && <div className="text-sm text-rose-600 mb-2">{error}</div>}
              {/* Create */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input placeholder="Name" value={createForm.name} onChange={(e:any)=>setCreateForm((f:any)=>({...f, name: e.target.value}))} />
                <Input placeholder="Email" value={createForm.email} onChange={(e:any)=>setCreateForm((f:any)=>({...f, email: e.target.value}))} />
                <Input placeholder="Phone" value={createForm.phone} onChange={(e:any)=>setCreateForm((f:any)=>({...f, phone: e.target.value}))} />
                <div><button className="px-3 py-2 rounded-xl border bg-slate-900 text-white" onClick={createBuyer} disabled={loading}>Create Buyer</button></div>
              </div>

              {loading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-600">
                        <th className="py-2">Name</th>
                        <th className="py-2">Email</th>
                        <th className="py-2">Phone</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered(buyers, ['name','email','phone']).map(b => (
                        <tr key={b._id} className="border-t">
                          <td className="py-2 font-medium">{b.name}</td>
                          <td className="py-2">{b.email}</td>
                          <td className="py-2">{b.phone}</td>
                          <td className="py-2 flex gap-3">
                            <button className="text-xs underline" onClick={()=>startEdit(b)}>Edit</button>
                            <button className="text-xs underline text-rose-700" onClick={()=>deleteBuyer(b._id)}>Delete</button>
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
              <CardHeader><CardTitle>Edit Buyer</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input placeholder="Name" value={form.name} onChange={(e:any)=>setForm((f:any)=>({...f, name: e.target.value}))} />
                  <Input placeholder="Email" value={form.email} onChange={(e:any)=>setForm((f:any)=>({...f, email: e.target.value}))} />
                  <Input placeholder="Phone" value={form.phone} onChange={(e:any)=>setForm((f:any)=>({...f, phone: e.target.value}))} />
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



