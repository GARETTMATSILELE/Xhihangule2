import mongoose from 'mongoose';
import { CommunicationPreference } from '../../ecosystem/models/commsAndPayments';
import { Company } from '../../models/Company';
import { Lease } from '../../models/Lease';
import { Inspection } from '../../models/Inspection';
import { MaintenanceRequest } from '../../models/MaintenanceRequest';
import { Payment } from '../../models/Payment';
import { NotificationService } from '../../ecosystem/services/notificationService';
import {
  defaultNotificationPreferences,
  type IndividualNotificationEvent
} from './operations';

export async function getIndividualNotificationPreferences(userId: string) {
  const prefs = await CommunicationPreference.findOne({ userId }).lean();
  return {
    ...defaultNotificationPreferences(),
    ...((prefs as any)?.individualEvents || {})
  };
}

export async function saveIndividualNotificationPreferences(
  userId: string,
  events: Partial<Record<IndividualNotificationEvent, { email?: boolean; inApp?: boolean }>>
) {
  const current = await getIndividualNotificationPreferences(userId);
  const next = { ...current };
  for (const [key, value] of Object.entries(events || {})) {
    if (!value) continue;
    next[key as IndividualNotificationEvent] = {
      email: value.email !== false,
      inApp: value.inApp !== false
    };
  }
  await CommunicationPreference.findOneAndUpdate(
    { userId },
    { $set: { individualEvents: next, userId: new mongoose.Types.ObjectId(userId) } },
    { upsert: true }
  );
  return next;
}

export async function scanIndividualOwnerNotices(companyId: string, userId: string): Promise<void> {
  const company = await Company.findById(companyId).select('workspaceType').lean();
  if ((company as any)?.workspaceType !== 'individual') return;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const leases = await Lease.find({
    companyId,
    status: { $in: ['active', 'expiring_soon'] },
    endDate: { $lte: soon, $gte: new Date() }
  }).select('endDate propertyId').limit(20).lean();
  for (const lease of leases) {
    await NotificationService.notifyEvent({
      recipientId: userId,
      companyId,
      eventType: 'LEASE_EXPIRING',
      variables: { propertyName: 'your property', date: new Date((lease as any).endDate).toLocaleDateString() },
      idempotencyKey: `lease-expiring:${lease._id}:${today}`,
      operational: true
    });
  }
  const inspections = await Inspection.find({
    companyId,
    scheduledDate: { $lte: soon, $gte: new Date() },
    status: { $nin: ['completed', 'cancelled'] }
  }).select('scheduledDate').limit(20).lean();
  for (const inspection of inspections) {
    await NotificationService.notifyEvent({
      recipientId: userId,
      companyId,
      eventType: 'INSPECTION_DUE',
      variables: { propertyName: 'your property' },
      idempotencyKey: `inspection-due:${inspection._id}:${today}`,
      operational: true
    });
  }
  const recent = new Date();
  recent.setDate(recent.getDate() - 2);
  const completed = await MaintenanceRequest.find({
    companyId,
    status: { $in: ['completed', 'closed'] },
    updatedAt: { $gte: recent }
  }).select('propertyId').sort({ updatedAt: -1 }).limit(10).lean();
  for (const job of completed) {
    await NotificationService.notifyEvent({
      recipientId: userId,
      companyId,
      eventType: 'MAINTENANCE_COMPLETED',
      variables: { propertyName: 'your property' },
      idempotencyKey: `maintenance-completed:${job._id}`,
      operational: true
    });
  }
  if (new Date().getDate() >= 8 && leases.length > 0) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const receipts = await Payment.countDocuments({
      companyId,
      status: { $in: ['completed', 'paid', 'success'] },
      paymentType: { $in: ['rental', 'introduction'] },
      paymentDate: { $gte: monthStart }
    });
    if (receipts === 0) {
      await NotificationService.notifyEvent({
        recipientId: userId,
        companyId,
        eventType: 'RENT_PAYMENT_REMINDER',
        variables: { amount: 'this month’s rent', propertyName: 'your portfolio' },
        idempotencyKey: `rent-overdue:${companyId}:${today}`,
        operational: true
      });
    }
  }
}
