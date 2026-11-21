/**
 * Historical accounting reconciliation. Local databases only.
 * This script does not connect to production and does not repair production receipts.
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
import { TaxObligation } from '../models/TaxObligation';
import PropertyAccount from '../models/PropertyAccount';
import { accountingConnection } from '../config/database';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { openExplicitPeriodForDate } from '../services/accountingPeriodService';
import propertyAccountService from '../services/propertyAccountService';
import agentAccountService from '../services/agentAccountService';
import accountingIntegrationService from '../services/accountingIntegrationService';
import {
  assessHistoricalAccountingPayment,
  classifyHistoricalAccountingCase,
  executeHistoricalAccountingRepair
} from '../services/historicalAccountingReconciliation';
import { buildExpectedAccountingProjection } from '../services/paymentAccountingProjection';

const DB = 'mongodb://127.0.0.1:27017/mantis_historical_accounting_reconciliation';
const ACCOUNTING_DB = 'mongodb://127.0.0.1:27017/mantis_historical_accounting_reconciliation_accounting';
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

async function main() {
  if (/cosmos|azure|mantisafrica/i.test(`${DB} ${ACCOUNTING_DB}`)) throw new Error('Refusing to run against a non-local database');
  await mongoose.connect(DB);
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();

  const user = await User.create({
    email: 'historical-accounting@example.test', password: 'Release-verify-local-1',
    firstName: 'Historical', lastName: 'Accountant', role: 'accountant', roles: ['accountant'], isActive: true, sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Reconciliation Company', address: '1 Test Street', phone: '0770000400', email: 'recon@example.test',
    registrationNumber: 'RECON-1', tinNumber: 'RECON-1-TIN', country: 'Zimbabwe', ownerId: user._id,
    taxProfile: { vatRegistered: false }
  });
  await openExplicitPeriodForDate({ companyId: String(company._id), date: new Date('2026-11-03T00:00:00.000Z'), createdBy: String(user._id) });
  const tenant = await Tenant.create({
    firstName: 'Recon', lastName: 'Tenant', email: 'recon-tenant@example.test', phone: '0770000401',
    companyId: company._id, ownerId: user._id, status: 'Active'
  });
  const property = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'Management House', address: 'Management Road',
    rentalType: 'management', type: 'house', rent: 2000, commission: 15, vatOnCommission: false
  });
  const introduction = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'Fairview Close', address: 'Fairview Close',
    rentalType: 'introduction', type: 'commercial', rent: 800, commission: 100, vatOnCommission: false
  });
  const shineplus = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'Shineplus', address: 'Haydon',
    rentalType: 'introduction', type: 'house', rent: 1000, commission: 50, vatOnCommission: false
  });

  async function makePayment(input: {
    reference: string;
    propertyId?: any;
    date?: string;
    amount?: number;
    deposit?: number;
    levy?: number;
    commission?: number;
    owner?: number;
    agent?: number;
    companyShare?: number;
    prea?: number;
    vat?: number;
    rate?: number;
    reversalOf?: any;
    status?: string;
  }) {
    const amount = input.amount ?? 2000;
    const commission = input.commission ?? 300;
    const owner = input.owner ?? 1700;
    return Payment.create({
      companyId: company._id,
      propertyId: input.propertyId || property._id,
      tenantId: tenant._id,
      agentId: user._id,
      processedBy: user._id,
      propertyType: 'residential',
      amount,
      rentAllocated: Math.max(0, amount - Number(input.levy || 0)),
      depositAmount: input.deposit || 0,
      levyAllocated: input.levy || 0,
      paymentType: 'rental',
      paymentMethod: 'bank_transfer',
      status: input.status || 'completed',
      paymentDate: new Date(`${input.date || '2026-11-03'}T00:00:00.000Z`),
      rentalPeriodMonth: Number((input.date || '2026-11-03').slice(5, 7)),
      rentalPeriodYear: 2026,
      transactionDomain: 'RENTAL',
      commissionFinalized: true,
      accountingComplete: null,
      referenceNumber: input.reference,
      currency: 'USD',
      reversalOfPaymentId: input.reversalOf,
      commissionDetails: {
        totalCommission: commission,
        commissionNet: commission,
        ownerAmount: owner,
        agentShare: input.agent ?? 174.6,
        agencyShare: input.companyShare ?? 116.4,
        preaFee: input.prea ?? 9,
        vatOnCommission: input.vat || 0,
        vatAmount: input.vat || 0,
        vatRate: input.vat ? 0.155 : 0,
        commissionRate: input.rate ?? 15,
        vatTreatment: 'exclusive',
        levy: input.levy || 0
      },
      idempotencyKey: `recon:${input.reference}`
    });
  }

  async function journalCount(paymentId: string) {
    return JournalEntry.countDocuments({ sourceModule: 'payment', sourceId: String(paymentId), status: 'posted' });
  }
  async function incomeCount(paymentId: string) {
    const rows = await PropertyAccount.find({ 'transactions.idempotencyKey': `payment:${paymentId}` }).lean();
    return rows.reduce((sum, row: any) => sum + (row.transactions || []).filter((tx: any) => tx.idempotencyKey === `payment:${paymentId}` && tx.type === 'income').length, 0);
  }

  const duplicate = classifyHistoricalAccountingCase({
    payment: { _id: 'dup', referenceNumber: 'DUP', amount: 2000, commissionDetails: { totalCommission: 300, ownerAmount: 1700, agentShare: 1, agencyShare: 1, vatOnCommission: 0 } },
    expected: buildExpectedAccountingProjection({ amount: 2000, status: 'completed', paymentType: 'rental', commissionFinalized: true, commissionDetails: { totalCommission: 300, ownerAmount: 1700, agentShare: 174.6, agencyShare: 116.4, vatOnCommission: 0 } }),
    actual: { ownerIncome: true, agentCommission: true, companyCommission: true, journal: true, vat: false, deposit: false, duplicates: { journal: 2 } },
    vatRecognise: false, vatReason: 'not_applicable', periodCode: 'OPEN', rateDisagrees: false
  });
  check(duplicate.classification === 'DUPLICATE SUSPECTED' && duplicate.recordsToCreate.length === 0, 'duplicate journal evidence blocks creation');

  const mismatchCase = classifyHistoricalAccountingCase({
    payment: { _id: 'bad', referenceNumber: 'BAD', amount: 2000, commissionDetails: { totalCommission: 300, ownerAmount: 1700, vatOnCommission: 0 } },
    expected: buildExpectedAccountingProjection({ amount: 2000, status: 'completed', paymentType: 'rental', commissionFinalized: true, commissionDetails: { totalCommission: 300, ownerAmount: 1700, agentShare: 174.6, agencyShare: 116.4, vatOnCommission: 0 } }),
    actual: { ownerIncome: true, agentCommission: true, companyCommission: true, journal: true, vat: false, deposit: false, amounts: { ownerIncome: 100, agentCommission: 174.6, companyCommission: 116.4, journal: 2000 } },
    vatRecognise: false, vatReason: 'not_applicable', periodCode: 'OPEN', rateDisagrees: false
  });
  check(mismatchCase.classification === 'FINANCIAL MISMATCH' && mismatchCase.recordsToCreate.length === 0, 'an existing incorrect amount is not replaced');

  const closed = await makePayment({ reference: 'CLOSED-SEP', date: '2026-09-07' });
  const closedAssessment = await assessHistoricalAccountingPayment(String(closed._id));
  const closedExecute = await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(closed._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Attempt a September repair while September is not open.', fingerprint: closedAssessment.fingerprint
  });
  check(closedAssessment.classification === 'REQUIRES ACCOUNTANT APPROVAL' && closedAssessment.periodCode !== 'OPEN', `closed period requires approval (${closedAssessment.classification} ${closedAssessment.periodCode})`);
  check(closedExecute.result === 'aborted' && await journalCount(String(closed._id)) === 0, 'closed period execution creates nothing');

  const vatPayment = await makePayment({ reference: 'VAT-REVIEW', vat: 46.5, owner: 1653.5 });
  const vatAssessment = await assessHistoricalAccountingPayment(String(vatPayment._id));
  const vatExecute = await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(vatPayment._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Attempt to repair unsupported historical VAT.', fingerprint: vatAssessment.fingerprint
  });
  check(vatAssessment.classification === 'HISTORICAL VAT REVIEW' && vatExecute.result === 'aborted', `historical VAT is rejected by this repair (${vatAssessment.vatEligibility})`);
  check(await journalCount(String(vatPayment._id)) === 0 && await TaxObligation.countDocuments({ paymentId: vatPayment._id }) === 0, 'historical VAT repair creates no journal or obligation');

  const reversal = await makePayment({ reference: 'REVERSAL', amount: -2000, owner: -1700, commission: -300, reversalOf: new mongoose.Types.ObjectId() });
  const reversalAssessment = await assessHistoricalAccountingPayment(String(reversal._id));
  check(reversalAssessment.classification === 'REQUIRES MANUAL INVESTIGATION' && reversalAssessment.recordsToCreate.length === 0, 'a reversal is not treated as a new rental receipt');

  const deposit = await makePayment({ reference: 'DEPOSIT', amount: 0, deposit: 500, commission: 0, owner: 0, agent: 0, companyShare: 0, prea: 0 });
  const depositAssessment = await assessHistoricalAccountingPayment(String(deposit._id));
  check(depositAssessment.recordsToCreate.length === 0 && !depositAssessment.recordsToCreate.includes('ownerIncome'), 'a deposit-only receipt does not propose rental income');

  const shine = await makePayment({
    reference: 'SHINEPLUS', propertyId: shineplus._id, amount: 1000, commission: 1000, owner: 0, agent: 582, companyShare: 388, prea: 30, rate: 100
  });
  const shineAssessment = await assessHistoricalAccountingPayment(String(shine._id));
  const shineSnapshot = JSON.stringify((await Payment.findById(shine._id).select('commissionDetails').lean() as any).commissionDetails);
  check(shineAssessment.classification === 'REQUIRES MANUAL INVESTIGATION', `Shineplus rate disagreement is not repaired (${shineAssessment.classification})`);
  check(JSON.stringify((await Payment.findById(shine._id).select('commissionDetails').lean() as any).commissionDetails) === shineSnapshot, 'Shineplus snapshot is not rewritten');

  const fairview = await makePayment({
    reference: 'FAIRVIEW', propertyId: introduction._id, date: '2026-08-13', amount: 800, commission: 800, owner: 0,
    agent: 465.6, companyShare: 310.4, prea: 24, rate: 100
  });
  const fairviewAssessment = await assessHistoricalAccountingPayment(String(fairview._id));
  check(fairviewAssessment.classification === 'REQUIRES ACCOUNTANT APPROVAL' && !fairviewAssessment.recordsToCreate.includes('ownerIncome'), 'Fairview keeps zero owner income and waits for period approval');
  check(fairviewAssessment.recordsToCreate.includes('journal'), 'Fairview missing journal remains visible');

  const openIntro = await makePayment({
    reference: 'INTRO-100', propertyId: introduction._id, amount: 800, commission: 800, owner: 0, agent: 465.6, companyShare: 310.4, prea: 24, rate: 100
  });
  const introAssessment = await assessHistoricalAccountingPayment(String(openIntro._id));
  const introExecute = await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(openIntro._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Post the missing introduction records for an open period.', fingerprint: introAssessment.fingerprint
  });
  check(introAssessment.classification === 'SAFE TO REPAIR' && !introAssessment.recordsToCreate.includes('ownerIncome'), 'introduction zero owner income is not proposed');
  check(introExecute.ok === true && await incomeCount(String(openIntro._id)) === 0 && await journalCount(String(openIntro._id)) === 1, 'introduction repair creates no artificial owner income');

  const management = await makePayment({ reference: 'MANAGEMENT' });
  const managementAssessment = await assessHistoricalAccountingPayment(String(management._id));
  check(managementAssessment.classification === 'SAFE TO REPAIR' && managementAssessment.recordsToCreate.includes('ownerIncome'), 'management commission expects owner income');
  const managementExecute = await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(management._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Post the missing management receipt records.', fingerprint: managementAssessment.fingerprint
  });
  const managementLines = await JournalLine.countDocuments({ journalEntryId: (await JournalEntry.findOne({ sourceId: String(management._id), sourceModule: 'payment' }).select('_id').lean() as any)?._id });
  const repeat = await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(management._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Repeat the same management repair.', fingerprint: managementAssessment.fingerprint
  });
  check(managementExecute.ok === true && await journalCount(String(management._id)) === 1 && await incomeCount(String(management._id)) === 1, 'missing journal and owner income are created once');
  check(repeat.result === 'aborted' && await journalCount(String(management._id)) === 1 && managementLines > 0, 'repeated execution does not add a journal or rewrite a balanced journal');

  const partial = await makePayment({ reference: 'PARTIAL' });
  await propertyAccountService.recordIncomeFromPayment(String(partial._id));
  await agentAccountService.syncCommissionForPayment(String(partial._id));
  await accountingIntegrationService.postCompanyCommission(partial as any);
  const partialAssessment = await assessHistoricalAccountingPayment(String(partial._id));
  check(partialAssessment.recordsToCreate.includes('journal') && !partialAssessment.recordsToCreate.includes('ownerIncome'), `existing owner, agent and company records are detected (${partialAssessment.recordsToCreate.join(',')})`);
  const partialExecute = await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(partial._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Retry after owner income already exists.', fingerprint: partialAssessment.fingerprint
  });
  check(partialExecute.ok === true && await incomeCount(String(partial._id)) === 1 && await journalCount(String(partial._id)) === 1, 'retry creates the missing journal without a second owner income');

  const levy = await makePayment({
    reference: 'LEVY', amount: 1200, levy: 100, commission: 165, owner: 1035, agent: 96.03, companyShare: 64.02, prea: 4.95
  });
  const levyAssessment = await assessHistoricalAccountingPayment(String(levy._id));
  await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(levy._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Post the levy receipt once.', fingerprint: levyAssessment.fingerprint
  });
  const levyAccount = await PropertyAccount.findOne({ propertyId: property._id }).lean();
  const levyRows = JSON.stringify(levyAccount).split(`payment:${levy._id}:pass-through:LEVY`).length - 1;
  check(levyRows === 1, `levy pass-through is posted once (${levyRows})`);

  const wrongProperty = await Property.create({
    companyId: company._id, ownerId: user._id, name: 'Wrong Income House', address: 'Wrong Road',
    rentalType: 'management', type: 'house', rent: 2000, commission: 15, vatOnCommission: false
  });
  const wrong = await makePayment({ reference: 'WRONG-AMOUNT', propertyId: wrongProperty._id });
  await PropertyAccount.create({
    propertyId: wrongProperty._id, ledgerType: 'rental',
    transactions: [{ type: 'income', amount: 100, date: wrong.paymentDate, paymentId: wrong._id, idempotencyKey: `payment:${wrong._id}`, description: 'Wrong historical income', status: 'completed' }]
  });
  const wrongAssessment = await assessHistoricalAccountingPayment(String(wrong._id));
  const wrongExecute = await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(wrong._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Attempt to overwrite an incorrect owner amount.', fingerprint: wrongAssessment.fingerprint
  });
  const wrongIncome = await PropertyAccount.findOne({ 'transactions.idempotencyKey': `payment:${wrong._id}` }).lean();
  check(wrongAssessment.classification === 'FINANCIAL MISMATCH' && wrongExecute.result === 'aborted', 'existing incorrect income blocks repair');
  check(Number((wrongIncome as any).transactions.find((tx: any) => tx.idempotencyKey === `payment:${wrong._id}`).amount) === 100, 'the incorrect income amount is left unchanged');

  const changed = await makePayment({ reference: 'CHANGED' });
  const changedAssessment = await assessHistoricalAccountingPayment(String(changed._id));
  await Payment.updateOne({ _id: changed._id }, { $set: { notes: 'Source note changed after the dry run.' } });
  const changedExecute = await executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(changed._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Execute after the source amount changed.', fingerprint: changedAssessment.fingerprint
  });
  check(changedExecute.reason === 'SOURCE_CHANGED' && await journalCount(String(changed._id)) === 0, 'changed source data aborts execution');

  const concurrent = await makePayment({ reference: 'CONCURRENT' });
  const concurrentAssessment = await assessHistoricalAccountingPayment(String(concurrent._id));
  await Promise.all([0, 1].map(() => executeHistoricalAccountingRepair({
    companyId: String(company._id), paymentId: String(concurrent._id), authorisedBy: String(user._id),
    confirm: true, reason: 'Concurrent repair of the same receipt.', fingerprint: concurrentAssessment.fingerprint
  })));
  check(await journalCount(String(concurrent._id)) === 1 && await incomeCount(String(concurrent._id)) === 1, 'concurrent repair attempts do not duplicate the journal or owner income');

  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/accountantRoutes.ts'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(__dirname, '../services/historicalAccountingReconciliation.ts'), 'utf8');
  check(routeSource.includes("'/historical-accounting/:id/repair', isAccountant"), 'repair execution is restricted to an accountant');
  check(!serviceSource.includes('approveHistoricalVatObligation'), 'this repair cannot approve historical VAT');
  check(!serviceSource.includes('recogniseHistoricalVat'), 'this repair does not call historical VAT recognition');

  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
    await mongoose.disconnect();
    await accountingConnection.close();
    process.exit(1);
  }
  console.log('Historical accounting reconciliation tests passed.');
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
