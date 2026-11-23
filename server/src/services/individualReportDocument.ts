import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

const HIDDEN_KEYS = new Set([
  '_id', 'id', '__v', 'propertyId', 'paymentId', 'companyId', 'ownerId', 'processedBy',
  'idempotencyKey', 'attachments', 'createdAt', 'updatedAt', 'taxPeriodId', 'snapshotId',
  'sourceId', 'chargeTypeId', 'recipientId', 'reversesPaymentId', 'passThroughType',
  'accountingTreatment', 'transactionCategory', 'chargeTypeCode', 'direction', 'notes',
  'taxPeriodKey', 'taxCalculationStatus', 'vatTreatment', 'rentalTaxTreatment',
  'taxTypesRelevant', 'deductibility', 'capitalOrRevenue', 'taxAmount', 'vatAmount',
  'inputVatEligibility', 'supplierTin', 'supplierVatNumber'
]);

const LABELS: Record<string, string> = {
  property: 'Property',
  expectedRent: 'Expected rent',
  collectedRent: 'Collected rent',
  outstandingRent: 'Outstanding rent',
  collectionPercent: 'Collection %',
  status: 'Status',
  income: 'Income',
  expenses: 'Expenses',
  netProfit: 'Net operating income',
  yearToDateProfit: 'Year to date',
  annualisedRunRate: 'Annualised run rate',
  expenseRatio: 'Expense ratio %',
  profitabilityPercent: 'Margin %',
  units: 'Units',
  occupiedUnits: 'Occupied',
  vacantUnits: 'Vacant',
  occupancyPercent: 'Occupancy %',
  date: 'Date',
  category: 'Category',
  description: 'Description',
  amount: 'Amount',
  currency: 'Currency',
  reference: 'Reference',
  entry: 'Entry',
  balance: 'Balance'
};

const MONEY_KEYS = new Set([
  'expectedRent', 'collectedRent', 'outstandingRent', 'income', 'expenses', 'netProfit',
  'yearToDateProfit', 'annualisedRunRate', 'amount', 'balance'
]);

const PERCENT_KEYS = new Set(['collectionPercent', 'expenseRatio', 'profitabilityPercent', 'occupancyPercent']);

const TOTAL_KEYS = new Set([
  'expectedRent', 'collectedRent', 'outstandingRent', 'income', 'expenses', 'netProfit', 'amount'
]);

export type ReportDocumentMeta = {
  title: string;
  ownerName?: string;
  periodLabel?: string;
  propertyName?: string;
  currency?: string;
  generatedAt?: string;
  note?: string;
};

function labelFor(key: string) {
  return LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function isTechnical(key: string) {
  return HIDDEN_KEYS.has(key) || key.startsWith('_');
}

function pdfSafe(value: unknown) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isoDate(value: unknown) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return pdfSafe(value);
  return date.toISOString().slice(0, 10);
}

function displayStatus(value: unknown) {
  const status = String(value || '');
  if (status === 'green') return 'Paid';
  if (status === 'amber') return 'Part paid';
  if (status === 'red') return 'Unpaid';
  return status;
}

export function presentExportRows(rows: any[]) {
  return (rows || []).map((row) => {
    const next: Record<string, string | number> = {};
    Object.keys(row || {}).forEach((key) => {
      if (isTechnical(key)) return;
      const value = row[key];
      if (value && typeof value === 'object') return;
      if (key === 'date') next[key] = isoDate(value);
      else if (key === 'status') next[key] = displayStatus(value);
      else if (typeof value === 'number') next[key] = Number(value.toFixed(2));
      else if (value == null || value === '') return;
      else next[key] = String(value);
    });
    return next;
  });
}

