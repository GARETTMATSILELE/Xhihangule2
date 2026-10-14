/**
 * Authoritative rental/sale domain for a payment.
 * Captured when the payment is accepted. Later changes to Property.rentalType
 * must not reclassify the payment, its reversal, or its retries.
 *
 * `introduction` is a rental payment type (introduction commission on a let).
 * It uses the RENTAL domain and cannot be posted against a sale property.
 */

export type TransactionDomain = 'RENTAL' | 'SALE';
export type LedgerType = 'rental' | 'sale';
export type PaymentTypeName = 'sale' | 'rental' | 'introduction';

export type DomainEntity =
  | { kind: 'property'; rentalType?: string | null }
  | { kind: 'development' }
  | { kind: 'unit' }
  | { kind: 'missing' };

export class AccountingClassificationConflictError extends Error {
  readonly code = 'ACCOUNTING_CLASSIFICATION_CONFLICT';
  readonly statusCode = 409;

  constructor(
    readonly transactionDomain: string,
    readonly resolvedDomain: string,
    message: string
  ) {
    super(message);
    this.name = 'AccountingClassificationConflictError';
  }

  toBody(): {
    code: 'ACCOUNTING_CLASSIFICATION_CONFLICT';
    transactionDomain: string;
    resolvedDomain: string;
    message: string;
  } {
    return {
      code: this.code,
      transactionDomain: this.transactionDomain,
      resolvedDomain: this.resolvedDomain,
      message: this.message
    };
  }
}

export class PaymentDomainMissingError extends Error {
  readonly code = 'PAYMENT_DOMAIN_MISSING';
  readonly statusCode = 409;

  constructor() {
    super('Payment has no authoritative transaction domain.');
    this.name = 'PaymentDomainMissingError';
  }
}

export class OwnerIncomeAmountMissingError extends Error {
  readonly code = 'OWNER_INCOME_AMOUNT_MISSING';
  readonly statusCode = 409;

  constructor(paymentId: string) {
    super(`Completed cash has no valid owner income amount for payment ${paymentId}.`);
    this.name = 'OwnerIncomeAmountMissingError';
  }
}

export class SaleContextRequiredError extends Error {
  readonly code = 'SALE_CONTEXT_REQUIRED';
  readonly statusCode = 400;

  constructor() {
    super('A sale payment requires a property, development, or unit.');
    this.name = 'SaleContextRequiredError';
  }
}

const DOMAIN_MESSAGE = 'The transaction domain conflicts with the property accounting domain.';

export function domainFromPaymentType(paymentType: unknown): TransactionDomain | null {
  const value = String(paymentType || '').trim().toLowerCase();
  if (value === 'sale') return 'SALE';
  if (value === 'rental' || value === 'introduction') return 'RENTAL';
  return null;
}

export function domainFromRentalType(rentalType: unknown): TransactionDomain | null {
  const value = String(rentalType || '').trim().toLowerCase();
  if (value === 'sale') return 'SALE';
  if (value === 'management' || value === 'introduction') return 'RENTAL';
  return null;
}

export function ledgerForDomain(domain: TransactionDomain): LedgerType {
  return domain === 'SALE' ? 'sale' : 'rental';
}

export function entityDomain(entity: DomainEntity): TransactionDomain | null {
  if (entity.kind === 'development' || entity.kind === 'unit') return 'SALE';
  if (entity.kind === 'missing') return null;
  return domainFromRentalType(entity.rentalType);
}

/**
 * Domain stored on the payment, else the payment type captured at creation.
 * Property.rentalType is never consulted.
 */
export function historicalTransactionDomain(payment: {
  transactionDomain?: unknown;
  paymentType?: unknown;
} | null | undefined): TransactionDomain | null {
  const snapshot = String(payment?.transactionDomain || '').trim().toUpperCase();
  if (snapshot === 'RENTAL' || snapshot === 'SALE') return snapshot;
  return domainFromPaymentType(payment?.paymentType);
}

export function requireHistoricalTransactionDomain(payment: {
  transactionDomain?: unknown;
  paymentType?: unknown;
} | null | undefined): TransactionDomain {
  const domain = historicalTransactionDomain(payment);
  if (!domain) throw new PaymentDomainMissingError();
  return domain;
}

export function journalPaymentType(payment: {
  transactionDomain?: unknown;
  paymentType?: unknown;
}): 'sale' | 'rental' {
  return requireHistoricalTransactionDomain(payment) === 'SALE' ? 'sale' : 'rental';
}

export function isPermanentAccountingFailure(error: unknown): boolean {
  const code = String((error as { code?: string })?.code || '');
  return (
    code === 'OWNER_INCOME_AMOUNT_MISSING' ||
    code === 'PAYMENT_DOMAIN_MISSING' ||
    code === 'ACCOUNTING_CLASSIFICATION_CONFLICT'
  );
}

export function resolveCreateTransactionDomain(input: {
  paymentType?: string | null;
  entity: DomainEntity;
}): { transactionDomain: TransactionDomain; paymentType: PaymentTypeName } {
  if (input.entity.kind === 'missing') {
    const requested = domainFromPaymentType(input.paymentType);
    if (requested === 'SALE' || String(input.paymentType || '').toLowerCase() === 'sale') {
      throw new SaleContextRequiredError();
    }
    throw new AccountingClassificationConflictError(
      String(input.paymentType || 'UNKNOWN').toUpperCase(),
      'UNKNOWN',
      'A financial payment requires a property, development, or unit.'
    );
  }

  const resolvedDomain = entityDomain(input.entity);
  if (!resolvedDomain) {
    throw new AccountingClassificationConflictError(
      String(input.paymentType || 'UNKNOWN').toUpperCase(),
      'UNKNOWN',
      'Unable to determine the property accounting domain. Property.rentalType must be sale, management, or introduction.'
    );
  }

  const supplied = String(input.paymentType || '').trim().toLowerCase();
  const requestedDomain = supplied ? domainFromPaymentType(supplied) : resolvedDomain;
  if (!requestedDomain) {
    throw new AccountingClassificationConflictError(
      supplied.toUpperCase() || 'UNKNOWN',
      resolvedDomain,
      DOMAIN_MESSAGE
    );
  }
  if (requestedDomain !== resolvedDomain) {
    throw new AccountingClassificationConflictError(requestedDomain, resolvedDomain, DOMAIN_MESSAGE);
  }

  let paymentType: PaymentTypeName;
  if (supplied === 'introduction' || supplied === 'rental' || supplied === 'sale') {
    paymentType = supplied;
  } else {
    paymentType = resolvedDomain === 'SALE' ? 'sale' : 'rental';
  }

  return { transactionDomain: resolvedDomain, paymentType };
}

/** Sale buyer-trust is allowed only for a persisted SALE domain. */
export function mayPostSaleTrust(payment: {
  transactionDomain?: unknown;
  paymentType?: unknown;
} | null | undefined): boolean {
  return historicalTransactionDomain(payment) === 'SALE';
}

/**
 * Concurrent create lost the unique-index race.
 * Reload the canonical row. Never archive the winner to make the loser fit.
 */
export function resolveDuplicateKeyRace(reloadedCount: number): 'use_existing' | 'ambiguous' {
  if (reloadedCount === 1) return 'use_existing';
  return 'ambiguous';
}
