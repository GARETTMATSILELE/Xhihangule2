import mongoose from 'mongoose';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { IndividualRentalTaxRecord, IIndividualRentalTaxRecord } from '../models/IndividualRentalTaxRecord';
import { IndividualRentalTaxPayment, IIndividualRentalTaxPayment } from '../models/IndividualRentalTaxPayment';
import { TransactionTaxSnapshot, ITransactionTaxSnapshot } from '../models/TransactionTaxSnapshot';
import { Payment } from '../models/Payment';
import { LandlordFinancialTransaction } from '../models/LandlordFinancialTransaction';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { TaxPeriod } from '../models/TaxPeriod';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { assignmentStatusForExistingPeriod, resolveTaxPeriod } from './taxPeriodService';
import { evaluateIndividualRentalTaxApplicability } from './individualRentalTaxApplicability';
import { resolveRentalTaxBase } from './individualRentalTaxBase';
import { calculateIndividualRentalTax } from './individualRentalTaxCalculation';
import { buildXlsxWorkbook } from '../utils/xlsxWorkbook';
import { roundMoney } from '../utils/money';
import { netFromNullable, sumCompleteTaxAmounts } from './tax/taxAmountAggregation';
import { normalizeRentalTaxRegime } from './tax/rentalTaxTypes';

const DISCLAIMER =
  'This report presents rental-tax calculations based on the taxpayer information, transaction records and configured Zimbabwe tax rules available in Mantis. It is a tax working paper and does not constitute tax advice or confirmation of a ZIMRA-assessed liability.';

function asObjectId(value: string) {
  return new mongoose.Types.ObjectId(value);
}

function toApi(row: IIndividualRentalTaxRecord | Record<string, unknown>) {
  const doc = row as any;
  return {
    id: String(doc._id),
    sourceType: doc.sourceType,
    sourceId: String(doc.sourceId),
    snapshotId: doc.snapshotId ? String(doc.snapshotId) : null,
    propertyId: doc.propertyId ? String(doc.propertyId) : null,
    taxPeriodId: doc.taxPeriodId ? String(doc.taxPeriodId) : null,
    taxPeriodKey: doc.taxPeriodKey,
    taxType: doc.taxType,
    recordKind: doc.recordKind,
    reversalOf: doc.reversalOf ? String(doc.reversalOf) : null,
    rentalTaxRegime: doc.rentalTaxRegime,
    applicabilityStatus: doc.applicabilityStatus,
    applicabilityReason: doc.applicabilityReason,
    grossRentalAmount: doc.grossRentalAmount,
    excludedAmount: doc.excludedAmount,
    taxableRentalBase: doc.taxableRentalBase,
    taxRate: doc.taxRate,
    taxAmount: doc.taxAmount,
    calculationMethod: doc.calculationMethod,
    calculationStatus: doc.calculationStatus,
    reviewStatus: doc.reviewStatus,
    reviewReason: doc.reviewReason || null,
    reviewReasons: doc.reviewReasons || [],
    taxRuleId: doc.taxRuleId || null,
    taxRuleVersion: doc.taxRuleVersion ?? null,
    taxRuleCode: doc.taxRuleCode || null,
    sourceReference: doc.sourceReference || null,
    currency: doc.currency,
    transactionCurrency: doc.transactionCurrency,
    baseCurrency: doc.baseCurrency,
    exchangeRate: doc.exchangeRate,
    exchangeRateDate: doc.exchangeRateDate,
    incomeTaxAmount: null,
    vatAmount: null
  };
}

function paymentToApi(row: IIndividualRentalTaxPayment | Record<string, unknown>) {
  const doc = row as any;
  return {
    id: String(doc._id),
    taxPeriodId: doc.taxPeriodId ? String(doc.taxPeriodId) : null,
    taxPeriodKey: doc.taxPeriodKey,
    taxType: doc.taxType,
    propertyId: doc.propertyId ? String(doc.propertyId) : null,
    amount: doc.amount,
    currency: doc.currency,
    paymentDate: doc.paymentDate,
    paymentMethod: doc.paymentMethod || null,
    paymentReference: doc.paymentReference || null,
    zimraReference: doc.zimraReference || null,
    documentId: doc.documentId || null,
    notes: doc.notes || null,
    status: doc.status,
    landlordRecordedOnly: true
  };
}

async function writeAudit(companyId: string, eventType: string, sourceId: string, message: string, metadata: Record<string, unknown>) {
  await AccountingEventLog.create({
    companyId: asObjectId(companyId),
    eventType,
    sourceModule: 'individual_rental_tax',
    sourceId,
    success: !String(eventType).includes('FAILED'),
    message,
    metadata
  });
}

