import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Invoice } from '../models/Invoice';
import { AppError } from '../middleware/errorHandler';
import { accountingConnection } from '../config/database';
import { tryFiscalizeInvoice } from '../services/fiscalizationService';
import { calculateTaxBreakdown } from '../utils/money';

// Function to generate unique item code
const generateItemCode = async (): Promise<string> => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `ITEM-${timestamp}-${random}`.toUpperCase();
};

// Tax breakdown moved to utils/money to ensure single source of truth

// Function to validate client details
const validateClientDetails = (client: any) => {
  if (!client || typeof client !== 'object') {
    throw new AppError('Client details are required', 400);
  }

  // Only name and address are required
  if (!client.name || typeof client.name !== 'string' || client.name.trim() === '') {
    throw new AppError('Client name is required', 400);
  }
  if (!client.address || typeof client.address !== 'string' || client.address.trim() === '') {
    throw new AppError('Client address is required', 400);
  }

  return {
    name: client.name.trim(),
    address: client.address.trim(),
    tinNumber: client.tinNumber?.trim() || undefined,
    vatNumber: client.vatNumber?.trim() || undefined,
    bpNumber: client.bpNumber?.trim() || undefined
  };
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const { items, discount = 0, taxPercentage = 15, client, currency = 'USD', fiscalize = true, ...otherData } = req.body;

    // Validate client details
    const validatedClient = validateClientDetails(client);

    // Generate codes for items if not provided
    const processedItems = await Promise.all(
      items.map(async (item: any) => {
        const quantity = Number(item.quantity ?? 1) || 1;
        const unitPrice = Number(item.unitPrice ?? item.netPrice ?? 0) || 0;
        const netPrice = Number(item.netPrice ?? (quantity * unitPrice));
        return ({
          ...item,
          quantity,
          unitPrice,
          netPrice,
          code: item.code || await generateItemCode(),
          taxPercentage: item.taxPercentage || taxPercentage
        });
      })
    );

    // Calculate tax breakdown
    const breakdown = calculateTaxBreakdown(processedItems, discount, taxPercentage);

    const invoiceData = {
      ...otherData,
      client: validatedClient,
      currency,
      items: processedItems,
      discount,
      taxPercentage,
      ...breakdown,
      fiscalize: fiscalize !== false,
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    };

    const invoice = new Invoice(invoiceData);
    // Try to fiscalize only when requested; fail-open on device/service errors.
    if ((invoice as any).fiscalize) {
      try {
        const fiscal = await tryFiscalizeInvoice(req.user.companyId, {
          _id: (invoice as any)._id?.toString?.(),
          totalAmount: (invoice as any).totalAmount,
          taxAmount: (invoice as any).taxAmount,
          taxPercentage: (invoice as any).taxPercentage,
          amountExcludingTax: (invoice as any).amountExcludingTax,
          createdAt: (invoice as any).createdAt
        });
        if (fiscal) {
          (invoice as any).fiscalData = fiscal;
        }
      } catch {}
    }

    await invoice.save();
    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error creating invoice:', error);
    res.status(500).json({ message: 'Error creating invoice', error: error instanceof Error ? error.message : 'Unknown error' });
  }
};

export const getInvoices = async (req: Request, res: Response) => {
  try {
    console.log('getInvoices called with user:', {
      userId: req.user?.userId,
      companyId: req.user?.companyId,
      role: req.user?.role
    });

    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    console.log('Fetching invoices for company:', req.user.companyId);

    // Check if the accounting connection is ready
    const accountingConnectionState = accountingConnection.readyState;
    console.log('Accounting connection state:', accountingConnectionState);
    
    if (accountingConnectionState !== 1) {
      console.error('Accounting database not connected. State:', accountingConnectionState);
      throw new AppError('Database connection not available', 503);
    }

    // First try to find invoices with companyId
    let invoices = await Invoice.find({ 
      companyId: new mongoose.Types.ObjectId(req.user.companyId) 
    }).sort({ createdAt: -1 });

    console.log(`Found ${invoices.length} invoices with companyId ${req.user.companyId}`);

    // Remove backward compatibility that leaked cross-company data

    console.log('Returning invoices:', invoices.length);
    res.json(invoices);
  } catch (error) {
    console.error('Error in getInvoices:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    
    res.status(500).json({ 
      message: 'Error fetching invoices', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}; 

export const updateInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status?: 'paid' | 'unpaid' | 'overdue' };

    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError('Invalid invoice ID', 400);
    }

    const allowedStatuses = ['paid', 'unpaid', 'overdue'] as const;
    if (!status || !allowedStatuses.includes(status as any)) {
      throw new AppError('Invalid status. Allowed: paid, unpaid, overdue', 400);
    }

    const companyId = new mongoose.Types.ObjectId(req.user.companyId);
    const updated = await Invoice.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), companyId },
      { $set: { status } },
      { new: true }
    );

    if (!updated) {
      throw new AppError('Invoice not found', 404);
    }

    res.json(updated);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error updating invoice status:', error);
    res.status(500).json({ message: 'Error updating invoice status', error: error instanceof Error ? error.message : 'Unknown error' });
  }
};