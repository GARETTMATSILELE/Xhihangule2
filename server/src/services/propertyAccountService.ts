import { Request, Response } from 'express';
import mongoose from 'mongoose';
import PropertyAccount, { IPropertyAccount, Transaction, OwnerPayout } from '../models/PropertyAccount';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { Development } from '../models/Development';

// Upgrade legacy indexes: allow separate ledgers per property
let ledgerIndexUpgradePromise: Promise<void> | null = null;

export class PropertyAccountService {
  private static instance: PropertyAccountService;

  public static getInstance(): PropertyAccountService {
    if (!PropertyAccountService.instance) {
      PropertyAccountService.instance = new PropertyAccountService();
    }
    return PropertyAccountService.instance;
  }

  /**
   * Infer ledger type for a property using the property's agent's role.
   * - If agent roles include 'sales' → 'sale'
   * - Else if roles include 'agent' → 'rental'
   * - Fallback to property.rentalType ('sale' => 'sale') else 'rental'
   */
  private async inferLedgerTypeForProperty(propertyId: string): Promise<'rental' | 'sale'> {
    try {
      const property = await Property.findById(propertyId).lean();
      const rawAgentId = (property as any)?.agentId;
      if (rawAgentId) {
        const agent = await User.findById(rawAgentId).lean();
        const roles: string[] = Array.isArray((agent as any)?.roles)
          ? ((agent as any).roles as string[])
          : (((agent as any)?.role && typeof (agent as any).role === 'string') ? [String((agent as any).role)] : []);
        if (roles.includes('sales')) return 'sale';
        if (roles.includes('agent')) return 'rental';
      }
      if ((property as any)?.rentalType === 'sale') return 'sale';
      return 'rental';
    } catch {
      return 'rental';
    }
  }

