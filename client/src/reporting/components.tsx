import React from 'react';
import { CashFlowDTO, LedgerRowDTO, MoneyAmountDTO, OwnerStatementDTO, OwnerWaterfallDTO, StatementSummaryDTO } from './dto';

const brandGreen = '#00452f';
const brandGreenDark = '#00351f';
const softGreen = '#edf7f1';
const dangerRed = '#b42318';
const ink = '#0f172a';
const muted = '#475569';
const line = '#dce8df';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const formatMoney = (value: MoneyAmountDTO): string => {
  if (value.currency === 'ZiG') {
    return `ZiG ${value.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: value.currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value.amount || 0);
};

const formatSignedMoney = (value: MoneyAmountDTO, dashZero = false): string => {
  if (dashZero && (!value || Math.abs(Number(value.amount || 0)) < 0.005)) return '—';
  if (Number(value.amount) < 0) {
    return `(${formatMoney({ ...value, amount: Math.abs(value.amount) })})`;
  }
  return formatMoney(value);
};

const formatDeduction = (value?: MoneyAmountDTO): string => {
  if (!value || Math.abs(Number(value.amount || 0)) < 0.005) return '—';
  return `(${formatMoney(value)})`;
};

const formatOptionalMoney = (value?: MoneyAmountDTO): string => {
  if (!value || Math.abs(Number(value.amount || 0)) < 0.005) return '—';
  return formatMoney(value);
};

const formatSummaryMoney = (value: MoneyAmountDTO): string =>
  formatSignedMoney({ ...value, amount: Number(value?.amount || 0) });

const formatSummaryDeduction = (value: MoneyAmountDTO): string => {
  const amount = Number(value?.amount || 0);
  if (Math.abs(amount) < 0.005) return formatMoney({ ...value, amount: 0 });
  return `(${formatMoney({ ...value, amount: Math.abs(amount) })})`;
};

const formatTotalsMoney = (value: MoneyAmountDTO): string =>
  formatMoney({ ...value, amount: Number(value?.amount || 0) });

const formatTotalsDeduction = (value: MoneyAmountDTO): string => {
  const amount = Number(value?.amount || 0);
  if (Math.abs(amount) < 0.005) return formatMoney({ ...value, amount: 0 });
  return `(${formatMoney({ ...value, amount: Math.abs(amount) })})`;
};

const companyLogoSrc = (logo?: string): string | undefined => {
  const value = String(logo || '').trim();
  if (!value) return undefined;
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value;
  }
  return `data:image/png;base64,${value}`;
};

const parseIsoParts = (value?: string): { year: number; month: number; day: number } | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return undefined;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const formatShortDate = (value: string): string => {
  const parts = parseIsoParts(value);
  if (parts) {
    return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
};

const formatLongDate = (value: string): string => {
  const parts = parseIsoParts(value);
  if (parts) return `${parts.day} ${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
};

const formatPeriodLabel = (statement: OwnerStatementDTO): string => {
  if (statement.period.label === 'All Transactions') return 'All Transactions';
  return `${formatLongDate(statement.period.startDate)} – ${formatLongDate(statement.period.endDate)}`;
};

export const CurrencyField: React.FC<{ value: MoneyAmountDTO; strong?: boolean }> = ({ value, strong }) => (
  <span style={{ fontWeight: strong ? 700 : 500 }}>{formatMoney(value)}</span>
);

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status.toLowerCase();
  const background = normalized.includes('fail') || normalized.includes('variance') ? '#fee2e2' : normalized.includes('pending') ? '#fef3c7' : '#dcfce7';
  const color = normalized.includes('fail') || normalized.includes('variance') ? '#991b1b' : normalized.includes('pending') ? '#92400e' : '#166534';
  return (
    <span style={{ display: 'inline-flex', borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 700, background, color }}>
      {status}
    </span>
  );
};

export const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <header style={{ marginBottom: 12 }}>
    <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
    {subtitle ? <p style={{ margin: '4px 0 0', color: '#64748b' }}>{subtitle}</p> : null}
  </header>
);

