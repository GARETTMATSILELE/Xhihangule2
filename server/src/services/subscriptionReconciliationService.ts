import mongoose from 'mongoose';
import { BillingPayment } from '../models/BillingPayment';
import { Company } from '../models/Company';
import { Notification } from '../models/Notification';
import { PaymentSession } from '../models/PaymentSession';
import { Subscription } from '../models/Subscription';
import { SubscriptionPaymentCase, SubscriptionCaseStatus } from '../models/SubscriptionPaymentCase';
import { User } from '../models/User';
import { recordAuditEvent } from './auditService';
import { logger } from '../utils/logger';

type SessionLike = {
  _id: unknown;
  companyId: unknown;
  userId?: unknown;
  subscriptionId?: unknown;
  billingPaymentId?: unknown;
  provider: 'dodo' | 'paynow' | string;
  providerRef?: string;
  providerTransactionId?: string;
  amount: number;
  currency?: string;
  paidAt?: Date;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
};

const RESOLUTIONS = new Set<SubscriptionCaseStatus>(['confirmed_duplicate', 'not_duplicate', 'resolved']);

function referenceFor(session: SessionLike): string {
  return String(session.providerTransactionId || session.providerRef || session.metadata?.dodoCheckoutSessionId || '').trim();
}

function checkoutReferenceFor(session: SessionLike): string {
  return String(session.metadata?.dodoCheckoutSessionId || '').trim();
}

export async function findSamePurchasePayment(session: SessionLike) {
  if (!session.subscriptionId || !session.companyId) return null;
  const prior = await PaymentSession.findOne({
    _id: { $ne: session._id },
    companyId: session.companyId,
    subscriptionId: session.subscriptionId,
    provider: { $in: ['dodo', 'paynow'] },
    status: { $in: ['paid', 'reconciled'] }
  }).sort({ paidAt: 1, createdAt: 1 });
  if (!prior) return null;
  const subscription = await Subscription.findOne({ _id: session.subscriptionId, companyId: session.companyId }).select('currentPeriodEnd');
  if (subscription?.currentPeriodEnd && session.createdAt && subscription.currentPeriodEnd <= session.createdAt) return null;
  return prior;
}

export async function openSubscriptionDuplicateCase(input: { original: SessionLike; additional: SessionLike }) {
  const additionalSessionId = input.additional._id;
  const existing = await SubscriptionPaymentCase.findOne({ 'additional.sessionId': additionalSessionId });
  if (existing) return { created: false, caseRecord: existing };
  const paidAt = input.additional.paidAt || new Date();
  try {
    const caseRecord = await SubscriptionPaymentCase.create({
      companyId: input.additional.companyId,
      customerUserId: input.additional.userId || input.original.userId,
      subscriptionId: input.additional.subscriptionId,
      status: 'open',
      original: {
        sessionId: input.original._id,
        billingPaymentId: input.original.billingPaymentId,
        provider: input.original.provider,
        providerReference: referenceFor(input.original),
        checkoutReference: checkoutReferenceFor(input.original) || undefined,
        amount: Number(input.original.amount),
        currency: String(input.original.currency || 'USD'),
        paidAt: input.original.paidAt
      },
      additional: {
        sessionId: input.additional._id,
        billingPaymentId: input.additional.billingPaymentId,
        provider: input.additional.provider,
        providerReference: referenceFor(input.additional),
        checkoutReference: checkoutReferenceFor(input.additional) || undefined,
        amount: Number(input.additional.amount),
        currency: String(input.additional.currency || 'USD'),
        paidAt
      },
      history: []
    });
    try {
      await notifyAdmins(caseRecord);
    } catch (error) {
      logger.error('subscription_duplicate_notify_failed', {
        caseId: String(caseRecord._id),
        message: error instanceof Error ? error.message : 'notification failed'
      });
    }
    return { created: true, caseRecord };
  } catch (error) {
    if (Number((error as { code?: unknown }).code) !== 11000) throw error;
    const raced = await SubscriptionPaymentCase.findOne({ 'additional.sessionId': additionalSessionId });
    return { created: false, caseRecord: raced };
  }
}

