import mongoose from 'mongoose';
import { isRecordIncomeEarlyExit } from './paymentReconciliationQuery';

export type LedgerType = 'rental' | 'sale';

export type PaymentAccountingCompleteness = {
  complete: boolean;
  reason?: string;
  stats?: {
    accountLookups: number;
  };
};

export type OwnerIncomeLedgerTarget = {
  id: string;
  ledger: LedgerType;
};

export type CompletenessTransaction = {
  type?: string;
  paymentId?: unknown;
  status?: string;
  idempotencyKey?: string;
};

export type CompletenessPassThroughAccount = {
  type?: string;
  transactions?: CompletenessTransaction[];
};

export type CompletenessAccountSnapshot = {
  propertyId?: unknown;
  ledgerType?: string;
  isArchived?: boolean;
  isActive?: boolean;
  transactions?: CompletenessTransaction[];
  passThroughAccounts?: CompletenessPassThroughAccount[];
};

export type CompletenessChargeLine = {
  amount?: number;
  chargeType?: {
    code?: string;
    category?: string;
  };
};

export type PaymentAccountingCompletenessDeps = {
  resolveLedgerTypeForProperty: (propertyId: string) => Promise<{ ledgerType: LedgerType; businessType: string }>;
  getCompatibilityChargeLines: (payment: any, companyId?: unknown) => Promise<CompletenessChargeLine[]>;
  findActivePropertyAccounts: (propertyId: string, ledgerType: LedgerType) => Promise<CompletenessAccountSnapshot[]>;
  findDevelopmentIdForUnit: (unitId: string) => Promise<string | undefined>;
};

export type OwnerIncomeCompletenessPayment = {
  _id?: unknown;
  propertyId?: unknown;
  companyId?: unknown;
  status?: string;
  amount?: number;
  depositAmount?: number;
  reversalOfPaymentId?: unknown;
  paymentType?: string;
  developmentId?: unknown;
  developmentUnitId?: unknown;
  commissionDetails?: { ownerAmount?: number };
};

const COMPLETED_STATUS = 'completed';

export function passThroughCollectionIdempotencyKey(paymentId: string, chargeTypeCode: string): string {
  return `payment:${paymentId}:pass-through:${chargeTypeCode}`;
}

export function configuredExpenseIdempotencyKey(paymentId: string): string {
  return `payment:${paymentId}:configured-expense`;
}

export function ownerIncomeIdempotencyKey(paymentId: string): string {
  return `payment:${paymentId}`;
}

export function normalizePassThroughType(type?: string): string {
  const normalized = String(type || 'OTHER')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'OTHER';
}

export function computeOwnerIncomeAmount(input: {
  isSale: boolean;
  ownerAmount?: number;
  passThroughTotal: number;
}): number {
  const ownerAmount = Number(input.ownerAmount || 0);
  return input.isSale
    ? Math.max(0, ownerAmount)
    : Math.max(0, ownerAmount - Number(input.passThroughTotal || 0));
}

export function groupRequiredPassThroughCodes(passThroughLines: CompletenessChargeLine[]): string[] {
  const grouped = new Map<string, number>();
  for (const line of passThroughLines) {
    const code = String(line?.chargeType?.code || '').trim();
    grouped.set(code, Number(grouped.get(code) || 0) + Number(line?.amount || 0));
  }
  const codes: string[] = [];
  for (const [code, amount] of grouped) {
    if (amount <= 0) continue;
    codes.push(code);
  }
  return codes;
}

export function computePassThroughTotal(passThroughLines: CompletenessChargeLine[]): number {
  return passThroughLines.reduce((sum, line) => sum + Number(line?.amount || 0), 0);
}

export function computeConfiguredExpenseTotal(propertyExpenseLines: CompletenessChargeLine[]): number {
  return propertyExpenseLines.reduce((sum, line) => sum + Number(line?.amount || 0), 0);
}

export function shouldSkipRecordIncomePosting(result: PaymentAccountingCompleteness | null | undefined): boolean {
  return result?.complete === true;
}

