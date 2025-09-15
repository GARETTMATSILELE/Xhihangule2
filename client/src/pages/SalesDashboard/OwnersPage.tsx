import React from 'react';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { usePropertyOwnerService } from '../../services/propertyOwnerService';

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

export default function OwnersPage() {
  const ownerService = usePropertyOwnerService();
  const [owners, setOwners] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>('');
  const [editing, setEditing] = React.useState<any | null>(null);
  const [form, setForm] = React.useState<any>({ firstName: '', lastName: '', email: '', phone: '' });
  const [createForm, setCreateForm] = React.useState<any>({ firstName: '', lastName: '', email: '', phone: '', password: '' });

  const load = React.useCallback(async () => {
    try {
      setLoading(true); setError(null);
      // Try sales owners endpoint first
      let list: any[] = [];
      try {
        const result: any = await ownerService.getAll();
        list = Array.isArray(result?.owners) ? result.owners : (Array.isArray(result) ? result : []);
      } catch (err) {
        // Fallback to public owners endpoint
        try {
          const pub = await ownerService.getAllPublic();
          list = Array.isArray((pub as any)?.owners) ? (pub as any).owners : (Array.isArray(pub) ? pub : []);
        } catch (err2) {
          throw err2;
        }
      }
      setOwners(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load owners');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = (items: any[], fields: string[]) => items.filter(it => {
    if (!query) return true;
    const hay = fields.map(f => String(it[f] ?? "")).join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const startEdit = (o: any) => { setEditing(o); setForm({ firstName: o.firstName||'', lastName: o.lastName||'', email: o.email||'', phone: o.phone||'' }); };

  const saveEdit = async () => {
    if (!editing?._id) return;
    try { setLoading(true); await ownerService.update(editing._id, form); setEditing(null); await load(); }
    catch (e: any) { setError(e?.message||'Failed to update owner'); }
    finally { setLoading(false); }
  };

  const createOwner = async () => {
    if (!createForm.firstName?.trim() || !createForm.lastName?.trim() || !createForm.email?.trim() || !createForm.password?.trim()) {
      setError('First name, last name, email and password are required');
      return;
    }
    try {
      setLoading(true); setError(null);
      await ownerService.create({ ...createForm }, { channel: 'sales' });
      setCreateForm({ firstName: '', lastName: '', email: '', phone: '', password: '' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to create owner');
    } finally { setLoading(false); }
  };

  const deleteOwner = async (id: string) => {
    if (!id) return; if (!window.confirm('Delete this owner?')) return;
    try { setLoading(true); await ownerService.remove(id); await load(); }
    catch (e: any) { setError(e?.message||'Failed to delete owner'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
        <div className="flex-1 max-w-6xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Owners</h1>
            <div className="w-full max-w-sm"><Input placeholder="Search owners" value={query} onChange={(e:any)=>setQuery(e.target.value)} /></div>
          </div>
          <Card>
            <CardHeader><CardTitle>Owners</CardTitle></CardHeader>
            <CardContent>
              {error && <div className="text-sm text-rose-600 mb-2">{error}</div>}
              {/* Create */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input placeholder="First Name" value={createForm.firstName} onChange={(e:any)=>setCreateForm((f:any)=>({...f, firstName: e.target.value}))} />
                <Input placeholder="Last Name" value={createForm.lastName} onChange={(e:any)=>setCreateForm((f:any)=>({...f, lastName: e.target.value}))} />
                <Input placeholder="Email" value={createForm.email} onChange={(e:any)=>setCreateForm((f:any)=>({...f, email: e.target.value}))} />
                <Input placeholder="Phone" value={createForm.phone} onChange={(e:any)=>setCreateForm((f:any)=>({...f, phone: e.target.value}))} />
                <Input placeholder="Password" type="password" value={createForm.password} onChange={(e:any)=>setCreateForm((f:any)=>({...f, password: e.target.value}))} />
                <div><button className="px-3 py-2 rounded-xl border bg-slate-900 text-white" onClick={createOwner} disabled={loading}>Create Owner</button></div>
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
                      {filtered(owners, ['firstName','lastName','email','phone']).map(o => (
                        <tr key={o._id} className="border-t">
                          <td className="py-2 font-medium">{`${o.firstName || ''} ${o.lastName || ''}`.trim()}</td>
                          <td className="py-2">{o.email}</td>
                          <td className="py-2">{o.phone}</td>
                          <td className="py-2 flex gap-3">
                            <button className="text-xs underline" onClick={()=>startEdit(o)}>Edit</button>
                            <button className="text-xs underline text-rose-700" onClick={()=>deleteOwner(o._id)}>Delete</button>
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
              <CardHeader><CardTitle>Edit Owner</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input placeholder="First Name" value={form.firstName} onChange={(e:any)=>setForm((f:any)=>({...f, firstName: e.target.value}))} />
                  <Input placeholder="Last Name" value={form.lastName} onChange={(e:any)=>setForm((f:any)=>({...f, lastName: e.target.value}))} />
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


