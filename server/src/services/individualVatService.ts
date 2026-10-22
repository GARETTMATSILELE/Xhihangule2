import mongoose from 'mongoose';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { IndividualVatRecord, IIndividualVatRecord } from '../models/IndividualVatRecord';
import { TransactionTaxSnapshot, ITransactionTaxSnapshot } from '../models/TransactionTaxSnapshot';
import { Payment } from '../models/Payment';
import { LandlordFinancialTransaction } from '../models/LandlordFinancialTransaction';
import { Company } from '../models/Company';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { TaxPeriod } from '../models/TaxPeriod';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { assignmentStatusForExistingPeriod } from './taxPeriodService';
import { evaluateIndividualVatApplicability } from './individualVatApplicability';
import { calculateIndividualVat, resolveCalculationMethod } from './individualVatCalculation';
import { buildXlsxWorkbook } from '../utils/xlsxWorkbook';
import { roundMoney } from '../utils/money';
import { netFromNullable, sumCompleteTaxAmounts } from './tax/taxAmountAggregation';

function asObjectId(value: string) {
  return new mongoose.Types.ObjectId(value);
}

function toApi(row: IIndividualVatRecord | Record<string, unknown>) {
  const doc = row as any;
  return {
    id: String(doc._id),
    sourceType: doc.sourceType,
    sourceId: String(doc.sourceId),
    snapshotId: doc.snapshotId ? String(doc.snapshotId) : null,
    propertyId: doc.propertyId ? String(doc.propertyId) : null,
    taxPeriodId: doc.taxPeriodId ? String(doc.taxPeriodId) : null,
    taxPeriodKey: doc.taxPeriodKey,
    direction: doc.direction,
    recordKind: doc.recordKind,
    reversalOf: doc.reversalOf ? String(doc.reversalOf) : null,
    treatment: doc.treatment,
    applicabilityReason: doc.applicabilityReason,
    grossAmount: doc.grossAmount,
    netAmount: doc.netAmount,
    taxableAmount: doc.taxableAmount,
    vatRate: doc.vatRate,
    vatAmount: doc.vatAmount,
    chargedVatAmount: doc.chargedVatAmount,
    recoverableVatAmount: doc.recoverableVatAmount,
    inputVatEligibility: doc.inputVatEligibility || null,
    calculationMethod: doc.calculationMethod,
    calculationStatus: doc.calculationStatus,
    reviewReasons: doc.reviewReasons || [],
    taxRuleId: doc.taxRuleId || null,
    taxRuleVersion: doc.taxRuleVersion ?? null,
    taxRuleCode: doc.taxRuleCode || null,
    currency: doc.currency,
    baseCurrency: doc.baseCurrency,
    exchangeRate: doc.exchangeRate,
    supplierVatNumber: doc.supplierVatNumber || null,
    invoiceNumber: doc.invoiceNumber || null,
    incomeTaxAmount: null,
    presumptiveTaxAmount: null
  };
}

async function writeAudit(companyId: string, eventType: string, sourceId: string, message: string, metadata: Record<string, unknown>) {
  await AccountingEventLog.create({
    companyId: asObjectId(companyId),
    eventType,
    sourceModule: 'individual_vat',
    sourceId,
    success: !String(eventType).includes('FAILED'),
    message,
    metadata
  });
}

async function assertPeriodAllowsVat(snapshot: ITransactionTaxSnapshot) {
  if (!snapshot.taxPeriodId) return;
  const period = await TaxPeriod.findById(snapshot.taxPeriodId).select('status taxType');
  if (!period) return;
  if (assignmentStatusForExistingPeriod(period.status as any) === 'PERIOD_CLOSED') {
    throw new AppError(`VAT period ${snapshot.taxPeriodKey} is ${period.status}. Corrections require an amendment.`, 409);
  }
}