async function assertPeriodAllowsRentalTax(period: { taxPeriodId?: unknown; taxPeriodKey?: string; status?: string } | null) {
  if (!period?.taxPeriodId) return;
  const row = await TaxPeriod.findById(period.taxPeriodId).select('status taxType periodKey');
  if (!row) return;
  if (assignmentStatusForExistingPeriod(row.status as any) === 'PERIOD_CLOSED') {
    throw new AppError(`Rental tax period ${row.periodKey} is ${row.status}. Corrections require an amendment.`, 409);
  }
}

async function loadSource(snapshot: ITransactionTaxSnapshot) {
  if (snapshot.sourceType === 'Payment') {
    const payment = await Payment.findById(snapshot.sourceId).lean();
    if (!payment) return null;
    return {
      amount: Number(payment.amount || 0),
      rentAllocated: (payment as any).rentAllocated ?? (payment as any).commissionDetails?.ownerAmount ?? null,
      levyAllocated: (payment as any).levyAllocated ?? 0,
      depositAmount: Number(payment.depositAmount || 0),
      category: snapshot.sourceKind === 'PAYMENT_RENT' ? 'RENTAL_INCOME' : 'TENANT_DEPOSIT',
      currency: String((payment as any).currency || 'USD'),
      exchangeRate: (payment as any).exchangeRate ?? 1,
      exchangeRateDate: payment.paymentDate || null
    };
  }
  const entry = await LandlordFinancialTransaction.findById(snapshot.sourceId).lean();
  if (!entry) return null;
  return {
    amount: Number(entry.amount || 0),
    rentAllocated: null as number | null,
    levyAllocated: 0,
    depositAmount: 0,
    category: entry.category || null,
    currency: String(entry.currency || 'USD'),
    exchangeRate: 1,
    exchangeRateDate: entry.date || null
  };
}