function money(amount: number, currency: string) {
  return `${currency} ${Number(amount).toFixed(2)}`;
}

function referenceText(side: { provider: string; providerReference: string; checkoutReference?: string; paidAt?: Date }) {
  const checkout = side.checkoutReference ? `, checkout ${side.checkoutReference}` : '';
  const paid = side.paidAt ? `, paid ${new Date(side.paidAt).toISOString()}` : '';
  return `${side.provider} ${side.providerReference}${checkout}${paid}`;
}

async function notifyAdmins(caseRecord: {
  _id: unknown;
  companyId: unknown;
  customerUserId?: unknown;
  subscriptionId: unknown;
  original: { provider: string; providerReference: string; checkoutReference?: string; amount: number; currency: string; paidAt?: Date };
  additional: { provider: string; providerReference: string; checkoutReference?: string; amount: number; currency: string; paidAt?: Date };
}) {
  const [company, customer, admins] = await Promise.all([
    Company.findById(caseRecord.companyId).select('name').lean(),
    caseRecord.customerUserId ? User.findById(caseRecord.customerUserId).select('firstName lastName').lean() : null,
    User.find({
      companyId: caseRecord.companyId,
      isActive: { $ne: false },
      $and: [
        { $or: [{ role: 'admin' }, { roles: 'admin' }] },
        { role: { $nin: ['agent', 'sales'] } },
        { roles: { $nin: ['agent', 'sales'] } }
      ]
    }).select('_id').lean()
  ]);
  const customerName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim() || 'Customer';
  const message = [
    `${customerName} at ${company?.name || 'the company'} has two successful payments for subscription ${String(caseRecord.subscriptionId)}.`,
    `Original ${referenceText(caseRecord.original)}: ${money(caseRecord.original.amount, caseRecord.original.currency)}.`,
    `Additional ${referenceText(caseRecord.additional)}: ${money(caseRecord.additional.amount, caseRecord.additional.currency)}.`,
    'Reconciliation status: open. No automatic refund has been made.'
  ].join(' ');
  for (const admin of admins) {
    await Notification.create({
      companyId: String(caseRecord.companyId),
      userId: admin._id,
      title: 'Subscription payment needs reconciliation',
      message,
      link: '/billing/reconciliation',
      payload: {
        skipEmail: true,
        caseId: String(caseRecord._id),
        subscriptionId: String(caseRecord.subscriptionId),
        status: 'open'
      }
    });
  }
  await SubscriptionPaymentCase.updateOne({ _id: caseRecord._id }, { $set: { notifiedAt: new Date() } });
  logger.warn('subscription_duplicate_case_opened', {
    caseId: String(caseRecord._id),
    companyId: String(caseRecord.companyId),
    subscriptionId: String(caseRecord.subscriptionId)
  });
}

export async function markDuplicateSubscriptionPayment(session: InstanceType<typeof PaymentSession>, original: InstanceType<typeof PaymentSession>) {
  session.status = 'paid';
  session.paidAt = session.paidAt || new Date();
  session.metadata = {
    ...(session.metadata || {}),
    duplicatePayment: true,
    reconciliationRequired: true,
    duplicateOfSessionId: String(original._id)
  };
  session.markModified('metadata');
  await session.save();
  if (session.billingPaymentId) {
    await BillingPayment.updateOne({ _id: session.billingPaymentId }, {
      $set: {
        status: 'paid',
        paidAt: session.paidAt,
        rawResponse: {
          reconciliationRequired: true,
          duplicateOfSessionId: String(original._id)
        }
      }
    });
  }
  return openSubscriptionDuplicateCase({ original, additional: session });
}

