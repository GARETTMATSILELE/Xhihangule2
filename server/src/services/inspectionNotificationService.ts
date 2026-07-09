import { Notification } from '../models/Notification';
import { Inspection } from '../models/Inspection';

export async function notifyInspectionEvent(input: {
  companyId: string;
  userId: any;
  title: string;
  message: string;
  inspectionId?: any;
  link?: string;
  eventType: string;
}) {
  if (!input.companyId || !input.userId) return null;

  return Notification.create({
    companyId: String(input.companyId),
    userId: input.userId,
    title: input.title,
    message: input.message,
    link: input.link || '/agent-dashboard/inspections',
    read: false,
    payload: {
      entity: 'inspection',
      eventType: input.eventType,
      inspectionId: input.inspectionId ? String(input.inspectionId) : undefined,
    }
  });
}

export async function dispatchDueInspectionReminders(companyId: string, userId?: string): Promise<number> {
  const now = new Date();
  const query: any = {
    companyId,
    reminders: {
      $elemMatch: {
        status: 'pending',
        remindAt: { $lte: now }
      }
    }
  };
  if (userId) query.ownerId = userId;

  const inspections = await Inspection.find(query)
    .populate('propertyId', 'name address')
    .limit(100);

  let sent = 0;
  for (const inspection of inspections as any[]) {
    const dueReminders = (inspection.reminders || []).filter((reminder: any) => reminder.status === 'pending' && reminder.remindAt <= now);
    for (const reminder of dueReminders) {
      await notifyInspectionEvent({
        companyId,
        userId: inspection.ownerId,
        title: inspection.status === 'overdue' ? 'Inspection overdue' : 'Inspection reminder',
        message: reminder.message || `${inspection.propertyId?.name || inspection.propertyId?.address || 'Property'} inspection reminder`,
        inspectionId: inspection._id,
        eventType: 'reminder',
      });
      reminder.status = 'sent';
      sent += 1;
    }
    await inspection.save();
  }

  return sent;
}

