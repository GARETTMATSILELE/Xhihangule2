import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AgentAccount, IAgentAccount, Transaction, AgentPayout } from '../models/AgentAccount';
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

// Interface for populated commission data
interface PopulatedCommissionData {
  _id: string;
  paymentDate: Date;
  amount: number;
  commissionDetails: {
    totalCommission: number;
    preaFee: number;
    agentShare: number;
    agencyShare: number;
    ownerAmount: number;
  };
  propertyId: {
    _id: string;
    address: string;
    propertyName?: string;
  };
  tenantId: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  referenceNumber: string;
  paymentType: 'introduction' | 'rental' | 'sale';
}

export class AgentAccountService {
  private static instance: AgentAccountService;

  public static getInstance(): AgentAccountService {
    if (!AgentAccountService.instance) {
      AgentAccountService.instance = new AgentAccountService();
    }
    return AgentAccountService.instance;
  }

  /**
   * Get or create agent account
   */
  async getOrCreateAgentAccount(agentId: string): Promise<IAgentAccount> {
    try {
      console.log('getOrCreateAgentAccount called with agentId:', agentId);
      console.log('Converting to ObjectId:', new mongoose.Types.ObjectId(agentId));
      
      let account = await AgentAccount.findOne({ agentId: new mongoose.Types.ObjectId(agentId) });
      console.log('Database query result:', account ? 'Found account' : 'No account found');
      
      if (!account) {
        // Get agent details
        const agent = await User.findById(agentId);
        if (!agent) {
          throw new AppError('Agent not found', 404);
        }

        // Create new account
        account = new AgentAccount({
          agentId: new mongoose.Types.ObjectId(agentId),
          agentName: `${agent.firstName} ${agent.lastName}`,
          agentEmail: agent.email,
          transactions: [],
          agentPayouts: [],
          runningBalance: 0,
          totalCommissions: 0,
          totalPayouts: 0,
          totalPenalties: 0,
          isActive: true
        });

        await account.save();
        logger.info(`Created new agent account for agent: ${agentId}`);
      } else {
        // Recalculate balance for existing account
        await this.recalculateBalance(account);
      }

      return account;
    } catch (error) {
      logger.error('Error in getOrCreateAgentAccount:', error);
      throw error;
    }
  }

  /**
   * Add commission transaction
   */
  async addCommission(agentId: string, commissionData: {
    amount: number;
    date: Date;
    description: string;
    reference?: string;
    notes?: string;
  }): Promise<IAgentAccount> {
    try {
      const account = await this.getOrCreateAgentAccount(agentId);
      
      const transaction: Transaction = {
        type: 'commission',
        amount: commissionData.amount,
        date: commissionData.date,
        description: commissionData.description,
        reference: commissionData.reference,
        status: 'completed',
        notes: commissionData.notes
      };

      account.transactions.push(transaction);
      account.totalCommissions += commissionData.amount;
      account.lastCommissionDate = commissionData.date;
      account.lastUpdated = new Date();

      await this.recalculateBalance(account);
      await account.save();

      logger.info(`Added commission of ${commissionData.amount} to agent ${agentId}`);
      return account;
    } catch (error) {
      logger.error('Error adding commission:', error);
      throw error;
    }
  }

  /**
   * Add penalty transaction
   */
  async addPenalty(agentId: string, penaltyData: {
    amount: number;
    date: Date;
    description: string;
    reference?: string;
    notes?: string;
    category?: string;
  }): Promise<IAgentAccount> {
    try {
      const account = await this.getOrCreateAgentAccount(agentId);
      
      const transaction: Transaction = {
        type: 'penalty',
        amount: penaltyData.amount,
        date: penaltyData.date,
        description: penaltyData.description,
        reference: penaltyData.reference,
        status: 'completed',
        notes: penaltyData.notes,
        category: penaltyData.category
      };

      account.transactions.push(transaction);
      account.totalPenalties += penaltyData.amount;
      account.lastPenaltyDate = penaltyData.date;
      account.lastUpdated = new Date();

      await this.recalculateBalance(account);
      await account.save();

      logger.info(`Added penalty of ${penaltyData.amount} to agent ${agentId}`);
      return account;
    } catch (error) {
      logger.error('Error adding penalty:', error);
      throw error;
    }
  }

