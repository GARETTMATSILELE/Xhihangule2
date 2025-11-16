import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { useNotification } from './Header';
import paymentService from '../../services/paymentService';

const cls = (...s: any[]) => s.filter(Boolean).join(' ');

const IconDashboard = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h5v8H3v-8zm7 0h11v8H10v-8z"/></svg>
);
const IconFolder = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M10 4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h6z"/></svg>
);
const IconBell = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2 2 0 002-2H10a2 2 0 002 2zm8-6V11a8 8 0 10-16 0v5l-2 2v1h20v-1l-2-2z"/></svg>
);
const IconCog = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.936a7.965 7.965 0 000-1.872l2.036-1.582-1.5-2.598-2.43.982a8.03 8.03 0 00-1.62-.94l-.37-2.56h-3l-.37 2.56a8.03 8.03 0 00-1.62.94l-2.43-.982-1.5 2.598 2.036 1.582a7.965 7.965 0 000 1.872L4.09 14.518l1.5 2.598 2.43-.982c.5.38 1.046.695 1.62.94l.37 2.56h3l.37-2.56c.574-.245 1.12-.56 1.62-.94l2.43.982 1.5-2.598-2.036-1.582zM12 15a3 3 0 110-6 3 3 0 010 6z"/></svg>
);

export const SalesSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { company } = useCompany();
  const { notifications } = useNotification();
  const [pendingSendCount, setPendingSendCount] = React.useState<number>(0);

  // Compute number of sales payments that still show "Send payment request"
  React.useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      try {
        const agentId = (user as any)?._id;
        if (!agentId) {
          if (!cancelled) setPendingSendCount(0);
          return;
        }
        const pays = await paymentService.getSalesPayments({ paymentType: 'sale', agentId });
        const count = (Array.isArray(pays) ? pays : []).reduce((sum, p: any) => {
          const pid = String(p?._id || '');
          if (!pid) return sum;
          const sent = (typeof window !== 'undefined') && localStorage.getItem(`sent_payment_request_${pid}`) === '1';
          return sent ? sum : sum + 1;
        }, 0);
        if (!cancelled) setPendingSendCount(count);
      } catch {
        if (!cancelled) setPendingSendCount(0);
      }
    };
    compute();
    // Recompute when Notifications page marks something as sent
    const onChanged = () => { compute(); };
    window.addEventListener('paymentRequest:sentChanged', onChanged as any);
    return () => { cancelled = true; window.removeEventListener('paymentRequest:sentChanged', onChanged as any); };
  }, [(user as any)?._id]);

  const isActive = (
  key: 'dashboard' | 'files' | 'settings' | 'leads' | 'viewings' | 'buyers' | 'owners' | 'properties' | 'deals' | 'valuations' | 'developments'
  ) => {
    if (key === 'dashboard') {
      return (
        location.pathname === '/sales-dashboard' ||
        (location.pathname.startsWith('/sales-dashboard/') &&
          !location.pathname.includes('/sales-dashboard/files') &&
          !location.pathname.includes('/sales-dashboard/settings') &&
          !location.pathname.includes('/sales-dashboard/leads') &&
          !location.pathname.includes('/sales-dashboard/viewings') &&
          !location.pathname.includes('/sales-dashboard/buyers') &&
          !location.pathname.includes('/sales-dashboard/owners') &&
          !location.pathname.includes('/sales-dashboard/properties') &&
          !location.pathname.includes('/sales-dashboard/deals'))
      );
    }
    if (key === 'files') return location.pathname.includes('/sales-dashboard/files');
    if (key === 'leads') return location.pathname.includes('/sales-dashboard/leads');
    if (key === 'viewings') return location.pathname.includes('/sales-dashboard/viewings');
    if (key === 'buyers') return location.pathname.includes('/sales-dashboard/buyers');
    if (key === 'owners') return location.pathname.includes('/sales-dashboard/owners');
    if (key === 'properties') return location.pathname.includes('/sales-dashboard/properties');
    if (key === 'deals') return location.pathname.includes('/sales-dashboard/deals');
    if (key === 'valuations') return location.pathname.includes('/sales-dashboard/valuations');
    if (key === 'developments') return location.pathname.includes('/sales-dashboard/developments');
    if (key === 'settings') return location.pathname.includes('/sales-dashboard/settings');
    return false;
  };

  if (authLoading) {
    return (
      <aside className="w-60 shrink-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 h-full min-h-[80vh] grid place-items-center text-slate-500 text-sm">Loading…</div>
      </aside>
    );
  }

  return (
    <aside className="w-60 shrink-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 flex flex-col h-full min-h-[80vh]">
        <div className="px-3 py-2 text-xs uppercase tracking-wider text-slate-400">Main menu</div>
        <button className={cls("mt-1 flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-medium", isActive('dashboard')?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200") } onClick={()=>{ navigate('/sales-dashboard'); }}>
          <IconDashboard />
          <span>Dashboard</span>
        </button>
        <button className={cls("mt-2 flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-medium", isActive('files')?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200") } onClick={()=>{ navigate('/sales-dashboard/files'); }}>
          <IconFolder />
          <span>Files</span>
        </button>
        {/* Section quick-links */}
        {(["Leads","Viewings","Buyers","Owners","Properties","Deals","Valuations","Developments"] as const)
          .filter(section => !(location.pathname.includes('/sales-dashboard/files') && section === 'Buyers'))
          .map(section => {
          const key = section.toLowerCase() as 'dashboard' | 'files' | 'settings' | 'leads' | 'viewings' | 'buyers' | 'owners' | 'properties' | 'deals';
          const active = isActive(key as any);
          return (
            <button
              key={section}
              className={cls("mt-2 flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-medium", active?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200")}
              onClick={()=>{
                const pathKey = section.toLowerCase();
                navigate(`/sales-dashboard/${pathKey}`);
              }}
            >
              <span>{section}</span>
            </button>
          );
        })}
        <div className="mt-auto">
          <div className="px-3 py-2 text-xs uppercase tracking-wider text-slate-400">Help & Support</div>
          <button title="Notifications" className="flex items-center justify-between px-3 py-2 rounded-xl border text-sm bg-slate-100 hover:bg-slate-200" onClick={()=>navigate('/sales-dashboard/notifications')}>
            <span className="flex items-center gap-3"><IconBell /> Notifications</span>
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-xs bg-rose-100 text-rose-700 border border-rose-200">{pendingSendCount}</span>
          </button>
          <button title="Settings" className={cls("mt-2 flex items-center gap-3 px-3 py-2 rounded-xl border text-sm", isActive('settings')?"bg-transparent text-slate-900 border-slate-900":"bg-slate-100 hover:bg-slate-200")} onClick={()=>navigate('/sales-dashboard/settings')}>
            <IconCog />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default SalesSidebar;


