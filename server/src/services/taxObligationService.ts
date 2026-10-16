import mongoose from 'mongoose';
import { TaxObligation } from '../models/TaxObligation';
import { TaxReviewItem } from '../models/TaxReviewItem';
import type { CanonicalTaxType, TaxObligationStatus } from './tax/taxTypes';
import { isPayableStatus, isSettledStatus } from './tax/taxTypes';
import { resolveTaxFx } from './tax/fxPolicy';
import { idsEqual, roundMoney } from '../utils/money';
import { throwOnceIfArmed } from './testFailureSeam';

const toId = (value: mongoose.Types.ObjectId | string): mongoose.Types.ObjectId =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));

function duplicateKeyDetails(error: any): { pattern: Record<string, unknown>; value: Record<string, unknown> } | null {
  if (Number(error?.code) !== 11000) return null;
  const pattern = error?.keyPattern || error?.errorResponse?.keyPattern;
  const value = error?.keyValue || error?.errorResponse?.keyValue;
  if (!pattern || typeof pattern !== 'object' || !value || typeof value !== 'object') return null;
  return { pattern, value };
}

function keyMatchesObligationIdentity(
  value: Record<string, unknown>,
  identity: { companyId: unknown; paymentId?: unknown; taxType: unknown }
): boolean {
  if (identity.companyId == null || identity.paymentId == null || identity.taxType == null) return false;
  if (value.companyId != null && !idsEqual(value.companyId, identity.companyId)) return false;
  if (value.paymentId != null && !idsEqual(value.paymentId, identity.paymentId)) return false;
  if (value.taxType != null && String(value.taxType) !== String(identity.taxType)) return false;
  return value.companyId != null && value.paymentId != null && value.taxType != null;
}

/** 11000 is an original collision only when the index key is this company, payment, and tax type. */
function isExpectedOriginalDuplicate(
  error: any,
  identity: { companyId: unknown; paymentId?: unknown; taxType: unknown }
): boolean {
  const details = duplicateKeyDetails(error);
  if (!details) return false;
  const fields = Object.keys(details.pattern);
  const coversIdentity = fields.includes('companyId') && fields.includes('paymentId') && fields.includes('taxType');
  if (!coversIdentity || !keyMatchesObligationIdentity(details.value, identity)) return false;
  if (fields.includes('reversalOf') && details.value.reversalOf != null) return false;
  return true;
}

/** 11000 is a reversal collision only when the index key is this original's reversal row. */
function isExpectedReversalDuplicate(error: any, original: { _id: unknown; companyId: unknown; paymentId?: unknown; taxType: unknown }): boolean {
  const details = duplicateKeyDetails(error);
  if (!details) return false;
  const fields = Object.keys(details.pattern);
  if (!fields.includes('reversalOf') || !fields.includes('companyId') || !fields.includes('paymentId') || !fields.includes('taxType')) {
    return false;
  }
  if (!idsEqual(details.value.reversalOf, original._id)) return false;
  return keyMatchesObligationIdentity(details.value, original);
}

