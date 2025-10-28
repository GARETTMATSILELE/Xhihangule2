import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import paymentService from '../../services/paymentService';
import { Payment } from '../../types/payment';
import { propertyAccountService } from '../../services/propertyAccountService';
import companyAccountService, { CompanyAccountSummary } from '../../services/companyAccountService';

// Sample data and helpers (no backend wiring yet)
const SAMPLE_DATA = {
  revenue: [
    { date: '2025-01-01', management: 1200, sales: 800 },
    { date: '2025-02-01', management: 1500, sales: 950 },
    { date: '2025-03-01', management: 1700, sales: 1200 },
    { date: '2025-04-01', management: 1400, sales: 900 },
    { date: '2025-05-01', management: 2100, sales: 1600 },
    { date: '2025-06-01', management: 1800, sales: 700 },
    { date: '2025-07-01', management: 2000, sales: 2200 },
    { date: '2025-08-01', management: 2300, sales: 1500 },
    { date: '2025-09-01', management: 2500, sales: 2700 }
  ],
  transactions: [
    { id: 'T-1001', date: '2025-09-10', type: 'Management Commission', agent: 'Audrey M.', amount: 500, property: '14 Baker St' },
    { id: 'T-1002', date: '2025-09-09', type: 'Sales Commission', agent: 'Garett M.', amount: 1500, property: 'Unit 4, Hillside' },
    { id: 'T-1003', date: '2025-08-30', type: 'Management Commission', agent: 'Audrey M.', amount: 350, property: '3 Rose Ave' },
    { id: 'T-1004', date: '2025-08-20', type: 'Sales Commission', agent: 'Mandla P.', amount: 2000, property: 'Plot 22' },
    { id: 'T-1005', date: '2025-07-11', type: 'Management Commission', agent: 'Zoe K.', amount: 420, property: 'Block C, Mews' }
  ],
  agents: [
    { name: 'Audrey M.', total: 8050 },
    { name: 'Garett M.', total: 6200 },
    { name: 'Mandla P.', total: 5100 }
  ],
  agentsSales: [
    { name: 'Garett M.', total: 6200 },
    { name: 'Mandla P.', total: 5100 }
  ],
  agentsRental: [
    { name: 'Audrey M.', total: 8050 },
    { name: 'Zoe K.', total: 4300 }
  ]
};

const COLORS = ['#4F46E5', '#06B6D4'];

function currency(amount: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
}

