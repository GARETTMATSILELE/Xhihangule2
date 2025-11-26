import { Request, Response } from 'express';
import { LevyPayment } from '../models/LevyPayment';
import { AppError } from '../middleware/errorHandler';
import mongoose from 'mongoose';
import { Lease } from '../models/Lease';
import { Tenant } from '../models/Tenant';
import { Company } from '../models/Company';
import { Property } from '../models/Property';

export const createLevyPayment = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    if (!req.user?.userId) {
      throw new AppError('User ID not found. Please ensure you are properly authenticated.', 400);
    }

    // Validate required fields
    const { propertyId, paymentDate, paymentMethod, amount, currency = 'USD' } = req.body;
    // Optional incoming period and advance fields (allow rentalPeriod* aliases for consistency)
    const incomingMonth = Number((req.body as any).levyPeriodMonth || (req.body as any).rentalPeriodMonth);
    const incomingYear = Number((req.body as any).levyPeriodYear || (req.body as any).rentalPeriodYear);
    const advanceMonthsPaid = Number((req.body as any).advanceMonthsPaid || 1);
    const incomingAdvanceStart = (req.body as any).advancePeriodStart as { month?: number; year?: number } | undefined;
    const incomingAdvanceEnd = (req.body as any).advancePeriodEnd as { month?: number; year?: number } | undefined;
    
    if (!propertyId) {
      throw new AppError('Property ID is required', 400);
    }
    
    if (!paymentDate) {
      throw new AppError('Payment date is required', 400);
    }
    
    if (!paymentMethod) {
      throw new AppError('Payment method is required', 400);
    }
    
    if (!amount || amount <= 0) {
      throw new AppError('Valid amount is required', 400);
    }

    const levyPaymentData: any = {
      ...req.body,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      processedBy: new mongoose.Types.ObjectId(req.user.userId),
      paymentType: 'levy', // Ensure this is set
      status: 'completed' // Set as completed for accountant dashboard payments
    };

    // Normalize and set levy period (month/year)
    // If explicitly provided, use those; otherwise derive from paymentDate
    try {
      const baseDate = paymentDate ? new Date(paymentDate) : new Date();
      if (Number.isFinite(incomingMonth) && incomingMonth >= 1 && incomingMonth <= 12) {
        levyPaymentData.levyPeriodMonth = incomingMonth;
      } else if (levyPaymentData.levyPeriodMonth == null) {
        levyPaymentData.levyPeriodMonth = baseDate.getMonth() + 1;
      }
      if (Number.isFinite(incomingYear) && incomingYear >= 1900 && incomingYear <= 2100) {
        levyPaymentData.levyPeriodYear = incomingYear;
      } else if (levyPaymentData.levyPeriodYear == null) {
        levyPaymentData.levyPeriodYear = baseDate.getFullYear();
      }
      // Advance coverage: if client indicates multiple months, set start/end
      if (advanceMonthsPaid > 1) {
        const sMonth = Number(incomingAdvanceStart?.month || levyPaymentData.levyPeriodMonth);
        const sYear = Number(incomingAdvanceStart?.year || levyPaymentData.levyPeriodYear);
        let eMonth: number;
        let eYear: number;
        try {
          const start = new Date(sYear, sMonth - 1, 1);
          const end = new Date(start);
          end.setMonth(start.getMonth() + (advanceMonthsPaid - 1));
          eMonth = end.getMonth() + 1;
          eYear = end.getFullYear();
        } catch {
          eMonth = sMonth;
          eYear = sYear;
        }
        levyPaymentData.advanceMonthsPaid = advanceMonthsPaid;
        levyPaymentData.advancePeriodStart = { month: sMonth, year: sYear };
        levyPaymentData.advancePeriodEnd = { month: Number(incomingAdvanceEnd?.month || eMonth), year: Number(incomingAdvanceEnd?.year || eYear) };
      } else {
        levyPaymentData.advanceMonthsPaid = 1;
      }
    } catch {}

    const levyPayment = new LevyPayment(levyPaymentData);
    await levyPayment.save();
    
    // Populate the created levy payment for response
    const populatedLevyPayment = await LevyPayment.findById(levyPayment._id)
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email');
    
    res.status(201).json(populatedLevyPayment);
  } catch (error: any) {
    console.error('Error creating levy payment:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(400).json({ message: error.message || 'Failed to create levy payment' });
  }
};

export const getLevyPayments = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId || req.query.companyId;
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }
    const levyPayments = await LevyPayment.find({ companyId })
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email')
      .sort({ paymentDate: -1 });
    res.status(200).json(levyPayments);
  } catch (error: any) {
    console.error('Error fetching levy payments:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch levy payments' });
  }
}; 

