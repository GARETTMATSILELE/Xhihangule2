"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const TransactionSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.ObjectId,
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
PropertyAccountSchema.pre('save', function (next) {
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
exports.default = database_1.accountingConnection.model('PropertyAccount', PropertyAccountSchema, 'propertyaccounts');
