import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { Development } from '../models/Development';
import { DevelopmentUnit } from '../models/DevelopmentUnit';
import PropertyAccount from '../models/PropertyAccount';
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import propertyAccountService from '../services/propertyAccountService';
import accountingIntegrationService from '../services/accountingIntegrationService';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { reconcilePropertyLedgerDuplicates } from '../services/propertyAccountService';
import maintenanceJobQueueService from '../services/maintenanceJobQueueService';

/**
 * Get property account with summary
 */
export const getPropertyAccount = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const ledger = (req.query.ledger as string) === 'sale' ? 'sale' : 'rental';
    
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

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

    // Full payload mode can get very large; keep bounded by default with opt-in paging.
    const rawPage = Number(req.query.page || 1);
    const rawLimit = Number(req.query.limit || Number(process.env.PROPERTY_ACCOUNT_FULL_DEFAULT_LIMIT || 100));
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const limit = Math.min(
      Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 100, 1),
      Math.max(100, Number(process.env.PROPERTY_ACCOUNT_FULL_MAX_LIMIT || 250))
    );

    const allAccounts = await propertyAccountService.getCompanyPropertyAccounts(req.user.companyId);
    const start = (page - 1) * limit;
    const end = start + limit;
    const accounts = allAccounts.slice(start, end);
    const hasMore = allAccounts.length > end;
    
    res.json({
      success: true,
      data: accounts,
      meta: {
        page,
        limit,
        hasMore,
        nextPage: hasMore ? page + 1 : null
      }
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
    if (req.user?.companyId) {
      await accountingIntegrationService.syncExpenseCreated({
        companyId: String(req.user.companyId),
        sourceId: `property:${propertyId}:${Date.now()}`,
        reference: `PROP-EXP-${Date.now()}`,
        amount: Number(amount),
        description: description || category || 'Property expense',
        date: date ? new Date(date) : new Date(),
        createdBy: req.user.userId,
        propertyId
      });
    }
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
    const account = await propertyAccountService.getPropertyAccount(propertyId, ledger);
    
    // Use provided recipientId or fall back to property owner
    let finalRecipientId = recipientId;
    let finalRecipientName = recipientName;
    
    if (!finalRecipientId || finalRecipientId.trim() === '') {
      if (!account.ownerId) {
        return res.status(400).json({ message: 'Property has no owner assigned' });
      }
      finalRecipientId = account.ownerId.toString();
      finalRecipientName = account.ownerName || 'Property Owner';
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
    const allowBusinessHoursSync =
      String(process.env.ALLOW_SYNC_DURING_BUSINESS_HOURS || '').toLowerCase() === 'true' ||
      String(req.query.force || '').toLowerCase() === 'true';
    if (!allowBusinessHoursSync) {
      // Default business window: 08:00-17:59 in configured local timezone.
      const businessStartHour = Number(process.env.PROPERTY_SYNC_BUSINESS_START_HOUR || 8);
      const businessEndHour = Number(process.env.PROPERTY_SYNC_BUSINESS_END_HOUR || 18); // exclusive
      const timeZone = process.env.PROPERTY_SYNC_TIMEZONE || 'Africa/Harare';
      const now = new Date();
      const localHour = Number(
        new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone
        }).format(now)
      );
      if (Number.isFinite(localHour) && localHour >= businessStartHour && localHour < businessEndHour) {
        return res.status(409).json({
          success: false,
          code: 'SYNC_BLOCKED_BUSINESS_HOURS',
          message: `Property account sync is blocked during business hours (${businessStartHour}:00-${businessEndHour}:00 ${timeZone}). Run off-peak or pass ?force=true for an emergency run.`
        });
      }
    }

    const waitForCompletion = String(req.query.wait || req.body?.wait || '').toLowerCase() === 'true';
    if (!waitForCompletion) {
      const companyId = req.user?.companyId ? String(req.user.companyId) : '';
      const requestedBy = req.user?.userId ? String(req.user.userId) : '';
      const queued = await maintenanceJobQueueService.enqueue('sync_property_accounts', {
        companyId,
        requestedBy
      });
      return res.status(202).json({
        success: true,
        queued: true,
        deduplicated: queued.deduplicated,
        message: queued.deduplicated
          ? 'A property account sync job is already pending/running for this company.'
          : 'Property account sync has been queued.',
        job: {
          id: String((queued.job as any)._id),
          status: queued.job.status,
          operation: queued.job.operation,
          createdAt: queued.job.createdAt
        }
      });
    }

    await propertyAccountService.syncPropertyAccountsWithPayments();
    // Also migrate sale income transactions into dedicated sale ledgers (idempotent)
    try {
      const result = await propertyAccountService.migrateSalesLedgerForCompany();
      logger.info('Sales ledger migration completed after property-account sync', result as any);
    } catch (e) {
      logger.warn('Sales ledger migration skipped/failed after property-account sync', e as any);
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
    const waitForCompletion = String(req.query.wait || req.body?.wait || '').toLowerCase() === 'true';
    if (!waitForCompletion) {
      const requestedBy = req.user?.userId ? String(req.user.userId) : '';
      const queued = await maintenanceJobQueueService.enqueue('ensure_development_ledgers', {
        companyId: companyId || '',
        requestedBy
      });
      return res.status(202).json({
        success: true,
        queued: true,
        deduplicated: queued.deduplicated,
        message: queued.deduplicated
          ? 'An ensure-ledgers job is already pending/running for this company.'
          : 'Ensure-ledgers job has been queued.',
        job: {
          id: String((queued.job as any)._id),
          status: queued.job.status,
          operation: queued.job.operation,
          createdAt: queued.job.createdAt
        }
      });
    }

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

export const getPropertyMaintenanceJobStatus = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId ? String(req.user.companyId) : '';
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'jobId is required' });
    }
    const job = await maintenanceJobQueueService.getJobById(jobId, companyId || undefined);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Maintenance job not found' });
    }
    return res.json({ success: true, data: job });
  } catch (error) {
    logger.error('Error in getPropertyMaintenanceJobStatus:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listPropertyMaintenanceJobs = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId ? String(req.user.companyId) : '';
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }
    const operationRaw = String(req.query.operation || '').trim().toLowerCase();
    const operation =
      operationRaw === 'sync_property_accounts' || operationRaw === 'ensure_development_ledgers'
        ? (operationRaw as 'sync_property_accounts' | 'ensure_development_ledgers')
        : undefined;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const jobs = await maintenanceJobQueueService.listRecentJobs(companyId, operation, limit);
    return res.json({ success: true, data: jobs });
  } catch (error) {
    logger.error('Error in listPropertyMaintenanceJobs:', error);
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