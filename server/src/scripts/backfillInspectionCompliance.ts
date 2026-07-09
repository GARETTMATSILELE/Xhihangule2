import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Lease } from '../models/Lease';
import { Inspection } from '../models/Inspection';
import { Notification } from '../models/Notification';
import { defaultChecklistForInspection, generateLeaseInspectionSchedule, resolveInspectionStatus } from '../services/inspectionScheduleEngine';
import { logger } from '../utils/logger';

type BackfillOptions = {
  apply: boolean;
  companyId?: string;
  sendSummaryNotifications: boolean;
  createHistoricalMissed: boolean;
};

type AgentSummary = {
  userId: mongoose.Types.ObjectId;
  companyId: string;
  linkedLegacy: number;
  createdOverdue: number;
  createdDueToday: number;
  createdUpcoming: number;
  createdScheduled: number;
  createdMissed: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv: string[]): BackfillOptions {
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run');
  if (apply && dryRun) {
    throw new Error('Use either --apply or --dry-run, not both.');
  }

  const companyArg = argv.find((arg) => arg.startsWith('--companyId='));
  return {
    apply,
    companyId: companyArg ? companyArg.split('=')[1] : undefined,
    sendSummaryNotifications: !argv.includes('--no-reminder-spam') && argv.includes('--summary-notifications'),
    createHistoricalMissed: argv.includes('--create-historical-missed'),
  };
}

function monthWindow(date: Date) {
  const start = new Date(date.getTime() - 14 * DAY_MS);
  const end = new Date(date.getTime() + 14 * DAY_MS);
  return { start, end };
}

function classifyStatus(date: Date, leaseEndDate: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const end = new Date(leaseEndDate);
  end.setHours(0, 0, 0, 0);

  if (end < today && due < today) return 'missed';
  return resolveInspectionStatus(date);
}

function getSummary(summaries: Map<string, AgentSummary>, companyId: string, userId: mongoose.Types.ObjectId): AgentSummary {
  const key = `${companyId}:${String(userId)}`;
  const existing = summaries.get(key);
  if (existing) return existing;
  const summary: AgentSummary = {
    userId,
    companyId,
    linkedLegacy: 0,
    createdOverdue: 0,
    createdDueToday: 0,
    createdUpcoming: 0,
    createdScheduled: 0,
    createdMissed: 0,
  };
  summaries.set(key, summary);
  return summary;
}

function incrementSummary(summary: AgentSummary, status: string) {
  if (status === 'overdue') summary.createdOverdue += 1;
  else if (status === 'due_today') summary.createdDueToday += 1;
  else if (status === 'upcoming') summary.createdUpcoming += 1;
  else if (status === 'missed') summary.createdMissed += 1;
  else summary.createdScheduled += 1;
}

