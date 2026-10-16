/**
 * Expense journal idempotency. Disposable local MongoDB only.
 * Not a Cosmos DB result.
 */
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { JournalEntry } from '../models/JournalEntry';
import { JournalLine } from '../models/JournalLine';
import { AccountingException } from '../models/AccountingException';
import accountingIntegrationService from '../services/accountingIntegrationService';
import { ExpenseSyncError } from '../services/operationalFailure';
import { accountingConnection } from '../config/database';

const DB = process.env.EXPENSE_SYNC_DB || 'mongodb://127.0.0.1:27017/mantis_expense_sync_test';
const ACCOUNTING_DB = process.env.EXPENSE_SYNC_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_expense_sync_accounting';
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

async function debit(companyId: mongoose.Types.ObjectId, sourceId: string) {
  const journal = await JournalEntry.findOne({ companyId, sourceModule: 'expense', sourceId }).lean();
  if (!journal) return { journal: null as any, debit: 0 };
  const lines = await JournalLine.find({ journalEntryId: journal._id }).select('debit credit').lean();
  return {
    journal,
    debit: lines.reduce((sum, line: any) => sum + Number(line.debit || 0), 0)
  };
}

async function main() {
  process.env.MANTIS_TEST_SEAM = '1';
  process.env.NODE_ENV = 'development';
  try {
    await mongoose.connect(DB, { serverSelectionTimeoutMS: 4000 });
  } catch (error: any) {
    console.log(`INTEGRATION SKIPPED: local MongoDB unavailable (${error?.message || error}). Not a Cosmos DB result.`);
    process.exit(0);
  }
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await JournalEntry.syncIndexes();
  await JournalLine.syncIndexes();

  const user = await User.create({
    email: 'expense-sync@example.test', password: 'test-pass-1', firstName: 'Expense', lastName: 'Sync',
    role: 'admin', roles: ['admin'], isActive: true, sessionVersion: 1
  });
  const company = await Company.create({
    name: 'Expense Co', address: '1 Expense Street', phone: '0770000101', email: 'expense-co@example.test',
    registrationNumber: 'EXP-1', tinNumber: 'EXP-TIN', country: 'Zimbabwe', ownerId: user._id
  });
  const other = await Company.create({
    name: 'Other Expense Co', address: '2 Expense Street', phone: '0770000102', email: 'other-expense@example.test',
    registrationNumber: 'EXP-2', tinNumber: 'EXP-TIN-2', country: 'Zimbabwe', ownerId: user._id
  });

  await accountingIntegrationService.syncExpenseCreated({
    companyId: String(company._id), sourceId: 'expense-1', reference: 'EXP-1', amount: 40, description: 'Rates'
  });
  const first = await debit(company._id, 'expense-1');
  assert(Boolean(first.journal), 'first expense synchronisation writes a journal');
  assert(Math.abs(first.debit - 40) < 0.001, 'first expense journal debit equals the amount');

  await accountingIntegrationService.syncExpenseCreated({
    companyId: String(company._id), sourceId: 'expense-1', reference: 'EXP-1', amount: 40, description: 'Rates'
  });
  const repeated = await debit(company._id, 'expense-1');
  assert(String(repeated.journal?._id) === String(first.journal?._id), 'repeated sync keeps the same journal');
  assert(Math.abs(repeated.debit - 40) < 0.001, 'repeated sync does not change the amount');
  assert(await JournalEntry.countDocuments({ companyId: company._id, sourceId: 'expense-1' }) === 1, 'repeated sync does not add a journal');

  await Promise.all([
    accountingIntegrationService.syncExpenseCreated({ companyId: String(company._id), sourceId: 'expense-concurrent', reference: 'EXP-CON', amount: 15, description: 'Concurrent' }),
    accountingIntegrationService.syncExpenseCreated({ companyId: String(company._id), sourceId: 'expense-concurrent', reference: 'EXP-CON', amount: 15, description: 'Concurrent' })
  ]);
  assert(await JournalEntry.countDocuments({ companyId: company._id, sourceId: 'expense-concurrent' }) === 1, 'concurrent sync leaves one journal');

  await JournalEntry.collection.createIndex({ description: 1 }, { unique: true, name: 'test_expense_description_unique' });
  await accountingIntegrationService.syncExpenseCreated({
    companyId: String(company._id), sourceId: 'expense-desc-a', reference: 'EXP-DESC-A', amount: 8, description: 'shared-description'
  });
  let unrelatedThrew = false;
  try {
    await accountingIntegrationService.syncExpenseCreated({
      companyId: String(company._id), sourceId: 'expense-desc-b', reference: 'EXP-DESC-B', amount: 9, description: 'shared-description'
    });
  } catch (error) {
    unrelatedThrew = error instanceof ExpenseSyncError;
  }
  assert(unrelatedThrew, 'an unrelated duplicate-key conflict is propagated');
  const kept = await debit(company._id, 'expense-desc-a');
  assert(Math.abs(kept.debit - 8) < 0.001, 'the unrelated conflict does not change the first expense');
  assert(await JournalEntry.countDocuments({ sourceId: 'expense-desc-b' }) === 0, 'the unrelated conflict does not write the second expense');
  await JournalEntry.collection.dropIndex('test_expense_description_unique');

  let afterWriteThrew = false;
  try {
    await accountingIntegrationService.syncExpenseCreated({
      companyId: String(company._id), sourceId: 'expense-after', reference: 'EXP-AFTER', amount: 21, description: 'PHASE_FAIL_EXPENSE_AFTER'
    });
  } catch (error) {
    afterWriteThrew = error instanceof ExpenseSyncError;
  }
  assert(afterWriteThrew, 'a failure after the journal write is propagated');
  const afterFirst = await debit(company._id, 'expense-after');
  assert(Math.abs(afterFirst.debit - 21) < 0.001, 'the journal remains after the later failure');
  await accountingIntegrationService.syncExpenseCreated({
    companyId: String(company._id), sourceId: 'expense-after', reference: 'EXP-AFTER', amount: 21, description: 'PHASE_FAIL_EXPENSE_AFTER'
  });
  const afterRetry = await debit(company._id, 'expense-after');
  assert(String(afterRetry.journal?._id) === String(afterFirst.journal?._id), 'retry after a later failure keeps the journal');
  assert(Math.abs(afterRetry.debit - 21) < 0.001, 'retry after a later failure does not change the amount');

  let partialThrew = false;
  try {
    await accountingIntegrationService.syncExpenseCreated({
      companyId: String(company._id), sourceId: 'expense-partial', reference: 'EXP-PARTIAL', amount: 12, description: 'PHASE_FAIL_EXPENSE_POST'
    });
  } catch (error) {
    partialThrew = error instanceof ExpenseSyncError;
  }
  assert(partialThrew, 'a failure before the journal write is propagated');
  assert(await JournalEntry.countDocuments({ sourceId: 'expense-partial' }) === 0, 'a pre-write failure leaves no journal');
  await accountingIntegrationService.syncExpenseCreated({
    companyId: String(company._id), sourceId: 'expense-partial', reference: 'EXP-PARTIAL', amount: 12, description: 'PHASE_FAIL_EXPENSE_POST'
  });
  const partial = await debit(company._id, 'expense-partial');
  assert(Math.abs(partial.debit - 12) < 0.001, 'retry after a pre-write failure writes the journal once');

  let missingThrew = false;
  try {
    await accountingIntegrationService.syncExpenseCreated({ companyId: String(company._id), sourceId: '', reference: 'EXP-MISSING', amount: 5 });
  } catch (error) {
    missingThrew = error instanceof ExpenseSyncError && (error as ExpenseSyncError).failureClass === 'permanent';
  }
  assert(missingThrew, 'a missing source id is a permanent error');

  await accountingIntegrationService.syncExpenseCreated({
    companyId: String(company._id), sourceId: 'expense-ref-owner', reference: 'EXP-SHARED-REF', amount: 6, description: 'owner'
  });
  let conflictThrew = false;
  try {
    await accountingIntegrationService.syncExpenseCreated({
      companyId: String(company._id), sourceId: 'expense-ref-other', reference: 'EXP-SHARED-REF', amount: 60, description: 'other source'
    });
  } catch (error) {
    conflictThrew = error instanceof ExpenseSyncError;
  }
  assert(conflictThrew, 'a reference owned by another source is not treated as this expense');
  const ownerDebit = await debit(company._id, 'expense-ref-owner');
  assert(Math.abs(ownerDebit.debit - 6) < 0.001, 'the conflicting source does not overwrite the existing amount');

  await accountingIntegrationService.syncExpenseCreated({
    companyId: String(other._id), sourceId: 'expense-1', reference: 'EXP-OTHER-1', amount: 70, description: 'other company'
  });
  const otherDebit = await debit(other._id, 'expense-1');
  const originalStill = await debit(company._id, 'expense-1');
  assert(Math.abs(otherDebit.debit - 70) < 0.001, 'the other company receives its own journal');
  assert(Math.abs(originalStill.debit - 40) < 0.001, 'company isolation keeps the first company amount');

  let duplicateReviews = 0;
  try {
    await accountingIntegrationService.syncExpenseCreated({
      companyId: String(company._id), sourceId: 'expense-review', reference: 'EXP-REVIEW', amount: 4, description: 'PHASE_FAIL_EXPENSE_POST'
    });
  } catch { /* expected */ }
  try {
    await accountingIntegrationService.syncExpenseCreated({
      companyId: String(company._id), sourceId: 'expense-review', reference: 'EXP-REVIEW', amount: 4, description: 'PHASE_FAIL_EXPENSE_POST review again'
    });
  } catch { /* seam already fired, this call should succeed */ }
  duplicateReviews = await AccountingException.countDocuments({ companyId: company._id, component: 'EXPENSE_SYNC_FAILED', 'accountingRef.transactionId': 'expense-review' });
  assert(duplicateReviews === 1, `one expense exception is stored, got ${duplicateReviews}`);

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS expense synchronisation tests on local MongoDB. Cosmos DB was not used.');
  await mongoose.disconnect();
  await accountingConnection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
