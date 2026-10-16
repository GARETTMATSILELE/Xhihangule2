/**
 * Code-side integrity gaps on disposable local databases.
 * Does not use property-management, the application accounting database, or Cosmos DB.
 */
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Payment } from '../models/Payment';
import PropertyAccount from '../models/PropertyAccount';
import { CompanyAccount } from '../models/CompanyAccount';
import { JournalEntry } from '../models/JournalEntry';
import { AccountingException } from '../models/AccountingException';
import LedgerEvent from '../models/LedgerEvent';
import { AuditLog } from '../models/AuditLog';
import propertyAccountService, { propertyLedgerDuplicateMatches } from '../services/propertyAccountService';
import { CompanyExpenseClaim } from '../models/CompanyExpenseClaim';
import { recordCompanyAccountExpense, CompanyExpenseIdempotencyError, CompanyExpenseUniquenessUnverifiedError, inspectCompanyExpenseUniqueness } from '../services/companyAccountExpenseService';
import { detectFinancialPostingGaps } from '../services/financialPostingGapService';
import { postPaymentAccounting } from '../services/paymentAccountingOrchestrator';
import ledgerEventService from '../services/ledgerEventService';
import { canViewAccountantDashboard } from '../middleware/roles';
import { auth } from '../middleware/auth';
import { retryFailedLedgerEvent } from '../controllers/paymentAccountingIntegrityController';
import { listCompanyAccountingInconsistencies } from '../services/paymentAccountingIntegrity';
import { upsertFinancialReview } from '../services/financialOperationVisibility';
import { accountingConnection } from '../config/database';

const DB = process.env.INTEGRITY_GAP_DB || 'mongodb://127.0.0.1:27017/mantis_integrity_gap_test';
const ACCOUNTING_DB = process.env.INTEGRITY_GAP_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_integrity_gap_accounting';
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function forcedConflict(value: {
  propertyName: string;
  pattern: Record<string, unknown>;
  keyValue: Record<string, unknown>;
  insertVisibleAccount?: boolean;
} | null) {
  (global as any).__propertyAccountConflict = value;
}

