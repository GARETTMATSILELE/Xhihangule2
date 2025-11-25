import { Request, Response } from 'express';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import propertyAccountService from '../services/propertyAccountService';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { reconcilePropertyLedgerDuplicates } from '../services/propertyAccountService';

/**
 * Get property account with summary
 */
export const getPropertyAccount = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const ledger = (req.query.ledger as string) === 'sale' ? 'sale' : 'rental';
    
    console.log('getPropertyAccount controller called with propertyId:', propertyId);
    console.log('User:', req.user);
    
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

    console.log('Calling propertyAccountService.getPropertyAccount...');
    // Ensure an account exists (create if missing), respecting the requested ledger
    const account = await propertyAccountService.getOrCreatePropertyAccount(propertyId, ledger as any);
    
    res.json({
      success: true,
      data: account
    });
  } catch (error) {
    logger.error('Error in getPropertyAccount:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get all property accounts for company
 */
export const getCompanyPropertyAccounts = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    const accounts = await propertyAccountService.getCompanyPropertyAccounts(req.user.companyId);
    
    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    logger.error('Error in getCompanyPropertyAccounts:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get property transactions with filters
 */
export const getPropertyTransactions = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { type, startDate, endDate, category, status } = req.query;
    const ledger = (req.query.ledger as string) === 'sale' ? 'sale' : 'rental';
    
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

    const filters: any = {};
    if (type) filters.type = type;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (category) filters.category = category;
    if (status) filters.status = status;

    const transactions = await propertyAccountService.getTransactionHistory(propertyId, filters, ledger as any);
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    logger.error('Error in getPropertyTransactions:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Add expense to property account
 */
export const addExpense = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { 
      amount, 
      date, 
      description, 
      category, 
      recipientId, 
      recipientType, 
      notes 
    } = req.body;
    
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    if (!description) {
      return res.status(400).json({ message: 'Description is required' });
    }

    if (!req.user?.userId) {
      return res.status(401).json({ message: 'User authentication required' });
    }

    const expenseData = {
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      description,
      category,
      recipientId,
      recipientType,
      processedBy: req.user.userId,
      notes
    };

    const account = await propertyAccountService.addExpense(propertyId, expenseData);
    
    res.json({
      success: true,
      message: 'Expense added successfully',
      data: account
    });
  } catch (error) {
    logger.error('Error in addExpense:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Create owner payout
 */
export const createOwnerPayout = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { 
      amount,
      paymentMethod, 
      recipientId, 
      recipientName, 
      recipientBankDetails, 
      notes 
    } = req.body;
    
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    if (!paymentMethod) {
      return res.status(400).json({ message: 'Payment method is required' });
    }

    if (!req.user?.userId) {
      return res.status(401).json({ message: 'User authentication required' });
    }

    // Get the property account to access owner information
    console.log('Getting property account for propertyId:', propertyId);
    const account = await propertyAccountService.getPropertyAccount(propertyId);
    console.log('Property account retrieved:', {
      accountId: account._id,
      ownerId: account.ownerId,
      ownerName: account.ownerName,
      runningBalance: account.runningBalance
    });
    
    // Use provided recipientId or fall back to property owner
    let finalRecipientId = recipientId;
    let finalRecipientName = recipientName;
    
    if (!finalRecipientId || finalRecipientId.trim() === '') {
      console.log('RecipientId is empty, using property owner');
      if (!account.ownerId) {
        console.log('Property has no owner assigned');
        return res.status(400).json({ message: 'Property has no owner assigned' });
      }
      finalRecipientId = account.ownerId.toString();
      finalRecipientName = account.ownerName || 'Property Owner';
      console.log('Using owner as recipient:', { finalRecipientId, finalRecipientName });
    }

    if (!finalRecipientName) {
      return res.status(400).json({ message: 'Recipient name is required' });
    }

    const payoutData = {
      amount: Number(amount),
      paymentMethod,
      recipientId: finalRecipientId,
      recipientName: finalRecipientName,
      recipientBankDetails,
      processedBy: req.user.userId,
      notes
    };

    const { account: updatedAccount, payout } = await propertyAccountService.createOwnerPayout(propertyId, payoutData);
    
    res.json({
      success: true,
      message: 'Owner payout created successfully',
      data: { account: updatedAccount, payout }
    });
  } catch (error) {
    logger.error('Error in createOwnerPayout:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update payout status
 */
export const updatePayoutStatus = async (req: Request, res: Response) => {
  try {
    const { propertyId, payoutId } = req.params;
    const { status } = req.body;
    
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

    if (!payoutId) {
      return res.status(400).json({ message: 'Payout ID is required' });
    }

    if (!status || !['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Valid status is required' });
    }

    if (!req.user?.userId) {
      return res.status(401).json({ message: 'User authentication required' });
    }

    const account = await propertyAccountService.updatePayoutStatus(
      propertyId, 
      payoutId, 
      status, 
      req.user.userId
    );
    
    res.json({
      success: true,
      message: 'Payout status updated successfully',
      data: account
    });
  } catch (error) {
    logger.error('Error in updatePayoutStatus:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get payout history
 */
export const getPayoutHistory = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

    const payouts = await propertyAccountService.getPayoutHistory(propertyId);
    
    res.json({
      success: true,
      data: payouts
    });
  } catch (error) {
    logger.error('Error in getPayoutHistory:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Reconcile and remove duplicate income transactions for a property ledger
 */
export const reconcilePropertyDuplicates = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const ledger = (req.query.ledger as string) === 'sale' ? 'sale' : 'rental';
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }
    const result = await reconcilePropertyLedgerDuplicates(propertyId, ledger as any);
    return res.json({ success: true, message: 'Reconciliation completed', data: result });
  } catch (error) {
    logger.error('Error in reconcilePropertyDuplicates:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Sync property accounts with payments
 */
export const syncPropertyAccounts = async (req: Request, res: Response) => {
  try {
    await propertyAccountService.syncPropertyAccountsWithPayments();
    // Also migrate sale income transactions into dedicated sale ledgers (idempotent)
    try {
      const result = await propertyAccountService.migrateSalesLedgerForCompany();
      console.log('Sales ledger migration result:', result);
    } catch (e) {
      console.warn('Sales ledger migration skipped/failed:', e);
    }
    
    res.json({
      success: true,
      message: 'Property accounts synced successfully'
    });
  } catch (error) {
    logger.error('Error in syncPropertyAccounts:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get payment request document
 */
export const getPaymentRequestDocument = async (req: Request, res: Response) => {
  try {
    const { propertyId, payoutId } = req.params;
    
    if (!propertyId || !payoutId) {
      return res.status(400).json({ message: 'Property ID and Payout ID are required' });
    }

    const account = await propertyAccountService.getPropertyAccount(propertyId);
    const payout = account.ownerPayouts.find(p => p._id?.toString() === payoutId);
    
    if (!payout) {
      return res.status(404).json({ message: 'Payout not found' });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json({
      success: true,
      data: {
      documentType: 'Payment Request',
      property: {
        name: property.name,
        address: property.address,
      },
        payout: {
          amount: payout.amount,
          recipientName: payout.recipientName,
          paymentMethod: payout.paymentMethod,
          referenceNumber: payout.referenceNumber,
          date: payout.date,
          notes: payout.notes,
        },
      }
    });
  } catch (error) {
    logger.error('Error in getPaymentRequestDocument:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get acknowledgement document
 */
export const getAcknowledgementDocument = async (req: Request, res: Response) => {
  try {
    const { propertyId, payoutId } = req.params;
    
    if (!propertyId || !payoutId) {
      return res.status(400).json({ message: 'Property ID and Payout ID are required' });
    }

    const account = await propertyAccountService.getPropertyAccount(propertyId);
    const payout = account.ownerPayouts.find(p => p._id?.toString() === payoutId);
    
    if (!payout) {
      return res.status(404).json({ message: 'Payout not found' });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json({
      success: true,
      data: {
      documentType: 'Acknowledgement of Receipt',
      property: {
          name: property.name,
        address: property.address,
      },
        payout: {
          amount: payout.amount,
          recipientName: payout.recipientName,
          paymentMethod: payout.paymentMethod,
          referenceNumber: payout.referenceNumber,
          date: payout.date,
          notes: payout.notes,
      },
      blanks: {
        name: '',
        idNumber: '',
        signature: '',
          contactNumber: '',
          date: '',
        },
      }
    });
  } catch (error) {
    logger.error('Error in getAcknowledgementDocument:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}; 

/**
 * Ensure development sale ledgers exist and backfill payments into them.
 * Scoped to the current user's company if available.
 */
export const ensureDevelopmentLedgers = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId ? String(req.user.companyId) : undefined;
    const result = await propertyAccountService.ensureDevelopmentLedgersAndBackfillPayments({
      companyId
    });
    return res.json({ success: true, message: 'Development ledgers ensured and payments backfilled', data: result });
  } catch (error) {
    logger.error('Error in ensureDevelopmentLedgers:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};