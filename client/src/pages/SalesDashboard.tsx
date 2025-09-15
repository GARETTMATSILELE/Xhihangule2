// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProperties } from "../contexts/PropertyContext";
import { usePropertyOwnerService } from "../services/propertyOwnerService";
import accountantService from "../services/accountantService";
import api from "../api/axios";
import { useNotification } from "../components/Layout/Header";
import SalesSidebar from "../components/Layout/SalesSidebar";
import SalesLeadsPage from "./SalesDashboard/LeadsPage";
import { dealService } from "../services/dealService";
import { buyerService } from "../services/buyerService";
import { leadService } from "../services/leadService";
import { viewingService } from "../services/viewingService";
import { apiService } from "../api";
import { usePropertyService } from "../services/propertyService";
import paymentService from "../services/paymentService";

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

// --- Sales Documents component (inline for now) ---
function SalesDocuments({ propertyId }: { propertyId: string }) {
  const [files, setFiles] = React.useState<any[]>([]);
  const [uploading, setUploading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedType, setSelectedType] = React.useState<string>('Other');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);

  const TYPES = [
    'Mandate Form',
    'KYC Form',
    'Agreement of Sale',
    'Offer Form',
    'Title Deeds',
    'Sectional Title',
    'Disbursement/Acknowledgment of Receipt',
    'Other'
  ];

  const load = React.useCallback(async () => {
    try {
      setError(null);
      // Try sales-files first
      let res = await api.get(`/sales-files`, { params: { propertyId } });
      let arr = Array.isArray(res.data?.files) ? res.data.files : (Array.isArray(res.data) ? res.data : []);
      // Fallback to generic files if sales-files not found
      if (!Array.isArray(arr) || arr.length === 0) {
        try {
          const alt = await api.get(`/files`);
          const raw = Array.isArray(alt.data) ? alt.data : (Array.isArray(alt.data?.data) ? alt.data.data : []);
          arr = raw.filter((f: any) => {
            const pid = typeof f.propertyId === 'object' && f.propertyId?._id ? String(f.propertyId._id) : String(f.propertyId);
            return pid === propertyId;
          });
        } catch {}
      }
      setFiles(Array.isArray(arr) ? arr : []);
    } catch (e: any) {
      // If 404 on sales-files, fallback to /files
      try {
        const alt = await api.get(`/files`);
        const raw = Array.isArray(alt.data) ? alt.data : (Array.isArray(alt.data?.data) ? alt.data.data : []);
        const arr = raw.filter((f: any) => {
          const pid = typeof f.propertyId === 'object' && f.propertyId?._id ? String(f.propertyId._id) : String(f.propertyId);
          return pid === propertyId;
        });
        setFiles(arr);
        setError(null);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load documents');
        setFiles([]);
      }
    }
  }, [propertyId]);

  React.useEffect(() => { load(); }, [load]);

  const onUpload = async () => {
    if (!selectedFile) {
      setError('Select a file first');
      return;
    }
    try {
      setUploading(true);
      setError(null);
      const fd = new FormData();
      fd.append('file', selectedFile as Blob);
      fd.append('propertyId', propertyId);
      fd.append('docType', selectedType);
      try {
        await api.post('/sales-files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } catch (err: any) {
        if (err?.response?.status === 404) {
          // Fallback to generic files upload schema
          fd.delete('docType');
          fd.delete('propertyId');
          fd.append('fileType', selectedType);
          fd.append('propertyId', propertyId);
          await api.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        } else {
          throw err;
        }
      }
      setSelectedFile(null);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to upload');
    } finally {
      setUploading(false);
    }
  };

  const onDownload = async (id: string, fileName: string) => {
    try {
      let res;
      try {
        res = await api.get(`/sales-files/${id}/download`, { responseType: 'blob' });
      } catch (err: any) {
        if (err?.response?.status === 404) {
          res = await api.get(`/files/download/${id}`, { responseType: 'blob' });
        } else {
          throw err;
        }
      }
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError('Failed to download file');
    }
  };

  const onDelete = async (id: string) => {
    try {
      try {
        await api.delete(`/sales-files/${id}`);
      } catch (err: any) {
        if (err?.response?.status === 404) {
          await api.delete(`/files/${id}`);
        } else {
          throw err;
        }
      }
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to delete file');
    }
  };

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <select className="px-3 py-2 rounded-xl border" value={selectedType} onChange={e=>setSelectedType(e.target.value)}>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="file" onChange={e=>setSelectedFile((e.target.files || [])[0] || null)} className="px-3 py-2 rounded-xl border" />
        <button onClick={onUpload} disabled={uploading} className="px-3 py-2 rounded-xl border bg-slate-900 text-white disabled:opacity-50">{uploading? 'Uploading…' : 'Upload'}</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="py-2">File Name</th>
              <th className="py-2">Type</th>
              <th className="py-2">Uploaded</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f: any) => (
              <tr key={f._id} className="border-t">
                <td className="py-2">{f.fileName}</td>
                <td className="py-2">{f.docType || f.fileType}</td>
                <td className="py-2">{new Date(f.uploadedAt || Date.now()).toLocaleString()}</td>
                <td className="py-2 flex gap-3">
                  <button className="text-xs underline" onClick={()=>onDownload(f._id, f.fileName)}>Download</button>
                  <button className="text-xs underline text-rose-700" onClick={()=>onDelete(f._id)}>Delete</button>
                </td>
              </tr>
            ))}
            {files.length === 0 && (
              <tr><td className="py-2 text-slate-500" colSpan={4}>No documents uploaded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
  const { user, logout } = useAuth();
  const { properties: backendProperties, refreshProperties } = useProperties();
  const propertyService = usePropertyService();
  const propertyOwnerService = usePropertyOwnerService();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, addNotification, markAllRead } = useNotification();
  const [tab, setTab] = useState("Leads");
  const [query, setQuery] = useState("");
  const [nav, setNav] = useState<'dashboard' | 'files' | 'settings'>('dashboard');
  const [editPropertyId, setEditPropertyId] = useState<string | null>(null);
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

  const ownersById = useMemo(() => {
    const map: Record<string, any> = {};
    (owners || []).forEach((o: any) => {
      const key = getId(o?._id);
      if (key) map[key] = o;
    });
    return map;
  }, [owners]);

  const propertyIdToOwnerDetails = useMemo(() => {
    const map: Record<string, { name: string; phone?: string; email?: string }> = {};
    (backendProperties || []).forEach((bp: any) => {
      const propertyId = getId(bp?._id);
      const ownerId = getId((bp as any)?.propertyOwnerId) || getId((bp as any)?.ownerId);
      if (!propertyId || !ownerId) return;
      const o = ownersById[ownerId];
      if (!o) return;
      const name = (`${o.firstName || ''} ${o.lastName || ''}`.trim()) || o.name || 'Unknown';
      map[propertyId] = { name, phone: o.phone, email: o.email };
    });
    return map;
  }, [backendProperties, ownersById]);

  // --- Notifications: Viewings starting in 30 minutes ---
  const viewingNotifiedRef = React.useRef<Set<string>>(new Set());

  // --- Notifications: New commission paid (only for admin/accountant roles) ---
  const commissionNotifiedRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    const isAuthorized = user?.role === 'admin' || user?.role === 'accountant';
    if (!isAuthorized) return;
    let cancelled = false;
    const fetchAndNotify = async () => {
      try {
        const data = await accountantService.getAgencyCommission({ filterType: 'daily' });
        const details = Array.isArray(data?.details) ? data.details : [];
        details.forEach((d: any) => {
          const pid = String(d.paymentId || '');
          if (!pid || commissionNotifiedRef.current.has(pid)) return;
          commissionNotifiedRef.current.add(pid);
          addNotification({
            id: `commission-${pid}`,
            title: 'Commission paid',
            message: `${d.propertyName || 'Property'} · ${money(d.agencyShare || 0)}`,
            link: '/accountant-dashboard/commissions',
            read: false,
            createdAt: new Date()
          });
        });
      } catch (e) {
        // silently ignore
      }
    };
    fetchAndNotify();
    const iv = setInterval(() => { if (!cancelled) fetchAndNotify(); }, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [addNotification, user?.role]);

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
      // Submit via sales-specific endpoint so it doesn't use rental routes
      const payload = {
        name: property.title,
        address: property.address,
        price: Number(property.price || 0),
        bedrooms: Number(property.bedrooms || 0),
        bathrooms: Number(property.bathrooms || 0),
        description: property.notes || "",
        status: (property.status || 'Available').toLowerCase().replace(' ', '_'),
        builtArea: Number(property.builtArea || 0),
        landArea: Number(property.landArea || 0),
        saleType: property.saleType || 'cash',
        commission: Number(property.commission || 0),
        commissionPreaPercent: Number(property.commissionPreaPercent || 3),
        commissionAgencyPercentRemaining: Number(property.commissionAgencyPercentRemaining || 50),
        commissionAgentPercentRemaining: Number(property.commissionAgentPercentRemaining || 50),
      } as any;
      // Include property owner (from selection) and agent
      if (property.ownerId) {
        (payload as any).propertyOwnerId = property.ownerId;
      }
      if (user?._id) {
        (payload as any).agentId = user._id;
      }
      // Prefer direct sales endpoint to avoid rental routes
      await apiService.createPropertySales(payload);
      await refreshProperties();
    } catch (e) {}
  };
  const openEditProperty = (id: string) => {
    setEditPropertyId(id);
    setShowPropertyModal(true);
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

  // Now that backendViewings exists, set up the reminder effect here
  useEffect(() => {
    try {
      const now = Date.now();
      const THIRTY_MIN = 30 * 60 * 1000;
      (backendViewings || []).forEach((v: any) => {
        const whenTs = new Date(v.when).getTime();
        const timeUntil = whenTs - now;
        if (timeUntil > 0 && timeUntil <= THIRTY_MIN && (v.status === 'Scheduled' || !v.status)) {
          const id = String(v._id || whenTs);
          if (!viewingNotifiedRef.current.has(id)) {
            viewingNotifiedRef.current.add(id);
            const propertyName = backendPropsById[v.propertyId]?.name || 'Property';
            addNotification({
              id: `viewing-${id}`,
              title: 'Viewing starting soon',
              message: `${propertyName} at ${new Date(v.when).toLocaleTimeString()}`,
              link: '/sales-dashboard',
              read: false,
              createdAt: new Date()
            });
          }
        }
      });
    } catch {}
  }, [backendViewings, backendPropsById, addNotification]);
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
          <button
            className="ml-3 px-3 py-2 rounded-xl border text-sm bg-slate-100 hover:bg-slate-200"
            onClick={async ()=>{ try { await logout(); } catch {} finally { navigate('/login'); } }}
            title="Logout"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
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

        {/* Commission card under KPI cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Commission</CardTitle>
            </CardHeader>
            <CardContent>
              <CommissionSummary />
              <div className="mt-2">
                <button className="text-sm underline" onClick={()=>window.dispatchEvent(new CustomEvent('open-commission-drilldown'))}>View details</button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Tab bar (hidden on Files section) */}
        {!location.pathname.includes('/sales-dashboard/files') && (
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
        )}

        {/* Tabs content */}
        {location.pathname.endsWith('/sales-dashboard/leads') && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <SalesLeadsPage />
            </CardContent>
          </Card>
        )}
        {location.pathname.endsWith('/sales-dashboard/files') && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Properties</CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search properties" value={query} onChange={e=>setQuery(e.target.value)} className="max-w-xs" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2">Property</th>
                      <th className="py-2">Address</th>
                      <th className="py-2">Owner</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered(
                      (backendProperties || []).map((bp: any) => ({
                        id: bp._id,
                        title: bp.name,
                        address: bp.address,
                        owner: propertyIdToOwnerDetails[getId(bp._id)]?.name || '—',
                        status: (bp.status || 'available') === 'under_offer' ? 'Under Offer' : (bp.status || 'available') === 'sold' ? 'Sold' : 'Available'
                      })),
                      ["title","address","owner"]
                    ).map(p => (
                      <tr key={p.id} className="border-t">
                        <td className="py-2 font-medium">
                          <button className="underline" onClick={()=>navigate(`/sales-dashboard/files/${p.id}`)}>{p.title}</button>
                        </td>
                        <td className="py-2">{p.address}</td>
                        <td className="py-2">{p.owner}</td>
                        <td className="py-2"><Badge className={propertyColors[p.status]}>{p.status}</Badge></td>
                        <td className="py-2">
                          <button className="text-xs underline" onClick={()=>navigate(`/sales-dashboard/files/${p.id}`)}>Open</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {(() => {
          const m = location.pathname.match(/\/sales-dashboard\/files\/(?<id>[^/]+)$/);
          if (!m) return null;
          const id = m.groups?.id as string;
          const bp = backendPropsById[id];
          if (!bp) return (
            <Card>
              <CardHeader><CardTitle>Property</CardTitle></CardHeader>
              <CardContent>Property not found.</CardContent>
            </Card>
          );
          const owner = propertyIdToOwnerDetails[id];
          const pastViewings = (backendViewings || []).filter(v => String(v.propertyId) === id && new Date(v.when) < new Date());
          const upcomingViewings = (backendViewings || []).filter(v => String(v.propertyId) === id && new Date(v.when) >= new Date());
          const leadsForProperty = (backendLeads || []).filter(l => (l.interest || '').toLowerCase().includes((bp.name || '').toLowerCase()));
          return (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>{bp.name}</CardTitle>
                <div className="text-sm text-slate-500">{bp.address}</div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="text-sm font-semibold">Owner</div>
                  <div className="text-sm text-slate-700">{owner ? `${owner.name}${owner.phone ? ' · ' + owner.phone : ''}` : '—'}</div>
                </div>
                {/* Leads section removed on Files detail page per request */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="text-sm font-semibold mb-1">Upcoming Viewings</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-600">
                            <th className="py-2">When</th>
                            <th className="py-2">Buyer</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {upcomingViewings.map((v: any) => (
                            <tr key={v._id} className="border-t">
                              <td className="py-2">{new Date(v.when).toLocaleString()}</td>
                              <td className="py-2">{buyersById[v.buyerId || '']?.name || '—'}</td>
                              <td className="py-2"><Badge className={viewingColors[v.status]}>{v.status}</Badge></td>
                            </tr>
                          ))}
                          {upcomingViewings.length === 0 && (
                            <tr><td className="py-2 text-slate-500" colSpan={3}>No upcoming viewings.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">Past Viewings</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-600">
                            <th className="py-2">When</th>
                            <th className="py-2">Buyer</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pastViewings.map((v: any) => (
                            <tr key={v._id} className="border-t">
                              <td className="py-2">{new Date(v.when).toLocaleString()}</td>
                              <td className="py-2">{buyersById[v.buyerId || '']?.name || '—'}</td>
                              <td className="py-2"><Badge className={viewingColors[v.status]}>{v.status}</Badge></td>
                            </tr>
                          ))}
                          {pastViewings.length === 0 && (
                            <tr><td className="py-2 text-slate-500" colSpan={3}>No past viewings.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-1">Documents</div>
                  <div className="text-xs text-slate-500 mb-2">Upload and download sales documents (stored in property-management files collection)</div>
                  <SalesDocuments propertyId={id} />
                </div>
              </CardContent>
            </Card>
          );
        })()}
        {location.pathname.endsWith('/sales-dashboard/notifications') && (
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(notifications || []).length === 0 && (
                  <div className="text-sm text-slate-500">No notifications</div>
                )}
                {(notifications || []).map(n => (
                  <div key={n.id} className="flex items-start justify-between p-3 rounded-xl border">
                    <div>
                      <div className={cls("text-sm font-medium", !n.read && "text-slate-900")}>{n.title}</div>
                      <div className="text-xs text-slate-600">{n.message}</div>
                      {n.createdAt && (<div className="text-[11px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</div>)}
                    </div>
                    {n.link && (
                      <button className="text-xs underline" onClick={()=>navigate(n.link!)}>View</button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!location.pathname.includes('/sales-dashboard/files') && tab === "Leads" && (
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
                      (backendProperties || []).map(bp => {
                        const raw = (bp.status || 'available');
                        const human = raw === 'available'
                          ? 'Available'
                          : raw === 'under_offer'
                            ? 'Under Offer'
                            : raw === 'sold' || raw === 'rented'
                              ? 'Sold'
                              : 'Available';
                        return ({
                          id: bp._id,
                          title: bp.name,
                          address: bp.address,
                          price: bp.price ?? bp.rent,
                          bedrooms: bp.bedrooms || 0,
                          bathrooms: bp.bathrooms || 0,
                          status: human
                        });
                      }),
                      ["address","notes"]
                    ).map(p => (
                      <tr key={p.id} className="border-t">
                        <td className="py-2">{p.address}</td>
                        <td className="py-2">
                          {(() => {
                            const details = propertyIdToOwnerDetails[p.id];
                            if (!details) return "—";
                            const parts = [details.name, details.phone].filter(Boolean);
                            return parts.join(" · ");
                          })()}
                        </td>
                        <td className="py-2">{money(p.price)}</td>
                        <td className="py-2">{p.bedrooms} / {p.bathrooms}</td>
                        <td className="py-2"><Badge className={propertyColors[p.status]}>{p.status}</Badge></td>
                        <td className="py-2 flex gap-2">
                          <button
                            className="text-xs px-2 py-1 rounded-lg border bg-slate-100 hover:bg-slate-200"
                            onClick={() => openEditProperty(p.id)}
                          >Edit</button>
                          {['Available','Under Offer','Sold'].map(s => (
                            <button key={s} className={cls('text-xs px-2 py-1 rounded-lg border', p.status===s?'bg-transparent text-slate-900 border-slate-900':'bg-slate-100 hover:bg-slate-200')} onClick={()=>markPropertyStatus(p.id, s)}>{s}</button>
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
      <PropertyModal
        open={showPropertyModal}
        onClose={() => { setShowPropertyModal(false); setEditPropertyId(null); }}
        onSubmit={async (values) => {
          if (editPropertyId) {
            try {
              const payload: any = {
                name: values.title,
                address: values.address,
                price: Number(values.price || 0),
                bedrooms: Number(values.bedrooms || 0),
                bathrooms: Number(values.bathrooms || 0),
                description: values.notes || '',
                status: (values.status || 'Available').toLowerCase().replace(' ', '_'),
                builtArea: Number(values.builtArea || 0),
                landArea: Number(values.landArea || 0),
                saleType: values.saleType || 'cash',
                commission: Number(values.commission || 0),
                commissionPreaPercent: Number(values.commissionPreaPercent || 3),
                commissionAgencyPercentRemaining: Number(values.commissionAgencyPercentRemaining || 50),
                commissionAgentPercentRemaining: Number(values.commissionAgentPercentRemaining || 50),
              };
              if (values.ownerId) payload.propertyOwnerId = values.ownerId;
              await propertyService.updateProperty(editPropertyId, payload);
              await refreshProperties();
            } catch (e) {}
          } else {
            await handleCreateProperty(values);
          }
        }}
        owners={(owners || []).map(o => ({ id: o._id, name: `${o.firstName || ''} ${o.lastName || ''}`.trim() }))}
        editing={Boolean(editPropertyId)}
        initial={(() => {
          if (!editPropertyId) return undefined;
          const bp = (backendProperties || []).find((x: any) => x._id === editPropertyId);
          if (!bp) return undefined;
          return {
            title: bp.name,
            address: bp.address,
            price: bp.price ?? '',
            bedrooms: bp.bedrooms ?? 0,
            bathrooms: bp.bathrooms ?? 0,
            status: (bp.status || 'available') === 'under_offer' ? 'Under Offer' : (bp.status || 'available') === 'sold' ? 'Sold' : 'Available',
            ownerId: (bp as any).propertyOwnerId || undefined,
            notes: bp.description || '',
            builtArea: bp.builtArea || '',
            landArea: bp.landArea || '',
            saleType: (bp as any).saleType || 'cash',
            commission: (bp as any).commission ?? 5,
            commissionPreaPercent: (bp as any).commissionPreaPercent ?? 3,
            commissionAgencyPercentRemaining: (bp as any).commissionAgencyPercentRemaining ?? 50,
            commissionAgentPercentRemaining: (bp as any).commissionAgentPercentRemaining ?? 50,
          };
        })()}
      />
      <ViewingModal open={showViewingModal} onClose={()=>setShowViewingModal(false)} onSubmit={addViewing} buyers={(backendBuyers || []).map((b: any) => ({ id: b._id, name: b.name }))} properties={(backendProperties || []).map((p: any) => ({ id: p._id, title: p.name }))} />
      <DealModal open={showDealModal} onClose={()=>setShowDealModal(false)} onSubmit={addDeal} buyers={(backendBuyers || []).map((b: any) => ({ id: b._id, name: b.name }))} properties={(backendProperties || []).map((p: any) => ({ id: p._id, title: p.name }))} />

      <CommissionDrilldown />

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

function PropertyModal({ open, onClose, onSubmit, owners, editing, initial }) {
  const [form, setForm] = useState({ title: initial?.title || "", address: initial?.address || "", price: initial?.price || "", bedrooms: initial?.bedrooms ?? 3, bathrooms: initial?.bathrooms ?? 2, status: initial?.status || "Available", ownerId: initial?.ownerId || owners[0]?.id, notes: initial?.notes || "", builtArea: initial?.builtArea || "", landArea: initial?.landArea || "", saleType: (initial?.saleType || 'cash'), commission: initial?.commission ?? 5, commissionPreaPercent: initial?.commissionPreaPercent ?? 3, commissionAgencyPercentRemaining: initial?.commissionAgencyPercentRemaining ?? 50, commissionAgentPercentRemaining: initial?.commissionAgentPercentRemaining ?? 50 });
  useEffect(()=>{
    if (open) {
      setForm({ title: initial?.title || "", address: initial?.address || "", price: initial?.price || "", bedrooms: initial?.bedrooms ?? 3, bathrooms: initial?.bathrooms ?? 2, status: initial?.status || "Available", ownerId: initial?.ownerId || owners[0]?.id, notes: initial?.notes || "", builtArea: initial?.builtArea || "", landArea: initial?.landArea || "", saleType: (initial?.saleType || 'cash'), commission: initial?.commission ?? 5, commissionPreaPercent: initial?.commissionPreaPercent ?? 3, commissionAgencyPercentRemaining: initial?.commissionAgencyPercentRemaining ?? 50, commissionAgentPercentRemaining: initial?.commissionAgentPercentRemaining ?? 50 });
    }
  }, [open, owners, initial]);
  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Property" : "Add Property"}>
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
          <label className="text-sm">Built Area (sqm)</label>
          <Input type="number" value={form.builtArea} onChange={e=>setForm({ ...form, builtArea: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Land Area (sqm)</label>
          <Input type="number" value={form.landArea} onChange={e=>setForm({ ...form, landArea: e.target.value })} />
        </div>
        <div>
          <label className="text-sm">Status</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.status} onChange={e=>setForm({ ...form, status: e.target.value })}>
            {Object.keys(propertyColors).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm">Sale Type</label>
          <select className="w-full px-3 py-2 rounded-xl border" value={form.saleType} onChange={e=>setForm({ ...form, saleType: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="installment">Installment</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Notes</label>
          <Textarea rows={3} value={form.notes} onChange={e=>setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm">Commission %</label>
            <Input type="number" value={form.commission} onChange={e=>setForm({ ...form, commission: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-sm">PREA % of Commission</label>
            <Input type="number" value={form.commissionPreaPercent} onChange={e=>setForm({ ...form, commissionPreaPercent: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-sm">Agency % of Remaining</label>
            <Input type="number" value={form.commissionAgencyPercentRemaining} onChange={e=>setForm({ ...form, commissionAgencyPercentRemaining: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-sm">Agent % of Remaining</label>
            <Input type="number" value={form.commissionAgentPercentRemaining} onChange={e=>setForm({ ...form, commissionAgentPercentRemaining: Number(e.target.value) })} />
          </div>
        </div>
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button className="bg-slate-900 text-white border-slate-900" type="submit">{editing ? 'Update Property' : 'Save Property'}</Button>
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

function CommissionSummary() {
  const { user } = useAuth();
  const [total, setTotal] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Fetch sales payments for this company and this agent via public endpoint
        const resp = await paymentService.getAllPublic(user?.companyId, { paymentType: 'sale', agentId: user?._id });
        const data = Array.isArray(resp?.data) ? resp.data : [];
        const sum = data
          .filter((p: any) => (p.paymentType === 'sale'))
          .reduce((s: number, p: any) => s + Number(p?.commissionDetails?.agentShare || 0), 0);
        if (active) setTotal(sum);
      } catch (e) {
        if (active) setTotal(0);
      }
    })();
    return () => { active = false; };
  }, [user?.companyId]);
  return (
    <>
      <div className="text-3xl font-bold">{money(total)}</div>
      <div className="text-sm text-slate-500">Agent Share (all sales)</div>
    </>
  );
}

function CommissionDrilldown() {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    const handler = async () => {
      try {
        setOpen(true);
        setLoading(true);
        const u = user?._id || '';
        if (!u) return;
        const resp = await fetch(`/api/users/${u}/commission?saleOnly=true&limit=10`, { credentials: 'include' });
        const data = await resp.json();
        const list = Array.isArray(data?.items) ? data.items : [];
        setItems(list);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    const listener = () => { handler(); };
    window.addEventListener('open-commission-drilldown', listener as any);
    return () => window.removeEventListener('open-commission-drilldown', listener as any);
  }, [user?._id]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={()=>setOpen(false)} />
      <div className="relative w-full mx-4 max-w-xl bg-white rounded-2xl shadow-xl border">
        <div className="p-4 border-b flex items-center justify-between rounded-t-2xl">
          <h3 className="text-lg font-semibold">Recent Sales Payments</h3>
          <button onClick={()=>setOpen(false)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200">✕</button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2">Date</th>
                    <th className="py-2">Reference</th>
                    <th className="py-2">Agent Share</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td className="py-4 text-center text-slate-500" colSpan={3}>No recent sales payments</td></tr>
                  ) : items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="py-2 whitespace-nowrap">{new Date(it.date).toLocaleDateString()}</td>
                      <td className="py-2">{it.referenceNumber || it.manualPropertyAddress || it.id}</td>
                      <td className="py-2">${Number(it.agentShare || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


