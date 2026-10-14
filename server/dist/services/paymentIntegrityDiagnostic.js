"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENCY_UNSPECIFIED = exports.CURRENCY_MISMATCH = exports.ORPHAN_PROJECTION_DETECTED = exports.DUPLICATE_PROJECTION_DETECTED = void 0;
exports.detectOrphanProjection = detectOrphanProjection;
exports.detectDuplicateProjections = detectDuplicateProjections;
exports.detectCurrencyMismatch = detectCurrencyMismatch;
exports.buildPaymentIntegrityDiagnostic = buildPaymentIntegrityDiagnostic;
exports.DUPLICATE_PROJECTION_DETECTED = 'DUPLICATE_PROJECTION_DETECTED';
exports.ORPHAN_PROJECTION_DETECTED = 'ORPHAN_PROJECTION_DETECTED';
exports.CURRENCY_MISMATCH = 'CURRENCY_MISMATCH';
exports.CURRENCY_UNSPECIFIED = 'CURRENCY_UNSPECIFIED';
function detectOrphanProjection(input) {
    const paymentId = input.paymentId ? String(input.paymentId) : '';
    if (!paymentId || input.paymentExists)
        return null;
    return {
        code: exports.ORPHAN_PROJECTION_DETECTED,
        action: 'FLAG',
        projectionType: input.projectionType,
        projectionId: input.projectionId,
        paymentId,
        propertyId: input.propertyId,
        amount: input.amount,
        currency: input.currency
    };
}
function detectDuplicateProjections(input) {
    if (Number(input.count || 0) <= 1)
        return null;
    return {
        code: exports.DUPLICATE_PROJECTION_DETECTED,
        projectionType: input.projectionType,
        paymentId: String(input.paymentId),
        count: Number(input.count)
    };
}
function detectCurrencyMismatch(input) {
    const paymentCurrency = input.paymentCurrency != null && String(input.paymentCurrency).trim()
        ? String(input.paymentCurrency).trim().toUpperCase()
        : '';
    const projectionCurrency = input.projectionCurrency != null && String(input.projectionCurrency).trim()
        ? String(input.projectionCurrency).trim().toUpperCase()
        : '';
    if (!paymentCurrency) {
        return { code: exports.CURRENCY_UNSPECIFIED, projectionCurrency: projectionCurrency || undefined, action: 'FLAG' };
    }
    if (!projectionCurrency)
        return null;
    if (paymentCurrency === projectionCurrency)
        return null;
    return {
        code: exports.CURRENCY_MISMATCH,
        paymentCurrency,
        projectionCurrency,
        action: 'FLAG'
    };
}
function buildPaymentIntegrityDiagnostic(input) {
    var _a;
    const payment = input.payment || {};
    return {
        paymentId: String(payment._id || input.recon.paymentId),
        referenceNumber: payment.referenceNumber != null ? String(payment.referenceNumber) : null,
        propertyId: payment.propertyId != null ? String(payment.propertyId) : null,
        tenantId: payment.tenantId != null ? String(payment.tenantId) : null,
        leaseId: payment.leaseId != null ? String(payment.leaseId) : null,
        status: payment.status != null ? String(payment.status) : null,
        postingStatus: payment.postingStatus != null ? String(payment.postingStatus) : null,
        accountingStatus: payment.accountingStatus != null
            ? String(payment.accountingStatus)
            : input.recon.status,
        accountingComplete: Boolean(input.recon.accountingComplete),
        missing: input.recon.missing || [],
        mismatched: input.recon.mismatched || [],
        duplicateProjections: Object.entries(((_a = input.recon.actual) === null || _a === void 0 ? void 0 : _a.duplicates) || {})
            .map(([projectionType, count]) => detectDuplicateProjections({
            paymentId: String(payment._id || input.recon.paymentId),
            projectionType,
            count: Number(count || 0)
        }))
            .filter((row) => Boolean(row)),
        legacyIntroductionRisk: input.legacyIntroductionRisk || null,
        currency: input.currencyFlag || null,
        recon: input.recon
    };
}
