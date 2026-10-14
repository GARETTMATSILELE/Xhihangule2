import { Payment } from '../types/payment';

type CommissionDetailsWithSplit = NonNullable<Payment['commissionDetails']> & {
  agentSplit?: {
    splitPercentOwner?: number;
    splitPercentCollaborator?: number;
    ownerAgentShare?: number;
    collaboratorAgentShare?: number;
    ownerUserId?: string;
    collaboratorUserId?: string;
  };
};

function getCommissionDetails(p: Payment): CommissionDetailsWithSplit {
  return (p.commissionDetails || {}) as CommissionDetailsWithSplit;
}

export type StatementRow = { date: string; property: string; reference: string; amount: number };
export type PartyStatement = { id: string; name: string; total: number; count: number; payments: StatementRow[] };
export type TenantMonthItem = { period: string; expected: number; paid: number; outstanding: number; rows: StatementRow[] };
export type TenantPropertyGroup = { propertyId: string; propertyName: string; months: TenantMonthItem[]; totalPaid: number; totalOutstanding: number };
export type TenantPartyStatement = PartyStatement & { properties: TenantPropertyGroup[]; outstandingTotal: number };
export type BuyerPropertyGroup = { saleKey: string; propertyId?: string; propertyName: string; expectedTotal?: number; totalPaid: number; outstanding: number; rows: StatementRow[] };
export type BuyerPartyStatement = PartyStatement & { properties: BuyerPropertyGroup[]; outstandingTotal: number };

export type SaleTransactionRow = {
  id: string;
  date: string;
  ts: number;
  referenceNumber: string;
  paymentMethod: string;
  currencyCode: string;
  primaryAgentName: string;
  propertyAddress: string;
  buyer: string;
  seller: string;
  amount: number;
  vatAmount: number;
  pct: number;
  totalCommission: number;
  preafee: number;
  agentShare: number;
  agencyShare: number;
  vatOnCommission: number;
  ownerBeforeVat: number;
  ownerAfterVat: number;
  hasSplit: boolean;
  splitOwnerPct: number;
  splitCollabPct: number;
  ownerAgentShare: number;
  collaboratorAgentShare: number;
  ownerAgentName: string;
  collaboratorAgentName: string;
};

export function formatReportCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
}

export function escapeReportHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char));
}

export function getEffectiveDateForFilter(p: Payment | Record<string, unknown>): Date {
  try {
    if ((p as Payment).paymentType === 'rental') {
      const y = Number((p as Payment).rentalPeriodYear);
      const m = Number((p as Payment).rentalPeriodMonth);
      if (y && m) return new Date(y, m - 1, 1);
    }
    return new Date((p as Payment).paymentDate);
  } catch {
    return new Date((p as Payment).paymentDate);
  }
}

