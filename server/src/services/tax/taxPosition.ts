import { GL } from './chartAccounts';
import { TAX_TYPE_LABEL, type CanonicalTaxType } from './taxTypes';

export const UNALLOCATED_PROPERTY = 'UNALLOCATED';

/** Legacy trust-ledger tax types. VAT here is output VAT withheld on a settlement, not VAT on commission. */
export const LEGACY_TO_CANONICAL = {
  VAT: 'VAT_OUTPUT',
  VAT_ON_COMMISSION: 'VAT_ON_COMMISSION',
  CGT: 'CAPITAL_GAINS_TAX',
  CGWT: 'CAPITAL_GAINS_WITHHOLDING_TAX'
} as const;

export type LegacyTaxType = keyof typeof LEGACY_TO_CANONICAL;

export type TaxObligationRow = {
  id: string;
  taxType: string;
  propertyId?: string | null;
  propertyName?: string | null;
  paymentId?: string | null;
  taxPeriod: string;
  taxAmount: number;
  status: string;
  reversalOf?: string | null;
  transactionDate?: Date | string | null;
};

export type TaxPaymentRow = {
  id: string;
  status: string;
  amount: number;
  paymentDate?: Date | string | null;
  unallocatedAmount?: number;
  allocations: Array<{ taxObligationId: string; amount: number; taxType?: string }>;
};

export type LegacyTaxRow = {
  id: string;
  taxType: string;
  propertyId?: string | null;
  propertyName?: string | null;
  amount: number;
  createdAt?: Date | string | null;
};

export type GlBalanceRow = { code: string; balance: number };

export type TaxPositionInput = {
  obligations: TaxObligationRow[];
  payments: TaxPaymentRow[];
  legacyRecords?: LegacyTaxRow[];
  legacyPayouts?: LegacyTaxRow[];
  glBalances?: GlBalanceRow[];
  asOf?: Date;
};

export type TaxLine = {
  obligationId: string;
  paymentId?: string | null;
  taxPeriod: string;
  status: string;
  recognised: number;
  paid: number;
  outstanding: number;
  reversalOf?: string | null;
};

export type PropertyTaxBalance = {
  propertyId: string;
  propertyName: string;
  recognised: number;
  paid: number;
  outstanding: number;
  reversed: number;
  lines: TaxLine[];
};

export type TaxAccountPosition = {
  taxType: string;
  label: string;
  recognised: number;
  paid: number;
  outstanding: number;
  reversed: number;
  properties: PropertyTaxBalance[];
  legacyRecognised: number;
  legacyPaid: number;
  legacyOutstanding: number;
};

export type TaxDiscrepancy = {
  kind: string;
  taxType: string;
  propertyId: string;
  propertyName: string;
  canonicalOutstanding: number;
  legacyOutstanding: number;
  difference: number;
  detail: string;
  requiresAuthorisation: boolean;
};

export type TaxPosition = {
  asOf?: string;
  accounts: TaxAccountPosition[];
  unallocatedPayments: number;
  discrepancies: TaxDiscrepancy[];
  status: 'RECONCILED' | 'RECONCILIATION_REQUIRED' | 'HISTORICAL_REVIEW_REQUIRED';
  gl: Array<{ code: string; name: string; storedBalance: number; creditNormalBalance: number; canonicalOutstanding: number; difference: number }>;
};

const round = (value: number): number => Number(Number(value || 0).toFixed(2));

const onOrBefore = (value: Date | string | null | undefined, asOf?: Date): boolean => {
  if (!asOf || !value) return true;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() <= asOf.getTime();
};

const propertyKey = (id?: string | null): string => (id ? String(id) : UNALLOCATED_PROPERTY);

/** An original obligation still in force. Reversal mirror rows and reversed originals are history. */
export const isActiveObligation = (row: TaxObligationRow): boolean => {
  if (row.reversalOf) return false;
  const status = String(row.status || '');
  return status !== 'REVERSED' && status !== 'ACCOUNTANT_REVIEW';
};

const canonicalOfLegacy = (taxType: string): string =>
  LEGACY_TO_CANONICAL[taxType as LegacyTaxType] || taxType;

