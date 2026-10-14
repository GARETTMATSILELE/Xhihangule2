import mongoose from 'mongoose';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { IndividualIncomeTaxRecord, IIndividualIncomeTaxRecord } from '../models/IndividualIncomeTaxRecord';
import { IndividualIncomeTaxAdjustment, IIndividualIncomeTaxAdjustment } from '../models/IndividualIncomeTaxAdjustment';
import { IndividualIncomeTaxPayment, IIndividualIncomeTaxPayment } from '../models/IndividualIncomeTaxPayment';
import { TransactionTaxSnapshot, ITransactionTaxSnapshot } from '../models/TransactionTaxSnapshot';
import { Payment } from '../models/Payment';
import { LandlordFinancialTransaction } from '../models/LandlordFinancialTransaction';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { TaxPeriod } from '../models/TaxPeriod';
import PropertyAccount from '../models/PropertyAccount';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { assignmentStatusForExistingPeriod, resolveTaxPeriod } from './taxPeriodService';
import { classifyIncomeTaxLine } from './individualIncomeTaxClassification';
import { calculateOrdinaryIncomeTaxWorkingPaper } from './individualIncomeTaxCalculation';
import { buildXlsxWorkbook } from '../utils/xlsxWorkbook';
import { roundMoney } from '../utils/money';
import { sumPropertyAccountPeriodPnl } from './propertyAccountTotals';
import { calendarPeriodBounds } from './tax/taxMetadataTypes';
import { INCOME_TAX_ADJUSTMENT_TYPES } from './tax/incomeTaxTypes';
import { normalizeRentalTaxRegime } from './tax/rentalTaxTypes';
import { getEffectiveTaxRule } from './taxRuleRegistry';

const DISCLAIMER =
  'Income-tax figures shown here are working-paper calculations based on the information and tax classifications recorded in Mantis. They are not a ZIMRA assessment or confirmation of tax payable.';

function asObjectId(value: string) {
  return new mongoose.Types.ObjectId(value);
}

function toApi(row: IIndividualIncomeTaxRecord | Record<string, unknown>) {
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
    incomeTaxRegime: doc.incomeTaxRegime,
    classification: doc.classification,
    accountingIncome: doc.accountingIncome,
    accountingExpenses: doc.accountingExpenses,
    addBacks: doc.addBacks,
    deductions: doc.deductions,
    exemptIncome: doc.exemptIncome,
    capitalAdjustments: doc.capitalAdjustments,
    otherTaxAdjustments: doc.otherTaxAdjustments,
    taxableContribution: doc.taxableContribution,
    taxableIncome: doc.taxableIncome,
    taxRate: doc.taxRate,
    taxAmount: doc.taxAmount,
    calculationMethod: doc.calculationMethod,
    calculationStatus: doc.calculationStatus,
    reviewStatus: doc.reviewStatus,
    reviewReason: doc.reviewReason || null,
    reviewReasons: doc.reviewReasons || [],
    supportingDocumentStatus: doc.supportingDocumentStatus,
    taxRuleId: doc.taxRuleId || null,
    taxRuleVersion: doc.taxRuleVersion ?? null,
    taxRuleCode: doc.taxRuleCode || null,
    sourceReference: doc.sourceReference || null,
    currency: doc.currency,
    transactionCurrency: doc.transactionCurrency,
    taxCurrency: doc.taxCurrency,
    exchangeRate: doc.exchangeRate,
    exchangeRateDate: doc.exchangeRateDate,
    exchangeRateSource: doc.exchangeRateSource || null,
    vatAmount: null,
    presumptiveTaxAmount: null
  };
}

function adjustmentToApi(row: IIndividualIncomeTaxAdjustment | Record<string, unknown>) {
  const doc = row as any;
  return {
    id: String(doc._id),
    taxPeriodKey: doc.taxPeriodKey,
    taxPeriodId: doc.taxPeriodId ? String(doc.taxPeriodId) : null,
    adjustmentType: doc.adjustmentType,
    amount: doc.amount,
    currency: doc.currency,
    reason: doc.reason,
    explanation: doc.explanation || null,
    sourceTransactionIds: doc.sourceTransactionIds || [],
    supportingDocumentIds: doc.supportingDocumentIds || [],
    ruleId: doc.ruleId || null,
    ruleVersion: doc.ruleVersion ?? null,
    status: doc.status,
    reviewStatus: doc.reviewStatus
  };
}

function paymentToApi(row: IIndividualIncomeTaxPayment | Record<string, unknown>) {
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
    sourceModule: 'individual_income_tax',
    sourceId,
    success: !String(eventType).includes('FAILED'),
    message,
    metadata
  });
}

async function assertPeriodAllowsIncomeTax(period: { taxPeriodId?: unknown; taxPeriodKey?: string } | null) {
  if (!period?.taxPeriodId) return;
  const row = await TaxPeriod.findById(period.taxPeriodId).select('status taxType periodKey');
  if (!row) return;
  if (assignmentStatusForExistingPeriod(row.status as any) === 'PERIOD_CLOSED') {
    throw new AppError(`Income tax period ${row.periodKey} is ${row.status}. Corrections require a reversal or amendment.`, 409);
  }
}