export const FinancialCard: React.FC<{ label: string; value: MoneyAmountDTO; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div style={{ border: `1px solid ${line}`, borderRadius: 10, padding: 12, background: highlight ? brandGreen : '#ffffff', color: highlight ? '#fff' : ink }}>
    <div style={{ color: highlight ? '#d7f3df' : '#64748b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ marginTop: 8, fontSize: highlight ? 24 : 18 }}>
      <CurrencyField value={value} strong />
    </div>
  </div>
);

export const KPIWidget: React.FC<{ label: string; value?: number | string; suffix?: string }> = ({ label, value, suffix }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#ffffff' }}>
    <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>{label}</div>
    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>{value ?? 'N/A'}{value !== undefined && suffix ? suffix : ''}</div>
  </div>
);

export const SummaryTable: React.FC<{ rows: Array<{ label: string; value: MoneyAmountDTO }> }> = ({ rows }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <tbody>
      {rows.map((row) => (
        <tr key={row.label}>
          <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{row.label}</td>
          <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
            <CurrencyField value={row.value} strong />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const TrustPositionCard: React.FC<{ statement: OwnerStatementDTO }> = ({ statement }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#f8fafc' }}>
    <SummaryTable
      rows={[
        { label: 'Opening Balance', value: statement.trustPosition.openingBalance },
        { label: 'Money Received', value: statement.trustPosition.moneyReceived },
        { label: 'Expenses', value: statement.trustPosition.expenses },
        { label: 'Owner Payments', value: statement.trustPosition.ownerPayments },
        { label: 'Closing Balance Held', value: statement.trustPosition.closingBalanceHeld }
      ]}
    />
  </div>
);

export const PaymentTable: React.FC<{ rows: LedgerRowDTO[] }> = ({ rows }) => (
  <LedgerTable rows={rows} />
);

export const StatementHeader: React.FC<{ statement: OwnerStatementDTO }> = ({ statement }) => {
  const logoSrc = companyLogoSrc(statement.company.logo);
  const ledgerLabel = statement.ledger === 'sale' ? 'Sale' : statement.ledger === 'rental' ? 'Rental' : '—';
  return (
    <header className="statement-header">
      <div className="statement-header-top">
        <div className="statement-brand">
          {logoSrc ? <img className="statement-logo" alt="" src={logoSrc} /> : null}
          <div className="statement-company">{statement.company.displayName}</div>
        </div>
        <div className="statement-heading">
          <h1 className="statement-title">PROPERTY ACCOUNT STATEMENT</h1>
          <div className="statement-heading-property">{statement.property.name || statement.property.address || '—'}</div>
        </div>
        <div className="statement-generated">
          <div><span className="meta-label">Generated</span> {formatLongDate(statement.audit.generatedAt)}</div>
          <div><span className="meta-label">Period</span> {formatPeriodLabel(statement)}</div>
        </div>
      </div>
      <div className="statement-meta">
        <div>
          <div className="meta-label">Property</div>
          <div className="meta-value">{statement.property.name}</div>
        </div>
        <div>
          <div className="meta-label">Address</div>
          <div className="meta-value">{statement.property.address || '—'}</div>
        </div>
        <div>
          <div className="meta-label">Owner</div>
          <div className="meta-value">{statement.owner.displayName}</div>
        </div>
        <div>
          <div className="meta-label">Ledger</div>
          <div className="meta-value">{ledgerLabel}</div>
        </div>
        <div>
          <div className="meta-label">Currency</div>
          <div className="meta-value">{statement.currency || statement.executiveSummary.rentalIncome.currency}</div>
        </div>
      </div>
    </header>
  );
};

export const StatementFooter: React.FC<{ statement: OwnerStatementDTO }> = ({ statement }) => (
  <footer className="statement-print-footer">
    <span>{statement.company.displayName}</span>
    <span>Property Account Statement</span>
    <span>Generated {formatLongDate(statement.audit.generatedAt)}</span>
  </footer>
);

export const MoneyFlowDiagram: React.FC<{ cashFlow: CashFlowDTO }> = ({ cashFlow }) => (
  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', alignItems: 'center' }}>
    {cashFlow.steps.map((step, index) => (
      <React.Fragment key={step.id}>
        <div style={{ border: `1px solid ${line}`, borderRadius: 10, padding: 14, background: step.direction === 'outflow' ? '#fff7ed' : brandGreen, color: step.direction === 'outflow' ? ink : '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 900 }}>{step.label}</div>
          <div style={{ marginTop: 8, fontSize: 18 }}><CurrencyField value={step.amount} strong /></div>
        </div>
        {index < cashFlow.steps.length - 1 ? <div style={{ textAlign: 'center', color: brandGreen, fontWeight: 900 }}>→</div> : null}
      </React.Fragment>
    ))}
  </div>
);

const COLUMNS = [
  { key: 'date', label: 'Date', width: '8%' },
  { key: 'type', label: 'Type', width: '7%' },
  { key: 'description', label: 'Description', width: '11%' },
  { key: 'rent', label: 'Amount received', width: '11%' },
  { key: 'commission', label: 'Commission', width: '10%' },
  { key: 'vat', label: 'VAT on commission', width: '14%' },
  { key: 'levies', label: 'Levy', width: '9%' },
  { key: 'owner', label: 'Net owner amount', width: '15%' },
  { key: 'balance', label: 'Balance', width: '15%' }
] as const;

export const LedgerTable: React.FC<{ rows: LedgerRowDTO[] }> = ({ rows }) => (
  <StatementTransactionTable rows={rows} />
);

const StatementTransactionTable: React.FC<{
  rows: LedgerRowDTO[];
  summary?: StatementSummaryDTO;
  selectedId?: string;
  onSelect?: (row: LedgerRowDTO) => void;
}> = ({ rows, summary, selectedId, onSelect }) => {
  const currency = rows[0]?.runningBalance.currency || summary?.closingBalance.currency || 'USD';
  const zero = { amount: 0, currency };
  const totals = {
    rent: summary?.totalRent || rows.reduce((sum, row) => ({ amount: sum.amount + Number(row.rentAmount?.amount || 0), currency }), zero),
    commission: summary?.totalCommission || rows.reduce((sum, row) => ({ amount: sum.amount + Number(row.commission?.amount || 0), currency }), zero),
    vat: summary?.totalVat || rows.reduce((sum, row) => ({ amount: sum.amount + Number(row.vatOnCommission?.amount || 0), currency }), zero),
    levies: summary?.totalLevies || rows.reduce((sum, row) => ({ amount: sum.amount + Number(row.levies?.amount || 0), currency }), zero),
    owner: summary?.totalOwnerAmount || rows
      .filter((row) => row.rowType === 'Income')
      .reduce((sum, row) => ({ amount: sum.amount + Number(row.ownerAmount?.amount || 0), currency }), zero),
    closing: summary?.closingBalance || (rows.length ? rows[rows.length - 1].runningBalance : zero)
  };

  return (
    <table className="statement-table">
      <colgroup>
        {COLUMNS.map((column) => (
          <col key={column.key} style={{ width: column.width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th
              key={column.key}
              className={column.key === 'date' || column.key === 'type' || column.key === 'description' ? 'col-text' : 'col-money'}
              style={{ width: column.width }}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={9} className="empty-row">No transactions for this statement period.</td>
          </tr>
        ) : rows.map((row) => {
          const isNegativeOwner = Number(row.ownerAmount?.amount || 0) < 0 || row.rowType === 'Payout' || row.rowType === 'Expense';
          return (
            <tr
              key={row.id}
              onClick={() => onSelect?.(row)}
              style={{ cursor: onSelect ? 'pointer' : undefined, background: selectedId === row.id ? '#f3faf6' : undefined }}
            >
              <td className="col-text">{formatShortDate(row.date)}</td>
              <td className="col-text col-type">{row.rowType || (row.credit.amount > 0 ? 'Income' : 'Expense')}</td>
              <td className="col-text col-description">{row.description}</td>
              <td className="col-money">{formatOptionalMoney(row.rentAmount)}</td>
              <td className="col-money">{formatDeduction(row.commission)}</td>
              <td className="col-money">{formatDeduction(row.vatOnCommission)}</td>
              <td className="col-money">{formatDeduction(row.levies)}</td>
              <td className={`col-money col-owner${isNegativeOwner ? ' is-negative' : ''}`}>
                {row.ownerAmount ? formatSignedMoney(row.ownerAmount, false) : '—'}
              </td>
              <td className="col-money col-balance">{formatMoney(row.runningBalance)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3} className="totals-label">Totals</td>
          <td className="col-money">{formatTotalsMoney(totals.rent)}</td>
          <td className="col-money">{formatTotalsDeduction(totals.commission)}</td>
          <td className="col-money">{formatTotalsDeduction(totals.vat)}</td>
          <td className="col-money">{formatTotalsDeduction(totals.levies)}</td>
          <td className="col-money col-owner">{formatSignedMoney(totals.owner)}</td>
          <td className="col-money col-balance">{formatTotalsMoney(totals.closing)}</td>
        </tr>
      </tfoot>
    </table>
  );
};

const StatementSummaryPanel: React.FC<{ summary: StatementSummaryDTO }> = ({ summary }) => {
  const rows: Array<{ label: string; value: MoneyAmountDTO; emphasize?: boolean; deduction?: boolean }> = [
    { label: 'Opening Balance', value: summary.openingBalance },
    { label: 'Amount Received', value: summary.totalRent },
    { label: 'Less Commission', value: summary.totalCommission, deduction: true },
    { label: 'Less VAT on Commission', value: summary.totalVat, deduction: true },
    { label: 'Less Levy', value: summary.totalLevies, deduction: true },
    { label: 'Net Owner Amount', value: summary.totalOwnerAmount },
    { label: 'Owner Payouts', value: summary.totalPayouts, deduction: true },
    { label: 'Balance Due to Owner', value: summary.closingBalance, emphasize: true }
  ];
  return (
    <section className="statement-summary">
      <div className="summary-heading">Statement Summary</div>
      <table className="summary-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.emphasize ? 'summary-closing' : undefined}>
              <th>{row.label}</th>
              <td>{row.deduction ? formatSummaryDeduction(row.value) : formatSummaryMoney(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

const statementStyles = `
  .property-account-statement {
    color: ${ink};
    font-family: Arial, Helvetica, sans-serif;
    width: 100%;
    max-width: 100%;
    background: #fff;
    box-sizing: border-box;
  }
  .property-account-statement.is-sheet {
    width: 297mm;
    min-height: 210mm;
    max-width: none;
    padding: 10mm;
    margin: 0 auto;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
    flex: 0 0 auto;
  }
  .property-account-statement *,
  .property-account-statement *::before,
  .property-account-statement *::after { box-sizing: border-box; }
  .statement-header { border-bottom: 2px solid ${brandGreen}; padding: 0 0 6px; margin: 0 0 8px; break-inside: avoid; page-break-inside: avoid; }
  .statement-header-top { display: grid; grid-template-columns: 1.15fr 1.4fr 1fr; gap: 8px; align-items: center; }
  .statement-brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .statement-logo { height: 36px; width: auto; max-width: 92px; object-fit: contain; object-position: left center; flex: 0 0 auto; }
  .statement-company { font-size: 11px; letter-spacing: 0.6px; font-weight: 800; color: ${brandGreen}; text-transform: uppercase; line-height: 1.25; }
  .statement-heading { text-align: center; min-width: 0; }
  .statement-title { margin: 0; font-size: 15px; letter-spacing: 0.4px; color: ${brandGreenDark}; font-weight: 800; line-height: 1.2; }
  .statement-heading-property { margin-top: 2px; font-size: 11px; font-weight: 700; color: ${ink}; line-height: 1.3; }
  .statement-generated { text-align: right; font-size: 10px; color: ${ink}; line-height: 1.45; }
  .statement-generated .meta-label { margin-right: 4px; }
  .statement-meta { display: grid; grid-template-columns: 1.15fr 1.45fr 1fr 0.55fr 0.55fr; gap: 8px; margin-top: 7px; }
  .meta-label { font-size: 8px; font-weight: 800; color: ${brandGreen}; text-transform: uppercase; letter-spacing: 0.35px; }
  .meta-value { margin-top: 1px; font-weight: 700; font-size: 11px; color: ${ink}; line-height: 1.3; overflow-wrap: anywhere; }
  .statement-overview { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); gap: 10px; align-items: start; margin: 0 0 8px; }
  .statement-overview.summary-only { grid-template-columns: minmax(220px, 320px); }
  .statement-summary { width: auto; max-width: none; margin: 0; break-inside: avoid; page-break-inside: avoid; }
  .summary-heading { font-size: 9px; font-weight: 800; letter-spacing: 0.6px; color: ${brandGreen}; text-transform: uppercase; margin-bottom: 3px; }
  .summary-table { width: 100%; border-collapse: collapse; }
  .summary-table th { text-align: left; font-weight: 600; font-size: 10px; color: ${ink}; padding: 2px 8px 2px 0; border-bottom: 1px solid ${line}; }
  .summary-table td { text-align: right; font-weight: 700; font-size: 10px; padding: 2px 0; border-bottom: 1px solid ${line}; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .summary-closing th, .summary-closing td { background: #dceee4; color: ${brandGreenDark}; font-weight: 800; border-top: 2px solid ${brandGreen}; border-bottom: 2px solid ${brandGreen}; padding: 4px 6px; }
  .statement-waterfall { border: 1px solid ${line}; border-radius: 4px; padding: 6px 8px; margin: 0; background: ${softGreen}; break-inside: avoid; page-break-inside: avoid; }
  .statement-waterfall .summary-heading { margin-bottom: 4px; }
  .waterfall-lines { display: grid; gap: 1px; font-size: 10px; line-height: 1.35; color: ${ink}; }
  .waterfall-net { font-weight: 800; }
  .waterfall-note { color: ${muted}; }
  .waterfall-review { color: ${dangerRed}; font-weight: 700; }
  .statement-empty-note { border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; padding: 6px 8px; margin: 0 0 8px; font-weight: 700; font-size: 11px; }
  .statement-table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; }
  .statement-table col:nth-child(1), .statement-table th:nth-child(1) { width: 8%; }
  .statement-table col:nth-child(2), .statement-table th:nth-child(2) { width: 7%; }
  .statement-table col:nth-child(3), .statement-table th:nth-child(3) { width: 11%; }
  .statement-table col:nth-child(4), .statement-table th:nth-child(4) { width: 11%; }
  .statement-table col:nth-child(5), .statement-table th:nth-child(5) { width: 10%; }
  .statement-table col:nth-child(6), .statement-table th:nth-child(6) { width: 14%; }
  .statement-table col:nth-child(7), .statement-table th:nth-child(7) { width: 9%; }
  .statement-table col:nth-child(8), .statement-table th:nth-child(8) { width: 15%; }
  .statement-table col:nth-child(9), .statement-table th:nth-child(9) { width: 15%; }
  .statement-table thead { display: table-header-group; }
  .statement-table tfoot { display: table-footer-group; }
  .statement-table th { background: #dceee4; color: ${brandGreenDark}; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15px; line-height: 1.2; padding: 4px 3px; vertical-align: bottom; border-bottom: 2px solid ${brandGreen}; overflow-wrap: anywhere; }
  .statement-table td { padding: 3px; border-bottom: 1px solid #e2ebe5; font-size: 9px; vertical-align: top; color: ${ink}; }
  .statement-table tbody tr:nth-child(even) td { background: #f4faf6; }
  .statement-table .col-text { text-align: left; }
  .statement-table .col-money { text-align: right; font-variant-numeric: tabular-nums; }
  .statement-table td.col-money, .statement-table th.col-money { white-space: nowrap; }
  .statement-table .col-type { font-weight: 700; }
  .statement-table .col-description { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
  .statement-table .col-owner { font-weight: 700; }
  .statement-table .col-owner.is-negative { color: ${dangerRed}; }
  .statement-table .col-balance { font-weight: 800; }
  .statement-table tfoot td { background: ${softGreen}; font-weight: 800; border-top: 2px solid ${brandGreen}; border-bottom: 2px solid ${brandGreen}; font-size: 9px; }
  .statement-table .totals-label { text-align: left; text-transform: uppercase; font-size: 8px; letter-spacing: 0.3px; }
  .statement-table .empty-row { text-align: center; color: ${muted}; background: #fff; }
  .statement-table tbody tr, .statement-table tfoot tr { page-break-inside: avoid; break-inside: avoid; }
  .statement-print-footer { margin-top: 8px; border-top: 1px solid ${line}; padding-top: 4px; display: flex; justify-content: space-between; gap: 8px; font-size: 8px; color: ${muted}; break-inside: avoid; page-break-inside: avoid; }
  @media screen and (max-width: 900px) {
    .property-account-statement:not(.is-sheet) .statement-header-top,
    .property-account-statement:not(.is-sheet) .statement-overview { grid-template-columns: 1fr; }
    .property-account-statement:not(.is-sheet) .statement-meta { grid-template-columns: 1fr 1fr; }
    .property-account-statement:not(.is-sheet) .statement-generated,
    .property-account-statement:not(.is-sheet) .statement-heading { text-align: left; }
  }
  @media print {
    .property-account-statement,
    .property-account-statement.is-sheet {
      width: 100% !important;
      min-height: 0 !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      background: #fff !important;
    }
    .statement-table { width: 100% !important; table-layout: fixed !important; }
    .statement-table thead { display: table-header-group !important; }
    .statement-table tfoot { display: table-footer-group !important; }
    .statement-table th, .statement-table td, .summary-closing th, .summary-closing td {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

const OwnerWaterfallPanel: React.FC<{ waterfall: OwnerWaterfallDTO; detail?: LedgerRowDTO | null }> = ({ waterfall, detail }) => (
  <section className="statement-waterfall" style={waterfall.reviewRequired ? { background: '#fff7ed' } : undefined}>
    <div className="summary-heading">{detail ? 'How this amount was calculated' : 'How the owner amount is calculated'}</div>
    <div className="waterfall-lines">
      <div>Amount received {formatMoney(waterfall.grossAmount)}</div>
      <div>Less commission {formatDeduction(waterfall.commissionAmount)}</div>
      <div>Less levy {formatDeduction(waterfall.levyAmount)}</div>
      <div>Less VAT on commission {formatDeduction(waterfall.vatOnCommission)}{waterfall.vatRate != null ? ` at ${(waterfall.vatRate <= 1 ? waterfall.vatRate * 100 : waterfall.vatRate).toFixed(1)}%` : ''}</div>
      <div className="waterfall-net">Net owner amount {formatMoney(waterfall.netOwnerAmount)}</div>
      {waterfall.reviewRequired ? (
        <div className="waterfall-review">
          Review required. Recorded owner income is {waterfall.recordedOwnerAmount ? formatMoney(waterfall.recordedOwnerAmount) : 'missing'}. Difference {formatMoney(waterfall.difference)}. No amount was changed.
        </div>
      ) : (
        <div>Recorded owner income matches this allocation.</div>
      )}
      {detail?.paymentId ? <div className="waterfall-note">Payment {detail.paymentId}</div> : null}
    </div>
  </section>
);

export const OwnerStatementPreview: React.FC<{ statement: OwnerStatementDTO; layout?: 'sheet' | 'flow' }> = ({ statement, layout = 'flow' }) => {
  const [selected, setSelected] = React.useState<LedgerRowDTO | null>(null);
  const summary = statement.statementSummary || {
    openingBalance: statement.executiveSummary.openingBalance,
    totalRent: statement.rentalSettlement?.grossRent || statement.executiveSummary.rentalIncome,
    totalCommission: statement.rentalSettlement?.commission || { amount: 0, currency: statement.executiveSummary.rentalIncome.currency },
    totalVat: statement.rentalSettlement?.vatOnCommission || { amount: 0, currency: statement.executiveSummary.rentalIncome.currency },
    totalLevies: statement.rentalSettlement?.levy || { amount: 0, currency: statement.executiveSummary.rentalIncome.currency },
    totalOwnerAmount: statement.rentalSettlement?.ownerPayable || statement.executiveSummary.netAvailable,
    totalPayouts: statement.executiveSummary.ownerPaid,
    closingBalance: statement.executiveSummary.closingTrustBalance
  };

  const waterfall = selected?.ownerWaterfall || statement.ownerMoneyWaterfall;
  return (
    <article className={`property-account-statement${layout === 'sheet' ? ' is-sheet' : ''}`}>
      <style>{statementStyles}</style>
      <StatementHeader statement={statement} />
      {!statement.dataQuality.hasLedgerData && (
        <div className="statement-empty-note">
          No ledger entries were found for the selected period.
        </div>
      )}
      <div className={`statement-overview${waterfall ? '' : ' summary-only'}`}>
        <StatementSummaryPanel summary={summary} />
        {waterfall ? <OwnerWaterfallPanel waterfall={waterfall} detail={selected} /> : null}
      </div>
      <StatementTransactionTable
        rows={statement.trustLedger}
        summary={summary}
        selectedId={selected?.id}
        onSelect={(row) => setSelected(row.paymentId || row.ownerWaterfall ? row : null)}
      />
      <StatementFooter statement={statement} />
    </article>
  );
};

