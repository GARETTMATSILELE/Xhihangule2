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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureLeaseInspectionSchedule = ensureLeaseInspectionSchedule;
exports.ensureMoveOutInspection = ensureMoveOutInspection;
const Inspection_1 = require("../models/Inspection");
const inspectionScheduleEngine_1 = require("./inspectionScheduleEngine");
function ensureLeaseInspectionSchedule(lease_1) {
    return __awaiter(this, arguments, void 0, function* (lease, propertyLabel = 'Property') {
        if (!lease.ownerId || !lease.companyId || !lease.propertyId || !lease.tenantId)
            return 0;
        const schedules = (0, inspectionScheduleEngine_1.generateLeaseInspectionSchedule)(lease, {
            frequency: 'quarterly',
            propertyLabel,
            includeMoveIn: true,
            includeMoveOut: true,
        });
        let createdCount = 0;
        for (const schedule of schedules) {
            const exists = yield Inspection_1.Inspection.exists({
                companyId: schedule.companyId,
                leaseId: schedule.leaseId,
                type: schedule.type,
                scheduledDate: schedule.scheduledDate
            });
            if (exists)
                continue;
            yield Inspection_1.Inspection.create(Object.assign(Object.assign({}, schedule), { originalScheduledDate: schedule.scheduledDate, checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)(schedule.type), template: {
                    name: schedule.type === 'move_in'
                        ? 'Move-In inspection'
                        : schedule.type === 'move_out'
                            ? 'Move-Out inspection'
                            : 'Routine inspection'
                } }));
            createdCount += 1;
        }
        return createdCount;
    });
}
function ensureMoveOutInspection(lease_1, moveOutDate_1) {
    return __awaiter(this, arguments, void 0, function* (lease, moveOutDate, propertyLabel = 'Property') {
        if (!lease.ownerId || !lease.companyId || !lease.propertyId || !lease.tenantId)
            return false;
        const exists = yield Inspection_1.Inspection.exists({
            companyId: lease.companyId,
            leaseId: lease._id,
            type: 'move_out',
            scheduledDate: moveOutDate
        });
        if (exists)
            return false;
        yield Inspection_1.Inspection.create({
            propertyId: lease.propertyId,
            tenantId: lease.tenantId,
            leaseId: lease._id,
            companyId: lease.companyId,
            ownerId: lease.ownerId,
            scheduledDate: moveOutDate,
            originalScheduledDate: moveOutDate,
            frequency: 'ad_hoc',
            type: 'move_out',
            status: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(moveOutDate),
            generatedBy: 'lease_termination',
            reminders: (0, inspectionScheduleEngine_1.buildInspectionReminders)(moveOutDate, propertyLabel),
            checklist: (0, inspectionScheduleEngine_1.defaultChecklistForInspection)('move_out'),
            template: { name: 'Move-Out inspection' },
            notes: 'Automatically created for lease move-out and deposit settlement.'
        });
        return true;
    });
}
