/**
 * Paynow callback idempotency on a disposable local database.
 * Does not call Paynow and does not use the application database.
 */
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { PaymentSession } from '../models/PaymentSession';
import { Subscription } from '../models/Subscription';
import { WebhookEventReceipt } from '../models/WebhookEventReceipt';
import { AccountingException } from '../models/AccountingException';
import { applyPolledPayment } from '../services/applyPolledPayment';
import { paynowCheckoutDecision, paynowConfigurationState } from '../services/registrationPaymentPolicy';
import { claimPaynowEvent, processVerifiedPaynowEvent } from '../services/paynowCallbackService';
import { accountingConnection } from '../config/database';

const DB = process.env.PAYNOW_CALLBACK_DB || 'mongodb://127.0.0.1:27017/mantis_paynow_callback_test';
const ACCOUNTING_DB = process.env.PAYNOW_CALLBACK_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_paynow_callback_accounting';
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function paidPoll(reference: string) {
  return { status: 'paid', amount: 600, currency: 'USD', reference };
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
  await WebhookEventReceipt.syncIndexes();
  await PaymentSession.syncIndexes();

  const user = await User.create({
    email: 'paynow-callback@example.test', password: 'test-pass-1', firstName: 'Paynow', lastName: 'Callback',
    role: 'admin', roles: ['admin'], isActive: true, sessionVersion: 1
  });

  async function company(name: string, status = 'PENDING_PAYMENT') {
    return Company.create({
      name, address: '1 Callback Street', phone: '0770000201', email: `${name}@example.test`,
      registrationNumber: name, tinNumber: name, country: 'Zimbabwe', ownerId: user._id,
      onboardingStatus: status
    });
  }

  async function session(row: { companyId: any; reference: string; status?: string; seam?: string }) {
    return PaymentSession.create({
      companyId: row.companyId,
      userId: user._id,
      idempotencyKey: `paynow:${row.reference}:${new mongoose.Types.ObjectId().toString()}`,
      provider: 'paynow',
      providerRef: row.reference,
      plan: 'SME',
      billingCycle: 'monthly',
      amount: 600,
      currency: 'USD',
      status: row.status || 'provider_created',
      metadata: row.seam ? { testSeam: row.seam } : undefined
    });
  }

  async function deliver(reference: string, eventId: string, poll = paidPoll(reference), payloadFingerprint?: string) {
    return processVerifiedPaynowEvent({
      reference,
      eventId,
      payloadFingerprint,
      apply: () => applyPolledPayment(reference, poll)
    });
  }

  const registered = await company('Callback Co');
  await session({ companyId: registered._id, reference: 'REF-REPEAT' });
  const first = await deliver('REF-REPEAT', 'hash-repeat');
  const second = await deliver('REF-REPEAT', 'hash-repeat');
  assert(first.activated === true, 'the first paid callback activates registration');
  assert(second.status === 'duplicate' && second.activated === false, 'the same webhook event does not activate again');
  assert(await Subscription.countDocuments({ companyId: registered._id }) === 1, 'repeated delivery leaves one subscription');
  assert((await Company.findById(registered._id))?.onboardingStatus === 'INITIALIZING_WORKSPACE', 'registration moves to workspace initialisation');

  const concurrentCompany = await company('Concurrent Co');
  await session({ companyId: concurrentCompany._id, reference: 'REF-CONCURRENT' });
  const concurrent = await Promise.all([
    deliver('REF-CONCURRENT', 'hash-concurrent'),
    deliver('REF-CONCURRENT', 'hash-concurrent')
  ]);
  assert(concurrent.filter((row) => row.activated).length === 1, 'concurrent delivery of one event activates once');
  assert(await Subscription.countDocuments({ companyId: concurrentCompany._id }) === 1, 'concurrent delivery leaves one subscription');

  const partialCompany = await company('Partial Co');
  const partialSession = await session({ companyId: partialCompany._id, reference: 'REF-PARTIAL', seam: 'PHASE_FAIL_ACTIVATION_AFTER_PAID' });
  let partialThrew = false;
  try {
    await deliver('REF-PARTIAL', 'hash-partial');
  } catch {
    partialThrew = true;
  }
  assert(partialThrew, 'a failure after payment confirmation is propagated');
  assert((await PaymentSession.findById(partialSession._id))?.status === 'paid', 'the session stays paid after the activation failure');
  assert((await Company.findById(partialCompany._id))?.onboardingStatus === 'PENDING_PAYMENT', 'registration is not activated by the failed callback');
  const resumed = await deliver('REF-PARTIAL', 'hash-partial');
  assert(resumed.activated === true, 'retry after the partial failure resumes activation');
  assert((await PaymentSession.findById(partialSession._id))?.status === 'reconciled', 'the retried session is reconciled');
  assert((await Company.findById(partialCompany._id))?.onboardingStatus === 'INITIALIZING_WORKSPACE', 'retry activates registration once');
  assert(await Subscription.countDocuments({ companyId: partialCompany._id }) === 1, 'partial-failure retry leaves one subscription');

  const cancelledCompany = await company('Cancelled Co');
  const cancelled = await session({ companyId: cancelledCompany._id, reference: 'REF-CANCELLED', status: 'cancelled' });
  const cancelledResult = await deliver('REF-CANCELLED', 'hash-cancelled');
  assert(cancelledResult.ignored === true && cancelledResult.activated === false, 'a callback does not activate a cancelled checkout');
  assert((await PaymentSession.findById(cancelled._id))?.status === 'cancelled', 'the cancelled session stays cancelled');

  const failedCompany = await company('Failed Co');
  const failedSession = await session({ companyId: failedCompany._id, reference: 'REF-FAILED', status: 'failed' });
  const failedResult = await deliver('REF-FAILED', 'hash-failed');
  assert(failedResult.ignored === true && failedResult.activated === false, 'a delayed callback does not activate a failed checkout');
  assert((await PaymentSession.findById(failedSession._id))?.status === 'failed', 'the failed session stays failed');

  const expiredCompany = await company('Expired Co');
  const expiredSession = await session({ companyId: expiredCompany._id, reference: 'REF-EXPIRED', status: 'expired' });
  const expiredResult = await deliver('REF-EXPIRED', 'hash-expired');
  assert(expiredResult.ignored === true && expiredResult.activated === false, 'a delayed callback does not activate an expired checkout');
  assert((await PaymentSession.findById(expiredSession._id))?.status === 'expired', 'the expired session stays expired');
  assert((await Company.findById(cancelledCompany._id))?.onboardingStatus === 'PENDING_PAYMENT', 'a cancelled checkout does not activate registration');

  const pendingCompany = await company('Pending Co');
  await session({ companyId: pendingCompany._id, reference: 'REF-PENDING' });
  const pending = await deliver('REF-PENDING', 'hash-pending', { status: 'sent', amount: 600, currency: 'USD', reference: 'REF-PENDING' });
  assert(pending.activated === false, 'a non-paid callback does not activate registration');
  assert((await Company.findById(pendingCompany._id))?.onboardingStatus === 'PENDING_PAYMENT', 'a pending callback leaves registration unpaid');

  const sameTxn = await company('Same Transaction Co');
  await session({ companyId: sameTxn._id, reference: 'REF-SAME' });
  await deliver('REF-SAME', 'hash-a');
  const otherHash = await deliver('REF-SAME', 'hash-b');
  assert(otherHash.activated === false, 'a changed event hash does not activate a completed registration again');
  assert(await Subscription.countDocuments({ companyId: sameTxn._id }) === 1, 'two event hashes for one paid session leave one subscription');
  assert(await WebhookEventReceipt.countDocuments({ provider: 'paynow', eventId: { $in: ['hash-a', 'hash-b'] } }) === 2, 'different hashes are different callback receipts');

  const raceCompany = await company('Race Co');
  await session({ companyId: raceCompany._id, reference: 'REF-RACE' });
  const raced = await Promise.allSettled([
    deliver('REF-RACE', 'hash-race-a'),
    deliver('REF-RACE', 'hash-race-b')
  ]);
  assert(raced.filter((row) => row.status === 'fulfilled' && row.value.activated).length === 1, 'two callback ids for one session activate once');
  assert(await Subscription.countDocuments({ companyId: raceCompany._id }) === 1, 'two callback ids leave one subscription');

  const fingerCompany = await company('Fingerprint Co');
  await session({ companyId: fingerCompany._id, reference: 'REF-FINGER' });
  const firstFinger = await deliver('REF-FINGER', 'hash-finger', paidPoll('REF-FINGER'), 'REF-FINGER|Paid|600');
  const changedFinger = await deliver('REF-FINGER', 'hash-finger', { status: 'cancelled', amount: 600, currency: 'USD', reference: 'REF-FINGER' }, 'REF-FINGER|Cancelled|600');
  assert(firstFinger.activated === true, 'the first fingerprinted callback activates');
  assert(changedFinger.status === 'payload_conflict' && changedFinger.activated === false, 'a changed payload for the same event is not treated as an ordinary duplicate');
  assert((await PaymentSession.findOne({ providerRef: 'REF-FINGER' }))?.status === 'reconciled', 'the changed payload does not undo the paid session');

  const expireProvider = await company('Provider Expired Co');
  const expireSession = await session({ companyId: expireProvider._id, reference: 'REF-PROVIDER-EXPIRED' });
  const expiredPoll = await deliver('REF-PROVIDER-EXPIRED', 'hash-provider-expired', { status: 'expired', amount: 600, currency: 'USD', reference: 'REF-PROVIDER-EXPIRED' });
  assert(expiredPoll.activated === false, 'an expired provider status does not activate');
  assert((await PaymentSession.findById(expireSession._id))?.status === 'expired', 'an expired provider status is stored as expired');
  const latePaid = await deliver('REF-PROVIDER-EXPIRED', 'hash-provider-expired-late');
  assert(latePaid.activated === false && latePaid.ignored === true, 'a later paid callback does not activate an expired checkout');

  assert(paynowCheckoutDecision({ status: 'provider_created', pollUrl: 'https://www.paynow.co.zw/Interface/Poll' }) === 'awaiting', 'an open Paynow poll is not started again');
  assert(paynowCheckoutDecision({ status: 'cancelled' }) === 'closed', 'a cancelled checkout is not started again');
  assert(paynowCheckoutDecision({ status: 'pending' }) === 'create', 'a session without a poll can start checkout');
  assert(paynowCheckoutDecision({ status: 'provider_created', pollUrl: 'https://example.invalid/poll' }) === 'closed', 'an unexpected poll URL does not start another payment');

  const duplicateRefCompany = await company('Duplicate Ref Co');
  await session({ companyId: duplicateRefCompany._id, reference: 'REF-DUP' });
  await session({ companyId: duplicateRefCompany._id, reference: 'REF-DUP' });
  assert(await PaymentSession.countDocuments({ providerRef: 'REF-DUP' }) === 2, 'providerRef is not unique, so two sessions can share it');
  const ambiguous = await deliver('REF-DUP', 'hash-dup');
  assert(ambiguous.activated === false && ambiguous.ignored === true, 'an ambiguous provider reference is not activated');
  const dupSessions = await PaymentSession.find({ providerRef: 'REF-DUP' }).select('status').lean();
  assert(dupSessions.every((row) => row.status === 'provider_created'), 'neither ambiguous session is changed');
  assert(await Subscription.countDocuments({ companyId: duplicateRefCompany._id }) === 0, 'an ambiguous provider reference does not create a subscription');
  const review = await AccountingException.findOne({
    companyId: duplicateRefCompany._id,
    kind: 'financial_review',
    component: 'PAYNOW_PROVIDER_REF_AMBIGUOUS'
  }).lean();
  assert(Boolean(review), 'an ambiguous provider reference records a review');

  const ambiguousConcurrent = await company('Ambiguous Concurrent Co');
  await session({ companyId: ambiguousConcurrent._id, reference: 'REF-DUP-CONCURRENT' });
  await session({ companyId: ambiguousConcurrent._id, reference: 'REF-DUP-CONCURRENT' });
  const concurrentAmbiguous = await Promise.all([
    deliver('REF-DUP-CONCURRENT', 'hash-dup-concurrent-a'),
    deliver('REF-DUP-CONCURRENT', 'hash-dup-concurrent-b')
  ]);
  assert(concurrentAmbiguous.every((row) => row.activated === false), 'concurrent callbacks do not activate an ambiguous provider reference');
  assert(
    (await PaymentSession.find({ providerRef: 'REF-DUP-CONCURRENT' }).select('status').lean()).every((row) => row.status === 'provider_created'),
    'concurrent ambiguous callbacks leave both sessions unchanged'
  );

  const reviewFailureCompany = await company('Review Failure Co');
  await session({ companyId: reviewFailureCompany._id, reference: 'REF-REVIEW-FAIL' });
  await session({ companyId: reviewFailureCompany._id, reference: 'REF-REVIEW-FAIL' });
  (global as any).__failPaynowReview = true;
  const reviewFailure = await deliver('REF-REVIEW-FAIL', 'hash-review-fail');
  assert(reviewFailure.activated === false && reviewFailure.ignored === true, 'a review-write failure still does not activate an ambiguous reference');
  assert(await PaymentSession.countDocuments({ providerRef: 'REF-REVIEW-FAIL', status: 'provider_created' }) === 2, 'a review-write failure leaves both sessions unchanged');
  assert(await AccountingException.countDocuments({ component: 'PAYNOW_PROVIDER_REF_AMBIGUOUS', 'accountingRef.transactionId': 'REF-REVIEW-FAIL' }) === 0, 'the failed review write is not reported as a stored review');

  const auditGateCompany = await company('Audit Gate Co');
  const auditGateSession = await session({ companyId: auditGateCompany._id, reference: 'REF-AUDIT-GATE' });
  (global as any).__failAuditAction = 'payment.verified';
  let auditGateThrew = false;
  try {
    await deliver('REF-AUDIT-GATE', 'hash-audit-gate');
  } catch (error: any) {
    auditGateThrew = error?.code === 'AUDIT_PERSIST_FAILED';
  }
  assert(auditGateThrew, 'activation does not start when the payment audit cannot be stored');
  assert((await PaymentSession.findById(auditGateSession._id))?.status === 'provider_created', 'a missing activation audit leaves the session unpaid');
  assert(await Subscription.countDocuments({ companyId: auditGateCompany._id }) === 0, 'a missing activation audit does not create a subscription');

  const failedAuditCompany = await company('Failed Audit Co');
  const failedAuditSession = await session({ companyId: failedAuditCompany._id, reference: 'REF-FAIL-AUDIT' });
  (global as any).__failAuditAction = 'checkout.cancelled';
  const failedAudit = await deliver('REF-FAIL-AUDIT', 'hash-fail-audit', { status: 'cancelled', amount: 600, currency: 'USD', reference: 'REF-FAIL-AUDIT' });
  assert(failedAudit.activated === false, 'a cancelled callback does not activate registration');
  assert((await PaymentSession.findById(failedAuditSession._id))?.status === 'cancelled', 'the cancelled outcome stays cancelled when its audit write fails');
  assert(await AccountingException.countDocuments({ component: 'AUDIT_EVENT_MISSING', 'accountingRef.transactionId': String(failedAuditSession._id) }) === 1, 'a missing cancellation audit is recorded for review');
  assert(await Subscription.countDocuments({ companyId: failedAuditCompany._id }) === 0, 'a missing cancellation audit does not create a subscription');

  const missingMeta = await company('Missing Key Co');
  const missingSession = await session({ companyId: missingMeta._id, reference: 'REF-NO-META' });
  (global as any).__paynowDuplicateKey = { code: 11000 };
  let missingMetaThrew = false;
  try { await deliver('REF-NO-META', 'hash-no-meta'); } catch { missingMetaThrew = true; }
  assert(missingMetaThrew, 'a duplicate key without index metadata does not count as the same event');
  assert((await PaymentSession.findById(missingSession._id))?.status === 'provider_created', 'missing duplicate-key metadata does not activate the session');
  assert(await Subscription.countDocuments({ companyId: missingMeta._id }) === 0, 'missing duplicate-key metadata does not create a subscription');

  const otherIndex = await company('Other Index Co');
  const otherSession = await session({ companyId: otherIndex._id, reference: 'REF-OTHER-INDEX' });
  (global as any).__paynowDuplicateKey = { code: 11000, keyPattern: { email: 1 }, keyValue: { email: 'other@example.test' } };
  let otherThrew = false;
  try { await deliver('REF-OTHER-INDEX', 'hash-other-index'); } catch { otherThrew = true; }
  assert(otherThrew, 'an unrelated duplicate key does not count as this Paynow event');
  assert((await PaymentSession.findById(otherSession._id))?.status === 'provider_created', 'an unrelated duplicate key leaves the session unchanged');

  const uncertainCompany = await company('Uncertain Receipt Co');
  const uncertainSession = await session({ companyId: uncertainCompany._id, reference: 'REF-UNCERTAIN' });
  (global as any).__paynowUncertainReceiptCreate = true;
  let uncertainThrew = false;
  try { await deliver('REF-UNCERTAIN', 'hash-uncertain'); } catch { uncertainThrew = true; }
  const uncertainRetry = await claimPaynowEvent('hash-uncertain');
  assert(uncertainThrew, 'an uncertain receipt write is not treated as payment success');
  assert(uncertainRetry.action === 'in_progress', 'an uncertain receipt write does not start a second callback');
  assert((await PaymentSession.findById(uncertainSession._id))?.status === 'provider_created', 'an uncertain receipt write does not mark the session paid');

  async function backdateClaim(id: unknown) {
    await PaymentSession.updateOne({ _id: id }, { $set: { 'metadata.activationClaimedAt': new Date(Date.now() - 10 * 60 * 1000) } });
  }

  const afterClaim = await company('After Claim Co');
  const afterClaimSession = await session({ companyId: afterClaim._id, reference: 'REF-AFTER-CLAIM', seam: 'PHASE_FAIL_ACTIVATION_AFTER_CLAIM' });
  let afterClaimThrew = false;
  try { await deliver('REF-AFTER-CLAIM', 'hash-after-claim'); } catch { afterClaimThrew = true; }
  assert(afterClaimThrew, 'a failure after the activation claim is propagated');
  assert(await Subscription.countDocuments({ companyId: afterClaim._id }) === 0, 'a failure after the claim does not create a subscription');
  assert((await PaymentSession.findById(afterClaimSession._id))?.status === 'paid', 'a failure after the claim keeps the payment');
  await backdateClaim(afterClaimSession._id);
  const afterClaimResume = await deliver('REF-AFTER-CLAIM', 'hash-after-claim');
  assert(afterClaimResume.activated === true, 'a stale activation claim can resume the same session');
  assert(await Subscription.countDocuments({ companyId: afterClaim._id }) === 1, 'resuming after the claim creates one subscription');

  const afterSub = await company('After Subscription Co');
  const afterSubSession = await session({ companyId: afterSub._id, reference: 'REF-AFTER-SUB', seam: 'PHASE_FAIL_ACTIVATION_AFTER_SUBSCRIPTION' });
  let afterSubThrew = false;
  try { await deliver('REF-AFTER-SUB', 'hash-after-sub'); } catch { afterSubThrew = true; }
  assert(afterSubThrew, 'a failure after subscription creation is propagated');
  assert(await Subscription.countDocuments({ companyId: afterSub._id }) === 1, 'the subscription created before the failure is kept');
  assert((await PaymentSession.findById(afterSubSession._id))?.status === 'paid', 'the session stays paid until reconciliation is stored');
  await backdateClaim(afterSubSession._id);
  const afterSubResume = await deliver('REF-AFTER-SUB', 'hash-after-sub');
  assert(afterSubResume.activated === true, 'retry after subscription creation finishes the same session');
  assert(await Subscription.countDocuments({ companyId: afterSub._id }) === 1, 'retry after subscription creation does not create a second subscription');

  const afterDone = await company('After Reconciled Co');
  const afterDoneSession = await session({ companyId: afterDone._id, reference: 'REF-AFTER-DONE', seam: 'PHASE_FAIL_ACTIVATION_AFTER_RECONCILED' });
  let afterDoneThrew = false;
  try { await deliver('REF-AFTER-DONE', 'hash-after-done'); } catch { afterDoneThrew = true; }
  assert(afterDoneThrew, 'a failure after reconciliation is propagated');
  assert((await PaymentSession.findById(afterDoneSession._id))?.status === 'reconciled', 'reconciliation stays stored when the following write fails');
  assert((await Company.findById(afterDone._id))?.onboardingStatus === 'PENDING_PAYMENT', 'registration stays unpaid when the completion write fails');
  const afterDoneResume = await deliver('REF-AFTER-DONE', 'hash-after-done');
  assert(afterDoneResume.activated === false, 'a reconciled session is not activated a second time');
  assert((await Company.findById(afterDone._id))?.onboardingStatus === 'INITIALIZING_WORKSPACE', 'retry finishes registration for the reconciled session');
  assert(await Subscription.countDocuments({ companyId: afterDone._id }) === 1, 'retry after reconciliation leaves one subscription');

  const refundCompany = await company('Refund Co');
  await session({ companyId: refundCompany._id, reference: 'REF-LATE-REFUND' });
  await deliver('REF-LATE-REFUND', 'hash-late-paid');
  const refunded = await deliver('REF-LATE-REFUND', 'hash-late-refund', { status: 'refunded', amount: 600, currency: 'USD', reference: 'REF-LATE-REFUND' });
  assert(refunded.activated === false, 'a late refund does not activate another subscription');
  assert((await PaymentSession.findOne({ providerRef: 'REF-LATE-REFUND' }))?.status === 'reconciled', 'a late refund leaves the paid session reconciled');
  assert(await AccountingException.countDocuments({ companyId: refundCompany._id, component: 'PAYNOW_LATE_STATUS' }) === 1, 'a late refund records one review');
  const refundAgain = await deliver('REF-LATE-REFUND', 'hash-late-refund', { status: 'refunded', amount: 600, currency: 'USD', reference: 'REF-LATE-REFUND' });
  assert(refundAgain.status === 'duplicate', 'the same refund event is not reviewed as a new payment');
  assert(await AccountingException.countDocuments({ companyId: refundCompany._id, component: 'PAYNOW_LATE_STATUS' }) === 1, 'repeating the refund event leaves one review');
  assert(await Subscription.countDocuments({ companyId: refundCompany._id }) === 1, 'a late refund does not create a second subscription');

  const disputeCompany = await company('Dispute Co');
  await session({ companyId: disputeCompany._id, reference: 'REF-LATE-DISPUTE' });
  await deliver('REF-LATE-DISPUTE', 'hash-dispute-paid');
  (global as any).__failPaynowLateReview = true;
  const disputed = await deliver('REF-LATE-DISPUTE', 'hash-dispute', { status: 'disputed', amount: 600, currency: 'USD', reference: 'REF-LATE-DISPUTE' });
  assert(disputed.activated === false, 'a late dispute does not activate another subscription');
  assert((await PaymentSession.findOne({ providerRef: 'REF-LATE-DISPUTE' }))?.status === 'reconciled', 'a late dispute leaves the paid session reconciled');
  assert(await AccountingException.countDocuments({ companyId: disputeCompany._id, component: 'PAYNOW_LATE_STATUS' }) === 0, 'a failed dispute review is not reported as stored');
  await deliver('REF-LATE-DISPUTE', 'hash-dispute-2', { status: 'disputed', amount: 600, currency: 'USD', reference: 'REF-LATE-DISPUTE' });
  assert(await AccountingException.countDocuments({ companyId: disputeCompany._id, component: 'PAYNOW_LATE_STATUS' }) === 1, 'a later dispute event can record the review');
  assert((await PaymentSession.findOne({ providerRef: 'REF-LATE-DISPUTE' }))?.status === 'reconciled', 'the stored dispute review does not reverse the session');

  const unknownCompany = await company('Unknown Status Co');
  await session({ companyId: unknownCompany._id, reference: 'REF-UNKNOWN' });
  await deliver('REF-UNKNOWN', 'hash-unknown-paid');
  const unknown = await deliver('REF-UNKNOWN', 'hash-unknown', { status: 'processing', amount: 600, currency: 'USD', reference: 'REF-UNKNOWN' });
  assert(unknown.activated === false, 'an unrecognised status does not activate a reconciled session again');
  assert((await PaymentSession.findOne({ providerRef: 'REF-UNKNOWN' }))?.status === 'reconciled', 'an unrecognised status does not overwrite a reconciled session');

  const stalePending = await company('Stale Pending Co');
  const staleSession = await session({ companyId: stalePending._id, reference: 'REF-STALE', seam: 'PHASE_FAIL_ACTIVATION_AFTER_PAID' });
  try { await deliver('REF-STALE', 'hash-stale'); } catch { /* payment stored, activation stopped */ }
  const stale = await deliver('REF-STALE', 'hash-stale-pending', { status: 'sent', amount: 600, currency: 'USD', reference: 'REF-STALE' });
  assert(stale.activated === false, 'an older pending callback does not finish a paid session');
  assert((await PaymentSession.findById(staleSession._id))?.status === 'paid', 'an older pending callback leaves the paid session paid');

  const conflictCompany = await company('Conflict Refund Co');
  await session({ companyId: conflictCompany._id, reference: 'REF-CONFLICT-REFUND' });
  await deliver('REF-CONFLICT-REFUND', 'hash-conflict', paidPoll('REF-CONFLICT-REFUND'), 'REF-CONFLICT-REFUND|Paid|600');
  const conflictRefund = await deliver('REF-CONFLICT-REFUND', 'hash-conflict', { status: 'refunded', amount: 600, currency: 'USD', reference: 'REF-CONFLICT-REFUND' }, 'REF-CONFLICT-REFUND|Refunded|600');
  assert(conflictRefund.status === 'payload_conflict' && conflictRefund.activated === false, 'a changed refund fingerprint is not an ordinary duplicate');
  assert((await PaymentSession.findOne({ providerRef: 'REF-CONFLICT-REFUND' }))?.status === 'reconciled', 'a conflicting refund fingerprint does not reverse the session');
  assert(await AccountingException.countDocuments({ companyId: conflictCompany._id, component: 'PAYNOW_LATE_STATUS' }) === 1, 'a conflicting refund fingerprint records a review');

  const modeEnv = { PAYNOW_INTEGRATION_ID: 'id', PAYNOW_INTEGRATION_KEY: 'key' } as NodeJS.ProcessEnv;
  assert(paynowConfigurationState({ ...modeEnv, PAYNOW_MODE: 'test' }).mode === 'test', 'test mode stays test');
  assert(paynowConfigurationState({ ...modeEnv, PAYNOW_MODE: 'sandbox' }).mode === 'test', 'sandbox mode stays test');
  assert(paynowConfigurationState({ ...modeEnv, PAYNOW_MODE: 'live' }).mode === 'live', 'live mode stays live');
  assert(paynowConfigurationState(modeEnv).mode === 'unspecified', 'a blank mode does not choose test or live');
  assert(paynowConfigurationState({ ...modeEnv, PAYNOW_MODE: 'production' }).mode === 'invalid', 'an unknown mode is invalid');
  assert(paynowConfigurationState({} as NodeJS.ProcessEnv).mode === 'unconfigured', 'missing credentials stay unconfigured');

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS Paynow callback tests on local MongoDB. Paynow was not called and Cosmos DB was not used.');
  await mongoose.disconnect();
  await accountingConnection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
