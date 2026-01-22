"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyAccount = void 0;
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const CompanyTransactionSchema = new mongoose_1.Schema({
    type: { type: String, enum: ['income', 'expense'], required: true },
    source: { type: String, enum: ['rental_commission', 'sales_commission', 'other'], required: false },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    currency: { type: String, required: false, default: 'USD' },
    paymentMethod: { type: String, required: false },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, required: false },
    referenceNumber: { type: String },
    description: { type: String },
    processedBy: { type: mongoose_1.Schema.Types.ObjectId, required: false },
    notes: { type: String },
    isArchived: { type: Boolean, default: false },
}, { timestamps: true });
const CompanyAccountSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    transactions: { type: [CompanyTransactionSchema], default: [] },
    runningBalance: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    lastUpdated: { type: Date },
}, { timestamps: true });
CompanyAccountSchema.index({ companyId: 1, 'transactions.date': -1 });
// Prevent double-posting the same payment into company ledger (ignore archived duplicates)
CompanyAccountSchema.index({ companyId: 1, 'transactions.paymentId': 1 }, { unique: true, partialFilterExpression: { 'transactions.isArchived': { $ne: true } } });
// Immutability guard for update operations
function isIllegalCompanyLedgerMutation(update) {
    const illegalSetters = ['$set', '$unset', '$inc'];
    const illegalRemovers = ['$pull', '$pullAll', '$pop'];
    const allowedAppends = ['$push', '$addToSet'];
    const root = 'transactions';
    const startsWithRoot = (k) => k === root || k.startsWith(`${root}.`) || k.startsWith(`${root}.$`);
    for (const op of illegalSetters) {
        const payload = update[op];
        if (!payload)
            continue;
        for (const path of Object.keys(payload)) {
            if (startsWithRoot(path))
                return true;
        }
    }
    for (const op of illegalRemovers) {
        const payload = update[op];
        if (!payload)
            continue;
        for (const path of Object.keys(payload)) {
            if (startsWithRoot(path))
                return true;
        }
    }
    for (const op of allowedAppends) {
        const payload = update[op];
        if (!payload)
            continue;
        for (const path of Object.keys(payload)) {
            if (path !== root)
                return true; // only allow appending at root transactions
        }
    }
    return false;
}
CompanyAccountSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
    var _a, _b;
    try {
        const update = ((_b = (_a = this).getUpdate) === null || _b === void 0 ? void 0 : _b.call(_a)) || {};
        if (isIllegalCompanyLedgerMutation(update)) {
            return next(new Error('CompanyAccount ledger is immutable. Use correction entries; do not mutate or delete history.'));
        }
        return next();
    }
    catch (e) {
        return next(e);
    }
});
exports.CompanyAccount = database_1.accountingConnection.model('CompanyAccount', CompanyAccountSchema, 'companyaccounts');
