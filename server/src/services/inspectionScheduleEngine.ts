import mongoose from 'mongoose';
import { ILease } from '../models/Lease';
import { InspectionFrequency, InspectionStatus, InspectionType } from '../models/Inspection';

const DAY_MS = 24 * 60 * 60 * 1000;

const standardRoomItems = [
  'Floor',
  'Ceiling',
  'Walls',
  'Window panes',
  'Window sliders',
  'Peg stays',
  'Handles',
  'Burglar bars',
  'Door',
  'Door keys',
  'Pelmet or curtain rails',
  'Air vents',
  'Light fittings',
];

const separateToiletItems = [
  ...standardRoomItems,
  'Toilet seat and cover',
  'Toilet pan',
  'Tissue holder',
  'Cistern',
  'Sockets',
  'Wash hand basin',
  'Taps',
];

const bathroomItems = [
  ...separateToiletItems,
  'Shower',
  'Tub or jacuzzi',
];

const roomTemplates: Array<[string, string[]]> = [
  ['Entrance', [...standardRoomItems, 'Sockets']],
  ['Lounge', standardRoomItems],
  ['Dining Room', standardRoomItems],
  ['Bedroom 1', standardRoomItems],
  ['Kitchen', [...standardRoomItems, 'Wall tiles', 'Sinks', 'Stoppers', 'Cupboards', 'Cooker', 'Sockets']],
  ['Pantry', standardRoomItems],
  ['Scullery', [...standardRoomItems, 'Wall tiles', 'Sinks', 'Stoppers', 'Cupboards', 'Sockets']],
  ['Passage', [...standardRoomItems, 'Linen cupboards', 'Sockets']],
  ['Separate Toilet', separateToiletItems],
  ['Bathroom', bathroomItems],
  ['Main Ensuite', bathroomItems],
  ['Garage', [...standardRoomItems, 'Garage door', 'Garage motor', 'Shelving', 'Sockets']],
  ['Verandah', standardRoomItems],
  ['Yard', ['Durawall', 'Gutters', 'Swimming pool', 'Driveway', 'Roof', 'Gate', 'Gate motor', 'Security lighting', 'Pavement']],
  ['Staff Quarter Bedroom 1', standardRoomItems],
  ['Staff Quarter Kitchen', [...standardRoomItems, 'Wall tiles', 'Sinks', 'Stoppers', 'Cupboards', 'Cooker', 'Sockets']],
  ['Staff Quarter Bathroom', bathroomItems],
  ['Boardroom', standardRoomItems],
];

export type GeneratedInspectionSchedule = {
  propertyId: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  leaseId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  scheduledDate: Date;
  originalScheduledDate?: Date;
  nextInspectionDate?: Date;
  frequency: InspectionFrequency;
  customIntervalDays?: number;
  type: InspectionType;
  status: InspectionStatus;
  generatedBy: 'lease_activation' | 'lease_termination' | 'recurrence' | 'follow_up';
  recurrenceGroupId: mongoose.Types.ObjectId;
  reminders: Array<{
    type: 'agent';
    remindAt: Date;
    status: 'pending';
    message: string;
  }>;
};

export function addInspectionInterval(date: Date, frequency: InspectionFrequency, customIntervalDays?: number): Date {
  const next = new Date(date);
  if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (frequency === 'quarterly') next.setMonth(next.getMonth() + 3);
  else if (frequency === 'biannual') next.setMonth(next.getMonth() + 6);
  else if (frequency === 'annual') next.setFullYear(next.getFullYear() + 1);
  else if (frequency === 'custom') next.setDate(next.getDate() + Math.max(1, Number(customIntervalDays || 90)));
  return next;
}

export function resolveInspectionStatus(scheduledDate: Date, completedAt?: Date | null, explicitStatus?: InspectionStatus): InspectionStatus {
  if (explicitStatus === 'cancelled' || explicitStatus === 'completed' || explicitStatus === 'reviewed' || explicitStatus === 'follow_up_required' || explicitStatus === 'in_progress' || explicitStatus === 'draft' || explicitStatus === 'rescheduled' || explicitStatus === 'missed') {
    return explicitStatus;
  }
  if (completedAt) return 'completed';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(scheduledDate);
  due.setHours(0, 0, 0, 0);

  if (due.getTime() === today.getTime()) return 'due_today';
  if (due < today) return 'overdue';
  const sevenDaysOut = new Date(today.getTime() + 7 * DAY_MS);
  return due <= sevenDaysOut ? 'upcoming' : 'scheduled';
}