  /**
   * Get or create property account
   */
  async getOrCreatePropertyAccount(propertyId: string, ledgerType: 'rental' | 'sale' = 'rental'): Promise<IPropertyAccount> {
    try {
      // Ensure indexes support multi-ledger before any creates
      await this.ensureLedgerIndexes();
      console.log('getOrCreatePropertyAccount called with propertyId:', propertyId);
      console.log('Converting to ObjectId:', new mongoose.Types.ObjectId(propertyId));

      // If caller passed no explicit ledgerType, infer it
      const effectiveLedger: 'rental' | 'sale' = ledgerType || await this.inferLedgerTypeForProperty(propertyId);

      let account = await PropertyAccount.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId), ledgerType: effectiveLedger });
      console.log('Database query result:', account ? 'Found account' : 'No account found');
      
    if (!account) {
        // Try resolve as a Property; if not found, try as a Development
        const property = await Property.findById(propertyId);
        const development = property ? null : await Development.findById(propertyId);
        if (!property && !development) {
          throw new AppError('Property not found', 404);
        }

        // Get owner details
        let ownerName = 'Unknown Owner';
        let ownerId = null as any;

        if (property) {
          // Resolve owner via PropertyOwner linkage
          if (property.ownerId) {
            const owner = await PropertyOwner.findById(property.ownerId);
            if (owner) {
              ownerName = `${owner.firstName} ${owner.lastName}`.trim();
              ownerId = owner._id;
            }
          }
          if (!ownerId) {
            const owner = await PropertyOwner.findOne({
              properties: { $in: [new mongoose.Types.ObjectId(propertyId)] }
            });
            if (owner) {
              ownerName = `${owner.firstName} ${owner.lastName}`.trim();
              ownerId = owner._id;
            }
          }
        } else if (development) {
          // Resolve owner from Development.owner first/last name
          const first = development.owner?.firstName || '';
          const last = development.owner?.lastName || '';
          const companyName = development.owner?.companyName || '';
          const combined = `${first} ${last}`.trim();
          ownerName = combined || companyName || 'Unknown Owner';
        }

        // Create new account
        account = new PropertyAccount({
          propertyId: new mongoose.Types.ObjectId(propertyId),
          ledgerType: effectiveLedger,
          propertyName: property ? property.name : (development as any)?.name,
          propertyAddress: property ? property.address : (development as any)?.address,
          ownerId: ownerId,
          ownerName,
          transactions: [],
          ownerPayouts: [],
          runningBalance: 0,
          totalIncome: 0,
          totalExpenses: 0,
          totalOwnerPayouts: 0,
          isActive: true
        });

        try {
          await account.save();
        } catch (saveErr: any) {
          const isDup = (saveErr?.code === 11000) || /E11000 duplicate key error/.test(String(saveErr?.message || ''));
          if (isDup) {
            const reloaded = await PropertyAccount.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId), ledgerType: effectiveLedger });
            if (reloaded) {
              account = reloaded as any;
            } else {
              throw saveErr;
            }
          } else {
            throw saveErr;
          }
        }
        logger.info(`Created new property account for property: ${propertyId}`);
      } else {
        // Recalculate balance for existing account
        await this.recalculateBalance(account);
      }

      return account as IPropertyAccount;
    } catch (error) {
      logger.error('Error in getOrCreatePropertyAccount:', error);
      throw error;
    }
  }
  
  // One-time index upgrade to support { propertyId, ledgerType } uniqueness
  private async ensureLedgerIndexes(): Promise<void> {
    if (!ledgerIndexUpgradePromise) {
      ledgerIndexUpgradePromise = (async () => {
        try {
          const indexes = await PropertyAccount.collection.indexes();
          const legacyUniqueByProperty = indexes.find((idx: any) => idx.name === 'propertyId_1' && idx.unique === true);
          if (legacyUniqueByProperty) {
            try {
              await PropertyAccount.collection.dropIndex('propertyId_1');
              console.log('Dropped legacy unique index propertyId_1 on PropertyAccount.');
            } catch (dropErr: any) {
              console.warn('Could not drop legacy index propertyId_1:', dropErr?.message || dropErr);
            }
          }
          // Drop legacy ownerPayout unique index that doesn't include ledgerType and may not be sparse
          const legacyOwnerPayout = indexes.find((idx: any) => idx.name === 'propertyId_1_ownerPayouts.referenceNumber_1');
          if (legacyOwnerPayout) {
            try {
              await PropertyAccount.collection.dropIndex('propertyId_1_ownerPayouts.referenceNumber_1');
              console.log('Dropped legacy index propertyId_1_ownerPayouts.referenceNumber_1 on PropertyAccount.');
            } catch (dropErr: any) {
              console.warn('Could not drop legacy ownerPayout index:', dropErr?.message || dropErr);
            }
          }
          const hasCompound = indexes.some((idx: any) => idx.name === 'propertyId_1_ledgerType_1' && idx.unique === true);
          if (!hasCompound) {
            try {
              await PropertyAccount.collection.createIndex({ propertyId: 1, ledgerType: 1 }, { unique: true });
              console.log('Created compound unique index propertyId_1_ledgerType_1 on PropertyAccount.');
            } catch (createErr: any) {
              console.warn('Could not create compound index:', createErr?.message || createErr);
            }
          }
          // Ensure owner payouts unique index includes ledgerType and is sparse
          const hasOwnerPayoutCompound = indexes.some((idx: any) => idx.name === 'propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1' && idx.unique === true);
          if (!hasOwnerPayoutCompound) {
            try {
              await PropertyAccount.collection.createIndex(
                { propertyId: 1, ledgerType: 1, 'ownerPayouts.referenceNumber': 1 },
                { unique: true, sparse: true }
              );
              console.log('Created compound unique owner payout index propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1.');
            } catch (createErr: any) {
              console.warn('Could not create owner payout compound index:', createErr?.message || createErr);
            }
          }
          // Ensure transactions.paymentId uniqueness is scoped per property ledger
          const legacyTxIndex = indexes.find((idx: any) => idx.name === 'transactions.paymentId_1');
          if (legacyTxIndex) {
            try {
              await PropertyAccount.collection.dropIndex('transactions.paymentId_1');
              console.log('Dropped legacy index transactions.paymentId_1 on PropertyAccount.');
            } catch (dropErr: any) {
              console.warn('Could not drop legacy transactions.paymentId index:', dropErr?.message || dropErr);
            }
          }
          const hasTxCompound = indexes.some((idx: any) => idx.name === 'propertyId_1_ledgerType_1_transactions.paymentId_1' && idx.unique === true);
          if (!hasTxCompound) {
            try {
              await PropertyAccount.collection.createIndex(
                { propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 },
                { unique: true, sparse: true }
              );
              console.log('Created compound unique transactions index propertyId_1_ledgerType_1_transactions.paymentId_1.');
            } catch (createErr: any) {
              console.warn('Could not create transactions compound index:', createErr?.message || createErr);
            }
          }
        } catch (e) {
          console.warn('Failed to verify/upgrade PropertyAccount indexes:', (e as any)?.message || e);
        }
      })();
    }
    return ledgerIndexUpgradePromise;
  }

  /**
   * Recalculate balance for an existing account
   */
  async recalculateBalance(account: IPropertyAccount): Promise<void> {
    // Calculate totals from transactions
    const totalIncome = account.transactions
      .filter(t => t.type === 'income' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = account.transactions
      .filter(t => t.type !== 'income' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalOwnerPayouts = account.ownerPayouts
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);
    
    // Calculate running balance
    const newRunningBalance = totalIncome - totalExpenses - totalOwnerPayouts;
    
    // Update the account if balance has changed
    if (account.runningBalance !== newRunningBalance) {
      account.runningBalance = newRunningBalance;
      account.totalIncome = totalIncome;
      account.totalExpenses = totalExpenses;
      account.totalOwnerPayouts = totalOwnerPayouts;
      account.lastUpdated = new Date();
      
      // Use updateOne instead of save() to avoid triggering pre-save middleware
      await PropertyAccount.updateOne(
        { _id: account._id },
        {
          $set: {
            runningBalance: newRunningBalance,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses,
            totalOwnerPayouts: totalOwnerPayouts,
            lastUpdated: new Date()
          }
        }
      );
      console.log(`Recalculated balance for property ${account.propertyId} (${(account as any).ledgerType || 'rental'}): ${newRunningBalance}`);
    }
  }

  /**
   * Record income from rental payments
   */
  async recordIncomeFromPayment(paymentId: string): Promise<void> {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new AppError('Payment not found', 404);
      }

      if (payment.status !== 'completed') {
        logger.info(`Skipping income recording for payment ${paymentId} - status: ${payment.status}`);
        return;
      }

      // Guard: exclude deposit-only payments from income
      const deposit = payment.depositAmount || 0;
      if (deposit > 0 && (payment.amount <= deposit)) {
        logger.info(`Skipping income for deposit-only payment ${paymentId} (amount: ${payment.amount}, deposit: ${deposit})`);
        return;
      }
            // Get or create property account.
      // IMPORTANT: For sales, always use the 'sale' ledger regardless of agent roles.
      // Rentals continue to use inference to support legacy setups.
      const chosenLedger: 'rental' | 'sale' =
        payment.paymentType === 'sale'
          ? 'sale'
          : 'rental';
      // For sales tied to a development, post owner income to the development ledger
      const devId = (payment as any)?.developmentId as mongoose.Types.ObjectId | undefined;
      const targetEntityId = payment.paymentType === 'sale' && devId ? devId.toString() : payment.propertyId.toString();
      const account = await this.getOrCreatePropertyAccount(targetEntityId, chosenLedger);
      
      // Check if income already recorded for this payment
      const existingTransaction = account.transactions.find(
        t => t.paymentId?.toString() === paymentId && t.type === 'income'
      );

      if (existingTransaction) {
        logger.info(`Income already recorded for payment: ${paymentId}`);
        return;
      }

      // Calculate owner amount (income after commission)
      const ownerAmount = payment.commissionDetails?.ownerAmount || 0;
      const totalPaid = payment.amount || 0;
      const depositPortion = payment.depositAmount || 0;
      // Use the payment intent to determine sale vs rental behavior
      const isSale = payment.paymentType === 'sale';
      // For sales, post the full ownerAmount (already net of commission) without deposit apportioning.
      // For rentals, proportionally exclude the deposit portion from the owner's income.
      const incomeAmount = isSale
        ? Math.max(0, ownerAmount)
        : Math.max(0, totalPaid > 0 ? (totalPaid - depositPortion) * (ownerAmount / totalPaid) : 0);

      if (incomeAmount <= 0) {
        logger.info(`Skipping income for payment ${paymentId} due to deposit exclusion or zero owner income (computed=${incomeAmount}).`);
        return;
      }

      // Create income transaction (rental vs sale)
      const incomeDescription = isSale
        ? `Sale income - ${payment.referenceNumber}`
        : `Rental income - ${payment.referenceNumber}`;
      const incomeCategory = isSale ? 'sale_income' : 'rental_income';

      const incomeTransaction: Transaction = {
        type: 'income',
        amount: incomeAmount,
        date: payment.paymentDate || payment.createdAt,
        paymentId: new mongoose.Types.ObjectId(paymentId),
        description: incomeDescription,
        category: incomeCategory,
        status: 'completed',
        processedBy: payment.processedBy,
        referenceNumber: payment.referenceNumber,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      // Strong idempotency and race-safety:
      // Atomically push iff this paymentId does not already exist for this account
      await PropertyAccount.updateOne(
        { _id: (account as any)._id, 'transactions.paymentId': { $ne: new mongoose.Types.ObjectId(paymentId) } },
        {
          $push: { transactions: incomeTransaction },
          $set: { lastUpdated: new Date() }
        }
      );
      // Recalculate on the latest view to keep totals/running balance consistent
      const fresh = await PropertyAccount.findById((account as any)._id) as any;
      if (fresh) {
        await this.recalculateBalance(fresh as any);
      }

      logger.info(`Recorded income of ${incomeAmount} for property ${payment.propertyId} from payment ${paymentId}`);
    } catch (error) {
      logger.error('Error recording income from payment:', error);
      throw error;
    }
  }

  /**
   * Add expense to property account
   */
  async addExpense(
    propertyId: string,
    expenseData: {
      amount: number;
      date: Date;
      description: string;
      category?: string;
      recipientId?: string;
      recipientType?: 'owner' | 'contractor' | 'tenant' | 'other';
      processedBy: string;
      notes?: string;
    }
  ): Promise<IPropertyAccount> {
    try {
      if (expenseData.amount <= 0) {
        throw new AppError('Expense amount must be greater than 0', 400);
      }

      const account = await this.getOrCreatePropertyAccount(propertyId);
      
      // Check if account has sufficient balance
      if (account.runningBalance < expenseData.amount) {
        throw new AppError('Insufficient balance for this expense', 400);
      }

      const expenseTransaction: Transaction = {
        type: 'expense',
        amount: expenseData.amount,
        date: expenseData.date,
        description: expenseData.description,
        category: expenseData.category || 'general',
        recipientId: expenseData.recipientId,
        recipientType: expenseData.recipientType,
        status: 'completed',
        processedBy: new mongoose.Types.ObjectId(expenseData.processedBy),
        notes: expenseData.notes,
        referenceNumber: `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Add transaction to account
      account.transactions.push(expenseTransaction);
      
      // Save the account (this will trigger pre-save middleware to recalculate balance)
      await account.save();

      logger.info(`Added expense of ${expenseData.amount} to property ${propertyId}`);
      
      return account;
    } catch (error) {
      logger.error('Error adding expense:', error);
      throw error;
    }
  }

  /**
   * Create owner payout
   */
  async createOwnerPayout(
    propertyId: string,
    payoutData: {
      amount: number;
      paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
      recipientId: string;
      recipientName: string;
      recipientBankDetails?: {
        bankName?: string;
        accountNumber?: string;
        accountName?: string;
      };
      processedBy: string;
      notes?: string;
    }
  ): Promise<{ account: IPropertyAccount; payout: OwnerPayout }> {
    try {
      if (payoutData.amount <= 0) {
        throw new AppError('Payout amount must be greater than 0', 400);
      }

      const account = await this.getOrCreatePropertyAccount(propertyId);
      
      // Check if account has sufficient balance
      if (account.runningBalance < payoutData.amount) {
        throw new AppError('Insufficient balance for this payout', 400);
      }

      // Generate unique reference number
      const referenceNumber = `PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const payout: OwnerPayout = {
        amount: payoutData.amount,
        date: new Date(),
        paymentMethod: payoutData.paymentMethod,
        referenceNumber,
        status: 'pending',
        processedBy: new mongoose.Types.ObjectId(payoutData.processedBy),
        recipientId: new mongoose.Types.ObjectId(payoutData.recipientId),
        recipientName: payoutData.recipientName,
        recipientBankDetails: payoutData.recipientBankDetails,
        notes: payoutData.notes,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      account.ownerPayouts.push(payout);
      
      // Save the account (this will trigger pre-save middleware to recalculate balance)
      await account.save();

      logger.info(`Created owner payout of ${payoutData.amount} for property ${propertyId}`);
      
      return { account, payout };
    } catch (error) {
      logger.error('Error creating owner payout:', error);
      throw error;
    }
  }

  /**
   * Update payout status
   */
  async updatePayoutStatus(
    propertyId: string,
    payoutId: string,
    status: 'pending' | 'completed' | 'failed' | 'cancelled',
    processedBy: string
  ): Promise<IPropertyAccount> {
    try {
      const account = await PropertyAccount.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId) });
      if (!account) {
        throw new AppError('Property account not found', 404);
      }

      const payout = account.ownerPayouts.find(p => p._id?.toString() === payoutId);
      if (!payout) {
        throw new AppError('Payout not found', 404);
      }

      // If changing from pending to completed, check balance
      if (payout.status === 'pending' && status === 'completed') {
        if (account.runningBalance < payout.amount) {
          throw new AppError('Insufficient balance to complete payout', 400);
        }
      }

      payout.status = status;
      payout.updatedAt = new Date();
      
      // Save the account (this will trigger pre-save middleware to recalculate balance)
      await account.save();

      logger.info(`Updated payout ${payoutId} status to ${status} for property ${propertyId}`);
      
      return account;
    } catch (error) {
      logger.error('Error updating payout status:', error);
      throw error;
    }
  }

  /**
   * Get property account with summary
   */
  async getPropertyAccount(propertyId: string, ledgerType?: 'rental' | 'sale'): Promise<IPropertyAccount> {
    try {
      const pid = new mongoose.Types.ObjectId(propertyId);
      // Prefer exact ledgerType; fall back to legacy records without ledgerType
      const effectiveLedger: 'rental' | 'sale' = ledgerType || await this.inferLedgerTypeForProperty(propertyId);
      let account: IPropertyAccount | null = await PropertyAccount.findOne({ propertyId: pid, ledgerType: effectiveLedger }) as any;
      if (!account) {
        account = await PropertyAccount.findOne({ propertyId: pid, $or: [{ ledgerType: effectiveLedger }, { ledgerType: { $exists: false } }, { ledgerType: null as any }] }) as any;
      }
      if (!account) {
        // Create the account if missing, then proceed (enables seamless backfill below)
        account = (await this.getOrCreatePropertyAccount(propertyId, effectiveLedger)) as IPropertyAccount;
      }
      if (!account) throw new AppError('Property account not found', 404);
      
      // Update owner information if missing or outdated
      if (!account.ownerName || account.ownerName === 'Unknown Owner') {
        const property = await Property.findById(propertyId);
        if (property) {
          let ownerName = 'Unknown Owner';
          let ownerId = null as any;
          
          if (property.ownerId) {
            const owner = await PropertyOwner.findById(property.ownerId);
            if (owner) {
              ownerName = `${owner.firstName} ${owner.lastName}`.trim();
              ownerId = owner._id;
            }
          }
          
          if (!ownerId) {
            const owner = await PropertyOwner.findOne({
              properties: { $in: [new mongoose.Types.ObjectId(propertyId)] }
            });
            if (owner) {
              ownerName = `${owner.firstName} ${owner.lastName}`.trim();
              ownerId = owner._id;
            }
          }
          
          if (ownerId) {
            (account as IPropertyAccount).ownerId = ownerId;
            (account as IPropertyAccount).ownerName = ownerName;
            await (account as IPropertyAccount).save();
          }
        } else {
          // Fallback: resolve via Development document
          const development = await Development.findById(propertyId);
          if (development) {
            const first = development.owner?.firstName || '';
            const last = development.owner?.lastName || '';
            const companyName = development.owner?.companyName || '';
            const combined = `${first} ${last}`.trim();
            const ownerName = combined || companyName || 'Unknown Owner';
            (account as IPropertyAccount).ownerName = ownerName;
            await (account as IPropertyAccount).save();
          }
        }
      }

      // Defensive backfill for sales ledger: ensure owner income for each completed sale payment exists
      if (effectiveLedger === 'sale') {
        try {
          // Determine whether this account is for a Development or a Property
          const devExists = await Development.exists({ _id: pid });
          const present = new Set(
            ((account as IPropertyAccount).transactions || [])
              .filter(t => t.type === 'income' && (t.category === 'sale_income' || !t.category))
              .map(t => String(t.paymentId || ''))
              .filter(Boolean)
          );

          const baseFilter: any = {
            paymentType: 'sale',
            status: 'completed',
            isProvisional: { $ne: true },
            isInSuspense: { $ne: true },
            $or: [
              { commissionFinalized: true },
              { commissionFinalized: { $exists: false } }
            ]
          };
          if (devExists) {
            baseFilter.developmentId = pid;
          } else {
            baseFilter.propertyId = pid;
          }
          const payments = await Payment.find(baseFilter).select('_id');

          const missing = payments.map(p => String((p as any)._id)).filter(id => !present.has(id));
          for (const mid of missing) {
            try {
              await this.recordIncomeFromPayment(mid);
            } catch (e) {
              console.warn(`Sales ledger backfill failed for payment ${mid}:`, (e as any)?.message || e);
            }
          }

          if (missing.length > 0) {
            account = (await this.getOrCreatePropertyAccount(propertyId, 'sale')) as IPropertyAccount;
          }
        } catch (defErr) {
          console.warn('Sales ledger defensive backfill error (non-fatal):', defErr);
        }
      }
      
      // Recalculate balance for the account
      const finalAccount = account as unknown as IPropertyAccount;
      await this.recalculateBalance(finalAccount);
      
      return finalAccount;
    } catch (error) {
      logger.error('Error getting property account:', error);
      throw error;
    }
  }

  /**
   * Get all property accounts for a company
   */
  async getCompanyPropertyAccounts(companyId: string): Promise<IPropertyAccount[]> {
    try {
      // Get all properties and developments for the company
      const [properties, developments] = await Promise.all([
        Property.find({ companyId }),
        Development.find({ companyId })
      ]);
      const propertyIds = properties.map(p => p._id);
      const developmentIds = developments.map(d => d._id);
      const allIds = [...propertyIds, ...developmentIds];

      const accounts = await PropertyAccount.find({
        propertyId: { $in: allIds }
      }).sort({ lastUpdated: -1 });

      return accounts;
    } catch (error) {
      logger.error('Error getting company property accounts:', error);
      throw error;
    }
  }

  /**
   * Sync all property accounts with payment data
   */
  async syncPropertyAccountsWithPayments(): Promise<void> {
    try {
      logger.info('Starting property account sync with payments...');
      
      // Get all completed payments (rental and sale) to ensure owner income is posted
      const payments = await Payment.find({
        status: 'completed'
      });

      let syncedCount = 0;
      for (const payment of payments) {
        try {
          await this.recordIncomeFromPayment(payment._id.toString());
          syncedCount++;
        } catch (error) {
          logger.error(`Failed to sync payment ${payment._id}:`, error);
        }
      }

      logger.info(`Property account sync completed. Synced ${syncedCount} payments.`);
    } catch (error) {
      logger.error('Error syncing property accounts:', error);
      throw error;
    }
  }

  /**
   * Get transaction history with filters
   */
  async getTransactionHistory(
    propertyId: string,
    filters: {
      type?: string;
      startDate?: Date;
      endDate?: Date;
      category?: string;
      status?: string;
    },
    ledgerType: 'rental' | 'sale' = 'rental'
  ): Promise<Transaction[]> {
    try {
      const account = await this.getPropertyAccount(propertyId, ledgerType);
      
      let transactions = account.transactions;

      // Apply filters
      if (filters.type) {
        transactions = transactions.filter(t => t.type === filters.type);
      }
      
      if (filters.startDate) {
        transactions = transactions.filter(t => t.date >= filters.startDate!);
      }
      
      if (filters.endDate) {
        transactions = transactions.filter(t => t.date <= filters.endDate!);
      }
      
      if (filters.category) {
        transactions = transactions.filter(t => t.category === filters.category);
      }
      
      if (filters.status) {
        transactions = transactions.filter(t => t.status === filters.status);
      }

      // Sort by date descending
      return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw error;
    }
  }

  /**
   * Get payout history
   */
  async getPayoutHistory(propertyId: string): Promise<OwnerPayout[]> {
    try {
      const account = await this.getPropertyAccount(propertyId);
      return account.ownerPayouts.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('Error getting payout history:', error);
      throw error;
    }
  }

  /**
   * One-time migration: move sale income transactions from rental ledger to sale ledger per property.
   * Safe to run multiple times (idempotent using transaction.paymentId uniqueness).
   */
  async migrateSalesLedgerForCompany(companyPropertyIds?: string[]): Promise<{ moved: number; propertiesAffected: number }> {
    let moved = 0;
    let propertiesAffected = 0;
    const filter: any = {};
    if (Array.isArray(companyPropertyIds) && companyPropertyIds.length > 0) {
      filter.propertyId = { $in: companyPropertyIds.map(id => new mongoose.Types.ObjectId(id)) };
    }
    const rentalAccounts = await PropertyAccount.find({ ...filter, ledgerType: { $in: [null as any, 'rental'] } });
    for (const rental of rentalAccounts) {
      const saleTx = (rental.transactions || []).filter(t => t.type === 'income' && t.category === 'sale_income');
      if (saleTx.length === 0) continue;
      const saleAccount = await this.getOrCreatePropertyAccount(rental.propertyId.toString(), 'sale');
      // Move each tx if not already present in sale ledger (by paymentId)
      let movedHere = 0;
      for (const tx of saleTx) {
        const exists = saleAccount.transactions.some(st => st.type === 'income' && st.paymentId && tx.paymentId && st.paymentId.toString() === tx.paymentId.toString());
        if (exists) continue;
        saleAccount.transactions.push({ ...tx, _id: undefined as any });
        movedHere++;
        moved++;
      }
      if (movedHere > 0) {
        // Remove from rental ledger
        rental.transactions = rental.transactions.filter(t => !(t.type === 'income' && t.category === 'sale_income'));
        await saleAccount.save();
        await rental.save();
        await this.recalculateBalance(saleAccount);
        await this.recalculateBalance(rental);
        propertiesAffected++;
      }
    }
    return { moved, propertiesAffected };
  }
}

