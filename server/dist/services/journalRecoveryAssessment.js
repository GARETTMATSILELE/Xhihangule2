"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptJournalSourceModule = receiptJournalSourceModule;
exports.receiptJournalReference = receiptJournalReference;
exports.classifyReceiptJournals = classifyReceiptJournals;
exports.canonicalReceiptJournalBalance = canonicalReceiptJournalBalance;
exports.paymentIsReversed = paymentIsReversed;
exports.assessControlledRecovery = assessControlledRecovery;
exports.classifyRecoveryApproval = classifyRecoveryApproval;
const money_1 = require("../utils/money");
const transactionDomain_1 = require("./transactionDomain");
const paymentAllocation_1 = require("./tax/paymentAllocation");
const principalAgentJournal_1 = require("./tax/principalAgentJournal");
const paymentReversalPolicy_1 = require("./paymentReversalPolicy");
function idText(value) {
    if (value == null)
        return '';
    return String(value);
}
function receiptJournalSourceModule(payment) {
    const domain = (0, transactionDomain_1.historicalTransactionDomain)(payment);
    if (domain === 'SALE')
        return 'sale';
    if (domain === 'RENTAL')
        return 'payment';
    return null;
}
function receiptJournalReference(payment) {
    const paymentId = idText(payment === null || payment === void 0 ? void 0 : payment._id);
    const reference = String((payment === null || payment === void 0 ? void 0 : payment.referenceNumber) || '').trim();
    return `PAY-${reference || paymentId}`;
}
/**
 * Match a receipt journal only when company, payment id, journal type, and posted status agree.
 * A journal that shares the receipt reference and belongs to another payment is reported and not adopted.
 */