async function loadSource(snapshot: ITransactionTaxSnapshot) {
  if (snapshot.sourceType === 'Payment') {
    const payment = await Payment.findById(snapshot.sourceId).lean();
    if (!payment) return null;
    const amount = Number(
      (payment as any).rentAllocated ??
      (payment as any).commissionDetails?.ownerAmount ??
      payment.amount ??
      0
    );
    return {
      amount,
      currency: String((payment as any).currency || 'USD'),
      vatMode: null as string | null,
      vatIncluded: (payment as any).vatIncluded,
      supplier: null as string | null,
      supplierTin: null as string | null,
      supplierVatNumber: null as string | null,
      invoiceNumber: payment.referenceNumber || null,
      inputVatEligibility: null as string | null,
      counterpartyName: null as string | null,
      exchangeRate: (payment as any).exchangeRate ?? 1,
      exchangeRateDate: payment.paymentDate || null
    };
  }
  const entry = await LandlordFinancialTransaction.findById(snapshot.sourceId).lean();
  if (!entry) return null;
  return {
    amount: Number(entry.amount || 0),
    currency: String(entry.currency || 'USD'),
    vatMode: entry.vatMode || null,
    vatIncluded: null as boolean | null,
    supplier: entry.supplier || null,
    supplierTin: entry.supplierTin || null,
    supplierVatNumber: entry.supplierVatNumber || null,
    invoiceNumber: entry.invoiceNumber || null,
    inputVatEligibility: (entry as any).inputVatEligibility || null,
    counterpartyName: entry.supplier || null,
    exchangeRate: 1,
    exchangeRateDate: entry.date || null
  };
}

export type ReverseVatInput = {
  companyId: string;
  sourceType: 'Payment' | 'LandlordFinancialTransaction';
  sourceId: string;
  reason?: string;
  reversalTransactionId?: string;
  userId?: string;
};

