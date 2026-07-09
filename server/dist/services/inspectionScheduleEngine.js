"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addInspectionInterval = addInspectionInterval;
exports.resolveInspectionStatus = resolveInspectionStatus;
exports.buildInspectionReminders = buildInspectionReminders;
exports.generateLeaseInspectionSchedule = generateLeaseInspectionSchedule;
exports.defaultChecklistForInspection = defaultChecklistForInspection;
const mongoose_1 = __importDefault(require("mongoose"));
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
const roomTemplates = [
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
function addInspectionInterval(date, frequency, customIntervalDays) {
    const next = new Date(date);
    if (frequency === 'monthly')
        next.setMonth(next.getMonth() + 1);
    else if (frequency === 'quarterly')
        next.setMonth(next.getMonth() + 3);
    else if (frequency === 'biannual')
        next.setMonth(next.getMonth() + 6);
    else if (frequency === 'annual')
        next.setFullYear(next.getFullYear() + 1);
    else if (frequency === 'custom')
        next.setDate(next.getDate() + Math.max(1, Number(customIntervalDays || 90)));
    return next;
}
function resolveInspectionStatus(scheduledDate, completedAt, explicitStatus) {
    if (explicitStatus === 'cancelled' || explicitStatus === 'completed' || explicitStatus === 'reviewed' || explicitStatus === 'follow_up_required' || explicitStatus === 'in_progress' || explicitStatus === 'draft' || explicitStatus === 'rescheduled' || explicitStatus === 'missed') {
        return explicitStatus;
    }
    if (completedAt)
        return 'completed';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(scheduledDate);
    due.setHours(0, 0, 0, 0);
    if (due.getTime() === today.getTime())
        return 'due_today';
    if (due < today)
        return 'overdue';
    const sevenDaysOut = new Date(today.getTime() + 7 * DAY_MS);
    return due <= sevenDaysOut ? 'upcoming' : 'scheduled';
}
function buildInspectionReminders(scheduledDate, propertyLabel) {
    const offsets = [
        { days: 7, label: '7 days before' },
        { days: 1, label: '1 day before' },
        { days: 0, label: 'due today' },
    ];
    return offsets.map((offset) => ({
        type: 'agent',
        remindAt: new Date(scheduledDate.getTime() - offset.days * DAY_MS),
        status: 'pending',
        message: `${propertyLabel} inspection ${offset.label}`,
    })).concat([{
            type: 'agent',
            remindAt: new Date(scheduledDate.getTime() + DAY_MS),
            status: 'pending',
            message: `${propertyLabel} inspection is overdue`,
        }]);
}
function generateLeaseInspectionSchedule(lease, options = {}) {
    const frequency = options.frequency || 'quarterly';
    const recurrenceGroupId = new mongoose_1.default.Types.ObjectId();
    const propertyLabel = options.propertyLabel || 'Property';
    const schedules = [];
    const base = {
        propertyId: lease.propertyId,
        tenantId: lease.tenantId,
        leaseId: lease._id,
        companyId: lease.companyId,
        ownerId: lease.ownerId,
        frequency,
        customIntervalDays: options.customIntervalDays,
        recurrenceGroupId,
    };
    if (options.includeMoveIn !== false) {
        schedules.push(Object.assign(Object.assign({}, base), { scheduledDate: new Date(lease.startDate), type: 'move_in', status: resolveInspectionStatus(new Date(lease.startDate)), generatedBy: 'lease_activation', reminders: buildInspectionReminders(new Date(lease.startDate), propertyLabel) }));
    }
    let cursor = addInspectionInterval(new Date(lease.startDate), frequency, options.customIntervalDays);
    while (cursor <= lease.endDate) {
        const next = addInspectionInterval(cursor, frequency, options.customIntervalDays);
        schedules.push(Object.assign(Object.assign({}, base), { scheduledDate: new Date(cursor), nextInspectionDate: next <= lease.endDate ? next : undefined, type: 'routine', status: resolveInspectionStatus(cursor), generatedBy: 'recurrence', reminders: buildInspectionReminders(cursor, propertyLabel) }));
        cursor = next;
    }
    if (options.includeMoveOut !== false) {
        schedules.push(Object.assign(Object.assign({}, base), { scheduledDate: new Date(lease.endDate), type: 'move_out', status: resolveInspectionStatus(new Date(lease.endDate)), generatedBy: 'lease_termination', reminders: buildInspectionReminders(new Date(lease.endDate), propertyLabel) }));
    }
    return schedules;
}
function defaultChecklistForInspection(type) {
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
        status: 'pending',
        notes: '',
        severity: 'low',
        photos: [],
    }));
}