// Public endpoint for getting a levy payment receipt (for printing)
export const getLevyReceiptPublic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId =
      (req.user?.companyId as string | undefined) ||
      (req.query.companyId as string | undefined) ||
      (req.headers['x-company-id'] as string | undefined);

    const query: any = { _id: id };
    if (req.user?.companyId) {
      try { query.companyId = new mongoose.Types.ObjectId(String(req.user.companyId)); } catch { query.companyId = String(req.user.companyId); }
    } else if (companyId) {
      try { query.companyId = new mongoose.Types.ObjectId(companyId); } catch { query.companyId = companyId; }
    }

    const levy = await LevyPayment.findOne(query)
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email');

    if (!levy) {
      return res.status(404).json({ status: 'error', message: 'Payment not found' });
    }

    // Resolve tenant name via active lease (fallback: any tenant linked by propertyId)
    let tenantName = '';
    try {
      const lease = await Lease.findOne({ propertyId: levy.propertyId, status: 'active' })
        .populate('tenantId', 'firstName lastName');
      if (lease && (lease.tenantId as any)) {
        tenantName = `${(lease.tenantId as any).firstName || ''} ${(lease.tenantId as any).lastName || ''}`.trim();
      } else {
        const tenant = await Tenant.findOne({ propertyId: levy.propertyId }).select('firstName lastName');
        if (tenant) tenantName = `${(tenant as any).firstName || ''} ${(tenant as any).lastName || ''}`.trim();
      }
    } catch {}

    // Load company details for header/logo
    let company: any = null;
    try {
      if (levy.companyId) {
        company = await Company.findById(levy.companyId).select(
          'name address phone email website registrationNumber tinNumber vatNumber logo description'
        );
      }
    } catch {}

    const receipt = {
      receiptNumber: levy.referenceNumber || String(levy._id),
      paymentDate: levy.paymentDate,
      amount: levy.amount,
      currency: levy.currency || 'USD',
      paymentMethod: levy.paymentMethod,
      status: levy.status,
      property: levy.propertyId,
      tenantName,
      processedBy: levy.processedBy,
      notes: levy.notes,
      createdAt: levy.createdAt,
      type: 'levy',
      company: company ? {
        name: company.name,
        address: company.address,
        phone: company.phone,
        email: company.email,
        website: company.website,
        registrationNumber: company.registrationNumber,
        tinNumber: company.tinNumber,
        logo: company.logo
      } : undefined
    };

    res.json({ status: 'success', data: receipt });
  } catch (error: any) {
    console.error('Error fetching levy receipt:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Failed to fetch levy receipt' });
  }
};

export const initiateLevyPayout = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId || !req.user?.userId) {
      throw new AppError('Authentication and company required', 401);
    }
    const { id } = req.params;
    const { paidToName, paidToAccount, paidToContact, payoutDate, payoutMethod, payoutReference, notes } = req.body;
    const levy = await LevyPayment.findOne({ _id: id, companyId: req.user.companyId });
    if (!levy) throw new AppError('Levy payment not found', 404);
    const normalizedMethod = typeof payoutMethod === 'string'
      ? payoutMethod.trim().toLowerCase().replace(/\s+/g, '_')
      : undefined;
    const allowedMethods = ['cash', 'bank_transfer', 'mobile_money', 'cheque'];
    const methodToSave = normalizedMethod && allowedMethods.includes(normalizedMethod) ? normalizedMethod : undefined;
    levy.set('payout', {
      ...(levy.get('payout') || {}),
      paidOut: true,
      paidToName,
      paidToAccount,
      paidToContact,
      payoutDate: payoutDate ? new Date(payoutDate) : new Date(),
      payoutMethod: methodToSave,
      payoutReference,
      notes,
      processedBy: req.user.userId
    });
    // Update top-level status to paid_out for easier filtering
    levy.set('status', 'paid_out');
    await levy.save();
    const populated = await LevyPayment.findById(levy._id)
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email');
    res.json(populated);
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    console.error('Error initiating levy payout:', error);
    throw new AppError('Error initiating levy payout', 500);
  }
};

