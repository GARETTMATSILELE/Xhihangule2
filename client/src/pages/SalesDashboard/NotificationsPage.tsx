import React from 'react';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { useNotification } from '../../components/Layout/Header';
import { useNavigate } from 'react-router-dom';
import { viewingService } from '../../services/viewingService';
import paymentService from '../../services/paymentService';
import paymentRequestService from '../../services/paymentRequestService';
import { useAuth } from '../../contexts/AuthContext';

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

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, markAllRead } = useNotification();
  const { user } = useAuth() as any;
  const [viewings, setViewings] = React.useState<any[]>([]);
  const [salesPayments, setSalesPayments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [sentRequests, setSentRequests] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [v, pays] = await Promise.all([
          viewingService.list().catch(() => []),
          user?._id ? paymentService.getSalesPayments({ paymentType: 'sale', agentId: user._id }).catch(() => []) : Promise.resolve([])
        ]);
        setViewings(Array.isArray(v) ? v : []);
        setSalesPayments(Array.isArray(pays) ? pays : []);
        // Load sent flags from localStorage
        try {
          const s = new Set<string>();
          (Array.isArray(pays) ? pays : []).forEach((p: any) => {
            const pid = String(p?._id || '');
            if (!pid) return;
            if (localStorage.getItem(`sent_payment_request_${pid}`) === '1') {
              s.add(pid);
            }
          });
          setSentRequests(s);
        } catch {}
      } catch (e: any) {
        setError(e?.message || 'Failed to load notifications data');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?._id]);

  const currency = (n: number, ccy?: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: (ccy === 'ZWL' ? 'ZWL' : 'USD'), maximumFractionDigits: 2 }).format(n || 0);

  const buildDisbursementHtml = (t: any) => {
    const amount = Number((t as any)?.amount || 0);
    const ccy = (t as any)?.currency || 'USD';
    const cd = (t as any)?.commissionDetails || {};
    const totalCommission = Number(cd.totalCommission || 0);
    const preafee = Number(cd.preaFee || cd.preafee || 0);
    const agentShare = Number(cd._distributedAgentShare ?? cd.agentShare ?? 0);
    const agencyShare = Number(cd.agencyShare || 0);
    const vatOnCommission = Number(cd.vatOnCommission || 0);
    const ownerAfterVat = (cd.ownerAmount != null) ? Number(cd.ownerAmount) : Math.max(0, (amount - totalCommission - vatOnCommission));
    const ownerBeforeVat = Math.max(0, (amount - totalCommission));
    const pct = amount ? Number(((totalCommission / amount) * 100).toFixed(2)) : (Number(cd.pct || cd.commissionPct || 0));
    const propertyObj = (t as any)?.propertyId;
    const propertyAddress = (propertyObj && typeof propertyObj === 'object')
      ? (propertyObj.address || propertyObj.name || (t as any)?.manualPropertyAddress || 'Unknown')
      : ((t as any)?.manualPropertyAddress || (t as any)?.property?.address || 'Unknown');
    const buyer = (t as any)?.buyerName || (t as any)?.manualTenantName || (t as any)?.tenant?.fullName || (t as any)?.tenant?.name || '-';
    const seller = (t as any)?.sellerName || '-';
    const paymentMethod = String((t as any)?.paymentMethod || '-');
    const agentName = (t as any)?.agent?.fullName || (t as any)?.agent?.name || (user?.firstName || '').toString();
    const split = (cd.agentSplit || {}) as any;
    const hasSplit = Boolean(split && (Number(split.ownerAgentShare || 0) || Number(split.collaboratorAgentShare || 0)));
    const splitOwnerPct = Number(split.splitPercentOwner || 0);
    const splitCollabPct = Number(split.splitPercentCollaborator || 0);
    const ownerAgentShare = Number(split.ownerAgentShare || 0);
    const collaboratorAgentShare = Number(split.collaboratorAgentShare || 0);
    const ownerAgentName = (split.ownerUserId ? String(split.ownerUserId) : '') as string;
    const collaboratorAgentName = (split.collaboratorUserId ? String(split.collaboratorUserId) : '') as string;

    const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy === 'ZWL' ? 'ZWL' : 'USD', maximumFractionDigits: 2 }).format(n || 0);

    return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Disbursement Report — ${t.referenceNumber || t._id}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; padding: 24px; color: #0f172a; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          h2 { font-size: 14px; margin: 16px 0 8px; }
          .muted { color: #64748b; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .right { text-align: right; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .section { margin-top: 16px; }
          .total { font-weight: 600; }
          .brand { font-weight: 700; font-size: 16px; }
        </style>
      </head>
      <body>
        <h1>Disbursement Report</h1>
        <div class="muted">Reference: ${t.referenceNumber || t._id} • Currency: ${ccy}</div>

        <div class="grid">
          <div>
            <h2>Property & Parties</h2>
            <table>
              <tr><td>Property</td><td>${propertyAddress}</td></tr>
              <tr><td>Buyer</td><td>${buyer}</td></tr>
              <tr><td>Seller</td><td>${seller}</td></tr>
              <tr><td>Agent</td><td>${agentName || '-'}</td></tr>
            </table>
          </div>
          <div>
            <h2>Sale Summary</h2>
            <table>
              <tr><td>Total Sale Amount</td><td class="right">${fmt(amount)}</td></tr>
              <tr><td>Commission %</td><td class="right">${pct || 0}%</td></tr>
              <tr><td>Total Commission</td><td class="right">${fmt(totalCommission)}</td></tr>
              <tr><td>Prea Fee</td><td class="right">${fmt(preafee)}</td></tr>
              <tr><td>Net Commission (after Prea)</td><td class="right">${fmt(Math.max(0, totalCommission - preafee))}</td></tr>
              <tr><td>Payment Method</td><td class="right">${paymentMethod}</td></tr>
            </table>
          </div>
        </div>

        <div class="section">
          <h2>Commission Disbursement</h2>
          <table>
            <thead><tr><th>Recipient</th><th class="right">Amount</th></tr></thead>
            <tbody>
              <tr><td>Agent Share${hasSplit ? ' (Total)' : ' (Requested)'}</td><td class="right">${fmt(agentShare)}</td></tr>
              ${hasSplit ? `<tr><td>• Owner Agent (${splitOwnerPct || 0}%${ownerAgentName ? ', ' + ownerAgentName : ''})</td><td class="right">${fmt(ownerAgentShare)}</td></tr>` : ''}
              ${hasSplit ? `<tr><td>• Collaborator Agent (${splitCollabPct || 0}%${collaboratorAgentName ? ', ' + collaboratorAgentName : ''})</td><td class="right">${fmt(collaboratorAgentShare)}</td></tr>` : ''}
              <tr><td>Agency Share</td><td class="right">${fmt(agencyShare)}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>Owner Settlement</h2>
          <table>
            <tr><td>Owner Amount (before VAT on commission)</td><td class="right">${fmt(ownerBeforeVat)}</td></tr>
            <tr><td>VAT on Commission</td><td class="right">${fmt(vatOnCommission)}</td></tr>
            <tr class="total"><td>Owner Amount (after VAT on commission)</td><td class="right">${fmt(ownerAfterVat)}</td></tr>
          </table>
        </div>
      </body>
    </html>`;
  };

  const sendPaymentRequest = async (t: any) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const html = buildDisbursementHtml(t);
      const payTo = { name: String(user?.firstName || '' || 'Agent').trim() || 'Agent', surname: String((user as any)?.lastName || '').trim() };
      const propertyId = String((t as any)?.propertyId?._id || (t as any)?.propertyId || (t as any)?.property?._id || '');
      const isDevelopment = Boolean((t as any)?.developmentId || (t as any)?.developmentUnitId);
      const payload: any = {
        amount: Number((t as any)?.commissionDetails?._distributedAgentShare ?? (t as any)?.commissionDetails?.agentShare ?? 0),
        currency: (t as any)?.currency === 'ZWL' ? 'ZWL' : 'USD',
        reason: `Commission payout request for sale ${t.referenceNumber || t._id}`,
        notes: `Buyer: ${(t as any)?.buyerName || '-'} | Owner: ${(t as any)?.sellerName || '-'}`,
        payTo,
        reportHtml: html
      };
      // Only include propertyId when not a development-linked sale
      if (propertyId && !isDevelopment) payload.propertyId = propertyId;
      if ((t as any)?.developmentId) payload.developmentId = String((t as any).developmentId);
      if ((t as any)?.developmentUnitId) payload.developmentUnitId = String((t as any).developmentUnitId);
      await paymentRequestService.createPaymentRequest(payload);
      // Send second request to attach reportHtml - fallback for strict schema; instead, re-use the same controller by including meta in body
      // If backend accepts extra fields, we could have included reportHtml above. To be safe, also send a follow-up PATCH is omitted here.
      setSuccess('Payment request sent for approval');
      // Mark this payment as sent (UI + localStorage)
      try {
        const pid = String((t as any)?._id || '');
        if (pid) {
          setSentRequests(prev => {
            const next = new Set(prev);
            next.add(pid);
            return next;
          });
          localStorage.setItem(`sent_payment_request_${pid}`, '1');
          // Notify other components (e.g., sidebar) to recompute counts
          try { window.dispatchEvent(new CustomEvent('paymentRequest:sentChanged')); } catch {}
        }
      } catch {}
    } catch (e: any) {
      setError(e?.message || 'Failed to send payment request');
    } finally {
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
        <div className="flex-1 max-w-5xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Notifications</h1>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 rounded-xl border bg-slate-900 text-white"
                onClick={markAllRead}
                disabled={!notifications?.some(n => !n.read)}
              >
                Mark all as read
              </button>
            </div>
          </div>

          {loading && <div className="mb-3 text-sm text-slate-500">Loading…</div>}
          {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}
          {success && <div className="mb-3 text-sm text-green-600">{success}</div>}

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>General notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(() => {
                  const now = Date.now();
                  const soon = now + 48 * 60 * 60 * 1000;
                  const upcoming = (viewings || []).filter(v => {
                    const ts = new Date(v.when).getTime();
                    return ts >= now && ts <= soon && v.status === 'Scheduled';
                  }).sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
                  const missed = (viewings || []).filter(v => v.status === 'No-show' || (new Date(v.when).getTime() < now && v.status !== 'Done'));
                  if (upcoming.length === 0 && missed.length === 0 && (notifications || []).length === 0) {
                    return <div className="text-sm text-slate-500">No notifications</div>;
                  }
                  return (
                    <>
                      {upcoming.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold mb-1">Upcoming viewings (48h)</div>
                          <div className="space-y-2">
                            {upcoming.map((v: any) => (
                              <div key={v._id} className="flex items-start justify-between p-3 rounded-xl border">
                                <div>
                                  <div className="text-sm">Viewing scheduled</div>
                                  <div className="text-xs text-slate-600">{new Date(v.when).toLocaleString()}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {missed.length > 0 && (
                        <div className="mt-3">
                          <div className="text-sm font-semibold mb-1">Missed viewings</div>
                          <div className="space-y-2">
                            {missed.map((v: any) => (
                              <div key={v._id} className="flex items-start justify-between p-3 rounded-xl border">
                                <div>
                                  <div className="text-sm">Missed viewing</div>
                                  <div className="text-xs text-slate-600">{new Date(v.when).toLocaleString()}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Payment notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(salesPayments || []).length === 0 && (
                  <div className="text-sm text-slate-500">No sale payments recorded for you yet</div>
                )}
                {(salesPayments || []).map((p: any) => {
                  const ccy = p.currency || 'USD';
                  const property = (p as any)?.property?.name || (p as any)?.propertyId?.name || '-';
                  const address = (p as any)?.property?.address || (p as any)?.manualPropertyAddress || '';
                  const buyer = (p as any)?.buyerName || '-';
                  const seller = (p as any)?.sellerName || '-';
                  const agentShare = Number((p as any)?.commissionDetails?._distributedAgentShare ?? (p as any)?.commissionDetails?.agentShare ?? 0);
                  const agencyShare = Number((p as any)?.commissionDetails?.agencyShare ?? 0);
                  const pid = String((p as any)?._id || '');
                  const alreadySent = pid ? sentRequests.has(pid) : false;
                  return (
                    <div key={p._id} className="p-3 rounded-xl border">
                      <div className="text-sm font-medium">Sale payment received — {p.referenceNumber}</div>
                      <div className="text-xs text-slate-600">{property} {address && `· ${address}`}</div>
                      <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>Buyer: <span className="font-medium">{buyer}</span></div>
                        <div>Owner: <span className="font-medium">{seller}</span></div>
                        <div>Amount: <span className="font-medium">{currency(p.amount, ccy)}</span></div>
                        <div>Agent Share: <span className="font-medium">{currency(agentShare, ccy)}</span></div>
                        <div>Agency Share: <span className="font-medium">{currency(agencyShare, ccy)}</span></div>
                      </div>
                      <div className="mt-2">
                        <button
                          className={`px-3 py-1.5 rounded-lg border text-xs ${alreadySent ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white'}`}
                          onClick={() => !alreadySent && sendPaymentRequest(p)}
                          disabled={alreadySent || loading}
                          title={alreadySent ? 'Request already sent' : 'Send to approvals'}
                        >
                          {alreadySent ? 'Sent' : 'Send payment request'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(notifications || []).length === 0 && (
                  <div className="text-sm text-slate-500">No notifications</div>
                )}
                {(notifications || []).map(n => (
                  <div key={n.id} className="flex items-start justify-between p-3 rounded-xl border">
                    <div>
                      <div className={cls('text-sm font-medium', !n.read && 'text-slate-900')}>{n.title}</div>
                      <div className="text-xs text-slate-600">{n.message}</div>
                      {n.createdAt && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {n.link && (
                      <button className="text-xs underline" onClick={() => navigate(n.link!)}>
                        View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}


