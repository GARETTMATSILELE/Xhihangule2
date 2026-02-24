import puppeteer from 'puppeteer';

type ReportRow = Record<string, unknown>;

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const money = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const buildTable = (rows: ReportRow[]): string => {
  if (!rows.length) return '<p>No records.</p>';
  const keys = Object.keys(rows[0]);
  const head = `<tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join('')}</tr>`;
  const body = rows
    .map((row) => `<tr>${keys.map((k) => `<td>${escapeHtml(row[k])}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
};

export const generateTrustReportPdf = async (input: {
  reportType: 'buyer-statement' | 'seller-settlement' | 'trust-reconciliation' | 'tax-zimra' | 'audit-log';
  companyName: string;
  propertyLabel: string;
  auditReference: string;
  rows: ReportRow[];
  totals?: Record<string, number>;
}): Promise<Buffer> => {
  const totalsHtml = Object.entries(input.totals || {})
    .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${money(v)}</li>`)
    .join('');

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(input.reportType)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
        .brand { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
        .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
        h1 { margin: 0 0 6px 0; font-size: 18px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { text-align: left; border-bottom: 1px solid #e2e8f0; padding: 6px 4px; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="brand">${escapeHtml(input.companyName)}</div>
      <h1>${escapeHtml(input.reportType)}</h1>
      <div class="meta">
        Property: ${escapeHtml(input.propertyLabel)}<br/>
        Audit Ref: ${escapeHtml(input.auditReference)}<br/>
        Generated: ${new Date().toISOString()}
      </div>
      ${totalsHtml ? `<ul>${totalsHtml}</ul>` : ''}
      ${buildTable(input.rows)}
    </body>
  </html>`;

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', right: '10mm', bottom: '16mm', left: '10mm' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};

