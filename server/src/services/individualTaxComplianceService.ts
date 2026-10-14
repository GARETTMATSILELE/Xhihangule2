import mongoose from 'mongoose';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { IndividualTaxPack, IIndividualTaxPack } from '../models/IndividualTaxPack';
import { IndividualTaxEvidence } from '../models/IndividualTaxEvidence';
import { IndividualTaxComplianceReview } from '../models/IndividualTaxComplianceReview';
import { IndividualVatRecord } from '../models/IndividualVatRecord';
import { IndividualRentalTaxRecord } from '../models/IndividualRentalTaxRecord';
import { IndividualRentalTaxPayment } from '../models/IndividualRentalTaxPayment';
import { IndividualIncomeTaxRecord } from '../models/IndividualIncomeTaxRecord';
import { IndividualIncomeTaxAdjustment } from '../models/IndividualIncomeTaxAdjustment';
import { IndividualIncomeTaxPayment } from '../models/IndividualIncomeTaxPayment';
import { TransactionTaxSnapshot } from '../models/TransactionTaxSnapshot';
import { TaxPeriod } from '../models/TaxPeriod';
import { Property } from '../models/Property';
import { Company } from '../models/Company';
import PropertyAccount from '../models/PropertyAccount';
import File from '../models/File';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { AppError } from '../middleware/errorHandler';
import { roundMoney } from '../utils/money';
import { buildXlsxWorkbookSheets } from '../utils/xlsxWorkbook';
import { sumPropertyAccountPeriodPnl } from './propertyAccountTotals';
import individualTaxProfileService from './individualTaxProfileService';
import individualVatService from './individualVatService';
import individualRentalTaxService from './individualRentalTaxService';
import individualIncomeTaxService from './individualIncomeTaxService';
import { evaluateComplianceReadiness } from './individualTaxComplianceReadinessService';
import { sumCompleteTaxAmounts } from './tax/taxAmountAggregation';
import {
  COMPLIANCE_ISSUE_TYPES,
  EVIDENCE_DOCUMENT_TYPES,
  TAX_PACK_DISCLAIMER,
  type ComplianceIssueType,
  type EvidenceDocumentType
} from './tax/complianceTypes';

function asObjectId(value: string, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new mongoose.Types.ObjectId(value);
}

function yearRange(taxYear: number) {
  return { $gte: `${taxYear}-01`, $lte: `${taxYear}-12` };
}

function yearBounds(taxYear: number) {
  return {
    start: new Date(Date.UTC(taxYear, 0, 1)),
    end: new Date(Date.UTC(taxYear + 1, 0, 1))
  };
}

function sumStored(values: Array<number | null | undefined>): number | null {
  if (!values.length) return null;
  const present = values.filter((value) => value != null) as number[];
  if (!present.length) return null;
  return roundMoney(present.reduce((sum, value) => sum + Number(value || 0), 0));
}

