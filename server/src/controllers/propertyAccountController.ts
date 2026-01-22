import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { Development } from '../models/Development';
import { DevelopmentUnit } from '../models/DevelopmentUnit';
import PropertyAccount from '../models/PropertyAccount';
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
    // Load the most complete account (dedup-aware) and recalc balance; creates one if missing
    const account = await propertyAccountService.getPropertyAccount(propertyId, ledger as any);
    
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
 * One-off migration to normalize legacy ledger types to 'sale' where applicable.
 */
export const migrateLegacyLedgerTypes = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId ? String(req.user.companyId) : undefined;
    const dryRunFlag = String(req.body?.dryRun ?? req.query?.dryRun ?? '').toLowerCase();
    const dryRun = dryRunFlag === '1' || dryRunFlag === 'true' || dryRunFlag === 'yes';
    const result = await (propertyAccountService as any).migrateLegacyLedgerTypesForCompany(companyId, { dryRun });
    return res.json({ success: true, data: result, dryRun });
  } catch (error) {
    logger.error('Error in migrateLegacyLedgerTypes:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
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

    // Fast, lightweight listing mode for UI lists:
    // Accepts ?summary=1&search=...&page=1&limit=24&ledger=rental|sale
    const summaryFlag = String(req.query.summary || '').toLowerCase();
    const isSummary = summaryFlag === '1' || summaryFlag === 'true' || summaryFlag === 'yes';
    if (isSummary) {
      const rawPage = Number(req.query.page || 1);
      const rawLimit = Number(req.query.limit || 24);
      const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
      const limitBase = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 24;
      const limit = Math.min(Math.max(limitBase, 1), 100); // clamp 1..100
      const search = String(req.query.search || '').trim();
      const ledger = (String(req.query.ledger || '').toLowerCase() === 'sale') ? 'sale' : (String(req.query.ledger || '').toLowerCase() === 'rental' ? 'rental' : undefined);

      // Resolve all property-like IDs (properties, developments, units) for this company
      const [properties, developments] = await Promise.all([
        Property.find({ companyId: req.user.companyId }).select('_id rentalType').lean(),
        Development.find({ companyId: req.user.companyId }).select('_id').lean()
      ]);
      const propertyIds = properties.map(p => p._id);
      const developmentIds = developments.map(d => d._id);
      const salePropertyIdSet = new Set<string>(
        properties
          .filter((p: any) => String((p as any)?.rentalType || '').toLowerCase() === 'sale')
          .map((p: any) => String(p._id))
      );
      let unitIds: any[] = [];
      if (developmentIds.length > 0) {
        try {
          const units = await DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id').lean();
          unitIds = units.map(u => u._id);
        } catch {
          // ignore unit lookup errors in summary path
        }
      }
      const allIds = [...propertyIds, ...developmentIds, ...unitIds];
      const developmentIdSet = new Set<string>(developmentIds.map((d: any) => String(d)));
      const unitIdSet = new Set<string>(unitIds.map((u: any) => String(u)));

      const query: Record<string, any> = {
        ...(allIds.length > 0 ? { propertyId: { $in: allIds } } : { _id: null }), // empty result if no ids
        // Only return canonical/non-archived ledgers in summary list
        isArchived: { $ne: true }
      };
      if (ledger) query.ledgerType = ledger;
      if (search) {
        const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [
          { propertyName: { $regex: regex } },
          { propertyAddress: { $regex: regex } },
          { ownerName: { $regex: regex } }
        ];
      }

      // Fetch one extra record to compute hasMore without a separate count()
      const pageSkip = (page - 1) * limit;
      const rows = await PropertyAccount.find(query)
        .select('propertyId ledgerType propertyName propertyAddress ownerId ownerName runningBalance totalIncome totalExpenses totalOwnerPayouts lastUpdated createdAt updatedAt')
        .sort({ lastUpdated: -1 })
        .skip(pageSkip)
        .limit(limit + 1)
        .lean();

      const hasMore = rows.length > limit;
      const itemsRaw = hasMore ? rows.slice(0, limit) : rows;
      // Normalize/mend ledger type for legacy records:
      // - If ledgerType is missing or 'rental' but the source entity implies sale, mark as 'sale' for response
      const items = (itemsRaw as any[]).map((it: any) => {
        const pid = String((it as any)?.propertyId || '');
        let ledger = String((it as any)?.ledgerType || '').toLowerCase();
        const looksLikeSale =
          salePropertyIdSet.has(pid) ||
          developmentIdSet.has(pid) ||
          unitIdSet.has(pid);
        if ((!ledger || ledger === 'rental') && looksLikeSale) {
          ledger = 'sale';
        }
        return { ...it, ledgerType: ledger || (looksLikeSale ? 'sale' : (it as any)?.ledgerType) };
      });

      return res.json({
        success: true,
        data: items,
        meta: {
          page,
          limit,
          hasMore,
          nextPage: hasMore ? page + 1 : null
        }
      });
    }

    // Full payload mode (backward compatible; includes transactions/payouts and performs maintenance)
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
    const ledger = (String(req.query?.ledger || '').toLowerCase() === 'sale' ? 'sale' : (String(req.query?.ledger || '').toLowerCase() === 'rental' ? 'rental' : undefined)) as
      | 'rental'
      | 'sale'
      | undefined;
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

    const idempotencyKey = (req.headers['idempotency-key'] as string) || (req.body?.idempotencyKey as string) || undefined;

    const expenseData = {
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      description,
      category,
      recipientId,
      recipientType,
      processedBy: req.user.userId,
      notes,
      idempotencyKey
    };

    const account = await propertyAccountService.addExpense(propertyId, expenseData, ledger);
    // Echo back idempotency key for client-side caching (header and body)
    if (idempotencyKey) {
      try { res.setHeader('Idempotency-Key', idempotencyKey); } catch {}
    }
    
    res.json({
      success: true,
      message: 'Expense added successfully',
      data: account,
      idempotencyKey: idempotencyKey || undefined
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
    const ledger = (String(req.query?.ledger || '').toLowerCase() === 'sale' ? 'sale' : (String(req.query?.ledger || '').toLowerCase() === 'rental' ? 'rental' : undefined)) as
      | 'rental'
      | 'sale'
      | undefined;
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
    const account = await propertyAccountService.getPropertyAccount(propertyId, ledger);
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

    const idempotencyKey = (req.headers['idempotency-key'] as string) || (req.body?.idempotencyKey as string) || undefined;

    const payoutData = {
      amount: Number(amount),
      paymentMethod,
      recipientId: finalRecipientId,
      recipientName: finalRecipientName,
      recipientBankDetails,
      processedBy: req.user.userId,
      notes,
      idempotencyKey
    };

    const { account: updatedAccount, payout } = await propertyAccountService.createOwnerPayout(propertyId, payoutData, ledger);
    // Echo back generated/used idempotency key
    if ((payout as any)?.idempotencyKey) {
      try { res.setHeader('Idempotency-Key', String((payout as any).idempotencyKey)); } catch {}
    }
    
    res.json({
      success: true,
      message: 'Owner payout created successfully',
      data: { account: updatedAccount, payout },
      idempotencyKey: (payout as any)?.idempotencyKey
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

/**
 * Merge duplicate ledgers for a single property (clean merge of legacy + new),
 * then reconcile duplicate income transactions. Keeps one active ledger and
 * archives the rest to preserve history.
 */
export const mergePropertyAccountDuplicatesForProperty = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }
    const pid = new mongoose.Types.ObjectId(propertyId);
    // Load all non-archived ledgers for this property (covers legacy/null, rental, sale)
    const accounts = await PropertyAccount.find({ propertyId: pid, isArchived: { $ne: true } });
    const service: any = propertyAccountService as any;
    if (typeof service.mergeDuplicateAccounts !== 'function') {
      return res.status(500).json({ success: false, message: 'Merge operation not available' });
    }
    const groupsChanged = await service.mergeDuplicateAccounts(accounts);
    // Reconcile duplicate income transactions on both potential ledgers
    let rentalRecon: any = null;
    let saleRecon: any = null;
    try { rentalRecon = await reconcilePropertyLedgerDuplicates(propertyId, 'rental' as any); } catch {}
    try { saleRecon = await reconcilePropertyLedgerDuplicates(propertyId, 'sale' as any); } catch {}
    return res.json({
      success: true,
      message: 'Property ledgers merged and reconciled (if applicable)',
      data: {
        merged: groupsChanged,
        reconciled: {
          rental: rentalRecon,
          sale: saleRecon
        }
      }
    });
  } catch (error) {
    logger.error('Error in mergePropertyAccountDuplicatesForProperty:', error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};