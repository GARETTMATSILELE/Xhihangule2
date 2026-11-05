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
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
const principalAgentJournal_1 = require("./tax/principalAgentJournal");
const paymentAllocation_1 = require("./tax/paymentAllocation");
const vatCalculation_1 = require("./tax/vatCalculation");
const chartAccounts_1 = require("./tax/chartAccounts");
const taxObligationService_1 = require("./taxObligationService");
const transactionDomain_1 = require("./transactionDomain");
const accountingPeriodService_1 = require("./accountingPeriodService");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const testFailureSeam_1 = require("./testFailureSeam");
const logger_1 = require("../utils/logger");
const operationalFailure_1 = require("./operationalFailure");
const financialOperationVisibility_1 = require("./financialOperationVisibility");
const journalDuplicateKey_1 = require("./journalDuplicateKey");
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
function findJournalForIdentity(identity) {
    return __awaiter(this, void 0, void 0, function* () {
        const companyId = identity.companyId instanceof mongoose_1.default.Types.ObjectId
            ? identity.companyId
            : new mongoose_1.default.Types.ObjectId(String(identity.companyId));
        return JournalEntry_1.JournalEntry.findOne({
            companyId,
            sourceModule: identity.sourceModule,
            sourceId: identity.sourceId
        }).select('_id companyId sourceModule sourceId reference status').lean();
    });
}
/**
 * Insert a journal once. A duplicate key is success only when the conflicting
 * index and the stored journal are this exact operation. The stored journal
 * is not updated.
 */