export async function runInspectionComplianceBackfill(options: BackfillOptions) {
  await connectDatabase();

  const leaseQuery: any = {
    status: { $in: ['active', 'expiring_soon', 'pending_approval', 'expired', 'terminated', 'pending_settlement', 'closed'] },
  };
  if (options.companyId) {
    if (!mongoose.Types.ObjectId.isValid(options.companyId)) {
      throw new Error('Invalid --companyId value.');
    }
    leaseQuery.companyId = new mongoose.Types.ObjectId(options.companyId);
  }

  const leases = await Lease.find(leaseQuery).populate('propertyId', 'name address').sort({ companyId: 1, ownerId: 1, startDate: 1 });
  const summaries = new Map<string, AgentSummary>();

  let scanned = 0;
  let linkedLegacy = 0;
  let created = 0;
  let skippedExisting = 0;
  let skippedHistorical = 0;

  for (const lease of leases as any[]) {
    scanned += 1;
    if (!lease.ownerId || !lease.propertyId || !lease.tenantId) continue;

    const companyId = String(lease.companyId);
    const summary = getSummary(summaries, companyId, lease.ownerId);
    const propertyLabel = lease.propertyId?.name || lease.propertyId?.address || 'Property';
    const schedules = generateLeaseInspectionSchedule(lease, {
      frequency: 'quarterly',
      propertyLabel,
      includeMoveIn: true,
      includeMoveOut: true,
    });

    for (const schedule of schedules) {
      const existingLinked = await Inspection.exists({
        companyId: schedule.companyId,
        leaseId: schedule.leaseId,
        type: schedule.type,
        scheduledDate: schedule.scheduledDate,
      });
      if (existingLinked) {
        skippedExisting += 1;
        continue;
      }

      const { start, end } = monthWindow(schedule.scheduledDate);
      const legacyMatch = await Inspection.findOne({
        companyId: schedule.companyId,
        propertyId: schedule.propertyId,
        leaseId: { $in: [null, undefined] },
        scheduledDate: { $gte: start, $lte: end },
      }).sort({ scheduledDate: 1 });

      if (legacyMatch) {
        linkedLegacy += 1;
        summary.linkedLegacy += 1;
        if (options.apply) {
          legacyMatch.leaseId = schedule.leaseId;
          legacyMatch.tenantId = legacyMatch.tenantId || schedule.tenantId;
          legacyMatch.type = legacyMatch.type || schedule.type;
          legacyMatch.generatedBy = legacyMatch.generatedBy || 'manual';
          legacyMatch.status = legacyMatch.completedAt ? 'completed' : classifyStatus(legacyMatch.scheduledDate, lease.endDate) as any;
          await legacyMatch.save();
        }
        continue;
      }

      const status = classifyStatus(schedule.scheduledDate, lease.endDate);
      if (status === 'missed' && !options.createHistoricalMissed) {
        skippedHistorical += 1;
        continue;
      }

      created += 1;
      incrementSummary(summary, status);
      if (options.apply) {
        await Inspection.create({
          ...schedule,
          status,
          reminders: status === 'missed' ? [] : schedule.reminders,
          originalScheduledDate: schedule.scheduledDate,
          checklist: defaultChecklistForInspection(schedule.type),
          template: {
            name: schedule.type === 'move_in'
              ? 'Move-In inspection'
              : schedule.type === 'move_out'
                ? 'Move-Out inspection'
                : 'Routine inspection'
          },
          notes: status === 'missed'
            ? 'Backfilled as missed because this inspection fell in a completed historical occupancy period.'
            : 'Backfilled from lease-driven inspection compliance rollout.'
        });
      }
    }
  }

  if (options.apply && options.sendSummaryNotifications) {
    for (const summary of summaries.values()) {
      const needsAttention = summary.createdOverdue + summary.createdDueToday + summary.createdUpcoming + summary.createdMissed;
      if (needsAttention <= 0 && summary.linkedLegacy <= 0) continue;
      await Notification.create({
        companyId: summary.companyId,
        userId: summary.userId,
        title: 'Inspection compliance backfill completed',
        message: `${needsAttention} inspection item${needsAttention === 1 ? '' : 's'} need attention. ${summary.linkedLegacy} legacy inspection${summary.linkedLegacy === 1 ? '' : 's'} were linked to lease history.`,
        link: '/agent-dashboard/inspections',
        read: false,
        payload: {
          entity: 'inspection',
          eventType: 'compliance_backfill_summary',
          skipEmail: true,
          summary,
        }
      });
    }
  }

  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    scannedLeases: scanned,
    linkedLegacy,
    created,
    skippedExisting,
    skippedHistorical,
    summaries: Array.from(summaries.values()),
    note: options.apply
      ? 'Backfill applied.'
      : 'Dry run only. Re-run with --apply to write changes.',
  };

  logger.info('Inspection compliance backfill result', result);
  return result;
}

if (require.main === module) {
  let options: BackfillOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error: any) {
    logger.error('Invalid inspection backfill arguments', { message: error?.message || String(error) });
    process.exit(1);
  }

  runInspectionComplianceBackfill(options)
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Inspection compliance backfill failed', { message: error?.message || String(error) });
      process.exit(1);
    });
}

