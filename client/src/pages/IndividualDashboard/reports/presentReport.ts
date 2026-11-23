export type ColumnKind = 'text' | 'money' | 'percent' | 'date' | 'number';

export type ReportColumn = {
  key: string;
  label: string;
  align: 'left' | 'right';
  kind: ColumnKind;
};

export type ChartModel = {
  title: string;
  data: Array<Record<string, string | number>>;
  bars: Array<[string, string]>;
  xKey: string;
};

const LABELS: Record<string, string> = {
  property: 'Property',
  expectedRent: 'Expected rent',
  collectedRent: 'Collected rent',
  outstandingRent: 'Outstanding rent',
  collectionPercent: 'Collection',
  status: 'Status',
  income: 'Income',
  expenses: 'Expenses',
  netProfit: 'Net operating income',
  yearToDateProfit: 'Year to date',
  annualisedRunRate: 'Annualised run rate',
  expenseRatio: 'Expense ratio',
  profitabilityPercent: 'Margin',
  units: 'Units',
  occupiedUnits: 'Occupied',
  vacantUnits: 'Vacant',
  occupancyPercent: 'Occupancy',
  date: 'Date',
  category: 'Category',
  description: 'Description',
  amount: 'Amount',
  currency: 'Currency',
  reference: 'Reference',
  entry: 'Entry',
  balance: 'Balance',
  currencies: 'Currencies',
  tenant: 'Tenant',
  start: 'Start',
  end: 'End',
  rent: 'Rent',
  grossRentalReceipts: 'Gross rental receipts',
  rentalTaxBase: 'Rental tax base',
  calculatedRentalTax: 'Calculated rental tax',
  taxPayments: 'Tax payments'
};

const MONEY = new Set(['expectedRent', 'collectedRent', 'outstandingRent', 'income', 'expenses', 'netProfit', 'yearToDateProfit', 'annualisedRunRate', 'amount', 'balance', 'rent', 'grossRentalReceipts', 'rentalTaxBase', 'calculatedRentalTax', 'taxPayments']);
const PERCENT = new Set(['collectionPercent', 'expenseRatio', 'profitabilityPercent', 'occupancyPercent']);
const TOTAL = new Set(['expectedRent', 'collectedRent', 'outstandingRent', 'income', 'expenses', 'netProfit', 'amount']);
const HIDDEN = new Set(['reportType', 'propertyId', '_id', 'id']);

const INCOME = '#0d6b52';
const EXPENSE = '#9a4a4a';
const NET = '#084734';

export function formatReportMoney(value: number, currency = 'USD') {
  const amount = Math.abs(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const code = currency === 'ZiG' ? 'ZiG' : currency;
  try {
    if (currency !== 'ZiG') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value) || 0);
    }
  } catch {
    /* Fall through to a plain amount. */
  }
  return Number(value) < 0 ? `${code} (${amount})` : `${code} ${amount}`;
}

export function formatReportDate(value?: string | number | null) {
  if (value == null || value === '') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatMonthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function collectionLabel(value: unknown) {
  if (value === 'green') return 'Paid';
  if (value === 'amber') return 'Part paid';
  if (value === 'red') return 'Unpaid';
  return value == null || value === '' ? '—' : String(value);
}

export function comparisonText(current: number, previous: number | null | undefined, label?: string | null) {
  if (previous == null || !label || Number.isNaN(Number(previous))) return null;
  const delta = Number((Number(current) - Number(previous)).toFixed(2));
  if (delta === 0) return { direction: 'flat' as const, text: `No change from ${label}`, percent: null };
  const direction = delta > 0 ? 'up' as const : 'down' as const;
  const percent = Number(previous) !== 0 ? Math.round((delta / Math.abs(Number(previous))) * 1000) / 10 : null;
  return { direction, text: delta > 0 ? 'above' : 'below', percent, absolute: Math.abs(delta) };
}

function columnFor(key: string): ReportColumn {
  const kind: ColumnKind = key === 'date' ? 'date' : MONEY.has(key) ? 'money' : PERCENT.has(key) ? 'percent' : key === 'units' || key === 'occupiedUnits' || key === 'vacantUnits' ? 'number' : 'text';
  return {
    key,
    label: LABELS[key] || key,
    align: kind === 'money' || kind === 'percent' || kind === 'number' ? 'right' : 'left',
    kind
  };
}

function visibleKeys(rows: Array<Record<string, any>>) {
  const keys: string[] = [];
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (HIDDEN.has(key) || key.startsWith('_')) return;
      const value = row[key];
      if (value && typeof value === 'object') return;
      if (!keys.includes(key) && rows.some((item) => item?.[key] != null && item[key] !== '')) keys.push(key);
    });
  });
  return keys;
}

