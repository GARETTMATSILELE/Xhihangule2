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
exports.ExportEngine = void 0;
const pdf_lib_1 = require("pdf-lib");
const templates_1 = require("../templates");
const csvEscape = (value) => {
    const text = String(value !== null && value !== void 0 ? value : '');
    if (/[",\n]/.test(text))
        return `"${text.replace(/"/g, '""')}"`;
    return text;
};
const xmlEscape = (value) => String(value !== null && value !== void 0 ? value : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const worksheet = (name, rows) => `
  <Worksheet ss:Name="${xmlEscape(name)}">
    <Table>
      ${rows
    .map((row) => `<Row>${row
    .map((cell) => `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`)
    .join('')}</Row>`)
    .join('')}
    </Table>
  </Worksheet>`;
class ExportEngine {
    constructor(templateEngine = new templates_1.TemplateEngine()) {
        this.templateEngine = templateEngine;
    }
    exportOwnerStatement(dto, format) {
        return __awaiter(this, void 0, void 0, function* () {
            if (format === 'pdf')
                return this.toPdf(dto);
            if (format === 'csv')
                return this.toCsv(dto);
            if (format === 'excel')
                return this.toExcel(dto);
            return this.toJson(dto);
        });
    }
    toPdf(dto) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const pdfDoc = yield pdf_lib_1.PDFDocument.create();
            const pageSize = [841.89, 595.28];
            const font = yield pdfDoc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
            const bold = yield pdfDoc.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
            const green = (0, pdf_lib_1.rgb)(0, 0.27, 0.18);
            const paleGreen = (0, pdf_lib_1.rgb)(0.84, 0.95, 0.87);
            const red = (0, pdf_lib_1.rgb)(0.7, 0.14, 0.1);
            const ink = (0, pdf_lib_1.rgb)(0.06, 0.09, 0.16);
            const muted = (0, pdf_lib_1.rgb)(0.28, 0.33, 0.41);
            const line = (0, pdf_lib_1.rgb)(0.86, 0.91, 0.87);
            const summary = dto.statementSummary || {
                openingBalance: dto.executiveSummary.openingBalance,
                totalRent: ((_a = dto.rentalSettlement) === null || _a === void 0 ? void 0 : _a.grossRent) || dto.executiveSummary.rentalIncome,
                totalCommission: ((_b = dto.rentalSettlement) === null || _b === void 0 ? void 0 : _b.commission) || { amount: 0, currency: dto.executiveSummary.rentalIncome.currency },
                totalVat: ((_c = dto.rentalSettlement) === null || _c === void 0 ? void 0 : _c.vatOnCommission) || { amount: 0, currency: dto.executiveSummary.rentalIncome.currency },
                totalLevies: ((_d = dto.rentalSettlement) === null || _d === void 0 ? void 0 : _d.levy) || { amount: 0, currency: dto.executiveSummary.rentalIncome.currency },
                totalOwnerAmount: ((_e = dto.rentalSettlement) === null || _e === void 0 ? void 0 : _e.ownerPayable) || dto.executiveSummary.netAvailable,
                totalPayouts: dto.executiveSummary.ownerPaid,
                closingBalance: dto.executiveSummary.closingTrustBalance
            };
            const moneyText = (amount, currency, parens = false) => {
                const absolute = Math.abs(Number(amount || 0)).toFixed(2);
                const formatted = `${currency} ${absolute}`;
                if (parens || amount < 0)
                    return `(${formatted})`;
                return formatted;
            };
            const summaryMoney = (amount, currency, deduction = false) => {
                if (Math.abs(Number(amount || 0)) < 0.005)
                    return moneyText(0, currency);
                return moneyText(amount, currency, deduction);
            };
            const dashOrMoney = (amount, currency = 'USD', asDeduction = false) => {
                if (amount == null || Math.abs(amount) < 0.005)
                    return '-';
                return asDeduction || amount < 0 ? moneyText(amount, currency, true) : moneyText(amount, currency);
            };
            const periodLabel = dto.period.label === 'All Transactions'
                ? 'All Transactions'
                : `${dto.period.startDate} - ${dto.period.endDate}`;
            const columns = [
                { x: 28, width: 58, label: 'Date', align: 'left' },
                { x: 86, width: 52, label: 'Type', align: 'left' },
                { x: 138, width: 100, label: 'Description', align: 'left' },
                { x: 238, width: 90, label: 'Total Amount Received', align: 'right' },
                { x: 328, width: 72, label: 'Commission', align: 'right' },
                { x: 400, width: 88, label: 'VAT on Commission', align: 'right' },
                { x: 488, width: 58, label: 'Levy', align: 'right' },
                { x: 546, width: 130, label: 'Net Amount Due to Owner', align: 'right' },
                { x: 676, width: 137, label: 'Balance', align: 'right' }
            ];
            const wrapText = (text, maxWidth, size, usedFont) => {
                const words = String(text || '').split(/\s+/).filter(Boolean);
                if (!words.length)
                    return [''];
                const lines = [];
                let current = '';
                const pushLongWord = (word) => {
                    let chunk = '';
                    for (const character of word) {
                        const next = chunk + character;
                        if (usedFont.widthOfTextAtSize(next, size) <= maxWidth)
                            chunk = next;
                        else {
                            if (chunk)
                                lines.push(chunk);
                            chunk = character;
                        }
                    }
                    current = chunk;
                };
                words.forEach((word) => {
                    const next = current ? `${current} ${word}` : word;
                    if (usedFont.widthOfTextAtSize(next, size) <= maxWidth) {
                        current = next;
                        return;
                    }
                    if (current)
                        lines.push(current);
                    if (usedFont.widthOfTextAtSize(word, size) <= maxWidth)
                        current = word;
                    else
                        pushLongWord(word);
                });
                if (current)
                    lines.push(current);
                return lines.length ? lines : [''];
            };
            const longDate = (value) => {
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
                if (match)
                    return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
                const parsed = value ? new Date(value) : new Date();
                if (Number.isNaN(parsed.getTime()))
                    return String(value || '');
                return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
            };
            const generatedLabel = `Generated ${longDate(dto.audit.generatedAt)}`;
            let page = pdfDoc.addPage(pageSize);
            let pageNumber = 1;
            const drawFooter = (current, number) => {
                current.drawLine({ start: { x: 28, y: 28 }, end: { x: 814, y: 28 }, thickness: 0.6, color: line });
                current.drawText(dto.company.displayName, { x: 28, y: 14, size: 8, font, color: muted });
                current.drawText('Property Account Statement', { x: 280, y: 14, size: 8, font, color: muted });
                const pageLabel = `Page ${number}  ·  ${generatedLabel}`;
                const pageWidth = font.widthOfTextAtSize(pageLabel, 8);
                current.drawText(pageLabel, { x: 814 - pageWidth, y: 14, size: 8, font, color: muted });
            };
            const drawTableHeader = (target, top) => {
                target.drawRectangle({ x: 28, y: top - 18, width: 785, height: 28, color: paleGreen });
                target.drawLine({ start: { x: 28, y: top - 18 }, end: { x: 813, y: top - 18 }, thickness: 1.4, color: green });
                columns.forEach((column) => {
                    const lines = wrapText(column.label, column.width - 4, 7, bold).slice(0, 2);
                    lines.forEach((text, index) => {
                        const width = bold.widthOfTextAtSize(text, 7);
                        const x = column.align === 'right' ? column.x + column.width - width - 2 : column.x;
                        target.drawText(text, { x, y: top - index * 8, size: 7, font: bold, color: green });
                    });
                });
                return top - 32;
            };
            const addPage = () => {
                drawFooter(page, pageNumber);
                page = pdfDoc.addPage(pageSize);
                pageNumber += 1;
                page.drawText(`${dto.company.displayName}  ·  Property Account Statement  ·  ${periodLabel}`, {
                    x: 28,
                    y: 568,
                    size: 8,
                    font: bold,
                    color: green
                });
                return drawTableHeader(page, 548);
            };
            const logoRaw = String(dto.company.logo || '').trim();
            let logoDrawn = false;
            if (logoRaw) {
                try {
                    const payload = logoRaw.includes(',') ? logoRaw.split(',').pop() || '' : logoRaw;
                    const logoBytes = Buffer.from(payload, 'base64');
                    const image = logoRaw.includes('image/jp') ? yield pdfDoc.embedJpg(logoBytes) : yield pdfDoc.embedPng(logoBytes);
                    const scaled = image.scale(28 / image.height);
                    const width = Math.min(scaled.width, 72);
                    page.drawImage(image, { x: 28, y: 548, width, height: 28 });
                    logoDrawn = true;
                    page.drawText(dto.company.displayName, { x: 28 + width + 8, y: 556, size: 10, font: bold, color: green });
                }
                catch (_f) {
                    logoDrawn = false;
                }
            }
            if (!logoDrawn) {
                page.drawText(dto.company.displayName, { x: 28, y: 556, size: 11, font: bold, color: green });
            }
            const title = 'PROPERTY ACCOUNT STATEMENT';
            const titleWidth = bold.widthOfTextAtSize(title, 13);
            page.drawText(title, { x: (841.89 - titleWidth) / 2, y: 560, size: 13, font: bold, color: green });
            const propertyHeading = dto.property.name || dto.property.address || '';
            const propertyHeadingWidth = font.widthOfTextAtSize(propertyHeading, 9);
            page.drawText(propertyHeading, { x: (841.89 - propertyHeadingWidth) / 2, y: 546, size: 9, font, color: ink });
            const generatedWidth = font.widthOfTextAtSize(generatedLabel, 8);
            page.drawText(generatedLabel, { x: 814 - generatedWidth, y: 560, size: 8, font, color: ink });
            const periodText = `Period ${periodLabel}`;
            const periodWidth = font.widthOfTextAtSize(periodText, 8);
            page.drawText(periodText, { x: 814 - periodWidth, y: 548, size: 8, font, color: ink });
            page.drawLine({ start: { x: 28, y: 536 }, end: { x: 814, y: 536 }, thickness: 1.4, color: green });
            const meta = [
                ['Property', dto.property.name],
                ['Address', dto.property.address || '-'],
                ['Owner', dto.owner.displayName],
                ['Ledger', dto.ledger === 'sale' ? 'Sale' : dto.ledger === 'rental' ? 'Rental' : '-'],
                ['Currency', dto.currency || summary.openingBalance.currency]
            ];
            meta.forEach((item, index) => {
                const x = 28 + index * 157;
                page.drawText(item[0].toUpperCase(), { x, y: 522, size: 7, font: bold, color: green });
                const metaValue = wrapText(String(item[1] || '-'), 150, 8, font)[0] || '-';
                page.drawText(metaValue, { x, y: 510, size: 8, font, color: ink });
            });
            const summaryItems = [
                ['Opening Balance', summaryMoney(summary.openingBalance.amount, summary.openingBalance.currency), false],
                ['Total Amount Received', summaryMoney((summary.totalAmountReceived || summary.totalRent).amount, (summary.totalAmountReceived || summary.totalRent).currency), false],
                ['Total Commission', summaryMoney(summary.totalCommission.amount, summary.totalCommission.currency, true), false],
                ['Total VAT on Commission', summaryMoney(summary.totalVat.amount, summary.totalVat.currency, true), false],
                ['Total Levy', summaryMoney(summary.totalLevies.amount, summary.totalLevies.currency, true), false],
                ['Net Amount Due to Owner', summaryMoney(summary.totalOwnerAmount.amount, summary.totalOwnerAmount.currency), false],
                ['Owner Payouts', summaryMoney(summary.totalPayouts.amount, summary.totalPayouts.currency, true), false],
                ['Closing Balance Due to Owner', summaryMoney(summary.closingBalance.amount, summary.closingBalance.currency), true]
            ];
            summaryItems.forEach((item, index) => {
                const y = 490 - index * 13;
                if (item[2]) {
                    page.drawRectangle({ x: 28, y: y - 3, width: 250, height: 12, color: paleGreen });
                    page.drawLine({ start: { x: 28, y: y - 3 }, end: { x: 278, y: y - 3 }, thickness: 1.2, color: green });
                    page.drawLine({ start: { x: 28, y: y + 9 }, end: { x: 278, y: y + 9 }, thickness: 1.2, color: green });
                }
                page.drawText(item[0], { x: 32, y, size: 8, font: item[2] ? bold : font, color: item[2] ? green : ink });
                const amountWidth = bold.widthOfTextAtSize(item[1], 8);
                page.drawText(item[1], { x: 274 - amountWidth, y, size: 8, font: bold, color: item[2] ? green : ink });
            });
            let contentBottom = 490 - summaryItems.length * 13;
            const waterfall = dto.ownerMoneyWaterfall;
            if (waterfall) {
                const vatRate = waterfall.vatRate == null
                    ? ''
                    : ` at ${(waterfall.vatRate <= 1 ? waterfall.vatRate * 100 : waterfall.vatRate).toFixed(1)}%`;
                const lines = [
                    { text: 'HOW THE OWNER AMOUNT IS CALCULATED', strong: true, color: green },
                    { text: `Total amount received ${moneyText(waterfall.grossAmount.amount, waterfall.grossAmount.currency)}`, strong: false, color: ink },
                    { text: `Less commission ${summaryMoney(waterfall.commissionAmount.amount, waterfall.commissionAmount.currency, true)}`, strong: false, color: ink },
                    { text: `Less levy ${summaryMoney(waterfall.levyAmount.amount, waterfall.levyAmount.currency, true)}`, strong: false, color: ink },
                    { text: `Less VAT on commission ${summaryMoney(waterfall.vatOnCommission.amount, waterfall.vatOnCommission.currency, true)}${vatRate}`, strong: false, color: ink },
                    { text: `Net amount due to owner ${moneyText(waterfall.netOwnerAmount.amount, waterfall.netOwnerAmount.currency)}`, strong: true, color: ink },
                    {
                        text: waterfall.reviewRequired
                            ? `Review required. Recorded owner income is ${waterfall.recordedOwnerAmount ? moneyText(waterfall.recordedOwnerAmount.amount, waterfall.recordedOwnerAmount.currency) : 'missing'}. Difference ${moneyText(waterfall.difference.amount, waterfall.difference.currency)}. No amount was changed.`
                            : 'Recorded owner income matches this allocation.',
                        strong: false,
                        color: ink
                    }
                ];
                let waterfallY = 490;
                lines.forEach((line) => {
                    const usedFont = line.strong ? bold : font;
                    wrapText(line.text, 500, 8, usedFont).forEach((lineText) => {
                        page.drawText(lineText, { x: 300, y: waterfallY, size: 8, font: usedFont, color: line.color });
                        waterfallY -= 10;
                    });
                });
                contentBottom = Math.min(contentBottom, waterfallY);
            }
            let rowY = drawTableHeader(page, contentBottom - 8);
            const drawRow = (values, options) => {
                const usedFont = (options === null || options === void 0 ? void 0 : options.bold) ? bold : font;
                const size = 8;
                const wrapped = values.map((value, index) => (index === 2 ? wrapText(value, columns[index].width - 4, size, usedFont) : [value]));
                const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
                const rowHeight = lineCount * 10 + 3;
                if (rowY - rowHeight < 40)
                    rowY = addPage();
                if (options === null || options === void 0 ? void 0 : options.bold) {
                    page.drawRectangle({ x: 28, y: rowY - rowHeight + 8, width: 785, height: rowHeight, color: paleGreen });
                }
                wrapped.forEach((lines, index) => {
                    const column = columns[index];
                    lines.forEach((text, lineIndex) => {
                        const color = index === 7 && (options === null || options === void 0 ? void 0 : options.ownerNegative) ? red : ink;
                        const textWidth = usedFont.widthOfTextAtSize(text, size);
                        const x = column.align === 'right' ? column.x + column.width - textWidth - 2 : column.x;
                        page.drawText(text, { x, y: rowY - lineIndex * 10, size, font: usedFont, color });
                    });
                });
                rowY -= rowHeight;
            };
            dto.trustLedger.forEach((row) => {
                var _a, _b, _c, _d, _e, _f, _g;
                const ownerNegative = Number(((_a = row.ownerAmount) === null || _a === void 0 ? void 0 : _a.amount) || 0) < 0 || row.rowType === 'Payout';
                drawRow([
                    new Date(row.date).toLocaleDateString(),
                    row.rowType || (row.credit.amount > 0 ? 'Income' : 'Payout'),
                    row.description,
                    dashOrMoney((_c = (_b = row.totalAmountReceived) === null || _b === void 0 ? void 0 : _b.amount) !== null && _c !== void 0 ? _c : (_d = row.rentAmount) === null || _d === void 0 ? void 0 : _d.amount, row.runningBalance.currency),
                    dashOrMoney((_e = row.commission) === null || _e === void 0 ? void 0 : _e.amount, row.runningBalance.currency, true),
                    dashOrMoney((_f = row.vatOnCommission) === null || _f === void 0 ? void 0 : _f.amount, row.runningBalance.currency, true),
                    dashOrMoney((_g = row.levies) === null || _g === void 0 ? void 0 : _g.amount, row.runningBalance.currency, true),
                    row.ownerAmount ? moneyText(row.ownerAmount.amount, row.ownerAmount.currency, ownerNegative) : '-',
                    moneyText(row.runningBalance.amount, row.runningBalance.currency)
                ], { ownerNegative });
            });
            drawRow([
                'TOTALS',
                '',
                '',
                summaryMoney((summary.totalAmountReceived || summary.totalRent).amount, (summary.totalAmountReceived || summary.totalRent).currency),
                summaryMoney(summary.totalCommission.amount, summary.totalCommission.currency, true),
                summaryMoney(summary.totalVat.amount, summary.totalVat.currency, true),
                summaryMoney(summary.totalLevies.amount, summary.totalLevies.currency, true),
                summaryMoney(summary.totalOwnerAmount.amount, summary.totalOwnerAmount.currency),
                summaryMoney(summary.closingBalance.amount, summary.closingBalance.currency)
            ], { bold: true });
            drawFooter(page, pageNumber);
            const bytes = yield pdfDoc.save();
            return {
                contentType: 'application/pdf',
                filename: `${dto.statementNumber}.pdf`,
                buffer: Buffer.from(bytes)
            };
        });
    }
    toCsv(dto) {
        const rows = [
            ['Date', 'Type', 'Description', 'Total Amount Received', 'Commission', 'VAT on Commission', 'Levy', 'Net Amount Due to Owner', 'Balance'],
            ...dto.trustLedger.map((row) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                return [
                    row.date,
                    row.rowType || '',
                    row.description,
                    (_d = (_b = (_a = row.totalAmountReceived) === null || _a === void 0 ? void 0 : _a.amount) !== null && _b !== void 0 ? _b : (_c = row.rentAmount) === null || _c === void 0 ? void 0 : _c.amount) !== null && _d !== void 0 ? _d : '',
                    (_f = (_e = row.commission) === null || _e === void 0 ? void 0 : _e.amount) !== null && _f !== void 0 ? _f : '',
                    (_h = (_g = row.vatOnCommission) === null || _g === void 0 ? void 0 : _g.amount) !== null && _h !== void 0 ? _h : '',
                    (_k = (_j = row.levies) === null || _j === void 0 ? void 0 : _j.amount) !== null && _k !== void 0 ? _k : '',
                    (_m = (_l = row.ownerAmount) === null || _l === void 0 ? void 0 : _l.amount) !== null && _m !== void 0 ? _m : '',
                    row.runningBalance.amount
                ];
            })
        ];
        return {
            contentType: 'text/csv',
            filename: `${dto.statementNumber}.csv`,
            buffer: Buffer.from(rows.map((row) => row.map(csvEscape).join(',')).join('\n'), 'utf8')
        };
    }
    toExcel(dto) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
        const summaryRows = [
            ['Metric', 'Currency', 'Amount'],
            ['Opening Balance', dto.executiveSummary.openingBalance.currency, dto.executiveSummary.openingBalance.amount],
            ['Total Amount Received', (((_a = dto.statementSummary) === null || _a === void 0 ? void 0 : _a.totalAmountReceived) || ((_b = dto.statementSummary) === null || _b === void 0 ? void 0 : _b.totalRent) || dto.executiveSummary.rentalIncome).currency, (_j = (_g = (_e = (_d = (_c = dto.statementSummary) === null || _c === void 0 ? void 0 : _c.totalAmountReceived) === null || _d === void 0 ? void 0 : _d.amount) !== null && _e !== void 0 ? _e : (_f = dto.statementSummary) === null || _f === void 0 ? void 0 : _f.totalRent.amount) !== null && _g !== void 0 ? _g : (_h = dto.rentalSettlement) === null || _h === void 0 ? void 0 : _h.grossRent.amount) !== null && _j !== void 0 ? _j : dto.executiveSummary.rentalIncome.amount],
            ['Contractual Rent', ((_k = dto.statementSummary) === null || _k === void 0 ? void 0 : _k.totalRent.currency) || dto.executiveSummary.rentalIncome.currency, (_p = (_m = (_l = dto.statementSummary) === null || _l === void 0 ? void 0 : _l.totalRent.amount) !== null && _m !== void 0 ? _m : (_o = dto.rentalSettlement) === null || _o === void 0 ? void 0 : _o.grossRent.amount) !== null && _p !== void 0 ? _p : ''],
            ['Total Commission', ((_q = dto.statementSummary) === null || _q === void 0 ? void 0 : _q.totalCommission.currency) || dto.executiveSummary.rentalIncome.currency, (_u = (_s = (_r = dto.statementSummary) === null || _r === void 0 ? void 0 : _r.totalCommission.amount) !== null && _s !== void 0 ? _s : (_t = dto.rentalSettlement) === null || _t === void 0 ? void 0 : _t.commission.amount) !== null && _u !== void 0 ? _u : 0],
            ['Total VAT on Commission', ((_v = dto.statementSummary) === null || _v === void 0 ? void 0 : _v.totalVat.currency) || dto.executiveSummary.rentalIncome.currency, (_z = (_x = (_w = dto.statementSummary) === null || _w === void 0 ? void 0 : _w.totalVat.amount) !== null && _x !== void 0 ? _x : (_y = dto.rentalSettlement) === null || _y === void 0 ? void 0 : _y.vatOnCommission.amount) !== null && _z !== void 0 ? _z : 0],
            ['Total Levy', ((_0 = dto.statementSummary) === null || _0 === void 0 ? void 0 : _0.totalLevies.currency) || dto.executiveSummary.rentalIncome.currency, (_4 = (_2 = (_1 = dto.statementSummary) === null || _1 === void 0 ? void 0 : _1.totalLevies.amount) !== null && _2 !== void 0 ? _2 : (_3 = dto.rentalSettlement) === null || _3 === void 0 ? void 0 : _3.levy.amount) !== null && _4 !== void 0 ? _4 : 0],
            ['Net Amount Due to Owner', ((_5 = dto.statementSummary) === null || _5 === void 0 ? void 0 : _5.totalOwnerAmount.currency) || dto.executiveSummary.netAvailable.currency, (_7 = (_6 = dto.statementSummary) === null || _6 === void 0 ? void 0 : _6.totalOwnerAmount.amount) !== null && _7 !== void 0 ? _7 : dto.executiveSummary.netAvailable.amount],
            ['Owner Payouts', dto.executiveSummary.ownerPaid.currency, dto.executiveSummary.ownerPaid.amount],
            ['Closing Balance Due to Owner', dto.executiveSummary.closingTrustBalance.currency, dto.executiveSummary.closingTrustBalance.amount]
        ];
        const ledgerRows = [
            ['Date', 'Type', 'Description', 'Total Amount Received', 'Commission', 'VAT on Commission', 'Levy', 'Net Amount Due to Owner', 'Balance'],
            ...dto.trustLedger.map((row) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                return [
                    row.date,
                    row.rowType || '',
                    row.description,
                    (_d = (_b = (_a = row.totalAmountReceived) === null || _a === void 0 ? void 0 : _a.amount) !== null && _b !== void 0 ? _b : (_c = row.rentAmount) === null || _c === void 0 ? void 0 : _c.amount) !== null && _d !== void 0 ? _d : '',
                    (_f = (_e = row.commission) === null || _e === void 0 ? void 0 : _e.amount) !== null && _f !== void 0 ? _f : '',
                    (_h = (_g = row.vatOnCommission) === null || _g === void 0 ? void 0 : _g.amount) !== null && _h !== void 0 ? _h : '',
                    (_k = (_j = row.levies) === null || _j === void 0 ? void 0 : _j.amount) !== null && _k !== void 0 ? _k : '',
                    (_m = (_l = row.ownerAmount) === null || _l === void 0 ? void 0 : _l.amount) !== null && _m !== void 0 ? _m : '',
                    row.runningBalance.amount
                ];
            })
        ];
        const reconciliationRows = [
            ['Check', 'Expected', 'Actual', 'Variance', 'Passed'],
            ...dto.reconciliation.checks.map((check) => [
                check.label,
                check.expected.amount,
                check.actual.amount,
                check.variance.amount,
                check.passed ? 'Yes' : 'No'
            ])
        ];
        const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${worksheet('Executive Summary', summaryRows)}
  ${worksheet('Statement', ledgerRows)}
  ${worksheet('Reconciliation', reconciliationRows)}
</Workbook>`;
        return {
            contentType: 'application/vnd.ms-excel',
            filename: `${dto.statementNumber}.xls`,
            buffer: Buffer.from(workbook, 'utf8')
        };
    }
    toJson(dto) {
        return {
            contentType: 'application/json',
            filename: `${dto.statementNumber}.json`,
            buffer: Buffer.from(JSON.stringify(dto, null, 2), 'utf8')
        };
    }
}
exports.ExportEngine = ExportEngine;
