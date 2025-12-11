import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import paymentService from '../../services/paymentService';
import { Payment } from '../../types/payment';
import { propertyAccountService } from '../../services/propertyAccountService';
import companyAccountService, { CompanyAccountSummary } from '../../services/companyAccountService';
import { agentAccountService } from '../../services/agentAccountService';

// helpers

const COLORS = ['#4F46E5', '#06B6D4'];

function currency(amount: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
}

type StatementRow = { date: string; property: string; reference: string; amount: number };
type PartyStatement = { id: string; name: string; total: number; count: number; payments: StatementRow[] };
type TenantMonthItem = { period: string; expected: number; paid: number; outstanding: number; rows: StatementRow[] };
type TenantPropertyGroup = { propertyId: string; propertyName: string; months: TenantMonthItem[]; totalPaid: number; totalOutstanding: number };
type TenantPartyStatement = PartyStatement & { properties: TenantPropertyGroup[]; outstandingTotal: number };
type BuyerPropertyGroup = { saleKey: string; propertyId?: string; propertyName: string; expectedTotal?: number; totalPaid: number; outstanding: number; rows: StatementRow[] };
type BuyerPartyStatement = PartyStatement & { properties: BuyerPropertyGroup[]; outstandingTotal: number };

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
  const [agentsById, setAgentsById] = useState<Record<string, string>>({});
  const [salePayments, setSalePayments] = useState<Payment[]>([]);
  const [saleAgentId, setSaleAgentId] = useState<string>('all');
  const [buyerFilter, setBuyerFilter] = useState<string>('');
  const [sellerFilter, setSellerFilter] = useState<string>('');
  const [partySearch, setPartySearch] = useState<string>('');
  // Recent sale transactions month/year filters
  const [salesTxYear, setSalesTxYear] = useState<number>(now.getFullYear());
  const [salesTxMonth, setSalesTxMonth] = useState<number>(now.getMonth() + 1); // 1-12
  // Recent sale transactions display limit
  const [salesTxLimit, setSalesTxLimit] = useState<number>(25);

  // Top Agents card: independent month/year filters and data
  const [topYear, setTopYear] = useState<number>(now.getFullYear());
  const [topMonth, setTopMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [topAgentsLoading, setTopAgentsLoading] = useState<boolean>(false);
  const [topAgentsError, setTopAgentsError] = useState<string | null>(null);
  const [topAgentsData, setTopAgentsData] = useState<{
    year: number;
    month: number;
    sales: Array<{ agentId: string; name: string; email?: string; role: string; total: number }>;
    rental: Array<{ agentId: string; name: string; email?: string; role: string; total: number }>;
    topSales: { agentId: string; name: string; email?: string; role: string; total: number } | null;
    topRental: { agentId: string; name: string; email?: string; role: string; total: number } | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setTopAgentsLoading(true);
        setTopAgentsError(null);
        const data = await agentAccountService.getTopAgents(topYear, topMonth);
        if (!cancelled) setTopAgentsData(data);
      } catch (e: any) {
        if (!cancelled) setTopAgentsError(e?.message || 'Failed to load top agents');
      } finally {
        if (!cancelled) setTopAgentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [topYear, topMonth]);

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

  // Load sale payments for the selected month/year (independent of the global from/to filters)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const start = new Date(salesTxYear, salesTxMonth - 1, 1);
        const end = new Date(salesTxYear, salesTxMonth, 0, 23, 59, 59, 999);
        const saleOnly = await paymentService.getPayments({
          paymentType: 'sale',
          status: 'completed',
          startDate: start,
          endDate: end
        }).catch(() => []);
        if (!cancelled) {
          setSalePayments(Array.isArray(saleOnly) ? saleOnly : []);
        }
      } catch {
        if (!cancelled) setSalePayments([]);
      }
    })();
    return () => { cancelled = true; };
  }, [salesTxYear, salesTxMonth]);

  // Load agents once to resolve owner/collaborator names in commission splits
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const agents = await paymentService.getAgents('sales').catch(() => []);
        if (!mounted) return;
        const map: Record<string, string> = {};
        (Array.isArray(agents) ? agents : []).forEach((a: any) => {
          const id = String(a._id || a.id || '');
          const name = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.name || a.email || id;
          if (id) map[id] = name;
        });
        setAgentsById(map);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const agentOptions = useMemo(() => {
    return Object.entries(agentsById).map(([id, name]) => ({ id, name })).sort((a,b)=> a.name.localeCompare(b.name));
  }, [agentsById]);

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

  // Derived data (from company accounts transactions; uses source to classify)
  const filteredRevenue = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const map = new Map<string, { date: string; management: number; sales: number }>();
    const txs = Array.isArray(companyTransactions) ? companyTransactions : [];
    txs.forEach((t: any) => {
      try {
        const d = new Date(t.date || t.postedAt || t.createdAt || t.updatedAt || Date.now());
        const ts = d.getTime();
        if (ts < startMs || ts > endMs) return;
        if (String(t.type) !== 'income') return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
        const cur = map.get(key) || { date: key, management: 0, sales: 0 };
        const amount = Number(t.amount || 0);
        const source = String(t.source || '').toLowerCase();
        if (source === 'sales_commission') {
          cur.sales += amount;
        } else if (source === 'rental_commission') {
          cur.management += amount;
        } else {
          // ignore 'other' for split; counted neither as management nor sales
        }
        map.set(key, cur);
      } catch {}
    });
    const arr = Array.from(map.values()).sort((a,b)=> new Date(a.date).getTime()-new Date(b.date).getTime());
    return arr.map(r => ({ ...r, total: r.management + r.sales }));
  }, [companyTransactions, from, to]);

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

  // Revenue split from company transactions by source
  const agencyRevenue = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();
    let rental = 0;
    let sales = 0;
    const txs = Array.isArray(companyTransactions) ? companyTransactions : [];
    txs.forEach((t: any) => {
      try {
        const d = new Date(t.date || t.postedAt || t.createdAt || t.updatedAt || Date.now());
        const ts = d.getTime();
        if (ts < startMs || ts > endMs) return;
        if (String(t.type) !== 'income') return;
        const amount = Number(t.amount || 0);
        const source = String(t.source || '').toLowerCase();
        if (source === 'sales_commission') sales += amount;
        else if (source === 'rental_commission') rental += amount;
      } catch {}
    });
    return { rental, sales };
  }, [companyTransactions, from, to]);

  // Utility: parse total sale price from notes (pick the largest number)
  function parseSaleTotalFromNotes(notes?: string): number | undefined {
    try {
      const s = String(notes || '');
      const matches = s.match(/(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?/g);
      if (!matches || matches.length === 0) return undefined;
      const nums = matches
        .map(t => Number(String(t).replace(/[,\s]/g, '')))
        .filter(n => isFinite(n) && n > 0);
      if (nums.length === 0) return undefined;
      return nums.reduce((a, b) => Math.max(a, b), 0);
    } catch {
      return undefined;
    }
  }

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

  // Recent sale transactions (completed) with commission breakdown
  const recentSaleTransactions = useMemo(() => {
    const start = new Date(salesTxYear, salesTxMonth - 1, 1);
    const end = new Date(salesTxYear, salesTxMonth, 0, 23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const rows = (salePayments || [])
      .filter((p: any) => p.paymentType === 'sale' && (p.status === 'completed'))
      .filter((p: any) => {
        const t = getEffectiveDateForFilter(p).getTime();
        return t >= startMs && t <= endMs;
      })
      .filter((p: any) => {
        // Agent filter (matches primary agentId or split owner/collaborator)
        if (saleAgentId === 'all') return true;
        const primaryId = p.agentId && typeof p.agentId === 'object' ? String(p.agentId._id || p.agentId.id || '') : String(p.agentId || '');
        const split = (p.commissionDetails || (p as any).commissionDetails || {})?.agentSplit || {};
        const ownerId = split.ownerUserId ? String(split.ownerUserId) : undefined;
        const collabId = split.collaboratorUserId ? String(split.collaboratorUserId) : undefined;
        return saleAgentId === primaryId || saleAgentId === ownerId || saleAgentId === collabId;
      })
      .filter((p: any) => {
        // Buyer filter
        const needle = buyerFilter.trim().toLowerCase();
        if (!needle) return true;
        const buyer = p.buyerName || p.manualTenantName || ((p.tenantId && typeof p.tenantId === 'object') ? `${p.tenantId.firstName || ''} ${p.tenantId.lastName || ''}`.trim() : '');
        return String(buyer).toLowerCase().includes(needle);
      })
      .filter((p: any) => {
        // Seller filter
        const needle = sellerFilter.trim().toLowerCase();
        if (!needle) return true;
        const seller = p.sellerName || '';
        return String(seller).toLowerCase().includes(needle);
      })
      .map((p: any) => {
        const effectiveDate = getEffectiveDateForFilter(p);
        const propertyObj = p.propertyId;
        const propertyAddress = (propertyObj && typeof propertyObj === 'object')
          ? (propertyObj.address || propertyObj.name || p.manualPropertyAddress || 'Unknown')
          : (p.manualPropertyAddress || 'Unknown');
        const buyer = p.buyerName || p.manualTenantName || ((p.tenantId && typeof p.tenantId === 'object') ? `${p.tenantId.firstName || ''} ${p.tenantId.lastName || ''}`.trim() : '');
        const seller = p.sellerName || '';
        const amount = Number(p.amount || 0);
        const referenceNumber = String(p.referenceNumber || p._id || '');
        const paymentMethod = String(p.paymentMethod || '');
        const currencyCode = String(p.currency || 'USD');
        const primaryAgentId = p.agentId && typeof p.agentId === 'object' ? String(p.agentId._id || p.agentId.id || '') : String(p.agentId || '');
        const primaryAgentName = primaryAgentId ? (agentsById[primaryAgentId] || ((p.agentId && typeof p.agentId === 'object') ? `${p.agentId.firstName || ''} ${p.agentId.lastName || ''}`.trim() : '')) : '';
        const cd = (p.commissionDetails || {}) as any;
        const totalCommission = Number(cd.totalCommission || 0);
        const preafee = Number(cd.preaFee || 0);
        const agentShare = Number(cd.agentShare || 0);
        const agencyShare = Number(cd.agencyShare || 0);
        const vatOnCommission = Number(cd.vatOnCommission || 0);
        const ownerBeforeVat = Number((amount - totalCommission));
        const ownerAfterVat = Number((cd.ownerAmount != null ? cd.ownerAmount : (amount - totalCommission - vatOnCommission)));
        const pct = amount ? Number(((totalCommission / amount) * 100).toFixed(2)) : 0;
        const split = (cd.agentSplit || {}) as any;
        const splitOwnerPct = Number(split.splitPercentOwner || 0);
        const splitCollabPct = Number(split.splitPercentCollaborator || 0);
        const ownerAgentShare = Number(split.ownerAgentShare || 0);
        const collaboratorAgentShare = Number(split.collaboratorAgentShare || 0);
        const ownerUserId = split.ownerUserId ? String(split.ownerUserId) : undefined;
        const collaboratorUserId = split.collaboratorUserId ? String(split.collaboratorUserId) : undefined;
        const ownerAgentName = ownerUserId ? (agentsById[ownerUserId] || ownerUserId) : '';
        const collaboratorAgentName = collaboratorUserId ? (agentsById[collaboratorUserId] || collaboratorUserId) : '';
        return {
          id: p._id,
          date: effectiveDate.toISOString().slice(0,10),
          ts: effectiveDate.getTime(),
          referenceNumber,
          paymentMethod,
          currencyCode,
          primaryAgentName,
          propertyAddress,
          buyer,
          seller,
          amount,
          pct,
          totalCommission,
          preafee,
          agentShare,
          agencyShare,
          vatOnCommission,
          ownerBeforeVat,
          ownerAfterVat,
          hasSplit: Boolean(split && (ownerAgentShare || collaboratorAgentShare)),
          splitOwnerPct,
          splitCollabPct,
          ownerAgentShare,
          collaboratorAgentShare,
          ownerAgentName,
          collaboratorAgentName,
        };
      })
      .sort((a: any,b: any)=> (b.ts || 0) - (a.ts || 0))
      .slice(0, salesTxLimit);
    return rows;
  }, [salePayments, salesTxYear, salesTxMonth, salesTxLimit, agentsById, saleAgentId, buyerFilter, sellerFilter]);

  function printDisbursementReport(t: any) {
    try {
      const html = `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Disbursement Report — ${t.referenceNumber || t.id}</title>
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
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <div class="brand">${(companySummary as any)?.companyName || 'Company'}</div>
            <h1>Disbursement Report</h1>
            <div class="muted">Reference: ${t.referenceNumber || t.id} • Date: ${t.date} • Currency: ${t.currencyCode || 'USD'}</div>

            <div class="grid">
              <div>
                <h2>Property & Parties</h2>
                <table>
                  <tr><td>Property</td><td>${(t.propertyAddress || '').toString()}</td></tr>
                  <tr><td>Buyer</td><td>${(t.buyer || '-').toString()}</td></tr>
                  <tr><td>Seller</td><td>${(t.seller || '-').toString()}</td></tr>
                  <tr><td>Agent</td><td>${(t.primaryAgentName || '-').toString()}</td></tr>
                </table>
              </div>
              <div>
                <h2>Sale Summary</h2>
                <table>
                  <tr><td>Total Sale Amount</td><td class="right">${currency(t.amount)}</td></tr>
                  <tr><td>Commission %</td><td class="right">${t.pct}%</td></tr>
                  <tr><td>Total Commission</td><td class="right">${currency(t.totalCommission)}</td></tr>
                  <tr><td>Prea Fee</td><td class="right">${currency(t.preafee)}</td></tr>
                  <tr><td>Net Commission (after Prea)</td><td class="right">${currency(Math.max(0, (t.totalCommission || 0) - (t.preafee || 0)))}</td></tr>
                  <tr><td>Payment Method</td><td class="right">${(t.paymentMethod || '-').toString()}</td></tr>
                </table>
              </div>
            </div>

            <div class="section">
              <h2>Commission Disbursement</h2>
              <table>
                <thead>
                  <tr><th>Recipient</th><th class="right">Amount</th></tr>
                </thead>
                <tbody>
                  <tr><td>Agent Share${t.hasSplit ? ' (Total)' : ''}</td><td class="right">${currency(t.agentShare)}</td></tr>
                  ${t.hasSplit ? `<tr><td>• Owner Agent (${t.splitOwnerPct || 0}%${t.ownerAgentName ? ', ' + t.ownerAgentName : ''})</td><td class=\"right\">${currency(t.ownerAgentShare)}</td></tr>` : ''}
                  ${t.hasSplit ? `<tr><td>• Collaborator Agent (${t.splitCollabPct || 0}%${t.collaboratorAgentName ? ', ' + t.collaboratorAgentName : ''})</td><td class=\"right\">${currency(t.collaboratorAgentShare)}</td></tr>` : ''}
                  <tr><td>Agency Share</td><td class="right">${currency(t.agencyShare)}</td></tr>
                </tbody>
              </table>
            </div>

            <div class="section">
              <h2>Owner Settlement</h2>
              <table>
                <tr><td>Owner Amount (before VAT on commission)</td><td class="right">${currency(t.ownerBeforeVat)}</td></tr>
                <tr><td>VAT on Commission</td><td class="right">${currency(t.vatOnCommission)}</td></tr>
                <tr class="total"><td>Owner Amount (after VAT on commission)</td><td class="right">${currency(t.ownerAfterVat)}</td></tr>
              </table>
            </div>

            <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
          </body>
        </html>`;
      const iframe = document.createElement('iframe') as HTMLIFrameElement;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      const onLoad = () => {
        try {
          iframe.contentDocument?.defaultView?.focus();
          iframe.contentDocument?.defaultView?.print();
        } finally {
          setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500);
        }
      };
      iframe.onload = onLoad as any;
      try {
        (iframe as any).srcdoc = html;
        document.body.appendChild(iframe);
      } catch {
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument as (Document | null);
        doc?.open();
        doc?.write(html);
        doc?.close();
        setTimeout(onLoad, 50);
      }
    } catch {}
  }

  // Build Tenant statements from rental payments (grouped by property and month with outstanding)
  const tenantStatements = useMemo(() => {
    const map = new Map<string, TenantPartyStatement>();
    (payments || [])
      .filter((p: any) => p && p.paymentType === 'rental' && (p.status ? String(p.status) === 'completed' : true))
      .forEach((p: any) => {
        try {
          const tenantObj = p.tenantId;
          const tenantId = tenantObj && typeof tenantObj === 'object'
            ? String(tenantObj._id || tenantObj.id || '')
            : (typeof tenantObj === 'string' ? tenantObj : (p.manualTenantName || 'unknown'));
          const tenantName = tenantObj && typeof tenantObj === 'object'
            ? (`${tenantObj.firstName || ''} ${tenantObj.lastName || ''}`.trim() || (p.manualTenantName || 'Unknown tenant'))
            : (p.manualTenantName || 'Unknown tenant');
          const propertyObj = p.propertyId;
          const propertyId = (propertyObj && typeof propertyObj === 'object') ? String(propertyObj._id || propertyObj.id || '') : (typeof propertyObj === 'string' ? propertyObj : (p.manualPropertyAddress || 'unknown'));
          const propertyName = propertyObj && typeof propertyObj === 'object'
            ? (propertyObj.address || propertyObj.name || p.manualPropertyAddress || 'Unknown Property')
            : (p.manualPropertyAddress || 'Unknown Property');
          const d = getEffectiveDateForFilter(p);
          const row: StatementRow = {
            date: d.toISOString().slice(0, 10),
            property: propertyName,
            reference: String(p.referenceNumber || p._id || ''),
            amount: Number(p.amount || 0),
          };
          const rentUsed = Number((p as any).rentUsed || 0);
          const deposit = Number((p as any).depositAmount || 0);
          const credited = Math.max(0, row.amount - deposit);
          const period = (() => {
            const y = Number((p as any).rentalPeriodYear);
            const m = Number((p as any).rentalPeriodMonth);
            if (y && m) return `${y}-${String(m).padStart(2, '0')}`;
            const dt = d;
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          })();

          const cur = map.get(tenantId) || { id: tenantId, name: tenantName, total: 0, count: 0, payments: [] as StatementRow[], properties: [] as TenantPropertyGroup[], outstandingTotal: 0 };
          cur.total += credited;
          cur.count += 1;
          cur.payments.push(row);
          // Property group
          let pg = cur.properties.find(g => g.propertyId === propertyId);
          if (!pg) {
            pg = { propertyId, propertyName, months: [], totalPaid: 0, totalOutstanding: 0 };
            cur.properties.push(pg);
          }
          // Month item
          let mi = pg.months.find(m => m.period === period);
          if (!mi) {
            mi = { period, expected: 0, paid: 0, outstanding: 0, rows: [] };
            pg.months.push(mi);
          }
          mi.rows.push(row);
          mi.paid += credited;
          if (rentUsed > mi.expected) mi.expected = rentUsed;
          mi.outstanding = Math.max(0, (mi.expected || 0) - (mi.paid || 0));
          pg.totalPaid = pg.months.reduce((s, m) => s + (m.paid || 0), 0);
          pg.totalOutstanding = pg.months.reduce((s, m) => s + (m.outstanding || 0), 0);
          cur.outstandingTotal = cur.properties.reduce((s, g) => s + (g.totalOutstanding || 0), 0);
          map.set(tenantId, cur);
        } catch {}
      });
    // Sort months within each property without relying on iterator downleveling
    Array.from(map.values()).forEach((party: TenantPartyStatement) => {
      party.properties.forEach((prop: TenantPropertyGroup) => {
        prop.months.sort((a: TenantMonthItem, b: TenantMonthItem) => a.period.localeCompare(b.period));
      });
    });
    const list = Array.from(map.values());
    list.forEach(s => s.payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [payments]);

  // Build Buyer statements from sale payments (grouped by property/sale with outstanding)
  const buyerStatements = useMemo(() => {
    const map = new Map<string, BuyerPartyStatement>();
    (payments || [])
      .filter((p: any) => p && p.paymentType === 'sale' && (p.status ? String(p.status) === 'completed' : true))
      .forEach((p: any) => {
        try {
          const buyerNameRaw =
            p.buyerName ||
            p.manualTenantName ||
            ((p.tenantId && typeof p.tenantId === 'object') ? `${p.tenantId.firstName || ''} ${p.tenantId.lastName || ''}`.trim() : '');
          const buyerName = buyerNameRaw || 'Unknown buyer';
          const key = buyerName.toLowerCase();
          const propertyObj = p.propertyId;
          const propertyId = (propertyObj && typeof propertyObj === 'object') ? String(propertyObj._id || propertyObj.id || '') : (typeof propertyObj === 'string' ? propertyObj : (p.manualPropertyAddress || 'unknown'));
          const propertyName = propertyObj && typeof propertyObj === 'object'
            ? (propertyObj.address || propertyObj.name || p.manualPropertyAddress || 'Unknown Property')
            : (p.manualPropertyAddress || 'Unknown Property');
          const d = getEffectiveDateForFilter(p);
          const row: StatementRow = {
            date: d.toISOString().slice(0, 10),
            property: propertyName,
            reference: String(p.referenceNumber || p._id || ''),
            amount: Number(p.amount || 0),
          };
          const saleId = (p as any).saleId ? String((p as any).saleId) : undefined;
          const saleKey = saleId ? `sale:${saleId}` : `prop:${propertyId}`;
          const notes = String((p as any).notes || '');

          const cur = map.get(key) || { id: key, name: buyerName, total: 0, count: 0, payments: [] as StatementRow[], properties: [] as BuyerPropertyGroup[], outstandingTotal: 0 };
          cur.total += row.amount;
          cur.count += 1;
          cur.payments.push(row);
          // Property/sale group
          let pg = cur.properties.find(g => g.saleKey === saleKey);
          if (!pg) {
            pg = { saleKey, propertyId, propertyName, expectedTotal: undefined, totalPaid: 0, outstanding: 0, rows: [] };
            cur.properties.push(pg);
          }
          pg.rows.push(row);
          pg.totalPaid += row.amount;
          const parsedTotal = parseSaleTotalFromNotes(notes);
          if (parsedTotal && (!pg.expectedTotal || parsedTotal > (pg.expectedTotal || 0))) {
            pg.expectedTotal = parsedTotal;
          }
          pg.outstanding = Math.max(0, (pg.expectedTotal || 0) - (pg.totalPaid || 0));
          cur.outstandingTotal = cur.properties.reduce((s, g) => s + (g.outstanding || 0), 0);
          map.set(key, cur);
        } catch {}
      });
    const list = Array.from(map.values());
    list.forEach(s => s.payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [payments]);

  // Minimal HTML escaping for print templates
  const escapeHtml = (value: any): string => {
    try {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    } catch {
      return '';
    }
  };

  function printTenantStatement(s: TenantPartyStatement) {
    try {
      const html = `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Tenant Statement — ${escapeHtml(s.name)}</title>
            <style>
              body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; padding: 24px; color: #0f172a; }
              h1 { font-size: 18px; margin: 0 0 12px; }
              .muted { color: #64748b; font-size: 12px; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
              .right { text-align: right; }
              .total { font-weight: 600; }
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <h1>Tenant Payment Statement</h1>
            <div class="muted">Tenant: ${escapeHtml(s.name)}</div>
            ${s.properties.map(prop => `
              <h2 style="font-size:14px;margin-top:18px;margin-bottom:4px;">Property: ${escapeHtml(prop.propertyName)}</h2>
              <table>
                <thead>
                  <tr><th>Period</th><th class="right">Expected</th><th class="right">Paid</th><th class="right">Outstanding</th></tr>
                </thead>
                <tbody>
                  ${prop.months.map(m => `<tr><td>${m.period}</td><td class="right">${currency(m.expected || 0)}</td><td class="right">${currency(m.paid || 0)}</td><td class="right">${currency(m.outstanding || 0)}</td></tr>`).join('')}
                  <tr class="total"><td>Total</td><td></td><td class="right">${currency(prop.totalPaid || 0)}</td><td class="right">${currency(prop.totalOutstanding || 0)}</td></tr>
                </tbody>
              </table>
              <table>
                <thead>
                  <tr><th>Date</th><th>Reference</th><th class="right">Amount</th></tr>
                </thead>
                <tbody>
                  ${prop.months.flatMap(m => m.rows).map(r => `<tr><td>${r.date}</td><td>${escapeHtml((r.reference || '').toString())}</td><td class="right">${currency(r.amount || 0)}</td></tr>`).join('')}
                </tbody>
              </table>
            `).join('')}
            <div style="margin-top:12px;font-weight:600;">Total outstanding across properties: ${currency(s.outstandingTotal || 0)}</div>
            <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };</script>
          </body>
        </html>`;
      const iframe = document.createElement('iframe') as HTMLIFrameElement;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      const onLoad = () => {
        try {
          iframe.contentDocument?.defaultView?.focus();
          iframe.contentDocument?.defaultView?.print();
        } finally {
          setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500);
        }
      };
      iframe.onload = onLoad as any;
      try {
        (iframe as any).srcdoc = html;
        document.body.appendChild(iframe);
      } catch {
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument as (Document | null);
        doc?.open();
        doc?.write(html);
        doc?.close();
        setTimeout(onLoad, 50);
      }
    } catch {}
  }

  function printBuyerStatement(s: BuyerPartyStatement) {
    try {
      const html = `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Buyer Statement — ${escapeHtml(s.name)}</title>
            <style>
              body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; padding: 24px; color: #0f172a; }
              h1 { font-size: 18px; margin: 0 0 12px; }
              .muted { color: #64748b; font-size: 12px; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
              .right { text-align: right; }
              .total { font-weight: 600; }
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <h1>Buyer Payment Statement</h1>
            <div class="muted">Buyer: ${s.name}</div>
            ${s.properties.map(prop => `
              <h2 style="font-size:14px;margin-top:18px;margin-bottom:4px;">Property: ${prop.propertyName}</h2>
              <div>Expected total: ${prop.expectedTotal ? currency(prop.expectedTotal) : '-'}</div>
              <div>Total paid: ${currency(prop.totalPaid || 0)}</div>
              <div style="margin-bottom:8px;">Outstanding: ${currency(prop.outstanding || 0)}</div>
              <table>
                <thead>
                  <tr><th>Date</th><th>Reference</th><th class="right">Amount</th></tr>
                </thead>
                <tbody>
                  ${prop.rows.map(r => `<tr><td>${r.date}</td><td>${(r.reference || '').toString()}</td><td class="right">${currency(r.amount || 0)}</td></tr>`).join('')}
                </tbody>
              </table>
            `).join('')}
            <div style="margin-top:12px;font-weight:600;">Total outstanding across properties: ${currency(s.outstandingTotal || 0)}</div>
            <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };</script>
          </body>
        </html>`;
      const iframe = document.createElement('iframe') as HTMLIFrameElement;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      const onLoad = () => {
        try {
          iframe.contentDocument?.defaultView?.focus();
          iframe.contentDocument?.defaultView?.print();
        } finally {
          setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500);
        }
      };
      iframe.onload = onLoad as any;
      try {
        (iframe as any).srcdoc = html;
        document.body.appendChild(iframe);
      } catch {
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument as (Document | null);
        doc?.open();
        doc?.write(html);
        doc?.close();
        setTimeout(onLoad, 50);
      }
    } catch {}
  }

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
      const iframe = document.createElement('iframe') as HTMLIFrameElement;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      const onLoad = () => {
        try {
          iframe.contentDocument?.defaultView?.focus();
          iframe.contentDocument?.defaultView?.print();
        } finally {
          setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500);
        }
      };
      iframe.onload = onLoad as any;
      try {
        (iframe as any).srcdoc = html;
        document.body.appendChild(iframe);
      } catch {
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument as (Document | null);
        doc?.open();
        doc?.write(html);
        doc?.close();
        setTimeout(onLoad, 50);
      }
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
        </div>
      </section>

      {/* Top Agents and Revenue split (positioned under Total Revenue & Average Monthly) */}
      {/* Top Agents and Revenue split moved above */}

      {/* Tenant and Buyer reports full width */}
      <section className="mb-6">
        <div className="bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Tenant and Buyer reports</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Search</label>
              <input value={partySearch} onChange={(e)=>setPartySearch(e.target.value)} placeholder="Search name" className="border rounded px-2 py-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Tenants (rental payments)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-2">Tenant</th>
                      <th className="text-right">Count</th>
                      <th className="text-right">Total Paid</th>
                      <th className="text-right">Outstanding</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantStatements
                      .filter(s => {
                        const needle = partySearch.trim().toLowerCase();
                        if (!needle) return true;
                        return s.name.toLowerCase().includes(needle);
                      })
                      .map(s => (
                        <tr key={`tenant-${s.id}`} className="border-t">
                          <td className="py-2">{s.name}</td>
                          <td className="text-right">{s.count}</td>
                          <td className="text-right">{currency(s.total)}</td>
                          <td className="text-right">{currency((s as any).outstandingTotal || 0)}</td>
                          <td className="text-right">
                            <button onClick={() => printTenantStatement(s as any)} className="px-2 py-1 rounded border text-xs hover:bg-slate-50">Print</button>
                          </td>
                        </tr>
                      ))}
                    {tenantStatements.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-slate-500">No tenant transactions found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Buyers (sales payments)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-2">Buyer</th>
                      <th className="text-right">Count</th>
                      <th className="text-right">Total Paid</th>
                      <th className="text-right">Outstanding</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyerStatements
                      .filter(s => {
                        const needle = partySearch.trim().toLowerCase();
                        if (!needle) return true;
                        return s.name.toLowerCase().includes(needle);
                      })
                      .map(s => (
                        <tr key={`buyer-${s.id}`} className="border-t">
                          <td className="py-2">{s.name}</td>
                          <td className="text-right">{s.count}</td>
                          <td className="text-right">{currency(s.total)}</td>
                          <td className="text-right">{currency((s as any).outstandingTotal || 0)}</td>
                          <td className="text-right">
                            <button onClick={() => printBuyerStatement(s as any)} className="px-2 py-1 rounded border text-xs hover:bg-slate-50">Print</button>
                          </td>
                        </tr>
                      ))}
                    {buyerStatements.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-slate-500">No buyer transactions found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Tenant and Buyer reports moved below Top Agents & Revenue split */}
      {/* Tenant and Buyer reports moved below Top Agents & Revenue split */}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Top Agents moved here to replace the former Revenue over time chart */}
        <div className="col-span-2 bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Top Agents</h2>
            <div className="flex items-center gap-2">
              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={topMonth}
                onChange={(e) => setTopMonth(Number(e.target.value))}
              >
                {[
                  { v: 1, l: 'Jan' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Apr' },
                  { v: 5, l: 'May' }, { v: 6, l: 'Jun' }, { v: 7, l: 'Jul' }, { v: 8, l: 'Aug' },
                  { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dec' }
                ].map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={topYear}
                onChange={(e) => setTopYear(Number(e.target.value))}
              >
                {Array.from({ length: 10 }).map((_, i) => {
                  const y = new Date().getFullYear() - i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </div>
          </div>
          {topAgentsError && <div className="text-sm text-red-600 mb-2">{topAgentsError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium mb-2">Sales Agents</h3>
              <ul className="divide-y">
                {(topAgentsData?.sales ?? []).slice(0,5).map((agent: any) => (
                  <li key={agent.agentId || agent.name} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-xs text-slate-500">Sales performance</div>
                      </div>
                      <div className="text-sm font-semibold">{currency(agent.total)}</div>
                    </div>
                  </li>
                ))}
                {(!topAgentsData || (topAgentsData.sales || []).length === 0) && (
                  <li className="py-3 text-sm text-slate-500">No sales data for the selected month.</li>
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Rental Agents</h3>
              <ul className="divide-y">
                {(topAgentsData?.rental ?? []).slice(0,5).map((agent: any) => (
                  <li key={agent.agentId || agent.name} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-xs text-slate-500">Management performance</div>
                      </div>
                      <div className="text-sm font-semibold">{currency(agent.total)}</div>
                    </div>
                  </li>
                ))}
                {(!topAgentsData || (topAgentsData.rental || []).length === 0) && (
                  <li className="py-3 text-sm text-slate-500">No rental data for the selected month.</li>
                )}
              </ul>
            </div>
          </div>
          {topAgentsLoading && <div className="text-xs text-slate-500 mt-3">Loading top agents…</div>}
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

      {/* Recent sale transactions now full width */}
      <section className="mb-6">
        <div className="bg-white p-4 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent sale transactions</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm">Month</label>
              <select
                className="border rounded px-2 py-1"
                value={salesTxMonth}
                onChange={(e) => setSalesTxMonth(Number(e.target.value))}
              >
                {[
                  { v: 1, l: 'Jan' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Apr' },
                  { v: 5, l: 'May' }, { v: 6, l: 'Jun' }, { v: 7, l: 'Jul' }, { v: 8, l: 'Aug' },
                  { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dec' }
                ].map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <label className="text-sm">Year</label>
              <select
                className="border rounded px-2 py-1"
                value={salesTxYear}
                onChange={(e) => setSalesTxYear(Number(e.target.value))}
              >
                {Array.from({ length: 10 }).map((_, i) => {
                  const y = new Date().getFullYear() - i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
              <label className="text-sm">Show</label>
              <select
                className="border rounded px-2 py-1"
                value={salesTxLimit}
                onChange={(e) => setSalesTxLimit(Number(e.target.value))}
              >
                {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <label className="text-sm">Buyer</label>
              <input value={buyerFilter} onChange={(e)=>setBuyerFilter(e.target.value)} placeholder="Search buyer" className="border rounded px-2 py-1" />
              <label className="text-sm">Seller</label>
              <input value={sellerFilter} onChange={(e)=>setSellerFilter(e.target.value)} placeholder="Search seller" className="border rounded px-2 py-1" />
              <label className="text-sm">Agent</label>
              <select value={saleAgentId} onChange={(e) => setSaleAgentId(e.target.value)} className="border rounded px-2 py-1">
                <option value="all">All agents</option>
                {agentOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-sm text-slate-500">
                  <th className="py-2">Date</th>
                  <th>Property address</th>
                  <th>Buyer</th>
                  <th>Seller</th>
                  <th>Agent</th>
                  <th className="text-right">Total sale</th>
                  <th className="text-right">Commission %</th>
                  <th className="text-right">Total commission</th>
                  <th className="text-right">Prea fee</th>
                  <th className="text-right">Agent share</th>
                  <th className="text-right">Agency share</th>
                  <th className="text-right">Owner before VAT</th>
                  <th className="text-right">VAT on commission</th>
                  <th className="text-right">Owner after VAT</th>
                  <th>Split</th>
                  <th className="text-right">Owner agent share</th>
                  <th className="text-right">Collaborator agent share</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentSaleTransactions.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2 whitespace-nowrap">{t.date}</td>
                    <td className="whitespace-nowrap">{t.propertyAddress}</td>
                    <td className="whitespace-nowrap">{t.buyer || '-'}</td>
                    <td className="whitespace-nowrap">{t.seller || '-'}</td>
                    <td className="whitespace-nowrap">{t.primaryAgentName || '-'}</td>
                    <td className="text-right">{currency(t.amount)}</td>
                    <td className="text-right">{t.pct}%</td>
                    <td className="text-right">{currency(t.totalCommission)}</td>
                    <td className="text-right">{currency(t.preafee)}</td>
                    <td className="text-right">{currency(t.agentShare)}</td>
                    <td className="text-right">{currency(t.agencyShare)}</td>
                    <td className="text-right">{currency(t.ownerBeforeVat)}</td>
                    <td className="text-right">{currency(t.vatOnCommission)}</td>
                    <td className="text-right">{currency(t.ownerAfterVat)}</td>
                    <td>
                      {t.hasSplit ? (
                        <div className="text-xs text-slate-600">
                          <div>Owner {t.splitOwnerPct || 0}% — {t.ownerAgentName || 'Owner agent'}</div>
                          <div>Collaborator {t.splitCollabPct || 0}% — {t.collaboratorAgentName || 'Collaborator'}</div>
                        </div>
                      ) : (<span className="text-slate-400 text-xs">-</span>)}
                    </td>
                    <td className="text-right">{t.hasSplit ? currency(t.ownerAgentShare) : <span className="text-slate-400">-</span>}</td>
                    <td className="text-right">{t.hasSplit ? currency(t.collaboratorAgentShare) : <span className="text-slate-400">-</span>}</td>
                    <td className="text-right">
                      <button onClick={() => printDisbursementReport(t)} className="px-2 py-1 rounded border text-xs hover:bg-slate-50">Print</button>
                    </td>
                  </tr>
                ))}
                {recentSaleTransactions.length === 0 && (
                  <tr>
                    <td colSpan={18} className="py-6 text-center text-slate-500">No sale transactions for the selected range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Taxes and Income Statement */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
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

        {/* Budget vs Actual removed in favor of Tenant and Buyer reports */}

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
        <div className="bg-white p-4 rounded-2xl shadow lg:col-span-2">
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

      {/* Trust Accounts and Income vs Expenses side-by-side */}
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
