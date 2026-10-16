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
const companyAccountExpenseService_1 = require("../services/companyAccountExpenseService");
const getCompanyAccountSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(403).json({ message: 'Company context required' });
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
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(403).json({ message: 'Company context required' });
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        const userCompany = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        const bodyCompany = (_b = req.body) === null || _b === void 0 ? void 0 : _b.companyId;
        if (userCompany && bodyCompany && String(userCompany) !== String(bodyCompany)) {
            return res.status(403).json({ message: 'Company context does not match this expense' });
        }
        const companyId = userCompany || bodyCompany;
        if (!companyId) {
            return res.status(400).json({ message: 'companyId is required' });
        }
        const idempotencyKey = String(req.get('Idempotency-Key') || ((_c = req.body) === null || _c === void 0 ? void 0 : _c.idempotencyKey) || '').trim();
        const result = yield (0, companyAccountExpenseService_1.recordCompanyAccountExpense)({
            companyId: String(companyId),
            type: (_d = req.body) === null || _d === void 0 ? void 0 : _d.type,
            amount: Number((_e = req.body) === null || _e === void 0 ? void 0 : _e.amount),
            date: (_f = req.body) === null || _f === void 0 ? void 0 : _f.date,
            description: (_g = req.body) === null || _g === void 0 ? void 0 : _g.description,
            category: (_h = req.body) === null || _h === void 0 ? void 0 : _h.category,
            reference: (_j = req.body) === null || _j === void 0 ? void 0 : _j.reference,
            paymentMethod: (_k = req.body) === null || _k === void 0 ? void 0 : _k.paymentMethod,
            currency: (_l = req.body) === null || _l === void 0 ? void 0 : _l.currency,
            payee: (_m = req.body) === null || _m === void 0 ? void 0 : _m.payee,
            idempotencyKey: idempotencyKey || undefined,
            processedBy: ((_o = req.user) === null || _o === void 0 ? void 0 : _o.userId) ? String(req.user.userId) : undefined
        });
        return res.status(result.reused ? 200 : 201).json({
            message: result.reused ? 'Existing transaction returned' : 'Transaction recorded',
            account: result.account,
            transaction: result.transaction,
            reused: result.reused
        });
    }
    catch (err) {
        const status = err instanceof companyAccountExpenseService_1.CompanyExpenseIdempotencyError ? 409 : Number(err === null || err === void 0 ? void 0 : err.statusCode) || 500;
        return res.status(status).json({ message: err.message || 'Failed to create company transaction', code: err === null || err === void 0 ? void 0 : err.code });
    }
});
exports.createCompanyTransaction = createCompanyTransaction;
