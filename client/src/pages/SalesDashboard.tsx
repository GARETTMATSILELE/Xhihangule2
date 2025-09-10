// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProperties } from "../contexts/PropertyContext";
import { usePropertyOwnerService } from "../services/propertyOwnerService";
import { dealService } from "../services/dealService";
import { buyerService } from "../services/buyerService";
import { leadService } from "../services/leadService";
import { viewingService } from "../services/viewingService";
import { apiService } from "../api";

// --- Lightweight helpers ---
const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));
const cls = (...s) => s.filter(Boolean).join(" ");

// --- Demo seed data ---
const seedData = () => {
  const owners = [
    { id: uid(), name: "Kudzi Moyo", phone: "+263 77 123 4567", email: "kudzi@example.com" },
    { id: uid(), name: "Rudo Chirwa", phone: "+263 71 987 6543", email: "rudo@example.com" },
  ];
  const properties = [
    { id: uid(), title: "3-bed House in Avondale", address: "Avondale, Harare", price: 180000, status: "Available", ownerId: owners[0].id, bedrooms: 3, bathrooms: 2, notes: "Close to shops" },
    { id: uid(), title: "Townhouse in Borrowdale", address: "Borrowdale, Harare", price: 260000, status: "Under Offer", ownerId: owners[1].id, bedrooms: 4, bathrooms: 3, notes: "Gated community" },
  ];
  const buyers = [
    { id: uid(), name: "Audrey Machana", phone: "+263 78 555 1122", email: "audrey@buyer.com", budgetMin: 120000, budgetMax: 250000, prefs: "3+ beds, north of CBD" },
    { id: uid(), name: "Garett Matsilele", phone: "+263 71 333 7788", email: "garett@buyer.com", budgetMin: 150000, budgetMax: 300000, prefs: "Townhouse or duplex" },
  ];
  const leads = [
    { id: uid(), name: "Nomsa N.", source: "Website", interest: "Family house", status: "New", email: "nomsa@email.com", phone: "+263 77 222 9999", createdAt: new Date().toISOString() },
    { id: uid(), name: "Tapiwa K.", source: "Walk-in", interest: "Borrowdale townhouse", status: "Qualified", email: "tapiwa@email.com", phone: "+263 71 111 0000", createdAt: new Date().toISOString() },
  ];
  const viewings = [
    { id: uid(), propertyId: properties[0].id, buyerId: buyers[0].id, when: new Date(Date.now() + 86400000).toISOString(), status: "Scheduled", notes: "Bring copies of IDs" },
  ];
  const deals = [
    { id: uid(), propertyId: properties[1].id, buyerId: buyers[1].id, stage: "Offer", offerPrice: 250000, closeDate: null, won: false },
  ];
  return { owners, properties, buyers, leads, viewings, deals };
};

// --- Local storage persistence ---
const usePersistentState = (key, initial) => {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : (typeof initial === "function" ? initial() : initial);
    } catch {
      return typeof initial === "function" ? initial() : initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState];
};

// --- Small UI primitives (tailwind only) ---
const Card = ({ className = "", children }) => (
  <div className={cls("rounded-2xl shadow-sm border border-slate-200 bg-white", className)}>{children}</div>
);
const CardHeader = ({ className = "", children }) => (
  <div className={cls("p-4 border-b bg-gradient-to-b from-gray-50 to-white rounded-t-2xl", className)}>{children}</div>
);
const CardTitle = ({ children, className = "" }) => (
  <h3 className={cls("text-lg font-semibold", className)}>{children}</h3>
);
const CardContent = ({ className = "", children }) => (
  <div className={cls("p-4", className)}>{children}</div>
);
const Button = ({ children, className = "", onClick, type = "button" }) => (
  <button type={type} onClick={onClick} className={cls("px-3 py-2 rounded-xl border text-sm font-medium hover:shadow-sm transition active:scale-[.99] border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200", className)}>
    {children}
  </button>
);
const Input = (props) => (
  <input {...props} className={cls("w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring", props.className)} />
);
const Textarea = (props) => (
  <textarea {...props} className={cls("w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring", props.className)} />
);
const Badge = ({ children, className = "" }) => (
  <span className={cls("inline-flex items-center px-2 py-1 rounded-full text-xs border", className)}>{children}</span>
);

