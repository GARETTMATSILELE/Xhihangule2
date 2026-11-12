/**
 * Historical VAT payable journal safeguard. Local databases only.
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
import { repairPaymentAccounting, ensurePaymentAccountingPosted } from '../services/paymentAccountingReconciliation';
import { getCompanyAccountingIntegritySummary } from '../services/paymentAccountingIntegrity';
import { assessVatPayableJournal } from '../services/vatPolicyService';

const DB = 'mongodb://127.0.0.1:27017/mantis_vat_journal_safeguard';
const ACCOUNTING_DB = 'mongodb://127.0.0.1:27017/mantis_vat_journal_safeguard_accounting';
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

  const user = await User.create({
    email: 'vat-journal-safeguard@example.test',
    password: 'Release-verify-local-1',
    firstName: 'VAT',
    lastName: 'Safeguard',
    role: 'accountant',
    roles: ['accountant'],
    isActive: true,
    sessionVersion: 1
  });
  const incomplete = await Company.create({
    name: 'Journal Safeguard Incomplete',
    address: '1 Test Street',
    phone: '0770000200',
    email: 'journal-incomplete@example.test',
    registrationNumber: 'JRN-INC',
    tinNumber: 'JRN-INC-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: {
      vatRegistered: true,
      vatNumber: 'ZW-INC',
      vatCategory: '',
      vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
    }
  });
  const complete = await Company.create({
    name: 'Journal Safeguard Complete',
    address: '2 Test Street',
    phone: '0770000201',
    email: 'journal-complete@example.test',
    registrationNumber: 'JRN-OK',
    tinNumber: 'JRN-OK-TIN',
    country: 'Zimbabwe',
    ownerId: user._id,
    taxProfile: {
      vatRegistered: true,
      vatNumber: 'ZW-OK',
      vatCategory: 'standard',
      vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
    }
  });
  for (const row of [incomplete, complete]) {
    await openExplicitPeriodForDate({ companyId: String(row._id), date: new Date('2026-11-03T00:00:00.000Z'), createdBy: String(user._id) });
  }
  const tenant = await Tenant.create({
    firstName: 'VAT', lastName: 'Tenant', email: 'vat-tenant@example.test', phone: '0770000202',
    companyId: complete._id, ownerId: user._id, status: 'Active'
  });
  const incompleteProperty = await Property.create({
    companyId: incomplete._id, ownerId: user._id, name: 'Incomplete VAT Property', address: 'Incomplete Road',
    rentalType: 'management', type: 'house', rent: 2000, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
  });
  const completeProperty = await Property.create({
    companyId: complete._id, ownerId: user._id, name: 'Complete VAT Property', address: 'Complete Road',
    rentalType: 'management', type: 'house', rent: 2000, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
  });

  async function makePayment(input: {
    company: any;
    property: any;
    reference: string;
    decision?: string;
    accountingComplete?: boolean | null;
  }) {
    return Payment.create({
      companyId: input.company._id,
      propertyId: input.property._id,
      tenantId: tenant._id,
      agentId: user._id,
      processedBy: user._id,
      propertyType: 'residential',
      amount: 2000,
      rentAllocated: 2000,
      depositAmount: 0,
      paymentType: 'rental',
      paymentMethod: 'bank_transfer',
      status: 'completed',
      paymentDate: new Date('2026-11-03T00:00:00.000Z'),
      rentalPeriodMonth: 11,
      rentalPeriodYear: 2026,
      transactionDomain: 'RENTAL',
      commissionFinalized: true,
      accountingComplete: input.accountingComplete === undefined ? null : input.accountingComplete,
      referenceNumber: input.reference,
      commissionDetails: {
        totalCommission: 300,
        commissionNet: 300,
        ownerAmount: 1653.5,
        agentShare: 174.6,
        agencyShare: 116.4,
        preaFee: 9,
        vatOnCommission: 46.5,
        vatAmount: 46.5,
        vatRate: 0.155,
        commissionRate: 15,
        vatTreatment: 'exclusive',
        ...(input.decision ? { vatDecision: { reason: input.decision } } : {})
      },
      idempotencyKey: `vat-journal:${input.reference}`
    });
  }

  async function vatCredits(paymentId: string) {
    const journals = await JournalEntry.find({ sourceId: String(paymentId), sourceModule: 'payment', status: 'posted' }).select('_id').lean();
    const lines = await JournalLine.find({ journalEntryId: { $in: journals.map((row) => row._id) } }).select('accountId credit debit').lean();
    const accounts = await ChartOfAccount.find({ _id: { $in: lines.map((line: any) => line.accountId) } }).select('code').lean();
    const codes = new Map(accounts.map((account: any) => [String(account._id), account.code]));
    return (lines as any[])
      .filter((line) => codes.get(String(line.accountId)) === '2101' && Number(line.credit) > 0)
      .map((line) => Number(line.credit));
  }

  const unsupported = await makePayment({ company: incomplete, property: incompleteProperty, reference: 'VAT-A' });
  await VatRecord.create({
    companyId: incomplete._id, transactionId: String(unsupported._id), sourceType: 'rental',
    vatCollected: 46.5, vatPaid: 0, vatRate: 0, filingPeriod: '2026-11', status: 'pending'
  });
  const blocked = await repairPaymentAccounting(String(unsupported._id), {
    dryRun: false,
    reason: 'Repair the missing receipt journal',
    userId: String(user._id)
  });
  const blockedRecord = await VatRecord.findOne({ transactionId: String(unsupported._id) }).lean();
  const blockedSnapshot = await Payment.findById(unsupported._id).select('commissionDetails accountingComplete').lean();
  const blockedOwner = await PropertyAccount.findOne({ 'transactions.idempotencyKey': `payment:${unsupported._id}` }).lean();
  const blockedAgent = await AgentAccount.findOne({ 'transactions.paymentId': unsupported._id }).lean();
  check((await vatCredits(String(unsupported._id))).length === 0, 'A no VAT payable journal line');
  check(await TaxObligation.countDocuments({ paymentId: unsupported._id }) === 0, 'A no VAT obligation');
  check(Number((blockedRecord as any).vatRate) === 0 && Number((blockedRecord as any).vatCollected) === 46.5, 'A VAT record was not rewritten');
  check(Number((blockedSnapshot as any).commissionDetails.vatOnCommission) === 46.5, 'A snapshot was not rewritten');
  check(Boolean(blocked.historicalVatReview), `A repair is classified for historical VAT review (${blocked.historicalVatReview || blocked.vatObligationSkipped})`);
  check(!blockedOwner && !blockedAgent, 'A owner and agent balances were not changed');

  const zeroRate = await makePayment({ company: complete, property: completeProperty, reference: 'VAT-B', decision: 'standard_taxable_registered' });
  await VatRecord.create({
    companyId: complete._id, transactionId: String(zeroRate._id), sourceType: 'rental',
    vatCollected: 46.5, vatPaid: 0, vatRate: 0, filingPeriod: '2026-11', status: 'pending'
  });
  const approvedZero = await repairPaymentAccounting(String(zeroRate._id), {
    dryRun: false,
    reason: 'approve historical VAT obligation',
    userId: String(user._id),
    approveHistoricalVatObligation: true
  });
  const zeroRecord = await VatRecord.findOne({ transactionId: String(zeroRate._id) }).lean();
  check(Number((zeroRecord as any).vatRate) === 0, 'B snapshot rate did not replace the zero VAT record rate');
  check((await vatCredits(String(zeroRate._id))).length === 0, 'B no VAT payable liability was recognised');
  check(Boolean(approvedZero.historicalVatReview), 'B approval does not turn a zero-rate record into a liability');

  const assessed = await makePayment({ company: complete, property: completeProperty, reference: 'VAT-C', decision: 'standard_taxable_registered' });
  await VatRecord.create({
    companyId: complete._id, transactionId: String(assessed._id), sourceType: 'rental',
    vatCollected: 46.5, vatPaid: 0, vatRate: 0.155, filingPeriod: '2026-11', status: 'pending'
  });
  await repairPaymentAccounting(String(assessed._id), {
    dryRun: false,
    reason: 'Post the assessed historical VAT',
    userId: String(user._id)
  });
  const assessedRecord = await VatRecord.findOne({ transactionId: String(assessed._id) }).lean();
  const assessedObligations = await TaxObligation.find({ paymentId: assessed._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const assessedCredits = await vatCredits(String(assessed._id));
  check(Number((assessedRecord as any).vatRate) === 0.155 && Number((assessedRecord as any).vatCollected) === 46.5, 'C existing VAT record was respected');
  check(assessedCredits.length === 1 && assessedCredits[0] === 46.5, `C VAT payable journal line is ${assessedCredits.join(',')}`);
  check(assessedObligations.length === 1 && Number(assessedObligations[0].taxAmount) === 46.5, 'C obligation agrees with the VAT record');

  const prospective = await makePayment({
    company: complete,
    property: completeProperty,
    reference: 'VAT-D',
    decision: 'standard_taxable_registered',
    accountingComplete: false
  });
  await ensurePaymentAccountingPosted(String(prospective._id), { createdBy: String(user._id) });
  await repairPaymentAccounting(String(prospective._id), {
    dryRun: false,
    reason: 'Repeat the prospective repair',
    userId: String(user._id)
  });
  const prospectiveJournals = await JournalEntry.countDocuments({ sourceId: String(prospective._id), sourceModule: 'payment', status: 'posted' });
  const prospectiveRecords = await VatRecord.find({ transactionId: String(prospective._id) }).lean();
  const prospectiveObligations = await TaxObligation.find({ paymentId: prospective._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const prospectiveCredits = await vatCredits(String(prospective._id));
  check(prospectiveJournals === 1, `D one receipt journal, got ${prospectiveJournals}`);
  check(prospectiveRecords.length === 1 && Number((prospectiveRecords[0] as any).vatCollected) === 46.5 && Number((prospectiveRecords[0] as any).vatRate) === 0.155, 'D VAT record agrees');
  check(prospectiveObligations.length === 1 && Number(prospectiveObligations[0].taxAmount) === 46.5, 'D obligation agrees');
  check(prospectiveCredits.length === 1 && prospectiveCredits[0] === 46.5, 'D VAT payable journal line agrees');

  const existing = await makePayment({ company: incomplete, property: incompleteProperty, reference: 'VAT-E' });
  const bank = await ChartOfAccount.create({ companyId: incomplete._id, code: '1003', name: 'Trust bank', type: 'asset', balance: 0, currency: 'USD' });
  const owner = await ChartOfAccount.create({ companyId: incomplete._id, code: '2103', name: 'Owner payable', type: 'liability', balance: 0, currency: 'USD' });
  const existingJournal = await JournalEntry.create({
    companyId: incomplete._id,
    reference: 'PAY-VAT-E',
    description: 'Existing historical journal',
    sourceModule: 'payment',
    sourceId: String(existing._id),
    status: 'posted',
    transactionDate: existing.paymentDate,
    createdBy: user._id
  });
  await JournalLine.create([
    { companyId: incomplete._id, journalEntryId: existingJournal._id, accountId: bank._id, debit: 2000, credit: 0, runningBalanceSnapshot: 2000 },
    { companyId: incomplete._id, journalEntryId: existingJournal._id, accountId: owner._id, debit: 0, credit: 2000, runningBalanceSnapshot: 0 }
  ]);
  const beforeLines = await JournalLine.find({ journalEntryId: existingJournal._id }).select('debit credit accountId').lean();
  await repairPaymentAccounting(String(existing._id), {
    dryRun: false,
    reason: 'Do not rewrite the existing journal',
    userId: String(user._id)
  });
  const afterJournals = await JournalEntry.countDocuments({ sourceId: String(existing._id), status: 'posted' });
  const afterLines = await JournalLine.find({ journalEntryId: existingJournal._id }).select('debit credit accountId').lean();
  check(afterJournals === 1, `E no duplicate journal, got ${afterJournals}`);
  check(JSON.stringify(beforeLines) === JSON.stringify(afterLines), 'E existing journal lines were not rewritten');
  check((await vatCredits(String(existing._id))).length === 0, 'E no VAT payable line was added');

  const approval = await assessVatPayableJournal({ payment: unsupported, approveHistoricalVatObligation: true });
  check(approval.recognise === false, `F approval does not override failed eligibility (${approval.reason})`);
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/paymentController.ts'), 'utf8');
  check(controller.includes("indexOf('approve historical vat')"), 'F approval still requires the existing explicit reason');

  const gapProperty = await Property.create({
    companyId: complete._id, ownerId: user._id, name: 'Gap Property', address: 'Gap Road',
    rentalType: 'introduction', type: 'house', rent: 800, commission: 100
  });
  const gap = await Payment.create({
    companyId: complete._id, propertyId: gapProperty._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
    propertyType: 'residential', amount: 800, rentAllocated: 800, depositAmount: 0, paymentType: 'rental',
    paymentMethod: 'bank_transfer', status: 'completed', paymentDate: new Date('2026-08-13T00:00:00.000Z'),
    rentalPeriodMonth: 8, rentalPeriodYear: 2026,
    transactionDomain: 'RENTAL', commissionFinalized: true, accountingComplete: null, referenceNumber: 'GAP-1',
    commissionDetails: { totalCommission: 800, commissionNet: 800, ownerAmount: 0, agentShare: 465.6, agencyShare: 310.4, preaFee: 24, vatOnCommission: 0, commissionRate: 100 },
    idempotencyKey: 'vat-journal:gap'
  });
  const gapAgent = await AgentAccount.findOne({ agentId: user._id });
  const gapAgentRow = { type: 'commission', amount: 465.6, date: gap.paymentDate, paymentId: gap._id, description: 'Gap', status: 'completed' };
  if (gapAgent) {
    gapAgent.transactions.push(gapAgentRow as any);
    await gapAgent.save();
  } else {
    await AgentAccount.create({ agentId: user._id, companyId: complete._id, transactions: [gapAgentRow] });
  }
  const gapCompany = await CompanyAccount.findOne({ companyId: complete._id });
  const gapCompanyRow = { paymentId: gap._id, amount: 310.4, isArchived: false, description: 'Gap', date: gap.paymentDate, type: 'income' };
  if (gapCompany) {
    gapCompany.transactions.push(gapCompanyRow as any);
    await gapCompany.save();
  } else {
    await CompanyAccount.create({ companyId: complete._id, transactions: [gapCompanyRow] });
  }
  const beforeFlag = (await Payment.findById(gap._id).select('accountingComplete').lean())?.accountingComplete;
  const summary = await getCompanyAccountingIntegritySummary(String(complete._id));
  const afterFlag = (await Payment.findById(gap._id).select('accountingComplete').lean())?.accountingComplete;
  check(summary.historicalUnjournalledReceipts === summary.historicalJournalGaps + summary.unpostedRentals, 'unjournalled total equals the two populations');
  check(summary.historicalJournalGaps >= 1, `historical journal gaps are visible (${summary.historicalJournalGaps})`);
  check(summary.unpostedRentals >= 1, `unposted rentals are visible (${summary.unpostedRentals})`);
  check(beforeFlag === afterFlag, 'the population count did not change an accounting-complete flag');

  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Historical VAT journal safeguard tests passed.');
  }
  await mongoose.disconnect();
  await accountingConnection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
