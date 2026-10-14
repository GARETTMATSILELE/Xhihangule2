import { Schema, Document, Types } from 'mongoose';
import { accountingConnection } from '../config/database';
import { isIllegalPropertyAccountMutation } from '../services/ledgerMutationPolicy';

export type TransactionCategory =
  | 'RENT'
  | 'PASS_THROUGH'
  | 'MAINTENANCE'
  | 'OWNER_PAYOUT'
  | 'COMMISSION'
  | 'OPENING_BALANCE'
  | 'DEPOSIT'
  | 'OTHER';

export type AccountingTreatment =
  | 'PROPERTY_INCOME'
  | 'PROPERTY_EXPENSE'
  | 'PASS_THROUGH'
  | 'OWNER_WITHDRAWAL'
  | 'LIABILITY'
  | 'CAPITAL'
  | 'SYSTEM';

export type PassThroughChargeType =
  | 'LEVY'
  | 'WATER'
  | 'ELECTRICITY'
  | 'RATES'
  | 'SECURITY'
  | 'INSURANCE'
  | 'MUNICIPAL'
  | 'OTHER'
  | string;

/**
 * SECURITY NOTE
 *  - Property account transactions represent an immutable ledger.
 *  - We explicitly block any in-place mutation of existing array elements.
 *  - Only appends (adding new transactions/payouts) are allowed via $push/$addToSet
 *    on the root array paths. Any $set/$unset/$pull on nested paths is rejected.
 */
