"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExpectedAccountingProjection = buildExpectedAccountingProjection;
exports.deriveAccountingComplete = deriveAccountingComplete;
exports.evaluateAccountingReconciliation = evaluateAccountingReconciliation;
exports.buildAccountingRepairPlan = buildAccountingRepairPlan;
exports.deriveAccountingStatus = deriveAccountingStatus;
exports.buildAccountingIntegrityCandidateFilter = buildAccountingIntegrityCandidateFilter;
exports.isHistoricalUntrackedPayment = isHistoricalUntrackedPayment;
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
const paymentAccountingCompleteness_1 = require("./paymentAccountingCompleteness");
const commissionProjection_1 = require("./commissionProjection");
const money_1 = require("../utils/money");
const emptyAmounts = () => ({
    ownerIncome: 0,
    agentCommission: 0,
    companyCommission: 0,
    journal: 0,
    vat: 0,
    deposit: 0
});
const emptyExpected = (reason) => ({
    policyAllowed: false,
    reason,
    ownerIncome: false,
    agentCommission: false,
    companyCommission: false,
    journal: false,
    vat: false,
    deposit: false,
    amounts: emptyAmounts()
});
function vatAmountOnPayment(payment) {
    var _a;
    return (0, money_1.roundMoney)(Number(((_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0)
        + Number((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0));
}
function passThroughTotalFromPayment(payment) {
    return (0, money_1.roundMoney)(Number((payment === null || payment === void 0 ? void 0 : payment.levyAllocated) || 0));
}
function expectedOwnerIncomeAmount(payment) {
    var _a;
    const isSale = String((payment === null || payment === void 0 ? void 0 : payment.paymentType) || '') === 'sale';
    return (0, money_1.roundMoney)((0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({
        isSale,
        ownerAmount: (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount,
        passThroughTotal: passThroughTotalFromPayment(payment)
    }));
}
function expectedAgentCommissionAmount(payment) {
    return (0, money_1.roundMoney)((0, commissionProjection_1.projectCommissionLanes)(payment).reduce((sum, lane) => sum + Number(lane.amount || 0), 0));
}
/**
 * Deterministic expected accounting projection for a payment.
 * Reuses production posting policy, stored commissionDetails, and commission lanes.
 * Does not recompute commission/VAT/owner formulas.
 */
function buildExpectedAccountingProjection(payment) {
    var _a;
    if (!payment)
        return emptyExpected('missing_payment');
    const policy = (0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)(payment);
    const depositExpected = Number(payment.depositAmount || 0) > 0
        && !payment.reversalOfPaymentId
        && Number(payment.amount || 0) >= 0
        && String(payment.status || '') === 'completed'
        && payment.isProvisional !== true
        && payment.isInSuspense !== true;
    const amounts = emptyAmounts();
    amounts.deposit = depositExpected ? (0, money_1.roundMoney)(Number(payment.depositAmount || 0)) : 0;
    if (!policy.allowed) {
        if (policy.reason === 'deposit_only' || (0, accountingPostingPolicy_1.isDepositOnlyPayment)(payment)) {
            return Object.assign(Object.assign({}, emptyExpected(policy.reason || 'deposit_only')), { deposit: depositExpected, amounts });
        }
        return emptyExpected(policy.reason);
    }
    const computedIncome = expectedOwnerIncomeAmount(payment);
    const agentAmount = expectedAgentCommissionAmount(payment);
    const agencyShare = (0, money_1.roundMoney)(Number(((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agencyShare) || 0));
    const amount = (0, money_1.roundMoney)(Number(payment.amount || 0));
    const journalExpected = !policy.skipJournal && amount > 0;
    const vatExpected = journalExpected && vatAmountOnPayment(payment) > 0;
    amounts.ownerIncome = computedIncome;
    amounts.agentCommission = agentAmount;
    amounts.companyCommission = agencyShare;
    amounts.journal = amount;
    amounts.vat = vatAmountOnPayment(payment);
    return {
        policyAllowed: true,
        reason: policy.reason,
        // Positive cash with a zero owner share is not fully accounted.
        // Do not invent an income row; leave the component missing.
        ownerIncome: !policy.skipOwnerIncome && amount > 0,
        agentCommission: !policy.skipAgentCommission && agentAmount > 0,
        companyCommission: !policy.skipCompanyCommission && agencyShare > 0,
        journal: journalExpected,
        vat: vatExpected,
        deposit: depositExpected,
        amounts
    };
}
function deriveAccountingComplete(status) {
    return status === 'complete' || status === 'not_applicable';
}
function compareComponent(input) {
    const { paymentId, component, required, present, expectedAmount, actualAmount, linkedPaymentId, duplicateCount } = input;
    if (!required) {
        const unexpectedAmount = present
            && actualAmount != null
            && Number.isFinite(Number(actualAmount))
            && (0, money_1.roundMoney)(Number(actualAmount)) > 0
            && (0, money_1.roundMoney)(Number(expectedAmount || 0)) <= 0;
        if (unexpectedAmount) {
            return {
                status: 'MISMATCHED',
                issue: {
                    component,
                    expected: 0,
                    actual: (0, money_1.roundMoney)(Number(actualAmount)),
                    difference: (0, money_1.roundMoney)(Number(actualAmount)),
                    status: 'MISMATCHED',
                    paymentId
                }
            };
        }
        return { status: 'NOT_APPLICABLE' };
    }
    if (!present) {
        return {
            status: 'MISSING',
            issue: {
                component,
                expected: expectedAmount,
                actual: 'MISSING',
                difference: 'missing',
                status: 'MISSING',
                paymentId
            }
        };
    }
    if (linkedPaymentId && String(linkedPaymentId) !== String(paymentId)) {
        return {
            status: 'MISMATCHED',
            issue: {
                component,
                expected: paymentId,
                actual: linkedPaymentId,
                difference: 'paymentId mismatch',
                status: 'MISMATCHED',
                paymentId
            }
        };
    }
    if (Number(duplicateCount || 0) > 1) {
        return {
            status: 'MISMATCHED',
            issue: {
                component,
                expected: 1,
                actual: Number(duplicateCount),
                difference: Number(duplicateCount) - 1,
                status: 'MISMATCHED',
                paymentId
            }
        };
    }
    if (actualAmount == null || !Number.isFinite(Number(actualAmount))) {
        return { status: 'VALID' };
    }
    if (!(0, money_1.moneyAmountsMatch)(expectedAmount, actualAmount)) {
        return {
            status: 'MISMATCHED',
            issue: {
                component,
                expected: (0, money_1.roundMoney)(expectedAmount),
                actual: (0, money_1.roundMoney)(actualAmount),
                difference: (0, money_1.moneyDifference)(expectedAmount, actualAmount),
                status: 'MISMATCHED',
                paymentId
            }
        };
    }
    return { status: 'VALID' };
}
function evaluateAccountingReconciliation(input) {
    var _a, _b, _c;
    const { paymentId, propertyId, expected, actual } = input;
    const ownerIncomeRequired = Boolean(expected.ownerIncome);
    const componentStatus = {};
    const missing = [];
    const mismatched = [];
    const issues = [];
    const checks = [
        { component: 'ownerIncome', required: ownerIncomeRequired, present: Boolean(actual.ownerIncome), expectedAmount: expected.amounts.ownerIncome },
        { component: 'agentCommission', required: expected.agentCommission, present: Boolean(actual.agentCommission), expectedAmount: expected.amounts.agentCommission },
        { component: 'companyCommission', required: expected.companyCommission, present: Boolean(actual.companyCommission), expectedAmount: expected.amounts.companyCommission },
        { component: 'journal', required: expected.journal, present: Boolean(actual.journal), expectedAmount: expected.amounts.journal },
        { component: 'vat', required: expected.vat, present: Boolean(actual.vat), expectedAmount: expected.amounts.vat },
        { component: 'deposit', required: expected.deposit, present: Boolean(actual.deposit), expectedAmount: expected.amounts.deposit }
    ];
    for (const check of checks) {
        const compared = compareComponent({
            paymentId,
            component: check.component,
            required: check.required,
            present: check.present,
            expectedAmount: check.expectedAmount,
            actualAmount: (_a = actual.amounts) === null || _a === void 0 ? void 0 : _a[check.component],
            linkedPaymentId: (_b = actual.linkedPaymentIds) === null || _b === void 0 ? void 0 : _b[check.component],
            duplicateCount: (_c = actual.duplicates) === null || _c === void 0 ? void 0 : _c[check.component]
        });
        componentStatus[check.component] = compared.status;
        if (compared.status === 'MISSING')
            missing.push(check.component);
        if (compared.status === 'MISMATCHED')
            mismatched.push(check.component);
        if (compared.issue)
            issues.push(compared.issue);
    }
    const anyExpected = expected.ownerIncome
        || expected.agentCommission
        || expected.companyCommission
        || expected.journal
        || expected.vat
        || expected.deposit;
    if (!anyExpected) {
        return {
            paymentId,
            propertyId,
            expected,
            actual,
            status: 'not_applicable',
            accountingComplete: true,
            missing: [],
            mismatched: [],
            issues: [],
            componentStatus
        };
    }
    if (missing.length === 0 && mismatched.length === 0) {
        return {
            paymentId,
            propertyId,
            expected,
            actual,
            status: 'complete',
            accountingComplete: true,
            missing,
            mismatched,
            issues,
            componentStatus
        };
    }
    return {
        paymentId,
        propertyId,
        expected,
        actual,
        status: 'incomplete',
        accountingComplete: false,
        missing,
        mismatched,
        issues,
        componentStatus
    };
}
function buildAccountingRepairPlan(recon) {
    const present = [];
    if (recon.actual.ownerIncome)
        present.push('ownerIncome');
    if (recon.actual.agentCommission)
        present.push('agentCommission');
    if (recon.actual.companyCommission)
        present.push('companyCommission');
    if (recon.actual.journal)
        present.push('journal');
    if (recon.actual.vat)
        present.push('vat');
    if (recon.actual.deposit)
        present.push('deposit');
    const mismatched = recon.mismatched || [];
    return {
        paymentId: recon.paymentId,
        accountingComplete: recon.accountingComplete,
        missing: recon.missing,
        mismatched,
        wouldCreate: [...recon.missing],
        wouldNotModify: present.filter((c) => !mismatched.includes(c)),
        requiresManualReview: [...mismatched]
    };
}
/** Diagnostic only. Never treat pending/partial/failed as accountingComplete. */
function deriveAccountingStatus(input) {
    if (input.reconStatus === 'complete')
        return 'posted';
    if (input.reconStatus === 'not_applicable')
        return 'not_applicable';
    return 'incomplete';
}
/**
 * Integrity watchdog candidates: explicit incomplete tracking only.
 * Historical payments without accountingComplete/accountingStatus are never selected.
 */
function buildAccountingIntegrityCandidateFilter() {
    return {
        $or: [
            { accountingComplete: false },
            { accountingStatus: { $in: ['pending', 'partial', 'failed', 'incomplete'] } }
        ]
    };
}
function isHistoricalUntrackedPayment(payment) {
    return (payment === null || payment === void 0 ? void 0 : payment.accountingComplete) == null && !(payment === null || payment === void 0 ? void 0 : payment.accountingStatus);
}