export const individualVatService = {
  toApi,

  async postForSnapshot(snapshot: ITransactionTaxSnapshot, classifiedBy?: string | null): Promise<IIndividualVatRecord | null> {
    const vatRef = (snapshot.taxRuleReferences || []).find((row) => row.taxType === 'VAT');
    const applicability = evaluateIndividualVatApplicability({
      sourceKind: snapshot.sourceKind,
      vatRegisteredOnSnapshot: Boolean(snapshot.taxProfileSnapshot?.vatRegistered),
      vatSupplyTreatment: snapshot.taxProfileSnapshot?.vatSupplyTreatment || snapshot.vatTreatment,
      userVatTreatment: snapshot.vatTreatment,
      vatRule: vatRef
        ? {
            id: vatRef.ruleId || '',
            version: vatRef.ruleVersion || 1,
            ruleCode: vatRef.ruleCode || '',
            rate: vatRef.configuredRate,
            effectiveFrom: vatRef.effectiveFrom ? new Date(vatRef.effectiveFrom) : new Date(snapshot.transactionDate)
          }
        : null
    });

    if (!applicability.direction) return null;

    const existing = await IndividualVatRecord.findOne({
      companyId: snapshot.companyId,
      sourceType: snapshot.sourceType,
      sourceId: snapshot.sourceId,
      direction: applicability.direction,
      recordKind: 'ORIGINAL'
    });
    if (existing) return existing;

    try {
      await assertPeriodAllowsVat(snapshot);
    } catch (error: any) {
      if (Number(error?.statusCode) === 409) {
        await writeAudit(String(snapshot.companyId), 'VAT_REVIEW_REQUIRED', String(snapshot.sourceId), 'VAT period is closed', {
          taxPeriodKey: snapshot.taxPeriodKey,
          reason: 'TAX_PERIOD_CLOSED'
        });
        throw error;
      }
      throw error;
    }

    const source = await loadSource(snapshot);
    const method = resolveCalculationMethod({
      direction: applicability.direction,
      vatMode: source?.vatMode,
      vatIncluded: source?.vatIncluded
    });
    const calc = calculateIndividualVat({
      direction: applicability.direction,
      treatment: applicability.treatment,
      amount: Number(source?.amount || 0),
      vatRatePercent: applicability.configuredRate,
      method,
      inputVatEligibility: source?.inputVatEligibility,
      supplierVatNumber: source?.supplierVatNumber,
      invoiceNumber: source?.invoiceNumber
    });

    const reviewReasons = Array.from(new Set([...(applicability.reviewReasons || []), ...(calc.reviewReasons || [])]));
    const calculationStatus = reviewReasons.length && calc.calculationStatus === 'CALCULATED'
      ? 'REVIEW_REQUIRED'
      : calc.calculationStatus === 'CALCULATED' && applicability.reviewRequired
        ? 'REVIEW_REQUIRED'
        : calc.calculationStatus;

    try {
      const created = await IndividualVatRecord.create({
        companyId: snapshot.companyId,
        propertyId: snapshot.propertyId || null,
        sourceType: snapshot.sourceType,
        sourceId: snapshot.sourceId,
        snapshotId: snapshot._id,
        taxPeriodId: snapshot.taxPeriodId || null,
        taxPeriodKey: snapshot.taxPeriodKey,
        taxType: 'VAT',
        direction: applicability.direction,
        recordKind: 'ORIGINAL',
        treatment: applicability.treatment,
        applicabilityReason: applicability.reason,
        grossAmount: calc.grossAmount,
        netAmount: calc.netAmount,
        taxableAmount: calc.taxableAmount,
        vatRate: calc.vatRate,
        vatAmount: calc.vatAmount,
        chargedVatAmount: calc.chargedVatAmount,
        recoverableVatAmount: calc.recoverableVatAmount,
        inputVatEligibility: calc.inputVatEligibility,
        calculationMethod: calc.calculationMethod,
        calculationStatus,
        reviewReasons,
        taxRuleId: applicability.ruleId,
        taxRuleVersion: applicability.ruleVersion,
        taxRuleCode: applicability.ruleCode,
        taxRuleEffectiveFrom: applicability.effectiveFrom,
        currency: source?.currency || 'USD',
        baseCurrency: source?.currency || 'USD',
        baseAmount: calc.grossAmount,
        exchangeRate: source?.exchangeRate ?? 1,
        exchangeRateDate: source?.exchangeRateDate || snapshot.transactionDate,
        supplier: source?.supplier,
        supplierTin: source?.supplierTin,
        supplierVatNumber: source?.supplierVatNumber,
        invoiceNumber: source?.invoiceNumber,
        counterpartyName: source?.counterpartyName,
        incomeTaxAmount: null,
        presumptiveTaxAmount: null,
        calculatedAt: new Date(),
        calculatedBy: classifiedBy && mongoose.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null
      });
      const event = calculationStatus === 'REVIEW_REQUIRED' ? 'VAT_REVIEW_REQUIRED' : calculationStatus === 'NOT_APPLICABLE' ? 'VAT_CALCULATED' : 'VAT_CALCULATED';
      await writeAudit(String(snapshot.companyId), event, String(snapshot.sourceId), `VAT ${applicability.direction} ${calculationStatus}`, {
        vatAmount: calc.vatAmount,
        treatment: applicability.treatment,
        taxRuleVersion: applicability.ruleVersion
      });
      return created;
    } catch (error: any) {
      if (error?.code === 11000) {
        return IndividualVatRecord.findOne({
          companyId: snapshot.companyId,
          sourceType: snapshot.sourceType,
          sourceId: snapshot.sourceId,
          direction: applicability.direction,
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
      logger.warn('Individual VAT calculation failed after accounting success', {
        sourceId: String(snapshot.sourceId),
        message: error?.message || error
      });
      await writeAudit(String(snapshot.companyId), 'VAT_FAILED', String(snapshot.sourceId), error?.message || 'VAT calculation failed', {
        accountingStatus: 'ACCOUNTING_SUCCESS',
        vatStatus: 'VAT_FAILED'
      }).catch(() => undefined);
    }
  },

  async reverseForSource(input: ReverseVatInput): Promise<IIndividualVatRecord | null> {
    const original = await IndividualVatRecord.findOne({
      companyId: asObjectId(input.companyId),
      sourceType: input.sourceType,
      sourceId: asObjectId(input.sourceId),
      recordKind: 'ORIGINAL'
    });
    if (!original) return null;
    const existing = await IndividualVatRecord.findOne({
      companyId: original.companyId,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      direction: original.direction,
      recordKind: 'REVERSAL'
    });
    if (existing) return existing;
    try {
      await assertPeriodAllowsVat({
        taxPeriodId: original.taxPeriodId,
        taxPeriodKey: original.taxPeriodKey
      } as ITransactionTaxSnapshot);
    } catch (error: any) {
      if (Number(error?.statusCode) === 409) throw error;
    }
    const created = await IndividualVatRecord.create({
      companyId: original.companyId,
      propertyId: original.propertyId,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      snapshotId: original.snapshotId,
      taxPeriodId: original.taxPeriodId,
      taxPeriodKey: original.taxPeriodKey,
      taxType: 'VAT',
      direction: original.direction,
      recordKind: 'REVERSAL',
      reversalOf: original._id,
      reversalReason: input.reason || 'Accounting reversal',
      reversalDate: new Date(),
      reversalTransactionId: input.reversalTransactionId || null,
      treatment: original.treatment,
      applicabilityReason: original.applicabilityReason,
      grossAmount: original.grossAmount == null ? null : roundMoney(-Number(original.grossAmount)),
      netAmount: original.netAmount == null ? null : roundMoney(-Number(original.netAmount)),
      taxableAmount: original.taxableAmount == null ? null : roundMoney(-Number(original.taxableAmount)),
      vatRate: original.vatRate,
      vatAmount: original.vatAmount == null ? null : roundMoney(-Number(original.vatAmount)),
      chargedVatAmount: original.chargedVatAmount == null ? null : roundMoney(-Number(original.chargedVatAmount)),
      recoverableVatAmount: original.recoverableVatAmount == null ? null : roundMoney(-Number(original.recoverableVatAmount)),
      inputVatEligibility: original.inputVatEligibility,
      calculationMethod: original.calculationMethod,
      calculationStatus: original.calculationStatus,
      reviewReasons: original.reviewReasons,
      taxRuleId: original.taxRuleId,
      taxRuleVersion: original.taxRuleVersion,
      taxRuleCode: original.taxRuleCode,
      taxRuleEffectiveFrom: original.taxRuleEffectiveFrom,
      currency: original.currency,
      baseCurrency: original.baseCurrency,
      baseAmount: original.baseAmount == null ? null : roundMoney(-Number(original.baseAmount)),
      exchangeRate: original.exchangeRate,
      exchangeRateDate: original.exchangeRateDate,
      supplier: original.supplier,
      supplierTin: original.supplierTin,
      supplierVatNumber: original.supplierVatNumber,
      invoiceNumber: original.invoiceNumber,
      counterpartyName: original.counterpartyName,
      incomeTaxAmount: null,
      presumptiveTaxAmount: null,
      calculatedAt: new Date(),
      calculatedBy: input.userId && mongoose.Types.ObjectId.isValid(input.userId) ? asObjectId(input.userId) : null
    });
    await writeAudit(input.companyId, 'VAT_REVERSED', input.sourceId, 'VAT reversal posted; original preserved', {
      originalId: String(original._id),
      reversalId: String(created._id)
    });
    return created;
  },

  async reportReverseForSource(input: ReverseVatInput): Promise<'reversed' | 'absent' | 'failed'> {
    try {
      const { throwOnceIfArmed } = await import('./testFailureSeam');
      throwOnceIfArmed(String(input.sourceId), String(input.reason || ''), 'PHASE_FAIL_INDIVIDUAL_VAT');
      const created = await this.reverseForSource(input);
      return created ? 'reversed' : 'absent';
    } catch (error: any) {
      logger.warn('Individual VAT reversal failed', { sourceId: input.sourceId, message: error?.message || error });
      return 'failed';
    }
  },

  async safeReverseForSource(input: ReverseVatInput): Promise<void> {
    await this.reportReverseForSource(input);
  },

  async workingPaper(companyId: string, periodKey?: string) {
    const company = await Company.findById(companyId).select('name tin taxProfile').lean();
    const query: Record<string, unknown> = { companyId: asObjectId(companyId) };
    if (periodKey) query.taxPeriodKey = periodKey;
    const records = await IndividualVatRecord.find(query).sort({ calculatedAt: 1 }).lean();
    const outputRows = records.filter((row) => row.direction === 'OUTPUT');
    const inputRows = records.filter((row) => row.direction === 'INPUT');
    const outputVat = sumCompleteTaxAmounts(outputRows, (row) => row.vatAmount);
    const inputVat = sumCompleteTaxAmounts(inputRows, (row) => row.recoverableVatAmount ?? row.vatAmount);
    const adjustments = sumCompleteTaxAmounts(
      records.filter((row) => row.recordKind !== 'ORIGINAL'),
      (row) => row.vatAmount
    );
    const reviewItems = records.filter((row) => row.calculationStatus === 'REVIEW_REQUIRED' || (row.reviewReasons || []).length);
    const taxProfile = (company as any)?.taxProfile || {};
    return {
      disclaimer:
        'VAT working paper for preparation support. Mantis does not file ZIMRA returns and is not ZIMRA-certified.',
      taxpayer: {
        name: (company as any)?.name || '',
        tin: (company as any)?.tin || taxProfile.tin || '',
        vatNumber: taxProfile.vatNumber || '',
        vatRegistered: Boolean(taxProfile.vatRegistered)
      },
      taxPeriod: periodKey || 'ALL',
      vatRegistrationStatus: taxProfile.vatRegistered ? 'REGISTERED' : 'NOT_REGISTERED',
      outputVat,
      inputVat,
      adjustments,
      netVatPosition: netFromNullable(outputVat, inputVat),
      incomeTaxAmount: null,
      presumptiveTaxAmount: null,
      transactions: records.map((row) => toApi(row)),
      reviewItems: reviewItems.map((row) => ({
        id: String(row._id),
        sourceId: String(row.sourceId),
        sourceType: row.sourceType,
        reasons: row.reviewReasons || [],
        calculationStatus: row.calculationStatus,
        vatAmount: row.vatAmount
      }))
    };
  },

  async overview(companyId: string, periodKey?: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    return {
      currentPeriod: paper.taxPeriod,
      vatRegistered: paper.vatRegistrationStatus,
      outputVat: paper.outputVat,
      inputVat: paper.inputVat,
      netVatPosition: paper.netVatPosition,
      reviewItems: paper.reviewItems.length,
      incomeTaxAmount: null,
      presumptiveTaxAmount: null
    };
  },

  async transactions(companyId: string, filters: { periodKey?: string; direction?: string; status?: string } = {}) {
    const query: Record<string, unknown> = { companyId: asObjectId(companyId) };
    if (filters.periodKey) query.taxPeriodKey = filters.periodKey;
    if (filters.direction === 'INPUT' || filters.direction === 'OUTPUT') query.direction = filters.direction;
    if (filters.status) query.calculationStatus = filters.status;
    const rows = await IndividualVatRecord.find(query).sort({ calculatedAt: -1 }).limit(500).lean();
    return rows.map((row) => toApi(row));
  },

  async reviewQueue(companyId: string) {
    const rows = await IndividualVatRecord.find({
      companyId: asObjectId(companyId),
      $or: [{ calculationStatus: 'REVIEW_REQUIRED' }, { reviewReasons: { $exists: true, $ne: [] } }]
    })
      .sort({ calculatedAt: -1 })
      .limit(200)
      .lean();
    return rows.map((row) => ({
      id: String(row._id),
      sourceType: row.sourceType,
      sourceId: String(row.sourceId),
      taxPeriodKey: row.taxPeriodKey,
      reasons: row.reviewReasons || [],
      calculationStatus: row.calculationStatus,
      vatAmount: row.vatAmount
    }));
  },

  async reconcile(companyId: string, periodKey?: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    const findings: Array<{ issueType: string; reason: string; sourceId?: string }> = [];
    const records = paper.transactions;
    const outputSum = sumCompleteTaxAmounts(records.filter((row) => row.direction === 'OUTPUT'), (row) => row.vatAmount);
    const inputSum = sumCompleteTaxAmounts(records.filter((row) => row.direction === 'INPUT'), (row) => row.recoverableVatAmount ?? row.vatAmount);
    if (outputSum !== paper.outputVat || inputSum !== paper.inputVat) {
      findings.push({ issueType: 'VAT_AMOUNT_MISMATCH', reason: 'Working paper totals do not equal VAT record sums' });
    }
    const sourceIds = records.filter((row) => row.recordKind !== 'REVERSAL').map((row) => row.sourceId);
    const dup = sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index);
    for (const id of Array.from(new Set(dup))) {
      findings.push({ issueType: 'SOURCE_WITH_DUPLICATE_VAT', reason: 'More than one original VAT record for the same source', sourceId: id });
    }
    for (const row of records) {
      if (row.snapshotId) {
        const snapshot = await TransactionTaxSnapshot.findById(row.snapshotId).select('taxPeriodKey taxProfileSnapshot taxRuleReferences').lean();
        if (!snapshot) findings.push({ issueType: 'VAT_RECORD_WITHOUT_SOURCE', reason: 'VAT record snapshot is missing', sourceId: row.sourceId });
        else {
          if (snapshot.taxPeriodKey !== row.taxPeriodKey) {
            findings.push({ issueType: 'VAT_PERIOD_MISMATCH', reason: 'VAT record period differs from snapshot', sourceId: row.sourceId });
          }
          const rule = (snapshot.taxRuleReferences || []).find((ref) => ref.taxType === 'VAT');
          if (row.taxRuleVersion != null && rule?.ruleVersion != null && Number(rule.ruleVersion) !== Number(row.taxRuleVersion)) {
            findings.push({ issueType: 'VAT_RULE_MISMATCH', reason: 'VAT record rule version differs from snapshot', sourceId: row.sourceId });
          }
        }
      }
      if (row.currency && row.baseCurrency && row.currency !== row.baseCurrency && row.exchangeRate == null) {
        findings.push({ issueType: 'VAT_CURRENCY_MISMATCH', reason: 'Currency conversion basis is missing', sourceId: row.sourceId });
      }
    }
    return {
      detectionOnly: true,
      noAutomaticRepair: true,
      workingPaper: { outputVat: paper.outputVat, inputVat: paper.inputVat, netVatPosition: paper.netVatPosition },
      recordTotals: { outputVat: outputSum, inputVat: inputSum },
      findings
    };
  },

  async exportWorkingPaper(companyId: string, periodKey: string | undefined, format: string) {
    const paper = await this.workingPaper(companyId, periodKey);
    const rows = paper.transactions.map((row) => ({
      taxpayer: paper.taxpayer.name,
      tin: paper.taxpayer.tin,
      vatNumber: paper.taxpayer.vatNumber,
      taxPeriod: paper.taxPeriod,
      propertyId: row.propertyId,
      transaction: row.sourceId,
      sourceType: row.sourceType,
      direction: row.direction,
      treatment: row.treatment,
      net: row.netAmount,
      vatRate: row.vatRate,
      vat: row.vatAmount,
      rule: row.taxRuleCode,
      sourceReference: row.invoiceNumber
    }));
    if (format === 'csv') {
      const headers = Object.keys(rows[0] || { taxpayer: '', tin: '', vatNumber: '', taxPeriod: '' });
      const body = [
        headers.join(','),
        ...rows.map((row) => headers.map((header) => JSON.stringify((row as any)[header] ?? '')).join(','))
      ].join('\n');
      return { contentType: 'text/csv', body };
    }
    if (format === 'xlsx' || format === 'excel') {
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: buildXlsxWorkbook('VAT working paper', rows.length ? rows : [{ taxpayer: paper.taxpayer.name, taxPeriod: paper.taxPeriod }]),
        filename: `vat-working-paper-${paper.taxPeriod}.xlsx`
      };
    }
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    const wrap = (text: string, maxChars: number) => {
      const words = String(text || '').split(/\s+/);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars && current) {
          lines.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [''];
    };
    const line = (text: string, size = 10, useBold = false) => {
      for (const piece of wrap(String(text || ''), size <= 8 ? 108 : 92)) {
        if (y < 40) {
          page = pdf.addPage([595, 842]);
          y = 800;
        }
        page.drawText(piece, { x: 40, y, size, font: useBold ? bold : font });
        y -= size <= 8 ? 12 : 14;
      }
    };
    line('VAT WORKING PAPER', 16, true);
    line(paper.disclaimer, 8);
    line(`Taxpayer: ${paper.taxpayer.name}  TIN: ${paper.taxpayer.tin}  VAT: ${paper.taxpayer.vatNumber}`);
    line(`Period: ${paper.taxPeriod}  Registered: ${paper.vatRegistrationStatus}`);
    line(`Output VAT ${paper.outputVat == null ? 'not calculated' : paper.outputVat}  Input VAT ${paper.inputVat == null ? 'not calculated' : paper.inputVat}  Net ${paper.netVatPosition == null ? 'not calculated' : paper.netVatPosition}`, 11, true);
    for (const row of rows) {
      line(`${row.direction} ${row.treatment} net=${row.net} vat=${row.vat} ${row.transaction}`);
    }
    return { contentType: 'application/pdf', body: Buffer.from(await pdf.save()) };
  }
};

export default individualVatService;
