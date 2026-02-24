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
const accountingService_1 = __importDefault(require("./accountingService"));
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const CompanyAccount_1 = require("../models/CompanyAccount");
const VatRecord_1 = require("../models/VatRecord");
const toMoney = (value) => Number(Number(value || 0).toFixed(2));
const filingPeriodFromDate = (value) => {
    const date = value ? new Date(value) : new Date();
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};
const safeObjectId = (id) => {
    if (!id || !mongoose_1.default.Types.ObjectId.isValid(id))
        return undefined;
    return new mongoose_1.default.Types.ObjectId(id);
};
const isDuplicateKeyError = (error) => Boolean(error && (error.code === 11000 || String((error === null || error === void 0 ? void 0 : error.message) || '').includes('duplicate key')));
class AccountingIntegrationService {
    upsertPaymentVatRecord(payment) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const vatOnCommission = toMoney(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0);
            const paymentVat = toMoney((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0);
            const totalVatCollected = toMoney(vatOnCommission + paymentVat);
            if (totalVatCollected <= 0)
                return;
            yield VatRecord_1.VatRecord.updateOne({
                companyId: new mongoose_1.default.Types.ObjectId(String(payment.companyId)),
                transactionId: String(payment._id),
                sourceType: payment.paymentType
            }, {
                $set: {
                    vatCollected: totalVatCollected,
                    vatPaid: 0,
                    vatRate: Number((payment === null || payment === void 0 ? void 0 : payment.vatRate) || 0),
                    filingPeriod: filingPeriodFromDate(payment.paymentDate),
                    status: 'pending'
                }
            }, { upsert: true });
        });
    }
    syncPaymentReceived(payment, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const companyId = String(payment.companyId);
            const paymentId = String(payment._id);
            try {
                // Reversal entries are handled by syncPaymentReversed.
                if (payment === null || payment === void 0 ? void 0 : payment.reversalOfPaymentId)
                    return;
                if (Number(payment.amount || 0) < 0)
                    return;
                const amount = toMoney(payment.amount || 0);
                const vatOnCommission = toMoney(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0);
                const paymentVat = toMoney((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0);
                const totalVatCollected = toMoney(vatOnCommission + paymentVat);
                const effectiveVatRate = Number((payment === null || payment === void 0 ? void 0 : payment.vatRate) || 0);
                const incomeCode = payment.paymentType === 'sale' ? '4002' : '4001';
                const incomeCredit = toMoney(Math.max(0, amount - totalVatCollected));
                if (amount > 0) {
                    yield accountingService_1.default.postTransaction({
                        companyId,
                        reference: `PAY-${payment.referenceNumber || paymentId}`,
                        description: `Auto-post payment ${payment.referenceNumber || paymentId}`,
                        sourceModule: payment.paymentType === 'sale' ? 'sale' : 'payment',
                        sourceId: paymentId,
                        transactionDate: payment.paymentDate,
                        createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                        lines: [
                            {
                                accountCode: '1001',
                                debit: amount,
                                propertyId: (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : undefined,
                                agentId: (payment === null || payment === void 0 ? void 0 : payment.agentId) ? String(payment.agentId) : undefined
                            },
                            { accountCode: incomeCode, credit: incomeCredit }
                        ].concat(totalVatCollected > 0 ? [{ accountCode: '2101', credit: totalVatCollected }] : []),
                        vat: totalVatCollected > 0
                            ? {
                                sourceType: payment.paymentType,
                                vatCollected: totalVatCollected,
                                vatRate: effectiveVatRate,
                                filingPeriod: filingPeriodFromDate(payment.paymentDate),
                                status: 'pending'
                            }
                            : undefined
                    });
                }
                const agentShare = toMoney(((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.agentShare) || 0);
                if (agentShare > 0) {
                    yield accountingService_1.default.postTransaction({
                        companyId,
                        reference: `COM-${payment.referenceNumber || paymentId}`,
                        description: `Auto-post commission payable for ${payment.referenceNumber || paymentId}`,
                        sourceModule: 'commission',
                        sourceId: `${paymentId}:commission`,
                        transactionDate: payment.paymentDate,
                        createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                        lines: [
                            { accountCode: '5002', debit: agentShare },
                            {
                                accountCode: '2102',
                                credit: agentShare,
                                agentId: (payment === null || payment === void 0 ? void 0 : payment.agentId) ? String(payment.agentId) : undefined
                            }
                        ]
                    });
                }
            }
            catch (error) {
                if (isDuplicateKeyError(error)) {
                    // Payment may already be journal-posted; still ensure the VAT record reflects full payment VAT.
                    yield this.upsertPaymentVatRecord(payment);
                    return;
                }
                yield AccountingEventLog_1.AccountingEventLog.create({
                    companyId: new mongoose_1.default.Types.ObjectId(companyId),
                    eventType: 'payment_sync_failed',
                    sourceModule: payment.paymentType === 'sale' ? 'sale' : 'payment',
                    sourceId: paymentId,
                    success: false,
                    message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to sync payment to accounting',
                    metadata: { paymentReference: payment.referenceNumber }
                });
            }
        });
    }
    syncPaymentReversed(payment, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const companyId = String(payment.companyId);
            const paymentId = String(payment._id);
            try {
                const amount = toMoney(Math.abs(payment.amount || 0));
                const vatOnCommission = toMoney(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0);
                const paymentVat = toMoney((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0);
                const totalVatCollected = toMoney(vatOnCommission + paymentVat);
                const incomeCode = payment.paymentType === 'sale' ? '4002' : '4001';
                const incomeDebit = toMoney(Math.max(0, amount - totalVatCollected));
                if (amount > 0) {
                    yield accountingService_1.default.postTransaction({
                        companyId,
                        reference: `REV-PAY-${payment.referenceNumber || paymentId}`,
                        description: `Reversal of payment ${payment.referenceNumber || paymentId}`,
                        sourceModule: payment.paymentType === 'sale' ? 'sale' : 'payment',
                        sourceId: `${paymentId}:reversal`,
                        transactionDate: new Date(),
                        createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                        lines: [
                            {
                                accountCode: '1001',
                                credit: amount,
                                propertyId: (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : undefined,
                                agentId: (payment === null || payment === void 0 ? void 0 : payment.agentId) ? String(payment.agentId) : undefined
                            },
                            { accountCode: incomeCode, debit: incomeDebit }
                        ].concat(totalVatCollected > 0 ? [{ accountCode: '2101', debit: totalVatCollected }] : []),
                    });
                }
                const agentShare = toMoney(((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.agentShare) || 0);
                if (agentShare > 0) {
                    yield accountingService_1.default.postTransaction({
                        companyId,
                        reference: `REV-COM-${payment.referenceNumber || paymentId}`,
                        description: `Reversal of commission payable for ${payment.referenceNumber || paymentId}`,
                        sourceModule: 'commission',
                        sourceId: `${paymentId}:commission:reversal`,
                        transactionDate: new Date(),
                        createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                        lines: [
                            {
                                accountCode: '5002',
                                credit: agentShare
                            },
                            {
                                accountCode: '2102',
                                debit: agentShare,
                                agentId: (payment === null || payment === void 0 ? void 0 : payment.agentId) ? String(payment.agentId) : undefined
                            }
                        ]
                    });
                }
                // Keep company-level commission rollups consistent with reversal.
                try {
                    const result = yield CompanyAccount_1.CompanyAccount.updateOne({ companyId: new mongoose_1.default.Types.ObjectId(companyId), 'transactions.paymentId': payment._id }, { $set: { 'transactions.$[t].isArchived': true, lastUpdated: new Date() } }, { arrayFilters: [{ 't.paymentId': payment._id, 't.isArchived': { $ne: true } }] });
                    if (Number((result === null || result === void 0 ? void 0 : result.modifiedCount) || 0) > 0) {
                        const fresh = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: new mongoose_1.default.Types.ObjectId(companyId) }).lean();
                        const active = Array.isArray(fresh === null || fresh === void 0 ? void 0 : fresh.transactions)
                            ? fresh.transactions.filter((t) => (t === null || t === void 0 ? void 0 : t.isArchived) !== true)
                            : [];
                        const totalIncome = active
                            .filter((t) => (t === null || t === void 0 ? void 0 : t.type) === 'income')
                            .reduce((sum, t) => sum + Number((t === null || t === void 0 ? void 0 : t.amount) || 0), 0);
                        const totalExpenses = active
                            .filter((t) => (t === null || t === void 0 ? void 0 : t.type) !== 'income')
                            .reduce((sum, t) => sum + Number((t === null || t === void 0 ? void 0 : t.amount) || 0), 0);
                        yield CompanyAccount_1.CompanyAccount.updateOne({ companyId: new mongoose_1.default.Types.ObjectId(companyId) }, { $set: { totalIncome, totalExpenses, runningBalance: totalIncome - totalExpenses, lastUpdated: new Date() } });
                    }
                }
                catch (_c) {
                    // Non-fatal: accounting journal reversal remains source of truth.
                }
            }
            catch (error) {
                if (isDuplicateKeyError(error))
                    return;
                yield AccountingEventLog_1.AccountingEventLog.create({
                    companyId: new mongoose_1.default.Types.ObjectId(companyId),
                    eventType: 'payment_reversal_sync_failed',
                    sourceModule: payment.paymentType === 'sale' ? 'sale' : 'payment',
                    sourceId: paymentId,
                    success: false,
                    message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to sync payment reversal to accounting',
                    metadata: { paymentReference: payment.referenceNumber, reason: (opts === null || opts === void 0 ? void 0 : opts.reason) || '' }
                });
            }
        });
    }
    syncExpenseCreated(input) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const amount = toMoney(input.amount);
                if (amount <= 0)
                    return;
                yield accountingService_1.default.postTransaction({
                    companyId: input.companyId,
                    reference: input.reference,
                    description: input.description || 'Auto-post expense',
                    sourceModule: 'expense',
                    sourceId: input.sourceId,
                    transactionDate: input.date || new Date(),
                    createdBy: input.createdBy,
                    lines: [
                        { accountCode: '5001', debit: amount, propertyId: input.propertyId },
                        { accountCode: '1001', credit: amount, propertyId: input.propertyId }
                    ]
                });
            }
            catch (error) {
                if (isDuplicateKeyError(error))
                    return;
                const companyObjectId = safeObjectId(input.companyId);
                if (!companyObjectId)
                    return;
                yield AccountingEventLog_1.AccountingEventLog.create({
                    companyId: companyObjectId,
                    eventType: 'expense_sync_failed',
                    sourceModule: 'expense',
                    sourceId: input.sourceId,
                    success: false,
                    message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to sync expense to accounting',
                    metadata: { reference: input.reference }
                });
            }
        });
    }
    backfillFromExistingData(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = safeObjectId(companyId);
            if (!companyObjectId) {
                return { paymentsSynced: 0, expensesSynced: 0 };
            }
            let paymentsSynced = 0;
            let expensesSynced = 0;
            const payments = yield Payment_1.Payment.find({ companyId: companyObjectId, status: 'completed' }).sort({ createdAt: 1 });
            for (const payment of payments) {
                yield this.syncPaymentReceived(payment);
                paymentsSynced += 1;
            }
            const account = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: companyObjectId }).lean();
            const transactions = Array.isArray(account === null || account === void 0 ? void 0 : account.transactions) ? account.transactions : [];
            for (const tx of transactions) {
                if (String(tx === null || tx === void 0 ? void 0 : tx.type) !== 'expense')
                    continue;
                const amount = Number((tx === null || tx === void 0 ? void 0 : tx.amount) || 0);
                if (!(amount > 0))
                    continue;
                yield this.syncExpenseCreated({
                    companyId,
                    sourceId: String((tx === null || tx === void 0 ? void 0 : tx._id) || `${companyId}:${(tx === null || tx === void 0 ? void 0 : tx.date) || Date.now()}`),
                    reference: String((tx === null || tx === void 0 ? void 0 : tx.referenceNumber) || (tx === null || tx === void 0 ? void 0 : tx.reference) || `EXP-${Date.now()}`),
                    amount,
                    description: (tx === null || tx === void 0 ? void 0 : tx.description) || (tx === null || tx === void 0 ? void 0 : tx.category) || 'Backfilled expense',
                    date: (tx === null || tx === void 0 ? void 0 : tx.date) ? new Date(tx.date) : new Date()
                });
                expensesSynced += 1;
            }
            return { paymentsSynced, expensesSynced };
        });
    }
}
exports.default = new AccountingIntegrationService();
