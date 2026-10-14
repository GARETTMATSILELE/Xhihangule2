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
import { sendMail } from './emailService';
import {
  buildOwnerRentEmail,
  deliverOwnerRentNotice,
  ownerRentIdempotencyKey,
  type OwnerRentNoticeStatus,
  type OwnerRentNoticeStore,
} from './ownerRentNotificationPolicy';

export {
  buildOwnerRentEmail,
  deliverOwnerRentNotice,
  ownerRentEmailDecision,
  ownerRentIdempotencyKey,
} from './ownerRentNotificationPolicy';
export type { OwnerRentNoticeStatus } from './ownerRentNotificationPolicy';

export async function notifyOwnerOfRentPayment(payment: {
  _id: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  paymentType?: string;
  amount?: number;
  paymentDate?: Date;
  currency?: string;
}, options?: { accountingComplete?: boolean }): Promise<void> {
  try {
    if (options?.accountingComplete !== true) return;
    if (!payment?._id || !payment.propertyId) return;
    if (payment.paymentType !== 'rental' && payment.paymentType !== 'introduction') return;
    if (Number(payment.amount || 0) <= 0) return;
    const key = ownerRentIdempotencyKey(String(payment._id));
    const property = await Property.findById(payment.propertyId).select('name ownerId propertyOwnerId companyId').lean();
    const ownerRef = (property as any)?.propertyOwnerId || property?.ownerId;
    if (!ownerRef) return;
    const owner = await PropertyOwner.findOne({
      _id: ownerRef,
      ...(payment.companyId ? { companyId: payment.companyId } : {}),
    }).select('email firstName lastName companyId').lean();
    if (!owner) return;
    const prefs = await OwnerPreferences.findOne({ ownerId: owner._id, companyId: owner.companyId }).select('rentPaymentEmails').lean();
    const company = await Company.findById(owner.companyId).select('name').lean();
    const email = buildOwnerRentEmail({
      ownerName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Owner',
      propertyName: String((property as any).name || 'your property'),
      amount: Number(payment.amount || 0),
      currency: payment.currency || 'USD',
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
      agencyName: String((company as any)?.name || 'Your agency'),
    });
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
        await sendMail({ to: message.to, subject: message.subject, text: message.text, html: `<pre>${message.text}</pre>` });
      },
    };
    await deliverOwnerRentNotice({
      idempotencyKey: key,
      ownerEmail: owner.email,
      rentPaymentEmails: (prefs as any)?.rentPaymentEmails,
      accountingComplete: true,
      email,
    }, store);
  } catch (error) {
    console.warn('[owner-rent-notice] notification failed without affecting payment', (error as any)?.message || error);
  }
}

export type { IOwnerRentNotice };
