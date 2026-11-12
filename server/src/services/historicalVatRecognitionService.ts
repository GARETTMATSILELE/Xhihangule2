import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { VatRecord } from '../models/VatRecord';
import { TaxObligation } from '../models/TaxObligation';
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { ChartOfAccount } from '../models/ChartOfAccount';
import PropertyAccount from '../models/PropertyAccount';
import { HistoricalVatRecognition } from '../models/HistoricalVatRecognition';
import accountingService from './accountingService';
import { upsertPaymentTaxObligation } from './taxObligationService';
import { GL } from './tax/chartAccounts';
import { roundMoney } from '../utils/money';

const AMOUNT_TOLERANCE = 0.02;
const SEPTEMBER_BASIS_MIN = 20;

export type ProposedHistoricalVatReceipt = {
  reference: string;
  receiptDate: string;
  property: string;
  tenant: string;
  gross: number;
  levy: number;
  commissionPercent: number;
  commission: number;
  vatRate: number;
  vat: number;
  ownerAfterVat: number;
  periodClass: 'before_registration' | 'on_or_after_registration';
};

/**
 * Receipt-by-receipt schedule from the 11 November 2026 read-only investigation.
 * This is a review schedule. It does not load production and it does not post.
 */
export const PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE: ProposedHistoricalVatReceipt[] = [
  { reference: 'REF-1788854164778-25', receiptDate: '2026-09-08', property: '9 Gaynor Road, Highlands', tenant: 'Rudo Nyangulu', gross: 2000, levy: 0, commissionPercent: 15, commission: 300, vatRate: 0.155, vat: 46.5, ownerAfterVat: 1653.5, periodClass: 'before_registration' },
  { reference: 'REF-1789539226259-994', receiptDate: '2026-09-16', property: 'Wild Bloom Cafe, Lanark Road', tenant: 'Tinashe Innocent Muzembe', gross: 1150, levy: 0, commissionPercent: 10, commission: 115, vatRate: 0.155, vat: 17.83, ownerAfterVat: 1017.17, periodClass: 'before_registration' },
  { reference: 'REF-1789539297793-393', receiptDate: '2026-09-16', property: 'Unit 27, 39 Suffolk Road', tenant: 'Aleck Tinashe Chitongo', gross: 1100, levy: 100, commissionPercent: 10, commission: 100, vatRate: 0.155, vat: 15.5, ownerAfterVat: 984.5, periodClass: 'before_registration' },
  { reference: 'REF-1789632237050-371', receiptDate: '2026-09-17', property: "Gentleman's Barber, Lanark Road", tenant: 'Mike Pabvabango', gross: 1325, levy: 0, commissionPercent: 10, commission: 132.5, vatRate: 0.155, vat: 20.54, ownerAfterVat: 1171.96, periodClass: 'before_registration' },
  { reference: 'REF-1790842035381-92', receiptDate: '2026-10-01', property: 'Make up By Gamu, Lanark Road', tenant: 'Gamuchirai Melissa Manyika', gross: 600, levy: 0, commissionPercent: 10, commission: 60, vatRate: 0.155, vat: 9.3, ownerAfterVat: 530.7, periodClass: 'on_or_after_registration' },
  { reference: 'REF-1791193589540-657', receiptDate: '2026-10-05', property: 'Unit 21, 39 Suffolk Road', tenant: 'Gloria Ngwenya', gross: 1000, levy: 100, commissionPercent: 12.5, commission: 112.5, vatRate: 0.155, vat: 17.44, ownerAfterVat: 870.06, periodClass: 'on_or_after_registration' },
  { reference: 'REF-1791202790256-441', receiptDate: '2026-10-05', property: "Gentleman's Barber, Lanark Road", tenant: 'Mike Pabvabango', gross: 1325, levy: 0, commissionPercent: 10, commission: 132.5, vatRate: 0.155, vat: 20.54, ownerAfterVat: 1171.96, periodClass: 'on_or_after_registration' },
  { reference: 'REF-1791267902021-300', receiptDate: '2026-10-06', property: 'Unit 4, Suffolk 1', tenant: 'Farai Christopher Zimbango', gross: 1400, levy: 100, commissionPercent: 15, commission: 195, vatRate: 0.155, vat: 30.23, ownerAfterVat: 1174.77, periodClass: 'on_or_after_registration' },
  { reference: 'REF-1791379734572-423', receiptDate: '2026-10-07', property: '5 Harvey Brown Road, Milton Park', tenant: 'Happy Magadure', gross: 2000, levy: 0, commissionPercent: 15, commission: 300, vatRate: 0.155, vat: 46.5, ownerAfterVat: 1653.5, periodClass: 'on_or_after_registration' },
  { reference: 'REF-1791540222600-562', receiptDate: '2026-10-09', property: 'Unit 8, Suffolk 2', tenant: 'Nyasha Tadiwa Nhukarume', gross: 1200, levy: 100, commissionPercent: 15, commission: 165, vatRate: 0.155, vat: 25.58, ownerAfterVat: 1009.42, periodClass: 'on_or_after_registration' }
];

