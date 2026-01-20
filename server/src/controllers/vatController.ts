import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { VATPayout } from '../models/VATPayout';
import { Property } from '../models/Property';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { SalesOwner } from '../models/SalesOwner';

function parseDate(input?: any, fallback?: Date): Date | null {
  if (!input) return fallback || null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? (fallback || null) : d;
}

export const getVatSummary = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const start = parseDate(req.query.start, new Date(0))!;
  const end = parseDate(req.query.end, new Date())!;

  const payments = await Payment.find({
    companyId,
    paymentDate: { $gte: start, $lte: end },
    'commissionDetails.vatOnCommission': { $gt: 0 }
  }).select('commissionDetails.vatOnCommission paymentDate').lean();

  const totalVat = payments.reduce((s: number, p: any) => s + Number(p?.commissionDetails?.vatOnCommission || 0), 0);
  res.json({ totalVat });
};

export const getVatTransactionsGrouped = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const start = parseDate(req.query.start, new Date(0))!;
  const end = parseDate(req.query.end, new Date())!;

  const payments = await Payment.find({
    companyId,
    paymentDate: { $gte: start, $lte: end },
    'commissionDetails.vatOnCommission': { $gt: 0 }
  })
    .select('propertyId paymentDate commissionDetails.vatOnCommission referenceNumber tenantId')
    .lean();

  // Group by propertyId
  const byProperty = new Map<string, any>();
  for (const p of payments as any[]) {
    const pid = String(p.propertyId);
    if (!byProperty.has(pid)) {
      byProperty.set(pid, { propertyId: pid, transactions: [], totalVat: 0 });
    }
    const group = byProperty.get(pid);
    group.transactions.push({
      paymentId: String(p._id),
      vatAmount: Number(p?.commissionDetails?.vatOnCommission || 0),
      paymentDate: p.paymentDate,
      referenceNumber: p.referenceNumber || '',
      tenantId: p.tenantId ? String(p.tenantId) : undefined
    });
    group.totalVat += Number(p?.commissionDetails?.vatOnCommission || 0);
  }

  const propertyIds = Array.from(byProperty.keys()).map(id => new mongoose.Types.ObjectId(id));
  const properties = await Property.find({ _id: { $in: propertyIds }, companyId }).select('name address ownerId').lean();
  const owners = await User.find({ _id: { $in: properties.map((p: any) => p.ownerId).filter(Boolean) } })
    .select('firstName lastName name')
    .lean();

  const ownerMap = new Map<string, any>();
  for (const o of owners as any[]) {
    ownerMap.set(String(o._id), o);
  }

  // Attach metadata and recent payouts list
  const results = [];
  for (const prop of properties as any[]) {
    const pid = String(prop._id);
    const g = byProperty.get(pid);
    if (!g) continue;
    const owner = prop.ownerId ? ownerMap.get(String(prop.ownerId)) : null;
    const payouts = await VATPayout.find({ companyId, propertyId: prop._id })
      .sort({ date: -1 })
      .limit(5)
      .select('totalAmount date status recipientName referenceNumber')
      .lean();
    results.push({
      property: {
        _id: pid,
        name: prop.name,
        address: prop.address,
        ownerName: owner ? ((owner.firstName && owner.lastName) ? `${owner.firstName} ${owner.lastName}` : (owner.name || '')) : ''
      },
      totalVat: Number(g.totalVat || 0),
      transactions: g.transactions.sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()),
      payouts
    });
  }

  // Include groups for any payments whose property might be missing (edge-case)
  for (const [pid, g] of byProperty.entries()) {
    if (results.find(r => r.property._id === pid)) continue;
    results.push({
      property: { _id: pid, name: 'Unknown Property', address: '', ownerName: '' },
      totalVat: Number(g.totalVat || 0),
      transactions: g.transactions.sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()),
      payouts: []
    });
  }

  // Sort by totalVat desc
  results.sort((a, b) => Number(b.totalVat || 0) - Number(a.totalVat || 0));
  res.json(results);
};