export function parseSaleTotalFromNotes(notes?: string): number | undefined {
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

export function buildTenantStatements(payments: Payment[]): TenantPartyStatement[] {
  const map = new Map<string, TenantPartyStatement>();
  (payments || [])
    .filter((p) => p && p.paymentType === 'rental' && (p.status ? String(p.status) === 'completed' : true))
    .forEach((p) => {
      try {
        const tenantObj = p.tenantId as Payment['tenantId'];
        const tenantId = tenantObj && typeof tenantObj === 'object'
          ? String((tenantObj as { _id?: string; id?: string })._id || (tenantObj as { id?: string }).id || '')
          : (typeof tenantObj === 'string' ? tenantObj : (p.manualTenantName || 'unknown'));
        const tenantName = tenantObj && typeof tenantObj === 'object'
          ? (`${(tenantObj as { firstName?: string }).firstName || ''} ${(tenantObj as { lastName?: string }).lastName || ''}`.trim() || (p.manualTenantName || 'Unknown tenant'))
          : (p.manualTenantName || 'Unknown tenant');
        const propertyObj = p.propertyId;
        const propertyId = (propertyObj && typeof propertyObj === 'object')
          ? String((propertyObj as { _id?: string; id?: string })._id || (propertyObj as { id?: string }).id || '')
          : (typeof propertyObj === 'string' ? propertyObj : (p.manualPropertyAddress || 'unknown'));
        const propertyName = propertyObj && typeof propertyObj === 'object'
          ? ((propertyObj as { address?: string; name?: string }).address || (propertyObj as { name?: string }).name || p.manualPropertyAddress || 'Unknown Property')
          : (p.manualPropertyAddress || 'Unknown Property');
        const d = getEffectiveDateForFilter(p);
        const row: StatementRow = {
          date: d.toISOString().slice(0, 10),
          property: propertyName,
          reference: String(p.referenceNumber || p._id || ''),
          amount: Number(p.amount || 0),
        };
        const rentUsed = Number((p as Payment & { rentUsed?: number }).rentUsed || 0);
        const deposit = Number((p as Payment & { depositAmount?: number }).depositAmount || 0);
        const credited = Math.max(0, row.amount - deposit);
        const period = (() => {
          const y = Number(p.rentalPeriodYear);
          const m = Number(p.rentalPeriodMonth);
          if (y && m) return `${y}-${String(m).padStart(2, '0')}`;
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();

        const cur = map.get(tenantId) || { id: tenantId, name: tenantName, total: 0, count: 0, payments: [] as StatementRow[], properties: [] as TenantPropertyGroup[], outstandingTotal: 0 };
        cur.total += credited;
        cur.count += 1;
        cur.payments.push(row);
        let pg = cur.properties.find(g => g.propertyId === propertyId);
        if (!pg) {
          pg = { propertyId, propertyName, months: [], totalPaid: 0, totalOutstanding: 0 };
          cur.properties.push(pg);
        }
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
      } catch { /* skip malformed payment */ }
    });

  Array.from(map.values()).forEach((party) => {
    party.properties.forEach((prop) => {
      prop.months.sort((a, b) => a.period.localeCompare(b.period));
    });
  });
  const list = Array.from(map.values());
  list.forEach(s => s.payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildBuyerStatements(payments: Payment[]): BuyerPartyStatement[] {
  const map = new Map<string, BuyerPartyStatement>();
  (payments || [])
    .filter((p) => p && p.paymentType === 'sale' && (p.status ? String(p.status) === 'completed' : true))
    .forEach((p) => {
      try {
        const tenantObj = p.tenantId;
        const buyerNameRaw =
          p.buyerName ||
          p.manualTenantName ||
          (tenantObj && typeof tenantObj === 'object'
            ? `${(tenantObj as { firstName?: string }).firstName || ''} ${(tenantObj as { lastName?: string }).lastName || ''}`.trim()
            : '');
        const buyerName = buyerNameRaw || 'Unknown buyer';
        const key = buyerName.toLowerCase();
        const propertyObj = p.propertyId;
        const propertyId = (propertyObj && typeof propertyObj === 'object')
          ? String((propertyObj as { _id?: string; id?: string })._id || (propertyObj as { id?: string }).id || '')
          : (typeof propertyObj === 'string' ? propertyObj : (p.manualPropertyAddress || 'unknown'));
        const propertyName = propertyObj && typeof propertyObj === 'object'
          ? ((propertyObj as { address?: string; name?: string }).address || (propertyObj as { name?: string }).name || p.manualPropertyAddress || 'Unknown Property')
          : (p.manualPropertyAddress || 'Unknown Property');
        const d = getEffectiveDateForFilter(p);
        const row: StatementRow = {
          date: d.toISOString().slice(0, 10),
          property: propertyName,
          reference: String(p.referenceNumber || p._id || ''),
          amount: Number(p.amount || 0),
        };
        const saleId = (p as Payment & { saleId?: string }).saleId ? String((p as Payment & { saleId?: string }).saleId) : undefined;
        const saleKey = saleId ? `sale:${saleId}` : `prop:${propertyId}`;
        const notes = String(p.notes || '');

        const cur = map.get(key) || { id: key, name: buyerName, total: 0, count: 0, payments: [] as StatementRow[], properties: [] as BuyerPropertyGroup[], outstandingTotal: 0 };
        cur.total += row.amount;
        cur.count += 1;
        cur.payments.push(row);
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
      } catch { /* skip malformed payment */ }
    });
  const list = Array.from(map.values());
  list.forEach(s => s.payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

type SaleTransactionFilters = {
  salesTxYear: number;
  salesTxMonth: number;
  salesTxLimit: number;
  saleAgentId: string;
  buyerFilter: string;
  sellerFilter: string;
  agentsById: Record<string, string>;
};

export function buildRecentSaleTransactions(salePayments: Payment[], filters: SaleTransactionFilters): SaleTransactionRow[] {
  const { salesTxYear, salesTxMonth, salesTxLimit, saleAgentId, buyerFilter, sellerFilter, agentsById } = filters;
  const start = new Date(salesTxYear, salesTxMonth - 1, 1);
  const end = new Date(salesTxYear, salesTxMonth, 0, 23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();

  return (salePayments || [])
    .filter((p) => p.paymentType === 'sale' && p.status === 'completed')
    .filter((p) => {
      const t = getEffectiveDateForFilter(p).getTime();
      return t >= startMs && t <= endMs;
    })
    .filter((p) => {
      if (saleAgentId === 'all') return true;
      const primaryId = p.agentId && typeof p.agentId === 'object'
        ? String((p.agentId as { _id?: string; id?: string })._id || (p.agentId as { id?: string }).id || '')
        : String(p.agentId || '');
      const split = getCommissionDetails(p).agentSplit || {};
      const ownerId = split.ownerUserId ? String(split.ownerUserId) : undefined;
      const collabId = split.collaboratorUserId ? String(split.collaboratorUserId) : undefined;
      return saleAgentId === primaryId || saleAgentId === ownerId || saleAgentId === collabId;
    })
    .filter((p) => {
      const needle = buyerFilter.trim().toLowerCase();
      if (!needle) return true;
      const tenantObj = p.tenantId;
      const buyer = p.buyerName || p.manualTenantName || (tenantObj && typeof tenantObj === 'object'
        ? `${(tenantObj as { firstName?: string }).firstName || ''} ${(tenantObj as { lastName?: string }).lastName || ''}`.trim()
        : '');
      return String(buyer).toLowerCase().includes(needle);
    })
    .filter((p) => {
      const needle = sellerFilter.trim().toLowerCase();
      if (!needle) return true;
      return String(p.sellerName || '').toLowerCase().includes(needle);
    })
    .map((p) => {
      const effectiveDate = getEffectiveDateForFilter(p);
      const propertyObj = p.propertyId;
      const propertyAddress = (propertyObj && typeof propertyObj === 'object')
        ? ((propertyObj as { address?: string; name?: string }).address || (propertyObj as { name?: string }).name || p.manualPropertyAddress || 'Unknown')
        : (p.manualPropertyAddress || 'Unknown');
      const tenantObj = p.tenantId;
      const buyer = p.buyerName || p.manualTenantName || (tenantObj && typeof tenantObj === 'object'
        ? `${(tenantObj as { firstName?: string }).firstName || ''} ${(tenantObj as { lastName?: string }).lastName || ''}`.trim()
        : '');
      const seller = p.sellerName || '';
      const amount = Number(p.amount || 0);
      const referenceNumber = String(p.referenceNumber || p._id || '');
      const paymentMethod = String(p.paymentMethod || '');
      const currencyCode = String(p.currency || 'USD');
      const primaryAgentId = p.agentId && typeof p.agentId === 'object'
        ? String((p.agentId as { _id?: string; id?: string })._id || (p.agentId as { id?: string }).id || '')
        : String(p.agentId || '');
      const primaryAgentName = primaryAgentId
        ? (agentsById[primaryAgentId] || (p.agentId && typeof p.agentId === 'object'
          ? `${(p.agentId as { firstName?: string }).firstName || ''} ${(p.agentId as { lastName?: string }).lastName || ''}`.trim()
          : ''))
        : '';
      const cd = getCommissionDetails(p);
      const totalCommission = Number(cd.totalCommission || 0);
      const preafee = Number(cd.preaFee || 0);
      const agentShare = Number(cd.agentShare || 0);
      const agencyShare = Number(cd.agencyShare || 0);
      const vatOnCommission = Number(cd.vatOnCommission || 0);
      const ownerBeforeVat = Number(amount - totalCommission);
      const ownerAfterVat = Number(cd.ownerAmount != null ? cd.ownerAmount : (amount - totalCommission - vatOnCommission));
      const vatIncluded = Boolean(p.vatIncluded);
      const rawVatAmount = Number(p.vatAmount || 0);
      const vatRate = Number(p.vatRate || 0);
      const amountExVat = (() => {
        if (!vatIncluded) return amount;
        if (rawVatAmount > 0) return Math.max(0, amount - rawVatAmount);
        if (vatRate > 0) return amount / (1 + vatRate);
        return amount;
      })();
      const pctBase = amountExVat > 0 ? amountExVat : amount;
      const pct = pctBase ? Number(((totalCommission / pctBase) * 100).toFixed(2)) : 0;
      const split = cd.agentSplit || {};
      const splitOwnerPct = Number(split.splitPercentOwner || 0);
      const splitCollabPct = Number(split.splitPercentCollaborator || 0);
      const ownerAgentShare = Number(split.ownerAgentShare || 0);
      const collaboratorAgentShare = Number(split.collaboratorAgentShare || 0);
      const ownerUserId = split.ownerUserId ? String(split.ownerUserId) : undefined;
      const collaboratorUserId = split.collaboratorUserId ? String(split.collaboratorUserId) : undefined;
      const ownerAgentName = ownerUserId ? (agentsById[ownerUserId] || ownerUserId) : '';
      const collaboratorAgentName = collaboratorUserId ? (agentsById[collaboratorUserId] || collaboratorUserId) : '';
      const vatAmount = (() => {
        if (!vatIncluded) return 0;
        if (rawVatAmount > 0) return rawVatAmount;
        if (vatRate > 0) {
          const taxableBase = amount / (1 + vatRate);
          return Math.max(0, amount - taxableBase);
        }
        return 0;
      })();
      return {
        id: p._id,
        date: effectiveDate.toISOString().slice(0, 10),
        ts: effectiveDate.getTime(),
        referenceNumber,
        paymentMethod,
        currencyCode,
        primaryAgentName,
        propertyAddress,
        buyer,
        seller,
        amount,
        vatAmount,
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
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, salesTxLimit);
}

export function printHtmlInIframe(html: string): void {
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
      setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 500);
    }
  };
  iframe.onload = onLoad as () => void;
  try {
    (iframe as HTMLIFrameElement & { srcdoc?: string }).srcdoc = html;
    document.body.appendChild(iframe);
  } catch {
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc?.open();
    doc?.write(html);
    doc?.close();
    setTimeout(onLoad, 50);
  }
}

export function printTenantStatement(s: TenantPartyStatement): void {
  const currency = formatReportCurrency;
  const escapeHtml = escapeReportHtml;
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Tenant Statement — ${escapeHtml(s.name)}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #0f172a; }
          h1 { font-size: 18px; margin: 0 0 12px; }
          .muted { color: #64748b; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .right { text-align: right; }
          .total { font-weight: 600; }
        </style>
      </head>
      <body>
        <h1>Tenant Payment Statement</h1>
        <div class="muted">Tenant: ${escapeHtml(s.name)}</div>
        ${s.properties.map(prop => `
          <h2 style="font-size:14px;margin-top:18px;margin-bottom:4px;">Property: ${escapeHtml(prop.propertyName)}</h2>
          <table>
            <thead><tr><th>Period</th><th class="right">Expected</th><th class="right">Paid</th><th class="right">Outstanding</th></tr></thead>
            <tbody>
              ${prop.months.map(m => `<tr><td>${m.period}</td><td class="right">${currency(m.expected || 0)}</td><td class="right">${currency(m.paid || 0)}</td><td class="right">${currency(m.outstanding || 0)}</td></tr>`).join('')}
              <tr class="total"><td>Total</td><td></td><td class="right">${currency(prop.totalPaid || 0)}</td><td class="right">${currency(prop.totalOutstanding || 0)}</td></tr>
            </tbody>
          </table>
          <table>
            <thead><tr><th>Date</th><th>Reference</th><th class="right">Amount</th></tr></thead>
            <tbody>
              ${prop.months.flatMap(m => m.rows).map(r => `<tr><td>${r.date}</td><td>${escapeHtml(r.reference)}</td><td class="right">${currency(r.amount || 0)}</td></tr>`).join('')}
            </tbody>
          </table>
        `).join('')}
        <div style="margin-top:12px;font-weight:600;">Total outstanding across properties: ${currency(s.outstandingTotal || 0)}</div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };</script>
      </body>
    </html>`;
  printHtmlInIframe(html);
}

export function printBuyerStatement(s: BuyerPartyStatement): void {
  const currency = formatReportCurrency;
  const escapeHtml = escapeReportHtml;
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Buyer Statement — ${escapeHtml(s.name)}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #0f172a; }
          h1 { font-size: 18px; margin: 0 0 12px; }
          .muted { color: #64748b; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .right { text-align: right; }
        </style>
      </head>
      <body>
        <h1>Buyer Payment Statement</h1>
        <div class="muted">Buyer: ${escapeHtml(s.name)}</div>
        ${s.properties.map(prop => `
          <h2 style="font-size:14px;margin-top:18px;margin-bottom:4px;">Property: ${escapeHtml(prop.propertyName)}</h2>
          <div>Expected total: ${prop.expectedTotal ? currency(prop.expectedTotal) : '-'}</div>
          <div>Total paid: ${currency(prop.totalPaid || 0)}</div>
          <div style="margin-bottom:8px;">Outstanding: ${currency(prop.outstanding || 0)}</div>
          <table>
            <thead><tr><th>Date</th><th>Reference</th><th class="right">Amount</th></tr></thead>
            <tbody>
              ${prop.rows.map(r => `<tr><td>${r.date}</td><td>${escapeHtml(r.reference)}</td><td class="right">${currency(r.amount || 0)}</td></tr>`).join('')}
            </tbody>
          </table>
        `).join('')}
        <div style="margin-top:12px;font-weight:600;">Total outstanding across properties: ${currency(s.outstandingTotal || 0)}</div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };</script>
      </body>
    </html>`;
  printHtmlInIframe(html);
}

export function printDisbursementReport(t: SaleTransactionRow, companyName = 'Company'): void {
  const currency = formatReportCurrency;
  const escapeHtml = escapeReportHtml;
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Disbursement Report — ${escapeHtml(t.referenceNumber || t.id)}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #0f172a; }
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
        <div class="brand">${escapeHtml(companyName)}</div>
        <h1>Disbursement Report</h1>
        <div class="muted">Reference: ${escapeHtml(t.referenceNumber || t.id)} • Date: ${escapeHtml(t.date)} • Currency: ${escapeHtml(t.currencyCode || 'USD')}</div>
        <div class="grid">
          <div>
            <h2>Property & Parties</h2>
            <table>
              <tr><td>Property</td><td>${escapeHtml(t.propertyAddress || '')}</td></tr>
              <tr><td>Buyer</td><td>${escapeHtml(t.buyer || '-')}</td></tr>
              <tr><td>Seller</td><td>${escapeHtml(t.seller || '-')}</td></tr>
              <tr><td>Agent</td><td>${escapeHtml(t.primaryAgentName || '-')}</td></tr>
            </table>
          </div>
          <div>
            <h2>Sale Summary</h2>
            <table>
              <tr><td>Total Sale Amount</td><td class="right">${currency(t.amount)}</td></tr>
              <tr><td>VAT (on Sale Amount)</td><td class="right">${currency(t.vatAmount || 0)}</td></tr>
              <tr><td>Amount After VAT</td><td class="right">${currency(Math.max(0, (t.amount || 0) - (t.vatAmount || 0)))}</td></tr>
              <tr><td>Commission %</td><td class="right">${t.pct}%</td></tr>
              <tr><td>Total Commission</td><td class="right">${currency(t.totalCommission)}</td></tr>
              <tr><td>Prea Fee</td><td class="right">${currency(t.preafee)}</td></tr>
              <tr><td>Net Commission (after Prea)</td><td class="right">${currency(Math.max(0, (t.totalCommission || 0) - (t.preafee || 0)))}</td></tr>
              <tr><td>Payment Method</td><td class="right">${escapeHtml(t.paymentMethod || '-')}</td></tr>
            </table>
          </div>
        </div>
        <div class="section">
          <h2>Commission Disbursement</h2>
          <table>
            <thead><tr><th>Recipient</th><th class="right">Amount</th></tr></thead>
            <tbody>
              <tr><td>Agent Share${t.hasSplit ? ' (Total)' : ''}</td><td class="right">${currency(t.agentShare)}</td></tr>
              ${t.hasSplit ? `<tr><td>Owner Agent (${t.splitOwnerPct || 0}%${t.ownerAgentName ? ', ' + escapeHtml(t.ownerAgentName) : ''})</td><td class="right">${currency(t.ownerAgentShare)}</td></tr>` : ''}
              ${t.hasSplit ? `<tr><td>Collaborator Agent (${t.splitCollabPct || 0}%${t.collaboratorAgentName ? ', ' + escapeHtml(t.collaboratorAgentName) : ''})</td><td class="right">${currency(t.collaboratorAgentShare)}</td></tr>` : ''}
              <tr><td>Agency Share</td><td class="right">${currency(t.agencyShare)}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="section">
          <h2>Seller Settlement</h2>
          <table>
            <tr><td>Seller proceeds (before VAT on commission)</td><td class="right">${currency(t.ownerBeforeVat)}</td></tr>
            <tr><td>VAT on Commission</td><td class="right">${currency(t.vatOnCommission)}</td></tr>
            <tr class="total"><td>Net seller proceeds</td><td class="right">${currency(t.ownerAfterVat)}</td></tr>
          </table>
        </div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };</script>
      </body>
    </html>`;
  printHtmlInIframe(html);
}

export function printRecentSaleTransactionsTable(
  rows: SaleTransactionRow[],
  periodLabel: string,
  companyName = 'Company'
): void {
  const currency = formatReportCurrency;
  const escapeHtml = escapeReportHtml;
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Recent Sale Transactions — ${escapeHtml(periodLabel)}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #0f172a; font-size: 11px; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          .muted { color: #64748b; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
          .right { text-align: right; }
          .brand { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="brand">${escapeHtml(companyName)}</div>
        <h1>Recent Sale Transactions</h1>
        <div class="muted">Period: ${escapeHtml(periodLabel)} • ${rows.length} transaction(s)</div>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Property</th><th>Buyer</th><th>Seller</th><th>Agent</th>
              <th class="right">Sale</th><th class="right">Commission</th><th class="right">Agency</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(t => `<tr>
              <td>${escapeHtml(t.date)}</td>
              <td>${escapeHtml(t.propertyAddress)}</td>
              <td>${escapeHtml(t.buyer || '-')}</td>
              <td>${escapeHtml(t.seller || '-')}</td>
              <td>${escapeHtml(t.primaryAgentName || '-')}</td>
              <td class="right">${currency(t.amount)}</td>
              <td class="right">${currency(t.totalCommission)}</td>
              <td class="right">${currency(t.agencyShare)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };</script>
      </body>
    </html>`;
  printHtmlInIframe(html);
}
