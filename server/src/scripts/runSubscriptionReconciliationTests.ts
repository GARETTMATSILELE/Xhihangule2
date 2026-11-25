/**
 * Subscription duplicate reconciliation tests.
 * Uses a disposable local database. Does not call Dodo, Paynow, or production.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { Notification } from '../models/Notification';
import { SubscriptionPaymentCase } from '../models/SubscriptionPaymentCase';
import { applyPolledPayment } from '../services/applyPolledPayment';
import { listSubscriptionReconciliation, resolveSubscriptionReconciliation } from '../controllers/subscriptionReconciliationController';
import { isAdmin } from '../middleware/roles';

const TEST_DB = 'mongodb://127.0.0.1:27017/mantis_subscription_reconciliation_test';
const failures: string[] = [];

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message);
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
}

function response() {
  const res: { statusCode: number; body?: any; status: (code: number) => any; json: (body: unknown) => any } = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  };
  return res;
}

async function companyFor(label: string, role: 'admin' | 'agent' | 'tenant', roles: string[]) {
  const email = `${label}@example.test`;
  const user = await User.create({
    email, password: 'Register1pay', firstName: label, lastName: 'Review', role, roles, isActive: true, sessionVersion: 1
  });
  const company = await Company.create({
    name: `Reconcile ${label}`, address: '1 Test Close', phone: '0772000001', email,
    ownerId: user._id, companyType: 'INDIVIDUAL_LANDLORD', workspaceType: 'individual',
    onboardingStatus: 'ACTIVE', onboardingCompleted: true, subscriptionStatus: 'active', isActive: true, plan: 'INDIVIDUAL'
  });
  user.companyId = company._id;
  await user.save();
  return { user, company };
}

async function subscriptionFor(companyId: unknown, userId: unknown, periodEnd: Date) {
  return Subscription.create({
    companyId, userId, plan: 'INDIVIDUAL', cycle: 'monthly', status: 'active', provider: 'paynow',
    currentPeriodStart: new Date(periodEnd.getTime() - 30 * 86400000), currentPeriodEnd: periodEnd
  });
}

async function paynowPayment(input: {
  companyId: unknown;
  userId: unknown;
  subscriptionId: unknown;
  reference: string;
  status: 'pending' | 'paid' | 'reconciled';
  createdAt?: Date;
}) {
  const session = await PaymentSession.create({
    companyId: input.companyId,
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    idempotencyKey: input.reference,
    provider: 'paynow',
    providerRef: input.reference,
    plan: 'INDIVIDUAL',
    billingCycle: 'monthly',
    amount: 19,
    currency: 'USD',
    status: input.status,
    paidAt: input.status === 'pending' ? undefined : new Date()
  });
  const billing = await BillingPayment.create({
    companyId: input.companyId,
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    paymentSessionId: session._id,
    plan: 'INDIVIDUAL',
    cycle: 'monthly',
    amount: 19,
    currency: 'USD',
    method: 'ecocash',
    provider: 'paynow',
    providerRef: input.reference,
    idempotencyKey: input.reference,
    status: input.status === 'pending' ? 'pending' : 'paid',
    rawResponse: { historical: true }
  });
  session.billingPaymentId = billing._id as typeof session.billingPaymentId;
  await session.save();
  if (input.createdAt) {
    await PaymentSession.collection.updateOne({ _id: session._id }, { $set: { createdAt: input.createdAt } });
  }
  return { session, billing };
}

function paidPoll(reference: string) {
  return { status: 'paid', amount: 19, currency: 'USD', reference, origin: 'webhook' as const };
}

async function main() {
  if (/cosmos|azure|mantisafrica/i.test(TEST_DB) || mongoose.connection.readyState !== 0) process.exit(1);
  const reconciliationSource = fs.readFileSync(path.join(__dirname, '../services/subscriptionReconciliationService.ts'), 'utf8');
  const controllerSource = fs.readFileSync(path.join(__dirname, '../controllers/subscriptionReconciliationController.ts'), 'utf8');
  check(!reconciliationSource.includes('refunds.create') && !controllerSource.includes('refunds.create'), 'reconciliation does not call the provider refund API');

  let agentBlocked = 0;
  try {
    isAdmin({ user: { role: 'agent', roles: ['agent'], companyId: 'company' } } as any, {} as any, () => { agentBlocked = 200; });
  } catch (error) {
    agentBlocked = Number((error as { statusCode?: number }).statusCode || 0);
  }
  check(agentBlocked === 403, 'a rental agent is rejected by the admin gate');

  await mongoose.connect(TEST_DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  if (mongoose.connection.name !== 'mantis_subscription_reconciliation_test') process.exit(1);
  await mongoose.connection.dropDatabase();
  await SubscriptionPaymentCase.collection.createIndex({ 'additional.sessionId': 1 }, { unique: true });

  const admin = await companyFor('admin', 'admin', ['admin']);
  const agent = await User.create({
    email: 'agent@example.test', password: 'Register1pay', firstName: 'Rental', lastName: 'Agent',
    role: 'agent', roles: ['agent'], companyId: admin.company._id, isActive: true, sessionVersion: 1
  });
  const periodEnd = new Date(Date.now() + 20 * 86400000);
  const subscription = await subscriptionFor(admin.company._id, admin.user._id, periodEnd);
  const original = await paynowPayment({
    companyId: admin.company._id, userId: admin.user._id, subscriptionId: subscription._id, reference: 'PAY-ORIGINAL', status: 'pending'
  });
  const first = await applyPolledPayment('PAY-ORIGINAL', paidPoll('PAY-ORIGINAL'));
  const activated = await Subscription.findById(subscription._id);
  const originalBilling = await BillingPayment.findById(original.billing._id);
  const originalSnapshot = JSON.stringify({ status: originalBilling?.status, amount: originalBilling?.amount, raw: originalBilling?.rawResponse });
  const activatedPeriod = activated?.currentPeriodEnd?.toISOString();
  check(first.activated === true && activated?.status === 'active' && Boolean(activatedPeriod), 'the first Paynow payment activates the subscription once');

  const duplicate = await paynowPayment({
    companyId: admin.company._id, userId: admin.user._id, subscriptionId: subscription._id, reference: 'PAY-DUPLICATE', status: 'pending'
  });
  const second = await applyPolledPayment('PAY-DUPLICATE', paidPoll('PAY-DUPLICATE'));
  const duplicateCase = await SubscriptionPaymentCase.findOne({ 'additional.sessionId': duplicate.session._id });
  const notices = await Notification.find({ companyId: String(admin.company._id), title: 'Subscription payment needs reconciliation' });
  const agentNotices = notices.filter((notice) => String(notice.userId) === String(agent._id));
  const afterDuplicate = await Subscription.findById(subscription._id);
  const duplicateBilling = await BillingPayment.findById(duplicate.billing._id);
  check(second.activated === false && duplicateCase?.status === 'open' && duplicateCase.original.providerReference === 'PAY-ORIGINAL' && duplicateCase.additional.providerReference === 'PAY-DUPLICATE' && duplicateCase.original.amount === 19 && duplicateCase.additional.currency === 'USD' && notices.length === 1 && agentNotices.length === 0 && notices[0].message.includes(admin.company.name) && !/\b\d{13,19}\b/.test(notices[0].message) && afterDuplicate?.currentPeriodEnd?.toISOString() === activatedPeriod && duplicateBilling?.status === 'paid', 'a second Paynow success for the same purchase is flagged once and does not extend the subscription');

  const replay = await applyPolledPayment('PAY-DUPLICATE', paidPoll('PAY-DUPLICATE'));
  check(replay.activated === false && await SubscriptionPaymentCase.countDocuments({ companyId: admin.company._id }) === 1 && await Notification.countDocuments({ companyId: String(admin.company._id), title: 'Subscription payment needs reconciliation' }) === 1 && (await Subscription.findById(subscription._id))?.currentPeriodEnd?.toISOString() === activatedPeriod, 'a repeated Paynow callback does not create another alert or extension');

  const firstReplay = await applyPolledPayment('PAY-ORIGINAL', paidPoll('PAY-ORIGINAL'));
  check(firstReplay.activated === false && (await Subscription.findById(subscription._id))?.currentPeriodEnd?.toISOString() === activatedPeriod && await SubscriptionPaymentCase.countDocuments({ companyId: admin.company._id }) === 1, 'replaying the original Paynow payment stays idempotent');

  const other = await companyFor('other', 'admin', ['admin']);
  const otherList = response();
  await listSubscriptionReconciliation({ user: { userId: String(other.user._id), role: 'admin', roles: ['admin'], companyId: String(other.company._id) } } as any, otherList as any);
  check(otherList.statusCode === 200 && otherList.body.cases.length === 0, 'another company cannot see the reconciliation case');
  const otherResolve = response();
  await resolveSubscriptionReconciliation({
    user: { userId: String(other.user._id), role: 'admin', roles: ['admin'], companyId: String(other.company._id) },
    params: { id: String(duplicateCase?._id) },
    body: { resolution: 'resolved', notes: 'wrong company' }
  } as any, otherResolve as any);
  check(otherResolve.statusCode === 404 && (await SubscriptionPaymentCase.findById(duplicateCase?._id))?.status === 'open', 'another company cannot change the reconciliation case');

  const agentResolve = response();
  await resolveSubscriptionReconciliation({
    user: { userId: String(agent._id), role: 'agent', roles: ['agent', 'admin'], companyId: String(admin.company._id) },
    params: { id: String(duplicateCase?._id) },
    body: { resolution: 'resolved', notes: 'agent attempt' }
  } as any, agentResolve as any);
  const tenantResolve = response();
  await resolveSubscriptionReconciliation({
    user: { userId: String(admin.user._id), role: 'tenant', roles: ['tenant'], companyId: String(admin.company._id) },
    params: { id: String(duplicateCase?._id) },
    body: { resolution: 'resolved' }
  } as any, tenantResolve as any);
  check(agentResolve.statusCode === 403 && tenantResolve.statusCode === 403 && (await SubscriptionPaymentCase.findById(duplicateCase?._id))?.history.length === 0, 'an agent and an ordinary user cannot record a resolution');

  const confirmed = response();
  await resolveSubscriptionReconciliation({
    user: { userId: String(admin.user._id), role: 'admin', roles: ['admin'], companyId: String(admin.company._id) },
    params: { id: String(duplicateCase?._id) },
    body: { resolution: 'confirmed_duplicate', notes: 'Customer paid twice', externalRefundReference: 'EXT-REFUND-1' }
  } as any, confirmed as any);
  const resolved = response();
  await resolveSubscriptionReconciliation({
    user: { userId: String(admin.user._id), role: 'admin', roles: ['admin'], companyId: String(admin.company._id) },
    params: { id: String(duplicateCase?._id) },
    body: { resolution: 'resolved', notes: 'Refund completed with the provider' }
  } as any, resolved as any);
  const saved = await SubscriptionPaymentCase.findById(duplicateCase?._id);
  const originalAfter = await BillingPayment.findById(original.billing._id);
  const additionalAfter = await BillingPayment.findById(duplicate.billing._id);
  check(confirmed.statusCode === 200 && resolved.statusCode === 200 && saved?.status === 'resolved' && saved.externalRefundReference === 'EXT-REFUND-1' && saved.history.length === 2 && String(saved.history[0].adminUserId) === String(admin.user._id) && saved.history[0].notes === 'Customer paid twice' && saved.history[1].resolution === 'resolved' && JSON.stringify({ status: originalAfter?.status, amount: originalAfter?.amount, raw: originalAfter?.rawResponse }) === originalSnapshot && additionalAfter?.status === 'paid' && additionalAfter.amount === 19, 'an administrator can resolve the case without changing either payment record');

  const listed = response();
  await listSubscriptionReconciliation({ user: { userId: String(admin.user._id), role: 'admin', roles: ['admin'], companyId: String(admin.company._id) } } as any, listed as any);
  check(listed.statusCode === 200 && listed.body.cases[0].customerName.includes('admin') && listed.body.cases[0].companyName === admin.company.name && listed.body.cases[0].history.length === 2, 'the administrator review includes the customer, company, and history');

  const stranger = await companyFor('stranger', 'admin', ['admin']);
  const strangerSubscription = await subscriptionFor(stranger.company._id, stranger.user._id, new Date(Date.now() + 15 * 86400000));
  const strangerPayment = await paynowPayment({
    companyId: stranger.company._id, userId: stranger.user._id, subscriptionId: strangerSubscription._id, reference: 'PAY-OTHER-CUSTOMER', status: 'pending'
  });
  const strangerResult = await applyPolledPayment('PAY-OTHER-CUSTOMER', paidPoll('PAY-OTHER-CUSTOMER'));
  check(strangerResult.activated === true && await SubscriptionPaymentCase.countDocuments({ companyId: stranger.company._id }) === 0 && String((await PaymentSession.findById(strangerPayment.session._id))?.subscriptionId) === String(strangerSubscription._id), 'a payment for a different customer is not treated as a duplicate');

  const otherPurchase = await subscriptionFor(admin.company._id, admin.user._id, new Date(Date.now() + 10 * 86400000));
  const otherPurchasePeriod = (await Subscription.findById(otherPurchase._id))?.currentPeriodEnd?.toISOString();
  const separate = await paynowPayment({
    companyId: admin.company._id, userId: admin.user._id, subscriptionId: otherPurchase._id, reference: 'PAY-OTHER-PURCHASE', status: 'pending'
  });
  const separateResult = await applyPolledPayment('PAY-OTHER-PURCHASE', paidPoll('PAY-OTHER-PURCHASE'));
  check(separateResult.activated === true && await SubscriptionPaymentCase.countDocuments({ subscriptionId: otherPurchase._id }) === 0 && (await Subscription.findById(subscription._id))?.currentPeriodEnd?.toISOString() === activatedPeriod && (await Subscription.findById(otherPurchase._id))?.currentPeriodEnd?.toISOString() !== otherPurchasePeriod, 'a different subscription purchase is activated rather than flagged');

  const renewalSubscription = await subscriptionFor(admin.company._id, admin.user._id, new Date(Date.now() - 2 * 86400000));
  await paynowPayment({
    companyId: admin.company._id, userId: admin.user._id, subscriptionId: renewalSubscription._id, reference: 'PAY-PRIOR-PERIOD', status: 'reconciled',
    createdAt: new Date(Date.now() - 40 * 86400000)
  });
  const renewalPeriod = (await Subscription.findById(renewalSubscription._id))?.currentPeriodEnd?.toISOString();
  await paynowPayment({
    companyId: admin.company._id, userId: admin.user._id, subscriptionId: renewalSubscription._id, reference: 'PAY-NEXT-PERIOD', status: 'pending',
    createdAt: new Date()
  });
  const renewal = await applyPolledPayment('PAY-NEXT-PERIOD', paidPoll('PAY-NEXT-PERIOD'));
  check(renewal.activated === true && await SubscriptionPaymentCase.countDocuments({ subscriptionId: renewalSubscription._id }) === 0 && (await Subscription.findById(renewalSubscription._id))?.currentPeriodEnd?.toISOString() !== renewalPeriod, 'a later purchase after the period ends is not classified as a duplicate');

  const untouched = await BillingPayment.findById(original.billing._id);
  check(JSON.stringify({ status: untouched?.status, amount: untouched?.amount, raw: untouched?.rawResponse }) === originalSnapshot, 'historical payment records remain unchanged');

  if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('Subscription reconciliation tests passed.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
