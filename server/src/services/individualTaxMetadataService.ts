import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';
import { LandlordFinancialTransaction } from '../models/LandlordFinancialTransaction';
import { TransactionTaxSnapshot, ITransactionTaxSnapshot } from '../models/TransactionTaxSnapshot';
import { IndividualVatRecord } from '../models/IndividualVatRecord';
import { IndividualRentalTaxRecord } from '../models/IndividualRentalTaxRecord';
import { IndividualIncomeTaxRecord } from '../models/IndividualIncomeTaxRecord';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { logger } from '../utils/logger';
import { isDepositOnlyPayment } from './accountingPostingPolicy';
import { findPeriodForDate } from './accountingPeriodService';
import individualTaxProfileService from './individualTaxProfileService';
import { getEffectiveTaxRule } from './taxRuleRegistry';
import { buildTaxClassification } from './taxClassificationService';
import { assertTaxPeriodsAllowPosting, resolveRelevantTaxPeriods } from './taxPeriodService';
import type { TaxPeriodTaxType, TransactionTaxSourceKind } from './tax/taxMetadataTypes';
import { uncalculatedTaxFields } from './tax/taxMetadataTypes';
import individualVatService from './individualVatService';
import individualRentalTaxService from './individualRentalTaxService';
import individualIncomeTaxService from './individualIncomeTaxService';

function asObjectId(value: string) {
  return new mongoose.Types.ObjectId(value);
}

function isIndividualCompany(company: { workspaceType?: string; plan?: string } | null): boolean {
  return company?.workspaceType === 'individual' || company?.plan === 'INDIVIDUAL';
}

async function writeAudit(companyId: string, eventType: string, sourceId: string, message: string, metadata: Record<string, unknown>) {
  await AccountingEventLog.create({
    companyId: asObjectId(companyId),
    eventType,
    sourceModule: 'individual_tax_metadata',
    sourceId,
    success: true,
    message,
    metadata
  });
}

function toApi(snapshot: ITransactionTaxSnapshot) {
  return {
    id: String(snapshot._id),
    sourceType: snapshot.sourceType,
    sourceId: String(snapshot.sourceId),
    sourceKind: snapshot.sourceKind,
    transactionDate: snapshot.transactionDate,
    taxPeriodKey: snapshot.taxPeriodKey,
    taxPeriodId: snapshot.taxPeriodId ? String(snapshot.taxPeriodId) : null,
    periodAssignmentStatus: snapshot.periodAssignmentStatus,
    accountingPeriodId: snapshot.accountingPeriodId ? String(snapshot.accountingPeriodId) : null,
    classificationStatus: snapshot.classificationStatus,
    taxCalculationStatus: snapshot.taxCalculationStatus,
    vatTreatment: snapshot.vatTreatment,
    rentalTaxTreatment: snapshot.rentalTaxTreatment,
    rentalTaxRegime: snapshot.rentalTaxRegime,
    deductibility: snapshot.deductibility,
    capitalOrRevenue: snapshot.capitalOrRevenue,
    classificationSource: snapshot.classificationSource,
    reviewReasons: snapshot.reviewReasons,
    taxProfileSnapshot: snapshot.taxProfileSnapshot,
    rules: snapshot.taxRuleReferences,
    ...uncalculatedTaxFields()
  };
}

