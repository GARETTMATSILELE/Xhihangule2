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
exports.notifyInspectionEvent = notifyInspectionEvent;
exports.dispatchDueInspectionReminders = dispatchDueInspectionReminders;
const Notification_1 = require("../models/Notification");
const Inspection_1 = require("../models/Inspection");
function notifyInspectionEvent(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!input.companyId || !input.userId)
            return null;
        return Notification_1.Notification.create({
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
    });
}
function dispatchDueInspectionReminders(companyId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const now = new Date();
        const query = {
            companyId,
            reminders: {
                $elemMatch: {
                    status: 'pending',
                    remindAt: { $lte: now }
                }
            }
        };
        if (userId)
            query.ownerId = userId;
        const inspections = yield Inspection_1.Inspection.find(query)
            .populate('propertyId', 'name address')
            .limit(100);
        let sent = 0;
        for (const inspection of inspections) {
            const dueReminders = (inspection.reminders || []).filter((reminder) => reminder.status === 'pending' && reminder.remindAt <= now);
            for (const reminder of dueReminders) {
                yield notifyInspectionEvent({
                    companyId,
                    userId: inspection.ownerId,
                    title: inspection.status === 'overdue' ? 'Inspection overdue' : 'Inspection reminder',
                    message: reminder.message || `${((_a = inspection.propertyId) === null || _a === void 0 ? void 0 : _a.name) || ((_b = inspection.propertyId) === null || _b === void 0 ? void 0 : _b.address) || 'Property'} inspection reminder`,
                    inspectionId: inspection._id,
                    eventType: 'reminder',
                });
                reminder.status = 'sent';
                sent += 1;
            }
            yield inspection.save();
        }
        return sent;
    });
}