function csvEscape(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: any[]) {
  const cleaned = presentExportRows(rows);
  if (!cleaned.length) return '';
  const headers = Array.from(cleaned.reduce((set: Set<string>, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  return [
    headers.map((header) => csvEscape(labelFor(header))).join(','),
    ...cleaned.map((row) => headers.map((header) => csvEscape(row[header] ?? '')).join(','))
  ].join('\n');
}

function fit(text: string, width: number, size: number, font: PDFFont) {
  const safe = pdfSafe(text) || '—';
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  let low = 0;
  let high = safe.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = `${safe.slice(0, mid)}...`;
    if (font.widthOfTextAtSize(slice, size) <= width) low = mid;
    else high = mid - 1;
  }
  return `${safe.slice(0, Math.max(0, low))}...`;
}

function formatCell(key: string, value: unknown) {
  if (value == null || value === '') return '—';
  if (PERCENT_KEYS.has(key) && typeof value === 'number') return `${Math.round(value)}%`;
  if (MONEY_KEYS.has(key) && typeof value === 'number') {
    const absolute = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value < 0 ? `(${absolute})` : absolute;
  }
  return displayStatus(value);
}

function columnWeight(key: string) {
  if (key === 'description') return 2.4;
  if (key === 'property') return 1.7;
  if (MONEY_KEYS.has(key)) return 1.15;
  return 1;
}

export async function toPdf(meta: ReportDocumentMeta, rows: any[]) {
  const cleaned = presentExportRows(rows);
  const keys = cleaned.length
    ? Array.from(cleaned.reduce((set: Set<string>, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()))
    : [];
  const landscape = keys.length > 6;
  const pageWidth = landscape ? 842 : 595;
  const pageHeight = landscape ? 595 : 842;
  const margin = 36;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(8 / 255, 71 / 255, 52 / 255);
  const ink = rgb(0.12, 0.16, 0.18);
  const muted = rgb(0.38, 0.43, 0.46);
  const line = rgb(0.89, 0.91, 0.9);
  const totalFill = rgb(0.96, 0.97, 0.96);
  const headerFill = rgb(0.91, 0.95, 0.93);
  const negative = rgb(0.62, 0.27, 0.27);
  const pages: PDFPage[] = [];

  const contentWidth = pageWidth - margin * 2;
  const weights = keys.map(columnWeight);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const widths = weights.map((weight) => (contentWidth * weight) / weightSum);

  const totals: Record<string, number> = {};
  keys.forEach((key) => {
    if (!TOTAL_KEYS.has(key)) return;
    const numbers = cleaned.map((row) => row[key]).filter((value) => typeof value === 'number') as number[];
    if (numbers.length) totals[key] = Number(numbers.reduce((sum, value) => sum + value, 0).toFixed(2));
  });
  const hasTotals = Object.keys(totals).length > 0 && cleaned.length > 0;

  let page = pdf.addPage([pageWidth, pageHeight]);
  pages.push(page);
  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: pageHeight - 42, width: pageWidth, height: 42, color: green });
    page.drawText('MANTIS', { x: margin, y: pageHeight - 26, size: 12, font: bold, color: rgb(1, 1, 1) });
    page.drawText('Property reports', { x: pageWidth - margin - 92, y: pageHeight - 25, size: 9, font, color: rgb(1, 1, 1) });
  };
  drawHeader();
  let y = pageHeight - 68;
  page.drawText(fit(meta.title || 'Report', contentWidth, 16, bold), { x: margin, y, size: 16, font: bold, color: ink });
  y -= 18;
  const metaLine = [
    meta.ownerName ? pdfSafe(meta.ownerName) : '',
    meta.periodLabel ? pdfSafe(meta.periodLabel) : '',
    meta.propertyName ? pdfSafe(meta.propertyName) : 'All properties',
    meta.currency ? pdfSafe(meta.currency) : '',
    meta.generatedAt ? `Generated ${pdfSafe(meta.generatedAt)}` : ''
  ].filter(Boolean).join('   ·   ');
  page.drawText(fit(metaLine, contentWidth, 9, font), { x: margin, y, size: 9, font, color: muted });
  y -= 16;
  if (meta.note) {
    page.drawText(fit(meta.note, contentWidth, 8, font), { x: margin, y, size: 8, font, color: muted });
    y -= 14;
  }
  y -= 6;

  const rowHeight = 16;
  const drawTableHeader = () => {
    page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: rowHeight, color: headerFill });
    let x = margin + 4;
    keys.forEach((key, index) => {
      const alignRight = MONEY_KEYS.has(key) || PERCENT_KEYS.has(key);
      const text = fit(labelFor(key), widths[index] - 8, 8, bold);
      const textWidth = bold.widthOfTextAtSize(text, 8);
      page.drawText(text, { x: alignRight ? x + widths[index] - 8 - textWidth : x, y: y, size: 8, font: bold, color: green });
      x += widths[index];
    });
    y -= rowHeight + 2;
  };

  if (!cleaned.length || !keys.length) {
    page.drawText('No financial activity found for this reporting period.', { x: margin, y, size: 10, font, color: ink });
  } else {
    drawTableHeader();
    const paintRow = (row: Record<string, string | number>, emphasise = false) => {
      if (y < 48) {
        page = pdf.addPage([pageWidth, pageHeight]);
        pages.push(page);
        drawHeader();
        y = pageHeight - 64;
        drawTableHeader();
      }
      if (emphasise) page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: rowHeight, color: totalFill });
      let x = margin + 4;
      keys.forEach((key, index) => {
        const raw = row[key];
        const text = fit(formatCell(key, raw), widths[index] - 8, 8, emphasise ? bold : font);
        const alignRight = MONEY_KEYS.has(key) || PERCENT_KEYS.has(key);
        const used = (emphasise ? bold : font).widthOfTextAtSize(text, 8);
        const color = typeof raw === 'number' && raw < 0 && MONEY_KEYS.has(key) ? negative : ink;
        page.drawText(text, {
          x: alignRight ? x + widths[index] - 8 - used : x,
          y,
          size: 8,
          font: emphasise ? bold : font,
          color
        });
        x += widths[index];
      });
      y -= rowHeight;
      page.drawLine({ start: { x: margin, y: y + 12 }, end: { x: margin + contentWidth, y: y + 12 }, thickness: 0.4, color: line });
    };
    cleaned.forEach((row) => paintRow(row));
    if (hasTotals) {
      const totalRow: Record<string, string | number> = {};
      keys.forEach((key, index) => {
        if (index === 0) totalRow[key] = 'Total';
        else if (typeof totals[key] === 'number') totalRow[key] = totals[key];
      });
      paintRow(totalRow, true);
    }
  }

  pages.forEach((item, index) => {
    item.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: pageWidth - margin - 70,
      y: 22,
      size: 8,
      font,
      color: muted
    });
    item.drawText('Mantis', { x: margin, y: 22, size: 8, font, color: muted });
  });

  return Buffer.from(await pdf.save());
}
