"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyExpenseClaim = void 0;
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const CompanyExpenseClaimSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, required: true },
    idempotencyKey: { type: String, required: true },
    fingerprint: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    reference: { type: String, required: false },
    description: { type: String, required: false },
    transactionId: { type: mongoose_1.Schema.Types.ObjectId, required: false },
    status: { type: String, enum: ['claimed', 'appending', 'posted', 'post_failed'], default: 'claimed' }
}, { timestamps: true });
CompanyExpenseClaimSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, name: 'company_expense_claim_identity' });
exports.CompanyExpenseClaim = database_1.accountingConnection.model('CompanyExpenseClaim', CompanyExpenseClaimSchema, 'companyexpenseclaims');
