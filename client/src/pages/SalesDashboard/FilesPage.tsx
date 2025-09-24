import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProperties } from '../../contexts/PropertyContext';
import { usePropertyOwnerService } from '../../services/propertyOwnerService';
import api from '../../api/axios';

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
const Badge = ({ children, className = '' }: any) => (
  <span className={cls('inline-flex items-center px-2 py-1 rounded-full text-xs border', className)}>{children}</span>
);

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
      const res = await api.get(`/sales-files`, { params: { propertyId } });
      const arr = Array.isArray(res.data?.files) ? res.data.files : (Array.isArray(res.data) ? res.data : []);
      setFiles(arr);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load documents');
      setFiles([]);
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
      await api.post('/sales-files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
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
      const res = await api.get(`/sales-files/${id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {}
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
                <td className="py-2">
                  <button className="text-xs underline" onClick={()=>onDownload(f._id, f.fileName)}>Download</button>
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

export function FilesPage() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const { properties } = useProperties();
  const ownerService = usePropertyOwnerService();
  const [query, setQuery] = React.useState('');
  const [ownersById, setOwnersById] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    (async () => {
      try {
        const res: any = await ownerService.getAll();
        const arr = Array.isArray(res?.owners) ? res.owners : (Array.isArray(res) ? res : []);
        const map: Record<string, any> = {};
        arr.forEach((o: any) => { if (o._id) map[o._id] = o; });
        setOwnersById(map);
      } catch {}
    })();
  }, [ownerService]);

  const ownerOf = (p: any) => {
    const id = typeof p.propertyOwnerId === 'object' && p.propertyOwnerId?.$oid ? p.propertyOwnerId.$oid : (p.propertyOwnerId || p.ownerId);
    const o = ownersById[String(id)];
    if (!o) return '—';
    const name = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.name || 'Owner';
    return name;
  };

  if (propertyId) {
    const bp = (properties || []).find((x: any) => x._id === propertyId);
    if (!bp) return (
      <div className="p-4 max-w-5xl mx-auto">
        <Card>
          <CardHeader><CardTitle>Property</CardTitle></CardHeader>
          <CardContent>Property not found.</CardContent>
        </Card>
      </div>
    );
    return (
      <div className="p-4 max-w-5xl mx-auto space-y-6">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>{bp.name}</CardTitle>
            <div className="text-sm text-slate-500">{bp.address}</div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="text-sm font-semibold">Owner</div>
              <div className="text-sm text-slate-700">{ownerOf(bp)}</div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1">Documents</div>
              <SalesDocuments propertyId={propertyId} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filtered = (items: any[], fields: string[]) => items.filter(it => {
    if (!query) return true;
    const hay = fields.map(f => String(it[f] ?? "")).join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Properties</CardTitle>
          <Input placeholder="Search properties" value={query} onChange={(e: any)=>setQuery(e.target.value)} className="max-w-xs" />
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
                {filtered((properties || []).map((bp: any) => ({
                  id: bp._id,
                  title: bp.name,
                  address: bp.address,
                  owner: ownerOf(bp),
                  status: (bp.status || 'available') === 'under_offer' ? 'Under Offer' : (bp.status || 'available') === 'sold' ? 'Sold' : 'Available'
                })), ["title","address","owner"]).map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-2 font-medium">
                      <button className="underline" onClick={()=>navigate(`/sales-dashboard/files/${p.id}`)}>{p.title}</button>
                    </td>
                    <td className="py-2">{p.address}</td>
                    <td className="py-2">{p.owner}</td>
                    <td className="py-2"><Badge className={cls(p.status === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : p.status === 'Under Offer' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-100 text-gray-600 border-gray-200')}>{p.status}</Badge></td>
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
    </div>
  );
}

export default FilesPage;