async function loadSource(snapshot: ITransactionTaxSnapshot) {
  if (snapshot.sourceType === 'Payment') {
    const payment = await Payment.findById(snapshot.sourceId).lean();
    if (!payment) return null;
    return {
      amount: Number(payment.amount || 0),
      category: snapshot.sourceKind === 'PAYMENT_RENT' ? 'RENTAL_INCOME' : 'TENANT_DEPOSIT',
      currency: String((payment as any).currency || 'USD'),
      vatMode: null as string | null,
      deductibility: snapshot.deductibility,
      capitalOrRevenue: snapshot.capitalOrRevenue,
      attachments: [] as string[],
      exchangeRate: (payment as any).exchangeRate ?? null,
      exchangeRateDate: payment.paymentDate || null
    };
  }
  const entry = await LandlordFinancialTransaction.findById(snapshot.sourceId).lean();
  if (!entry) return null;
  return {
    amount: Number(entry.amount || 0),
    category: entry.category || null,
    currency: String(entry.currency || 'USD'),
    vatMode: entry.vatMode || null,
    deductibility: entry.deductibility || snapshot.deductibility,
    capitalOrRevenue: entry.capitalOrRevenue || snapshot.capitalOrRevenue,
    attachments: Array.isArray(entry.attachments) ? entry.attachments.map((row) => String(row)) : [],
    exchangeRate: null as number | null,
    exchangeRateDate: entry.date || null
  };
}