export function buildInspectionReminders(scheduledDate: Date, propertyLabel: string) {
  const offsets = [
    { days: 7, label: '7 days before' },
    { days: 1, label: '1 day before' },
    { days: 0, label: 'due today' },
  ];
  return offsets.map((offset) => ({
    type: 'agent' as const,
    remindAt: new Date(scheduledDate.getTime() - offset.days * DAY_MS),
    status: 'pending' as const,
    message: `${propertyLabel} inspection ${offset.label}`,
  })).concat([{
    type: 'agent' as const,
    remindAt: new Date(scheduledDate.getTime() + DAY_MS),
    status: 'pending' as const,
    message: `${propertyLabel} inspection is overdue`,
  }]);
}

export function generateLeaseInspectionSchedule(
  lease: ILease,
  options: {
    frequency?: InspectionFrequency;
    customIntervalDays?: number;
    propertyLabel?: string;
    includeMoveIn?: boolean;
    includeMoveOut?: boolean;
  } = {}
): GeneratedInspectionSchedule[] {
  const frequency = options.frequency || 'quarterly';
  const recurrenceGroupId = new mongoose.Types.ObjectId();
  const propertyLabel = options.propertyLabel || 'Property';
  const schedules: GeneratedInspectionSchedule[] = [];

  const base = {
    propertyId: lease.propertyId,
    tenantId: lease.tenantId,
    leaseId: lease._id as mongoose.Types.ObjectId,
    companyId: lease.companyId,
    ownerId: lease.ownerId as mongoose.Types.ObjectId,
    frequency,
    customIntervalDays: options.customIntervalDays,
    recurrenceGroupId,
  };

  if (options.includeMoveIn !== false) {
    schedules.push({
      ...base,
      scheduledDate: new Date(lease.startDate),
      type: 'move_in',
      status: resolveInspectionStatus(new Date(lease.startDate)),
      generatedBy: 'lease_activation',
      reminders: buildInspectionReminders(new Date(lease.startDate), propertyLabel),
    });
  }

  let cursor = addInspectionInterval(new Date(lease.startDate), frequency, options.customIntervalDays);
  while (cursor <= lease.endDate) {
    const next = addInspectionInterval(cursor, frequency, options.customIntervalDays);
    schedules.push({
      ...base,
      scheduledDate: new Date(cursor),
      nextInspectionDate: next <= lease.endDate ? next : undefined,
      type: 'routine',
      status: resolveInspectionStatus(cursor),
      generatedBy: 'recurrence',
      reminders: buildInspectionReminders(cursor, propertyLabel),
    });
    cursor = next;
  }

  if (options.includeMoveOut !== false) {
    schedules.push({
      ...base,
      scheduledDate: new Date(lease.endDate),
      type: 'move_out',
      status: resolveInspectionStatus(new Date(lease.endDate)),
      generatedBy: 'lease_termination',
      reminders: buildInspectionReminders(new Date(lease.endDate), propertyLabel),
    });
  }

  return schedules;
}

export function defaultChecklistForInspection(type: InspectionType) {
  const baseline = roomTemplates.flatMap(([room, items]) => items.map((item) => [room, room, item]));
  if (type === 'move_in' || type === 'move_out') {
    baseline.push(['Utilities', 'Utilities', 'Meter readings recorded']);
    baseline.push(['Legal Baseline', 'Legal Baseline', 'Damages photographed and acknowledged']);
    baseline.push(['Legal Baseline', 'Legal Baseline', 'Keys and remotes confirmed']);
  }
  return baseline.map(([room, category, item]) => ({
    room,
    category,
    item,
    status: 'pending' as const,
    notes: '',
    severity: 'low' as const,
    photos: [],
  }));
}

