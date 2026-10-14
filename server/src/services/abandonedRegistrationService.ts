import crypto from 'crypto';
import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { OnboardingSession } from '../models/OnboardingSession';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { recordAuditEvent } from './auditService';
import { logger } from '../utils/logger';

export const SIGN_IN_REQUIRED_MESSAGE = 'We could not continue with these details. Sign in if you already have an account, or use password recovery.';

const RELEASABLE_ONBOARDING = ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP'];
const ACTIVE_SUBSCRIPTION = new Set(['trial', 'active']);

export function abandonedRegistrationRetentionMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.ABANDONED_REGISTRATION_RETENTION_DAYS ?? 7);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
  return days * 24 * 60 * 60 * 1000;
}

export type ReleaseOutcome = 'released' | 'deferred' | 'skipped';

function latestActivity(dates: Array<Date | undefined | null>): number {
  const times = dates.filter(Boolean).map((value) => new Date(value as Date).getTime()).filter((value) => Number.isFinite(value));
  return times.length ? Math.max(...times) : Date.now();
}

function sessionAwaitingProvider(session: { status?: string; pollUrl?: string }): boolean {
  const status = String(session.status || '');
  if (status === 'provider_created') return true;
  return status === 'pending' && Boolean(String(session.pollUrl || '').trim());
}

async function companyHasOperationalRecords(companyId: mongoose.Types.ObjectId): Promise<boolean> {
  const clauses = [{ companyId }, { companyId: String(companyId) }];
  const [properties, payments] = await Promise.all([
    mongoose.connection.collection('properties').countDocuments({ $or: clauses }),
    mongoose.connection.collection('payments').countDocuments({ $or: clauses })
  ]);
  return properties > 0 || payments > 0;
}

/**
 * Archives one abandoned paid registration when every payment-safety check passes.
 * Active trials, active companies, verified payments, and unresolved provider sessions are left unchanged.
 * A second call for an already archived registration does not rewrite it.
 */