function reviewStatusOf(calculationStatus: string, reviewReasons: string[]) {
  if (calculationStatus === 'REVIEW_REQUIRED' || calculationStatus === 'PERIOD_REQUIRED' || calculationStatus === 'RULE_REQUIRED' || calculationStatus === 'PROFILE_REQUIRED' || reviewReasons.length) {
    return 'REVIEW_REQUIRED';
  }
  if (calculationStatus === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (calculationStatus === 'CALCULATED') return 'CALCULATED';
  return calculationStatus;
}

async function loadAccountingProfit(companyId: string, periodKey?: string) {
  const accounts = await PropertyAccount.find({ companyId: asObjectId(companyId) }).select('transactions').lean();
  const bounds = periodKey ? calendarPeriodBounds(periodKey) : null;
  let income = 0;
  let expenses = 0;
  for (const account of accounts) {
    const pnl = sumPropertyAccountPeriodPnl(
      (account as any).transactions,
      bounds?.periodStart,
      bounds ? new Date(bounds.periodEnd.getTime() + 1) : undefined
    );
    income += pnl.income;
    expenses += pnl.expenses;
  }
  return {
    accountingIncome: roundMoney(income),
    accountingExpenses: roundMoney(expenses),
    accountingProfit: roundMoney(income - expenses)
  };
}

function snapshotRule(snapshot: ITransactionTaxSnapshot) {
  const ref = (snapshot.taxRuleReferences || []).find((row) => row.taxType === 'INCOME_TAX');
  if (!ref) return null;
  return {
    id: ref.ruleId || '',
    version: ref.ruleVersion || 1,
    ruleCode: ref.ruleCode || '',
    rate: ref.configuredRate,
    calculationMethod: 'TAXABLE_INCOME_PERCENT' as const,
    sourceReference: ref.sourceReference || '',
    effectiveFrom: ref.effectiveFrom || null,
    effectiveTo: null as string | null
  };
}

export type ReverseIncomeTaxInput = {
  companyId: string;
  sourceType: 'Payment' | 'LandlordFinancialTransaction';
  sourceId: string;
  reason?: string;
  reversalTransactionId?: string;
  userId?: string;
};

export const individualIncomeTaxService = {
  toApi,

  async postForSnapshot(snapshot: ITransactionTaxSnapshot, classifiedBy?: string | null): Promise<IIndividualIncomeTaxRecord | null> {
    const existing = await IndividualIncomeTaxRecord.findOne({
      companyId: snapshot.companyId,
      sourceType: snapshot.sourceType,
      sourceId: snapshot.sourceId,
      taxType: 'INCOME_TAX',
      recordKind: 'ORIGINAL'
    });
    if (existing) return existing;

    const period = await resolveTaxPeriod({
      companyId: String(snapshot.companyId),
      taxType: 'INCOME_TAX',
      transactionDate: snapshot.transactionDate
    });
    try {
      await assertPeriodAllowsIncomeTax({ taxPeriodId: period.taxPeriodId, taxPeriodKey: period.periodKey });
    } catch (error: any) {
      if (Number(error?.statusCode) === 409) {
        await writeAudit(String(snapshot.companyId), 'INCOME_TAX_REVIEW_REQUIRED', String(snapshot.sourceId), 'Income tax period is closed', {
          taxPeriodKey: period.periodKey,
          reason: 'TAX_PERIOD_CLOSED'
        });
        throw error;
      }
      throw error;
    }

    const source = await loadSource(snapshot);
    const profile = snapshot.taxProfileSnapshot;
    const incomeRef = snapshotRule(snapshot);
    const classified = classifyIncomeTaxLine({
      sourceKind: snapshot.sourceKind,
      amount: source?.amount || 0,
      rentalTaxRegime: snapshot.rentalTaxRegime || profile?.rentalTaxRegime,
      rentalTaxTreatment: snapshot.rentalTaxTreatment || profile?.rentalTaxTreatment,
      deductibility: source?.deductibility || snapshot.deductibility,
      capitalOrRevenue: source?.capitalOrRevenue || snapshot.capitalOrRevenue,
      category: source?.category,
      vatMode: source?.vatMode,
      profileSnapshotPresent: Boolean(profile),
      attachments: source?.attachments
    });
    const reviewReasons = [...classified.reviewReasons];
    if (period.assignmentStatus === 'PERIOD_REQUIRED') reviewReasons.push('TAX_PERIOD_MISSING');
    if (classified.classification !== 'NOT_INCOME_TAX_RELEVANT' && classified.classification !== 'EXEMPT_INCOME' && !incomeRef?.id && classified.calculationStatus !== 'NOT_APPLICABLE') {
      if (!reviewReasons.includes('TAX_RULE_UNAVAILABLE') && (snapshot.taxTypesRelevant || []).includes('INCOME_TAX')) {
        reviewReasons.push('TAX_RULE_UNAVAILABLE');
      }
    }
    const calculationStatus =
      period.assignmentStatus === 'PERIOD_REQUIRED'
        ? 'PERIOD_REQUIRED'
        : classified.calculationStatus === 'PROFILE_REQUIRED'
          ? 'PROFILE_REQUIRED'
          : reviewReasons.includes('TAX_RULE_UNAVAILABLE') && classified.calculationStatus === 'CALCULATED'
            ? 'RULE_REQUIRED'
            : classified.calculationStatus;

    try {
      const created = await IndividualIncomeTaxRecord.create({
        companyId: snapshot.companyId,
        taxpayerId: snapshot.companyId,
        ownerId: classifiedBy && mongoose.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null,
        propertyId: snapshot.propertyId || null,
        sourceType: snapshot.sourceType,
        sourceId: snapshot.sourceId,
        snapshotId: snapshot._id,
        taxpayerProfileSnapshotId: profile ? `v${profile.ownerProfileVersion}` : null,
        taxPeriodId: period.taxPeriodId,
        taxPeriodKey: period.periodKey,
        taxType: 'INCOME_TAX',
        recordKind: 'ORIGINAL',
        incomeTaxRegime: normalizeRentalTaxRegime(snapshot.rentalTaxRegime || profile?.rentalTaxRegime),
        classification: classified.classification,
        accountingIncome: classified.accountingIncome,
        accountingExpenses: classified.accountingExpense,
        taxableIncomeBeforeAdjustments: null,
        addBacks: classified.addBack,
        deductions: classified.deduction,
        exemptIncome: classified.exemptIncome,
        capitalAdjustments: classified.classification === 'CAPITAL' ? classified.accountingExpense : null,
        otherTaxAdjustments: null,
        taxableIncome: null,
        taxableContribution: classified.taxableContribution,
        taxRate: incomeRef?.rate ?? null,
        taxAmount: null,
        taxCurrency: source?.currency || 'USD',
        currency: source?.currency || 'USD',
        transactionCurrency: source?.currency || 'USD',
        baseCurrency: source?.currency || 'USD',
        exchangeRate: source?.exchangeRate ?? null,
        exchangeRateDate: source?.exchangeRateDate || snapshot.transactionDate,
        exchangeRateSource: source?.exchangeRate == null ? null : 'TRANSACTION',
        taxRuleId: incomeRef?.id || null,
        taxRuleVersion: incomeRef?.version ?? null,
        taxRuleCode: incomeRef?.ruleCode || null,
        taxRuleEffectiveFrom: incomeRef?.effectiveFrom || null,
        taxRuleEffectiveTo: incomeRef?.effectiveTo || null,
        sourceReference: incomeRef?.sourceReference || null,
        calculationMethod: 'TAXABLE_INCOME_PERCENT',
        calculationStatus,
        reviewStatus: reviewStatusOf(calculationStatus, reviewReasons),
        reviewReason: reviewReasons[0] || classified.reason,
        reviewReasons: Array.from(new Set(reviewReasons)),
        supportingDocumentStatus: classified.documentStatus,
        vatAmount: null,
        presumptiveTaxAmount: null,
        calculatedAt: new Date(),
        calculatedBy: classifiedBy && mongoose.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null
      });
      await writeAudit(String(snapshot.companyId), 'INCOME_TAX_CALCULATED', String(snapshot.sourceId), `Income tax line ${calculationStatus}`, {
        classification: classified.classification,
        taxAmount: null,
        taxRuleVersion: incomeRef?.version ?? null
      });
      return created;
    } catch (error: any) {
      if (error?.code === 11000) {
        return IndividualIncomeTaxRecord.findOne({
          companyId: snapshot.companyId,
          sourceType: snapshot.sourceType,
          sourceId: snapshot.sourceId,
          taxType: 'INCOME_TAX',
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
      logger.warn('Individual income tax classification failed after accounting success', {
        sourceId: String(snapshot.sourceId),
        message: error?.message || error
      });
      await writeAudit(
        String(snapshot.companyId),
        'INCOME_TAX_REVIEW_REQUIRED',
        String(snapshot.sourceId),
        error?.message || 'Income tax classification failed',
        { accountingStatus: 'ACCOUNTING_SUCCESS', reason: 'CALCULATION_FAILED' }
      ).catch(() => undefined);
    }
  },

  async reverseForSource(input: ReverseIncomeTaxInput): Promise<IIndividualIncomeTaxRecord | null> {
    const original = await IndividualIncomeTaxRecord.findOne({
      companyId: asObjectId(input.companyId),
      sourceType: input.sourceType,
      sourceId: asObjectId(input.sourceId),
      recordKind: 'ORIGINAL'
    });
    if (!original) return null;
    const existing = await IndividualIncomeTaxRecord.findOne({
      companyId: original.companyId,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      taxType: 'INCOME_TAX',
      recordKind: 'REVERSAL'
    });
    if (existing) return existing;
    try {
      await assertPeriodAllowsIncomeTax({ taxPeriodId: original.taxPeriodId, taxPeriodKey: original.taxPeriodKey });
    } catch (error: any) {
      if (Number(error?.statusCode) === 409) throw error;
    }
    const created = await IndividualIncomeTaxRecord.create({
      companyId: original.companyId,
      taxpayerId: original.taxpayerId,
      ownerId: original.ownerId,
      propertyId: original.propertyId,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      snapshotId: original.snapshotId,
      taxpayerProfileSnapshotId: original.taxpayerProfileSnapshotId,
      taxPeriodId: original.taxPeriodId,
      taxPeriodKey: original.taxPeriodKey,
      taxType: 'INCOME_TAX',
      recordKind: 'REVERSAL',
      reversalOf: original._id,
      reversalReason: input.reason || 'Accounting reversal',
      reversalDate: new Date(),
      incomeTaxRegime: original.incomeTaxRegime,
      classification: original.classification,
      accountingIncome: original.accountingIncome == null ? null : roundMoney(-Number(original.accountingIncome)),
      accountingExpenses: original.accountingExpenses == null ? null : roundMoney(-Number(original.accountingExpenses)),
      taxableIncomeBeforeAdjustments: null,
      addBacks: original.addBacks == null ? null : roundMoney(-Number(original.addBacks)),
      deductions: original.deductions == null ? null : roundMoney(-Number(original.deductions)),
      exemptIncome: original.exemptIncome == null ? null : roundMoney(-Number(original.exemptIncome)),
      capitalAdjustments: original.capitalAdjustments == null ? null : roundMoney(-Number(original.capitalAdjustments)),
      otherTaxAdjustments: original.otherTaxAdjustments == null ? null : roundMoney(-Number(original.otherTaxAdjustments)),
      taxableIncome: null,
      taxableContribution: original.taxableContribution == null ? null : roundMoney(-Number(original.taxableContribution)),
      taxRate: original.taxRate,
      taxAmount: null,
      taxCurrency: original.taxCurrency,
      currency: original.currency,
      transactionCurrency: original.transactionCurrency,
      baseCurrency: original.baseCurrency,
      exchangeRate: original.exchangeRate,
      exchangeRateDate: original.exchangeRateDate,
      exchangeRateSource: original.exchangeRateSource,
      taxRuleId: original.taxRuleId,
      taxRuleVersion: original.taxRuleVersion,
      taxRuleCode: original.taxRuleCode,
      taxRuleEffectiveFrom: original.taxRuleEffectiveFrom,
      taxRuleEffectiveTo: original.taxRuleEffectiveTo,
      sourceReference: original.sourceReference,
      calculationMethod: original.calculationMethod,
      calculationStatus: 'REVERSED',
      reviewStatus: original.reviewStatus,
      reviewReason: original.reviewReason,
      reviewReasons: original.reviewReasons,
      supportingDocumentStatus: original.supportingDocumentStatus,
      vatAmount: null,
      presumptiveTaxAmount: null,
      calculatedAt: new Date(),
      calculatedBy: input.userId && mongoose.Types.ObjectId.isValid(input.userId) ? asObjectId(input.userId) : null
    });
    await writeAudit(input.companyId, 'INCOME_TAX_REVERSED', input.sourceId, 'Income tax reversal posted; original preserved', {
      originalId: String(original._id),
      reversalId: String(created._id)
    });
    return created;
  },

  async safeReverseForSource(input: ReverseIncomeTaxInput): Promise<void> {
    try {
      await this.reverseForSource(input);
    } catch (error: any) {
      logger.warn('Individual income tax reversal failed', { sourceId: input.sourceId, message: error?.message || error });
    }
  },

  async createAdjustment(input: {
    companyId: string;
    userId: string;
    taxPeriodKey?: string;
    taxPeriodId?: string;
    propertyId?: string;
    adjustmentType: string;
    amount: number;
    currency?: string;
    reason?: string;
    explanation?: string;
    sourceTransactionIds?: string[];
    supportingDocumentIds?: string[];
    ruleId?: string;
    ruleVersion?: number;
  }) {
    const reason = String(input.reason || '').trim();
    if (!reason) throw new AppError('Manual income-tax adjustments require a reason', 400);
    if (!(Number(input.amount) || 0)) throw new AppError('Adjustment amount is required', 400);
    if (!INCOME_TAX_ADJUSTMENT_TYPES.includes(input.adjustmentType as any)) {
      throw new AppError('Unsupported tax adjustment type', 400);
    }
    let periodKey = String(input.taxPeriodKey || '').trim();
    let periodId: string | null = input.taxPeriodId || null;
    if (periodId) {
      const period = await TaxPeriod.findOne({
        _id: asObjectId(periodId),
        companyId: asObjectId(input.companyId),
        taxType: 'INCOME_TAX'
      });
      if (!period) throw new AppError('Income tax period not found', 404);
      if (assignmentStatusForExistingPeriod(period.status as any) === 'PERIOD_CLOSED') {
        throw new AppError(`Income tax period ${period.periodKey} is ${period.status}`, 409);
      }
      periodKey = period.periodKey;
      periodId = String(period._id);
    }
    if (!periodKey) throw new AppError('taxPeriodId or taxPeriodKey is required', 400);
    if (!periodId) {
      const period = await TaxPeriod.findOne({
        companyId: asObjectId(input.companyId),
        taxType: 'INCOME_TAX',
        periodKey
      });
      if (period && assignmentStatusForExistingPeriod(period.status as any) === 'PERIOD_CLOSED') {
        throw new AppError(`Income tax period ${period.periodKey} is ${period.status}`, 409);
      }
      periodId = period ? String(period._id) : null;
    }
    if (input.propertyId) {
      const property = await Property.findOne({
        _id: asObjectId(input.propertyId),
        companyId: asObjectId(input.companyId),
        isDeleted: { $ne: true }
      }).select('_id');
      if (!property) throw new AppError('Property not found', 404);
    }
    const created = await IndividualIncomeTaxAdjustment.create({
      companyId: asObjectId(input.companyId),
      ownerId: asObjectId(input.userId),
      propertyId: input.propertyId ? asObjectId(input.propertyId) : null,
      taxPeriodId: periodId,
      taxPeriodKey: periodKey,
      taxType: 'INCOME_TAX',
      adjustmentType: input.adjustmentType,
      amount: roundMoney(Number(input.amount)),
      currency: input.currency || 'USD',
      reason,
      explanation: input.explanation || null,
      sourceTransactionIds: input.sourceTransactionIds || [],
      supportingDocumentIds: input.supportingDocumentIds || [],
      ruleId: input.ruleId || null,
      ruleVersion: input.ruleVersion ?? null,
      status: 'PENDING',
      reviewStatus: 'REVIEW_REQUIRED',
      createdBy: asObjectId(input.userId)
    });
    await writeAudit(input.companyId, 'INCOME_TAX_ADJUSTMENT_CREATED', String(created._id), 'Manual income-tax adjustment created', {
      amount: created.amount,
      adjustmentType: created.adjustmentType,
      reason,
      taxableIncomeOverwritten: false
    });
    return adjustmentToApi(created);
  },

  async approveAdjustment(companyId: string, adjustmentId: string, userId: string) {
    const row = await IndividualIncomeTaxAdjustment.findOne({
      _id: asObjectId(adjustmentId),
      companyId: asObjectId(companyId)
    });
    if (!row) throw new AppError('Adjustment not found', 404);
    if (row.status === 'APPROVED') return adjustmentToApi(row);
    if (!String(row.reason || '').trim()) throw new AppError('Manual income-tax adjustments require a reason', 400);
    row.status = 'APPROVED';
    row.reviewStatus = 'APPROVED';
    row.approvedBy = asObjectId(userId);
    row.approvedAt = new Date();
    await row.save();
    await writeAudit(companyId, 'INCOME_TAX_ADJUSTMENT_APPROVED', String(row._id), 'Manual income-tax adjustment approved', {
      amount: row.amount,
      adjustmentType: row.adjustmentType
    });
    return adjustmentToApi(row);
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
        taxType: 'INCOME_TAX'
      });
      if (!period) throw new AppError('Income tax period not found', 404);
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
    const created = await IndividualIncomeTaxPayment.create({
      companyId: asObjectId(input.companyId),
      ownerId: asObjectId(input.userId),
      propertyId: input.propertyId ? asObjectId(input.propertyId) : null,
      taxPeriodId: periodId,
      taxPeriodKey: periodKey,
      taxType: 'INCOME_TAX',
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
    await writeAudit(input.companyId, 'INCOME_TAX_PAYMENT_RECORDED', String(created._id), 'Landlord-recorded income tax payment', {
      amount: created.amount,
      taxPeriodKey: periodKey,
      zimraConfirmed: false
    });
    return { ...paymentToApi(created), zimraConfirmed: false };
  },

  async workingPaper(companyId: string, periodKey?: string) {
    const company = await Company.findById(companyId).select('name tin taxProfile').lean();
    const query: Record<string, unknown> = { companyId: asObjectId(companyId) };
    if (periodKey) query.taxPeriodKey = periodKey;
    const records = await IndividualIncomeTaxRecord.find(query).sort({ calculatedAt: 1 }).lean();
    const adjustments = await IndividualIncomeTaxAdjustment.find({
      companyId: asObjectId(companyId),
      ...(periodKey ? { taxPeriodKey: periodKey } : {})
    })
      .sort({ createdAt: 1 })
      .lean();
    const payments = await IndividualIncomeTaxPayment.find({
      companyId: asObjectId(companyId),
      status: 'POSTED',
      ...(periodKey ? { taxPeriodKey: periodKey } : {})
    })
      .sort({ paymentDate: 1 })
      .lean();
    const accounting = await loadAccountingProfit(companyId, periodKey);
    const currencies = Array.from(new Set(records.map((row) => String(row.transactionCurrency || row.currency || 'USD'))));
    const reviewReasons = records.flatMap((row) => row.reviewReasons || []);
    const periodStatus = periodKey
      ? await resolveTaxPeriod({
          companyId,
          taxType: 'INCOME_TAX',
          transactionDate: calendarPeriodBounds(periodKey).periodStart
        })
      : null;
    if (periodStatus?.assignmentStatus === 'PERIOD_REQUIRED') reviewReasons.push('TAX_PERIOD_MISSING');
    const ruleRow = records.find((row) => row.taxRuleId && row.taxRate != null);
    const fallbackRule =
      ruleRow || !periodKey
        ? null
        : await getEffectiveTaxRule('INCOME_TAX', calendarPeriodBounds(periodKey).periodStart);
    const incomeTaxRule = ruleRow
      ? {
          id: String(ruleRow.taxRuleId),
          version: Number(ruleRow.taxRuleVersion || 1),
          ruleCode: String(ruleRow.taxRuleCode || ''),
          rate: ruleRow.taxRate,
          calculationMethod: 'TAXABLE_INCOME_PERCENT' as const,
          sourceReference: ruleRow.sourceReference || ''
        }
      : fallbackRule
        ? {
            id: fallbackRule.id,
            version: fallbackRule.version,
            ruleCode: fallbackRule.ruleCode,
            rate: fallbackRule.rate,
            calculationMethod: fallbackRule.calculationMethod || 'TAXABLE_INCOME_PERCENT',
            sourceReference: fallbackRule.sourceReference
          }
        : null;
    const paper = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: currencies.length ? currencies : ['USD'],
      accountingIncome: accounting.accountingIncome,
      accountingExpenses: accounting.accountingExpenses,
      lineAddBacks: records.reduce((sum, row) => sum + Number(row.addBacks || 0), 0),
      lineDeductions: records.reduce((sum, row) => sum + Number(row.deductions || 0), 0),
      lineExemptIncome: records.reduce((sum, row) => sum + Number(row.exemptIncome || 0), 0),
      adjustments: adjustments.map((row) => ({
        adjustmentType: row.adjustmentType,
        amount: row.amount,
        currency: row.currency,
        reason: row.reason,
        status: row.status
      })),
      incomeTaxRule,
      periodAssignmentStatus: periodStatus?.assignmentStatus,
      profilePresent: true,
      reviewReasons: Array.from(new Set([...reviewReasons, 'AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW']))
    });
    const taxPayments = roundMoney(payments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const unreconciled = paper.taxAmount == null ? null : roundMoney(Number(paper.taxAmount) - taxPayments);
    const properties = Array.from(new Set(records.map((row) => String(row.propertyId || '')).filter(Boolean)));
    const propertyDocs = properties.length
      ? await Property.find({ _id: { $in: properties }, companyId: asObjectId(companyId) }).select('name address').lean()
      : [];
    const propertyName = (id: string) => propertyDocs.find((row) => String(row._id) === id)?.name || id;
    const reviewItems = [
      ...records.filter((row) => row.reviewStatus === 'REVIEW_REQUIRED' || (row.reviewReasons || []).length),
      ...adjustments.filter((row) => row.status !== 'APPROVED')
    ];
    const taxProfile = (company as any)?.taxProfile || {};
    return {
      disclaimer: DISCLAIMER,
      label: 'Calculated income tax based on the working paper and configured ordinary trade/investment rule',
      notZimraConfirmedLiability: true,
      taxpayer: {
        name: (company as any)?.name || '',
        tin: (company as any)?.tin || taxProfile.tin || '',
        rentalTaxRegime: taxProfile.rentalTaxRegime || 'ACCOUNTANT_REVIEW'
      },
      taxPeriod: periodKey || 'ALL',
      incomeTaxRegime: taxProfile.rentalTaxRegime || 'ACCOUNTANT_REVIEW',
      currencies: paper.currencies,
      accountingIncome: paper.accountingIncome,
      accountingExpenses: paper.accountingExpenses,
      accountingProfit: paper.accountingProfit,
      addBacks: paper.addBacks,
      deductions: paper.deductions,
      exemptIncome: paper.exemptIncome,
      capitalAdjustments: paper.capitalAdjustments,
      otherTaxAdjustments: paper.otherTaxAdjustments,
      taxableIncomeBeforeAdjustments: paper.taxableIncomeBeforeAdjustments,
      taxableIncome: paper.taxableIncome,
      applicableRate: paper.taxRate,
      calculatedIncomeTax: paper.taxAmount,
      taxPayments,
      unreconciledAmount: unreconciled,
      calculationStatus: paper.calculationStatus,
      taxRuleId: paper.taxRuleId,
      taxRuleVersion: paper.taxRuleVersion,
      taxRuleCode: paper.taxRuleCode,
      sourceReference: paper.sourceReference,
      calculationMethod: paper.calculationMethod,
      reviewReasons: paper.reviewReasons,
      properties: properties.map((id) => ({
        propertyId: id,
        propertyName: propertyName(id),
        accountingIncome: roundMoney(records.filter((row) => String(row.propertyId) === id).reduce((sum, row) => sum + Number(row.accountingIncome || 0), 0)),
        accountingExpenses: roundMoney(records.filter((row) => String(row.propertyId) === id).reduce((sum, row) => sum + Number(row.accountingExpenses || 0), 0))
      })),
      transactions: records.map((row) => ({
        ...toApi(row),
        propertyName: row.propertyId ? propertyName(String(row.propertyId)) : null
      })),
      adjustments: adjustments.map((row) => adjustmentToApi(row)),
      payments: payments.map((row) => paymentToApi(row)),
      reviewItems: [
        ...reviewItems.map((row: any) => ({
          id: String(row._id),
          sourceId: String(row.sourceId || row._id),
          sourceType: row.sourceType || 'Adjustment',
          reasons: row.reviewReasons || (row.status === 'PENDING' ? ['MANUAL_ADJUSTMENT_AWAITING_REVIEW'] : []),
          calculationStatus: row.calculationStatus || row.status,
          taxAmount: row.taxAmount ?? null
        })),
        {
          id: 'aids-levy',
          sourceId: periodKey || 'period',
          sourceType: 'WorkingPaper',
          reasons: ['AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW'],
          calculationStatus: 'REVIEW_REQUIRED',
          taxAmount: null
        }
      ],
      vatAmount: null,
      presumptiveTaxAmount: null
    };
  },

  async overview(companyId: string, periodKey?: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    return {
      currentPeriod: paper.taxPeriod,
      incomeTaxRegime: paper.incomeTaxRegime,
      accountingProfit: paper.accountingProfit,
      taxAdjustments: roundMoney(Number(paper.addBacks || 0) - Number(paper.deductions || 0) - Number(paper.exemptIncome || 0) + Number(paper.otherTaxAdjustments || 0)),
      taxableIncome: paper.taxableIncome,
      calculatedIncomeTax: paper.calculatedIncomeTax,
      taxPayments: paper.taxPayments,
      unreconciledAmount: paper.unreconciledAmount,
      reviewItems: paper.reviewItems.length,
      transactions: paper.transactions.length,
      calculationStatus: paper.calculationStatus,
      label: paper.label,
      disclaimer: paper.disclaimer
    };
  },

  async transactions(companyId: string, filters: { periodKey?: string; status?: string; propertyId?: string } = {}) {
    const query: Record<string, unknown> = { companyId: asObjectId(companyId) };
    if (filters.periodKey) query.taxPeriodKey = filters.periodKey;
    if (filters.status) query.calculationStatus = filters.status;
    if (filters.propertyId) {
      const property = await Property.findOne({
        _id: asObjectId(filters.propertyId),
        companyId: asObjectId(companyId),
        isDeleted: { $ne: true }
      }).select('_id');
      if (!property) throw new AppError('Property not found', 404);
      query.propertyId = property._id;
    }
    const rows = await IndividualIncomeTaxRecord.find(query).sort({ calculatedAt: -1 }).limit(500).lean();
    return rows.map((row) => toApi(row));
  },

  async reviewQueue(companyId: string) {
    const rows = await IndividualIncomeTaxRecord.find({
      companyId: asObjectId(companyId),
      $or: [
        { calculationStatus: { $in: ['REVIEW_REQUIRED', 'PERIOD_REQUIRED', 'RULE_REQUIRED', 'PROFILE_REQUIRED'] } },
        { reviewReasons: { $exists: true, $ne: [] } }
      ]
    })
      .sort({ calculatedAt: -1 })
      .limit(200)
      .lean();
    const pendingAdj = await IndividualIncomeTaxAdjustment.find({
      companyId: asObjectId(companyId),
      status: 'PENDING'
    })
      .limit(50)
      .lean();
    const unclassified = await TransactionTaxSnapshot.find({
      companyId: asObjectId(companyId),
      sourceKind: { $in: ['PAYMENT_RENT', 'OTHER_INCOME', 'EXPENSE', 'MAINTENANCE', 'CAPITAL'] }
    })
      .select('sourceId sourceType sourceKind taxPeriodKey taxCalculationStatus')
      .limit(200)
      .lean();
    const existing = await IndividualIncomeTaxRecord.find({
      companyId: asObjectId(companyId),
      recordKind: 'ORIGINAL'
    })
      .select('sourceType sourceId')
      .lean();
    const classifiedIds = new Set(existing.map((row) => `${row.sourceType}:${row.sourceId}`));
    const missing = unclassified.filter((row) => !classifiedIds.has(`${row.sourceType}:${String(row.sourceId)}`)).slice(0, 50);
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
      ...pendingAdj.map((row) => ({
        id: String(row._id),
        kind: 'ADJUSTMENT',
        sourceType: 'ManualAdjustment',
        sourceId: String(row._id),
        taxPeriodKey: row.taxPeriodKey,
        reasons: ['MANUAL_ADJUSTMENT_AWAITING_REVIEW'],
        calculationStatus: 'REVIEW_REQUIRED',
        taxAmount: null
      })),
      ...missing.map((row) => ({
        id: String(row._id),
        kind: 'SNAPSHOT',
        sourceType: row.sourceType,
        sourceId: String(row.sourceId),
        taxPeriodKey: row.taxPeriodKey,
        reasons: ['NOT_YET_TAX_CLASSIFIED'],
        calculationStatus: 'NOT_CALCULATED',
        taxAmount: null
      }))
    ];
  },

  async reconcile(companyId: string, periodKey?: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    const findings: Array<{ issueType: string; reason: string; sourceId?: string }> = [];
    const recomputed = calculateOrdinaryIncomeTaxWorkingPaper({
      currencies: paper.currencies,
      accountingIncome: Number(paper.accountingIncome || 0),
      accountingExpenses: Number(paper.accountingExpenses || 0),
      lineAddBacks: paper.transactions.reduce((sum, row) => sum + Number(row.addBacks || 0), 0),
      lineDeductions: paper.transactions.reduce((sum, row) => sum + Number(row.deductions || 0), 0),
      lineExemptIncome: paper.transactions.reduce((sum, row) => sum + Number(row.exemptIncome || 0), 0),
      adjustments: paper.adjustments.map((row) => ({
        adjustmentType: row.adjustmentType,
        amount: row.amount,
        currency: row.currency,
        reason: row.reason,
        status: row.status
      })),
      incomeTaxRule: paper.taxRuleId
        ? {
            id: paper.taxRuleId,
            version: Number(paper.taxRuleVersion || 1),
            ruleCode: paper.taxRuleCode || '',
            rate: paper.applicableRate,
            calculationMethod: 'TAXABLE_INCOME_PERCENT',
            sourceReference: paper.sourceReference || ''
          }
        : null,
      reviewReasons: paper.reviewReasons.filter((row) => row !== 'AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW')
    });
    if (recomputed.taxableIncome !== paper.taxableIncome || recomputed.taxAmount !== paper.calculatedIncomeTax) {
      findings.push({ issueType: 'CALCULATION_MISMATCH', reason: 'Recomputed working paper does not match stored overview' });
    }
    const originals = paper.transactions.filter((row) => row.recordKind !== 'REVERSAL');
    const sourceIds = originals.map((row) => row.sourceId);
    for (const id of Array.from(new Set(sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index)))) {
      findings.push({ issueType: 'DUPLICATE_RECORD', reason: 'More than one original income-tax record for the same source', sourceId: id });
    }
    return {
      detectionOnly: true,
      noAutomaticRepair: true,
      lines: [
        { key: 'accountingProfit', label: 'Accounting profit', amount: paper.accountingProfit },
        { key: 'addBacks', label: 'Tax add-backs', amount: paper.addBacks },
        { key: 'deductions', label: 'Allowable adjustments', amount: paper.deductions },
        { key: 'exemptIncome', label: 'Exempt / non-taxable amounts', amount: paper.exemptIncome },
        { key: 'otherTaxAdjustments', label: 'Other tax adjustments', amount: paper.otherTaxAdjustments },
        { key: 'taxableIncome', label: 'Taxable income', amount: paper.taxableIncome },
        { key: 'taxRule', label: paper.taxRuleCode || 'Tax rule', amount: paper.applicableRate },
        { key: 'calculatedIncomeTax', label: 'Calculated income tax', amount: paper.calculatedIncomeTax },
        { key: 'taxPayments', label: 'Recognised tax payments', amount: paper.taxPayments },
        { key: 'unreconciledAmount', label: 'Unreconciled calculated amount', amount: paper.unreconciledAmount }
      ],
      workingPaper: {
        accountingProfit: paper.accountingProfit,
        taxableIncome: paper.taxableIncome,
        calculatedIncomeTax: paper.calculatedIncomeTax,
        taxPayments: paper.taxPayments,
        unreconciledAmount: paper.unreconciledAmount
      },
      findings
    };
  },

  async annualSchedule(companyId: string, year?: number) {
    const taxYear = Number(year || new Date().getUTCFullYear());
    const start = `${taxYear}-01`;
    const end = `${taxYear}-12`;
    const months = Array.from({ length: 12 }, (_, index) => `${taxYear}-${String(index + 1).padStart(2, '0')}`);
    const papers = [];
    for (const month of months) {
      papers.push(await this.workingPaper(companyId, month));
    }
    const accountingProfit = papers.some((row) => row.accountingProfit == null)
      ? null
      : roundMoney(papers.reduce((sum, row) => sum + Number(row.accountingProfit || 0), 0));
    const taxableIncome = papers.some((row) => row.taxableIncome == null)
      ? null
      : roundMoney(papers.reduce((sum, row) => sum + Number(row.taxableIncome || 0), 0));
    const calculated = papers.some((row) => row.calculatedIncomeTax == null)
      ? null
      : roundMoney(papers.reduce((sum, row) => sum + Number(row.calculatedIncomeTax || 0), 0));
    const payments = roundMoney(papers.reduce((sum, row) => sum + Number(row.taxPayments || 0), 0));
    const incompleteMonths = papers
      .filter((row) => row.accountingProfit == null || row.taxableIncome == null || row.calculatedIncomeTax == null)
      .map((row) => row.taxPeriod);
    return {
      disclaimer: DISCLAIMER,
      year: taxYear,
      foundationOnly: true,
      filingCapability: false,
      periodRange: { start, end },
      accountingProfit,
      taxableIncome,
      taxAdjustments: papers.some((row) => row.addBacks == null && row.exemptIncome == null)
        ? roundMoney(papers.reduce((sum, row) => sum + Number(row.addBacks || 0) - Number(row.exemptIncome || 0), 0))
        : roundMoney(papers.reduce((sum, row) => sum + Number(row.addBacks || 0) - Number(row.exemptIncome || 0), 0)),
      calculatedIncomeTax: calculated,
      taxPayments: payments,
      unreconciledAmount: calculated == null ? null : roundMoney(calculated - payments),
      reviewItems: papers.reduce((sum, row) => sum + row.reviewItems.length, 0),
      incompleteMonths,
      supportingDocumentCompleteness: papers.flatMap((row) => row.transactions).filter((row) => row.supportingDocumentStatus === 'MISSING').length
        ? 'MISSING'
        : 'DOCUMENTED'
    };
  },

  async calculatePeriod(companyId: string, periodKey: string, userId?: string) {
    const period = await resolveTaxPeriod({
      companyId,
      taxType: 'INCOME_TAX',
      transactionDate: calendarPeriodBounds(periodKey).periodStart
    });
    if (period.assignmentStatus === 'PERIOD_CLOSED') {
      const paper = await this.workingPaper(companyId, periodKey);
      return { ...paper, calculationStatus: paper.calculationStatus === 'CALCULATED' ? 'FINALIZED' : paper.calculationStatus, periodClosed: true };
    }
    const paper = await this.workingPaper(companyId, periodKey);
    await writeAudit(companyId, 'INCOME_TAX_RECALCULATED', periodKey, 'Income-tax working paper calculated from existing line records', {
      taxPeriodKey: periodKey,
      calculatedIncomeTax: paper.calculatedIncomeTax,
      taxableIncome: paper.taxableIncome,
      userId: userId || null,
      duplicated: false
    });
    return paper;
  },

  async exportWorkingPaper(companyId: string, periodKey: string | undefined, format: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    const rows = paper.transactions.map((row) => ({
      taxpayer: paper.taxpayer.name,
      tin: paper.taxpayer.tin,
      taxPeriod: paper.taxPeriod,
      property: row.propertyName || row.propertyId,
      transaction: row.sourceId,
      sourceType: row.sourceType,
      classification: row.classification,
      accountingIncome: row.accountingIncome,
      accountingExpenses: row.accountingExpenses,
      addBacks: row.addBacks,
      deductions: row.deductions,
      exemptIncome: row.exemptIncome,
      status: row.calculationStatus,
      rule: row.taxRuleCode,
      sourceReference: row.sourceReference
    }));
    if (format === 'csv') {
      const headers = Object.keys(rows[0] || { taxpayer: '', tin: '', taxPeriod: '' });
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
        body: buildXlsxWorkbook(
          'Income tax working paper',
          rows.length
            ? rows
            : [
                {
                  taxpayer: paper.taxpayer.name,
                  taxPeriod: paper.taxPeriod,
                  accountingProfit: paper.accountingProfit,
                  taxableIncome: paper.taxableIncome,
                  calculatedIncomeTax: paper.calculatedIncomeTax,
                  disclaimer: paper.disclaimer
                }
              ]
        ),
        filename: `income-tax-working-paper-${paper.taxPeriod}.xlsx`
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
    line('ORDINARY INCOME TAX WORKING PAPER', 16, true);
    line(paper.taxPeriod, 12, true);
    line(paper.disclaimer, 8);
    line(`Taxpayer: ${paper.taxpayer.name}  TIN: ${paper.taxpayer.tin}`);
    line(`Accounting income ${paper.accountingIncome}`);
    line(`Accounting expenses (${paper.accountingExpenses})`);
    line(`Accounting profit ${paper.accountingProfit}`, 11, true);
    line(`Add-backs ${paper.addBacks}`);
    line(`Deductions (${paper.deductions})`);
    line(`Exempt income (${paper.exemptIncome})`);
    line(`Taxable income ${paper.taxableIncome == null ? 'not calculated' : paper.taxableIncome}`, 11, true);
    line(`Rule ${paper.taxRuleCode || '—'} ${paper.applicableRate == null ? '' : `${paper.applicableRate}%`}`);
    line(`Calculated income tax ${paper.calculatedIncomeTax == null ? 'not calculated' : paper.calculatedIncomeTax}`, 11, true);
    line(`Tax payments recorded (${paper.taxPayments})`);
    line(`Unreconciled amount ${paper.unreconciledAmount == null ? '—' : paper.unreconciledAmount}`, 11, true);
    line('These figures are not a ZIMRA assessment.', 8);
    for (const row of rows) {
      line(`${row.property || ''} ${row.classification} income=${row.accountingIncome} exp=${row.accountingExpenses}`);
    }
    for (const item of paper.reviewItems) {
      line(`Review: ${item.calculationStatus} ${(item.reasons || []).join(', ')}`, 8);
    }
    return { contentType: 'application/pdf', body: Buffer.from(await pdf.save()) };
  }
};

export default individualIncomeTaxService;
