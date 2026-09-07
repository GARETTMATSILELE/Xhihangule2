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
            const white = (0, pdf_lib_1.rgb)(1, 1, 1);
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
                    return '—';
                return asDeduction || amount < 0 ? moneyText(amount, currency, true) : moneyText(amount, currency);
            };
            const periodLabel = dto.period.label === 'All Transactions'
                ? 'All Transactions'
                : `${dto.period.startDate} – ${dto.period.endDate}`;
            const columns = [
                { x: 28, width: 68, label: 'Date' },
                { x: 96, width: 58, label: 'Type' },
                { x: 154, width: 168, label: 'Description' },
                { x: 322, width: 78, label: 'Rent Amount' },
                { x: 400, width: 82, label: 'Less Commission' },
                { x: 482, width: 88, label: 'Less VAT on Comm.' },
                { x: 570, width: 72, label: 'Less Levies' },
                { x: 642, width: 82, label: 'Owner Amount' },
                { x: 724, width: 90, label: 'Balance' }
            ];
            let page = pdfDoc.addPage(pageSize);
            let pageNumber = 1;
            const drawFooter = (current, number) => {
                current.drawLine({ start: { x: 28, y: 28 }, end: { x: 814, y: 28 }, thickness: 0.6, color: line });
                current.drawText(dto.company.displayName, { x: 28, y: 16, size: 8, font, color: muted });
                current.drawText('Property Account Statement', { x: 330, y: 16, size: 8, font, color: muted });
                current.drawText(`Page ${number}`, { x: 760, y: 16, size: 8, font, color: muted });
            };
            const addPage = () => {
                drawFooter(page, pageNumber);
                page = pdfDoc.addPage(pageSize);
                pageNumber += 1;
                page.drawText(`${dto.company.displayName}  ·  Property Account Statement  ·  ${periodLabel}`, {
                    x: 28,
                    y: 570,
                    size: 8,
                    font: bold,
                    color: green
                });
                const headerY = 548;
                page.drawRectangle({ x: 28, y: headerY - 4, width: 786, height: 16, color: green });
                columns.forEach((column) => {
                    page.drawText(column.label, { x: column.x, y: headerY, size: 7, font: bold, color: white });
                });
                return headerY - 18;
            };
            page.drawRectangle({ x: 0, y: 552, width: 841.89, height: 44, color: green });
            page.drawText(dto.company.displayName, { x: 28, y: 578, size: 12, font: bold, color: white });
            page.drawText('PROPERTY ACCOUNT STATEMENT', { x: 28, y: 562, size: 16, font: bold, color: white });
            page.drawText(`Generated ${new Date(dto.audit.generatedAt).toLocaleDateString()}`, { x: 640, y: 572, size: 9, font, color: paleGreen });
            page.drawText(`Property: ${dto.property.name}`, { x: 28, y: 536, size: 9, font: bold, color: ink });
            page.drawText(`Address: ${dto.property.address || '—'}`, { x: 28, y: 522, size: 9, font, color: ink });
            page.drawText(`Owner: ${dto.owner.displayName}`, { x: 520, y: 536, size: 9, font, color: ink });
            page.drawText(`Statement Period: ${periodLabel}`, { x: 520, y: 522, size: 9, font, color: ink });
            const summaryItems = [
                ['Opening Balance', summaryMoney(summary.openingBalance.amount, summary.openingBalance.currency)],
                ['Total Rent', summaryMoney(summary.totalRent.amount, summary.totalRent.currency)],
                ['Total Commission', summaryMoney(summary.totalCommission.amount, summary.totalCommission.currency, true)],
                ['Total VAT', summaryMoney(summary.totalVat.amount, summary.totalVat.currency, true)],
                ['Total Levies', summaryMoney(summary.totalLevies.amount, summary.totalLevies.currency, true)],
                ['Total Owner Amount', summaryMoney(summary.totalOwnerAmount.amount, summary.totalOwnerAmount.currency)],
                ['Total Payouts', summaryMoney(summary.totalPayouts.amount, summary.totalPayouts.currency, true)],
                ['Closing Balance', summaryMoney(summary.closingBalance.amount, summary.closingBalance.currency)]
            ];
            summaryItems.forEach((item, index) => {
                const x = 28 + (index % 4) * 200;
                const y = 498 - Math.floor(index / 4) * 28;
                page.drawText(item[0], { x, y: y + 10, size: 7, font: bold, color: green });
                page.drawText(item[1], { x, y, size: 10, font: bold, color: ink });
            });
            let rowY = 432;
            page.drawRectangle({ x: 28, y: rowY - 4, width: 786, height: 16, color: green });
            columns.forEach((column) => {
                page.drawText(column.label, { x: column.x, y: rowY, size: 7, font: bold, color: white });
            });
            rowY -= 18;
            const drawRow = (values, options) => {
                if (rowY < 48)
                    rowY = addPage();
                values.forEach((value, index) => {
                    const column = columns[index];
                    const color = index === 7 && (options === null || options === void 0 ? void 0 : options.ownerNegative) ? red : ink;
                    page.drawText(String(value || '').slice(0, column.width > 100 ? 42 : 18), {
                        x: column.x,
                        y: rowY,
                        size: 7,
                        font: (options === null || options === void 0 ? void 0 : options.bold) ? bold : font,
                        color
                    });
                });
                rowY -= 14;
            };
            dto.trustLedger.forEach((row) => {
                var _a, _b, _c, _d, _e;
                const ownerNegative = Number(((_a = row.ownerAmount) === null || _a === void 0 ? void 0 : _a.amount) || 0) < 0 || row.rowType === 'Payout';
                drawRow([
                    new Date(row.date).toLocaleDateString(),
                    row.rowType || (row.credit.amount > 0 ? 'Income' : 'Payout'),
                    row.description,
                    dashOrMoney((_b = row.rentAmount) === null || _b === void 0 ? void 0 : _b.amount, row.runningBalance.currency),
                    dashOrMoney((_c = row.commission) === null || _c === void 0 ? void 0 : _c.amount, row.runningBalance.currency, true),
                    dashOrMoney((_d = row.vatOnCommission) === null || _d === void 0 ? void 0 : _d.amount, row.runningBalance.currency, true),
                    dashOrMoney((_e = row.levies) === null || _e === void 0 ? void 0 : _e.amount, row.runningBalance.currency, true),
                    row.ownerAmount ? moneyText(row.ownerAmount.amount, row.ownerAmount.currency, ownerNegative) : '—',
                    moneyText(row.runningBalance.amount, row.runningBalance.currency)
                ], { ownerNegative });
            });
            drawRow([
                'TOTALS',
                '',
                '',
                summaryMoney(summary.totalRent.amount, summary.totalRent.currency),
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
            ['Date', 'Type', 'Description', 'Rent Amount', 'Less Commission', 'Less VAT on Commission', 'Less Levies', 'Owner Amount', 'Balance'],
            ...dto.trustLedger.map((row) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                return [
                    row.date,
                    row.rowType || '',
                    row.description,
                    (_b = (_a = row.rentAmount) === null || _a === void 0 ? void 0 : _a.amount) !== null && _b !== void 0 ? _b : '',
                    (_d = (_c = row.commission) === null || _c === void 0 ? void 0 : _c.amount) !== null && _d !== void 0 ? _d : '',
                    (_f = (_e = row.vatOnCommission) === null || _e === void 0 ? void 0 : _e.amount) !== null && _f !== void 0 ? _f : '',
                    (_h = (_g = row.levies) === null || _g === void 0 ? void 0 : _g.amount) !== null && _h !== void 0 ? _h : '',
                    (_k = (_j = row.ownerAmount) === null || _j === void 0 ? void 0 : _j.amount) !== null && _k !== void 0 ? _k : '',
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
        const summaryRows = [
            ['Metric', 'Currency', 'Amount'],
            ['Opening Balance', dto.executiveSummary.openingBalance.currency, dto.executiveSummary.openingBalance.amount],
            ['Total Rent', ((_a = dto.statementSummary) === null || _a === void 0 ? void 0 : _a.totalRent.currency) || dto.executiveSummary.rentalIncome.currency, (_e = (_c = (_b = dto.statementSummary) === null || _b === void 0 ? void 0 : _b.totalRent.amount) !== null && _c !== void 0 ? _c : (_d = dto.rentalSettlement) === null || _d === void 0 ? void 0 : _d.grossRent.amount) !== null && _e !== void 0 ? _e : dto.executiveSummary.rentalIncome.amount],
            ['Total Commission', ((_f = dto.statementSummary) === null || _f === void 0 ? void 0 : _f.totalCommission.currency) || dto.executiveSummary.rentalIncome.currency, (_k = (_h = (_g = dto.statementSummary) === null || _g === void 0 ? void 0 : _g.totalCommission.amount) !== null && _h !== void 0 ? _h : (_j = dto.rentalSettlement) === null || _j === void 0 ? void 0 : _j.commission.amount) !== null && _k !== void 0 ? _k : 0],
            ['Total VAT', ((_l = dto.statementSummary) === null || _l === void 0 ? void 0 : _l.totalVat.currency) || dto.executiveSummary.rentalIncome.currency, (_q = (_o = (_m = dto.statementSummary) === null || _m === void 0 ? void 0 : _m.totalVat.amount) !== null && _o !== void 0 ? _o : (_p = dto.rentalSettlement) === null || _p === void 0 ? void 0 : _p.vatOnCommission.amount) !== null && _q !== void 0 ? _q : 0],
            ['Total Levies', ((_r = dto.statementSummary) === null || _r === void 0 ? void 0 : _r.totalLevies.currency) || dto.executiveSummary.rentalIncome.currency, (_v = (_t = (_s = dto.statementSummary) === null || _s === void 0 ? void 0 : _s.totalLevies.amount) !== null && _t !== void 0 ? _t : (_u = dto.rentalSettlement) === null || _u === void 0 ? void 0 : _u.levy.amount) !== null && _v !== void 0 ? _v : 0],
            ['Total Owner Amount', ((_w = dto.statementSummary) === null || _w === void 0 ? void 0 : _w.totalOwnerAmount.currency) || dto.executiveSummary.netAvailable.currency, (_y = (_x = dto.statementSummary) === null || _x === void 0 ? void 0 : _x.totalOwnerAmount.amount) !== null && _y !== void 0 ? _y : dto.executiveSummary.netAvailable.amount],
            ['Total Payouts', dto.executiveSummary.ownerPaid.currency, dto.executiveSummary.ownerPaid.amount],
            ['Closing Balance', dto.executiveSummary.closingTrustBalance.currency, dto.executiveSummary.closingTrustBalance.amount]
        ];
        const ledgerRows = [
            ['Date', 'Type', 'Description', 'Rent Amount', 'Less Commission', 'Less VAT on Commission', 'Less Levies', 'Owner Amount', 'Balance'],
            ...dto.trustLedger.map((row) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                return [
                    row.date,
                    row.rowType || '',
                    row.description,
                    (_b = (_a = row.rentAmount) === null || _a === void 0 ? void 0 : _a.amount) !== null && _b !== void 0 ? _b : '',
                    (_d = (_c = row.commission) === null || _c === void 0 ? void 0 : _c.amount) !== null && _d !== void 0 ? _d : '',
                    (_f = (_e = row.vatOnCommission) === null || _e === void 0 ? void 0 : _e.amount) !== null && _f !== void 0 ? _f : '',
                    (_h = (_g = row.levies) === null || _g === void 0 ? void 0 : _g.amount) !== null && _h !== void 0 ? _h : '',
                    (_k = (_j = row.ownerAmount) === null || _j === void 0 ? void 0 : _j.amount) !== null && _k !== void 0 ? _k : '',
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
