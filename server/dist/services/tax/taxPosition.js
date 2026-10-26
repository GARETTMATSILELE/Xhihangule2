"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isActiveObligation = exports.LEGACY_TO_CANONICAL = exports.UNALLOCATED_PROPERTY = void 0;
exports.buildTaxPosition = buildTaxPosition;
const chartAccounts_1 = require("./chartAccounts");
const taxTypes_1 = require("./taxTypes");
exports.UNALLOCATED_PROPERTY = 'UNALLOCATED';
/** Legacy trust-ledger tax types. VAT here is output VAT withheld on a settlement, not VAT on commission. */
exports.LEGACY_TO_CANONICAL = {
    VAT: 'VAT_OUTPUT',
    VAT_ON_COMMISSION: 'VAT_ON_COMMISSION',
    CGT: 'CAPITAL_GAINS_TAX',
    CGWT: 'CAPITAL_GAINS_WITHHOLDING_TAX'
};
const round = (value) => Number(Number(value || 0).toFixed(2));
const onOrBefore = (value, asOf) => {
    if (!asOf || !value)
        return true;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return true;
    return date.getTime() <= asOf.getTime();
};
const propertyKey = (id) => (id ? String(id) : exports.UNALLOCATED_PROPERTY);
/** An original obligation still in force. Reversal mirror rows and reversed originals are history. */
const isActiveObligation = (row) => {
    if (row.reversalOf)
        return false;
    const status = String(row.status || '');
    return status !== 'REVERSED' && status !== 'ACCOUNTANT_REVIEW';
};
exports.isActiveObligation = isActiveObligation;
const canonicalOfLegacy = (taxType) => exports.LEGACY_TO_CANONICAL[taxType] || taxType;
function buildTaxPosition(input) {
    var _a, _b, _c;
    const asOf = input.asOf;
    const obligations = (input.obligations || []).filter((row) => onOrBefore(row.transactionDate, asOf));
    const payments = (input.payments || []).filter((row) => row.status === 'POSTED' && onOrBefore(row.paymentDate, asOf));
    const discrepancies = [];
    const active = obligations.filter(exports.isActiveObligation);
    const activeById = new Map(active.map((row) => [row.id, row]));
    const seenSource = new Map();
    for (const row of active) {
        if (!row.paymentId)
            continue;
        const key = `${row.paymentId}:${row.taxType}`;
        const prior = seenSource.get(key);
        if (prior) {
            discrepancies.push({
                kind: 'DUPLICATE_OBLIGATION',
                taxType: row.taxType,
                propertyId: propertyKey(row.propertyId),
                propertyName: row.propertyName || propertyKey(row.propertyId),
                canonicalOutstanding: round(row.taxAmount),
                legacyOutstanding: 0,
                difference: round(row.taxAmount),
                detail: `Payment ${row.paymentId} has more than one active ${row.taxType} obligation (${prior} and ${row.id}).`,
                requiresAuthorisation: true
            });
        }
        else {
            seenSource.set(key, row.id);
        }
    }
    const paidByObligation = new Map();
    let unallocatedPayments = 0;
    for (const payment of payments) {
        let room = round(payment.amount);
        let allocated = 0;
        for (const allocation of payment.allocations || []) {
            const amount = round(allocation.amount);
            allocated = round(allocated + amount);
            if (!activeById.has(allocation.taxObligationId)) {
                discrepancies.push({
                    kind: 'ALLOCATION_TO_INACTIVE_OBLIGATION',
                    taxType: allocation.taxType || '',
                    propertyId: exports.UNALLOCATED_PROPERTY,
                    propertyName: exports.UNALLOCATED_PROPERTY,
                    canonicalOutstanding: 0,
                    legacyOutstanding: 0,
                    difference: amount,
                    detail: `Posted payment ${payment.id} allocates ${amount.toFixed(2)} to obligation ${allocation.taxObligationId}, which is not an active obligation.`,
                    requiresAuthorisation: true
                });
                continue;
            }
            const take = round(Math.min(amount, Math.max(0, room)));
            room = round(room - take);
            if (amount - take > 0.005) {
                discrepancies.push({
                    kind: 'PAYMENT_OVER_ALLOCATED',
                    taxType: allocation.taxType || ((_a = activeById.get(allocation.taxObligationId)) === null || _a === void 0 ? void 0 : _a.taxType) || '',
                    propertyId: propertyKey((_b = activeById.get(allocation.taxObligationId)) === null || _b === void 0 ? void 0 : _b.propertyId),
                    propertyName: ((_c = activeById.get(allocation.taxObligationId)) === null || _c === void 0 ? void 0 : _c.propertyName) || exports.UNALLOCATED_PROPERTY,
                    canonicalOutstanding: 0,
                    legacyOutstanding: 0,
                    difference: round(amount - take),
                    detail: `Payment ${payment.id} allocations exceed the payment amount ${round(payment.amount).toFixed(2)}. Excess was not applied.`,
                    requiresAuthorisation: true
                });
            }
            paidByObligation.set(allocation.taxObligationId, round((paidByObligation.get(allocation.taxObligationId) || 0) + take));
        }
        if (allocated - round(payment.amount) > 0.005 && !discrepancies.some((item) => item.kind === 'PAYMENT_OVER_ALLOCATED' && item.detail.includes(payment.id))) {
            discrepancies.push({
                kind: 'PAYMENT_OVER_ALLOCATED',
                taxType: '',
                propertyId: exports.UNALLOCATED_PROPERTY,
                propertyName: exports.UNALLOCATED_PROPERTY,
                canonicalOutstanding: 0,
                legacyOutstanding: 0,
                difference: round(allocated - payment.amount),
                detail: `Payment ${payment.id} allocations ${allocated.toFixed(2)} exceed payment amount ${round(payment.amount).toFixed(2)}.`,
                requiresAuthorisation: true
            });
        }
        unallocatedPayments = round(unallocatedPayments + round(payment.unallocatedAmount || 0));
    }
    const buckets = new Map();
    const ensure = (taxType, propertyId, propertyName) => {
        if (!buckets.has(taxType))
            buckets.set(taxType, new Map());
        const byProperty = buckets.get(taxType);
        const existing = byProperty.get(propertyId);
        if (existing) {
            if (existing.propertyName === propertyId && propertyName && propertyName !== propertyId)
                existing.propertyName = propertyName;
            return existing;
        }
        const created = { propertyId, propertyName: propertyName || propertyId, recognised: 0, paid: 0, outstanding: 0, reversed: 0, lines: [] };
        byProperty.set(propertyId, created);
        return created;
    };
    for (const row of obligations) {
        const key = propertyKey(row.propertyId);
        const bucket = ensure(row.taxType, key, row.propertyName || key);
        if (!(0, exports.isActiveObligation)(row)) {
            if (String(row.status) === 'REVERSED' && !row.reversalOf) {
                bucket.reversed = round(bucket.reversed + round(row.taxAmount));
            }
            continue;
        }
        const recognised = round(row.taxAmount);
        const paid = round(Math.min(recognised, paidByObligation.get(row.id) || 0));
        const settled = row.status === 'PAID' || row.status === 'RECONCILED';
        const outstanding = settled ? 0 : round(Math.max(0, recognised - paid));
        bucket.recognised = round(bucket.recognised + recognised);
        bucket.paid = round(bucket.paid + paid);
        bucket.outstanding = round(bucket.outstanding + outstanding);
        bucket.lines.push({
            obligationId: row.id,
            paymentId: row.paymentId,
            taxPeriod: row.taxPeriod,
            status: row.status,
            recognised,
            paid,
            outstanding,
            reversalOf: row.reversalOf
        });
    }
    const legacyRecognised = new Map();
    const legacyPaid = new Map();
    const addLegacy = (rows, target) => {
        for (const row of rows || []) {
            if (!onOrBefore(row.createdAt, asOf))
                continue;
            const taxType = canonicalOfLegacy(row.taxType);
            const key = `${taxType}|${propertyKey(row.propertyId)}`;
            target.set(key, round((target.get(key) || 0) + round(row.amount)));
            ensure(taxType, propertyKey(row.propertyId), row.propertyName || propertyKey(row.propertyId));
        }
    };
    addLegacy(input.legacyRecords, legacyRecognised);
    addLegacy(input.legacyPayouts, legacyPaid);
    const accounts = [];
    for (const [taxType, byProperty] of buckets.entries()) {
        const properties = [];
        let recognised = 0;
        let paid = 0;
        let outstanding = 0;
        let reversed = 0;
        let legacyRec = 0;
        let legacyPay = 0;
        for (const bucket of byProperty.values()) {
            const legacyKey = `${taxType}|${bucket.propertyId}`;
            const legacyDebit = legacyRecognised.get(legacyKey) || 0;
            const legacyCredit = legacyPaid.get(legacyKey) || 0;
            const legacyOutstanding = round(legacyDebit - legacyCredit);
            legacyRec = round(legacyRec + legacyDebit);
            legacyPay = round(legacyPay + legacyCredit);
            if (Math.abs(round(bucket.outstanding - legacyOutstanding)) > 0.05 || Math.abs(round(bucket.recognised - legacyDebit)) > 0.05) {
                const kind = legacyDebit > 0 && bucket.recognised === 0
                    ? 'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION'
                    : bucket.recognised > 0 && legacyDebit === 0
                        ? 'OBLIGATION_WITHOUT_TRUST_LEDGER'
                        : 'LEGACY_AMOUNT_MISMATCH';
                discrepancies.push({
                    kind,
                    taxType,
                    propertyId: bucket.propertyId,
                    propertyName: bucket.propertyName,
                    canonicalOutstanding: bucket.outstanding,
                    legacyOutstanding,
                    difference: round(bucket.outstanding - legacyOutstanding),
                    detail: `${taxTypes_1.TAX_TYPE_LABEL[taxType] || taxType} for ${bucket.propertyName}: obligations outstanding ${bucket.outstanding.toFixed(2)}, trust tax book outstanding ${legacyOutstanding.toFixed(2)}. The trust book is not rewritten.`,
                    requiresAuthorisation: true
                });
            }
            recognised = round(recognised + bucket.recognised);
            paid = round(paid + bucket.paid);
            outstanding = round(outstanding + bucket.outstanding);
            reversed = round(reversed + bucket.reversed);
            properties.push(bucket);
        }
        properties.sort((a, b) => b.outstanding - a.outstanding || a.propertyName.localeCompare(b.propertyName));
        accounts.push({
            taxType,
            label: taxTypes_1.TAX_TYPE_LABEL[taxType] || taxType,
            recognised,
            paid,
            outstanding,
            reversed,
            properties,
            legacyRecognised: legacyRec,
            legacyPaid: legacyPay,
            legacyOutstanding: round(legacyRec - legacyPay)
        });
    }
    accounts.sort((a, b) => a.label.localeCompare(b.label));
    const outstandingOf = (...types) => round(accounts.filter((account) => types.includes(account.taxType)).reduce((sum, account) => sum + account.outstanding, 0));
    const glComparisons = [
        {
            code: chartAccounts_1.GL.VAT_PAYABLE,
            name: 'VAT Payable',
            canonicalOutstanding: outstandingOf('VAT_OUTPUT', 'VAT_ON_COMMISSION')
        },
        {
            code: chartAccounts_1.GL.ZIMRA_WITHHOLDING,
            name: 'ZIMRA Withholding Payable',
            canonicalOutstanding: outstandingOf('CAPITAL_GAINS_TAX', 'CAPITAL_GAINS_WITHHOLDING_TAX')
        }
    ].map((row) => {
        var _a;
        // Chart balances are debit minus credit. A credit-normal tax liability is stored as a negative number.
        const stored = round(Number(((_a = (input.glBalances || []).find((item) => item.code === row.code)) === null || _a === void 0 ? void 0 : _a.balance) || 0));
        const creditNormal = round(-stored);
        const difference = round(row.canonicalOutstanding - creditNormal);
        if (Math.abs(difference) > 0.05) {
            discrepancies.push({
                kind: 'GL_MISMATCH',
                taxType: row.code,
                propertyId: exports.UNALLOCATED_PROPERTY,
                propertyName: 'Company',
                canonicalOutstanding: row.canonicalOutstanding,
                legacyOutstanding: creditNormal,
                difference,
                detail: `GL ${row.code} ${row.name} is stored debit-minus-credit at ${stored.toFixed(2)}, which is a credit-normal liability of ${creditNormal.toFixed(2)}. Canonical outstanding is ${row.canonicalOutstanding.toFixed(2)}. The stored balance was not adjusted.`,
                requiresAuthorisation: true
            });
        }
        return Object.assign(Object.assign({}, row), { storedBalance: stored, creditNormalBalance: creditNormal, difference });
    });
    const historical = discrepancies.some((item) => item.kind.startsWith('LEGACY_') || item.kind === 'OBLIGATION_WITHOUT_TRUST_LEDGER');
    const blocking = discrepancies.some((item) => item.kind === 'DUPLICATE_OBLIGATION' || item.kind === 'PAYMENT_OVER_ALLOCATED' || item.kind === 'GL_MISMATCH' || item.kind === 'ALLOCATION_TO_INACTIVE_OBLIGATION');
    const status = blocking
        ? 'RECONCILIATION_REQUIRED'
        : historical
            ? 'HISTORICAL_REVIEW_REQUIRED'
            : 'RECONCILED';
    return {
        asOf: asOf ? asOf.toISOString() : undefined,
        accounts,
        unallocatedPayments,
        discrepancies,
        status,
        gl: glComparisons
    };
}