export const createVatPayout = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const userId = new mongoose.Types.ObjectId(req.user.userId);
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const { propertyId, start, end, recipientName, recipientId, payoutMethod, notes } = req.body as {
    propertyId: string;
    start?: string;
    end?: string;
    recipientName?: string;
    recipientId?: string;
    payoutMethod?: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';
    notes?: string;
  };
  if (!propertyId) throw new AppError('propertyId is required', 400);
  const propObjectId = new mongoose.Types.ObjectId(propertyId);
  const dateStart = parseDate(start, new Date(0))!;
  const dateEnd = parseDate(end, new Date())!;

  // Find VAT-bearing payments in range for this property
  const payments = await Payment.find({
    companyId,
    propertyId: propObjectId,
    paymentDate: { $gte: dateStart, $lte: dateEnd },
    'commissionDetails.vatOnCommission': { $gt: 0 }
  }).select('_id commissionDetails.vatOnCommission paymentDate').lean();

  if (!payments.length) {
    throw new AppError('No VAT transactions found for the selected period', 400);
  }

  // Exclude payments already covered by existing payouts
  const existing = await VATPayout.find({ companyId, propertyId: propObjectId }).select('paymentIds').lean();
  const covered = new Set<string>();
  for (const p of existing as any[]) {
    for (const id of (p.paymentIds || [])) covered.add(String(id));
  }
  const uncovered = payments.filter(p => !covered.has(String(p._id)));
  const totalAmount = uncovered.reduce((s: number, p: any) => s + Number(p?.commissionDetails?.vatOnCommission || 0), 0);
  if (totalAmount <= 0) {
    throw new AppError('All VAT transactions for this property and period have already been paid out', 400);
  }

  // Create payout
  const ref = `VAT-${String(propObjectId).slice(-6).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  const payout = await VATPayout.create({
    companyId,
    propertyId: propObjectId,
    paymentIds: uncovered.map(p => p._id),
    totalAmount: Number(totalAmount.toFixed(2)),
    currency: 'USD',
    recipientId: recipientId ? new mongoose.Types.ObjectId(recipientId) : undefined,
    recipientName: recipientName || 'Recipient',
    payoutMethod: payoutMethod || 'bank_transfer',
    referenceNumber: ref,
    status: 'completed',
    date: new Date(),
    notes,
    createdBy: userId
  });

  res.status(201).json({ message: 'VAT payout created', payout });
};

export const getVatPayoutAcknowledgement = async (req: Request, res: Response) => {
  const { payoutId } = req.params;
  if (!payoutId) return res.status(400).send('Missing payoutId');
  const payout = await VATPayout.findById(payoutId).lean();
  if (!payout) return res.status(404).send('Payout not found');

  const property = await Property.findById(payout.propertyId).select('name address').lean();
  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>VAT Payout Acknowledgement</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #222; }
      h1 { font-size: 20px; margin: 0 0 8px 0; }
      .section { margin: 16px 0; }
      .row { display: flex; margin: 4px 0; }
      .label { width: 180px; color: #555; }
      .value { flex: 1; font-weight: 600; }
      .footer { margin-top: 24px; font-size: 12px; color: #666; }
    </style>
  </head>
  <body>
    <h1>VAT Payout Acknowledgement</h1>
    <div class="section">
      <div class="row"><div class="label">Reference</div><div class="value">${payout.referenceNumber}</div></div>
      <div class="row"><div class="label">Date</div><div class="value">${new Date(payout.date).toLocaleDateString()}</div></div>
      <div class="row"><div class="label">Property</div><div class="value">${property?.name || 'Unknown'} — ${property?.address || ''}</div></div>
      <div class="row"><div class="label">Recipient</div><div class="value">${payout.recipientName || '-'}</div></div>
      <div class="row"><div class="label">Method</div><div class="value">${payout.payoutMethod}</div></div>
      <div class="row"><div class="label">Amount</div><div class="value">$${Number(payout.totalAmount || 0).toLocaleString()}</div></div>
    </div>
    ${payout.notes ? `<div class="section"><div class="label">Notes</div><div class="value">${payout.notes}</div></div>` : ''}
    <div class="footer">Generated by VAT Management • ${new Date().toLocaleString()}</div>
    <script>window.print && window.print();</script>
  </body>
  </html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};

export const getVatPropertySummary = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).send('Unauthorized');
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const { propertyId } = req.params;
  const start = parseDate(req.query.start, new Date(0))!;
  const end = parseDate(req.query.end, new Date())!;
  if (!propertyId) return res.status(400).send('Missing propertyId');

  const propObjectId = new mongoose.Types.ObjectId(propertyId);
  const property = await Property.findOne({ _id: propObjectId, companyId }).select('name address').lean();

  // Prefer owner from SalesOwner collection (property management DB)
  const salesOwner = await SalesOwner.findOne({ companyId, properties: propObjectId })
    .select('firstName lastName phone')
    .lean();
  const ownerName =
    salesOwner ? `${salesOwner.firstName || ''} ${salesOwner.lastName || ''}`.trim() : '';
  const ownerPhone = salesOwner?.phone || '';

  const payments = await Payment.find({
    companyId,
    propertyId: propObjectId,
    paymentDate: { $gte: start, $lte: end },
    'commissionDetails.vatOnCommission': { $gt: 0 }
  }).select('paymentDate commissionDetails.vatOnCommission referenceNumber paymentMethod amount').lean();

  const total = payments.reduce((s: number, p: any) => s + Number(p?.commissionDetails?.vatOnCommission || 0), 0);
  const rows = payments
    .sort((a: any, b: any) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
    .map((p: any) => {
      const vat = Number(p?.commissionDetails?.vatOnCommission || 0);
      const amt = Number(p?.amount || 0);
      return `<tr>
        <td>${new Date(p.paymentDate).toLocaleDateString()}</td>
        <td>${p.referenceNumber || '-'}</td>
        <td>${(p.paymentMethod || '').toString().replace(/_/g, ' ') || '-'}</td>
        <td style="text-align:right">$${amt.toLocaleString()}</td>
        <td style="text-align:right">$${vat.toLocaleString()}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>VAT Summary</title>
    <style>
      @page { size: A4; margin: 20mm 15mm; }
      body { font-family: Arial, sans-serif; padding: 0; color: #222; }
      .container { padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 6px 0; }
      .meta { margin: 10px 0 14px 0; color: #444; font-size: 13px; }
      .meta .row { display: flex; gap: 24px; margin: 2px 0; }
      .meta .label { color: #666; width: 140px; }
      .meta .value { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
      th, td { padding: 8px; border-bottom: 1px solid #eee; }
      th { text-align: left; color: #555; background: #fafafa; }
      tfoot td { font-weight: 700; }
      .right { text-align: right; }
      .footer { margin-top: 20px; font-size: 11px; color: #666; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>VAT Summary — ${property?.name || 'Unknown'} — ${property?.address || ''}</h1>
      <div class="meta">
        <div class="row"><div class="label">Period</div><div class="value">${new Date(start).toLocaleDateString()} – ${new Date(end).toLocaleDateString()}</div></div>
        <div class="row"><div class="label">Owner</div><div class="value">${ownerName || '-'}</div></div>
        ${ownerPhone ? `<div class="row"><div class="label">Owner Phone</div><div class="value">${ownerPhone}</div></div>` : ''}
        <div class="row"><div class="label">Transactions</div><div class="value">${payments.length}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Reference</th>
            <th>Method</th>
            <th class="right">Amount</th>
            <th class="right">VAT on Commission</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5">No VAT transactions found.</td></tr>'}</tbody>
        <tfoot><tr><td></td><td></td><td class="right">Total</td><td></td><td class="right">$${Number(total).toLocaleString()}</td></tr></tfoot>
      </table>
      <div class="footer">Generated by VAT Management • ${new Date().toLocaleString()}</div>
    </div>
  </body>
  </html>`;

  // Attempt to render A4 PDF; fallback to HTML if it fails.
  try {
    const puppeteer = (await import('puppeteer')).default;
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', left: '15mm', right: '15mm', bottom: '20mm' }
    });
    await browser.close();
    const filenameSafe =
      (property?.name || String(propObjectId)).replace(/[^a-z0-9\-]+/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="vat-summary-${filenameSafe}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.warn('VAT summary PDF generation failed, falling back to HTML:', (err as any)?.message || err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
};