function classifyReceiptJournals(input) {
    const paymentId = String(input.paymentId);
    const companyId = String(input.companyId);
    let ownJournal = null;
    let referenceCollision = null;
    let otherCompanyReference = null;
    for (const journal of input.journals) {
        const status = String(journal.status || 'posted');
        if (status !== 'posted')
            continue;
        const journalCompany = idText(journal.companyId);
        const sourceId = idText(journal.sourceId);
        const sourceModule = String(journal.sourceModule || '');
        const reference = String(journal.reference || '');
        const sameCompany = journalCompany === companyId;
        const samePayment = sourceId === paymentId;
        const receiptType = input.sourceModule != null && sourceModule === input.sourceModule;
        if (sameCompany && samePayment && receiptType) {
            ownJournal = journal;
            continue;
        }
        if (!sameCompany && reference === input.reference) {
            otherCompanyReference = {
                reference,
                companyId: journalCompany,
                journalId: idText(journal._id) || undefined
            };
            continue;
        }
        if (sameCompany && reference === input.reference && !samePayment) {
            referenceCollision = {
                reference,
                otherPaymentId: sourceId || 'unknown',
                journalId: idText(journal._id) || undefined
            };
        }
    }
    return { ownJournal, referenceCollision, otherCompanyReference };
}
function canonicalReceiptJournalBalance(payment) {
    var _a, _b, _c, _d;
    const amount = (0, money_1.roundMoney)(Math.max(0, Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0)));
    const details = (payment === null || payment === void 0 ? void 0 : payment.commissionDetails) || {};
    const vatOnCommission = (0, money_1.roundMoney)(Number(details.vatOnCommission || details.vatAmount || 0));
    const paymentVat = (0, money_1.roundMoney)(Number((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0));
    const totalVat = (0, money_1.roundMoney)(vatOnCommission + paymentVat);
    const commissionNet = (0, money_1.roundMoney)(Number(details.commissionNet || details.totalCommission || 0));
    const levyAmount = (0, money_1.roundMoney)(Number((_b = (_a = details.levy) !== null && _a !== void 0 ? _a : payment === null || payment === void 0 ? void 0 : payment.levyAllocated) !== null && _b !== void 0 ? _b : 0));
    const domain = (0, transactionDomain_1.historicalTransactionDomain)(payment);
    const allocation = (0, paymentAllocation_1.allocateRentalReceipt)({
        amount,
        rent: (0, money_1.roundMoney)(Number((_d = (_c = payment === null || payment === void 0 ? void 0 : payment.rentAllocated) !== null && _c !== void 0 ? _c : details.commissionBase) !== null && _d !== void 0 ? _d : amount - levyAmount)),
        levy: levyAmount,
        commissionBase: (0, money_1.roundMoney)(Number(details.commissionBase || 0)),
        commissionNet,
        vatOnCommission
    });
    const journal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
        paymentType: domain === 'SALE' ? 'sale' : 'rental',
        amount,
        ownerAmount: allocation.ownerPayable,
        commissionNet: allocation.commissionNet,
        vatAmount: totalVat,
        levyAmount: domain === 'SALE' ? 0 : allocation.levyPayable
    });
    const debit = (0, money_1.roundMoney)(journal.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
    const credit = (0, money_1.roundMoney)(journal.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
    return { debit, credit, balanced: amount > 0 && journal.balanced && debit === credit };
}
function paymentIsReversed(payment) {
    return (0, paymentReversalPolicy_1.isReversalDocument)(payment) || (0, paymentReversalPolicy_1.hasReversalInEffect)(payment) || String((payment === null || payment === void 0 ? void 0 : payment.status) || '') === 'reversed';
}
/**
 * Dry-run decision only. It does not post, update, or adopt another payment's journal.
 */
function assessControlledRecovery(input) {
    const blockers = [];
    if (!input.companyMatches)
        blockers.push('company_mismatch');
    if (input.reversed)
        blockers.push('reversed_payment');
    if (input.periodStatus === 'UNMANAGED')
        blockers.push('period_not_established');
    if (input.periodStatus === 'CLOSED' || input.periodStatus === 'SOFT_CLOSED')
        blockers.push(`period_${input.periodStatus.toLowerCase()}`);
    if (!input.journalBalanced)
        blockers.push('journal_unbalanced');
    if (input.referenceCollision)
        blockers.push('receipt_reference_belongs_to_another_payment');
    if (input.otherMismatches.length)
        blockers.push(`mismatched:${input.otherMismatches.join(',')}`);
    if (input.journalPresent)
        blockers.push('receipt_journal_already_posted');
    if (!input.missingJournal && !input.journalPresent && !input.referenceCollision)
        blockers.push('journal_not_required');
    const eligible = input.companyMatches
        && !input.reversed
        && input.periodStatus === 'OPEN'
        && input.journalBalanced
        && !input.referenceCollision
        && input.missingJournal
        && !input.journalPresent
        && input.otherMismatches.length === 0;
    return {
        eligible,
        manualReview: !eligible && (input.referenceCollision || input.otherMismatches.length > 0 || !input.journalBalanced || input.reversed || !input.companyMatches || input.periodStatus !== 'OPEN'),
        blockers,
        checks: {
            financialWrites: false,
            existingOwnJournal: input.journalPresent,
            duplicateReceiptReference: input.referenceCollision,
            otherCompanyReference: input.otherCompanyReference,
            periodStatus: input.periodStatus,
            journalBalanced: input.journalBalanced,
            reversed: input.reversed,
            companyMatches: input.companyMatches
        }
    };
}
function classifyRecoveryApproval(input) {
    const readyForApproval = input.companyMatches
        && !input.reversed
        && input.journalBalanced
        && input.projectionsValid
        && !input.referenceCollision
        && !input.historicalVariance
        && !input.ownerMismatch
        && !(input.depositExpected && input.depositMissing)
        && input.periodStatus === 'OPEN'
        && input.journalMissing;
    if (input.referenceCollision) {
        return {
            exceptionClass: 'REFERENCE COLLISION',
            recommendedAction: 'Do not reassign the existing journal. An accountant must decide which payment owns the receipt reference.',
            readyForApproval: false
        };
    }
    if (input.reversed || !input.companyMatches) {
        return {
            exceptionClass: 'MANUAL REVIEW',
            recommendedAction: 'Keep the payment unchanged until an accountant reviews it.',
            readyForApproval: false
        };
    }
    if (input.historicalVariance || input.ownerMismatch) {
        return {
            exceptionClass: 'HISTORICAL VARIANCE',
            recommendedAction: 'Do not reconstruct the stored owner amount. Any correction must be a separately authorised adjustment.',
            readyForApproval: false
        };
    }
    if (input.depositExpected && input.depositMissing) {
        return {
            exceptionClass: 'DEPOSIT RECONCILIATION',
            recommendedAction: 'Reconcile the deposit ledger before posting. The receipt journal must not include the deposit.',
            readyForApproval: false
        };
    }
    if (input.periodStatus !== 'OPEN') {
        return {
            exceptionClass: 'PERIOD VERIFICATION',
            recommendedAction: 'No OPEN accounting period covers this date. A missing period is not open.',
            readyForApproval: false
        };
    }
    if (!input.journalBalanced || !input.projectionsValid) {
        return {
            exceptionClass: 'MANUAL REVIEW',
            recommendedAction: 'The stored snapshot does not support a balanced recovery journal.',
            readyForApproval: false
        };
    }
    if (readyForApproval) {
        return {
            exceptionClass: 'READY FOR RECOVERY',
            recommendedAction: 'An accountant may approve a single-payment repair through the existing repair pipeline. This screen does not post.',
            readyForApproval: true
        };
    }
    if (input.journalMissing) {
        return {
            exceptionClass: 'MISSING JOURNAL',
            recommendedAction: 'The receipt journal is absent. Confirm the stored snapshot and an OPEN period before using the existing repair pipeline.',
            readyForApproval: false
        };
    }
    return {
        exceptionClass: 'MANUAL REVIEW',
        recommendedAction: 'Keep the payment unchanged until an accountant reviews it.',
        readyForApproval: false
    };
}