// --- Minimal icons (inline SVGs) ---
const IconDashboard = ({ className = "h-5 w-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h5v8H3v-8zm7 0h11v8H10v-8z"/></svg>
);
const IconFolder = ({ className = "h-5 w-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M10 4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h6z"/></svg>
);
const IconBell = ({ className = "h-5 w-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2 2 0 002-2H10a2 2 0 002 2zm8-6V11a8 8 0 10-16 0v5l-2 2v1h20v-1l-2-2z"/></svg>
);
const IconCog = ({ className = "h-5 w-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.936a7.965 7.965 0 000-1.872l2.036-1.582-1.5-2.598-2.43.982a8.03 8.03 0 00-1.62-.94l-.37-2.56h-3l-.37 2.56a8.03 8.03 0 00-1.62.94l-2.43-.982-1.5 2.598 2.036 1.582a7.965 7.965 0 000 1.872L4.09 14.518l1.5 2.598 2.43-.982c.5.38 1.046.695 1.62.94l.37 2.56h3l.37-2.56c.574-.245 1.12-.56 1.62-.94l2.43.982 1.5-2.598-2.036-1.582zM12 15a3 3 0 110-6 3 3 0 010 6z"/></svg>
);

// --- Modal ---
const Modal = ({ open, onClose, title, children, width = "max-w-2xl" }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={cls("relative w-full mx-4 bg-white rounded-2xl shadow-xl border", width)}>
        <div className="p-4 border-b flex items-center justify-between rounded-t-2xl">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

// --- Tag helpers ---
const leadColors = {
  New: "bg-blue-50 text-blue-700 border-blue-200",
  Contacted: "bg-sky-50 text-sky-700 border-sky-200",
  Qualified: "bg-purple-50 text-purple-700 border-purple-200",
  Viewing: "bg-amber-50 text-amber-700 border-amber-200",
  Offer: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Won: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Lost: "bg-rose-50 text-rose-700 border-rose-200",
};
const viewingColors = {
  Scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  Done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "No-show": "bg-rose-50 text-rose-700 border-rose-200",
};
const propertyColors = {
  Available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Under Offer": "bg-amber-50 text-amber-700 border-amber-200",
  Sold: "bg-gray-100 text-gray-600 border-gray-200",
};

// --- Main CRM component ---
export default function CRM() {
  const { user } = useAuth();
  const { properties: backendProperties, addProperty: addBackendProperty, refreshProperties } = useProperties();
  const propertyOwnerService = usePropertyOwnerService();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState("Leads");
  const [query, setQuery] = useState("");
  const [nav, setNav] = useState<'dashboard' | 'files' | 'settings'>('dashboard');
  const displayName = (user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email : "Property CRM");
  const userInitials = useMemo(() => {
    const fn = (user?.firstName || '').trim();
    const ln = (user?.lastName || '').trim();
    if (fn || ln) {
      const a = fn ? fn[0] : '';
      const b = ln ? ln[0] : '';
      const init = `${a}${b}`.toUpperCase();
      return init || (user?.email?.[0]?.toUpperCase() || 'U');
    }
    const email = user?.email || '';
    const namePart = email.split('@')[0] || '';
    const parts = namePart.split(/[._-]/).filter(Boolean);
    let init = '';
    if (parts[0]) init += parts[0][0];
    if (parts[1]) init += parts[1][0];
    if (!init && namePart) init = namePart[0];
    return (init || 'U').toUpperCase();
  }, [user]);

  // Sync nav with route so sidebar persists on settings route
  useEffect(() => {
    if (location.pathname.includes('/sales-dashboard/settings')) {
      setNav('settings');
    } else {
      setNav((prev) => (prev === 'settings' ? 'dashboard' : prev));
    }
  }, [location.pathname]);

  // Backend owners state
  const [owners, setOwners] = useState<any[]>([]);
  const [ownersLoading, setOwnersLoading] = useState<boolean>(false);

  const refreshOwners = async () => {
    try {
      setOwnersLoading(true);
      const result = await propertyOwnerService.getAll();
      setOwners(Array.isArray(result?.owners) ? result.owners : (result || []));
    } catch (e) {
      setOwners([]);
    } finally {
      setOwnersLoading(false);
    }
  };

  useEffect(() => {
    refreshOwners();
  }, []);

  // Backend deals state
  const [backendDeals, setBackendDeals] = useState<any[]>([]);
  const refreshDeals = async () => {
    try {
      const list = await dealService.list();
      setBackendDeals(Array.isArray(list) ? list : []);
    } catch (e) {
      setBackendDeals([]);
    }
  };

  useEffect(() => {
    refreshDeals();
  }, []);

  // Modal toggles
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showViewingModal, setShowViewingModal] = useState(false);
  const [showDealModal, setShowDealModal] = useState(false);

  // Backend leads state
  const [backendLeads, setBackendLeads] = useState<any[]>([]);
  const refreshLeads = async () => {
    try {
      const list = await leadService.list();
      setBackendLeads(Array.isArray(list) ? list : []);
    } catch (e) {
      setBackendLeads([]);
    }
  };
  useEffect(() => { refreshLeads(); }, []);

  // Derived KPIs (computed after all hooks are declared)
  let kpis = { leads: 0, upcoming: 0, activeProps: 0, wonDeals: 0, wonValue: 0 } as any;

  const [backendBuyers, setBackendBuyers] = useState<any[]>([]);
  const refreshBuyers = async () => {
    try {
      const list = await buyerService.list();
      setBackendBuyers(Array.isArray(list) ? list : []);
    } catch (e) {
      setBackendBuyers([]);
    }
  };
  useEffect(() => { refreshBuyers(); }, []);

  const buyersById = useMemo(() => Object.fromEntries(backendBuyers.map(b => [b._id, b])), [backendBuyers]);
  const propsById = useMemo(() => ({} as Record<string, any>), []);
  const backendPropsById = useMemo(() => Object.fromEntries((backendProperties || []).map((p: any) => [p._id, p])), [backendProperties]);

  const getId = (maybe: any) => {
    if (!maybe) return undefined;
    if (typeof maybe === 'string') return maybe;
    if (typeof maybe === 'object' && maybe.$oid) return maybe.$oid;
    return String(maybe);
  };

  const propertyIdToOwnerName = useMemo(() => {
    const map: Record<string, string> = {};
    (owners || []).forEach((o: any) => {
      const full = `${o.firstName || ''} ${o.lastName || ''}`.trim();
      if (Array.isArray(o.properties)) {
        o.properties.forEach((pid: any) => {
          const key = getId(pid);
          if (key) map[key] = full;
        });
      }
    });
    return map;
  }, [owners]);

  // Add handlers
  const addLead = async (lead) => {
    try {
      await leadService.create({
        name: lead.name,
        source: lead.source,
        interest: lead.interest,
        email: lead.email,
        phone: lead.phone,
        status: lead.status || 'New'
      });
      await refreshLeads();
    } catch (e) {
      // swallow error; UI stays unchanged
    }
  };
  const addBuyer = async (buyer) => {
    try {
      await buyerService.create({
        name: buyer.name,
        phone: buyer.phone,
        email: buyer.email,
        budgetMin: Number(buyer.budgetMin || 0),
        budgetMax: Number(buyer.budgetMax || 0),
        prefs: buyer.prefs
      });
      await refreshBuyers();
    } catch (e) {}
  };
  const addOwner = async (owner) => {
    // Owner comes from form: { firstName, lastName, email, phone, password }
    try {
      await propertyOwnerService.create({
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        phone: owner.phone,
        password: owner.password
      }, { channel: 'sales' });
      await refreshOwners();
    } catch (e) {
      // no-op fallback
    }
  };
  // Persist non-backend items locally, but create properties via backend
  const addPropertyLocal = (_property) => {};
  const handleCreateProperty = async (property) => {
    try {
      // Map CRM form fields to backend property fields
      const payload = {
        name: property.title,
        address: property.address,
        // Map sales price to rent field for storage if provided
        rent: Number(property.price || 0),
        bedrooms: Number(property.bedrooms || 0),
        bathrooms: Number(property.bathrooms || 0),
        description: property.notes || "",
        type: 'house',
        status: 'available'
      };
      await addBackendProperty(payload);
      await refreshProperties();
    } catch (e) {}
  };
  const [backendViewings, setBackendViewings] = useState<any[]>([]);
  const refreshViewings = async () => {
    try {
      const list = await viewingService.list();
      setBackendViewings(Array.isArray(list) ? list : []);
    } catch (e) {
      setBackendViewings([]);
    }
  };
  useEffect(() => { refreshViewings(); }, []);

  const addViewing = async (v) => {
    try {
      await viewingService.create({
        propertyId: v.propertyId,
        buyerId: v.buyerId,
        when: new Date(v.when).toISOString(),
        status: v.status,
        notes: v.notes
      });
      await refreshViewings();
    } catch (e) {}
  };
  const addDeal = async (deal) => {
    try {
      const propertyId = deal.propertyId;
      const buyer = buyersById[deal.buyerId];
      await dealService.create({
        propertyId,
        buyerName: buyer?.name || 'Buyer',
        offerPrice: Number(deal.offerPrice || 0),
        stage: deal.stage || 'Offer'
      });
      await refreshDeals();
    } catch (e) {}
  };

  const updateLeadStatus = async (_id, _status) => {};
  const markPropertyStatus = async (_id, _status) => {};
  const progressDeal = async (_id, _updates) => {};

  const filtered = (items, fields) => items.filter(it => {
    if (!query) return true;
    const hay = fields.map(f => String(it[f] ?? "")).join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/70 border-b">
        <div className="w-full pl-0 pr-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-slate-900 text-white grid place-items-center font-bold">
              {userInitials}
            </div>
            <div>
              <div className="text-sm text-slate-500">{displayName}</div>
              <h1 className="text-xl font-semibold leading-none">Sales Agent Workspace</h1>
            </div>
          </div>
          <div className="flex-1" />
          <div className="w-full max-w-md relative">
            <Input placeholder="Search leads, buyers, properties…" value={query} onChange={e=>setQuery(e.target.value)} />
            {query && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 bg-slate-100 px-2 py-1 rounded hover:bg-slate-200" onClick={()=>setQuery("")}>Clear</button>
            )}
          </div>
        </div>
      </header>

      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <aside className="w-60 shrink-0">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 flex flex-col h-full min-h-[80vh]">
            <div className="px-3 py-2 text-xs uppercase tracking-wider text-slate-400">Main menu</div>
            <button className={cls("mt-1 flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-medium", nav==='dashboard'?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200") } onClick={()=>{ setNav('dashboard'); navigate('/sales-dashboard'); }}>
              <IconDashboard className="h-4 w-4" />
              <span>Dashboard</span>
            </button>
            <button className={cls("mt-2 flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-medium", nav==='files'?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200") } onClick={()=>setNav('files')}>
              <IconFolder className="h-4 w-4" />
              <span>Files</span>
            </button>
            <div className="mt-auto">
              <div className="px-3 py-2 text-xs uppercase tracking-wider text-slate-400">Help & Support</div>
              <button title="Notifications" className="flex items-center justify-between px-3 py-2 rounded-xl border text-sm bg-slate-100 hover:bg-slate-200">
                <span className="flex items-center gap-3"><IconBell className="h-4 w-4"/> Notifications</span>
                <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-xs bg-rose-100 text-rose-700 border border-rose-200">3</span>
              </button>
              <button title="Settings" className={cls("mt-2 flex items-center gap-3 px-3 py-2 rounded-xl border text-sm", nav==='settings'?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200")} onClick={()=>{ setNav('settings'); navigate('/sales-dashboard/settings'); }}>
                <IconCog className="h-4 w-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </aside>
        <main className="flex-1 space-y-6 max-w-5xl mx-auto">
        {/* KPI cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Leads</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{backendLeads.length}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Viewings</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{(backendViewings || []).filter(v => new Date(v.when) > new Date()).length}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Active Properties</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{(backendProperties || []).filter((p: any) => p.status !== 'rented').length}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Won Deals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{(backendDeals || []).filter((d: any) => d.won).length}</div>
              <div className="text-sm text-slate-500">{money(((backendDeals || []).filter((d: any) => d.won)).reduce((s: number, d: any) => s + Number(d.offerPrice || 0), 0))} total</div>
            </CardContent>
          </Card>
        </section>

        {/* Tab bar */}
        <nav className="flex flex-wrap gap-2">
          {[
            "Leads","Viewings","Buyers","Owners","Properties","Deals"
          ].map(t => (
            <Button key={t} onClick={()=>setTab(t)} className={cls("", tab===t?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200")}>{t}</Button>
          ))}
          <div className="flex-1" />
          {/* Quick add menu */}
          <div className="flex gap-2">
            <Button className="bg-emerald-600 text-white border-emerald-600" onClick={()=>setShowLeadModal(true)}>+ Lead</Button>
            <Button className="bg-amber-600 text-white border-amber-600" onClick={()=>setShowViewingModal(true)}>+ Viewing</Button>
            <Button className="bg-sky-600 text-white border-sky-600" onClick={()=>setShowPropertyModal(true)}>+ Property</Button>
          </div>
        </nav>

        {/* Tabs content */}
        {tab === "Leads" && (
          <Card>
            <CardHeader>
              <CardTitle>Leads</CardTitle>
            </CardHeader>
            <CardContent>
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
                    {filtered((backendLeads || []).map(l => ({
                      id: l._id,
                      name: l.name,
                      source: l.source,
                      interest: l.interest,
                      phone: l.phone,
                      email: l.email,
                      status: l.status
                    })), ["name","source","interest","email","phone"]).map(l => (
                      <tr key={l.id} className="border-t">
                        <td className="py-2 font-medium">{l.name}</td>
                        <td className="py-2">{l.source}</td>
                        <td className="py-2">{l.interest}</td>
                        <td className="py-2">{l.phone}</td>
                        <td className="py-2">{l.email}</td>
                        <td className="py-2"><Badge className={leadColors[l.status]}>{l.status}</Badge></td>
                        <td className="py-2 flex gap-2">
                          {["New","Contacted","Qualified","Viewing","Offer","Won","Lost"].map(s=> (
                            <button key={s} className={cls("text-xs px-2 py-1 rounded-lg border", l.status===s?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200")} onClick={async ()=>{ await leadService.update(l.id, { status: s }); await refreshLeads(); }}>{s}</button>
                          ))}
                          <button className="text-xs px-2 py-1 rounded-lg border bg-slate-100 hover:bg-slate-200" onClick={()=>{
                            setShowViewingModal(true);
                          }}>Schedule Viewing</button>
                          <button className="text-xs px-2 py-1 rounded-lg border bg-slate-100 hover:bg-slate-200" onClick={()=>{
                            setShowDealModal(true);
                          }}>Create Deal</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "Viewings" && (
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Viewings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2">When</th>
                      <th className="py-2">Property</th>
                      <th className="py-2">Buyer</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered((backendViewings || []), ["when","notes"]).sort((a:any,b:any)=>new Date(a.when)-new Date(b.when)).map(v => (
                      <tr key={v._id} className="border-t">
                        <td className="py-2 whitespace-nowrap">{new Date(v.when).toLocaleString()}</td>
                        <td className="py-2">{backendPropsById[v.propertyId]?.name || v.propertyId}</td>
                        <td className="py-2">{buyersById[v.buyerId || '']?.name || '—'}</td>
                        <td className="py-2"><Badge className={viewingColors[v.status]}>{v.status}</Badge></td>
                        <td className="py-2">{v.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "Buyers" && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Buyers</CardTitle>
              <Button className="bg-slate-900 text-white border-slate-900" onClick={()=>setShowBuyerModal(true)}>+ Buyer</Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2">Name</th>
                      <th className="py-2">Phone</th>
                      <th className="py-2">Email</th>
                      <th className="py-2">Budget</th>
                      <th className="py-2">Preferences</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered((backendBuyers || []).map(b => ({
                      id: b._id,
                      name: b.name,
                      phone: b.phone,
                      email: b.email,
                      budgetMin: b.budgetMin || 0,
                      budgetMax: b.budgetMax || 0,
                      prefs: b.prefs || ''
                    })),["name","email","phone","prefs"]).map(b => (
                      <tr key={b.id} className="border-t">
                        <td className="py-2 font-medium">{b.name}</td>
                        <td className="py-2">{b.phone}</td>
                        <td className="py-2">{b.email}</td>
                        <td className="py-2">{money(b.budgetMin)} - {money(b.budgetMax)}</td>
                        <td className="py-2">{b.prefs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "Owners" && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Property Owners</CardTitle>
              <Button className="bg-slate-900 text-white border-slate-900" onClick={()=>setShowOwnerModal(true)}>+ Owner</Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2">Name</th>
                      <th className="py-2">Phone</th>
                      <th className="py-2">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered((owners || []).map(o => ({
                      id: o._id,
                      name: `${o.firstName || ''} ${o.lastName || ''}`.trim(),
                      phone: o.phone,
                      email: o.email
                    })),["name","email","phone"]).map(o => (
                      <tr key={o.id} className="border-t">
                        <td className="py-2 font-medium">{o.name}</td>
                        <td className="py-2">{o.phone}</td>
                        <td className="py-2">{o.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "Properties" && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Properties</CardTitle>
              <Button className="bg-slate-900 text-white border-slate-900" onClick={()=>setShowPropertyModal(true)}>+ Property</Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2">Title</th>
                      <th className="py-2">Address</th>
                      <th className="py-2">Owner</th>
                      <th className="py-2">Price</th>
                      <th className="py-2">Beds/Baths</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered(
                      (backendProperties || []).map(bp => ({
                        id: bp._id,
                        title: bp.name,
                        address: bp.address,
                        price: bp.rent,
                        bedrooms: bp.bedrooms || 0,
                        bathrooms: bp.bathrooms || 0,
                        status: (bp.status === 'available' ? 'Available' : (bp.status === 'rented' ? 'Sold' : 'Available'))
                      })),
                      ["title","address","notes"]
                    ).map(p => (
                      <tr key={p.id} className="border-t">
                        <td className="py-2 font-medium">{p.title}</td>
                        <td className="py-2">{p.address}</td>
                        <td className="py-2">{propertyIdToOwnerName[p.id] || "—"}</td>
                        <td className="py-2">{money(p.price)}</td>
                        <td className="py-2">{p.bedrooms} / {p.bathrooms}</td>
                        <td className="py-2"><Badge className={propertyColors[p.status]}>{p.status}</Badge></td>
                        <td className="py-2 flex gap-2">
                          {["Available","Under Offer","Sold"].map(s => (
                            <button key={s} className={cls("text-xs px-2 py-1 rounded-lg border", p.status===s?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200")} onClick={()=>markPropertyStatus(p.id, s)}>{s}</button>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "Deals" && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Deals Pipeline</CardTitle>
              <Button className="bg-slate-900 text-white border-slate-900" onClick={()=>setShowDealModal(true)}>+ Deal</Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2">Property</th>
                      <th className="py-2">Buyer</th>
                      <th className="py-2">Stage</th>
                      <th className="py-2">Offer Price</th>
                      <th className="py-2">Close Date</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered((backendDeals || []).map((d: any) => ({
                      id: d._id,
                      propertyId: d.propertyId,
                      buyerName: d.buyerName,
                      stage: d.stage,
                      offerPrice: d.offerPrice,
                      closeDate: d.closeDate,
                      won: d.won
                    })),["stage"]).map(d => (
                      <tr key={d.id} className="border-t">
                        <td className="py-2">{backendPropsById[d.propertyId]?.name || d.propertyId}</td>
                        <td className="py-2">{d.buyerName}</td>
                        <td className="py-2">{d.won ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Won</Badge> : d.stage}</td>
                        <td className="py-2">{money(d.offerPrice)}</td>
                        <td className="py-2">{d.closeDate ? new Date(d.closeDate).toLocaleDateString() : "—"}</td>
                        <td className="py-2 flex gap-2">
                          {["Offer","Due Diligence","Contract","Closing"].map(s => (
                            <button key={s} disabled={d.won} className={cls("text-xs px-2 py-1 rounded-lg border", d.stage===s?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200", d.won && "opacity-50 cursor-not-allowed")} onClick={async ()=>{ await dealService.update(d.id, { stage: s }); await refreshDeals(); }}>{s}</button>
                          ))}
                          <button disabled={d.won} className={cls("text-xs px-2 py-1 rounded-lg border bg-emerald-600 text-white border-emerald-600", d.won && "opacity-50 cursor-not-allowed")} onClick={async ()=>{ await dealService.update(d.id, { won: true, closeDate: new Date().toISOString() }); await refreshDeals(); }}>Mark Won</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
        {nav === 'files' && (
          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-600">Files area coming soon.</div>
            </CardContent>
          </Card>
        )}

        {nav === 'settings' && (
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="space-y-3">
                  <div className="text-sm font-medium text-slate-700">Profile Picture</div>
                  <AvatarUpload user={user} />
                </section>
                <section className="space-y-3">
                  <div className="text-sm font-medium text-slate-700">Change Password</div>
                  <PasswordChange />
                </section>
              </div>
            </CardContent>
          </Card>
        )}
        </main>
      </div>

      {/* Modals */}
      <LeadModal open={showLeadModal} onClose={()=>setShowLeadModal(false)} onSubmit={addLead} />
      <BuyerModal open={showBuyerModal} onClose={()=>setShowBuyerModal(false)} onSubmit={addBuyer} />
      <OwnerModal open={showOwnerModal} onClose={()=>setShowOwnerModal(false)} onSubmit={addOwner} />
      <PropertyModal open={showPropertyModal} onClose={()=>setShowPropertyModal(false)} onSubmit={handleCreateProperty} owners={(owners || []).map(o => ({ id: o._id, name: `${o.firstName || ''} ${o.lastName || ''}`.trim() }))} />
      <ViewingModal open={showViewingModal} onClose={()=>setShowViewingModal(false)} onSubmit={addViewing} buyers={(backendBuyers || []).map((b: any) => ({ id: b._id, name: b.name }))} properties={(backendProperties || []).map((p: any) => ({ id: p._id, title: p.name }))} />
      <DealModal open={showDealModal} onClose={()=>setShowDealModal(false)} onSubmit={addDeal} buyers={(backendBuyers || []).map((b: any) => ({ id: b._id, name: b.name }))} properties={(backendProperties || []).map((p: any) => ({ id: p._id, title: p.name }))} />

      {/* Footer */}
      
    </div>
  );
}

// --- Forms ---
function AvatarUpload({ user }) {
  const [file, setFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const onSelect = (e: any) => setFile(e.target.files?.[0] || null);
  const onUpload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      const form = new FormData();
      form.append('avatar', file);
      if (apiService.uploadUserAvatar) {
        await apiService.uploadUserAvatar(form);
      }
      window.location.reload();
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <input type="file" accept="image/*" onChange={onSelect} />
      <Button onClick={onUpload} className="bg-slate-900 text-white border-slate-900" disabled={uploading || !file}>{uploading? 'Uploading…' : 'Upload'}</Button>
    </div>
  );
}

function PasswordChange() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const onSubmit = async (e:any) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) return;
    try {
      setSaving(true);
      if (apiService.updateUserPassword) {
        await apiService.updateUserPassword(currentPassword, newPassword);
      }
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      alert('Password updated');
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3">
      <Input type="password" placeholder="Current password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} />
      <Input type="password" placeholder="New password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
      <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
      <div>
        <Button type="submit" className="bg-slate-900 text-white border-slate-900" disabled={saving}>{saving? 'Saving…' : 'Update Password'}</Button>
      </div>
    </form>
  );
}
function LeadModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", source: "Website", interest: "", email: "", phone: "", status: "New" });
  useEffect(()=>{ if(!open) setForm({ name: "", source: "Website", interest: "", email: "", phone: "", status: "New" }); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add Lead">
      <form onSubmit={(e)=>{ e.preventDefault(); onSubmit(form); onClose(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Name</label>
          <Input required value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Source</label>
          <Input value={form.source} onChange={e=>setForm({ ...form, source: e.target.value })} placeholder="e.g., Website, Referral" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Interest</label>
          <Input value={form.interest} onChange={e=>setForm({ ...form, interest: e.target.value })} placeholder="e.g., 3-bed house in Avondale" />
        </div>
        <div>
          <label className="text-sm">Phone</label>
          <Input value={form.phone} onChange={e=>setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Email</label>
          <Input type="email" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Status</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.status} onChange={e=>setForm({...form, status: e.target.value})}>
            {Object.keys(leadColors).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button className="bg-slate-900 text-white border-slate-900" type="submit">Save Lead</Button>
        </div>
      </form>
    </Modal>
  );
}

function BuyerModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", budgetMin: "", budgetMax: "", prefs: "" });
  useEffect(()=>{ if(!open) setForm({ name: "", phone: "", email: "", budgetMin: "", budgetMax: "", prefs: "" }); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add Buyer">
      <form onSubmit={async (e)=>{ e.preventDefault(); await onSubmit({
        name: form.name,
        phone: form.phone,
        email: form.email,
        budgetMin: form.budgetMin,
        budgetMax: form.budgetMax,
        prefs: form.prefs
      }); onClose(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Name</label>
          <Input required value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Phone</label>
          <Input value={form.phone} onChange={e=>setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Email</label>
          <Input type="email" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Budget Min</label>
          <Input type="number" value={form.budgetMin} onChange={e=>setForm({ ...form, budgetMin: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Budget Max</label>
          <Input type="number" value={form.budgetMax} onChange={e=>setForm({ ...form, budgetMax: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Preferences</label>
          <Textarea rows={3} value={form.prefs} onChange={e=>setForm({ ...form, prefs: e.target.value })} placeholder="e.g., 3+ bedrooms, north of CBD" />
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button className="bg-slate-900 text-white border-slate-900" type="submit">Save Buyer</Button>
        </div>
      </form>
    </Modal>
  );
}

function OwnerModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", password: "" });
  useEffect(()=>{ if(!open) setForm({ firstName: "", lastName: "", phone: "", email: "", password: "" }); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add Property Owner">
      <form onSubmit={(e)=>{ e.preventDefault(); onSubmit(form); onClose(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">First Name</label>
          <Input required value={form.firstName} onChange={e=>setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Last Name</label>
          <Input required value={form.lastName} onChange={e=>setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Phone</label>
          <Input value={form.phone} onChange={e=>setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Email</label>
          <Input type="email" value={form.email} onChange={e=>setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Temporary Password</label>
          <Input required type="password" value={form.password} onChange={e=>setForm({ ...form, password: e.target.value })} placeholder="Set a temporary password" />
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button className="bg-slate-900 text-white border-slate-900" type="submit">Save Owner</Button>
        </div>
      </form>
    </Modal>
  );
}

function PropertyModal({ open, onClose, onSubmit, owners }) {
  const [form, setForm] = useState({ title: "", address: "", price: "", bedrooms: 3, bathrooms: 2, status: "Available", ownerId: owners[0]?.id, notes: "" });
  useEffect(()=>{ if(!open) setForm({ title: "", address: "", price: "", bedrooms: 3, bathrooms: 2, status: "Available", ownerId: owners[0]?.id, notes: "" }); }, [open, owners]);
  return (
    <Modal open={open} onClose={onClose} title="Add Property">
      <form onSubmit={(e)=>{ e.preventDefault(); onSubmit({ ...form, price: Number(form.price||0) }); onClose(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Title</label>
          <Input required value={form.title} onChange={e=>setForm({ ...form, title: e.target.value })} placeholder="e.g., 3-bed House in Avondale" />
        </div>
        <div>
          <label className="text-sm">Address</label>
          <Input required value={form.address} onChange={e=>setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Owner</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.ownerId} onChange={e=>setForm({ ...form, ownerId: e.target.value })}>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Price</label>
          <Input type="number" value={form.price} onChange={e=>setForm({ ...form, price: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Bedrooms</label>
          <Input type="number" value={form.bedrooms} onChange={e=>setForm({ ...form, bedrooms: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-sm">Bathrooms</label>
          <Input type="number" value={form.bathrooms} onChange={e=>setForm({ ...form, bathrooms: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-sm">Status</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.status} onChange={e=>setForm({ ...form, status: e.target.value })}>
            {Object.keys(propertyColors).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Notes</label>
          <Textarea rows={3} value={form.notes} onChange={e=>setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button className="bg-slate-900 text-white border-slate-900" type="submit">Save Property</Button>
        </div>
      </form>
    </Modal>
  );
}

function ViewingModal({ open, onClose, onSubmit, buyers, properties }) {
  const [form, setForm] = useState({ propertyId: properties[0]?.id, buyerId: buyers[0]?.id, when: new Date(Date.now()+86400000).toISOString().slice(0,16), status: "Scheduled", notes: "" });
  useEffect(()=>{ if(!open) setForm({ propertyId: properties[0]?.id, buyerId: buyers[0]?.id, when: new Date(Date.now()+86400000).toISOString().slice(0,16), status: "Scheduled", notes: "" }); }, [open, buyers, properties]);
  return (
    <Modal open={open} onClose={onClose} title="Schedule Viewing">
      <form onSubmit={(e)=>{ e.preventDefault(); onSubmit({ ...form, when: new Date(form.when).toISOString() }); onClose(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Property</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.propertyId} onChange={e=>setForm({ ...form, propertyId: e.target.value })}>
            {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Buyer</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.buyerId} onChange={e=>setForm({ ...form, buyerId: e.target.value })}>
            {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Date & Time</label>
          <Input type="datetime-local" value={form.when} onChange={e=>setForm({ ...form, when: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Status</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.status} onChange={e=>setForm({ ...form, status: e.target.value })}>
            {Object.keys(viewingColors).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Notes</label>
          <Textarea rows={3} value={form.notes} onChange={e=>setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button className="bg-sky-600 text-white border-sky-600" type="submit">Save Viewing</Button>
        </div>
      </form>
    </Modal>
  );
}

function DealModal({ open, onClose, onSubmit, buyers, properties }) {
  const [form, setForm] = useState({ propertyId: properties[0]?.id, buyerId: buyers[0]?.id, stage: "Offer", offerPrice: "" });
  useEffect(()=>{ if(!open) setForm({ propertyId: properties[0]?.id, buyerId: buyers[0]?.id, stage: "Offer", offerPrice: "" }); }, [open, buyers, properties]);
  return (
    <Modal open={open} onClose={onClose} title="Create Deal">
      <form onSubmit={(e)=>{ e.preventDefault(); onSubmit({ ...form, offerPrice: Number(form.offerPrice||0), won: false, closeDate: null }); onClose(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Property</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.propertyId} onChange={e=>setForm({ ...form, propertyId: e.target.value })}>
            {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Buyer</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.buyerId} onChange={e=>setForm({ ...form, buyerId: e.target.value })}>
            {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Stage</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.stage} onChange={e=>setForm({ ...form, stage: e.target.value })}>
            {(["Offer","Due Diligence","Contract","Closing"]).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Offer Price</label>
          <Input type="number" value={form.offerPrice} onChange={e=>setForm({ ...form, offerPrice: e.target.value })} />
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button className="bg-slate-900 text-white border-slate-900" type="submit">Save Deal</Button>
        </div>
      </form>
    </Modal>
  );
}


