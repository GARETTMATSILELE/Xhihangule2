import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AgentAccount, IAgentAccount, Transaction, AgentPayout } from '../models/AgentAccount';
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { formatCurrency as formatCurrencyUtil } from '../utils/money';
import { shouldPostAgentCommission } from './accountingPostingPolicy';
import {
  commissionReversalReference,
  inferCommissionRoleFromReference,
  projectCommissionLanes
} from './commissionProjection';
import { computeAgentAccountTotals } from './propertyAccountTotals';

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
   * True when this AgentAccount already has a commission row for the lane.
   * Matches orchestrator references (paymentId / paymentId-role) and legacy
   * payment.referenceNumber rows. Never used to overwrite amounts.
   */
  private isCommissionLaneAlreadyPosted(
    account: IAgentAccount,
    payment: any,
    lane: { role: string; reference: string }
  ): boolean {
    const paymentId = String(payment?._id || payment?.id || '');
    const baseRef = String(payment?.referenceNumber || '');
    const legacyRef = lane.role === 'agent' ? baseRef : (baseRef ? `${baseRef}-${lane.role}` : '');
    return (account.transactions || []).some((t: any) => {
      if (t.type !== 'commission') return false;
      const ref = String(t.reference || '');
      if (lane.reference && ref === lane.reference) return true;
      if (legacyRef && ref === legacyRef) return true;
      if (paymentId && String(t.paymentId || '') === paymentId) {
        return inferCommissionRoleFromReference(ref) === lane.role;
      }
      return false;
    });
  }

  /**
   * Sync commission transactions for a single payment (SSOT: Payment)
   * Idempotent: uses paymentId + role-qualified reference for dedupe.
   * Existing rows are never overwritten when amounts differ.
   */
  async syncCommissionForPayment(paymentId: string): Promise<void> {
    try {
      const payment = await Payment.findById(paymentId)
        .select('paymentDate amount commissionDetails referenceNumber paymentType agentId companyId propertyId tenantId isProvisional isInSuspense commissionFinalized status reversalOfPaymentId')
        .lean();
      if (!payment) return;
      if (!shouldPostAgentCommission(payment)) return;

      const lanes = projectCommissionLanes(payment);
      for (const lane of lanes) {
        const account = await this.getOrCreateAgentAccount(lane.agentId);
        if (this.isCommissionLaneAlreadyPosted(account, payment, lane)) {
          continue;
        }
        const referenceBase = String((payment as any).referenceNumber || '');
        const description = lane.role === 'agent'
          ? `Commission from payment ${referenceBase}`
          : `Commission (${lane.role}) from payment ${referenceBase}`;
        await this.addCommission(lane.agentId, {
          amount: lane.amount,
          date: new Date((payment as any).paymentDate || new Date()),
          description,
          reference: lane.reference,
          notes: `Property: ${(payment as any).propertyId || ''}, Tenant: ${(payment as any).tenantId || ''}`,
          paymentId: String(paymentId)
        });
      }
    } catch (error) {
      logger.error('Error syncing commission for payment:', error);
      throw error;
    }
  }

  async reverseCommissionForPayment(paymentId: string, reason?: string): Promise<void> {
    try {
      const payment = await Payment.findById(paymentId)
        .select('_id paymentDate referenceNumber')
        .lean();
      if (!payment) return;

      const accounts = await AgentAccount.find({ 'transactions.paymentId': String(paymentId) });
      for (const account of accounts) {
        const commissionRows = (account.transactions || []).filter(
          (t: any) => t.type === 'commission' && String((t as any).paymentId || '') === String(paymentId) && String(t.status || '') === 'completed'
        );
        if (!commissionRows.length) continue;

        for (const row of commissionRows) {
          const role = inferCommissionRoleFromReference(String(row.reference || ''));
          const reversalRef = commissionReversalReference(String(paymentId), role);
          const penalty = {
            type: 'penalty',
            amount: Number(row.amount || 0),
            date: new Date(),
            description: `Commission reversal for payment ${String((payment as any).referenceNumber || paymentId)}`,
            reference: reversalRef,
            status: 'completed',
            notes: reason || 'Manual payment reversal',
            paymentId: String(paymentId)
          };
          await AgentAccount.updateOne(
            { _id: (account as any)._id, 'transactions.reference': { $ne: reversalRef } },
            { $push: { transactions: penalty }, $set: { lastUpdated: new Date() } }
          );
        }

        const fresh = await AgentAccount.findById((account as any)._id);
        if (fresh) {
          await this.recalculateBalance(fresh as any);
        }
      }
    } catch (error) {
      logger.error('Error reversing commission for payment:', error);
      throw error;
    }
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
      }

      return account;
    } catch (error) {
      logger.error('Error in getOrCreateAgentAccount:', error);
      throw error;
    }
  }

  /**
   * Backfill any missing ledger commission transactions for an agent from Payments.
   * Safe and idempotent: uses per-payment sync with paymentId/role references.
   */
  async backfillMissingForAgent(agentId: string): Promise<void> {
    const updatedAccount = await this.getOrCreateAgentAccount(agentId);
    const agentObjId = new mongoose.Types.ObjectId(agentId);
    const allowedTypes = ['rental', 'sale', 'introduction'];
    const commissionData = await Payment.find({
      status: 'completed',
      paymentType: { $in: allowedTypes as any },
      isProvisional: { $ne: true },
      isInSuspense: { $ne: true },
      $and: [
        { $or: [{ commissionFinalized: true }, { commissionFinalized: { $exists: false } }] },
        {
          $or: [
            { agentId: agentObjId },
            { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
            { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
          ]
        }
      ]
    }).select('_id paymentType commissionDetails').lean();

    const needsSync: string[] = [];
    const txByRef = new Set(
      (updatedAccount.transactions || [])
        .filter(t => t.type === 'commission')
        .map(t => String(t.reference || ''))
    );
    for (const p of commissionData) {
      const pid = String((p as any)?._id || '');
      const split = (p as any)?.commissionDetails?.agentSplit;
      if ((p as any).paymentType === 'sale' && split) {
        const ownerId = split?.ownerUserId ? String(split.ownerUserId) : undefined;
        const collabId = split?.collaboratorUserId ? String(split.collaboratorUserId) : undefined;
        const ownerAmt = Number(split?.ownerAgentShare || 0);
        const collabAmt = Number(split?.collaboratorAgentShare || 0);
        if (ownerId === agentId && ownerAmt > 0) {
          const ref = `${pid}-owner`;
          if (!txByRef.has(ref)) needsSync.push(pid);
        } else if (collabId === agentId && collabAmt > 0) {
          const ref = `${pid}-collaborator`;
          if (!txByRef.has(ref)) needsSync.push(pid);
        } else {
          // Fall through to non-split lane if split not applicable to this agent
          const ref = pid;
          if (!txByRef.has(ref)) needsSync.push(pid);
        }
      } else {
        const ref = pid;
        if (!txByRef.has(ref)) needsSync.push(pid);
      }
    }
    if (needsSync.length > 0) {
      const uniq = Array.from(new Set(needsSync));
      for (const pid of uniq) {
        try {
          await this.syncCommissionForPayment(pid);
        } catch (e) {
          logger.warn(`Backfill failed for payment ${pid}:`, (e as any)?.message || e);
        }
      }
      // Recalculate to ensure balances updated
      const account = await this.getOrCreateAgentAccount(agentId);
      await this.recalculateBalance(account);
      await account.save();
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
    paymentId?: string;
  }): Promise<IAgentAccount> {
    try {
      const account = await this.getOrCreateAgentAccount(agentId);

      if (commissionData.paymentId) {
        const role = inferCommissionRoleFromReference(commissionData.reference || '');
        const existsByPayment = account.transactions.some(t =>
          t.type === 'commission' &&
          String((t as any).paymentId || '') === String(commissionData.paymentId) &&
          inferCommissionRoleFromReference(String(t.reference || '')) === role
        );
        if (existsByPayment) {
          logger.warn(`Duplicate commission paymentId "${commissionData.paymentId}" role ${role} for agent ${agentId} ignored.`);
          return account;
        }
      }

      if (commissionData.reference) {
        const exists = account.transactions.some(t =>
          t.type === 'commission' &&
          typeof t.reference === 'string' &&
          t.reference.length > 0 &&
          t.reference === commissionData.reference
        );
        if (exists) {
          logger.warn(`Duplicate commission reference "${commissionData.reference}" for agent ${agentId} ignored.`);
          return account;
        }
      }

      const transaction: Transaction = {
        type: 'commission',
        amount: commissionData.amount,
        date: commissionData.date,
        description: commissionData.description,
        reference: commissionData.reference,
        status: 'completed',
        notes: commissionData.notes
      };
      if (commissionData.paymentId) {
        (transaction as any).paymentId = commissionData.paymentId;
      }

      const filter: any = { agentId: new mongoose.Types.ObjectId(agentId) };
      if (commissionData.reference) {
        filter['transactions.reference'] = { $ne: commissionData.reference };
      }
      const pushed = await AgentAccount.updateOne(
        filter,
        {
          $push: { transactions: transaction },
          $set: { lastCommissionDate: commissionData.date, lastUpdated: new Date() }
        }
      );
      if (Number((pushed as any).modifiedCount || 0) === 0) {
        return await AgentAccount.findOne({ agentId: new mongoose.Types.ObjectId(agentId) }) as any;
      }
      const fresh = await AgentAccount.findOne({ agentId: new mongoose.Types.ObjectId(agentId) });
      if (fresh) {
        await this.recalculateBalance(fresh as any);
        logger.info(`Added commission of ${commissionData.amount} to agent ${agentId}`);
        return fresh as any;
      }
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
      const totals = computeAgentAccountTotals(account as any);
      account.totalCommissions = totals.totalCommissions;
      account.totalPayouts = totals.totalPayouts;
      account.totalPenalties = totals.totalPenalties;
      account.runningBalance = totals.runningBalance;
      account.lastUpdated = new Date();
      if ((account as any)._id) {
        await AgentAccount.updateOne(
          { _id: (account as any)._id },
          {
            $set: {
              totalCommissions: totals.totalCommissions,
              totalPayouts: totals.totalPayouts,
              totalPenalties: totals.totalPenalties,
              runningBalance: totals.runningBalance,
              lastUpdated: new Date()
            }
          }
        );
      }
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
      const account = await AgentAccount.findOne({ agentId: new mongoose.Types.ObjectId(agentId) });
      if (!account) {
        throw new AppError('Agent account not found', 404);
      }
      let updatedAccount = account;
      
      // Get commission data from payments for display
      console.log('Fetching commission data for agentId:', agentId);
      // Fetch both rentals and sales where this agent is involved either as the payment.agentId
      // or through a sales split (owner/collaborator). This avoids role-based blind spots.
      const agentObjId = new mongoose.Types.ObjectId(agentId);
      const allowedTypes = ['rental', 'sale', 'introduction'];
      // First check if there are any relevant payments
      const totalPayments = await Payment.countDocuments({
        status: 'completed',
        paymentType: { $in: allowedTypes as any },
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true },
        $and: [
          { $or: [{ commissionFinalized: true }, { commissionFinalized: { $exists: false } }] },
          {
            $or: [
              { agentId: agentObjId },
              { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
              { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
            ]
          }
        ]
      });
      console.log('Relevant completed payments for agent:', totalPayments);
      
      const commissionData = await Payment.find({
        status: 'completed',
        paymentType: { $in: allowedTypes as any },
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true },
        $and: [
          { $or: [{ commissionFinalized: true }, { commissionFinalized: { $exists: false } }] },
          {
            $or: [
              { agentId: agentObjId },
              { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
              { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
            ]
          }
        ]
      })
        .populate('propertyId', 'address propertyName')
        .populate('tenantId', 'firstName lastName')
        .select('paymentDate amount commissionDetails propertyId tenantId referenceNumber paymentType manualPropertyAddress manualTenantName')
        .sort({ paymentDate: -1 })
        .lean() as PopulatedCommissionData[]; // Use lean() for better performance
      
      console.log('Found commission data:', commissionData.length, 'records');

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
      const agents = await User.find({
        companyId: new mongoose.Types.ObjectId(companyId),
        $or: [
          { role: { $in: ['agent', 'sales'] } },
          { roles: { $in: ['agent', 'sales'] } }
        ]
      });
      const agentIds = agents.map(agent => agent._id);

      const accounts = await AgentAccount.find({ agentId: { $in: agentIds } });
      return accounts;
    } catch (error) {
      logger.error('Error getting company agent accounts:', error);
      throw error;
    }
  }

  /**
   * Historical catch-up: project missing AgentAccount commissions from Payments.
   * Uses the same writer as postPaymentAccounting (syncCommissionForPayment).
   * Does not recalculate commission/VAT, does not overwrite existing rows,
   * and does not rewrite the transactions array.
   */
  async syncCommissionTransactions(agentId: string): Promise<void> {
    try {
      const agentObjId = new mongoose.Types.ObjectId(agentId);
      const payments = await Payment.find({
        status: 'completed',
        paymentType: { $in: ['rental', 'sale', 'introduction'] as any },
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true },
        $and: [
          { $or: [{ commissionFinalized: true }, { commissionFinalized: { $exists: false } }] },
          {
            $or: [
              { agentId: agentObjId },
              { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
              { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
            ]
          }
        ]
      }).select('_id').lean();

      const seen = new Set<string>();
      for (const payment of payments) {
        const pid = String((payment as any)?._id || '');
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        await this.syncCommissionForPayment(pid);
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
      const agents = await User.find({
        companyId: new mongoose.Types.ObjectId(companyId),
        $or: [
          { role: { $in: ['agent', 'sales'] } },
          { roles: { $in: ['agent', 'sales'] } }
        ]
      });
      
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
    return formatCurrencyUtil(amount, 'USD');
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
