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
exports.getIndividualNotificationPreferences = getIndividualNotificationPreferences;
exports.saveIndividualNotificationPreferences = saveIndividualNotificationPreferences;
exports.scanIndividualOwnerNotices = scanIndividualOwnerNotices;
const mongoose_1 = __importDefault(require("mongoose"));
const commsAndPayments_1 = require("../../ecosystem/models/commsAndPayments");
const Company_1 = require("../../models/Company");
const Lease_1 = require("../../models/Lease");
const Inspection_1 = require("../../models/Inspection");
const MaintenanceRequest_1 = require("../../models/MaintenanceRequest");
const Payment_1 = require("../../models/Payment");
const notificationService_1 = require("../../ecosystem/services/notificationService");
const operations_1 = require("./operations");
function getIndividualNotificationPreferences(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const prefs = yield commsAndPayments_1.CommunicationPreference.findOne({ userId }).lean();
        return Object.assign(Object.assign({}, (0, operations_1.defaultNotificationPreferences)()), ((prefs === null || prefs === void 0 ? void 0 : prefs.individualEvents) || {}));
    });
}
function saveIndividualNotificationPreferences(userId, events) {
    return __awaiter(this, void 0, void 0, function* () {
        const current = yield getIndividualNotificationPreferences(userId);
        const next = Object.assign({}, current);
        for (const [key, value] of Object.entries(events || {})) {
            if (!value)
                continue;
            next[key] = {
                email: value.email !== false,
                inApp: value.inApp !== false
            };
        }
        yield commsAndPayments_1.CommunicationPreference.findOneAndUpdate({ userId }, { $set: { individualEvents: next, userId: new mongoose_1.default.Types.ObjectId(userId) } }, { upsert: true });
        return next;
    });
}
function scanIndividualOwnerNotices(companyId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = yield Company_1.Company.findById(companyId).select('workspaceType').lean();
        if ((company === null || company === void 0 ? void 0 : company.workspaceType) !== 'individual')
            return;
        const today = new Date().toISOString().slice(0, 10);
        const soon = new Date();
        soon.setDate(soon.getDate() + 30);
        const leases = yield Lease_1.Lease.find({
            companyId,
            status: { $in: ['active', 'expiring_soon'] },
            endDate: { $lte: soon, $gte: new Date() }
        }).select('endDate propertyId').limit(20).lean();
        for (const lease of leases) {
            yield notificationService_1.NotificationService.notifyEvent({
                recipientId: userId,
                companyId,
                eventType: 'LEASE_EXPIRING',
                variables: { propertyName: 'your property', date: new Date(lease.endDate).toLocaleDateString() },
                idempotencyKey: `lease-expiring:${lease._id}:${today}`,
                operational: true
            });
        }
        const inspections = yield Inspection_1.Inspection.find({
            companyId,
            scheduledDate: { $lte: soon, $gte: new Date() },
            status: { $nin: ['completed', 'cancelled'] }
        }).select('scheduledDate').limit(20).lean();
        for (const inspection of inspections) {
            yield notificationService_1.NotificationService.notifyEvent({
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
        const completed = yield MaintenanceRequest_1.MaintenanceRequest.find({
            companyId,
            status: { $in: ['completed', 'closed'] },
            updatedAt: { $gte: recent }
        }).select('propertyId').sort({ updatedAt: -1 }).limit(10).lean();
        for (const job of completed) {
            yield notificationService_1.NotificationService.notifyEvent({
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
            const receipts = yield Payment_1.Payment.countDocuments({
                companyId,
                status: { $in: ['completed', 'paid', 'success'] },
                paymentType: { $in: ['rental', 'introduction'] },
                paymentDate: { $gte: monthStart }
            });
            if (receipts === 0) {
                yield notificationService_1.NotificationService.notifyEvent({
                    recipientId: userId,
                    companyId,
                    eventType: 'RENT_PAYMENT_REMINDER',
                    variables: { amount: 'this month’s rent', propertyName: 'your portfolio' },
                    idempotencyKey: `rent-overdue:${companyId}:${today}`,
                    operational: true
                });
            }
        }
    });
}