export async function upsertPaymentTaxObligation(input: {
  companyId: string;
  taxType: CanonicalTaxType;
  paymentId: string;
  propertyId?: string;
  taxPeriod: string;
  transactionDate: Date;
  currency?: string;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  calculationBasis: string;
  calculationSnapshot?: Record<string, unknown>;
  status?: TaxObligationStatus;
  glAccount?: string;
  sourceLedger?: string;
  createdBy?: string;
  journalEntryId?: string;
}): Promise<string | null> {
  const taxAmount = roundMoney(Number(input.taxAmount || 0));
  if (!(taxAmount > 0) && input.status !== 'ACCOUNTANT_REVIEW') return null;

  const companyId = toId(input.companyId);
  const paymentId = toId(input.paymentId);
  const existing = await TaxObligation.findOne({
    companyId,
    paymentId,
    taxType: input.taxType,
    reversalOf: null
  });
  if (existing) return String(existing._id);

  const fx = resolveTaxFx({
    transactionCurrency: input.currency,
    taxCurrency: input.currency,
    functionalCurrency: input.currency,
    exchangeRate: 1,
    rateSource: 'SAME_CURRENCY',
    rateDate: input.transactionDate
  });
  if (fx.fxReviewRequired) {
    await openReview({
      companyId: input.companyId,
      kind: 'FX_REVIEW_REQUIRED',
      title: 'FX conversion is not available',
      paymentId: input.paymentId,
      detail: 'Transaction currency differs from tax/functional currency and no sourced rate was provided. Rate 1 was not applied.'
    });
  }

  try {
    const created = await TaxObligation.create({
      companyId,
      taxType: input.taxType,
      entityType: 'payment',
      entityId: input.paymentId,
      propertyId: input.propertyId ? toId(input.propertyId) : undefined,
      paymentId,
      transactionId: input.paymentId,
      taxPeriod: input.taxPeriod,
      transactionDate: input.transactionDate,
      currency: fx.transactionCurrency,
      taxCurrency: fx.taxCurrency,
      exchangeRate: fx.exchangeRate == null ? undefined : fx.exchangeRate,
      exchangeRateSource: fx.rateSource,
      exchangeRateDate: fx.rateDate || input.transactionDate,
      functionalAmount: fx.fxReviewRequired ? undefined : taxAmount,
      taxableAmount: roundMoney(input.taxableAmount || 0),
      taxRate: Number(input.taxRate || 0),
      taxAmount,
      calculationBasis: input.calculationBasis,
      calculationSnapshot: input.calculationSnapshot,
      status: fx.fxReviewRequired ? 'ACCOUNTANT_REVIEW' : (input.status || (taxAmount > 0 ? 'PAYABLE' : 'CALCULATED')),
      calculatedAt: new Date(),
      glAccount: input.glAccount,
      sourceLedger: input.sourceLedger || 'company_journal',
      journalEntryId: input.journalEntryId,
      createdBy: input.createdBy ? toId(input.createdBy) : undefined,
      reversalOf: null
    });
    return String(created._id);
  } catch (error: any) {
    if (isExpectedOriginalDuplicate(error, { companyId, paymentId, taxType: input.taxType })) {
      const raced = await TaxObligation.findOne({
        companyId,
        paymentId,
        taxType: input.taxType,
        reversalOf: null
      });
      if (raced) return String(raced._id);
    }
    throw error;
  }
}

async function linkOriginalToExistingReversal(original: any, reversalId: mongoose.Types.ObjectId): Promise<void> {
  let dirty = false;
  if (!original.reversedByObligationId) {
    original.reversedByObligationId = reversalId;
    dirty = true;
  }
  if (original.status !== 'REVERSED') {
    original.status = 'REVERSED';
    dirty = true;
  }
  if (dirty) await original.save();
}

export async function reversePaymentTaxObligations(input: {
  companyId: string;
  paymentId: string;
  createdBy?: string;
  reason?: string;
  notes?: string;
}): Promise<'reversed' | 'skipped'> {
  const originals = await TaxObligation.find({
    companyId: toId(input.companyId),
    paymentId: toId(input.paymentId),
    reversalOf: null
  });
  if (!originals.length) return 'skipped';
  throwOnceIfArmed(
    String(input.paymentId),
    `${String(input.notes || '')} ${String(input.reason || '')}`,
    'PHASE28_FAIL_TAX'
  );
  for (const original of originals) {
    const preservedAmount = Number(original.taxAmount || 0);
    const existing = await TaxObligation.findOne({
      companyId: original.companyId,
      paymentId: original.paymentId,
      taxType: original.taxType,
      reversalOf: original._id
    });
    if (existing) {
      await linkOriginalToExistingReversal(original, existing._id);
      continue;
    }
    let reversal: any;
    try {
      reversal = await TaxObligation.create({
        companyId: original.companyId,
        taxType: original.taxType,
        entityType: original.entityType,
        entityId: original.entityId,
        propertyId: original.propertyId,
        paymentId: original.paymentId,
        transactionId: `${original.transactionId || original.paymentId}:reversal`,
        taxPeriod: original.taxPeriod,
        transactionDate: new Date(),
        currency: original.currency,
        taxableAmount: original.taxableAmount,
        taxRate: original.taxRate,
        taxAmount: preservedAmount,
        calculationBasis: `REVERSAL_OF:${original._id}`,
        calculationSnapshot: {
          originalId: String(original._id),
          originalTaxAmount: preservedAmount,
          originalTaxRate: original.taxRate,
          originalTaxPeriod: original.taxPeriod,
          originalTaxType: original.taxType
        },
        status: 'REVERSED',
        calculatedAt: new Date(),
        glAccount: original.glAccount,
        sourceLedger: original.sourceLedger,
        reversalOf: original._id,
        createdBy: input.createdBy ? toId(input.createdBy) : undefined
      });
    } catch (error: any) {
      if (!isExpectedReversalDuplicate(error, original)) throw error;
      reversal = await TaxObligation.findOne({
        companyId: original.companyId,
        paymentId: original.paymentId,
        taxType: original.taxType,
        reversalOf: original._id
      });
      if (!reversal) throw error;
    }
    await linkOriginalToExistingReversal(original, reversal._id);
  }
  return 'reversed';
}

