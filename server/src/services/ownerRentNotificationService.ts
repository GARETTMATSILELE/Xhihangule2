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
  composeOwnerRentNotice,
  deliverOwnerRentNotice,
  escapeHtml,
  ownerRentIdempotencyKey,
  ownerRentNoticeScope,
  selectPropertyOwnerForRentNotice,
  type OwnerRentNoticeStatus,
  type OwnerRentNoticeStore,
} from './ownerRentNotificationPolicy';

export {
  buildOwnerRentEmail,
  buildOwnerRentPaymentEmail,
  composeOwnerRentNotice,
  deliverOwnerRentNotice,
  ownerRentEmailDecision,
  ownerRentIdempotencyKey,
  resolveOwnerRentNoticeFigures,
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

export type { IOwnerRentNotice };
