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
exports.createCompanyTransaction = exports.getCompanyTransactions = exports.getCompanyAccountSummary = void 0;
const CompanyAccount_1 = require("../models/CompanyAccount");
const getCompanyAccountSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'companyId is required' });
        }
        const account = yield CompanyAccount_1.CompanyAccount.findOne({ companyId });
        if (!account) {
            return res.json({ runningBalance: 0, totalIncome: 0, totalExpenses: 0 });
        }
        res.json({ runningBalance: account.runningBalance, totalIncome: account.totalIncome, totalExpenses: account.totalExpenses });
    }
    catch (err) {
        res.status(500).json({ message: err.message || 'Failed to fetch company account summary' });
    }
});
exports.getCompanyAccountSummary = getCompanyAccountSummary;
const getCompanyTransactions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'companyId is required' });
        }
        const account = yield CompanyAccount_1.CompanyAccount.findOne({ companyId });
        const transactions = ((account === null || account === void 0 ? void 0 : account.transactions) || []).filter((t) => (t === null || t === void 0 ? void 0 : t.isArchived) !== true);
        res.json({ transactions, runningBalance: (account === null || account === void 0 ? void 0 : account.runningBalance) || 0 });
    }
    catch (err) {
        res.status(500).json({ message: err.message || 'Failed to fetch company transactions' });
    }
});
exports.getCompanyTransactions = getCompanyTransactions;
const createCompanyTransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.body.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'companyId is required' });
        }
        const { type = 'expense', amount, date, description, category, reference, paymentMethod, currency } = req.body || {};
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }
        const now = new Date();
        // Find or create company account
        let account = yield CompanyAccount_1.CompanyAccount.findOne({ companyId });
        if (!account) {
            account = new CompanyAccount_1.CompanyAccount({ companyId, transactions: [], runningBalance: 0, totalIncome: 0, totalExpenses: 0 });
        }
        // Normalize transaction
        const tx = {
            type: type === 'income' ? 'income' : 'expense',
            amount,
            date: date ? new Date(date) : now,
            description: description || undefined,
            category: category || undefined,
            referenceNumber: reference || undefined,
            paymentMethod: paymentMethod || undefined,
            currency: currency || 'USD',
            processedBy: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) ? req.user.userId : undefined,
            createdAt: now,
            updatedAt: now
        };
        account.transactions.push(tx);
        if (tx.type === 'income') {
            account.totalIncome = (account.totalIncome || 0) + amount;
            account.runningBalance = (account.runningBalance || 0) + amount;
        }
        else {
            account.totalExpenses = (account.totalExpenses || 0) + amount;
            account.runningBalance = (account.runningBalance || 0) - amount;
        }
        account.lastUpdated = now;
        yield account.save();
        return res.status(201).json({ message: 'Transaction recorded', account, transaction: tx });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || 'Failed to create company transaction' });
    }
});
exports.createCompanyTransaction = createCompanyTransaction;