export async function buildOwnerIncomeLedgerTargets(input: {
  isSale: boolean;
  ledgerType: LedgerType;
  propertyId: string;
  developmentId?: unknown;
  developmentUnitId?: unknown;
  findDevelopmentIdForUnit: (unitId: string) => Promise<string | undefined>;
  unitLookupErrors?: 'swallow' | 'propagate';
}): Promise<OwnerIncomeLedgerTarget[]> {
  const targets: OwnerIncomeLedgerTarget[] = [];
  let devId = input.developmentId;
  const unitId = input.developmentUnitId;
  if (input.isSale) {
    if (unitId) targets.push({ id: String(unitId), ledger: input.ledgerType });
    if (!devId && unitId) {
      try {
        const resolved = await input.findDevelopmentIdForUnit(String(unitId));
        if (resolved) devId = resolved;
      } catch (error) {
        if (input.unitLookupErrors === 'propagate') throw error;
      }
    }
    if (devId) targets.push({ id: String(devId), ledger: input.ledgerType });
    if (!unitId && !devId) targets.push({ id: String(input.propertyId), ledger: input.ledgerType });
  } else {
    targets.push({ id: String(input.propertyId), ledger: input.ledgerType });
  }
  return targets;
}

function idsEqual(left: unknown, right: unknown): boolean {
  return String(left || '') === String(right || '');
}

function isCompletedStatus(status: unknown): boolean {
  return String(status || '') === COMPLETED_STATUS;
}

export function accountHasCompletedIncomeForPayment(
  account: CompletenessAccountSnapshot | null | undefined,
  paymentId: string
): boolean {
  return (account?.transactions || []).some(
    (tx) => tx?.type === 'income' && idsEqual(tx?.paymentId, paymentId) && isCompletedStatus(tx?.status)
  );
}

export function accountHasIncomeNotCompletedForPayment(
  account: CompletenessAccountSnapshot | null | undefined,
  paymentId: string
): boolean {
  const matches = (account?.transactions || []).filter(
    (tx) => tx?.type === 'income' && idsEqual(tx?.paymentId, paymentId)
  );
  if (matches.length === 0) return false;
  return !matches.some((tx) => isCompletedStatus(tx?.status));
}

export function accountHasCompletedPassThroughCollection(
  account: CompletenessAccountSnapshot | null | undefined,
  paymentId: string,
  chargeTypeCode: string
): boolean {
  if (!chargeTypeCode) return false;
  const type = normalizePassThroughType(chargeTypeCode);
  const idKey = passThroughCollectionIdempotencyKey(paymentId, chargeTypeCode);
  const passThroughAccounts = Array.isArray(account?.passThroughAccounts) ? account!.passThroughAccounts! : [];
  const target = passThroughAccounts.find(
    (passThroughAccount) => normalizePassThroughType(passThroughAccount?.type) === type
  );
  return (target?.transactions || []).some((tx) => {
    if (!isCompletedStatus(tx?.status)) return false;
    if (String(tx?.idempotencyKey || '') === idKey) return true;
    return tx?.type === 'collection' && idsEqual(tx?.paymentId, paymentId);
  });
}

export function accountHasCompletedConfiguredExpense(
  account: CompletenessAccountSnapshot | null | undefined,
  paymentId: string
): boolean {
  const idKey = configuredExpenseIdempotencyKey(paymentId);
  return (account?.transactions || []).some(
    (tx) =>
      tx?.type === 'expense' &&
      String(tx?.idempotencyKey || '') === idKey &&
      isCompletedStatus(tx?.status)
  );
}

export function evaluateTargetAccountingCompleteness(input: {
  account: CompletenessAccountSnapshot | null | undefined;
  paymentId: string;
  incomeRequired: boolean;
  requiredPassThroughCodes: string[];
  expenseRequired: boolean;
}): PaymentAccountingCompleteness {
  const { account, paymentId, incomeRequired, requiredPassThroughCodes, expenseRequired } = input;
  if (!account) {
    return { complete: false, reason: 'missing_account' };
  }
  if (!Array.isArray(account.transactions)) {
    return { complete: false, reason: 'unexpected_ledger_structure' };
  }

  if (incomeRequired) {
    if (accountHasCompletedIncomeForPayment(account, paymentId)) {
      // valid completed income present
    } else if (accountHasIncomeNotCompletedForPayment(account, paymentId)) {
      return { complete: false, reason: 'income_not_completed' };
    } else {
      return { complete: false, reason: 'missing_income' };
    }
  }

  for (const code of requiredPassThroughCodes) {
    if (!code) return { complete: false, reason: 'unknown_charge_type' };
    if (!accountHasCompletedPassThroughCollection(account, paymentId, code)) {
      return { complete: false, reason: 'missing_pass_through' };
    }
  }

  if (expenseRequired && !accountHasCompletedConfiguredExpense(account, paymentId)) {
    return { complete: false, reason: 'missing_expense' };
  }

  return { complete: true };
}

