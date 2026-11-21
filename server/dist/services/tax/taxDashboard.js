"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAX_DASHBOARD_CATEGORIES = void 0;
exports.categoryForTaxType = categoryForTaxType;
exports.formatPropertyAddress = formatPropertyAddress;
exports.resolveLinkedPropertyId = resolveLinkedPropertyId;
exports.presentObligationProperty = presentObligationProperty;
exports.presentObligationAmounts = presentObligationAmounts;
exports.summariseTaxPayment = summariseTaxPayment;
exports.resolveComplianceIndicator = resolveComplianceIndicator;
exports.buildTaxDashboard = buildTaxDashboard;
const taxPosition_1 = require("./taxPosition");
/**
 * Read-only presentation of the canonical tax position.
 * Totals are grouped from buildTaxPosition. This module does not calculate tax,
 * create obligations, or post journals.
 */
exports.TAX_DASHBOARD_CATEGORIES = [
    { key: 'VAT_ON_COMMISSION', label: 'VAT on Agency Commission', taxTypes: ['VAT_ON_COMMISSION'] },
    { key: 'CGT', label: 'Capital Gains Tax (CGT)', taxTypes: ['CAPITAL_GAINS_TAX'] },
    { key: 'CGWT', label: 'Capital Gains Withholding Tax (CGWT)', taxTypes: ['CAPITAL_GAINS_WITHHOLDING_TAX'] },
    { key: 'OTHER_WITHHOLDING', label: 'Other Withholding Taxes', taxTypes: ['VAT_WITHHOLDING'] },
    { key: 'OTHER', label: 'Other Tax Obligations', taxTypes: [] }
];
const round = (value) => Number(Number(value || 0).toFixed(2));
const TRUST_DISCREPANCY = new Set([
    'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION',
    'OBLIGATION_WITHOUT_TRUST_LEDGER',
    'LEGACY_AMOUNT_MISMATCH'
]);
const NOT_RECONCILED_PERIOD = {
    status: 'NOT_RECONCILED',
    amount: null,
    reason: 'Trust tax books are not split by tax period, so cash held cannot be stated for one period.'
};
const NOT_RECONCILED_TOTAL = {
    status: 'NOT_RECONCILED',
    amount: null,
    reason: 'A company-wide held balance is shown only when every category is supported by a reconciled trust tax book.'
};
function categoryForTaxType(taxType) {
    const explicit = exports.TAX_DASHBOARD_CATEGORIES.find((category) => category.taxTypes.includes(taxType));
    if (explicit)
        return { key: explicit.key, label: explicit.label };
    const other = exports.TAX_DASHBOARD_CATEGORIES[exports.TAX_DASHBOARD_CATEGORIES.length - 1];
    return { key: other.key, label: other.label };
}
function formatPropertyAddress(value) {
    if (typeof value === 'string')
        return value.trim();
    if (!value || typeof value !== 'object')
        return '';
    const row = value;
    const parts = ['line1', 'street', 'addressLine1', 'address', 'suburb', 'city', 'town', 'province']
        .map((key) => (typeof row[key] === 'string' ? row[key].trim() : ''))
        .filter(Boolean);
    return Array.from(new Set(parts)).join(', ');
}
/** Obligation property first. The source payment property is used only when the obligation has none. */
function resolveLinkedPropertyId(input) {
    const own = String(input.obligationPropertyId || '').trim();
    if (own && own !== 'UNALLOCATED')
        return own;
    const payment = String(input.paymentPropertyId || '').trim();
    if (payment && payment !== 'UNALLOCATED')
        return payment;
    return null;
}
function presentObligationProperty(input) {
    const name = String(input.propertyName || '').trim();
    const address = formatPropertyAddress(input.propertyAddress);
    const id = String(input.propertyId || '').trim();
    if (!id || id === 'UNALLOCATED' || (!name && !address)) {
        return {
            propertyAvailable: false,
            propertyLabel: 'Property information unavailable',
            propertyAddress: ''
        };
    }
    return { propertyAvailable: true, propertyLabel: name || address, propertyAddress: address };
}
function presentObligationAmounts(input) {
    const category = categoryForTaxType(input.taxType);
    const active = (0, taxPosition_1.isActiveObligation)({
        id: 'row',
        taxType: input.taxType,
        taxPeriod: '',
        taxAmount: Number(input.taxAmount || 0),
        status: input.status,
        reversalOf: input.reversalOf || null
    });
    if (!active) {
        return {
            amountPaid: 0,
            outstanding: 0,
            paymentStatus: input.status === 'ACCOUNTANT_REVIEW' ? 'Review' : 'Reversed',
            categoryKey: category.key,
            categoryLabel: category.label
        };
    }
    const recognised = round(input.taxAmount);
    const amountPaid = round(Math.min(recognised, Math.max(0, Number(input.allocatedPaid || 0))));
    const settled = input.status === 'PAID' || input.status === 'RECONCILED';
    const outstanding = settled ? 0 : round(Math.max(0, recognised - amountPaid));
    const paymentStatus = outstanding <= 0.005 ? 'Paid' : amountPaid > 0.005 ? 'Partly paid' : 'Outstanding';
    return {
        amountPaid,
        outstanding,
        paymentStatus,
        categoryKey: category.key,
        categoryLabel: category.label
    };
}
function summariseTaxPayment(input) {
    const allocations = input.allocations || [];
    const allocatedAmount = round(allocations.reduce((sum, row) => sum + round(row.amount), 0));
    const unallocatedAmount = round(input.unallocatedAmount || 0);
    const confirmedPaidAmount = String(input.status || '') === 'POSTED' ? allocatedAmount : 0;
    const categories = Array.from(new Set(allocations.map((row) => categoryForTaxType(String(row.taxType || '')).label)));
    return { allocatedAmount, unallocatedAmount, confirmedPaidAmount, categories };
}
function accountFunds(position, taxType) {
    const account = position.accounts.find((row) => row.taxType === taxType);
    const mismatched = position.discrepancies.some((item) => item.taxType === taxType && TRUST_DISCREPANCY.has(item.kind));
    if (mismatched) {
        return {
            status: 'NOT_RECONCILED',
            amount: null,
            reason: 'The trust tax book does not match the canonical obligations.'
        };
    }
    const trustActivity = round((account === null || account === void 0 ? void 0 : account.legacyRecognised) || 0) > 0 || round((account === null || account === void 0 ? void 0 : account.legacyPaid) || 0) > 0;
    const canonicalActivity = round((account === null || account === void 0 ? void 0 : account.recognised) || 0) > 0 ||
        round((account === null || account === void 0 ? void 0 : account.paid) || 0) > 0 ||
        round((account === null || account === void 0 ? void 0 : account.outstanding) || 0) > 0;
    if (trustActivity && canonicalActivity) {
        return { status: 'RECONCILED', amount: round((account === null || account === void 0 ? void 0 : account.legacyOutstanding) || 0) };
    }
    if (!trustActivity && !canonicalActivity) {
        return { status: 'RECONCILED', amount: 0 };
    }
    if (canonicalActivity) {
        return {
            status: 'NOT_RECONCILED',
            amount: null,
            reason: 'No reconciled trust-account tax balance supports cash held.'
        };
    }
    return {
        status: 'NOT_RECONCILED',
        amount: null,
        reason: 'Historical trust tax records are not shown as cash currently held.'
    };
}
function combineFunds(parts) {
    var _a;
    if (parts.some((part) => part.status !== 'RECONCILED')) {
        return {
            status: 'NOT_RECONCILED',
            amount: null,
            reason: ((_a = parts.find((part) => part.reason)) === null || _a === void 0 ? void 0 : _a.reason) || NOT_RECONCILED_TOTAL.reason
        };
    }
    return {
        status: 'RECONCILED',
        amount: round(parts.reduce((sum, part) => sum + Number(part.amount || 0), 0))
    };
}
function resolveComplianceIndicator(position, signals = {}) {
    const reconciliation = position.status === 'RECONCILIATION_REQUIRED' ||
        signals.trustStatus === 'RECONCILIATION_EXCEPTION' ||
        signals.newPeriodStatus === 'RECONCILIATION_REQUIRED';
    if (reconciliation) {
        return { indicator: 'RECONCILIATION_REQUIRED', label: 'Reconciliation Required' };
    }
    const attention = position.status === 'HISTORICAL_REVIEW_REQUIRED' ||
        Number(signals.openReviews || 0) > 0 ||
        Boolean(signals.vatRateReview) ||
        Number(signals.cgtHistoricalReviews || 0) > 0 ||
        Number(signals.cgwtMissingApplicability || 0) > 0 ||
        Number(signals.unpaidVatPeriods || 0) > 0;
    if (attention) {
        return { indicator: 'ATTENTION_REQUIRED', label: 'Attention Required' };
    }
    return { indicator: 'COMPLIANT', label: 'Compliant' };
}
function buildTaxDashboard(position, options = {}) {
    const taxPeriod = String(options.taxPeriod || '').trim();
    const totals = new Map();
    for (const category of exports.TAX_DASHBOARD_CATEGORIES) {
        totals.set(category.key, { recognised: 0, paid: 0, outstanding: 0 });
    }
    for (const account of position.accounts) {
        const category = categoryForTaxType(account.taxType);
        const bucket = totals.get(category.key);
        if (!taxPeriod) {
            bucket.recognised = round(bucket.recognised + account.recognised);
            bucket.paid = round(bucket.paid + account.paid);
            bucket.outstanding = round(bucket.outstanding + account.outstanding);
            continue;
        }
        for (const property of account.properties) {
            for (const line of property.lines) {
                if (line.taxPeriod !== taxPeriod)
                    continue;
                bucket.recognised = round(bucket.recognised + line.recognised);
                bucket.paid = round(bucket.paid + line.paid);
                bucket.outstanding = round(bucket.outstanding + line.outstanding);
            }
        }
    }
    const categories = exports.TAX_DASHBOARD_CATEGORIES.map((category) => {
        const bucket = totals.get(category.key);
        let fundsHeld;
        if (taxPeriod) {
            fundsHeld = NOT_RECONCILED_PERIOD;
        }
        else if (category.taxTypes.length) {
            fundsHeld = combineFunds(category.taxTypes.map((taxType) => accountFunds(position, taxType)));
        }
        else {
            const otherAccounts = position.accounts.filter((account) => categoryForTaxType(account.taxType).key === 'OTHER');
            fundsHeld = otherAccounts.length
                ? combineFunds(otherAccounts.map((account) => accountFunds(position, account.taxType)))
                : { status: 'RECONCILED', amount: 0 };
        }
        return {
            key: category.key,
            label: category.label,
            recognised: bucket.recognised,
            paid: bucket.paid,
            outstanding: bucket.outstanding,
            fundsHeld
        };
    });
    const recognised = round(categories.reduce((sum, row) => sum + row.recognised, 0));
    const paid = round(categories.reduce((sum, row) => sum + row.paid, 0));
    const outstanding = round(categories.reduce((sum, row) => sum + row.outstanding, 0));
    const fundsHeld = taxPeriod ? NOT_RECONCILED_PERIOD : combineFunds(categories.map((row) => row.fundsHeld));
    if (!taxPeriod && fundsHeld.status !== 'RECONCILED') {
        fundsHeld.reason = NOT_RECONCILED_TOTAL.reason;
    }
    return {
        asOf: position.asOf,
        taxPeriod: taxPeriod || undefined,
        recognised,
        paid,
        outstanding,
        unallocatedPayments: round(position.unallocatedPayments || 0),
        fundsHeld,
        categories,
        total: { recognised, paid, outstanding, fundsHeld },
        chart: categories
            .filter((row) => row.recognised > 0)
            .map((row) => ({ key: row.key, label: row.label, recognised: row.recognised })),
        compliance: resolveComplianceIndicator(position, options.compliance)
    };
}
