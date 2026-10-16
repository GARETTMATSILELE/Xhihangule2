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
exports.detectFinancialPostingGaps = detectFinancialPostingGaps;
exports.flagFinancialPostingGaps = flagFinancialPostingGaps;
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const VatRecord_1 = require("../models/VatRecord");
const TaxObligation_1 = require("../models/TaxObligation");
const AccountingException_1 = require("../models/AccountingException");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
const money_1 = require("../utils/money");
const money = (value) => (0, money_1.roundMoney)(Number(value || 0));
function gap(payment, missingRecord, issueType) {
    const companyId = String(payment.companyId || '');
    const reference = String(payment.referenceNumber || payment._id);
    const amount = money(payment.amount);
    return {
        companyId,
        paymentId: String(payment._id),
        reference,
        amount,
        missingRecord,
        issueType,
        recommendedReview: `Review payment ${reference} for company ${companyId}, amount ${amount.toFixed(2)}. Missing or inconsistent record: ${missingRecord}. Do not rewrite historical amounts. Recover only through the existing accounting pipeline after an accountant approves it.`
    };
}
/**
 * Detection only. Does not create journals, obligations, VAT rows, or payment corrections.
 */
function detectFinancialPostingGaps(companyId_1) {
    return __awaiter(this, arguments, void 0, function* (companyId, limit = 200) {
        const detected = yield inspectFinancialPostingGaps(companyId, limit);
        return detected.findings;
    });
}
function inspectFinancialPostingGaps(companyId_1) {
    return __awaiter(this, arguments, void 0, function* (companyId, limit = 200) {
        var _a, _b, _c, _d, _e;
        if (!mongoose_1.default.Types.ObjectId.isValid(companyId))
            return { findings: [], scannedPaymentIds: [] };
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const findings = [];
        const payments = yield Payment_1.Payment.find({
            companyId: companyObjectId,
            status: { $in: ['completed', 'reversed'] },
            isProvisional: { $ne: true }
        })
            .select('_id companyId referenceNumber amount status accountingComplete accountingStatus reversalState reversalOfPaymentId commissionDetails paymentType depositAmount')
            .sort({ updatedAt: -1 })
            .limit(Math.max(1, Math.min(limit, 200)))
            .lean();
        const originals = payments.filter((row) => !row.reversalOfPaymentId);
        const ids = originals.map((row) => String(row._id));
        const [journals, vatRecords, obligations] = yield Promise.all([
            JournalEntry_1.JournalEntry.find({
                companyId: companyObjectId,
                sourceId: { $in: ids.concat(ids.map((id) => `${id}:reversal`)) },
                status: 'posted'
            }).select('_id sourceId companyId').lean(),
            VatRecord_1.VatRecord.find({
                companyId: companyObjectId,
                transactionId: { $in: ids }
            }).select('transactionId vatCollected status').lean(),
            TaxObligation_1.TaxObligation.find({
                companyId: companyObjectId,
                paymentId: { $in: originals.map((row) => row._id) },
                taxType: 'VAT_ON_COMMISSION'
            }).select('paymentId taxAmount status reversalOf').lean()
        ]);
        const journalBySource = new Map(journals.map((row) => [String(row.sourceId), row]));
        const vatByPayment = new Map(vatRecords.map((row) => [String(row.transactionId), row]));
        const obligationsByPayment = new Map();
        for (const row of obligations) {
            const key = String(row.paymentId);
            const list = obligationsByPayment.get(key) || [];
            list.push(row);
            obligationsByPayment.set(key, list);
        }
        for (const payment of originals) {
            const policy = (0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)(payment);
            const paymentId = String(payment._id);
            const journal = journalBySource.get(paymentId);
            const vat = money((_d = (_b = (_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) !== null && _b !== void 0 ? _b : (_c = payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.vatAmount) !== null && _d !== void 0 ? _d : 0);
            const linked = obligationsByPayment.get(paymentId) || [];
            const originalObligations = linked.filter((row) => row.reversalOf == null);
            const activeObligations = originalObligations.filter((row) => row.status !== 'REVERSED');
            const reversalJournal = journalBySource.get(`${paymentId}:reversal`);
            if (policy.allowed && !policy.skipJournal && money(payment.amount) > 0 && !journal) {
                findings.push(gap(payment, 'accounting journal', payment.accountingComplete === true
                    ? 'ACCOUNTING_COMPLETE_WITHOUT_JOURNAL'
                    : 'MISSING_JOURNAL'));
            }
            if (vat > 0 && !vatByPayment.get(paymentId) && activeObligations.length > 0) {
                findings.push(gap(payment, 'VAT collection record', 'VAT_COLLECTION_WITHOUT_RECORD'));
            }
            if (vat > 0 && activeObligations.length === 0 && !originalObligations.some((row) => row.status === 'REVERSED')) {
                findings.push(gap(payment, 'VAT tax obligation', 'MISSING_TAX_OBLIGATION'));
            }
            if (originalObligations.length > 1) {
                findings.push(gap(payment, 'original VAT tax obligation', 'DUPLICATE_ORIGINAL_OBLIGATION'));
            }
            const reversalCount = linked.filter((row) => row.reversalOf != null).length;
            if (reversalCount > originalObligations.length && originalObligations.length > 0) {
                findings.push(gap(payment, 'reversal tax obligation', 'DUPLICATE_REVERSAL_OBLIGATION'));
            }
            if (originalObligations.some((row) => row.status === 'REVERSED') && reversalCount === 0) {
                findings.push(gap(payment, 'reversal tax obligation', 'INCOMPLETE_REVERSAL'));
            }
            if (String(payment.reversalState || '') === 'reversal_incomplete' || (String(payment.status) === 'reversed' && journal && !reversalJournal)) {
                findings.push(gap(payment, 'reversal journal', 'INCOMPLETE_REVERSAL'));
            }
            if (journal && money(payment.amount) > 0) {
                const lines = yield JournalLine_1.JournalLine.find({ journalEntryId: journal._id }).select('debit').lean();
                const debit = money(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
                if (Math.abs(debit - money(payment.amount)) > 0.05) {
                    findings.push(gap(payment, 'payment-to-journal amount', 'PAYMENT_JOURNAL_MISMATCH'));
                }
            }
            if (vat > 0 && activeObligations.length === 1 && Math.abs(money(activeObligations[0].taxAmount) - vat) > 0.05) {
                findings.push(gap(payment, 'VAT snapshot to tax obligation', 'SNAPSHOT_OBLIGATION_MISMATCH'));
            }
            const tracked = payment.accountingComplete != null || Boolean(payment.accountingStatus);
            if (tracked && policy.allowed && !policy.skipOwnerIncome && money(payment.amount) > 0) {
                const ownerAmount = money((_e = payment.commissionDetails) === null || _e === void 0 ? void 0 : _e.ownerAmount);
                if (ownerAmount <= 0) {
                    findings.push(gap(payment, 'owner income amount', 'OWNER_INCOME_AMOUNT_MISSING'));
                }
                else {
                    const income = yield PropertyAccount_1.default.findOne({
                        'transactions.idempotencyKey': `payment:${paymentId}`
                    }).select('_id').lean();
                    if (!income) {
                        findings.push(gap(payment, 'owner income projection', 'OWNER_INCOME_PROJECTION_MISSING'));
                    }
                }
            }
        }
        const reversalDupes = yield TaxObligation_1.TaxObligation.aggregate([
            { $match: { companyId: companyObjectId, reversalOf: { $type: 'objectId' } } },
            { $group: { _id: '$reversalOf', n: { $sum: 1 }, paymentId: { $first: '$paymentId' }, taxAmount: { $first: '$taxAmount' } } },
            { $match: { n: { $gt: 1 } } },
            { $limit: 50 }
        ]);
        for (const row of reversalDupes) {
            const payment = originals.find((item) => String(item._id) === String(row.paymentId));
            if (!payment)
                continue;
            if (findings.some((item) => item.paymentId === String(payment._id) && item.issueType === 'DUPLICATE_REVERSAL_OBLIGATION'))
                continue;
            findings.push(gap(payment, 'reversal tax obligation', 'DUPLICATE_REVERSAL_OBLIGATION'));
        }
        return { findings, scannedPaymentIds: originals.map((row) => String(row._id)) };
    });
}
function flagFinancialPostingGaps(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const detected = yield inspectFinancialPostingGaps(companyId);
        const findings = detected.findings;
        const scanned = new Set(detected.scannedPaymentIds);
        const now = new Date();
        const seen = new Set();
        for (const finding of findings) {
            const key = `${finding.paymentId}:${finding.issueType}`;
            seen.add(key);
            yield AccountingException_1.AccountingException.updateOne({
                kind: 'financial_review',
                paymentId: new mongoose_1.default.Types.ObjectId(finding.paymentId),
                component: finding.issueType
            }, {
                $set: {
                    status: 'open',
                    issueType: finding.issueType.includes('MISMATCH') || finding.issueType.includes('DUPLICATE') ? 'mismatched' : 'missing',
                    component: finding.issueType,
                    expected: finding.amount,
                    actual: finding.missingRecord,
                    companyId: new mongoose_1.default.Types.ObjectId(finding.companyId),
                    error: finding.recommendedReview,
                    missingComponents: [finding.missingRecord],
                    lastCheckedAt: now
                },
                $setOnInsert: {
                    kind: 'financial_review',
                    paymentId: new mongoose_1.default.Types.ObjectId(finding.paymentId),
                    detectedAt: now
                },
                $unset: { resolvedAt: 1, resolvedBy: 1, resolution: 1 }
            }, { upsert: true });
        }
        const open = yield AccountingException_1.AccountingException.find({
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            kind: 'financial_review',
            status: 'open'
        }).select('_id paymentId component').lean();
        for (const row of open) {
            if (!scanned.has(String(row.paymentId)))
                continue;
            const key = `${String(row.paymentId)}:${String(row.component)}`;
            if (seen.has(key))
                continue;
            yield AccountingException_1.AccountingException.updateOne({ _id: row._id }, { $set: { status: 'resolved', resolvedAt: now, resolution: 'Detection no longer reports this gap. Financial records were not changed.', lastCheckedAt: now } });
        }
        return findings.length;
    });
}
