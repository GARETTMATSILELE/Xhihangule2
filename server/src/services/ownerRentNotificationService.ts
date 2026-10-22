/**
 * Owner rent-received email. Downstream of a committed payment.
 * Failure, opt-out, and retry never change payment or accounting state.
 */
import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { Company } from '../models/Company';
import { OwnerPreferences } from '../models/OwnerPreferences';
import { OwnerRentNotice, IOwnerRentNotice } from '../models/OwnerRentNotice';
import { Payment } from '../models/Payment';
import { sendMail } from './emailService';
import {
  buildOwnerRentEmail,
  composeOwnerRentNotice,
  composeOwnerReversalNotice,
  deliverOwnerRentNotice,
  describeRentalPeriodAfterReversal,
  escapeHtml,
  ownerRentIdempotencyKey,
  ownerRentNoticeScope,
  ownerRentPeriodLabel,
  ownerReversalIdempotencyKey,
  selectPropertyOwnerForRentNotice,
  type OwnerRentNoticeStatus,
  type OwnerRentNoticeStore,
} from './ownerRentNotificationPolicy';

export {
  buildOwnerRentEmail,
  buildOwnerRentPaymentEmail,
  composeOwnerRentNotice,
  composeOwnerReversalNotice,
  deliverOwnerRentNotice,
  describeRentalPeriodAfterReversal,
  ownerRentEmailDecision,
  ownerRentIdempotencyKey,
  ownerReversalIdempotencyKey,
  resolveOwnerRentNoticeFigures,
  sanitizeReversalReason,
  selectPropertyOwnerForRentNotice,
} from './ownerRentNotificationPolicy';
export type { OwnerRentNoticeStatus } from './ownerRentNotificationPolicy';

export async function notifyOwnerOfRentPayment(payment: {
  _id: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  paymentType?: string;
  status?: string;
  isProvisional?: boolean;
  reversalOfPaymentId?: mongoose.Types.ObjectId;
  amount?: number;
  depositAmount?: number;
  paymentDate?: Date;
  currency?: string;
  rentAllocated?: number;
  levyAllocated?: number;
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month?: number; year?: number };
  advancePeriodEnd?: { month?: number; year?: number };
  manualPropertyAddress?: string;
  commissionDetails?: Record<string, unknown>;
  notes?: string;
}, options?: { accountingComplete?: boolean }): Promise<void> {
  try {
    if (options?.accountingComplete !== true) return;
    if (!payment?._id || !payment.propertyId || !payment.companyId) return;
    if (payment.paymentType !== 'rental' && payment.paymentType !== 'introduction') return;
    if (payment.status && payment.status !== 'completed') return;
    if (payment.isProvisional) return;
    if (payment.reversalOfPaymentId) return;
    if ((payment as any).reversalPaymentId) return;
    const reversalState = String((payment as any).reversalState || '');
    if (reversalState === 'reversal_in_progress' || reversalState === 'reversal_incomplete' || reversalState === 'reversed') return;
    if (Number(payment.amount || 0) <= 0 && Number(payment.rentAllocated || 0) <= 0) return;
    const key = ownerRentIdempotencyKey(String(payment._id));
    const property = await Property.findOne({
      _id: payment.propertyId,
      companyId: payment.companyId,
    }).select('name address companyId').lean();
    if (!property) return;
    const ownerRows = await PropertyOwner.find({
      companyId: payment.companyId,
      properties: payment.propertyId,
      active: { $ne: false },
    }).select('email firstName lastName companyId properties active').lean();
    const selected = selectPropertyOwnerForRentNotice({
      companyId: String(payment.companyId),
      propertyId: String(payment.propertyId),
      owners: ownerRows.map((row) => ({
        id: String(row._id),
        companyId: String(row.companyId),
        propertyIds: Array.isArray((row as any).properties) ? (row as any).properties.map((id: unknown) => String(id)) : [],
        active: (row as any).active !== false,
      })),
    });
    const owner = selected ? ownerRows.find((row) => String(row._id) === selected.id) : undefined;
    if (!owner) {
      console.warn(
        '[owner-rent-notice] skipped',
        String(payment._id),
        ownerRows.length > 1 ? 'multiple_property_owners' : 'property_owner_not_linked'
      );
      return;
    }
    if (!ownerRentNoticeScope({
      paymentCompanyId: String(payment.companyId),
      propertyCompanyId: String((property as any).companyId || ''),
      ownerCompanyId: String(owner.companyId || ''),
    })) return;
    const prefs = await OwnerPreferences.findOne({ ownerId: owner._id, companyId: owner.companyId }).select('rentPaymentEmails').lean();
    const company = await Company.findById(owner.companyId).select('name').lean();
    const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Owner';
    const propertyAddress = String((property as any).address || payment.manualPropertyAddress || '').trim();
    const composed = composeOwnerRentNotice({
      payment: payment as any,
      ownerName,
      propertyAddress,
    });
    const email = composed.ok
      ? composed.email
      : payment.paymentType === 'introduction'
        ? buildOwnerRentEmail({
            ownerName,
            propertyName: propertyAddress || String((property as any).name || 'your property'),
            amount: Number(payment.amount || 0),
            currency: payment.currency || 'USD',
            paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
            agencyName: String((company as any)?.name || 'Your agency'),
          })
        : null;
    if (!email) {
      console.warn('[owner-rent-notice] skipped', String(payment._id), composed.ok ? '' : composed.reason);
      return;
    }
    const store: OwnerRentNoticeStore = {
      async findByKey(idempotencyKey) {
        const row = await OwnerRentNotice.findOne({ idempotencyKey }).select('status').lean();
        return row ? { status: row.status as OwnerRentNoticeStatus } : null;
      },
      async save(doc) {
        await OwnerRentNotice.findOneAndUpdate(
          { idempotencyKey: doc.idempotencyKey },
          {
            $set: {
              status: doc.status,
              failureReason: doc.failureReason,
              companyId: owner.companyId,
              ownerId: owner._id,
              paymentId: payment._id,
              propertyId: payment.propertyId,
            },
            $setOnInsert: { idempotencyKey: doc.idempotencyKey },
          },
          { upsert: true }
        );
      },
      async send(message) {
        if (
          process.env.NODE_ENV !== 'production' &&
          process.env.MANTIS_TEST_SEAM === '1' &&
          String((payment as any).notes || '').includes('PHASE4B1_FAIL_MAIL')
        ) {
          const seams = (global as any).__phase4b1MailSeam || ((global as any).__phase4b1MailSeam = new Set<string>());
          const seamKey = String(payment._id);
          if (!seams.has(seamKey)) {
            seams.add(seamKey);
            throw new Error('PHASE4B1_FAIL_MAIL');
          }
        }
        await sendMail({
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html || `<pre>${escapeHtml(message.text)}</pre>`,
        });
      },
    };
    await deliverOwnerRentNotice({
      idempotencyKey: key,
      ownerEmail: String(owner.email || '').trim() || undefined,
      rentPaymentEmails: (prefs as any)?.rentPaymentEmails,
      accountingComplete: true,
      email,
    }, store);
  } catch (error) {
    console.warn('[owner-rent-notice] notification failed without affecting payment', (error as any)?.message || error);
  }
}