function incomplete(reason: string, stats?: PaymentAccountingCompleteness['stats']): PaymentAccountingCompleteness {
  return { complete: false, reason, stats };
}

export async function provePaymentAccountingCompleteness(
  payment: OwnerIncomeCompletenessPayment,
  deps: PaymentAccountingCompletenessDeps
): Promise<PaymentAccountingCompleteness> {
  if (isRecordIncomeEarlyExit(payment)) {
    return incomplete('not_eligible');
  }

  const paymentId = String(payment?._id || '');
  const propertyId = String(payment?.propertyId || '');
  if (!paymentId || !mongoose.Types.ObjectId.isValid(paymentId)) {
    return incomplete('malformed_payment');
  }
  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    return incomplete('missing_property');
  }

  const resolution = await deps.resolveLedgerTypeForProperty(propertyId);
  const isSale = resolution.ledgerType === 'sale';
  if (payment.paymentType && ((payment.paymentType === 'sale') !== isSale)) {
    return incomplete('payment_type_mismatch');
  }

  const targets = await buildOwnerIncomeLedgerTargets({
    isSale,
    ledgerType: resolution.ledgerType,
    propertyId,
    developmentId: payment.developmentId,
    developmentUnitId: payment.developmentUnitId,
    findDevelopmentIdForUnit: deps.findDevelopmentIdForUnit,
    unitLookupErrors: 'propagate'
  });
  if (!targets.length) {
    return incomplete('empty_targets');
  }
  for (const target of targets) {
    if (!target?.id || !mongoose.Types.ObjectId.isValid(String(target.id))) {
      return incomplete('invalid_target');
    }
  }

  const chargeLines = isSale ? [] : await deps.getCompatibilityChargeLines(payment, payment.companyId);
  if (!Array.isArray(chargeLines)) {
    return incomplete('unexpected_charge_lines');
  }
  const passThroughLines = chargeLines.filter((line) => line?.chargeType?.category === 'PASS_THROUGH');
  const propertyExpenseLines = chargeLines.filter((line) => line?.chargeType?.category === 'PROPERTY_EXPENSE');
  const requiredPassThroughCodes = groupRequiredPassThroughCodes(passThroughLines);
  if (requiredPassThroughCodes.some((code) => !code)) {
    return incomplete('unknown_charge_type');
  }
  const passThroughTotal = computePassThroughTotal(passThroughLines);
  const propertyExpenseTotal = computeConfiguredExpenseTotal(propertyExpenseLines);
  const incomeRequired = computeOwnerIncomeAmount({
    isSale,
    ownerAmount: payment.commissionDetails?.ownerAmount,
    passThroughTotal
  }) > 0;
  const expenseRequired = propertyExpenseTotal > 0;

  let accountLookups = 0;
  for (const target of targets) {
    const accounts = await deps.findActivePropertyAccounts(target.id, target.ledger);
    accountLookups += 1;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return incomplete(isSale && targets.length > 1 ? 'missing_sale_target' : 'missing_account', { accountLookups });
    }
    if (accounts.length > 1) {
      return incomplete('ambiguous_account', { accountLookups });
    }
    const evaluated = evaluateTargetAccountingCompleteness({
      account: accounts[0],
      paymentId,
      incomeRequired,
      requiredPassThroughCodes,
      expenseRequired
    });
    if (!evaluated.complete) {
      const reason =
        isSale && targets.length > 1 && evaluated.reason === 'missing_income'
          ? 'missing_sale_target'
          : evaluated.reason;
      return incomplete(reason || 'not_proven', { accountLookups });
    }
  }

  return { complete: true, stats: { accountLookups } };
}

/**
 * Read-only completeness check. Any throw, timeout, or ambiguous state is
 * "not proven complete" so the existing posting path still runs.
 */
export async function checkPaymentAccountingCompleteness(
  payment: OwnerIncomeCompletenessPayment,
  deps: PaymentAccountingCompletenessDeps
): Promise<PaymentAccountingCompleteness> {
  try {
    return await provePaymentAccountingCompleteness(payment, deps);
  } catch {
    return incomplete('completeness_error');
  }
}