function ensureJournal(identity, post) {
    return __awaiter(this, void 0, void 0, function* () {
        const existing = yield findJournalForIdentity(identity);
        if (existing) {
            if (!(0, journalDuplicateKey_1.persistedJournalMatchesIdentity)(existing, identity)) {
                throw new Error('Existing journal does not match this posting operation');
            }
            return;
        }
        try {
            yield post();
        }
        catch (error) {
            const matched = (0, journalDuplicateKey_1.matchingJournalIdentity)(error, [identity]);
            if (!matched)
                throw error;
            const raced = yield findJournalForIdentity(identity);
            if (!(0, journalDuplicateKey_1.persistedJournalMatchesIdentity)(raced, identity))
                throw error;
        }
    });
}
function assertReceiptReferenceOwnedByPayment(companyId, reference, paymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const existing = yield JournalEntry_1.JournalEntry.findOne({
            companyId,
            reference,
            status: 'posted'
        }).select('companyId sourceId reference status').lean();
        if (!existing)
            return;
        const sourceId = String(existing.sourceId || '');
        if (sourceId === paymentId || sourceId.startsWith(`${paymentId}:`))
            return;
        throw new journalDuplicateKey_1.JournalReferenceCollisionError(reference, sourceId || 'unknown');
    });
}
class AccountingIntegrationService {
    upsertPaymentVatRecord(payment) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const vatOnCommission = toMoney(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0);
            const paymentVat = toMoney((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0);
            const totalVatCollected = toMoney(vatOnCommission + paymentVat);
            if (totalVatCollected <= 0)
                return;
            const filter = {
                companyId: new mongoose_1.default.Types.ObjectId(String(payment.companyId)),
                transactionId: String(payment._id),
                sourceType: payment.paymentType
            };
            const existing = yield VatRecord_1.VatRecord.findOne(filter).select('status vatCollected').lean();
            if (existing)
                return;
            try {
                yield VatRecord_1.VatRecord.updateOne(filter, {
                    $setOnInsert: {
                        vatCollected: totalVatCollected,
                        vatPaid: 0,
                        vatRate: Number((payment === null || payment === void 0 ? void 0 : payment.vatOnCommissionRate) || (payment === null || payment === void 0 ? void 0 : payment.vatRate) || 0),
                        filingPeriod: filingPeriodFromDate(payment.paymentDate),
                        status: 'pending'
                    }
                }, { upsert: true });
            }
            catch (error) {
                const raced = yield VatRecord_1.VatRecord.findOne(filter).select('_id').lean();
                if (!raced)
                    throw error;
            }
        });
    }
    ensurePaymentVatObligations(payment, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const companyId = String(payment.companyId);
            const paymentId = String(payment._id);
            const vatOnCommission = toMoney(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0);
            const paymentVat = toMoney((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0);
            const commissionNet = toMoney(Number(((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.commissionNet) || ((_c = payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.totalCommission) || 0));
            const effectiveVatRate = Number((payment === null || payment === void 0 ? void 0 : payment.vatOnCommissionRate) || ((_d = payment.commissionDetails) === null || _d === void 0 ? void 0 : _d.vatRate) || (payment === null || payment === void 0 ? void 0 : payment.vatRate) || 0);
            const propertyId = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : undefined;
            const period = (0, vatCalculation_1.filingPeriodFromDate)(payment.paymentDate);
            const details = (payment.commissionDetails || {});
            if (vatOnCommission > 0) {
                (0, testFailureSeam_1.throwOnceIfArmed)(paymentId, String(payment.notes || ''), 'PHASE_FAIL_OBLIGATION_ONCE');
                if (process.env.NODE_ENV !== 'production' &&
                    process.env.MANTIS_TEST_SEAM === '1' &&
                    String(payment.notes || '').includes('FAIL_VAT_OBLIGATION')) {
                    throw new Error('FAIL_VAT_OBLIGATION');
                }
                yield (0, taxObligationService_1.upsertPaymentTaxObligation)({
                    companyId,
                    taxType: 'VAT_ON_COMMISSION',
                    paymentId,
                    propertyId,
                    taxPeriod: period,
                    transactionDate: payment.paymentDate,
                    currency: payment.currency,
                    taxableAmount: commissionNet,
                    taxRate: effectiveVatRate,
                    taxAmount: vatOnCommission,
                    calculationBasis: String(details.vatTreatment || 'COMMISSION_VAT'),
                    calculationSnapshot: {
                        paymentId,
                        commissionBase: details.commissionBase,
                        commissionRate: details.commissionRate,
                        commissionNet,
                        vatTreatment: details.vatTreatment,
                        vatRate: (_e = details.vatRate) !== null && _e !== void 0 ? _e : effectiveVatRate,
                        vatAmount: vatOnCommission,
                        vatRuleId: details.vatRuleId,
                        vatTaxPoint: details.vatTaxPoint || payment.paymentDate,
                        vatDecision: details.vatDecision
                    },
                    glAccount: chartAccounts_1.GL.VAT_PAYABLE,
                    createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy
                });
            }
            if (paymentVat > 0) {
                yield (0, taxObligationService_1.upsertPaymentTaxObligation)({
                    companyId,
                    taxType: 'VAT_OUTPUT',
                    paymentId,
                    propertyId,
                    taxPeriod: period,
                    transactionDate: payment.paymentDate,
                    currency: payment.currency,
                    taxableAmount: toMoney(Number(payment.amount || 0) - paymentVat),
                    taxRate: Number((payment === null || payment === void 0 ? void 0 : payment.vatRate) || 0),
                    taxAmount: paymentVat,
                    calculationBasis: 'PROPERTY_SALE_VAT',
                    glAccount: chartAccounts_1.GL.VAT_PAYABLE,
                    createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy
                });
            }
        });
    }
    reversePaymentVatRecord(payment) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield VatRecord_1.VatRecord.updateOne({
                companyId: new mongoose_1.default.Types.ObjectId(String(payment.companyId)),
                transactionId: String(payment._id),
                status: { $ne: 'reversed' }
            }, { $set: { status: 'reversed' } });
            if (Number(result.matchedCount || result.n || 0) > 0)
                return 'reversed';
            const existing = yield VatRecord_1.VatRecord.findOne({
                transactionId: String(payment._id),
                status: 'reversed'
            }).select('_id').lean();
            return existing ? 'reversed' : 'skipped';
        });
    }
    /**
     * Company commission projection writer for a Payment.
     * Call only from paymentAccountingOrchestrator (or explicit repair via orchestrator).
     * Do not call from scheduled jobs, GET handlers, integrity, or historical sync.
     * Payment.commissionDetails is the source of truth; CompanyAccount is a projection.
     */
    postCompanyCommission(payment) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!(0, accountingPostingPolicy_1.shouldPostCompanyCommission)(payment))
                return;
            const agencyShare = toMoney(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agencyShare) || 0);
            if (!(agencyShare > 0) || !payment.companyId)
                return;
            yield (0, accountingPeriodService_1.assertPeriodAllowsPosting)({
                companyId: String(payment.companyId),
                transactionDate: new Date(payment.paymentDate || Date.now()),
                sourceModule: 'payment',
                sourceId: String(payment._id),
                actorId: payment.processedBy ? String(payment.processedBy) : undefined
            });
            const companyId = payment.companyId;
            const desiredSource = (0, transactionDomain_1.journalPaymentType)(payment) === 'sale' ? 'sales_commission' : 'rental_commission';
            const txDoc = {
                type: 'income',
                source: desiredSource,
                amount: agencyShare,
                date: payment.paymentDate || new Date(),
                currency: payment.currency || 'USD',
                paymentMethod: payment.paymentMethod,
                paymentId: payment._id,
                referenceNumber: payment.referenceNumber,
                description: desiredSource === 'sales_commission' ? 'Sales commission income' : 'Rental commission income',
                processedBy: payment.processedBy,
                notes: payment.notes
            };
            yield CompanyAccount_1.CompanyAccount.updateOne({ companyId }, { $setOnInsert: { companyId, runningBalance: 0, totalIncome: 0, totalExpenses: 0, lastUpdated: new Date() } }, { upsert: true });
            yield CompanyAccount_1.CompanyAccount.updateOne({ companyId, transactions: { $not: { $elemMatch: { paymentId: payment._id, isArchived: { $ne: true } } } } }, {
                $push: { transactions: txDoc },
                $inc: { totalIncome: agencyShare, runningBalance: agencyShare },
                $set: { lastUpdated: new Date() }
            });
        });
    }
    recordReceiptJournalFailure(payment, error) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyId = String(payment.companyId || '');
            const paymentId = String(payment._id || '');
            if (!mongoose_1.default.Types.ObjectId.isValid(companyId) || !paymentId)
                return;
            const failure = error;
            if (failure === null || failure === void 0 ? void 0 : failure.journalFailureRecorded)
                return;
            try {
                yield AccountingEventLog_1.AccountingEventLog.create({
                    companyId: new mongoose_1.default.Types.ObjectId(companyId),
                    eventType: 'payment_sync_failed',
                    sourceModule: String(payment.paymentType || '') === 'sale' ? 'sale' : 'payment',
                    sourceId: paymentId,
                    success: false,
                    message: (failure === null || failure === void 0 ? void 0 : failure.message) || 'Failed to sync payment to accounting',
                    metadata: {
                        paymentReference: payment.referenceNumber,
                        code: (failure === null || failure === void 0 ? void 0 : failure.code) || 'JOURNAL_POST_FAILED'
                    }
                });
                if (failure && typeof failure === 'object')
                    failure.journalFailureRecorded = true;
            }
            catch (logError) {
                logger_1.logger.warn('payment_accounting_sync_failed_not_logged', {
                    paymentId,
                    companyId,
                    error: (logError === null || logError === void 0 ? void 0 : logError.message) || logError
                });
            }
        });
    }
    syncPaymentReceived(payment, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
            const companyId = String(payment.companyId);
            const paymentId = String(payment._id);
            try {
                if (!(0, accountingPostingPolicy_1.shouldPostJournal)(payment)) {
                    return { receiptJournal: 'skipped', reason: (0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)(payment).reason || 'policy_skip' };
                }
                if (payment === null || payment === void 0 ? void 0 : payment.reversalOfPaymentId) {
                    return { receiptJournal: 'skipped', reason: 'reversal_row' };
                }
                if (Number(payment.amount || 0) < 0) {
                    return { receiptJournal: 'skipped', reason: 'negative_amount' };
                }
                if (Number(payment.amount || 0) === 0) {
                    return { receiptJournal: 'skipped', reason: 'zero_amount' };
                }
                const amount = toMoney(payment.amount || 0);
                const vatOnCommission = toMoney(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0);
                const paymentVat = toMoney((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0);
                const totalVatCollected = toMoney(vatOnCommission + paymentVat);
                const commissionNet = toMoney(Number(((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.commissionNet) || ((_c = payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.totalCommission) || 0));
                const effectiveVatRate = Number((payment === null || payment === void 0 ? void 0 : payment.vatOnCommissionRate) || (payment === null || payment === void 0 ? void 0 : payment.vatRate) || 0);
                const propertyId = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : undefined;
                const agentId = (payment === null || payment === void 0 ? void 0 : payment.agentId) ? String(payment.agentId) : undefined;
                const levyAmount = toMoney(Number((_f = (_e = (_d = payment.commissionDetails) === null || _d === void 0 ? void 0 : _d.levy) !== null && _e !== void 0 ? _e : payment === null || payment === void 0 ? void 0 : payment.levyAllocated) !== null && _f !== void 0 ? _f : 0));
                const allocation = (0, paymentAllocation_1.allocateRentalReceipt)({
                    amount,
                    rent: toMoney(Number((_j = (_g = payment === null || payment === void 0 ? void 0 : payment.rentAllocated) !== null && _g !== void 0 ? _g : (_h = payment.commissionDetails) === null || _h === void 0 ? void 0 : _h.commissionBase) !== null && _j !== void 0 ? _j : amount - levyAmount)),
                    levy: levyAmount,
                    commissionBase: toMoney(Number(((_k = payment.commissionDetails) === null || _k === void 0 ? void 0 : _k.commissionBase) || 0)),
                    commissionNet,
                    vatOnCommission: vatOnCommission
                });
                const domainPaymentType = (0, transactionDomain_1.journalPaymentType)(payment);
                const receiptJournal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
                    paymentType: domainPaymentType,
                    amount,
                    ownerAmount: allocation.ownerPayable,
                    commissionNet: allocation.commissionNet,
                    vatAmount: totalVatCollected,
                    levyAmount: domainPaymentType === 'sale' ? 0 : allocation.levyPayable,
                    propertyId,
                    agentId
                });
                const sourceModule = (0, transactionDomain_1.journalPaymentType)(payment) === 'sale' ? 'sale' : 'payment';
                const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
                const receiptReference = `PAY-${payment.referenceNumber || paymentId}`;
                if (!receiptJournal.lines.length || !receiptJournal.balanced) {
                    const debit = toMoney(receiptJournal.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
                    const credit = toMoney(receiptJournal.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
                    throw new Error(`Journal is unbalanced. debit=${debit}, credit=${credit}`);
                }
                yield assertReceiptReferenceOwnedByPayment(companyObjectId, receiptReference, paymentId);
                if (amount > 0 && receiptJournal.lines.length > 0) {
                    yield ensureJournal({
                        companyId: companyObjectId,
                        sourceModule,
                        sourceId: paymentId,
                        reference: receiptReference
                    }, () => accountingService_1.default.postTransaction({
                        companyId,
                        reference: receiptReference,
                        description: `Agent collection ${payment.referenceNumber || paymentId} (commission as company revenue; principal funds as client liability)`,
                        sourceModule,
                        sourceId: paymentId,
                        transactionDate: payment.paymentDate,
                        createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                        lines: receiptJournal.lines,
                        seamHaystack: String(payment.notes || ''),
                        vat: totalVatCollected > 0
                            ? {
                                sourceType: payment.paymentType,
                                vatCollected: totalVatCollected,
                                vatRate: effectiveVatRate,
                                filingPeriod: filingPeriodFromDate(payment.paymentDate),
                                status: 'pending'
                            }
                            : undefined
                    }));
                }
                if (totalVatCollected > 0) {
                    yield this.upsertPaymentVatRecord(payment);
                }
                yield this.ensurePaymentVatObligations(payment, opts);
                const agentShare = toMoney(((_l = payment.commissionDetails) === null || _l === void 0 ? void 0 : _l.agentShare) || 0);
                if (agentShare > 0) {
                    const commissionReference = `COM-${payment.referenceNumber || paymentId}`;
                    yield assertReceiptReferenceOwnedByPayment(companyObjectId, commissionReference, paymentId);
                    yield ensureJournal({
                        companyId: companyObjectId,
                        sourceModule: 'commission',
                        sourceId: `${paymentId}:commission`,
                        reference: commissionReference
                    }, () => accountingService_1.default.postTransaction({
                        companyId,
                        reference: commissionReference,
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
                    }));
                }
                return { receiptJournal: 'posted' };
            }
            catch (error) {
                const failureClass = (0, operationalFailure_1.classifyOperationalFailure)(error);
                logger_1.logger.warn('payment_accounting_sync_failed', {
                    correlationId: paymentId,
                    paymentId,
                    companyId,
                    failureClass,
                    code: error === null || error === void 0 ? void 0 : error.code
                });
                yield this.recordReceiptJournalFailure(payment, error);
                throw error;
            }
        });
    }
    postCompanyCommissionReversal(payment, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const companyId = String(payment.companyId);
            const paymentId = String(payment._id);
            (0, testFailureSeam_1.throwOnceIfArmed)(paymentId, `${String(payment.notes || '')} ${String((opts === null || opts === void 0 ? void 0 : opts.reason) || '')}`, 'PHASE27_FAIL_COMPANY');
            const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
            const account = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: companyObjectId }).lean();
            const originalLines = Array.isArray(account === null || account === void 0 ? void 0 : account.transactions)
                ? account.transactions.filter((t) => String((t === null || t === void 0 ? void 0 : t.paymentId) || '') === paymentId &&
                    !(t === null || t === void 0 ? void 0 : t.reversesPaymentId) &&
                    (t === null || t === void 0 ? void 0 : t.isArchived) !== true &&
                    Number((t === null || t === void 0 ? void 0 : t.amount) || 0) > 0)
                : [];
            if (!originalLines.length)
                return 'skipped';
            yield (0, accountingPeriodService_1.assertPeriodAllowsPosting)({
                companyId,
                transactionDate: new Date(),
                sourceModule: 'payment',
                sourceId: `${paymentId}:commission-reversal`,
                actorId: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                overrideReason: opts === null || opts === void 0 ? void 0 : opts.reason
            });
            const already = Array.isArray(account === null || account === void 0 ? void 0 : account.transactions)
                && account.transactions.some((t) => String((t === null || t === void 0 ? void 0 : t.reversesPaymentId) || '') === paymentId);
            if (already)
                return 'reversed';
            const posted = toMoney(originalLines.reduce((sum, t) => sum + Number(t.amount || 0), 0));
            const source = ((_a = originalLines[0]) === null || _a === void 0 ? void 0 : _a.source) || ((0, transactionDomain_1.journalPaymentType)(payment) === 'sale' ? 'sales_commission' : 'rental_commission');
            const reversalPaymentId = (opts === null || opts === void 0 ? void 0 : opts.reversalPaymentId) && mongoose_1.default.Types.ObjectId.isValid(opts.reversalPaymentId)
                ? new mongoose_1.default.Types.ObjectId(opts.reversalPaymentId)
                : undefined;
            const counter = {
                type: 'income',
                source,
                amount: -posted,
                date: new Date(),
                currency: payment.currency || 'USD',
                reversesPaymentId: payment._id,
                referenceNumber: `REV-COM-${payment.referenceNumber || paymentId}`,
                description: `Reversal of ${source} for ${payment.referenceNumber || paymentId}`,
                notes: (opts === null || opts === void 0 ? void 0 : opts.reason) || 'Payment reversal',
                processedBy: (opts === null || opts === void 0 ? void 0 : opts.createdBy) && mongoose_1.default.Types.ObjectId.isValid(opts.createdBy)
                    ? new mongoose_1.default.Types.ObjectId(opts.createdBy)
                    : undefined,
                isArchived: false
            };
            if (reversalPaymentId)
                counter.paymentId = reversalPaymentId;
            const result = yield CompanyAccount_1.CompanyAccount.updateOne({
                companyId: companyObjectId,
                transactions: { $not: { $elemMatch: { reversesPaymentId: payment._id } } }
            }, {
                $push: { transactions: counter },
                $inc: { totalIncome: -posted, runningBalance: -posted },
                $set: { lastUpdated: new Date() }
            });
            if (Number(result.matchedCount || 0) === 0) {
                const fresh = yield CompanyAccount_1.CompanyAccount.findOne({
                    companyId: companyObjectId,
                    'transactions.reversesPaymentId': payment._id
                }).select('_id').lean();
                if (!fresh) {
                    throw new Error('Company commission reversal was not recorded');
                }
            }
            return 'reversed';
        });
    }
    postReversalJournal(payment, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const companyId = String(payment.companyId);
            const paymentId = String(payment._id);
            (0, testFailureSeam_1.throwOnceIfArmed)(paymentId, `${String(payment.notes || '')} ${String((opts === null || opts === void 0 ? void 0 : opts.reason) || '')}`, 'PHASE27_FAIL_JOURNAL');
            const sourceModule = (0, transactionDomain_1.journalPaymentType)(payment) === 'sale' ? 'sale' : 'payment';
            const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
            const reversalReference = `REV-PAY-${payment.referenceNumber || paymentId}`;
            const reversalIdentity = {
                companyId: companyObjectId,
                sourceModule,
                sourceId: `${paymentId}:reversal`,
                reference: reversalReference
            };
            try {
                const existing = yield findJournalForIdentity(reversalIdentity);
                if (existing && !(0, journalDuplicateKey_1.persistedJournalMatchesIdentity)(existing, reversalIdentity)) {
                    throw new Error('Existing reversal journal does not match this payment');
                }
                if (!existing) {
                    const original = yield JournalEntry_1.JournalEntry.findOne({
                        companyId: companyObjectId,
                        sourceModule,
                        sourceId: paymentId
                    }).lean();
                    let lines = [];
                    if (original) {
                        const stored = yield JournalLine_1.JournalLine.find({ journalEntryId: original._id }).lean();
                        const accounts = yield ChartOfAccount_1.ChartOfAccount.find({
                            _id: { $in: stored.map((line) => line.accountId) }
                        }).select('code').lean();
                        const codeById = new Map(accounts.map((account) => [String(account._id), String(account.code)]));
                        lines = stored
                            .map((line) => ({
                            accountCode: codeById.get(String(line.accountId)) || '',
                            debit: toMoney(Number(line.credit || 0)),
                            credit: toMoney(Number(line.debit || 0)),
                            propertyId: line.propertyId ? String(line.propertyId) : undefined,
                            agentId: line.agentId ? String(line.agentId) : undefined
                        }))
                            .filter((line) => line.accountCode && ((line.debit || 0) > 0 || (line.credit || 0) > 0));
                    }
                    else {
                        throw new Error('Original journal is missing. The reversal was not constructed from current configuration.');
                    }
                    if (original && lines.length === 0) {
                        throw new Error('Original journal lines could not be reversed');
                    }
                    if (lines.length > 0) {
                        yield ensureJournal(reversalIdentity, () => accountingService_1.default.postTransaction({
                            companyId,
                            reference: reversalReference,
                            description: `Reversal of agent collection ${payment.referenceNumber || paymentId}`,
                            sourceModule,
                            sourceId: `${paymentId}:reversal`,
                            transactionDate: new Date(),
                            createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                            periodOverrideReason: opts === null || opts === void 0 ? void 0 : opts.reason,
                            lines
                        }));
                    }
                    else if (!original) {
                        return 'skipped';
                    }
                }
                const agentShare = toMoney(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agentShare) || 0);
                if (agentShare > 0) {
                    yield ensureJournal({
                        companyId: companyObjectId,
                        sourceModule: 'commission',
                        sourceId: `${paymentId}:commission:reversal`,
                        reference: `REV-AGT-${payment.referenceNumber || paymentId}`
                    }, () => accountingService_1.default.postTransaction({
                        companyId,
                        reference: `REV-AGT-${payment.referenceNumber || paymentId}`,
                        description: `Reversal of commission payable for ${payment.referenceNumber || paymentId}`,
                        sourceModule: 'commission',
                        sourceId: `${paymentId}:commission:reversal`,
                        transactionDate: new Date(),
                        createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                        periodOverrideReason: opts === null || opts === void 0 ? void 0 : opts.reason,
                        lines: [
                            { accountCode: '5002', credit: agentShare },
                            {
                                accountCode: '2102',
                                debit: agentShare,
                                agentId: (payment === null || payment === void 0 ? void 0 : payment.agentId) ? String(payment.agentId) : undefined
                            }
                        ]
                    }));
                }
                return 'reversed';
            }
            catch (error) {
                const failureClass = (0, operationalFailure_1.classifyOperationalFailure)(error);
                logger_1.logger.warn('payment_reversal_journal_failed', {
                    correlationId: paymentId,
                    paymentId,
                    companyId,
                    failureClass,
                    code: error === null || error === void 0 ? void 0 : error.code
                });
                yield AccountingEventLog_1.AccountingEventLog.create({
                    companyId: companyObjectId,
                    eventType: 'payment_reversal_sync_failed',
                    sourceModule,
                    sourceId: paymentId,
                    success: false,
                    message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to sync payment reversal to accounting',
                    metadata: { paymentReference: payment.referenceNumber, failureClass }
                });
                throw error;
            }
        });
    }
    syncPaymentReversed(payment, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.postCompanyCommissionReversal(payment, opts);
            yield this.postReversalJournal(payment, opts);
            yield (0, taxObligationService_1.reversePaymentTaxObligations)({
                companyId: String(payment.companyId),
                paymentId: String(payment._id),
                createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy,
                reason: opts === null || opts === void 0 ? void 0 : opts.reason,
                notes: String(payment.notes || '')
            });
        });
    }
    syncExpenseCreated(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = safeObjectId(input.companyId);
            const sourceId = String(input.sourceId || '').trim();
            const reference = String(input.reference || '').trim();
            if (!companyObjectId) {
                throw new operationalFailure_1.ExpenseSyncError('Expense sync requires a valid company id', 'permanent', 'EXPENSE_COMPANY_REQUIRED');
            }
            if (!sourceId || !reference) {
                throw new operationalFailure_1.ExpenseSyncError('Expense sync requires a source id and reference', 'permanent', 'EXPENSE_SOURCE_REQUIRED');
            }
            const amount = toMoney(input.amount);
            if (amount <= 0)
                return;
            const identity = {
                companyId: companyObjectId,
                sourceModule: 'expense',
                sourceId,
                reference
            };
            try {
                yield ensureJournal(identity, () => {
                    (0, testFailureSeam_1.throwOnceIfArmed)(sourceId, String(input.description || ''), 'PHASE_FAIL_EXPENSE_POST');
                    return accountingService_1.default.postTransaction({
                        companyId: input.companyId,
                        reference,
                        description: input.description || 'Auto-post expense',
                        sourceModule: 'expense',
                        sourceId,
                        transactionDate: input.date || new Date(),
                        createdBy: input.createdBy,
                        lines: [
                            { accountCode: '5001', debit: amount, propertyId: input.propertyId },
                            { accountCode: '1001', credit: amount, propertyId: input.propertyId }
                        ]
                    });
                });
                (0, testFailureSeam_1.throwOnceIfArmed)(sourceId, String(input.description || ''), 'PHASE_FAIL_EXPENSE_AFTER');
                const stored = yield findJournalForIdentity(identity);
                if (!(0, journalDuplicateKey_1.persistedJournalMatchesIdentity)(stored, identity)) {
                    throw new operationalFailure_1.ExpenseSyncError('Expense journal was not stored for this source', 'conflict', 'EXPENSE_SOURCE_MISSING');
                }
                yield (0, financialOperationVisibility_1.resolveFinancialReview)(input.companyId, 'EXPENSE_SYNC_FAILED', sourceId, 'The expense journal for this source is present. Amounts were not rewritten.');
            }
            catch (error) {
                const failureClass = error instanceof operationalFailure_1.ExpenseSyncError
                    ? error.failureClass
                    : (String((error === null || error === void 0 ? void 0 : error.message) || '').includes('does not match this posting') ? 'conflict' : (0, operationalFailure_1.classifyOperationalFailure)(error));
                const syncError = error instanceof operationalFailure_1.ExpenseSyncError
                    ? error
                    : new operationalFailure_1.ExpenseSyncError((error === null || error === void 0 ? void 0 : error.message) || 'Failed to sync expense to accounting', failureClass, (error === null || error === void 0 ? void 0 : error.code) || 'EXPENSE_SYNC_FAILED');
                logger_1.logger.warn('expense_sync_failed', {
                    correlationId: sourceId,
                    companyId: input.companyId,
                    sourceId,
                    failureClass,
                    code: syncError.code
                });
                yield AccountingEventLog_1.AccountingEventLog.create({
                    companyId: companyObjectId,
                    eventType: 'expense_sync_failed',
                    sourceModule: 'expense',
                    sourceId,
                    success: false,
                    message: syncError.message,
                    metadata: { reference, failureClass, amount }
                });
                yield (0, financialOperationVisibility_1.upsertFinancialReview)({
                    companyId: input.companyId,
                    component: 'EXPENSE_SYNC_FAILED',
                    operationId: sourceId,
                    amount,
                    missingRecord: 'expense journal',
                    issueType: failureClass === 'conflict' ? 'mismatched' : 'missing',
                    actual: failureClass,
                    recommendedReview: `Expense source ${sourceId} for company ${input.companyId}, amount ${amount.toFixed(2)}, did not finish. Failure class ${failureClass}. Do not create another expense. Retry this source through syncExpenseCreated. Do not rewrite historical amounts.`
                });
                throw syncError;
            }
        });
    }
    backfillFromExistingData(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            // EXPLICIT HISTORICAL MIGRATION ONLY. Never call from integrity, GET, reporting, or scheduled jobs.
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