/**
 * Owner reversal notice. The original rent-received row is never rewritten.
 * The email is sent only after reversalState is reversed. Until then the row waits.
 * Delivery failure does not change payment or accounting state.
 */
export async function notifyOwnerOfRentReversal(payment: {
  _id: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  referenceNumber?: string;
  amount?: number;
  currency?: string;
  manualPropertyAddress?: string;
  reversalPaymentId?: mongoose.Types.ObjectId;
  reversalState?: string;
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month?: number; year?: number };
  advancePeriodEnd?: { month?: number; year?: number };
}, reason: string, options?: {
  settled?: boolean;
  send?: (params: { to: string; subject: string; text: string; html?: string }) => Promise<void>;
}): Promise<void> {
  try {
    if (!payment?._id || !payment.propertyId || !payment.companyId) return;
    const reversalState = String(payment.reversalState || '');
    const settled = options?.settled === true || (options?.settled !== false && reversalState === 'reversed');
    const reversalPaymentId = payment.reversalPaymentId;
    const key = ownerReversalIdempotencyKey(String(payment._id), reversalPaymentId ? String(reversalPaymentId) : undefined);
    const existing = await OwnerRentNotice.findOne({ idempotencyKey: key }).select('status').lean();
    if (existing && (existing.status === 'SENT' || existing.status === 'SKIPPED_OPT_OUT')) return;

    const property = await Property.findOne({
      _id: payment.propertyId,
      companyId: payment.companyId,
    }).select('name address companyId').lean();
    if (!property) return;
    const ownerRows = await PropertyOwner.find({
      companyId: payment.companyId,
      properties: payment.propertyId,
      active: { $ne: false },
    }).select('email firstName lastName companyId properties active').lean();
    const selected = selectPropertyOwnerForRentNotice({
      companyId: String(payment.companyId),
      propertyId: String(payment.propertyId),
      owners: ownerRows.map((row) => ({
        id: String(row._id),
        companyId: String(row.companyId),
        propertyIds: Array.isArray((row as any).properties) ? (row as any).properties.map((id: unknown) => String(id)) : [],
        active: (row as any).active !== false,
      })),
    });
    const owner = selected ? ownerRows.find((row) => String(row._id) === selected.id) : undefined;
    if (!owner || !ownerRentNoticeScope({
      paymentCompanyId: String(payment.companyId),
      propertyCompanyId: String((property as any).companyId || ''),
      ownerCompanyId: String(owner.companyId || ''),
    })) return;

    const noticeBase = {
      companyId: owner.companyId,
      ownerId: owner._id,
      paymentId: payment._id,
      propertyId: payment.propertyId,
      ...(reversalPaymentId ? { reversalPaymentId } : {}),
    };
    if (!settled) {
      await OwnerRentNotice.findOneAndUpdate(
        { idempotencyKey: key },
        { $set: { ...noticeBase, status: 'AWAITING_SETTLEMENT' }, $setOnInsert: { idempotencyKey: key, attemptCount: 0 } },
        { upsert: true }
      );
      return;
    }

    const prefs = await OwnerPreferences.findOne({ ownerId: owner._id, companyId: owner.companyId }).select('rentPaymentEmails').lean();
    if ((prefs as any)?.rentPaymentEmails === false) {
      await OwnerRentNotice.findOneAndUpdate(
        { idempotencyKey: key },
        { $set: { ...noticeBase, status: 'SKIPPED_OPT_OUT' }, $setOnInsert: { idempotencyKey: key, attemptCount: 0 } },
        { upsert: true }
      );
      return;
    }
    const to = String(owner.email || '').trim();
    if (!to) {
      await OwnerRentNotice.findOneAndUpdate(
        { idempotencyKey: key },
        {
          $set: { ...noticeBase, status: 'FAILED', failureReason: 'Owner email missing' },
          $setOnInsert: { idempotencyKey: key, attemptCount: 0 },
        },
        { upsert: true }
      );
      return;
    }

    const reversal = reversalPaymentId
      ? await Payment.findOne({ _id: reversalPaymentId, companyId: payment.companyId, reversalOfPaymentId: payment._id })
        .select('referenceNumber amount paymentDate companyId')
        .lean()
      : null;
    const periodKnown = Number.isFinite(Number(payment.rentalPeriodMonth)) && Number.isFinite(Number(payment.rentalPeriodYear));
    const periodPayments = periodKnown && payment.tenantId
      ? await Payment.find({
        companyId: payment.companyId,
        propertyId: payment.propertyId,
        tenantId: payment.tenantId,
        paymentType: 'rental',
        rentalPeriodYear: payment.rentalPeriodYear,
        rentalPeriodMonth: payment.rentalPeriodMonth,
      }).select('amount rentAllocated status postingStatus reversalState reversalOfPaymentId isCorrectionEntry referenceNumber').lean()
      : [];
    const position = describeRentalPeriodAfterReversal({
      periodKnown,
      payments: periodPayments as Array<Record<string, any>>,
      originalPaymentId: String(payment._id),
    });
    const email = composeOwnerReversalNotice({
      ownerName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Owner',
      propertyLabel: String((property as any).address || payment.manualPropertyAddress || (property as any).name || 'your property'),
      currency: payment.currency || 'USD',
      originalReference: String(payment.referenceNumber || payment._id),
      originalAmount: Number(payment.amount || 0),
      reversalReference: reversal ? String((reversal as any).referenceNumber || reversal._id) : undefined,
      reversalAmount: reversal ? Number((reversal as any).amount) : undefined,
      reversalDate: reversal ? (reversal as any).paymentDate : undefined,
      reason,
      periodLabel: ownerRentPeriodLabel(payment),
      position,
    });
    const deliver = options?.send || sendMail;
    await OwnerRentNotice.findOneAndUpdate(
      { idempotencyKey: key },
      { $set: { ...noticeBase, status: 'PENDING' }, $setOnInsert: { idempotencyKey: key }, $inc: { attemptCount: 1 } },
      { upsert: true }
    );
    try {
      await deliver({ to, subject: email.subject, text: email.text, html: email.html });
      await OwnerRentNotice.findOneAndUpdate(
        { idempotencyKey: key },
        { $set: { ...noticeBase, status: 'SENT', failureReason: undefined } }
      );
    } catch (sendError: any) {
      const failureReason = String(sendError?.message || 'Email failed').replace(/[\r\n]+/g, ' ').slice(0, 240);
      await OwnerRentNotice.findOneAndUpdate(
        { idempotencyKey: key },
        { $set: { ...noticeBase, status: 'FAILED', failureReason } }
      );
    }
  } catch (error) {
    console.warn('[owner-rent-reversal] notification failed without affecting payment', (error as any)?.message || error);
  }
}

export type { IOwnerRentNotice };