export async function outstandingForObligation(obligationId: string): Promise<number> {
  const row = await TaxObligation.findById(obligationId).lean();
  if (!row || row.status === 'REVERSED') return 0;
  if (isSettledStatus(row.status as TaxObligationStatus)) return 0;
  const { TaxPayment } = await import('../models/TaxPayment');
  const paid = await TaxPayment.aggregate([
    { $match: { status: 'POSTED', 'allocations.taxObligationId': row._id } },
    { $unwind: '$allocations' },
    { $match: { 'allocations.taxObligationId': row._id } },
    { $group: { _id: null, total: { $sum: '$allocations.amount' } } }
  ]);
  return roundMoney(Math.max(0, Number(row.taxAmount || 0) - Number(paid[0]?.total || 0)));
}

export async function markObligationsPaid(input: {
  allocations: Array<{ taxObligationId: string; amount: number }>;
  paymentReference?: string;
  zimraReference?: string;
  paidAt: Date;
}): Promise<void> {
  for (const alloc of input.allocations) {
    const remaining = await outstandingForObligation(alloc.taxObligationId);
    const obligation = await TaxObligation.findById(alloc.taxObligationId);
    if (!obligation) throw new Error('Tax obligation not found');
    if (obligation.status === 'REVERSED') throw new Error('Cannot pay a reversed tax obligation');
    if (roundMoney(alloc.amount) - remaining > 0.0001) {
      throw new Error(`Allocation exceeds outstanding ${remaining.toFixed(2)} for obligation ${alloc.taxObligationId}`);
    }
    const newOutstanding = roundMoney(remaining - alloc.amount);
    obligation.paymentReference = input.paymentReference || obligation.paymentReference;
    obligation.zimraReference = input.zimraReference || obligation.zimraReference;
    obligation.paidAt = input.paidAt;
    obligation.status = newOutstanding <= 0.005 ? 'PAID' : (isPayableStatus(obligation.status as TaxObligationStatus) ? obligation.status : 'PAYABLE');
    if (newOutstanding <= 0.005) obligation.reconciledAt = input.paidAt;
    if (newOutstanding <= 0.005 && obligation.status === 'PAID') {
      // keep PAID; accountant can later mark RECONCILED
    }
    await obligation.save();
  }
}

export async function openReview(input: {
  companyId: string;
  kind: string;
  title: string;
  detail?: string;
  paymentId?: string;
  propertyId?: string;
  taxObligationId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await TaxReviewItem.updateOne(
      {
        companyId: toId(input.companyId),
        kind: input.kind,
        paymentId: input.paymentId ? toId(input.paymentId) : undefined,
        taxObligationId: input.taxObligationId ? toId(input.taxObligationId) : undefined,
        status: 'open'
      },
      {
        $setOnInsert: {
          companyId: toId(input.companyId),
          kind: input.kind,
          status: 'open',
          title: input.title,
          detail: input.detail,
          paymentId: input.paymentId ? toId(input.paymentId) : undefined,
          propertyId: input.propertyId ? toId(input.propertyId) : undefined,
          taxObligationId: input.taxObligationId ? toId(input.taxObligationId) : undefined,
          metadata: input.metadata,
          severity: (input.metadata as any)?.severity || 'MEDIUM',
          currentAmount: (input.metadata as any)?.currentAmount,
          expectedBasis: (input.metadata as any)?.expectedBasis,
          detectedAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch {
    // duplicate review is non-fatal
  }
}
