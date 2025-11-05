import { Request, Response } from 'express';
import mongoose from 'mongoose';
import PropertyAccount, { IPropertyAccount, Transaction, OwnerPayout } from '../models/PropertyAccount';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class PropertyAccountService {
  private static instance: PropertyAccountService;

  public static getInstance(): PropertyAccountService {
    if (!PropertyAccountService.instance) {
      PropertyAccountService.instance = new PropertyAccountService();
    }
    return PropertyAccountService.instance;
  }

  /**
   * Get or create property account
   */
  async getOrCreatePropertyAccount(propertyId: string): Promise<IPropertyAccount> {
    try {
      console.log('getOrCreatePropertyAccount called with propertyId:', propertyId);
      console.log('Converting to ObjectId:', new mongoose.Types.ObjectId(propertyId));
      
      let account = await PropertyAccount.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId) });
      console.log('Database query result:', account ? 'Found account' : 'No account found');
      
    if (!account) {
        // Get property details
        const property = await Property.findById(propertyId);
        if (!property) {
          throw new AppError('Property not found', 404);
        }

        // Get owner details from PropertyOwner collection
        let ownerName = 'Unknown Owner';
        let ownerId = null;
        
        // First try to find owner by property.ownerId
        if (property.ownerId) {
          const owner = await PropertyOwner.findById(property.ownerId);
          if (owner) {
            ownerName = `${owner.firstName} ${owner.lastName}`;
            ownerId = owner._id;
          }
        }
        
        // If not found by property.ownerId, try to find owner by searching properties array
        if (!ownerId) {
          const owner = await PropertyOwner.findOne({
            properties: { $in: [new mongoose.Types.ObjectId(propertyId)] }
          });
          if (owner) {
            ownerName = `${owner.firstName} ${owner.lastName}`;
            ownerId = owner._id;
          }
        }

        // Create new account
        account = new PropertyAccount({
          propertyId: new mongoose.Types.ObjectId(propertyId),
          propertyName: property.name,
          propertyAddress: property.address,
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

        await account.save();
        logger.info(`Created new property account for property: ${propertyId}`);
      } else {
        // Recalculate balance for existing account
        await this.recalculateBalance(account);
      }

      return account;
    } catch (error) {
      logger.error('Error in getOrCreatePropertyAccount:', error);
      throw error;
    }
  }

  /**
   * Recalculate balance for an existing account
   */
  private async recalculateBalance(account: IPropertyAccount): Promise<void> {
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
      console.log(`Recalculated balance for property ${account.propertyId}: ${newRunningBalance}`);
    }
  }

  /**
   * Record income from rental payments
   */
  async recordIncomeFromPayment(paymentId: string): Promise<void> {
    const session = await mongoose.startSession();
    let useTransaction = false;
    try {
      session.startTransaction();
      useTransaction = true;
    } catch (txnErr) {
      console.warn('PropertyAccountService: transactions unsupported; proceeding without transaction:', txnErr);
      useTransaction = false;
    }

    try {
      const payment = useTransaction
        ? await Payment.findById(paymentId).session(session)
        : await Payment.findById(paymentId);
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

      // Get or create property account
      const account = await this.getOrCreatePropertyAccount(payment.propertyId.toString());
      
      // Check if income already recorded for this payment
      const existingTransaction = account.transactions.find(
        t => t.paymentId?.toString() === paymentId && t.type === 'income'
      );

      if (existingTransaction) {
        logger.info(`Income already recorded for payment: ${paymentId}`);
        return;
      }

      // Calculate owner amount (income after commission) and exclude deposits
      const ownerAmount = payment.commissionDetails?.ownerAmount || 0;
      const totalPaid = payment.amount || 0;
      const depositPortion = payment.depositAmount || 0;
      const ownerFraction = totalPaid > 0 ? ownerAmount / totalPaid : 0;
      const incomeAmount = Math.max(0, (totalPaid - depositPortion) * ownerFraction);

      if (incomeAmount <= 0) {
        logger.info(`Skipping income for payment ${paymentId} due to deposit exclusion or zero owner income (computed=${incomeAmount}).`);
        return;
      }

      // Create income transaction (rental vs sale)
      const isSale = payment.paymentType === 'sale';
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

      account.transactions.push(incomeTransaction);
      if (useTransaction) {
        await account.save({ session });
      } else {
        await account.save();
      }

      logger.info(`Recorded income of ${incomeAmount} for property ${payment.propertyId} from payment ${paymentId}`);
      
      if (useTransaction) {
        await session.commitTransaction();
      }
    } catch (error) {
      if (useTransaction) {
        await session.abortTransaction();
      }
      logger.error('Error recording income from payment:', error);
      throw error;
    } finally {
      session.endSession();
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
  async getPropertyAccount(propertyId: string): Promise<IPropertyAccount> {
    try {
      const account = await PropertyAccount.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId) });
      if (!account) {
        throw new AppError('Property account not found', 404);
      }
      
      // Update owner information if missing or outdated
      if (!account.ownerName || account.ownerName === 'Unknown Owner') {
        const property = await Property.findById(propertyId);
        if (property) {
          let ownerName = 'Unknown Owner';
          let ownerId = null;
          
          // First try to find owner by property.ownerId
          if (property.ownerId) {
            const owner = await PropertyOwner.findById(property.ownerId);
            if (owner) {
              ownerName = `${owner.firstName} ${owner.lastName}`;
              ownerId = owner._id;
            }
          }
          
          // If not found by property.ownerId, try to find owner by searching properties array
          if (!ownerId) {
            const owner = await PropertyOwner.findOne({
              properties: { $in: [new mongoose.Types.ObjectId(propertyId)] }
            });
            if (owner) {
              ownerName = `${owner.firstName} ${owner.lastName}`;
              ownerId = owner._id;
            }
          }
          
          // Update the account with owner information
          if (ownerId) {
            account.ownerId = ownerId;
            account.ownerName = ownerName;
            await account.save();
          }
        }
      }
      
      // Recalculate balance for the account
      await this.recalculateBalance(account);
      
      return account;
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
      // Get all properties for the company
      const properties = await Property.find({ companyId });
      const propertyIds = properties.map(p => p._id);

      const accounts = await PropertyAccount.find({
        propertyId: { $in: propertyIds }
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
      
      // Get all completed rental payments that haven't been recorded as income
      const payments = await Payment.find({
        status: 'completed',
        paymentType: 'rental'
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
    }
  ): Promise<Transaction[]> {
    try {
      const account = await this.getPropertyAccount(propertyId);
      
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
}

export default PropertyAccountService.getInstance(); 