import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface Transaction {
  _id?: Types.ObjectId;
  type: 'commission' | 'payout' | 'penalty' | 'adjustment';
  amount: number;
  date: Date;
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

export const AgentAccount = mongoose.model<IAgentAccount>('AgentAccount', agentAccountSchema, COLLECTIONS.AGENT_ACCOUNTS);


