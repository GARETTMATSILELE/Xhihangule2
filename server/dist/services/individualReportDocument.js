"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.presentExportRows = presentExportRows;
exports.toCsv = toCsv;
exports.toPdf = toPdf;
const pdf_lib_1 = require("pdf-lib");
const HIDDEN_KEYS = new Set([
    '_id', 'id', '__v', 'propertyId', 'paymentId', 'companyId', 'ownerId', 'processedBy',
    'idempotencyKey', 'attachments', 'createdAt', 'updatedAt', 'taxPeriodId', 'snapshotId',
    'sourceId', 'chargeTypeId', 'recipientId', 'reversesPaymentId', 'passThroughType',
    'accountingTreatment', 'transactionCategory', 'chargeTypeCode', 'direction', 'notes',
    'taxPeriodKey', 'taxCalculationStatus', 'vatTreatment', 'rentalTaxTreatment',
    'taxTypesRelevant', 'deductibility', 'capitalOrRevenue', 'taxAmount', 'vatAmount',
    'inputVatEligibility', 'supplierTin', 'supplierVatNumber'
]);
const LABELS = {
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
function labelFor(key) {
    return LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}
function isTechnical(key) {
    return HIDDEN_KEYS.has(key) || key.startsWith('_');
}
function pdfSafe(value) {
    return String(value !== null && value !== void 0 ? value : '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}
function isoDate(value) {
    if (!value)
        return '';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime()))
        return pdfSafe(value);
    return date.toISOString().slice(0, 10);
}
function displayStatus(value) {
    const status = String(value || '');
    if (status === 'green')
        return 'Paid';
    if (status === 'amber')
        return 'Part paid';
    if (status === 'red')
        return 'Unpaid';
    return status;
}
function presentExportRows(rows) {
    return (rows || []).map((row) => {
        const next = {};
        Object.keys(row || {}).forEach((key) => {
            if (isTechnical(key))
                return;
            const value = row[key];
            if (value && typeof value === 'object')
                return;
            if (key === 'date')
                next[key] = isoDate(value);
            else if (key === 'status')
                next[key] = displayStatus(value);
            else if (typeof value === 'number')
                next[key] = Number(value.toFixed(2));
            else if (value == null || value === '')
                return;
            else
                next[key] = String(value);
        });
        return next;
    });
}
function csvEscape(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function toCsv(rows) {
    const cleaned = presentExportRows(rows);
    if (!cleaned.length)
        return '';
    const headers = Array.from(cleaned.reduce((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
    }, new Set()));
    return [
        headers.map((header) => csvEscape(labelFor(header))).join(','),
        ...cleaned.map((row) => headers.map((header) => { var _a; return csvEscape((_a = row[header]) !== null && _a !== void 0 ? _a : ''); }).join(','))
    ].join('\n');
}
function fit(text, width, size, font) {
    const safe = pdfSafe(text) || '—';
    if (font.widthOfTextAtSize(safe, size) <= width)
        return safe;
    let low = 0;
    let high = safe.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const slice = `${safe.slice(0, mid)}...`;
        if (font.widthOfTextAtSize(slice, size) <= width)
            low = mid;
        else
            high = mid - 1;
    }
    return `${safe.slice(0, Math.max(0, low))}...`;
}
function formatCell(key, value) {
    if (value == null || value === '')
        return '—';
    if (PERCENT_KEYS.has(key) && typeof value === 'number')
        return `${Math.round(value)}%`;
    if (MONEY_KEYS.has(key) && typeof value === 'number') {
        const absolute = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return value < 0 ? `(${absolute})` : absolute;
    }
    return displayStatus(value);
}
function columnWeight(key) {
    if (key === 'description')
        return 2.4;
    if (key === 'property')
        return 1.7;
    if (MONEY_KEYS.has(key))
        return 1.15;
    return 1;
}
function toPdf(meta, rows) {
    return __awaiter(this, void 0, void 0, function* () {
        const cleaned = presentExportRows(rows);
        const keys = cleaned.length
            ? Array.from(cleaned.reduce((set, row) => {
                Object.keys(row).forEach((key) => set.add(key));
                return set;
            }, new Set()))
            : [];
        const landscape = keys.length > 6;
        const pageWidth = landscape ? 842 : 595;
        const pageHeight = landscape ? 595 : 842;
        const margin = 36;
        const pdf = yield pdf_lib_1.PDFDocument.create();
        const font = yield pdf.embedFont(pdf_lib_1.StandardFonts.Helvetica);
        const bold = yield pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
        const green = (0, pdf_lib_1.rgb)(8 / 255, 71 / 255, 52 / 255);
        const ink = (0, pdf_lib_1.rgb)(0.12, 0.16, 0.18);
        const muted = (0, pdf_lib_1.rgb)(0.38, 0.43, 0.46);
        const line = (0, pdf_lib_1.rgb)(0.89, 0.91, 0.9);
        const totalFill = (0, pdf_lib_1.rgb)(0.96, 0.97, 0.96);
        const headerFill = (0, pdf_lib_1.rgb)(0.91, 0.95, 0.93);
        const negative = (0, pdf_lib_1.rgb)(0.62, 0.27, 0.27);
        const pages = [];
        const contentWidth = pageWidth - margin * 2;
        const weights = keys.map(columnWeight);
        const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
        const widths = weights.map((weight) => (contentWidth * weight) / weightSum);
        const totals = {};
        keys.forEach((key) => {
            if (!TOTAL_KEYS.has(key))
                return;
            const numbers = cleaned.map((row) => row[key]).filter((value) => typeof value === 'number');
            if (numbers.length)
                totals[key] = Number(numbers.reduce((sum, value) => sum + value, 0).toFixed(2));
        });
        const hasTotals = Object.keys(totals).length > 0 && cleaned.length > 0;
        let page = pdf.addPage([pageWidth, pageHeight]);
        pages.push(page);
        const drawHeader = () => {
            page.drawRectangle({ x: 0, y: pageHeight - 42, width: pageWidth, height: 42, color: green });
            page.drawText('MANTIS', { x: margin, y: pageHeight - 26, size: 12, font: bold, color: (0, pdf_lib_1.rgb)(1, 1, 1) });
            page.drawText('Property reports', { x: pageWidth - margin - 92, y: pageHeight - 25, size: 9, font, color: (0, pdf_lib_1.rgb)(1, 1, 1) });
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
        }
        else {
            drawTableHeader();
            const paintRow = (row, emphasise = false) => {
                if (y < 48) {
                    page = pdf.addPage([pageWidth, pageHeight]);
                    pages.push(page);
                    drawHeader();
                    y = pageHeight - 64;
                    drawTableHeader();
                }
                if (emphasise)
                    page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: rowHeight, color: totalFill });
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
                const totalRow = {};
                keys.forEach((key, index) => {
                    if (index === 0)
                        totalRow[key] = 'Total';
                    else if (typeof totals[key] === 'number')
                        totalRow[key] = totals[key];
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
        return Buffer.from(yield pdf.save());
    });
}
