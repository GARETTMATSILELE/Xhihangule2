import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  buildOwnerRentEmail,
  deliverOwnerRentNotice,
  ownerRentEmailDecision,
  ownerRentIdempotencyKey,
  OwnerRentNoticeStatus,
} from '../services/ownerRentNotificationPolicy';
import { assertOwnerCollectionTransition } from '../services/ownerCollectionService';

function src(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

async function main() {
  const results: Record<string, string> = {};

  assert.strictEqual(ownerRentEmailDecision(undefined), 'send');
  assert.strictEqual(ownerRentEmailDecision(true), 'send');
  assert.strictEqual(ownerRentEmailDecision(false), 'skip');
  results['Owner opt-out suppresses email'] = 'PASS';

  const email = buildOwnerRentEmail({
    ownerName: 'Owner A',
    propertyName: 'Borrowdale Example',
    amount: 1000,
    currency: 'USD',
    paymentDate: new Date('2026-10-01'),
    agencyName: 'The Benjamins Realty',
  });
  assert.ok(email.text.includes('USD 1000.00'));
  assert.ok(email.text.includes('Borrowdale Example'));
  assert.ok(!/national id|tenant id|bank/i.test(email.text));
  results['Owner email content'] = 'PASS';

  const sent: string[] = [];
  const store = new Map<string, { status: OwnerRentNoticeStatus }>();
  const key = ownerRentIdempotencyKey('pay-1');
  const deps = {
    async findByKey(k: string) { return store.get(k) || null; },
    async save(doc: { idempotencyKey: string; status: OwnerRentNoticeStatus }) { store.set(doc.idempotencyKey, { status: doc.status }); },
    async send() { sent.push('mail'); },
  };
  assert.strictEqual(await deliverOwnerRentNotice({ idempotencyKey: key, ownerEmail: 'a@example.com', rentPaymentEmails: true, accountingComplete: true, email }, deps), 'SENT');
  assert.strictEqual(await deliverOwnerRentNotice({ idempotencyKey: key, ownerEmail: 'a@example.com', rentPaymentEmails: true, accountingComplete: true, email }, deps), 'SENT');
  assert.strictEqual(sent.length, 1);
  results['Notification retry does not send a second email'] = 'PASS';

  const opted = new Map<string, { status: OwnerRentNoticeStatus }>();
  let optedSends = 0;
  const skip = await deliverOwnerRentNotice({
    idempotencyKey: ownerRentIdempotencyKey('pay-2'),
    ownerEmail: 'a@example.com',
    rentPaymentEmails: false,
    accountingComplete: true,
    email,
  }, {
    async findByKey(k) { return opted.get(k) || null; },
    async save(doc) { opted.set(doc.idempotencyKey, { status: doc.status }); },
    async send() { optedSends += 1; },
  });
  assert.strictEqual(skip, 'SKIPPED_OPT_OUT');
  assert.strictEqual(optedSends, 0);
  results['Opted-out owner receives no email'] = 'PASS';

  let failedSends = 0;
  const failed = await deliverOwnerRentNotice({
    idempotencyKey: ownerRentIdempotencyKey('pay-3'),
    ownerEmail: 'a@example.com',
    rentPaymentEmails: true,
    accountingComplete: true,
    email,
  }, {
    async findByKey() { return null; },
    async save() { return; },
    async send() { failedSends += 1; throw new Error('smtp down'); },
  });
  assert.strictEqual(failed, 'FAILED');
  assert.strictEqual(failedSends, 1);
  results['Email failure is recorded and does not throw'] = 'PASS';

  assertOwnerCollectionTransition('OWNER_REQUESTED', 'READY_FOR_COLLECTION');
  assertOwnerCollectionTransition('READY_FOR_COLLECTION', 'COLLECTED');
  assertOwnerCollectionTransition('COLLECTED', 'ACKNOWLEDGED');
  assert.throws(() => assertOwnerCollectionTransition('OWNER_REQUESTED', 'ACKNOWLEDGED'));
  results['Owner collection cannot skip statuses'] = 'PASS';

  const notice = src('services/ownerRentNotificationService.ts');
  const collection = src('services/ownerCollectionService.ts');
  const payment = src('controllers/paymentController.ts');
  assert.ok(!notice.includes('postPaymentAccounting'));
  assert.ok(!collection.includes('postPaymentAccounting'));
  assert.ok(payment.includes('accountingComplete: true'));
  assert.ok(payment.includes('if (postResult.accountingComplete === true)'));
  assert.ok(src('routes/accountantRoutes.ts').includes('accounting-integrity') || fs.readFileSync(path.join(__dirname, '../../../client/src/App.tsx'), 'utf8').includes('accounting-integrity'));
  const individual = fs.readFileSync(path.join(__dirname, '../../../client/src/pages/IndividualDashboard/components/Sidebar.tsx'), 'utf8');
  assert.ok(!individual.includes('owner-collections'));
  assert.ok(!individual.includes('Action Centre'));
  results['Accounting path and individual dashboard stay separate'] = 'PASS';

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
