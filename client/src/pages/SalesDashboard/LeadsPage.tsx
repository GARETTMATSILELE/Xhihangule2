import React from 'react';
import { leadService } from '../../services/leadService';
import SalesSidebar from '../../components/Layout/SalesSidebar';

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

export function LeadsPage() {
  const [leads, setLeads] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>('');
  const [editing, setEditing] = React.useState<any | null>(null);
  const [form, setForm] = React.useState<any>({ name: '', source: '', interest: '', email: '', phone: '', status: 'New' });
  const [createForm, setCreateForm] = React.useState<any>({ name: '', source: '', interest: '', email: '', phone: '', status: 'New' });

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await leadService.list();
      setLeads(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = (items: any[], fields: string[]) => items.filter(it => {
    if (!query) return true;
    const hay = fields.map(f => String(it[f] ?? "")).join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const startEdit = (lead: any) => {
    setEditing(lead);
    setForm({ name: lead.name || '', source: lead.source || '', interest: lead.interest || '', email: lead.email || '', phone: lead.phone || '', status: lead.status || 'New' });
  };

  const saveEdit = async () => {
    if (!editing?._id) return;
    try {
      setLoading(true);
      await leadService.update(editing._id, form);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to update lead');
    } finally {
      setLoading(false);
    }
  };

  const createLead = async () => {
    if (!createForm.name?.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await leadService.create(createForm);
      setCreateForm({ name: '', source: '', interest: '', email: '', phone: '', status: 'New' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  const deleteLead = async (id: string) => {
    if (!id) return;
    const ok = window.confirm('Delete this lead?');
    if (!ok) return;
    try {
      setLoading(true);
      await leadService.remove(id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
        <div className="flex-1 max-w-5xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Leads</h1>
          <div className="w-full max-w-sm">
            <Input placeholder="Search leads" value={query} onChange={(e: any)=>setQuery(e.target.value)} />
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <div className="text-sm text-rose-600 mb-2">{error}</div>}
            {/* Create lead */}
            <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input placeholder="Name" value={createForm.name} onChange={(e: any)=>setCreateForm((f: any)=>({...f, name: e.target.value}))} />
              <Input placeholder="Source" value={createForm.source} onChange={(e: any)=>setCreateForm((f: any)=>({...f, source: e.target.value}))} />
              <Input placeholder="Interest" value={createForm.interest} onChange={(e: any)=>setCreateForm((f: any)=>({...f, interest: e.target.value}))} />
              <Input placeholder="Email" value={createForm.email} onChange={(e: any)=>setCreateForm((f: any)=>({...f, email: e.target.value}))} />
              <Input placeholder="Phone" value={createForm.phone} onChange={(e: any)=>setCreateForm((f: any)=>({...f, phone: e.target.value}))} />
              <select className="px-3 py-2 rounded-xl border" value={createForm.status} onChange={(e)=>setCreateForm((f: any)=>({...f, status: e.target.value}))}>
                {['New','Contacted','Qualified','Viewing','Offer','Won','Lost'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div>
                <button className="px-3 py-2 rounded-xl border bg-slate-900 text-white" onClick={createLead} disabled={loading}>Create Lead</button>
              </div>
            </div>
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2">Name</th>
                      <th className="py-2">Source</th>
                      <th className="py-2">Interest</th>
                      <th className="py-2">Phone</th>
                      <th className="py-2">Email</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered(leads, ['name','source','interest','email','phone']).map(lead => (
                      <tr key={lead._id} className="border-t">
                        <td className="py-2 font-medium">{lead.name}</td>
                        <td className="py-2">{lead.source}</td>
                        <td className="py-2">{lead.interest}</td>
                        <td className="py-2">{lead.phone}</td>
                        <td className="py-2">{lead.email}</td>
                        <td className="py-2">{lead.status}</td>
                        <td className="py-2 flex gap-3">
                          <button className="text-xs underline" onClick={()=>startEdit(lead)}>Edit</button>
                          <button className="text-xs underline text-rose-700" onClick={()=>deleteLead(lead._id)}>Delete</button>
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
            <CardHeader><CardTitle>Edit Lead</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Name" value={form.name} onChange={(e: any)=>setForm((f: any)=>({...f, name: e.target.value}))} />
                <Input placeholder="Source" value={form.source} onChange={(e: any)=>setForm((f: any)=>({...f, source: e.target.value}))} />
                <Input placeholder="Interest" value={form.interest} onChange={(e: any)=>setForm((f: any)=>({...f, interest: e.target.value}))} />
                <Input placeholder="Email" value={form.email} onChange={(e: any)=>setForm((f: any)=>({...f, email: e.target.value}))} />
                <Input placeholder="Phone" value={form.phone} onChange={(e: any)=>setForm((f: any)=>({...f, phone: e.target.value}))} />
                <select className="px-3 py-2 rounded-xl border" value={form.status} onChange={(e)=>setForm((f: any)=>({...f, status: e.target.value}))}>
                  {['New','Contacted','Qualified','Viewing','Offer','Won','Lost'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-2 rounded-xl border bg-slate-900 text-white" onClick={saveEdit}>Save</button>
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

export default LeadsPage;


