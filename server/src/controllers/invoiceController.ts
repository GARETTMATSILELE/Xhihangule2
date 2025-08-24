import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Invoice } from '../models/Invoice';
import { AppError } from '../middleware/errorHandler';
import { accountingConnection } from '../config/database';

// Function to generate unique item code
const generateItemCode = async (): Promise<string> => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `ITEM-${timestamp}-${random}`.toUpperCase();
};

// Function to calculate tax breakdown
const calculateTaxBreakdown = (items: any[], discount: number = 0, taxPercentage: number = 15) => {
  const subtotal = items.reduce((sum, item) => sum + item.netPrice, 0);
  const amountExcludingTax = subtotal - discount;
  const taxAmount = (amountExcludingTax * taxPercentage) / 100;
  const totalAmount = amountExcludingTax + taxAmount;

  return {
    subtotal,
    amountExcludingTax,
    taxAmount,
    totalAmount
  };
};

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
    vatNumber: client.vatNumber?.trim() || undefined
  };
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const { items, discount = 0, taxPercentage = 15, client, ...otherData } = req.body;

    // Validate client details
    const validatedClient = validateClientDetails(client);

    // Generate codes for items if not provided
    const processedItems = await Promise.all(
      items.map(async (item: any) => ({
        ...item,
        code: item.code || await generateItemCode(),
        taxPercentage: item.taxPercentage || taxPercentage
      }))
    );

    // Calculate tax breakdown
    const breakdown = calculateTaxBreakdown(processedItems, discount, taxPercentage);

    const invoiceData = {
      ...otherData,
      client: validatedClient,
      items: processedItems,
      discount,
      taxPercentage,
      ...breakdown,
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    };

    const invoice = new Invoice(invoiceData);
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