export const getLevyPayoutAcknowledgement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = (req.query.companyId as string) || req.user?.companyId;
    const levy = await LevyPayment.findOne({ _id: id, ...(companyId ? { companyId } : {}) })
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email');
    if (!levy) throw new AppError('Levy payment not found', 404);
    const company = levy.companyId ? await Company.findById(levy.companyId).select('name address phone email logo') : null;
    const html = `<!DOCTYPE html>
      <html>
      <head><meta charset="utf-8" /><title>Levy Payout Acknowledgement - ${levy.referenceNumber || levy._id}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: Arial, sans-serif; color: #333; }
        .wrap { max-width: 720px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 18px; }
        .logo { max-width: 160px; max-height: 70px; object-fit: contain; display:block; margin:0 auto 8px; }
        .title { font-size: 22px; font-weight: bold; }
        .line { font-size: 12px; color: #555; }
        .section { margin-top: 16px; }
        .row { display:flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: 600; color:#666; min-width: 180px; }
        .value { text-align:right; }
        .ack { margin-top: 24px; padding-top: 16px; border-top: 2px solid #333; }
        .sig-line { margin-top: 32px; }
        .sig { border-top: 1px solid #333; display:inline-block; min-width: 260px; padding-top: 4px; text-align:center; }
        .note { margin-top: 12px; font-size: 12px; color: #666; }
        @media print { .no-print { display:none; } }
      </style></head>
      <body>
        <div class="wrap">
          <div class="header">
            ${company?.logo ? `<img class="logo" src="data:image/png;base64,${company.logo}" alt="Logo"/>` : ''}
            <div class="title">Levy Payout Acknowledgement</div>
            ${company?.name ? `<div class="line">${company.name}</div>` : ''}
            ${company?.address ? `<div class="line">${company.address}</div>` : ''}
            ${(company?.phone || company?.email) ? `<div class="line">${company.phone || ''} ${company.phone && company.email ? ' | ' : ''} ${company.email || ''}</div>` : ''}
          </div>
          <div class="section">
            <div class="row"><div class="label">Payout Reference</div><div class="value">${levy.payout?.payoutReference || '-'}</div></div>
            <div class="row"><div class="label">Payout Date</div><div class="value">${levy.payout?.payoutDate ? new Date(levy.payout.payoutDate).toLocaleDateString() : new Date().toLocaleDateString()}</div></div>
            <div class="row"><div class="label">Property</div><div class="value">${(levy.propertyId as any)?.name || 'N/A'}</div></div>
            <div class="row"><div class="label">Amount</div><div class="value">${levy.currency || 'USD'} ${(levy.amount || 0).toFixed(2)}</div></div>
            <div class="row"><div class="label">Payment Method</div><div class="value">${levy.payout?.payoutMethod || '-'}</div></div>
          </div>
          <div class="section">
            <div class="row"><div class="label">Paid To (Association)</div><div class="value">${levy.payout?.paidToName || '-'}</div></div>
            ${levy.payout?.paidToAccount ? `<div class="row"><div class="label">Account</div><div class="value">${levy.payout.paidToAccount}</div></div>` : ''}
            ${levy.payout?.paidToContact ? `<div class="row"><div class="label">Contact</div><div class="value">${levy.payout.paidToContact}</div></div>` : ''}
          </div>
          ${levy.payout?.notes ? `<div class="section"><div class="label">Notes</div><div class="value">${levy.payout.notes}</div></div>` : ''}
          <div class="ack">
            <p>We acknowledge receipt of the above payout.</p>
            <div class="sig-line">
              <div class="sig">Payee Signature</div>
            </div>
            <div class="sig-line" style="margin-top: 24px;">
              <div class="sig">Printed Name & Date</div>
            </div>
          </div>
          <div class="no-print" style="text-align:center; margin-top:16px;">
            <button onclick="window.print()" style="padding:8px 16px; background:#1976d2; color:#fff; border:none; border-radius:4px; cursor:pointer;">Print</button>
          </div>
        </div>
      </body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    console.error('Error generating payout acknowledgement:', error);
    throw new AppError('Failed to generate payout acknowledgement', 500);
  }
};

// Public: Download levy receipt as HTML (formatted for A4 print/PDF)
export const getLevyReceiptDownload = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId =
      (req.user?.companyId as string | undefined) ||
      (req.query.companyId as string | undefined) ||
      (req.headers['x-company-id'] as string | undefined);
    const format = String((req.query as any)?.format || '').toLowerCase();

    const query: any = { _id: id };
    if (req.user?.companyId) {
      try { query.companyId = new mongoose.Types.ObjectId(String(req.user.companyId)); } catch { query.companyId = String(req.user.companyId); }
    } else if (companyId) {
      try { query.companyId = new mongoose.Types.ObjectId(companyId); } catch { query.companyId = companyId; }
    }

    const levy = await LevyPayment.findOne(query)
      .populate('propertyId', 'name address')
      .populate('processedBy', 'firstName lastName email');

    if (!levy) {
      return res.status(404).send('Levy payment not found');
    }

    // Resolve tenant name for display
    let tenantName = '';
    try {
      const lease = await Lease.findOne({ propertyId: levy.propertyId, status: 'active' })
        .populate('tenantId', 'firstName lastName');
      if (lease && (lease.tenantId as any)) {
        tenantName = `${(lease.tenantId as any).firstName || ''} ${(lease.tenantId as any).lastName || ''}`.trim();
      } else {
        const tenant = await Tenant.findOne({ propertyId: levy.propertyId }).select('firstName lastName');
        if (tenant) tenantName = `${(tenant as any).firstName || ''} ${(tenant as any).lastName || ''}`.trim();
      }
    } catch {}

    // Load company details for header/logo
    let company: any = null;
    try {
      if (levy.companyId) {
        company = await Company.findById(levy.companyId).select(
          'name address phone email website registrationNumber tinNumber vatNumber logo description'
        );
      }
    } catch {}

    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Levy Receipt - ${levy.referenceNumber || levy._id}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: Arial, sans-serif; color: #333; }
          .receipt { max-width: 700px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .company-logo { max-width: 180px; max-height: 80px; display: block; margin: 0 auto 8px auto; object-fit: contain; }
          .company-name { font-size: 22px; font-weight: bold; }
          .company-line { margin: 2px 0; font-size: 12px; color: #555; }
          .receipt-number { font-size: 16px; font-weight: bold; margin-top: 10px; }
          .amount { font-size: 26px; font-weight: bold; color: #2e7d32; text-align: center; margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
          .details { margin: 20px 0; }
          .row { display: flex; justify-content: space-between; margin: 8px 0; border-bottom: 1px solid #eee; padding-bottom: 6px; }
          .label { font-weight: bold; color: #666; min-width: 140px; }
          .value { color: #333; text-align: right; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
          @media print { body { margin: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            ${company?.logo ? `<img class=\"company-logo\" src=\"data:image/png;base64,${company.logo}\" alt=\"Company Logo\" />` : ''}
            <div class="company-name">${company?.name || 'Levy Payment Receipt'}</div>
            ${company?.address ? `<div class=\"company-line\">${company.address}</div>` : ''}
            ${(company?.phone || company?.email) ? `<div class=\"company-line\">${company.phone ? 'Phone: ' + company.phone : ''}${(company.phone && company.email) ? ' | ' : ''}${company.email ? 'Email: ' + company.email : ''}</div>` : ''}
            ${company?.website ? `<div class=\"company-line\">Website: ${company.website}</div>` : ''}
            ${(company?.registrationNumber || company?.tinNumber) ? `<div class=\"company-line\">${company.registrationNumber ? 'Reg. No: ' + company.registrationNumber : ''}${(company.registrationNumber && company.tinNumber) ? ' | ' : ''}${company.tinNumber ? 'Tax No: ' + company.tinNumber : ''}</div>` : ''}
            <div class="receipt-number">Receipt #${levy.referenceNumber || levy._id}</div>
          </div>
          <div class="amount">${(levy.currency || 'USD')} ${(levy.amount || 0).toFixed(2)}</div>
          <div class="details">
            <div class="row"><div class="label">Date:</div><div class="value">${new Date(levy.paymentDate).toLocaleDateString()}</div></div>
            <div class="row"><div class="label">Method:</div><div class="value">${String(levy.paymentMethod).replace('_',' ').toUpperCase()}</div></div>
            <div class="row"><div class="label">Status:</div><div class="value">${String(levy.status).toUpperCase()}</div></div>
            <div class="row"><div class="label">Property:</div><div class="value">${(levy.propertyId as any)?.name || 'N/A'}</div></div>
            <div class="row"><div class="label">Tenant:</div><div class="value">${tenantName || 'N/A'}</div></div>
            <div class="row"><div class="label">Processed By:</div><div class="value">${((levy.processedBy as any)?.firstName || '')} ${((levy.processedBy as any)?.lastName || '')}</div></div>
            ${levy.notes ? `<div class="row"><div class="label">Notes:</div><div class="value">${levy.notes}</div></div>` : ''}
          </div>
          <div class="footer">
            <p>Thank you!</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
          <div class="no-print" style="text-align:center; margin-top:12px;">
            <button onclick="window.print()" style="padding:8px 16px; background:#1976d2; color:#fff; border:none; border-radius:4px; cursor:pointer;">Print</button>
          </div>
        </div>
      </body>
      </html>`;

    // If PDF requested, try to generate with puppeteer first; fallback to HTML on failure
    if (format === 'pdf') {
      try {
        const puppeteer = (await import('puppeteer')).default;
        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', left: '15mm', right: '15mm', bottom: '20mm' } });
        await browser.close();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="levy-receipt-${levy.referenceNumber || levy._id}.pdf"`);
        return res.send(pdfBuffer);
      } catch (pdfErr) {
        console.warn('Levy PDF generation failed, falling back to HTML:', (pdfErr as any)?.message || pdfErr);
      }
    }

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="levy-receipt-${levy.referenceNumber || levy._id}.html"`);
    return res.send(html);
  } catch (error: any) {
    console.error('Error generating levy receipt download:', error);
    res.status(500).send('Failed to generate levy receipt');
  }
};