import { Schema, Document, Types } from 'mongoose';
import { accountingConnection } from '../config/database';

export interface Transaction {
  _id?: Types.ObjectId;
  type: 'income' | 'expense' | 'owner_payout' | 'repair' | 'maintenance' | 'other';
  amount: number;
  date: Date;
  paymentId?: Types.ObjectId;
  description: string;
  category?: string;
  recipientId?: Types.ObjectId | string;
  recipientType?: 'owner' | 'contractor' | 'tenant' | 'other';
  referenceNumber?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy?: Types.ObjectId;
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnerPayout {
  _id?: Types.ObjectId;
  amount: number;
  date: Date;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  referenceNumber: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy: Types.ObjectId;
  recipientId: Types.ObjectId;
  recipientName: string;
  recipientBankDetails?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPropertyAccount extends Document {
  propertyId: Types.ObjectId;
  propertyName?: string;
  propertyAddress?: string;
  ownerId?: Types.ObjectId;
  ownerName?: string;
  transactions: Transaction[];
  ownerPayouts: OwnerPayout[];
  runningBalance: number;
  totalIncome: number;
  totalExpenses: number;
  totalOwnerPayouts: number;
  lastIncomeDate?: Date;
  lastExpenseDate?: Date;
  lastPayoutDate?: Date;
  isActive: boolean;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<Transaction>({
  type: { 
    type: String, 
    enum: ['income', 'expense', 'owner_payout', 'repair', 'maintenance', 'other'], 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0 
  },
  date: { 
    type: Date, 
    required: true,
    default: Date.now 
  },
  paymentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Payment' 
  },
  description: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String 
  },
  recipientId: { 
    type: Schema.Types.Mixed 
  },
  recipientType: { 
    type: String, 
    enum: ['owner', 'contractor', 'tenant', 'other'] 
  },
  referenceNumber: { 
    type: String 
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'cancelled'], 
    default: 'completed' 
  },
  processedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  notes: { 
    type: String 
  },
  attachments: [{ 
    type: String 
  }],
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

const OwnerPayoutSchema = new Schema<OwnerPayout>({
  amount: { 
    type: Number, 
    required: true,
    min: 0 
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
  referenceNumber: { 
    type: String, 
    required: true,
    // uniqueness is enforced via a compound index on the parent schema
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'cancelled'], 
    default: 'pending' 
  },
  processedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  recipientId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  recipientName: { 
    type: String, 
    required: true 
  },
  recipientBankDetails: {
    bankName: String,
    accountNumber: String,
    accountName: String
  },
  notes: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

const PropertyAccountSchema = new Schema<IPropertyAccount>({
  propertyId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Property', 
    required: true, 
    unique: true 
  },
  propertyName: { 
    type: String 
  },
  propertyAddress: { 
    type: String 
  },
  ownerId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  ownerName: { 
    type: String 
  },
  transactions: [TransactionSchema],
  ownerPayouts: [OwnerPayoutSchema],
  runningBalance: { 
    type: Number, 
    default: 0 
  },
  totalIncome: { 
    type: Number, 
    default: 0 
  },
  totalExpenses: { 
    type: Number, 
    default: 0 
  },
  totalOwnerPayouts: { 
    type: Number, 
    default: 0 
  },
  lastIncomeDate: { 
    type: Date 
  },
  lastExpenseDate: { 
    type: Date 
  },
  lastPayoutDate: { 
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

// Indexes for better query performance
PropertyAccountSchema.index({ propertyId: 1 });
PropertyAccountSchema.index({ ownerId: 1 });
PropertyAccountSchema.index({ 'transactions.date': -1 });
PropertyAccountSchema.index({ 'ownerPayouts.date': -1 });
PropertyAccountSchema.index({ runningBalance: 1 });
// Ensure reference numbers are unique per property across owner payouts
PropertyAccountSchema.index({ propertyId: 1, 'ownerPayouts.referenceNumber': 1 }, { unique: true, sparse: true });

// Pre-save middleware to update totals
PropertyAccountSchema.pre('save', function(next) {
  // Calculate totals from transactions
  this.totalIncome = this.transactions
    .filter(t => t.type === 'income' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  
  this.totalExpenses = this.transactions
    .filter(t => t.type !== 'income' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  
  this.totalOwnerPayouts = this.ownerPayouts
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  
  // Calculate running balance
  this.runningBalance = this.totalIncome - this.totalExpenses - this.totalOwnerPayouts;
  
  // Update last dates
  const incomeTransactions = this.transactions.filter(t => t.type === 'income');
  if (incomeTransactions.length > 0) {
    this.lastIncomeDate = new Date(Math.max(...incomeTransactions.map(t => t.date.getTime())));
  }
  
  const expenseTransactions = this.transactions.filter(t => t.type !== 'income');
  if (expenseTransactions.length > 0) {
    this.lastExpenseDate = new Date(Math.max(...expenseTransactions.map(t => t.date.getTime())));
  }
  
  if (this.ownerPayouts.length > 0) {
    this.lastPayoutDate = new Date(Math.max(...this.ownerPayouts.map(p => p.date.getTime())));
  }
  
  this.lastUpdated = new Date();
  next();
});

export default accountingConnection.model<IPropertyAccount>('PropertyAccount', PropertyAccountSchema, 'propertyaccounts'); 