import { Request, Response } from 'express';
import { LevyPayment } from '../models/LevyPayment';
import { AppError } from '../middleware/errorHandler';
import mongoose from 'mongoose';
import { Lease } from '../models/Lease';
import { Tenant } from '../models/Tenant';
import { Company } from '../models/Company';

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

    const levyPaymentData = {
      ...req.body,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      processedBy: new mongoose.Types.ObjectId(req.user.userId),
      paymentType: 'levy', // Ensure this is set
      status: 'completed' // Set as completed for accountant dashboard payments
    };

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
    const companyId = (req.query.companyId as string) || (req.headers['x-company-id'] as string);

    const query: any = { _id: id };
    if (companyId) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
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

// Public: Download levy receipt as HTML (formatted for A4 print/PDF)
export const getLevyReceiptDownload = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = (req.query.companyId as string) || (req.headers['x-company-id'] as string);

    const query: any = { _id: id };
    if (companyId) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
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

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="levy-receipt-${levy.referenceNumber || levy._id}.html"`);
    res.send(html);
  } catch (error: any) {
    console.error('Error generating levy receipt download:', error);
    res.status(500).send('Failed to generate levy receipt');
  }
};