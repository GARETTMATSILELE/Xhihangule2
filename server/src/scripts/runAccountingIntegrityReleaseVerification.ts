/**
 * Isolated release verification. Refuses any non-local database.
 * Leaves the local database in place for browser verification.
 */
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import { JournalEntry } from '../models/JournalEntry';
import { VatRecord } from '../models/VatRecord';
import { TaxObligation } from '../models/TaxObligation';
import { AccountingException } from '../models/AccountingException';
import { TaxReviewItem } from '../models/TaxReviewItem';
import { AgentAccount } from '../models/AgentAccount';
import { CompanyAccount } from '../models/CompanyAccount';
import PropertyAccount from '../models/PropertyAccount';
import { accountingConnection } from '../config/database';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { openExplicitPeriodForDate } from '../services/accountingPeriodService';
import { prepareIntroductionRentalCommission } from '../services/introductionCommissionService';
import { ensurePaymentAccountingPosted, loadAccountingActualSnapshot, repairPaymentAccounting } from '../services/paymentAccountingReconciliation';
import { listCompanyAccountingInconsistencies } from '../services/paymentAccountingIntegrity';
import {
  assessVatObligationCreation,
  authoritativeSnapshotVatRate,
  commissionVatFlagsFromPolicy,
  resolveCommissionVatPolicy,
  stampVatDecision
} from '../services/vatPolicyService';
import { CommissionService } from '../services/commissionService';
import { toPaymentCommissionSnapshot } from '../services/propertyCommissionCalculator';
import { roundMoney } from '../utils/money';

const DB = 'mongodb://127.0.0.1:27017/mantis_release_verification';
const ACCOUNTING_DB = 'mongodb://127.0.0.1:27017/mantis_release_verification_accounting';
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

