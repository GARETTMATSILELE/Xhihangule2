"use strict";
/**
 * Authoritative rental/sale domain for a payment.
 * Captured when the payment is accepted. Later changes to Property.rentalType
 * must not reclassify the payment, its reversal, or its retries.
 *
 * `introduction` is a rental payment type (introduction commission on a let).
 * It uses the RENTAL domain and cannot be posted against a sale property.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaleContextRequiredError = exports.OwnerIncomeAmountMissingError = exports.PaymentDomainMissingError = exports.AccountingClassificationConflictError = void 0;
exports.domainFromPaymentType = domainFromPaymentType;
exports.domainFromRentalType = domainFromRentalType;
exports.ledgerForDomain = ledgerForDomain;
exports.entityDomain = entityDomain;
exports.historicalTransactionDomain = historicalTransactionDomain;
exports.requireHistoricalTransactionDomain = requireHistoricalTransactionDomain;
exports.journalPaymentType = journalPaymentType;
exports.isPermanentAccountingFailure = isPermanentAccountingFailure;
exports.resolveCreateTransactionDomain = resolveCreateTransactionDomain;
exports.mayPostSaleTrust = mayPostSaleTrust;
exports.resolveDuplicateKeyRace = resolveDuplicateKeyRace;
class AccountingClassificationConflictError extends Error {
    constructor(transactionDomain, resolvedDomain, message) {
        super(message);
        this.transactionDomain = transactionDomain;
        this.resolvedDomain = resolvedDomain;
        this.code = 'ACCOUNTING_CLASSIFICATION_CONFLICT';
        this.statusCode = 409;
        this.name = 'AccountingClassificationConflictError';
    }
    toBody() {
        return {
            code: this.code,
            transactionDomain: this.transactionDomain,
            resolvedDomain: this.resolvedDomain,
            message: this.message
        };
    }
}
exports.AccountingClassificationConflictError = AccountingClassificationConflictError;
class PaymentDomainMissingError extends Error {
    constructor() {
        super('Payment has no authoritative transaction domain.');
        this.code = 'PAYMENT_DOMAIN_MISSING';
        this.statusCode = 409;
        this.name = 'PaymentDomainMissingError';
    }
}
exports.PaymentDomainMissingError = PaymentDomainMissingError;
class OwnerIncomeAmountMissingError extends Error {
    constructor(paymentId) {
        super(`Completed cash has no valid owner income amount for payment ${paymentId}.`);
        this.code = 'OWNER_INCOME_AMOUNT_MISSING';
        this.statusCode = 409;
        this.name = 'OwnerIncomeAmountMissingError';
    }
}
exports.OwnerIncomeAmountMissingError = OwnerIncomeAmountMissingError;
class SaleContextRequiredError extends Error {
    constructor() {
        super('A sale payment requires a property, development, or unit.');
        this.code = 'SALE_CONTEXT_REQUIRED';
        this.statusCode = 400;
        this.name = 'SaleContextRequiredError';
    }
}
exports.SaleContextRequiredError = SaleContextRequiredError;
const DOMAIN_MESSAGE = 'The transaction domain conflicts with the property accounting domain.';
function domainFromPaymentType(paymentType) {
    const value = String(paymentType || '').trim().toLowerCase();
    if (value === 'sale')
        return 'SALE';
    if (value === 'rental' || value === 'introduction')
        return 'RENTAL';
    return null;
}
function domainFromRentalType(rentalType) {
    const value = String(rentalType || '').trim().toLowerCase();
    if (value === 'sale')
        return 'SALE';
    if (value === 'management' || value === 'introduction')
        return 'RENTAL';
    return null;
}
function ledgerForDomain(domain) {
    return domain === 'SALE' ? 'sale' : 'rental';
}
function entityDomain(entity) {
    if (entity.kind === 'development' || entity.kind === 'unit')
        return 'SALE';
    if (entity.kind === 'missing')
        return null;
    return domainFromRentalType(entity.rentalType);
}
/**
 * Domain stored on the payment, else the payment type captured at creation.
 * Property.rentalType is never consulted.
 */
function historicalTransactionDomain(payment) {
    const snapshot = String((payment === null || payment === void 0 ? void 0 : payment.transactionDomain) || '').trim().toUpperCase();
    if (snapshot === 'RENTAL' || snapshot === 'SALE')
        return snapshot;
    return domainFromPaymentType(payment === null || payment === void 0 ? void 0 : payment.paymentType);
}
function requireHistoricalTransactionDomain(payment) {
    const domain = historicalTransactionDomain(payment);
    if (!domain)
        throw new PaymentDomainMissingError();
    return domain;
}
function journalPaymentType(payment) {
    return requireHistoricalTransactionDomain(payment) === 'SALE' ? 'sale' : 'rental';
}
function isPermanentAccountingFailure(error) {
    const code = String((error === null || error === void 0 ? void 0 : error.code) || '');
    return (code === 'OWNER_INCOME_AMOUNT_MISSING' ||
        code === 'PAYMENT_DOMAIN_MISSING' ||
        code === 'ACCOUNTING_CLASSIFICATION_CONFLICT');
}
function resolveCreateTransactionDomain(input) {
    if (input.entity.kind === 'missing') {
        const requested = domainFromPaymentType(input.paymentType);
        if (requested === 'SALE' || String(input.paymentType || '').toLowerCase() === 'sale') {
            throw new SaleContextRequiredError();
        }
        throw new AccountingClassificationConflictError(String(input.paymentType || 'UNKNOWN').toUpperCase(), 'UNKNOWN', 'A financial payment requires a property, development, or unit.');
    }
    const resolvedDomain = entityDomain(input.entity);
    if (!resolvedDomain) {
        throw new AccountingClassificationConflictError(String(input.paymentType || 'UNKNOWN').toUpperCase(), 'UNKNOWN', 'Unable to determine the property accounting domain. Property.rentalType must be sale, management, or introduction.');
    }
    const supplied = String(input.paymentType || '').trim().toLowerCase();
    const requestedDomain = supplied ? domainFromPaymentType(supplied) : resolvedDomain;
    if (!requestedDomain) {
        throw new AccountingClassificationConflictError(supplied.toUpperCase() || 'UNKNOWN', resolvedDomain, DOMAIN_MESSAGE);
    }
    if (requestedDomain !== resolvedDomain) {
        throw new AccountingClassificationConflictError(requestedDomain, resolvedDomain, DOMAIN_MESSAGE);
    }
    let paymentType;
    if (supplied === 'introduction' || supplied === 'rental' || supplied === 'sale') {
        paymentType = supplied;
    }
    else {
        paymentType = resolvedDomain === 'SALE' ? 'sale' : 'rental';
    }
    return { transactionDomain: resolvedDomain, paymentType };
}
/** Sale buyer-trust is allowed only for a persisted SALE domain. */
function mayPostSaleTrust(payment) {
    return historicalTransactionDomain(payment) === 'SALE';
}
/**
 * Concurrent create lost the unique-index race.
 * Reload the canonical row. Never archive the winner to make the loser fit.
 */
function resolveDuplicateKeyRace(reloadedCount) {
    if (reloadedCount === 1)
        return 'use_existing';
    return 'ambiguous';
}