export function summariseProposedHistoricalVatSchedule() {
  const september = roundMoney(PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE.filter((row) => row.periodClass === 'before_registration').reduce((sum, row) => sum + row.vat, 0));
  const october = roundMoney(PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE.filter((row) => row.periodClass === 'on_or_after_registration').reduce((sum, row) => sum + row.vat, 0));
  return {
    count: PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE.length,
    september,
    october,
    total: roundMoney(september + october),
    physicalBookReference: 'required and not on file',
    septemberTaxTreatmentBasis: 'required and not on file',
    octoberVatCategoryAtInvestigation: 'blank',
    executed: false
  };
}

export type HistoricalVatScheduleRow = {
  paymentId: string;
  reference: string;
  property: string;
  tenant: string;
  receiptDate: string | null;
  rentalPeriod: string;
  gross: number;
  commissionPercent: number | null;
  commission: number;
  vatRate: number;
  vat: number;
  ownerAfterVat: number;
  vatRecordRate: number | null;
  vatRecordAmount: number | null;
  obligationAmount: number | null;
  receiptJournalPresent: boolean;
  vatPayableAmount: number;
  periodClass: 'before_registration' | 'on_or_after_registration';
  recognitionStatus: 'awaiting_recognition' | 'approved' | 'recognised' | 'review' | 'rejected' | 'existing_obligation';
  blockedReason: string;
  duplicateRecognitionBlocked: boolean;
};

function snapshotVat(details: any): number {
  return roundMoney(Number(details?.vatOnCommission ?? details?.vatAmount ?? 0));
}

function snapshotRate(details: any): number {
  const rate = details?.vatRate;
  return rate == null || rate === '' ? NaN : Number(rate);
}

function periodClassFor(paymentDate: Date, effective: Date | null): 'before_registration' | 'on_or_after_registration' {
  if (!effective || paymentDate.getTime() < effective.getTime()) return 'before_registration';
  return 'on_or_after_registration';
}

async function vatPayableCredits(companyId: string, paymentId: string, reference: string): Promise<{ amount: number; journalEntryId: string | null }> {
  const sourceIds = [paymentId, `historical-vat:${paymentId}`];
  const references = [`PAY-${reference}`, `HVAT-${reference}`].filter(Boolean);
  const journals = await JournalEntry.find({
    companyId,
    status: 'posted',
    $or: [
      { sourceId: { $in: sourceIds } },
      { reference: { $in: references } }
    ]
  }).select('_id').lean();
  if (!journals.length) return { amount: 0, journalEntryId: null };
  const lines = await JournalLine.find({ journalEntryId: { $in: journals.map((row) => row._id) } }).select('journalEntryId accountId credit').lean();
  const accounts = await ChartOfAccount.find({ _id: { $in: lines.map((line: any) => line.accountId) } }).select('code').lean();
  const codes = new Map(accounts.map((account: any) => [String(account._id), account.code]));
  let amount = 0;
  let journalEntryId: string | null = null;
  for (const line of lines as any[]) {
    if (codes.get(String(line.accountId)) === GL.VAT_PAYABLE && Number(line.credit) > 0) {
      amount = roundMoney(amount + Number(line.credit));
      journalEntryId = String(line.journalEntryId);
    }
  }
  return { amount, journalEntryId };
}

