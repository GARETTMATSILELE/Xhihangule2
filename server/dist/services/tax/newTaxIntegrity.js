"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessNewTaxIntegrity = assessNewTaxIntegrity;
const vatCalculation_1 = require("./vatCalculation");
const round = (value) => Number(Number(value || 0).toFixed(2));
const timeOf = (value) => {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? null : time;
};
const expectedTypes = (source) => {
    const rows = [];
    if (round(source.vatOnCommission) > 0)
        rows.push({ taxType: 'VAT_ON_COMMISSION', amount: round(source.vatOnCommission) });
    if (round(source.outputVat) > 0)
        rows.push({ taxType: 'VAT_OUTPUT', amount: round(source.outputVat) });
    return rows;
};
const isReversalDocument = (source) => round(source.amount) < 0 || Boolean(source.reversalOfPaymentId);
const isPosted = (source) => {
    const status = String(source.status || '').toLowerCase();
    return status === 'completed' || status === 'reversed';
};
/**
 * Classify taxable source payments against obligations and 2101 movements.
 * The go-live instant is the earliest obligation that was created together with a matching VAT credit.
 * Earlier journals without that obligation stay in the legacy list and do not fail the new period.
 */
function assessNewTaxIntegrity(input) {
    const glBySource = new Map(input.gl.map((row) => [row.sourceId, row]));
    const originals = input.obligations.filter((row) => !row.reversalOf);
    const mirrors = input.obligations.filter((row) => row.reversalOf);
    const demonstratedPaymentTimes = originals.flatMap((row) => {
        var _a;
        const movement = glBySource.get(row.paymentId);
        if (!movement || Math.abs(round(movement.credit) - round(row.taxAmount)) > 0.05)
            return [];
        const source = input.sources.find((item) => item.id === row.paymentId);
        const time = (_a = timeOf(source === null || source === void 0 ? void 0 : source.paymentDate)) !== null && _a !== void 0 ? _a : timeOf(row.createdAt);
        return time == null ? [] : [time];
    });
    const goLiveTime = demonstratedPaymentTimes.reduce((earliest, time) => (earliest == null || time < earliest ? time : earliest), null);
    const findings = [];
    const legacyFindings = [];
    let expectedObligations = 0;
    let createdObligations = 0;
    let activeOutstanding = 0;
    let eligibleSources = 0;
    const newSourceIds = new Set();
    const push = (cohort, code, sourceId, detail) => {
        const target = cohort === 'new' ? findings : legacyFindings;
        target.push({ code, cohort, sourceId, detail });
    };
    for (const source of input.sources) {
        const taxable = expectedTypes(source);
        if (taxable.length === 0)
            continue;
        const paymentTime = timeOf(source.paymentDate);
        const inNewCohort = goLiveTime != null && paymentTime != null && paymentTime >= goLiveTime;
        const cohort = inNewCohort ? 'new' : 'legacy';
        if (isReversalDocument(source)) {
            if (cohort === 'legacy') {
                push('legacy', 'LEGACY_REVERSAL_DOCUMENT', source.id, 'Reversal document before the canonical obligation workflow.');
            }
            continue;
        }
        if (!isPosted(source)) {
            if (cohort === 'new') {
                push('new', 'POSTING_NOT_COMPLETED', source.id, `Status ${source.status} has not been posted, so no obligation is expected yet.`);
            }
            continue;
        }
        if (cohort === 'legacy') {
            push('legacy', 'LEGACY_BEFORE_GO_LIVE', source.id, 'Taxable source before the first payment that created an obligation and a matching VAT credit.');
            continue;
        }
        eligibleSources += 1;
        newSourceIds.add(source.id);
        for (const expected of taxable) {
            expectedObligations += 1;
            const matches = originals.filter((row) => row.paymentId === source.id && row.taxType === expected.taxType);
            if (matches.length === 0) {
                push('new', 'MISSING_OBLIGATION', source.id, `No ${expected.taxType} obligation for ${expected.amount.toFixed(2)}.`);
                continue;
            }
            if (matches.length > 1) {
                push('new', 'DUPLICATE_OBLIGATION', source.id, `${matches.length} original ${expected.taxType} obligations.`);
            }
            createdObligations += matches.length;
            const obligation = matches[0];
            if (!obligation.propertyId && source.propertyId) {
                push('new', 'MISSING_PROPERTY', source.id, `${expected.taxType} obligation has no property.`);
            }
            if (Math.abs(round(obligation.taxAmount) - expected.amount) > 0.05) {
                push('new', 'AMOUNT_MISMATCH', source.id, `${expected.taxType} obligation ${round(obligation.taxAmount).toFixed(2)} differs from source ${expected.amount.toFixed(2)}.`);
            }
            if (source.taxRate != null && obligation.taxRate != null && Math.abs(Number(obligation.taxRate) - Number(source.taxRate)) > 0.0001) {
                push('new', 'RATE_MISMATCH', source.id, `${expected.taxType} rate ${obligation.taxRate} differs from source rate ${source.taxRate}.`);
            }
            const period = (0, vatCalculation_1.filingPeriodFromDate)(source.paymentDate || undefined);
            if (obligation.taxPeriod && obligation.taxPeriod !== period) {
                push('new', 'PERIOD_MISMATCH', source.id, `${expected.taxType} period ${obligation.taxPeriod} differs from payment-date period ${period}.`);
            }
            const movement = glBySource.get(source.id) || { sourceId: source.id, debit: 0, credit: 0 };
            const reversalMovement = glBySource.get(`${source.id}:reversal`) || { sourceId: `${source.id}:reversal`, debit: 0, credit: 0 };
            const netCredit = round(movement.credit - movement.debit - reversalMovement.debit + reversalMovement.credit);
            if (String(obligation.status) === 'REVERSED') {
                const mirror = mirrors.find((row) => row.reversalOf === obligation.id && row.taxType === expected.taxType);
                if (!mirror)
                    push('new', 'UNRESOLVED_REVERSAL', source.id, `${expected.taxType} is reversed without a linked reversal obligation.`);
                if (Math.abs(netCredit) > 0.05) {
                    push('new', 'GL_MISMATCH', source.id, `Reversed ${expected.taxType} still has 2101 net credit ${netCredit.toFixed(2)}.`);
                }
            }
            else {
                activeOutstanding = round(activeOutstanding + round(obligation.taxAmount));
                if (Math.abs(netCredit - round(obligation.taxAmount)) > 0.05) {
                    push('new', 'GL_MISMATCH', source.id, `${expected.taxType} obligation ${round(obligation.taxAmount).toFixed(2)} and 2101 net credit ${netCredit.toFixed(2)} differ.`);
                }
                if (round(movement.credit) <= 0) {
                    push('new', 'MISSING_GL', source.id, `${expected.taxType} has an obligation and no 2101 credit.`);
                }
            }
        }
    }
    let newGlCreditNormal = 0;
    for (const sourceId of newSourceIds) {
        for (const key of [sourceId, `${sourceId}:reversal`]) {
            const movement = glBySource.get(key);
            if (!movement)
                continue;
            newGlCreditNormal = round(newGlCreditNormal + movement.credit - movement.debit);
        }
    }
    const glDifference = round(activeOutstanding - newGlCreditNormal);
    if (Math.abs(glDifference) > 0.05) {
        findings.push({
            code: 'GL_MISMATCH',
            cohort: 'new',
            sourceId: 'NEW_PERIOD',
            detail: `New-period active obligations ${activeOutstanding.toFixed(2)} differ from new-period 2101 net credit ${newGlCreditNormal.toFixed(2)}.`
        });
    }
    if ((input.openFailedPostings || 0) > 0) {
        findings.push({
            code: 'FAILED_POSTING',
            cohort: 'new',
            sourceId: 'ACCOUNTING_EXCEPTIONS',
            detail: `${input.openFailedPostings} open accounting exception(s).`
        });
    }
    const blocking = findings.some((item) => item.code !== 'POSTING_NOT_COMPLETED');
    const status = goLiveTime == null
        ? 'NOT_DEMONSTRATED'
        : blocking
            ? 'RECONCILIATION_REQUIRED'
            : 'RECONCILED';
    return {
        goLive: goLiveTime == null ? null : new Date(goLiveTime).toISOString(),
        goLiveBasis: 'Payment date of the earliest taxable source that has both a canonical obligation and a matching account 2101 credit. Earlier taxable sources stay legacy.',
        status,
        eligibleSources,
        expectedObligations,
        createdObligations,
        activeOutstanding,
        newGlCreditNormal,
        glDifference,
        openFailedPostings: input.openFailedPostings || 0,
        findings,
        legacyFindings
    };
}
