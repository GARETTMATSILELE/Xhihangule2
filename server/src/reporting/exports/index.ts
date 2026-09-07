import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { OwnerStatementDTO, ReportFormat } from '../dto';
import { TemplateEngine } from '../templates';

export interface ExportResult {
  contentType: string;
  filename: string;
  buffer: Buffer;
}

const csvEscape = (value: unknown): string => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const xmlEscape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const worksheet = (name: string, rows: unknown[][]): string => `
  <Worksheet ss:Name="${xmlEscape(name)}">
    <Table>
      ${rows
        .map(
          (row) => `<Row>${row
            .map((cell) => `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`)
            .join('')}</Row>`
        )
        .join('')}
    </Table>
  </Worksheet>`;

export class ExportEngine {
  constructor(private readonly templateEngine = new TemplateEngine()) {}

  async exportOwnerStatement(dto: OwnerStatementDTO, format: ReportFormat): Promise<ExportResult> {
    if (format === 'pdf') return this.toPdf(dto);
    if (format === 'csv') return this.toCsv(dto);
    if (format === 'excel') return this.toExcel(dto);
    return this.toJson(dto);
  }

  private async toPdf(dto: OwnerStatementDTO): Promise<ExportResult> {
    const pdfDoc = await PDFDocument.create();
    const pageSize: [number, number] = [841.89, 595.28];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const green = rgb(0, 0.27, 0.18);
    const white = rgb(1, 1, 1);
    const paleGreen = rgb(0.84, 0.95, 0.87);
    const red = rgb(0.7, 0.14, 0.1);
    const ink = rgb(0.06, 0.09, 0.16);
    const muted = rgb(0.28, 0.33, 0.41);
    const line = rgb(0.86, 0.91, 0.87);
    const summary = dto.statementSummary || {
      openingBalance: dto.executiveSummary.openingBalance,
      totalRent: dto.rentalSettlement?.grossRent || dto.executiveSummary.rentalIncome,
      totalCommission: dto.rentalSettlement?.commission || { amount: 0, currency: dto.executiveSummary.rentalIncome.currency },
      totalVat: dto.rentalSettlement?.vatOnCommission || { amount: 0, currency: dto.executiveSummary.rentalIncome.currency },
      totalLevies: dto.rentalSettlement?.levy || { amount: 0, currency: dto.executiveSummary.rentalIncome.currency },
      totalOwnerAmount: dto.rentalSettlement?.ownerPayable || dto.executiveSummary.netAvailable,
      totalPayouts: dto.executiveSummary.ownerPaid,
      closingBalance: dto.executiveSummary.closingTrustBalance
    };
    const moneyText = (amount: number, currency: string, parens = false): string => {
      const absolute = Math.abs(Number(amount || 0)).toFixed(2);
      const formatted = `${currency} ${absolute}`;
      if (parens || amount < 0) return `(${formatted})`;
      return formatted;
    };
    const summaryMoney = (amount: number, currency: string, deduction = false): string => {
      if (Math.abs(Number(amount || 0)) < 0.005) return moneyText(0, currency);
      return moneyText(amount, currency, deduction);
    };
    const dashOrMoney = (amount?: number, currency = 'USD', asDeduction = false): string => {
      if (amount == null || Math.abs(amount) < 0.005) return '—';
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
    const drawFooter = (current: typeof page, number: number) => {
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

    const drawRow = (values: string[], options?: { bold?: boolean; ownerNegative?: boolean }) => {
      if (rowY < 48) rowY = addPage();
      values.forEach((value, index) => {
        const column = columns[index];
        const color = index === 7 && options?.ownerNegative ? red : ink;
        page.drawText(String(value || '').slice(0, column.width > 100 ? 42 : 18), {
          x: column.x,
          y: rowY,
          size: 7,
          font: options?.bold ? bold : font,
          color
        });
      });
      rowY -= 14;
    };

    dto.trustLedger.forEach((row) => {
      const ownerNegative = Number(row.ownerAmount?.amount || 0) < 0 || row.rowType === 'Payout';
      drawRow([
        new Date(row.date).toLocaleDateString(),
        row.rowType || (row.credit.amount > 0 ? 'Income' : 'Payout'),
        row.description,
        dashOrMoney(row.rentAmount?.amount, row.runningBalance.currency),
        dashOrMoney(row.commission?.amount, row.runningBalance.currency, true),
        dashOrMoney(row.vatOnCommission?.amount, row.runningBalance.currency, true),
        dashOrMoney(row.levies?.amount, row.runningBalance.currency, true),
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
    const bytes = await pdfDoc.save();
    return {
      contentType: 'application/pdf',
      filename: `${dto.statementNumber}.pdf`,
      buffer: Buffer.from(bytes)
    };
  }

  private toCsv(dto: OwnerStatementDTO): ExportResult {
    const rows = [
      ['Date', 'Type', 'Description', 'Rent Amount', 'Less Commission', 'Less VAT on Commission', 'Less Levies', 'Owner Amount', 'Balance'],
      ...dto.trustLedger.map((row) => [
        row.date,
        row.rowType || '',
        row.description,
        row.rentAmount?.amount ?? '',
        row.commission?.amount ?? '',
        row.vatOnCommission?.amount ?? '',
        row.levies?.amount ?? '',
        row.ownerAmount?.amount ?? '',
        row.runningBalance.amount
      ])
    ];
    return {
      contentType: 'text/csv',
      filename: `${dto.statementNumber}.csv`,
      buffer: Buffer.from(rows.map((row) => row.map(csvEscape).join(',')).join('\n'), 'utf8')
    };
  }

  private toExcel(dto: OwnerStatementDTO): ExportResult {
    const summaryRows = [
      ['Metric', 'Currency', 'Amount'],
      ['Opening Balance', dto.executiveSummary.openingBalance.currency, dto.executiveSummary.openingBalance.amount],
      ['Total Rent', dto.statementSummary?.totalRent.currency || dto.executiveSummary.rentalIncome.currency, dto.statementSummary?.totalRent.amount ?? dto.rentalSettlement?.grossRent.amount ?? dto.executiveSummary.rentalIncome.amount],
      ['Total Commission', dto.statementSummary?.totalCommission.currency || dto.executiveSummary.rentalIncome.currency, dto.statementSummary?.totalCommission.amount ?? dto.rentalSettlement?.commission.amount ?? 0],
      ['Total VAT', dto.statementSummary?.totalVat.currency || dto.executiveSummary.rentalIncome.currency, dto.statementSummary?.totalVat.amount ?? dto.rentalSettlement?.vatOnCommission.amount ?? 0],
      ['Total Levies', dto.statementSummary?.totalLevies.currency || dto.executiveSummary.rentalIncome.currency, dto.statementSummary?.totalLevies.amount ?? dto.rentalSettlement?.levy.amount ?? 0],
      ['Total Owner Amount', dto.statementSummary?.totalOwnerAmount.currency || dto.executiveSummary.netAvailable.currency, dto.statementSummary?.totalOwnerAmount.amount ?? dto.executiveSummary.netAvailable.amount],
      ['Total Payouts', dto.executiveSummary.ownerPaid.currency, dto.executiveSummary.ownerPaid.amount],
      ['Closing Balance', dto.executiveSummary.closingTrustBalance.currency, dto.executiveSummary.closingTrustBalance.amount]
    ];
    const ledgerRows = [
      ['Date', 'Type', 'Description', 'Rent Amount', 'Less Commission', 'Less VAT on Commission', 'Less Levies', 'Owner Amount', 'Balance'],
      ...dto.trustLedger.map((row) => [
        row.date,
        row.rowType || '',
        row.description,
        row.rentAmount?.amount ?? '',
        row.commission?.amount ?? '',
        row.vatOnCommission?.amount ?? '',
        row.levies?.amount ?? '',
        row.ownerAmount?.amount ?? '',
        row.runningBalance.amount
      ])
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

  private toJson(dto: OwnerStatementDTO): ExportResult {
    return {
      contentType: 'application/json',
      filename: `${dto.statementNumber}.json`,
      buffer: Buffer.from(JSON.stringify(dto, null, 2), 'utf8')
    };
  }
}