async function persistSnapshot(input: {
  companyId: string;
  propertyId?: string | null;
  sourceType: 'Payment' | 'LandlordFinancialTransaction';
  sourceId: string;
  sourceKind: TransactionTaxSourceKind;
  transactionDate: Date;
  classifiedBy?: string | null;
  classification: ReturnType<typeof buildTaxClassification>;
}): Promise<ITransactionTaxSnapshot> {
  const existing = await TransactionTaxSnapshot.findOne({
    companyId: asObjectId(input.companyId),
    sourceType: input.sourceType,
    sourceId: asObjectId(input.sourceId)
  });
  if (existing) return existing;

  const taxTypes = (input.classification.taxTypesRelevant.filter((type) =>
    ['VAT', 'PRESUMPTIVE_RENTAL_INCOME_TAX', 'INCOME_TAX'].includes(type)
  ) as TaxPeriodTaxType[]);
  const periodTypes = taxTypes.length ? taxTypes : (['INCOME_TAX'] as TaxPeriodTaxType[]);
  const periods = await resolveRelevantTaxPeriods({
    companyId: input.companyId,
    taxTypes: periodTypes,
    transactionDate: input.transactionDate
  });
  await assertTaxPeriodsAllowPosting(periods);
  const assigned = periods.find((period) => period.assignmentStatus === 'ASSIGNED') || periods[0];
  const accounting = await findPeriodForDate(input.companyId, input.transactionDate);

  try {
    const created = await TransactionTaxSnapshot.create({
      companyId: asObjectId(input.companyId),
      propertyId: input.propertyId ? asObjectId(input.propertyId) : null,
      sourceType: input.sourceType,
      sourceId: asObjectId(input.sourceId),
      sourceKind: input.sourceKind,
      transactionDate: input.transactionDate,
      accountingPeriodId: accounting?._id || null,
      taxPeriodKey: assigned.periodKey,
      taxPeriodId: assigned.taxPeriodId,
      periodAssignmentStatus: assigned.assignmentStatus,
      taxTypesRelevant: input.classification.taxTypesRelevant,
      taxRuleReferences: input.classification.taxRuleReferences,
      taxProfileSnapshot: input.classification.taxProfileSnapshot,
      vatTreatment: input.classification.vatTreatment,
      rentalTaxTreatment: input.classification.rentalTaxTreatment,
      rentalTaxRegime: input.classification.rentalTaxRegime,
      deductibility: input.classification.deductibility,
      capitalOrRevenue: input.classification.capitalOrRevenue,
      classificationSource: input.classification.classificationSource,
      classificationStatus: input.classification.classificationStatus,
      taxCalculationStatus: input.classification.taxCalculationStatus,
      reviewReasons: input.classification.reviewReasons,
      ...uncalculatedTaxFields(),
      classifiedAt: new Date(),
      classifiedBy: input.classifiedBy ? asObjectId(input.classifiedBy) : null
    });
    await writeAudit(input.companyId, 'TAX_METADATA_CREATED', input.sourceId, `Tax metadata for ${input.sourceKind}`, {
      taxPeriodKey: assigned.periodKey,
      taxCalculationStatus: input.classification.taxCalculationStatus,
      periodAssignmentStatus: assigned.assignmentStatus
    });
    await writeAudit(input.companyId, 'TAX_PERIOD_ASSIGNED', input.sourceId, `Tax period ${assigned.periodKey}`, {
      taxPeriodId: assigned.taxPeriodId,
      assignmentStatus: assigned.assignmentStatus,
      taxTypes: periodTypes
    });
    await writeAudit(input.companyId, 'TAX_PROFILE_SNAPSHOT_CREATED', input.sourceId, 'Stored tax profile snapshot', {
      ownerProfileVersion: input.classification.taxProfileSnapshot.ownerProfileVersion,
      vatSupplyTreatment: input.classification.taxProfileSnapshot.vatSupplyTreatment
    });
    if (input.classification.taxRuleReferences.length) {
      await writeAudit(input.companyId, 'TAX_RULE_RESOLVED', input.sourceId, 'Stored tax rule references without calculating tax', {
        rules: input.classification.taxRuleReferences.map((row) => ({
          taxType: row.taxType,
          ruleCode: row.ruleCode,
          ruleVersion: row.ruleVersion,
          taxAmount: null
        }))
      });
    }
    return created;
  } catch (error: any) {
    if (error?.code === 11000) {
      const dup = await TransactionTaxSnapshot.findOne({
        companyId: asObjectId(input.companyId),
        sourceType: input.sourceType,
        sourceId: asObjectId(input.sourceId)
      });
      if (dup) return dup;
    }
    throw error;
  }
}

async function loadClassificationContext(companyId: string, propertyId: string, transactionDate: Date) {
  const [owner, propertyProfile, vatRule, presumptiveRule, incomeTaxRule, company] = await Promise.all([
    individualTaxProfileService.getOwnerProfile(companyId),
    individualTaxProfileService.getPropertyProfile(companyId, propertyId),
    getEffectiveTaxRule('VAT', transactionDate),
    getEffectiveTaxRule('PRESUMPTIVE_RENTAL_INCOME_TAX', transactionDate),
    getEffectiveTaxRule('INCOME_TAX', transactionDate),
    Company.findById(companyId).select('taxProfile vatNumber').lean()
  ]);
  const taxProfile = (company as any)?.taxProfile || {};
  return { owner, propertyProfile, vatRule, presumptiveRule, incomeTaxRule, taxProfile };
}