function displayStatus(values: Array<{ calculationStatus?: string; taxAmount?: number | null; vatAmount?: number | null }>, amount: number | null): string {
  if (!values.length) return 'NOT_CALCULATED';
  if (values.every((row) => row.calculationStatus === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  if (values.some((row) => ['REVIEW_REQUIRED', 'PERIOD_REQUIRED', 'RULE_REQUIRED', 'PROFILE_REQUIRED'].includes(String(row.calculationStatus || '')))) {
    return 'REVIEW_REQUIRED';
  }
  if (amount == null) return 'NOT_CALCULATED';
  return 'CALCULATED';
}

async function writeAudit(companyId: string, eventType: string, sourceId: string, message: string, metadata: Record<string, unknown>) {
  const row = await AccountingEventLog.create({
    companyId: asObjectId(companyId),
    eventType,
    sourceModule: 'individual_tax_compliance',
    sourceId,
    success: true,
    message,
    metadata
  });
  return String(row._id);
}

function mapIssueType(reason: string, fallback: ComplianceIssueType): ComplianceIssueType {
  const code = String(reason || '').toUpperCase();
  if ((COMPLIANCE_ISSUE_TYPES as readonly string[]).includes(code)) return code as ComplianceIssueType;
  if (code.includes('PERIOD')) return 'MISSING_TAX_PERIOD';
  if (code.includes('RULE')) return 'MISSING_TAX_RULE';
  if (code.includes('CLASSIF') || code.includes('NOT_YET')) return 'MISSING_TAX_CLASSIFICATION';
  if (code.includes('DOCUMENT')) return 'MISSING_DOCUMENT';
  if (code.includes('AIDS')) return 'AIDS_LEVY_REVIEW';
  if (code.includes('CAPITAL')) return 'CAPITAL_ALLOWANCE_REVIEW';
  if (code.includes('CURRENCY')) return 'CURRENCY_CONVERSION_REQUIRED';
  if (code.includes('VAT')) return 'VAT_REVIEW';
  if (code.includes('RENTAL') || code.includes('PRESUMPTIVE')) return 'PRESUMPTIVE_RENTAL_REVIEW';
  return fallback;
}

function packToApi(row: IIndividualTaxPack | Record<string, unknown>) {
  const doc = row as any;
  return {
    id: String(doc._id),
    taxYear: doc.taxYear,
    status: doc.status,
    version: doc.version,
    generatedAt: doc.generatedAt,
    finalizedAt: doc.finalizedAt || null,
    supersedesPackId: doc.supersedesPackId ? String(doc.supersedesPackId) : null,
    supersedeReason: doc.supersedeReason || null,
    readinessStatus: doc.readinessStatus,
    disclaimer: doc.disclaimer,
    accountingSummary: doc.accountingSummary,
    vatSummary: doc.vatSummary,
    rentalTaxSummary: doc.rentalTaxSummary,
    incomeTaxSummary: doc.incomeTaxSummary,
    reviewSummary: doc.reviewSummary,
    evidenceSummary: doc.evidenceSummary,
    paymentSummary: doc.paymentSummary,
    taxRuleReferences: doc.taxRuleReferences || [],
    sourceProjectionReferences: doc.sourceProjectionReferences || []
  };
}

export const individualTaxComplianceService = {
  disclaimer: TAX_PACK_DISCLAIMER,

  async assembleYear(companyId: string, taxYear: number) {
    const startKey = `${taxYear}-01`;
    const endKey = `${taxYear}-12`;
    const bounds = yearBounds(taxYear);
    const companyQuery = { companyId: asObjectId(companyId) };
    const periodQuery = { ...companyQuery, taxPeriodKey: yearRange(taxYear) };

    const [
      owner,
      properties,
      snapshots,
      vatRows,
      rentalRows,
      rentalPayments,
      incomeRows,
      incomeAdjustments,
      incomePayments,
      periods,
      accounts,
      evidence,
      reviews
    ] = await Promise.all([
      individualTaxProfileService.getOwnerProfile(companyId),
      Property.find({ ...companyQuery, isDeleted: { $ne: true } })
        .select('name address propertyUseClass vatSupplyTreatment rentalTaxTreatment ownershipPercentage')
        .lean(),
      TransactionTaxSnapshot.find({ ...companyQuery, taxPeriodKey: yearRange(taxYear) })
        .select('sourceType sourceId sourceKind taxPeriodKey taxCalculationStatus periodAssignmentStatus reviewReasons propertyId taxRuleReferences rentalTaxRegime deductibility capitalOrRevenue taxTypesRelevant')
        .lean(),
      IndividualVatRecord.find(periodQuery).lean(),
      IndividualRentalTaxRecord.find(periodQuery).lean(),
      IndividualRentalTaxPayment.find({ ...periodQuery, status: 'POSTED' }).lean(),
      IndividualIncomeTaxRecord.find(periodQuery).lean(),
      IndividualIncomeTaxAdjustment.find(periodQuery).lean(),
      IndividualIncomeTaxPayment.find({ ...periodQuery, status: 'POSTED' }).lean(),
      TaxPeriod.find({ ...companyQuery, periodKey: yearRange(taxYear) }).select('taxType periodKey status').lean(),
      PropertyAccount.find(companyQuery).select('propertyId transactions').lean(),
      IndividualTaxEvidence.find({ ...companyQuery, taxYear }).lean(),
      IndividualTaxComplianceReview.find({ ...companyQuery, taxYear }).lean()
    ]);

    let rentalIncome = 0;
    let otherIncome = 0;
    let expenses = 0;
    for (const account of accounts) {
      const pnl = sumPropertyAccountPeriodPnl((account as any).transactions, bounds.start, bounds.end);
      rentalIncome += pnl.income;
      expenses += pnl.expenses;
    }
    const accounting = {
      rentalIncome: roundMoney(rentalIncome),
      otherIncome: roundMoney(otherIncome),
      expenses: roundMoney(expenses),
      netAccountingProfit: roundMoney(rentalIncome + otherIncome - expenses),
      lifetimeNotUsed: true,
      annualisedNotUsed: true
    };

    const vatOutput = sumCompleteTaxAmounts(
      vatRows.filter((row) => row.direction === 'OUTPUT'),
      (row) => row.vatAmount
    );
    const vatInput = sumCompleteTaxAmounts(
      vatRows.filter((row) => row.direction === 'INPUT'),
      (row) => row.recoverableVatAmount ?? row.vatAmount
    );
    const vatSummary = {
      outputVat: vatOutput,
      inputVat: vatInput,
      netVatPosition: vatOutput == null || vatInput == null ? null : roundMoney(Number(vatOutput) - Number(vatInput)),
      calculationStatus: displayStatus(vatRows, vatOutput),
      reviewItems: vatRows.filter((row) => row.calculationStatus === 'REVIEW_REQUIRED' || (row.reviewReasons || []).length).length,
      vatRegistered: Boolean(owner.vatRegistered),
      periodsIncomplete: periods.filter((row) => row.taxType === 'VAT' && row.status !== 'FINALIZED' && row.status !== 'LOCKED').length,
      incomeTaxAmount: null,
      presumptiveTaxAmount: null
    };

    const rentalTaxAmount = sumCompleteTaxAmounts(rentalRows, (row) => row.taxAmount);
    const rentalPaid = roundMoney(rentalPayments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const rentalSummary = {
      applicableRentalIncome: sumStored(rentalRows.map((row) => row.grossRentalAmount)),
      taxableRentalBase: sumStored(rentalRows.map((row) => row.taxableRentalBase)),
      taxRate: rentalRows.find((row) => row.taxRate != null)?.taxRate ?? null,
      taxRuleCode: rentalRows.find((row) => row.taxRuleCode)?.taxRuleCode || null,
      calculatedRentalTax: rentalTaxAmount,
      calculationStatus: displayStatus(rentalRows, rentalTaxAmount),
      paymentsRecorded: rentalPaid,
      unreconciledAmount: rentalTaxAmount == null ? null : roundMoney(Number(rentalTaxAmount) - rentalPaid),
      reviewItems: rentalRows.filter((row) => row.calculationStatus === 'REVIEW_REQUIRED' || (row.reviewReasons || []).length).length,
      incomeTaxAmount: null,
      vatAmount: null
    };

    const incomeTaxable = sumStored(incomeRows.filter((row) => row.recordKind !== 'REVERSAL').map((row) => row.taxableContribution));
    const incomeAnnual = await individualIncomeTaxService.annualSchedule(companyId, taxYear);
    const incomePaid = roundMoney(incomePayments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const currencies = Array.from(new Set(incomeRows.map((row) => String(row.transactionCurrency || row.currency || 'USD'))));
    const incomeSummary = {
      accountingProfit: accounting.netAccountingProfit,
      addBacks: sumStored(incomeRows.map((row) => row.addBacks)),
      approvedDeductions: sumStored(incomeAdjustments.filter((row) => row.status === 'APPROVED' && row.adjustmentType === 'DEDUCTION').map((row) => row.amount)),
      exemptIncome: sumStored(incomeRows.map((row) => row.exemptIncome)),
      presumptiveExclusion: sumStored(incomeRows.filter((row) => row.incomeTaxRegime === 'PRESUMPTIVE_RENTAL').map((row) => row.exemptIncome ?? row.accountingIncome)),
      otherAdjustments: sumStored(incomeAdjustments.filter((row) => row.status === 'APPROVED' && row.adjustmentType === 'OTHER').map((row) => row.amount)),
      taxableIncome: incomeAnnual.taxableIncome,
      calculatedIncomeTax: incomeAnnual.calculatedIncomeTax,
      taxRuleCode: incomeRows.find((row) => row.taxRuleCode)?.taxRuleCode || null,
      sourceReference: incomeRows.find((row) => row.sourceReference)?.sourceReference || null,
      paymentsRecorded: incomePaid,
      unreconciledAmount: incomeAnnual.unreconciledAmount,
      calculationStatus: incomeAnnual.calculatedIncomeTax == null ? (incomeRows.length ? 'REVIEW_REQUIRED' : 'NOT_CALCULATED') : 'CALCULATED',
      reviewItems: incomeAnnual.reviewItems,
      pendingAdjustments: incomeAdjustments.filter((row) => row.status === 'PENDING').length,
      currencies,
      vatAmount: null,
      presumptiveTaxAmount: null,
      lineTaxableContribution: incomeTaxable
    };

    const propertySummaries = properties.map((property) => {
      const id = String(property._id);
      const propertyIncomeRows = incomeRows.filter((row) => String(row.propertyId || '') === id);
      const propertyRentalRows = rentalRows.filter((row) => String(row.propertyId || '') === id);
      const snapshotsForProperty = snapshots.filter((row) => String(row.propertyId || '') === id);
      const account = accounts.find((row) => String((row as any).propertyId || '') === id);
      const pnl = sumPropertyAccountPeriodPnl((account as any)?.transactions, bounds.start, bounds.end);
      const ownership = Number((property as any).ownershipPercentage ?? 100);
      const regimes = Array.from(new Set(snapshotsForProperty.map((row) => String(row.rentalTaxRegime || '')).filter(Boolean)));
      return {
        propertyId: id,
        name: (property as any).name || '',
        address: (property as any).address || '',
        useClass: (property as any).propertyUseClass || null,
        ownershipPercentage: ownership,
        rentalRegime: regimes.length === 1 ? regimes[0] : regimes.length ? 'MIXED_SNAPSHOTS' : (property as any).rentalTaxTreatment || 'ACCOUNTANT_REVIEW',
        vatTreatment: (property as any).vatSupplyTreatment || null,
        grossRentalIncome: pnl.income,
        expenses: pnl.expenses,
        accountingProfit: pnl.net,
        ownerShareIncome: ownership === 100 ? pnl.income : null,
        taxTreatment: regimes[0] || (property as any).rentalTaxTreatment || 'ACCOUNTANT_REVIEW',
        reviewStatus:
          (ownership > 0 && ownership < 100) ||
          snapshotsForProperty.some((row) => row.taxCalculationStatus === 'REVIEW_REQUIRED')
            ? 'REVIEW_REQUIRED'
            : 'CALCULATED',
        inferredFromPropertyType: false,
        rentalTaxProjection: sumCompleteTaxAmounts(propertyRentalRows, (row) => row.taxAmount),
        incomeTaxLines: propertyIncomeRows.length
      };
    });

    const rentalIncomeRows = snapshots
      .filter((row) => row.sourceKind === 'PAYMENT_RENT' || row.sourceKind === 'OTHER_INCOME' || row.sourceKind === 'PAYMENT_DEPOSIT')
      .map((row) => ({
        sourceId: String(row.sourceId),
        sourceType: row.sourceType,
        sourceKind: row.sourceKind,
        propertyId: row.propertyId ? String(row.propertyId) : null,
        taxPeriodKey: row.taxPeriodKey,
        classification: row.sourceKind === 'PAYMENT_DEPOSIT' ? 'DEPOSIT_NOT_INCOME' : row.taxCalculationStatus,
        taxStatus: row.sourceKind === 'PAYMENT_DEPOSIT' ? 'NOT_APPLICABLE' : row.taxCalculationStatus
      }));

    const expenseRows = incomeRows
      .filter((row) => row.accountingExpenses != null)
      .map((row) => ({
        sourceId: String(row.sourceId),
        category: row.classification,
        accountingAmount: row.accountingExpenses,
        taxClassification: row.classification,
        deductibleAmount: row.deductions,
        nonDeductibleAmount: row.addBacks,
        capitalAmount: row.capitalAdjustments,
        reviewAmount: row.classification === 'REVIEW_REQUIRED' ? row.accountingExpenses : null,
        supportingDocumentStatus: row.supportingDocumentStatus
      }));

    const payments = [
      ...rentalPayments.map((row) => ({
        id: String(row._id),
        taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
        taxPeriodKey: row.taxPeriodKey,
        amount: row.amount,
        currency: row.currency,
        paymentDate: row.paymentDate,
        reference: row.paymentReference || null,
        status: row.status,
        recordedByLandlord: true,
        zimraConfirmed: false
      })),
      ...incomePayments.map((row) => ({
        id: String(row._id),
        taxType: 'INCOME_TAX',
        taxPeriodKey: row.taxPeriodKey,
        amount: row.amount,
        currency: row.currency,
        paymentDate: row.paymentDate,
        reference: row.paymentReference || null,
        status: row.status,
        recordedByLandlord: true,
        zimraConfirmed: false
      }))
    ];

    const missingDocs = incomeRows.filter((row) => row.supportingDocumentStatus === 'MISSING').length;
    const unclassified = snapshots.filter(
      (row) =>
        ['PAYMENT_RENT', 'OTHER_INCOME', 'EXPENSE', 'MAINTENANCE', 'CAPITAL'].includes(String(row.sourceKind)) &&
        (!incomeRows.some((line) => String(line.sourceId) === String(row.sourceId) && line.sourceType === row.sourceType) &&
          !vatRows.some((line) => String(line.sourceId) === String(row.sourceId)) &&
          !rentalRows.some((line) => String(line.sourceId) === String(row.sourceId)))
    );
    const periodRequired = snapshots.filter((row) => row.periodAssignmentStatus === 'PERIOD_REQUIRED').length;
    const missingRules = snapshots.filter((row) => (row.reviewReasons || []).includes('TAX_RULE_UNAVAILABLE') || (row.taxRuleReferences || []).some((ref) => !ref.ruleId && ref.taxCalculationStatus === 'READY_FOR_CALCULATION')).length;

    return {
      taxYear,
      taxpayer: {
        name: owner.legalName || owner.tradingName,
        tin: owner.tin,
        vatRegistered: owner.vatRegistered,
        incomeTaxRegistered: owner.incomeTaxRegistered,
        rentalTaxRegime: owner.rentalTaxRegime,
        taxYearStartMonth: owner.taxYearStartMonth
      },
      accounting,
      vat: vatSummary,
      rentalTax: rentalSummary,
      incomeTax: incomeSummary,
      properties: propertySummaries,
      rentalIncome: rentalIncomeRows,
      expenses: expenseRows,
      adjustments: incomeAdjustments.map((row) => ({
        id: String(row._id),
        adjustmentType: row.adjustmentType,
        amount: row.amount,
        currency: row.currency,
        reason: row.reason,
        status: row.status,
        reviewStatus: row.reviewStatus,
        sourceTransactionIds: row.sourceTransactionIds || [],
        supportingDocumentIds: row.supportingDocumentIds || [],
        createdAt: row.createdAt,
        approvedAt: row.approvedAt || null
      })),
      payments,
      periods: periods.map((row) => ({ taxType: row.taxType, periodKey: row.periodKey, status: row.status })),
      evidence: evidence.map((row) => ({
        id: String(row._id),
        documentId: String(row.documentId),
        taxType: row.taxType,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        documentType: row.documentType,
        documentStatus: row.documentStatus,
        reviewStatus: row.reviewStatus,
        description: row.description
      })),
      reviews: reviews.map((row) => ({
        id: String(row._id),
        taxType: row.taxType,
        taxPeriodKey: row.taxPeriodKey,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        issueType: row.issueType,
        severity: row.severity,
        description: row.description,
        status: row.status
      })),
      snapshots: snapshots.length,
      diagnostics: {
        unclassified: unclassified.length,
        periodRequired,
        missingRules,
        missingDocuments: missingDocs,
        mixedCurrency: currencies.length > 1,
        closedPeriods: periods.filter((row) => row.status === 'FINALIZED' || row.status === 'LOCKED').length,
        ownershipUnclear: propertySummaries.some((row) => row.ownershipPercentage > 0 && row.ownershipPercentage < 100),
        unclassifiedIds: unclassified.map((row) => String(row.sourceId)),
        startKey,
        endKey
      },
      sourceProjectionReferences: [
        { taxType: 'VAT', count: vatRows.length },
        { taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX', count: rentalRows.length },
        { taxType: 'INCOME_TAX', count: incomeRows.length }
      ]
    };
  },

  async readiness(companyId: string, taxYear: number) {
    const year = await this.assembleYear(companyId, taxYear);
    const [vatReview, rentalReview, incomeReview, latestPack] = await Promise.all([
      individualVatService.reviewQueue(companyId),
      individualRentalTaxService.reviewQueue(companyId),
      individualIncomeTaxService.reviewQueue(companyId),
      IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear, status: 'FINALIZED' }).sort({ version: -1 }).lean()
    ]);
    const vatYearReview = vatReview.filter((row) => String(row.taxPeriodKey || '').startsWith(String(taxYear)));
    const rentalYearReview = rentalReview.filter((row) => String(row.taxPeriodKey || '').startsWith(String(taxYear)));
    const incomeYearReview = incomeReview.filter(
      (row) => String(row.taxPeriodKey || '').startsWith(String(taxYear)) || (row as { kind?: string }).kind === 'SNAPSHOT'
    );
    return evaluateComplianceReadiness({
      taxYear,
      packFinalized: Boolean(latestPack),
      hasAnyActivity: year.snapshots > 0 || year.accounting.netAccountingProfit !== 0,
      unclassifiedTransactions: year.diagnostics.unclassified,
      missingTaxRules: year.diagnostics.missingRules,
      missingTaxPeriods: year.diagnostics.periodRequired,
      incompleteTaxableIncome: year.incomeTax.calculationStatus !== 'CALCULATED' && year.incomeTax.calculationStatus !== 'NOT_CALCULATED' && year.incomeTax.calculationStatus !== 'NOT_APPLICABLE',
      unresolvedIncomeTaxReviews: incomeYearReview.filter((row) => (row.reasons || []).some((reason: string) => reason !== 'AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW' && reason !== 'NOT_YET_TAX_CLASSIFIED') && row.calculationStatus === 'REVIEW_REQUIRED').length,
      unresolvedRentalTaxReviews: rentalYearReview.length,
      unresolvedVatReviews: vatYearReview.length,
      missingDocuments: year.diagnostics.missingDocuments,
      unmatchedTaxPayments: year.payments.filter((row) => !row.reference).length,
      capitalAllowanceReviews: year.expenses.filter((row) => row.taxClassification === 'CAPITAL').length,
      aidsLevyReviews: 1,
      mixedCurrency: year.diagnostics.mixedCurrency,
      vatRegistered: year.taxpayer.vatRegistered,
      presumptiveApplicable: year.rentalTax.calculationStatus !== 'NOT_APPLICABLE' && year.rentalTax.calculatedRentalTax != null,
      incomeTaxPaymentRecorded: year.incomeTax.paymentsRecorded > 0,
      rentalTaxPaymentRecorded: year.rentalTax.paymentsRecorded > 0,
      ownershipUnclear: year.diagnostics.ownershipUnclear,
      closedPeriods: year.diagnostics.closedPeriods,
      pendingAdjustments: year.incomeTax.pendingAdjustments
    });
  },

  async overview(companyId: string, taxYear: number) {
    const [year, readiness] = await Promise.all([this.assembleYear(companyId, taxYear), this.readiness(companyId, taxYear)]);
    return {
      disclaimer: TAX_PACK_DISCLAIMER,
      taxYear,
      status: readiness.status,
      taxpayer: year.taxpayer,
      accounting: year.accounting,
      vat: year.vat,
      rentalTax: year.rentalTax,
      incomeTax: year.incomeTax,
      properties: year.properties,
      payments: year.payments,
      adjustments: year.adjustments,
      rentalIncome: year.rentalIncome,
      expenses: year.expenses,
      compliance: {
        unclassifiedTransactions: readiness.metrics.unclassifiedTransactions,
        missingDocuments: readiness.metrics.missingDocuments,
        openReviews: readiness.metrics.openReviews,
        closedPeriods: readiness.metrics.closedPeriods,
        incompleteCalculations: readiness.metrics.incompleteCalculations
      },
      readiness,
      generatedAt: new Date().toISOString()
    };
  },

  async checklist(companyId: string, taxYear: number) {
    const [year, readiness, owner, properties] = await Promise.all([
      this.assembleYear(companyId, taxYear),
      this.readiness(companyId, taxYear),
      individualTaxProfileService.getOwnerProfile(companyId),
      Property.find({ companyId: asObjectId(companyId), isDeleted: { $ne: true } }).select('propertyUseClass rentalTaxTreatment').lean()
    ]);
    const items = [
      { key: 'profile', label: 'Tax profile completed', done: Boolean(owner.tin || owner.rentalTaxRegime !== 'ACCOUNTANT_REVIEW' || owner.vatRegistered || owner.incomeTaxRegistered), href: '/settings' },
      { key: 'properties', label: 'Properties classified', done: properties.every((row) => Boolean((row as any).propertyUseClass)), href: '/properties' },
      { key: 'periods', label: 'Tax periods present', done: !readiness.blockers.some((row) => row.issueType === 'MISSING_TAX_PERIOD'), href: '/settings' },
      { key: 'accounting', label: 'Accounting reconciled', done: year.accounting.lifetimeNotUsed, href: '/accounting' },
      { key: 'classified', label: 'Tax transactions classified', done: readiness.metrics.unclassifiedTransactions === 0, href: '/tax/compliance' },
      { key: 'vat', label: 'VAT reviewed', done: readiness.metrics.vatReviewItems === 0, href: '/tax/vat' },
      { key: 'rental', label: 'Rental tax reviewed', done: readiness.metrics.rentalTaxReviewItems === 0, href: '/tax/rental' },
      { key: 'income', label: 'Income tax working paper reviewed', done: readiness.metrics.incomeTaxReviewItems === 0, href: '/tax/income' },
      { key: 'adjustments', label: 'Adjustments approved', done: year.incomeTax.pendingAdjustments === 0, href: '/tax/income' },
      { key: 'payments', label: 'Tax payments recorded', done: year.payments.length > 0, href: '/tax/compliance' },
      { key: 'documents', label: 'Supporting documents attached', done: readiness.metrics.missingDocuments === 0, href: '/files' },
      { key: 'reviews', label: 'Review issues resolved', done: readiness.blockers.length === 0, href: '/tax/compliance' }
    ];
    return { taxYear, status: readiness.status, items };
  },

  async syncReviews(companyId: string, taxYear: number, userId?: string) {
    const [vatReview, rentalReview, incomeReview, year] = await Promise.all([
      individualVatService.reviewQueue(companyId),
      individualRentalTaxService.reviewQueue(companyId),
      individualIncomeTaxService.reviewQueue(companyId),
      this.assembleYear(companyId, taxYear)
    ]);
    const incoming: Array<{ taxType: string; sourceType: string; sourceId: string; taxPeriodKey?: string | null; issueType: ComplianceIssueType; severity: 'BLOCKER' | 'WARNING' | 'INFORMATION'; description: string }> = [];
    for (const row of vatReview.filter((item) => String(item.taxPeriodKey || '').startsWith(String(taxYear)))) {
      incoming.push({
        taxType: 'VAT',
        sourceType: String(row.sourceType),
        sourceId: String(row.sourceId),
        taxPeriodKey: row.taxPeriodKey,
        issueType: 'VAT_REVIEW',
        severity: 'BLOCKER',
        description: (row.reasons || []).join(', ') || 'VAT review required'
      });
    }
    for (const row of rentalReview.filter((item) => String(item.taxPeriodKey || '').startsWith(String(taxYear)))) {
      incoming.push({
        taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
        sourceType: String(row.sourceType),
        sourceId: String(row.sourceId),
        taxPeriodKey: row.taxPeriodKey,
        issueType: 'PRESUMPTIVE_RENTAL_REVIEW',
        severity: 'BLOCKER',
        description: (row.reasons || []).join(', ') || 'Rental tax review required'
      });
    }
    for (const row of incomeReview.filter(
      (item) => String(item.taxPeriodKey || '').startsWith(String(taxYear)) || (item as { kind?: string }).kind === 'SNAPSHOT'
    )) {
      const reasons = row.reasons || [];
      incoming.push({
        taxType: 'INCOME_TAX',
        sourceType: String(row.sourceType),
        sourceId: String(row.sourceId),
        taxPeriodKey: row.taxPeriodKey,
        issueType: mapIssueType(reasons[0], reasons.includes('NOT_YET_TAX_CLASSIFIED') ? 'NOT_YET_TAX_CLASSIFIED' : 'INCOME_TAX_REVIEW'),
        severity: reasons.includes('AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW') || reasons.includes('MISSING_SUPPORTING_DOCUMENT') ? 'WARNING' : 'BLOCKER',
        description: reasons.join(', ') || 'Income tax review required'
      });
    }
    for (const id of year.diagnostics.unclassifiedIds) {
      incoming.push({
        taxType: 'INCOME_TAX',
        sourceType: 'Snapshot',
        sourceId: id,
        issueType: 'NOT_YET_TAX_CLASSIFIED',
        severity: 'BLOCKER',
        description: 'Transaction is not yet tax-classified'
      });
    }
    for (const item of incoming) {
      const existing = await IndividualTaxComplianceReview.findOne({
        companyId: asObjectId(companyId),
        taxYear,
        taxType: item.taxType,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        issueType: item.issueType
      });
      if (existing) continue;
      await IndividualTaxComplianceReview.create({
        companyId: asObjectId(companyId),
        taxYear,
        taxPeriodKey: item.taxPeriodKey || null,
        taxType: item.taxType,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        issueType: item.issueType,
        severity: item.severity,
        description: item.description,
        status: 'OPEN',
        createdBy: userId && mongoose.Types.ObjectId.isValid(userId) ? asObjectId(userId) : null
      });
      await writeAudit(companyId, 'TAX_COMPLIANCE_REVIEW_CREATED', item.sourceId, item.description, { taxYear, issueType: item.issueType });
    }
    const rows = await IndividualTaxComplianceReview.find({ companyId: asObjectId(companyId), taxYear }).sort({ createdAt: -1 }).lean();
    return rows.map((row) => ({
      id: String(row._id),
      taxYear: row.taxYear,
      taxType: row.taxType,
      taxPeriod: row.taxPeriodKey,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      issueType: row.issueType,
      severity: row.severity,
      description: row.description,
      status: row.status,
      decision: row.decision || null,
      comment: row.comment || null,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt || null
    }));
  },

  async startReview(companyId: string, reviewId: string, userId: string) {
    const row = await IndividualTaxComplianceReview.findOne({ _id: asObjectId(reviewId), companyId: asObjectId(companyId) });
    if (!row) throw new AppError('Review not found', 404);
    if (row.status === 'RESOLVED' || row.status === 'WAIVED') return row;
    row.status = 'IN_REVIEW';
    row.assignedTo = asObjectId(userId);
    await row.save();
    return row;
  },

  async listEvidence(companyId: string, taxYear: number) {
    const year = await this.assembleYear(companyId, taxYear);
    return year.evidence;
  },

  async listYears(companyId: string) {
    const current = new Date().getUTCFullYear();
    const periods = await TaxPeriod.find({ companyId: asObjectId(companyId) }).select('periodKey').lean();
    const years = new Set<number>([current, current - 1]);
    for (const period of periods) {
      const year = Number(String(period.periodKey || '').slice(0, 4));
      if (year) years.add(year);
    }
    return [...years].sort((a, b) => b - a);
  },

  async resolveReview(companyId: string, reviewId: string, userId: string, input: { decision?: string; comment?: string; evidenceId?: string }) {
    const row = await IndividualTaxComplianceReview.findOne({ _id: asObjectId(reviewId), companyId: asObjectId(companyId) });
    if (!row) throw new AppError('Review not found', 404);
    if (row.status === 'RESOLVED' || row.status === 'WAIVED') return row;
    row.status = 'RESOLVED';
    row.decision = input.decision || 'RESOLVED';
    row.comment = input.comment || null;
    if (input.evidenceId) {
      const evidence = await IndividualTaxEvidence.findOne({
        _id: asObjectId(input.evidenceId),
        companyId: asObjectId(companyId)
      });
      if (!evidence) throw new AppError('Evidence not found', 404);
      const file = await File.findOne({ _id: evidence.documentId, companyId: asObjectId(companyId) }).select('_id');
      if (!file) throw new AppError('Document not found', 404);
      row.evidenceId = evidence._id;
    }
    row.resolvedBy = asObjectId(userId);
    row.resolvedAt = new Date();
    await row.save();
    await writeAudit(companyId, 'TAX_COMPLIANCE_REVIEW_RESOLVED', reviewId, 'Compliance review resolved without mutating the source transaction', {
      decision: row.decision,
      sourceId: row.sourceId
    });
    return row;
  },

  async waiveReview(companyId: string, reviewId: string, userId: string, reason?: string) {
    if (!String(reason || '').trim()) throw new AppError('A waiver requires a reason', 400);
    const row = await IndividualTaxComplianceReview.findOne({ _id: asObjectId(reviewId), companyId: asObjectId(companyId) });
    if (!row) throw new AppError('Review not found', 404);
    row.status = 'WAIVED';
    row.waiverReason = String(reason).trim();
    row.decision = 'WAIVED';
    row.resolvedBy = asObjectId(userId);
    row.resolvedAt = new Date();
    await row.save();
    await writeAudit(companyId, 'TAX_COMPLIANCE_REVIEW_WAIVED', reviewId, 'Compliance review waived', { reason: row.waiverReason, sourceId: row.sourceId });
    return row;
  },

  async attachEvidence(input: {
    companyId: string;
    userId: string;
    taxYear: number;
    taxType: string;
    sourceType: string;
    sourceId: string;
    documentId: string;
    documentType?: string;
    description?: string;
    taxPeriodKey?: string;
    propertyId?: string;
  }) {
    const file = await File.findOne({ _id: asObjectId(input.documentId), companyId: asObjectId(input.companyId) }).select('_id propertyId');
    if (!file) throw new AppError('Document not found', 404);
    if (input.propertyId) {
      const property = await Property.findOne({ _id: asObjectId(input.propertyId), companyId: asObjectId(input.companyId), isDeleted: { $ne: true } }).select('_id');
      if (!property) throw new AppError('Property not found', 404);
    }
    const documentType = (EVIDENCE_DOCUMENT_TYPES as readonly string[]).includes(String(input.documentType || ''))
      ? (input.documentType as EvidenceDocumentType)
      : 'OTHER';
    try {
      const created = await IndividualTaxEvidence.create({
        companyId: asObjectId(input.companyId),
        taxYear: input.taxYear,
        taxPeriodKey: input.taxPeriodKey || null,
        taxType: input.taxType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        documentId: file._id,
        documentType,
        documentStatus: 'UPLOADED',
        description: input.description || null,
        uploadedBy: asObjectId(input.userId),
        uploadedAt: new Date(),
        reviewStatus: 'REQUIRES_REVIEW'
      });
      const auditId = await writeAudit(input.companyId, 'TAX_EVIDENCE_ATTACHED', input.sourceId, 'Evidence linked to existing document', {
        documentId: String(file._id),
        taxYear: input.taxYear,
        copiedFile: false
      });
      created.auditEventId = auditId;
      await created.save();
      return created;
    } catch (error: any) {
      if (error?.code === 11000) {
        return IndividualTaxEvidence.findOne({
          companyId: asObjectId(input.companyId),
          documentId: file._id,
          sourceId: input.sourceId
        });
      }
      throw error;
    }
  },

  async reviewEvidence(companyId: string, evidenceId: string, userId: string, status: 'REVIEWED' | 'ACCEPTED' | 'REQUIRES_REVIEW') {
    const row = await IndividualTaxEvidence.findOne({ _id: asObjectId(evidenceId), companyId: asObjectId(companyId) });
    if (!row) throw new AppError('Evidence not found', 404);
    row.documentStatus = status === 'ACCEPTED' ? 'ACCEPTED' : status === 'REVIEWED' ? 'REVIEWED' : 'REQUIRES_REVIEW';
    row.reviewStatus = status;
    row.reviewedBy = asObjectId(userId);
    row.reviewedAt = new Date();
    await row.save();
    await writeAudit(companyId, 'TAX_EVIDENCE_REVIEWED', evidenceId, 'Evidence review updated', { status });
    return row;
  },

  async reconciliation(companyId: string, taxYear: number) {
    const year = await this.assembleYear(companyId, taxYear);
    return {
      disclaimer: TAX_PACK_DISCLAIMER,
      taxYear,
      vat: {
        label: 'VAT projection',
        calculated: year.vat.netVatPosition,
        recordedPayments: null,
        paymentStatus: 'NOT_RECORDED',
        unreconciled: null,
        status: year.vat.calculationStatus
      },
      rentalTax: {
        label: 'Presumptive rental tax projection',
        calculated: year.rentalTax.calculatedRentalTax,
        recordedPayments: year.rentalTax.paymentsRecorded,
        unreconciled: year.rentalTax.unreconciledAmount,
        status: year.rentalTax.calculationStatus
      },
      incomeTax: {
        label: 'Ordinary income-tax projection',
        calculated: year.incomeTax.calculatedIncomeTax,
        recordedPayments: year.incomeTax.paymentsRecorded,
        unreconciled: year.incomeTax.unreconciledAmount,
        status: year.incomeTax.calculationStatus
      },
      combinedTotalTaxPayable: null,
      zimraBalance: null
    };
  },

  async generatePack(companyId: string, taxYear: number, userId: string, supersedeReason?: string) {
    const [year, readiness] = await Promise.all([this.assembleYear(companyId, taxYear), this.readiness(companyId, taxYear)]);
    const latest = await IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear }).sort({ version: -1 });
    if (latest?.status === 'GENERATED') {
      return packToApi(latest);
    }
    const version = latest ? Number(latest.version) + 1 : 1;
    try {
      const created = await IndividualTaxPack.create({
        companyId: asObjectId(companyId),
        taxYear,
        status: 'GENERATED',
        version,
        generatedAt: new Date(),
        generatedBy: asObjectId(userId),
        supersedesPackId: latest?._id || null,
        supersedeReason: supersedeReason || null,
        accountingSummary: year.accounting,
        vatSummary: year.vat,
        rentalTaxSummary: year.rentalTax,
        incomeTaxSummary: year.incomeTax,
        reviewSummary: { open: readiness.metrics.openReviews, blockers: readiness.blockers.length },
        evidenceSummary: { count: year.evidence.length, missing: year.diagnostics.missingDocuments },
        paymentSummary: { payments: year.payments },
        taxRuleReferences: [
          { taxType: 'VAT', from: 'IndividualVatRecord' },
          { taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX', from: 'IndividualRentalTaxRecord' },
          { taxType: 'INCOME_TAX', from: 'IndividualIncomeTaxRecord' }
        ],
        sourceProjectionReferences: year.sourceProjectionReferences,
        readinessStatus: readiness.status,
        disclaimer: TAX_PACK_DISCLAIMER
      });
      if (latest?.status === 'FINALIZED') {
        latest.status = 'SUPERSEDED';
        await latest.save();
        await writeAudit(companyId, 'TAX_PACK_SUPERSEDED', String(latest._id), 'Finalized pack superseded by a new version', {
          taxYear,
          previousVersion: latest.version
        });
      }
      await writeAudit(companyId, 'TAX_PACK_GENERATED', String(created._id), `Tax pack generated for ${taxYear}`, {
        version,
        readiness: readiness.status,
        duplicatedTaxEngine: false
      });
      return packToApi(created);
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear, version });
        if (existing) return packToApi(existing);
      }
      throw error;
    }
  },

  async finalizePack(companyId: string, taxYear: number, userId: string) {
    const readiness = await this.readiness(companyId, taxYear);
    if (readiness.blockers.length) {
      throw new AppError('Cannot finalise the tax pack while blockers remain', 409);
    }
    let row = await IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear, status: 'GENERATED' }).sort({ version: -1 });
    if (!row) {
      const generated = await this.generatePack(companyId, taxYear, userId);
      row = await IndividualTaxPack.findById(generated.id);
    }
    if (!row) throw new AppError('Tax pack not found', 404);
    if (row.status === 'FINALIZED') return packToApi(row);
    if (row.status !== 'GENERATED') throw new AppError('Only a generated pack can be finalised', 409);
    row.status = 'FINALIZED';
    row.finalizedAt = new Date();
    row.finalizedBy = asObjectId(userId);
    await row.save();
    await writeAudit(companyId, 'TAX_PACK_FINALIZED', String(row._id), `Tax pack ${taxYear} v${row.version} finalised`, {
      version: row.version,
      projectionsRewritten: false
    });
    return packToApi(row);
  },

  async getPack(companyId: string, taxYear: number) {
    const row = await IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear }).sort({ version: -1 }).lean();
    if (!row) return null;
    return packToApi(row);
  },

  async drillDown(companyId: string, sourceType: 'Payment' | 'LandlordFinancialTransaction', sourceId: string) {
    const { default: individualTaxMetadataService } = await import('./individualTaxMetadataService');
    const overlay = await individualTaxMetadataService.getForSource(companyId, sourceType, sourceId);
    const evidence = await IndividualTaxEvidence.find({
      companyId: asObjectId(companyId),
      sourceId
    }).lean();
    return {
      snapshot: overlay,
      vat: overlay?.vat || [],
      rentalTax: overlay?.rentalTax || [],
      incomeTax: overlay?.incomeTax || [],
      evidence: evidence.map((row) => ({
        id: String(row._id),
        documentId: String(row.documentId),
        documentType: row.documentType,
        documentStatus: row.documentStatus
      }))
    };
  },

  async exportPack(companyId: string, taxYear: number, format: string) {
    const year = await this.assembleYear(companyId, taxYear);
    const readiness = await this.readiness(companyId, taxYear);
    const cover = [
      { field: 'Report', value: 'Mantis Individual Landlord Tax Preparation Pack' },
      { field: 'Tax year', value: taxYear },
      { field: 'Generated', value: new Date().toISOString() },
      { field: 'Disclaimer', value: TAX_PACK_DISCLAIMER }
    ];
    const sheets = [
      { name: 'Cover', rows: cover },
      { name: 'Taxpayer', rows: [{ name: year.taxpayer.name, tin: year.taxpayer.tin, vatRegistered: year.taxpayer.vatRegistered, rentalTaxRegime: year.taxpayer.rentalTaxRegime }] },
      { name: 'Properties', rows: year.properties.length ? year.properties : [{ property: 'none' }] },
      { name: 'Rental Income', rows: year.rentalIncome.length ? year.rentalIncome : [{ note: 'none' }] },
      { name: 'Expenses', rows: year.expenses.length ? year.expenses : [{ note: 'none' }] },
      { name: 'VAT', rows: [{ outputVat: year.vat.outputVat, inputVat: year.vat.inputVat, net: year.vat.netVatPosition, status: year.vat.calculationStatus }] },
      { name: 'Rental Tax', rows: [{ calculated: year.rentalTax.calculatedRentalTax, payments: year.rentalTax.paymentsRecorded, unreconciled: year.rentalTax.unreconciledAmount, status: year.rentalTax.calculationStatus }] },
      { name: 'Income Tax', rows: [{ taxableIncome: year.incomeTax.taxableIncome, calculated: year.incomeTax.calculatedIncomeTax, payments: year.incomeTax.paymentsRecorded, unreconciled: year.incomeTax.unreconciledAmount, status: year.incomeTax.calculationStatus }] },
      { name: 'Adjustments', rows: year.adjustments.length ? year.adjustments : [{ note: 'none' }] },
      { name: 'Tax Payments', rows: year.payments.length ? year.payments : [{ note: 'none' }] },
      { name: 'Review Items', rows: [...readiness.blockers, ...readiness.warnings] },
      { name: 'Evidence Register', rows: year.evidence.length ? year.evidence : [{ note: 'none' }] },
      { name: 'Reconciliation', rows: [{ vat: year.vat.netVatPosition, rentalTax: year.rentalTax.calculatedRentalTax, incomeTax: year.incomeTax.calculatedIncomeTax, totalTaxPayable: null }] }
    ];
    if (format === 'csv') {
      const body = sheets
        .map((sheet) => {
          const rows = sheet.rows as Array<Record<string, unknown>>;
          const headers = Object.keys(rows[0] || { line: '' });
          return [`# ${sheet.name}`, headers.join(','), ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(','))].join('\n');
        })
        .join('\n\n');
      return { contentType: 'text/csv', body: `${body}\n\n${JSON.stringify(TAX_PACK_DISCLAIMER)}`, filename: `tax-pack-${taxYear}.csv` };
    }
    if (format === 'xlsx' || format === 'excel') {
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: buildXlsxWorkbookSheets(sheets),
        filename: `tax-pack-${taxYear}.xlsx`
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
      const maxChars = size <= 8 ? 108 : 92;
      for (const piece of wrap(text, maxChars)) {
        if (y < 40) {
          page = pdf.addPage([595, 842]);
          y = 800;
        }
        page.drawText(piece, { x: 40, y, size, font: useBold ? bold : font });
        y -= size <= 8 ? 12 : 14;
      }
    };
    line('Mantis Individual Landlord Tax Preparation Pack', 16, true);
    line(`Tax Year: ${taxYear}`, 12, true);
    line(TAX_PACK_DISCLAIMER, 8);
    line(`Taxpayer: ${year.taxpayer.name}  TIN: ${year.taxpayer.tin || '—'}`);
    line(`Readiness: ${readiness.status}`, 11, true);
    line('Accounting summary', 12, true);
    line(`Rental income ${year.accounting.rentalIncome}  Expenses ${year.accounting.expenses}  Net profit ${year.accounting.netAccountingProfit}`);
    line('VAT projection', 12, true);
    line(`Output ${year.vat.outputVat == null ? 'not calculated' : year.vat.outputVat}  Input ${year.vat.inputVat == null ? 'not calculated' : year.vat.inputVat}  Net ${year.vat.netVatPosition == null ? 'not calculated' : year.vat.netVatPosition}`);
    line('Presumptive rental tax projection', 12, true);
    line(`Calculated ${year.rentalTax.calculatedRentalTax == null ? 'not calculated' : year.rentalTax.calculatedRentalTax}  Payments ${year.rentalTax.paymentsRecorded}  Unreconciled ${year.rentalTax.unreconciledAmount == null ? '—' : year.rentalTax.unreconciledAmount}`);
    line('Ordinary income-tax projection', 12, true);
    line(`Taxable income ${year.incomeTax.taxableIncome == null ? 'not calculated' : year.incomeTax.taxableIncome}`);
    line(`Calculated ${year.incomeTax.calculatedIncomeTax == null ? 'not calculated' : year.incomeTax.calculatedIncomeTax}  Payments ${year.incomeTax.paymentsRecorded}`);
    line('These figures are not a combined tax payable and not a ZIMRA assessment.', 8);
    line('Properties', 12, true);
    for (const property of year.properties) {
      line(`${property.name} rent ${property.grossRentalIncome} exp ${property.expenses} ownership ${property.ownershipPercentage}% displayed, not used to scale tax`);
    }
    line('Adjustments', 12, true);
    if (!year.adjustments.length) line('No recorded income-tax adjustments.');
    for (const adj of year.adjustments) {
      line(`${adj.adjustmentType || 'ADJUSTMENT'} ${adj.amount} ${adj.currency || ''} ${adj.status || ''} ${adj.reason || ''}`.trim());
    }
    line('Recorded tax payments', 12, true);
    if (!year.payments.length) line('No landlord-recorded tax payments.');
    for (const pay of year.payments) {
      line(`${pay.taxType || 'TAX'} ${pay.amount} ${pay.currency || ''} ref ${pay.reference || '—'} ZIMRA ref ${pay.zimraConfirmed ? 'recorded' : 'not confirmed'}`);
    }
    line('Evidence status', 12, true);
    if (!year.evidence.length) line('No evidence linked for this year.');
    for (const item of year.evidence) {
      line(`${item.documentType || 'OTHER'} ${item.documentStatus || ''} source ${item.sourceType || ''} ${item.sourceId || ''}`);
    }
    line('Reviews', 12, true);
    for (const item of readiness.blockers) line(`Blocker: ${item.description}`, 8);
    for (const item of readiness.warnings) line(`Warning: ${item.description}`, 8);
    if (!readiness.blockers.length && !readiness.warnings.length) line('No open review items.');
    return { contentType: 'application/pdf', body: Buffer.from(await pdf.save()), filename: `tax-pack-${taxYear}.pdf` };
  }
};

export default individualTaxComplianceService;
