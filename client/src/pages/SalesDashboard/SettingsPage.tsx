// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../api';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { useLocation, useNavigate } from 'react-router-dom';

const cls = (...s: any[]) => s.filter(Boolean).join(' ');

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
const Button = ({ children, className = "", onClick, type = "button", disabled = false }) => (
  <button type={type} onClick={onClick} disabled={disabled} className={cls("px-3 py-2 rounded-xl border text-sm font-medium hover:shadow-sm transition active:scale-[.99] border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed", className)}>
    {children}
  </button>
);
const Input = (props: any) => (
  <input {...props} className={cls("w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring", props.className)} />
);

function AvatarUpload({ onPreview }: { onPreview?: (url: string) => void }) {
  const [file, setFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const onSelect = (e: any) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      try { onPreview && onPreview(url); } catch {}
    }
  };
  const onUpload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      const form = new FormData();
      form.append('avatar', file);
      if (apiService.uploadUserAvatar) {
        try {
          const res = await apiService.uploadUserAvatar(form);
          // If backend returns a URL, use it; otherwise keep preview
          const url = (res?.data?.url || res?.data?.avatarUrl || res?.data?.avatar) as string | undefined;
          if (url && onPreview) onPreview(url);
        } catch {
          // Fallback: keep client-side preview without failing UX
        }
      }
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <input type="file" accept="image/*" onChange={onSelect} />
      <Button onClick={onUpload} className="bg-slate-900 text-white border-slate-900" disabled={uploading || !file}>
        {uploading? 'Uploading…' : 'Upload'}
      </Button>
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

const SalesSettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() => {
    const u: any = user || {};
    return u?.avatar || u?.profile?.avatar || u?.photoUrl || undefined;
  });

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/70 border-b">
        <div className="w-full pl-0 pr-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button className="md:hidden p-2 rounded-xl border bg-slate-100 hover:bg-slate-200" onClick={()=>setSidebarOpen(true)} aria-label="Open menu">☰</button>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="h-9 w-9 rounded-2xl object-cover border border-slate-200" />
            ) : (
              <div className="h-9 w-9 rounded-2xl bg-slate-900 text-white grid place-items-center font-bold">
                {userInitials}
              </div>
            )}
            <div>
              <div className="text-sm text-slate-500">{displayName}</div>
              <h1 className="text-xl font-semibold leading-none">Sales Settings</h1>
            </div>
          </div>
          <div className="flex-1" />
          <div className="ml-3">
            <Button onClick={async ()=>{ try { await logout(); } catch {} finally { navigate('/login'); } }} className="border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100">Logout</Button>
          </div>
        </div>
      </header>

      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        {/* Sidebar */}
        <div className="hidden md:block"><SalesSidebar /></div>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={()=>setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl">
              <SalesSidebar />
            </div>
          </div>
        )}
        <main className="flex-1 space-y-6 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="space-y-3">
                  <div className="text-sm font-medium text-slate-700">Profile Picture</div>
                  <AvatarUpload onPreview={(url) => setAvatarUrl(url)} />
                </section>
                <section className="space-y-3">
                  <div className="text-sm font-medium text-slate-700">Change Password</div>
                  <PasswordChange />
                </section>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default SalesSettingsPage;