async function ownerIncomeTotal(paymentId: string): Promise<number> {
  const rows = await PropertyAccount.find({ 'transactions.paymentId': paymentId }).select('transactions').lean();
  let total = 0;
  for (const row of rows as any[]) {
    for (const tx of row.transactions || []) {
      if (String(tx.paymentId) === String(paymentId) && tx.type === 'income' && tx.status !== 'cancelled') {
        total += Number(tx.amount || 0);
      }
    }
  }
  return roundMoney(total);
}

function evidenceBlockers(input: {
  periodClass: 'before_registration' | 'on_or_after_registration';
  company: any;
  property: any;
  details: any;
  vat: number;
  rate: number;
  physicalBookReference: string;
  septemberTaxTreatmentApproved: boolean;
  taxTreatmentBasis: string;
  obligationAmount: number | null;
}): string | null {
  if (!(input.vat > 0)) return 'SNAPSHOT_VAT_ABSENT';
  if (!input.property?.vatOnCommission) return 'PROPERTY_VAT_ON_COMMISSION_DISABLED';
  const treatment = String(input.details?.vatTreatment || input.property?.vatCommissionTreatment || '').toLowerCase();
  if (treatment !== 'exclusive') return 'EXCLUSIVE_VAT_TREATMENT_REQUIRED';
  if (!Number.isFinite(input.rate) || input.rate <= 0) return 'STORED_VAT_RATE_REQUIRED';
  const commission = roundMoney(Number(input.details?.totalCommission ?? input.details?.commissionNet ?? 0));
  const calculated = roundMoney(commission * input.rate);
  if (Math.abs(calculated - input.vat) > AMOUNT_TOLERANCE) return 'VAT_AMOUNT_DISAGREES_WITH_STORED_CALCULATION';
  if (!input.physicalBookReference || input.physicalBookReference.trim().length < 3) return 'PHYSICAL_BOOK_REFERENCE_REQUIRED';
  if (input.obligationAmount != null && Math.abs(input.obligationAmount - input.vat) > AMOUNT_TOLERANCE) return 'VAT_OBLIGATION_AMOUNT_DISAGREES';
  if (input.periodClass === 'before_registration') {
    if (input.septemberTaxTreatmentApproved !== true) return 'SEPTEMBER_TAX_TREATMENT_APPROVAL_REQUIRED';
    if (input.taxTreatmentBasis.trim().length < SEPTEMBER_BASIS_MIN) return 'SEPTEMBER_TAX_TREATMENT_EVIDENCE_INSUFFICIENT';
    return null;
  }
  const profile = input.company?.taxProfile || {};
  if (profile.vatRegistered !== true) return 'COMPANY_NOT_VAT_REGISTERED';
  if (!profile.vatRegistrationEffectiveDate) return 'VAT_EFFECTIVE_DATE_REQUIRED';
  if (!String(profile.vatCategory || '').trim()) return 'OCTOBER_VAT_CONFIGURATION_INCOMPLETE';
  return null;
}

async function saveRecognition(payment: any, fields: Record<string, unknown>) {
  return HistoricalVatRecognition.findOneAndUpdate(
    { companyId: payment.companyId, paymentId: payment._id },
    { $set: fields, $setOnInsert: { companyId: payment.companyId, paymentId: payment._id } },
    { upsert: true, new: true }
  );
}

