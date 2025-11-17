import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

/**
 * SECURITY NOTE
 *  - Agent account transactions are immutable ledger entries.
 *  - We block any in-place mutation/removal of existing entries.
 *  - Only appends to the root arrays are allowed.
 */
export interface Transaction {
  _id?: Types.ObjectId;
  type: 'commission' | 'payout' | 'penalty' | 'adjustment';
  amount: number;
  date: Date;
  // Optional link to source payment for de-duplication
  paymentId?: Types.ObjectId;
  description: string;
  reference?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  runningBalance?: number;
  notes?: string;
  category?: string;
}

export interface AgentPayout {
  _id?: Types.ObjectId;
  amount: number;
  date: Date;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  recipientId: string;
  recipientName: string;
  referenceNumber: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  notes?: string;
  processedBy?: Types.ObjectId;
  processedAt?: Date;
}

export interface IAgentAccount extends Document {
  agentId: Types.ObjectId;
  agentName?: string;
  agentEmail?: string;
  transactions: Transaction[];
  agentPayouts: AgentPayout[];
  runningBalance: number;
  totalCommissions: number;
  totalPayouts: number;
  totalPenalties: number;
  lastCommissionDate?: Date;
  lastPayoutDate?: Date;
  lastPenaltyDate?: Date;
  isActive: boolean;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<Transaction>({
  type: {
    type: String,
    enum: ['commission', 'payout', 'penalty', 'adjustment'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  description: {
    type: String,
    required: true
  },
  reference: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  runningBalance: {
    type: Number
  },
  notes: {
    type: String
  },
  category: {
    type: String
  }
}, { _id: true });

const agentPayoutSchema = new Schema<AgentPayout>({
  amount: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'cash', 'mobile_money', 'check'],
    required: true
  },
  recipientId: {
    type: String,
    required: true
  },
  recipientName: {
    type: String,
    required: true
  },
  referenceNumber: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  }
}, { _id: true });

const agentAccountSchema = new Schema<IAgentAccount>({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  agentName: {
    type: String
  },
  agentEmail: {
    type: String
  },
  transactions: [transactionSchema],
  agentPayouts: [agentPayoutSchema],
  runningBalance: {
    type: Number,
    default: 0
  },
  totalCommissions: {
    type: Number,
    default: 0
  },
  totalPayouts: {
    type: Number,
    default: 0
  },
  totalPenalties: {
    type: Number,
    default: 0
  },
  lastCommissionDate: {
    type: Date
  },
  lastPayoutDate: {
    type: Date
  },
  lastPenaltyDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
agentAccountSchema.index({ agentId: 1 });
agentAccountSchema.index({ 'transactions.date': -1 });
agentAccountSchema.index({ 'agentPayouts.date': -1 });
agentAccountSchema.index({ 'transactions.paymentId': 1 });
// Enforce no duplicate commission reference per agent
agentAccountSchema.index(
  { agentId: 1, 'transactions.type': 1, 'transactions.reference': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'transactions.type': 'commission',
      'transactions.reference': { $exists: true, $type: 'string', $ne: '' }
    }
  }
);
// Prevent duplicate paymentId-backed entries per agent (commission lane)
agentAccountSchema.index(
  { agentId: 1, 'transactions.paymentId': 1, 'transactions.type': 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      'transactions.type': 'commission',
      'transactions.paymentId': { $exists: true }
    }
  }
);

// Immutability guard for update operations
function isIllegalAgentLedgerMutation(update: Record<string, any>): boolean {
  const illegalSetters = ['$set', '$unset', '$inc'];
  const illegalRemovers = ['$pull', '$pullAll', '$pop'];
  const allowedAppends = ['$push', '$addToSet'];
  const rootArrays = ['transactions', 'agentPayouts'];
  const startsWithAny = (k: string) => rootArrays.some(p => k === p || k.startsWith(`${p}.`) || k.startsWith(`${p}.$`));

  for (const op of illegalSetters) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (startsWithAny(path)) return true;
    }
  }
  for (const op of illegalRemovers) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (startsWithAny(path)) return true;
    }
  }
  for (const op of allowedAppends) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (!rootArrays.includes(path)) return true;
    }
  }
  return false;
}

agentAccountSchema.pre(['updateOne','updateMany','findOneAndUpdate'], function(next) {
  try {
    const update = (this as any).getUpdate?.() || {};
    if (isIllegalAgentLedgerMutation(update)) {
      return next(new Error('AgentAccount ledger is immutable. Use correction entries; do not mutate or delete history.'));
    }
    return next();
  } catch (e) {
    return next(e as any);
  }
});

// Prevent deletion of agent ledgers that contain any history
async function guardAgentAccountDeletion(this: any, next: (err?: any) => void) {
  // Tight policy: agent account ledgers are never deletable
  return next(new Error('Deletion of AgentAccount ledgers is disabled. Ledgers are permanent.'));
}

agentAccountSchema.pre('deleteOne', { document: true, query: false }, guardAgentAccountDeletion);
agentAccountSchema.pre('deleteOne', guardAgentAccountDeletion as any);
agentAccountSchema.pre('deleteMany', guardAgentAccountDeletion as any);
agentAccountSchema.pre('findOneAndDelete', guardAgentAccountDeletion as any);

export const AgentAccount = mongoose.model<IAgentAccount>('AgentAccount', agentAccountSchema, COLLECTIONS.AGENT_ACCOUNTS);