export function adminCanResolve(user: { role?: string; roles?: string[]; companyId?: unknown } | undefined) {
  const roles = user?.roles?.length ? user.roles : [user?.role || ''];
  if (!user?.companyId) return false;
  if (user.role === 'agent' || user.role === 'sales') return false;
  if (!roles.includes('admin')) return false;
  if (roles.some((role) => role === 'agent' || role === 'sales')) return false;
  return true;
}

export async function listSubscriptionCases(companyId: string) {
  const rows = await SubscriptionPaymentCase.find({ companyId }).sort({ createdAt: -1 }).limit(100).lean();
  return Promise.all(rows.map((row) => presentSubscriptionCase(row)));
}

export async function resolveSubscriptionCase(input: {
  companyId: string;
  caseId: string;
  adminUserId: string;
  resolution: string;
  notes?: string;
  externalRefundReference?: string;
}) {
  if (!RESOLUTIONS.has(input.resolution as SubscriptionCaseStatus)) {
    return { status: 400, body: { message: 'Choose a resolution.', code: 'RECONCILIATION_RESOLUTION_REQUIRED' } };
  }
  if (!mongoose.isValidObjectId(input.caseId) || !mongoose.isValidObjectId(input.adminUserId)) {
    return { status: 404, body: { message: 'Reconciliation case was not found.', code: 'RECONCILIATION_NOT_FOUND' } };
  }
  const notes = String(input.notes || '').trim().slice(0, 2000);
  const externalRefundReference = String(input.externalRefundReference || '').trim().slice(0, 120);
  const updated = await SubscriptionPaymentCase.findOneAndUpdate(
    { _id: input.caseId, companyId: input.companyId },
    {
      $set: {
        status: input.resolution,
        notes,
        ...(externalRefundReference ? { externalRefundReference } : {})
      },
      $push: {
        history: {
          at: new Date(),
          adminUserId: new mongoose.Types.ObjectId(input.adminUserId),
          resolution: input.resolution,
          notes,
          ...(externalRefundReference ? { externalRefundReference } : {})
        }
      }
    },
    { new: true }
  );
  if (!updated) return { status: 404, body: { message: 'Reconciliation case was not found.', code: 'RECONCILIATION_NOT_FOUND' } };
  await recordAuditEvent({
    companyId: input.companyId,
    userId: input.adminUserId,
    action: 'subscription.reconciliation',
    entityType: 'SubscriptionPaymentCase',
    entityId: String(updated._id),
    metadata: {
      resolution: input.resolution,
      originalReference: updated.original.providerReference,
      additionalReference: updated.additional.providerReference,
      externalRefundReference: externalRefundReference || undefined
    }
  });
  return { status: 200, body: await presentSubscriptionCase(updated.toObject()) };
}

async function presentSubscriptionCase(row: any) {
  const [company, customer] = await Promise.all([
    Company.findById(row.companyId).select('name').lean(),
    row.customerUserId ? User.findById(row.customerUserId).select('firstName lastName').lean() : null
  ]);
  return {
    ...presentCase(row),
    companyName: company?.name || '',
    customerName: [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim()
  };
}

function presentCase(row: any) {
  return {
    id: String(row._id),
    companyId: String(row.companyId),
    customerUserId: row.customerUserId ? String(row.customerUserId) : undefined,
    subscriptionId: String(row.subscriptionId),
    status: row.status,
    original: sideView(row.original),
    additional: sideView(row.additional),
    externalRefundReference: row.externalRefundReference || '',
    notes: row.notes || '',
    history: (row.history || []).map((entry: any) => ({
      at: entry.at,
      adminUserId: String(entry.adminUserId),
      resolution: entry.resolution,
      notes: entry.notes || '',
      externalRefundReference: entry.externalRefundReference || ''
    }))
  };
}

function sideView(side: any) {
  return {
    sessionId: String(side.sessionId),
    provider: side.provider,
    providerReference: side.providerReference,
    checkoutReference: side.checkoutReference || '',
    amount: side.amount,
    currency: side.currency,
    paidAt: side.paidAt || null
  };
}
