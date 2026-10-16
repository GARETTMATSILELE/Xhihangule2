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
      if (amount == null || Math.abs(amount) < 0.005) return '-';
      return asDeduction || amount < 0 ? moneyText(amount, currency, true) : moneyText(amount, currency);
    };
    const periodLabel = dto.period.label === 'All Transactions'
      ? 'All Transactions'
      : `${dto.period.startDate} - ${dto.period.endDate}`;
    const columns = [
      { x: 28, width: 58, label: 'Date', align: 'left' as const },
      { x: 86, width: 52, label: 'Type', align: 'left' as const },
      { x: 138, width: 100, label: 'Description', align: 'left' as const },
      { x: 238, width: 90, label: 'Total Amount Received', align: 'right' as const },
      { x: 328, width: 72, label: 'Commission', align: 'right' as const },
      { x: 400, width: 88, label: 'VAT on Commission', align: 'right' as const },
      { x: 488, width: 58, label: 'Levy', align: 'right' as const },
      { x: 546, width: 130, label: 'Net Amount Due to Owner', align: 'right' as const },
      { x: 676, width: 137, label: 'Balance', align: 'right' as const }
    ];
    const wrapText = (text: string, maxWidth: number, size: number, usedFont: typeof font): string[] => {
      const words = String(text || '').split(/\s+/).filter(Boolean);
      if (!words.length) return [''];
      const lines: string[] = [];
      let current = '';
      const pushLongWord = (word: string) => {
        let chunk = '';
        for (const character of word) {
          const next = chunk + character;
          if (usedFont.widthOfTextAtSize(next, size) <= maxWidth) chunk = next;
          else {
            if (chunk) lines.push(chunk);
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
        if (current) lines.push(current);
        if (usedFont.widthOfTextAtSize(word, size) <= maxWidth) current = word;
        else pushLongWord(word);
      });
      if (current) lines.push(current);
      return lines.length ? lines : [''];
    };

    const longDate = (value?: string) => {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
      if (match) return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
      const parsed = value ? new Date(value) : new Date();
      if (Number.isNaN(parsed.getTime())) return String(value || '');
      return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
    };
    const generatedLabel = `Generated ${longDate(dto.audit.generatedAt)}`;
    let page = pdfDoc.addPage(pageSize);
    let pageNumber = 1;
    const drawFooter = (current: typeof page, number: number) => {
      current.drawLine({ start: { x: 28, y: 28 }, end: { x: 814, y: 28 }, thickness: 0.6, color: line });
      current.drawText(dto.company.displayName, { x: 28, y: 14, size: 8, font, color: muted });
      current.drawText('Property Account Statement', { x: 280, y: 14, size: 8, font, color: muted });
      const pageLabel = `Page ${number}  ·  ${generatedLabel}`;
      const pageWidth = font.widthOfTextAtSize(pageLabel, 8);
      current.drawText(pageLabel, { x: 814 - pageWidth, y: 14, size: 8, font, color: muted });
    };
    const drawTableHeader = (target: typeof page, top: number) => {
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
        const image = logoRaw.includes('image/jp') ? await pdfDoc.embedJpg(logoBytes) : await pdfDoc.embedPng(logoBytes);
        const scaled = image.scale(28 / image.height);
        const width = Math.min(scaled.width, 72);
        page.drawImage(image, { x: 28, y: 548, width, height: 28 });
        logoDrawn = true;
        page.drawText(dto.company.displayName, { x: 28 + width + 8, y: 556, size: 10, font: bold, color: green });
      } catch {
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
    ] as const;
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

    const drawRow = (values: string[], options?: { bold?: boolean; ownerNegative?: boolean }) => {
      const usedFont = options?.bold ? bold : font;
      const size = 8;
      const wrapped = values.map((value, index) => (
        index === 2 ? wrapText(value, columns[index].width - 4, size, usedFont) : [value]
      ));
      const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
      const rowHeight = lineCount * 10 + 3;
      if (rowY - rowHeight < 40) rowY = addPage();
      if (options?.bold) {
        page.drawRectangle({ x: 28, y: rowY - rowHeight + 8, width: 785, height: rowHeight, color: paleGreen });
      }
      wrapped.forEach((lines, index) => {
        const column = columns[index];
        lines.forEach((text, lineIndex) => {
          const color = index === 7 && options?.ownerNegative ? red : ink;
          const textWidth = usedFont.widthOfTextAtSize(text, size);
          const x = column.align === 'right' ? column.x + column.width - textWidth - 2 : column.x;
          page.drawText(text, { x, y: rowY - lineIndex * 10, size, font: usedFont, color });
        });
      });
      rowY -= rowHeight;
    };

    dto.trustLedger.forEach((row) => {
      const ownerNegative = Number(row.ownerAmount?.amount || 0) < 0 || row.rowType === 'Payout';
      drawRow([
        new Date(row.date).toLocaleDateString(),
        row.rowType || (row.credit.amount > 0 ? 'Income' : 'Payout'),
        row.description,
        dashOrMoney(row.totalAmountReceived?.amount ?? row.rentAmount?.amount, row.runningBalance.currency),
        dashOrMoney(row.commission?.amount, row.runningBalance.currency, true),
        dashOrMoney(row.vatOnCommission?.amount, row.runningBalance.currency, true),
        dashOrMoney(row.levies?.amount, row.runningBalance.currency, true),
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
    const bytes = await pdfDoc.save();
    return {
      contentType: 'application/pdf',
      filename: `${dto.statementNumber}.pdf`,
      buffer: Buffer.from(bytes)
    };
  }

  private toCsv(dto: OwnerStatementDTO): ExportResult {
    const rows = [
      ['Date', 'Type', 'Description', 'Total Amount Received', 'Commission', 'VAT on Commission', 'Levy', 'Net Amount Due to Owner', 'Balance'],
      ...dto.trustLedger.map((row) => [
        row.date,
        row.rowType || '',
        row.description,
        row.totalAmountReceived?.amount ?? row.rentAmount?.amount ?? '',
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
      ['Total Amount Received', (dto.statementSummary?.totalAmountReceived || dto.statementSummary?.totalRent || dto.executiveSummary.rentalIncome).currency, dto.statementSummary?.totalAmountReceived?.amount ?? dto.statementSummary?.totalRent.amount ?? dto.rentalSettlement?.grossRent.amount ?? dto.executiveSummary.rentalIncome.amount],
      ['Contractual Rent', dto.statementSummary?.totalRent.currency || dto.executiveSummary.rentalIncome.currency, dto.statementSummary?.totalRent.amount ?? dto.rentalSettlement?.grossRent.amount ?? ''],
      ['Total Commission', dto.statementSummary?.totalCommission.currency || dto.executiveSummary.rentalIncome.currency, dto.statementSummary?.totalCommission.amount ?? dto.rentalSettlement?.commission.amount ?? 0],
      ['Total VAT on Commission', dto.statementSummary?.totalVat.currency || dto.executiveSummary.rentalIncome.currency, dto.statementSummary?.totalVat.amount ?? dto.rentalSettlement?.vatOnCommission.amount ?? 0],
      ['Total Levy', dto.statementSummary?.totalLevies.currency || dto.executiveSummary.rentalIncome.currency, dto.statementSummary?.totalLevies.amount ?? dto.rentalSettlement?.levy.amount ?? 0],
      ['Net Amount Due to Owner', dto.statementSummary?.totalOwnerAmount.currency || dto.executiveSummary.netAvailable.currency, dto.statementSummary?.totalOwnerAmount.amount ?? dto.executiveSummary.netAvailable.amount],
      ['Owner Payouts', dto.executiveSummary.ownerPaid.currency, dto.executiveSummary.ownerPaid.amount],
      ['Closing Balance Due to Owner', dto.executiveSummary.closingTrustBalance.currency, dto.executiveSummary.closingTrustBalance.amount]
    ];
    const ledgerRows = [
      ['Date', 'Type', 'Description', 'Total Amount Received', 'Commission', 'VAT on Commission', 'Levy', 'Net Amount Due to Owner', 'Balance'],
      ...dto.trustLedger.map((row) => [
        row.date,
        row.rowType || '',
        row.description,
        row.totalAmountReceived?.amount ?? row.rentAmount?.amount ?? '',
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
