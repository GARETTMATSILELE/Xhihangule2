import assert from 'assert';
import mongoose from 'mongoose';
import {
  buildOwnerIncomeReconciliationPaymentFilter,
  isRecordIncomeEarlyExit
} from '../services/paymentReconciliationQuery';
import { canMutateLease, isLeaseAvailable } from '../services/jobLeaseGuards';

const companyA = new mongoose.Types.ObjectId().toString();
const companyB = new mongoose.Types.ObjectId().toString();

const run = () => {
  const filter = buildOwnerIncomeReconciliationPaymentFilter({ companyId: companyA });
  assert.strictEqual(String((filter as any).companyId), companyA, 'company-scoped filter uses company A');
  assert.strictEqual(filter.status, 'completed');
  assert.deepStrictEqual((filter as any).amount, { $gte: 0 });
  assert.ok(!('paymentDate' in filter), 'global/company sync must not date-cut old failed payments');

  const other = buildOwnerIncomeReconciliationPaymentFilter({ companyId: companyB });
  assert.notStrictEqual(String((other as any).companyId), companyA, 'company B filter is isolated');

  const windowed = buildOwnerIncomeReconciliationPaymentFilter({
    paymentDateFrom: new Date('2026-01-01T00:00:00.000Z')
  });
  assert.ok((windowed as any).paymentDate?.$gte instanceof Date, '48h safety net keeps a paymentDate window');
  assert.ok(!windowed.companyId, 'ledger recon without companyId remains global');

  assert.strictEqual(
    isRecordIncomeEarlyExit({ status: 'completed', amount: 100, depositAmount: 0 }),
    false,
    'normal completed payment remains eligible'
  );
  assert.strictEqual(
    isRecordIncomeEarlyExit({ status: 'completed', amount: 50, depositAmount: 50 }),
    true,
    'deposit-only matches recordIncomeFromPayment early exit'
  );
  assert.strictEqual(
    isRecordIncomeEarlyExit({ status: 'completed', amount: 100, reversalOfPaymentId: companyA }),
    true,
    'reversal rows are not selected for income posting'
  );
  assert.strictEqual(
    isRecordIncomeEarlyExit({ status: 'failed', amount: 100 }),
    true,
    'non-completed payments are not selected'
  );
  assert.strictEqual(
    isRecordIncomeEarlyExit({ status: 'completed', amount: 200, depositAmount: 50 }),
    false,
    'old completed payment with deposit portion remains eligible'
  );

  const now = new Date('2026-08-27T12:00:00.000Z');
  assert.strictEqual(isLeaseAvailable(null, now), true, 'missing lease document is acquirable');
  assert.strictEqual(isLeaseAvailable({ ownerToken: '', leaseExpiresAt: now }, now), true);
  assert.strictEqual(
    isLeaseAvailable({ ownerToken: 'worker-a', leaseExpiresAt: new Date(now.getTime() - 1000) }, now),
    true,
    'expired lease is recoverable after crash'
  );
  assert.strictEqual(
    isLeaseAvailable({ ownerToken: 'worker-a', leaseExpiresAt: new Date(now.getTime() + 60_000) }, now),
    false,
    'second worker cannot acquire a valid lease'
  );
  assert.strictEqual(canMutateLease({ ownerToken: 'worker-a' }, 'worker-a'), true);
  assert.strictEqual(canMutateLease({ ownerToken: 'worker-a' }, 'worker-b'), false, 'owner cannot release another worker lock');

  assert.throws(
    () => buildOwnerIncomeReconciliationPaymentFilter({ companyId: 'not-an-id' }),
    /Invalid companyId/
  );

  console.log('phase2a safety tests passed');
};

run();