function reviewStatusOf(calculationStatus: string, reviewReasons: string[]) {
  if (calculationStatus === 'REVIEW_REQUIRED' || calculationStatus === 'PERIOD_REQUIRED' || reviewReasons.length) {
    return 'REVIEW_REQUIRED';
  }
  if (calculationStatus === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (calculationStatus === 'CALCULATED') return 'CALCULATED';
  return calculationStatus;
}

export type ReverseRentalTaxInput = {
  companyId: string;
  sourceType: 'Payment' | 'LandlordFinancialTransaction';
  sourceId: string;
  reason?: string;
  reversalTransactionId?: string;
  userId?: string;
};

export const individualRentalTaxService = {
  toApi,

  async postForSnapshot(snapshot: ITransactionTaxSnapshot, classifiedBy?: string | null): Promise<IIndividualRentalTaxRecord | null> {
    if (snapshot.sourceKind === 'PAYMENT_DEPOSIT' || snapshot.sourceKind === 'LIABILITY') {
      return null;
    }
    if (snapshot.sourceKind !== 'PAYMENT_RENT' && snapshot.sourceKind !== 'OTHER_INCOME') {
      return null;
    }

    const existing = await IndividualRentalTaxRecord.findOne({
      companyId: snapshot.companyId,
      sourceType: snapshot.sourceType,
      sourceId: snapshot.sourceId,
      taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
      recordKind: 'ORIGINAL'
    });
    if (existing) return existing;

    const rentalRef = (snapshot.taxRuleReferences || []).find((row) => row.taxType === 'PRESUMPTIVE_RENTAL_INCOME_TAX');
    const profile = snapshot.taxProfileSnapshot;
    const applicability = evaluateIndividualRentalTaxApplicability({
      sourceKind: snapshot.sourceKind,
      rentalTaxRegime: snapshot.rentalTaxRegime || profile?.rentalTaxRegime,
      rentalTaxTreatment: snapshot.rentalTaxTreatment || profile?.rentalTaxTreatment,
      propertyUseClass: profile?.propertyUseClass,
      profileSnapshotPresent: Boolean(profile),
      transactionDate: snapshot.transactionDate,
      rentalTaxRule: rentalRef
        ? {
            id: rentalRef.ruleId || '',
            version: rentalRef.ruleVersion || 1,
            ruleCode: rentalRef.ruleCode || '',
            rate: rentalRef.configuredRate,
            calculationMethod: 'GROSS_RENTAL_PERCENT',
            sourceReference: rentalRef.sourceReference || '',
            effectiveFrom: rentalRef.effectiveFrom ? new Date(rentalRef.effectiveFrom) : new Date(snapshot.transactionDate),
            effectiveTo: null
          }
        : null
    });

    const period = await resolveTaxPeriod({
      companyId: String(snapshot.companyId),
      taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
      transactionDate: snapshot.transactionDate
    });

    try {
      await assertPeriodAllowsRentalTax({
        taxPeriodId: period.taxPeriodId,
        taxPeriodKey: period.periodKey,
        status: period.status === 'PERIOD_REQUIRED' ? undefined : period.status
      });
    } catch (error: any) {
      if (Number(error?.statusCode) === 409) {
        await writeAudit(String(snapshot.companyId), 'RENTAL_TAX_REVIEW_REQUIRED', String(snapshot.sourceId), 'Rental tax period is closed', {
          taxPeriodKey: period.periodKey,
          reason: 'TAX_PERIOD_CLOSED'
        });
        throw error;
      }
      throw error;
    }

    const source = await loadSource(snapshot);
    if (!source && snapshot.sourceKind === 'PAYMENT_RENT') {
      await writeAudit(String(snapshot.companyId), 'RENTAL_TAX_REVIEW_REQUIRED', String(snapshot.sourceId), 'Source transaction missing', {
        reason: 'TRANSACTION_CLASSIFICATION_INCOMPLETE'
      });
    }

    const taxBase = resolveRentalTaxBase({
      sourceKind: snapshot.sourceKind,
      calculationMethod: applicability.calculationMethod || 'GROSS_RENTAL_PERCENT',
      amount: source?.amount,
      rentAllocated: source?.rentAllocated,
      levyAllocated: source?.levyAllocated,
      depositAmount: source?.depositAmount,
      category: source?.category
    });

    const calc = calculateIndividualRentalTax({
      applicability,
      taxBase,
      periodAssignmentStatus: period.assignmentStatus
    });

    const reviewReasons = Array.from(new Set([...(applicability.reviewReasons || []), ...(taxBase.reviewReasons || []), ...(calc.reviewReasons || [])]));
    const reviewStatus = reviewStatusOf(calc.calculationStatus, reviewReasons);

    try {
      const created = await IndividualRentalTaxRecord.create({
        companyId: snapshot.companyId,
        ownerId: classifiedBy && mongoose.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null,
        propertyId: snapshot.propertyId || null,
        sourceType: snapshot.sourceType,
        sourceId: snapshot.sourceId,
        snapshotId: snapshot._id,
        taxPeriodId: period.taxPeriodId,
        taxPeriodKey: period.periodKey,
        taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
        recordKind: 'ORIGINAL',
        rentalTaxRegime: normalizeRentalTaxRegime(snapshot.rentalTaxRegime || profile?.rentalTaxRegime),
        applicabilityStatus: applicability.status,
        applicabilityReason: applicability.reason,
        grossRentalAmount: calc.grossRentalAmount,
        excludedAmount: calc.excludedAmount,
        taxableRentalBase: calc.taxableRentalBase,
        taxRate: calc.taxRate,
        taxAmount: calc.taxAmount,
        currency: source?.currency || 'USD',
        transactionCurrency: source?.currency || 'USD',
        baseCurrency: source?.currency || 'USD',
        baseAmount: calc.taxableRentalBase,
        exchangeRate: source?.exchangeRate ?? 1,
        exchangeRateDate: source?.exchangeRateDate || snapshot.transactionDate,
        taxRuleId: calc.taxRuleId,
        taxRuleVersion: calc.taxRuleVersion,
        taxRuleCode: calc.taxRuleCode,
        taxRuleEffectiveFrom: applicability.effectiveFrom,
        sourceReference: calc.sourceReference,
        calculationMethod: calc.calculationMethod,
        calculationStatus: calc.calculationStatus,
        reviewStatus,
        reviewReason: reviewReasons[0] || null,
        reviewReasons,
        incomeTaxAmount: null,
        vatAmount: null,
        calculatedAt: new Date(),
        calculatedBy: classifiedBy && mongoose.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null
      });
      const event =
        calc.calculationStatus === 'REVIEW_REQUIRED' || calc.calculationStatus === 'PERIOD_REQUIRED'
          ? 'RENTAL_TAX_REVIEW_REQUIRED'
          : 'RENTAL_TAX_CALCULATED';
      await writeAudit(String(snapshot.companyId), event, String(snapshot.sourceId), `Rental tax ${calc.calculationStatus}`, {
        taxAmount: calc.taxAmount,
        taxRuleVersion: calc.taxRuleVersion,
        rentalTaxRegime: snapshot.rentalTaxRegime
      });
      return created;
    } catch (error: any) {
      if (error?.code === 11000) {
        return IndividualRentalTaxRecord.findOne({
          companyId: snapshot.companyId,
          sourceType: snapshot.sourceType,
          sourceId: snapshot.sourceId,
          taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
          recordKind: 'ORIGINAL'
        });
      }
      throw error;
    }
  },

  async safePostForSnapshot(snapshot: ITransactionTaxSnapshot | null | undefined, classifiedBy?: string | null): Promise<void> {
    if (!snapshot) return;
    try {
      await this.postForSnapshot(snapshot, classifiedBy);
    } catch (error: any) {
      logger.warn('Individual rental tax calculation failed after accounting success', {
        sourceId: String(snapshot.sourceId),
        message: error?.message || error
      });
      await writeAudit(
        String(snapshot.companyId),
        'RENTAL_TAX_REVIEW_REQUIRED',
        String(snapshot.sourceId),
        error?.message || 'Rental tax calculation failed',
        { accountingStatus: 'ACCOUNTING_SUCCESS', reason: 'CALCULATION_FAILED' }
      ).catch(() => undefined);
    }
  },

  async reverseForSource(input: ReverseRentalTaxInput): Promise<IIndividualRentalTaxRecord | null> {
    const original = await IndividualRentalTaxRecord.findOne({
      companyId: asObjectId(input.companyId),
      sourceType: input.sourceType,
      sourceId: asObjectId(input.sourceId),
      recordKind: 'ORIGINAL'
    });
    if (!original) return null;
    const existing = await IndividualRentalTaxRecord.findOne({
      companyId: original.companyId,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
      recordKind: 'REVERSAL'
    });
    if (existing) return existing;
    try {
      await assertPeriodAllowsRentalTax({
        taxPeriodId: original.taxPeriodId,
        taxPeriodKey: original.taxPeriodKey
      });
    } catch (error: any) {
      if (Number(error?.statusCode) === 409) throw error;
    }
    const created = await IndividualRentalTaxRecord.create({
      companyId: original.companyId,
      ownerId: original.ownerId,
      propertyId: original.propertyId,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      snapshotId: original.snapshotId,
      taxPeriodId: original.taxPeriodId,
      taxPeriodKey: original.taxPeriodKey,
      taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
      recordKind: 'REVERSAL',
      reversalOf: original._id,
      reversalReason: input.reason || 'Accounting reversal',
      reversalDate: new Date(),
      reversalTransactionId: input.reversalTransactionId || null,
      rentalTaxRegime: original.rentalTaxRegime,
      applicabilityStatus: original.applicabilityStatus,
      applicabilityReason: original.applicabilityReason,
      grossRentalAmount: original.grossRentalAmount == null ? null : roundMoney(-Number(original.grossRentalAmount)),
      excludedAmount: original.excludedAmount == null ? null : roundMoney(-Number(original.excludedAmount)),
      taxableRentalBase: original.taxableRentalBase == null ? null : roundMoney(-Number(original.taxableRentalBase)),
      taxRate: original.taxRate,
      taxAmount: original.taxAmount == null ? null : roundMoney(-Number(original.taxAmount)),
      currency: original.currency,
      transactionCurrency: original.transactionCurrency,
      baseCurrency: original.baseCurrency,
      baseAmount: original.baseAmount == null ? null : roundMoney(-Number(original.baseAmount)),
      exchangeRate: original.exchangeRate,
      exchangeRateDate: original.exchangeRateDate,
      taxRuleId: original.taxRuleId,
      taxRuleVersion: original.taxRuleVersion,
      taxRuleCode: original.taxRuleCode,
      taxRuleEffectiveFrom: original.taxRuleEffectiveFrom,
      sourceReference: original.sourceReference,
      calculationMethod: original.calculationMethod,
      calculationStatus: 'REVERSED',
      reviewStatus: original.reviewStatus,
      reviewReason: original.reviewReason,
      reviewReasons: original.reviewReasons,
      incomeTaxAmount: null,
      vatAmount: null,
      calculatedAt: new Date(),
      calculatedBy: input.userId && mongoose.Types.ObjectId.isValid(input.userId) ? asObjectId(input.userId) : null
    });
    await writeAudit(input.companyId, 'RENTAL_TAX_REVERSED', input.sourceId, 'Rental tax reversal posted; original preserved', {
      originalId: String(original._id),
      reversalId: String(created._id)
    });
    await writeAudit(input.companyId, 'RENTAL_TAX_AMENDED', input.sourceId, 'Replacement rental-tax path requires a new source transaction', {
      originalId: String(original._id)
    });
    return created;
  },

  async safeReverseForSource(input: ReverseRentalTaxInput): Promise<void> {
    try {
      await this.reverseForSource(input);
    } catch (error: any) {
      logger.warn('Individual rental tax reversal failed', { sourceId: input.sourceId, message: error?.message || error });
    }
  },

  async recordPayment(input: {
    companyId: string;
    userId: string;
    taxPeriodId?: string;
    taxPeriodKey?: string;
    propertyId?: string;
    amount: number;
    currency?: string;
    paymentDate?: Date | string;
    paymentMethod?: string;
    paymentReference?: string;
    zimraReference?: string;
    documentId?: string;
    notes?: string;
  }) {
    const amount = Number(input.amount || 0);
    if (!(amount > 0)) throw new AppError('Payment amount must be greater than zero', 400);
    let periodKey = String(input.taxPeriodKey || '').trim();
    let periodId: string | null = input.taxPeriodId || null;
    if (periodId) {
      const period = await TaxPeriod.findOne({
        _id: asObjectId(periodId),
        companyId: asObjectId(input.companyId),
        taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX'
      });
      if (!period) throw new AppError('Rental tax period not found', 404);
      periodKey = period.periodKey;
      periodId = String(period._id);
    }
    if (!periodKey) throw new AppError('taxPeriodId or taxPeriodKey is required', 400);
    if (input.propertyId) {
      const property = await Property.findOne({
        _id: asObjectId(input.propertyId),
        companyId: asObjectId(input.companyId),
        isDeleted: { $ne: true }
      }).select('_id');
      if (!property) throw new AppError('Property not found', 404);
    }
    const created = await IndividualRentalTaxPayment.create({
      companyId: asObjectId(input.companyId),
      ownerId: asObjectId(input.userId),
      propertyId: input.propertyId ? asObjectId(input.propertyId) : null,
      taxPeriodId: periodId,
      taxPeriodKey: periodKey,
      taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
      amount: roundMoney(amount),
      currency: input.currency || 'USD',
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      paymentMethod: input.paymentMethod || null,
      paymentReference: input.paymentReference || null,
      zimraReference: input.zimraReference || null,
      documentId: input.documentId || null,
      notes: input.notes || null,
      status: 'POSTED',
      recordedBy: asObjectId(input.userId)
    });
    const reasons: string[] = [];
    if (!String(input.paymentReference || '').trim() && !String(input.zimraReference || '').trim()) {
      reasons.push('TAX_PAYMENT_MISSING_REFERENCE');
    }
    await writeAudit(input.companyId, 'RENTAL_TAX_PAYMENT_RECORDED', String(created._id), 'Landlord-recorded rental tax payment', {
      amount: created.amount,
      taxPeriodKey: periodKey,
      zimraConfirmed: false,
      reviewReasons: reasons
    });
    return { ...paymentToApi(created), reviewReasons: reasons };
  },

  async workingPaper(companyId: string, periodKey?: string) {
    const company = await Company.findById(companyId).select('name tin taxProfile').lean();
    const query: Record<string, unknown> = { companyId: asObjectId(companyId) };
    if (periodKey) query.taxPeriodKey = periodKey;
    const records = await IndividualRentalTaxRecord.find(query).sort({ calculatedAt: 1 }).lean();
    const payments = await IndividualRentalTaxPayment.find({
      companyId: asObjectId(companyId),
      status: 'POSTED',
      ...(periodKey ? { taxPeriodKey: periodKey } : {})
    })
      .sort({ paymentDate: 1 })
      .lean();
    const calculatedTax = sumCompleteTaxAmounts(records, (row) => row.taxAmount);
    const taxPayments = roundMoney(payments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const gross = sumCompleteTaxAmounts(records, (row) => row.grossRentalAmount);
    const excluded = sumCompleteTaxAmounts(records, (row) => row.excludedAmount);
    const base = sumCompleteTaxAmounts(records, (row) => row.taxableRentalBase);
    const reviewItems = records.filter((row) => row.calculationStatus === 'REVIEW_REQUIRED' || row.calculationStatus === 'PERIOD_REQUIRED' || (row.reviewReasons || []).length);
    const taxProfile = (company as any)?.taxProfile || {};
    const rate = records.find((row) => row.taxRate != null)?.taxRate ?? null;
    const regime = records.find((row) => row.rentalTaxRegime)?.rentalTaxRegime || taxProfile.rentalTaxRegime || 'ACCOUNTANT_REVIEW';
    const properties = Array.from(new Set(records.map((row) => String(row.propertyId || '')).filter(Boolean)));
    const propertyDocs = properties.length
      ? await Property.find({ _id: { $in: properties }, companyId: asObjectId(companyId) }).select('name address').lean()
      : [];
    const propertyName = (id: string) => propertyDocs.find((row) => String(row._id) === id)?.name || id;
    return {
      disclaimer: DISCLAIMER,
      label: 'Calculated rental tax based on configured rules',
      notZimraConfirmedLiability: true,
      taxpayer: {
        name: (company as any)?.name || '',
        tin: (company as any)?.tin || taxProfile.tin || '',
        rentalTaxRegime: regime
      },
      taxPeriod: periodKey || 'ALL',
      rentalTaxRegime: regime,
      grossRentalReceipts: gross,
      excludedAmounts: excluded,
      rentalTaxBase: base,
      applicableRate: rate,
      calculatedRentalTax: calculatedTax,
      taxPayments,
      calculatedBalance: netFromNullable(calculatedTax, taxPayments),
      properties: properties.map((id) => ({
        propertyId: id,
        propertyName: propertyName(id),
        grossRentalReceipts: sumCompleteTaxAmounts(records.filter((row) => String(row.propertyId) === id), (row) => row.grossRentalAmount),
        rentalTaxBase: sumCompleteTaxAmounts(records.filter((row) => String(row.propertyId) === id), (row) => row.taxableRentalBase),
        calculatedRentalTax: sumCompleteTaxAmounts(records.filter((row) => String(row.propertyId) === id), (row) => row.taxAmount)
      })),
      transactions: records.map((row) => ({
        ...toApi(row),
        propertyName: row.propertyId ? propertyName(String(row.propertyId)) : null
      })),
      payments: payments.map((row) => paymentToApi(row)),
      reviewItems: reviewItems.map((row) => ({
        id: String(row._id),
        sourceId: String(row.sourceId),
        sourceType: row.sourceType,
        reasons: row.reviewReasons || [],
        calculationStatus: row.calculationStatus,
        taxAmount: row.taxAmount
      })),
      incomeTaxAmount: null
    };
  },

  async overview(companyId: string, periodKey?: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    return {
      currentPeriod: paper.taxPeriod,
      rentalTaxRegime: paper.rentalTaxRegime,
      calculatedRentalTax: paper.calculatedRentalTax,
      taxPayments: paper.taxPayments,
      calculatedBalance: paper.calculatedBalance,
      reviewItems: paper.reviewItems.length,
      transactions: paper.transactions.length,
      label: paper.label
    };
  },

  async transactions(companyId: string, filters: { periodKey?: string; status?: string; propertyId?: string } = {}) {
    const query: Record<string, unknown> = { companyId: asObjectId(companyId) };
    if (filters.periodKey) query.taxPeriodKey = filters.periodKey;
    if (filters.status) query.calculationStatus = filters.status;
    if (filters.propertyId) query.propertyId = asObjectId(filters.propertyId);
    const rows = await IndividualRentalTaxRecord.find(query).sort({ calculatedAt: -1 }).limit(500).lean();
    return rows.map((row) => toApi(row));
  },

  async reviewQueue(companyId: string) {
    const rows = await IndividualRentalTaxRecord.find({
      companyId: asObjectId(companyId),
      $or: [
        { calculationStatus: 'REVIEW_REQUIRED' },
        { calculationStatus: 'PERIOD_REQUIRED' },
        { reviewReasons: { $exists: true, $ne: [] } }
      ]
    })
      .sort({ calculatedAt: -1 })
      .limit(200)
      .lean();
    const paymentReview = await IndividualRentalTaxPayment.find({
      companyId: asObjectId(companyId),
      status: 'POSTED',
      $and: [
        { $or: [{ paymentReference: { $in: [null, ''] } }, { paymentReference: { $exists: false } }] },
        { $or: [{ zimraReference: { $in: [null, ''] } }, { zimraReference: { $exists: false } }] }
      ]
    })
      .limit(50)
      .lean();
    return [
      ...rows.map((row) => ({
        id: String(row._id),
        kind: 'RECORD',
        sourceType: row.sourceType,
        sourceId: String(row.sourceId),
        taxPeriodKey: row.taxPeriodKey,
        reasons: row.reviewReasons || [],
        calculationStatus: row.calculationStatus,
        taxAmount: row.taxAmount
      })),
      ...paymentReview.map((row) => ({
        id: String(row._id),
        kind: 'PAYMENT',
        sourceType: 'RentalTaxPayment',
        sourceId: String(row._id),
        taxPeriodKey: row.taxPeriodKey,
        reasons: ['TAX_PAYMENT_MISSING_REFERENCE'],
        calculationStatus: 'REVIEW_REQUIRED',
        taxAmount: row.amount
      }))
    ];
  },

  async reconcile(companyId: string, periodKey?: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    const findings: Array<{ issueType: string; reason: string; sourceId?: string }> = [];
    const records = paper.transactions;
    const recordSum = roundMoney(records.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
    if (paper.calculatedRentalTax != null && recordSum !== paper.calculatedRentalTax) {
      findings.push({ issueType: 'CALCULATION_MISMATCH', reason: 'Working paper calculated tax does not equal rental-tax record sums' });
    }
    const paymentSum = roundMoney(paper.payments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const calculatedTax = paper.calculatedRentalTax;
    const taxPayments = paymentSum;
    if (
      calculatedTax != null &&
      paper.calculatedBalance != null &&
      roundMoney(calculatedTax - taxPayments) !== paper.calculatedBalance
    ) {
      findings.push({ issueType: 'CALCULATION_MISMATCH', reason: 'Calculated tax minus payments does not equal working-paper balance' });
    }
    const originals = records.filter((row) => row.recordKind !== 'REVERSAL');
    const sourceIds = originals.map((row) => row.sourceId);
    for (const id of Array.from(new Set(sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index)))) {
      findings.push({ issueType: 'DUPLICATE_RECORD', reason: 'More than one original rental-tax record for the same source', sourceId: id });
    }
    for (const row of records) {
      if (row.snapshotId) {
        const snapshot = await TransactionTaxSnapshot.findById(row.snapshotId).select('taxPeriodKey taxProfileSnapshot taxRuleReferences sourceType sourceId').lean();
        if (!snapshot) findings.push({ issueType: 'RECORD_WITHOUT_SOURCE', reason: 'Rental tax record snapshot is missing', sourceId: row.sourceId });
        else {
          const rule = (snapshot.taxRuleReferences || []).find((ref) => ref.taxType === 'PRESUMPTIVE_RENTAL_INCOME_TAX');
          if (row.taxRuleVersion != null && rule?.ruleVersion != null && Number(rule.ruleVersion) !== Number(row.taxRuleVersion)) {
            findings.push({ issueType: 'RULE_MISMATCH', reason: 'Rental tax record rule version differs from snapshot', sourceId: row.sourceId });
          }
          if (snapshot.taxProfileSnapshot?.rentalTaxRegime && snapshot.taxProfileSnapshot.rentalTaxRegime !== row.rentalTaxRegime) {
            findings.push({ issueType: 'PROFILE_MISMATCH', reason: 'Rental tax record regime differs from snapshot', sourceId: row.sourceId });
          }
        }
      } else {
        findings.push({ issueType: 'RECORD_WITHOUT_SOURCE', reason: 'Rental tax record has no snapshot', sourceId: row.sourceId });
      }
    }
    const snapshots = await TransactionTaxSnapshot.find({
      companyId: asObjectId(companyId),
      sourceKind: { $in: ['PAYMENT_RENT', 'OTHER_INCOME'] },
      ...(periodKey ? { taxPeriodKey: periodKey } : {})
    })
      .select('sourceId sourceType taxTypesRelevant')
      .lean();
    const recordSource = new Set(originals.map((row) => `${row.sourceType}:${row.sourceId}`));
    for (const snapshot of snapshots) {
      const relevant = (snapshot.taxTypesRelevant || []).includes('PRESUMPTIVE_RENTAL_INCOME_TAX');
      if (!relevant) continue;
      const key = `${snapshot.sourceType}:${String(snapshot.sourceId)}`;
      if (!recordSource.has(key)) {
        findings.push({ issueType: 'SOURCE_WITHOUT_RECORD', reason: 'Rental receipt snapshot has no rental-tax record', sourceId: String(snapshot.sourceId) });
      }
    }
    for (const pay of paper.payments) {
      if (!pay.taxPeriodId && !pay.taxPeriodKey) {
        findings.push({ issueType: 'PAYMENT_WITHOUT_PERIOD', reason: 'Tax payment is missing a rental-tax period', sourceId: pay.id });
      }
    }
    return {
      detectionOnly: true,
      noAutomaticRepair: true,
      workingPaper: {
        calculatedRentalTax: paper.calculatedRentalTax,
        taxPayments: paper.taxPayments,
        calculatedBalance: paper.calculatedBalance
      },
      recordTotals: { calculatedRentalTax: recordSum, taxPayments: paymentSum },
      findings
    };
  },

  async annualSchedule(companyId: string, year?: number) {
    const taxYear = Number(year || new Date().getUTCFullYear());
    const start = `${taxYear}-01`;
    const end = `${taxYear}-12`;
    const records = await IndividualRentalTaxRecord.find({
      companyId: asObjectId(companyId),
      taxPeriodKey: { $gte: start, $lte: end }
    }).lean();
    const payments = await IndividualRentalTaxPayment.find({
      companyId: asObjectId(companyId),
      status: 'POSTED',
      taxPeriodKey: { $gte: start, $lte: end }
    }).lean();
    const byProperty = new Map<string, typeof records>();
    for (const row of records) {
      const key = String(row.propertyId || 'unassigned');
      const list = byProperty.get(key) || [];
      list.push(row);
      byProperty.set(key, list);
    }
    const paymentByProperty = new Map<string, number>();
    for (const row of payments) {
      const key = String(row.propertyId || 'unassigned');
      paymentByProperty.set(key, roundMoney(Number(paymentByProperty.get(key) || 0) + Number(row.amount || 0)));
    }
    const ids = Array.from(byProperty.keys()).filter((id) => id !== 'unassigned' && mongoose.Types.ObjectId.isValid(id));
    const propertyDocs = ids.length ? await Property.find({ _id: { $in: ids } }).select('name').lean() : [];
    return {
      disclaimer: DISCLAIMER,
      year: taxYear,
      foundationOnly: true,
      properties: Array.from(byProperty.entries()).map(([propertyId, rows]) => {
        const calculatedRentalTax = sumCompleteTaxAmounts(rows, (row) => row.taxAmount);
        const taxPayments = paymentByProperty.get(propertyId) || 0;
        return {
          propertyId,
          propertyName: propertyDocs.find((row) => String(row._id) === propertyId)?.name || (propertyId === 'unassigned' ? 'Unassigned' : propertyId),
          grossRentalReceipts: sumCompleteTaxAmounts(rows, (row) => row.grossRentalAmount),
          rentalTaxBase: sumCompleteTaxAmounts(rows, (row) => row.taxableRentalBase),
          calculatedRentalTax,
          taxPayments,
          balance: netFromNullable(calculatedRentalTax, taxPayments)
        };
      })
    };
  },

  async exportWorkingPaper(companyId: string, periodKey: string | undefined, format: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    const rows = paper.transactions.map((row) => ({
      taxpayer: paper.taxpayer.name,
      tin: paper.taxpayer.tin,
      taxRegime: paper.rentalTaxRegime,
      taxPeriod: paper.taxPeriod,
      property: row.propertyName || row.propertyId,
      transaction: row.sourceId,
      sourceType: row.sourceType,
      gross: row.grossRentalAmount,
      excluded: row.excludedAmount,
      taxBase: row.taxableRentalBase,
      rate: row.taxRate,
      calculatedTax: row.taxAmount,
      rule: row.taxRuleCode,
      sourceReference: row.sourceReference,
      status: row.calculationStatus
    }));
    if (format === 'csv') {
      const headers = Object.keys(rows[0] || { taxpayer: '', tin: '', taxRegime: '', taxPeriod: '' });
      const body = [
        headers.join(','),
        ...rows.map((row) => headers.map((header) => JSON.stringify((row as any)[header] ?? '')).join(',')),
        '',
        JSON.stringify(paper.disclaimer)
      ].join('\n');
      return { contentType: 'text/csv', body };
    }
    if (format === 'xlsx' || format === 'excel') {
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: buildXlsxWorkbook('Rental tax working paper', rows.length ? rows : [{ taxpayer: paper.taxpayer.name, taxPeriod: paper.taxPeriod, disclaimer: paper.disclaimer }]),
        filename: `rental-tax-working-paper-${paper.taxPeriod}.xlsx`
      };
    }
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    const line = (text: string, size = 10, useBold = false) => {
      if (y < 40) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawText(String(text || '').slice(0, 110), { x: 40, y, size, font: useBold ? bold : font });
      y -= 14;
    };
    line('PRESUMPTIVE RENTAL INCOME TAX', 16, true);
    line(paper.taxPeriod, 12, true);
    line(paper.disclaimer, 8);
    line(`Taxpayer: ${paper.taxpayer.name}  TIN: ${paper.taxpayer.tin}`);
    line(`Tax regime: ${paper.rentalTaxRegime}`);
    line(`Gross rental receipts ${paper.grossRentalReceipts}`);
    line(`Excluded amounts (${paper.excludedAmounts})`);
    line(`Rental tax base ${paper.rentalTaxBase}`, 11, true);
    line(`Applicable rate ${paper.applicableRate == null ? '—' : `${paper.applicableRate}%`}`);
    line(`Calculated rental tax ${paper.calculatedRentalTax}`, 11, true);
    line(`Tax payments (${paper.taxPayments})`);
    line(`Calculated balance ${paper.calculatedBalance}`, 11, true);
    line('This is calculated rental tax, not a confirmed ZIMRA liability.', 8);
    for (const row of rows) {
      line(`${row.property || ''} ${row.transaction} base=${row.taxBase} tax=${row.calculatedTax}`);
    }
    for (const item of paper.reviewItems) {
      line(`Review: ${item.calculationStatus} ${(item.reasons || []).join(', ')}`, 8);
    }
    return { contentType: 'application/pdf', body: Buffer.from(await pdf.save()) };
  }
};

export default individualRentalTaxService;