export async function buildHistoricalVatSchedule(companyId: string): Promise<{ rows: HistoricalVatScheduleRow[]; counts: Record<string, number>; totalVat: number }> {
  const company = await Company.findById(companyId).select('taxProfile').lean();
  const effective = (company as any)?.taxProfile?.vatRegistrationEffectiveDate
    ? new Date((company as any).taxProfile.vatRegistrationEffectiveDate)
    : null;
  const from = new Date('2026-09-01T00:00:00.000Z');
  const to = new Date('2026-11-01T00:00:00.000Z');
  const payments = await Payment.find({
    companyId,
    status: 'completed',
    paymentDate: { $gte: from, $lt: to },
    'commissionDetails.vatOnCommission': { $gt: 0.005 }
  }).select('referenceNumber paymentDate propertyId tenantId amount commissionDetails rentalPeriodMonth rentalPeriodYear').lean();

  const rows: HistoricalVatScheduleRow[] = [];
  for (const payment of payments as any[]) {
    const details = payment.commissionDetails || {};
    const vat = snapshotVat(details);
    const property = payment.propertyId ? await Property.findById(payment.propertyId).select('name').lean() : null;
    const tenant = payment.tenantId ? await Tenant.findById(payment.tenantId).select('firstName lastName name').lean() : null;
    const record = await VatRecord.findOne({ companyId, transactionId: String(payment._id) }).select('vatRate vatCollected').lean();
    const obligation = await TaxObligation.findOne({ companyId, paymentId: payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).select('taxAmount').lean();
    const recognition = await HistoricalVatRecognition.findOne({ companyId, paymentId: payment._id }).lean();
    const payable = await vatPayableCredits(companyId, String(payment._id), String(payment.referenceNumber || ''));
    const receiptJournal = await JournalEntry.findOne({ companyId, sourceModule: 'payment', sourceId: String(payment._id), status: 'posted' }).select('_id').lean();
    let recognitionStatus: HistoricalVatScheduleRow['recognitionStatus'] = 'awaiting_recognition';
    if (recognition?.status === 'recognised') recognitionStatus = 'recognised';
    else if (recognition?.status === 'approved') recognitionStatus = 'approved';
    else if (recognition?.status === 'rejected') recognitionStatus = 'rejected';
    else if (recognition?.status === 'review') recognitionStatus = 'review';
    else if (obligation) recognitionStatus = 'existing_obligation';
    const tenantName = (tenant as any)?.name || [((tenant as any)?.firstName || ''), ((tenant as any)?.lastName || '')].filter(Boolean).join(' ');
    rows.push({
      paymentId: String(payment._id),
      reference: String(payment.referenceNumber || ''),
      property: String((property as any)?.name || ''),
      tenant: tenantName,
      receiptDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString() : null,
      rentalPeriod: payment.rentalPeriodYear || payment.rentalPeriodMonth ? `${payment.rentalPeriodYear || '?'}-${payment.rentalPeriodMonth || '?'}` : '',
      gross: roundMoney(Number(payment.amount || 0)),
      commissionPercent: details.commissionRate == null && details.commissionPercentage == null ? null : Number(details.commissionPercentage ?? details.commissionRate),
      commission: roundMoney(Number(details.totalCommission ?? details.commissionNet ?? 0)),
      vatRate: snapshotRate(details),
      vat,
      ownerAfterVat: roundMoney(Number(details.ownerAmount || 0)),
      vatRecordRate: record ? Number((record as any).vatRate) : null,
      vatRecordAmount: record ? roundMoney(Number((record as any).vatCollected || 0)) : null,
      obligationAmount: obligation ? roundMoney(Number((obligation as any).taxAmount || 0)) : null,
      receiptJournalPresent: Boolean(receiptJournal),
      vatPayableAmount: payable.amount,
      periodClass: periodClassFor(new Date(payment.paymentDate), effective),
      recognitionStatus,
      blockedReason: String((recognition as any)?.blockedReason || ''),
      duplicateRecognitionBlocked: (recognition as any)?.status === 'recognised'
    });
  }
  const counts: Record<string, number> = {
    awaiting_recognition: 0,
    approved: 0,
    recognised: 0,
    review: 0,
    rejected: 0,
    existing_obligation: 0
  };
  for (const row of rows) counts[row.recognitionStatus] += 1;
  return {
    rows,
    counts,
    totalVat: roundMoney(rows.reduce((sum, row) => sum + row.vat, 0))
  };
}

export async function recogniseHistoricalVat(input: {
  companyId: string;
  paymentId: string;
  approvedBy: string;
  confirm: boolean;
  reason: string;
  physicalBookReference: string;
  septemberTaxTreatmentApproved?: boolean;
  taxTreatmentBasis?: string;
}): Promise<Record<string, unknown>> {
  if (input.confirm !== true) {
    return { ok: false, status: 'blocked', reason: 'EXPLICIT_CONFIRMATION_REQUIRED', journalCreated: false, obligationCreated: false };
  }
  const reason = String(input.reason || '').trim();
  if (reason.length < 10) {
    return { ok: false, status: 'blocked', reason: 'RECOGNITION_REASON_REQUIRED', journalCreated: false, obligationCreated: false };
  }
  const payment = await Payment.findOne({ _id: input.paymentId, companyId: input.companyId }).lean();
  if (!payment) return { ok: false, status: 'blocked', reason: 'PAYMENT_NOT_FOUND', journalCreated: false, obligationCreated: false };
  const existing = await HistoricalVatRecognition.findOne({ companyId: input.companyId, paymentId: payment._id }).lean();
  if (existing?.status === 'recognised') {
    return {
      ok: true,
      status: 'recognised',
      reason: 'DUPLICATE_RECOGNITION_PREVENTED',
      duplicatePrevented: true,
      recognitionAmount: Number(existing.recognitionAmount || 0),
      journalEntryId: existing.journalEntryId ? String(existing.journalEntryId) : null,
      taxObligationId: existing.taxObligationId ? String(existing.taxObligationId) : null,
      journalCreated: false,
      obligationCreated: false,
      snapshotPreserved: true,
      vatRecordPreserved: true,
      ownerIncomeUnchanged: true
    };
  }

  const company = await Company.findById(input.companyId).lean();
  const property = await Property.findById((payment as any).propertyId).lean();
  const details = (payment as any).commissionDetails || {};
  const snapshotBefore = JSON.stringify(details);
  const vat = snapshotVat(details);
  const rate = snapshotRate(details);
  const effective = (company as any)?.taxProfile?.vatRegistrationEffectiveDate
    ? new Date((company as any).taxProfile.vatRegistrationEffectiveDate)
    : null;
  const receiptDate = new Date((payment as any).paymentDate);
  const periodClass = periodClassFor(receiptDate, effective);
  const obligation = await TaxObligation.findOne({
    companyId: input.companyId,
    paymentId: payment._id,
    taxType: 'VAT_ON_COMMISSION',
    reversalOf: null
  }).select('taxAmount').lean();
  const blocker = evidenceBlockers({
    periodClass,
    company,
    property,
    details,
    vat,
    rate,
    physicalBookReference: String(input.physicalBookReference || ''),
    septemberTaxTreatmentApproved: input.septemberTaxTreatmentApproved === true,
    taxTreatmentBasis: String(input.taxTreatmentBasis || ''),
    obligationAmount: obligation ? roundMoney(Number((obligation as any).taxAmount || 0)) : null
  });
  const baseFields = {
    referenceNumber: String((payment as any).referenceNumber || ''),
    receiptDate,
    periodClass,
    snapshotVatAmount: vat,
    snapshotVatRate: Number.isFinite(rate) ? rate : 0,
    recognitionAmount: vat,
    physicalBookReference: String(input.physicalBookReference || '').trim(),
    taxTreatmentBasis: String(input.taxTreatmentBasis || '').trim(),
    septemberTaxTreatmentApproved: input.septemberTaxTreatmentApproved === true,
    recognitionReason: reason
  };
  if (blocker) {
    await saveRecognition(payment, { ...baseFields, status: 'review', blockedReason: blocker });
    return { ok: false, status: 'review', reason: blocker, journalCreated: false, obligationCreated: false, duplicatePrevented: false };
  }
  const approvalFields = {
    ...baseFields,
    approvedBy: new mongoose.Types.ObjectId(input.approvedBy),
    approvedAt: new Date()
  };

  const recordBefore = await VatRecord.findOne({ companyId: input.companyId, transactionId: String(payment._id) }).lean();
  const ownerBefore = await ownerIncomeTotal(String(payment._id));
  const payable = await vatPayableCredits(input.companyId, String(payment._id), String((payment as any).referenceNumber || ''));
  let journalEntryId = payable.journalEntryId;
  let journalCreated = false;
  if (Math.abs(payable.amount - vat) <= AMOUNT_TOLERANCE && payable.amount > 0) {
    journalCreated = false;
  } else if (payable.amount > 0) {
    await saveRecognition(payment, { ...baseFields, status: 'review', blockedReason: 'VAT_PAYABLE_ALREADY_POSTED_FOR_A_DIFFERENT_AMOUNT' });
    return { ok: false, status: 'review', reason: 'VAT_PAYABLE_ALREADY_POSTED_FOR_A_DIFFERENT_AMOUNT', journalCreated: false, obligationCreated: false };
  } else {
    try {
      const posted = await accountingService.postTransaction({
        companyId: input.companyId,
        reference: `HVAT-${(payment as any).referenceNumber}`,
        description: `Historical VAT recognition ${(payment as any).referenceNumber}. Amount already deducted from owner income. Physical book ${String(input.physicalBookReference).trim()}. No second owner deduction.`,
        sourceModule: 'tax',
        sourceId: `historical-vat:${payment._id}`,
        transactionDate: receiptDate,
        createdBy: input.approvedBy,
        lines: [
          { accountCode: GL.RETAINED_EARNINGS, debit: vat, credit: 0, propertyId: String((payment as any).propertyId || '') },
          { accountCode: GL.VAT_PAYABLE, debit: 0, credit: vat, propertyId: String((payment as any).propertyId || '') }
        ]
      });
      journalEntryId = posted.journalEntryId;
      journalCreated = true;
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code.startsWith('PERIOD_')) {
        await saveRecognition(payment, { ...approvalFields, status: 'approved', blockedReason: code });
        return { ok: false, status: 'approved', reason: code, journalCreated: false, obligationCreated: false };
      }
      throw error;
    }
  }

  const snapshotAfter = await Payment.findById(payment._id).select('commissionDetails').lean();
  const recordAfter = await VatRecord.findOne({ companyId: input.companyId, transactionId: String(payment._id) }).lean();
  const ownerAfter = await ownerIncomeTotal(String(payment._id));
  const snapshotPreserved = JSON.stringify((snapshotAfter as any)?.commissionDetails || {}) === snapshotBefore;
  const vatRecordPreserved = JSON.stringify(recordBefore || null) === JSON.stringify(recordAfter || null);
  const ownerIncomeUnchanged = ownerAfter === ownerBefore;
  if (!snapshotPreserved || !vatRecordPreserved || !ownerIncomeUnchanged) {
    await saveRecognition(payment, {
      ...baseFields,
      status: 'review',
      blockedReason: 'HISTORICAL_RECORD_CHANGED_DURING_RECOGNITION',
      journalEntryId: journalEntryId ? new mongoose.Types.ObjectId(journalEntryId) : undefined
    });
    return { ok: false, status: 'review', reason: 'HISTORICAL_RECORD_CHANGED_DURING_RECOGNITION', journalCreated, obligationCreated: false, snapshotPreserved, vatRecordPreserved, ownerIncomeUnchanged };
  }

  const obligationId = await upsertPaymentTaxObligation({
    companyId: input.companyId,
    taxType: 'VAT_ON_COMMISSION',
    paymentId: String(payment._id),
    propertyId: (payment as any).propertyId ? String((payment as any).propertyId) : undefined,
    taxPeriod: `${receiptDate.getUTCFullYear()}-${String(receiptDate.getUTCMonth() + 1).padStart(2, '0')}`,
    transactionDate: receiptDate,
    currency: (payment as any).currency || 'USD',
    taxableAmount: roundMoney(Number(details.totalCommission ?? details.commissionNet ?? 0)),
    taxRate: rate,
    taxAmount: vat,
    calculationBasis: 'HISTORICAL_VAT_RECOGNITION',
    calculationSnapshot: {
      physicalBookReference: String(input.physicalBookReference).trim(),
      approvedBy: input.approvedBy,
      periodClass,
      ownerIncomeDeductedAgain: false
    },
    status: 'PAYABLE',
    glAccount: GL.VAT_PAYABLE,
    sourceLedger: 'historical-vat-recognition',
    createdBy: input.approvedBy,
    journalEntryId: journalEntryId || undefined
  });
  const saved = await saveRecognition(payment, {
    ...approvalFields,
    status: 'recognised',
    blockedReason: '',
    recognisedAt: new Date(),
    journalEntryId: journalEntryId ? new mongoose.Types.ObjectId(journalEntryId) : undefined,
    taxObligationId: obligationId ? new mongoose.Types.ObjectId(obligationId) : undefined
  });
  return {
    ok: true,
    status: 'recognised',
    reason: 'RECOGNISED',
    duplicatePrevented: false,
    recognitionAmount: vat,
    journalEntryId,
    taxObligationId: obligationId,
    journalCreated,
    obligationCreated: Boolean(obligationId),
    snapshotPreserved,
    vatRecordPreserved,
    ownerIncomeUnchanged,
    recognitionId: saved?._id ? String(saved._id) : null
  };
}