const ReportsPage: React.FC = () => {
  // Filters (default to current month)
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [drill, setDrill] = useState<null | { type: 'revenue-split' | 'transaction'; filter: any }>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [acctTotals, setAcctTotals] = useState<{ totalIncome: number; totalExpenses: number }>({ totalIncome: 0, totalExpenses: 0 });
  const [companySummary, setCompanySummary] = useState<CompanyAccountSummary | null>(null);
  const [companyTransactions, setCompanyTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trustAccounts, setTrustAccounts] = useState<Array<{ propertyId: string; propertyName?: string; propertyAddress?: string; totalPaid: number; totalPayout: number; held: number; payouts: Array<{ amount: number; depositDate: string; recipientName?: string; referenceNumber?: string; notes?: string }> }>>([]);
  const [trustSearch, setTrustSearch] = useState<string>('');

  // Helpers: use rental period month/year for rentals, payment date for others
  function getEffectiveDateForFilter(p: any): Date {
    try {
      if (p?.paymentType === 'rental') {
        const y = Number(p?.rentalPeriodYear);
        const m = Number(p?.rentalPeriodMonth);
        if (y && m) {
          return new Date(y, m - 1, 1);
        }
      }
      return new Date(p?.paymentDate);
    } catch {
      return new Date(p?.paymentDate);
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        // Use same source as dashboard cards for consistency
        const [all, accounts, summary, tx, deposits] = await Promise.all([
          paymentService.getPayments(),
          propertyAccountService.getCompanyPropertyAccounts().catch(() => []),
          companyAccountService.getSummary().catch(() => null),
          companyAccountService.getTransactions().catch(() => null),
          paymentService.getCompanyDepositSummaries().catch(() => [])
        ]);
        setPayments(Array.isArray(all) ? all : []);
        try {
          const totals = (accounts as any[]).reduce((acc: any, a: any) => {
            acc.totalIncome += Number(a.totalIncome || 0);
            acc.totalExpenses += Number(a.totalExpenses || 0);
            return acc;
          }, { totalIncome: 0, totalExpenses: 0 });
          setAcctTotals({ totalIncome: totals.totalIncome, totalExpenses: totals.totalExpenses });
        } catch {}
        setCompanySummary(summary as any);
        setCompanyTransactions(Array.isArray((tx as any)?.transactions) ? (tx as any).transactions : (Array.isArray(tx as any) ? (tx as any) : []));
        setTrustAccounts(Array.isArray(deposits) ? deposits : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [from, to]);

  const agentsAgg = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const sales = new Map<string, number>();
    const rental = new Map<string, number>();
    (payments || []).forEach(p => {
      const t = getEffectiveDateForFilter(p).getTime();
      if (t < startMs || t > endMs) return;
      const agentObj = (p as any).agentId;
      const name = agentObj && typeof agentObj === 'object'
        ? (`${agentObj.firstName || ''} ${agentObj.lastName || ''}`.trim() || (p as any).agentName || 'Unknown')
        : (p as any).agentName || 'Unknown';
      const val = Number((p as any).commissionDetails?.agencyShare) || 0;
      if (p.paymentType === 'sale') sales.set(name, (sales.get(name) || 0) + val);
      else rental.set(name, (rental.get(name) || 0) + val);
    });
    const toArr = (m: Map<string, number>) => Array.from(m.entries()).map(([name, total]) => ({ name, total })).sort((a,b)=>b.total-a.total);
    const salesArr = toArr(sales);
    const rentalArr = toArr(rental);
    return { salesArr, rentalArr, topSales: salesArr[0], topRental: rentalArr[0] };
  }, [payments, from, to]);

  // Derived data
  const filteredRevenue = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const map = new Map<string, { date: string; management: number; sales: number }>();
    (payments || []).forEach(p => {
      const t = getEffectiveDateForFilter(p).getTime();
      if (t < startMs || t > endMs) return;
      const d = getEffectiveDateForFilter(p);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
      const cur = map.get(key) || { date: key, management: 0, sales: 0 };
      const agencyShare = Number((p as any).commissionDetails?.agencyShare) || 0;
      if (p.paymentType === 'sale') {
        cur.sales += agencyShare;
      } else if (p.paymentType === 'rental') {
        cur.management += agencyShare;
      }
      map.set(key, cur);
    });
    const arr = Array.from(map.values()).sort((a,b)=> new Date(a.date).getTime()-new Date(b.date).getTime());
    return arr.map(r => ({ ...r, total: r.management + r.sales }));
  }, [payments, from, to]);

  const totalManagement = useMemo(() => filteredRevenue.reduce((s, r: any) => s + r.management, 0), [filteredRevenue]);
  const totalSales = useMemo(() => filteredRevenue.reduce((s, r: any) => s + r.sales, 0), [filteredRevenue]);
  const netTotal = totalManagement + totalSales;

  // Company expenses for the selected period (align with Revenue page logic)
  const expensesForPeriod = useMemo(() => {
    const txs = Array.isArray(companyTransactions) ? companyTransactions : [];
    if (txs.length === 0 && companySummary && typeof companySummary.totalExpenses === 'number') {
      return companySummary.totalExpenses;
    }
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return txs
      .filter((t: any) => {
        const d = new Date(t.date || t.postedAt || t.createdAt || t.updatedAt || Date.now());
        return d >= start && d <= end;
      })
      .reduce((sum: number, t: any) => {
        const amount = (typeof t.amount === 'number')
          ? t.amount
          : (typeof t.debit === 'number' || typeof t.credit === 'number')
            ? ((t.debit || 0) - (t.credit || 0))
            : 0;
        const isExpense = amount < 0 || t.type === 'expense' || t.category === 'expense' || t.direction === 'debit';
        const expenseAmt = isExpense ? Math.abs(amount || t.amount || t.debit || 0) : 0;
        return sum + expenseAmt;
      }, 0);
  }, [companyTransactions, companySummary, from, to]);

  const balance = useMemo(() => (totalManagement + totalSales) - expensesForPeriod, [totalManagement, totalSales, expensesForPeriod]);

  // Align revenue split with dashboard cards: use agencyShare (company share)
  const agencyRevenue = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();
    let rental = 0;
    let sales = 0;
    (payments || []).forEach((p) => {
      const t = getEffectiveDateForFilter(p).getTime();
      if (t < startMs || t > endMs) return;
      const agencyShare = Number((p as any).commissionDetails?.agencyShare) || 0;
      if (p.paymentType === 'sale') sales += agencyShare;
      else if (p.paymentType === 'rental') rental += agencyShare;
    });
    return { rental, sales };
  }, [payments, from, to]);

  const filteredTransactions = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const rows = (payments || []).filter(p => {
      const t = getEffectiveDateForFilter(p).getTime();
      return t >= startMs && t <= endMs;
    }).map(p => {
      const agentObj = (p as any).agentId;
      const agentName = agentObj && typeof agentObj === 'object' 
        ? ((`${agentObj.firstName || ''} ${agentObj.lastName || ''}`.trim()) || (p as any).agentName || 'Unknown')
        : (p as any).agentName || 'Unknown';
      const propertyObj = (p as any).propertyId;
      const propertyName = propertyObj && typeof propertyObj === 'object'
        ? (propertyObj.name || 'Unknown Property')
        : (p as any).manualPropertyAddress || 'Unknown Property';
      const effectiveDate = getEffectiveDateForFilter(p);
      return { id: p._id, date: effectiveDate.toISOString().slice(0,10), type: p.paymentType === 'sale' ? 'Sales Commission' : 'Management Commission', agent: agentName, amount: p.amount, property: propertyName };
    });
    const filtered = selectedAgent !== 'all' ? rows.filter(r => r.agent === selectedAgent) : rows;
    return filtered.sort((a,b)=> new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0, 25);
  }, [payments, from, to, selectedAgent]);

  // Drill handlers
  function handlePieClick(entry: any) {
    setDrill({ type: 'revenue-split', filter: { kind: entry.name } });
  }

  function handleRowClick(tx: any) {
    setDrill({ type: 'transaction', filter: tx });
  }

  function closeDrill() {
    setDrill(null);
  }

  // Export CSV
  function exportCSV() {
    const rows = filteredTransactions.map((t) => ({ ID: t.id, Date: t.date, Type: t.type, Agent: t.agent, Amount: t.amount, Property: t.property }));
    const header = Object.keys(rows[0] || {}).join(',');
    const csv = [header, ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Print
  function printReport() {
    window.print();
  }

  // Print only Income vs Expenses summary for selected period
  function printIncomeExpensesSummary() {
    try {
      const win = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900');
      if (!win) return;
      const html = `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Income vs Expenses (${from} to ${to})</title>
            <style>
              body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; padding: 24px; color: #0f172a; }
              h1 { font-size: 18px; margin: 0 0 12px; }
              .muted { color: #64748b; font-size: 12px; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
              .right { text-align: right; }
              .total { font-weight: 600; }
              .balance { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; }
              .pos { color: #059669; font-weight: 700; }
              .neg { color: #dc2626; font-weight: 700; }
            </style>
          </head>
          <body>
            <h1>Income vs Expenses</h1>
            <div class="muted">Period: ${from} to ${to}</div>
            <table>
              <thead>
                <tr><th>Income</th><th class="right">Amount (USD)</th></tr>
              </thead>
              <tbody>
                <tr><td>Management Commission</td><td class="right">${currency(totalManagement)}</td></tr>
                <tr><td>Sales Commissions</td><td class="right">${currency(totalSales)}</td></tr>
                <tr class="total"><td>Total Income</td><td class="right">${currency(totalManagement + totalSales)}</td></tr>
              </tbody>
            </table>
            <table>
              <thead>
                <tr><th>Expenses</th><th class="right">Amount (USD)</th></tr>
              </thead>
              <tbody>
                <tr><td>Company Expenses (period)</td><td class="right">${currency(expensesForPeriod)}</td></tr>
                <tr class="total"><td>Total Expenses</td><td class="right">${currency(expensesForPeriod)}</td></tr>
              </tbody>
            </table>
            <div class="balance">
              <div>Balance</div>
              <div class="${(totalManagement + totalSales - expensesForPeriod) >= 0 ? 'pos' : 'neg'}">${(totalManagement + totalSales - expensesForPeriod) >= 0 ? currency(totalManagement + totalSales - expensesForPeriod) : `(${currency(Math.abs((totalManagement + totalSales - expensesForPeriod)))})`}</div>
            </div>
            <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };</script>
          </body>
        </html>`;
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
    } catch {}
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Company Reports</h1>
          <p className="text-sm text-slate-500">Financial overview for commissions and property sales — company-level reports with drill-downs and print/exports.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={printReport} className="btn-primary print:hidden inline-flex items-center gap-2 px-4 py-2 rounded-lg shadow hover:shadow-md">Print report</button>
          <button onClick={exportCSV} className="btn-secondary print:hidden inline-flex items-center gap-2 px-4 py-2 rounded-lg border">Export CSV</button>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="col-span-1 lg:col-span-4 flex gap-4 flex-wrap">
          <div className="bg-white p-4 rounded-2xl shadow w-full md:w-1/3">
            <h3 className="text-sm text-slate-500">Total Revenue</h3>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold">{currency(netTotal)}</div>
              <div className="text-xs text-slate-400">Period: {from} → {to}</div>
            </div>
            <div className="text-sm text-slate-600 mt-2">Mgmt: {currency(totalManagement)} — Sales: {currency(totalSales)}</div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow w-full md:w-1/3">
            <h3 className="text-sm text-slate-500">Average Monthly</h3>
            <div className="text-2xl font-bold">{currency(Math.round(netTotal / Math.max(filteredRevenue.length, 1)))}</div>
            <div className="text-sm text-slate-600 mt-2">Calculated over {filteredRevenue.length} months</div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow w-full md:w-1/3">
            <h3 className="text-sm text-slate-500">Top Agents</h3>
            <div className="mt-1 grid grid-cols-1 gap-2">
              <div className="flex items-baseline justify-between">
                <div className="text-sm text-slate-600">Sales</div>
                <div className="text-sm font-semibold">{(agentsAgg.topSales?.name || agentsAgg.topRental?.name) || '-'}</div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Earnings</span>
                <span>{agentsAgg.topSales ? currency(agentsAgg.topSales.total) : '-'}</span>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <div className="text-sm text-slate-600">Rental</div>
                <div className="text-sm font-semibold">{agentsAgg.topRental?.name || '-'}</div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Earnings</span>
                <span>{agentsAgg.topRental ? currency(agentsAgg.topRental.total) : '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="col-span-2 bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Revenue over time</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">From</label>
              <input aria-label="from-date" className="border rounded px-2 py-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <label className="text-xs text-slate-500">To</label>
              <input aria-label="to-date" className="border rounded px-2 py-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredRevenue} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: any) => currency(Number(value))} />
                <Area type="monotone" dataKey="management" stackId="1" stroke="#4F46E5" fillOpacity={0.3} fill="#4F46E5" />
                <Area type="monotone" dataKey="sales" stackId="1" stroke="#06B6D4" fillOpacity={0.3} fill="#06B6D4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 text-sm text-slate-500">Tip: click the donut chart to drill into source-specific transactions.</div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-2">Revenue split</h2>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={[{ name: 'Management', value: agencyRevenue.rental }, { name: 'Sales', value: agencyRevenue.sales }]} innerRadius={60} outerRadius={90} dataKey="value" onClick={(entry) => handlePieClick(entry)}>
                  <Cell fill={COLORS[0]} />
                  <Cell fill={COLORS[1]} />
                </Pie>
                <Tooltip formatter={(value: any) => currency(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <div>Management</div>
              <div>{currency(agencyRevenue.rental)}</div>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600 mt-1">
              <div>Sales</div>
              <div>{currency(agencyRevenue.sales)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="col-span-2 bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent transactions</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm">Agent</label>
              <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} className="border rounded px-2 py-1">
                <option value="all">All agents</option>
                {SAMPLE_DATA.agents.map((a) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="text-sm text-slate-500">
                  <th className="py-2">ID</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Agent</th>
                  <th>Property</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} tabIndex={0} onClick={() => handleRowClick(tx)} className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50">
                    <td className="py-2">{tx.id}</td>
                    <td>{tx.date}</td>
                    <td>{tx.type}</td>
                    <td>{tx.agent}</td>
                    <td>{tx.property}</td>
                    <td className="text-right">{currency(tx.amount)}</td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">No transactions for the selected range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-2">Top Agents</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Sales Agents</h3>
              <ul className="divide-y">
                {(agentsAgg.salesArr?.length ? agentsAgg.salesArr : SAMPLE_DATA.agentsSales).slice(0,5).map((agent: any) => (
                  <li key={agent.name} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-xs text-slate-500">Sales performance</div>
                      </div>
                      <div className="text-sm font-semibold">{currency(agent.total)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Rental Agents</h3>
              <ul className="divide-y">
                {(agentsAgg.rentalArr?.length ? agentsAgg.rentalArr : SAMPLE_DATA.agentsRental).slice(0,5).map((agent: any) => (
                  <li key={agent.name} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-xs text-slate-500">Management performance</div>
                      </div>
                      <div className="text-sm font-semibold">{currency(agent.total)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Income vs Expenses, Payroll, Taxes, Budget vs Actual, Income Statement, Trust Accounts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Income vs Expenses */}
        <div className="bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Income vs Expenses</h2>
            <button onClick={printIncomeExpensesSummary} className="px-3 py-1 rounded bg-slate-900 text-white">Print</button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-slate-500">From</label>
            <input className="border rounded px-2 py-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <label className="text-xs text-slate-500">To</label>
            <input className="border rounded px-2 py-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <input placeholder="Search" className="border rounded px-2 py-1" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Income</h3>
              <ul className="divide-y text-sm">
                <li className="py-2 flex justify-between"><span>Management Commission</span><span>{currency(totalManagement)}</span></li>
                <li className="py-2 flex justify-between"><span>Sales Commissions</span><span>{currency(totalSales)}</span></li>
                <li className="py-2 flex justify-between font-semibold"><span>Total Income</span><span>{currency(totalManagement + totalSales)}</span></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Expenses</h3>
              <ul className="divide-y text-sm">
                <li className="py-2 flex justify-between"><span>Company Expenses (period)</span><span>{currency(expensesForPeriod)}</span></li>
                <li className="py-2 flex justify-between font-semibold"><span>Total Expenses</span><span>{currency(expensesForPeriod)}</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t flex items-center justify-between">
            <div className="text-sm font-medium">Balance</div>
            <div className={balance >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
              {balance >= 0 ? currency(balance) : `(${currency(Math.abs(balance))})`}
            </div>
          </div>
        </div>

        {/* Payroll Report */}
        <div className="bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Payroll Report</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Month</label>
              <input className="border rounded px-2 py-1" type="month" defaultValue={to.slice(0,7)} />
              <input placeholder="Search employee" className="border rounded px-2 py-1" />
              <button onClick={printReport} className="px-3 py-1 rounded bg-slate-900 text-white">Print</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Employee</th>
                  <th>Role</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="py-2">Alice K.</td><td>Accountant</td><td className="text-right">{currency(1800)}</td><td className="text-right">{currency(220)}</td><td className="text-right">{currency(1580)}</td></tr>
                <tr><td className="py-2">Brian T.</td><td>Sales Agent</td><td className="text-right">{currency(1500)}</td><td className="text-right">{currency(180)}</td><td className="text-right">{currency(1320)}</td></tr>
                <tr className="font-semibold"><td className="py-2">Total</td><td></td><td className="text-right">{currency(3300)}</td><td className="text-right">{currency(400)}</td><td className="text-right">{currency(2900)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Tax Reports */}
        <div className="bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Tax Reports</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Period</label>
              <input className="border rounded px-2 py-1" type="month" defaultValue={to.slice(0,7)} />
              <button onClick={printReport} className="px-3 py-1 rounded bg-slate-900 text-white">Print</button>
            </div>
          </div>
          <ul className="divide-y text-sm">
            <li className="py-2 flex justify-between"><span>PAYE</span><span>{currency(620)}</span></li>
            <li className="py-2 flex justify-between"><span>VAT</span><span>{currency(1450)}</span></li>
            <li className="py-2 flex justify-between"><span>Corporate Tax (Provisional)</span><span>{currency(2100)}</span></li>
            <li className="py-2 flex justify-between font-semibold"><span>Total Taxes</span><span>{currency(4170)}</span></li>
          </ul>
        </div>

        {/* Budget vs Actual */}
        <div className="bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Budget vs Actual</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Year</label>
              <input className="border rounded px-2 py-1" type="number" defaultValue={Number(to.slice(0,4))} />
              <button onClick={printReport} className="px-3 py-1 rounded bg-slate-900 text-white">Print</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Category</th>
                  <th className="text-right">Budget</th>
                  <th className="text-right">Actual</th>
                  <th className="text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="py-2">Income</td><td className="text-right">{currency(24000)}</td><td className="text-right">{currency(22950)}</td><td className="text-right">{currency(-1050)}</td></tr>
                <tr><td className="py-2">Expenses</td><td className="text-right">{currency(11000)}</td><td className="text-right">{currency(9950)}</td><td className="text-right">{currency(1050)}</td></tr>
                <tr className="font-semibold"><td className="py-2">Net</td><td className="text-right">{currency(13000)}</td><td className="text-right">{currency(13000)}</td><td className="text-right">{currency(0)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Income Statement */}
        <div className="bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Income Statement</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">From</label>
              <input className="border rounded px-2 py-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <label className="text-xs text-slate-500">To</label>
              <input className="border rounded px-2 py-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <button onClick={printReport} className="px-3 py-1 rounded bg-slate-900 text-white">Print</button>
            </div>
          </div>
          <ul className="divide-y text-sm">
            <li className="py-2 flex justify-between"><span>Income</span><span>{currency(22950)}</span></li>
            <li className="py-2 flex justify-between"><span>Expenses</span><span>{currency(9950)}</span></li>
            <li className="py-2 flex justify-between font-semibold"><span>Net Profit</span><span>{currency(13000)}</span></li>
          </ul>
        </div>

        {/* Trust Accounts */}
        <div className="bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Trust Accounts (Rental Deposits)</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Search</label>
              <input className="border rounded px-2 py-1" placeholder="Property" value={trustSearch} onChange={(e)=>setTrustSearch(e.target.value)} />
              <button onClick={printReport} className="px-3 py-1 rounded bg-slate-900 text-white">Print</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Property</th>
                  <th>Address</th>
                  <th className="text-right">Held</th>
                  <th className="text-right">Total Paid</th>
                  <th className="text-right">Total Payout</th>
                  <th>Payouts (recent)</th>
                </tr>
              </thead>
              <tbody>
                {trustAccounts
                  .filter((r)=>{
                    if (!trustSearch.trim()) return true;
                    const t = trustSearch.trim().toLowerCase();
                    return (r.propertyName||'').toLowerCase().includes(t) || (r.propertyAddress||'').toLowerCase().includes(t);
                  })
                  .map((row) => (
                  <tr key={row.propertyId}>
                    <td className="py-2">{row.propertyName || row.propertyId}</td>
                    <td>{row.propertyAddress || '-'}</td>
                    <td className="text-right">{currency(row.held || 0)}</td>
                    <td className="text-right">{currency(row.totalPaid || 0)}</td>
                    <td className="text-right">{currency(row.totalPayout || 0)}</td>
                    <td>
                      <div className="flex flex-col gap-1">
                        {(row.payouts||[]).slice(0,3).map((p, idx)=> (
                          <div key={idx} className="text-xs text-slate-600">
                            {new Date(p.depositDate).toLocaleDateString()} — {currency(p.amount)} {p.recipientName ? `to ${p.recipientName}` : ''}
                          </div>
                        ))}
                        {(row.payouts||[]).length === 0 && <div className="text-xs text-slate-400">No payouts</div>}
                      </div>
                    </td>
                  </tr>
                ))}
                {trustAccounts.length > 0 && (
                  <tr className="font-semibold">
                    <td className="py-2">Total</td>
                    <td></td>
                    <td className="text-right">{currency(trustAccounts.reduce((s,r)=> s + (r.held||0), 0))}</td>
                    <td className="text-right">{currency(trustAccounts.reduce((s,r)=> s + (r.totalPaid||0), 0))}</td>
                    <td className="text-right">{currency(trustAccounts.reduce((s,r)=> s + (r.totalPayout||0), 0))}</td>
                    <td></td>
                  </tr>
                )}
                {trustAccounts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">No rental deposits found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Drill modal */}
      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-lg p-6">
            <div className="flex items-start justify-between">
              <div>
                {drill.type === 'revenue-split' && <h3 className="text-lg font-semibold">Details — {drill.filter.kind}</h3>}
                {drill.type === 'transaction' && <h3 className="text-lg font-semibold">Transaction {drill.filter.id}</h3>}
                <p className="text-sm text-slate-500 mt-1">Drill into the data. You can export or print this view.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={closeDrill} className="px-3 py-1 rounded border">Close</button>
                <button onClick={printReport} className="px-3 py-1 rounded bg-slate-900 text-white">Print</button>
              </div>
            </div>

            <div className="mt-4">
              {drill.type === 'revenue-split' && (
                <div>
                  <h4 className="text-sm font-medium">Transactions matching {drill.filter.kind}</h4>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="py-2">ID</th>
                          <th>Date</th>
                          <th>Agent</th>
                          <th className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.filter((t) => t.type.toLowerCase().includes((drill.filter.kind as string).toLowerCase())).map((t) => (
                          <tr key={t.id}>
                            <td className="py-2">{t.id}</td>
                            <td>{t.date}</td>
                            <td>{t.agent}</td>
                            <td className="text-right">{currency(t.amount)}</td>
                          </tr>
                        ))}
                        {filteredTransactions.filter((t) => t.type.toLowerCase().includes((drill.filter.kind as string).toLowerCase())).length === 0 && (
                          <tr><td colSpan={4} className="py-6 text-center text-slate-500">No matching transactions</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {drill.type === 'transaction' && (
                <div className="mt-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-slate-500">Transaction ID</div>
                      <div className="font-medium">{drill.filter.id}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Amount</div>
                      <div className="font-medium">{currency(drill.filter.amount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Date</div>
                      <div className="font-medium">{drill.filter.date}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Agent</div>
                      <div className="font-medium">{drill.filter.agent}</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h4 className="text-sm font-medium">Property</h4>
                    <div className="text-sm text-slate-700">{drill.filter.property}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="text-xs text-slate-400 mt-8">Generated: {new Date().toLocaleString()}. Designed for company-level accounting reports (commissions from property management & sales).</footer>
    </div>
  );
};

export default ReportsPage;
