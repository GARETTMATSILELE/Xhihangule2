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
exports.CompanyAccount = database_1.accountingConnection.model('CompanyAccount', CompanyAccountSchema, 'companyaccounts');
