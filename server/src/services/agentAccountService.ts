import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AgentAccount, IAgentAccount, Transaction, AgentPayout } from '../models/AgentAccount';
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { formatCurrency as formatCurrencyUtil } from '../utils/money';

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
   * Sync commission transactions for a single payment (SSOT: Payment)
   * Idempotent: uses paymentId + role-qualified reference for dedupe.
   */
  async syncCommissionForPayment(paymentId: string): Promise<void> {
    try {
      const payment = await Payment.findById(paymentId)
        .select('paymentDate amount commissionDetails referenceNumber paymentType agentId companyId propertyId tenantId')
        .lean();
      if (!payment) return;

      // Handle non-split rentals/introduction as a single agent lane
      const isSale = (payment as any).paymentType === 'sale' || (payment as any).paymentType === 'introduction';
      const split = (payment as any)?.commissionDetails && (payment as any).commissionDetails.agentSplit;

      // Helper to post to an agent lane idempotently
      const postLane = async (agentUserId: string, amount: number, roleLabel: 'agent' | 'owner' | 'collaborator') => {
        if (!agentUserId || !amount || amount <= 0) return;
        const referenceBase = String((payment as any).referenceNumber || '');
        const ref = isSale && roleLabel !== 'agent' ? `${String(paymentId)}-${roleLabel}` : String(paymentId);
        const description = roleLabel === 'agent'
          ? `Commission from payment ${referenceBase}`
          : `Commission (${roleLabel}) from payment ${referenceBase}`;
        await this.addCommission(String(agentUserId), {
          amount: Number(amount),
          date: new Date((payment as any).paymentDate || new Date()),
          description,
          reference: ref,
          notes: `Property: ${(payment as any).propertyId || ''}, Tenant: ${(payment as any).tenantId || ''}`,
          paymentId: String(paymentId)
        });
      };

      if (isSale && split) {
        const ownerId = split?.ownerUserId ? String(split.ownerUserId) : undefined;
        const collabId = split?.collaboratorUserId ? String(split.collaboratorUserId) : undefined;
        const ownerAmt = Number(split?.ownerAgentShare || 0);
        const collabAmt = Number(split?.collaboratorAgentShare || 0);
        const hasValidOwner = Boolean(ownerId && ownerAmt > 0);
        const hasValidCollab = Boolean(collabId && collabAmt > 0);
        if (hasValidOwner) await postLane(ownerId!, ownerAmt, 'owner');
        if (hasValidCollab) await postLane(collabId!, collabAmt, 'collaborator');
        // Only return early if at least one valid split lane posted; otherwise fall through to single agent lane.
        if (hasValidOwner || hasValidCollab) {
          return;
        }
      }

      // Rentals and non-split sales/introduction: single agent
      const agentId = (payment as any).agentId ? String((payment as any).agentId) : undefined;
      const amount = Number((payment as any)?.commissionDetails?.agentShare || 0);
      if (agentId && amount && amount > 0) {
        await postLane(agentId, amount, 'agent');
      }
    } catch (error) {
      logger.error('Error syncing commission for payment:', error);
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
    paymentId?: string;
  }): Promise<IAgentAccount> {
    try {
      const account = await this.getOrCreateAgentAccount(agentId);
      
      // Dedupe by reference: if a commission with same reference already exists, no-op
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
      // Dedupe by paymentId when provided
      if (commissionData.paymentId) {
        const existsByPayment = account.transactions.some(t =>
          t.type === 'commission' && String((t as any).paymentId || '') === String(commissionData.paymentId)
        );
        if (existsByPayment) {
          logger.warn(`Duplicate commission by paymentId "${commissionData.paymentId}" for agent ${agentId} ignored.`);
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

      account.transactions.push(transaction);
      account.totalCommissions += commissionData.amount;
      account.lastCommissionDate = commissionData.date;
      account.lastUpdated = new Date();

      await this.recalculateBalance(account);
      try {
        await account.save();
      } catch (e: any) {
        // In case of a race, unique index on (agentId, transactions.type, transactions.reference) will throw here
        if (e && e.code === 11000) {
          logger.warn(`Duplicate commission prevented by unique index for agent ${agentId}, ref "${commissionData.reference}".`);
          return await AgentAccount.findOne({ agentId }).lean() as unknown as IAgentAccount;
        }
        throw e;
      }

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
      // Use integer cents to prevent rounding drift
      let balanceCents = 0;
      let commissionCents = 0;
      let payoutCents = 0;
      let penaltyCents = 0;

      // Sort transactions by date
      const sortedTransactions = account.transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      for (const transaction of sortedTransactions) {
        const amountCents = Math.round((transaction.amount || 0) * 100);
        const isCompleted = transaction.status === 'completed';
        if (transaction.type === 'commission' && isCompleted) {
          commissionCents += amountCents;
          balanceCents += amountCents;
        } else if (transaction.type === 'payout' && isCompleted) {
          payoutCents += amountCents;
          balanceCents -= amountCents;
        } else if (transaction.type === 'penalty' && isCompleted) {
          penaltyCents += amountCents;
          balanceCents -= amountCents;
        }
        transaction.runningBalance = Number((balanceCents / 100).toFixed(2));
      }
      
      account.totalCommissions = Number((commissionCents / 100).toFixed(2));
      account.totalPayouts = Number((payoutCents / 100).toFixed(2));
      account.totalPenalties = Number((penaltyCents / 100).toFixed(2));
      account.runningBalance = Number((balanceCents / 100).toFixed(2));
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
      let updatedAccount = await this.getOrCreateAgentAccount(agentId);
      
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

      // Defensive guarantee: for each payment visible in Commission Summary, ensure a matching
      // commission transaction exists in the ledger for THIS agent. If missing, sync that payment.
      try {
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
            }
          } else {
            // Non-split (rentals and non-development sales)
            const ref = pid;
            if (!txByRef.has(ref)) needsSync.push(pid);
          }
        }
        // Deduplicate and sync each missing payment lazily
        if (needsSync.length > 0) {
          const uniq = Array.from(new Set(needsSync));
          console.log(`Backfilling ${uniq.length} missing commission transactions for agent ${agentId}`);
          for (const pid of uniq) {
            try {
              await this.syncCommissionForPayment(pid);
            } catch (e) {
              console.warn(`Failed to backfill commission for payment ${pid}:`, (e as any)?.message || e);
            }
          }
          // Refresh account after backfill
          updatedAccount = await this.getOrCreateAgentAccount(agentId);
        }
      } catch (defErr) {
        console.warn('Defensive commission backfill encountered an error (non-fatal):', defErr);
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

      // For each agent, sync commission transactions (covers rentals and sales, including split roles),
      // then fetch the updated account to ensure totals and balances are current for the list view.
      const accounts = await Promise.all(agentIds.map(async (agentObjectId) => {
        const id = agentObjectId.toString();
        try {
          await this.syncCommissionTransactions(id);
        } catch (e) {
          logger.warn(`Failed to sync commissions for agent ${id} (non-fatal):`, e);
        }
        return await this.getOrCreateAgentAccount(id);
      }));

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
        paymentType: { $in: ['rental', 'sale', 'introduction'] as any },
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
            // Only dedupe on exact same paymentId. This allows multiple installments
            // that share the same textual reference to each create their own entry.
            const samePayment = String((t as any).paymentId || '') === String((payment as any)._id || '');
            if (!samePayment) return false;
            // For split sales, also ensure we dedupe per role lane
            if (isSalesSplit) {
              return String(t.reference || '').endsWith(`-${roleLabel}`);
            }
            return true;
          });
          
          if (!existingTransaction) {
            // Try to match a legacy entry without paymentId using reference/description/amount (backfill paymentId instead of adding)
            const amountsEqual = (a: number, b: number) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;
            const legacyMatch = account.transactions.find(t => {
              if (t.type !== 'commission') return false;
              if ((t as any).paymentId) return false;
              if (!amountsEqual(t.amount, applicableAmount)) return false;
              const ref = String(t.reference || '');
              const desc = String(t.description || '');
              if (isSalesSplit) {
                // Must match role-qualified reference for split lanes
                return ref === uniqueRef || desc.includes(uniqueRef);
              }
              // Non-split (rentals/introductions): allow base reference or description includes baseRef
              return ref === baseRef || desc.includes(baseRef);
            });

            if (legacyMatch) {
              // Backfill paymentId and normalize reference; do not create a new transaction
              (legacyMatch as any).paymentId = (payment as any)._id;
              if (isSalesSplit) {
                legacyMatch.reference = uniqueRef;
                legacyMatch.description = `Commission (${roleLabel}) from payment ${baseRef}`;
              } else if (!legacyMatch.reference) {
                legacyMatch.reference = baseRef;
              }
              account.lastCommissionDate = (payment as any).paymentDate;
              // Continue to next payment without incrementing newTransactionsAdded
              continue;
            }

            // Add commission transaction
            // For rentals/introductions: keep legacy description to prevent duplicates.
            const description = isSalesSplit
              ? `Commission (${roleLabel}) from payment ${baseRef}`
              : `Commission from payment ${baseRef}`;
            const transaction: Transaction = {
              type: 'commission',
              amount: applicableAmount,
              date: (payment as any).paymentDate,
              paymentId: (payment as any)._id,
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

      // Strong de-duplication pass:
      // - For commission entries WITH paymentId: keep one per (paymentId, role), prefer latest date
      // - For commission entries WITHOUT paymentId: keep at most one per (normalizedRef, role, amountCents),
      //   and drop any that collide with an existing paymentId-backed (paymentId, role)
      {
        const inferRole = (ref: string): 'owner' | 'collaborator' | 'agent' => {
          const r = (ref || '').toLowerCase();
          if (r.endsWith('-owner')) return 'owner';
          if (r.endsWith('-collaborator')) return 'collaborator';
          return 'agent';
        };
        const normalizeRef = (ref: string) => (ref || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const nonCommission: Transaction[] = [];
        const commissions: Transaction[] = [];
        for (const t of account.transactions) {
          if (t.type === 'commission') commissions.push(t); else nonCommission.push(t);
        }
        const keepByPidRole: Record<string, Transaction> = Object.create(null);
        const legacyBuckets: Record<string, Transaction[]> = Object.create(null);
        // Partition into paymentId-backed and legacy buckets
        for (const t of commissions) {
          const ref = String(t.reference || '');
          const role = inferRole(ref);
          if ((t as any).paymentId) {
            const key = `${String((t as any).paymentId)}:${role}`;
            const existing = keepByPidRole[key];
            if (!existing || new Date(t.date).getTime() >= new Date(existing.date).getTime()) {
              keepByPidRole[key] = t;
            }
          } else {
            const amtCents = Math.round(Number(t.amount || 0) * 100);
            const bucketKey = `${normalizeRef(ref)}:${role}:${amtCents}`;
            if (!legacyBuckets[bucketKey]) legacyBuckets[bucketKey] = [];
            legacyBuckets[bucketKey].push(t);
          }
        }
        // Build final list: start with paymentId-backed kept entries
        const finalCommissions: Transaction[] = Object.values(keepByPidRole);
        // For each legacy bucket, keep only one if there is no payment-backed entry that would cover it
        for (const bucketKey of Object.keys(legacyBuckets)) {
          const list = legacyBuckets[bucketKey];
          if (list.length === 0) continue;
          // If any item in bucket has a paymentId already (shouldn't be here), skip bucket
          // Otherwise, retain the earliest by date
          const chosen = list.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
          // Determine role from chosen reference and check if a paymentId-backed entry with same role exists
          const role = inferRole(String(chosen.reference || ''));
          // We cannot link to a specific paymentId here; if any payment-backed entry exists with same role and similar reference,
          // assume coverage and drop legacy. Otherwise keep single legacy.
          const anyPidSameRole = finalCommissions.some(t => inferRole(String(t.reference || '')) === role);
          if (!anyPidSameRole) {
            finalCommissions.push(chosen);
          }
        }
        // Reassemble final transactions list
        account.transactions = [...nonCommission, ...finalCommissions]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }

      // Always recalc and save to ensure running balance and timestamps stay current
      await this.recalculateBalance(account);
      await account.save();
      console.log(`Commission sync complete for agent ${agentId}; new transactions added: ${newTransactionsAdded}`);
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
        role: { $in: ['agent', 'sales'] }
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
