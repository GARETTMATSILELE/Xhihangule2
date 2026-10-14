import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { explainOwnerWaterfall } from '../reporting/ownerWaterfall';
import { deliverOwnerRentNotice } from '../services/ownerRentNotificationPolicy';
import {
  classifyRentCollection,
  leaseActivationBlockers,
  listingBlockers,
  maintenanceRequestBlockers,
  nextAgencyAction,
} from '../agency/lettingWorkflow';
import { assertApplicationTransition } from '../ecosystem/workflowMachine';

function src(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

async function main() {
  const results: Record<string, string> = {};
  const waterfall = explainOwnerWaterfall({
    grossAmount: 1000,
    commissionAmount: 100,
    levyAmount: 100,
    vatOnCommission: 15.5,
    recordedOwnerAmount: 784.5,
  });
  assert.strictEqual(waterfall.netOwnerAmount, 784.5);
  assert.strictEqual(waterfall.reviewRequired, false);
  results['Borrowdale waterfall comes from explainOwnerWaterfall'] = 'PASS';

  const email = { subject: 'Rent', text: 'Amount received: USD 1000.00' };
  let sends = 0;
  const notReady = await deliverOwnerRentNotice({
    idempotencyKey: 'owner-rent-payment:pay-x',
    ownerEmail: 'owner@example.com',
    rentPaymentEmails: true,
    accountingComplete: false,
    email,
  }, {
    async findByKey() { return null; },
    async save() { throw new Error('must not save'); },
    async send() { sends += 1; },
  });
  assert.strictEqual(notReady, 'NOT_READY');
  assert.strictEqual(sends, 0);
  results['Incomplete accounting does not email the owner'] = 'PASS';

  assert.deepStrictEqual(listingBlockers({ assessmentStatus: 'ASSESSMENT_SUBMITTED', mandateStatus: 'SENT' }).length > 0, true);
  assert.deepStrictEqual(listingBlockers({ assessmentStatus: 'OWNER_APPROVED', mandateStatus: 'SIGNED' }), []);
  results['Listing requires approved assessment and signed mandate'] = 'PASS';

  assert.ok(leaseActivationBlockers({ applicationStatus: 'SHORTLISTED', tenantSignedAt: null, ownerSignedAt: null, depositRequired: 100, depositReceived: 0 }).includes('Owner approval required'));
  assert.ok(leaseActivationBlockers({ applicationStatus: 'OWNER_APPROVED', tenantSignedAt: null, ownerSignedAt: null, depositRequired: 100, depositReceived: 0 }).includes('Tenant signature required'));
  assert.ok(leaseActivationBlockers({ applicationStatus: 'OWNER_APPROVED', tenantSignedAt: new Date(), ownerSignedAt: null, depositRequired: 100, depositReceived: 0 }).includes('Deposit payment outstanding'));
  assert.ok(leaseActivationBlockers({ applicationStatus: 'OWNER_APPROVED', tenantSignedAt: new Date(), ownerSignedAt: null, depositRequired: 100, depositReceived: 100 }).includes('Owner signature required'));
  assert.deepStrictEqual(leaseActivationBlockers({ applicationStatus: 'OWNER_APPROVED', tenantSignedAt: new Date(), ownerSignedAt: new Date(), depositRequired: 100, depositReceived: 100 }), []);
  results['Lease activation gates'] = 'PASS';

  const due = new Date('2026-10-01');
  assert.strictEqual(classifyRentCollection({ dueDate: due, rent: 1000, received: 0, now: new Date('2026-10-01') }), 'DUE');
  assert.strictEqual(classifyRentCollection({ dueDate: due, rent: 1000, received: 0, now: new Date('2026-10-05') }), 'OVERDUE');
  assert.strictEqual(classifyRentCollection({ dueDate: due, rent: 1000, received: 400, now: new Date('2026-10-05') }), 'PARTIALLY_PAID');
  assert.strictEqual(classifyRentCollection({ dueDate: due, rent: 1000, received: 1000, now: new Date('2026-10-05') }), 'PAID');
  results['Rent collection board states'] = 'PASS';

  assert.ok(maintenanceRequestBlockers({ quoteStatus: 'SUBMITTED', approvedAmount: 100, requestedAmount: 100, agentAuthorised: true }).includes('Owner quote approval required'));
  assert.ok(maintenanceRequestBlockers({ quoteStatus: 'OWNER_APPROVED', approvedAmount: 100, requestedAmount: 100, agentAuthorised: false }).includes('Agent authorisation required'));
  assert.ok(maintenanceRequestBlockers({ quoteStatus: 'OWNER_APPROVED', approvedAmount: 100, requestedAmount: 150, agentAuthorised: true }).includes('Requested amount exceeds the approved quote'));
  assert.deepStrictEqual(maintenanceRequestBlockers({ quoteStatus: 'OWNER_APPROVED', approvedAmount: 100, requestedAmount: 100, agentAuthorised: true, quoteCompanyId: 'a', requestCompanyId: 'a' }), []);
  results['Maintenance payment request gates'] = 'PASS';

  assert.doesNotThrow(() => assertApplicationTransition('UNDER_REVIEW', 'SHORTLISTED'));
  assert.doesNotThrow(() => assertApplicationTransition('SHORTLISTED', 'SENT_TO_OWNER'));
  assert.doesNotThrow(() => assertApplicationTransition('SENT_TO_OWNER', 'OWNER_APPROVED'));
  assert.throws(() => assertApplicationTransition('UNDER_REVIEW', 'OWNER_APPROVED'));
  results['Application shortlist transitions'] = 'PASS';

  assert.strictEqual(nextAgencyAction({}), 'Complete assessment');
  assert.strictEqual(nextAgencyAction({ assessmentStatus: 'OWNER_APPROVED', mandateStatus: 'DRAFT' }), 'Obtain signed mandate');
  results['Next action is derived from records'] = 'PASS';

  const controller = src('agency/lettingController.ts');
  const collection = src('controllers/ownerCollectionController.ts');
  const individual = fs.readFileSync(path.join(__dirname, '../../../client/src/pages/IndividualDashboard/components/Sidebar.tsx'), 'utf8');
  assert.ok(controller.includes('financialPosting: false'));
  assert.ok(!controller.includes('postPaymentAccounting'));
  assert.ok(collection.includes('explainOwnerWaterfall'));
  assert.ok(collection.includes('OPERATIONAL_OVERRIDE'));
  assert.ok(!individual.includes('letting/portfolio'));
  assert.ok(src('ecosystem/routes.ts').includes('Owner approval is a separate gate'));
  results['No second accounting path and individual sidebar stays clear'] = 'PASS';

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