export async function releaseAbandonedRegistration(companyId: mongoose.Types.ObjectId | string, now = new Date()): Promise<ReleaseOutcome> {
  const company = await Company.findById(companyId);
  if (!company) return 'skipped';

  const users = await User.find({ companyId: company._id });
  if (company.ownerId && !users.some((user) => String(user._id) === String(company.ownerId))) {
    const owner = await User.findById(company.ownerId);
    if (owner) users.push(owner);
  }
  const alreadyArchived = company.onboardingStatus === 'EXPIRED' && company.tenantStatus === 'archived';
  if (alreadyArchived && users.every((user) => user.isArchived && String(user.email || '').startsWith('archived.'))) {
    return 'released';
  }

  if (users.some((user) => user.role === 'system_admin' || (user.roles || []).includes('system_admin'))) {
    return 'skipped';
  }

  const [subscriptions, sessions, billingPayments, onboardingSessions, hasRecords] = await Promise.all([
    Subscription.find({ companyId: company._id }),
    PaymentSession.find({ companyId: company._id }),
    BillingPayment.find({ companyId: company._id }),
    OnboardingSession.find({ companyId: company._id }),
    companyHasOperationalRecords(company._id as mongoose.Types.ObjectId)
  ]);

  if (!alreadyArchived) {
    const subscriptionStatuses = subscriptions.map((subscription) => String(subscription.status || '').toLowerCase());
    const companySubscription = String(company.subscriptionStatus || '').toLowerCase();
    const protectedAccount = company.tenantStatus === 'active'
      || company.isActive === true
      || company.onboardingCompleted === true
      || ['ACTIVE', 'PAYMENT_RECEIVED', 'INITIALIZING_WORKSPACE', 'SUSPENDED'].includes(String(company.onboardingStatus || ''))
      || ACTIVE_SUBSCRIPTION.has(companySubscription)
      || subscriptionStatuses.some((status) => ACTIVE_SUBSCRIPTION.has(status))
      || hasRecords;

    if (protectedAccount) return 'skipped';
    if (!RELEASABLE_ONBOARDING.includes(String(company.onboardingStatus || '')) || company.tenantStatus !== 'pending') {
      return 'skipped';
    }

    const verifiedPayment = sessions.some((session) => session.status === 'paid' || session.status === 'reconciled')
      || billingPayments.some((payment) => payment.status === 'paid');
    if (verifiedPayment) return 'skipped';

    const activity = latestActivity([
      company.createdAt,
      company.updatedAt,
      ...users.flatMap((user) => [user.createdAt, user.updatedAt]),
      ...sessions.flatMap((session) => [session.createdAt, session.updatedAt]),
      ...onboardingSessions.map((session) => session.updatedAt)
    ]);
    if (now.getTime() - activity < abandonedRegistrationRetentionMs()) return 'skipped';

    if (sessions.some((session) => sessionAwaitingProvider(session))) {
      logger.warn('Abandoned registration cleanup deferred', {
        companyId: String(company._id),
        reason: 'unresolved_payment_status'
      });
      await recordAuditEvent({
        companyId: String(company._id),
        action: 'registration.cleanup_deferred',
        entityType: 'Company',
        entityId: String(company._id),
        status: 'failure',
        metadata: { reason: 'unresolved_payment_status' }
      });
      return 'deferred';
    }
  }

  const archivedAt = now;
  for (const user of users) {
    if (user.isArchived && String(user.email || '').startsWith('archived.')) continue;
    const originalEmail = String(user.email || '');
    const archivedEmail = `archived.${user._id.toString()}@example.invalid`;
    user.email = archivedEmail;
    user.normalizedEmail = archivedEmail;
    user.password = crypto.randomBytes(24).toString('hex');
    user.isActive = false;
    user.isArchived = true;
    user.archivedAt = archivedAt;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.firstName = 'Archived';
    user.lastName = 'Registration';
    user.archivedDetails = {
      email: crypto.createHash('sha256').update(originalEmail).digest('hex'),
      firstName: 'Archived',
      lastName: 'Registration'
    };
    await user.save();
  }

  company.name = 'Archived registration';
  company.email = `archived.company.${company._id.toString()}@example.invalid`;
  company.normalizedEmail = company.email;
  company.phone = '0000000000';
  company.address = 'Archived';
  company.website = undefined;
  company.registrationNumber = `ARCHIVED-${company._id.toString()}`;
  company.tinNumber = `ARCHIVED-${company._id.toString()}`;
  company.vatNumber = undefined;
  company.tenantStatus = 'archived';
  company.onboardingStatus = 'EXPIRED';
  company.onboardingCompleted = false;
  company.isActive = false;
  await company.save();

  for (const session of onboardingSessions) {
    session.status = 'EXPIRED';
    session.idempotencyKey = `archived:${session._id.toString()}`;
    session.metadata = { ...(session.metadata || {}), emailReleased: true, archivedAt: archivedAt.toISOString() };
    await session.save();
  }

  for (const session of sessions) {
    if (session.status === 'pending' && !session.pollUrl) {
      session.status = 'expired';
      await session.save();
    }
    if (session.idempotencyKey && !session.idempotencyKey.startsWith('archived:')) {
      session.idempotencyKey = `archived:${session._id.toString()}`;
      await session.save();
    }
  }

  for (const payment of billingPayments) {
    if (payment.status === 'pending') {
      payment.status = 'cancelled';
      await payment.save();
    }
  }

  if (!alreadyArchived) {
    await recordAuditEvent({
      companyId: String(company._id),
      action: 'registration.expired',
      entityType: 'Company',
      entityId: String(company._id),
      metadata: { retentionDays: abandonedRegistrationRetentionMs() / 86400000 }
    });
    await recordAuditEvent({
      companyId: String(company._id),
      action: 'registration.archived',
      entityType: 'Company',
      entityId: String(company._id)
    });
    await recordAuditEvent({
      companyId: String(company._id),
      action: 'registration.email_released',
      entityType: 'Company',
      entityId: String(company._id)
    });
  }
  return 'released';
}

export async function expireAbandonedRegistrations(now = new Date()): Promise<{ released: number; deferred: number; skipped: number }> {
  const cutoff = new Date(now.getTime() - abandonedRegistrationRetentionMs());
  const candidates = await Company.find({
    onboardingStatus: { $in: RELEASABLE_ONBOARDING },
    tenantStatus: 'pending',
    isActive: { $ne: true },
    createdAt: { $lte: cutoff }
  }).select('_id').limit(200);

  const totals = { released: 0, deferred: 0, skipped: 0 };
  for (const candidate of candidates) {
    const outcome = await releaseAbandonedRegistration(candidate._id, now);
    totals[outcome] += 1;
  }
  return totals;
}
