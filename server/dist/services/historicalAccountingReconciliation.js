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
exports.REPAIR_CLASSES = void 0;
exports.classifyHistoricalAccountingCase = classifyHistoricalAccountingCase;
exports.assessHistoricalAccountingPayment = assessHistoricalAccountingPayment;
exports.dryRunCompanyHistoricalAccounting = dryRunCompanyHistoricalAccounting;
exports.executeHistoricalAccountingRepair = executeHistoricalAccountingRepair;
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const HistoricalAccountingRepair_1 = require("../models/HistoricalAccountingRepair");
const accountingPeriodService_1 = require("./accountingPeriodService");
const vatPolicyService_1 = require("./vatPolicyService");
const paymentAccountingOrchestrator_1 = require("./paymentAccountingOrchestrator");
const paymentAccountingProjection_1 = require("./paymentAccountingProjection");
const paymentAccountingReconciliation_1 = require("./paymentAccountingReconciliation");
const accountingIntegrityClassification_1 = require("./accountingIntegrityClassification");
const journalRecoveryAssessment_1 = require("./journalRecoveryAssessment");
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
const paymentReversalPolicy_1 = require("./paymentReversalPolicy");
const paymentAllocation_1 = require("./tax/paymentAllocation");
const principalAgentJournal_1 = require("./tax/principalAgentJournal");
const transactionDomain_1 = require("./transactionDomain");
const money_1 = require("../utils/money");
const mongoose_1 = __importDefault(require("mongoose"));
exports.REPAIR_CLASSES = [
    'SAFE TO REPAIR',
    'REQUIRES ACCOUNTANT APPROVAL',
    'REQUIRES MANUAL INVESTIGATION',
    'ALREADY COMPLETE',
    'DUPLICATE SUSPECTED',
    'FINANCIAL MISMATCH',
    'HISTORICAL VAT REVIEW'
];
const TOLERANCE = 0.05;
function snapshotVat(payment) {
    var _a, _b, _c, _d;
    return (0, money_1.roundMoney)(Number((_d = (_b = (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) !== null && _b !== void 0 ? _b : (_c = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.vatAmount) !== null && _d !== void 0 ? _d : 0));
}
function duplicateNames(actual) {
    const names = [];
    for (const [name, count] of Object.entries(actual.duplicates || {})) {
        if (Number(count) > 1)
            names.push(name);
    }
    if (actual.journalReferenceCollision)
        names.push('journal reference');
    return names;
}
function mismatchedNames(expected, actual) {
    const names = [
        'ownerIncome', 'agentCommission', 'companyCommission', 'journal', 'deposit'
    ];
    return names.filter((name) => {
        var _a, _b;
        if (!actual[name] || ((_a = actual.amounts) === null || _a === void 0 ? void 0 : _a[name]) == null)
            return false;
        const expectedAmount = name === 'ownerIncome' && !expected.ownerIncome
            ? 0
            : (0, money_1.roundMoney)(Number(expected.amounts[name] || 0));
        return Math.abs((0, money_1.roundMoney)(Number((_b = actual.amounts) === null || _b === void 0 ? void 0 : _b[name])) - expectedAmount) > TOLERANCE;
    });
}
function missingNames(expected, actual) {
    const names = [
        'ownerIncome', 'agentCommission', 'companyCommission', 'journal', 'deposit'
    ];
    return names.filter((name) => expected[name] && !actual[name]);
}
function proposedJournal(payment) {
    var _a, _b, _c, _d;
    const amount = (0, money_1.roundMoney)(Math.max(0, Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0)));
    if (!(amount > 0))
        return null;
    const details = (payment === null || payment === void 0 ? void 0 : payment.commissionDetails) || {};
    const levyAmount = (0, money_1.roundMoney)(Number((_b = (_a = details.levy) !== null && _a !== void 0 ? _a : payment === null || payment === void 0 ? void 0 : payment.levyAllocated) !== null && _b !== void 0 ? _b : 0));
    const domain = (0, transactionDomain_1.historicalTransactionDomain)(payment);
    const allocation = (0, paymentAllocation_1.allocateRentalReceipt)({
        amount,
        rent: (0, money_1.roundMoney)(Number((_d = (_c = payment === null || payment === void 0 ? void 0 : payment.rentAllocated) !== null && _c !== void 0 ? _c : details.commissionBase) !== null && _d !== void 0 ? _d : amount - levyAmount)),
        levy: levyAmount,
        commissionBase: (0, money_1.roundMoney)(Number(details.commissionBase || 0)),
        commissionNet: (0, money_1.roundMoney)(Number(details.commissionNet || details.totalCommission || 0)),
        vatOnCommission: snapshotVat(payment)
    });
    const journal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
        paymentType: domain === 'SALE' ? 'sale' : 'rental',
        amount,
        ownerAmount: allocation.ownerPayable,
        commissionNet: allocation.commissionNet,
        vatAmount: snapshotVat(payment) + (0, money_1.roundMoney)(Number((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0)),
        levyAmount: domain === 'SALE' ? 0 : allocation.levyPayable
    });
    return {
        lines: journal.lines.map((line) => ({
            accountCode: line.accountCode,
            debit: (0, money_1.roundMoney)(Number(line.debit || 0)),
            credit: (0, money_1.roundMoney)(Number(line.credit || 0))
        })),
        balanced: journal.balanced && (0, journalRecoveryAssessment_1.canonicalReceiptJournalBalance)(payment).balanced
    };
}
function finish(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const missing = input.missing || [];
    const recordsToCreate = input.recordsToCreate || [];
    const fingerprint = JSON.stringify({
        paymentId: String(((_a = input.payment) === null || _a === void 0 ? void 0 : _a._id) || ''),
        amount: (0, money_1.roundMoney)(Number(((_b = input.payment) === null || _b === void 0 ? void 0 : _b.amount) || 0)),
        deposit: (0, money_1.roundMoney)(Number(((_c = input.payment) === null || _c === void 0 ? void 0 : _c.depositAmount) || 0)),
        notes: String(((_d = input.payment) === null || _d === void 0 ? void 0 : _d.notes) || ''),
        snapshot: ((_e = input.payment) === null || _e === void 0 ? void 0 : _e.commissionDetails) || null,
        missing,
        periodCode: input.periodCode,
        classification: input.classification
    });
    return {
        paymentId: String(((_f = input.payment) === null || _f === void 0 ? void 0 : _f._id) || ''),
        reference: String(((_g = input.payment) === null || _g === void 0 ? void 0 : _g.referenceNumber) || ''),
        propertyId: String(((_h = input.payment) === null || _h === void 0 ? void 0 : _h.propertyId) || ''),
        classification: input.classification,
        confidence: input.confidence,
        missing,
        mismatched: input.mismatched || [],
        duplicates: input.duplicates || [],
        recordsToCreate,
        amountsToPost: input.amountsToPost || {},
        journalLines: input.journalLines || null,
        journalBalanced: Boolean(input.journalBalanced),
        periodCode: input.periodCode,
        vatEligibility: input.vatEligibility,
        recommendedAction: input.recommendedAction,
        fingerprint,
        writes: false
    };
}
function classifyHistoricalAccountingCase(input) {
    const payment = input.payment || {};
    const duplicates = duplicateNames(input.actual);
    const mismatched = mismatchedNames(input.expected, input.actual);
    const missing = missingNames(input.expected, input.actual);
    const explained = (0, accountingIntegrityClassification_1.receiptExplainedByCommissionSnapshot)(payment) || (0, accountingPostingPolicy_1.isDepositOnlyPayment)(payment) || (0, paymentReversalPolicy_1.isReversalDocument)(payment);
    const journal = missing.includes('journal') ? proposedJournal(payment) : null;
    const amounts = Object.fromEntries(missing.map((name) => [name, (0, money_1.roundMoney)(Number(input.expected.amounts[name] || 0))]));
    if ((0, paymentReversalPolicy_1.isReversalDocument)(payment) || input.expected.reason === 'reversed_original' || input.expected.reason === 'reversal_row') {
        return finish({
            payment,
            classification: 'REQUIRES MANUAL INVESTIGATION',
            confidence: 'low',
            periodCode: input.periodCode,
            vatEligibility: input.vatReason,
            recommendedAction: 'Reconcile the original receipt and its reversal together. Do not recreate the positive receipt.'
        });
    }
    if ((0, accountingPostingPolicy_1.isDepositOnlyPayment)(payment) || input.expected.reason === 'deposit_only') {
        return finish({
            payment,
            classification: missing.includes('deposit') ? 'REQUIRES MANUAL INVESTIGATION' : 'ALREADY COMPLETE',
            confidence: missing.includes('deposit') ? 'low' : 'high',
            missing: missing.includes('deposit') ? ['deposit'] : [],
            periodCode: input.periodCode,
            vatEligibility: 'not_applicable',
            recommendedAction: 'Deposit-only cash is not rental income or rental commission. No rental projection is proposed.'
        });
    }
    if (duplicates.length) {
        return finish({
            payment,
            classification: 'DUPLICATE SUSPECTED',
            confidence: 'low',
            duplicates,
            periodCode: input.periodCode,
            vatEligibility: input.vatReason,
            recommendedAction: 'An equivalent record already exists. Do not create another journal or projection.'
        });
    }
    if (mismatched.length) {
        return finish({
            payment,
            classification: 'FINANCIAL MISMATCH',
            confidence: 'low',
            mismatched,
            periodCode: input.periodCode,
            vatEligibility: input.vatReason,
            recommendedAction: 'An existing amount disagrees with the original snapshot. It is not replaced or deleted.'
        });
    }
    if (input.rateDisagrees) {
        return finish({
            payment,
            classification: 'REQUIRES MANUAL INVESTIGATION',
            confidence: 'low',
            periodCode: input.periodCode,
            vatEligibility: input.vatReason,
            recommendedAction: 'The stored commission rate is not changed by reconciliation. Review the original arrangement before any allocation change.'
        });
    }
    if (snapshotVat(payment) > 0.005 && !input.vatRecognise) {
        return finish({
            payment,
            classification: 'HISTORICAL VAT REVIEW',
            confidence: 'low',
            periodCode: input.periodCode,
            vatEligibility: input.vatReason,
            recommendedAction: 'Snapshot VAT is not authority for a liability. Use the separate historical VAT recognition workflow after the required evidence and approval.'
        });
    }
    if (!missing.length) {
        return finish({
            payment,
            classification: 'ALREADY COMPLETE',
            confidence: 'high',
            periodCode: input.periodCode,
            vatEligibility: input.vatReason,
            journalBalanced: input.actual.journal ? true : false,
            recommendedAction: 'The required records already exist and agree. Nothing is created.'
        });
    }
    if (!explained || (missing.includes('journal') && !(journal === null || journal === void 0 ? void 0 : journal.balanced))) {
        return finish({
            payment,
            classification: 'REQUIRES MANUAL INVESTIGATION',
            confidence: 'low',
            missing,
            periodCode: input.periodCode,
            vatEligibility: input.vatReason,
            recommendedAction: 'The original snapshot does not support a balanced journal. No record is proposed.'
        });
    }
    if (input.periodCode !== 'OPEN') {
        return finish({
            payment,
            classification: 'REQUIRES ACCOUNTANT APPROVAL',
            confidence: 'medium',
            missing,
            recordsToCreate: missing,
            amountsToPost: amounts,
            journalLines: missing.includes('journal') ? (journal === null || journal === void 0 ? void 0 : journal.lines) || null : null,
            journalBalanced: Boolean(journal === null || journal === void 0 ? void 0 : journal.balanced),
            periodCode: input.periodCode,
            vatEligibility: input.vatReason,
            recommendedAction: 'The receipt period is not open. Do not post the missing record into a different open period, and do not reopen the historical period automatically.'
        });
    }
    return finish({
        payment,
        classification: 'SAFE TO REPAIR',
        confidence: 'high',
        missing,
        recordsToCreate: missing,
        amountsToPost: amounts,
        journalLines: missing.includes('journal') ? (journal === null || journal === void 0 ? void 0 : journal.lines) || null : null,
        journalBalanced: !missing.includes('journal') || Boolean(journal === null || journal === void 0 ? void 0 : journal.balanced),
        periodCode: input.periodCode,
        vatEligibility: input.vatReason,
        recommendedAction: 'Create only the missing records through the normal payment accounting workflow. Existing correct records stay untouched.'
    });
}
function assessHistoricalAccountingPayment(paymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const payment = yield Payment_1.Payment.findById(paymentId).lean();
        if (!payment) {
            return finish({
                payment: { _id: paymentId },
                classification: 'REQUIRES MANUAL INVESTIGATION',
                confidence: 'low',
                periodCode: 'MISSING',
                vatEligibility: 'missing_payment',
                recommendedAction: 'Payment was not found. Nothing is created.'
            });
        }
        const [property, period, vat] = yield Promise.all([
            payment.propertyId ? Property_1.Property.findById(payment.propertyId).select('commission').lean() : null,
            (0, accountingPeriodService_1.findPeriodForDate)(String(payment.companyId), new Date(payment.paymentDate || Date.now())),
            (0, vatPolicyService_1.assessVatPayableJournal)({ payment })
        ]);
        const expected = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(payment);
        const actual = yield (0, paymentAccountingReconciliation_1.loadAccountingActualSnapshot)(payment);
        return classifyHistoricalAccountingCase({
            payment,
            expected,
            actual,
            vatRecognise: vat.recognise,
            vatReason: vat.reason,
            periodCode: (period === null || period === void 0 ? void 0 : period.status) === 'OPEN' ? 'OPEN' : ((period === null || period === void 0 ? void 0 : period.status) || 'PERIOD_NOT_ESTABLISHED'),
            rateDisagrees: (0, accountingIntegrityClassification_1.commissionRateDisagrees)(payment, property === null || property === void 0 ? void 0 : property.commission)
        });
    });
}
function dryRunCompanyHistoricalAccounting(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const payments = yield Payment_1.Payment.find({
            companyId,
            status: { $in: ['completed', 'reversed'] },
            isProvisional: { $ne: true },
            paymentType: { $ne: 'sale' }
        }).select('_id').limit(5000).lean();
        const rows = [];
        for (const payment of payments) {
            rows.push(yield assessHistoricalAccountingPayment(String(payment._id)));
        }
        const counts = Object.fromEntries(exports.REPAIR_CLASSES.map((name) => [name, 0]));
        for (const row of rows)
            counts[row.classification] += 1;
        return { investigated: rows.length, counts, rows, writes: false };
    });
}
function executeHistoricalAccountingRepair(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (input.confirm !== true)
            return { ok: false, result: 'aborted', reason: 'EXPLICIT_AUTHORISATION_REQUIRED', created: [] };
        const reason = String(input.reason || '').trim();
        if (reason.length < 10)
            return { ok: false, result: 'aborted', reason: 'REPAIR_REASON_REQUIRED', created: [] };
        const payment = yield Payment_1.Payment.findOne({ _id: input.paymentId, companyId: input.companyId }).lean();
        if (!payment)
            return { ok: false, result: 'aborted', reason: 'PAYMENT_NOT_FOUND', created: [] };
        const assessment = yield assessHistoricalAccountingPayment(String(payment._id));
        const snapshotBefore = JSON.stringify(payment.commissionDetails || null);
        if (assessment.classification !== 'SAFE TO REPAIR' || assessment.fingerprint !== input.fingerprint) {
            yield HistoricalAccountingRepair_1.HistoricalAccountingRepair.create({
                companyId: payment.companyId,
                paymentId: payment._id,
                referenceNumber: String(payment.referenceNumber || ''),
                propertyId: payment.propertyId,
                classification: assessment.classification,
                fingerprint: assessment.fingerprint,
                originalState: { missing: assessment.missing, periodCode: assessment.periodCode },
                expectedState: { recordsToCreate: assessment.recordsToCreate, amountsToPost: assessment.amountsToPost },
                recordsCreated: [],
                amountsPosted: {},
                reason,
                authorisedBy: new mongoose_1.default.Types.ObjectId(input.authorisedBy),
                result: 'aborted',
                verification: assessment.fingerprint === input.fingerprint
                    ? 'The receipt is not safe to repair.'
                    : 'The receipt changed after the dry run. The repair was aborted.'
            });
            return {
                ok: false,
                result: 'aborted',
                reason: assessment.fingerprint === input.fingerprint ? assessment.classification : 'SOURCE_CHANGED',
                created: []
            };
        }
        const posted = yield (0, paymentAccountingOrchestrator_1.postPaymentAccounting)(String(payment._id), { createdBy: input.authorisedBy });
        const after = yield assessHistoricalAccountingPayment(String(payment._id));
        const snapshotAfter = JSON.stringify(((_a = ((yield Payment_1.Payment.findById(payment._id).select('commissionDetails').lean()))) === null || _a === void 0 ? void 0 : _a.commissionDetails) || null);
        const created = assessment.recordsToCreate.filter((name) => !after.missing.includes(name));
        const snapshotPreserved = snapshotBefore === snapshotAfter;
        const verified = after.classification === 'ALREADY COMPLETE' && snapshotPreserved && posted.status !== 'failed';
        yield HistoricalAccountingRepair_1.HistoricalAccountingRepair.create({
            companyId: payment.companyId,
            paymentId: payment._id,
            referenceNumber: String(payment.referenceNumber || ''),
            propertyId: payment.propertyId,
            classification: assessment.classification,
            fingerprint: assessment.fingerprint,
            originalState: { missing: assessment.missing },
            expectedState: { recordsToCreate: assessment.recordsToCreate, amountsToPost: assessment.amountsToPost, journalLines: assessment.journalLines },
            recordsCreated: created,
            amountsPosted: assessment.amountsToPost,
            reason,
            authorisedBy: new mongoose_1.default.Types.ObjectId(input.authorisedBy),
            result: verified ? 'posted' : 'failed',
            verification: verified
                ? 'Missing records now exist once. The original snapshot was not rewritten.'
                : `Post status ${posted.status}. Remaining missing: ${after.missing.join(', ') || 'none'}. Snapshot preserved: ${snapshotPreserved}.`
        });
        return {
            ok: verified,
            result: verified ? 'posted' : 'failed',
            created,
            snapshotPreserved,
            duplicateRunLeavesExistingRecords: true
        };
    });
}
