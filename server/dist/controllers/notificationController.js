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
exports.markRead = exports.markAllRead = exports.listNotifications = exports.createNotification = void 0;
const Notification_1 = require("../models/Notification");
const socket_1 = require("../config/socket");
const createNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId)
            return res.status(400).json({ message: 'Company ID is required' });
        const { userId, title, message, link, payload } = req.body || {};
        if (!userId || !title || !message)
            return res.status(400).json({ message: 'Missing required fields' });
        const n = new Notification_1.Notification({ companyId, userId, title, message, link, payload, read: false });
        yield n.save();
        // Emit real-time notification to the specific user room if socket is available
        try {
            const io = (0, socket_1.getIo)();
            if (io) {
                io.to(`user-${String(userId)}`).emit('newNotification', n);
            }
        }
        catch (e) {
            // Non-fatal
        }
        res.status(201).json({ data: n });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to create notification', error: e.message });
    }
});
exports.createNotification = createNotification;
const listNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        if (!companyId || !userId)
            return res.status(400).json({ message: 'Company ID and user required' });
        const items = yield Notification_1.Notification.find({ companyId, userId }).sort({ createdAt: -1 }).limit(100);
        res.json({ data: items });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to fetch notifications', error: e.message });
    }
});
exports.listNotifications = listNotifications;
const markAllRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        if (!companyId || !userId)
            return res.status(400).json({ message: 'Company ID and user required' });
        yield Notification_1.Notification.updateMany({ companyId, userId, read: false }, { $set: { read: true } });
        res.json({ message: 'Marked all as read' });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to update notifications', error: e.message });
    }
});
exports.markAllRead = markAllRead;
const markRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        const { id } = req.params;
        if (!companyId || !userId)
            return res.status(400).json({ message: 'Company ID and user required' });
        yield Notification_1.Notification.updateOne({ _id: id, companyId, userId }, { $set: { read: true } });
        res.json({ message: 'Marked as read' });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to update notification', error: e.message });
    }
});
exports.markRead = markRead;