export const individualTaxMetadataService = {
  toApi,

  async attachForLandlordEntry(input: {
    companyId: string;
    userId: string;
    transactionId: string;
    sourceKind: TransactionTaxSourceKind;
    propertyId: string;
    transactionDate: Date;
    vatMode?: string | null;
    deductibility?: string | null;
    capitalOrRevenue?: string | null;
  }): Promise<ITransactionTaxSnapshot | null> {
    const ctx = await loadClassificationContext(input.companyId, input.propertyId, input.transactionDate);
    const classification = buildTaxClassification({
      sourceKind: input.sourceKind,
      transactionDate: input.transactionDate,
      vatRegistered: ctx.owner.vatRegistered,
      vatRegistrationEffectiveDate: ctx.owner.vatRegistrationDate,
      vatRegistrationCancelledAt: ctx.owner.vatRegistrationCancelledAt,
      vatNumber: ctx.owner.vatNumber,
      rentalTaxRegime: ctx.owner.rentalTaxRegime,
      incomeTaxRegistered: ctx.owner.incomeTaxRegistered,
      propertyUseClass: ctx.propertyProfile.propertyUseClass,
      vatSupplyTreatment: ctx.propertyProfile.vatSupplyTreatment,
      rentalTaxTreatment: ctx.propertyProfile.rentalTaxTreatment,
      ownerProfileVersion: Number((ctx.owner as any).profileVersion || 1),
      propertyUpdatedAt: null,
      userVatTreatment: input.vatMode || null,
      userDeductibility: input.deductibility || null,
      userCapitalOrRevenue: input.capitalOrRevenue || null,
      vatRule: ctx.vatRule,
      presumptiveRule: ctx.presumptiveRule,
      incomeTaxRule: ctx.incomeTaxRule
    });
    const snapshot = await persistSnapshot({
      companyId: input.companyId,
      propertyId: input.propertyId,
      sourceType: 'LandlordFinancialTransaction',
      sourceId: input.transactionId,
      sourceKind: input.sourceKind,
      transactionDate: input.transactionDate,
      classifiedBy: input.userId,
      classification
    });
    await LandlordFinancialTransaction.updateOne(
      { _id: asObjectId(input.transactionId) },
      {
        $set: {
          taxSnapshotId: snapshot._id,
          taxCalculationStatus: snapshot.taxCalculationStatus,
          taxPeriodKey: snapshot.taxPeriodKey
        }
      }
    );
    await individualVatService.safePostForSnapshot(snapshot, input.userId);
    await individualRentalTaxService.safePostForSnapshot(snapshot, input.userId);
    await individualIncomeTaxService.safePostForSnapshot(snapshot, input.userId);
    return snapshot;
  },

  async attachForPayment(paymentId: string): Promise<ITransactionTaxSnapshot | null> {
    const payment = await Payment.findById(paymentId);
    if (!payment?.companyId) return null;
    const company = await Company.findById(payment.companyId).select('workspaceType plan').lean();
    if (!isIndividualCompany(company as any)) return null;
    if (String(payment.status) === 'reversed' || payment.reversalOfPaymentId) return null;

    const propertyId = payment.propertyId ? String(payment.propertyId) : '';
    if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) return null;
    const property = await Property.findOne({ _id: propertyId, companyId: payment.companyId, isDeleted: { $ne: true } }).select('_id').lean();
    if (!property) return null;

    const transactionDate = payment.paymentDate ? new Date(payment.paymentDate) : new Date();
    const depositOnly = isDepositOnlyPayment(payment);
    const sourceKind: TransactionTaxSourceKind = depositOnly ? 'PAYMENT_DEPOSIT' : 'PAYMENT_RENT';
    const ctx = await loadClassificationContext(String(payment.companyId), propertyId, transactionDate);
    const classification = buildTaxClassification({
      sourceKind,
      transactionDate,
      vatRegistered: ctx.owner.vatRegistered,
      vatRegistrationEffectiveDate: ctx.owner.vatRegistrationDate,
      vatRegistrationCancelledAt: ctx.owner.vatRegistrationCancelledAt,
      vatNumber: ctx.owner.vatNumber,
      rentalTaxRegime: ctx.owner.rentalTaxRegime,
      incomeTaxRegistered: ctx.owner.incomeTaxRegistered,
      propertyUseClass: ctx.propertyProfile.propertyUseClass,
      vatSupplyTreatment: ctx.propertyProfile.vatSupplyTreatment,
      rentalTaxTreatment: ctx.propertyProfile.rentalTaxTreatment,
      ownerProfileVersion: Number((ctx.owner as any).profileVersion || 1),
      vatRule: ctx.vatRule,
      presumptiveRule: ctx.presumptiveRule,
      incomeTaxRule: ctx.incomeTaxRule
    });
    const snapshot = await persistSnapshot({
      companyId: String(payment.companyId),
      propertyId,
      sourceType: 'Payment',
      sourceId: String(payment._id),
      sourceKind,
      transactionDate,
      classifiedBy: payment.processedBy ? String(payment.processedBy) : null,
      classification
    });
    await individualVatService.safePostForSnapshot(snapshot, payment.processedBy ? String(payment.processedBy) : null);
    await individualRentalTaxService.safePostForSnapshot(snapshot, payment.processedBy ? String(payment.processedBy) : null);
    await individualIncomeTaxService.safePostForSnapshot(snapshot, payment.processedBy ? String(payment.processedBy) : null);
    return snapshot;
  },

  async safeAttachForPayment(paymentId: string): Promise<void> {
    try {
      await this.attachForPayment(paymentId);
    } catch (error: any) {
      logger.warn('Individual tax metadata attach failed', { paymentId, message: error?.message || error });
    }
  },

  async getForSource(companyId: string, sourceType: 'Payment' | 'LandlordFinancialTransaction', sourceId: string) {
    const row = await TransactionTaxSnapshot.findOne({
      companyId: asObjectId(companyId),
      sourceType,
      sourceId: asObjectId(sourceId)
    });
    if (!row) return null;
    const vatRows = await IndividualVatRecord.find({
      companyId: asObjectId(companyId),
      sourceType,
      sourceId: asObjectId(sourceId)
    }).lean();
    const rentalRows = await IndividualRentalTaxRecord.find({
      companyId: asObjectId(companyId),
      sourceType,
      sourceId: asObjectId(sourceId)
    }).lean();
    const incomeRows = await IndividualIncomeTaxRecord.find({
      companyId: asObjectId(companyId),
      sourceType,
      sourceId: asObjectId(sourceId)
    }).lean();
    return {
      ...toApi(row),
      vat: vatRows.map((item) => individualVatService.toApi(item as any)),
      rentalTax: rentalRows.map((item) => individualRentalTaxService.toApi(item as any)),
      incomeTax: incomeRows.map((item) => individualIncomeTaxService.toApi(item as any))
    };
  },

  async listForPeriod(companyId: string, periodKey: string, taxType?: string) {
    const query: Record<string, unknown> = { companyId: asObjectId(companyId), taxPeriodKey: periodKey };
    if (taxType) query.taxTypesRelevant = taxType;
    const rows = await TransactionTaxSnapshot.find(query).sort({ transactionDate: 1 }).lean();
    return rows.map((row) => toApi(row as any));
  },

  async reviewQueue(companyId: string) {
    const rows = await TransactionTaxSnapshot.find({
      companyId: asObjectId(companyId),
      $or: [
        { taxCalculationStatus: 'REVIEW_REQUIRED' },
        { periodAssignmentStatus: 'PERIOD_REQUIRED' },
        { reviewReasons: { $exists: true, $ne: [] } }
      ]
    })
      .sort({ transactionDate: -1 })
      .limit(200)
      .lean();
    return rows.map((row) => ({
      id: String(row._id),
      sourceType: row.sourceType,
      sourceId: String(row.sourceId),
      sourceKind: row.sourceKind,
      taxPeriodKey: row.taxPeriodKey,
      taxCalculationStatus: row.taxCalculationStatus,
      periodAssignmentStatus: row.periodAssignmentStatus,
      reviewReasons: row.reviewReasons || [],
      ...uncalculatedTaxFields()
    }));
  },

  async periodSummaries(companyId: string) {
    const rows = await TransactionTaxSnapshot.aggregate([
      { $match: { companyId: asObjectId(companyId) } },
      { $unwind: { path: '$taxTypesRelevant', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { periodKey: '$taxPeriodKey', taxType: '$taxTypesRelevant' },
          transactions: { $sum: 1 },
          review: {
            $sum: { $cond: [{ $eq: ['$taxCalculationStatus', 'REVIEW_REQUIRED'] }, 1, 0] }
          },
          notCalculated: {
            $sum: {
              $cond: [{ $in: ['$taxCalculationStatus', ['NOT_CALCULATED', 'READY_FOR_CALCULATION', 'REVIEW_REQUIRED']] }, 1, 0]
            }
          },
          periodRequired: {
            $sum: { $cond: [{ $eq: ['$periodAssignmentStatus', 'PERIOD_REQUIRED'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.periodKey': -1, '_id.taxType': 1 } }
    ]);
    const { TaxPeriod } = await import('../models/TaxPeriod');
    const periodKeys = Array.from(new Set(rows.map((row) => row._id.periodKey).filter(Boolean)));
    const opened = periodKeys.length
      ? await TaxPeriod.find({ companyId: asObjectId(companyId), periodKey: { $in: periodKeys } })
          .select('taxType periodKey status')
          .lean()
      : [];
    const statusByKey = new Map(opened.map((row) => [`${row.taxType}:${row.periodKey}`, row.status]));
    return rows.map((row) => ({
      taxType: row._id.taxType || 'OTHER',
      periodKey: row._id.periodKey,
      status: statusByKey.get(`${row._id.taxType}:${row._id.periodKey}`) || (row.periodRequired ? 'PERIOD_REQUIRED' : 'OPEN'),
      transactions: row.transactions,
      requiresReview: row.review,
      notCalculated: row.notCalculated,
      periodRequired: row.periodRequired,
      ...uncalculatedTaxFields()
    }));
  },

  async integrity(companyId: string) {
    const findings: Array<{ issueType: string; reason: string; sourceId?: string }> = [];
    const snapshots = await TransactionTaxSnapshot.find({ companyId: asObjectId(companyId) }).limit(500).lean();
    const periodIds = Array.from(
      new Set(snapshots.map((row) => (row.taxPeriodId ? String(row.taxPeriodId) : '')).filter(Boolean))
    );
    const { TaxPeriod } = await import('../models/TaxPeriod');
    const periods = periodIds.length
      ? await TaxPeriod.find({ _id: { $in: periodIds.map((id) => asObjectId(id)) } })
          .select('_id status')
          .lean()
      : [];
    const periodById = new Map(periods.map((row) => [String(row._id), row]));
    for (const row of snapshots) {
      if (row.taxAmount != null || row.vatAmount != null || row.presumptiveTaxAmount != null || row.incomeTaxAmount != null) {
        findings.push({ issueType: 'TAX_METADATA_MISMATCH', reason: 'Snapshot stores a tax amount although Phase D does not calculate tax', sourceId: String(row.sourceId) });
      }
      if (!row.taxProfileSnapshot) {
        findings.push({ issueType: 'TAX_PROFILE_SNAPSHOT_MISSING', reason: 'Snapshot is missing the posting-time tax profile', sourceId: String(row.sourceId) });
      }
      if (!row.classificationStatus) {
        findings.push({ issueType: 'TRANSACTION_MISSING_TAX_CLASSIFICATION', reason: 'Snapshot is missing classificationStatus', sourceId: String(row.sourceId) });
      }
      if (!row.taxPeriodKey) {
        findings.push({ issueType: 'TRANSACTION_MISSING_TAX_PERIOD', reason: 'Snapshot is missing taxPeriodKey', sourceId: String(row.sourceId) });
      }
      if (row.taxPeriodId) {
        const period = periodById.get(String(row.taxPeriodId));
        if (!period) findings.push({ issueType: 'TAX_PERIOD_INVALID', reason: 'taxPeriodId does not exist', sourceId: String(row.sourceId) });
        else if (period.status === 'FINALIZED' || period.status === 'LOCKED') {
          findings.push({ issueType: 'TAX_PERIOD_CLOSED', reason: `Assigned tax period is ${period.status}`, sourceId: String(row.sourceId) });
        }
      } else if (row.periodAssignmentStatus === 'PERIOD_REQUIRED') {
        findings.push({ issueType: 'TRANSACTION_MISSING_TAX_PERIOD', reason: `Period ${row.taxPeriodKey} has not been opened`, sourceId: String(row.sourceId) });
      }
      const badRule = (row.taxRuleReferences || []).find((ref) => ref.ruleCode && !ref.ruleId && ref.taxCalculationStatus === 'READY_FOR_CALCULATION');
      if (badRule) {
        findings.push({ issueType: 'TAX_RULE_REFERENCE_INVALID', reason: `Rule ${badRule.ruleCode} is missing an id`, sourceId: String(row.sourceId) });
      }
    }
    return { detectionOnly: true, noAutomaticRepair: true, findings };
  }
};

export default individualTaxMetadataService;