export function buildTaxPosition(input: TaxPositionInput): TaxPosition {
  const asOf = input.asOf;
  const obligations = (input.obligations || []).filter((row) => onOrBefore(row.transactionDate, asOf));
  const payments = (input.payments || []).filter((row) => row.status === 'POSTED' && onOrBefore(row.paymentDate, asOf));
  const discrepancies: TaxDiscrepancy[] = [];

  const active = obligations.filter(isActiveObligation);
  const activeById = new Map(active.map((row) => [row.id, row]));
  const seenSource = new Map<string, string>();
  for (const row of active) {
    if (!row.paymentId) continue;
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
    } else {
      seenSource.set(key, row.id);
    }
  }

  const paidByObligation = new Map<string, number>();
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
          propertyId: UNALLOCATED_PROPERTY,
          propertyName: UNALLOCATED_PROPERTY,
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
          taxType: allocation.taxType || activeById.get(allocation.taxObligationId)?.taxType || '',
          propertyId: propertyKey(activeById.get(allocation.taxObligationId)?.propertyId),
          propertyName: activeById.get(allocation.taxObligationId)?.propertyName || UNALLOCATED_PROPERTY,
          canonicalOutstanding: 0,
          legacyOutstanding: 0,
          difference: round(amount - take),
          detail: `Payment ${payment.id} allocations exceed the payment amount ${round(payment.amount).toFixed(2)}. Excess was not applied.`,
          requiresAuthorisation: true
        });
      }
      paidByObligation.set(
        allocation.taxObligationId,
        round((paidByObligation.get(allocation.taxObligationId) || 0) + take)
      );
    }
    if (allocated - round(payment.amount) > 0.005 && !discrepancies.some((item) => item.kind === 'PAYMENT_OVER_ALLOCATED' && item.detail.includes(payment.id))) {
      discrepancies.push({
        kind: 'PAYMENT_OVER_ALLOCATED',
        taxType: '',
        propertyId: UNALLOCATED_PROPERTY,
        propertyName: UNALLOCATED_PROPERTY,
        canonicalOutstanding: 0,
        legacyOutstanding: 0,
        difference: round(allocated - payment.amount),
        detail: `Payment ${payment.id} allocations ${allocated.toFixed(2)} exceed payment amount ${round(payment.amount).toFixed(2)}.`,
        requiresAuthorisation: true
      });
    }
    unallocatedPayments = round(unallocatedPayments + round(payment.unallocatedAmount || 0));
  }

  type Bucket = {
    propertyId: string;
    propertyName: string;
    recognised: number;
    paid: number;
    outstanding: number;
    reversed: number;
    lines: TaxLine[];
  };
  const buckets = new Map<string, Map<string, Bucket>>();
  const ensure = (taxType: string, propertyId: string, propertyName: string): Bucket => {
    if (!buckets.has(taxType)) buckets.set(taxType, new Map());
    const byProperty = buckets.get(taxType)!;
    const existing = byProperty.get(propertyId);
    if (existing) {
      if (existing.propertyName === propertyId && propertyName && propertyName !== propertyId) existing.propertyName = propertyName;
      return existing;
    }
    const created: Bucket = { propertyId, propertyName: propertyName || propertyId, recognised: 0, paid: 0, outstanding: 0, reversed: 0, lines: [] };
    byProperty.set(propertyId, created);
    return created;
  };

  for (const row of obligations) {
    const key = propertyKey(row.propertyId);
    const bucket = ensure(row.taxType, key, row.propertyName || key);
    if (!isActiveObligation(row)) {
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

  const legacyRecognised = new Map<string, number>();
  const legacyPaid = new Map<string, number>();
  const addLegacy = (rows: LegacyTaxRow[] | undefined, target: Map<string, number>) => {
    for (const row of rows || []) {
      if (!onOrBefore(row.createdAt, asOf)) continue;
      const taxType = canonicalOfLegacy(row.taxType);
      const key = `${taxType}|${propertyKey(row.propertyId)}`;
      target.set(key, round((target.get(key) || 0) + round(row.amount)));
      ensure(taxType, propertyKey(row.propertyId), row.propertyName || propertyKey(row.propertyId));
    }
  };
  addLegacy(input.legacyRecords, legacyRecognised);
  addLegacy(input.legacyPayouts, legacyPaid);

  const accounts: TaxAccountPosition[] = [];
  for (const [taxType, byProperty] of buckets.entries()) {
    const properties: PropertyTaxBalance[] = [];
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
          detail: `${TAX_TYPE_LABEL[taxType as CanonicalTaxType] || taxType} for ${bucket.propertyName}: obligations outstanding ${bucket.outstanding.toFixed(2)}, trust tax book outstanding ${legacyOutstanding.toFixed(2)}. The trust book is not rewritten.`,
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
      label: TAX_TYPE_LABEL[taxType as CanonicalTaxType] || taxType,
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

  const outstandingOf = (...types: string[]) =>
    round(accounts.filter((account) => types.includes(account.taxType)).reduce((sum, account) => sum + account.outstanding, 0));

  const glComparisons: TaxPosition['gl'] = [
    {
      code: GL.VAT_PAYABLE,
      name: 'VAT Payable',
      canonicalOutstanding: outstandingOf('VAT_OUTPUT', 'VAT_ON_COMMISSION')
    },
    {
      code: GL.ZIMRA_WITHHOLDING,
      name: 'ZIMRA Withholding Payable',
      canonicalOutstanding: outstandingOf('CAPITAL_GAINS_TAX', 'CAPITAL_GAINS_WITHHOLDING_TAX')
    }
  ].map((row) => {
    // Chart balances are debit minus credit. A credit-normal tax liability is stored as a negative number.
    const stored = round(Number((input.glBalances || []).find((item) => item.code === row.code)?.balance || 0));
    const creditNormal = round(-stored);
    const difference = round(row.canonicalOutstanding - creditNormal);
    if (Math.abs(difference) > 0.05) {
      discrepancies.push({
        kind: 'GL_MISMATCH',
        taxType: row.code,
        propertyId: UNALLOCATED_PROPERTY,
        propertyName: 'Company',
        canonicalOutstanding: row.canonicalOutstanding,
        legacyOutstanding: creditNormal,
        difference,
        detail: `GL ${row.code} ${row.name} is stored debit-minus-credit at ${stored.toFixed(2)}, which is a credit-normal liability of ${creditNormal.toFixed(2)}. Canonical outstanding is ${row.canonicalOutstanding.toFixed(2)}. The stored balance was not adjusted.`,
        requiresAuthorisation: true
      });
    }
    return { ...row, storedBalance: stored, creditNormalBalance: creditNormal, difference };
  });

  const historical = discrepancies.some((item) => item.kind.startsWith('LEGACY_') || item.kind === 'OBLIGATION_WITHOUT_TRUST_LEDGER');
  const blocking = discrepancies.some((item) => item.kind === 'DUPLICATE_OBLIGATION' || item.kind === 'PAYMENT_OVER_ALLOCATED' || item.kind === 'GL_MISMATCH' || item.kind === 'ALLOCATION_TO_INACTIVE_OBLIGATION');
  const status: TaxPosition['status'] = blocking
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
