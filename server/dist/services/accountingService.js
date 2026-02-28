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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const VatRecord_1 = require("../models/VatRecord");
const CompanyBalance_1 = require("../models/CompanyBalance");
const BankAccount_1 = require("../models/BankAccount");
const BankTransaction_1 = require("../models/BankTransaction");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const Payment_1 = require("../models/Payment");
const dashboardKpiService_1 = __importDefault(require("./dashboardKpiService"));
const DEFAULT_ACCOUNTS = [
    { code: '1001', name: 'Main Bank Account', type: 'asset' },
    { code: '1002', name: 'Cash On Hand', type: 'asset' },
    { code: '2101', name: 'VAT Payable', type: 'liability' },
    { code: '2102', name: 'Commission Liability', type: 'liability' },
    { code: '3001', name: 'Retained Earnings', type: 'equity' },
    { code: '4001', name: 'Rental Income', type: 'revenue' },
    { code: '4002', name: 'Sales Income', type: 'revenue' },
    { code: '5001', name: 'Operating Expense', type: 'expense' },
    { code: '5002', name: 'Commission Expense', type: 'expense' },
    { code: '5003', name: 'VAT Expense', type: 'expense' }
];
const toMoney = (value) => Number(Number(value || 0).toFixed(2));
const defaultFilingPeriod = (date) => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};
const toObjectId = (id) => new mongoose_1.default.Types.ObjectId(id);
const ensurePositive = (value) => {
    const n = Number(value || 0);
    return n > 0 ? toMoney(n) : 0;
};
class AccountingService {
    constructor() {
        this.indexesEnsured = false;
        this.dashboardSummaryCache = new Map();
        this.dashboardSummaryInFlight = new Map();
        this.dashboardSummaryTtlMs = Math.max(5000, Number(process.env.ACCOUNTING_DASHBOARD_CACHE_TTL_MS || 15000));
        this.dashboardSummaryStaleMaxAgeMs = Math.max(this.dashboardSummaryTtlMs, Number(process.env.ACCOUNTING_DASHBOARD_STALE_MAX_AGE_MS || 600000));
    }
    isTransientSummaryError(error) {
        const message = String((error === null || error === void 0 ? void 0 : error.message) || '').toLowerCase();
        const name = String((error === null || error === void 0 ? void 0 : error.name) || '').toLowerCase();
        return (name.includes('mongonetwork') ||
            name.includes('mongoserverselection') ||
            message.includes('timed out') ||
            (message.includes('connection') && message.includes('closed')) ||
            message.includes('gateway timeout'));
    }
    ensureIndexes() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.indexesEnsured)
                return;
            yield Promise.all([
                ChartOfAccount_1.ChartOfAccount.collection.createIndex({ companyId: 1, code: 1 }, { unique: true }),
                ChartOfAccount_1.ChartOfAccount.collection.createIndex({ companyId: 1, type: 1 }),
                ChartOfAccount_1.ChartOfAccount.collection.createIndex({ companyId: 1, parentAccountId: 1 }),
                JournalEntry_1.JournalEntry.collection.createIndex({ companyId: 1, transactionDate: -1 }),
                JournalEntry_1.JournalEntry.collection.createIndex({ companyId: 1, sourceModule: 1, transactionDate: -1 }),
                JournalEntry_1.JournalEntry.collection.createIndex({ companyId: 1, reference: 1 }, { unique: true }),
                JournalLine_1.JournalLine.collection.createIndex({ companyId: 1, accountId: 1, createdAt: -1 }),
                JournalLine_1.JournalLine.collection.createIndex({ companyId: 1, journalEntryId: 1 }),
                VatRecord_1.VatRecord.collection.createIndex({ companyId: 1, filingPeriod: 1 }),
                VatRecord_1.VatRecord.collection.createIndex({ companyId: 1, status: 1 }),
                CompanyBalance_1.CompanyBalance.collection.createIndex({ companyId: 1 }, { unique: true }),
                BankTransaction_1.BankTransaction.collection.createIndex({ companyId: 1, bankAccountId: 1, matched: 1 })
            ]);
            this.indexesEnsured = true;
        });
    }
    initializeForCompany(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            yield this.ensureDefaultChartOfAccounts(companyId);
            yield this.ensureCompanyBalance(companyId);
        });
    }
    ensureDefaultChartOfAccounts(companyId, session) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            for (const account of DEFAULT_ACCOUNTS) {
                yield ChartOfAccount_1.ChartOfAccount.updateOne({ companyId: companyObjectId, code: account.code }, {
                    $setOnInsert: {
                        companyId: companyObjectId,
                        code: account.code,
                        name: account.name,
                        type: account.type,
                        balance: 0,
                        currency: 'USD',
                        isActive: true,
                        isDeleted: false
                    }
                }, { upsert: true, session });
            }
        });
    }
    ensureCompanyBalance(companyId, session) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            const id = (0, CompanyBalance_1.getCompanyBalanceId)(companyId);
            yield CompanyBalance_1.CompanyBalance.updateOne({ companyId: companyObjectId }, {
                $setOnInsert: {
                    _id: id,
                    companyId: companyObjectId,
                    totalRevenue: 0,
                    totalExpenses: 0,
                    netProfit: 0,
                    vatPayable: 0,
                    commissionLiability: 0,
                    lastUpdated: new Date()
                }
            }, { upsert: true, session });
        });
    }
    postTransaction(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            const run = (session) => __awaiter(this, void 0, void 0, function* () {
                yield this.ensureDefaultChartOfAccounts(input.companyId, session);
                yield this.ensureCompanyBalance(input.companyId, session);
                const companyObjectId = toObjectId(input.companyId);
                const transactionDate = input.transactionDate || new Date();
                const preparedLines = input.lines.map((line) => ({
                    accountCode: line.accountCode,
                    debit: ensurePositive(line.debit),
                    credit: ensurePositive(line.credit),
                    propertyId: line.propertyId,
                    agentId: line.agentId
                }));
                const totalDebit = toMoney(preparedLines.reduce((sum, line) => sum + line.debit, 0));
                const totalCredit = toMoney(preparedLines.reduce((sum, line) => sum + line.credit, 0));
                if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
                    throw new Error(`Journal is unbalanced. debit=${totalDebit}, credit=${totalCredit}`);
                }
                const accountCodes = Array.from(new Set(preparedLines.map((line) => line.accountCode)));
                const accounts = yield ChartOfAccount_1.ChartOfAccount.find({
                    companyId: companyObjectId,
                    code: { $in: accountCodes },
                    isDeleted: { $ne: true }
                }).session(session || null);
                const accountMap = new Map(accounts.map((account) => [account.code, account]));
                for (const code of accountCodes) {
                    if (!accountMap.has(code)) {
                        throw new Error(`Chart of account not found for code ${code}`);
                    }
                }
                const journalEntry = yield JournalEntry_1.JournalEntry.create([
                    {
                        companyId: companyObjectId,
                        reference: input.reference,
                        description: input.description,
                        sourceModule: input.sourceModule,
                        sourceId: input.sourceId,
                        status: 'posted',
                        transactionDate,
                        createdBy: input.createdBy ? toObjectId(input.createdBy) : undefined
                    }
                ], session ? { session } : undefined);
                const createdEntry = journalEntry[0];
                const journalLinesToInsert = [];
                let deltaRevenue = 0;
                let deltaExpenses = 0;
                let deltaVatPayable = 0;
                let deltaCommissionLiability = 0;
                for (const line of preparedLines) {
                    const account = accountMap.get(line.accountCode);
                    const delta = toMoney(line.debit - line.credit);
                    const nextBalance = toMoney((account.balance || 0) + delta);
                    account.balance = nextBalance;
                    yield account.save(session ? { session } : undefined);
                    if (account.type === 'revenue') {
                        deltaRevenue = toMoney(deltaRevenue + (line.credit - line.debit));
                    }
                    else if (account.type === 'expense') {
                        deltaExpenses = toMoney(deltaExpenses + (line.debit - line.credit));
                    }
                    if (account.code === '2101') {
                        deltaVatPayable = toMoney(deltaVatPayable + (line.credit - line.debit));
                    }
                    if (account.code === '2102') {
                        deltaCommissionLiability = toMoney(deltaCommissionLiability + (line.credit - line.debit));
                    }
                    journalLinesToInsert.push({
                        companyId: companyObjectId,
                        journalEntryId: createdEntry._id,
                        accountId: account._id,
                        debit: line.debit,
                        credit: line.credit,
                        runningBalanceSnapshot: nextBalance,
                        propertyId: line.propertyId ? toObjectId(line.propertyId) : undefined,
                        agentId: line.agentId ? toObjectId(line.agentId) : undefined
                    });
                }
                if (session) {
                    yield JournalLine_1.JournalLine.insertMany(journalLinesToInsert, { session });
                }
                else {
                    yield JournalLine_1.JournalLine.insertMany(journalLinesToInsert);
                }
                const existingBalance = yield CompanyBalance_1.CompanyBalance.findOne({ companyId: companyObjectId }).session(session || null);
                const totalRevenue = toMoney(((existingBalance === null || existingBalance === void 0 ? void 0 : existingBalance.totalRevenue) || 0) + deltaRevenue);
                const totalExpenses = toMoney(((existingBalance === null || existingBalance === void 0 ? void 0 : existingBalance.totalExpenses) || 0) + deltaExpenses);
                const vatPayable = toMoney(((existingBalance === null || existingBalance === void 0 ? void 0 : existingBalance.vatPayable) || 0) + deltaVatPayable);
                const commissionLiability = toMoney(((existingBalance === null || existingBalance === void 0 ? void 0 : existingBalance.commissionLiability) || 0) + deltaCommissionLiability);
                yield CompanyBalance_1.CompanyBalance.updateOne({ companyId: companyObjectId }, {
                    $set: {
                        _id: (0, CompanyBalance_1.getCompanyBalanceId)(input.companyId),
                        totalRevenue,
                        totalExpenses,
                        netProfit: toMoney(totalRevenue - totalExpenses),
                        vatPayable,
                        commissionLiability,
                        lastUpdated: new Date()
                    }
                }, { upsert: true, session });
                if (input.vat) {
                    yield VatRecord_1.VatRecord.updateOne({
                        companyId: companyObjectId,
                        transactionId: input.sourceId || String(createdEntry._id),
                        sourceType: input.vat.sourceType
                    }, {
                        $set: {
                            vatCollected: toMoney(input.vat.vatCollected || 0),
                            vatPaid: toMoney(input.vat.vatPaid || 0),
                            vatRate: Number(input.vat.vatRate || 0),
                            filingPeriod: input.vat.filingPeriod || defaultFilingPeriod(transactionDate),
                            status: input.vat.status || 'pending'
                        }
                    }, { upsert: true, session });
                }
                yield AccountingEventLog_1.AccountingEventLog.create([
                    {
                        companyId: companyObjectId,
                        eventType: 'transaction_posted',
                        sourceModule: input.sourceModule,
                        sourceId: input.sourceId,
                        success: true,
                        message: `Posted transaction ${input.reference}`,
                        metadata: {
                            journalEntryId: createdEntry._id.toString(),
                            totalDebit,
                            totalCredit
                        }
                    }
                ], session ? { session } : undefined);
                return { journalEntryId: createdEntry._id.toString() };
            });
            let session = null;
            try {
                session = yield mongoose_1.default.startSession();
                let result = { journalEntryId: '' };
                yield session.withTransaction(() => __awaiter(this, void 0, void 0, function* () {
                    result = yield run(session || undefined);
                }));
                return result;
            }
            catch (error) {
                // Cosmos/Mongo API deployments may disable transactions.
                if ((error === null || error === void 0 ? void 0 : error.code) === 20 || /Transaction numbers are only allowed/.test(String((error === null || error === void 0 ? void 0 : error.message) || ''))) {
                    return run(undefined);
                }
                throw error;
            }
            finally {
                if (session) {
                    try {
                        session.endSession();
                    }
                    catch (_a) {
                        // no-op
                    }
                }
            }
        });
    }
    getProfitAndLoss(companyId, from, to) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const companyObjectId = toObjectId(companyId);
            const dateMatch = from || to ? { createdAt: Object.assign(Object.assign({}, (from ? { $gte: from } : {})), (to ? { $lte: to } : {})) } : {};
            const rows = yield JournalLine_1.JournalLine.aggregate([
                { $match: Object.assign({ companyId: companyObjectId }, dateMatch) },
                {
                    $lookup: {
                        from: 'chartofaccounts',
                        localField: 'accountId',
                        foreignField: '_id',
                        as: 'account'
                    }
                },
                { $unwind: '$account' },
                {
                    $match: {
                        'account.companyId': companyObjectId,
                        'account.type': { $in: ['revenue', 'expense'] }
                    }
                },
                {
                    $group: {
                        _id: '$account.type',
                        revenueAmount: { $sum: { $subtract: ['$credit', '$debit'] } },
                        expenseAmount: { $sum: { $subtract: ['$debit', '$credit'] } }
                    }
                }
            ]);
            const revenue = toMoney(((_a = rows.find((row) => row._id === 'revenue')) === null || _a === void 0 ? void 0 : _a.revenueAmount) || 0);
            const expenses = toMoney(((_b = rows.find((row) => row._id === 'expense')) === null || _b === void 0 ? void 0 : _b.expenseAmount) || 0);
            return { revenue, expenses, netProfit: toMoney(revenue - expenses) };
        });
    }
    getBalanceSheet(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const companyObjectId = toObjectId(companyId);
            const rows = yield ChartOfAccount_1.ChartOfAccount.aggregate([
                { $match: { companyId: companyObjectId, isDeleted: { $ne: true }, isActive: true } },
                { $group: { _id: '$type', total: { $sum: '$balance' } } }
            ]);
            return {
                assets: toMoney(((_a = rows.find((row) => row._id === 'asset')) === null || _a === void 0 ? void 0 : _a.total) || 0),
                liabilities: toMoney(((_b = rows.find((row) => row._id === 'liability')) === null || _b === void 0 ? void 0 : _b.total) || 0),
                equity: toMoney(((_c = rows.find((row) => row._id === 'equity')) === null || _c === void 0 ? void 0 : _c.total) || 0)
            };
        });
    }
    getDashboardSummary(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            const cached = this.dashboardSummaryCache.get(companyId);
            if (cached && cached.expiresAt > now) {
                return cached.value;
            }
            const existingInFlight = this.dashboardSummaryInFlight.get(companyId);
            if (existingInFlight) {
                return existingInFlight;
            }
            const loader = (() => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d, _e;
                const companyObjectId = toObjectId(companyId);
                yield this.ensureCompanyBalance(companyId);
                const [balance, cash, unreconciledBank, pendingVat, pendingExpense, unpaidCommissions, completedPaymentRevenue, dashboardKpis] = yield Promise.all([
                    CompanyBalance_1.CompanyBalance.findOne({ companyId: companyObjectId }).maxTimeMS(10000).lean(),
                    BankAccount_1.BankAccount.aggregate([{ $match: { companyId: companyObjectId } }, { $group: { _id: null, total: { $sum: '$currentBalance' } } }]).option({ maxTimeMS: 10000 }),
                    BankTransaction_1.BankTransaction.countDocuments({ companyId: companyObjectId, matched: false }).maxTimeMS(10000),
                    VatRecord_1.VatRecord.countDocuments({ companyId: companyObjectId, status: 'pending' }).maxTimeMS(10000),
                    JournalEntry_1.JournalEntry.countDocuments({ companyId: companyObjectId, sourceModule: 'expense' }).maxTimeMS(10000),
                    JournalLine_1.JournalLine.aggregate([
                        {
                            $lookup: {
                                from: 'chartofaccounts',
                                localField: 'accountId',
                                foreignField: '_id',
                                as: 'account'
                            }
                        },
                        { $unwind: '$account' },
                        { $match: { companyId: companyObjectId, 'account.code': '2102' } },
                        { $group: { _id: null, amount: { $sum: { $subtract: ['$credit', '$debit'] } } } }
                    ]).option({ maxTimeMS: 15000 }),
                    Payment_1.Payment.aggregate([
                        { $match: { companyId: companyObjectId, status: 'completed' } },
                        { $group: { _id: null, amount: { $sum: '$commissionDetails.agencyShare' } } }
                    ]).option({ maxTimeMS: 10000 }),
                    dashboardKpiService_1.default.getCompanySnapshot(companyId)
                ]);
                const cashBalance = toMoney(((_a = cash[0]) === null || _a === void 0 ? void 0 : _a.total) || 0);
                const vatDueAmount = toMoney((balance === null || balance === void 0 ? void 0 : balance.vatPayable) || 0);
                const ledgerRevenue = toMoney((balance === null || balance === void 0 ? void 0 : balance.totalRevenue) || 0);
                const paymentRevenue = toMoney(((_b = completedPaymentRevenue[0]) === null || _b === void 0 ? void 0 : _b.amount) || 0);
                const totalRevenue = toMoney(Math.max(ledgerRevenue, paymentRevenue));
                const totalExpenses = toMoney((balance === null || balance === void 0 ? void 0 : balance.totalExpenses) || 0);
                const netProfit = toMoney(totalRevenue - totalExpenses);
                // Self-heal stale dashboard snapshots so subsequent calls stay stable.
                if (totalRevenue !== ledgerRevenue || netProfit !== toMoney((balance === null || balance === void 0 ? void 0 : balance.netProfit) || 0)) {
                    yield CompanyBalance_1.CompanyBalance.updateOne({ companyId: companyObjectId }, {
                        $set: {
                            _id: (0, CompanyBalance_1.getCompanyBalanceId)(companyId),
                            totalRevenue,
                            netProfit,
                            lastUpdated: new Date()
                        }
                    }, { upsert: true });
                }
                const summary = {
                    totalRevenue,
                    totalExpenses,
                    netProfit,
                    vatPayable: vatDueAmount,
                    commissionLiability: toMoney((balance === null || balance === void 0 ? void 0 : balance.commissionLiability) || ((_c = unpaidCommissions[0]) === null || _c === void 0 ? void 0 : _c.amount) || 0),
                    cashBalance,
                    unreconciledBankTransactions: unreconciledBank,
                    vatDuePeriods: pendingVat,
                    pendingExpenses: pendingExpense,
                    unpaidCommissions: Math.max(0, toMoney(((_d = unpaidCommissions[0]) === null || _d === void 0 ? void 0 : _d.amount) || 0)),
                    expenses: toMoney(Number((dashboardKpis === null || dashboardKpis === void 0 ? void 0 : dashboardKpis.expenses) || 0)),
                    invoices: toMoney(Number((dashboardKpis === null || dashboardKpis === void 0 ? void 0 : dashboardKpis.invoices) || 0)),
                    outstandingRentals: toMoney(Number((dashboardKpis === null || dashboardKpis === void 0 ? void 0 : dashboardKpis.outstandingRentals) || 0)),
                    outstandingLevies: toMoney(Number((dashboardKpis === null || dashboardKpis === void 0 ? void 0 : dashboardKpis.outstandingLevies) || 0)),
                    lastUpdated: ((_e = balance === null || balance === void 0 ? void 0 : balance.lastUpdated) === null || _e === void 0 ? void 0 : _e.toISOString()) || new Date().toISOString()
                };
                this.dashboardSummaryCache.set(companyId, {
                    value: summary,
                    cachedAt: Date.now(),
                    expiresAt: Date.now() + this.dashboardSummaryTtlMs
                });
                return summary;
            }))();
            this.dashboardSummaryInFlight.set(companyId, loader);
            try {
                return yield loader;
            }
            catch (error) {
                const fallback = this.dashboardSummaryCache.get(companyId);
                const fallbackAgeMs = fallback ? now - fallback.cachedAt : Number.POSITIVE_INFINITY;
                if (fallback && fallbackAgeMs <= this.dashboardSummaryStaleMaxAgeMs && this.isTransientSummaryError(error)) {
                    return Object.assign(Object.assign({}, fallback.value), { cacheMode: 'stale-fallback', staleAgeMs: Math.max(0, fallbackAgeMs) });
                }
                throw error;
            }
            finally {
                this.dashboardSummaryInFlight.delete(companyId);
            }
        });
    }
    getTrend(companyId_1, accountType_1) {
        return __awaiter(this, arguments, void 0, function* (companyId, accountType, months = 12) {
            const companyObjectId = toObjectId(companyId);
            const since = new Date();
            since.setUTCMonth(since.getUTCMonth() - months + 1);
            since.setUTCDate(1);
            since.setUTCHours(0, 0, 0, 0);
            const rows = yield JournalLine_1.JournalLine.aggregate([
                { $match: { companyId: companyObjectId, createdAt: { $gte: since } } },
                {
                    $lookup: {
                        from: 'chartofaccounts',
                        localField: 'accountId',
                        foreignField: '_id',
                        as: 'account'
                    }
                },
                { $unwind: '$account' },
                { $match: { 'account.companyId': companyObjectId, 'account.type': accountType } },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        value: {
                            $sum: accountType === 'revenue'
                                ? { $subtract: ['$credit', '$debit'] }
                                : { $subtract: ['$debit', '$credit'] }
                        }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]);
            return rows.map((row) => ({
                month: `${row._id.year}-${String(row._id.month).padStart(2, '0')}`,
                total: toMoney(row.value || 0)
            }));
        });
    }
    getVatStatus(companyId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            const rows = yield VatRecord_1.VatRecord.aggregate([
                {
                    $match: Object.assign(Object.assign({ companyId: companyObjectId }, ((filters === null || filters === void 0 ? void 0 : filters.filingPeriod) ? { filingPeriod: filters.filingPeriod } : {})), ((filters === null || filters === void 0 ? void 0 : filters.status) ? { status: filters.status } : {}))
                },
                {
                    $group: {
                        _id: { filingPeriod: '$filingPeriod', status: '$status' },
                        vatCollected: { $sum: '$vatCollected' },
                        vatPaid: { $sum: '$vatPaid' }
                    }
                },
                { $sort: { '_id.filingPeriod': -1 } }
            ]);
            return rows.map((row) => ({
                filingPeriod: row._id.filingPeriod,
                status: row._id.status,
                vatCollected: toMoney(row.vatCollected || 0),
                vatPaid: toMoney(row.vatPaid || 0),
                vatPayable: toMoney((row.vatCollected || 0) - (row.vatPaid || 0))
            }));
        });
    }
    getBankReconciliation(companyId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            const query = { companyId: companyObjectId };
            if ((params === null || params === void 0 ? void 0 : params.bankAccountId) && mongoose_1.default.Types.ObjectId.isValid(params.bankAccountId)) {
                query.bankAccountId = toObjectId(params.bankAccountId);
            }
            if (typeof (params === null || params === void 0 ? void 0 : params.matched) === 'boolean') {
                query.matched = params.matched;
            }
            if ((params === null || params === void 0 ? void 0 : params.startDate) || (params === null || params === void 0 ? void 0 : params.endDate)) {
                query.transactionDate = Object.assign(Object.assign({}, (params.startDate ? { $gte: params.startDate } : {})), (params.endDate ? { $lte: params.endDate } : {}));
            }
            const rows = yield BankTransaction_1.BankTransaction.find(query)
                .sort({ transactionDate: -1, createdAt: -1 })
                .limit(Math.min(Math.max(Number((params === null || params === void 0 ? void 0 : params.limit) || 200), 1), 500))
                .populate('bankAccountId', 'name accountNumber')
                .lean();
            return rows;
        });
    }
    reconcileBankTransaction(companyId, bankTransactionId, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            if (!mongoose_1.default.Types.ObjectId.isValid(bankTransactionId)) {
                throw new Error('Invalid bankTransactionId');
            }
            const updated = yield BankTransaction_1.BankTransaction.findOneAndUpdate({ _id: toObjectId(bankTransactionId), companyId: companyObjectId }, {
                $set: {
                    matched: payload.matched,
                    matchedTransactionId: payload.matched ? payload.matchedTransactionId : undefined
                }
            }, { new: true })
                .populate('bankAccountId', 'name accountNumber')
                .lean();
            return updated;
        });
    }
    suggestBankTransactionMatches(companyId, bankTransactionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            if (!mongoose_1.default.Types.ObjectId.isValid(bankTransactionId)) {
                throw new Error('Invalid bankTransactionId');
            }
            const bankTx = yield BankTransaction_1.BankTransaction.findOne({ _id: toObjectId(bankTransactionId), companyId: companyObjectId }).lean();
            if (!bankTx) {
                throw new Error('Bank transaction not found');
            }
            const txDate = new Date(bankTx.transactionDate);
            const minDate = new Date(txDate);
            minDate.setDate(minDate.getDate() - 14);
            const maxDate = new Date(txDate);
            maxDate.setDate(maxDate.getDate() + 14);
            const targetAmount = Math.abs(Number(bankTx.amount || 0));
            const minAmount = Math.max(0, targetAmount - 5);
            const maxAmount = targetAmount + 5;
            const candidates = yield JournalEntry_1.JournalEntry.aggregate([
                {
                    $match: {
                        companyId: companyObjectId,
                        transactionDate: { $gte: minDate, $lte: maxDate }
                    }
                },
                {
                    $lookup: {
                        from: 'journallines',
                        let: { entryId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$journalEntryId', '$$entryId'] } } },
                            {
                                $lookup: {
                                    from: 'chartofaccounts',
                                    localField: 'accountId',
                                    foreignField: '_id',
                                    as: 'account'
                                }
                            },
                            { $unwind: '$account' },
                            { $match: { 'account.code': '1001' } },
                            { $project: { _id: 0, movement: { $abs: { $subtract: ['$debit', '$credit'] } } } }
                        ],
                        as: 'cashLines'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        reference: 1,
                        description: 1,
                        transactionDate: 1,
                        amount: { $ifNull: [{ $arrayElemAt: ['$cashLines.movement', 0] }, 0] }
                    }
                },
                {
                    $match: {
                        amount: { $gte: minAmount, $lte: maxAmount }
                    }
                },
                { $sort: { transactionDate: -1 } },
                { $limit: 30 }
            ]);
            const normalizedRef = String(bankTx.reference || '').trim().toLowerCase();
            const result = candidates
                .map((candidate) => {
                const reasons = [];
                let score = 0;
                const candidateAmount = Number(candidate.amount || 0);
                const amountDiff = Math.abs(candidateAmount - targetAmount);
                if (amountDiff < 0.01) {
                    score += 55;
                    reasons.push('exact_amount');
                }
                else if (amountDiff <= 1) {
                    score += 40;
                    reasons.push('near_amount');
                }
                else if (amountDiff <= 5) {
                    score += 25;
                    reasons.push('close_amount');
                }
                const daysDiff = Math.abs(Math.round((new Date(candidate.transactionDate).getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24)));
                if (daysDiff === 0) {
                    score += 25;
                    reasons.push('same_day');
                }
                else if (daysDiff <= 2) {
                    score += 18;
                    reasons.push('within_2_days');
                }
                else if (daysDiff <= 7) {
                    score += 10;
                    reasons.push('within_7_days');
                }
                const candidateRef = String(candidate.reference || '').toLowerCase();
                if (normalizedRef && candidateRef && (candidateRef.includes(normalizedRef) || normalizedRef.includes(candidateRef))) {
                    score += 20;
                    reasons.push('reference_match');
                }
                return {
                    journalEntryId: String(candidate._id),
                    reference: String(candidate.reference || ''),
                    description: candidate.description ? String(candidate.description) : undefined,
                    transactionDate: new Date(candidate.transactionDate),
                    amount: toMoney(candidateAmount),
                    score,
                    reasons
                };
            })
                .filter((row) => row.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8);
            return result;
        });
    }
    getCommissionLiability(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const companyObjectId = toObjectId(companyId);
            const rows = yield JournalLine_1.JournalLine.aggregate([
                {
                    $lookup: {
                        from: 'chartofaccounts',
                        localField: 'accountId',
                        foreignField: '_id',
                        as: 'account'
                    }
                },
                { $unwind: '$account' },
                { $match: { companyId: companyObjectId, 'account.code': '2102' } },
                { $group: { _id: null, total: { $sum: { $subtract: ['$credit', '$debit'] } } } }
            ]);
            return { outstandingLiability: toMoney(((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0) };
        });
    }
    getLedger(companyId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            const match = { companyId: companyObjectId };
            if (params.startDate || params.endDate) {
                match.createdAt = Object.assign(Object.assign({}, (params.startDate ? { $gte: params.startDate } : {})), (params.endDate ? { $lte: params.endDate } : {}));
            }
            const pipeline = [
                { $match: match },
                {
                    $lookup: {
                        from: 'chartofaccounts',
                        localField: 'accountId',
                        foreignField: '_id',
                        as: 'account'
                    }
                },
                { $unwind: '$account' }
            ];
            if (params.accountCode) {
                pipeline.push({ $match: { 'account.code': params.accountCode } });
            }
            pipeline.push({
                $lookup: {
                    from: 'journalentries',
                    localField: 'journalEntryId',
                    foreignField: '_id',
                    as: 'entry'
                }
            }, { $unwind: '$entry' }, { $sort: { createdAt: -1 } }, { $limit: Math.min(Math.max(Number(params.limit || 100), 1), 500) }, {
                $project: {
                    _id: 1,
                    createdAt: 1,
                    debit: 1,
                    credit: 1,
                    runningBalanceSnapshot: 1,
                    accountCode: '$account.code',
                    accountName: '$account.name',
                    reference: '$entry.reference',
                    description: '$entry.description',
                    sourceModule: '$entry.sourceModule',
                    transactionDate: '$entry.transactionDate'
                }
            });
            return JournalLine_1.JournalLine.aggregate(pipeline);
        });
    }
    backfillCompanyBalances(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const companyObjectId = toObjectId(companyId);
            const [pnl, commissionLiability, vatRows] = yield Promise.all([
                this.getProfitAndLoss(companyId),
                this.getCommissionLiability(companyId),
                VatRecord_1.VatRecord.aggregate([
                    { $match: { companyId: companyObjectId } },
                    { $group: { _id: null, vatCollected: { $sum: '$vatCollected' }, vatPaid: { $sum: '$vatPaid' } } }
                ])
            ]);
            const vatPayable = toMoney((((_a = vatRows[0]) === null || _a === void 0 ? void 0 : _a.vatCollected) || 0) - (((_b = vatRows[0]) === null || _b === void 0 ? void 0 : _b.vatPaid) || 0));
            yield CompanyBalance_1.CompanyBalance.updateOne({ companyId: companyObjectId }, {
                $set: {
                    _id: (0, CompanyBalance_1.getCompanyBalanceId)(companyId),
                    totalRevenue: pnl.revenue,
                    totalExpenses: pnl.expenses,
                    netProfit: pnl.netProfit,
                    vatPayable,
                    commissionLiability: commissionLiability.outstandingLiability,
                    lastUpdated: new Date()
                }
            }, { upsert: true });
        });
    }
}
exports.default = new AccountingService();
