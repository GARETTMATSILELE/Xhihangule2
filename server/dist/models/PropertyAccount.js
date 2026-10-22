"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const ledgerMutationPolicy_1 = require("../services/ledgerMutationPolicy");
const TransactionSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Payment'
    },
    reversesPaymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.Mixed
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
        type: mongoose_1.Schema.Types.ObjectId,
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
const PassThroughTransactionSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: ['collection', 'payment', 'adjustment', 'collection_reversal'],
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Payment'
    },
    levyPaymentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'LevyPayment'
    },
    chargeTypeCode: {
        type: String,
        required: false,
        uppercase: true,
        trim: true
    },
    chargeTypeId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ChargeType',
        required: false
    },
    idempotencyKey: {
        type: String
    },
    reversesIdempotencyKey: {
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
        type: mongoose_1.Schema.Types.ObjectId,
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
const PassThroughAccountSchema = new mongoose_1.Schema({
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
const OwnerPayoutSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipientId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
const PropertyAccountSchema = new mongoose_1.Schema({
    propertyId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.ObjectId,
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
PropertyAccountSchema.index({ propertyId: 1, ledgerType: 1 }, { unique: true, partialFilterExpression: { isArchived: false } });
// Accelerate list queries that filter by propertyId and sort by lastUpdated
PropertyAccountSchema.index({ propertyId: 1, lastUpdated: -1 });
// Speed up lookups by embedded transaction paymentId
PropertyAccountSchema.index({ 'transactions.paymentId': 1 });
PropertyAccountSchema.index({ ownerId: 1 });
PropertyAccountSchema.index({ 'transactions.date': -1 });
PropertyAccountSchema.index({ 'ownerPayouts.date': -1 });
PropertyAccountSchema.index({ runningBalance: 1 });
// Ensure reference numbers are unique per property and ledger across owner payouts (sparse to ignore nulls)
PropertyAccountSchema.index({ propertyId: 1, ledgerType: 1, 'ownerPayouts.referenceNumber': 1 }, { unique: true, sparse: true });
// Lookup only. Unique-on-paymentId is unsafe: income and configured_expense share paymentId.
// The unique identity is transactions.idempotencyKey (declared below).
PropertyAccountSchema.index({ propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 }, { unique: false, sparse: true });
// Optional idempotency unique guards for transactions and payouts when a key is provided
PropertyAccountSchema.index({ propertyId: 1, ledgerType: 1, 'transactions.idempotencyKey': 1 }, {
    unique: true,
    sparse: true,
    partialFilterExpression: {
        'transactions.idempotencyKey': { $exists: true, $type: 'string' }
    }
});
PropertyAccountSchema.index({ propertyId: 1, ledgerType: 1, 'ownerPayouts.idempotencyKey': 1 }, {
    unique: true,
    sparse: true,
    partialFilterExpression: {
        'ownerPayouts.idempotencyKey': { $exists: true, $type: 'string' }
    }
});
// Block amount/history rewrites. Status cancellation and nested pass-through appends are allowed.
PropertyAccountSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
    var _a, _b;
    try {
        const update = ((_b = (_a = this).getUpdate) === null || _b === void 0 ? void 0 : _b.call(_a)) || {};
        if ((0, ledgerMutationPolicy_1.isIllegalPropertyAccountMutation)(update)) {
            return next(new Error('PropertyAccount ledger is immutable. Use correction entries; do not mutate or delete history.'));
        }
        return next();
    }
    catch (e) {
        return next(e);
    }
});
// Prevent deletion of ledgers that contain any history
function guardPropertyAccountDeletion(next) {
    return __awaiter(this, void 0, void 0, function* () {
        // Tight policy: property account ledgers are never deletable
        return next(new Error('Deletion of PropertyAccount ledgers is disabled. Ledgers are permanent.'));
    });
}
PropertyAccountSchema.pre('deleteOne', { document: true, query: false }, guardPropertyAccountDeletion);
PropertyAccountSchema.pre('deleteOne', guardPropertyAccountDeletion);
PropertyAccountSchema.pre('deleteMany', guardPropertyAccountDeletion);
PropertyAccountSchema.pre('findOneAndDelete', guardPropertyAccountDeletion);
// Pre-save middleware to update totals
PropertyAccountSchema.pre('save', function (next) {
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
    passThroughAccounts.forEach((account) => {
        const entries = Array.isArray(account.transactions) ? account.transactions : [];
        const grossCollected = entries
            .filter((t) => t.type === 'collection' && t.status === 'completed')
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const reversedCollected = entries
            .filter((t) => t.type === 'collection_reversal' && t.status === 'completed')
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const collected = grossCollected - reversedCollected;
        const paid = entries
            .filter((t) => t.type === 'payment' && t.status === 'completed')
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);
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
exports.default = database_1.accountingConnection.model('PropertyAccount', PropertyAccountSchema, 'propertyaccounts');
