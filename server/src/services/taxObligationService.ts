import mongoose from 'mongoose';
import { TaxObligation } from '../models/TaxObligation';
import { TaxReviewItem } from '../models/TaxReviewItem';
import type { CanonicalTaxType, TaxObligationStatus } from './tax/taxTypes';
import { isPayableStatus, isSettledStatus } from './tax/taxTypes';
import { resolveTaxFx } from './tax/fxPolicy';
import { roundMoney } from '../utils/money';
import { throwOnceIfArmed } from './testFailureSeam';

const toId = (value: mongoose.Types.ObjectId | string): mongoose.Types.ObjectId =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));

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
    reversalOf: { $exists: false }
  });
  if (existing) {
    if (existing.status === 'REVERSED' || isSettledStatus(existing.status)) return String(existing._id);
    return String(existing._id);
  }

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
    createdBy: input.createdBy ? toId(input.createdBy) : undefined
  });
  return String(created._id);
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
    reversalOf: { $exists: false }
  });
  if (!originals.length) return 'skipped';
  throwOnceIfArmed(
    String(input.paymentId),
    `${String(input.notes || '')} ${String(input.reason || '')}`,
    'PHASE28_FAIL_TAX'
  );
  for (const original of originals) {
    const preservedAmount = Number(original.taxAmount || 0);
    const existing = await TaxObligation.findOne({ reversalOf: original._id });
    if (existing) {
      if (!original.reversedByObligationId) {
        original.reversedByObligationId = existing._id;
        if (original.status !== 'REVERSED') original.status = 'REVERSED';
        if (Number(original.taxAmount || 0) !== preservedAmount) original.taxAmount = preservedAmount;
        await original.save();
      }
      continue;
    }
    const reversal = await TaxObligation.create({
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
    original.status = 'REVERSED';
    original.reversedByObligationId = reversal._id;
    original.taxAmount = preservedAmount;
    await original.save();
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
