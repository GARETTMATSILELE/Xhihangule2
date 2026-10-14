"use strict";
/**
 * Read-only classification of PropertyAccount duplicate groups.
 * A duplicate is the same propertyId and the same ledgerType with more than one
 * active, non-archived account. A rental ledger and a sale ledger for one property
 * are a lifecycle pair, not a duplicate.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyDuplicateGroup = classifyDuplicateGroup;
exports.classifyLedgerTransactionDuplicates = classifyLedgerTransactionDuplicates;
exports.rentalAndSaleAreNotDuplicates = rentalAndSaleAreNotDuplicates;
const completed = (status) => String(status || 'completed') === 'completed';
const paymentKey = (tx) => {
    if (tx.paymentId)
        return `payment:${String(tx.paymentId)}`;
    return `line:${tx.type || ''}:${tx.category || ''}:${Number(tx.amount || 0)}`;
};
const hasFinancialHistory = (account) => {
    const txs = account.transactions || [];
    const payouts = account.ownerPayouts || [];
    return txs.some((tx) => Number(tx.amount || 0) !== 0) || payouts.some((payout) => Number(payout.amount || 0) !== 0);
};
const activeNonArchived = (account) => account.isArchived !== true && account.isActive !== false;
function classifyDuplicateGroup(propertyId, ledgerType, accounts) {
    var _a;
    const active = accounts.filter(activeNonArchived);
    const ids = active.map((account) => account.id);
    if (active.length <= 1) {
        return {
            propertyId,
            ledgerType,
            classification: 'SAFE_DUPLICATE',
            keeperId: (_a = active[0]) === null || _a === void 0 ? void 0 : _a.id,
            reason: 'Fewer than two active accounts for this property and ledger.',
            automaticMergeAllowed: false,
            accountIds: ids
        };
    }
    const withHistory = active.filter(hasFinancialHistory);
    const empty = active.filter((account) => !hasFinancialHistory(account));
    if (withHistory.length === 0) {
        const oldest = [...active].sort((a, b) => {
            const left = new Date(a.createdAt || 0).getTime();
            const right = new Date(b.createdAt || 0).getTime();
            return left - right;
        })[0];
        return {
            propertyId,
            ledgerType,
            classification: 'SAFE_DUPLICATE',
            keeperId: oldest.id,
            reason: 'Active duplicates contain no financial amounts. Oldest account is the keeper.',
            automaticMergeAllowed: true,
            accountIds: ids
        };
    }
    if (withHistory.length === 1 && empty.length === active.length - 1) {
        return {
            propertyId,
            ledgerType,
            classification: 'SAFE_DUPLICATE',
            keeperId: withHistory[0].id,
            reason: 'Only one active account holds financial history. Empty shells can be archived after a controlled merge.',
            automaticMergeAllowed: true,
            accountIds: ids
        };
    }
    const incomeByPayment = new Map();
    for (const account of withHistory) {
        for (const tx of account.transactions || []) {
            if (tx.type !== 'income' || !completed(tx.status) || !tx.paymentId)
                continue;
            const key = paymentKey(tx);
            const previous = incomeByPayment.get(key);
            if (previous && (previous.accountId !== account.id || previous.amount !== Number(tx.amount || 0))) {
                return {
                    propertyId,
                    ledgerType,
                    classification: 'CONFLICTING_HISTORY',
                    reason: 'Completed income for the same payment exists on more than one account or with different amounts.',
                    automaticMergeAllowed: false,
                    accountIds: ids
                };
            }
            if (!previous)
                incomeByPayment.set(key, { accountId: account.id, amount: Number(tx.amount || 0) });
        }
    }
    const distinctIncomeAccounts = new Set(withHistory
        .filter((account) => (account.transactions || []).some((tx) => tx.type === 'income' && completed(tx.status) && Number(tx.amount || 0) !== 0))
        .map((account) => account.id));
    if (distinctIncomeAccounts.size > 1) {
        return {
            propertyId,
            ledgerType,
            classification: 'CONFLICTING_HISTORY',
            reason: 'Completed income is split across more than one active account.',
            automaticMergeAllowed: false,
            accountIds: ids
        };
    }
    const payoutAccounts = withHistory.filter((account) => (account.ownerPayouts || []).some((payout) => Number(payout.amount || 0) !== 0));
    if (payoutAccounts.length > 1) {
        return {
            propertyId,
            ledgerType,
            classification: 'REQUIRES_MANUAL_REVIEW',
            reason: 'Owner payouts exist on more than one active account. An accountant must choose the keeper.',
            automaticMergeAllowed: false,
            accountIds: ids
        };
    }
    return {
        propertyId,
        ledgerType,
        classification: 'POSSIBLE_DUPLICATE',
        reason: 'More than one active account has financial rows. Automatic keeper selection is not proven safe.',
        automaticMergeAllowed: false,
        accountIds: ids
    };
}
const isReversalIncomeLine = (line) => {
    if (line.reversesPaymentId)
        return true;
    if (String(line.category || '') === 'payment_reversal')
        return true;
    return String(line.idempotencyKey || '').includes(':reversal');
};
/**
 * Classify income rows inside one inspection set.
 * A reversal counter-entry is never a duplicate of the original income.
 * Rows on different ledgers are not an automatic cleanup group.
 * Differing amounts or categories are preserved for review.
 */
function classifyLedgerTransactionDuplicates(lines) {
    const income = (lines || []).filter((line) => line.type === 'income' && completed(line.status) && line.paymentId && !isReversalIncomeLine(line));
    const groups = new Map();
    for (const line of income) {
        const key = String(line.paymentId);
        const current = groups.get(key) || [];
        current.push(line);
        groups.set(key, current);
    }
    const cancelIds = [];
    for (const [paymentId, group] of groups) {
        if (group.length <= 1)
            continue;
        const ledgers = new Set(group.map((line) => String(line.ledgerType || '')).filter(Boolean));
        if (ledgers.size > 1) {
            return {
                classification: 'NOT_A_DUPLICATE_FOR_AUTOMATIC_CLEANUP',
                cancelIds: [],
                reason: `Payment ${paymentId} appears on more than one ledger. Those rows are not an automatic duplicate.`
            };
        }
        const amounts = new Set(group.map((line) => Number(line.amount || 0).toFixed(2)));
        const categories = new Set(group.map((line) => String(line.category || '')));
        if (amounts.size > 1 || categories.size > 1) {
            return {
                classification: 'REQUIRES_REVIEW',
                cancelIds: [],
                reason: `Payment ${paymentId} has completed income rows that are not identical. Nothing was cancelled.`
            };
        }
        const sorted = [...group].sort((left, right) => new Date(left.date || 0).getTime() - new Date(right.date || 0).getTime());
        cancelIds.push(...sorted.slice(1).map((line) => String(line._id || '')).filter(Boolean));
    }
    if (cancelIds.length > 0) {
        return {
            classification: 'SAFE_IDENTICAL',
            cancelIds,
            reason: 'Later identical completed income rows for the same payment on the same ledger may be cancelled by an explicit confirmed action.'
        };
    }
    return {
        classification: 'NOT_DUPLICATE',
        cancelIds: [],
        reason: 'No identical duplicate income rows. Reversal lines are not duplicates.'
    };
}
function rentalAndSaleAreNotDuplicates(left, right) {
    const a = String(left.ledgerType || '');
    const b = String(right.ledgerType || '');
    return (a === 'rental' && b === 'sale') || (a === 'sale' && b === 'rental');
}