export async function rejectHistoricalVat(input: {
  companyId: string;
  paymentId: string;
  rejectedBy: string;
  reason: string;
}): Promise<Record<string, unknown>> {
  const reason = String(input.reason || '').trim();
  if (reason.length < 10) return { ok: false, status: 'blocked', reason: 'REJECTION_REASON_REQUIRED' };
  const payment = await Payment.findOne({ _id: input.paymentId, companyId: input.companyId }).select('_id companyId referenceNumber paymentDate commissionDetails').lean();
  if (!payment) return { ok: false, status: 'blocked', reason: 'PAYMENT_NOT_FOUND' };
  const existing = await HistoricalVatRecognition.findOne({ companyId: input.companyId, paymentId: payment._id }).lean();
  if (existing?.status === 'recognised') {
    return { ok: false, status: 'recognised', reason: 'RECOGNISED_AMOUNT_IS_NOT_REJECTED_HERE', duplicatePrevented: true };
  }
  const company = await Company.findById(input.companyId).select('taxProfile.vatRegistrationEffectiveDate').lean();
  const effective = (company as any)?.taxProfile?.vatRegistrationEffectiveDate
    ? new Date((company as any).taxProfile.vatRegistrationEffectiveDate)
    : null;
  const details = (payment as any).commissionDetails || {};
  await saveRecognition(payment, {
    referenceNumber: String((payment as any).referenceNumber || ''),
    receiptDate: new Date((payment as any).paymentDate),
    periodClass: periodClassFor(new Date((payment as any).paymentDate), effective),
    snapshotVatAmount: snapshotVat(details),
    snapshotVatRate: Number.isFinite(snapshotRate(details)) ? snapshotRate(details) : 0,
    recognitionAmount: snapshotVat(details),
    status: 'rejected',
    recognitionReason: reason,
    blockedReason: 'REJECTED',
    rejectedBy: new mongoose.Types.ObjectId(input.rejectedBy),
    rejectedAt: new Date()
  });
  return { ok: true, status: 'rejected', reason: 'REJECTED', journalCreated: false, obligationCreated: false };
}
