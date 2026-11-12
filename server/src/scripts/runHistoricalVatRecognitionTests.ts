/**
 * Historical VAT recognition and Fairview confirmation. Local databases only.
 * This script does not connect to production and does not post the ten Benjamins receipts.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Payment } from '../models/Payment';
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { VatRecord } from '../models/VatRecord';
import { TaxObligation } from '../models/TaxObligation';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { AgentAccount } from '../models/AgentAccount';
import { CompanyAccount } from '../models/CompanyAccount';
import PropertyAccount from '../models/PropertyAccount';
import { accountingConnection } from '../config/database';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { openExplicitPeriodForDate } from '../services/accountingPeriodService';
import accountingService from '../services/accountingService';
import { classifyAccountingIntegrityRow } from '../services/accountingIntegrityClassification';
import {
  buildHistoricalVatSchedule,
  recogniseHistoricalVat,
  summariseProposedHistoricalVatSchedule
} from '../services/historicalVatRecognitionService';

const DB = 'mongodb://127.0.0.1:27017/mantis_historical_vat_recognition';
const ACCOUNTING_DB = 'mongodb://127.0.0.1:27017/mantis_historical_vat_recognition_accounting';
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

async function main() {
  if (/cosmos|azure|mantisafrica/i.test(`${DB} ${ACCOUNTING_DB}`)) {
    throw new Error('Refusing to run against a non-local database');
  }
  await mongoose.connect(DB);
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();

  const proposed = summariseProposedHistoricalVatSchedule();
  check(proposed.count === 10, 'the review schedule has ten receipts');
  check(proposed.september === 100.37, `September VAT is 100.37 (${proposed.september})`);
  check(proposed.october === 149.59, `October VAT is 149.59 (${proposed.october})`);
  check(proposed.total === 249.96, `reconciled VAT is 249.96 (${proposed.total})`);
  check(proposed.executed === false, 'the review schedule was not executed');

  const user = await User.create({
    email: 'historical-vat@example.test',
    password: 'Release-verify-local-1',
    firstName: 'Historical',
    lastName: 'Accountant',
    role: 'accountant',
    roles: ['accountant'],
    isActive: true,
    sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Historical VAT Company',
    address: '1 Test Street',
    phone: '0770000300',
    email: 'historical-vat-co@example.test',
    registrationNumber: 'HVAT-OK',
    tinNumber: 'HVAT-OK-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: {
      vatRegistered: true,
      vatNumber: 'ZW-HVAT',
      vatCategory: 'standard',
      vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
    }
  });
  const incomplete = await Company.create({
    name: 'Historical VAT Incomplete',
    address: '2 Test Street',
    phone: '0770000301',
    email: 'historical-vat-inc@example.test',
    registrationNumber: 'HVAT-INC',
    tinNumber: 'HVAT-INC-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: {
      vatRegistered: true,
      vatNumber: 'ZW-HVAT-INC',
      vatCategory: '',
      vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
    }
  });
  for (const row of [company, incomplete]) {
    await openExplicitPeriodForDate({ companyId: String(row._id), date: new Date('2026-09-08T00:00:00.000Z'), createdBy: String(user._id) });
    await openExplicitPeriodForDate({ companyId: String(row._id), date: new Date('2026-10-01T00:00:00.000Z'), createdBy: String(user._id) });
    await openExplicitPeriodForDate({ companyId: String(row._id), date: new Date('2026-10-05T00:00:00.000Z'), createdBy: String(user._id) });
  }
  const tenant = await Tenant.create({
    firstName: 'Historical', lastName: 'Tenant', email: 'historical-tenant@example.test', phone: '0770000302',
    companyId: company._id, ownerId: user._id, status: 'Active'
  });
  const property = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'October House', address: 'October Road',
    rentalType: 'management', type: 'house', rent: 2000, commission: 10, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
  });
  const incompleteProperty = await Property.create({
    companyId: incomplete._id, ownerId: user._id, name: 'Incomplete October', address: 'Incomplete Road',
    rentalType: 'management', type: 'house', rent: 600, commission: 10, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
  });

  async function makePayment(input: {
    companyId: any;
    propertyId: any;
    reference: string;
    date: string;
    month: number;
    amount: number;
    commission: number;
    vat: number;
    owner: number;
    ratePercent: number;
  }) {
    return Payment.create({
      companyId: input.companyId,
      propertyId: input.propertyId,
      tenantId: tenant._id,
      agentId: user._id,
      processedBy: user._id,
      propertyType: 'residential',
      amount: input.amount,
      rentAllocated: input.amount,
      depositAmount: 0,
      paymentType: 'rental',
      paymentMethod: 'bank_transfer',
      status: 'completed',
      paymentDate: new Date(`${input.date}T00:00:00.000Z`),
      rentalPeriodMonth: input.month,
      rentalPeriodYear: 2026,
      transactionDomain: 'RENTAL',
      commissionFinalized: true,
      accountingComplete: null,
      referenceNumber: input.reference,
      currency: 'USD',
      commissionDetails: {
        totalCommission: input.commission,
        commissionNet: input.commission,
        ownerAmount: input.owner,
        agentShare: 1,
        agencyShare: 1,
        preaFee: 1,
        vatOnCommission: input.vat,
        vatAmount: input.vat,
        vatRate: 0.155,
        commissionRate: input.ratePercent,
        vatTreatment: 'exclusive'
      },
      idempotencyKey: `historical-vat:${input.reference}`
    });
  }

  async function payableCredits(paymentId: string) {
    const journals = await JournalEntry.find({
      status: 'posted',
      $or: [{ sourceId: String(paymentId) }, { sourceId: `historical-vat:${paymentId}` }]
    }).select('_id sourceModule').lean();
    const lines = await JournalLine.find({ journalEntryId: { $in: journals.map((row) => row._id) } }).select('journalEntryId accountId credit debit').lean();
    const accounts = await ChartOfAccount.find({ _id: { $in: lines.map((line: any) => line.accountId) } }).select('code').lean();
    const codes = new Map(accounts.map((account: any) => [String(account._id), account.code]));
    return { journals, lines: (lines as any[]).map((line) => ({ ...line, code: codes.get(String(line.accountId)) })) };
  }

  const october = await makePayment({
    companyId: company._id, propertyId: property._id, reference: 'OCT-OK', date: '2026-10-01', month: 10,
    amount: 600, commission: 60, vat: 9.3, owner: 530.7, ratePercent: 10
  });
  await VatRecord.create({
    companyId: company._id, transactionId: String(october._id), sourceType: 'rental',
    vatCollected: 9.3, vatPaid: 0, vatRate: 0, filingPeriod: '2026-10', status: 'pending'
  });
  await PropertyAccount.create({
    propertyId: property._id,
    ledgerType: 'rental',
    transactions: [{
      type: 'income',
      amount: 530.7,
      date: october.paymentDate,
      paymentId: october._id,
      idempotencyKey: `payment:${october._id}`,
      description: 'Owner income already net of VAT',
      status: 'completed'
    }]
  });
  const octoberBefore = JSON.stringify((await Payment.findById(october._id).select('commissionDetails').lean() as any).commissionDetails);
  const recognised = await recogniseHistoricalVat({
    companyId: String(company._id),
    paymentId: String(october._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Recognise the VAT already deducted in the physical books.',
    physicalBookReference: 'PB-OCT-001'
  });
  const octoberAfter = await Payment.findById(october._id).select('commissionDetails').lean();
  const octoberRecord = await VatRecord.findOne({ transactionId: String(october._id) }).lean();
  const octoberOwner = await PropertyAccount.findOne({ propertyId: property._id }).lean();
  const octoberBooks = await payableCredits(String(october._id));
  const octoberObligation = await TaxObligation.find({ paymentId: october._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const octoberVatCredit = octoberBooks.lines.filter((line) => line.code === '2101' && Number(line.credit) > 0);
  const octoberOwnerDebit = octoberBooks.lines.filter((line) => line.code === '2103' && Number(line.debit) > 0);
  check(recognised.status === 'recognised' && Number(recognised.recognitionAmount) === 9.3, `1 October recognition posts 9.30 (${recognised.status} ${recognised.reason})`);
  check(JSON.stringify((octoberAfter as any).commissionDetails) === octoberBefore, '6 original payment snapshot remains unchanged');
  check(Number((octoberRecord as any).vatRate) === 0 && Number((octoberRecord as any).vatCollected) === 9.3, '7 existing zero-rate VAT record remains unchanged');
  check((octoberOwner as any).transactions.length === 1 && Number((octoberOwner as any).transactions[0].amount) === 530.7, '8 recognition does not deduct VAT from owner income again');
  check(octoberVatCredit.length === 1 && Number(octoberVatCredit[0].credit) === 9.3 && octoberOwnerDebit.length === 0, '9 VAT adjustment and VAT payable journal agree');
  check(octoberObligation.length === 1 && Number((octoberObligation[0] as any).taxAmount) === 9.3, '10 tax obligation agrees with the approved recognition');

  const repeated = await recogniseHistoricalVat({
    companyId: String(company._id),
    paymentId: String(october._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Recognise the VAT already deducted in the physical books.',
    physicalBookReference: 'PB-OCT-001'
  });
  const octoberJournalsAfterRepeat = await JournalEntry.find({ sourceId: `historical-vat:${october._id}` }).lean();
  const octoberObligationsAfterRepeat = await TaxObligation.countDocuments({ paymentId: october._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null });
  check(repeated.duplicatePrevented === true && octoberJournalsAfterRepeat.length === 1 && octoberObligationsAfterRepeat === 1, '11 duplicate recognition is prevented');
  check(repeated.status === 'recognised' && JSON.stringify((await Payment.findById(october._id).select('commissionDetails').lean() as any).commissionDetails) === octoberBefore, '12 repeated execution is idempotent');

  const september = await makePayment({
    companyId: company._id, propertyId: property._id, reference: 'SEP-OK', date: '2026-09-08', month: 9,
    amount: 2000, commission: 300, vat: 46.5, owner: 1653.5, ratePercent: 15
  });
  await VatRecord.create({
    companyId: company._id, transactionId: String(september._id), sourceType: 'rental',
    vatCollected: 46.5, vatPaid: 0, vatRate: 0, filingPeriod: '2026-09', status: 'pending'
  });
  const septemberResult = await recogniseHistoricalVat({
    companyId: String(company._id),
    paymentId: String(september._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Recognise September VAT already deducted in the physical books.',
    physicalBookReference: 'PB-SEP-001',
    septemberTaxTreatmentApproved: true,
    taxTreatmentBasis: 'The physical books treated this September receipt as VAT-registered exclusive commission VAT.'
  });
  const septemberObligation = await TaxObligation.findOne({ paymentId: september._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  check(septemberResult.status === 'recognised' && Number((septemberObligation as any)?.taxAmount) === 46.5, `2 September recognition with documented approval posts 46.50 (${septemberResult.reason})`);

  const septemberBlocked = await makePayment({
    companyId: company._id, propertyId: property._id, reference: 'SEP-NO', date: '2026-09-16', month: 9,
    amount: 1150, commission: 115, vat: 17.83, owner: 1017.17, ratePercent: 10
  });
  const noApproval = await recogniseHistoricalVat({
    companyId: String(company._id),
    paymentId: String(septemberBlocked._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Attempt September recognition without the tax-treatment approval.',
    physicalBookReference: 'PB-SEP-002'
  });
  check(noApproval.status === 'review' && noApproval.reason === 'SEPTEMBER_TAX_TREATMENT_APPROVAL_REQUIRED', `3 September recognition without approval is blocked (${noApproval.reason})`);
  check(await TaxObligation.countDocuments({ paymentId: septemberBlocked._id }) === 0 && await JournalEntry.countDocuments({ sourceId: `historical-vat:${septemberBlocked._id}` }) === 0, '3 no obligation or journal is created');

  const septemberEvidence = await makePayment({
    companyId: company._id, propertyId: property._id, reference: 'SEP-SHORT', date: '2026-09-16', month: 9,
    amount: 1100, commission: 100, vat: 15.5, owner: 984.5, ratePercent: 10
  });
  const shortBasis = await recogniseHistoricalVat({
    companyId: String(company._id),
    paymentId: String(septemberEvidence._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Attempt September recognition with a thin tax-treatment note.',
    physicalBookReference: 'PB-SEP-003',
    septemberTaxTreatmentApproved: true,
    taxTreatmentBasis: 'see file'
  });
  check(shortBasis.status === 'review' && shortBasis.reason === 'SEPTEMBER_TAX_TREATMENT_EVIDENCE_INSUFFICIENT', `4 September recognition without sufficient evidence is blocked (${shortBasis.reason})`);
  check(await TaxObligation.countDocuments({ paymentId: septemberEvidence._id }) === 0, '4 no unsupported obligation is created');

  const mismatch = await makePayment({
    companyId: company._id, propertyId: property._id, reference: 'OCT-MISMATCH', date: '2026-10-05', month: 10,
    amount: 600, commission: 60, vat: 20, owner: 520, ratePercent: 10
  });
  const mismatchResult = await recogniseHistoricalVat({
    companyId: String(company._id),
    paymentId: String(mismatch._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Attempt to recognise a VAT amount that disagrees with the stored calculation.',
    physicalBookReference: 'PB-OCT-MISMATCH',
    septemberTaxTreatmentApproved: true,
    taxTreatmentBasis: 'This approval must not override a failed amount check.'
  });
  check(mismatchResult.status === 'review' && mismatchResult.reason === 'VAT_AMOUNT_DISAGREES_WITH_STORED_CALCULATION', `5 a disagreeing VAT amount is blocked (${mismatchResult.reason})`);

  const withJournal = await makePayment({
    companyId: company._id, propertyId: property._id, reference: 'OCT-JOURNAL', date: '2026-10-05', month: 10,
    amount: 600, commission: 60, vat: 9.3, owner: 530.7, ratePercent: 10
  });
  await accountingService.postTransaction({
    companyId: String(company._id),
    reference: 'PAY-OCT-JOURNAL',
    description: 'Existing historical receipt journal',
    sourceModule: 'payment',
    sourceId: String(withJournal._id),
    transactionDate: withJournal.paymentDate,
    createdBy: String(user._id),
    lines: [
      { accountCode: '1003', debit: 600, credit: 0 },
      { accountCode: '4001', debit: 0, credit: 60 },
      { accountCode: '2103', debit: 0, credit: 540 }
    ]
  });
  await recogniseHistoricalVat({
    companyId: String(company._id),
    paymentId: String(withJournal._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Recognise VAT beside the existing receipt journal.',
    physicalBookReference: 'PB-OCT-JOURNAL'
  });
  const receiptJournals = await JournalEntry.countDocuments({ sourceModule: 'payment', sourceId: String(withJournal._id) });
  const recognitionJournals = await JournalEntry.countDocuments({ sourceModule: 'tax', sourceId: `historical-vat:${withJournal._id}` });
  check(receiptJournals === 1 && recognitionJournals === 1, `13 the existing receipt journal is not duplicated (${receiptJournals} receipt, ${recognitionJournals} recognition)`);

  const alreadyPosted = await makePayment({
    companyId: company._id, propertyId: property._id, reference: 'OCT-PAYABLE', date: '2026-10-05', month: 10,
    amount: 600, commission: 60, vat: 9.3, owner: 530.7, ratePercent: 10
  });
  await accountingService.postTransaction({
    companyId: String(company._id),
    reference: 'PAY-OCT-PAYABLE',
    description: 'Existing journal that already credits VAT payable',
    sourceModule: 'payment',
    sourceId: String(alreadyPosted._id),
    transactionDate: alreadyPosted.paymentDate,
    createdBy: String(user._id),
    lines: [
      { accountCode: '1003', debit: 600, credit: 0 },
      { accountCode: '4001', debit: 0, credit: 60 },
      { accountCode: '2101', debit: 0, credit: 9.3 },
      { accountCode: '2103', debit: 0, credit: 530.7 }
    ]
  });
  const linked = await recogniseHistoricalVat({
    companyId: String(company._id),
    paymentId: String(alreadyPosted._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Link the obligation to VAT payable that was already posted.',
    physicalBookReference: 'PB-OCT-PAYABLE'
  });
  const linkedBooks = await payableCredits(String(alreadyPosted._id));
  const linkedCredits = linkedBooks.lines.filter((line) => line.code === '2101').reduce((sum, line) => sum + Number(line.credit || 0), 0);
  check(linked.journalCreated === false && Math.round(linkedCredits * 100) === 930, `13 an existing VAT payable credit is not posted again (${linkedCredits})`);

  const incompletePayment = await makePayment({
    companyId: incomplete._id, propertyId: incompleteProperty._id, reference: 'OCT-INCOMPLETE', date: '2026-10-01', month: 10,
    amount: 600, commission: 60, vat: 9.3, owner: 530.7, ratePercent: 10
  });
  const incompleteResult = await recogniseHistoricalVat({
    companyId: String(incomplete._id),
    paymentId: String(incompletePayment._id),
    approvedBy: String(user._id),
    confirm: true,
    reason: 'Attempt October recognition before the VAT category is complete.',
    physicalBookReference: 'PB-OCT-INCOMPLETE'
  });
  check(incompleteResult.reason === 'OCTOBER_VAT_CONFIGURATION_INCOMPLETE' && await TaxObligation.countDocuments({ paymentId: incompletePayment._id }) === 0, `October recognition without VAT category is blocked (${incompleteResult.reason})`);

  const fairviewProperty = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'Fairview Close', address: 'Fairview Close',
    rentalType: 'introduction', type: 'commercial', rent: 800, commission: 100, vatOnCommission: false
  });
  const fairview = await Payment.create({
    companyId: company._id,
    propertyId: fairviewProperty._id,
    tenantId: tenant._id,
    agentId: user._id,
    processedBy: user._id,
    propertyType: 'commercial',
    amount: 800,
    rentAllocated: 800,
    depositAmount: 0,
    paymentType: 'rental',
    paymentMethod: 'bank_transfer',
    status: 'completed',
    paymentDate: new Date('2026-08-13T00:00:00.000Z'),
    rentalPeriodMonth: 8,
    rentalPeriodYear: 2026,
    transactionDomain: 'RENTAL',
    commissionFinalized: true,
    accountingComplete: null,
    referenceNumber: 'RCPT-DCDD37-2026-08',
    currency: 'USD',
    commissionDetails: {
      totalCommission: 800,
      commissionNet: 800,
      ownerAmount: 0,
      agentShare: 465.6,
      agencyShare: 310.4,
      preaFee: 24,
      vatOnCommission: 0,
      vatAmount: 0,
      vatRate: 0,
      commissionRate: 100,
      vatTreatment: 'exclusive'
    },
    idempotencyKey: 'historical-vat:fairview'
  });
  await AgentAccount.create({
    agentId: user._id,
    transactions: [{ type: 'commission', amount: 465.6, date: fairview.paymentDate, paymentId: fairview._id, description: 'Fairview introduction', status: 'completed' }]
  });
  await CompanyAccount.create({
    companyId: company._id,
    transactions: [{ type: 'income', source: 'rental_commission', amount: 310.4, date: fairview.paymentDate, paymentId: fairview._id, description: 'Fairview introduction' }]
  });
  const fairviewClass = classifyAccountingIntegrityRow({
    component: 'HISTORICAL_JOURNAL_GAP',
    payment: fairview.toObject(),
    propertyCommission: 100,
    rentalType: 'introduction',
    presence: { ownerIncome: false, agentCommission: true, companyCommission: true, journal: false }
  });
  check(fairviewClass.classification === 'HISTORICAL JOURNAL GAP' && fairviewClass.commercialArrangement === 'confirmed', `14 Fairview remains a confirmed 100 percent introduction (${fairviewClass.classification})`);
  check(fairviewClass.classification !== 'RATE REVIEW' && fairviewClass.explanation.includes('800.00') && fairviewClass.explanation.includes('465.60') && fairviewClass.explanation.includes('310.40'), '14 the saved commission, agent and company amounts stay visible');
  const fairviewAccounts = await PropertyAccount.find({ propertyId: fairviewProperty._id }).lean();
  check(fairviewAccounts.length === 0, '15 Fairview does not generate an owner-income record');
  check(fairviewClass.explanation.toLowerCase().includes('journal') && fairviewClass.classification !== 'COMPLETE', '16 the missing journal remains independently detectable');
  const schedule = await buildHistoricalVatSchedule(String(company._id));
  check(!schedule.rows.some((row) => row.reference === 'RCPT-DCDD37-2026-08'), '16 Fairview is not pulled into the VAT recognition schedule');
  const fairviewAfter = await Payment.findById(fairview._id).select('accountingComplete commissionDetails').lean();
  check((fairviewAfter as any).accountingComplete == null && Number((fairviewAfter as any).commissionDetails.ownerAmount) === 0, '16 viewing the classification does not mark the receipt accounting-complete');
  const agentAfter = await AgentAccount.findOne({ agentId: user._id }).lean();
  const companyAfter = await CompanyAccount.findOne({ companyId: company._id }).lean();
  const agentAmount = ((agentAfter as any)?.transactions || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const companyAmount = ((companyAfter as any)?.transactions || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  check(Math.round(agentAmount * 100) === 46560 && Math.round(companyAmount * 100) === 31040, `17 historical agent and company balances remain unchanged (${agentAmount} / ${companyAmount})`);

  const serviceSource = fs.readFileSync(path.join(__dirname, '../services/historicalVatRecognitionService.ts'), 'utf8');
  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/accountantRoutes.ts'), 'utf8');
  const agentRouteSource = fs.readFileSync(path.join(__dirname, '../routes/agentRoutes.ts'), 'utf8');
  check(!serviceSource.includes('repairPaymentAccounting') && !serviceSource.includes('postPaymentAccounting'), 'recognition does not use the ordinary repair path');
  check(routeSource.includes("'/historical-vat/:id/recognise', isAccountant"), 'recognition is restricted to an accountant');
  check(!agentRouteSource.includes('historical-vat'), 'recognition is not exposed as an agent action');

  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
    await mongoose.disconnect();
    await accountingConnection.close();
    process.exit(1);
  }
  console.log('Historical VAT recognition tests passed.');
  await mongoose.disconnect();
  await accountingConnection.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  try { await accountingConnection.close(); } catch { /* already closed */ }
  process.exit(1);
});