  /**
   * Create agent payout
   */
  async createAgentPayout(agentId: string, payoutData: {
    amount: number;
    paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
    recipientId: string;
    recipientName: string;
    notes?: string;
  }): Promise<{ account: IAgentAccount; payout: AgentPayout }> {
    try {
      const account = await this.getOrCreateAgentAccount(agentId);
      
      if (account.runningBalance < payoutData.amount) {
        throw new AppError('Insufficient balance for payout', 400);
      }

      // Generate reference number
      const referenceNumber = `AGP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      const payout: AgentPayout = {
        amount: payoutData.amount,
        date: new Date(),
        paymentMethod: payoutData.paymentMethod,
        recipientId: payoutData.recipientId,
        recipientName: payoutData.recipientName,
        referenceNumber,
        status: 'pending',
        notes: payoutData.notes
      };

      // Add payout transaction
      const transaction: Transaction = {
        type: 'payout',
        amount: payoutData.amount,
        date: new Date(),
        description: `Payout to ${payoutData.recipientName}`,
        reference: referenceNumber,
        status: 'pending',
        notes: payoutData.notes
      };

      account.agentPayouts.push(payout);
      account.transactions.push(transaction);
      account.totalPayouts += payoutData.amount;
      account.lastPayoutDate = new Date();
      account.lastUpdated = new Date();

      await this.recalculateBalance(account);
      await account.save();

      logger.info(`Created payout of ${payoutData.amount} for agent ${agentId}`);
      return { account, payout };
    } catch (error) {
      logger.error('Error creating agent payout:', error);
      throw error;
    }
  }

  /**
   * Update payout status
   */
  async updatePayoutStatus(agentId: string, payoutId: string, status: 'completed' | 'failed' | 'cancelled'): Promise<IAgentAccount> {
    try {
      const account = await this.getOrCreateAgentAccount(agentId);
      
      const payout = account.agentPayouts.find(p => p._id?.toString() === payoutId);
      if (!payout) {
        throw new AppError('Payout not found', 404);
      }

      payout.status = status;
      if (status === 'completed') {
        payout.processedAt = new Date();
      }

      // Update corresponding transaction status
      const transaction = account.transactions.find(t => t.reference === payout.referenceNumber);
      if (transaction) {
        transaction.status = status;
      }

      account.lastUpdated = new Date();
      await this.recalculateBalance(account);
      await account.save();

      logger.info(`Updated payout status to ${status} for agent ${agentId}`);
      return account;
    } catch (error) {
      logger.error('Error updating payout status:', error);
      throw error;
    }
  }

  /**
   * Recalculate running balance
   */
  async recalculateBalance(account: IAgentAccount): Promise<void> {
    try {
      let balance = 0;
      
      // Sort transactions by date
      const sortedTransactions = account.transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      for (const transaction of sortedTransactions) {
        if (transaction.type === 'commission') {
          balance += transaction.amount;
        } else if (transaction.type === 'payout' || transaction.type === 'penalty') {
          balance -= transaction.amount;
        }
        transaction.runningBalance = balance;
      }
      
      account.runningBalance = balance;
      account.lastUpdated = new Date();
    } catch (error) {
      logger.error('Error recalculating balance:', error);
      throw error;
    }
  }

  /**
   * Get agent account with summary and commission data from payments
   */
  async getAgentAccount(agentId: string): Promise<IAgentAccount & { commissionData?: PopulatedCommissionData[] }> {
    try {
      // First try to get or create the account
      const account = await this.getOrCreateAgentAccount(agentId);
      
      // Sync commission transactions from payments to ensure balance is up to date
      await this.syncCommissionTransactions(agentId);
      
      // Refresh the account after syncing
      const updatedAccount = await this.getOrCreateAgentAccount(agentId);
      
      // Get commission data from payments for display
      console.log('Fetching commission data for agentId:', agentId);
      // Fetch both rentals and sales where this agent is involved either as the payment.agentId
      // or through a sales split (owner/collaborator). This avoids role-based blind spots.
      const agentObjId = new mongoose.Types.ObjectId(agentId);
      const allowedTypes = ['rental', 'sale'];
      // First check if there are any relevant payments
      const totalPayments = await Payment.countDocuments({
        status: 'completed',
        paymentType: { $in: allowedTypes as any },
        $or: [
          { agentId: agentObjId },
          { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
          { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
        ]
      });
      console.log('Relevant completed payments for agent:', totalPayments);
      
      const commissionData = await Payment.find({
        status: 'completed',
        paymentType: { $in: allowedTypes as any },
        $or: [
          { agentId: agentObjId },
          { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
          { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
        ]
      })
        .populate('propertyId', 'address propertyName')
        .populate('tenantId', 'firstName lastName')
        .select('paymentDate amount commissionDetails propertyId tenantId referenceNumber paymentType manualPropertyAddress manualTenantName')
        .sort({ paymentDate: -1 })
        .lean() as PopulatedCommissionData[]; // Use lean() for better performance
      
      console.log('Found commission data:', commissionData.length, 'records');
      if (commissionData.length > 0) {
        console.log('Sample commission record:', {
          paymentDate: commissionData[0].paymentDate,
          amount: commissionData[0].amount,
          agentShare: commissionData[0].commissionDetails?.agentShare,
          propertyName: commissionData[0].propertyId?.propertyName
        });
      }
      
      const accountData = updatedAccount.toObject();
      const result = { ...accountData, commissionData } as IAgentAccount & { commissionData?: PopulatedCommissionData[] };
      
      console.log('Returning agent account with commission data:', {
        agentId: result.agentId,
        agentName: result.agentName,
        commissionDataCount: result.commissionData?.length || 0,
        totalCommissions: result.totalCommissions,
        runningBalance: result.runningBalance
      });
      
      return result;
    } catch (error) {
      logger.error('Error getting agent account:', error);
      if (error instanceof mongoose.Error.CastError) {
        throw new AppError('Invalid agent ID format', 400);
      }
      throw error;
    }
  }

  /**
   * Get all agent accounts for a company
   */
  async getCompanyAgentAccounts(companyId: string): Promise<IAgentAccount[]> {
    try {
      // Get all agents for the company
      const agents = await User.find({ companyId: new mongoose.Types.ObjectId(companyId), role: { $in: ['agent', 'sales'] } });
      const agentIds = agents.map(agent => agent._id);
      
      // Get or create accounts for all agents
      const accounts = await Promise.all(
        agentIds.map(agentId => this.getOrCreateAgentAccount(agentId.toString()))
      );
      
      return accounts;
    } catch (error) {
      logger.error('Error getting company agent accounts:', error);
      throw error;
    }
  }

  /**
   * Sync commission transactions for a specific agent
   */
  async syncCommissionTransactions(agentId: string): Promise<void> {
    try {
      console.log('Syncing commission transactions for agent:', agentId);

      // Get all completed payments where this agent is either:
      // - the recorded agentId on the payment, or
      // - the owner or collaborator in a sales split
      const agentObjId = new mongoose.Types.ObjectId(agentId);
      const payments = await Payment.find({
        status: 'completed',
        paymentType: { $in: ['rental', 'sale'] as any },
        $or: [
          { agentId: agentObjId },
          { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
          { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
        ]
      }).select('paymentDate amount commissionDetails referenceNumber propertyId tenantId paymentType');

      const account = await this.getOrCreateAgentAccount(agentId);
      let newTransactionsAdded = 0;

      for (const payment of payments) {
        // Determine the applicable commission amount for this agent
        const split = (payment as any)?.commissionDetails?.agentSplit;
        let applicableAmount = 0;
        let roleLabel: 'owner' | 'collaborator' | 'agent' = 'agent';
        if (split && payment.paymentType === 'sale') {
          const ownerId = split?.ownerUserId ? String(split.ownerUserId) : undefined;
          const collabId = split?.collaboratorUserId ? String(split.collaboratorUserId) : undefined;
          if (ownerId === agentId) {
            applicableAmount = Number(split?.ownerAgentShare || 0);
            roleLabel = 'owner';
          } else if (collabId === agentId) {
            applicableAmount = Number(split?.collaboratorAgentShare || 0);
            roleLabel = 'collaborator';
          } else {
            applicableAmount = 0;
          }
        } else {
          // Rentals and introductions: a single agent commission applies
          applicableAmount = Number((payment as any)?.commissionDetails?.agentShare || 0);
          roleLabel = 'agent';
        }

        if (applicableAmount && applicableAmount > 0) {
          // Use a role-qualified reference ONLY for sales splits to distinguish entries
          const baseRef = String((payment as any).referenceNumber || '');
          const isSalesSplit = !!split && (payment as any).paymentType === 'sale';
          const uniqueRef = isSalesSplit ? `${baseRef}-${roleLabel}` : baseRef;
          // Check if this commission transaction already exists.
          // Older rental transactions may have missing reference or a description without role tag,
          // so we perform a broader match for non-sales payments to avoid duplicates.
          const existingTransaction = account.transactions.find(t => {
            if (t.type !== 'commission') return false;
            if (t.reference === uniqueRef) return true;
            if (!isSalesSplit) {
              if (t.reference === baseRef) return true;
              if (typeof t.description === 'string' && baseRef && t.description.includes(baseRef)) return true;
            }
            return false;
          });
          
          if (!existingTransaction) {
            // Add commission transaction
            // For rentals/introductions: keep legacy description to prevent duplicates.
            const description = isSalesSplit
              ? `Commission (${roleLabel}) from payment ${baseRef}`
              : `Commission from payment ${baseRef}`;
            const transaction: Transaction = {
              type: 'commission',
              amount: applicableAmount,
              date: (payment as any).paymentDate,
              description,
              reference: uniqueRef,
              status: 'completed',
              notes: `Property: ${(payment as any).propertyId}, Tenant: ${(payment as any).tenantId}`
            };

            account.transactions.push(transaction);
            account.totalCommissions += applicableAmount;
            account.lastCommissionDate = (payment as any).paymentDate;
            newTransactionsAdded++;
            
            console.log(`Added commission transaction (${isSalesSplit ? roleLabel : 'agent'}): ${applicableAmount} for payment ${baseRef}`);
          }
        }
      }

      if (newTransactionsAdded > 0) {
        // Recalculate balance and save
        await this.recalculateBalance(account);
        await account.save();
        console.log(`Synced ${newTransactionsAdded} new commission transactions for agent ${agentId}`);
      } else {
        console.log('No new commission transactions to sync for agent:', agentId);
      }
    } catch (error) {
      logger.error('Error syncing commission transactions:', error);
      throw error;
    }
  }

  /**
   * Sync agent accounts from payments
   */
  async syncFromPayments(companyId: string): Promise<void> {
    try {
      // Get all agents for the company
      const agents = await User.find({ companyId: new mongoose.Types.ObjectId(companyId), role: 'agent' });
      
      for (const agent of agents) {
        await this.syncCommissionTransactions(agent._id.toString());
      }
      
      logger.info(`Synced agent accounts from payments for company ${companyId}`);
    } catch (error) {
      logger.error('Error syncing agent accounts from payments:', error);
      throw error;
    }
  }

  /**
   * Get acknowledgement document data
   */
  async getAcknowledgementDocument(agentId: string, payoutId: string): Promise<any> {
    try {
      const account = await this.getAgentAccount(agentId);
      const payout = account.agentPayouts.find(p => p._id?.toString() === payoutId);
      
      if (!payout) {
        throw new AppError('Payout not found', 404);
      }
      
      return {
        payout,
        agentName: account.agentName,
        agentEmail: account.agentEmail
      };
    } catch (error) {
      logger.error('Error getting acknowledgement document:', error);
      throw error;
    }
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  /**
   * Get transaction type label
   */
  getTransactionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      commission: 'Commission',
      payout: 'Payout',
      penalty: 'Penalty',
      adjustment: 'Adjustment'
    };
    return labels[type] || type;
  }

  /**
   * Get payment method label
   */
  getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      bank_transfer: 'Bank Transfer',
      cash: 'Cash',
      mobile_money: 'Mobile Money',
      check: 'Check'
    };
    return labels[method] || method;
  }

  /**
   * Calculate running balance from transactions
   */
  calculateRunningBalance(transactions: Transaction[]): { transactions: Transaction[]; finalBalance: number } {
    let balance = 0;
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const updatedTransactions = sortedTransactions.map(transaction => {
      if (transaction.type === 'commission') {
        balance += transaction.amount;
      } else if (transaction.type === 'payout' || transaction.type === 'penalty') {
        balance -= transaction.amount;
      }
      return { ...transaction, runningBalance: balance };
    });
    
    return { transactions: updatedTransactions, finalBalance: balance };
  }
}

export default AgentAccountService.getInstance();
