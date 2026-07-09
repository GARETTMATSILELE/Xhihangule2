import React, { useEffect, useMemo, useState } from 'react';
import paymentService from '../../../services/paymentService';
import { Payment } from '../../../types/payment';
import {
  buildRecentSaleTransactions,
  formatReportCurrency,
  printDisbursementReport,
  printRecentSaleTransactionsTable,
} from '../../../utils/partyStatementReports';

const MONTHS = [
  { v: 1, l: 'Jan' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Apr' },
  { v: 5, l: 'May' }, { v: 6, l: 'Jun' }, { v: 7, l: 'Jul' }, { v: 8, l: 'Aug' },
  { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dec' },
];

interface RecentSaleTransactionsReportProps {
  companyName?: string;
}

const RecentSaleTransactionsReport: React.FC<RecentSaleTransactionsReportProps> = ({ companyName }) => {
  const now = new Date();
  const [salePayments, setSalePayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesTxYear, setSalesTxYear] = useState(now.getFullYear());
  const [salesTxMonth, setSalesTxMonth] = useState(now.getMonth() + 1);
  const [salesTxLimit, setSalesTxLimit] = useState(25);
  const [buyerFilter, setBuyerFilter] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [saleAgentId, setSaleAgentId] = useState('all');
  const [agentsById, setAgentsById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const agents = await paymentService.getAgents('sales').catch(() => []);
        if (cancelled) return;
        const map: Record<string, string> = {};
        (Array.isArray(agents) ? agents : []).forEach((a: { _id?: string; id?: string; firstName?: string; lastName?: string; name?: string; email?: string }) => {
          const id = String(a._id || a.id || '');
          const name = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.name || a.email || id;
          if (id) map[id] = name;
        });
        setAgentsById(map);
      } catch { /* agents optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const start = new Date(salesTxYear, salesTxMonth - 1, 1);
        const end = new Date(salesTxYear, salesTxMonth, 0, 23, 59, 59, 999);
        const saleOnly = await paymentService.getPayments({
          paymentType: 'sale',
          status: 'completed',
          startDate: start,
          endDate: end,
        }).catch(() => []);
        if (!cancelled) setSalePayments(Array.isArray(saleOnly) ? saleOnly : []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load sale transactions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [salesTxYear, salesTxMonth]);

  const agentOptions = useMemo(
    () => Object.entries(agentsById).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [agentsById]
  );

  const recentSaleTransactions = useMemo(
    () => buildRecentSaleTransactions(salePayments, {
      salesTxYear,
      salesTxMonth,
      salesTxLimit,
      saleAgentId,
      buyerFilter,
      sellerFilter,
      agentsById,
    }),
    [salePayments, salesTxYear, salesTxMonth, salesTxLimit, saleAgentId, buyerFilter, sellerFilter, agentsById]
  );

  const periodLabel = `${MONTHS.find(m => m.v === salesTxMonth)?.l || salesTxMonth} ${salesTxYear}`;

  if (loading) {
    return <div className="p-4 bg-white rounded shadow flex justify-center items-center h-40 text-gray-500">Loading sale transactions…</div>;
  }

  if (error) {
    return <div className="p-4 bg-white rounded shadow text-red-500">{error}</div>;
  }

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold">Recent Sale Transactions</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => printRecentSaleTransactionsTable(recentSaleTransactions, periodLabel, companyName)}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Print All
          </button>
          <label className="text-gray-500">Month</label>
          <select className="border rounded px-2 py-1" value={salesTxMonth} onChange={(e) => setSalesTxMonth(Number(e.target.value))}>
            {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <label className="text-gray-500">Year</label>
          <select className="border rounded px-2 py-1" value={salesTxYear} onChange={(e) => setSalesTxYear(Number(e.target.value))}>
            {Array.from({ length: 10 }).map((_, i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
          <label className="text-gray-500">Show</label>
          <select className="border rounded px-2 py-1" value={salesTxLimit} onChange={(e) => setSalesTxLimit(Number(e.target.value))}>
            {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="text-gray-500">Buyer</label>
          <input value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} placeholder="Search buyer" className="border rounded px-2 py-1" />
          <label className="text-gray-500">Seller</label>
          <input value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} placeholder="Search seller" className="border rounded px-2 py-1" />
          <label className="text-gray-500">Agent</label>
          <select value={saleAgentId} onChange={(e) => setSaleAgentId(e.target.value)} className="border rounded px-2 py-1">
            <option value="all">All agents</option>
            {agentOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm border-collapse">
          <thead>
            <tr className="text-gray-500">
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Property address</th>
              <th className="py-2 pr-2">Buyer</th>
              <th className="py-2 pr-2">Seller</th>
              <th className="py-2 pr-2">Agent</th>
              <th className="text-right py-2 px-2">Total sale</th>
              <th className="text-right py-2 px-2">Commission %</th>
              <th className="text-right py-2 px-2">Total commission</th>
              <th className="text-right py-2 px-2">Prea fee</th>
              <th className="text-right py-2 px-2">Agent share</th>
              <th className="text-right py-2 px-2">Agency share</th>
              <th className="text-right py-2 pl-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {recentSaleTransactions.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="py-2 pr-2 whitespace-nowrap">{t.date}</td>
                <td className="py-2 pr-2 whitespace-nowrap">{t.propertyAddress}</td>
                <td className="py-2 pr-2 whitespace-nowrap">{t.buyer || '-'}</td>
                <td className="py-2 pr-2 whitespace-nowrap">{t.seller || '-'}</td>
                <td className="py-2 pr-2 whitespace-nowrap">{t.primaryAgentName || '-'}</td>
                <td className="text-right py-2 px-2">{formatReportCurrency(t.amount)}</td>
                <td className="text-right py-2 px-2">{t.pct}%</td>
                <td className="text-right py-2 px-2">{formatReportCurrency(t.totalCommission)}</td>
                <td className="text-right py-2 px-2">{formatReportCurrency(t.preafee)}</td>
                <td className="text-right py-2 px-2">{formatReportCurrency(t.agentShare)}</td>
                <td className="text-right py-2 px-2">{formatReportCurrency(t.agencyShare)}</td>
                <td className="text-right py-2 pl-2">
                  <button
                    type="button"
                    onClick={() => printDisbursementReport(t, companyName)}
                    className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                  >
                    Print
                  </button>
                </td>
              </tr>
            ))}
            {recentSaleTransactions.length === 0 && (
              <tr>
                <td colSpan={12} className="py-6 text-center text-gray-400">No sale transactions for the selected period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentSaleTransactionsReport;