export default PropertyAccountService.getInstance(); 

// Convenience named export for scripts/tools that call this migration directly
export async function migrateSalesLedgerForCompany(
  companyPropertyIds?: string[]
): Promise<{ moved: number; propertiesAffected: number }> {
  const service = PropertyAccountService.getInstance();
  return service.migrateSalesLedgerForCompany(companyPropertyIds);
}

// One-off maintenance: remove duplicate income transactions per (type,paymentId) for a given property ledger
export async function reconcilePropertyLedgerDuplicates(
  propertyId: string,
  ledgerType?: 'rental' | 'sale'
): Promise<{ removed: number; kept: number; accountId?: string }> {
  const service = PropertyAccountService.getInstance();
  const account = await service.getPropertyAccount(propertyId, ledgerType);
  const tx = Array.isArray(account.transactions) ? account.transactions : [];
  const byKey: Record<string, Array<{ _id?: any; date: Date }>> = Object.create(null);
  for (const t of tx) {
    const pid = (t as any)?.paymentId ? String((t as any).paymentId) : '';
    if (!pid) continue; // only dedupe entries that reference a payment
    const key = `${t.type}:${pid}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ _id: (t as any)._id, date: new Date(t.date) });
  }
  const toRemove: any[] = [];
  let kept = 0;
  for (const key of Object.keys(byKey)) {
    const list = byKey[key];
    if (list.length <= 1) { kept += list.length; continue; }
    // Keep the earliest by date, remove the rest
    const sorted = list.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    kept += 1;
    toRemove.push(...sorted.slice(1).map(i => i._id).filter(Boolean));
  }
  if (toRemove.length > 0) {
    await PropertyAccount.updateOne(
      { _id: account._id },
      { $pull: { transactions: { _id: { $in: toRemove } } } }
    );
    const fresh = await PropertyAccount.findById(account._id);
    if (fresh) {
      await service.recalculateBalance(fresh as any);
    }
  }
  return { removed: toRemove.length, kept, accountId: String(account._id) };
}