async function main() {
  if (/cosmos|azure|mantisafrica/i.test(`${DB} ${ACCOUNTING_DB}`)) {
    throw new Error('Refusing to run release verification against a non-local database');
  }
  await mongoose.connect(DB);
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();

  const user = await User.create({
    email: 'release-verify@example.test',
    password: 'Release-verify-local-1',
    firstName: 'Release',
    lastName: 'Verifier',
    role: 'accountant',
    roles: ['accountant', 'admin'],
    isActive: true,
    sessionVersion: 1
  });

  async function company(name: string, taxProfile: Record<string, unknown>) {
    return Company.create({
      name,
      address: '1 Verification Street',
      phone: '0770000100',
      email: `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
      registrationNumber: name.slice(0, 12),
      tinNumber: `${name.slice(0, 8)}-TIN`,
      country: 'Zimbabwe',
      ownerId: user._id,
      subscriptionStatus: 'active',
      tenantStatus: 'active',
      taxProfile
    });
  }

  const dashboard = await company('Release Dashboard', {
    vatRegistered: true,
    vatNumber: 'ZW-REL',
    vatCategory: 'standard',
    vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
  });
  user.companyId = dashboard._id;
  await user.save();
  const unregistered = await company('Release Unregistered', { vatRegistered: false });
  const incomplete = await company('Release Incomplete VAT', {
    vatRegistered: true,
    vatNumber: 'ZW-INC',
    vatCategory: '',
    vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
  });
  for (const row of [dashboard, unregistered, incomplete]) {
    await openExplicitPeriodForDate({ companyId: String(row._id), date: new Date('2026-09-08T00:00:00.000Z'), createdBy: String(user._id) });
    await openExplicitPeriodForDate({ companyId: String(row._id), date: new Date('2026-10-05T00:00:00.000Z'), createdBy: String(user._id) });
    await openExplicitPeriodForDate({ companyId: String(row._id), date: new Date('2026-11-03T00:00:00.000Z'), createdBy: String(user._id) });
  }

  const tenant = await Tenant.create({
    firstName: 'Release', lastName: 'Tenant', email: 'release-tenant@example.test', phone: '0770000101',
    companyId: dashboard._id, ownerId: user._id, status: 'Active'
  });

  async function property(input: { name: string; companyId: mongoose.Types.ObjectId; rentalType: 'introduction' | 'management'; commission: number; vat?: boolean; treatment?: 'exclusive' | 'inclusive'; rent?: number }) {
    return Property.create({
      companyId: input.companyId,
      ownerId: user._id,
      name: input.name,
      address: `${input.name} Road`,
      rentalType: input.rentalType,
      type: 'house',
      rent: input.rent ?? 1000,
      commission: input.commission,
      vatOnCommission: Boolean(input.vat),
      vatCommissionTreatment: input.treatment
    });
  }

  async function leaseFor(prop: any, rent = 1000) {
    return Lease.create({
      propertyId: prop._id,
      tenantId: tenant._id,
      companyId: prop.companyId,
      ownerId: user._id,
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2027-09-30T00:00:00.000Z'),
      rentAmount: rent,
      depositAmount: 0,
      status: 'active',
      billingStatus: 'current'
    });
  }

  async function postIntroduction(prop: any, reference: string) {
    const lease = await leaseFor(prop);
    const prepared = await prepareIntroductionRentalCommission({
      companyId: prop.companyId,
      propertyId: prop._id,
      tenantId: tenant._id,
      leaseId: lease._id,
      rentAllocated: 1000,
      levyAllocated: 0,
      commissionPercentage: prop.commission,
      vatOnCommission: false,
      paymentDate: new Date('2026-11-03T00:00:00.000Z'),
      propertyRent: 1000,
      rentUsed: 1000
    });
    if (!prepared.ok) throw new Error(prepared.message);
    const payment = await Payment.create({
      companyId: prop.companyId,
      propertyId: prop._id,
      tenantId: tenant._id,
      leaseId: lease._id,
      agentId: user._id,
      processedBy: user._id,
      propertyType: 'residential',
      amount: 1000,
      rentAllocated: 1000,
      depositAmount: 0,
      paymentType: 'rental',
      paymentMethod: 'bank_transfer',
      status: 'completed',
      paymentDate: new Date('2026-11-03T00:00:00.000Z'),
      rentalPeriodMonth: 11,
      rentalPeriodYear: 2026,
      transactionDomain: 'RENTAL',
      commissionFinalized: true,
      accountingStatus: 'pending',
      accountingComplete: false,
      referenceNumber: reference,
      commissionDetails: prepared.snapshot,
      idempotencyKey: `release:${reference}`
    });
    const posted = await ensurePaymentAccountingPosted(String(payment._id), { createdBy: String(user._id) });
    const saved = await Payment.findById(payment._id).lean();
    return { saved, posted };
  }

  const intro50 = await property({ name: 'Introduction Fifty', companyId: dashboard._id, rentalType: 'introduction', commission: 50 });
  const intro100 = await property({ name: 'Introduction Hundred', companyId: dashboard._id, rentalType: 'introduction', commission: 100 });
  const fifty = await postIntroduction(intro50, 'REL-INTRO-50');
  const hundred = await postIntroduction(intro100, 'REL-INTRO-100');
  const fiftyDetails = (fifty.saved as any).commissionDetails;
  const hundredDetails = (hundred.saved as any).commissionDetails;
  check(roundMoney(fiftyDetails.totalCommission) === 500, `50% commission snapshot is ${fiftyDetails.totalCommission}`);
  check(roundMoney(fiftyDetails.ownerAmount) === 500, `50% owner snapshot is ${fiftyDetails.ownerAmount}`);
  check(roundMoney(fiftyDetails.agentShare) === 291, `50% agent snapshot is ${fiftyDetails.agentShare}`);
  check(roundMoney(fiftyDetails.agencyShare) === 194, `50% company snapshot is ${fiftyDetails.agencyShare}`);
  check(roundMoney(fiftyDetails.preaFee) === 15, `50% PREA snapshot is ${fiftyDetails.preaFee}`);
  check(fifty.posted.accountingComplete === true, '50% introduction accounting completed');
  check(roundMoney(hundredDetails.totalCommission) === 1000, `100% commission snapshot is ${hundredDetails.totalCommission}`);
  check(roundMoney(hundredDetails.ownerAmount) === 0, `100% owner snapshot is ${hundredDetails.ownerAmount}`);
  check(roundMoney(hundredDetails.agentShare) === 582, `100% agent snapshot is ${hundredDetails.agentShare}`);
  check(roundMoney(hundredDetails.agencyShare) === 388, `100% company snapshot is ${hundredDetails.agencyShare}`);

  const fiftyJournal = await JournalEntry.findOne({ companyId: dashboard._id, sourceId: String(fifty.saved!._id), status: 'posted' }).lean();
  const hundredJournal = await JournalEntry.findOne({ companyId: dashboard._id, sourceId: String(hundred.saved!._id), status: 'posted' }).lean();
  check(Boolean(fiftyJournal), '50% receipt journal exists');
  check(Boolean(hundredJournal), '100% receipt journal exists');
  const fiftyIncome = await PropertyAccount.findOne({ 'transactions.idempotencyKey': `payment:${fifty.saved!._id}` }).lean();
  const hundredIncome = await PropertyAccount.findOne({ 'transactions.idempotencyKey': `payment:${hundred.saved!._id}` }).lean();
  check(Boolean(fiftyIncome), '50% owner income was posted');
  check(!hundredIncome, '100% introduction did not create an owner-income row');
  const agent = await AgentAccount.findOne({ agentId: user._id }).lean();
  const agentAmounts = ((agent as any)?.transactions || []).map((tx: any) => roundMoney(tx.amount));
  check(agentAmounts.includes(291) && agentAmounts.includes(582), `agent allocations are ${agentAmounts.join(',')}`);
  const companyAccount = await CompanyAccount.findOne({ companyId: dashboard._id }).lean();
  const companyAmounts = ((companyAccount as any)?.transactions || []).map((tx: any) => roundMoney(tx.amount));
  check(companyAmounts.includes(194) && companyAmounts.includes(388), `company allocations are ${companyAmounts.join(',')}`);

  const unpostedHundred = await Payment.create({
    companyId: dashboard._id,
    propertyId: intro100._id,
    tenantId: tenant._id,
    agentId: user._id,
    processedBy: user._id,
    propertyType: 'residential',
    amount: 1000,
    rentAllocated: 1000,
    depositAmount: 0,
    paymentType: 'rental',
    paymentMethod: 'bank_transfer',
    status: 'completed',
    paymentDate: new Date('2026-11-04T00:00:00.000Z'),
    rentalPeriodMonth: 11,
    rentalPeriodYear: 2026,
    transactionDomain: 'RENTAL',
    commissionFinalized: true,
    accountingComplete: null,
    referenceNumber: 'REL-INTRO-100-UNPOSTED',
    commissionDetails: hundredDetails,
    idempotencyKey: 'release:intro-100-unposted'
  });
  const agentAccount = await AgentAccount.findOne({ agentId: user._id });
  agentAccount?.transactions.push({
    type: 'commission', amount: 582, date: unpostedHundred.paymentDate, paymentId: unpostedHundred._id, description: 'Unposted introduction', status: 'completed'
  } as any);
  await agentAccount?.save();
  const companyLedger = await CompanyAccount.findOne({ companyId: dashboard._id });
  companyLedger?.transactions.push({ paymentId: unpostedHundred._id, amount: 388, isArchived: false, description: 'Unposted introduction', date: unpostedHundred.paymentDate, type: 'income' } as any);
  await companyLedger?.save();
  const beforeFlag = (await Payment.findById(hundred.saved!._id).select('accountingComplete').lean())?.accountingComplete;
  await listCompanyAccountingInconsistencies(String(dashboard._id), { paymentReference: 'REL-INTRO-100', limit: 10 });
  const afterFlag = (await Payment.findById(hundred.saved!._id).select('accountingComplete').lean())?.accountingComplete;
  check(beforeFlag === afterFlag, 'listing integrity rows did not change the accounting-complete flag');
  const { classifyAccountingIntegrityRow } = await import('../services/accountingIntegrityClassification');
  const presence = await loadAccountingActualSnapshot(unpostedHundred.toObject());
  const hidden = classifyAccountingIntegrityRow({
    component: 'MISSING_JOURNAL',
    payment: unpostedHundred,
    propertyCommission: 100,
    presence: { ownerIncome: presence.ownerIncome, agentCommission: presence.agentCommission, companyCommission: presence.companyCommission, journal: presence.journal }
  });
  check(hidden.classification === 'HISTORICAL JOURNAL GAP', `100% with a missing journal is ${hidden.classification}`);
  check(hidden.explanation.includes('0.00') && hidden.explanation.includes('journal'), 'zero owner income does not hide the missing journal');

  async function vatSnapshot(owner: any, prop: any, date: Date, amount = 2000) {
    const policy = await resolveCommissionVatPolicy({
      companyId: String(owner._id),
      paymentDate: date,
      property: prop,
      requestedVatOnCommission: Boolean(prop.vatOnCommission),
      requestedTreatment: prop.vatCommissionTreatment,
      commissionType: 'management'
    });
    const flags = commissionVatFlagsFromPolicy(policy);
    const calc = await CommissionService.calculateForProperty({
      companyId: owner._id,
      grossRent: amount,
      levy: 0,
      commissionPercentage: prop.commission,
      vatOnCommission: flags.vatOnCommission,
      vatTreatment: flags.vatTreatment,
      vatRate: flags.vatRate,
      paymentDate: date,
      commissionType: 'management'
    });
    return { policy, flags, snapshot: stampVatDecision(toPaymentCommissionSnapshot(calc), policy) };
  }

  const enabled = await property({ name: 'VAT Enabled', companyId: dashboard._id, rentalType: 'management', commission: 15, vat: true, treatment: 'exclusive', rent: 2000 });
  const disabled = await property({ name: 'VAT Disabled', companyId: dashboard._id, rentalType: 'management', commission: 15, vat: false, rent: 2000 });
  const unregProp = await property({ name: 'VAT Unregistered Property', companyId: unregistered._id, rentalType: 'management', commission: 15, vat: true, treatment: 'exclusive', rent: 2000 });
  const incompleteProp = await property({ name: 'VAT Incomplete Property', companyId: incomplete._id, rentalType: 'management', commission: 15, vat: true, treatment: 'exclusive', rent: 2000 });
  const date = new Date('2026-11-03T00:00:00.000Z');
  const valid = await vatSnapshot(dashboard, enabled, date);
  const off = await vatSnapshot(dashboard, disabled, date);
  const unreg = await vatSnapshot(unregistered, unregProp, date);
  const partial = await vatSnapshot(incomplete, incompleteProp, date);
  check(valid.policy.apply === true && roundMoney(valid.snapshot.vatAmount) === 46.5, `complete VAT is ${valid.snapshot.vatAmount}`);
  check(off.policy.apply === false && roundMoney(off.snapshot.vatAmount) === 0, 'disabled property produces zero VAT');
  check(unreg.policy.apply === false && roundMoney(unreg.snapshot.vatAmount) === 0, 'unregistered company produces zero VAT');
  check(partial.policy.apply === false && partial.policy.reviewReason === 'VAT_CONFIGURATION_INCOMPLETE', 'incomplete VAT configuration blocks VAT');

  const validLease = await leaseFor(enabled, 2000);
  const validPayment = await Payment.create({
    companyId: dashboard._id, propertyId: enabled._id, tenantId: tenant._id, leaseId: validLease._id,
    agentId: user._id, processedBy: user._id, propertyType: 'residential', amount: 2000, rentAllocated: 2000,
    depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed',
    paymentDate: date, rentalPeriodMonth: 11, rentalPeriodYear: 2026, transactionDomain: 'RENTAL',
    commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false,
    referenceNumber: 'REL-VAT-VALID', applyVatOnCommission: true, vatOnCommissionRate: valid.flags.vatRate,
    vatCommissionTreatment: 'exclusive', commissionDetails: valid.snapshot, idempotencyKey: 'release:vat-valid'
  });
  await ensurePaymentAccountingPosted(String(validPayment._id), { createdBy: String(user._id) });
  const validSaved = await Payment.findById(validPayment._id).lean();
  const validRecord = await VatRecord.findOne({ transactionId: String(validPayment._id) }).lean();
  const validObligations = await TaxObligation.find({ paymentId: validPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const snapshotVat = roundMoney(Number((validSaved as any).commissionDetails.vatOnCommission || (validSaved as any).commissionDetails.vatAmount));
  check(validObligations.length === 1, `valid VAT created ${validObligations.length} obligations`);
  check(roundMoney((validRecord as any)?.vatCollected) === snapshotVat, 'VAT record amount matches the snapshot');
  check(Number((validRecord as any)?.vatRate) === authoritativeSnapshotVatRate(validSaved), 'VAT record rate matches the snapshot');
  check(roundMoney(validObligations[0]?.taxAmount) === roundMoney((validRecord as any)?.vatCollected), 'tax obligation matches the VAT record');

  const historical = await Payment.create({
    companyId: incomplete._id, propertyId: incompleteProp._id, tenantId: tenant._id,
    agentId: user._id, processedBy: user._id, propertyType: 'residential', amount: 2000, rentAllocated: 2000,
    depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed',
    paymentDate: new Date('2026-10-05T00:00:00.000Z'), rentalPeriodMonth: 10, rentalPeriodYear: 2026,
    transactionDomain: 'RENTAL', commissionFinalized: true, accountingComplete: null,
    referenceNumber: 'REL-VAT-HIST', commissionDetails: {
      totalCommission: 300, commissionNet: 300, ownerAmount: 1653.5, agentShare: 174.6, agencyShare: 116.4,
      preaFee: 9, vatOnCommission: 46.5, vatAmount: 46.5, vatRate: 0.155, commissionRate: 15, vatTreatment: 'exclusive'
    },
    idempotencyKey: 'release:vat-hist'
  });
  await VatRecord.create({
    companyId: incomplete._id, transactionId: String(historical._id), sourceType: 'rental',
    vatCollected: 46.5, vatPaid: 0, vatRate: 0, filingPeriod: '2026-10', status: 'pending'
  });
  const beforeRate = 0;
  const beforeObligations = await TaxObligation.countDocuments({ paymentId: historical._id });
  const blocked = await repairPaymentAccounting(String(historical._id), {
    dryRun: false,
    reason: 'Repair the missing receipt journal',
    userId: String(user._id),
    createdBy: String(user._id)
  });
  const approvedButIneligible = await repairPaymentAccounting(String(historical._id), {
    dryRun: false,
    reason: 'approve historical VAT obligation',
    userId: String(user._id),
    createdBy: String(user._id),
    approveHistoricalVatObligation: true
  });
  const afterRecord = await VatRecord.findOne({ transactionId: String(historical._id) }).lean();
  const afterObligations = await TaxObligation.countDocuments({ paymentId: historical._id });
  const afterPayment = await Payment.findById(historical._id).lean();
  check(beforeObligations === 0 && afterObligations === 0, 'historical repair created no VAT obligation');
  check(Number((afterRecord as any)?.vatRate) === beforeRate, 'historical VAT record rate was not rewritten');
  check(roundMoney((afterPayment as any).commissionDetails.vatOnCommission) === 46.5, 'historical snapshot was not rewritten');
  check(Boolean(blocked.vatObligationSkipped || approvedButIneligible.vatObligationSkipped), `repair reports that the historical VAT obligation was not created (${blocked.vatObligationSkipped || approvedButIneligible.vatObligationSkipped || blocked.accountingStatus})`);
  const eligibility = await assessVatObligationCreation({ payment: historical, approveHistoricalVatObligation: true });
  check(eligibility.create === false, `approval cannot override incomplete receipt-date eligibility (${eligibility.reason})`);

  const prospectivePayment = await Payment.create({
    companyId: dashboard._id, propertyId: enabled._id, tenantId: tenant._id, leaseId: validLease._id,
    agentId: user._id, processedBy: user._id, propertyType: 'residential', amount: 2000, rentAllocated: 2000,
    depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed',
    paymentDate: date, rentalPeriodMonth: 11, rentalPeriodYear: 2026, transactionDomain: 'RENTAL',
    commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false,
    referenceNumber: 'REL-VAT-REPAIR', applyVatOnCommission: true, vatOnCommissionRate: valid.flags.vatRate,
    vatCommissionTreatment: 'exclusive', commissionDetails: valid.snapshot, idempotencyKey: 'release:vat-repair'
  });
  const prospective = await repairPaymentAccounting(String(prospectivePayment._id), {
    dryRun: false,
    reason: 'Post the current receipt and its VAT obligation',
    userId: String(user._id),
    approveHistoricalVatObligation: false
  });
  const restored = await TaxObligation.find({ paymentId: prospectivePayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  const restoredRecord = await VatRecord.findOne({ transactionId: String(prospectivePayment._id) }).lean();
  check(restored.length === 1, `prospective repair restored ${restored.length} obligations`);
  check(roundMoney(restored[0]?.taxAmount) === roundMoney((restoredRecord as any)?.vatCollected), 'prospective obligation matches its VAT record');
  check(!prospective.vatObligationSkipped, 'a valid receipt-date decision does not need historical approval');

  await seedDashboard(dashboard._id, user._id, tenant._id);
  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Release verification data checks passed.');
    console.log('Local login: release-verify@example.test');
  }
  await mongoose.disconnect();
  await accountingConnection.close();
}

async function seedDashboard(companyId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId, tenantId: mongoose.Types.ObjectId) {
  const suffolk = await Property.create({
    companyId, ownerId: userId, name: 'Suffolk 2 Unit 8', address: 'Suffolk 2', rentalType: 'management', rent: 1100, commission: 15, type: 'apartment'
  });
  const shine = await Property.create({
    companyId, ownerId: userId, name: 'Shineplus', address: 'Shineplus', rentalType: 'introduction', rent: 1000, commission: 50, type: 'house'
  });
  const fairview = await Property.create({
    companyId, ownerId: userId, name: 'Fairview Close', address: 'Fairview Close', rentalType: 'introduction', rent: 800, commission: 100, type: 'commercial'
  });
  const staleProperty = await Property.create({
    companyId, ownerId: userId, name: 'Stale Estate', address: 'Stale Estate', rentalType: 'management', rent: 750, commission: 15, type: 'house'
  });
  const base = {
    companyId, tenantId, agentId: userId, processedBy: userId, propertyType: 'residential', depositAmount: 0,
    paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed', transactionDomain: 'RENTAL', commissionFinalized: true
  };
  const suffolkPayment = await Payment.create({
    ...base, propertyId: suffolk._id, amount: 1100, rentAllocated: 1100, referenceNumber: 'RCPT-7DD47A-2026-09',
    paymentDate: new Date('2026-09-07T00:00:00.000Z'), rentalPeriodMonth: 9, rentalPeriodYear: 2026, accountingComplete: null,
    commissionDetails: { totalCommission: 165, ownerAmount: 1035, agentShare: 96.03, agencyShare: 64.02, preaFee: 4.95, commissionRate: 15, vatOnCommission: 0 },
    idempotencyKey: 'release:suffolk'
  });
  const shinePayment = await Payment.create({
    ...base, propertyId: shine._id, amount: 1000, rentAllocated: 1000, referenceNumber: 'REF-1793687077258-534',
    paymentDate: new Date('2026-11-03T00:00:00.000Z'), rentalPeriodMonth: 11, rentalPeriodYear: 2026,
    accountingComplete: false, accountingStatus: 'incomplete', accountingMissing: ['ownerIncome'],
    commissionDetails: { totalCommission: 1000, ownerAmount: 0, agentShare: 582, agencyShare: 388, preaFee: 30, commissionRate: 100, vatOnCommission: 0 },
    idempotencyKey: 'release:shine'
  });
  const fairviewPayment = await Payment.create({
    ...base, propertyId: fairview._id, amount: 800, rentAllocated: 800, referenceNumber: 'RCPT-DCDD37-2026-08',
    paymentDate: new Date('2026-08-13T00:00:00.000Z'), rentalPeriodMonth: 8, rentalPeriodYear: 2026, accountingComplete: null,
    commissionDetails: { totalCommission: 800, ownerAmount: 0, agentShare: 465.6, agencyShare: 310.4, preaFee: 24, commissionRate: 100, vatOnCommission: 0 },
    idempotencyKey: 'release:fairview'
  });
  const stalePayment = await Payment.create({
    ...base, propertyId: staleProperty._id, amount: 750, rentAllocated: 700, referenceNumber: 'REL-STALE',
    paymentDate: new Date('2026-11-06T00:00:00.000Z'), rentalPeriodMonth: 11, rentalPeriodYear: 2026, accountingComplete: true,
    commissionDetails: { totalCommission: 105, ownerAmount: 645, agentShare: 61.11, agencyShare: 40.74, preaFee: 3.15, commissionRate: 15, vatOnCommission: 0 },
    idempotencyKey: 'release:stale'
  });
  await JournalEntry.create({
    companyId, reference: 'PAY-REF-1793687077258-534', description: 'Fixture receipt', sourceModule: 'payment',
    sourceId: String(shinePayment._id), status: 'posted', transactionDate: shinePayment.paymentDate, createdBy: userId
  });
  await JournalEntry.create({
    companyId, reference: 'PAY-REL-STALE', description: 'Fixture receipt', sourceModule: 'payment',
    sourceId: String(stalePayment._id), status: 'posted', transactionDate: stalePayment.paymentDate, createdBy: userId
  });
  const agentAccount = await AgentAccount.findOne({ agentId: userId });
  const agentRows = [
    { type: 'commission', amount: 465.6, date: fairviewPayment.paymentDate, paymentId: fairviewPayment._id, description: 'Fairview', status: 'completed' },
    { type: 'commission', amount: 61.11, date: stalePayment.paymentDate, paymentId: stalePayment._id, description: 'Stale', status: 'completed' }
  ];
  if (agentAccount) {
    agentAccount.transactions.push(...agentRows as any);
    await agentAccount.save();
  } else {
    await AgentAccount.create({ agentId: userId, companyId, transactions: agentRows });
  }
  const existingCompany = await CompanyAccount.findOne({ companyId });
  const extra = [
    { paymentId: fairviewPayment._id, amount: 310.4, isArchived: false, description: 'Fairview', date: fairviewPayment.paymentDate, type: 'income' },
    { paymentId: stalePayment._id, amount: 40.74, isArchived: false, description: 'Stale', date: stalePayment.paymentDate, type: 'income' }
  ];
  if (existingCompany) {
    existingCompany.transactions.push(...extra as any);
    await existingCompany.save();
  } else {
    await CompanyAccount.create({ companyId, transactions: extra });
  }
  await PropertyAccount.create({
    propertyId: staleProperty._id, companyId, ledgerType: 'rental', isArchived: false, isActive: true,
    transactions: [{ type: 'income', status: 'completed', amount: 645, paymentId: stalePayment._id, idempotencyKey: `payment:${stalePayment._id}`, date: stalePayment.paymentDate, description: 'Stale income' }]
  });
  const now = new Date();
  await AccountingException.create([
    { kind: 'financial_review', status: 'open', issueType: 'missing', component: 'MISSING_JOURNAL', paymentId: suffolkPayment._id, companyId, error: 'accounting journal', detectedAt: now, lastCheckedAt: now },
    { kind: 'incomplete_projection', status: 'open', issueType: 'missing', component: 'ownerIncome', paymentId: shinePayment._id, companyId, error: 'ownerIncome', detectedAt: now, lastCheckedAt: now },
    { kind: 'financial_review', status: 'open', issueType: 'missing', component: 'MISSING_JOURNAL', paymentId: fairviewPayment._id, companyId, error: 'accounting journal', detectedAt: now, lastCheckedAt: now },
    { kind: 'financial_review', status: 'open', issueType: 'missing', component: 'MISSING_JOURNAL', paymentId: stalePayment._id, companyId, error: 'accounting journal', detectedAt: now, lastCheckedAt: now }
  ]);
  await TaxReviewItem.create({
    companyId, kind: 'VAT_CONFIGURATION_INCOMPLETE', status: 'OPEN', title: 'VAT category is blank',
    detail: 'VAT was not applied because the company VAT category is blank.', detectedAt: now
  });
  for (let index = 0; index < 3; index += 1) {
    await Payment.create({
      ...base, propertyId: suffolk._id, amount: 100 + index, referenceNumber: `REL-UNJOURNALLED-${index}`,
      paymentDate: new Date('2026-07-01T00:00:00.000Z'), rentalPeriodMonth: 7, rentalPeriodYear: 2026, accountingComplete: null,
      commissionDetails: { totalCommission: 15, ownerAmount: 85 + index, agentShare: 8, agencyShare: 6, preaFee: 1, commissionRate: 15, vatOnCommission: 0 },
      idempotencyKey: `release:unjournalled:${index}`
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
