"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const TransactionSchema = new mongoose_1.Schema({
    type: { type: String, enum: ['income', 'expense'], required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment' },
    description: { type: String }
});
const PropertyAccountSchema = new mongoose_1.Schema({
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, unique: true },
    transactions: [TransactionSchema],
    runningBalance: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});
exports.default = database_1.accountingConnection.model('PropertyAccount', PropertyAccountSchema, 'propertyaccounts');
