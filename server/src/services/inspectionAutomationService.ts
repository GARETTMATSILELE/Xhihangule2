import { Inspection } from '../models/Inspection';
import { ILease } from '../models/Lease';
import { generateLeaseInspectionSchedule, defaultChecklistForInspection, buildInspectionReminders, resolveInspectionStatus } from './inspectionScheduleEngine';

export async function ensureLeaseInspectionSchedule(lease: ILease, propertyLabel = 'Property'): Promise<number> {
  if (!lease.ownerId || !lease.companyId || !lease.propertyId || !lease.tenantId) return 0;

  const schedules = generateLeaseInspectionSchedule(lease, {
    frequency: 'quarterly',
    propertyLabel,
    includeMoveIn: true,
    includeMoveOut: true,
  });

  let createdCount = 0;
  for (const schedule of schedules) {
    const exists = await Inspection.exists({
      companyId: schedule.companyId,
      leaseId: schedule.leaseId,
      type: schedule.type,
      scheduledDate: schedule.scheduledDate
    });
    if (exists) continue;

    await Inspection.create({
      ...schedule,
      originalScheduledDate: schedule.scheduledDate,
      checklist: defaultChecklistForInspection(schedule.type),
      template: {
        name: schedule.type === 'move_in'
          ? 'Move-In inspection'
          : schedule.type === 'move_out'
            ? 'Move-Out inspection'
            : 'Routine inspection'
      }
    });
    createdCount += 1;
  }

  return createdCount;
}

export async function ensureMoveOutInspection(lease: ILease, moveOutDate: Date, propertyLabel = 'Property'): Promise<boolean> {
  if (!lease.ownerId || !lease.companyId || !lease.propertyId || !lease.tenantId) return false;

  const exists = await Inspection.exists({
    companyId: lease.companyId,
    leaseId: lease._id,
    type: 'move_out',
    scheduledDate: moveOutDate
  });
  if (exists) return false;

  await Inspection.create({
    propertyId: lease.propertyId,
    tenantId: lease.tenantId,
    leaseId: lease._id,
    companyId: lease.companyId,
    ownerId: lease.ownerId,
    scheduledDate: moveOutDate,
    originalScheduledDate: moveOutDate,
    frequency: 'ad_hoc',
    type: 'move_out',
    status: resolveInspectionStatus(moveOutDate),
    generatedBy: 'lease_termination',
    reminders: buildInspectionReminders(moveOutDate, propertyLabel),
    checklist: defaultChecklistForInspection('move_out'),
    template: { name: 'Move-Out inspection' },
    notes: 'Automatically created for lease move-out and deposit settlement.'
  });

  return true;
}

