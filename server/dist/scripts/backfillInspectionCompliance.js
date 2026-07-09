"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInspectionComplianceBackfill = runInspectionComplianceBackfill;
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
const Lease_1 = require("../models/Lease");
const Inspection_1 = require("../models/Inspection");
const Notification_1 = require("../models/Notification");
const inspectionScheduleEngine_1 = require("../services/inspectionScheduleEngine");
const logger_1 = require("../utils/logger");
const DAY_MS = 24 * 60 * 60 * 1000;
function parseArgs(argv) {
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
function monthWindow(date) {
    const start = new Date(date.getTime() - 14 * DAY_MS);
    const end = new Date(date.getTime() + 14 * DAY_MS);
    return { start, end };
}
function classifyStatus(date, leaseEndDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(date);
    due.setHours(0, 0, 0, 0);
    const end = new Date(leaseEndDate);
    end.setHours(0, 0, 0, 0);
    if (end < today && due < today)
        return 'missed';
    return (0, inspectionScheduleEngine_1.resolveInspectionStatus)(date);
}
function getSummary(summaries, companyId, userId) {
    const key = `${companyId}:${String(userId)}`;
    const existing = summaries.get(key);
    if (existing)
        return existing;
    const summary = {
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
function incrementSummary(summary, status) {
    if (status === 'overdue')
        summary.createdOverdue += 1;
    else if (status === 'due_today')
        summary.createdDueToday += 1;
    else if (status === 'upcoming')
        summary.createdUpcoming += 1;
    else if (status === 'missed')
        summary.createdMissed += 1;
    else
        summary.createdScheduled += 1;
}
function runInspectionComplianceBackfill(options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        yield (0, database_1.connectDatabase)();
        const leaseQuery = {
            status: { $in: ['active', 'expiring_soon', 'pending_approval', 'expired', 'terminated', 'pending_settlement', 'closed'] },
        };
        if (options.companyId) {
            if (!mongoose_1.default.Types.ObjectId.isValid(options.companyId)) {
                throw new Error('Invalid --companyId value.');
            }
            leaseQuery.companyId = new mongoose_1.default.Types.ObjectId(options.companyId);
        }
        const leases = yield Lease_1.Lease.find(leaseQuery).populate('propertyId', 'name address').sort({ companyId: 1, ownerId: 1, startDate: 1 });
        const summaries = new Map();
        let scanned = 0;
        let linkedLegacy = 0;
        let created = 0;
        let skippedExisting = 0;
        let skippedHistorical = 0;
        for (const lease of leases) {
            scanned += 1;
            if (!lease.ownerId || !lease.propertyId || !lease.tenantId)
                continue;
            const companyId = String(lease.companyId);
            const summary = getSummary(summaries, companyId, lease.ownerId);
            const propertyLabel = ((_a = lease.propertyId) === null || _a === void 0 ? void 0 : _a.name) || ((_b = lease.propertyId) === null || _b === void 0 ? void 0 : _b.address) || 'Property';
            const schedules = (0, inspectionScheduleEngine_1.generateLeaseInspectionSchedule)(lease, {
                frequency: 'quarterly',
                propertyLabel,
                includeMoveIn: true,
                includeMoveOut: true,
            });
            for (const schedule of schedules) {
                const existingLinked = yield Inspection_1.Inspection.exists({
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
                const legacyMatch = yield Inspection_1.Inspection.findOne({
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
                        legacyMatch.status = legacyMatch.completedAt ? 'completed' : classifyStatus(legacyMatch.scheduledDate, lease.endDate);
                        yield legacyMatch.save();
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
                    yield Inspection_1.Inspection.create(Object.assign(Object.assign({}, schedule), { status, reminders: status === 'missed' ? [] : schedule.reminders, originalScheduledDate: schedule.scheduledDate, checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)(schedule.type), template: {
                            name: schedule.type === 'move_in'
                                ? 'Move-In inspection'
                                : schedule.type === 'move_out'
                                    ? 'Move-Out inspection'
                                    : 'Routine inspection'
                        }, notes: status === 'missed'
                            ? 'Backfilled as missed because this inspection fell in a completed historical occupancy period.'
                            : 'Backfilled from lease-driven inspection compliance rollout.' }));
                }
            }
        }
        if (options.apply && options.sendSummaryNotifications) {
            for (const summary of summaries.values()) {
                const needsAttention = summary.createdOverdue + summary.createdDueToday + summary.createdUpcoming + summary.createdMissed;
                if (needsAttention <= 0 && summary.linkedLegacy <= 0)
                    continue;
                yield Notification_1.Notification.create({
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
        logger_1.logger.info('Inspection compliance backfill result', result);
        return result;
    });
}
if (require.main === module) {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    }
    catch (error) {
        logger_1.logger.error('Invalid inspection backfill arguments', { message: (error === null || error === void 0 ? void 0 : error.message) || String(error) });
        process.exit(1);
    }
    runInspectionComplianceBackfill(options)
        .then(() => process.exit(0))
        .catch((error) => {
        logger_1.logger.error('Inspection compliance backfill failed', { message: (error === null || error === void 0 ? void 0 : error.message) || String(error) });
        process.exit(1);
    });
}
