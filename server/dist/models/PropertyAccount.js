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
    // Soft-archive flag to keep immutable history while excluding from uniqueness and queries
    isArchived: {
        type: Boolean,
        default: false
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
// Ensure each paymentId is only recorded once per property ledger
PropertyAccountSchema.index({ propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 }, { unique: true, sparse: true });
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
// Guard helper to detect illegal update operators/paths that would mutate history
function isIllegalLedgerMutation(update, rootArrays) {
    const illegalSetters = ['$set', '$unset', '$inc'];
    const illegalRemovers = ['$pull', '$pullAll', '$pop'];
    const allowedAppends = ['$push', '$addToSet'];
    const startsWithAny = (k, prefixes) => prefixes.some(p => k === p || k.startsWith(`${p}.`) || k.startsWith(`${p}.$`));
    // Allow-list: status transitions on ownerPayouts via positional operator are permitted
    const isAllowedSetPath = (path) => {
        // Allow ownerPayouts.$.status and ownerPayouts.$.updatedAt (including array filter variants like $[elem])
        return /^ownerPayouts\.\$(?:\[[^\]]+\])?\.(status|updatedAt)$/.test(path);
    };
    // Block setters on nested transaction/payout fields
    for (const op of illegalSetters) {
        const payload = update[op];
        if (!payload || typeof payload !== 'object')
            continue;
        for (const path of Object.keys(payload)) {
            if (isAllowedSetPath(path))
                continue;
            if (startsWithAny(path, rootArrays))
                return true;
        }
    }
    // Block removals from the arrays entirely
    for (const op of illegalRemovers) {
        const payload = update[op];
        if (!payload || typeof payload !== 'object')
            continue;
        for (const path of Object.keys(payload)) {
            if (startsWithAny(path, rootArrays))
                return true;
        }
    }
    // Allow only root-level appends to the arrays. Block nested $push/$addToSet.
    for (const op of allowedAppends) {
        const payload = update[op];
        if (!payload || typeof payload !== 'object')
            continue;
        for (const path of Object.keys(payload)) {
            // Only allow direct root paths (e.g., 'transactions' or 'ownerPayouts')
            if (!rootArrays.includes(path))
                return true;
        }
    }
    return false;
}
// Block any history rewrites on updates (immutability enforcement)
PropertyAccountSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
    var _a, _b;
    try {
        const update = ((_b = (_a = this).getUpdate) === null || _b === void 0 ? void 0 : _b.call(_a)) || {};
        const illegal = isIllegalLedgerMutation(update, ['transactions', 'ownerPayouts']);
        if (illegal) {
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