async function main() {
  if (DB.includes('property-management') || /\/accounting(\?|$)/.test(ACCOUNTING_DB)) {
    console.error('Refusing to run against an application database');
    process.exit(1);
  }
  process.env.MANTIS_TEST_SEAM = '1';
  process.env.NODE_ENV = 'development';
  try {
    await mongoose.connect(DB, { serverSelectionTimeoutMS: 4000 });
  } catch (error: any) {
    console.log(`INTEGRATION SKIPPED: local MongoDB unavailable (${error?.message || error}). Not a Cosmos DB result.`);
    process.exit(0);
  }
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB, { autoIndex: false, serverSelectionTimeoutMS: 4000 } as any);
  await accountingConnection.dropDatabase();
  await JournalEntry.syncIndexes();
  await PropertyAccount.collection.createIndex(
    { propertyId: 1, ledgerType: 1 },
    { unique: true, partialFilterExpression: { isArchived: false }, name: 'test_active_property_ledger' }
  );

  const user = await User.create({
    email: 'integrity-gap@example.test', password: 'test-pass-1', firstName: 'Integrity', lastName: 'Gap',
    role: 'accountant', roles: ['accountant'], isActive: true, sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Integrity Co', address: '1 Integrity Street', phone: '0770000401', email: 'integrity@example.test',
    registrationNumber: 'GAP-1', tinNumber: 'GAP-TIN', country: 'Zimbabwe', ownerId: user._id
  });
  const otherCompany = await Company.create({
    name: 'Other Integrity Co', address: '2 Integrity Street', phone: '0770000402', email: 'other-integrity@example.test',
    registrationNumber: 'GAP-2', tinNumber: 'GAP-TIN-2', country: 'Zimbabwe', ownerId: user._id
  });

  async function makeProperty(ownerCompany: any, name: string) {
    return Property.create({
      companyId: ownerCompany._id, ownerId: user._id, name, address: `${name} Road`,
      rentalType: 'management', rent: 1000, commission: 10
    });
  }

  const firstProperty = await makeProperty(company, 'First House');
  const created = await propertyAccountService.getOrCreatePropertyAccount(String(firstProperty._id), 'rental');
  assert(Boolean(created?._id), 'first property account is created');
  const repeated = await propertyAccountService.getOrCreatePropertyAccount(String(firstProperty._id), 'rental');
  assert(String(repeated._id) === String(created._id), 'repeated creation returns the same property account');
  assert(await PropertyAccount.countDocuments({ propertyId: firstProperty._id, ledgerType: 'rental', isArchived: false }) === 1, 'repeated creation does not add an account');

  const concurrentProperty = await makeProperty(company, 'Concurrent House');
  const concurrentAccounts = await Promise.all([
    propertyAccountService.getOrCreatePropertyAccount(String(concurrentProperty._id), 'rental'),
    propertyAccountService.getOrCreatePropertyAccount(String(concurrentProperty._id), 'rental')
  ]);
  assert(String(concurrentAccounts[0]._id) === String(concurrentAccounts[1]._id), 'concurrent creation returns one property account');
  assert(await PropertyAccount.countDocuments({ propertyId: concurrentProperty._id, isArchived: false }) === 1, 'concurrent creation leaves one active account');

  const foreignProperty = await makeProperty(otherCompany, 'Foreign House');
  const foreignAccount = await propertyAccountService.getOrCreatePropertyAccount(String(foreignProperty._id), 'rental');
  assert(String(foreignAccount._id) !== String(created._id), 'another company property gets its own account');
  assert(String(foreignAccount.propertyId) === String(foreignProperty._id), 'the foreign account stays on its own property');

  const missingProperty = await makeProperty(company, 'Missing Conflict');
  forcedConflict({
    propertyName: 'Missing Conflict',
    pattern: { propertyId: 1, ledgerType: 1 },
    keyValue: { propertyId: missingProperty._id, ledgerType: 'rental' }
  });
  let missingThrew = false;
  try {
    await propertyAccountService.getOrCreatePropertyAccount(String(missingProperty._id), 'rental');
  } catch {
    missingThrew = true;
  }
  forcedConflict(null);
  assert(missingThrew, 'a matching duplicate key with no stored account is propagated');
  assert(await PropertyAccount.countDocuments({ propertyId: missingProperty._id }) === 0, 'the missing conflict does not invent an account');

  const unrelatedProperty = await makeProperty(company, 'Unrelated Conflict');
  forcedConflict({
    propertyName: 'Unrelated Conflict',
    pattern: { propertyName: 1 },
    keyValue: { propertyName: 'Unrelated Conflict' },
    insertVisibleAccount: true
  });
  let unrelatedThrew = false;
  try {
    await propertyAccountService.getOrCreatePropertyAccount(String(unrelatedProperty._id), 'rental');
  } catch {
    unrelatedThrew = true;
  }
  forcedConflict(null);
  assert(unrelatedThrew, 'an unrelated duplicate key is propagated even when one account can be reloaded');
  assert(!propertyLedgerDuplicateMatches({ code: 11000, keyPattern: { propertyName: 1 }, keyValue: { propertyName: 'Unrelated Conflict' } }, unrelatedProperty._id, 'rental'), 'an unrelated index is not the property ledger identity');

  const crossedProperty = await makeProperty(otherCompany, 'Crossed Conflict');
  forcedConflict({
    propertyName: 'Crossed Conflict',
    pattern: { propertyId: 1, ledgerType: 1 },
    keyValue: { propertyId: firstProperty._id, ledgerType: 'rental' },
    insertVisibleAccount: true
  });
  let crossedThrew = false;
  try {
    await propertyAccountService.getOrCreatePropertyAccount(String(crossedProperty._id), 'rental');
  } catch {
    crossedThrew = true;
  }
  forcedConflict(null);
  assert(crossedThrew, 'a duplicate key for another property is not returned as this company account');
  assert(String((await PropertyAccount.findById(created._id))?.propertyId) === String(firstProperty._id), 'the original company account is unchanged');

  const expenseDate = new Date('2026-10-15T00:00:00.000Z');
  const expenseInput = {
    companyId: String(company._id),
    amount: 40,
    date: expenseDate,
    description: 'Rates',
    reference: 'BILL-40',
    paymentMethod: 'bank_transfer' as const,
    payee: 'Municipality',
    idempotencyKey: 'company-expense:stable-key-1'
  };
  delete process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS;
  let closedGate = false;
  try {
    await recordCompanyAccountExpense(expenseInput);
  } catch (error) {
    closedGate = error instanceof CompanyExpenseUniquenessUnverifiedError;
  }
  assert(closedGate, 'a keyed expense is refused while uniqueness is unverified');
  assert(await CompanyExpenseClaim.countDocuments({ companyId: company._id }) === 0, 'a closed gate writes no claim');
  assert((await CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions).length === 0, 'a closed gate writes no expense transaction');
  assert(await JournalEntry.countDocuments({ companyId: company._id, sourceModule: 'expense' }) === 0, 'a closed gate writes no expense journal');

  process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS = 'verified';
  const attestedOnly = await inspectCompanyExpenseUniqueness();
  assert(attestedOnly.available === false && attestedOnly.reason === 'unique_index_absent', 'an attestation without the unique index does not open the gate');
  let attestedWrite = false;
  try {
    await recordCompanyAccountExpense(expenseInput);
  } catch (error) {
    attestedWrite = error instanceof CompanyExpenseUniquenessUnverifiedError;
  }
  assert(attestedWrite, 'an attestation without the unique index writes no keyed expense');

  await CompanyExpenseClaim.collection.createIndex(
    { companyId: 1, idempotencyKey: 1 },
    { unique: true, name: 'company_expense_claim_identity' }
  );
  const ready = await inspectCompanyExpenseUniqueness();
  assert(ready.available === true && ready.reason === 'attestation_and_unique_index', 'the gate opens only when the attestation and the observed unique index agree');

  const firstExpense = await recordCompanyAccountExpense(expenseInput);
  const secondExpense = await recordCompanyAccountExpense(expenseInput);
  assert(firstExpense.reused === false && secondExpense.reused === true, 'a repeated expense key reuses the stored transaction');
  assert(String(secondExpense.transaction._id) === String(firstExpense.transaction._id), 'the repeated expense is the original transaction');
  const expenseAccounts = await CompanyAccount.find({ companyId: company._id });
  const keyed = expenseAccounts.flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === expenseInput.idempotencyKey));
  assert(keyed.length === 1, 'a repeated expense key does not add a transaction');
  assert(expenseAccounts.reduce((sum, account) => sum + Number(account.totalExpenses || 0), 0) === 40, 'a repeated expense key does not change the total');
  assert(await JournalEntry.countDocuments({ companyId: company._id, sourceModule: 'expense', sourceId: `company-expense:${company._id}:${expenseInput.idempotencyKey}` }) === 1, 'a repeated expense key leaves one journal');

  (global as any).__companyExpenseClaimDelayMs = 300;
  const indexedKey = 'company-expense:indexed-concurrent';
  const indexedResults = await Promise.allSettled([
    recordCompanyAccountExpense({ ...expenseInput, idempotencyKey: indexedKey, reference: 'BILL-IDX', description: 'Indexed concurrent', amount: 15 }),
    recordCompanyAccountExpense({ ...expenseInput, idempotencyKey: indexedKey, reference: 'BILL-IDX', description: 'Indexed concurrent', amount: 15 })
  ]);
  (global as any).__companyExpenseClaimDelayMs = 0;
  const indexedTx = (await CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === indexedKey));
  assert(indexedResults.some((row) => row.status === 'fulfilled'), 'with the claim unique index, one concurrent request records the expense');
  assert(indexedTx.length === 1, 'with the claim unique index, concurrent requests leave one expense');
  assert(await JournalEntry.countDocuments({ sourceId: `company-expense:${company._id}:${indexedKey}` }) === 1, 'with the claim unique index, concurrent requests leave one journal');

  let conflicted = false;
  try {
    await recordCompanyAccountExpense({ ...expenseInput, amount: 99 });
  } catch (error) {
    conflicted = error instanceof CompanyExpenseIdempotencyError;
  }
  assert(conflicted, 'the same expense key with a different amount is rejected');
  assert(expenseAccounts && (await CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === expenseInput.idempotencyKey)).length === 1, 'a conflicting payload does not add a transaction');

  const failedKey = 'company-expense:failed-post';
  let postFailed = false;
  try {
    await recordCompanyAccountExpense({
      ...expenseInput,
      idempotencyKey: failedKey,
      reference: 'BILL-FAIL',
      description: 'PHASE_FAIL_EXPENSE_POST',
      amount: 21
    });
  } catch {
    postFailed = true;
  }
  assert(postFailed, 'a failed expense posting is propagated');
  const failedStored = (await CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === failedKey));
  assert(failedStored.length === 1 && failedStored[0].amount === 21, 'the failed posting keeps the original expense amount');
  const retriedPost = await recordCompanyAccountExpense({
    ...expenseInput,
    idempotencyKey: failedKey,
    reference: 'BILL-FAIL',
    description: 'PHASE_FAIL_EXPENSE_POST',
    amount: 21
  });
  assert(retriedPost.reused === true, 'retry after a failed posting reuses the expense');
  assert(await JournalEntry.countDocuments({ sourceId: `company-expense:${company._id}:${failedKey}` }) === 1, 'retry after a failed posting leaves one journal');

  await recordCompanyAccountExpense({ ...expenseInput, idempotencyKey: 'company-expense:other-key', reference: 'BILL-OTHER', description: 'Other bill', amount: 8 });
  await recordCompanyAccountExpense({ ...expenseInput, companyId: String(otherCompany._id), idempotencyKey: expenseInput.idempotencyKey, reference: 'BILL-40', description: 'Rates' });
  assert((await CompanyAccount.find({ companyId: otherCompany._id })).flatMap((account) => account.transactions).length === 1, 'the same key in another company is a separate expense');

  delete process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS;
  const afterStoredExpense = await inspectCompanyExpenseUniqueness();
  assert(afterStoredExpense.available === false, 'a stored expense transaction does not make the idempotency guarantee available');
  let closedAfterSuccess = false;
  try {
    await recordCompanyAccountExpense({ ...expenseInput, idempotencyKey: 'company-expense:after-close', reference: 'BILL-CLOSED', description: 'Closed again', amount: 3 });
  } catch (error) {
    closedAfterSuccess = error instanceof CompanyExpenseUniquenessUnverifiedError;
  }
  assert(closedAfterSuccess, 'removing the attestation closes keyed expenses again');
  assert(await CompanyExpenseClaim.countDocuments({ idempotencyKey: 'company-expense:after-close' }) === 0, 'a closed gate does not add a claim after an earlier success');

  process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS = 'verified';
  (global as any).__failExpenseUniquenessProbe = true;
  let probeFailed = false;
  try {
    await recordCompanyAccountExpense({ ...expenseInput, idempotencyKey: 'company-expense:probe-fail', reference: 'BILL-PROBE', description: 'Probe fail', amount: 4 });
  } catch (error) {
    probeFailed = error instanceof CompanyExpenseUniquenessUnverifiedError;
  }
  assert(probeFailed, 'a failed uniqueness probe refuses the keyed expense');
  assert(await CompanyExpenseClaim.countDocuments({ idempotencyKey: 'company-expense:probe-fail' }) === 0, 'a failed uniqueness probe writes no claim');

  const missingKey = 'company-expense:missing-claim';
  (global as any).__companyExpenseDuplicateKey = {
    pattern: { companyId: 1, idempotencyKey: 1 },
    value: { companyId: company._id, idempotencyKey: missingKey }
  };
  let missingClaim = false;
  try {
    await recordCompanyAccountExpense({ ...expenseInput, idempotencyKey: missingKey, reference: 'BILL-MISS', description: 'Missing claim', amount: 6 });
  } catch {
    missingClaim = true;
  }
  assert(missingClaim, 'a duplicate key with no stored claim is propagated');
  assert(await CompanyExpenseClaim.countDocuments({ idempotencyKey: missingKey }) === 0, 'a missing claim is not invented');

  const unknownKey = 'company-expense:unknown-index';
  (global as any).__companyExpenseDuplicateKey = { pattern: { otherField: 1 }, value: { otherField: 'x' } };
  let unknownDuplicate = false;
  try {
    await recordCompanyAccountExpense({ ...expenseInput, idempotencyKey: unknownKey, reference: 'BILL-UNK', description: 'Unknown index', amount: 7 });
  } catch (error) {
    unknownDuplicate = !(error instanceof CompanyExpenseIdempotencyError) && !(error instanceof CompanyExpenseUniquenessUnverifiedError);
  }
  assert(unknownDuplicate, 'a duplicate key without the claim identity metadata is propagated');
  assert(await CompanyExpenseClaim.countDocuments({ idempotencyKey: unknownKey }) === 0, 'an unidentified duplicate key writes no claim');

  await CompanyExpenseClaim.collection.dropIndex('company_expense_claim_identity');
  const ambiguousKey = 'company-expense:ambiguous-claims';
  await CompanyExpenseClaim.create({ companyId: company._id, idempotencyKey: ambiguousKey, fingerprint: 'a', amount: 9, type: 'expense', status: 'claimed' });
  await CompanyExpenseClaim.create({ companyId: company._id, idempotencyKey: ambiguousKey, fingerprint: 'b', amount: 9, type: 'expense', status: 'claimed' });
  let ambiguousClaims = false;
  try {
    await recordCompanyAccountExpense({ ...expenseInput, idempotencyKey: ambiguousKey, reference: 'BILL-AMB', description: 'Ambiguous', amount: 9 });
  } catch (error) {
    ambiguousClaims = error instanceof CompanyExpenseUniquenessUnverifiedError;
  }
  assert(ambiguousClaims, 'conflicting claims stay closed when the unique index is absent');
  assert((await CompanyAccount.find({ companyId: company._id })).flatMap((account) => account.transactions.filter((tx) => tx.idempotencyKey === ambiguousKey)).length === 0, 'conflicting claims do not append an expense');

  delete process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS;
  const unkeyedA = await recordCompanyAccountExpense({ companyId: String(company._id), amount: 5, description: 'No key', date: expenseDate });
  const unkeyedB = await recordCompanyAccountExpense({ companyId: String(company._id), amount: 5, description: 'No key', date: expenseDate });
  assert(String(unkeyedA.transaction._id) !== String(unkeyedB.transaction._id), 'two expenses without an idempotency key stay separate');

  const tenant = await Tenant.create({
    firstName: 'Gap', lastName: 'Tenant', email: 'gap-tenant@example.test', phone: '0771111401',
    companyId: company._id, ownerId: user._id, status: 'Active'
  });
  let ownerSequence = 0;
  async function ownerPayment(notes: string, propertyId = firstProperty._id) {
    ownerSequence += 1;
    return Payment.create({
      companyId: company._id, propertyId, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
      propertyType: 'residential', amount: 100, depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer',
      status: 'completed', paymentDate: expenseDate, rentalPeriodMonth: ownerSequence, rentalPeriodYear: 2026,
      transactionDomain: 'RENTAL', commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false,
      referenceNumber: `GAP-${ownerSequence}`, notes, idempotencyKey: `gap:${new mongoose.Types.ObjectId().toString()}`,
      commissionDetails: { ownerAmount: 0, agencyShare: 0, agentShare: 0, preaFee: 0, totalCommission: 0 }
    });
  }
  const ownerProperty = await makeProperty(company, 'Owner Income House');
  const missingOwner = await ownerPayment('owner-missing', ownerProperty._id);
  const missingResult = await postPaymentAccounting(String(missingOwner._id));
  assert(missingResult.artifacts.ownerIncome === 'failed', 'owner-income failure stays failed');
  assert(missingResult.status !== 'posted', 'owner-income failure does not mark accounting posted');
  assert((await Payment.findById(missingOwner._id))?.accountingComplete !== true, 'owner-income failure does not mark accounting complete');
  assert(await AccountingException.countDocuments({ paymentId: missingOwner._id, kind: 'incomplete_projection', component: 'ownerIncome' }) === 1, 'the owner-income exception is recorded once');
  assert(await LedgerEvent.countDocuments({ paymentId: missingOwner._id, type: 'owner_income', failureClass: 'permanent' }) === 1, 'the owner-income failure is stored on one ledger event');
  const repeatedOwner = await postPaymentAccounting(String(missingOwner._id));
  assert(repeatedOwner.artifacts.ownerIncome === 'failed', 'a repeated owner-income failure stays failed');
  assert(await LedgerEvent.countDocuments({ paymentId: missingOwner._id, type: 'owner_income' }) === 1, 'a repeated owner-income failure does not create another ledger event');
  assert(await PropertyAccount.countDocuments({ 'transactions.idempotencyKey': `payment:${missingOwner._id}` }) === 0, 'a repeated owner-income failure does not create an income row');

  const hidden = await ownerPayment('PHASE_FAIL_EXCEPTION_RECORD', ownerProperty._id);
  const hiddenResult = await postPaymentAccounting(String(hidden._id));
  assert(hiddenResult.artifacts.ownerIncome === 'failed', 'a failed exception write keeps owner income failed');
  assert(await AccountingException.countDocuments({ paymentId: hidden._id, kind: 'incomplete_projection' }) === 0, 'the failed exception write does not pretend the exception exists');
  assert(await LedgerEvent.countDocuments({ paymentId: hidden._id, type: 'owner_income', status: 'failed' }) === 1, 'a failed exception write remains visible on the ledger event');
  assert((await Payment.findById(hidden._id))?.accountingComplete !== true, 'a failed exception write does not mark accounting complete');

  const invisible = await ownerPayment('PHASE_FAIL_LEDGER_RECORD PHASE_FAIL_EXCEPTION_RECORD PHASE_FAIL_EXCEPTION_VISIBILITY', ownerProperty._id);
  const invisibleResult = await postPaymentAccounting(String(invisible._id));
  assert(invisibleResult.status !== 'posted', 'a failed visibility write does not mark accounting posted');
  assert(invisibleResult.errors.some((error) => error.includes('not durably recorded')), 'a failed visibility write remains in the posting result');
  assert(await AccountingException.countDocuments({ paymentId: invisible._id }) === 0, 'both exception writes can fail without a database row');
  assert(await LedgerEvent.countDocuments({ paymentId: invisible._id }) === 0, 'a database outage leaves no ledger event either');
  const rediscovered = await detectFinancialPostingGaps(String(company._id));
  assert(rediscovered.some((row) => row.paymentId === String(invisible._id) && row.issueType === 'OWNER_INCOME_AMOUNT_MISSING'), 'a later integrity pass rediscovers the owner-income failure from the payment');

  await upsertFinancialReview({
    companyId: String(company._id),
    component: 'LEDGER_RETRY_EXHAUSTED',
    operationId: 'review-row',
    missingRecord: 'ledger event',
    issueType: 'missing',
    actual: 'permanent',
    recommendedReview: 'Do not repair this historical row.'
  });
  const integrity = await listCompanyAccountingInconsistencies(String(company._id), { component: 'LEDGER_RETRY_EXHAUSTED' });
  const reviewRow = integrity.items.find((item) => item.operationId === 'review-row');
  assert(Boolean(reviewRow) && reviewRow.canRepair === false, 'the generic repair action stays disabled for a financial review');

  const transient = await LedgerEvent.create({
    type: 'levy_collection', companyId: company._id, status: 'failed', failureClass: 'transient',
    attemptCount: 8, correlationId: 'corr-transient'
  });
  const permanent = await LedgerEvent.create({
    type: 'levy_collection', companyId: company._id, status: 'failed', failureClass: 'permanent', attemptCount: 8
  });
  const conflictEvent = await LedgerEvent.create({
    type: 'levy_collection', companyId: company._id, status: 'failed', failureClass: 'conflict', attemptCount: 8
  });
  let permanentCode = '';
  try {
    await ledgerEventService.retryFailedEvent(String(permanent._id), String(company._id), { userId: String(user._id), requestId: 'corr-permanent' });
  } catch (error: any) {
    permanentCode = error?.code || '';
  }
  let conflictCode = '';
  try {
    await ledgerEventService.retryFailedEvent(String(conflictEvent._id), String(company._id), { userId: String(user._id), requestId: 'corr-conflict' });
  } catch (error: any) {
    conflictCode = error?.code || '';
  }
  assert(permanentCode === 'LEDGER_EVENT_NOT_RETRYABLE', 'a permanent ledger failure cannot be retried');
  assert(conflictCode === 'LEDGER_EVENT_NOT_RETRYABLE', 'a conflict ledger failure cannot be retried');
  assert((await LedgerEvent.findById(permanent._id))?.attemptCount === 8, 'a refused permanent retry does not change the event');
  assert(await LedgerEvent.countDocuments({ _id: permanent._id }) === 1, 'a refused retry does not create another event');

  let otherCode = '';
  try {
    await ledgerEventService.retryFailedEvent(String(transient._id), String(otherCompany._id), { userId: String(user._id), requestId: 'corr-other' });
  } catch (error: any) {
    otherCode = error?.code || '';
  }
  assert(otherCode === 'LEDGER_EVENT_COMPANY_MISMATCH', 'another company cannot retry the event');

  const concurrentRetry = await Promise.allSettled([
    ledgerEventService.retryFailedEvent(String(transient._id), String(company._id), { userId: String(user._id), requestId: 'corr-retry' }),
    ledgerEventService.retryFailedEvent(String(transient._id), String(company._id), { userId: String(user._id), requestId: 'corr-retry' })
  ]);
  assert(await LedgerEvent.countDocuments({ _id: transient._id }) === 1, 'concurrent retries do not create a second ledger event');
  assert(concurrentRetry.filter((row) => row.status === 'fulfilled').length === 0, 'the incomplete levy retry does not report success');
  const retryAudit = await AuditLog.findOne({
    action: 'ledger.retry',
    entityId: String(transient._id),
    status: 'failure',
    'metadata.correlationId': 'corr-retry'
  }).lean();
  assert(Boolean(retryAudit), 'a ledger retry writes an audit event');
  assert(String((retryAudit as any)?.userId || '') === String(user._id), 'the audit event identifies the operator');
  assert((retryAudit as any)?.metadata?.correlationId === 'corr-retry', 'the audit event identifies the correlation id');
  assert((retryAudit as any)?.metadata?.operation === 'levy_collection', 'the audit event identifies the operation');

  let unauthenticated = 0;
  await auth({ headers: {}, cookies: {} } as any, {
    status(code: number) { unauthenticated = code; return this; },
    json() { return this; }
  } as any, () => { unauthenticated = 200; });
  assert(unauthenticated === 401, 'an unauthenticated request cannot pass the accountant route authentication');

  const agentBlocked = await new Promise<number>((resolve) => {
    try {
      canViewAccountantDashboard({ user: { role: 'agent', roles: ['agent'], companyId: company._id } } as any, {} as any, () => resolve(200));
    } catch (error: any) {
      resolve(error?.statusCode || 403);
    }
  });
  assert(agentBlocked === 403, 'an agent cannot use the accountant retry authorisation');

  let controllerStatus = 0;
  await retryFailedLedgerEvent({ user: undefined, params: { id: String(transient._id) }, get: () => undefined } as any, {
    status(code: number) { controllerStatus = code; return this; },
    json() { return this; }
  } as any);
  assert(controllerStatus === 401, 'the retry controller rejects a missing user');

  const adminAllowed = await new Promise<number>((resolve) => {
    try {
      canViewAccountantDashboard({ user: { role: 'admin', roles: ['admin'], companyId: company._id } } as any, {} as any, () => resolve(200));
    } catch (error: any) {
      resolve(error?.statusCode || 403);
    }
  });
  assert(adminAllowed === 200, 'an admin can use the accountant retry authorisation');

  const auditGate = await LedgerEvent.create({
    type: 'levy_collection', companyId: company._id, status: 'failed', failureClass: 'transient', attemptCount: 8
  });
  (global as any).__failAuditResult = 'started';
  let auditGateCode = '';
  try {
    await ledgerEventService.retryFailedEvent(String(auditGate._id), String(company._id), { userId: String(user._id), requestId: 'corr-audit-gate' });
  } catch (error: any) {
    auditGateCode = error?.code || '';
  }
  (global as any).__failAuditResult = undefined;
  assert(auditGateCode === 'AUDIT_PERSIST_FAILED', 'a retry does not start when the audit event cannot be stored');
  assert((await LedgerEvent.findById(auditGate._id))?.status === 'failed', 'a blocked audit leaves the ledger event unclaimed');

  const journalBefore = await JournalEntry.countDocuments({ sourceId: String(missingOwner._id), sourceModule: 'payment' });
  const journalRetry = await LedgerEvent.create({
    type: 'journal', paymentId: missingOwner._id, companyId: company._id, status: 'failed',
    failureClass: 'transient', attemptCount: 8, correlationId: 'corr-journal-audit'
  });
  (global as any).__failAuditResult = 'completed';
  const journalResult = await ledgerEventService.retryFailedEvent(String(journalRetry._id), String(company._id), { userId: String(user._id), requestId: 'corr-journal-audit' });
  (global as any).__failAuditResult = undefined;
  assert(journalResult.status === 'completed' && journalResult.auditPersisted === false, 'a completed retry reports that the audit event was not stored');
  assert((await LedgerEvent.findById(journalRetry._id))?.status === 'completed', 'a missing audit event does not undo the completed retry');
  assert(await JournalEntry.countDocuments({ sourceId: String(missingOwner._id), sourceModule: 'payment' }) === journalBefore, 'a missing audit event does not create another journal');
  assert(await AccountingException.countDocuments({ component: 'AUDIT_EVENT_MISSING', 'accountingRef.transactionId': String(journalRetry._id) }) === 1, 'a missing audit event is recorded for review');
  let repeatedRetry = '';
  try {
    await ledgerEventService.retryFailedEvent(String(journalRetry._id), String(company._id), { userId: String(user._id), requestId: 'corr-journal-audit-again' });
  } catch (error: any) {
    repeatedRetry = error?.code || '';
  }
  assert(repeatedRetry === 'LEDGER_EVENT_NOT_RETRYABLE', 'a completed retry is not posted again after an audit gap');
  assert(await JournalEntry.countDocuments({ sourceId: String(missingOwner._id), sourceModule: 'payment' }) === journalBefore, 'a repeated retry after an audit gap does not add a journal');

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS integrity gap tests on local MongoDB. Cosmos DB was not used.');
  await mongoose.disconnect();
  await accountingConnection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