export function presentRows(rows: Array<Record<string, any>>) {
  const keys = visibleKeys(rows || []);
  const columns = keys.map(columnFor);
  const normalised = (rows || []).map((row) => {
    const next: Record<string, string | number | null> = {};
    keys.forEach((key) => {
      if (row[key] == null || row[key] === '') next[key] = null;
      else if (key === 'status') next[key] = collectionLabel(row[key]);
      else next[key] = row[key];
    });
    return next;
  });
  const currencies = Array.from(new Set(normalised.map((row) => String(row.currency || '')).filter(Boolean)));
  const groups = currencies.length > 1 ? currencies : [currencies[0] || ''];
  const totals = groups.map((currency) => {
    const subset = currencies.length > 1 ? normalised.filter((row) => row.currency === currency) : normalised;
    const values: Record<string, number> = {};
    columns.forEach((column) => {
      if (!TOTAL.has(column.key)) return;
      const numbers = subset.map((row) => row[column.key]).filter((value) => typeof value === 'number') as number[];
      if (numbers.length) values[column.key] = Number(numbers.reduce((sum, value) => sum + value, 0).toFixed(2));
    });
    return { currency: currency || 'USD', values };
  }).filter((group) => Object.keys(group.values).length > 0);
  return { columns, rows: normalised, totals };
}

export function buildReportCharts(reportKey: string, rows: Array<Record<string, any>>, series?: Array<{ currency: string; points: Array<{ month: string; income: number; expenses: number; net: number }> }>) {
  const charts: ChartModel[] = [];
  const activeSeries = (series || []).filter((group) => group.points.some((point) => point.income || point.expenses));
  if (['profit-loss', 'income-statement', 'cashflow'].includes(reportKey)) {
    activeSeries.forEach((group) => {
      if (group.points.length < 2) return;
      charts.push({
        title: group.currency ? `Income and expenses · ${group.currency}` : 'Income and expenses',
        xKey: 'month',
        data: group.points.map((point) => ({ month: formatMonthLabel(point.month), income: point.income, expenses: point.expenses, net: point.net })),
        bars: reportKey === 'cashflow'
          ? [['income', INCOME], ['expenses', EXPENSE]]
          : [['income', INCOME], ['expenses', EXPENSE], ['net', NET]]
      });
    });
  }
  const propertyRows = rows.filter((row) => row.property && (Number(row.income) || Number(row.expenses) || Number(row.netProfit)));
  if (['profit-loss', 'property-performance', 'income-statement'].includes(reportKey) && propertyRows.length >= 2) {
    const currencies = Array.from(new Set(propertyRows.map((row) => String(row.currency || 'USD'))));
    currencies.forEach((currency) => {
      const matching = propertyRows.filter((row) => String(row.currency || 'USD') === currency);
      if (matching.length < 2) return;
      charts.push({
        title: currencies.length > 1 ? `Property result · ${currency}` : 'Property result',
        xKey: 'property',
        data: matching.map((row) => ({ property: String(row.property), income: Number(row.income || 0), expenses: Number(row.expenses || 0) })),
        bars: [['income', INCOME], ['expenses', EXPENSE]]
      });
    });
  }
  if (reportKey === 'expense-summary' || reportKey === 'maintenance-summary') {
    const byCategory = new Map<string, number>();
    rows.forEach((row) => {
      const amount = Number(row.amount || 0);
      if (!amount) return;
      const key = `${row.currency || 'USD'}|${row.category || 'Other'}`;
      byCategory.set(key, (byCategory.get(key) || 0) + amount);
    });
    const currencies = Array.from(new Set(Array.from(byCategory.keys()).map((key) => key.split('|')[0])));
    currencies.forEach((currency) => {
      const data = Array.from(byCategory.entries())
        .filter(([key]) => key.startsWith(`${currency}|`))
        .map(([key, amount]) => ({ category: key.split('|').slice(1).join('|'), amount: Number(amount.toFixed(2)) }));
      if (data.length < 1 || data.every((row) => !row.amount)) return;
      charts.push({
        title: currencies.length > 1 ? `Expenses by category · ${currency}` : 'Expenses by category',
        xKey: 'category',
        data,
        bars: [['amount', EXPENSE]]
      });
    });
  }
  if (reportKey === 'occupancy') {
    const occupied = rows.reduce((sum, row) => sum + Number(row.occupiedUnits || 0), 0);
    const vacant = rows.reduce((sum, row) => sum + Number(row.vacantUnits || 0), 0);
    if (occupied + vacant > 0) {
      charts.push({
        title: 'Occupied and vacant',
        xKey: 'label',
        data: [{ label: 'Portfolio', occupied, vacant }],
        bars: [['occupied', INCOME], ['vacant', '#8aa39a']]
      });
    }
  }
  return charts.slice(0, 2);
}

export function displayCell(column: ReportColumn, value: string | number | null, currency = 'USD') {
  if (value == null || value === '') return '—';
  if (column.kind === 'money' && typeof value === 'number') {
    const formatted = formatReportMoney(value, currency);
    return value < 0 ? formatted : formatted;
  }
  if (column.kind === 'percent' && typeof value === 'number') return `${Math.round(value)}%`;
  if (column.kind === 'date') return formatReportDate(value);
  return String(value);
}