export interface Transaction {
  _id?: Types.ObjectId;
  type: 'income' | 'expense' | 'owner_payout' | 'repair' | 'maintenance' | 'opening_balance' | 'other';
  amount: number;
  date: Date;
  paymentId?: Types.ObjectId;
  reversesPaymentId?: Types.ObjectId;
  idempotencyKey?: string;
  description: string;
  category?: string;
  transactionCategory?: TransactionCategory;
  accountingTreatment?: AccountingTreatment;
  chargeTypeCode?: string;
  chargeTypeId?: Types.ObjectId;
  passThroughType?: PassThroughChargeType;
  direction?: 'credit' | 'debit';
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

export interface PassThroughTransaction {
  _id?: Types.ObjectId;
  type: 'collection' | 'payment' | 'adjustment';
  amount: number;
  date: Date;
  paymentId?: Types.ObjectId;
  levyPaymentId?: Types.ObjectId;
  chargeTypeCode?: string;
  chargeTypeId?: Types.ObjectId;
  idempotencyKey?: string;
  description: string;
  referenceNumber?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PassThroughAccount {
  type: PassThroughChargeType;
  label?: string;
  runningBalance: number;
  totalCollected: number;
  totalPaid: number;
  transactions: PassThroughTransaction[];
  lastUpdated?: Date;
}

export interface OwnerPayout {
  _id?: Types.ObjectId;
  amount: number;
  date: Date;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  referenceNumber: string;
  idempotencyKey?: string;
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
  ledgerType: 'rental' | 'sale';
  propertyName?: string;
  propertyAddress?: string;
  ownerId?: Types.ObjectId;
  ownerName?: string;
  transactions: Transaction[];
  passThroughAccounts?: PassThroughAccount[];
  ownerPayouts: OwnerPayout[];
  runningBalance: number;
  totalIncome: number;
  totalExpenses: number;
  totalOwnerPayouts: number;
  passThroughOutstanding?: number;
  passThroughCollected?: number;
  passThroughPaid?: number;
  netOwnerBalance?: number;
  lastIncomeDate?: Date;
  lastExpenseDate?: Date;
  lastPayoutDate?: Date;
  isArchived?: boolean;
  isActive: boolean;
  ledgerRevision?: number;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<Transaction>({
  type: { 
    type: String, 
    enum: ['income', 'expense', 'owner_payout', 'repair', 'maintenance', 'opening_balance', 'other'], 
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
  reversesPaymentId: {
    type: Schema.Types.ObjectId,
    ref: 'Payment'
  },
  idempotencyKey: {
    type: String
  },
  description: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String 
  },
  transactionCategory: {
    type: String,
    enum: ['RENT', 'PASS_THROUGH', 'MAINTENANCE', 'OWNER_PAYOUT', 'COMMISSION', 'OPENING_BALANCE', 'DEPOSIT', 'OTHER'],
    required: false
  },
  accountingTreatment: {
    type: String,
    enum: ['PROPERTY_INCOME', 'PROPERTY_EXPENSE', 'PASS_THROUGH', 'OWNER_WITHDRAWAL', 'LIABILITY', 'CAPITAL', 'SYSTEM'],
    required: false
  },
  chargeTypeCode: {
    type: String,
    required: false,
    uppercase: true,
    trim: true
  },
  chargeTypeId: {
    type: Schema.Types.ObjectId,
    ref: 'ChargeType',
    required: false
  },
  passThroughType: {
    type: String,
    required: false
  },
  direction: {
    type: String,
    enum: ['credit', 'debit']
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

const PassThroughTransactionSchema = new Schema<PassThroughTransaction>({
  type: {
    type: String,
    enum: ['collection', 'payment', 'adjustment'],
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
  levyPaymentId: {
    type: Schema.Types.ObjectId,
    ref: 'LevyPayment'
  },
  chargeTypeCode: {
    type: String,
    required: false,
    uppercase: true,
    trim: true
  },
  chargeTypeId: {
    type: Schema.Types.ObjectId,
    ref: 'ChargeType',
    required: false
  },
  idempotencyKey: {
    type: String
  },
  description: {
    type: String,
    required: true
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
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const PassThroughAccountSchema = new Schema<PassThroughAccount>({
  type: {
    type: String,
    required: true
  },
  label: {
    type: String
  },
  runningBalance: {
    type: Number,
    default: 0
  },
  totalCollected: {
    type: Number,
    default: 0
  },
  totalPaid: {
    type: Number,
    default: 0
  },
  transactions: [PassThroughTransactionSchema],
  lastUpdated: {
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
  idempotencyKey: {
    type: String
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
    required: true
  },
  ledgerType: {
    type: String,
    enum: ['rental', 'sale'],
    required: true
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
  passThroughAccounts: [PassThroughAccountSchema],
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
  passThroughOutstanding: {
    type: Number,
    default: 0
  },
  passThroughCollected: {
    type: Number,
    default: 0
  },
  passThroughPaid: {
    type: Number,
    default: 0
  },
  netOwnerBalance: {
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
  // Soft-archive flag to keep immutable history while excluding from uniqueness and queries
  isArchived: {
    type: Boolean,
    default: false
  },
  ledgerRevision: {
    type: Number,
    default: 0
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// Indexes for better query performance
// Enforce uniqueness only for non-archived ledgers (partial index)
PropertyAccountSchema.index(
  { propertyId: 1, ledgerType: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } }
);
// Accelerate list queries that filter by propertyId and sort by lastUpdated
PropertyAccountSchema.index({ propertyId: 1, lastUpdated: -1 });
// Speed up lookups by embedded transaction paymentId
PropertyAccountSchema.index({ 'transactions.paymentId': 1 });
PropertyAccountSchema.index({ ownerId: 1 });
PropertyAccountSchema.index({ 'transactions.date': -1 });
PropertyAccountSchema.index({ 'ownerPayouts.date': -1 });
PropertyAccountSchema.index({ runningBalance: 1 });
// Ensure reference numbers are unique per property and ledger across owner payouts (sparse to ignore nulls)
PropertyAccountSchema.index(
  { propertyId: 1, ledgerType: 1, 'ownerPayouts.referenceNumber': 1 },
  { unique: true, sparse: true }
);
// Lookup only. Unique-on-paymentId is unsafe: income and configured_expense share paymentId.
// The unique identity is transactions.idempotencyKey (declared below).
PropertyAccountSchema.index(
  { propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 },
  { unique: false, sparse: true }
);
// Optional idempotency unique guards for transactions and payouts when a key is provided
PropertyAccountSchema.index(
  { propertyId: 1, ledgerType: 1, 'transactions.idempotencyKey': 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      'transactions.idempotencyKey': { $exists: true, $type: 'string' }
    }
  }
);
PropertyAccountSchema.index(
  { propertyId: 1, ledgerType: 1, 'ownerPayouts.idempotencyKey': 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      'ownerPayouts.idempotencyKey': { $exists: true, $type: 'string' }
    }
  }
);

// Block amount/history rewrites. Status cancellation and nested pass-through appends are allowed.
PropertyAccountSchema.pre(['updateOne','updateMany','findOneAndUpdate'], function(next) {
  try {
    const update = (this as any).getUpdate?.() || {};
    if (isIllegalPropertyAccountMutation(update)) {
      return next(new Error('PropertyAccount ledger is immutable. Use correction entries; do not mutate or delete history.'));
    }
    return next();
  } catch (e) {
    return next(e as any);
  }
});

// Prevent deletion of ledgers that contain any history
async function guardPropertyAccountDeletion(this: any, next: (err?: any) => void) {
  // Tight policy: property account ledgers are never deletable
  return next(new Error('Deletion of PropertyAccount ledgers is disabled. Ledgers are permanent.'));
}

PropertyAccountSchema.pre('deleteOne', { document: true, query: false }, guardPropertyAccountDeletion);
PropertyAccountSchema.pre('deleteOne', guardPropertyAccountDeletion as any);
PropertyAccountSchema.pre('deleteMany', guardPropertyAccountDeletion as any);
PropertyAccountSchema.pre('findOneAndDelete', guardPropertyAccountDeletion as any);

// Pre-save middleware to update totals
PropertyAccountSchema.pre('save', function(next) {
  // Calculate totals from transactions
  this.totalIncome = this.transactions
    .filter(t => t.type === 'income' && t.status === 'completed' && !['PASS_THROUGH', 'LIABILITY', 'CAPITAL'].includes(String(t.accountingTreatment || '')))
    .reduce((sum, t) => sum + t.amount, 0);
  
  this.totalExpenses = this.transactions
    .filter(t => t.type !== 'income' && t.type !== 'opening_balance' && t.status === 'completed' && !['PASS_THROUGH', 'LIABILITY', 'CAPITAL'].includes(String(t.accountingTreatment || '')))
    .reduce((sum, t) => sum + t.amount, 0);
  
  this.totalOwnerPayouts = this.ownerPayouts
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  
  const openingBalance = this.transactions
    .filter(t => t.type === 'opening_balance' && t.status === 'completed')
    .reduce((sum, t) => sum + (t.direction === 'debit' ? -t.amount : t.amount), 0);

  const passThroughAccounts = Array.isArray(this.passThroughAccounts) ? this.passThroughAccounts : [];
  let passThroughCollected = 0;
  let passThroughPaid = 0;
  passThroughAccounts.forEach((account: any) => {
    const entries = Array.isArray(account.transactions) ? account.transactions : [];
    const collected = entries
      .filter((t: any) => t.type === 'collection' && t.status === 'completed')
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const paid = entries
      .filter((t: any) => t.type === 'payment' && t.status === 'completed')
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    account.totalCollected = collected;
    account.totalPaid = paid;
    account.runningBalance = collected - paid;
    passThroughCollected += collected;
    passThroughPaid += paid;
  });
  
  // Calculate running balance. Opening balances affect availability without inflating income/expense totals.
  this.runningBalance = this.totalIncome - this.totalExpenses - this.totalOwnerPayouts + openingBalance;
  this.netOwnerBalance = this.runningBalance;
  this.passThroughCollected = passThroughCollected;
  this.passThroughPaid = passThroughPaid;
  this.passThroughOutstanding = passThroughCollected - passThroughPaid;
  
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